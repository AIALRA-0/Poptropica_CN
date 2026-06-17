const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { generateLaunchManifest } = require("./lib/launch-manifest");
const { clearPoptropicaFlashState } = require("./lib/flash-state");
const { ensureQaDir, runPythonQa } = require("./lib/qa");
const { writeJson } = require("./lib/fs-utils");
const {
  ensureFlashpointServices,
  ensureManagedWorkspace,
  mountSourceZip,
  spawnManagedRuntime,
  stopNavigatorProcesses
} = require("./lib/flashpoint-runtime");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function flagEnabled(value) {
  return value === true || /^(1|true|yes|y)$/iu.test(String(value || ""));
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

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function safeFileSegment(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80) || "unknown";
}

function waitWindowArgs({ runtime, size, outputPath, timeoutMs }) {
  return [
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
    "--window-width",
    String(size.width),
    "--window-height",
    String(size.height),
    "--output",
    outputPath
  ];
}

function captureArgs({ runtime, handle, size, screenshotPath, metadataPath }) {
  const commandArgs = [
    "capture-window",
    "--handle",
    String(handle),
    "--process-names",
    runtime.processNames.join(","),
    "--title-contains",
    "poptropica",
    "--pid",
    String(runtime.pid),
    "--window-width",
    String(size.width),
    "--window-height",
    String(size.height),
    "--client-only",
    "--output",
    screenshotPath,
    "--metadata-output",
    metadataPath
  ];
  const captureChildClass = String(process.env.POPTROPICA_QA_CAPTURE_CHILD_CLASS || "GeckoFPSandboxChildWindow").trim();
  if (captureChildClass) {
    commandArgs.push("--child-class-contains", captureChildClass);
  }
  return commandArgs;
}

function locateOcrLine(ocr, pattern) {
  const regex = pattern instanceof RegExp ? pattern : new RegExp(String(pattern), "iu");
  const matches = (ocr?.lines || [])
    .filter((line) => regex.test(String(line.text || "")) && line.box)
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  return matches[0] || null;
}

function visibleEnglishLeakCheck(label, ocr, args) {
  const text = String(ocr?.text || "");
  const patternText = String(
    args.forbiddenVisiblePattern ||
    args["forbidden-visible-pattern"] ||
    "\\b(?:MENU|PRIZE|Store|Galactic Hot Dogs(?: Island)?)\\b"
  );
  const pattern = new RegExp(patternText, "iu");
  return {
    label,
    ok: !pattern.test(text),
    pattern: String(pattern),
    text: text.slice(0, 500)
  };
}

function fallbackMenuLine(capture, args) {
  if (flagEnabled(args.disableMenuFallback || args["disable-menu-fallback"])) {
    return null;
  }
  const width = Number(capture?.imageSize?.width || 0);
  if (!width) {
    return null;
  }
  const centerX = width - Number(args.menuFallbackRightInset || args["menu-fallback-right-inset"] || 51);
  const centerY = Number(args.menuFallbackTopCenter || args["menu-fallback-top-center"] || 86);
  const halfWidth = Number(args.menuFallbackHalfWidth || args["menu-fallback-half-width"] || 28);
  const halfHeight = Number(args.menuFallbackHalfHeight || args["menu-fallback-half-height"] || 16);
  return {
    text: "MENU",
    score: null,
    synthetic: true,
    reason: "top-right-menu-fallback",
    box: {
      left: centerX - halfWidth,
      top: centerY - halfHeight,
      right: centerX + halfWidth,
      bottom: centerY + halfHeight,
      width: halfWidth * 2,
      height: halfHeight * 2,
      centerX,
      centerY
    }
  };
}

function locateMenuLine({ ocr, capture, args }) {
  return locateOcrLine(ocr, /menu/iu) || fallbackMenuLine(capture, args);
}

