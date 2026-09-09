const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { acquireQaLock, ensureQaDir } = require("./lib/qa");
const { writeJson } = require("./lib/fs-utils");
const { generateLaunchManifest } = require("./lib/launch-manifest");
const { mountSourceZip } = require("./lib/flashpoint-runtime");

const PROXY_PORT = 22500;

function flagEnabled(value) {
  return value === true || /^(1|true|yes|y)$/iu.test(String(value || ""));
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function httpGetViaProxy(url, { timeoutMs = 30000, maxBytes = 64 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port: PROXY_PORT,
      method: "GET",
      path: url,
      timeout: timeoutMs
    }, (response) => {
      const chunks = [];
      let byteCount = 0;
      let truncated = false;

      response.on("data", (chunk) => {
        byteCount += chunk.length;
        if (byteCount <= maxBytes) {
          chunks.push(chunk);
          return;
        }
        truncated = true;
        request.destroy(new Error(`Response exceeded ${maxBytes} bytes: ${url}`));
      });

      response.on("end", () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          statusCode: response.statusCode || 0,
          headers: response.headers || {},
          body,
          truncated
        });
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error(`Timed out after ${timeoutMs}ms: ${url}`));
    });
    request.on("error", reject);
    request.end();
  });
}

function summarizeResponse(response) {
  const body = response?.body || Buffer.alloc(0);
  return {
    ok: Boolean(response?.ok),
    statusCode: response?.statusCode || 0,
    contentType: response?.headers?.["content-type"] || null,
    zipServerFileName: response?.headers?.zipsvr_filename || null,
    bytes: body.length,
    sha256: body.length
      ? crypto.createHash("sha256").update(body).digest("hex").toUpperCase()
      : null,
    truncated: Boolean(response?.truncated)
  };
}

function getSwfSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) {
    return "";
  }
  return buffer.slice(0, 3).toString("ascii");
}

function parseInputJson(baseText) {
  const match = String(baseText || "").match(/<script\s+id="input"\s+type="application\/json">([^<]*)<\/script>/iu);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch (_error) {
    return null;
  }
}

function parseSceneAudioOverrides(baseText) {
  const match = String(baseText || "").match(/\bsceneAudioOverrides\s*=\s*(\{[^\n]*\})/u);
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch (_error) {
    return null;
  }
}

