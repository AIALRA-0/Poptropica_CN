const fs = require("node:fs");
const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { acquireQaLock, ensureQaDir, runPythonQa } = require("./lib/qa");
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

const CHILD_CLASS = "GeckoFPSandboxChildWindow";
const DEFAULT_LOADING_SAMPLE_MS = [120, 350, 700, 1200, 2000, 3200];
const DEFAULT_DIALOGUE_TARGETS = {
  "reality-tv-wild-safari": {
    x: 0.32,
    y: 0.5,
    waitMs: 5000,
    holdMs: 120,
    attempts: 2,
    label: "reality-camera-crew-dialogue"
  },
  "timmy-failure": {
    x: 0.52,
    y: 0.8,
    waitMs: 5500,
    holdMs: 100,
    attempts: 1,
    label: "timmy-main-street-scutaro-dialogue",
    qaDialogNpc: "scutaro",
    start: {
      seedIsland: "timmy",
      seedEvents: ["intro_complete"],
      x: 545,
      y: 1460,
      direction: "right"
    }
  },
  "poptropicon": {
    x: 0.5,
    y: 0.8,
    waitMs: 6500,
    holdMs: 120,
    label: "con1-parking-alien-teacher",
    qaDialogNpc: "alien_teacher",
    start: {
      seedIsland: "con1",
      x: 1740,
      y: 1430,
      direction: "right"
    }
  },
  "monster-carnival": {
    x: 0.585,
    y: 0.825,
    waitMs: 5000,
    hoverMs: 700,
    holdMs: 140,
    attempts: 2,
    label: "main-street-father-dialogue",
    qaDialogNpc: "father",
    start: {
      seedIsland: "carnival",
      x: 2900,
      y: 1280,
      direction: "left"
    }
  },
  "mission-atlantis": {
    x: 0.5,
    y: 0.72,
    waitMs: 5500,
    holdMs: 100,
    attempts: 1,
    label: "deepDive1-ship-cam-dialogue",
    qaDialogNpc: "cam",
    qaDialogId: "findKey",
    start: {
      seedIsland: "deepDive1",
      seedEvents: ["hasItem_fish_files"],
      x: 1100,
      y: 1890,
      direction: "right"
    }
  },
  "monkey-wrench": {
    x: 0.5,
    y: 0.72,
    waitMs: 5500,
    holdMs: 100,
    attempts: 1,
    label: "ftue-mainland-amelia-dialogue",
    qaDialogNpc: "amelia",
    qaDialogId: "strange",
    start: {
      seedIsland: "ftue",
      seedEvents: ["three_ingredients"],
      x: 1020,
      y: 1490,
      direction: "left"
    }
  }
};
const AS3_START_FLOW_ENTRY = {
  canonicalKey: "as3-start-flow",
  sourceGroup: "as3",
  launchable: true,
  launchMode: "as3-start-flow",
  islandParam: "Home",
  roomParam: "FlashpointStart",
  startupPath: "gameplay",
  sceneFolder: "home",
  launchUrl: "http://www.poptropica.com/base.php?room=FlashpointStart"
};

function flagEnabled(value) {
  return value === true || /^(1|true|yes|y)$/iu.test(String(value || ""));
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseSize(value, fallback) {
  const match = String(value || "").match(/^(\d+)x(\d+)$/u);
  if (!match) {
    return fallback;
  }
  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

function parseMsList(value, fallback) {
  const values = splitCsv(value).map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry >= 0);
  return values.length ? values : fallback;
}

function parseDialogueSequence(value) {
  const entries = splitCsv(value).map((entry) => {
    const parts = entry.split(/[:x]/iu).map((part) => Number(part.trim()));
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
      return null;
    }
    const point = { x: parts[0], y: parts[1] };
    if (Number.isFinite(parts[2])) {
      point.waitMs = parts[2];
    }
    if (Number.isFinite(parts[3])) {
      point.holdMs = parts[3];
    }
    if (Number.isFinite(parts[4])) {
      point.hoverMs = parts[4];
    }
    return point;
  }).filter(Boolean);
  return entries.length ? entries : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFileSegment(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80) || "unknown";
}

function containsChinese(text) {
  const matches = String(text || "").match(/[\u3400-\u9fff\uf900-\ufaff]/gu);
  return Boolean(matches && matches.length >= 2);
}

const NAVIGATION_ONLY_CHINESE_LABELS = [
  "进入",
  "出口",
  "离开",
  "返回",
  "退出",
  "向左走",
  "向右走",
  "向上走",
  "向下走",
  "公共房间",
  "旅行"
];
const OCR_ARTIFACT_SINGLE_CHARS = new Set(["米", "康", "卡"]);

function containsDialogueChinese(text) {
  const chineseRuns = (String(text || "").match(/[\u3400-\u9fff\uf900-\ufaff]+/gu) || [])
    .filter((run) => !(run.length === 1 && OCR_ARTIFACT_SINGLE_CHARS.has(run)));
  const compact = chineseRuns.join("");
  if (compact.length < 4) {
    return false;
  }
  let residual = compact;
  for (const label of NAVIGATION_ONLY_CHINESE_LABELS) {
    residual = residual.split(label).join("");
  }
  return /[\u3400-\u9fff\uf900-\ufaff]{4,}/u.test(residual);
}

function configureVisibleQa(args, size) {
  const targetMonitor = String(args.monitor || args.targetMonitor || process.env.POPTROPICA_QA_MONITOR || "G32QC").trim();
  const allowForegroundCapture = flagEnabled(args.allowForegroundCapture || args["allow-foreground-capture"]);
  if (targetMonitor) {
    process.env.POPTROPICA_QA_MONITOR = targetMonitor;
  }
  if (allowForegroundCapture) {
    delete process.env.POPTROPICA_QA_NO_FOREGROUND;
  } else {
    process.env.POPTROPICA_QA_NO_FOREGROUND = "1";
  }
  process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS = "1";
  process.env.POPTROPICA_WINDOW_WIDTH = String(size.width);
  process.env.POPTROPICA_WINDOW_HEIGHT = String(size.height);
  return {
    targetMonitor: targetMonitor || null,
    noForegroundCapture: !allowForegroundCapture,
    postMessageClicks: true,
    initialSize: size
  };
}

function windowPid(windowInfo, runtime) {
  return windowInfo?.match?.pid || runtime?.pid || null;
}

function runtimeCmdlineContains(runtime) {
  return String(runtime?.cmdlineContains || runtime?.launchUrl || "").trim();
}

function windowArgs({ runtime, outputPath, size = null, timeoutMs = 30000, maximize = false, titleContains = "poptropica", allowAnyPid = false }) {
  const args = [
    "wait-window",
    "--process-names",
    runtime.processNames.join(","),
    "--timeout-ms",
    String(timeoutMs),
    "--poll-ms",
    "250",
    "--output",
    outputPath
  ];
  if (!allowAnyPid && runtime.pid) {
    args.push("--pid", String(runtime.pid));
  }
  if (titleContains) {
    args.push("--title-contains", String(titleContains));
  }
  const cmdlineContains = runtimeCmdlineContains(runtime);
  if (cmdlineContains) {
    args.push("--cmdline-contains", cmdlineContains);
  }
  if (size) {
    args.push("--window-width", String(size.width), "--window-height", String(size.height));
  }
  if (maximize) {
    args.push("--maximize");
  }
  return args;
}

function captureArgs({ runtime, windowInfo, handle, screenshotPath, metadataPath, size = null, maximize = false, captureOuterClient = false, allowAnyPid = false }) {
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
    metadataPath,
    "--client-only"
  ];
  const pid = windowPid(windowInfo, runtime);
  if (!allowAnyPid && pid) {
    args.push("--pid", String(pid));
  }
  const cmdlineContains = runtimeCmdlineContains(runtime);
  if (cmdlineContains) {
    args.push("--cmdline-contains", cmdlineContains);
  }
  if (!captureOuterClient) {
    args.push("--child-class-contains", CHILD_CLASS);
  }
  if (size) {
    args.push("--window-width", String(size.width), "--window-height", String(size.height));
  }
  if (maximize) {
    args.push("--maximize");
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

function parentClientOffset(capture) {
  const parent = capture?.window?.rect || null;
  const target = capture?.targetWindow?.rect || null;
  if (!parent || !target) {
    return { x: 0, y: 0 };
  }
  return {
    x: Math.round(Number(target.left || 0) - Number(parent.left || 0)),
    y: Math.round(Number(target.top || 0) - Number(parent.top || 0))
  };
}

function stageRelativePoint(capture, stage, relativePoint) {
  const rect = stage?.stageRect;
  const offset = parentClientOffset(capture);
  if (!rect) {
    return null;
  }
  return {
    x: Math.round(offset.x + Number(rect.left || 0) + Number(rect.width || 0) * Number(relativePoint.x)),
    y: Math.round(offset.y + Number(rect.top || 0) + Number(rect.height || 0) * Number(relativePoint.y)),
    screenshotX: Math.round(Number(rect.left || 0) + Number(rect.width || 0) * Number(relativePoint.x)),
    screenshotY: Math.round(Number(rect.top || 0) + Number(rect.height || 0) * Number(relativePoint.y)),
    offset
  };
}

function ocrLineCenterPoint(capture, line) {
  const box = line?.box;
  if (!box) {
    return null;
  }
  return ocrBoxCenterPoint(capture, box);
}

function ocrBoxCenterPoint(capture, box) {
  const offset = parentClientOffset(capture);
  return {
    x: Math.round(Number(box.centerX || 0) + offset.x),
    y: Math.round(Number(box.centerY || 0) + offset.y),
    screenshotX: Math.round(Number(box.centerX || 0)),
    screenshotY: Math.round(Number(box.centerY || 0)),
    offset
  };
}

function findOcrLine(ocr, pattern) {
  const regex = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), "iu");
  const matches = (ocr?.lines || [])
    .filter((line) => regex.test(String(line.text || "")) && line.box)
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  return matches[0] || null;
}