function menuPlacementCheck(menuLine, capture, args) {
  const width = Number(capture?.imageSize?.width || 0);
  const height = Number(capture?.imageSize?.height || 0);
  const box = menuLine?.box || null;
  const maxRightInset = Number(args.maxMenuRightInset || args["max-menu-right-inset"] || 140);
  const maxTopInset = Number(args.maxMenuTopInset || args["max-menu-top-inset"] || 120);
  const minCenterRatio = Number(args.minMenuCenterRatio || args["min-menu-center-ratio"] || 0.82);
  const checks = [
    {
      name: menuLine?.synthetic ? "menu_fallback_candidate" : "menu_ocr_found",
      ok: Boolean(menuLine && box)
    },
    {
      name: "menu_inside_capture",
      ok: Boolean(box && box.left >= 0 && box.top >= 0 && box.right <= width && box.bottom <= height),
      box,
      imageSize: { width, height }
    },
    {
      name: "menu_right_anchor",
      ok: Boolean(box && (width - box.centerX) <= maxRightInset),
      observedRightInset: box ? Number((width - box.centerX).toFixed(3)) : null,
      maxRightInset
    },
    {
      name: "menu_center_ratio",
      ok: Boolean(box && width > 0 && (box.centerX / width) >= minCenterRatio),
      observedRatio: box && width > 0 ? Number((box.centerX / width).toFixed(6)) : null,
      minCenterRatio
    },
    {
      name: "menu_top_anchor",
      ok: Boolean(box && box.centerY <= maxTopInset),
      observedTopCenter: box ? box.centerY : null,
      maxTopInset
    }
  ];
  return {
    ok: checks.every((check) => check.ok),
    menu: menuLine,
    checks
  };
}

function chromeOffsetsFromCapture(capture, args) {
  const parentRect = capture?.window?.rect || null;
  const targetRect = capture?.targetWindow?.rect || null;
  return {
    x: targetRect && parentRect
      ? Number(targetRect.left || 0) - Number(parentRect.left || 0)
      : Number(args.browserChromeOffsetX || args["browser-chrome-offset-x"] || 0),
    y: targetRect && parentRect
      ? Number(targetRect.top || 0) - Number(parentRect.top || 0)
      : Number(args.browserChromeOffsetY || args["browser-chrome-offset-y"] || 110)
  };
}

function clickPointForMenu(menuLine, capture, args) {
  const box = menuLine?.box;
  if (!box) {
    return null;
  }
  const offsets = chromeOffsetsFromCapture(capture, args);
  return {
    x: Math.round(box.centerX + offsets.x),
    y: Math.round(box.centerY + offsets.y),
    screenshotX: Math.round(box.centerX),
    screenshotY: Math.round(box.centerY),
    browserChromeOffsetX: offsets.x,
    browserChromeOffsetY: offsets.y
  };
}

function clickPointForInventory(capture, menuLine, args) {
  const width = Number(capture?.imageSize?.width || 0);
  if (!width) {
    return null;
  }
  const offsets = chromeOffsetsFromCapture(capture, args);
  const inventoryRightInset = Number(args.inventoryButtonRightInset || args["inventory-button-right-inset"] || 130);
  const screenshotY = Math.round(menuLine?.box?.centerY || Number(args.menuFallbackTopCenter || args["menu-fallback-top-center"] || 86));
  const screenshotX = Math.round(width - inventoryRightInset);
  return {
    x: screenshotX + Math.round(offsets.x),
    y: screenshotY + Math.round(offsets.y),
    screenshotX,
    screenshotY,
    browserChromeOffsetX: offsets.x,
    browserChromeOffsetY: offsets.y,
    inventoryRightInset
  };
}

function clickPointForRightInset(capture, menuLine, rightInset, args) {
  const width = Number(capture?.imageSize?.width || 0);
  if (!width) {
    return null;
  }
  const offsets = chromeOffsetsFromCapture(capture, args);
  const screenshotY = Math.round(menuLine?.box?.centerY || Number(args.menuFallbackTopCenter || args["menu-fallback-top-center"] || 86));
  const screenshotX = Math.round(width - Number(rightInset));
  return {
    x: screenshotX + Math.round(offsets.x),
    y: screenshotY + Math.round(offsets.y),
    screenshotX,
    screenshotY,
    browserChromeOffsetX: offsets.x,
    browserChromeOffsetY: offsets.y,
    rightInset: Number(rightInset),
    insideCapture: screenshotX >= 0 && screenshotX <= width && screenshotY >= 0 && screenshotY <= Number(capture?.imageSize?.height || 0)
  };
}

