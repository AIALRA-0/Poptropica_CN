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
  const sceneAssets = lines.filter((line) => /(?:\/scenes\/island|\/gameplay|base\.php|startup_path=gameplay)/iu.test(line));
  const sceneMedia = sounds.filter((line) => {
    if (!/\.(?:mp3|wav|flv)\b/iu.test(line)) {
      return false;
    }
    return !/\/game\/sound\/effects\/ui_/iu.test(line);
  });
  const requests = lines.filter((line) => /(?:Request:|Response:|\[Zipfs\])/iu.test(line));
  return {
    lineCount: lines.length,
    missingCount: missing.length,
    soundRequestCount: sounds.length,
    sceneSwfRequestCount: sceneSwfs.length,
    sceneAssetRequestCount: sceneAssets.length,
    sceneMediaRequestCount: sceneMedia.length,
    missingSamples: missing.slice(0, 20),
    soundSamples: sounds.slice(0, 20),
    sceneSwfSamples: sceneSwfs.slice(-20),
    sceneAssetSamples: sceneAssets.slice(-30),
    sceneMediaSamples: sceneMedia.slice(-20),
    requestTail: requests.slice(-40),
    lastLines: lines.slice(-30)
  };
}

function hasSceneProgressSignal(logSummary) {
  if (!logSummary) {
    return false;
  }
  return Number(logSummary.sceneSwfRequestCount || 0) > 0 ||
    Number(logSummary.sceneAssetRequestCount || 0) > 0 ||
    Number(logSummary.sceneMediaRequestCount || 0) > 0;
}

