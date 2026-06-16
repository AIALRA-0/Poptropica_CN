const fs = require("node:fs");
const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { acquireQaLock, buildAs2SceneEvidence, ensureQaDir, isMissingRequestLine, runPythonQa } = require("./lib/qa");
const { generateLaunchManifest } = require("./lib/launch-manifest");
const { clearPoptropicaFlashState } = require("./lib/flash-state");
const { writeJson } = require("./lib/fs-utils");
const {
  ensureFlashpointServices,
  ensureManagedWorkspace,
  mountSourceZip,
  proxyRequest,
  spawnManagedRuntime,
  stopNavigatorProcesses
} = require("./lib/flashpoint-runtime");

const GAME_SERVER_LOG_PATH = path.join(paths.managedLogsDir, "flashpoint-game-server.log");
const DEFAULT_REPRESENTATIVE_KEYS = [
  "super-power",
  "time-tangled",
  "astro-knights",
  "zomberry"
];

function flagEnabled(value) {
  return value === true || /^(1|true|yes|y)$/iu.test(String(value || ""));
}

function shouldFailOnMissingRequests(args) {
  if (flagEnabled(args.allowMissingRequests)) {
    return false;
  }
  if (args.failOnMissingRequests !== undefined) {
    return flagEnabled(args.failOnMissingRequests);
  }
  return true;
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function applyVisibleQaDefaults(args) {
  const targetMonitor = String(args.targetMonitor || args.monitor || process.env.POPTROPICA_QA_MONITOR || "G32QC").trim();
  if (targetMonitor) {
    process.env.POPTROPICA_QA_MONITOR = targetMonitor;
  }
  if (!flagEnabled(args.allowMouseClicks) && !process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS) {
    process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS = "1";
  }
  if (flagEnabled(args.noForegroundCapture)) {
    process.env.POPTROPICA_QA_NO_FOREGROUND = "1";
  }
  return {
    targetMonitor: targetMonitor || null,
    windowGeometry: resolveWindowGeometry(args),
    postMessageClicks: flagEnabled(process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS),
    noForegroundCapture: flagEnabled(process.env.POPTROPICA_QA_NO_FOREGROUND),
    missingRequestsFail: shouldFailOnMissingRequests(args)
  };
}

function safeFileSegment(value) {
  return String(value || "")
    .replace(/[^a-z0-9_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (_error) {
    return 0;
  }
}

function readLogSegment(filePath, startOffset) {
  try {
    const endOffset = fs.statSync(filePath).size;
    if (endOffset <= startOffset) {
      return "";
    }
    const fd = fs.openSync(filePath, "r");
    try {
      const length = Math.min(endOffset - startOffset, 1024 * 1024 * 4);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, startOffset);
      return buffer.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch (_error) {
    return "";
  }
}

function summarizeLogSegment(segment) {
  const lines = String(segment || "")
    .split(/\r?\n/gu)
    .filter(Boolean);
  const missing = lines.filter(isMissingRequestLine);
  const sounds = lines.filter((line) => /(?:sceneAudioOverrides|sounds\.xml|\.mp3|\.wav|\.flv|\/sound|\/sounds)\b/iu.test(line));
  const sceneSwfs = lines.filter((line) => /\/scenes\/island[^?\s]+\/scene[^?\s]*\.swf/iu.test(line));
  const maps = lines.filter((line) => /(?:content\/www\.poptropica\.com\/)?popups\/(?:map|travelmap)\.swf\b/iu.test(line));
  const requests = lines.filter((line) => /(?:Request:|Response:|\[Zipfs\])/iu.test(line));
  return {
    lineCount: lines.length,
    missingCount: missing.length,
    soundRequestCount: sounds.length,
    sceneSwfRequestCount: sceneSwfs.length,
    mapRequestCount: maps.length,
    missingSamples: missing.slice(0, 20),
    soundSamples: sounds.slice(0, 20),
    sceneSwfSamples: sceneSwfs.slice(-20),
    mapSamples: maps.slice(-20),
    requestTail: requests.slice(-40),
    lastLines: lines.slice(-30)
  };
}

function isLaunchHealthOk(launchHealth) {
  return Number(launchHealth?.statusCode || 0) === 200;
}

function summarizeLaunchHealth(launchHealth) {
  if (!launchHealth) {
    return null;
  }
  return {
    statusCode: launchHealth.statusCode ?? null,
    error: launchHealth.error || null,
    attempt: launchHealth.attempt ?? null,
    headers: launchHealth.headers
      ? {
          "content-type": launchHealth.headers["content-type"] || null,
          "content-length": launchHealth.headers["content-length"] || null,
          zipsvr_filename: launchHealth.headers.zipsvr_filename || null
        }
      : null,
    bodyBytes: typeof launchHealth.body === "string" ? launchHealth.body.length : 0
  };
}

async function requestLaunchHealth(url, args) {
  const attempts = Math.max(1, Number(args.launchHealthAttempts || 3));
  const retryDelayMs = Math.max(0, Number(args.launchHealthRetryDelayMs || 1500));
  let lastResult = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await proxyRequest(url);
      lastResult = { ...result, attempt };
      if (Number(result.statusCode || 0) > 0) {
        return lastResult;
      }
    } catch (error) {
      lastResult = {
        statusCode: 0,
        error: String(error.message || error),
        attempt
      };
    }
    if (attempt < attempts) {
      await sleep(retryDelayMs);
    }
  }
  return lastResult;
}

function resolveWindowGeometry(args = {}) {
  const sizeMatch = String(args.windowSize || args["window-size"] || "").match(/^(\d+)x(\d+)$/iu);
  const width = Number(args.windowWidth || args["window-width"] || (sizeMatch ? sizeMatch[1] : 0));
  const height = Number(args.windowHeight || args["window-height"] || (sizeMatch ? sizeMatch[2] : 0));
  return {
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : null,
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : null,
    maximize: flagEnabled(args.maximizeWindow || args["maximize-window"] || args.maximize)
  };
}

function appendWindowGeometryArgs(commandArgs, args = {}) {
  const geometry = resolveWindowGeometry(args);
  if (geometry.width) {
    commandArgs.push("--window-width", String(geometry.width));
  }
  if (geometry.height) {
    commandArgs.push("--window-height", String(geometry.height));
  }
  if (geometry.maximize) {
    commandArgs.push("--maximize");
  }
  return commandArgs;
}

function buildWaitArgs({ runtime, timeoutMs, outputPath, includePid = true, args = {} }) {
  const waitArgs = [
    "wait-window",
    "--process-names",
    runtime.processNames.join(","),
    "--title-contains",
    "poptropica",
    "--timeout-ms",
    String(timeoutMs),
    "--poll-ms",
    "250",
    "--output",
    outputPath
  ];
  if (includePid && runtime.pid) {
    waitArgs.push("--pid", String(runtime.pid));
  }
  return appendWindowGeometryArgs(waitArgs, args);
}

function buildCaptureArgs({ handle, runtime, screenshotPath, metadataPath, includePid = true, args = {} }) {
  const captureArgs = [
    "capture-window",
    "--handle",
    String(handle),
    "--process-names",
    runtime.processNames.join(","),
    "--title-contains",
    "poptropica",
    "--output",
    screenshotPath,
    "--metadata-output",
    metadataPath,
    "--client-only"
  ];
  if (includePid && runtime.pid) {
    captureArgs.push("--pid", String(runtime.pid));
  }
  return appendWindowGeometryArgs(captureArgs, args);
}

function formatQaError(step, error) {
  return {
    step,
    message: String(error?.message || error),
    status: error?.status ?? null,
    stdout: error?.stdout ? String(error.stdout).slice(0, 2000) : "",
    stderr: error?.stderr ? String(error.stderr).slice(0, 4000) : ""
  };
}

function captureWindowMatchesRuntime(capture, runtime) {
  const expectedPid = Number(runtime?.pid || 0);
  if (!expectedPid) {
    return true;
  }
  const actualPid = Number(capture?.window?.pid || 0);
  return actualPid === expectedPid;
}

function captureClickOffset(capture) {
  const mode = String(capture?.captureMode || "").toLowerCase();
  const className = String(capture?.window?.className || "").toLowerCase();
  if (mode === "client" && className.includes("mozillawindowclass")) {
    return { x: 0, y: 110 };
  }
  return { x: 0, y: 0 };
}

function stageRelativeToWindow(capture, stageRect, relativePoint) {
  const offset = captureClickOffset(capture);
  return {
    x: Math.round(offset.x + stageRect.left + (stageRect.width * relativePoint.x)),
    y: Math.round(offset.y + stageRect.top + (stageRect.height * relativePoint.y))
  };
}

function selectEntries(manifest, args) {
  const filters = new Set(splitCsv(args.islands || args.island).map((value) => value.toLowerCase()));
  const defaultKeys = new Set(DEFAULT_REPRESENTATIVE_KEYS);
  let entries = manifest.entries
    .filter((entry) => entry.sourceGroup === "as2" && entry.launchable)
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey, "en"));
  if (filters.size) {
    entries = entries.filter((entry) => {
      const candidates = [
        entry.canonicalKey,
        entry.islandParam,
        entry.roomParam,
        entry.sceneFolder
      ].map((value) => String(value || "").toLowerCase());
      return candidates.some((candidate) => filters.has(candidate));
    });
  } else if (!flagEnabled(args.all)) {
    entries = entries.filter((entry) => defaultKeys.has(entry.canonicalKey));
  }
  const limit = Number.parseInt(String(args.limit || ""), 10);
  return Number.isFinite(limit) && limit > 0 ? entries.slice(0, limit) : entries;
}

