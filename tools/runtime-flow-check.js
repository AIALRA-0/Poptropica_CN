const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const electronBinary = require("electron");
const { _electron: electron } = require("playwright");
const paths = require("./lib/paths");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { ensureDirSync, writeJson } = require("./lib/fs-utils");
const { ensureManagedWorkspace, ensureFlashpointServices, mountSourceZip, proxyRequest, spawnManagedRuntime } = require("./lib/flashpoint-runtime");
const { resolveCliWindowGeometry, withWindowGeometryEnv } = require("./lib/runtime-window-geometry");

const GAME_SERVER_LOG_PATH = path.join(paths.managedLogsDir, "flashpoint-game-server.log");
const QA_HELPER_PATH = path.join(paths.toolsRoot, "qa-helper.py");
const CLICK_SCRIPT_PATH = path.join(paths.toolsRoot, "click-window.ps1");
const PRINT_WINDOW_SCRIPT_PATH = path.join(paths.toolsRoot, "print-window.ps1");
const LAUNCH_SCRIPT_PATH = path.join(paths.toolsRoot, "launch.js");

const LAUNCHER_ACTION_POINTS = {
  "new-player": { x: 650, y: 568 },
  "returning-player": { x: 804, y: 571 },
  boy: { x: 611, y: 693 },
  girl: { x: 988, y: 698 },
  ok: { x: 1090, y: 705 }
};

const SUPER_POWER_VIEWPORT_WIDTH = 1010;
const SUPER_POWER_VIEWPORT_HEIGHT = 645;
const RUNTIME_CLICK_PROCESS_NAMES = "flashpointnavigator.exe,fpnavigator.exe,flashpointsecureplayer.exe,basilisk.exe,basiliskii.exe,firefox.exe";

const SUPER_POWER_ACTIONS = {
  "downtown-left": {
    kind: "stage",
    viewport: "super-gameplay",
    points: [{ x: 0.08, y: 0.82 }, { x: 0.02, y: 0.56 }],
    expectedLogFragment: "sceneSuperMain.swf",
    expectedScene: "SuperMain",
    settleMs: 20000,
    followupDelayMs: 1800
  },
  "supermain-right": {
    kind: "stage",
    viewport: "super-gameplay",
    points: [{ x: 0.92, y: 0.82 }, { x: 0.98, y: 0.56 }],
    expectedLogFragment: "sceneDownTown.swf",
    expectedScene: "DownTown",
    settleMs: 20000,
    followupDelayMs: 1800
  },
  "downtown-bank": {
    kind: "stage",
    viewport: "super-gameplay",
    points: [{ x: 0.88, y: 0.72 }, { x: 0.88, y: 0.66 }],
    expectedLogFragment: "sceneBank.swf",
    expectedScene: "Bank",
    settleMs: 20000,
    followupDelayMs: 1500
  },
  "bank-exit": {
    kind: "stage",
    viewport: "super-gameplay",
    points: [{ x: 0.50, y: 0.82 }, { x: 0.50, y: 0.90 }],
    expectedLogFragment: "sceneDownTown.swf",
    expectedScene: "DownTown",
    settleMs: 20000,
    followupDelayMs: 1500
  },
  "supermain-comic": {
    kind: "stage",
    viewport: "super-gameplay",
    points: [{ x: 0.64, y: 0.66 }, { x: 0.64, y: 0.66 }],
    expectedLogFragment: "sceneComic.swf",
    expectedScene: "Comic",
    settleMs: 20000,
    followupDelayMs: 1500
  },
  "comic-exit": {
    kind: "stage",
    viewport: "super-gameplay",
    points: [{ x: 0.90, y: 0.76 }, { x: 0.96, y: 0.76 }],
    expectedLogFragment: "sceneSuperMain.swf",
    expectedScene: "SuperMain",
    settleMs: 20000,
    followupDelayMs: 1500
  },
  "supermain-costume": {
    kind: "stage",
    viewport: "super-gameplay",
    points: [{ x: 0.33, y: 0.66 }, { x: 0.33, y: 0.66 }],
    expectedLogFragment: "sceneCostume.swf",
    expectedScene: "Costume",
    settleMs: 20000,
    followupDelayMs: 1500
  },
  "costume-exit": {
    kind: "stage",
    viewport: "super-gameplay",
    points: [{ x: 0.90, y: 0.76 }, { x: 0.96, y: 0.76 }],
    expectedLogFragment: "sceneSuperMain.swf",
    expectedScene: "SuperMain",
    settleMs: 20000,
    followupDelayMs: 1500
  },
  "downtown-station": {
    kind: "stage",
    viewport: "super-gameplay",
    points: [{ x: 0.96, y: 0.62 }, { x: 0.89, y: 0.80 }],
    expectedLogFragment: "sceneStation.swf",
    expectedScene: "Station",
    settleMs: 20000,
    followupDelayMs: 1800
  },
  "station-exit": {
    kind: "stage",
    viewport: "super-gameplay",
    point: { x: 0.50, y: 0.18 },
    expectedLogFragment: "sceneDownTown.swf",
    expectedScene: "DownTown",
    settleMs: 17000
  },
  "downtown-right": {
    kind: "stage",
    viewport: "super-gameplay",
    points: [{ x: 0.92, y: 0.82 }, { x: 0.98, y: 0.56 }],
    expectedLogFragment: "scenePark.swf",
    expectedScene: "Park",
    settleMs: 20000,
    followupDelayMs: 1800
  },
  "park-left": {
    kind: "stage",
    viewport: "super-gameplay",
    points: [{ x: 0.08, y: 0.82 }, { x: 0.02, y: 0.56 }],
    expectedLogFragment: "sceneDownTown.swf",
    expectedScene: "DownTown",
    settleMs: 20000,
    followupDelayMs: 1800
  },
  "park-right": {
    kind: "stage",
    viewport: "super-gameplay",
    points: [{ x: 0.92, y: 0.82 }, { x: 0.98, y: 0.58 }],
    expectedLogFragment: "sceneJunkyard.swf",
    expectedScene: "Junkyard",
    settleMs: 20000,
    followupDelayMs: 1600
  },
  "junkyard-left": {
    kind: "stage",
    viewport: "super-gameplay",
    points: [{ x: 0.08, y: 0.82 }, { x: 0.02, y: 0.58 }],
    expectedLogFragment: "scenePark.swf",
    expectedScene: "Park",
    settleMs: 20000,
    followupDelayMs: 1800
  }
};

