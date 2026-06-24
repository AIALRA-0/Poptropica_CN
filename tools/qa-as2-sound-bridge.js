const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { acquireQaLock } = require("./lib/qa");
const { fileExists, readJson, writeJson } = require("./lib/fs-utils");
const {
  ensureFlashpointServices,
  mountSourceZip,
  PORTS,
  proxyRequest
} = require("./lib/flashpoint-runtime");

const DEFAULT_LAUNCH_URL = "http://www.poptropica.com/base.php?room=Costume&island=Super&startup_path=gameplay";
const DEFAULT_REPORT_PATH = path.join(paths.qaDir, "as2-sound-bridge-latest.json");
const SEEDED_AS2_SOUND_PROVENANCE_PATH = path.join(paths.as2PackDir, "provenance", "as2-sound-effect-sources.json");
const AS2_SOUND_CALL_COVERAGE_PATH = path.join(paths.as2PackDir, "provenance", "as2-sound-call-coverage.json");
const SOURCE_ZIP_PATHS = {
  as2: path.join(paths.projectRoot, "AS2.zip"),
  as3: path.join(paths.projectRoot, "AS3.zip")
};
const SOURCE_ZIP_ENTRY_MAX_BYTES = 32 * 1024 * 1024;
const AS2_SOUND_EFFECT_POOL_LIMIT = 8;
const BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];

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

function normalizeAssetPath(assetPath) {
  return String(assetPath || "").replace(/\\/gu, "/").replace(/^\/+/u, "");
}