function captureAndAnalyze({ runDir, stem, suffix, runtime, runtimeWindow, qaErrors, args }) {
  if (!runtimeWindow?.match?.handle) {
    return {
      runtimeWindow,
      capture: null,
      stage: null,
      ocr: null,
      artifacts: {}
    };
  }
  const safeSuffix = suffix ? `-${suffix}` : "";
  const screenshotPath = path.join(runDir, `${stem}${safeSuffix}.png`);
  const metadataPath = path.join(runDir, `${stem}${safeSuffix}-capture.json`);
  const stagePath = path.join(runDir, `${stem}${safeSuffix}-stage.json`);
  const ocrPath = path.join(runDir, `${stem}${safeSuffix}-ocr.json`);
  let capture = null;
  let stage = null;
  let ocr = null;
  try {
    capture = runPythonQa(buildCaptureArgs({
      handle: runtimeWindow.match.handle,
      runtime,
      screenshotPath,
      metadataPath,
      args
    }), {
      timeoutMs: 40000
    });
    if (!captureWindowMatchesRuntime(capture, runtime)) {
      qaErrors.push({
        step: `${suffix || "capture"}-pid-mismatch`,
        message: `Captured window pid ${capture?.window?.pid || "unknown"} does not match launched runtime pid ${runtime?.pid || "unknown"}.`,
        status: null,
        stdout: "",
        stderr: ""
      });
      capture = null;
    }
  } catch (error) {
    qaErrors.push(formatQaError(`${suffix || "initial"}-capture-window`, error));
  }
  if (capture && fs.existsSync(screenshotPath)) {
    try {
      stage = runPythonQa([
        "analyze-stage",
        "--input",
        screenshotPath,
        "--output",
        stagePath
      ], {
        timeoutMs: 30000
      });
    } catch (error) {
      qaErrors.push(formatQaError(`${suffix || "initial"}-analyze-stage`, error));
    }
    if (!flagEnabled(args.skipOcr)) {
      try {
        ocr = runPythonQa([
          "ocr-image",
          "--input",
          screenshotPath,
          "--output",
          ocrPath
        ], {
          timeoutMs: 120000
        });
      } catch (error) {
        qaErrors.push(formatQaError(`${suffix || "initial"}-ocr-image`, error));
      }
    }
  }
  return {
    runtimeWindow,
    capture,
    stage,
    ocr,
    artifacts: {
      screenshotPath,
      metadataPath,
      stagePath,
      ocrPath: flagEnabled(args.skipOcr) ? null : ocrPath
    }
  };
}