const SUPER_POWER_MATRIX = [
  "downtown-left",
  "supermain-comic",
  "comic-exit",
  "supermain-costume",
  "costume-exit",
  "supermain-right",
  "downtown-bank",
  "bank-exit",
  "downtown-right",
  "park-right",
  "junkyard-left",
  "park-left",
  "downtown-station",
  "station-exit"
];

const SUPER_POWER_SCENE_MARKERS = {
  DownTown: ["sceneDownTown.swf", "scene=Down%20Town", "THE BANK", "MAIN STREET"],
  SuperMain: ["sceneSuperMain.swf", "scene=Main%20Street", "DOWN TOWN", "COMIC SHOP", "COSTUME SHOP"],
  Bank: ["sceneBank.swf", "scene=The%20Bank", "THE BANK", "ENTER"],
  Comic: ["sceneComic.swf", "scene=The%20Comic%20Shop", "COMIC SHOP", "COMICS", "MASKS", "READING IS FUN"],
  Costume: ["sceneCostume.swf", "scene=The%20Costume%20Shop", "COSTUME SHOP", "COSTUMES", "SORRY, WE'RE", "CLOSED"],
  Station: ["sceneStation.swf", "scene=Subway%20Station", "SUBWAY", "STATION"],
  Park: ["scenePark.swf", "scene=City%20Park", "JUNKYARD", "CITY PARK"],
  Junkyard: ["sceneJunkyard.swf", "scene=The%20Junkyard", "JUNKYARD"]
};

function normalizeSceneMarkerText(value) {
  return String(value || "")
    .replace(/\s+/gu, " ")
    .trim()
    .toUpperCase();
}

function flagEnabled(value) {
  if (value === true) {
    return true;
  }
  if (value === false || value === undefined || value === null) {
    return false;
  }
  return /^(1|true|yes|y|on)$/iu.test(String(value).trim());
}

function resolveWindowSize(args = {}) {
  const sizeMatch = String(args.windowSize || args["window-size"] || "").match(/^(\d+)x(\d+)$/iu);
  const width = Number(args.windowWidth || args["window-width"] || (sizeMatch ? sizeMatch[1] : 0));
  const height = Number(args.windowHeight || args["window-height"] || (sizeMatch ? sizeMatch[2] : 0));
  return {
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : null,
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : null
  };
}