function adaptiveHudTargetX(width, buttonCount, buttonIndex) {
  const newHudX = Number(width || 0) - 50;
  const safeCount = Math.max(1, Number(buttonCount || 8));
  const safeIndex = Math.max(0, Math.min(safeCount - 1, Number(buttonIndex || 0)));
  const leftPad = Math.max(18, Math.min(50, newHudX - 18));
  let spacing = (newHudX - leftPad) / safeCount;
  if (!Number.isFinite(spacing) || spacing <= 0) {
    spacing = 80;
  }
  spacing = Math.min(80, spacing);
  if (spacing < 24) {
    spacing = 24;
  }
  return Math.max(18, newHudX - spacing * (safeCount - safeIndex));
}

function clickPointForHudButtonIndex(capture, menuLine, args) {
  const rawIndex = args.secondaryButtonIndex ?? args["secondary-button-index"];
  if (rawIndex === undefined || rawIndex === null || rawIndex === "") {
    return null;
  }
  const width = Number(capture?.imageSize?.width || 0);
  if (!width) {
    return null;
  }
  const offsets = chromeOffsetsFromCapture(capture, args);
  const buttonCount = Number(args.secondaryButtonCount || args["secondary-button-count"] || 8);
  const buttonIndex = Number(rawIndex);
  const screenshotX = Math.round(adaptiveHudTargetX(width, buttonCount, buttonIndex));
  const screenshotY = Math.round(menuLine?.box?.centerY || Number(args.menuFallbackTopCenter || args["menu-fallback-top-center"] || 86));
  return {
    x: screenshotX + Math.round(offsets.x),
    y: screenshotY + Math.round(offsets.y),
    screenshotX,
    screenshotY,
    browserChromeOffsetX: offsets.x,
    browserChromeOffsetY: offsets.y,
    buttonIndex,
    buttonCount,
    insideCapture: screenshotX >= 0 && screenshotX <= width && screenshotY >= 0 && screenshotY <= Number(capture?.imageSize?.height || 0)
  };
}

function clickPointForTutorialWalk(capture, args) {
  const width = Number(capture?.imageSize?.width || 0);
  const height = Number(capture?.imageSize?.height || 0);
  if (!width || !height) {
    return null;
  }
  const offsets = chromeOffsetsFromCapture(capture, args);
  const xRatio = Number(args.tutorialWalkXRatio || args["tutorial-walk-x-ratio"] || 0.61);
  const yRatio = Number(args.tutorialWalkYRatio || args["tutorial-walk-y-ratio"] || 0.87);
  const screenshotX = Math.round(width * xRatio);
  const screenshotY = Math.round(height * yRatio);
  return {
    x: screenshotX + Math.round(offsets.x),
    y: screenshotY + Math.round(offsets.y),
    screenshotX,
    screenshotY,
    browserChromeOffsetX: offsets.x,
    browserChromeOffsetY: offsets.y,
    xRatio,
    yRatio
  };
}

function shouldDismissWalkTutorial(ocr, args) {
  if (flagEnabled(args.disableTutorialDismiss || args["disable-tutorial-dismiss"])) {
    return false;
  }
  return /CLICK\s+AND\s+HOLD\s+IN\s+FRONT\s+OF\s+AVATAR\s+TO\s+WALK/iu.test(String(ocr?.text || ""));
}

function clickPointForOcrLine(line, capture, args) {
  const box = line?.box;
  if (!box) {
    return null;
  }
  const offsets = chromeOffsetsFromCapture(capture, args);
  return {
    x: Math.round(box.centerX + offsets.x),
    y: Math.round(box.centerY + offsets.y),
    screenshotX: Math.round(box.centerX),
    screenshotY: Math.round(box.centerY),
    browserChromeOffsetX: offsets.x,
    browserChromeOffsetY: offsets.y
  };
}

function clickWindowPoint({ runtime, handle, point, outputPath, args, holdMs }) {
  const commandArgs = [
    "click-window",
    "--handle",
    String(handle),
    "--process-names",
    runtime.processNames.join(","),
    "--title-contains",
    "poptropica",
    "--pid",
    String(runtime.pid),
    "--x",
    String(point.x),
    "--y",
    String(point.y),
    "--hold-ms",
    String(holdMs ?? args.menuClickHoldMs ?? args["menu-click-hold-ms"] ?? 80),
    "--output",
    outputPath
  ];
  if (!flagEnabled(args.parentWindowClicks || args["parent-window-clicks"])) {
    const clickChildClass = String(args.clickChildClass || args["click-child-class"] || "GeckoFPSandboxChildWindow").trim();
    if (clickChildClass) {
      commandArgs.push("--child-class-contains", clickChildClass);
    } else {
      commandArgs.push("--largest-child");
    }
  }
  if (!flagEnabled(args.allowForegroundClicks || args["allow-foreground-clicks"])) {
    commandArgs.push("--post-message");
  }
  return runPythonQa(commandArgs, { timeoutMs: 30000 });
}

