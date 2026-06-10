const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureQaDir, runPythonQa } = require("./lib/qa");
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
const AS3_SMOKE_LOCK_NAME = ".qa-as3-islands-smoke.lock";

function flagEnabled(value) {
  return value === true || /^(1|true|yes|y)$/iu.test(String(value || ""));
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function safeFileSegment(value) {
  return String(value || "")
    .replace(/[^a-z0-9_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
}

function isProcessAlive(pid) {
  const numericPid = Number(pid || 0);
  if (!numericPid || numericPid === process.pid) {
    return false;
  }
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function acquireSmokeLock(lockPath, context) {
  const payload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    command: process.argv.join(" "),
    ...context
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let fd = null;
    try {
      fd = fs.openSync(lockPath, "wx");
      fs.writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      return () => {
        const current = readJsonIfExists(lockPath);
        if (!current || Number(current.pid) === process.pid) {
          try {
            fs.unlinkSync(lockPath);
          } catch (_error) {
            // Best effort cleanup only.
          }
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
      const existing = readJsonIfExists(lockPath);
      if (existing && isProcessAlive(existing.pid)) {
        const lockError = new Error(`Another AS3 smoke run is already active (pid ${existing.pid}).`);
        lockError.code = "AS3_SMOKE_LOCKED";
        lockError.lock = existing;
        throw lockError;
      }
      try {
        fs.unlinkSync(lockPath);
      } catch (_error) {
        // Retry once; if that fails, surface a lock error below.
      }
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch (_error) {
          // Already closed or invalid.
        }
      }
    }
  }

  const lockError = new Error("Unable to acquire AS3 smoke lock after removing stale lock.");
  lockError.code = "AS3_SMOKE_LOCKED";
  lockError.lock = readJsonIfExists(lockPath);
  throw lockError;
}

function detectRuntimeConflicts() {
  if (process.platform !== "win32") {
    return [];
  }

  const script = `
$nodePid = ${process.pid}
Get-CimInstance Win32_Process |
  Where-Object {
    $_.ProcessId -ne $nodePid -and
    $_.ParentProcessId -ne $nodePid -and
    $_.CommandLine -and
    (
      $_.CommandLine -match 'qa:validate-as2' -or
      $_.CommandLine -match 'qa-validate-runtime\\.js --source as2' -or
      $_.CommandLine -match 'flashpointnavigator-as2' -or
      $_.CommandLine -match 'base\\.php\\?room=DownTown&island=Super'
    )
  } |
  Select-Object Name,ProcessId,ParentProcessId,CommandLine |
  ConvertTo-Json -Compress
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8
  });
  if (result.status !== 0 || !String(result.stdout || "").trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_error) {
    return [];
  }
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
  const missing = lines.filter((line) => {
    if (!/\b(?:404|missing|not found|ENOENT)\b/iu.test(line)) {
      return false;
    }
    return !/flashpoint-gmp-dummy\.xml/iu.test(line);
  });
  const sounds = lines.filter((line) => /(?:sounds\.xml|\.mp3|\.wav|\.flv|\/sound|\/sounds)\b/iu.test(line));
  const scenes = lines.filter((line) => /(?:SceneLoaded|loadScene|overrideScene|\/game\/data\/scenes\/|\/game\/assets\/scenes\/)/iu.test(line));
  const sceneLoaded = lines.filter((line) => /(?:SceneLoaded|event=Loaded|\bLoaded\b.*\/game\/data\/scenes\/)/iu.test(line));
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
    sceneLoadedCount: sceneLoaded.length,
    sceneMediaRequestCount: sceneMedia.length,
    missingSamples: missing.slice(0, 20),
    soundSamples: sounds.slice(0, 20),
    sceneLoadedSamples: sceneLoaded.slice(-20),
    sceneMediaSamples: sceneMedia.slice(-20),
    sceneSamples: scenes.slice(-30),
    requestTail: requests.slice(-40),
    lastLines: lines.slice(-30)
  };
}

function summarizeLaunchHealth(launchHealth) {
  if (!launchHealth) {
    return null;
  }
  return {
    statusCode: launchHealth.statusCode ?? null,
    error: launchHealth.error || null,
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

function hasSceneProgressSignal(logSummary) {
  if (!logSummary) {
    return false;
  }
  return Number(logSummary.sceneLoadedCount || 0) > 0 || Number(logSummary.sceneMediaRequestCount || 0) > 0;
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

function isSafeModePrompt(runtimeWindow, ocr) {
  const title = String(runtimeWindow?.match?.title || "");
  const text = String(ocr?.text || "");
  return /safe mode/iu.test(`${title}\n${text}`);
}

function buildWaitArgs({ runtime, timeoutMs, outputPath, includePid = true }) {
  const args = [
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
    args.push("--pid", String(runtime.pid));
  }
  return args;
}

function buildCaptureArgs({ handle, runtime, screenshotPath, captureMetadataPath, includePid = true }) {
  const args = [
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
    args.push("--pid", String(runtime.pid));
  }
  return args;
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

async function smokeIsland({ config, qaDir, runDir, entry, index, total, args }) {
  const overrideSuffix = args.overrideScene ? `-${safeFileSegment(entry.roomParam || entry.as3TargetScene || "override")}` : "";
  const safeStem = `${String(index + 1).padStart(2, "0")}-${entry.canonicalKey}${overrideSuffix}`;
  const islandDir = runDir || ensureQaDir("as3", "islands-smoke");
  const windowPath = path.join(islandDir, `${safeStem}-window.json`);
  const screenshotPath = path.join(islandDir, `${safeStem}.png`);
  const captureMetadataPath = path.join(islandDir, `${safeStem}-capture.json`);
  const recaptureWindowPath = path.join(islandDir, `${safeStem}-recapture-window.json`);
  const recaptureAnyPidWindowPath = path.join(islandDir, `${safeStem}-recapture-window-anypid.json`);
  const stagePath = path.join(islandDir, `${safeStem}-stage.json`);
  const ocrPath = path.join(islandDir, `${safeStem}-ocr.json`);
  const audioPath = path.join(islandDir, `${safeStem}-audio.json`);
  const logSegmentPath = path.join(islandDir, `${safeStem}-server.log`);
  const settleMs = Number(args.settleMs || 22000);
  const windowTimeoutMs = Number(args.windowTimeoutMs || 60000);

  await ensureFlashpointServices(config);
  await mountSourceZip(config, "as3");
  const logOffset = getFileSize(GAME_SERVER_LOG_PATH);
  clearPoptropicaFlashState({ reason: `qa-as3-island-smoke:${entry.canonicalKey}` });
  let launchHealth = null;
  try {
    launchHealth = await proxyRequest(entry.launchUrl);
  } catch (error) {
    launchHealth = {
      statusCode: 0,
      error: String(error.message || error)
    };
  }

  const runtime = spawnManagedRuntime(config, "as3", entry.launchUrl, {
    detach: true,
    playerKey: "flashpointnavigator-as3"
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
    const audioAttempts = Math.max(1, Number(args.audioAttempts || (flagEnabled(args.requireAudio) ? 2 : 1)));
    let audioError = null;
    for (let attempt = 1; attempt <= audioAttempts; attempt += 1) {
      const attemptAudioPath = attempt === 1
        ? audioPath
        : path.join(islandDir, `${safeStem}-audio-${attempt}.json`);
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
          attemptAudioPath
        ], {
          timeoutMs: Number(args.audioTimeoutMs || 30000)
        });
        audio.attempt = attempt;
        audioError = null;
        if (audio.audioLikelyActive) {
          break;
        }
      } catch (error) {
        audioError = error;
      }
      if (attempt < audioAttempts) {
        await sleep(Number(args.audioRetryDelayMs || 2000));
      }
    }
    if (audioError) {
      qaErrors.push(formatQaError("audio-check", audioError));
    }
  }

  const logSegment = readLogSegment(GAME_SERVER_LOG_PATH, logOffset);
  fs.writeFileSync(logSegmentPath, logSegment, "utf8");
  const logSummary = summarizeLogSegment(logSegment);
  const failedChecks = [];
  if (!runtimeWindow?.match) {
    failedChecks.push("window_not_found");
  }
  if (isSafeModePrompt(runtimeWindow, ocr)) {
    failedChecks.push("safe_mode_prompt");
  }
  if (Number(capture?.imageSize?.width || 0) < 800 || Number(capture?.imageSize?.height || 0) < 450) {
    failedChecks.push("non_game_window_too_small");
  }
  if (!stage?.stageRect || Number(stage.stageCoverageRatio || 0) < Number(args.minStageCoverage || 0.35)) {
    failedChecks.push("stage_not_detected_or_too_small");
  }
  if (isLikelyLoadingScreen(ocr, logSummary)) {
    failedChecks.push("loading_screen_stuck");
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
    launchUrl: entry.launchUrl,
    launchHealth: summarizeLaunchHealth(launchHealth),
    as3TargetScene: entry.as3TargetScene,
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
      sessionCount: audio?.sessionCount ?? null,
      attempt: audio?.attempt ?? null
    },
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
  const config = loadConfig();
  const qaDir = ensureQaDir("as3", "islands-smoke");
  const startedAt = new Date().toISOString();
  const runToken = String(Date.now());
  const reportPath = path.join(qaDir, `as3-island-smoke-${runToken}.json`);
  const latestPath = path.join(qaDir, "as3-island-smoke-latest.json");
  const runDir = ensureQaDir("as3", "islands-smoke", `run-${runToken}`);
  const lockPath = path.join(qaDir, AS3_SMOKE_LOCK_NAME);
  let releaseSmokeLock = null;

  try {
    releaseSmokeLock = acquireSmokeLock(lockPath, {
      reportPath,
      artifactDir: runDir
    });
  } catch (error) {
    if (error?.code !== "AS3_SMOKE_LOCKED") {
      throw error;
    }
    const report = {
      ok: false,
      generatedAt: new Date().toISOString(),
      startedAt,
      total: 0,
      passed: 0,
      failed: 0,
      audioActive: 0,
      audioInactive: 0,
      withMissingLogRequests: 0,
      failedKeys: [],
      blocked: true,
      failedChecks: ["as3_smoke_lock_active"],
      lockPath,
      activeRun: error.lock || null
    };
    writeJson(reportPath, report);
    printJson({
      ...report,
      reportPath,
      latestPath,
      latestUnchanged: true
    });
    process.exitCode = 2;
    return;
  }

  try {
  if (!flagEnabled(args.ignoreRuntimeConflicts)) {
    const runtimeConflicts = detectRuntimeConflicts();
    if (runtimeConflicts.length > 0) {
      const report = {
        ok: false,
        generatedAt: new Date().toISOString(),
        startedAt,
        total: 0,
        passed: 0,
        failed: 0,
        audioActive: 0,
        audioInactive: 0,
        withMissingLogRequests: 0,
        failedKeys: [],
        blocked: true,
        failedChecks: ["runtime_conflict"],
        artifactDir: runDir,
        runtimeConflicts
      };
      writeJson(reportPath, report);
      writeJson(latestPath, report);
      printJson({
        ...report,
        reportPath,
        latestPath
      });
      process.exitCode = 2;
      return;
    }
  }
  ensureManagedWorkspace(config);
  await ensureFlashpointServices(config);
  await mountSourceZip(config, "as3");

  const selectedIds = new Set(splitCsv(args.islands || args.island || ""));
  const limit = Number(args.limit || 0);
  const manifest = generateLaunchManifest(config);
  let entries = manifest.entries
    .filter((entry) => entry.sourceGroup === "as3" && entry.launchable && entry.launchMode === "as3-direct-scene")
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey, "en"));
  if (selectedIds.size > 0) {
    entries = entries.filter((entry) => selectedIds.has(entry.canonicalKey));
  }
  if (limit > 0) {
    entries = entries.slice(0, limit);
  }
  if (args.overrideScene) {
    if (entries.length !== 1) {
      throw new Error("--overrideScene requires exactly one selected AS3 island.");
    }
    const overrideScene = String(args.overrideScene);
    const sceneParts = overrideScene.split(".");
    entries = [{
      ...entries[0],
      as3TargetScene: overrideScene,
      roomParam: sceneParts.length >= 2 ? sceneParts[sceneParts.length - 2] : entries[0].roomParam,
      launchUrl: `http://www.poptropica.com/game/Shell.swf?island&overrideScene=${encodeURIComponent(overrideScene)}`
    }];
  }
  if (!entries.length) {
    throw new Error("No AS3 direct-launch islands matched the requested filters.");
  }

  const reports = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    try {
      reports.push(await smokeIsland({ config, qaDir, runDir, entry, index, total: entries.length, args }));
    } catch (error) {
      reports.push({
        ok: false,
        generatedAt: new Date().toISOString(),
        index: index + 1,
        total: entries.length,
        canonicalKey: entry.canonicalKey,
        launchUrl: entry.launchUrl,
        as3TargetScene: entry.as3TargetScene,
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
  } finally {
    if (releaseSmokeLock) {
      releaseSmokeLock();
    }
  }
}

main().catch((error) => {
  stopNavigatorProcesses();
  console.error(error);
  process.exit(1);
});