function normalizeOcrText(text) {
  return String(text || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, "");
}

function mergeOcrBoxes(lines) {
  const boxes = lines.map((line) => line?.box).filter(Boolean);
  if (!boxes.length) {
    return null;
  }
  const left = Math.min(...boxes.map((box) => Number(box.left)));
  const top = Math.min(...boxes.map((box) => Number(box.top)));
  const right = Math.max(...boxes.map((box) => Number(box.right)));
  const bottom = Math.max(...boxes.map((box) => Number(box.bottom)));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2
  };
}

function findStackedOcrWords(lines, firstWord, secondWord) {
  const firstPattern = new RegExp(`\\b${firstWord}\\b`, "iu");
  const secondPattern = new RegExp(`\\b${secondWord}\\b`, "iu");
  const firstLines = lines.filter((line) => firstPattern.test(String(line.text || "")) && line.box);
  const secondLines = lines.filter((line) => secondPattern.test(String(line.text || "")) && line.box);
  const candidates = [];
  for (const first of firstLines) {
    for (const second of secondLines) {
      const verticalGap = Number(second.box.top || 0) - Number(first.box.bottom || 0);
      const centerDelta = Math.abs(Number(first.box.centerX || 0) - Number(second.box.centerX || 0));
      const maxWidth = Math.max(Number(first.box.width || 0), Number(second.box.width || 0));
      if (verticalGap < -20 || verticalGap > 80) {
        continue;
      }
      if (centerDelta > Math.max(100, maxWidth * 0.8)) {
        continue;
      }
      candidates.push({
        lines: [first, second],
        score: Number(first.score || 0) + Number(second.score || 0) - centerDelta / 1000 - Math.abs(verticalGap) / 1000
      });
    }
  }
  candidates.sort((left, right) => right.score - left.score);
  return candidates[0] || null;
}

function findStartOcrTarget(ocr) {
  const lines = (ocr?.lines || []).filter((line) => line?.box);
  const exactCandidates = [
    { label: "start", phrase: "START", pattern: /\bSTART\b/iu },
    { label: "new-player", phrase: "NEWPLAYER", pattern: /\bNEW\s*PLAYER\b/iu },
    { label: "returning-player", phrase: "RETURNINGPLAYER", pattern: /\bRETURNING\s*PLAYER\b/iu }
  ];

  for (const candidate of exactCandidates) {
    const exactLine = lines
      .filter((line) => {
        const text = String(line.text || "");
        return candidate.pattern.test(text) || normalizeOcrText(text).includes(candidate.phrase);
      })
      .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))[0];
    if (exactLine) {
      return {
        label: candidate.label,
        lineText: exactLine.text || null,
        box: exactLine.box,
        source: "single-line"
      };
    }
  }

  for (const candidate of [
    { label: "new-player", words: ["NEW", "PLAYER"] },
    { label: "returning-player", words: ["RETURNING", "PLAYER"] }
  ]) {
    const stacked = findStackedOcrWords(lines, candidate.words[0], candidate.words[1]);
    if (stacked) {
      return {
        label: candidate.label,
        lineText: stacked.lines.map((line) => line.text || "").join(" "),
        box: mergeOcrBoxes(stacked.lines),
        source: "stacked-lines"
      };
    }
  }

  const allText = normalizeOcrText(ocr?.text || "");
  if (allText.includes("NEWPLAYER") || allText.includes("RETURNINGPLAYER")) {
    return {
      label: allText.includes("NEWPLAYER") ? "new-player" : "returning-player",
      lineText: ocr?.text || null,
      box: null,
      source: "ocr-text-fallback"
    };
  }
  return null;
}

function captureAndAnalyze({ runDir, stem, runtime, windowInfo, size = null, maximize = false, qaErrors, suppressQaErrors = false, captureOuterClient = false, allowAnyPid = false }) {
  const screenshotPath = path.join(runDir, `${stem}.png`);
  const metadataPath = path.join(runDir, `${stem}-capture.json`);
  const stagePath = path.join(runDir, `${stem}-stage.json`);
  const visualPath = path.join(runDir, `${stem}-visual.json`);
  const ocrPath = path.join(runDir, `${stem}-ocr.json`);
  let capture = null;
  let stage = null;
  let visual = null;
  let ocr = null;
  try {
    capture = runPythonQa(captureArgs({
      runtime,
      windowInfo,
      handle: windowInfo.match.handle,
      screenshotPath,
      metadataPath,
      size,
      maximize,
      captureOuterClient,
      allowAnyPid
    }), { timeoutMs: 45000 });
  } catch (error) {
    if (!suppressQaErrors) {
      qaErrors.push({ step: `${stem}:capture-window`, message: String(error.message || error) });
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
      ], { timeoutMs: 30000 });
    } catch (error) {
      if (!suppressQaErrors) {
        qaErrors.push({ step: `${stem}:analyze-stage`, message: String(error.message || error) });
      }
    }
    try {
      visual = runPythonQa(visualGuardArgs({ screenshotPath, outputPath: visualPath }), { timeoutMs: 30000 });
    } catch (error) {
      if (!suppressQaErrors) {
        qaErrors.push({ step: `${stem}:visual-guard`, message: String(error.message || error) });
      }
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
      if (!suppressQaErrors) {
        qaErrors.push({ step: `${stem}:ocr-image`, message: String(error.message || error) });
      }
    }
  }
  return {
    screenshotPath,
    metadataPath,
    stagePath,
    visualPath,
    ocrPath,
    capture,
    stage,
    visual,
    ocr
  };
}

function captureLooksLoadingOverlay(capture) {
  const text = String(capture?.ocr?.text || "");
  const lines = capture?.ocr?.lines || [];
  const hasLogo = /\bPoptropica\b/iu.test(text);
  const hasLoadingText = /\b(?:LOADING|LOAD|STARTING)\b/iu.test(text);
  const hasSpinner = lines.some((line) => /^[o0○●•.\s]{3,}$/iu.test(String(line.text || "").trim()));
  return Boolean(hasLogo && (hasLoadingText || hasSpinner));
}

function captureLooksPluginCrash(capture) {
  const text = String(capture?.ocr?.text || "");
  return /(?:Adobe Flash plugin has crashed|Reload the page to try again|Crash reporting disabled)/iu.test(text);
}

function captureLooksDismissibleStoryPopup(capture) {
  const text = String(capture?.ocr?.text || "");
  return /(?:\bpage\s*\d+\b|TOTAL\s*FAILURE|TOTALFAILURE|fifteen-hundred-pound polar|Yellow Pages|former home)/iu.test(text);
}

function captureLooksNonGameUi(capture) {
  const text = String(capture?.ocr?.text || "");
  return captureLooksPluginCrash(capture) ||
    /(?:环境信息|提交或推送|创建拉取请求|progress\.md|CHECKLIST\.zh-CN|codex\/full-poptropica|正在运行|已运行\d*条命令)/iu.test(text);
}

function captureLooksStable(capture) {
  return Boolean(
    capture?.capture &&
    capture?.stage?.stageRect &&
    Number(capture?.stage?.stageCoverageRatio || 0) >= 0.2 &&
    capture?.visual?.ok &&
    !captureLooksLoadingOverlay(capture) &&
    !captureLooksNonGameUi(capture)
  );
}

function captureHasDialogueChinese(capture) {
  return Boolean(!captureLooksNonGameUi(capture) && containsDialogueChinese(capture?.ocr?.text || ""));
}

function windowInfoFromCapture(capture, fallbackWindowInfo) {
  const row = capture?.capture?.window;
  if (row?.handle) {
    return {
      ...(fallbackWindowInfo || {}),
      match: row
    };
  }
  return fallbackWindowInfo;
}