function resolveQaWindowOptions(args = {}) {
  const targetMonitor = String(args.targetMonitor || args.monitor || process.env.POPTROPICA_QA_MONITOR || "G32QC").trim();
  const noForeground = flagEnabled(args.noForeground || args["no-foreground"] || args.noForegroundCapture || args["no-foreground-capture"] || process.env.POPTROPICA_QA_NO_FOREGROUND);
  const postMessageClicks = !flagEnabled(args.allowMouseClicks || args["allow-mouse-clicks"]) && !flagEnabled(args.cursorClicks || args["cursor-clicks"]);
  const size = resolveWindowSize(args);
  const maximize = flagEnabled(args.maximizeWindow || args["maximize-window"] || args.maximize);

  if (targetMonitor) {
    process.env.POPTROPICA_QA_MONITOR = targetMonitor;
  }
  if (noForeground) {
    process.env.POPTROPICA_QA_NO_FOREGROUND = "1";
  }
  if (postMessageClicks && !process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS) {
    process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS = "1";
  }

  return {
    targetMonitor: targetMonitor || null,
    width: size.width,
    height: size.height,
    maximize,
    noForeground,
    postMessageClicks
  };
}

function appendQaWindowArgs(commandArgs, options = {}) {
  if (options.targetMonitor) {
    commandArgs.push("--target-monitor", String(options.targetMonitor));
  }
  if (options.width) {
    commandArgs.push("--window-width", String(options.width));
  }
  if (options.height) {
    commandArgs.push("--window-height", String(options.height));
  }
  if (options.maximize) {
    commandArgs.push("--maximize");
  }
  return commandArgs;
}

function focusWindowIfAllowed(handle, options = {}) {
  if (options.noForeground) {
    return;
  }
  focusWindow(handle);
}

function runPowershell(command, timeout = 30000) {
  return spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
    timeout
  });
}

function runPowershellFile(file, args = [], timeout = 30000) {
  return spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout
  });
}

function runPythonQa(args, timeout = 60000) {
  const pythonBinary = process.env.PYTHON || "python";
  const result = spawnSync(pythonBinary, [QA_HELPER_PATH, ...args], {
    cwd: paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8"
    }
  });
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  if (result.status !== 0) {
    const error = new Error(stderr || stdout || "Python QA helper failed.");
    error.stdout = stdout;
    error.stderr = stderr;
    error.status = result.status;
    throw error;
  }
  return stdout ? JSON.parse(stdout) : null;
}

function stopRuntimeProcesses() {
  runPowershell([
    "$targets = Get-CimInstance Win32_Process | Where-Object {",
    "  $_.Name -in @(",
    "    'electron.exe',",
    "    'FlashpointSecurePlayer.exe',",
    "    'FPNavigator.exe',",
    "    'flashpointnavigator.exe',",
    "    'BasiliskII.exe',",
    "    'plugin-container.exe'",
    "  )",
    "};",
    "foreach ($target in $targets) {",
    "  try { Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop } catch {}",
    "}",
    "Start-Sleep -Milliseconds 800"
  ].join(" "), 25000);
}

function getRuntimeWindows() {
  const result = runPowershell([
    "$rows = Get-Process FlashpointSecurePlayer,FPNavigator,flashpointnavigator -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } |",
    "Select-Object ProcessName, Id, MainWindowTitle, MainWindowHandle;",
    "$rows | ConvertTo-Json -Depth 4"
  ].join(" "), 20000);
  if (result.status !== 0 || !result.stdout.trim()) {
    return [];
  }
  return [].concat(JSON.parse(result.stdout)).filter(Boolean);
}

function focusWindow(handle) {
  runPowershell([
    "Add-Type -TypeDefinition \"using System; using System.Runtime.InteropServices; public static class WinApi { [DllImport(\\\"user32.dll\\\")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport(\\\"user32.dll\\\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow); }\";",
    `$h=[IntPtr]::new(${handle});`,
    "[WinApi]::ShowWindowAsync($h, 9) | Out-Null;",
    "[WinApi]::SetForegroundWindow($h) | Out-Null;"
  ].join(" "), 10000);
}

function readLogTailFromOffset(logPath, byteOffset) {
  if (!fs.existsSync(logPath)) {
    return "";
  }
  const stat = fs.statSync(logPath);
  if (stat.size <= byteOffset) {
    return "";
  }
  const fd = fs.openSync(logPath, "r");
  try {
    const length = stat.size - byteOffset;
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, byteOffset);
    return buffer.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

async function waitForLogFragment(logPath, byteOffset, fragment, timeoutMs = 20000, pollMs = 600) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tail = readLogTailFromOffset(logPath, byteOffset);
    if (tail.includes(fragment)) {
      return {
        matched: true,
        fragment,
        tail
      };
    }
    await sleep(pollMs);
  }
  return {
    matched: false,
    fragment,
    tail: readLogTailFromOffset(logPath, byteOffset)
  };
}

