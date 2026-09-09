const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
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

function httpGetViaProxy(url, { timeoutMs = 30000, maxBytes = 16 * 1024 * 1024 } = {}) {
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
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          statusCode: response.statusCode || 0,
          headers: response.headers || {},
          body: Buffer.concat(chunks),
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

function inspectShellSwf(response) {
  const summary = summarizeResponse(response);
  const signature = getSwfSignature(response?.body || Buffer.alloc(0));
  const checks = {
    statusOk: summary.statusCode === 200,
    hasBytes: summary.bytes > 1024 * 1024,
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

function inspectXmlResource(response) {
  const summary = summarizeResponse(response);
  const text = (response?.body || Buffer.alloc(0)).toString("utf8").trimStart();
  const checks = {
    statusOk: summary.statusCode === 200,
    hasBytes: summary.bytes > 0,
    looksLikeXml: text.startsWith("<")
  };
  const failedChecks = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  return {
    ...summary,
    checks,
    failedChecks,
    ok: failedChecks.length === 0,
    sample: text.slice(0, 80)
  };
}

function listArchiveEntries(archivePath, tarBin) {
  const result = spawnSync(tarBin || "tar", ["-tf", archivePath], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 128
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `Unable to list archive: ${archivePath}`).trim());
  }
  return result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function toPoptropicaUrl(archivePath) {
  const prefix = "content/www.poptropica.com/";
  if (!archivePath.startsWith(prefix)) {
    return null;
  }
  return `http://www.poptropica.com/${encodeURI(archivePath.slice(prefix.length))}`;
}

function buildAs3ResourceIndex(config) {
  const archiveEntries = listArchiveEntries(config.sources.as3Gamezip, config.tools.tarBin);
  const entrySet = new Set(archiveEntries);
  return {
    archiveEntries,
    entrySet
  };
}

function listExpectedXmlResources(entry, resourceIndex) {
  const rootPrefix = `content/www.poptropica.com/game/data/scenes/${entry.sceneFolder}/`;
  const scenePrefix = `${rootPrefix}${entry.roomParam}/`;
  const resources = [];

  for (const archivePath of resourceIndex.archiveEntries) {
    if (!archivePath.endsWith(".xml")) {
      continue;
    }
    if (archivePath.startsWith(scenePrefix)) {
      const relativeName = archivePath.slice(scenePrefix.length);
      if (relativeName && !relativeName.includes("/")) {
        resources.push({
          group: "scene",
          name: relativeName,
          archivePath,
          url: toPoptropicaUrl(archivePath)
        });
      }
      continue;
    }
    if (archivePath.startsWith(rootPrefix)) {
      const relativeName = archivePath.slice(rootPrefix.length);
      if (relativeName && !relativeName.includes("/")) {
        resources.push({
          group: "island",
          name: relativeName,
          archivePath,
          url: toPoptropicaUrl(archivePath)
        });
      }
    }
  }

  return resources
    .filter((resource) => resource.url)
    .sort((left, right) => {
      if (left.group !== right.group) {
        return left.group.localeCompare(right.group, "en");
      }
      return left.name.localeCompare(right.name, "en");
    });
}

function inspectExpectedResources(entry, resources) {
  const names = new Set(resources.map((resource) => `${resource.group}/${resource.name}`));
  const sceneXmlArchivePath = `content/www.poptropica.com/game/data/scenes/${entry.sceneFolder}/${entry.roomParam}/scene.xml`;
  const soundsXmlArchivePath = `content/www.poptropica.com/game/data/scenes/${entry.sceneFolder}/${entry.roomParam}/sounds.xml`;
  const checks = {
    hasAs3TargetScene: Boolean(entry.as3TargetScene),
    hasSceneXml: names.has("scene/scene.xml"),
    hasSoundsXml: names.has("scene/sounds.xml"),
    sceneXmlPathMatches: resources.some((resource) => resource.archivePath === sceneXmlArchivePath),
    soundsXmlPathMatches: resources.some((resource) => resource.archivePath === soundsXmlArchivePath)
  };
  const failedChecks = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  return {
    ok: failedChecks.length === 0,
    checks,
    failedChecks,
    resourceCount: resources.length
  };
}

async function smokeEntry(entry, resourceIndex, args) {
  const resources = listExpectedXmlResources(entry, resourceIndex);
  const expectedResources = inspectExpectedResources(entry, resources);
  const shellResult = {
    url: entry.launchUrl
  };
  const resourceResults = [];
  const errors = [];

  try {
    const response = await httpGetViaProxy(entry.launchUrl, {
      timeoutMs: Number(args.requestTimeoutMs || 30000),
      maxBytes: Number(args.shellMaxBytes || 16 * 1024 * 1024)
    });
    Object.assign(shellResult, inspectShellSwf(response));
  } catch (error) {
    errors.push(`shell: ${error.message || error}`);
    Object.assign(shellResult, {
      ok: false,
      error: String(error.message || error)
    });
  }

  for (const resource of resources) {
    const result = {
      ...resource
    };
    try {
      const response = await httpGetViaProxy(resource.url, {
        timeoutMs: Number(args.requestTimeoutMs || 30000),
        maxBytes: Number(args.resourceMaxBytes || 4 * 1024 * 1024)
      });
      Object.assign(result, inspectXmlResource(response));
    } catch (error) {
      errors.push(`${resource.group}/${resource.name}: ${error.message || error}`);
      Object.assign(result, {
        ok: false,
        error: String(error.message || error)
      });
    }
    resourceResults.push(result);
  }

  const failedResources = resourceResults.filter((result) => !result.ok);
  const failedChecks = [
    ...(expectedResources.ok ? [] : expectedResources.failedChecks.map((name) => `expected:${name}`)),
    ...(shellResult.ok ? [] : ["shellSwf"]),
    ...(failedResources.length ? ["sceneXmlResources"] : []),
    ...errors
  ];

  return {
    ok: failedChecks.length === 0,
    canonicalKey: entry.canonicalKey,
    islandParam: entry.islandParam,
    roomParam: entry.roomParam,
    sceneFolder: entry.sceneFolder,
    as3TargetScene: entry.as3TargetScene,
    launchUrl: entry.launchUrl,
    expectedResources,
    shell: shellResult,
    resourceSummary: {
      expectedXmlResources: resources.length,
      passedXmlResources: resourceResults.filter((result) => result.ok).length,
      failedXmlResources: failedResources.length
    },
    resources: resourceResults,
    failedChecks
  };
}

function selectEntries(entries, args) {
  const selected = entries.filter((entry) =>
    entry.sourceGroup === "as3" &&
    entry.launchable &&
    entry.launchMode === "as3-direct-scene"
  );
  const filters = new Set(splitCsv(args.islands || args.island).map((value) => value.toLowerCase()));
  const filtered = filters.size
    ? selected.filter((entry) => {
        const candidates = [
          entry.canonicalKey,
          entry.islandParam,
          entry.roomParam,
          entry.sceneFolder,
          entry.as3TargetScene
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
    sourceGroup: "as3",
    tool: "qa-as3-launch-smoke"
  });
  try {
    const manifest = generateLaunchManifest(config, { write: flagEnabled(args.writeManifest) });
    const as3Entries = manifest.entries.filter((entry) => entry.sourceGroup === "as3");
    const entries = selectEntries(manifest.entries, args);
    const runToken = Date.now();
    const qaDir = ensureQaDir("as3", "launch-smoke", `run-${runToken}`);
    const reportName = `as3-launch-smoke-${runToken}.json`;
    const reportPath = path.join(paths.qaDir, "as3", "launch-smoke", reportName);
    const latestPath = path.join(paths.qaDir, "as3", "launch-smoke", "as3-launch-smoke-latest.json");

    if (!entries.length) {
      throw new Error("No AS3 launchable direct-scene entries matched the requested filters.");
    }

    const resourceIndex = buildAs3ResourceIndex(config);
    const mount = await mountSourceZip(config, "as3");
    const results = [];
    for (const entry of entries) {
      results.push(await smokeEntry(entry, resourceIndex, args));
    }

    const failed = results.filter((result) => !result.ok);
    const shellFailures = results.filter((result) => !result.shell?.ok);
    const expectedResourceFailures = results.filter((result) => !result.expectedResources?.ok);
    const sceneResourceFailures = results.filter((result) => result.resourceSummary?.failedXmlResources > 0);
    const totalExpectedXmlResources = results.reduce((total, result) => total + (result.resourceSummary?.expectedXmlResources || 0), 0);
    const totalFailedXmlResources = results.reduce((total, result) => total + (result.resourceSummary?.failedXmlResources || 0), 0);
    const report = {
      ok: failed.length === 0,
      generatedAt: new Date().toISOString(),
      sourceGroup: "as3",
      mount,
      artifactDir: qaDir,
      summary: {
        as3CatalogEntries: as3Entries.length,
        as3LaunchableEntries: as3Entries.filter((entry) => entry.launchable).length,
        as3DirectSceneEntries: as3Entries.filter((entry) => entry.launchable && entry.launchMode === "as3-direct-scene").length,
        as3UnresolvedEntries: as3Entries.filter((entry) => !entry.launchable).length,
        testedEntries: entries.length,
        passedEntries: results.filter((result) => result.ok).length,
        failedEntries: failed.length,
        shellFailures: shellFailures.length,
        expectedResourceFailures: expectedResourceFailures.length,
        sceneResourceFailures: sceneResourceFailures.length,
        expectedXmlResources: totalExpectedXmlResources,
        failedXmlResources: totalFailedXmlResources
      },
      failures: failed.map((result) => ({
        canonicalKey: result.canonicalKey,
        failedChecks: result.failedChecks,
        shellFailedChecks: result.shell?.failedChecks || [],
        expectedResourceFailedChecks: result.expectedResources?.failedChecks || [],
        failedXmlResources: result.resources
          .filter((resource) => !resource.ok)
          .map((resource) => ({
            group: resource.group,
            name: resource.name,
            statusCode: resource.statusCode || 0,
            failedChecks: resource.failedChecks || [],
            url: resource.url
          })),
        launchUrl: result.launchUrl,
        as3TargetScene: result.as3TargetScene
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