async function captureAndAnalyzeStable({ runDir, stem, runtime, windowInfo, size = null, maximize = false, qaErrors, retries = 2, retrySettleMs = 5000, allowAnyPid = false }) {
  let lastCapture = null;
  const attempts = [];
  const maxAttempts = Math.max(1, Number(retries || 0) + 1);
  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    if (attemptIndex > 0) {
      await sleep(Number(retrySettleMs || 0));
    }
    const attemptStem = attemptIndex === 0 ? stem : `${stem}-retry-${attemptIndex}`;
    const capture = captureAndAnalyze({
      runDir,
      stem: attemptStem,
      runtime,
      windowInfo,
      size,
      maximize,
      qaErrors,
      allowAnyPid
    });
    attempts.push({
      attempt: attemptIndex + 1,
      screenshotPath: capture.screenshotPath,
      stageCoverageRatio: capture.stage?.stageCoverageRatio ?? null,
      visualOk: Boolean(capture.visual?.ok),
      loadingOverlay: captureLooksLoadingOverlay(capture),
      pluginCrash: captureLooksPluginCrash(capture),
      nonGameUi: captureLooksNonGameUi(capture),
      stable: captureLooksStable(capture)
    });
    lastCapture = capture;
    if (captureLooksStable(capture)) {
      capture.stabilityAttempts = attempts;
      return capture;
    }
  }
  if (lastCapture) {
    lastCapture.stabilityAttempts = attempts;
  }
  return lastCapture;
}

function clickWindowPoint({ runtime, windowInfo, point, outputPath, holdMs = 90, hoverMs = 0 }) {
  const pid = windowPid(windowInfo, runtime);
  const args = [
    "click-window",
    "--handle",
    String(windowInfo.match.handle),
    "--process-names",
    runtime.processNames.join(","),
    "--title-contains",
    "poptropica",
    "--x",
    String(point.x),
    "--y",
    String(point.y),
    "--hover-ms",
    String(Math.max(0, Math.round(Number(hoverMs) || 0))),
    "--hold-ms",
    String(Math.max(0, Math.round(Number(holdMs) || 0))),
    "--child-class-contains",
    CHILD_CLASS,
    "--output",
    outputPath
  ];
  if (pid) {
    args.push("--pid", String(pid));
  }
  const cmdlineContains = runtimeCmdlineContains(runtime);
  if (cmdlineContains) {
    args.push("--cmdline-contains", cmdlineContains);
  }
  return runPythonQa(args, { timeoutMs: 30000 });
}

async function dismissStoryPopupIfPresent({ runDir, stem, runtime, windowInfo, capture, qaErrors, settleMs = 1800 }) {
  if (!captureLooksDismissibleStoryPopup(capture)) {
    return { applied: false, reason: "story_popup_not_detected" };
  }
  const point = stageRelativePoint(capture.capture, capture.stage, { x: 0.955, y: 0.065 });
  if (!point) {
    return { applied: false, reason: "story_popup_close_point_missing" };
  }
  try {
    const outputPath = path.join(runDir, `${stem}-story-popup-close-click.json`);
    const click = clickWindowPoint({
      runtime,
      windowInfo,
      point,
      outputPath,
      holdMs: 90
    });
    await sleep(Number(settleMs || 0));
    const postWindow = await waitForWindow(
      runtime,
      path.join(runDir, `${stem}-story-popup-close-window.json`),
      null,
      15000,
      false,
      "poptropica",
      true
    );
    const postCapture = await captureAndAnalyzeStable({
      runDir,
      stem: `${stem}-story-popup-closed`,
      runtime,
      windowInfo: postWindow,
      qaErrors,
      retries: 2,
      retrySettleMs: 1500,
      allowAnyPid: true
    });
    return {
      applied: true,
      point,
      click,
      outputPath,
      window: postWindow,
      capture: postCapture
    };
  } catch (error) {
    qaErrors.push({ step: `${stem}:story-popup-close`, message: String(error.message || error) });
    return { applied: false, reason: "story_popup_close_failed", error: String(error.message || error) };
  }
}

function dialogueFromCapture(capture, label = "existing-dialogue") {
  return {
    ok: true,
    reusedCapture: true,
    label,
    containsChinese: captureHasDialogueChinese(capture),
    screenshotPath: capture.screenshotPath,
    ocrPath: capture.ocrPath,
    ocr: capture.ocr,
    stage: capture.stage,
    visual: capture.visual
  };
}

function keyWindow({ runtime, windowInfo, key, outputPath }) {
  const pid = windowPid(windowInfo, runtime);
  const args = [
    "key-window",
    "--handle",
    String(windowInfo.match.handle),
    "--process-names",
    runtime.processNames.join(","),
    "--title-contains",
    "poptropica",
    "--key",
    key,
    "--output",
    outputPath
  ];
  if (pid) {
    args.push("--pid", String(pid));
  }
  const cmdlineContains = runtimeCmdlineContains(runtime);
  if (cmdlineContains) {
    args.push("--cmdline-contains", cmdlineContains);
  }
  return runPythonQa(args, { timeoutMs: 30000 });
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
    if (sample?.loadingVisual?.detected) {
      return centeredBoxEvidence({
        image: sample.loadingVisual.imageSize || image,
        boxes: [sample.loadingVisual.box],
        source: "visual-dark-logo",
        text: "",
        extra: {
          darkPct: sample.loadingVisual.darkPct,
          featurePixels: sample.loadingVisual.featurePixels
        }
      });
    }
    return { detected: false, reason: "no_ocr_or_image_size" };
  }
  const text = String(sample.ocr?.text || "");
  if (!/\b(?:LOADING|LOAD|STARTING)\b/iu.test(text)) {
    const logoEvidence = centralPoptropicaLogoEvidence(image, lines, text);
    if (logoEvidence) {
      return logoEvidence;
    }
    if (sample?.loadingVisual?.detected) {
      return centeredBoxEvidence({
        image: sample.loadingVisual.imageSize || image,
        boxes: [sample.loadingVisual.box],
        source: "visual-dark-logo",
        text,
        extra: {
          darkPct: sample.loadingVisual.darkPct,
          featurePixels: sample.loadingVisual.featurePixels
        }
      });
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

async function waitForWindow(runtime, outputPath, size, timeoutMs, maximize = false, titleContains = "poptropica", allowAnyPid = false) {
  return runPythonQa(windowArgs({ runtime, outputPath, size, timeoutMs, maximize, titleContains, allowAnyPid }), {
    timeoutMs: Number(timeoutMs || 30000) + 5000
  });
}

async function clickStartIfPresent({ runDir, stem, runtime, windowInfo, initial, qaErrors }) {
  const startTarget = findStartOcrTarget(initial.ocr);
  if (!startTarget) {
    return { applied: false, reason: "start_not_found" };
  }
  const point = startTarget.box
    ? ocrBoxCenterPoint(initial.capture, startTarget.box)
    : stageRelativePoint(initial.capture, initial.stage, { x: 0.5, y: 0.57 });
  if (!point) {
    return { applied: false, reason: "start_point_missing" };
  }
  try {
    const outputPath = path.join(runDir, `${stem}-${startTarget.label || "start"}-click.json`);
    const click = clickWindowPoint({ runtime, windowInfo, point, outputPath, holdMs: 90 });
    return {
      applied: true,
      label: startTarget.label,
      lineText: startTarget.lineText || null,
      source: startTarget.source || null,
      point,
      click,
      outputPath
    };
  } catch (error) {
    qaErrors.push({ step: `${stem}:start-click`, message: String(error.message || error) });
    return {
      applied: false,
      label: startTarget.label,
      lineText: startTarget.lineText || null,
      source: startTarget.source || null,
      point,
      reason: "click_failed"
    };
  }
}

async function clickDialogue({ runDir, stem, runtime, windowInfo, baseCapture, baseStage, target, qaErrors }) {
  let currentCapture = baseCapture;
  let currentStage = baseStage;
  let currentWindowInfo = windowInfo;
  const attempts = [];
  const sequence = Array.isArray(target.sequence) ? target.sequence : [];
  const attemptCount = Math.max(1, Number(target.attempts || sequence.length || 1));
  let lastPoint = null;

  for (let attemptIndex = 0; attemptIndex < attemptCount; attemptIndex += 1) {
    const relativeTarget = {
      ...target,
      ...(sequence[attemptIndex] || {})
    };
    const point = stageRelativePoint(currentCapture, currentStage, relativeTarget);
    lastPoint = point;
    if (!point) {
      return { ok: false, reason: "stage_point_missing", attempts };
    }
    try {
      const suffix = attemptCount > 1 ? `-attempt-${attemptIndex + 1}` : "";
      const outputPath = path.join(runDir, `${stem}-click${suffix}.json`);
      const click = clickWindowPoint({
        runtime,
        windowInfo: currentWindowInfo,
        point,
        outputPath,
        hoverMs: Number(relativeTarget.hoverMs || target.hoverMs || 0),
        holdMs: Number(relativeTarget.holdMs || target.holdMs || 90)
      });
      await sleep(Number(relativeTarget.waitMs || target.waitMs || 3500));
      const postWindow = await waitForWindow(
        runtime,
        path.join(runDir, `${stem}-window${suffix}.json`),
        null,
        15000,
        false,
        "poptropica",
        true
      );
      const captureStem = attemptCount > 1 ? `${stem}${suffix}` : stem;
      const capture = captureAndAnalyze({ runDir, stem: captureStem, runtime, windowInfo: postWindow, qaErrors });
      const attempt = {
        attempt: attemptIndex + 1,
        target,
        relativeTarget,
        point,
        click,
        outputPath,
        window: postWindow,
        containsChinese: captureHasDialogueChinese(capture),
        screenshotPath: capture.screenshotPath,
        ocrPath: capture.ocrPath,
        ocrText: String(capture.ocr?.text || "").slice(0, 300)
      };
      attempts.push(attempt);
      if (attempt.containsChinese || attemptIndex === attemptCount - 1) {
        return {
          ok: Boolean(capture.capture && capture.stage?.stageRect),
          target,
          point,
          attempts,
          click,
          outputPath,
          window: postWindow,
          ...capture,
          containsChinese: attempt.containsChinese
        };
      }
      currentCapture = capture.capture;
      currentStage = capture.stage;
      currentWindowInfo = postWindow;
      await sleep(Number(target.retryWaitMs || 800));
    } catch (error) {
      qaErrors.push({ step: `${stem}:dialogue-click`, message: String(error.message || error) });
      return { ok: false, target, point, attempts, reason: "dialogue_click_failed", error: String(error.message || error) };
    }
  }

  if (!lastPoint) {
    return { ok: false, reason: "stage_point_missing" };
  }
  return { ok: false, target, point: lastPoint, attempts, reason: "dialogue_click_failed" };
}

function selectedEntries(manifest, args) {
  const rawFilter = args.islands || args.island || "timmy-failure";
  const filters = new Set(splitCsv(rawFilter).map((entry) => entry.toLowerCase()));
  const directEntries = manifest.entries
    .filter((entry) => entry.sourceGroup === "as3" && entry.launchable && entry.launchMode === "as3-direct-scene")
    .filter((entry) => {
      const candidates = [
        entry.canonicalKey,
        entry.islandParam,
        entry.roomParam,
        entry.as3TargetScene
      ].map((value) => String(value || "").toLowerCase());
      return candidates.some((candidate) => filters.has(candidate));
    })
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey, "en"));
  const includeStartFlow = flagEnabled(args.startFlow || args["start-flow"] || args.includeStartFlow || args["include-start-flow"]) ||
    filters.has("as3-start-flow") ||
    filters.has("flashpointstart");
  return includeStartFlow
    ? [AS3_START_FLOW_ENTRY, ...directEntries]
    : directEntries;
}