function clickMenu({ runtime, handle, point, outputPath, args }) {
  return clickWindowPoint({ runtime, handle, point, outputPath, args });
}

async function captureAndAnalyze({ runtime, handle, size, stem, runDir }) {
  const screenshotPath = path.join(runDir, `${stem}.png`);
  const capturePath = path.join(runDir, `${stem}-capture.json`);
  const ocrPath = path.join(runDir, `${stem}-ocr.json`);
  const capture = runPythonQa(captureArgs({
    runtime,
    handle,
    size,
    screenshotPath,
    metadataPath: capturePath
  }), { timeoutMs: 45000 });
  const ocr = runPythonQa([
    "ocr-image",
    "--input",
    screenshotPath,
    "--output",
    ocrPath
  ], { timeoutMs: 120000 });
  return { screenshotPath, capturePath, ocrPath, capture, ocr };
}

async function testEntry({ config, entry, index, total, runDir, args }) {
  const initialSize = parseSize(args.initialSize || args["initial-size"] || "1186x760", { width: 1186, height: 760 });
  const resizedSize = parseSize(args.resizedSize || args["resized-size"] || args.windowSize || args["window-size"] || "1450x900", { width: 1450, height: 900 });
  const safeStem = `${String(index + 1).padStart(2, "0")}-${safeFileSegment(entry.canonicalKey)}`;
  const windowBeforePath = path.join(runDir, `${safeStem}-window-before.json`);
  const windowAfterPath = path.join(runDir, `${safeStem}-window-after.json`);
  const clickPath = path.join(runDir, `${safeStem}-menu-click.json`);
  const startClickPath = path.join(runDir, `${safeStem}-start-click.json`);
  const postClickWindowPath = path.join(runDir, `${safeStem}-post-click-window.json`);
  const postClickDiffPath = path.join(runDir, `${safeStem}-post-click-diff.json`);
  const inventoryClickPath = path.join(runDir, `${safeStem}-inventory-click.json`);
  const secondaryClickPath = path.join(runDir, `${safeStem}-secondary-click.json`);
  const secondaryClickDiffPath = path.join(runDir, `${safeStem}-secondary-click-diff.json`);
  const tutorialClickPath = path.join(runDir, `${safeStem}-tutorial-walk-click.json`);
  const qaErrors = [];

  process.env.POPTROPICA_WINDOW_WIDTH = String(initialSize.width);
  process.env.POPTROPICA_WINDOW_HEIGHT = String(initialSize.height);
  clearPoptropicaFlashState({ reason: `qa-as3-hud-smoke:${entry.canonicalKey}` });
  const runtime = spawnManagedRuntime(config, "as3", entry.launchUrl, {
    detach: true,
    playerKey: "flashpointnavigator-as3"
  });

  try {
    const initialWindow = runPythonQa(waitWindowArgs({
      runtime,
      size: initialSize,
      outputPath: windowBeforePath,
      timeoutMs: Number(args.windowTimeoutMs || 90000)
    }), { timeoutMs: Number(args.windowTimeoutMs || 90000) + 5000 });

    await sleep(Number(args.initialSettleMs || args["initial-settle-ms"] || 45000));

    let initial = await captureAndAnalyze({
      runtime,
      handle: initialWindow.match.handle,
      size: initialSize,
      stem: `${safeStem}-initial`,
      runDir
    });
    let startClick = null;
    let startClickAttempts = [];
    let startClickPoint = null;
    let startedInitial = null;
    if (!flagEnabled(args.skipStart || args["skip-start"])) {
      const startLine = locateOcrLine(initial.ocr, /^START$/iu);
      startClickPoint = clickPointForOcrLine(startLine, initial.capture, args);
      if (startClickPoint) {
        const startClickCount = Math.max(1, Number(args.startClickCount || args["start-click-count"] || 2));
        for (let attemptIndex = 0; attemptIndex < startClickCount; attemptIndex += 1) {
          const outputPath = attemptIndex === startClickCount - 1
            ? startClickPath
            : path.join(runDir, `${safeStem}-start-click-${attemptIndex + 1}.json`);
          const attempt = clickWindowPoint({
            runtime,
            handle: initialWindow.match.handle,
            point: startClickPoint,
            outputPath,
            args,
            holdMs: Number(args.startClickHoldMs || args["start-click-hold-ms"] || 90)
          });
          startClickAttempts.push({ attempt: attemptIndex + 1, outputPath, click: attempt });
          startClick = attempt;
          if (attemptIndex < startClickCount - 1) {
            await sleep(Number(args.startClickRetryDelayMs || args["start-click-retry-delay-ms"] || 350));
          }
        }
        await sleep(Number(args.startClickWaitMs || args["start-click-wait-ms"] || 6500));
        startedInitial = await captureAndAnalyze({
          runtime,
          handle: initialWindow.match.handle,
          size: initialSize,
          stem: `${safeStem}-initial-after-start`,
          runDir
        });
        initial = startedInitial;
      }
    }
    const initialMenu = locateMenuLine({ ocr: initial.ocr, capture: initial.capture, args });
    const initialPlacement = menuPlacementCheck(initialMenu, initial.capture, args);

    const resizedWindow = runPythonQa(waitWindowArgs({
      runtime,
      size: resizedSize,
      outputPath: windowAfterPath,
      timeoutMs: Number(args.resizeWindowTimeoutMs || args["resize-window-timeout-ms"] || 15000)
    }), { timeoutMs: Number(args.resizeWindowTimeoutMs || args["resize-window-timeout-ms"] || 15000) + 5000 });

    await sleep(Number(args.resizeSettleMs || args["resize-settle-ms"] || 55000));

    let resized = await captureAndAnalyze({
      runtime,
      handle: resizedWindow.match.handle,
      size: resizedSize,
      stem: `${safeStem}-resized`,
      runDir
    });
    let tutorialClick = null;
    let resizedAfterTutorial = null;
    if (shouldDismissWalkTutorial(resized.ocr, args)) {
      const tutorialPoint = clickPointForTutorialWalk(resized.capture, args);
      if (tutorialPoint) {
        tutorialClick = clickWindowPoint({
          runtime,
          handle: resizedWindow.match.handle,
          point: tutorialPoint,
          outputPath: tutorialClickPath,
          args,
          holdMs: Number(args.tutorialWalkHoldMs || args["tutorial-walk-hold-ms"] || 1200)
        });
        await sleep(Number(args.tutorialDismissWaitMs || args["tutorial-dismiss-wait-ms"] || 5000));
        resizedAfterTutorial = await captureAndAnalyze({
          runtime,
          handle: resizedWindow.match.handle,
          size: resizedSize,
          stem: `${safeStem}-resized-after-tutorial`,
          runDir
        });
        resized = resizedAfterTutorial;
      }
    }
    const resizedMenu = locateMenuLine({ ocr: resized.ocr, capture: resized.capture, args });
    const resizedPlacement = menuPlacementCheck(resizedMenu, resized.capture, args);

    const clickPoint = clickPointForMenu(resizedMenu, resized.capture, args);
    let click = null;
    let postClick = null;
    let postClickDiff = null;
    let inventoryClick = null;
    let inventory = null;
    let secondaryClick = null;
    let secondary = null;
    let secondaryClickDiff = null;
    let clickResponsive = {
      ok: false,
      skipped: !clickPoint,
      reason: clickPoint ? null : "menu_ocr_missing"
    };
    if (clickPoint) {
      click = clickMenu({
        runtime,
        handle: resizedWindow.match.handle,
        point: clickPoint,
        outputPath: clickPath,
        args
      });
      await sleep(Number(args.clickWaitMs || args["click-wait-ms"] || 2800));
      const postClickWindow = runPythonQa(waitWindowArgs({
        runtime,
        size: resizedSize,
        outputPath: postClickWindowPath,
        timeoutMs: Number(args.postClickWindowTimeoutMs || args["post-click-window-timeout-ms"] || 10000)
      }), { timeoutMs: Number(args.postClickWindowTimeoutMs || args["post-click-window-timeout-ms"] || 10000) + 5000 });
      postClick = await captureAndAnalyze({
        runtime,
        handle: postClickWindow.match.handle,
        size: resizedSize,
        stem: `${safeStem}-post-click`,
        runDir
      });
      postClickDiff = runPythonQa([
        "compare-images",
        "--before",
        resized.screenshotPath,
        "--after",
        postClick.screenshotPath,
        "--threshold",
        String(args.clickDiffThreshold || args["click-diff-threshold"] || 20),
        "--output",
        postClickDiffPath
      ], { timeoutMs: 30000 });
      const minChangedPixelRatio = Number(args.minMenuClickChangedPixelRatio || args["min-menu-click-changed-pixel-ratio"] || 0.05);
      clickResponsive = {
        ok: Number(postClickDiff?.changedPixelRatio || 0) >= minChangedPixelRatio,
        skipped: false,
        minChangedPixelRatio,
        observedChangedPixelRatio: Number(postClickDiff?.changedPixelRatio || 0),
        postClickText: String(postClick.ocr?.text || "").slice(0, 500)
      };
      if (flagEnabled(args.inventoryCheck || args["inventory-check"])) {
        const inventoryPoint = clickPointForInventory(postClick.capture, resizedMenu, args);
        if (inventoryPoint) {
          inventoryClick = clickWindowPoint({
            runtime,
            handle: resizedWindow.match.handle,
            point: inventoryPoint,
            outputPath: inventoryClickPath,
            args,
            holdMs: Number(args.inventoryClickHoldMs || args["inventory-click-hold-ms"] || 80)
          });
          await sleep(Number(args.inventoryClickWaitMs || args["inventory-click-wait-ms"] || 4000));
          inventory = await captureAndAnalyze({
            runtime,
            handle: resizedWindow.match.handle,
            size: resizedSize,
            stem: `${safeStem}-inventory`,
            runDir
          });
        }
      }
      if (flagEnabled(args.secondaryClick || args["secondary-click"])) {
        const secondaryRightInset = Number(args.secondaryClickRightInset || args["secondary-click-right-inset"] || 130);
        const secondaryPoint = clickPointForHudButtonIndex(postClick.capture, resizedMenu, args) || clickPointForRightInset(postClick.capture, resizedMenu, secondaryRightInset, args);
        if (secondaryPoint) {
          secondaryClick = clickWindowPoint({
            runtime,
            handle: resizedWindow.match.handle,
            point: secondaryPoint,
            outputPath: secondaryClickPath,
            args,
            holdMs: Number(args.secondaryClickHoldMs || args["secondary-click-hold-ms"] || 90)
          });
          await sleep(Number(args.secondaryClickWaitMs || args["secondary-click-wait-ms"] || 4500));
          secondary = await captureAndAnalyze({
            runtime,
            handle: resizedWindow.match.handle,
            size: resizedSize,
            stem: `${safeStem}-secondary`,
            runDir
          });
          secondaryClickDiff = runPythonQa([
            "compare-images",
            "--before",
            postClick.screenshotPath,
            "--after",
            secondary.screenshotPath,
            "--threshold",
            String(args.secondaryClickDiffThreshold || args["secondary-click-diff-threshold"] || 20),
            "--output",
            secondaryClickDiffPath
          ], { timeoutMs: 30000 });
        }
      }
    }
    const inventoryText = String(inventory?.ocr?.text || "");
    const inventoryExpectedPattern = new RegExp(String(args.inventoryExpectedPattern || args["inventory-expected-pattern"] || "背包|岛屿|物品"), "u");
    const inventoryForbiddenPattern = /YOUR INVENTORY IS EMPTY|Your inventory is empty|EXPLORE THE ISLAND|Explore the island/iu;
    const inventoryCheck = flagEnabled(args.inventoryCheck || args["inventory-check"])
      ? {
          ok: Boolean(inventory && inventory.ocr?.containsChinese && inventoryExpectedPattern.test(inventoryText) && !inventoryForbiddenPattern.test(inventoryText)),
          skipped: false,
          point: inventoryClick?.point || null,
          containsChinese: Boolean(inventory?.ocr?.containsChinese),
          expectedPattern: String(inventoryExpectedPattern),
          forbiddenPattern: String(inventoryForbiddenPattern),
          text: inventoryText.slice(0, 500)
        }
      : {
          ok: true,
          skipped: true
        };
    const visibleEnglishChecks = flagEnabled(args.forbidVisibleEnglish || args["forbid-visible-english"])
      ? [
          visibleEnglishLeakCheck("initial", initial.ocr, args),
          visibleEnglishLeakCheck("resized", resized.ocr, args),
          ...(postClick?.ocr ? [visibleEnglishLeakCheck("post-click", postClick.ocr, args)] : []),
          ...(inventory?.ocr ? [visibleEnglishLeakCheck("inventory", inventory.ocr, args)] : []),
          ...(secondary?.ocr ? [visibleEnglishLeakCheck("secondary", secondary.ocr, args)] : [])
        ]
      : [];
    const visibleEnglishCheck = visibleEnglishChecks.length
      ? {
          ok: visibleEnglishChecks.every((check) => check.ok),
          skipped: false,
          checks: visibleEnglishChecks
        }
      : {
          ok: true,
          skipped: true,
          checks: []
        };
    const secondaryExpectedPatternText = String(args.secondaryClickExpectedPattern || args["secondary-click-expected-pattern"] || "").trim();
    const secondaryExpectedPattern = secondaryExpectedPatternText ? new RegExp(secondaryExpectedPatternText, "iu") : null;
    const secondaryClickCheck = flagEnabled(args.secondaryClick || args["secondary-click"])
      ? {
          ok: Boolean(
            secondaryClick &&
            secondary?.ocr &&
            (
              Number(secondaryClickDiff?.changedPixelRatio || 0) >= Number(args.minSecondaryClickChangedPixelRatio || args["min-secondary-click-changed-pixel-ratio"] || 0.01) ||
              (secondaryExpectedPattern && secondaryExpectedPattern.test(String(secondary.ocr?.text || "")))
            )
          ),
          skipped: false,
          label: String(args.secondaryClickLabel || args["secondary-click-label"] || "secondary"),
          point: secondaryClick?.point || null,
          expectedPattern: secondaryExpectedPattern ? String(secondaryExpectedPattern) : null,
          minChangedPixelRatio: Number(args.minSecondaryClickChangedPixelRatio || args["min-secondary-click-changed-pixel-ratio"] || 0.01),
          observedChangedPixelRatio: Number(secondaryClickDiff?.changedPixelRatio || 0),
          text: String(secondary?.ocr?.text || "").slice(0, 500)
        }
      : {
          ok: true,
          skipped: true
        };

    const failedChecks = [
      ...(!initialPlacement.ok ? ["initial_menu_placement_failed"] : []),
      ...(!resizedPlacement.ok ? ["resized_menu_placement_failed"] : []),
      ...(!clickResponsive.ok ? ["menu_click_response_failed"] : []),
      ...(!inventoryCheck.ok ? ["inventory_chinese_check_failed"] : []),
      ...(!visibleEnglishCheck.ok ? ["visible_english_forbidden_failed"] : []),
      ...(!secondaryClickCheck.ok ? ["secondary_click_response_failed"] : [])
    ];

    return {
      ok: failedChecks.length === 0,
      index: index + 1,
      total,
      canonicalKey: entry.canonicalKey,
      launchUrl: entry.launchUrl,
      initialSize,
      resizedSize,
      runtime: {
        pid: runtime.pid,
        playerKey: runtime.playerKey
      },
      artifacts: {
        windowBeforePath,
        windowAfterPath,
        clickPath: click ? clickPath : null,
        inventoryClickPath: inventoryClick ? inventoryClickPath : null,
        secondaryClickPath: secondaryClick ? secondaryClickPath : null,
        secondaryClickDiffPath: secondaryClickDiff ? secondaryClickDiffPath : null,
        tutorialClickPath: tutorialClick ? tutorialClickPath : null,
        startClickPath: startClick ? startClickPath : null,
        postClickWindowPath: postClick ? postClickWindowPath : null,
        postClickDiffPath: postClickDiff ? postClickDiffPath : null,
        initialScreenshotPath: initial.screenshotPath,
        startedInitialScreenshotPath: startedInitial?.screenshotPath || null,
        resizedScreenshotPath: resized.screenshotPath,
        resizedAfterTutorialScreenshotPath: resizedAfterTutorial?.screenshotPath || null,
        postClickScreenshotPath: postClick?.screenshotPath || null,
        inventoryScreenshotPath: inventory?.screenshotPath || null,
        inventoryOcrPath: inventory?.ocrPath || null,
        secondaryScreenshotPath: secondary?.screenshotPath || null,
        secondaryOcrPath: secondary?.ocrPath || null
      },
      initial: {
        capture: initial.capture,
        ocr: initial.ocr,
        menuPlacement: initialPlacement,
        startClick: {
          point: startClickPoint,
          click: startClick,
          attempts: startClickAttempts,
          applied: Boolean(startClick)
        }
      },
      resized: {
        capture: resized.capture,
        ocr: resized.ocr,
        menuPlacement: resizedPlacement,
        tutorialDismiss: {
          applied: Boolean(tutorialClick),
          click: tutorialClick,
          afterOcr: resizedAfterTutorial?.ocr || null
        }
      },
      menuClick: {
        point: clickPoint,
        click,
        responsive: clickResponsive,
        postClickOcr: postClick?.ocr || null,
        postClickDiff,
        inventory: {
          click: inventoryClick,
          check: inventoryCheck,
          ocr: inventory?.ocr || null
        },
        secondary: {
          click: secondaryClick,
          check: secondaryClickCheck,
          ocr: secondary?.ocr || null,
          diff: secondaryClickDiff
        },
        visibleEnglishCheck
      },
      failedChecks,
      qaErrors
    };
  } catch (error) {
    qaErrors.push({
      message: String(error.message || error),
      stdout: String(error.stdout || "").slice(0, 2000),
      stderr: String(error.stderr || "").slice(0, 4000)
    });
    return {
      ok: false,
      index: index + 1,
      total,
      canonicalKey: entry.canonicalKey,
      launchUrl: entry.launchUrl,
      initialSize,
      resizedSize,
      runtime: {
        pid: runtime.pid,
        playerKey: runtime.playerKey
      },
      failedChecks: ["qa_hud_flow_failed"],
      qaErrors
    };
  } finally {
    if (!flagEnabled(args.keepOpen || args["keep-open"])) {
      stopNavigatorProcesses();
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetMonitor = String(args.targetMonitor || args.monitor || process.env.POPTROPICA_QA_MONITOR || "G32QC").trim();
  if (targetMonitor) {
    process.env.POPTROPICA_QA_MONITOR = targetMonitor;
  }
  if (!flagEnabled(args.allowForegroundCapture) && !process.env.POPTROPICA_QA_NO_FOREGROUND) {
    process.env.POPTROPICA_QA_NO_FOREGROUND = "1";
  }

  const config = loadConfig();
  ensureManagedWorkspace(config);
  await ensureFlashpointServices(config);
  await mountSourceZip(config, "as3");

  const selectedIds = new Set(splitCsv(args.islands || args.island));
  const manifest = generateLaunchManifest(config, { write: false });
  let entries = manifest.entries
    .filter((entry) => entry.sourceGroup === "as3" && entry.launchable && entry.launchMode === "as3-direct-scene")
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey, "en"));
  if (selectedIds.size) {
    entries = entries.filter((entry) => selectedIds.has(entry.canonicalKey));
  }
  if (!entries.length) {
    throw new Error("No AS3 launchable entries matched the HUD smoke filter.");
  }

  const runToken = String(Date.now());
  const qaDir = ensureQaDir("as3", "hud-smoke");
  const runDir = ensureQaDir("as3", "hud-smoke", `run-${runToken}`);
  const reportPath = path.join(qaDir, `as3-hud-smoke-${runToken}.json`);
  const latestPath = path.join(qaDir, "as3-hud-smoke-latest.json");
  const startedAt = new Date().toISOString();
  const reports = [];
  for (let index = 0; index < entries.length; index += 1) {
    reports.push(await testEntry({ config, entry: entries[index], index, total: entries.length, runDir, args }));
  }
  const report = {
    ok: reports.every((entry) => entry.ok),
    generatedAt: new Date().toISOString(),
    startedAt,
    total: reports.length,
    passed: reports.filter((entry) => entry.ok).length,
    failed: reports.filter((entry) => !entry.ok).length,
    targetMonitor: targetMonitor || null,
    failedKeys: reports.filter((entry) => !entry.ok).map((entry) => entry.canonicalKey),
    artifactDir: runDir,
    reports
  };
  writeJson(reportPath, report);
  writeJson(latestPath, report);
  printJson({ ...report, reportPath, latestPath });
  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