function getLauncherClickPoint(action) {
  return LAUNCHER_ACTION_POINTS[action] || null;
}

function expandActions(actions) {
  const expanded = [];
  for (const action of actions) {
    if (action === "super-power-matrix") {
      expanded.push(...SUPER_POWER_MATRIX);
      continue;
    }
    expanded.push(action);
  }
  return expanded;
}

function getStageAction(action) {
  return SUPER_POWER_ACTIONS[action] || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLaunchButtonEnabled(page, buttonLabel, timeoutMs) {
  await page.waitForFunction((label) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const target = buttons.find((button) => (button.textContent || "").trim() === label);
    return Boolean(target && !target.disabled);
  }, buttonLabel, { timeout: timeoutMs });
}

async function ensureRuntimeReady(page, buttonLabel, timeoutMs = 120000) {
  const readyBadge = page.locator("#readyBadge");
  const prepareButton = page.locator("#prepareButton");

  try {
    await waitForLaunchButtonEnabled(page, buttonLabel, timeoutMs);
    return;
  } catch (_error) {
    if (await prepareButton.isVisible().catch(() => false)) {
      const disabled = await prepareButton.isDisabled().catch(() => true);
      if (!disabled) {
        await prepareButton.click();
      } else {
        await page.evaluate(async () => {
          await window.flashLauncher.prepareRuntime();
        });
      }
    } else {
      await page.evaluate(async () => {
        await window.flashLauncher.prepareRuntime();
      });
    }
  }

  await waitForLaunchButtonEnabled(page, buttonLabel, timeoutMs);
  await readyBadge.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
}

async function waitForRuntimeWindow(timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const windows = getRuntimeWindows();
    if (windows.length > 0) {
      return windows[0];
    }
    await sleep(1000);
  }
  return null;
}

function getStageViewportRect(stage, stepDefinition, captureMeta) {
  const stageRect = stage?.stageRect || {};
  const imageSize = captureMeta?.imageSize || {};
  if (stepDefinition?.viewport === "client-full") {
    return {
      left: 0,
      top: 0,
      width: Number(imageSize.width || stageRect.right || stageRect.width || 0),
      height: Number(imageSize.height || stageRect.bottom || stageRect.height || 0)
    };
  }
  if (stepDefinition?.viewport === "super-gameplay") {
    const clientWidth = Number(imageSize.width || stageRect.width || 0);
    const clientHeight = Number(imageSize.height || stageRect.height || 0);
    const viewportWidth = Math.min(SUPER_POWER_VIEWPORT_WIDTH, clientWidth);
    const viewportHeight = Math.min(SUPER_POWER_VIEWPORT_HEIGHT, clientHeight);
    return {
      left: Math.round(Math.max(0, (clientWidth - viewportWidth) / 2)),
      top: Math.round(Math.max(0, (clientHeight - viewportHeight) / 2)),
      width: viewportWidth,
      height: viewportHeight
    };
  }
  return {
    left: Number(stageRect.left || 0),
    top: Number(stageRect.top || 0),
    width: Number(stageRect.width || 0),
    height: Number(stageRect.height || 0)
  };
}

function captureClickOffset(captureMeta) {
  const mode = String(captureMeta?.captureMode || "").toLowerCase();
  const className = String(captureMeta?.window?.className || "").toLowerCase();
  if (mode === "client" && className.includes("mozillawindowclass")) {
    return { x: 0, y: 110 };
  }
  return { x: 0, y: 0 };
}

function stagePointToWindowPoint(stage, relativePoint, stepDefinition, captureMeta) {
  const viewportRect = getStageViewportRect(stage, stepDefinition, captureMeta);
  const clickOffset = captureClickOffset(captureMeta);
  return {
    x: Math.round(clickOffset.x + viewportRect.left + viewportRect.width * relativePoint.x),
    y: Math.round(clickOffset.y + viewportRect.top + viewportRect.height * relativePoint.y)
  };
}

