const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { acquireQaLock, ensureQaDir, runPythonQa } = require("./lib/qa");
const { generateLaunchManifest } = require("./lib/launch-manifest");
const { buildAs3DirectSceneUrl } = require("./lib/as3-direct-wrapper");
const { readJson, writeJson } = require("./lib/fs-utils");
const paths = require("./lib/paths");
const {
  ensureFlashpointServices,
  ensureManagedWorkspace,
  mountSourceZip,
  proxyRequest,
  spawnManagedRuntime,
  stopNavigatorProcesses
} = require("./lib/flashpoint-runtime");

const CHILD_CLASS = "GeckoFPSandboxChildWindow";
const DEFAULT_LOADING_TARGETS = {
  "poptropicon": {
    scene: "game.scenes.con1.parking.Parking",
    seedIsland: "con1",
    startX: 1740,
    startY: 1430,
    startDirection: "right",
    qaAutoScene: "center"
  },
  "timmy-failure": {
    scene: "game.scenes.timmy.mainStreet.MainStreet",
    seedIsland: "timmy",
    seedEvents: ["intro_complete"],
    startX: 545,
    startY: 1460,
    startDirection: "right"
  }
};
const DEFAULT_SAMPLE_MS = [
  0,
  1000,
  2000,
  3000,
  4000,
  5000,
  6000,
  7000,
  8000,
  9000,
  10000,
  12000,
  14000,
  16000,
  18000
];

function arg(args, camelName, kebabName, fallback = undefined) {
  return args[camelName] ?? args[kebabName] ?? fallback;
}

function flagEnabled(value) {
  return /^(1|true|yes|y)$/iu.test(String(value || ""));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function numberArg(args, camelName, kebabName, fallback) {
  const value = Number(arg(args, camelName, kebabName, fallback));
  return Number.isFinite(value) ? value : fallback;
}

function parseSize(value, fallback) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d+)x(\d+)$/iu);
  if (!match) {
    return fallback;
  }
  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
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