function clickMap({ runDir, stem, runtime, runtimeWindow, capture, stage, args, qaErrors }) {
  const stageRect = stage?.stageRect;
  const logOffset = getFileSize(GAME_SERVER_LOG_PATH);
  const clickPath = path.join(runDir, `${stem}-map-click.json`);
  const postWindowPath = path.join(runDir, `${stem}-map-window.json`);
  const logPath = path.join(runDir, `${stem}-map-server.log`);
  if (!runtimeWindow?.match?.handle || !capture || !stageRect) {
    return {
      ok: false,
      skipped: false,
      reason: "stage_or_window_missing",
      mapRequestSeen: false,
      logPath
    };
  }
  const point = stageRelativeToWindow(capture, stageRect, {
    x: Number(args.mapX || 0.67),
    y: Number(args.mapY || 0.225)
  });
  try {
    const clickArgs = [
      "click-window",
      "--handle",
      String(runtimeWindow.match.handle),
      "--process-names",
      runtime.processNames.join(","),
      "--title-contains",
      "poptropica",
      "--x",
      String(point.x),
      "--y",
      String(point.y),
      "--output",
      clickPath
    ];
    if (runtime.pid) {
      clickArgs.push("--pid", String(runtime.pid));
    }
    appendWindowGeometryArgs(clickArgs, args);
    runPythonQa(clickArgs, {
      timeoutMs: 20000
    });
    const waitMs = Math.max(0, Number(args.mapWaitMs || 1800));
    if (waitMs > 0) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
    }
    const postWindow = runPythonQa(buildWaitArgs({
      runtime,
      timeoutMs: Number(args.recaptureWindowTimeoutMs || 10000),
      outputPath: postWindowPath,
      args
    }), {
      timeoutMs: Number(args.recaptureWindowTimeoutMs || 10000) + 5000
    });
    const postCapture = captureAndAnalyze({
      runDir,
      stem,
      suffix: "map",
      runtime,
      runtimeWindow: postWindow,
      qaErrors,
      args
    });
    const segment = readLogSegment(GAME_SERVER_LOG_PATH, logOffset);
    fs.writeFileSync(logPath, segment, "utf8");
    const logSummary = summarizeLogSegment(segment);
    const mapRequestSeen = Number(logSummary.mapRequestCount || 0) > 0;
    const stageStable = Boolean(postCapture.stage?.stageRect);
    const mapRequestRequired = flagEnabled(args.requireMapRequest);
    return {
      ok: stageStable && (!mapRequestRequired || mapRequestSeen),
      skipped: false,
      clickPoint: point,
      clickPath,
      windowPath: postWindowPath,
      logPath,
      runtimeWindow: postWindow,
      capture: postCapture.capture,
      stage: postCapture.stage,
      ocr: postCapture.ocr,
      artifacts: postCapture.artifacts,
      logSummary,
      mapRequestSeen,
      stageStable,
      reason: stageStable
        ? mapRequestRequired && !mapRequestSeen
          ? "map_request_not_seen"
          : null
        : "post_click_stage_missing"
    };
  } catch (error) {
    const segment = readLogSegment(GAME_SERVER_LOG_PATH, logOffset);
    fs.writeFileSync(logPath, segment, "utf8");
    return {
      ok: false,
      skipped: false,
      clickPoint: point,
      clickPath,
      logPath,
      mapRequestSeen: Number(summarizeLogSegment(segment).mapRequestCount || 0) > 0,
      reason: "map_click_or_recapture_failed",
      error: String(error.message || error)
    };
  }
}