function captureStageBundle(handle, reportDir, stem, options = {}) {
  const screenshotPath = path.join(reportDir, `${stem}.png`);
  const captureMetaPath = path.join(reportDir, `${stem}-capture.json`);
  const stageMetaPath = path.join(reportDir, `${stem}-stage.json`);
  const ocrMetaPath = path.join(reportDir, `${stem}-ocr.json`);
  const captureArgs = [
    "capture-window",
    "--handle", String(handle),
    "--client-only",
    "--output", screenshotPath,
    "--metadata-output", captureMetaPath
  ];
  if (options.processNames) {
    captureArgs.push("--process-names", String(options.processNames));
  }
  if (options.titleContains) {
    captureArgs.push("--title-contains", String(options.titleContains));
  }
  if (options.pid) {
    captureArgs.push("--pid", String(options.pid));
  }
  appendQaWindowArgs(captureArgs, options);
  const capture = runPythonQa(captureArgs, 70000);
  const stage = runPythonQa([
    "analyze-stage",
    "--input", screenshotPath,
    "--output", stageMetaPath
  ], 70000);
  const ocr = runPythonQa([
    "ocr-image",
    "--input", screenshotPath,
    "--output", ocrMetaPath
  ], 70000);
  return {
    screenshotPath,
    captureMetaPath,
    stageMetaPath,
    ocrMetaPath,
    capture,
    stage,
    ocr
  };
}

function clickWindowPoint(handle, point, options = {}) {
  const args = [
    "click-window",
    "--handle", String(handle),
    "--x", String(point.x),
    "--y", String(point.y)
  ];
  if (options.processNames) {
    args.push("--process-names", String(options.processNames));
  }
  if (options.titleContains) {
    args.push("--title-contains", String(options.titleContains));
  }
  if (options.pid) {
    args.push("--pid", String(options.pid));
  }
  appendQaWindowArgs(args, options);
  if (options.postMessageClicks) {
    args.push("--post-message");
  } else if (options.restoreCursor !== false) {
    args.push("--restore-cursor");
  }
  const click = runPythonQa(args, 20000);
  return {
    point,
    output: click
  };
}

function sendWindowKeys(handle, keys, delayMs = 250) {
  const escapedKeys = String(keys || "").replace(/'/g, "''");
  const result = runPowershell([
    "$wshell = New-Object -ComObject WScript.Shell;",
    "Start-Sleep -Milliseconds 180;",
    `$wshell.SendKeys('${escapedKeys}');`,
    `Start-Sleep -Milliseconds ${Math.max(0, Number(delayMs || 0))};`
  ].join(" "), 15000);
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    keys
  };
}

function keyWindow(handle, keys, options = {}) {
  const args = [
    "key-window",
    "--handle", String(handle),
    "--key", String(keys || "")
  ];
  if (options.processNames) {
    args.push("--process-names", String(options.processNames));
  }
  if (options.titleContains) {
    args.push("--title-contains", String(options.titleContains));
  }
  if (options.pid) {
    args.push("--pid", String(options.pid));
  }
  appendQaWindowArgs(args, options);
  if (options.postMessageClicks) {
    args.push("--post-message");
  }
  const output = runPythonQa(args, 20000);
  return {
    ok: true,
    output,
    keys
  };
}

function logTailMatchesExpectedScene(stepDefinition, logResult) {
  const expectedScene = String(stepDefinition?.expectedScene || "");
  if (!expectedScene) {
    return false;
  }
  const tail = normalizeSceneMarkerText(logResult?.tail || "");
  if (!tail) {
    return false;
  }
  const markers = SUPER_POWER_SCENE_MARKERS[expectedScene] || [];
  return markers.some((marker) => tail.includes(normalizeSceneMarkerText(marker)));
}

function ocrMatchesExpectedScene(stepDefinition, afterBundle) {
  const expectedScene = String(stepDefinition?.expectedScene || "");
  if (!expectedScene) {
    return false;
  }
  const ocrText = normalizeSceneMarkerText(afterBundle?.ocr?.text || "");
  if (!ocrText) {
    return false;
  }
  const markers = SUPER_POWER_SCENE_MARKERS[expectedScene] || [];
  return markers.some((marker) => ocrText.includes(normalizeSceneMarkerText(marker)));
}

function classifyStepSuccess(stepDefinition, logResult, afterBundle) {
  const ocrText = String(afterBundle?.ocr?.text || "");
  const hasLoadingText = /loading/iu.test(ocrText);
  const logMatched = Boolean(logResult?.matched) || logTailMatchesExpectedScene(stepDefinition, logResult);
  const ocrMatched = ocrMatchesExpectedScene(stepDefinition, afterBundle);
  return {
    ok: (!stepDefinition.expectedLogFragment || logMatched || ocrMatched) && !hasLoadingText,
    hasLoadingText,
    ocrText,
    logMatched,
    ocrMatched
  };
}