function dialogueTarget(entry, args) {
  const fromArgs = args.dialogueX !== undefined || args["dialogue-x"] !== undefined || args.dialogueY !== undefined || args["dialogue-y"] !== undefined;
  const fallback = DEFAULT_DIALOGUE_TARGETS[entry.canonicalKey] || { x: 0.42, y: 0.74, waitMs: 4000, label: "generic-dialogue-target" };
  const sequence = parseDialogueSequence(args.dialogueSequence || args["dialogue-sequence"]) ||
    (!fromArgs && Array.isArray(fallback.sequence) ? fallback.sequence : null);
  return {
    x: Number(args.dialogueX || args["dialogue-x"] || fallback.x),
    y: Number(args.dialogueY || args["dialogue-y"] || fallback.y),
    waitMs: Number(args.dialogueWaitMs || args["dialogue-wait-ms"] || fallback.waitMs || 4000),
    holdMs: Number(args.dialogueHoldMs || args["dialogue-hold-ms"] || fallback.holdMs || 90),
    hoverMs: Number(args.dialogueHoverMs || args["dialogue-hover-ms"] || fallback.hoverMs || 0),
    attempts: Number(args.dialogueAttempts || args["dialogue-attempts"] || fallback.attempts || (sequence ? sequence.length : 1)),
    retryWaitMs: Number(args.dialogueRetryWaitMs || args["dialogue-retry-wait-ms"] || fallback.retryWaitMs || 800),
    sequence,
    label: String(args.dialogueLabel || args["dialogue-label"] || (fromArgs ? "custom-dialogue-target" : fallback.label))
  };
}

function defaultStartSeed(entry, args) {
  const disabled = flagEnabled(args.noDefaultDialogueSeed || args["no-default-dialogue-seed"]);
  if (disabled) {
    return null;
  }
  const fallback = DEFAULT_DIALOGUE_TARGETS[entry.canonicalKey];
  return fallback && fallback.start ? fallback.start : null;
}

function normalizeDialoguePhase(value, hasViewportChecks) {
  const raw = String(value || "").trim().toLowerCase();
  const fallback = hasViewportChecks ? "after-each" : "scene";
  if (!raw) {
    return fallback;
  }
  if (["scene", "before", "pre", "before-viewport"].includes(raw)) {
    return "scene";
  }
  if (["after", "post", "post-viewport", "after-viewport", "maximized"].includes(raw)) {
    return "after-viewport";
  }
  if (["after-each", "each", "viewport-each", "resize-and-maximize"].includes(raw)) {
    return "after-each";
  }
  if (["both", "scene-and-viewport"].includes(raw)) {
    return "both";
  }
  return fallback;
}

function shouldClickSceneDialogue(dialoguePhase, skipViewportChecks) {
  return skipViewportChecks || dialoguePhase === "scene" || dialoguePhase === "both";
}

function shouldClickResizedDialogue(dialoguePhase) {
  return dialoguePhase === "after-each" || dialoguePhase === "both";
}

function shouldClickMaximizedDialogue(dialoguePhase) {
  return dialoguePhase === "after-viewport" || dialoguePhase === "after-each" || dialoguePhase === "both";
}