async function smokeEntry({ config, runDir, entry, index, total, args }) {
  const stem = `${String(index + 1).padStart(2, "0")}-${safeFileSegment(entry.canonicalKey)}`;
  const windowPath = path.join(runDir, `${stem}-window.json`);
  const audioPath = path.join(runDir, `${stem}-audio.json`);
  const logPath = path.join(runDir, `${stem}-server.log`);
  const settleMs = Number(args.settleMs || 9000);
  const windowTimeoutMs = Number(args.windowTimeoutMs || 45000);
  const qaErrors = [];

  if (!flagEnabled(args.preserveFlashState)) {
    clearPoptropicaFlashState({ reason: `qa-as2-interaction-smoke:${entry.canonicalKey}` });
  }

  const logOffset = getFileSize(GAME_SERVER_LOG_PATH);
  const launchHealth = await requestLaunchHealth(entry.launchUrl, args);
  const runtime = spawnManagedRuntime(config, "as2", entry.launchUrl, {
    detach: true,
    playerKey: String(args.playerKey || "flashpointnavigator-as2"),
    as2StartX: args.startX,
    as2StartY: args.startY,
    forceAs2CharState: flagEnabled(args.forceAs2CharState)
  });

  let runtimeWindow = null;
  try {
    runtimeWindow = runPythonQa(buildWaitArgs({ runtime, timeoutMs: windowTimeoutMs, outputPath: windowPath, args }), {
      timeoutMs: windowTimeoutMs + 5000
    });
  } catch (error) {
    qaErrors.push(formatQaError("wait-window", error));
  }

  await sleep(settleMs);
  const initial = captureAndAnalyze({ runDir, stem, suffix: "initial", runtime, runtimeWindow, qaErrors, args });
  const audio = flagEnabled(args.skipAudio)
    ? { skipped: true, audioLikelyActive: false }
    : runPythonQa([
        "audio-check",
        "--process-names",
        runtime.processNames.join(","),
        "--duration-sec",
        String(args.audioDurationSec || 2.5),
        "--sample-rate",
        String(args.audioSampleRate || 16000),
        "--peak-threshold",
        String(args.audioPeakThreshold || 0.0005),
        "--output",
        audioPath
      ], {
        timeoutMs: Number(args.audioTimeoutMs || 30000)
      });

  const map = flagEnabled(args.skipMapClick)
    ? { ok: true, skipped: true, mapRequestSeen: false }
    : clickMap({
        runDir,
        stem,
        runtime,
        runtimeWindow: initial.runtimeWindow || runtimeWindow,
        capture: initial.capture,
        stage: initial.stage,
        args,
        qaErrors
      });

  const logSegment = readLogSegment(GAME_SERVER_LOG_PATH, logOffset);
  fs.writeFileSync(logPath, logSegment, "utf8");
  const logSummary = summarizeLogSegment(logSegment);
  const sceneEvidence = buildAs2SceneEvidence(entry, logSegment, args);
  const failedChecks = [];
  if (!runtimeWindow?.match) {
    failedChecks.push("window_not_found");
  }
  if (!isLaunchHealthOk(launchHealth)) {
    failedChecks.push("launch_health_failed");
  }
  if (Number(initial.capture?.imageSize?.width || 0) < 800 || Number(initial.capture?.imageSize?.height || 0) < 450) {
    failedChecks.push("non_game_window_too_small");
  }
  if (!initial.stage?.stageRect || Number(initial.stage.stageCoverageRatio || 0) < Number(args.minStageCoverage || 0.35)) {
    failedChecks.push("stage_not_detected_or_too_small");
  }
  if (shouldFailOnMissingRequests(args) && Number(logSummary.missingCount || 0) > 0) {
    failedChecks.push("missing_requests_seen");
  }
  if (flagEnabled(args.requireSceneEvidence) && !sceneEvidence.ok) {
    failedChecks.push("scene_evidence_missing");
  }
  if (flagEnabled(args.requireAudio) && !audio?.audioLikelyActive) {
    failedChecks.push("audio_inactive");
  }
  if (!map.skipped && !map.ok) {
    failedChecks.push("map_post_message_click_failed");
  }
  if (!map.skipped && flagEnabled(args.requireMapRequest) && !map.mapRequestSeen) {
    failedChecks.push("map_request_not_seen");
  }
  for (const qaError of qaErrors) {
    failedChecks.push(`qa_${qaError.step.replace(/[^a-z0-9]+/giu, "_")}_failed`);
  }

  return {
    ok: failedChecks.length === 0,
    generatedAt: new Date().toISOString(),
    index: index + 1,
    total,
    canonicalKey: entry.canonicalKey,
    islandParam: entry.islandParam,
    roomParam: entry.roomParam,
    sceneFolder: entry.sceneFolder,
    launchUrl: entry.launchUrl,
    launchHealth: summarizeLaunchHealth(launchHealth),
    visibleQaDefaults: args.visibleQaDefaults || null,
    runtime: {
      playerKey: runtime.playerKey,
      pid: runtime.pid || null,
      processNames: runtime.processNames
    },
    artifacts: {
      windowPath,
      initialScreenshotPath: initial.artifacts.screenshotPath || null,
      initialStagePath: initial.artifacts.stagePath || null,
      audioPath: flagEnabled(args.skipAudio) ? null : audioPath,
      logSegmentPath: logPath
    },
    runtimeWindow,
    initial: {
      capture: initial.capture,
      stage: initial.stage,
      ocr: initial.ocr
        ? {
            skipped: Boolean(initial.ocr.skipped),
            text: String(initial.ocr.text || "").slice(0, 500),
            lineCount: initial.ocr.lineCount || 0
          }
        : null
    },
    audio: {
      skipped: Boolean(audio?.skipped),
      active: Boolean(audio?.audioLikelyActive),
      rms: audio?.loopback?.rms ?? null,
      peak: audio?.loopback?.peak ?? null,
      sessionCount: audio?.sessionCount ?? null
    },
    map,
    sceneEvidence,
    logSummary,
    qaErrors,
    failedChecks
  };
}