function splitCsv(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstArg(args, names, fallback = "") {
  for (const name of names) {
    if (args[name] !== undefined && args[name] !== null && args[name] !== "") {
      return args[name];
    }
  }
  return fallback;
}

function cmdlineFragmentForLaunchUrl(launchUrl) {
  try {
    const parsed = new URL(launchUrl);
    const overrideScene = parsed.searchParams.get("overrideScene");
    if (overrideScene) {
      return overrideScene;
    }
    const room = parsed.searchParams.get("room");
    if (room) {
      return room;
    }
    return parsed.pathname || launchUrl;
  } catch (_error) {
    return String(launchUrl || "");
  }
}

function runtimeCmdlineContains(runtime) {
  return String(runtime?.cmdlineContains || runtime?.launchUrl || "").trim();
}

function resolveLaunchTarget({ config, args, autoSceneDelayMs, loadingHoldMs }) {
  const selectedKeys = splitCsv(firstArg(args, ["islands", "island"], ""));
  const explicitKey = String(firstArg(args, ["canonicalKey", "canonical-key"], "")).trim();
  const explicitScene = String(firstArg(args, [
    "overrideScene",
    "override-scene",
    "directScene",
    "direct-scene",
    "scene"
  ], "")).trim();
  const canonicalKey = selectedKeys[0] || explicitKey || (explicitScene ? "custom" : "poptropicon");
  const manifest = generateLaunchManifest(config, { write: false });
  const entry = manifest.entries.find((candidate) => candidate.canonicalKey === canonicalKey) || null;
  const defaults = DEFAULT_LOADING_TARGETS[canonicalKey] || {};
  const scene = explicitScene || defaults.scene || entry?.as3TargetScene || "";
  if (!scene) {
    throw new Error(`No AS3 scene target resolved for ${canonicalKey}. Pass --override-scene.`);
  }

  const qaAutoScene = String(firstArg(args, ["qaAutoScene", "qa-auto-scene", "flashpointQaAutoScene", "flashpoint-qa-auto-scene"], defaults.qaAutoScene || "")).trim();
  const qaAutoSceneDelayArg = firstArg(args, [
    "qaAutoSceneDelayMs",
    "qa-auto-scene-delay-ms",
    "flashpointQaAutoSceneDelayMs",
    "flashpoint-qa-auto-scene-delay-ms"
  ], qaAutoScene ? autoSceneDelayMs : "");

  const options = {
    reloadOnResize: firstArg(args, ["resizeReloadMode", "resize-reload-mode"], defaults.resizeReloadMode || "frame"),
    seedIsland: firstArg(args, ["seedIsland", "seed-island"], defaults.seedIsland || entry?.seedIsland || entry?.islandParam || ""),
    seedEvents: firstArg(args, ["seedEvents", "seed-events"], defaults.seedEvents || ""),
    startX: firstArg(args, ["startX", "start-x"], defaults.startX ?? ""),
    startY: firstArg(args, ["startY", "start-y"], defaults.startY ?? ""),
    startDirection: firstArg(args, ["startDirection", "start-direction"], defaults.startDirection || ""),
    qaAutoScene,
    qaAutoSceneDelayMs: qaAutoSceneDelayArg,
    qaLoadingHoldMs: loadingHoldMs
  };
  const launchUrl = buildAs3DirectSceneUrl(scene, options);
  return {
    canonicalKey,
    entry,
    scene,
    launchUrl,
    options
  };
}

function configureQaDefaults(args, size) {
  const monitor = String(arg(args, "monitor", "monitor", process.env.POPTROPICA_QA_MONITOR || "G32QC") || "").trim();
  const postMessageF11 = flagEnabled(arg(args, "postMessageF11", "post-message-f11", ""));
  if (monitor) {
    process.env.POPTROPICA_QA_MONITOR = monitor;
  }
  process.env.POPTROPICA_QA_NO_FOREGROUND = "1";
  process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS = "1";
  process.env.POPTROPICA_QA_MUTE_RUNTIME = "1";
  process.env.POPTROPICA_QA_MUTE_SECONDS = String(Math.max(3600, Number(process.env.POPTROPICA_QA_MUTE_SECONDS || 43200)));
  process.env.POPTROPICA_WINDOW_WIDTH = String(size.width);
  process.env.POPTROPICA_WINDOW_HEIGHT = String(size.height);
  return {
    monitor: monitor || null,
    noForegroundCapture: true,
    postMessageKeys: true,
    postMessageF11,
    muteRuntime: true,
    size
  };
}

function windowArgs({ runtime, outputPath, size = null, timeoutMs = 60000, maximize = false }) {
  const args = [
    "wait-window",
    "--process-names",
    runtime.processNames.join(","),
    "--title-contains",
    "poptropica",
    "--pid",
    String(runtime.pid),
    "--timeout-ms",
    String(timeoutMs),
    "--poll-ms",
    "250",
    "--output",
    outputPath
  ];
  if (size) {
    args.push("--window-width", String(size.width), "--window-height", String(size.height));
  }
  if (maximize) {
    args.push("--maximize");
  }
  const cmdlineContains = runtimeCmdlineContains(runtime);
  if (cmdlineContains) {
    args.push("--cmdline-contains", cmdlineContains);
  }
  return args;
}

function captureWindowArgs({ runtime, windowInfo, screenshotPath, metadataPath }) {
  const args = [
    "capture-window",
    "--handle",
    String(windowInfo.match.handle),
    "--process-names",
    runtime.processNames.join(","),
    "--title-contains",
    "poptropica",
    "--pid",
    String(runtime.pid),
    "--output",
    screenshotPath,
    "--metadata-output",
    metadataPath,
    "--client-only",
    "--child-class-contains",
    CHILD_CLASS
  ];
  const cmdlineContains = runtimeCmdlineContains(runtime);
  if (cmdlineContains) {
    args.push("--cmdline-contains", cmdlineContains);
  }
  return args;
}

function visualGuardArgs({ screenshotPath, outputPath }) {
  return [
    "analyze-visual-guard",
    "--input",
    screenshotPath,
    "--output",
    outputPath,
    "--edge-ratio",
    "0.18",
    "--white-threshold",
    "245",
    "--max-white-edge-pct",
    "60",
    "--dark-threshold",
    "16",
    "--max-dark-edge-pct",
    "45",
    "--target-color",
    "139ffd",
    "--target-tolerance",
    "8",
    "--max-target-edge-pct",
    "55"
  ];
}

function keyWindow({ runtime, windowInfo, key, outputPath, postMessage = false }) {
  const previousKeyboardEvents = process.env.POPTROPICA_QA_KEYBOARD_EVENTS;
  if (postMessage) {
    delete process.env.POPTROPICA_QA_KEYBOARD_EVENTS;
  } else {
    process.env.POPTROPICA_QA_KEYBOARD_EVENTS = "1";
  }
  try {
    const commandArgs = [
      "key-window",
      "--handle",
      String(windowInfo.match.handle),
      "--process-names",
      runtime.processNames.join(","),
      "--title-contains",
      "poptropica",
      "--pid",
      String(runtime.pid),
      "--key",
      key,
      "--output",
      outputPath
    ];
    const cmdlineContains = runtimeCmdlineContains(runtime);
    if (cmdlineContains) {
      commandArgs.push("--cmdline-contains", cmdlineContains);
    }
    if (postMessage) {
      commandArgs.push("--post-message");
    }
    return runPythonQa(commandArgs, { timeoutMs: 30000 });
  } finally {
    if (previousKeyboardEvents === undefined) {
      delete process.env.POPTROPICA_QA_KEYBOARD_EVENTS;
    } else {
      process.env.POPTROPICA_QA_KEYBOARD_EVENTS = previousKeyboardEvents;
    }
  }
}

function analyzeScreenshot({ screenshotPath, stem, runDir, qaErrors }) {
  const stagePath = path.join(runDir, `${stem}-stage.json`);
  const visualPath = path.join(runDir, `${stem}-visual.json`);
  const loadingVisualPath = path.join(runDir, `${stem}-loading-visual.json`);
  const ocrPath = path.join(runDir, `${stem}-ocr.json`);
  let stage = null;
  let visual = null;
  let loadingVisual = null;
  let ocr = null;
  try {
    stage = runPythonQa([
      "analyze-stage",
      "--input",
      screenshotPath,
      "--output",
      stagePath
    ], { timeoutMs: 30000 });
  } catch (error) {
    qaErrors.push({ step: `${stem}:analyze-stage`, message: String(error.message || error) });
  }
  try {
    visual = runPythonQa(visualGuardArgs({ screenshotPath, outputPath: visualPath }), { timeoutMs: 30000 });
  } catch (error) {
    qaErrors.push({ step: `${stem}:visual-guard`, message: String(error.message || error) });
  }
  try {
    loadingVisual = runPythonQa([
      "analyze-loading-center",
      "--input",
      screenshotPath,
      "--output",
      loadingVisualPath
    ], { timeoutMs: 30000 });
  } catch (error) {
    qaErrors.push({ step: `${stem}:analyze-loading-center`, message: String(error.message || error) });
  }
  try {
    ocr = runPythonQa([
      "ocr-image",
      "--input",
      screenshotPath,
      "--output",
      ocrPath
    ], { timeoutMs: 120000 });
  } catch (error) {
    qaErrors.push({ step: `${stem}:ocr-image`, message: String(error.message || error) });
  }
  return {
    stagePath,
    visualPath,
    loadingVisualPath,
    ocrPath,
    stage,
    visual,
    loadingVisual,
    ocr
  };
}

function captureAndAnalyze({ runtime, windowInfo, stem, runDir, qaErrors, skipAnalysis = false }) {
  const screenshotPath = path.join(runDir, `${stem}.png`);
  const metadataPath = path.join(runDir, `${stem}-capture.json`);
  let capture = null;
  try {
    capture = runPythonQa(captureWindowArgs({
      runtime,
      windowInfo,
      screenshotPath,
      metadataPath
    }), { timeoutMs: 45000 });
  } catch (error) {
    qaErrors.push({ step: `${stem}:capture-window`, message: String(error.message || error) });
  }
  const analysis = capture && !skipAnalysis ? analyzeScreenshot({ screenshotPath, stem, runDir, qaErrors }) : {};
  return {
    screenshotPath,
    metadataPath,
    capture,
    ...analysis
  };
}

function captureSequence({ runtime, windowInfo, runDir, sampleMs, qaErrors, sequenceName = "f11-loading" }) {
  const sequenceDir = path.join(runDir, `${sequenceName}-sequence`);
  const metadataPath = path.join(runDir, `${sequenceName}-sequence.json`);
  let sequence = null;
  try {
    const commandArgs = [
      "capture-window-sequence",
      "--handle",
      String(windowInfo.match.handle),
      "--process-names",
      runtime.processNames.join(","),
      "--title-contains",
      "poptropica",
      "--pid",
      String(runtime.pid),
      "--output-dir",
      sequenceDir,
      "--stem",
      sequenceName,
      "--sample-ms",
      sampleMs.join(","),
      "--metadata-output",
      metadataPath,
      "--client-only",
      "--child-class-contains",
      CHILD_CLASS,
      "--no-foreground"
    ];
    const cmdlineContains = runtimeCmdlineContains(runtime);
    if (cmdlineContains) {
      commandArgs.push("--cmdline-contains", cmdlineContains);
    }
    sequence = runPythonQa(commandArgs, { timeoutMs: Math.max(60000, Math.max(...sampleMs, 0) + 45000) });
  } catch (error) {
    qaErrors.push({ step: `${sequenceName}-sequence:capture-window-sequence`, message: String(error.message || error) });
    return {
      metadataPath,
      sequenceDir,
      samples: []
    };
  }

  const samples = (sequence?.samples || []).map((sample) => {
    const stem = `${sequenceName}-${sample.delayMs}`;
    const analysis = analyzeScreenshot({
      screenshotPath: sample.savedTo,
      stem,
      runDir,
      qaErrors
    });
    const combined = {
      ...sample,
      capture: {
        imageSize: sample.imageSize
      },
      ...analysis
    };
    combined.loadingCenter = loadingCenterEvidence(combined);
    return combined;
  });

  return {
    metadataPath,
    sequenceDir,
    sequence,
    samples
  };
}

function centeredBoxEvidence({ image, boxes, source, text = "", extra = {} }) {
  const validBoxes = boxes.filter(Boolean);
  if (!image || !validBoxes.length) {
    return null;
  }
  const left = Math.min(...validBoxes.map((box) => Number(box.left)));
  const right = Math.max(...validBoxes.map((box) => Number(box.right)));
  const top = Math.min(...validBoxes.map((box) => Number(box.top)));
  const bottom = Math.max(...validBoxes.map((box) => Number(box.bottom)));
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const imageCenterX = Number(image.width || 0) / 2;
  const imageCenterY = Number(image.height || 0) / 2;
  const dx = centerX - imageCenterX;
  const dy = centerY - imageCenterY;
  return {
    detected: true,
    source,
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
    },
    text: String(text || "").slice(0, 300),
    ...extra
  };
}

