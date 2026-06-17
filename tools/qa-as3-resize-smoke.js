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

function clickPointForOcrLine(line, args, capture = null) {
  const box = line?.box;
  if (!box) {
    return null;
  }
  const parentRect = capture?.window?.rect || null;
  const targetRect = capture?.targetWindow?.rect || null;
  const browserChromeOffsetY = targetRect && parentRect
    ? Number(targetRect.top || 0) - Number(parentRect.top || 0)
    : Number(args.browserChromeOffsetY || args["browser-chrome-offset-y"] || 110);
  const browserChromeOffsetX = targetRect && parentRect
    ? Number(targetRect.left || 0) - Number(parentRect.left || 0)
    : Number(args.browserChromeOffsetX || args["browser-chrome-offset-x"] || 0);
  return {
    x: Math.round(box.centerX + browserChromeOffsetX),
    y: Math.round(box.centerY + browserChromeOffsetY),
    screenshotX: Math.round(box.centerX),
    screenshotY: Math.round(box.centerY),
    browserChromeOffsetX,
    browserChromeOffsetY
  };
}

function isTransientLoadingFailure(stage, visual) {
  const coverage = Number(stage?.stageCoverageRatio || 0);
  const rightDark = Number(visual?.regions?.rightMargin?.darkPct || 0);
  const bottomDark = Number(visual?.regions?.bottomMargin?.darkPct || 0);
  const cornerDark = Number(visual?.regions?.bottomRightCorner?.darkPct || 0);
  return !visual?.ok && (coverage < 0.2 || rightDark > 90 || bottomDark > 90 || cornerDark > 90);
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
    String(holdMs ?? args.clickHoldMs ?? args["click-hold-ms"] ?? 90),
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

async function captureAndOcr({ runtime, handle, size, stem, runDir }) {
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
  const startClickPath = path.join(runDir, `${safeStem}-start-click.json`);
  const preInteractionPath = path.join(runDir, `${safeStem}-pre-interaction.json`);
  const screenshotPath = path.join(runDir, `${safeStem}-after-resize.png`);
  const capturePath = path.join(runDir, `${safeStem}-capture.json`);
  const stagePath = path.join(runDir, `${safeStem}-stage.json`);
  const visualPath = path.join(runDir, `${safeStem}-visual.json`);
  const qaErrors = [];

  process.env.POPTROPICA_WINDOW_WIDTH = String(initialSize.width);
  process.env.POPTROPICA_WINDOW_HEIGHT = String(initialSize.height);
  clearPoptropicaFlashState({ reason: `qa-as3-resize-smoke:${entry.canonicalKey}` });
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

    let initial = null;
    let startClick = null;
    let startClickAttempts = [];
    let startClickPoint = null;
    let preInteraction = null;
    let preInteractionPoint = null;
    if (!flagEnabled(args.skipStart || args["skip-start"])) {
      initial = await captureAndOcr({
        runtime,
        handle: initialWindow.match.handle,
        size: initialSize,
        stem: `${safeStem}-initial`,
        runDir
      });
      const startLine = locateOcrLine(initial.ocr, /^START$/iu);
      startClickPoint = clickPointForOcrLine(startLine, args, initial.capture);
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
      }
    }
    if (entry.canonicalKey === "monkey-wrench" && !flagEnabled(args.skipWalkTutorial || args["skip-walk-tutorial"])) {
      const imageWidth = Number(initial?.capture?.imageSize?.width || initialSize.width);
      const imageHeight = Number(initial?.capture?.imageSize?.height || initialSize.height);
      const parentRect = initial?.capture?.window?.rect || null;
      const targetRect = initial?.capture?.targetWindow?.rect || null;
      const browserChromeOffsetY = targetRect && parentRect
        ? Number(targetRect.top || 0) - Number(parentRect.top || 0)
        : Number(args.browserChromeOffsetY || args["browser-chrome-offset-y"] || 110);
      const browserChromeOffsetX = targetRect && parentRect
        ? Number(targetRect.left || 0) - Number(parentRect.left || 0)
        : Number(args.browserChromeOffsetX || args["browser-chrome-offset-x"] || 0);
      preInteractionPoint = {
        x: Math.round(imageWidth * Number(args.walkTutorialXRatio || args["walk-tutorial-x-ratio"] || 0.61) + browserChromeOffsetX),
        y: Math.round(imageHeight * Number(args.walkTutorialYRatio || args["walk-tutorial-y-ratio"] || 0.87) + browserChromeOffsetY),
        browserChromeOffsetX,
        browserChromeOffsetY
      };
      preInteraction = clickWindowPoint({
        runtime,
        handle: initialWindow.match.handle,
        point: preInteractionPoint,
        outputPath: preInteractionPath,
        args,
        holdMs: Number(args.walkTutorialHoldMs || args["walk-tutorial-hold-ms"] || 1500)
      });
      await sleep(Number(args.walkTutorialWaitMs || args["walk-tutorial-wait-ms"] || 8000));
    }

    const resizedWindow = runPythonQa(waitWindowArgs({
      runtime,
      size: resizedSize,
      outputPath: windowAfterPath,
      timeoutMs: Number(args.resizeWindowTimeoutMs || args["resize-window-timeout-ms"] || 15000)
    }), { timeoutMs: Number(args.resizeWindowTimeoutMs || args["resize-window-timeout-ms"] || 15000) + 5000 });

    await sleep(Number(args.resizeSettleMs || args["resize-settle-ms"] || 55000));

    let finalScreenshotPath = screenshotPath;
    let finalCapturePath = capturePath;
    let finalStagePath = stagePath;
    let finalVisualPath = visualPath;
    let capture = null;
    let stage = null;
    let visual = null;
    const resizeCaptureAttempts = [];
    const resizeCaptureRetries = Math.max(0, Number(args.resizeCaptureRetries || args["resize-capture-retries"] || 2));
    for (let attemptIndex = 0; attemptIndex <= resizeCaptureRetries; attemptIndex += 1) {
      if (attemptIndex > 0) {
        await sleep(Number(args.resizeRetrySettleMs || args["resize-retry-settle-ms"] || 65000));
      }
      finalScreenshotPath = attemptIndex === 0
        ? screenshotPath
        : path.join(runDir, `${safeStem}-after-resize-retry-${attemptIndex}.png`);
      finalCapturePath = attemptIndex === 0
        ? capturePath
        : path.join(runDir, `${safeStem}-capture-retry-${attemptIndex}.json`);
      finalStagePath = attemptIndex === 0
        ? stagePath
        : path.join(runDir, `${safeStem}-stage-retry-${attemptIndex}.json`);
      finalVisualPath = attemptIndex === 0
        ? visualPath
        : path.join(runDir, `${safeStem}-visual-retry-${attemptIndex}.json`);
      capture = runPythonQa(captureArgs({
        runtime,
        handle: resizedWindow.match.handle,
        size: resizedSize,
        screenshotPath: finalScreenshotPath,
        metadataPath: finalCapturePath
      }), { timeoutMs: 45000 });
      stage = runPythonQa([
        "analyze-stage",
        "--input",
        finalScreenshotPath,
        "--output",
        finalStagePath
      ], { timeoutMs: 30000 });
      visual = runPythonQa([
        "analyze-visual-guard",
        "--input",
        finalScreenshotPath,
        "--output",
        finalVisualPath,
        "--edge-ratio",
        String(args.visualGuardEdgeRatio || args["visual-guard-edge-ratio"] || 0.18),
        "--white-threshold",
        String(args.visualGuardWhiteThreshold || args["visual-guard-white-threshold"] || 245),
        "--max-white-edge-pct",
        String(args.maxWhiteEdgePct || args["max-white-edge-pct"] || 60),
        "--dark-threshold",
        String(args.visualGuardDarkThreshold || args["visual-guard-dark-threshold"] || 16),
        "--max-dark-edge-pct",
        String(args.maxDarkEdgePct || args["max-dark-edge-pct"] || 45),
        "--target-color",
        String(args.stageBackgroundColor || args["stage-background-color"] || "139ffd"),
        "--target-tolerance",
        String(args.stageBackgroundTolerance || args["stage-background-tolerance"] || 8),
        "--max-target-edge-pct",
        String(args.maxStageBackgroundEdgePct || args["max-stage-background-edge-pct"] || 45)
      ], { timeoutMs: 30000 });
      resizeCaptureAttempts.push({
        attempt: attemptIndex + 1,
        screenshotPath: finalScreenshotPath,
        capturePath: finalCapturePath,
        stagePath: finalStagePath,
        visualPath: finalVisualPath,
        stageCoverageRatio: Number(stage?.stageCoverageRatio || 0),
        visualOk: Boolean(visual?.ok),
        transientLoadingFailure: isTransientLoadingFailure(stage, visual)
      });
      if (stage?.ok && visual?.ok) {
        break;
      }
      if (!isTransientLoadingFailure(stage, visual)) {
        break;
      }
    }

    return {
      ok: Boolean(stage?.ok) && Boolean(visual?.ok),
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
        initialScreenshotPath: initial?.screenshotPath || null,
        initialCapturePath: initial?.capturePath || null,
        initialOcrPath: initial?.ocrPath || null,
        startClickPath: startClick ? startClickPath : null,
        preInteractionPath: preInteraction ? preInteractionPath : null,
        screenshotPath: finalScreenshotPath,
        capturePath: finalCapturePath,
        stagePath: finalStagePath,
        visualPath: finalVisualPath,
        resizeCaptureAttempts
      },
      initial: initial ? {
        capture: initial.capture,
        ocr: initial.ocr,
        startClick: {
          point: startClickPoint,
          click: startClick,
          attempts: startClickAttempts,
          applied: Boolean(startClick)
        },
        preInteraction: {
          point: preInteractionPoint,
          click: preInteraction,
          applied: Boolean(preInteraction)
        }
      } : null,
      resizedWindow,
      capture,
      stage,
      visual,
      resizeCaptureAttempts,
      failedChecks: [
        ...(!stage?.ok ? ["stage_not_detected"] : []),
        ...(!visual?.ok ? ["visual_guard_failed"] : [])
      ],
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
      artifacts: {
        windowBeforePath,
        windowAfterPath,
        startClickPath: null,
        preInteractionPath: null,
        screenshotPath,
        capturePath,
        stagePath,
        visualPath
      },
      failedChecks: ["qa_resize_flow_failed"],
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

  const selectedIds = new Set(splitCsv(args.islands || args.island || "galactic-hot-dogs"));
  const manifest = generateLaunchManifest(config, { write: false });
  let entries = manifest.entries
    .filter((entry) => entry.sourceGroup === "as3" && entry.launchable && entry.launchMode === "as3-direct-scene")
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey, "en"));
  if (selectedIds.size) {
    entries = entries.filter((entry) => selectedIds.has(entry.canonicalKey));
  }
  if (!entries.length) {
    throw new Error("No AS3 launchable entries matched the resize smoke filter.");
  }

  const runToken = String(Date.now());
  const qaDir = ensureQaDir("as3", "resize-smoke");
  const runDir = ensureQaDir("as3", "resize-smoke", `run-${runToken}`);
  const reportPath = path.join(qaDir, `as3-resize-smoke-${runToken}.json`);
  const latestPath = path.join(qaDir, "as3-resize-smoke-latest.json");
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