function buildSummary(startedAt, reports) {
  return {
    ok: reports.length > 0 && reports.every((report) => report.ok),
    generatedAt: new Date().toISOString(),
    startedAt,
    total: reports.length,
    passed: reports.filter((report) => report.ok).length,
    failed: reports.filter((report) => !report.ok).length,
    audioActive: reports.filter((report) => report.audio?.active).length,
    mapClicksPassed: reports.filter((report) => report.map && !report.map.skipped && report.map.ok && report.map.mapRequestSeen).length,
    sceneEvidencePassed: reports.filter((report) => report.sceneEvidence?.ok).length,
    withMissingLogRequests: reports.filter((report) => Number(report.logSummary?.missingCount || 0) > 0).length,
    failedKeys: reports.filter((report) => !report.ok).map((report) => report.canonicalKey)
  };
}

function writeSmokeReport({ reportPath, latestPath, startedAt, artifactDir, reports }) {
  const summary = buildSummary(startedAt, reports);
  const report = {
    ...summary,
    artifactDir,
    reports
  };
  writeJson(reportPath, report);
  writeJson(latestPath, report);
  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  args.visibleQaDefaults = applyVisibleQaDefaults(args);
  const config = loadConfig();
  const qaDir = ensureQaDir("as2", "interaction-smoke");
  const startedAt = new Date().toISOString();
  const runToken = String(Date.now());
  const runDir = ensureQaDir("as2", "interaction-smoke", `run-${runToken}`);
  const reportPath = path.join(qaDir, `as2-interaction-smoke-${runToken}.json`);
  const latestPath = path.join(qaDir, "as2-interaction-smoke-latest.json");
  const lock = acquireQaLock("flashpoint-runtime-qa.lock", {
    sourceGroup: "as2",
    tool: "qa-as2-interaction-smoke",
    reportPath,
    artifactDir: runDir
  });

  const reports = [];
  try {
    ensureManagedWorkspace(config);
    await ensureFlashpointServices(config);
    await mountSourceZip(config, "as2");
    const manifest = generateLaunchManifest(config, { write: false });
    const entries = selectEntries(manifest, args);
    if (!entries.length) {
      throw new Error("No AS2 launchable islands matched the requested filters.");
    }

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      try {
        reports.push(await smokeEntry({ config, runDir, entry, index, total: entries.length, args }));
      } catch (error) {
        reports.push({
          ok: false,
          generatedAt: new Date().toISOString(),
          index: index + 1,
          total: entries.length,
          canonicalKey: entry.canonicalKey,
          launchUrl: entry.launchUrl,
          failedChecks: [String(error.message || error)],
          error: String(error.stack || error)
        });
      } finally {
        stopNavigatorProcesses();
        await sleep(Number(args.betweenMs || 1000));
        writeSmokeReport({ reportPath, latestPath, startedAt, artifactDir: runDir, reports });
      }
    }

    const summary = writeSmokeReport({ reportPath, latestPath, startedAt, artifactDir: runDir, reports });
    printJson({
      ...summary,
      representativeDefault: !flagEnabled(args.all) && !args.islands && !args.island,
      reportPath,
      latestPath
    });
    if (!summary.ok && !flagEnabled(args.allowFailures)) {
      process.exitCode = 1;
    }
  } catch (error) {
    stopNavigatorProcesses();
    const summary = writeSmokeReport({ reportPath, latestPath, startedAt, artifactDir: runDir, reports });
    printJson({
      ...summary,
      ok: false,
      fatal: true,
      failedChecks: ["as2_interaction_smoke_fatal_error"],
      error: String(error.stack || error.message || error),
      reportPath,
      latestPath
    });
    process.exitCode = 1;
  } finally {
    lock.release();
  }
}

main().catch((error) => {
  stopNavigatorProcesses();
  printJson({
    ok: false,
    error: String(error.stack || error.message || error)
  });
  process.exit(1);
});
