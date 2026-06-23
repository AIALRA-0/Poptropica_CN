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
const {
  resolveCliWindowGeometry,
  withWindowGeometryEnv
} = require("./lib/runtime-window-geometry");

const GAME_SERVER_LOG_PATH = path.join(paths.managedLogsDir, "flashpoint-game-server.log");
const AS2_INTERACTION_REPORT_RE = /^as2-interaction-smoke-\d+\.json$/u;
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

function containsCjkText(value) {
  return /[\u3400-\u9fff].*[\u3400-\u9fff]/u.test(String(value || ""));
}

function applyVisibleQaDefaults(args) {
  const targetMonitor = String(args.targetMonitor || args.monitor || process.env.POPTROPICA_QA_MONITOR || "G32QC").trim();
  if (targetMonitor) {
    process.env.POPTROPICA_QA_MONITOR = targetMonitor;
  }
  if (!flagEnabled(args.allowMouseClicks) && !process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS) {
    process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS = "1";
  }
  if (!flagEnabled(args.allowForegroundCapture) && !process.env.POPTROPICA_QA_NO_FOREGROUND) {
    process.env.POPTROPICA_QA_NO_FOREGROUND = "1";
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

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
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
  const popups = lines.filter((line) => /(?:content\/www\.poptropica\.com\/)?popups\/(?!map\.swf\b|travelmap\.swf\b)[^?\s]+\.swf\b/iu.test(line));
  const requests = lines.filter((line) => /(?:Request:|Response:|\[Zipfs\])/iu.test(line));
  return {
    lineCount: lines.length,
    missingCount: missing.length,
    soundRequestCount: sounds.length,
    sceneSwfRequestCount: sceneSwfs.length,
    mapRequestCount: maps.length,
    popupRequestCount: popups.length,
    missingSamples: missing.slice(0, 20),
    soundSamples: sounds.slice(0, 20),
    sceneSwfSamples: sceneSwfs.slice(-20),
    mapSamples: maps.slice(-20),
    popupSamples: popups.slice(-20),
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

function spawnRuntimeWithWindowGeometry(config, launchUrl, args = {}) {
  const geometry = resolveCliWindowGeometry(args, "as2");
  return withWindowGeometryEnv(geometry, () => spawnManagedRuntime(config, "as2", launchUrl, {
    detach: true,
    playerKey: String(args.playerKey || "flashpointnavigator-as2"),
    as2StartX: args.startX,
    as2StartY: args.startY,
    forceAs2CharState: flagEnabled(args.forceAs2CharState),
    useTemplateChar: flagEnabled(args.useTemplateChar || args["use-template-char"] || args.useAs2TemplateChar || args["use-as2-template-char"])
  }));
}

function appendWindowGeometryArgs(commandArgs, args = {}) {
  if (args.disableWindowGeometry) {
    return commandArgs;
  }
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

function buildKeyArgs({ runtime, runtimeWindow, key, outputPath, includePid = true, args = {} }) {
  const keyArgs = [
    "key-window",
    "--handle",
    String(runtimeWindow.match.handle),
    "--process-names",
    runtime.processNames.join(","),
    "--title-contains",
    "poptropica",
    "--key",
    key,
    "--output",
    outputPath
  ];
  if (includePid && runtime.pid) {
    keyArgs.push("--pid", String(runtime.pid));
  }
  return appendWindowGeometryArgs(keyArgs, args);
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

function runVisualGuard({ screenshotPath, outputPath, args, qaErrors, step }) {
  if (!screenshotPath || !fs.existsSync(screenshotPath) || flagEnabled(args.skipVisualGuard)) {
    return flagEnabled(args.skipVisualGuard) ? { skipped: true } : null;
  }
  const guardArgs = [
    "analyze-visual-guard",
    "--input",
    screenshotPath,
    "--output",
    outputPath,
    "--edge-ratio",
    String(args.visualGuardEdgeRatio || args["visual-guard-edge-ratio"] || 0.18),
    "--white-threshold",
    String(args.visualGuardWhiteThreshold || args["visual-guard-white-threshold"] || 245),
    "--max-white-edge-pct",
    String(args.visualGuardMaxWhiteEdgePct || args["visual-guard-max-white-edge-pct"] || 60),
    "--dark-threshold",
    String(args.visualGuardDarkThreshold || args["visual-guard-dark-threshold"] || 16),
    "--max-dark-edge-pct",
    String(args.visualGuardMaxDarkEdgePct || args["visual-guard-max-dark-edge-pct"] || 100)
  ];
  const targetColor = String(args.visualGuardTargetColor || args["visual-guard-target-color"] || "").trim();
  if (targetColor) {
    guardArgs.push(
      "--target-color",
      targetColor,
      "--target-tolerance",
      String(args.visualGuardTargetTolerance || args["visual-guard-target-tolerance"] || 8),
      "--max-target-edge-pct",
      String(args.visualGuardMaxTargetEdgePct || args["visual-guard-max-target-edge-pct"] || 5)
    );
  }
  try {
    return runPythonQa(guardArgs, {
      timeoutMs: 30000
    });
  } catch (error) {
    qaErrors.push(formatQaError(`${step || "visual"}-visual-guard`, error));
    return null;
  }
}

function shouldRequireVisualGuard(args) {
  return flagEnabled(args.requireVisualGuard) ||
    Boolean(String(args.visualGuardTargetColor || args["visual-guard-target-color"] || "").trim());
}

function shouldRequireHudAnchor(args) {
  return flagEnabled(args.requireHudAnchor || args["require-hud-anchor"]);
}

function resolveFlashpointQaAs2Dialog(args) {
  return String(
    args.flashpointQaAs2Dialog ||
    args["flashpoint-qa-as2-dialog"] ||
    args.as2QaDialog ||
    args["as2-qa-dialog"] ||
    ""
  ).trim();
}

function resolveFlashpointQaLoadingHoldMs(args) {
  return String(
    args.flashpointQaLoadingHoldMs ||
    args["flashpoint-qa-loading-hold-ms"] ||
    args.qaLoadingHoldMs ||
    args["qa-loading-hold-ms"] ||
    ""
  ).trim();
}

function resolveFlashpointQaHideHud(args) {
  return String(
    args.flashpointQaHideHud ||
    args["flashpoint-qa-hide-hud"] ||
    args.qaHideHud ||
    args["qa-hide-hud"] ||
    ""
  ).trim();
}

function resolveFlashpointQaAs2Popup(args) {
  return String(
    args.flashpointQaAs2Popup ||
    args["flashpoint-qa-as2-popup"] ||
    args.as2QaPopup ||
    args["as2-qa-popup"] ||
    args.qaPopup ||
    args["qa-popup"] ||
    ""
  ).trim();
}

function withLaunchQuery(url, args) {
  const roomOverride = String(args.roomOverride || args["room-override"] || "").trim();
  const islandOverride = String(args.islandOverride || args["island-override"] || "").trim();
  const autoOpenMapAfterMs = String(args.autoOpenMapAfterMs || args["auto-open-map-after-ms"] || "").trim();
  const flashpointQaAs2Dialog = resolveFlashpointQaAs2Dialog(args);
  const flashpointQaAs2Popup = resolveFlashpointQaAs2Popup(args);
  const flashpointQaLoadingHoldMs = resolveFlashpointQaLoadingHoldMs(args);
  const flashpointQaHideHud = resolveFlashpointQaHideHud(args);
  const shouldCacheBust = !flagEnabled(args.disableQaCacheBust || args["disable-qa-cache-bust"]);
  if (!shouldCacheBust && !autoOpenMapAfterMs && !roomOverride && !islandOverride && !flashpointQaAs2Dialog && !flashpointQaAs2Popup && !flashpointQaLoadingHoldMs && !flashpointQaHideHud) {
    return url;
  }
  const nextUrl = new URL(url);
  if (roomOverride) {
    nextUrl.searchParams.set("room", roomOverride);
  }
  if (islandOverride) {
    nextUrl.searchParams.set("island", islandOverride);
  }
  if (autoOpenMapAfterMs) {
    nextUrl.searchParams.set("flashpoint_auto_open_map_after_ms", autoOpenMapAfterMs);
  }
  if (flashpointQaAs2Dialog) {
    nextUrl.searchParams.set("flashpointQaAs2Dialog", flashpointQaAs2Dialog);
  }
  if (flashpointQaAs2Popup) {
    nextUrl.searchParams.set("flashpointQaAs2Popup", flashpointQaAs2Popup);
  }
  if (flashpointQaLoadingHoldMs) {
    nextUrl.searchParams.set("flashpointQaLoadingHoldMs", flashpointQaLoadingHoldMs);
  }
  if (flashpointQaHideHud) {
    nextUrl.searchParams.set("flashpointQaHideHud", flashpointQaHideHud);
  }
  if (shouldCacheBust) {
    nextUrl.searchParams.set("flashpointQaCacheBust", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }
  return nextUrl.toString();
}

function summarizeAutoDialogueCapture(initial, args) {
  const text = String(initial?.ocr?.text || "");
  const containsChinese = containsCjkText(text);
  const requireChinese = flagEnabled(args.requireDialogueChinese || args["require-dialogue-chinese"]);
  const expectedText = String(args.dialogueExpectedText || args["dialogue-expected-text"] || "").trim();
  const containsExpectedText = expectedText ? text.includes(expectedText) : true;
  const stageStable = Boolean(initial?.stage?.stageRect);
  return {
    ok: stageStable && (!requireChinese || containsChinese) && containsExpectedText,
    skipped: false,
    trigger: "flashpointQaAs2Dialog",
    requestedDialog: resolveFlashpointQaAs2Dialog(args),
    containsChinese,
    requireChinese,
    expectedText: expectedText || null,
    containsExpectedText,
    textSample: text.slice(0, 1000),
    artifacts: initial?.artifacts || {},
    reason: stageStable
      ? expectedText && !containsExpectedText
        ? "dialogue_expected_text_not_seen"
        : requireChinese && !containsChinese
          ? "dialogue_chinese_not_seen"
          : null
      : "initial_stage_missing"
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
  if (mode === "client") {
    const captureBox = capture?.captureBox || {};
    const windowRect = capture?.targetWindow?.rect || capture?.window?.rect || {};
    const dx = Number(captureBox.left) - Number(windowRect.left);
    const dy = Number(captureBox.top) - Number(windowRect.top);
    return {
      x: Number.isFinite(dx) ? Math.round(dx) : 0,
      y: Number.isFinite(dy) ? Math.round(dy) : 0
    };
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

function summarizeF11SizeCheck(captureResult, runtimeWindow, args) {
  const imageSize = captureResult?.capture?.imageSize || captureResult?.imageSize || null;
  const monitorRect = runtimeWindow?.placement?.monitor?.rect || runtimeWindow?.placement?.monitor?.workArea || null;
  const ratioValue = Number(args.f11MinMonitorRatio || args["f11-min-monitor-ratio"] || 0.8);
  const minRatio = Number.isFinite(ratioValue) && ratioValue > 0 ? ratioValue : 0.8;
  const configuredMinWidth = Number(args.f11MinWidth || args["f11-min-width"] || 0);
  const configuredMinHeight = Number(args.f11MinHeight || args["f11-min-height"] || 0);
  const monitorWidth = Number(monitorRect?.width || 0);
  const monitorHeight = Number(monitorRect?.height || 0);
  const minWidth = Number.isFinite(configuredMinWidth) && configuredMinWidth > 0
    ? Math.round(configuredMinWidth)
    : Math.round((monitorWidth || 1920) * minRatio);
  const minHeight = Number.isFinite(configuredMinHeight) && configuredMinHeight > 0
    ? Math.round(configuredMinHeight)
    : Math.round((monitorHeight || 1080) * minRatio);
  const width = Number(imageSize?.width || 0);
  const height = Number(imageSize?.height || 0);
  return {
    ok: width >= minWidth && height >= minHeight,
    imageSize,
    monitorRect,
    minRatio,
    minWidth,
    minHeight
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

function captureAndAnalyze({ runDir, stem, suffix, runtime, runtimeWindow, qaErrors, args, useWindowGeometry = true }) {
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
  const visualGuardPath = path.join(runDir, `${stem}${safeSuffix}-visual-guard.json`);
  const ocrPath = path.join(runDir, `${stem}${safeSuffix}-ocr.json`);
  let capture = null;
  let stage = null;
  let visualGuard = null;
  let ocr = null;
  try {
    capture = runPythonQa(buildCaptureArgs({
      handle: runtimeWindow.match.handle,
      runtime,
      screenshotPath,
      metadataPath,
      args: useWindowGeometry ? args : { ...args, disableWindowGeometry: true }
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
    visualGuard = runVisualGuard({
      screenshotPath,
      outputPath: visualGuardPath,
      args,
      qaErrors,
      step: suffix || "initial"
    });
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
    visualGuard,
    ocr,
    artifacts: {
      screenshotPath,
      metadataPath,
      stagePath,
      visualGuardPath: flagEnabled(args.skipVisualGuard) ? null : visualGuardPath,
      ocrPath: flagEnabled(args.skipOcr) ? null : ocrPath
    }
  };
}

async function captureHudAnchor({ config, runDir, entry, stem, initial, args, qaErrors }) {
  if (!shouldRequireHudAnchor(args)) {
    return { skipped: true, ok: true };
  }
  if (!initial?.artifacts?.screenshotPath || !initial?.artifacts?.stagePath) {
    return { skipped: false, ok: false, reason: "initial_artifacts_missing" };
  }

  const hiddenStem = `${stem}-hud-hidden`;
  const windowPath = path.join(runDir, `${hiddenStem}-window.json`);
  const analysisPath = path.join(runDir, `${stem}-hud-anchor.json`);
  const annotatedPath = path.join(runDir, `${stem}-hud-anchor.png`);
  const hiddenArgs = {
    ...args,
    qaHideHud: "1",
    flashpointQaHideHud: "1",
    skipVisualGuard: true,
    skipOcr: false
  };
  const hiddenUrl = withLaunchQuery(entry.launchUrl, hiddenArgs);
  const windowTimeoutMs = Number(args.hudBaselineWindowTimeoutMs || args["hud-baseline-window-timeout-ms"] || args.windowTimeoutMs || 45000);
  const settleMs = Number(args.hudBaselineSettleMs || args["hud-baseline-settle-ms"] || args.settleMs || 9000);

  try {
    const launchHealth = await requestLaunchHealth(hiddenUrl, args);
    const runtime = spawnRuntimeWithWindowGeometry(config, hiddenUrl, args);
    const runtimeWindow = runPythonQa(buildWaitArgs({
      runtime,
      timeoutMs: windowTimeoutMs,
      outputPath: windowPath,
      args
    }), {
      timeoutMs: windowTimeoutMs + 5000
    });
    let hidden = null;
    const maxHiddenAttempts = Math.max(1, Number(args.hudBaselineAttempts || args["hud-baseline-attempts"] || 3));
    for (let attempt = 0; attempt < maxHiddenAttempts; attempt += 1) {
      await sleep(attempt === 0 ? settleMs : Number(args.hudBaselineRetrySettleMs || args["hud-baseline-retry-settle-ms"] || 3000));
      hidden = captureAndAnalyze({
        runDir,
        stem: hiddenStem,
        suffix: "initial",
        runtime,
        runtimeWindow,
        qaErrors,
        args: hiddenArgs
      });
      const hiddenText = String(hidden?.ocr?.text || "");
      if (!/\b(LOADING|STARTING)\b/iu.test(hiddenText)) {
        break;
      }
    }
    const analysis = runPythonQa([
      "analyze-hud-diff",
      "--input",
      initial.artifacts.screenshotPath,
      "--baseline",
      hidden.artifacts.screenshotPath,
      "--stage-json",
      initial.artifacts.stagePath,
      "--output",
      analysisPath,
      "--annotated-output",
      annotatedPath,
      "--min-hud-components",
      String(args.as2HudMinComponents || args["as2-hud-min-components"] || 3),
      "--min-right-margin",
      String(args.as2HudMinRightMargin || args["as2-hud-min-right-margin"] || 8),
      "--max-right-margin",
      String(args.as2HudMaxRightMargin || args["as2-hud-max-right-margin"] || 96),
      "--min-top-margin",
      String(args.as2HudMinTopMargin || args["as2-hud-min-top-margin"] || 0),
      "--max-top-margin",
      String(args.as2HudMaxTopMargin || args["as2-hud-max-top-margin"] || 36),
      "--max-row-spread",
      String(args.as2HudMaxRowSpread || args["as2-hud-max-row-spread"] || 10),
      "--max-hud-width-ratio",
      String(args.as2HudMaxWidthRatio || args["as2-hud-max-width-ratio"] || 0.24),
      "--min-icon-gap",
      String(args.as2HudMinIconGap || args["as2-hud-min-icon-gap"] || 10),
      "--max-icon-gap",
      String(args.as2HudMaxIconGap || args["as2-hud-max-icon-gap"] || 56)
    ], {
      timeoutMs: 30000
    });
    return {
      skipped: false,
      ok: Boolean(analysis?.ok),
      launchHealth: summarizeLaunchHealth(launchHealth),
      runtime: {
        pid: runtime.pid || null,
        processNames: runtime.processNames || []
      },
      runtimeWindow,
      hidden: {
        capture: hidden.capture,
        stage: hidden.stage,
        artifacts: hidden.artifacts
      },
      analysis,
      artifacts: {
        windowPath,
        hiddenScreenshotPath: hidden.artifacts.screenshotPath || null,
        hiddenStagePath: hidden.artifacts.stagePath || null,
        analysisPath,
        annotatedPath
      }
    };
  } catch (error) {
    qaErrors.push(formatQaError(`${stem}-hud-anchor`, error));
    return {
      skipped: false,
      ok: false,
      reason: "hud_anchor_failed",
      artifacts: {
        windowPath,
        analysisPath,
        annotatedPath
      },
      error: String(error.message || error)
    };
  }
}

function parseSampleMs(value) {
  const text = String(value || "").trim();
  if (!text) {
    return [];
  }
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Math.max(0, Math.round(Number(item))))
    .filter((item) => Number.isFinite(item))
    .sort((left, right) => left - right);
}

function analyzeLoadingScreenshot({ screenshotPath, runDir, stem, qaErrors, args }) {
  const loadingVisualPath = path.join(runDir, `${stem}-loading-visual.json`);
  const ocrPath = path.join(runDir, `${stem}-loading-ocr.json`);
  let loadingVisual = null;
  let ocr = null;
  try {
    loadingVisual = runPythonQa([
      "analyze-loading-center",
      "--input",
      screenshotPath,
      "--output",
      loadingVisualPath
    ], {
      timeoutMs: 30000
    });
  } catch (error) {
    qaErrors.push(formatQaError(`${stem}-analyze-loading-center`, error));
  }
  if (!flagEnabled(args.skipLoadingOcr || args["skip-loading-ocr"])) {
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
      qaErrors.push(formatQaError(`${stem}-loading-ocr-image`, error));
    }
  }
  return {
    loadingVisualPath,
    loadingVisual,
    ocrPath: flagEnabled(args.skipLoadingOcr || args["skip-loading-ocr"]) ? null : ocrPath,
    ocr
  };
}

function captureLoadingSequence({ runDir, stem, runtime, runtimeWindow, qaErrors, args }) {
  const sampleMs = parseSampleMs(args.loadingSampleMs || args["loading-sample-ms"]);
  if (!sampleMs.length) {
    return {
      skipped: true,
      observed: false,
      centerOk: true,
      detectedSamples: [],
      samples: []
    };
  }
  if (!runtimeWindow?.match?.handle) {
    return {
      skipped: false,
      observed: false,
      centerOk: false,
      reason: "window_missing",
      detectedSamples: [],
      samples: []
    };
  }
  const sequenceDir = path.join(runDir, `${stem}-loading-sequence`);
  const metadataPath = path.join(runDir, `${stem}-loading-sequence.json`);
  let sequence = null;
  try {
    const sequenceArgs = [
      "capture-window-sequence",
      "--handle",
      String(runtimeWindow.match.handle),
      "--process-names",
      runtime.processNames.join(","),
      "--title-contains",
      "poptropica",
      "--output-dir",
      sequenceDir,
      "--stem",
      `${stem}-loading`,
      "--sample-ms",
      sampleMs.join(","),
      "--metadata-output",
      metadataPath,
      "--client-only",
      "--no-foreground"
    ];
    if (runtime.pid) {
      sequenceArgs.push("--pid", String(runtime.pid));
    }
    sequence = runPythonQa(sequenceArgs, {
      timeoutMs: Math.max(60000, Math.max(...sampleMs, 0) + 45000)
    });
  } catch (error) {
    qaErrors.push(formatQaError(`${stem}-loading-sequence`, error));
    return {
      skipped: false,
      observed: false,
      centerOk: false,
      metadataPath,
      sequenceDir,
      detectedSamples: [],
      samples: []
    };
  }
  const samples = (sequence?.samples || []).map((sample) => {
    const analysis = analyzeLoadingScreenshot({
      screenshotPath: sample.savedTo,
      runDir,
      stem: `${stem}-loading-${sample.delayMs}`,
      qaErrors,
      args
    });
    const loadingCenter = loadingCenterEvidence({
      imageSize: sample.imageSize,
      loadingVisual: analysis.loadingVisual,
      ocr: analysis.ocr
    });
    return {
      delayMs: sample.delayMs,
      capturedAtMs: sample.capturedAtMs,
      screenshotPath: sample.savedTo,
      imageSize: sample.imageSize,
      loadingVisualPath: analysis.loadingVisualPath,
      ocrPath: analysis.ocrPath,
      ocrText: String(analysis.ocr?.text || "").slice(0, 300),
      loadingCenter
    };
  });
  const detectedSamples = samples.filter((sample) => sample.loadingCenter?.detected);
  const maxOffsetRatio = Number(args.maxLoadingOffsetRatio || args["max-loading-offset-ratio"] || 0.12);
  const centerOk = detectedSamples.length > 0 && detectedSamples.every((sample) =>
    Math.abs(Number(sample.loadingCenter.offset?.xRatio || 0)) <= maxOffsetRatio &&
    Math.abs(Number(sample.loadingCenter.offset?.yRatio || 0)) <= maxOffsetRatio
  );
  return {
    skipped: false,
    observed: detectedSamples.length > 0,
    centerOk,
    metadataPath,
    sequenceDir,
    detectedSamples,
    samples
  };
}

async function pressF11BeforeLoading({ runDir, stem, runtime, runtimeWindow, qaErrors, args }) {
  if (!flagEnabled(args.f11BeforeLoading || args["f11-before-loading"])) {
    return { skipped: true, ok: true };
  }
  if (!runtimeWindow?.match?.handle) {
    return { skipped: false, ok: false, reason: "window_missing" };
  }
  const keyPath = path.join(runDir, `${stem}-f11-before-loading-key.json`);
  try {
    const key = runPythonQa(buildKeyArgs({
      runtime,
      runtimeWindow,
      key: "VK_F11",
      outputPath: keyPath,
      args: { ...args, disableWindowGeometry: true }
    }), {
      timeoutMs: 30000
    });
    await sleep(Number(args.f11BeforeLoadingSettleMs || args["f11-before-loading-settle-ms"] || 250));
    return {
      skipped: false,
      ok: Boolean(key?.ok),
      keyPath,
      key
    };
  } catch (error) {
    qaErrors.push(formatQaError(`${stem}-f11-before-loading`, error));
    return {
      skipped: false,
      ok: false,
      keyPath,
      reason: "f11_before_loading_failed",
      error: String(error.message || error)
    };
  }
}

function loadingCenterEvidence(sample) {
  const visual = sample?.loadingVisual || null;
  if (visual?.detected) {
    return {
      detected: true,
      source: "visual-dark-logo",
      box: visual.box || null,
      imageSize: visual.imageSize || sample.imageSize || null,
      offset: visual.offset || null,
      darkPct: visual.darkPct,
      featurePixels: visual.featurePixels
    };
  }
  const image = sample?.imageSize || null;
  const lines = sample?.ocr?.lines || [];
  const text = String(sample?.ocr?.text || "");
  if (!image || !lines.length || !/\b(?:LOADING|STARTING)\b/iu.test(text)) {
    return { detected: false, reason: "not_loading_visual_or_ocr" };
  }
  const boxes = lines
    .filter((line) => /\b(?:POPTROPICA|LOADING|STARTING)\b/iu.test(String(line.text || "")))
    .map((line) => line.box)
    .filter(Boolean);
  if (!boxes.length) {
    return { detected: false, reason: "not_loading_visual_or_ocr" };
  }
  const left = Math.min(...boxes.map((box) => Number(box.left)));
  const right = Math.max(...boxes.map((box) => Number(box.right)));
  const top = Math.min(...boxes.map((box) => Number(box.top)));
  const bottom = Math.max(...boxes.map((box) => Number(box.bottom)));
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const dx = centerX - Number(image.width || 0) / 2;
  const dy = centerY - Number(image.height || 0) / 2;
  return {
    detected: true,
    source: "ocr",
    box: {
      left: Math.round(left),
      top: Math.round(top),
      right: Math.round(right),
      bottom: Math.round(bottom),
      width: Math.round(right - left),
      height: Math.round(bottom - top),
      centerX: Math.round(centerX),
      centerY: Math.round(centerY)
    },
    imageSize: image,
    offset: {
      x: Math.round(dx),
      y: Math.round(dy),
      xRatio: Number((dx / Math.max(1, Number(image.width || 1))).toFixed(4)),
      yRatio: Number((dy / Math.max(1, Number(image.height || 1))).toFixed(4))
    }
  };
}

async function captureF11({ runDir, stem, runtime, runtimeWindow, qaErrors, args }) {
  if (!flagEnabled(args.tryF11 || args["try-f11"] || args.requireF11 || args["require-f11"])) {
    return { skipped: true, ok: true };
  }
  if (!runtimeWindow?.match?.handle) {
    return { skipped: false, ok: false, reason: "window_missing" };
  }
  const keyPath = path.join(runDir, `${stem}-f11-key.json`);
  const restoreKeyPath = path.join(runDir, `${stem}-f11-restore-key.json`);
  try {
    const key = runPythonQa(buildKeyArgs({
      runtime,
      runtimeWindow,
      key: "VK_F11",
      outputPath: keyPath,
      args: { ...args, disableWindowGeometry: true }
    }), {
      timeoutMs: 30000
    });
    await sleep(Number(args.f11SettleMs || args["f11-settle-ms"] || 9000));
    const capture = captureAndAnalyze({
      runDir,
      stem,
      suffix: "f11",
      runtime,
      runtimeWindow,
      qaErrors,
      args,
      useWindowGeometry: false
    });
    const stageStable = Boolean(capture.stage?.stageRect);
    const visualStable = !shouldRequireVisualGuard(args) || Boolean(capture.visualGuard?.ok);
    const fullscreenSize = summarizeF11SizeCheck(capture.capture, runtimeWindow, args);
    const restore = runPythonQa(buildKeyArgs({
      runtime,
      runtimeWindow,
      key: "VK_F11",
      outputPath: restoreKeyPath,
      args: { ...args, disableWindowGeometry: true }
    }), {
      timeoutMs: 30000
    });
    await sleep(Number(args.f11RestoreSettleMs || args["f11-restore-settle-ms"] || 1200));
    return {
      skipped: false,
      ok: stageStable && visualStable && fullscreenSize.ok,
      keyPath,
      restoreKeyPath,
      keyOk: Boolean(key?.ok),
      restoreOk: Boolean(restore?.ok),
      fullscreenSize,
      capture: {
        screenshotPath: capture.artifacts.screenshotPath || null,
        capturePath: capture.artifacts.metadataPath || null,
        stagePath: capture.artifacts.stagePath || null,
        visualGuardPath: capture.artifacts.visualGuardPath || null,
        ocrPath: capture.artifacts.ocrPath || null,
        imageSize: capture.capture?.imageSize || null,
        stageRect: capture.stage?.stageRect || null,
        stageCoverageRatio: capture.stage?.stageCoverageRatio ?? null,
        visualGuard: capture.visualGuard,
        ocrText: String(capture.ocr?.text || "").slice(0, 500)
      },
      stageStable,
      visualStable
    };
  } catch (error) {
    qaErrors.push(formatQaError(`${stem}-f11`, error));
    return {
      skipped: false,
      ok: false,
      keyPath,
      restoreKeyPath,
      reason: "f11_failed",
      error: String(error.message || error)
    };
  }
}

function mapClickPointFromHudAnchor(capture, hudAnchor) {
  const components = hudAnchor?.analysis?.hudComponents || [];
  const sourceImage = hudAnchor?.analysis?.imageSize || null;
  const targetImage = capture?.imageSize || null;
  const mapComponent = components.length ? components[components.length - 1] : null;
  if (!mapComponent || !sourceImage?.width || !sourceImage?.height || !targetImage?.width || !targetImage?.height) {
    return null;
  }
  const offset = captureClickOffset(capture);
  const scaleX = Number(targetImage.width || 0) / Number(sourceImage.width || 1);
  const scaleY = Number(targetImage.height || 0) / Number(sourceImage.height || 1);
  return {
    x: Math.round(offset.x + (Number(mapComponent.centerX || 0) * scaleX)),
    y: Math.round(offset.y + (Number(mapComponent.centerY || 0) * scaleY)),
    source: "hud-anchor-last-component",
    component: mapComponent
  };
}

function clickMap({ runDir, stem, runtime, runtimeWindow, capture, stage, hudAnchor, args, qaErrors }) {
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
  const explicitMapPoint = args.mapX !== undefined || args["map-x"] !== undefined || args.mapY !== undefined || args["map-y"] !== undefined;
  const anchoredPoint = explicitMapPoint ? null : mapClickPointFromHudAnchor(capture, hudAnchor);
  const point = anchoredPoint || stageRelativeToWindow(capture, stageRect, {
    x: Number(args.mapX || args["map-x"] || 0.945),
    y: Number(args.mapY || args["map-y"] || 0.052)
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
    if (flagEnabled(args.clickLargestChild || args["click-largest-child"]) || process.env.POPTROPICA_QA_CLICK_LARGEST_CHILD === "1") {
      clickArgs.push("--largest-child");
    }
    const clickChildClass = String(args.clickChildClass || args["click-child-class"] || "").trim();
    if (clickChildClass) {
      clickArgs.push("--child-class-contains", clickChildClass);
    }
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
      clickPointSource: point.source || "stage-relative",
      clickPath,
      windowPath: postWindowPath,
      logPath,
      runtimeWindow: postWindow,
      capture: postCapture.capture,
      stage: postCapture.stage,
      visualGuard: postCapture.visualGuard,
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
      clickPointSource: point.source || "stage-relative",
      clickPath,
      logPath,
      mapRequestSeen: Number(summarizeLogSegment(segment).mapRequestCount || 0) > 0,
      reason: "map_click_or_recapture_failed",
      error: String(error.message || error)
    };
  }
}

function explicitPopupClosePointProvided(args) {
  return args.popupCloseX !== undefined ||
    args["popup-close-x"] !== undefined ||
    args.popupCloseY !== undefined ||
    args["popup-close-y"] !== undefined;
}

function analyzePopupCloseButton({ runDir, stem, suffix, capture, args, qaErrors }) {
  const screenshotPath = capture?.savedTo || capture?.screenshotPath || "";
  if (!screenshotPath || !fs.existsSync(screenshotPath)) {
    return {
      ok: false,
      skipped: false,
      reason: "popup_close_screenshot_missing",
      screenshotPath
    };
  }
  const outputPath = path.join(runDir, `${stem}-${suffix}-close-button.json`);
  const annotatedPath = path.join(runDir, `${stem}-${suffix}-close-button.png`);
  try {
    return runPythonQa([
      "analyze-popup-close-button",
      "--input",
      screenshotPath,
      "--output",
      outputPath,
      "--annotated-output",
      annotatedPath,
      "--no-fail-exit"
    ], {
      timeoutMs: Number(args.popupCloseDetectTimeoutMs || args["popup-close-detect-timeout-ms"] || 30000)
    });
  } catch (error) {
    qaErrors.push(formatQaError(`popup-close-button-${suffix}`, error));
    return {
      ok: false,
      skipped: false,
      reason: "popup_close_button_detection_failed",
      screenshotPath,
      outputPath,
      annotatedPath,
      error: String(error.message || error)
    };
  }
}

function clickPopupClose({ runDir, stem, runtime, runtimeWindow, capture, args, qaErrors }) {
  const clickPath = path.join(runDir, `${stem}-popup-close-click.json`);
  const postWindowPath = path.join(runDir, `${stem}-popup-close-window.json`);
  if (!runtimeWindow?.match?.handle || !capture) {
    return {
      ok: false,
      skipped: false,
      reason: "window_or_capture_missing",
      clickPath
    };
  }
  const imageWidth = Number(capture.imageSize?.width || capture.captureBox?.width || 0);
  const imageHeight = Number(capture.imageSize?.height || capture.captureBox?.height || 0);
  const clickOffset = captureClickOffset(capture);
  const hasExplicitPoint = explicitPopupClosePointProvided(args);
  const preCloseButton = hasExplicitPoint
    ? { ok: false, skipped: true, reason: "explicit_close_point" }
    : analyzePopupCloseButton({ runDir, stem, suffix: "popup-open", capture, args, qaErrors });
  const point = preCloseButton?.ok && preCloseButton.button
    ? {
        x: Math.round(clickOffset.x + Number(preCloseButton.button.centerX)),
        y: Math.round(clickOffset.y + Number(preCloseButton.button.centerY)),
        source: "detected-close-button",
        detectedButton: preCloseButton.button
      }
    : {
        x: Math.round(clickOffset.x + Number(args.popupCloseX || args["popup-close-x"] || imageWidth * Number(args.popupCloseXRatio || args["popup-close-x-ratio"] || 0.785))),
        y: Math.round(clickOffset.y + Number(args.popupCloseY || args["popup-close-y"] || imageHeight * Number(args.popupCloseYRatio || args["popup-close-y-ratio"] || 0.135))),
        source: hasExplicitPoint ? "explicit" : "capture-ratio-fallback"
      };
  try {
    const closeLogOffset = fs.existsSync(GAME_SERVER_LOG_PATH) ? fs.statSync(GAME_SERVER_LOG_PATH).size : 0;
    const clickCount = Math.max(1, Number.parseInt(String(args.popupCloseClicks || args["popup-close-clicks"] || 1), 10) || 1);
    const waitMs = Math.max(0, Number(args.popupCloseWaitMs || args["popup-close-wait-ms"] || 1800));
    const clickPaths = [];
    for (let clickIndex = 0; clickIndex < clickCount; clickIndex += 1) {
      const indexedClickPath = clickCount === 1
        ? clickPath
        : path.join(runDir, `${stem}-popup-close-click-${clickIndex + 1}.json`);
      clickPaths.push(indexedClickPath);
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
        indexedClickPath
      ];
      if (runtime.pid) {
        clickArgs.push("--pid", String(runtime.pid));
      }
      appendWindowGeometryArgs(clickArgs, args);
      if (flagEnabled(args.clickLargestChild || args["click-largest-child"]) || process.env.POPTROPICA_QA_CLICK_LARGEST_CHILD === "1") {
        clickArgs.push("--largest-child");
      }
      const clickChildClass = String(args.clickChildClass || args["click-child-class"] || "").trim();
      if (clickChildClass) {
        clickArgs.push("--child-class-contains", clickChildClass);
      }
      runPythonQa(clickArgs, {
        timeoutMs: 20000
      });
      if (waitMs > 0) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
      }
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
      suffix: "popup-close",
      runtime,
      runtimeWindow: postWindow,
      qaErrors,
      args: { ...args, skipOcr: true }
    });
    const stageStable = Boolean(postCapture.stage?.stageRect);
    const closeLogSegment = readLogSegment(GAME_SERVER_LOG_PATH, closeLogOffset);
    const closeLogPath = path.join(runDir, `${stem}-popup-close-server.log`);
    fs.writeFileSync(closeLogPath, closeLogSegment, "utf8");
    const closeLogSummary = summarizeLogSegment(closeLogSegment);
    const postCloseButton = analyzePopupCloseButton({
      runDir,
      stem,
      suffix: "popup-after-close",
      capture: postCapture.capture,
      args,
      qaErrors
    });
    const closeButtonStillVisible = Boolean(postCloseButton?.ok && postCloseButton.button);
    const mapOpenedDuringClose = Number(closeLogSummary.mapRequestCount || 0) > 0;
    const allowMapRequest = flagEnabled(args.allowPopupCloseMapRequest || args["allow-popup-close-map-request"]);
    const closedCleanly = stageStable && !closeButtonStillVisible && (allowMapRequest || !mapOpenedDuringClose);
    return {
      ok: closedCleanly,
      skipped: false,
      clickPoint: point,
      clickPath,
      clickPaths,
      clickCount,
      preCloseButton,
      postCloseButton,
      closeButtonStillVisible,
      mapOpenedDuringClose,
      closeLogPath,
      closeLogSummary,
      windowPath: postWindowPath,
      runtimeWindow: postWindow,
      capture: postCapture.capture,
      stage: postCapture.stage,
      visualGuard: postCapture.visualGuard,
      artifacts: postCapture.artifacts,
      stageStable,
      reason: !stageStable
        ? "post_close_stage_missing"
        : closeButtonStillVisible
        ? "popup_close_button_still_visible"
        : mapOpenedDuringClose && !allowMapRequest
        ? "popup_close_opened_map"
        : null
    };
  } catch (error) {
    qaErrors.push(formatQaError("popup-close-click", error));
    return {
      ok: false,
      skipped: false,
      clickPoint: point,
      clickPath,
      reason: "popup_close_click_or_recapture_failed",
      error: String(error.message || error)
    };
  }
}

function clickDialogue({ runDir, stem, runtime, runtimeWindow, capture, stage, args, qaErrors }) {
  const stageRect = stage?.stageRect;
  const clickPath = path.join(runDir, `${stem}-dialogue-click.json`);
  const postWindowPath = path.join(runDir, `${stem}-dialogue-window.json`);
  if (!runtimeWindow?.match?.handle || !capture || !stageRect) {
    return {
      ok: false,
      skipped: false,
      reason: "stage_or_window_missing"
    };
  }
  const point = stageRelativeToWindow(capture, stageRect, {
    x: Number(args.dialogueX || args["dialogue-x"] || 0.72),
    y: Number(args.dialogueY || args["dialogue-y"] || 0.72)
  });
  const secondPoint = stageRelativeToWindow(capture, stageRect, {
    x: Number(args.dialogueSecondX || args["dialogue-second-x"] || args.dialogueX || args["dialogue-x"] || 0.72),
    y: Number(args.dialogueSecondY || args["dialogue-second-y"] || args.dialogueY || args["dialogue-y"] || 0.72)
  });
  try {
    const buildClickArgs = (clickPoint, outputPath = clickPath) => {
      const builtArgs = [
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
        outputPath
      ];
      const hoverMs = Number(args.dialogueHoverMs || args["dialogue-hover-ms"] || 0);
      const holdMs = Number(args.dialogueHoldMs || args["dialogue-hold-ms"] || 0);
      if (Number.isFinite(hoverMs) && hoverMs > 0) {
        builtArgs.push("--hover-ms", String(Math.round(hoverMs)));
      }
      if (Number.isFinite(holdMs) && holdMs > 0) {
        builtArgs.push("--hold-ms", String(Math.round(holdMs)));
      }
      if (runtime.pid) {
        builtArgs.push("--pid", String(runtime.pid));
      }
      appendWindowGeometryArgs(builtArgs, args);
      if (flagEnabled(args.clickLargestChild || args["click-largest-child"]) || process.env.POPTROPICA_QA_CLICK_LARGEST_CHILD === "1") {
        builtArgs.push("--largest-child");
      }
      const clickChildClass = String(args.clickChildClass || args["click-child-class"] || "").trim();
      if (clickChildClass) {
        builtArgs.push("--child-class-contains", clickChildClass);
      }
      return builtArgs;
    };
    const clickArgs = buildClickArgs(point);
    runPythonQa(clickArgs, {
      timeoutMs: 20000
    });
    const secondClick = flagEnabled(args.dialogueSecondClick || args["dialogue-second-click"]);
    const preSecondWaitMs = Math.max(0, Number(args.dialoguePreSecondWaitMs || args["dialogue-pre-second-wait-ms"] || 0));
    if (secondClick) {
      if (preSecondWaitMs > 0) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, preSecondWaitMs);
      }
      runPythonQa(buildClickArgs(secondPoint, path.join(runDir, `${stem}-dialogue-second-click.json`)), {
        timeoutMs: 20000
      });
    }
    const waitMs = Math.max(0, Number(args.dialogueWaitMs || args["dialogue-wait-ms"] || 2500));
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
      suffix: "dialogue",
      runtime,
      runtimeWindow: postWindow,
      qaErrors,
      args
    });
    const text = String(postCapture.ocr?.text || "");
    const containsChinese = containsCjkText(text);
    const requireChinese = flagEnabled(args.requireDialogueChinese || args["require-dialogue-chinese"]);
    const stageStable = Boolean(postCapture.stage?.stageRect);
    return {
      ok: stageStable && (!requireChinese || containsChinese),
      skipped: false,
      clickPoint: point,
      secondClickPoint: secondClick ? secondPoint : null,
      secondClick,
      preSecondWaitMs,
      clickPath,
      windowPath: postWindowPath,
      runtimeWindow: postWindow,
      capture: postCapture.capture,
      stage: postCapture.stage,
      visualGuard: postCapture.visualGuard,
      ocr: postCapture.ocr,
      artifacts: postCapture.artifacts,
      containsChinese,
      ocrText: text.slice(0, 500),
      stageStable,
      reason: stageStable
        ? requireChinese && !containsChinese
          ? "dialogue_chinese_not_seen"
          : null
        : "post_click_stage_missing"
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      clickPoint: point,
      clickPath,
      reason: "dialogue_click_or_recapture_failed",
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
  const launchUrl = withLaunchQuery(entry.launchUrl, args);
  const effectiveEntry = {
    ...entry,
    roomParam: String(args.roomOverride || args["room-override"] || entry.roomParam || "").trim(),
    islandParam: String(args.islandOverride || args["island-override"] || entry.islandParam || "").trim()
  };
  const launchHealth = await requestLaunchHealth(launchUrl, args);
  const runtime = spawnRuntimeWithWindowGeometry(config, launchUrl, args);

  let runtimeWindow = null;
  try {
    runtimeWindow = runPythonQa(buildWaitArgs({ runtime, timeoutMs: windowTimeoutMs, outputPath: windowPath, args }), {
      timeoutMs: windowTimeoutMs + 5000
    });
  } catch (error) {
    qaErrors.push(formatQaError("wait-window", error));
  }

  const preLoadingF11 = await pressF11BeforeLoading({
    runDir,
    stem,
    runtime,
    runtimeWindow,
    qaErrors,
    args
  });

  const loading = captureLoadingSequence({
    runDir,
    stem,
    runtime,
    runtimeWindow,
    qaErrors,
    args
  });

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
        "--respect-session-mute",
        "--output",
        audioPath
      ], {
        timeoutMs: Number(args.audioTimeoutMs || 30000)
      });

  const dialogue = resolveFlashpointQaAs2Dialog(args)
    ? summarizeAutoDialogueCapture(initial, args)
    : flagEnabled(args.dialogueClick || args["dialogue-click"])
    ? clickDialogue({
        runDir,
        stem,
        runtime,
        runtimeWindow: initial.runtimeWindow || runtimeWindow,
        capture: initial.capture,
        stage: initial.stage,
        args,
        qaErrors
      })
    : { ok: true, skipped: true, containsChinese: false };

  const popupClose = flagEnabled(args.popupCloseClick || args["popup-close-click"])
    ? clickPopupClose({
        runDir,
        stem,
        runtime,
        runtimeWindow: initial.runtimeWindow || runtimeWindow,
        capture: initial.capture,
        args,
        qaErrors
      })
    : { ok: true, skipped: true };

  const f11 = await captureF11({
    runDir,
    stem,
    runtime,
    runtimeWindow: initial.runtimeWindow || runtimeWindow,
    qaErrors,
    args
  });

  const postF11ForMap = !f11.skipped
    ? captureAndAnalyze({
        runDir,
        stem,
        suffix: "post-f11",
        runtime,
        runtimeWindow: initial.runtimeWindow || runtimeWindow,
        qaErrors,
        args: { ...args, skipOcr: true }
      })
    : null;
  const usePostF11ForMap = flagEnabled(args.mapAfterF11 || args["map-after-f11"]);
  const mapSource = usePostF11ForMap && postF11ForMap?.capture && postF11ForMap?.stage?.stageRect ? postF11ForMap : initial;

  const map = flagEnabled(args.skipMapClick)
    ? { ok: true, skipped: true, mapRequestSeen: false }
    : clickMap({
        runDir,
        stem,
        runtime,
        runtimeWindow: initial.runtimeWindow || runtimeWindow,
        capture: mapSource.capture,
        stage: mapSource.stage,
        hudAnchor: null,
        args,
        qaErrors
      });

  const logSegment = readLogSegment(GAME_SERVER_LOG_PATH, logOffset);
  fs.writeFileSync(logPath, logSegment, "utf8");
  const logSummary = summarizeLogSegment(logSegment);
  const sceneEvidence = buildAs2SceneEvidence(effectiveEntry, logSegment, args);
  const hudAnchor = await captureHudAnchor({
    config,
    runDir,
    entry,
    stem,
    initial,
    args,
    qaErrors
  });
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
  if (shouldRequireVisualGuard(args) && !initial.visualGuard?.ok) {
    failedChecks.push("initial_visual_guard_failed");
  }
  if (shouldFailOnMissingRequests(args) && Number(logSummary.missingCount || 0) > 0) {
    failedChecks.push("missing_requests_seen");
  }
  if (flagEnabled(args.requireSceneEvidence) && !sceneEvidence.ok) {
    failedChecks.push("scene_evidence_missing");
  }
  if (flagEnabled(args.requirePopupRequest || args["require-popup-request"]) && Number(logSummary.popupRequestCount || 0) <= 0) {
    failedChecks.push("popup_request_not_seen");
  }
  if (flagEnabled(args.requireAudio) && !audio?.audioLikelyActive) {
    failedChecks.push("audio_inactive");
  }
  if (flagEnabled(args.requireLoading || args["require-loading"]) && !loading.observed) {
    failedChecks.push("loading_sample_not_captured");
  }
  if (!loading.skipped && loading.observed && !loading.centerOk) {
    failedChecks.push("loading_center_offset_failed");
  }
  if (!preLoadingF11.skipped && flagEnabled(args.requireF11BeforeLoading || args["require-f11-before-loading"]) && !preLoadingF11.ok) {
    failedChecks.push("f11_before_loading_failed");
  }
  if (!dialogue.skipped && !dialogue.ok) {
    failedChecks.push("dialogue_click_failed");
  }
  if (!dialogue.skipped && flagEnabled(args.requireDialogueChinese || args["require-dialogue-chinese"]) && !dialogue.containsChinese) {
    failedChecks.push("dialogue_chinese_not_seen");
  }
  if (!f11.skipped && flagEnabled(args.requireF11 || args["require-f11"]) && !f11.ok) {
    failedChecks.push("f11_fullscreen_size_or_visual_guard_failed");
  }
  if (!map.skipped && !map.ok) {
    failedChecks.push("map_post_message_click_failed");
  }
  if (!map.skipped && flagEnabled(args.requireMapRequest) && !map.mapRequestSeen) {
    failedChecks.push("map_request_not_seen");
  }
  if (!map.skipped && shouldRequireVisualGuard(args) && !map.visualGuard?.ok) {
    failedChecks.push("map_visual_guard_failed");
  }
  if (!hudAnchor.skipped && shouldRequireHudAnchor(args) && !hudAnchor.ok) {
    failedChecks.push("hud_anchor_failed");
  }
  if (!popupClose.skipped && flagEnabled(args.requirePopupClose || args["require-popup-close"]) && !popupClose.ok) {
    failedChecks.push("popup_close_failed");
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
    islandParam: effectiveEntry.islandParam,
    roomParam: effectiveEntry.roomParam,
    sceneFolder: entry.sceneFolder,
    launchUrl,
    launchHealth: summarizeLaunchHealth(launchHealth),
    visibleQaDefaults: args.visibleQaDefaults || null,
    runtime: {
      playerKey: runtime.playerKey,
      pid: runtime.pid || null,
      processNames: runtime.processNames,
      flashState: runtime.flashState || null
    },
    artifacts: {
      windowPath,
      initialScreenshotPath: initial.artifacts.screenshotPath || null,
      initialStagePath: initial.artifacts.stagePath || null,
      initialVisualGuardPath: initial.artifacts.visualGuardPath || null,
      popupCloseScreenshotPath: popupClose.artifacts?.screenshotPath || null,
      popupCloseStagePath: popupClose.artifacts?.stagePath || null,
      hudAnchorPath: hudAnchor.artifacts?.analysisPath || null,
      hudAnchorAnnotatedPath: hudAnchor.artifacts?.annotatedPath || null,
      audioPath: flagEnabled(args.skipAudio) ? null : audioPath,
      logSegmentPath: logPath
    },
    runtimeWindow,
    preLoadingF11,
    initial: {
      capture: initial.capture,
      stage: initial.stage,
      visualGuard: initial.visualGuard,
      ocr: initial.ocr
        ? {
            skipped: Boolean(initial.ocr.skipped),
            text: String(initial.ocr.text || "").slice(0, 500),
            lineCount: initial.ocr.lineCount || 0
          }
        : null
    },
    loading,
    audio: {
      skipped: Boolean(audio?.skipped),
      active: Boolean(audio?.audioLikelyActive),
      rms: audio?.loopback?.rms ?? null,
      peak: audio?.loopback?.peak ?? null,
      sessionCount: audio?.sessionCount ?? null
    },
    dialogue,
    popupClose,
    f11,
    map,
    hudAnchor,
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
    loadingCenterPassed: reports.filter((report) => report.loading && !report.loading.skipped && report.loading.observed && report.loading.centerOk).length,
    f11Passed: reports.filter((report) => report.f11 && !report.f11.skipped && report.f11.ok).length,
    visualGuardPassed: reports.filter((report) =>
      report.initial?.visualGuard?.ok &&
      (report.map?.skipped || report.map?.visualGuard?.ok)
    ).length,
    hudAnchorPassed: reports.filter((report) => report.hudAnchor && !report.hudAnchor.skipped && report.hudAnchor.ok).length,
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

function hasMapEvidence(report) {
  return Boolean(report?.map && !report.map.skipped && report.map.ok && report.map.mapRequestSeen);
}

function hasSceneEvidence(report) {
  return Boolean(report?.sceneEvidence?.ok);
}

function hasVisualGuardEvidence(report) {
  return Boolean(report?.initial?.visualGuard?.ok && (report.map?.skipped || report.map?.visualGuard?.ok));
}

function collectAggregateCandidates(qaDir) {
  const candidates = [];
  for (const fileName of fs.readdirSync(qaDir)) {
    if (!AS2_INTERACTION_REPORT_RE.test(fileName)) {
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

function preferCandidate(candidate, existing, args) {
  const checks = [
    {
      enabled: flagEnabled(args.aggregatePreferAudio),
      get: (item) => Boolean(item.report.audio?.active)
    },
    {
      enabled: flagEnabled(args.aggregatePreferMap),
      get: (item) => hasMapEvidence(item.report)
    },
    {
      enabled: flagEnabled(args.aggregatePreferSceneEvidence),
      get: (item) => hasSceneEvidence(item.report)
    },
    {
      enabled: flagEnabled(args.aggregatePreferVisualGuard),
      get: (item) => hasVisualGuardEvidence(item.report)
    }
  ];
  for (const check of checks) {
    if (!check.enabled) {
      continue;
    }
    const candidateHasEvidence = check.get(candidate);
    const existingHasEvidence = check.get(existing);
    if (candidateHasEvidence !== existingHasEvidence) {
      return candidateHasEvidence;
    }
  }
  return candidate.sortTime > existing.sortTime;
}

function chooseAggregateReports({ expectedKeys, candidates, args }) {
  const byKey = new Map();
  for (const candidate of candidates) {
    if (!expectedKeys.has(candidate.key)) {
      continue;
    }
    const existing = byKey.get(candidate.key);
    if (!existing || preferCandidate(candidate, existing, args)) {
      byKey.set(candidate.key, candidate);
    }
  }
  return [...expectedKeys].map((key) => byKey.get(key)).filter(Boolean);
}

function writeAggregateSmokeReport({ config, args, qaDir, startedAt }) {
  const manifest = generateLaunchManifest(config, { write: false });
  const expectedEntries = manifest.entries
    .filter((entry) => entry.sourceGroup === "as2" && entry.launchable)
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey, "en"));
  const expectedKeys = new Set(expectedEntries.map((entry) => entry.canonicalKey));
  const candidates = collectAggregateCandidates(qaDir);
  const chosen = chooseAggregateReports({
    expectedKeys,
    candidates,
    args
  });
  const reports = chosen.map((candidate) => candidate.report);
  const presentKeys = new Set(reports.map((report) => report.canonicalKey));
  const missingKeys = [...expectedKeys].filter((key) => !presentKeys.has(key));
  const summary = buildSummary(startedAt, reports);
  const runToken = String(Date.now());
  const reportPath = path.join(qaDir, `as2-interaction-smoke-aggregate-${runToken}.json`);
  const latestPath = path.join(qaDir, "as2-interaction-smoke-latest.json");
  const report = {
    ...summary,
    ok: summary.ok && missingKeys.length === 0,
    aggregate: true,
    aggregateMode: "latest-passing-per-island",
    aggregatePreferAudio: flagEnabled(args.aggregatePreferAudio),
    aggregatePreferMap: flagEnabled(args.aggregatePreferMap),
    aggregatePreferSceneEvidence: flagEnabled(args.aggregatePreferSceneEvidence),
    aggregatePreferVisualGuard: flagEnabled(args.aggregatePreferVisualGuard),
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

function formatAggregateStdout(report) {
  return {
    ok: report.ok,
    generatedAt: report.generatedAt,
    total: report.total,
    passed: report.passed,
    failed: report.failed,
    audioActive: report.audioActive,
    mapClicksPassed: report.mapClicksPassed,
    sceneEvidencePassed: report.sceneEvidencePassed,
    loadingCenterPassed: report.loadingCenterPassed,
    f11Passed: report.f11Passed,
    visualGuardPassed: report.visualGuardPassed,
    withMissingLogRequests: report.withMissingLogRequests,
    failedKeys: report.failedKeys,
    aggregate: report.aggregate,
    aggregateMode: report.aggregateMode,
    aggregatePreferAudio: report.aggregatePreferAudio,
    aggregatePreferMap: report.aggregatePreferMap,
    aggregatePreferSceneEvidence: report.aggregatePreferSceneEvidence,
    aggregatePreferVisualGuard: report.aggregatePreferVisualGuard,
    expectedTotal: report.expectedTotal,
    missingKeys: report.missingKeys,
    candidateCount: report.candidateCount,
    reportPath: report.reportPath,
    latestPath: report.latestPath,
    latestUpdated: report.latestUpdated
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  args.visibleQaDefaults = applyVisibleQaDefaults(args);
  const config = loadConfig();
  const qaDir = ensureQaDir("as2", "interaction-smoke");
  const startedAt = new Date().toISOString();
  const aggregateMode = flagEnabled(args.aggregateLatest) || flagEnabled(args.aggregate);
  if (aggregateMode) {
    const report = writeAggregateSmokeReport({ config, args, qaDir, startedAt });
    printJson(formatAggregateStdout(report));
    if (!report.ok) {
      process.exitCode = 1;
    }
    return;
  }
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
        if (!flagEnabled(args.preserveRuntime || args["preserve-runtime"])) {
          stopNavigatorProcesses();
        }
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
    if (!flagEnabled(args.preserveRuntime || args["preserve-runtime"])) {
      stopNavigatorProcesses();
    }
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