function visualLogoEvidence(image, loadingVisual, text = "") {
  if (!loadingVisual?.detected) {
    return null;
  }
  return centeredBoxEvidence({
    image: loadingVisual.imageSize || image,
    boxes: [loadingVisual.box],
    source: "visual-dark-logo",
    text,
    extra: {
      darkPct: loadingVisual.darkPct,
      featurePixels: loadingVisual.featurePixels
    }
  });
}

function centralPoptropicaLogoEvidence(image, lines, text) {
  const width = Number(image?.width || 0);
  const height = Number(image?.height || 0);
  if (!width || !height) {
    return null;
  }
  const candidates = (lines || []).filter((line) => {
    const box = line?.box;
    if (!box || !/\bPOPTROPICA\b/iu.test(String(line.text || ""))) {
      return false;
    }
    const boxWidth = Number(box.width || Number(box.right) - Number(box.left));
    const boxHeight = Number(box.height || Number(box.bottom) - Number(box.top));
    const centerX = Number(box.centerX || (Number(box.left) + Number(box.right)) / 2);
    const centerY = Number(box.centerY || (Number(box.top) + Number(box.bottom)) / 2);
    return boxWidth >= width * 0.14 &&
      boxHeight >= height * 0.04 &&
      centerX >= width * 0.28 &&
      centerX <= width * 0.72 &&
      centerY >= height * 0.22 &&
      centerY <= height * 0.68;
  });
  if (!candidates.length) {
    return null;
  }
  return centeredBoxEvidence({
    image,
    boxes: candidates.map((line) => line.box),
    source: "ocr-central-poptropica-logo",
    text
  });
}

