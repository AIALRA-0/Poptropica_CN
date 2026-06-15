const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureQaDir, isMissingRequestLine, runPythonQa } = require("./lib/qa");
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
const AS3_SMOKE_REPORT_RE = /^as3-island-smoke-\d+\.json$/u;
const DEFAULT_INTERACTION_TARGET = {
  x: 0.42,
  y: 0.74,
  holdMs: 0,
  moveIntervalMs: 0,
  label: "generic-stage-stability"
};
const AS3_INTERACTION_TARGETS = {
  "arabian-nights": {
    x: 0.42,
    y: 0.74,
    label: "how-bazaar-start-popup",
    expectedOcrPattern: "Arabian|How\\s*Bazaar|START"
  },
  "mocktropica": {
    x: 0.42,
    y: 0.74,
    label: "worldwide-headquarters-sign",
    expectedOcrPattern: "WORLDWIDE|HEADQUARTERS|Poptropica",
    minChangedPixelRatio: 0.002
  },
  "mission-atlantis": {
    x: 0.42,
    y: 0.74,
    label: "submarine-bubble-movement",
    minChangedPixelRatio: 0.005
  },
  "monkey-wrench": {
    x: 0.42,
    y: 0.74,
    label: "walk-tutorial-overlay",
    expectedOcrPattern: "CLICK\\s+AND\\s+HOLD|TO\\s+WALK",
    minChangedPixelRatio: 0.05
  },
  "monster-carnival": {
    x: 0.42,
    y: 0.74,
    label: "carnival-street-signs",
    expectedOcrPattern: "CARNIVAL|Sundae|MINERALS",
    minChangedPixelRatio: 0.005
  },
  "poptropicon": {
    x: 0.42,
    y: 0.74,
    label: "pizza-truck-street-signs",
    expectedOcrPattern: "PEPE'?S|PIZZA|RESTROOMS",
    minChangedPixelRatio: 0.005
  },
  "timmy-failure": {
    x: 0.42,
    y: 0.74,
    label: "front-yard-dialogue",
    expectedOcrPattern: "I\\s+DON'?T\\s+HAVE\\s+TIME|GARBAGE\\s+STINK|GOOD\\s+LUCK",
    minChangedPixelRatio: 0.01
  },
  "survival": {
    x: 0.42,
    y: 0.74,
    label: "crash-landing-intro-popup",
    expectedOcrPattern: "SURVIVAL|CRASH\\s+LANDING|START",
    minChangedPixelRatio: 0.005
  },
  "virus-hunter": {
    x: 0.42,
    y: 0.74,
    label: "town-hall-bus-street-signs",
    expectedOcrPattern: "TOWN\\s*HALL|BUS|NEED\\s*A\\s*JOB"
  }
};

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