function inspectBasePage(baseText, entry) {
  const input = parseInputJson(baseText);
  const sceneAudioOverrides = parseSceneAudioOverrides(baseText);
  const checks = {
    hasHtml: /<!doctype html>|<html\b/iu.test(baseText),
    hasInputJson: Boolean(input),
    roomMatches: input?.room === entry.roomParam,
    islandMatches: input?.island === entry.islandParam,
    startupPathMatches: input?.startup_path === entry.startupPath,
    hasGameViewport: /\bid="gameViewport"/u.test(baseText),
    hasEmbed: /<embed\b/iu.test(baseText),
    hasAllowScriptAccessAlways: /allowScriptAccess="always"/u.test(baseText),
    hasResizeListener: /addEventListener\("resize"/u.test(baseText),
    hasSceneAudioOverrides: Boolean(sceneAudioOverrides),
    hasGlobalDefaultAudioOverride: Boolean(sceneAudioOverrides?.["_global/default"]),
    hasSoundEffectOverrides: Object.keys(sceneAudioOverrides || {}).some((key) => key.startsWith("_sounds/")),
    hasFlashpointPlayAs2Sound: /\bflashpointPlayAs2Sound\b/u.test(baseText)
  };
  const failedChecks = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  return {
    ok: failedChecks.length === 0,
    checks,
    failedChecks,
    input,
    sceneAudioOverrideCount: Object.keys(sceneAudioOverrides || {}).length
  };
}

function expectedSceneUrl(entry) {
  return `http://www.poptropica.com/scenes/island${encodeURIComponent(entry.sceneFolder)}/scene${encodeURIComponent(entry.roomParam)}.swf`;
}

function inspectSceneSwf(response) {
  const summary = summarizeResponse(response);
  const signature = getSwfSignature(response?.body || Buffer.alloc(0));
  const checks = {
    statusOk: summary.statusCode === 200,
    hasBytes: summary.bytes > 1024,
    hasSwfSignature: ["FWS", "CWS", "ZWS"].includes(signature)
  };
  const failedChecks = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  return {
    ...summary,
    signature,
    checks,
    failedChecks,
    ok: failedChecks.length === 0
  };
}

async function smokeEntry(entry, args) {
  const sceneUrl = expectedSceneUrl(entry);
  const baseResult = {
    url: entry.launchUrl
  };
  const sceneResult = {
    url: sceneUrl
  };
  const errors = [];

  try {
    const response = await httpGetViaProxy(entry.launchUrl, {
      timeoutMs: Number(args.requestTimeoutMs || 30000),
      maxBytes: 2 * 1024 * 1024
    });
    const text = response.body.toString("utf8");
    Object.assign(baseResult, summarizeResponse(response), inspectBasePage(text, entry));
  } catch (error) {
    errors.push(`base: ${error.message || error}`);
    Object.assign(baseResult, {
      ok: false,
      error: String(error.message || error)
    });
  }

  try {
    const response = await httpGetViaProxy(sceneUrl, {
      timeoutMs: Number(args.requestTimeoutMs || 30000),
      maxBytes: Number(args.sceneMaxBytes || 64 * 1024 * 1024)
    });
    Object.assign(sceneResult, inspectSceneSwf(response));
  } catch (error) {
    errors.push(`scene: ${error.message || error}`);
    Object.assign(sceneResult, {
      ok: false,
      error: String(error.message || error)
    });
  }

  const failedChecks = [
    ...(baseResult.ok ? [] : ["basePage"]),
    ...(sceneResult.ok ? [] : ["sceneSwf"]),
    ...errors
  ];

  return {
    ok: failedChecks.length === 0,
    canonicalKey: entry.canonicalKey,
    islandParam: entry.islandParam,
    roomParam: entry.roomParam,
    startupPath: entry.startupPath,
    sceneFolder: entry.sceneFolder,
    launchUrl: entry.launchUrl,
    sceneUrl,
    base: baseResult,
    scene: sceneResult,
    failedChecks
  };
}

function selectEntries(entries, args) {
  const selected = entries.filter((entry) => entry.sourceGroup === "as2" && entry.launchable);
  const filters = new Set(splitCsv(args.islands || args.island).map((value) => value.toLowerCase()));
  const filtered = filters.size
    ? selected.filter((entry) => {
        const candidates = [
          entry.canonicalKey,
          entry.islandParam,
          entry.roomParam,
          entry.sceneFolder
        ].map((value) => String(value || "").toLowerCase());
        return candidates.some((candidate) => filters.has(candidate));
      })
    : selected;
  const limit = Number.parseInt(String(args.limit || ""), 10);
  return Number.isFinite(limit) && limit > 0 ? filtered.slice(0, limit) : filtered;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const lock = acquireQaLock("flashpoint-runtime-qa.lock", {
    sourceGroup: "as2",
    tool: "qa-as2-launch-smoke"
  });
  try {
    const manifest = generateLaunchManifest(config, { write: flagEnabled(args.writeManifest) });
    const as2Entries = manifest.entries.filter((entry) => entry.sourceGroup === "as2");
    const entries = selectEntries(manifest.entries, args);
    const runToken = Date.now();
    const qaDir = ensureQaDir("as2", "launch-smoke", `run-${runToken}`);
    const reportName = `as2-launch-smoke-${runToken}.json`;
    const reportPath = path.join(paths.qaDir, "as2", "launch-smoke", reportName);
    const latestPath = path.join(paths.qaDir, "as2", "launch-smoke", "as2-launch-smoke-latest.json");

    const mount = await mountSourceZip(config, "as2");
    const results = [];
    for (const entry of entries) {
      results.push(await smokeEntry(entry, args));
    }

    const failed = results.filter((result) => !result.ok);
    const baseFailures = results.filter((result) => !result.base?.ok);
    const sceneFailures = results.filter((result) => !result.scene?.ok);
    const audioBridgeFailures = results.filter((result) => !result.base?.checks?.hasFlashpointPlayAs2Sound);
    const resizeFailures = results.filter((result) => !result.base?.checks?.hasResizeListener || !result.base?.checks?.hasGameViewport);
    const report = {
      ok: failed.length === 0,
      generatedAt: new Date().toISOString(),
      sourceGroup: "as2",
      mount,
      artifactDir: qaDir,
      summary: {
        as2CatalogEntries: as2Entries.length,
        as2LaunchableEntries: as2Entries.filter((entry) => entry.launchable).length,
        as2UnresolvedEntries: as2Entries.filter((entry) => !entry.launchable).length,
        testedEntries: entries.length,
        passedEntries: results.filter((result) => result.ok).length,
        failedEntries: failed.length,
        baseFailures: baseFailures.length,
        sceneFailures: sceneFailures.length,
        audioBridgeFailures: audioBridgeFailures.length,
        resizeFailures: resizeFailures.length
      },
      failures: failed.map((result) => ({
        canonicalKey: result.canonicalKey,
        failedChecks: result.failedChecks,
        baseFailedChecks: result.base?.failedChecks || [],
        sceneFailedChecks: result.scene?.failedChecks || [],
        launchUrl: result.launchUrl,
        sceneUrl: result.sceneUrl
      })),
      results
    };

    writeJson(reportPath, report);
    writeJson(latestPath, report);
    printJson({
      ...report.summary,
      ok: report.ok,
      reportPath
    });

    if (!report.ok && !flagEnabled(args.allowFailures)) {
      process.exitCode = 1;
    }
  } finally {
    lock.release();
  }
}

main().catch((error) => {
  printJson({
    ok: false,
    error: String(error.stack || error.message || error)
  });
  process.exit(1);
});