function loadingCenterEvidence(sample) {
  const image = sample?.capture?.imageSize || null;
  const lines = sample?.ocr?.lines || [];
  if (!image || !lines.length) {
    const visualEvidence = visualLogoEvidence(image, sample?.loadingVisual);
    if (visualEvidence) {
      return visualEvidence;
    }
    return { detected: false, reason: "no_ocr_or_image_size" };
  }
  const text = String(sample.ocr?.text || "");
  if (!/\b(?:LOADING|LOAD|STARTING)\b/iu.test(text)) {
    const logoEvidence = centralPoptropicaLogoEvidence(image, lines, text);
    if (logoEvidence) {
      return logoEvidence;
    }
    const visualEvidence = visualLogoEvidence(image, sample?.loadingVisual, text);
    if (visualEvidence) {
      return visualEvidence;
    }
    return { detected: false, reason: "not_loading_ocr" };
  }
  const candidateLines = lines.filter((line) => {
    const lineText = String(line.text || "");
    return /\bPOPTROPICA\b|\b(?:LOADING|LOAD|STARTING)\b/iu.test(lineText);
  });
  if (!candidateLines.length) {
    return { detected: false, reason: "not_loading_ocr" };
  }
  return centeredBoxEvidence({
    image,
    boxes: candidateLines.map((line) => line.box),
    source: "ocr-loading-text",
    text
  });
}