async function runStageAction({
  actionName,
  handle,
  runtimePid,
  reportDir,
  sequenceIndex,
  delayMs,
  windowOptions,
  fallbackWaitMs
}) {
  const stepDefinition = getStageAction(actionName);
  if (!stepDefinition) {
    throw new Error(`Unsupported action: ${actionName}`);
  }

  const windowFilter = {
    processNames: RUNTIME_CLICK_PROCESS_NAMES,
    pid: runtimePid,
    ...windowOptions
  };
  const beforeBundle = captureStageBundle(handle, reportDir, `${String(sequenceIndex).padStart(2, "0")}-${actionName}-before`, windowFilter);
  const activeHandle = Number(beforeBundle.capture?.window?.handle || handle);
  const logStartOffset = fs.existsSync(GAME_SERVER_LOG_PATH) ? fs.statSync(GAME_SERVER_LOG_PATH).size : 0;
  const clickPlan = (Array.isArray(stepDefinition.points) ? stepDefinition.points : [stepDefinition.point]).filter(Boolean);
  const clickSequence = [];
  const followupDelayMs = Number(stepDefinition.followupDelayMs || Math.min(1800, Math.max(600, Math.round((stepDefinition.settleMs || fallbackWaitMs) / 8))));
  for (let index = 0; index < clickPlan.length; index += 1) {
    focusWindowIfAllowed(activeHandle, windowFilter);
    const point = stagePointToWindowPoint(beforeBundle.stage, clickPlan[index], stepDefinition, beforeBundle.capture);
    clickSequence.push(clickWindowPoint(activeHandle, point, windowFilter));
    if (index + 1 < clickPlan.length) {
      await sleep(followupDelayMs);
    }
  }

  const logResult = stepDefinition.expectedLogFragment
    ? await waitForLogFragment(GAME_SERVER_LOG_PATH, logStartOffset, stepDefinition.expectedLogFragment, stepDefinition.settleMs || fallbackWaitMs)
    : null;

  await sleep(stepDefinition.settleMs || fallbackWaitMs);
  const afterBundle = captureStageBundle(activeHandle, reportDir, `${String(sequenceIndex).padStart(2, "0")}-${actionName}-after`, windowFilter);
  const verdict = classifyStepSuccess(stepDefinition, logResult, afterBundle);

  return {
    action: actionName,
    kind: stepDefinition.kind,
    expectedScene: stepDefinition.expectedScene || null,
    expectedLogFragment: stepDefinition.expectedLogFragment || null,
    clickResult: clickSequence.length === 1 ? clickSequence[0] : clickSequence,
    before: {
      screenshotPath: beforeBundle.screenshotPath,
      stageRect: beforeBundle.stage.stageRect,
      viewportRect: getStageViewportRect(beforeBundle.stage, stepDefinition, beforeBundle.capture),
      stageCoverageRatio: beforeBundle.stage.stageCoverageRatio,
      ocrText: beforeBundle.ocr.text
    },
    after: {
      screenshotPath: afterBundle.screenshotPath,
      stageRect: afterBundle.stage.stageRect,
      viewportRect: getStageViewportRect(afterBundle.stage, stepDefinition, afterBundle.capture),
      stageCoverageRatio: afterBundle.stage.stageCoverageRatio,
      ocrText: afterBundle.ocr.text
    },
    logResult,
    verdict
  };
}