function launchUrlForEntry(entry, args) {
  const defaultSeed = defaultStartSeed(entry, args);
  const hasQaSeedOverride = args.seedIsland !== undefined ||
    args["seed-island"] !== undefined ||
    args.seedEvents !== undefined ||
    args["seed-events"] !== undefined ||
    args.startX !== undefined ||
    args["start-x"] !== undefined ||
    args.startY !== undefined ||
    args["start-y"] !== undefined ||
    args.startDirection !== undefined ||
    args["start-direction"] !== undefined ||
    Boolean(defaultSeed);
  const qaLoadingHoldMs = args.qaLoadingHoldMs || args["qa-loading-hold-ms"] ||
    args.flashpointQaLoadingHoldMs || args["flashpoint-qa-loading-hold-ms"];
  const hasQaLoadingHold = qaLoadingHoldMs !== undefined && qaLoadingHoldMs !== null && qaLoadingHoldMs !== "";
  const fallback = DEFAULT_DIALOGUE_TARGETS[entry.canonicalKey] || null;
  const qaDialogNpc = String(args.qaDialogNpc || args["qa-dialog-npc"] || args.flashpointQaDialogNpc || args["flashpoint-qa-dialog-npc"] || fallback?.qaDialogNpc || "").trim();
  const qaDialogId = String(args.qaDialogId || args["qa-dialog-id"] || args.flashpointQaDialogId || args["flashpoint-qa-dialog-id"] || fallback?.qaDialogId || "").trim();
  const qaAutoScene = String(args.qaAutoScene || args["qa-auto-scene"] || args.flashpointQaAutoScene || args["flashpoint-qa-auto-scene"] || "").trim();
  const qaAutoSceneDelayMs = args.qaAutoSceneDelayMs || args["qa-auto-scene-delay-ms"] ||
    args.flashpointQaAutoSceneDelayMs || args["flashpoint-qa-auto-scene-delay-ms"];
  const mode = String(args.resizeReloadMode || args["resize-reload-mode"] || "").trim();
  const hasQaDialogNpc = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(qaDialogNpc);
  const hasQaDialogId = /^[A-Za-z0-9_ -]{1,64}$/u.test(qaDialogId);
  const hasQaAutoScene = /^(center)$/u.test(qaAutoScene);
  const hasQaAutoSceneDelay = qaAutoSceneDelayMs !== undefined && qaAutoSceneDelayMs !== null && qaAutoSceneDelayMs !== "";
  if (!mode && !hasQaSeedOverride && !hasQaLoadingHold && !hasQaDialogNpc && !hasQaDialogId && !hasQaAutoScene && !hasQaAutoSceneDelay) {
    return entry.launchUrl;
  }
  const url = new URL(entry.launchUrl);
  if (mode) {
    url.searchParams.set("reloadOnResize", mode);
  }
  if (hasQaSeedOverride) {
    const seedEvents = splitCsv(args.seedEvents || args["seed-events"] || defaultSeed?.seedEvents);
    const seedIsland = String(args.seedIsland || args["seed-island"] || defaultSeed?.seedIsland || entry.seedIsland || entry.islandParam || "").trim();
    const startX = args.startX ?? args["start-x"] ?? defaultSeed?.x;
    const startY = args.startY ?? args["start-y"] ?? defaultSeed?.y;
    const startDirection = String(args.startDirection || args["start-direction"] || defaultSeed?.direction || "").trim().toLowerCase();
    if (seedIsland) {
      url.searchParams.set("flashpointSeedIsland", seedIsland);
    }
    if (seedEvents.length) {
      url.searchParams.set("flashpointSeedEvents", seedEvents.join(","));
    }
    if (startX !== undefined && startX !== null && startX !== "") {
      url.searchParams.set("flashpointStartX", String(startX));
    }
    if (startY !== undefined && startY !== null && startY !== "") {
      url.searchParams.set("flashpointStartY", String(startY));
    }
    if (startDirection === "left" || startDirection === "right") {
      url.searchParams.set("flashpointStartDirection", startDirection);
    }
  }
  if (hasQaLoadingHold) {
    const number = Number(qaLoadingHoldMs);
    if (Number.isFinite(number) && number > 0) {
      url.searchParams.set("flashpointQaLoadingHoldMs", String(Math.min(15000, Math.round(number))));
    }
  }
  if (hasQaDialogNpc) {
    url.searchParams.set("flashpointQaDialogNpc", qaDialogNpc);
  }
  if (hasQaDialogId) {
    url.searchParams.set("flashpointQaDialogId", qaDialogId);
  }
  if (hasQaAutoScene) {
    url.searchParams.set("flashpointQaAutoScene", qaAutoScene);
  }
  if (hasQaAutoSceneDelay) {
    const number = Number(qaAutoSceneDelayMs);
    if (Number.isFinite(number) && number > 0) {
      url.searchParams.set("flashpointQaAutoSceneDelayMs", String(Math.min(15000, Math.max(500, Math.round(number)))));
    }
  }
  return url.toString();
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

async function runEntry({ config, entry, index, total, runDir, args, initialSize, resizedSize, visibleQaDefaults, entryAttempt = 1 }) {
  const qaErrors = [];
  const stemBase = `${String(index + 1).padStart(2, "0")}-${safeFileSegment(entry.canonicalKey)}`;
  const stem = Number(entryAttempt) > 1 ? `${stemBase}-attempt-${entryAttempt}` : stemBase;
  const windowTimeoutMs = Number(args.windowTimeoutMs || args["window-timeout-ms"] || 60000);
  const initialSettleMs = Number(args.initialSettleMs || args["initial-settle-ms"] || 12000);
  const sceneSettleMs = Number(args.sceneSettleMs || args["scene-settle-ms"] || 12000);
  const resizeSettleMs = Number(args.resizeSettleMs || args["resize-settle-ms"] || 9000);
  const maximizeSettleMs = Number(args.maximizeSettleMs || args["maximize-settle-ms"] || 9000);
  const loadingSampleMs = parseMsList(args.loadingSampleMs || args["loading-sample-ms"], DEFAULT_LOADING_SAMPLE_MS);
  const launchLoadingSampleMs = parseMsList(args.launchLoadingSampleMs || args["launch-loading-sample-ms"], DEFAULT_LOADING_SAMPLE_MS);
  const skipViewportChecks = flagEnabled(args.skipViewportChecks || args["skip-viewport-checks"] || args.interactionOnly || args["interaction-only"]);
  const dialoguePhase = normalizeDialoguePhase(args.dialoguePhase || args["dialogue-phase"], !skipViewportChecks);
  const requireEveryViewportDialogue = flagEnabled(args.requireEveryViewportDialogue || args["require-every-viewport-dialogue"]);
  const initialMaximize = flagEnabled(args.initialMaximize || args["initial-maximize"]);

  process.env.POPTROPICA_WINDOW_WIDTH = String(initialSize.width);
  process.env.POPTROPICA_WINDOW_HEIGHT = String(initialSize.height);
  clearPoptropicaFlashState({ reason: `qa-as3-p0-playability:${entry.canonicalKey}` });
  const launchUrl = launchUrlForEntry(entry, args);
  const launchHealth = await proxyRequest(launchUrl).catch((error) => ({
    statusCode: 0,
    error: String(error.message || error)
  }));
  const runtime = spawnManagedRuntime(config, "as3", launchUrl, {
    detach: true,
    playerKey: "flashpointnavigator-as3"
  });
  runtime.launchUrl = launchUrl;
  runtime.cmdlineContains = cmdlineFragmentForLaunchUrl(launchUrl);

  try {
    const f11BeforeInitial = flagEnabled(args.f11BeforeInitial || args["f11-before-initial"]);
    let initialWindow = await waitForWindow(
      runtime,
      path.join(runDir, `${stem}-initial-window.json`),
      initialMaximize ? null : initialSize,
      windowTimeoutMs,
      initialMaximize,
      f11BeforeInitial ? "" : "poptropica"
    );
    const windowReadyAt = Date.now();
    let preInitialF11 = null;
    let suspendedTargetMonitor = null;
    if (f11BeforeInitial) {
      const keyPath = path.join(runDir, `${stem}-pre-initial-f11-key.json`);
      preInitialF11 = {
        key: keyWindow({ runtime, windowInfo: initialWindow, key: "VK_F11", outputPath: keyPath }),
        keyPath
      };
      await sleep(Number(args.preInitialF11SettleMs || args["pre-initial-f11-settle-ms"] || 1500));
      suspendedTargetMonitor = process.env.POPTROPICA_QA_MONITOR || "";
      process.env.POPTROPICA_QA_MONITOR = "";
      initialWindow = await waitForWindow(
        runtime,
        path.join(runDir, `${stem}-pre-initial-f11-window.json`),
        null,
        15000
      );
      preInitialF11.window = initialWindow;
    }
    const loadingSamples = [];
    if (!flagEnabled(args.skipLaunchLoadingSamples || args["skip-launch-loading-samples"])) {
      for (const delayMs of launchLoadingSampleMs) {
        const elapsed = Date.now() - windowReadyAt;
        if (delayMs > elapsed) {
          await sleep(delayMs - elapsed);
        }
        const sampleWindow = await waitForWindow(
          runtime,
          path.join(runDir, `${stem}-launch-loading-${delayMs}-window.json`),
          null,
          10000
        );
        const sample = captureAndAnalyze({
          runDir,
          stem: `${stem}-launch-loading-${delayMs}`,
          runtime,
          windowInfo: sampleWindow,
          qaErrors,
          suppressQaErrors: true,
          captureOuterClient: Boolean(preInitialF11)
        });
        loadingSamples.push({
          phase: "launch",
          delayMs,
          ...sample,
          loadingCenter: loadingCenterEvidence(sample)
        });
      }
    }
    const elapsedBeforeInitial = Date.now() - windowReadyAt;
    if (initialSettleMs > elapsedBeforeInitial) {
      await sleep(initialSettleMs - elapsedBeforeInitial);
    }
    let initial = null;
    try {
      initial = captureAndAnalyze({
        runDir,
        stem: `${stem}-initial`,
        runtime,
        windowInfo: initialWindow,
        size: initialMaximize || preInitialF11 ? null : initialSize,
        qaErrors,
        captureOuterClient: Boolean(preInitialF11)
      });
    } finally {
      if (suspendedTargetMonitor !== null) {
        process.env.POPTROPICA_QA_MONITOR = suspendedTargetMonitor;
        suspendedTargetMonitor = null;
      }
    }
    const initialLoadingCenter = loadingCenterEvidence(initial);
    if (initialLoadingCenter.detected) {
      loadingSamples.push({
        phase: "initial",
        delayMs: Date.now() - windowReadyAt,
        ...initial,
        loadingCenter: initialLoadingCenter
      });
    }

    const start = flagEnabled(args.skipStart || args["skip-start"])
      ? { applied: false, reason: "start_skipped" }
      : await clickStartIfPresent({
          runDir,
          stem,
          runtime,
          windowInfo: initialWindow,
          initial,
          qaErrors
        });

    if (start.applied) {
      const clickedAt = Date.now();
      for (const delayMs of loadingSampleMs) {
        const elapsed = Date.now() - clickedAt;
        if (delayMs > elapsed) {
          await sleep(delayMs - elapsed);
        }
        const sampleWindow = await waitForWindow(
          runtime,
          path.join(runDir, `${stem}-loading-${delayMs}-window.json`),
          null,
          10000
        );
        const sample = captureAndAnalyze({
          runDir,
          stem: `${stem}-loading-${delayMs}`,
          runtime,
          windowInfo: sampleWindow,
          qaErrors,
          suppressQaErrors: true
        });
        loadingSamples.push({
          phase: "start",
          delayMs,
          ...sample,
          loadingCenter: loadingCenterEvidence(sample)
        });
      }
    }

    const initialHasChineseDialogue = captureHasDialogueChinese(initial);
    if (start.applied || !initialHasChineseDialogue) {
      await sleep(sceneSettleMs);
    }
    let sceneWindow = start.applied || !initialHasChineseDialogue
      ? await waitForWindow(
          runtime,
          path.join(runDir, `${stem}-scene-window.json`),
          null,
          15000
        )
      : initialWindow;
    let scene = start.applied || !initialHasChineseDialogue
      ? captureAndAnalyze({ runDir, stem: `${stem}-scene`, runtime, windowInfo: sceneWindow, qaErrors })
      : initial;
    const storyPopup = await dismissStoryPopupIfPresent({
      runDir,
      stem,
      runtime,
      windowInfo: sceneWindow,
      capture: scene,
      qaErrors
    });
    if (storyPopup.applied && storyPopup.capture) {
      sceneWindow = storyPopup.window || sceneWindow;
      scene = storyPopup.capture;
    }
    const target = dialogueTarget(entry, args);
    const sceneAlreadyHasChinese = captureHasDialogueChinese(scene);
    const dialogue = flagEnabled(args.skipDialogue || args["skip-dialogue"])
      ? { skipped: true, ok: true, containsChinese: false }
      : shouldClickSceneDialogue(dialoguePhase, skipViewportChecks)
        ? sceneAlreadyHasChinese
          ? dialogueFromCapture(scene, "scene-dialogue-before-viewport")
          : await clickDialogue({
              runDir,
              stem: `${stem}-dialogue`,
              runtime,
              windowInfo: sceneWindow,
              baseCapture: scene.capture,
              baseStage: scene.stage,
              target,
              qaErrors
            })
        : { skipped: true, ok: true, containsChinese: false, reason: "dialogue_after_viewport_mode" };

    let resizedWindow = sceneWindow;
    let resized = scene;
    let resizedDialogue = { skipped: true, ok: true, containsChinese: false };
    let maximizedWindow = sceneWindow;
    let maximized = scene;
    let maximizedDialogue = { skipped: true, ok: true, containsChinese: false };
    let resizedViewportDialogueChineseBeforeMax = false;

    if (!skipViewportChecks) {
      resizedWindow = await waitForWindow(
        runtime,
        path.join(runDir, `${stem}-resized-window.json`),
        resizedSize,
        20000
      );
      await sleep(resizeSettleMs);
      resizedWindow = await waitForWindow(
        runtime,
        path.join(runDir, `${stem}-resized-after-reload-window.json`),
        null,
        30000,
        false,
        "poptropica",
        true
      );
      resized = await captureAndAnalyzeStable({
        runDir,
        stem: `${stem}-resized`,
        runtime,
        windowInfo: resizedWindow,
        qaErrors,
        retries: Number(args.stableCaptureRetries || args["stable-capture-retries"] || 2),
        retrySettleMs: Number(args.stableCaptureRetrySettleMs || args["stable-capture-retry-settle-ms"] || 5000),
        allowAnyPid: true
      });
      const resizedStable = captureLooksStable(resized);
      const resizedAlreadyHasChinese = captureHasDialogueChinese(resized);
      resizedDialogue = flagEnabled(args.skipDialogue || args["skip-dialogue"])
        ? { skipped: true, ok: true, containsChinese: false }
        : resizedAlreadyHasChinese
          ? dialogueFromCapture(resized, "resized-dialogue-preserved")
          : !resizedStable
            ? { skipped: true, ok: true, containsChinese: false, reason: "resized_capture_not_stable" }
          : shouldClickResizedDialogue(dialoguePhase)
            ? await clickDialogue({
                runDir,
                stem: `${stem}-resized-dialogue`,
                runtime,
                windowInfo: windowInfoFromCapture(resized, resizedWindow),
                baseCapture: resized.capture,
                baseStage: resized.stage,
                target,
                qaErrors
              })
            : { skipped: true, ok: true, containsChinese: false, reason: "resized_dialogue_not_required_for_phase" };
      resizedViewportDialogueChineseBeforeMax = Boolean(resizedAlreadyHasChinese || resizedDialogue.containsChinese);

      maximizedWindow = await waitForWindow(
        runtime,
        path.join(runDir, `${stem}-maximized-window.json`),
        null,
        20000,
        true,
        "poptropica",
        true
      );
      await sleep(maximizeSettleMs);
      maximizedWindow = await waitForWindow(
        runtime,
        path.join(runDir, `${stem}-maximized-after-reload-window.json`),
        null,
        30000,
        false,
        "poptropica",
        true
      );
      maximized = await captureAndAnalyzeStable({
        runDir,
        stem: `${stem}-maximized`,
        runtime,
        windowInfo: maximizedWindow,
        qaErrors,
        retries: Number(args.stableCaptureRetries || args["stable-capture-retries"] || 2),
        retrySettleMs: Number(args.stableCaptureRetrySettleMs || args["stable-capture-retry-settle-ms"] || 5000),
        allowAnyPid: true
      });
      const maximizedStable = captureLooksStable(maximized);
      const maximizedAlreadyHasChinese = captureHasDialogueChinese(maximized);
      maximizedDialogue = flagEnabled(args.skipDialogue || args["skip-dialogue"])
        ? { skipped: true, ok: true, containsChinese: false }
        : maximizedAlreadyHasChinese
          ? dialogueFromCapture(maximized, "maximized-dialogue-preserved")
          : !maximizedStable
            ? { skipped: true, ok: true, containsChinese: false, reason: "maximized_capture_not_stable" }
          : shouldClickMaximizedDialogue(dialoguePhase) && (!resizedViewportDialogueChineseBeforeMax || requireEveryViewportDialogue)
            ? await clickDialogue({
                runDir,
                stem: `${stem}-maximized-dialogue`,
                runtime,
                windowInfo: windowInfoFromCapture(maximized, maximizedWindow),
                baseCapture: maximized.capture,
                baseStage: maximized.stage,
                target,
                qaErrors
              })
            : { skipped: true, ok: true, containsChinese: false, reason: resizedViewportDialogueChineseBeforeMax ? "resized_dialogue_already_verified_after_viewport" : "maximized_dialogue_not_required_for_phase" };
    }

    let f11 = null;
    if (flagEnabled(args.tryF11 || args["try-f11"])) {
      try {
        let f11KeyWindow = await waitForWindow(
          runtime,
          path.join(runDir, `${stem}-f11-before-key-window.json`),
          null,
          15000,
          false,
          "poptropica",
          true
        );
        let f11RestoreWindow = null;
        if (!flagEnabled(args.skipF11RestoreWindow || args["skip-f11-restore-window"])) {
          f11RestoreWindow = await waitForWindow(
            runtime,
            path.join(runDir, `${stem}-f11-restore-windowed-window.json`),
            resizedSize,
            20000,
            false,
            "poptropica",
            true
          );
          await sleep(Number(args.f11RestoreSettleMs || args["f11-restore-settle-ms"] || resizeSettleMs || 9000));
          f11KeyWindow = await waitForWindow(
            runtime,
            path.join(runDir, `${stem}-f11-restore-after-reload-window.json`),
            null,
            30000,
            false,
            "poptropica",
            true
          );
        }
        const keyPath = path.join(runDir, `${stem}-f11-key.json`);
        f11 = {
          key: keyWindow({ runtime, windowInfo: f11KeyWindow, key: "VK_F11", outputPath: keyPath }),
          keyPath,
          restoreWindowedBeforeKey: f11RestoreWindow
            ? {
                attempted: true,
                window: f11RestoreWindow
              }
            : { attempted: false }
        };
        await sleep(Number(args.f11SettleMs || args["f11-settle-ms"] || 3000));
        const f11Window = await waitForWindow(
          runtime,
          path.join(runDir, `${stem}-f11-window.json`),
          null,
          15000,
          false,
          "poptropica",
          true
        );
        f11.capture = await captureAndAnalyzeStable({
          runDir,
          stem: `${stem}-f11`,
          runtime,
          windowInfo: f11Window,
          qaErrors,
          retries: Number(args.f11StableCaptureRetries || args["f11-stable-capture-retries"] || args.stableCaptureRetries || args["stable-capture-retries"] || 2),
          retrySettleMs: Number(args.f11StableCaptureRetrySettleMs || args["f11-stable-capture-retry-settle-ms"] || args.stableCaptureRetrySettleMs || args["stable-capture-retry-settle-ms"] || 5000),
          allowAnyPid: true
        });
        const restoreKeyPath = path.join(runDir, `${stem}-f11-restore-key.json`);
        f11.restoreKeyPath = restoreKeyPath;
        try {
          f11.restore = keyWindow({ runtime, windowInfo: f11Window, key: "VK_F11", outputPath: restoreKeyPath });
        } catch (restoreError) {
          f11.restore = {
            ok: false,
            reason: "restore_failed",
            error: String(restoreError.message || restoreError)
          };
        }
      } catch (error) {
        qaErrors.push({ step: `${stem}:f11`, message: String(error.message || error) });
        f11 = { ok: false, reason: "f11_failed", error: String(error.message || error) };
      }
    }

    const detectedLoadingSamples = loadingSamples.filter((sample) => sample.loadingCenter?.detected);
    const maxLoadingOffsetRatio = Number(args.maxLoadingOffsetRatio || args["max-loading-offset-ratio"] || 0.12);
    const requireLoading = flagEnabled(args.requireLoading || args["require-loading"]);
    const loadingObserved = detectedLoadingSamples.length > 0;
    const loadingCenterOk = (!requireLoading && !start.applied) || detectedLoadingSamples.length > 0 && detectedLoadingSamples.every((sample) =>
      Math.abs(Number(sample.loadingCenter.offset?.xRatio || 0)) <= maxLoadingOffsetRatio &&
      Math.abs(Number(sample.loadingCenter.offset?.yRatio || 0)) <= maxLoadingOffsetRatio
    );
    const sceneStable = skipViewportChecks
      ? captureLooksStable(scene)
      : Boolean(captureLooksStable(scene) && captureLooksStable(resized) && captureLooksStable(maximized));
    const visualStable = skipViewportChecks
      ? Boolean(scene.visual?.ok)
      : Boolean(scene.visual?.ok && resized.visual?.ok && maximized.visual?.ok);
    const resizedHasChinese = captureHasDialogueChinese(resized);
    const maximizedHasChinese = captureHasDialogueChinese(maximized);
    const resizedViewportDialogueChinese = Boolean(resizedHasChinese || resizedDialogue.containsChinese);
    const maximizedViewportDialogueChinese = Boolean(maximizedHasChinese || maximizedDialogue.containsChinese);
    const resizedDialogueExpected = !skipViewportChecks &&
      !flagEnabled(args.skipDialogue || args["skip-dialogue"]) &&
      shouldClickResizedDialogue(dialoguePhase);
    const maximizedDialogueExpected = !skipViewportChecks &&
      !flagEnabled(args.skipDialogue || args["skip-dialogue"]) &&
      shouldClickMaximizedDialogue(dialoguePhase) &&
      (requireEveryViewportDialogue || !resizedViewportDialogueChinese);
    const dialogueChinese = flagEnabled(args.skipDialogue || args["skip-dialogue"]) ||
      Boolean(dialogue.containsChinese || resizedHasChinese || resizedDialogue.containsChinese || maximizedHasChinese || maximizedDialogue.containsChinese);
    const requirePostViewportDialogue = !skipViewportChecks &&
      (flagEnabled(args.requirePostViewportDialogue || args["require-post-viewport-dialogue"]) ||
        !flagEnabled(args.skipDialogue || args["skip-dialogue"]));
    const postViewportDialogueChinese = resizedDialogueExpected && maximizedDialogueExpected
      ? resizedViewportDialogueChinese && maximizedViewportDialogueChinese
      : resizedDialogueExpected
        ? resizedViewportDialogueChinese
        : maximizedDialogueExpected
          ? maximizedViewportDialogueChinese
          : Boolean(resizedViewportDialogueChinese || maximizedViewportDialogueChinese);
    const requirePostResizeDialogue = flagEnabled(args.requirePostResizeDialogue || args["require-post-resize-dialogue"]);
    const dialoguePreservedAfterViewport = requireEveryViewportDialogue
      ? Boolean(resizedViewportDialogueChinese && maximizedViewportDialogueChinese)
      : Boolean(resizedViewportDialogueChinese || maximizedViewportDialogueChinese);
    const postResizeDialogueChinese = requirePostResizeDialogue
      ? dialoguePreservedAfterViewport
      : Boolean(resizedHasChinese || resizedDialogue.containsChinese || maximizedHasChinese || maximizedDialogue.containsChinese);
    const requireF11 = flagEnabled(args.requireF11 || args["require-f11"]);
    const f11LoadingOverlay = Boolean(f11 && captureLooksLoadingOverlay(f11.capture));
    const f11Stable = !f11 || captureLooksStable(f11.capture);
    const nonGameUiCapture = Boolean(
      captureLooksNonGameUi(initial) ||
      captureLooksNonGameUi(scene) ||
      captureLooksNonGameUi(resized) ||
      captureLooksNonGameUi(maximized) ||
      (f11?.capture && captureLooksNonGameUi(f11.capture))
    );
    const failedChecks = [
      ...(Number(launchHealth.statusCode || 0) !== 200 ? ["launch_health_failed"] : []),
      ...(!start.applied && flagEnabled(args.requireStart || args["require-start"]) ? ["start_not_clicked"] : []),
      ...(!loadingCenterOk ? [detectedLoadingSamples.length ? "loading_center_offset_failed" : "loading_sample_not_captured"] : []),
      ...(!sceneStable ? ["scene_stage_missing_after_resize_or_maximize"] : []),
      ...(!visualStable ? ["visual_guard_failed_after_resize_or_maximize"] : []),
      ...(!dialogueChinese ? ["dialogue_chinese_not_seen_in_play"] : []),
      ...(nonGameUiCapture ? ["non_game_ui_capture_seen"] : []),
      ...(requirePostViewportDialogue && !postViewportDialogueChinese ? ["post_viewport_dialogue_chinese_not_seen"] : []),
      ...(requirePostResizeDialogue && !postResizeDialogueChinese ? ["post_resize_dialogue_chinese_not_seen"] : []),
      ...(requireF11 && f11LoadingOverlay ? ["f11_fullscreen_still_loading"] : []),
      ...(requireF11 && !f11Stable && !f11LoadingOverlay ? ["f11_fullscreen_visual_guard_failed"] : []),
      ...qaErrors.map((error) => `qa_${safeFileSegment(error.step)}`)
    ];

    return {
      ok: failedChecks.length === 0,
      generatedAt: new Date().toISOString(),
      index: index + 1,
      total,
      entryAttempt,
      canonicalKey: entry.canonicalKey,
      launchUrl,
      visibleQaDefaults,
      runtime: {
        pid: runtime.pid,
        playerKey: runtime.playerKey,
        processNames: runtime.processNames
      },
      initialSize,
      initialMaximize,
      preInitialF11: preInitialF11 ? {
        keyPath: preInitialF11.keyPath,
        keyOk: Boolean(preInitialF11.key?.ok),
        window: preInitialF11.window || null
      } : { skipped: true },
      resizedSize,
      dialoguePhase,
      dialogueTarget: target,
      launchHealth: {
        statusCode: launchHealth.statusCode || 0,
        error: launchHealth.error || null
      },
      artifacts: {
        runDir,
        initialScreenshotPath: initial.screenshotPath,
        sceneScreenshotPath: scene.screenshotPath,
        dialogueScreenshotPath: dialogue.screenshotPath || null,
        resizedScreenshotPath: resized.screenshotPath,
        resizedDialogueScreenshotPath: resizedDialogue.screenshotPath || null,
        maximizedScreenshotPath: maximized.screenshotPath,
        maximizedDialogueScreenshotPath: maximizedDialogue.screenshotPath || null
      },
      initial: summarizeCapture(initial),
      start,
      storyPopup: summarizeStoryPopup(storyPopup),
      loadingSamples: loadingSamples.map(summarizeLoadingSample),
      scene: summarizeCapture(scene),
      dialogue: summarizeDialogue(dialogue),
      resized: summarizeCapture(resized),
      resizedDialogue: summarizeDialogue(resizedDialogue),
      f11: f11 ? summarizeF11(f11) : { skipped: true },
      maximized: summarizeCapture(maximized),
      maximizedDialogue: summarizeDialogue(maximizedDialogue),
      checks: {
        loadingCenterOk,
        loadingObserved,
        detectedLoadingSampleCount: detectedLoadingSamples.length,
        sceneStable,
        visualStable,
        dialogueChinese,
        requirePostViewportDialogue,
        postViewportDialogueChinese,
        resizedDialogueExpected,
        maximizedDialogueExpected,
        resizedViewportDialogueChinese,
        maximizedViewportDialogueChinese,
        postResizeDialogueChinese,
        dialoguePreservedAfterViewport,
        requireEveryViewportDialogue,
        nonGameUiCapture,
        f11LoadingOverlay,
        f11Stable,
        viewportChecksSkipped: skipViewportChecks
      },
      qaErrors,
      failedChecks
    };
  } catch (error) {
    qaErrors.push({ step: `${stem}:fatal`, message: String(error.message || error) });
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      index: index + 1,
      total,
      entryAttempt,
      canonicalKey: entry.canonicalKey,
      launchUrl,
      visibleQaDefaults,
      failedChecks: ["as3_p0_entry_failed", ...qaErrors.map((item) => `qa_${safeFileSegment(item.step)}`)],
      qaErrors,
      error: String(error.stack || error.message || error)
    };
  } finally {
    if (!flagEnabled(args.keepOpen || args["keep-open"])) {
      stopNavigatorProcesses();
    }
  }
}