function isLikelyLoadingScreen(ocr, logSummary = null) {
  if (ocr?.skipped) {
    return false;
  }
  const text = String(ocr?.text || "");
  const words = text.toUpperCase().match(/[A-Z]+/gu) || [];
  const meaningful = words.filter((word) => !["R", "TM"].includes(word));
  if (meaningful.length > 0 && meaningful.every((word) => word === "POPTROPICA")) {
    return true;
  }
  const hasPoptropicaLogo = /\bPOPTROPICA\b/iu.test(text);
  const sparseText = Number(ocr?.lineCount || 0) <= 3 && meaningful.length <= 24;
  return hasPoptropicaLogo && sparseText && !hasSceneProgressSignal(logSummary);
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

function isLaunchHealthOk(launchHealth) {
  return Number(launchHealth?.statusCode || 0) === 200;
}

async function requestLaunchHealth(url, args) {
  const attempts = Math.max(1, Number(args.launchHealthAttempts || 3));
  const retryDelayMs = Math.max(0, Number(args.launchHealthRetryDelayMs || 1500));
  let lastResult = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await proxyRequest(url);
      lastResult = {
        ...result,
        attempt
      };
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

function buildWaitArgs({ runtime, timeoutMs, outputPath, includePid = true }) {
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
  return waitArgs;
}

function buildCaptureArgs({ handle, runtime, screenshotPath, captureMetadataPath, includePid = true }) {
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
    captureMetadataPath,
    "--client-only"
  ];
  if (includePid && runtime.pid) {
    captureArgs.push("--pid", String(runtime.pid));
  }
  return captureArgs;
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

function rejectMismatchedCapture(capture, runtime, qaErrors) {
  if (!capture || captureWindowMatchesRuntime(capture, runtime)) {
    return capture;
  }
  qaErrors.push({
    step: "capture-window-pid-mismatch",
    message: `Captured window pid ${capture?.window?.pid || "unknown"} does not match launched runtime pid ${runtime?.pid || "unknown"}.`,
    status: null,
    stdout: "",
    stderr: ""
  });
  return null;
}

function selectEntries(manifest, args) {
  const filters = new Set(splitCsv(args.islands || args.island).map((value) => value.toLowerCase()));
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
  }
  const limit = Number.parseInt(String(args.limit || ""), 10);
  return Number.isFinite(limit) && limit > 0 ? entries.slice(0, limit) : entries;
}

async function smokeEntry({ config, runDir, entry, index, total, args }) {
  const safeStem = `${String(index + 1).padStart(2, "0")}-${safeFileSegment(entry.canonicalKey)}`;
  const windowPath = path.join(runDir, `${safeStem}-window.json`);
  const screenshotPath = path.join(runDir, `${safeStem}.png`);
  const captureMetadataPath = path.join(runDir, `${safeStem}-capture.json`);
  const recaptureWindowPath = path.join(runDir, `${safeStem}-recapture-window.json`);
  const recaptureAnyPidWindowPath = path.join(runDir, `${safeStem}-recapture-window-anypid.json`);
  const stagePath = path.join(runDir, `${safeStem}-stage.json`);
  const ocrPath = path.join(runDir, `${safeStem}-ocr.json`);
  const audioPath = path.join(runDir, `${safeStem}-audio.json`);
  const logSegmentPath = path.join(runDir, `${safeStem}-server.log`);
  const settleMs = Number(args.settleMs || 10000);
  const windowTimeoutMs = Number(args.windowTimeoutMs || 45000);

  if (!flagEnabled(args.preserveFlashState)) {
    clearPoptropicaFlashState({ reason: `qa-as2-island-smoke:${entry.canonicalKey}` });
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

  const qaErrors = [];
  let runtimeWindow = null;
  let capture = null;
  let stage = null;
  let ocr = { skipped: flagEnabled(args.skipOcr), text: "", containsChinese: false, lineCount: 0 };
  let audio = { skipped: flagEnabled(args.skipAudio), audioLikelyActive: false };

  try {
    runtimeWindow = runPythonQa(buildWaitArgs({ runtime, timeoutMs: windowTimeoutMs, outputPath: windowPath }), {
      timeoutMs: windowTimeoutMs + 5000
    });
  } catch (error) {
    qaErrors.push(formatQaError("wait-window", error));
  }

  await sleep(settleMs);

  if (runtimeWindow?.match?.handle) {
    try {
      capture = runPythonQa(buildCaptureArgs({
        handle: runtimeWindow.match.handle,
        runtime,
        screenshotPath,
        captureMetadataPath
      }), {
        timeoutMs: 40000
      });
      capture = rejectMismatchedCapture(capture, runtime, qaErrors);
    } catch (error) {
      let recoveredWindow = null;
      try {
        recoveredWindow = runPythonQa(buildWaitArgs({
          runtime,
          timeoutMs: Number(args.recaptureWindowTimeoutMs || 10000),
          outputPath: recaptureWindowPath
        }), {
          timeoutMs: Number(args.recaptureWindowTimeoutMs || 10000) + 5000
        });
      } catch (_pidError) {
        try {
          recoveredWindow = runPythonQa(buildWaitArgs({
            runtime,
            timeoutMs: Number(args.recaptureWindowTimeoutMs || 10000),
            outputPath: recaptureAnyPidWindowPath,
            includePid: false
          }), {
            timeoutMs: Number(args.recaptureWindowTimeoutMs || 10000) + 5000
          });
        } catch (_anyPidError) {
          recoveredWindow = null;
        }
      }
      if (recoveredWindow?.match?.handle) {
        runtimeWindow = recoveredWindow;
        const samePid = !runtime.pid || Number(recoveredWindow.match.pid || 0) === Number(runtime.pid);
        try {
          capture = runPythonQa(buildCaptureArgs({
            handle: recoveredWindow.match.handle,
            runtime,
            screenshotPath,
            captureMetadataPath,
            includePid: samePid
          }), {
            timeoutMs: 40000
          });
          capture = rejectMismatchedCapture(capture, runtime, qaErrors);
        } catch (retryError) {
          qaErrors.push(formatQaError("capture-window", retryError));
          qaErrors.push(formatQaError("capture-window-initial", error));
        }
      } else {
        qaErrors.push(formatQaError("capture-window", error));
      }
    }
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
      qaErrors.push(formatQaError("analyze-stage", error));
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
        qaErrors.push(formatQaError("ocr-image", error));
      }
    }
  }

  if (!flagEnabled(args.skipAudio)) {
    try {
      audio = runPythonQa([
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
    } catch (error) {
      qaErrors.push(formatQaError("audio-check", error));
    }
  }

  const logSegment = readLogSegment(GAME_SERVER_LOG_PATH, logOffset);
  fs.writeFileSync(logSegmentPath, logSegment, "utf8");
  const logSummary = summarizeLogSegment(logSegment);
  const sceneEvidence = buildAs2SceneEvidence(entry, logSegment, args);

  const failedChecks = [];
  if (!runtimeWindow?.match) {
    failedChecks.push("window_not_found");
  }
  if (!isLaunchHealthOk(launchHealth)) {
    failedChecks.push("launch_health_failed");
  }
  if (Number(capture?.imageSize?.width || 0) < 800 || Number(capture?.imageSize?.height || 0) < 450) {
    failedChecks.push("non_game_window_too_small");
  }
  if (!stage?.stageRect || Number(stage.stageCoverageRatio || 0) < Number(args.minStageCoverage || 0.35)) {
    failedChecks.push("stage_not_detected_or_too_small");
  }
  if (isLaunchHealthOk(launchHealth) && !flagEnabled(args.allowNoSceneProgress) && !hasSceneProgressSignal(logSummary)) {
    failedChecks.push("scene_progress_missing");
  }
  if (flagEnabled(args.requireSceneEvidence) && !sceneEvidence.ok) {
    failedChecks.push("scene_evidence_missing");
  }
  if (isLikelyLoadingScreen(ocr, logSummary)) {
    failedChecks.push("loading_screen_stuck");
  }
  if (shouldFailOnMissingRequests(args) && Number(logSummary.missingCount || 0) > 0) {
    failedChecks.push("missing_requests_seen");
  }
  if (flagEnabled(args.requireAudio) && !audio?.audioLikelyActive) {
    failedChecks.push("audio_inactive");
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
    startupPath: entry.startupPath,
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
      screenshotPath,
      captureMetadataPath,
      recaptureWindowPath,
      recaptureAnyPidWindowPath,
      stagePath,
      ocrPath: flagEnabled(args.skipOcr) ? null : ocrPath,
      audioPath: flagEnabled(args.skipAudio) ? null : audioPath,
      logSegmentPath
    },
    runtimeWindow,
    capture,
    stage,
    ocr: {
      skipped: Boolean(ocr?.skipped),
      containsChinese: Boolean(ocr?.containsChinese),
      text: String(ocr?.text || "").slice(0, 500),
      lineCount: ocr?.lineCount || 0
    },
    audio: {
      skipped: Boolean(audio?.skipped),
      active: Boolean(audio?.audioLikelyActive),
      rms: audio?.loopback?.rms ?? null,
      peak: audio?.loopback?.peak ?? null,
      sessionCount: audio?.sessionCount ?? null
    },
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
    audioInactive: reports.filter((report) => report.audio && !report.audio.skipped && !report.audio.active).length,
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
  const qaDir = ensureQaDir("as2", "islands-smoke");
  const startedAt = new Date().toISOString();
  const runToken = String(Date.now());
  const runDir = ensureQaDir("as2", "islands-smoke", `run-${runToken}`);
  const reportPath = path.join(qaDir, `as2-island-smoke-${runToken}.json`);
  const latestPath = path.join(qaDir, "as2-island-smoke-latest.json");
  const lock = acquireQaLock("flashpoint-runtime-qa.lock", {
    sourceGroup: "as2",
    tool: "qa-as2-islands-smoke",
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
      failedChecks: ["as2_smoke_fatal_error"],
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