function applyVisibleQaDefaults(args) {
  const targetMonitor = String(args.targetMonitor || args.monitor || process.env.POPTROPICA_QA_MONITOR || "G32QC").trim();
  if (targetMonitor) {
    process.env.POPTROPICA_QA_MONITOR = targetMonitor;
  }
  if (flagEnabled(args.interaction) && !flagEnabled(args.allowMouseClicks) && !process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS) {
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

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function parseNumberOverrideMap(value) {
  const overrides = new Map();
  for (const entry of splitCsv(value)) {
    const match = entry.match(/^([^:=]+)[:=](\d+)$/u);
    if (!match) {
      continue;
    }
    overrides.set(match[1].trim().toLowerCase(), Number(match[2]));
  }
  return overrides;
}

function resolveIslandNumberOverride(args, entry, name, fallback) {
  const overrides = parseNumberOverrideMap(args[name] || "");
  if (!overrides.size) {
    return fallback;
  }
  const candidates = [
    entry.canonicalKey,
    entry.islandParam,
    entry.roomParam,
    entry.as3TargetScene
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  for (const candidate of candidates) {
    if (overrides.has(candidate)) {
      return overrides.get(candidate);
    }
  }
  return fallback;
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
    $_.CommandLine -notmatch 'Get-CimInstance Win32_Process' -and
    $_.CommandLine -notmatch 'Where-Object' -and
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
  const missing = lines.filter(isMissingRequestLine);
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

function isProxyUnavailable(launchHealth) {
  if (!launchHealth || Number(launchHealth.statusCode || 0) !== 0) {
    return false;
  }
  return /(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|proxy server is refusing connections)/iu.test(String(launchHealth.error || ""));
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

function captureWindowMatchesRuntime(capture, runtime) {
  const expectedPid = Number(runtime?.pid || 0);
  if (!expectedPid) {
    return true;
  }
  const actualPid = Number(capture?.window?.pid || 0);
  return actualPid === expectedPid;
}

function formatCapturePidMismatch(capture, runtime) {
  const expectedPid = Number(runtime?.pid || 0) || null;
  const actualPid = Number(capture?.window?.pid || 0) || null;
  const actualCmdline = Array.isArray(capture?.window?.cmdline)
    ? capture.window.cmdline.join(" ")
    : "";
  return {
    step: "capture-window-pid-mismatch",
    message: `Captured window pid ${actualPid || "unknown"} does not match launched runtime pid ${expectedPid || "unknown"}.`,
    status: null,
    stdout: "",
    stderr: "",
    expectedPid,
    actualPid,
    actualCmdline: actualCmdline.slice(0, 1000)
  };
}

function rejectMismatchedCapture(capture, runtime, qaErrors) {
  if (!capture || captureWindowMatchesRuntime(capture, runtime)) {
    return capture;
  }
  qaErrors.push(formatCapturePidMismatch(capture, runtime));
  return null;
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

function interactionTargetFor(entry, args) {
  const configured = AS3_INTERACTION_TARGETS[entry.canonicalKey] || {};
  const cliHasPoint = args.interactionX !== undefined ||
    args.interactionY !== undefined ||
    args.clickX !== undefined ||
    args.clickY !== undefined;
  const target = cliHasPoint
    ? {
        ...DEFAULT_INTERACTION_TARGET,
        label: "cli-override"
      }
    : {
        ...DEFAULT_INTERACTION_TARGET,
        ...configured
      };
  return {
    ...target,
    x: Number(args.interactionX || args.clickX || target.x),
    y: Number(args.interactionY || args.clickY || target.y),
    holdMs: args.interactionHoldMs !== undefined
      ? Number(args.interactionHoldMs)
      : args.clickHoldMs !== undefined
        ? Number(args.clickHoldMs)
        : Number(target.holdMs || 0),
    moveIntervalMs: args.interactionMoveIntervalMs !== undefined
      ? Number(args.interactionMoveIntervalMs)
      : args.clickMoveIntervalMs !== undefined
        ? Number(args.clickMoveIntervalMs)
        : Number(target.moveIntervalMs || 0),
    expectedOcrPattern: args.expectedInteractionOcr
      ? String(args.expectedInteractionOcr)
      : target.expectedOcrPattern || null,
    minChangedPixelRatio: args.minInteractionChangedPixelRatio !== undefined
      ? Number(args.minInteractionChangedPixelRatio)
      : target.minChangedPixelRatio ?? null
  };
}

function matchesExpectedOcr(text, pattern) {
  if (!pattern) {
    return null;
  }
  try {
    return new RegExp(pattern, "iu").test(String(text || ""));
  } catch (_error) {
    return new RegExp(escapeRegExp(pattern), "iu").test(String(text || ""));
  }
}

async function clickInteraction({ runDir, safeStem, runtime, runtimeWindow, capture, stage, initialScreenshotPath, target, args, qaErrors }) {
  const stageRect = stage?.stageRect;
  const logOffset = getFileSize(GAME_SERVER_LOG_PATH);
  const clickPath = path.join(runDir, `${safeStem}-interaction-click.json`);
  const windowPath = path.join(runDir, `${safeStem}-interaction-window.json`);
  const screenshotPath = path.join(runDir, `${safeStem}-interaction.png`);
  const captureMetadataPath = path.join(runDir, `${safeStem}-interaction-capture.json`);
  const stagePath = path.join(runDir, `${safeStem}-interaction-stage.json`);
  const ocrPath = path.join(runDir, `${safeStem}-interaction-ocr.json`);
  const diffPath = path.join(runDir, `${safeStem}-interaction-diff.json`);
  const logPath = path.join(runDir, `${safeStem}-interaction-server.log`);

  if (!runtimeWindow?.match?.handle || !capture || !stageRect) {
    return {
      ok: false,
      skipped: false,
      target,
      reason: "stage_or_window_missing",
      logPath,
      artifacts: {
        clickPath,
        windowPath,
        screenshotPath,
        captureMetadataPath,
        stagePath,
        ocrPath: flagEnabled(args.skipOcr) ? null : ocrPath,
        diffPath,
        logPath
      }
    };
  }

  const clickPoint = stageRelativeToWindow(capture, stageRect, {
    x: target.x,
    y: target.y
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
      String(clickPoint.x),
      "--y",
      String(clickPoint.y),
      "--output",
      clickPath
    ];
    if (Number(target.holdMs || 0) > 0) {
      clickArgs.push("--hold-ms", String(Math.round(Number(target.holdMs))));
    }
    if (Number(target.moveIntervalMs || 0) > 0) {
      clickArgs.push("--move-interval-ms", String(Math.round(Number(target.moveIntervalMs))));
    }
    if (runtime.pid) {
      clickArgs.push("--pid", String(runtime.pid));
    }
    const click = runPythonQa(clickArgs, {
      timeoutMs: 20000
    });

    const waitMs = Math.max(0, Number(args.interactionWaitMs || 2200));
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    const postWindow = runPythonQa(buildWaitArgs({
      runtime,
      timeoutMs: Number(args.recaptureWindowTimeoutMs || 10000),
      outputPath: windowPath
    }), {
      timeoutMs: Number(args.recaptureWindowTimeoutMs || 10000) + 5000
    });

    let postCapture = runPythonQa(buildCaptureArgs({
      handle: postWindow.match.handle,
      runtime,
      screenshotPath,
      captureMetadataPath
    }), {
      timeoutMs: 40000
    });
    postCapture = rejectMismatchedCapture(postCapture, runtime, qaErrors);

    let postStage = null;
    let postOcr = null;
    let visualDiff = null;
    let visualDiffError = null;
    if (postCapture && fs.existsSync(screenshotPath)) {
      postStage = runPythonQa([
        "analyze-stage",
        "--input",
        screenshotPath,
        "--output",
        stagePath
      ], {
        timeoutMs: 30000
      });
      if (!flagEnabled(args.skipOcr)) {
        postOcr = runPythonQa([
          "ocr-image",
          "--input",
          screenshotPath,
          "--output",
          ocrPath
        ], {
          timeoutMs: 120000
        });
      }
      if (initialScreenshotPath && fs.existsSync(initialScreenshotPath)) {
        try {
          visualDiff = runPythonQa([
            "compare-images",
            "--before",
            initialScreenshotPath,
            "--after",
            screenshotPath,
            "--threshold",
            String(args.interactionDiffThreshold || 20),
            "--output",
            diffPath
          ], {
            timeoutMs: 30000
          });
        } catch (error) {
          visualDiffError = String(error.message || error);
        }
      }
    }

    const segment = readLogSegment(GAME_SERVER_LOG_PATH, logOffset);
    fs.writeFileSync(logPath, segment, "utf8");
    const logSummary = summarizeLogSegment(segment);
    const stageStable = Boolean(postStage?.stageRect);
    const ocrText = String(postOcr?.text || "");
    const ocrMatched = matchesExpectedOcr(ocrText, target.expectedOcrPattern);
    const minChangedPixelRatio = Number(target.minChangedPixelRatio || 0);
    const changedPixelRatio = Number(visualDiff?.changedPixelRatio || 0);
    const visualChangeMatched = minChangedPixelRatio > 0
      ? changedPixelRatio >= minChangedPixelRatio
      : null;
    const evidenceChecks = [
      target.expectedOcrPattern
        ? {
            name: "expected_ocr",
            ok: Boolean(ocrMatched),
            pattern: target.expectedOcrPattern,
            observedText: ocrText.slice(0, 500)
          }
        : null,
      minChangedPixelRatio > 0
        ? {
            name: "min_changed_pixel_ratio",
            ok: Boolean(visualChangeMatched),
            expectedAtLeast: minChangedPixelRatio,
            observed: changedPixelRatio
          }
        : null
    ].filter(Boolean);
    const evidenceOk = evidenceChecks.length > 0
      ? evidenceChecks.every((check) => check.ok)
      : !flagEnabled(args.requireInteractionEvidence);
    const requiredEvidenceOk = !flagEnabled(args.requireInteractionEvidence) || evidenceOk;
    return {
      ok: stageStable && requiredEvidenceOk,
      skipped: false,
      target,
      clickPoint,
      click,
      runtimeWindow: postWindow,
      capture: postCapture,
      stage: postStage,
      ocr: postOcr
        ? {
            skipped: Boolean(postOcr.skipped),
            containsChinese: Boolean(postOcr.containsChinese),
            text: String(postOcr.text || "").slice(0, 500),
            lineCount: postOcr.lineCount || 0
          }
        : null,
      logSummary,
      visualDiff,
      visualDiffError,
      evidence: {
        required: flagEnabled(args.requireInteractionEvidence),
        ok: evidenceOk,
        checks: evidenceChecks
      },
      stageStable,
      reason: stageStable
        ? requiredEvidenceOk
          ? null
          : "interaction_evidence_missing"
        : "post_click_stage_missing",
      artifacts: {
        clickPath,
        windowPath,
        screenshotPath,
        captureMetadataPath,
        stagePath,
        ocrPath: flagEnabled(args.skipOcr) ? null : ocrPath,
        diffPath: visualDiff ? diffPath : null,
        logPath
      }
    };
  } catch (error) {
    const segment = readLogSegment(GAME_SERVER_LOG_PATH, logOffset);
    fs.writeFileSync(logPath, segment, "utf8");
    return {
      ok: false,
      skipped: false,
      target,
      clickPoint,
      reason: "interaction_click_or_recapture_failed",
      error: String(error.message || error),
      logSummary: summarizeLogSegment(segment),
      artifacts: {
        clickPath,
        windowPath,
        screenshotPath,
        captureMetadataPath,
        stagePath,
        ocrPath: flagEnabled(args.skipOcr) ? null : ocrPath,
        diffPath: null,
        logPath
      }
    };
  }
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
  const settleMs = resolveIslandNumberOverride(args, entry, "settleMsOverrides", Number(args.settleMs || 22000));
  const windowTimeoutMs = Number(args.windowTimeoutMs || 60000);

  await ensureFlashpointServices(config);
  await mountSourceZip(config, "as3");
  const logOffset = getFileSize(GAME_SERVER_LOG_PATH);
  clearPoptropicaFlashState({ reason: `qa-as3-island-smoke:${entry.canonicalKey}` });
  let launchHealth = null;
  launchHealth = await requestLaunchHealth(entry.launchUrl, args);

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

  const interaction = flagEnabled(args.interaction) && !flagEnabled(args.skipInteraction)
    ? await clickInteraction({
        runDir: islandDir,
        safeStem,
        runtime,
        runtimeWindow,
        capture,
        stage,
        initialScreenshotPath: screenshotPath,
        target: interactionTargetFor(entry, args),
        args,
        qaErrors
      })
    : { ok: true, skipped: true };

  const logSegment = readLogSegment(GAME_SERVER_LOG_PATH, logOffset);
  fs.writeFileSync(logSegmentPath, logSegment, "utf8");
  const logSummary = summarizeLogSegment(logSegment);
  const failedChecks = [];
  if (!runtimeWindow?.match) {
    failedChecks.push("window_not_found");
  }
  if (!isLaunchHealthOk(launchHealth)) {
    failedChecks.push("launch_health_failed");
    if (isProxyUnavailable(launchHealth)) {
      failedChecks.push("runtime_proxy_unavailable");
    }
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
  if (isLaunchHealthOk(launchHealth) && !flagEnabled(args.allowNoSceneProgress) && !hasSceneProgressSignal(logSummary)) {
    failedChecks.push("scene_progress_missing");
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
  if (!interaction.skipped && !interaction.ok) {
    failedChecks.push("interaction_click_failed");
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
    visibleQaDefaults: args.visibleQaDefaults || null,
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
    interaction,
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
    interactionsPassed: reports.filter((report) => report.interaction && !report.interaction.skipped && report.interaction.ok).length,
    interactionEvidencePassed: reports.filter((report) => report.interaction?.evidence?.ok).length,
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

function reportSortTime(reportPath, topLevelReport, islandReport) {
  const candidates = [
    islandReport?.generatedAt,
    topLevelReport?.generatedAt
  ];
  for (const candidate of candidates) {
    const time = Date.parse(candidate || "");
    if (Number.isFinite(time)) {
      return time;
    }
  }
  try {
    return fs.statSync(reportPath).mtimeMs;
  } catch (_error) {
    return 0;
  }
}

function isAggregateCandidateReport(topLevelReport) {
  return topLevelReport &&
    !topLevelReport.blocked &&
    !topLevelReport.fatal &&
    Array.isArray(topLevelReport.reports);
}

function isPassingIslandReport(report) {
  return Boolean(report?.canonicalKey) &&
    report.ok === true &&
    Array.isArray(report.failedChecks) &&
    report.failedChecks.length === 0;
}

function collectAggregateCandidates(qaDir) {
  const candidates = [];
  for (const fileName of fs.readdirSync(qaDir)) {
    if (!AS3_SMOKE_REPORT_RE.test(fileName)) {
      continue;
    }
    const reportPath = path.join(qaDir, fileName);
    const topLevelReport = readJsonIfExists(reportPath);
    if (!isAggregateCandidateReport(topLevelReport)) {
      continue;
    }
    for (const islandReport of topLevelReport.reports) {
      if (!isPassingIslandReport(islandReport)) {
        continue;
      }
      candidates.push({
        key: islandReport.canonicalKey,
        report: {
          ...islandReport,
          aggregateSource: {
            reportPath,
            reportFileName: fileName,
            reportGeneratedAt: topLevelReport.generatedAt || null
          }
        },
        sortTime: reportSortTime(reportPath, topLevelReport, islandReport)
      });
    }
  }
  return candidates;
}

function chooseAggregateReports({ expectedKeys, candidates, preferAudio }) {
  const byKey = new Map();
  for (const candidate of candidates) {
    if (!expectedKeys.has(candidate.key)) {
      continue;
    }
    const existing = byKey.get(candidate.key);
    if (!existing) {
      byKey.set(candidate.key, candidate);
      continue;
    }
    const candidateHasAudio = Boolean(candidate.report.audio?.active);
    const existingHasAudio = Boolean(existing.report.audio?.active);
    if (preferAudio && candidateHasAudio !== existingHasAudio) {
      if (candidateHasAudio) {
        byKey.set(candidate.key, candidate);
      }
      continue;
    }
    if (candidate.sortTime > existing.sortTime) {
      byKey.set(candidate.key, candidate);
    }
  }
  return [...expectedKeys].map((key) => byKey.get(key)).filter(Boolean);
}

function writeAggregateSmokeReport({ config, args, qaDir, startedAt }) {
  const manifest = generateLaunchManifest(config, { write: false });
  const expectedEntries = manifest.entries
    .filter((entry) => entry.sourceGroup === "as3" && entry.launchable && entry.launchMode === "as3-direct-scene")
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey, "en"));
  const expectedKeys = new Set(expectedEntries.map((entry) => entry.canonicalKey));
  const candidates = collectAggregateCandidates(qaDir);
  const chosen = chooseAggregateReports({
    expectedKeys,
    candidates,
    preferAudio: flagEnabled(args.aggregatePreferAudio)
  });
  const reports = chosen.map((candidate) => candidate.report);
  const presentKeys = new Set(reports.map((report) => report.canonicalKey));
  const missingKeys = [...expectedKeys].filter((key) => !presentKeys.has(key));
  const summary = buildSummary(startedAt, reports);
  const runToken = String(Date.now());
  const reportPath = path.join(qaDir, `as3-island-smoke-aggregate-${runToken}.json`);
  const latestPath = path.join(qaDir, "as3-island-smoke-latest.json");
  const report = {
    ...summary,
    ok: summary.ok && missingKeys.length === 0,
    aggregate: true,
    aggregateMode: "latest-passing-per-island",
    aggregatePreferAudio: flagEnabled(args.aggregatePreferAudio),
    expectedTotal: expectedEntries.length,
    expectedKeys: [...expectedKeys],
    missingKeys,
    candidateCount: candidates.length,
    artifactDir: qaDir,
    reports
  };
  if (missingKeys.length > 0) {
    report.failedChecks = ["aggregate_missing_expected_islands"];
  }
  writeJson(reportPath, report);
  if (!flagEnabled(args.noUpdateLatest)) {
    writeJson(latestPath, report);
  }
  return {
    ...report,
    reportPath,
    latestPath,
    latestUpdated: !flagEnabled(args.noUpdateLatest)
  };
}

function formatFatalError(error) {
  return {
    message: String(error?.message || error),
    stack: error?.stack ? String(error.stack).slice(0, 8000) : "",
    status: error?.status ?? null,
    stdout: error?.stdout ? String(error.stdout).slice(0, 2000) : "",
    stderr: error?.stderr ? String(error.stderr).slice(0, 4000) : ""
  };
}

function writeFatalSmokeReport({ reportPath, latestPath, startedAt, artifactDir, error, reports = [] }) {
  const summary = buildSummary(startedAt, reports);
  const report = {
    ...summary,
    ok: false,
    generatedAt: new Date().toISOString(),
    failed: Math.max(summary.failed, 1),
    failedChecks: ["as3_smoke_fatal_error"],
    fatal: true,
    artifactDir,
    reports,
    error: formatFatalError(error)
  };
  writeJson(reportPath, report);
  writeJson(latestPath, report);
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  args.visibleQaDefaults = applyVisibleQaDefaults(args);
  const config = loadConfig();
  const aggregateMode = flagEnabled(args.aggregateLatest) || flagEnabled(args.aggregate);
  const interactionMode = flagEnabled(args.interaction) && !flagEnabled(args.skipInteraction);
  const qaSubdir = aggregateMode ? "islands-smoke" : interactionMode ? "interaction-smoke" : "islands-smoke";
  const qaDir = ensureQaDir("as3", qaSubdir);
  const startedAt = new Date().toISOString();
  if (aggregateMode) {
    const report = writeAggregateSmokeReport({ config, args, qaDir, startedAt });
    printJson(report);
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
  const runToken = String(Date.now());
  const reportPrefix = interactionMode ? "as3-interaction-smoke" : "as3-island-smoke";
  const reportPath = path.join(qaDir, `${reportPrefix}-${runToken}.json`);
  const latestPath = path.join(qaDir, `${reportPrefix}-latest.json`);
  const runDir = ensureQaDir("as3", qaSubdir, `run-${runToken}`);
  const lockPath = path.join(qaDir, interactionMode ? ".qa-as3-interaction-smoke.lock" : AS3_SMOKE_LOCK_NAME);
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

  const reports = [];
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
    const manifest = generateLaunchManifest(config, { write: false });
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
  } catch (error) {
    stopNavigatorProcesses();
    const report = writeFatalSmokeReport({
      reportPath,
      latestPath,
      startedAt,
      artifactDir: runDir,
      error,
      reports
    });
    printJson({
      ...report,
      reportPath,
      latestPath
    });
    process.exitCode = 1;
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