function summarizeCapture(capture) {
  return {
    screenshotPath: capture.screenshotPath,
    capturePath: capture.metadataPath,
    stagePath: capture.stagePath,
    visualPath: capture.visualPath,
    ocrPath: capture.ocrPath,
    imageSize: capture.capture?.imageSize || null,
    stageRect: capture.stage?.stageRect || null,
    stageCoverageRatio: capture.stage?.stageCoverageRatio ?? null,
    visualOk: Boolean(capture.visual?.ok),
    ocrText: String(capture.ocr?.text || "").slice(0, 500),
    containsChinese: containsChinese(capture.ocr?.text || ""),
    containsDialogueChinese: captureHasDialogueChinese(capture),
    loadingOverlay: captureLooksLoadingOverlay(capture),
    pluginCrash: captureLooksPluginCrash(capture),
    nonGameUi: captureLooksNonGameUi(capture),
    stabilityAttempts: capture.stabilityAttempts || null
  };
}

function summarizeDialogue(dialogue) {
  if (dialogue?.skipped) {
    return { skipped: true, ok: true, containsChinese: false, reason: dialogue.reason || null };
  }
  return {
    ok: Boolean(dialogue?.ok),
    containsChinese: Boolean(dialogue?.containsChinese),
    screenshotPath: dialogue?.screenshotPath || null,
    ocrPath: dialogue?.ocrPath || null,
    ocrText: String(dialogue?.ocr?.text || "").slice(0, 500),
    stageCoverageRatio: dialogue?.stage?.stageCoverageRatio ?? null,
    visualOk: Boolean(dialogue?.visual?.ok),
    reason: dialogue?.reason || null
  };
}