async function runKeyAction({
  actionName,
  handle,
  runtimePid,
  reportDir,
  sequenceIndex,
  windowOptions,
  fallbackWaitMs
}) {
  const stepDefinition = getStageAction(actionName);
  if (!stepDefinition) {
    throw new Error(`Unsupported action: ${actionName}`);
  }

  const windowFilter = {
    processNames: RUNTIME_CLICK_PROCESS_NAMES,
    pid: runtimePid,
    ...windowOptions
  };
  const beforeBundle = captureStageBundle(handle, reportDir, `${String(sequenceIndex).padStart(2, "0")}-${actionName}-before`, windowFilter);
  const activeHandle = Number(beforeBundle.capture?.window?.handle || handle);
  const beforeViewport = getStageViewportRect(beforeBundle.stage, stepDefinition, beforeBundle.capture);
  const logStartOffset = fs.existsSync(GAME_SERVER_LOG_PATH) ? fs.statSync(GAME_SERVER_LOG_PATH).size : 0;
  focusWindowIfAllowed(activeHandle, windowFilter);
  if (beforeViewport.width > 0 && beforeViewport.height > 0) {
    const clickOffset = captureClickOffset(beforeBundle.capture);
    clickWindowPoint(activeHandle, {
      x: Math.round(clickOffset.x + beforeViewport.left + beforeViewport.width / 2),
      y: Math.round(clickOffset.y + beforeViewport.top + beforeViewport.height / 2)
    }, windowFilter);
    await sleep(220);
  }
  const keyResult = windowFilter.postMessageClicks
    ? keyWindow(activeHandle, stepDefinition.key, windowFilter)
    : sendWindowKeys(activeHandle, stepDefinition.key, 400);
  const logResult = stepDefinition.expectedLogFragment
    ? await waitForLogFragment(GAME_SERVER_LOG_PATH, logStartOffset, stepDefinition.expectedLogFragment, stepDefinition.settleMs || fallbackWaitMs)
    : null;
  await sleep(stepDefinition.settleMs || fallbackWaitMs);
  const afterBundle = captureStageBundle(activeHandle, reportDir, `${String(sequenceIndex).padStart(2, "0")}-${actionName}-after`, windowFilter);
  const verdict = classifyStepSuccess(stepDefinition, logResult, afterBundle);

  return {
    action: actionName,
    kind: stepDefinition.kind,
    expectedScene: stepDefinition.expectedScene || null,
    expectedLogFragment: stepDefinition.expectedLogFragment || null,
    keyResult,
    before: {
      screenshotPath: beforeBundle.screenshotPath,
      stageRect: beforeBundle.stage.stageRect,
      viewportRect: getStageViewportRect(beforeBundle.stage, stepDefinition, beforeBundle.capture),
      stageCoverageRatio: beforeBundle.stage.stageCoverageRatio,
      ocrText: beforeBundle.ocr.text
    },
    after: {
      screenshotPath: afterBundle.screenshotPath,
      stageRect: afterBundle.stage.stageRect,
      viewportRect: getStageViewportRect(afterBundle.stage, stepDefinition, afterBundle.capture),
      stageCoverageRatio: afterBundle.stage.stageCoverageRatio,
      ocrText: afterBundle.ocr.text
    },
    logResult,
    verdict
  };
}