async function adoptRuntimeRelaunch({ runtime, runDir, waitMs = 30000 }) {
  const activePath = path.join(paths.managedWorkspaceDir, "active-runtime.json");
  const deadline = Date.now() + Math.max(0, Number(waitMs) || 0);
  while (Date.now() < deadline) {
    const active = readJson(activePath, null);
    const activePid = Number(active?.pid || 0);
    if (String(active?.sourceGroup || "").toLowerCase() === "as3" && activePid && activePid !== Number(runtime.pid || 0)) {
      const adoptedRuntime = {
        ...runtime,
        pid: activePid
      };
      return {
        adopted: true,
        active,
        activePath,
        runtime: adoptedRuntime
      };
    }
    await sleep(500);
  }
  return {
    adopted: false,
    active: readJson(activePath, null),
    activePath
  };
}

function waitForRuntimeWindow({ runtime, outputPath, timeoutMs }) {
  return runPythonQa(windowArgs({
    runtime,
    outputPath,
    timeoutMs
  }), { timeoutMs: timeoutMs + 5000 });
}

function summarizeCapture(capture) {
  return {
    screenshotPath: capture?.screenshotPath || null,
    capturePath: capture?.metadataPath || null,
    stagePath: capture?.stagePath || null,
    visualPath: capture?.visualPath || null,
    loadingVisualPath: capture?.loadingVisualPath || null,
    ocrPath: capture?.ocrPath || null,
    imageSize: capture?.capture?.imageSize || null,
    stageRect: capture?.stage?.stageRect || null,
    stageCoverageRatio: capture?.stage?.stageCoverageRatio ?? null,
    visualOk: Boolean(capture?.visual?.ok),
    loadingVisualDetected: Boolean(capture?.loadingVisual?.detected),
    ocrText: String(capture?.ocr?.text || "").slice(0, 500)
  };
}