function summarizeStoryPopup(storyPopup) {
  if (!storyPopup?.applied) {
    return { applied: false, reason: storyPopup?.reason || null };
  }
  return {
    applied: true,
    outputPath: storyPopup.outputPath || null,
    point: storyPopup.point || null,
    clickOk: Boolean(storyPopup.click?.ok),
    screenshotPath: storyPopup.capture?.screenshotPath || null,
    closedStillDetected: captureLooksDismissibleStoryPopup(storyPopup.capture),
    containsDialogueChinese: captureHasDialogueChinese(storyPopup.capture)
  };
}

function summarizeLoadingSample(sample) {
  return {
    phase: sample.phase || null,
    delayMs: sample.delayMs,
    screenshotPath: sample.screenshotPath,
    ocrPath: sample.ocrPath,
    ocrText: String(sample.ocr?.text || "").slice(0, 300),
    stageCoverageRatio: sample.stage?.stageCoverageRatio ?? null,
    visualOk: Boolean(sample.visual?.ok),
    loadingCenter: sample.loadingCenter
  };
}

function summarizeF11(f11) {
  if (f11?.capture) {
    return {
      keyPath: f11.keyPath,
      keyOk: Boolean(f11.key?.ok),
      restoreWindowedBeforeKey: f11.restoreWindowedBeforeKey || { attempted: false },
      capture: summarizeCapture(f11.capture)
    };
  }
  return f11 || { skipped: true };
}

