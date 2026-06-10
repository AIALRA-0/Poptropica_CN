const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { readJson, writeJson } = require("./lib/fs-utils");
const {
  ensureFlashpointServices,
  mountSourceZip,
  PORTS,
  proxyRequest
} = require("./lib/flashpoint-runtime");

const DEFAULT_LAUNCH_URL = "http://www.poptropica.com/base.php?room=Costume&island=Super&startup_path=gameplay";
const DEFAULT_REPORT_PATH = path.join(paths.qaDir, "as2-sound-bridge-latest.json");
const SEEDED_AS2_SOUND_PROVENANCE_PATH = path.join(paths.as2PackDir, "provenance", "as2-sound-effect-sources.json");

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function proxyRequestBuffer(url) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port: PORTS.proxy,
      method: "GET",
      path: url
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers,
          body: Buffer.concat(chunks)
        });
      });
    });
    request.on("error", reject);
    request.setTimeout(30000, () => request.destroy(new Error(`Timed out fetching ${url}`)));
    request.end();
  });
}

function extractSceneAudioOverrides(pageBody) {
  const marker = "sceneAudioOverrides";
  const body = String(pageBody || "");
  const markerIndex = body.indexOf(marker);
  const objectStart = markerIndex >= 0 ? body.indexOf("{", markerIndex) : -1;
  if (objectStart < 0) {
    throw new Error("Unable to locate sceneAudioOverrides JSON in AS2 base page.");
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = objectStart; index < body.length; index += 1) {
    const char = body[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(body.slice(objectStart, index + 1));
      }
    }
  }
  throw new Error("Unable to parse sceneAudioOverrides JSON in AS2 base page.");
}

function asAbsolutePoptropicaUrl(value) {
  return new URL(value, "http://www.poptropica.com").href;
}

function asAssetUrl(assetPath) {
  const urlPath = String(assetPath || "").replace(/^content\/www\.poptropica\.com\//u, "");
  return asAbsolutePoptropicaUrl(urlPath.startsWith("/") ? urlPath : `/${urlPath}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const launchUrl = String(args.url || DEFAULT_LAUNCH_URL);
  const reportPath = path.resolve(args.output || DEFAULT_REPORT_PATH);
  const manifestPath = path.join(paths.userAudioDir, "as2", "_sounds", ".embedded-sounds.json");

  await ensureFlashpointServices(config);
  await mountSourceZip(config, "as2");

  const manifest = readJson(manifestPath, null);
  const manifestEntries = manifest?.entries || {};
  const expectedKeys = Object.keys(manifestEntries).sort((left, right) => left.localeCompare(right, "en"));
  const provenance = readJson(SEEDED_AS2_SOUND_PROVENANCE_PATH, null);
  const pathEntries = Array.isArray(provenance?.pathEntries) ? provenance.pathEntries : [];

  const basePage = await proxyRequest(launchUrl);
  const overrides = extractSceneAudioOverrides(basePage.body);
  const checks = [];
  const pathChecks = [];
  const failedChecks = [];

  const bridge = {
    basePageStatus: basePage.statusCode,
    playFunctionPresent: /function\s+flashpointPlayAs2Sound\s*\(/u.test(basePage.body),
    externalNamePresent: /window\.flashpointPlayAs2Sound\s*=/u.test(basePage.body),
    boundedPoolPresent: /AS2_SOUND_EFFECT_POOL_LIMIT\s*=\s*8/u.test(basePage.body)
  };

  if (basePage.statusCode !== 200) failedChecks.push("base_page_not_200");
  if (!bridge.playFunctionPresent) failedChecks.push("missing_flashpointPlayAs2Sound_function");
  if (!bridge.externalNamePresent) failedChecks.push("missing_flashpointPlayAs2Sound_export");
  if (!bridge.boundedPoolPresent) failedChecks.push("missing_bounded_audio_pool");
  if (!expectedKeys.length) failedChecks.push("missing_sound_manifest_entries");

  for (const soundKey of expectedKeys) {
    const manifestEntry = manifestEntries[soundKey];
    const overrideKey = `_sounds/${soundKey}`;
    const overrideUrl = overrides[overrideKey] || null;
    const check = {
      soundKey,
      soundName: manifestEntry.soundName || null,
      sourceType: manifestEntry.sourceType || null,
      overrideKey,
      overrideUrl,
      expectedBytes: manifestEntry.bytes ?? null,
      expectedSha256: manifestEntry.sha256 || null,
      statusCode: null,
      bytes: null,
      sha256: null,
      ok: false
    };

    if (!overrideUrl) {
      check.error = "missing_scene_audio_override";
      failedChecks.push(`missing_override:${soundKey}`);
      checks.push(check);
      continue;
    }

    const absoluteUrl = asAbsolutePoptropicaUrl(overrideUrl);
    const response = await proxyRequestBuffer(absoluteUrl);
    check.statusCode = response.statusCode;
    check.bytes = response.body.length;
    check.sha256 = sha256Buffer(response.body);
    check.ok = response.statusCode === 200 &&
      check.bytes === manifestEntry.bytes &&
      check.sha256 === manifestEntry.sha256;

    if (!check.ok) {
      failedChecks.push(`sound_fetch_mismatch:${soundKey}`);
    }
    checks.push(check);
  }

  for (const entry of pathEntries) {
    const assetPath = String(entry.assetPath || "").replace(/\\/gu, "/").replace(/^\/+/u, "");
    const pathCheck = {
      assetPath,
      sourceType: entry.sourceType || null,
      sourceAssetPath: entry.sourceAssetPath || null,
      expectedBytes: entry.bytes ?? null,
      expectedSha256: entry.sha256 || null,
      statusCode: null,
      bytes: null,
      sha256: null,
      ok: false
    };
    if (!assetPath) {
      pathCheck.error = "missing_asset_path";
      failedChecks.push("path_entry_missing_asset_path");
      pathChecks.push(pathCheck);
      continue;
    }

    const response = await proxyRequestBuffer(asAssetUrl(assetPath));
    pathCheck.statusCode = response.statusCode;
    pathCheck.bytes = response.body.length;
    pathCheck.sha256 = sha256Buffer(response.body);
    pathCheck.ok = response.statusCode === 200 &&
      pathCheck.bytes === entry.bytes &&
      pathCheck.sha256 === entry.sha256;
    if (!pathCheck.ok) {
      failedChecks.push(`path_fetch_mismatch:${assetPath}`);
    }
    pathChecks.push(pathCheck);
  }

  const report = {
    ok: failedChecks.length === 0,
    generatedAt: new Date().toISOString(),
    launchUrl,
    manifestPath,
    manifestGeneratedAt: manifest?.generatedAt || null,
    expectedSoundCount: expectedKeys.length,
    overrideSoundCount: Object.keys(overrides).filter((key) => key.startsWith("_sounds/")).length,
    expectedPathCount: pathEntries.length,
    bridge,
    failedChecks,
    checks,
    pathChecks
  };

  writeJson(reportPath, report);
  printJson({
    ok: report.ok,
    expectedSoundCount: report.expectedSoundCount,
    overrideSoundCount: report.overrideSoundCount,
    expectedPathCount: report.expectedPathCount,
    failedChecks: report.failedChecks,
    reportPath
  });

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