function summarizeSample(sample) {
  return {
    delayMs: sample.delayMs,
    capturedAtMs: sample.capturedAtMs,
    screenshotPath: sample.savedTo,
    ocrPath: sample.ocrPath,
    ocrText: String(sample.ocr?.text || "").slice(0, 300),
    stageCoverageRatio: sample.stage?.stageCoverageRatio ?? null,
    visualOk: Boolean(sample.visual?.ok),
    loadingVisualDetected: Boolean(sample.loadingVisual?.detected),
    loadingCenter: sample.loadingCenter
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const windowOnly = flagEnabled(arg(args, "windowOnly", "window-only", "")) || flagEnabled(arg(args, "skipF11", "skip-f11", ""));
  const runKind = windowOnly ? "window-loading" : "f11-loading";
  const initialSize = parseSize(arg(args, "initialSize", "initial-size", arg(args, "windowSize", "window-size", "")), {
    width: 1186,
    height: 760
  });
  const qaDefaults = configureQaDefaults(args, initialSize);
  const config = loadConfig();
  const qaRoot = ensureQaDir("as3", "p0-playability");
  const runToken = String(Date.now());
  const runDir = ensureQaDir("as3", "p0-playability", `run-${runKind}-${runToken}`);
  const reportPath = path.join(qaRoot, `as3-${runKind}-transition-${runToken}.json`);
  const latestPath = path.join(qaRoot, `as3-${runKind}-transition-latest.json`);
  const lock = acquireQaLock(`as3-${runKind}-transition.lock`, {
    reportPath,
    artifactDir: runDir
  });

  const autoSceneDelayMs = Math.max(500, Math.min(15000, Math.round(numberArg(args, "autoSceneDelayMs", "auto-scene-delay-ms", 15000))));
  const loadingHoldMs = Math.max(0, Math.min(15000, Math.round(numberArg(args, "loadingHoldMs", "loading-hold-ms", 8000))));
  const initialSettleMs = Math.max(0, Math.round(numberArg(args, "initialSettleMs", "initial-settle-ms", 3500)));
  const f11SettleMs = Math.max(0, Math.round(numberArg(args, "f11SettleMs", "f11-settle-ms", 2500)));
  const relaunchWaitMs = Math.max(0, Math.round(numberArg(args, "relaunchWaitMs", "relaunch-wait-ms", 30000)));
  const postRelaunchSettleMs = Math.max(0, Math.round(numberArg(args, "postRelaunchSettleMs", "post-relaunch-settle-ms", 0)));
  const maxOffsetRatio = Math.max(0, Number(numberArg(args, "maxLoadingOffsetRatio", "max-loading-offset-ratio", 0.12)));
  const sampleMs = parseSampleMs(arg(args, "sampleMs", "sample-ms", "")).length
    ? parseSampleMs(arg(args, "sampleMs", "sample-ms", ""))
    : DEFAULT_SAMPLE_MS;

  try {
    ensureManagedWorkspace(config);
    await ensureFlashpointServices(config);
    await mountSourceZip(config, "as3");

    const target = resolveLaunchTarget({
      config,
      args,
      autoSceneDelayMs,
      loadingHoldMs
    });
    const launchUrl = target.launchUrl;
    const health = await proxyRequest(launchUrl);
    const runtime = spawnManagedRuntime(config, "as3", launchUrl, { detach: true });
    runtime.launchUrl = launchUrl;
    runtime.cmdlineContains = cmdlineFragmentForLaunchUrl(launchUrl);
    const qaErrors = [];

    const windowInfo = runPythonQa(windowArgs({
      runtime,
      outputPath: path.join(runDir, "window-initial.json"),
      size: initialSize,
      timeoutMs: numberArg(args, "windowTimeoutMs", "window-timeout-ms", 60000)
    }), { timeoutMs: numberArg(args, "windowTimeoutMs", "window-timeout-ms", 60000) + 5000 });
    await sleep(initialSettleMs);
    const beforeStem = windowOnly ? "before-window" : "before-f11";
    const beforeTransitionStem = windowOnly ? "window-before-transition" : "f11-before-transition";
    const sequenceName = windowOnly ? "window-loading" : "f11-loading";
    const beforeF11 = captureAndAnalyze({ runtime, windowInfo, stem: beforeStem, runDir, qaErrors, skipAnalysis: true });

    const f11KeyPath = path.join(runDir, "f11-key.json");
    const f11Key = windowOnly ? null : keyWindow({ runtime, windowInfo, key: "VK_F11", outputPath: f11KeyPath, postMessage: qaDefaults.postMessageF11 });
    let transitionRuntime = runtime;
    let transitionWindowInfo = windowInfo;
    let relaunchAdoption = {
      adopted: false,
      reason: windowOnly ? "window_only" : "not_checked"
    };
    if (!windowOnly) {
      await sleep(f11SettleMs);
      relaunchAdoption = await adoptRuntimeRelaunch({
        runtime,
        runDir,
        waitMs: relaunchWaitMs
      });
      if (relaunchAdoption.adopted) {
        transitionRuntime = relaunchAdoption.runtime;
      }
      transitionWindowInfo = waitForRuntimeWindow({
        runtime: transitionRuntime,
        outputPath: path.join(runDir, relaunchAdoption.adopted ? "window-after-f11-relaunch.json" : "window-after-f11.json"),
        timeoutMs: numberArg(args, "windowTimeoutMs", "window-timeout-ms", 60000)
      });
      await sleep(postRelaunchSettleMs);
    }
    const beforeTransition = captureAndAnalyze({ runtime: transitionRuntime, windowInfo: transitionWindowInfo, stem: beforeTransitionStem, runDir, qaErrors, skipAnalysis: true });
    const sequence = captureSequence({ runtime: transitionRuntime, windowInfo: transitionWindowInfo, runDir, sampleMs, qaErrors, sequenceName });
    Object.assign(beforeF11, analyzeScreenshot({
      screenshotPath: beforeF11.screenshotPath,
      stem: beforeStem,
      runDir,
      qaErrors
    }));
    Object.assign(beforeTransition, analyzeScreenshot({
      screenshotPath: beforeTransition.screenshotPath,
      stem: beforeTransitionStem,
      runDir,
      qaErrors
    }));

    const detectedLoadingSamples = sequence.samples.filter((sample) => sample.loadingCenter?.detected);
    const loadingCenterOk = detectedLoadingSamples.length > 0 && detectedLoadingSamples.every((sample) =>
      Math.abs(Number(sample.loadingCenter.offset?.xRatio || 0)) <= maxOffsetRatio &&
      Math.abs(Number(sample.loadingCenter.offset?.yRatio || 0)) <= maxOffsetRatio
    );
    const f11Size = beforeTransition.capture?.imageSize || null;
    const fullscreenLike = Boolean(f11Size && Number(f11Size.width || 0) >= 1800 && Number(f11Size.height || 0) >= 1000);
    const windowLike = Boolean(f11Size && Number(f11Size.width || 0) >= 900 && Number(f11Size.height || 0) >= 500);
    const failedChecks = [
      ...(Number(health.statusCode || 0) !== 200 ? ["launch_health_failed"] : []),
      ...(windowOnly && !windowLike ? ["window_capture_not_window_sized"] : []),
      ...(!windowOnly && !fullscreenLike ? ["f11_fullscreen_capture_not_fullscreen_sized"] : []),
      ...(detectedLoadingSamples.length ? [] : [`${runKind.replace(/-/gu, "_")}_transition_loading_not_detected`]),
      ...(detectedLoadingSamples.length && !loadingCenterOk ? [`${runKind.replace(/-/gu, "_")}_transition_loading_center_offset_failed`] : []),
      ...qaErrors.map((item) => `qa_${String(item.step || "unknown").replace(/[^a-z0-9]+/giu, "_").replace(/^_|_$/gu, "")}`)
    ];
    const report = {
      ok: failedChecks.length === 0,
      generatedAt: new Date().toISOString(),
      mode: windowOnly ? "window" : "f11",
      target,
      artifactDir: runDir,
      launchUrl,
      qaDefaults,
      runtime: {
        pid: runtime.pid,
        transitionPid: transitionRuntime.pid,
        playerKey: runtime.playerKey,
        processNames: runtime.processNames
      },
      parameters: {
        autoSceneDelayMs,
        loadingHoldMs,
        initialSettleMs,
        f11SettleMs,
        relaunchWaitMs,
        postRelaunchSettleMs,
        sampleMs,
        maxOffsetRatio
      },
      launchHealth: {
        statusCode: health.statusCode || 0
      },
      f11: {
        keyPath: f11KeyPath,
        keyOk: Boolean(f11Key?.ok),
        fullscreenLike,
        skipped: windowOnly,
        reason: windowOnly ? "window_only" : null
      },
      relaunchAdoption,
      windowMode: {
        windowLike
      },
      beforeF11: summarizeCapture(beforeF11),
      beforeTransition: summarizeCapture(beforeTransition),
      loading: {
        observed: detectedLoadingSamples.length > 0,
        centerOk: loadingCenterOk,
        detectedCount: detectedLoadingSamples.length,
        detectedSamples: detectedLoadingSamples.map(summarizeSample),
        allSamples: sequence.samples.map(summarizeSample)
      },
      failedChecks,
      qaErrors
    };
    writeJson(reportPath, report);
    writeJson(latestPath, report);
    printJson({ ...report, reportPath, latestPath });
    if (!report.ok && !flagEnabled(arg(args, "allowFailures", "allow-failures", ""))) {
      process.exitCode = 1;
    }
    if (!flagEnabled(arg(args, "keepOpen", "keep-open", ""))) {
      stopNavigatorProcesses();
    }
  } catch (error) {
    stopNavigatorProcesses();
    const report = {
      ok: false,
      generatedAt: new Date().toISOString(),
      artifactDir: runDir,
      failedChecks: ["as3_f11_loading_transition_fatal"],
      error: String(error.stack || error.message || error)
    };
    writeJson(reportPath, report);
    writeJson(latestPath, report);
    printJson({ ...report, reportPath, latestPath });
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