async function runLauncherAction(actionName, handle, delayMs, waitMs, windowOptions = {}) {
  const point = getLauncherClickPoint(actionName);
  if (!point) {
    throw new Error(`Unsupported action: ${actionName}`);
  }
  const clickResult = clickWindowPoint(handle, point, windowOptions);
  await sleep(delayMs);
  await sleep(waitMs);
  return {
    action: actionName,
    kind: "launcher",
    clickResult
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceGroup = String(args.source || "as3").toLowerCase();
  const qaWindowOptions = resolveQaWindowOptions(args);
  const islandId = args.island ? String(args.island).toLowerCase() : null;
  const directLaunchUrl = args.launchUrl
    ? String(args.launchUrl)
    : args.room
      ? `http://www.poptropica.com/base.php?room=${encodeURIComponent(String(args.room))}&island=${encodeURIComponent(String(args.launchIsland || "Super"))}&startup_path=${encodeURIComponent(String(args.startupPath || "gameplay"))}`
      : null;
  const buttonLabel = sourceGroup === "as2" ? "进入 AS2" : "进入 AS3";
  const env = {
    ...process.env,
    NODE_NO_WARNINGS: "1",
    POPTROPICA_UI_TEST: "1"
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const rawActions = args.action
    ? String(args.action)
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const actions = expandActions(rawActions);

  const reportDir = ensureDirSync(path.join(paths.runtimeDataDir, "ui-checks", "runtime-flow"));
  const reportPath = path.join(reportDir, `${sourceGroup}-${actions.join("-") || "entry"}-report.json`);
  const startupWaitMs = Number(args.startupWaitMs || 12000);
  const perActionDelayMs = Number(args.delayMs || 800);
  const perActionWaitMs = Number(args.waitMs || 6000);

  stopRuntimeProcesses();
  let app = null;

  try {
    if (directLaunchUrl) {
      const config = loadConfig();
      ensureManagedWorkspace(config);
      const services = await ensureFlashpointServices(config);
      if (!services.healthy.proxy || !services.healthy.zip || !services.healthy.php) {
        throw new Error(`Runtime services are not healthy. See logs in ${paths.managedLogsDir}`);
      }
      await mountSourceZip(config, sourceGroup);
      const startupHealth = await proxyRequest(directLaunchUrl);
      if (startupHealth.statusCode < 200 || startupHealth.statusCode >= 400) {
        throw new Error(`Direct launch URL failed with status ${startupHealth.statusCode}`);
      }
      const runtimeGeometry = resolveCliWindowGeometry(args, sourceGroup);
      withWindowGeometryEnv(runtimeGeometry, () => {
        spawnManagedRuntime(config, sourceGroup, directLaunchUrl, { detach: true });
      });
    } else if (islandId) {
      const launch = spawnSync(process.execPath, [LAUNCH_SCRIPT_PATH, "--island", islandId], {
        cwd: paths.projectRoot,
        encoding: "utf8",
        windowsHide: true,
        timeout: Number(args.launchTimeoutMs || 120000),
        env
      });
      if (launch.status !== 0) {
        throw new Error((launch.stderr || launch.stdout || `Failed to launch island ${islandId}`).trim());
      }
    } else {
      app = await electron.launch({
        executablePath: electronBinary,
        args: [path.join(paths.launcherRoot, "main.js")],
        cwd: paths.projectRoot,
        env
      });

      const page = await app.firstWindow();
      await page.waitForSelector(`text=${buttonLabel}`, { timeout: 30000 });
      await ensureRuntimeReady(page, buttonLabel, Number(args.readyTimeoutMs || 120000));
      await page.getByRole("button", { name: buttonLabel }).click();
    }

    const runtimeWindow = await waitForRuntimeWindow(30000);
    if (!runtimeWindow?.MainWindowHandle?.value && !runtimeWindow?.MainWindowHandle) {
      throw new Error("No visible runtime window was found.");
    }

    let handle = Number(runtimeWindow.MainWindowHandle.value || runtimeWindow.MainWindowHandle);
    const runtimePid = Number(runtimeWindow.Id?.value || runtimeWindow.Id || 0) || null;
    const runtimeWindowFilter = {
      processNames: RUNTIME_CLICK_PROCESS_NAMES,
      pid: runtimePid,
      ...qaWindowOptions
    };
    focusWindowIfAllowed(handle, runtimeWindowFilter);
    await sleep(startupWaitMs);

    const initialBundle = captureStageBundle(handle, reportDir, `${sourceGroup}-initial`, runtimeWindowFilter);
    handle = Number(initialBundle.capture?.window?.handle || handle);
    const actionResults = [];

    for (let index = 0; index < actions.length; index += 1) {
      const actionName = actions[index];
      const stepDefinition = getStageAction(actionName);
      let result;
      if (!stepDefinition) {
        result = await runLauncherAction(actionName, handle, perActionDelayMs, perActionWaitMs, runtimeWindowFilter);
      } else if (stepDefinition.kind === "key") {
        result = await runKeyAction({
          actionName,
          handle,
          runtimePid,
          reportDir,
          sequenceIndex: index + 1,
          windowOptions: qaWindowOptions,
          fallbackWaitMs: perActionWaitMs
        });
      } else {
        result = await runStageAction({
          actionName,
          handle,
          runtimePid,
          reportDir,
          sequenceIndex: index + 1,
          delayMs: perActionDelayMs,
          windowOptions: qaWindowOptions,
          fallbackWaitMs: perActionWaitMs
        });
      }
      actionResults.push(result);
      focusWindowIfAllowed(handle, runtimeWindowFilter);
    }

    const failedActions = actionResults.filter((result) => result.verdict && !result.verdict.ok);
    const report = {
      ok: failedActions.length === 0,
      sourceGroup,
      islandId,
      actions,
      runtimeWindow,
      logPath: GAME_SERVER_LOG_PATH,
      initial: {
        screenshotPath: initialBundle.screenshotPath,
        stageRect: initialBundle.stage.stageRect,
        stageCoverageRatio: initialBundle.stage.stageCoverageRatio,
        ocrText: initialBundle.ocr.text
      },
      actionResults,
      failedActions: failedActions.map((result) => ({
        action: result.action,
        expectedScene: result.expectedScene,
        expectedLogFragment: result.expectedLogFragment,
        hasLoadingText: result.verdict?.hasLoadingText || false,
        logMatched: result.logResult?.matched || false,
        afterOcrText: result.after?.ocrText || ""
      }))
    };

    writeJson(reportPath, report);
    printJson(report);
    if (!report.ok) {
      process.exitCode = 2;
    }
  } finally {
    stopRuntimeProcesses();
    if (app) {
      await app.close().catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