function captureSummaryLooksPluginCrash(summary) {
  return Boolean(
    summary?.pluginCrash ||
    /(?:Adobe Flash plugin has crashed|Reload the page to try again|Crash reporting disabled)/iu.test(String(summary?.ocrText || ""))
  );
}

function entryReportLooksRetryableStartupCrash(report) {
  if (!report || report.ok) {
    return false;
  }
  return Boolean(
    captureSummaryLooksPluginCrash(report.initial) ||
    captureSummaryLooksPluginCrash(report.scene)
  );
}

function summarizeEntryAttemptForRetry(report) {
  return {
    ok: Boolean(report?.ok),
    entryAttempt: report?.entryAttempt || 1,
    failedChecks: report?.failedChecks || [],
    initialScreenshotPath: report?.artifacts?.initialScreenshotPath || null,
    sceneScreenshotPath: report?.artifacts?.sceneScreenshotPath || null,
    initialPluginCrash: captureSummaryLooksPluginCrash(report?.initial),
    scenePluginCrash: captureSummaryLooksPluginCrash(report?.scene)
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const initialSize = parseSize(args.initialSize || args["initial-size"] || args.windowSize || args["window-size"], { width: 1186, height: 760 });
  const resizedSize = parseSize(args.resizedSize || args["resized-size"], { width: 1450, height: 900 });
  const visibleQaDefaults = configureVisibleQa(args, initialSize);
  const config = loadConfig();
  const qaDir = ensureQaDir("as3", "p0-playability");
  const runToken = String(Date.now());
  const runDir = ensureQaDir("as3", "p0-playability", `run-${runToken}`);
  const reportPath = path.join(qaDir, `as3-p0-playability-${runToken}.json`);
  const latestPath = path.join(qaDir, "as3-p0-playability-latest.json");
  const lock = acquireQaLock("as3-p0-playability.lock", {
    reportPath,
    artifactDir: runDir
  });

  try {
    ensureManagedWorkspace(config);
    await ensureFlashpointServices(config);
    await mountSourceZip(config, "as3");
    const manifest = generateLaunchManifest(config, { write: false });
    const entries = selectedEntries(manifest, args);
    if (!entries.length) {
      throw new Error("No AS3 direct-scene entries matched the P0 playability filter.");
    }
    const startedAt = new Date().toISOString();
    const reports = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entryRetries = Math.max(0, Math.round(Number(args.entryRetries || args["entry-retries"] || 1)));
      const entryAttempts = [];
      let entryReport = null;
      for (let attemptIndex = 0; attemptIndex <= entryRetries; attemptIndex += 1) {
        entryReport = await runEntry({
          config,
          entry: entries[index],
          index,
          total: entries.length,
          runDir,
          args,
          initialSize,
          resizedSize,
          visibleQaDefaults,
          entryAttempt: attemptIndex + 1
        });
        entryAttempts.push(entryReport);
        if (!entryReportLooksRetryableStartupCrash(entryReport) || attemptIndex >= entryRetries) {
          break;
        }
        stopNavigatorProcesses();
        await sleep(Number(args.entryRetrySettleMs || args["entry-retry-settle-ms"] || 5000));
      }
      if (entryAttempts.length > 1 && entryReport) {
        entryReport.entryRetry = {
          reason: "startup_flash_plugin_crash",
          attempts: entryAttempts.length,
          previousAttempts: entryAttempts.slice(0, -1).map(summarizeEntryAttemptForRetry)
        };
      }
      reports.push(entryReport);
      writeReport({ reportPath, latestPath, runDir, startedAt, reports });
      await sleep(Number(args.betweenMs || args["between-ms"] || 1000));
    }
    const report = writeReport({ reportPath, latestPath, runDir, startedAt, reports });
    printJson({ ...report, reportPath, latestPath });
    if (!report.ok && !flagEnabled(args.allowFailures || args["allow-failures"])) {
      process.exitCode = 1;
    }
  } catch (error) {
    stopNavigatorProcesses();
    const report = {
      ok: false,
      generatedAt: new Date().toISOString(),
      fatal: true,
      artifactDir: runDir,
      failedChecks: ["as3_p0_playability_fatal"],
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

function writeReport({ reportPath, latestPath, runDir, startedAt, reports }) {
  const report = {
    ok: reports.length > 0 && reports.every((entry) => entry.ok),
    generatedAt: new Date().toISOString(),
    startedAt,
    total: reports.length,
    passed: reports.filter((entry) => entry.ok).length,
    failed: reports.filter((entry) => !entry.ok).length,
    failedKeys: reports.filter((entry) => !entry.ok).map((entry) => entry.canonicalKey),
    artifactDir: runDir,
    reports
  };
  writeJson(reportPath, report);
  writeJson(latestPath, report);
  return report;
}

main().catch((error) => {
  stopNavigatorProcesses();
  printJson({
    ok: false,
    error: String(error.stack || error.message || error)
  });
  process.exit(1);
});