function normalizePoptropicaAssetPath(assetPath) {
  return normalizeAssetPath(assetPath)
    .replace(/^content\/www\.poptropica\.com\//iu, "")
    .toLowerCase();
}

function sanitizeAs2SoundName(value) {
  const clean = String(value || "").replace(/[^A-Za-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "").toLowerCase();
  return clean || null;
}

function withQaMutedAudio(url) {
  const nextUrl = new URL(url);
  nextUrl.searchParams.set("flashpointQaMuteAudio", "1");
  return nextUrl.href;
}

function findBrowserExecutable() {
  return BROWSER_CANDIDATES.find((candidate) => fileExists(candidate)) || null;
}

function readSourceZipEntry(sourceGroup, sourceAssetPath) {
  const zipPath = SOURCE_ZIP_PATHS[sourceGroup];
  const entryPath = normalizeAssetPath(sourceAssetPath);
  if (!zipPath || !entryPath) {
    return {
      ok: false,
      error: zipPath ? "missing_source_asset_path" : `unsupported_source_group:${sourceGroup || ""}`
    };
  }

  const result = spawnSync("tar", ["-xOf", zipPath, entryPath], {
    encoding: null,
    maxBuffer: SOURCE_ZIP_ENTRY_MAX_BYTES
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: String(result.stderr || "").trim() || `tar exited with status ${result.status}`
    };
  }

  return {
    ok: true,
    body: result.stdout
  };
}

function buildProvenanceSourceChecks(entries, pathEntries) {
  const sourceItems = [
    ...entries.map((entry) => ({ type: "sound", entry })),
    ...pathEntries.map((entry) => ({ type: "path", entry }))
  ];

  return sourceItems.map(({ type, entry }) => {
    const sourceGroup = String(entry.sourceGroup || "");
    const sourceAssetPath = normalizeAssetPath(entry.sourceAssetPath);
    const check = {
      type,
      soundName: entry.soundName || null,
      assetPath: entry.assetPath || null,
      sourceGroup,
      sourceAssetPath,
      expectedBytes: entry.bytes ?? null,
      expectedSha256: entry.sha256 || null,
      bytes: null,
      sha256: null,
      ok: false
    };

    const source = readSourceZipEntry(sourceGroup, sourceAssetPath);
    if (!source.ok) {
      check.error = source.error;
      return check;
    }

    check.bytes = source.body.length;
    check.sha256 = sha256Buffer(source.body);
    check.ok = check.bytes === entry.bytes && check.sha256 === entry.sha256;
    if (!check.ok) {
      check.error = "source_bytes_or_sha256_mismatch";
    }
    return check;
  });
}

function buildSoundCallCoverage({ manifestEntries, pathEntries }) {
  const coverage = readJson(AS2_SOUND_CALL_COVERAGE_PATH, null);
  const coverageEntries = Array.isArray(coverage?.entries) ? coverage.entries : [];
  const manifestSoundKeys = new Set(Object.keys(manifestEntries || {}));
  const pathKeys = new Set(
    pathEntries
      .map((entry) => normalizePoptropicaAssetPath(entry.assetPath))
      .filter(Boolean)
  );
  const checks = [];

  for (const entry of coverageEntries) {
    const type = entry.type === "path" ? "path" : "sound";
    const expectedKey = type === "path"
      ? normalizePoptropicaAssetPath(entry.pathKey || entry.assetPath || entry.names?.[0])
      : sanitizeAs2SoundName(entry.soundKey || entry.names?.[0]);
    const ok = Boolean(expectedKey) && (type === "path" ? pathKeys.has(expectedKey) : manifestSoundKeys.has(expectedKey));
    checks.push({
      type,
      expectedKey,
      soundKey: type === "sound" ? expectedKey : null,
      assetPath: type === "path" ? (entry.assetPath || null) : null,
      names: Array.isArray(entry.names) ? entry.names : [],
      callCount: Number.isFinite(entry.callCount) ? entry.callCount : null,
      ok
    });
  }

  const missing = checks.filter((check) => !check.ok);
  const expectedSoundCount = checks.filter((check) => check.type === "sound").length;
  const expectedPathCount = checks.filter((check) => check.type === "path").length;
  return {
    coveragePath: AS2_SOUND_CALL_COVERAGE_PATH,
    available: Boolean(coverage),
    generatedAt: coverage?.generatedAt || null,
    sourceAuditPath: coverage?.sourceAuditPath || null,
    sourceAuditGeneratedAt: coverage?.sourceAuditGeneratedAt || null,
    sourceAuditSummary: coverage?.sourceAuditSummary || null,
    expectedKnownCount: checks.length,
    expectedSoundCount,
    expectedPathCount,
    coveredKnownCount: checks.length - missing.length,
    missingKnownCount: missing.length,
    checks,
    missing
  };
}

async function runBrowserPlaybackCheck({ launchUrl, soundKey, playCount }) {
  let chromium = null;
  try {
    ({ chromium } = require("playwright"));
  } catch (error) {
    return {
      ok: false,
      failedChecks: ["browser_playback_playwright_missing"],
      error: String(error.message || error)
    };
  }

  const executablePath = findBrowserExecutable();
  let browser = null;
  const consoleErrors = [];

  try {
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      proxy: {
        server: `http://127.0.0.1:${PORTS.proxy}`
      },
      args: [
        "--autoplay-policy=no-user-gesture-required"
      ]
    });

    const page = await browser.newPage({
      viewport: {
        width: 1000,
        height: 700
      }
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(String(error.message || error));
    });
    await page.addInitScript(() => {
      const NativeAudio = window.Audio;
      const records = [];
      function WrappedAudio(src) {
        const audio = new NativeAudio(src);
        const record = {
          requestedSrc: String(src || ""),
          playCalled: false,
          playResolved: false,
          playRejected: null,
          pauseCalled: false,
          audio
        };
        records.push(record);
        const originalPlay = audio.play ? audio.play.bind(audio) : null;
        audio.play = function() {
          record.playCalled = true;
          if (!originalPlay) {
            record.playResolved = true;
            return Promise.resolve();
          }
          const result = originalPlay();
          if (result && typeof result.then === "function") {
            result
              .then(() => {
                record.playResolved = true;
              })
              .catch((error) => {
                record.playRejected = String(error && (error.name || error.message) || error);
              });
          }
          return result;
        };
        const originalPause = audio.pause ? audio.pause.bind(audio) : null;
        audio.pause = function() {
          record.pauseCalled = true;
          return originalPause ? originalPause() : undefined;
        };
        return audio;
      }
      WrappedAudio.prototype = NativeAudio.prototype;
      window.Audio = WrappedAudio;
      window.__flashpointAs2AudioProbe = records;
    });

    const targetUrl = withQaMutedAudio(launchUrl);
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    await page.waitForFunction(() => typeof window.flashpointPlayAs2Sound === "function", null, {
      timeout: 30000
    });

    const playback = await page.evaluate(async ({ requestedSoundKey, requestedPlayCount }) => {
      const unknownResult = window.flashpointPlayAs2Sound("__missing_sound__");
      const playResults = [];
      for (let index = 0; index < requestedPlayCount; index += 1) {
        playResults.push(window.flashpointPlayAs2Sound(requestedSoundKey));
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const records = (window.__flashpointAs2AudioProbe || []).map((record, index) => ({
        index,
        requestedSrc: record.requestedSrc,
        src: record.audio.src,
        currentSrc: record.audio.currentSrc,
        muted: record.audio.muted,
        volume: record.audio.volume,
        paused: record.audio.paused,
        readyState: record.audio.readyState,
        networkState: record.audio.networkState,
        playCalled: record.playCalled,
        playResolved: record.playResolved,
        playRejected: record.playRejected,
        pauseCalled: record.pauseCalled
      }));
      return {
        href: window.location.href,
        unknownResult,
        playResults,
        records
      };
    }, {
      requestedSoundKey: soundKey,
      requestedPlayCount: playCount
    });

    const failedChecks = [];
    const expectedPausedByPool = Math.max(0, playCount - AS2_SOUND_EFFECT_POOL_LIMIT);
    const pauseCalledCount = playback.records.filter((record) => record.pauseCalled).length;
    const expectedSrcFragment = `/_sounds/${soundKey}.`;

    if (consoleErrors.length > 0) failedChecks.push("browser_playback_console_errors");
    if (playback.unknownResult !== false) failedChecks.push("browser_playback_unknown_sound_not_false");
    if (playback.playResults.length !== playCount || playback.playResults.some((result) => result !== true)) {
      failedChecks.push("browser_playback_known_sound_not_true");
    }
    if (playback.records.length !== playCount) failedChecks.push("browser_playback_audio_record_count_mismatch");
    if (playback.records.some((record) => !String(record.currentSrc || record.src || record.requestedSrc).includes(expectedSrcFragment))) {
      failedChecks.push("browser_playback_audio_src_mismatch");
    }
    if (playback.records.some((record) => !record.playCalled)) failedChecks.push("browser_playback_play_not_called");
    if (playback.records.some((record) => record.muted !== true || record.volume !== 0)) {
      failedChecks.push("browser_playback_audio_not_muted");
    }
    if (pauseCalledCount < expectedPausedByPool) failedChecks.push("browser_playback_pool_limit_not_enforced");

    return {
      ok: failedChecks.length === 0,
      failedChecks,
      executablePath,
      proxyPort: PORTS.proxy,
      launchUrl: playback.href,
      soundKey,
      playCount,
      unknownResult: playback.unknownResult,
      knownResultCount: playback.playResults.length,
      audioRecordCount: playback.records.length,
      playCalledCount: playback.records.filter((record) => record.playCalled).length,
      mutedRecordCount: playback.records.filter((record) => record.muted === true && record.volume === 0).length,
      pauseCalledCount,
      expectedPausedByPool,
      playRejectedCount: playback.records.filter((record) => record.playRejected).length,
      consoleErrors,
      records: playback.records
    };
  } catch (error) {
    return {
      ok: false,
      failedChecks: ["browser_playback_exception"],
      executablePath,
      proxyPort: PORTS.proxy,
      error: String(error.stack || error.message || error),
      consoleErrors
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const launchUrl = String(args.url || DEFAULT_LAUNCH_URL);
  const reportPath = path.resolve(args.output || DEFAULT_REPORT_PATH);
  const browserPlaybackSoundKey = sanitizeAs2SoundName(args.browserPlaybackSound || args["browser-playback-sound"] || "zap");
  const browserPlaybackCount = Math.max(1, Number(args.browserPlaybackCount || args["browser-playback-count"] || 10));
  const skipBrowserPlayback = Boolean(args.skipBrowserPlayback || args["skip-browser-playback"]);
  const manifestPath = path.join(paths.userAudioDir, "as2", "_sounds", ".embedded-sounds.json");
  const lock = acquireQaLock("flashpoint-runtime-qa.lock", {
    sourceGroup: "as2",
    tool: "qa-as2-sound-bridge"
  });

  try {
    await ensureFlashpointServices(config);
    await mountSourceZip(config, "as2");

  const manifest = readJson(manifestPath, null);
  const manifestEntries = manifest?.entries || {};
  const expectedKeys = Object.keys(manifestEntries).sort((left, right) => left.localeCompare(right, "en"));
  const provenance = readJson(SEEDED_AS2_SOUND_PROVENANCE_PATH, null);
  const provenanceEntries = Array.isArray(provenance?.entries) ? provenance.entries : [];
  const pathEntries = Array.isArray(provenance?.pathEntries) ? provenance.pathEntries : [];
  const sourceChecks = buildProvenanceSourceChecks(provenanceEntries, pathEntries);
  const soundCallCoverage = buildSoundCallCoverage({ manifestEntries, pathEntries });
  let browserPlayback = {
    ok: true,
    skipped: true,
    reason: "disabled_by_cli"
  };

  const basePage = await proxyRequest(launchUrl);
  const overrides = extractSceneAudioOverrides(basePage.body);
  const overrideSoundKeys = Object.keys(overrides)
    .filter((key) => key.startsWith("_sounds/"))
    .sort((left, right) => left.localeCompare(right, "en"));
  const expectedOverrideKeys = expectedKeys.map((soundKey) => `_sounds/${soundKey}`);
  const expectedOverrideKeySet = new Set(expectedOverrideKeys);
  const unexpectedOverrideKeys = overrideSoundKeys.filter((key) => !expectedOverrideKeySet.has(key));
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
  if (!browserPlaybackSoundKey || !manifestEntries[browserPlaybackSoundKey]) {
    failedChecks.push(`browser_playback_sound_missing:${browserPlaybackSoundKey || "unknown"}`);
  }
  if (!soundCallCoverage.available) failedChecks.push("missing_as2_sound_call_coverage");
  if (soundCallCoverage.expectedSoundCount !== expectedKeys.length) failedChecks.push("sound_call_coverage_sound_count_mismatch");
  if (soundCallCoverage.expectedPathCount !== pathEntries.length) failedChecks.push("sound_call_coverage_path_count_mismatch");
  for (const missing of soundCallCoverage.missing) {
    failedChecks.push(`missing_sound_call_coverage:${missing.type}:${missing.expectedKey || "unknown"}`);
  }
  if (overrideSoundKeys.length !== expectedKeys.length) failedChecks.push("override_sound_count_mismatch");
  for (const overrideKey of unexpectedOverrideKeys) {
    failedChecks.push(`unexpected_override:${overrideKey}`);
  }
  for (const check of sourceChecks) {
    if (!check.ok) {
      failedChecks.push(`source_mismatch:${check.sourceGroup}:${check.sourceAssetPath}`);
    }
  }

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

  if (!skipBrowserPlayback && browserPlaybackSoundKey && manifestEntries[browserPlaybackSoundKey]) {
    browserPlayback = await runBrowserPlaybackCheck({
      launchUrl,
      soundKey: browserPlaybackSoundKey,
      playCount: browserPlaybackCount
    });
    for (const checkName of browserPlayback.failedChecks || []) {
      failedChecks.push(checkName);
    }
  }

  const report = {
    ok: failedChecks.length === 0,
    generatedAt: new Date().toISOString(),
    launchUrl,
    manifestPath,
    manifestGeneratedAt: manifest?.generatedAt || null,
    expectedSoundCount: expectedKeys.length,
    overrideSoundCount: overrideSoundKeys.length,
    overrideSoundKeys,
    unexpectedOverrideKeys,
    expectedPathCount: pathEntries.length,
    expectedProvenanceSourceCount: sourceChecks.length,
    soundCallCoverage,
    browserPlayback,
    bridge,
    failedChecks,
    sourceChecks,
    checks,
    pathChecks
  };

  writeJson(reportPath, report);
  printJson({
    ok: report.ok,
    expectedSoundCount: report.expectedSoundCount,
    overrideSoundCount: report.overrideSoundCount,
    expectedPathCount: report.expectedPathCount,
    expectedProvenanceSourceCount: report.expectedProvenanceSourceCount,
    soundCallCoverage: {
      expectedKnownCount: report.soundCallCoverage.expectedKnownCount,
      coveredKnownCount: report.soundCallCoverage.coveredKnownCount,
      missingKnownCount: report.soundCallCoverage.missingKnownCount
    },
    browserPlayback: {
      ok: report.browserPlayback.ok,
      skipped: Boolean(report.browserPlayback.skipped),
      soundKey: report.browserPlayback.soundKey || browserPlaybackSoundKey,
      playCount: report.browserPlayback.playCount || browserPlaybackCount,
      audioRecordCount: report.browserPlayback.audioRecordCount ?? null,
      playCalledCount: report.browserPlayback.playCalledCount ?? null,
      mutedRecordCount: report.browserPlayback.mutedRecordCount ?? null,
      pauseCalledCount: report.browserPlayback.pauseCalledCount ?? null
    },
    failedChecks: report.failedChecks,
    reportPath
  });

  if (!report.ok) {
    process.exitCode = 1;
  }
  } finally {
    lock.release();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
