const fs = require("node:fs");
const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { ensureQaDir, getProjectRevision, runPythonQa, spawnPythonQa, waitForPythonChild } = require("./lib/qa");
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

const GAME_SERVER_LOG_PATH = path.join(
  require("./lib/paths").managedLogsDir,
  "flashpoint-game-server.log"
);
const PROJECT_REVISION = getProjectRevision();

function flagEnabled(value) {
  return value === true || /^(1|true|yes|on)$/iu.test(String(value || ""));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readLogSegment(filePath, startOffset) {
  try {
    const endOffset = fs.statSync(filePath).size;
    if (endOffset <= startOffset) return "";
    const fd = fs.openSync(filePath, "r");
    try {
      const length = Math.min(endOffset - startOffset, 4 * 1024 * 1024);
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

function summarizeRuntimeLog(segment) {
  const lines = String(segment || "").split(/\r?\n/gu).filter(Boolean);
  const offlineRuntimeHosts = new Set([
    "www.poptropica.com",
    "poptropica.com",
    "127.0.0.1",
    "localhost",
    "flash.quantserve.com",
    "quantserve.com"
  ]);
  const suspicious = lines.filter((line) =>
    /(?:getURL|javascript:|_blank|_new|window\.open|https?:\/\/)/iu.test(line)
  );
  const external = suspicious.filter((line) => {
    const urls = String(line).match(/https?:\/\/[^\s"'<>]+/giu) || [];
    const externalUrl = urls.some((value) => {
      try {
        const host = new URL(value).hostname.toLowerCase();
        return !offlineRuntimeHosts.has(host);
      } catch (_error) {
        return true;
      }
    });
    // getURL/window.open by itself is expected for the legacy shell.  Only
    // mark it external when the call contains an actual external URL or an
    // explicitly unsafe javascript/new-window target.
    return externalUrl ||
      /(?:javascript:|_blank|_new)/iu.test(line);
  });
  const missing = lines.filter((line) =>
    /\b(?:Status\s*=\s*404|ENOENT|not found|missing)\b/iu.test(line) &&
    !/flashpoint-gmp-dummy\.xml/iu.test(line)
  );
  return {
    lineCount: lines.length,
    missingCount: missing.length,
    missingSamples: missing.slice(0, 20),
    suspiciousCallCount: suspicious.length,
    suspiciousSamples: suspicious.slice(0, 40),
    externalCallCount: external.length,
    externalSamples: external.slice(0, 40),
    lastLines: lines.slice(-30)
  };
}

function captureClickOffset(capture) {
  const mode = String(capture?.captureMode || "").toLowerCase();
  const className = String(capture?.window?.className || "").toLowerCase();
  if (mode === "client" && className.includes("mozillawindowclass")) {
    return { x: 0, y: 110 };
  }
  return { x: 0, y: 0 };
}

function stagePoint(capture, stage, x, y) {
  const offset = captureClickOffset(capture);
  const rect = stage?.stageRect;
  if (!rect) return null;
  return {
    x: Math.round(offset.x + rect.left + rect.width * x),
    y: Math.round(offset.y + rect.top + rect.height * y)
  };
}

function waitWindowArgs(runtime, outputPath, timeoutMs, width, height) {
  const args = [
    "wait-window",
    "--process-names", runtime.processNames.join(","),
    "--title-contains", "poptropica",
    "--pid", String(runtime.pid),
    "--timeout-ms", String(timeoutMs),
    "--poll-ms", "250",
    "--output", outputPath
  ];
  if (width && height) {
    args.push("--window-width", String(width), "--window-height", String(height));
  }
  return args;
}

function captureArgs(runtime, handle, screenshotPath, metadataPath) {
  return [
    "capture-window",
    "--handle", String(handle),
    "--process-names", runtime.processNames.join(","),
    "--title-contains", "poptropica",
    "--pid", String(runtime.pid),
    "--client-only",
    "--output", screenshotPath,
    "--metadata-output", metadataPath
  ];
}

function clickArgs(runtime, handle, point, outputPath) {
  return [
    "click-window",
    "--handle", String(handle),
    "--process-names", runtime.processNames.join(","),
    "--title-contains", "poptropica",
    "--pid", String(runtime.pid),
    "--x", String(point.x),
    "--y", String(point.y),
    "--post-message",
    "--output", outputPath
  ];
}

function keyArgs(runtime, handle, key, outputPath) {
  return [
    "key-window",
    "--handle", String(handle),
    "--process-names", runtime.processNames.join(","),
    "--title-contains", "poptropica",
    "--pid", String(runtime.pid),
    "--key", key,
    "--post-message",
    "--output", outputPath
  ];
}

function actionSucceeded(action) {
  if (!action || action.ok === false) {
    return false;
  }
  if (action.result && action.result.ok === false) {
    return false;
  }
  return true;
}

async function runCase({ config, entry, sourceGroup, runDir, durationMs, args }) {
  const stem = `${sourceGroup}-${entry.canonicalKey}`;
  const outputPath = path.join(runDir, `${stem}.json`);
  const windowPath = path.join(runDir, `${stem}-window.json`);
  const resizeWindowPath = path.join(runDir, `${stem}-resize-window.json`);
  const screenshotPath = path.join(runDir, `${stem}-initial.png`);
  const capturePath = path.join(runDir, `${stem}-initial-capture.json`);
  const stagePath = path.join(runDir, `${stem}-stage.json`);
  const logPath = path.join(runDir, `${stem}.log`);
  const logOffset = (() => {
    try { return fs.statSync(GAME_SERVER_LOG_PATH).size; } catch (_error) { return 0; }
  })();
  clearPoptropicaFlashState({ reason: `qa-popup-regression:${stem}` });
  const launchHealth = await proxyRequest(entry.launchUrl);
  const runtime = spawnManagedRuntime(config, sourceGroup, entry.launchUrl, {
    detach: true,
    playerKey: sourceGroup === "as3" ? "flashpointnavigator-as3" : "flashpointnavigator-as2"
  });
  const actions = [];
  let runtimeWindow = null;
  let capture = null;
  let stage = null;
  let monitor = null;
  let monitorError = null;
  try {
    try {
      runtimeWindow = runPythonQa(
        waitWindowArgs(runtime, windowPath, Number(args.windowTimeoutMs || 60000)),
        { timeoutMs: Number(args.windowTimeoutMs || 60000) + 5000 }
      );
    } catch (error) {
      runtimeWindow = { match: null, error: String(error.message || error) };
    }

    if (runtimeWindow?.match?.handle) {
      const settleMs = Math.max(0, Number(
        args.settleMs ||
        args["settle-ms"] ||
        (sourceGroup === "as3" ? 22000 : 8000)
      ));
      if (settleMs > 0) {
        await sleep(settleMs);
      }
      try {
        capture = runPythonQa(
          captureArgs(runtime, runtimeWindow.match.handle, screenshotPath, capturePath),
          { timeoutMs: 45000 }
        );
        stage = runPythonQa([
          "analyze-stage", "--input", screenshotPath, "--output", stagePath
        ], { timeoutMs: 30000 });
      } catch (error) {
        actions.push({ name: "initial-capture", ok: false, error: String(error.message || error) });
      }
    }

    const monitorChild = spawnPythonQa([
      "window-audit",
      "--duration-ms", String(durationMs),
      "--interval-ms", String(args.intervalMs || 250),
      "--output", outputPath.replace(/\.json$/u, "-window-audit.json")
    ]);
    const monitorStartedAt = Date.now();
    monitor = waitForPythonChild(monitorChild).catch((error) => {
      monitorError = String(error.message || error);
      return null;
    });

    if (sourceGroup === "as3" && runtimeWindow?.match?.handle && stage?.stageRect && capture) {
      const handle = runtimeWindow.match.handle;
      const dialoguePoint = stagePoint(capture, stage, 0.42, 0.74);
      const mapPoint = stagePoint(capture, stage, 0.96, 0.10);
      if (dialoguePoint) {
        try {
          const result = runPythonQa(
            clickArgs(runtime, handle, dialoguePoint, path.join(runDir, `${stem}-dialogue-click.json`)),
            { timeoutMs: 30000 }
          );
          actions.push({
            name: "dialogue",
            ok: result?.ok !== false,
            result
          });
        } catch (error) {
          actions.push({ name: "dialogue", ok: false, error: String(error.message || error) });
        }
        await sleep(1200);
      }
      if (mapPoint) {
        try {
          const result = runPythonQa(
            clickArgs(runtime, handle, mapPoint, path.join(runDir, `${stem}-map-click.json`)),
            { timeoutMs: 30000 }
          );
          actions.push({
            name: "map",
            ok: result?.ok !== false,
            result
          });
        } catch (error) {
          actions.push({ name: "map", ok: false, error: String(error.message || error) });
        }
        await sleep(1200);
        try {
          const result = runPythonQa(
            keyArgs(runtime, handle, "Escape", path.join(runDir, `${stem}-map-close.json`)),
            { timeoutMs: 30000 }
          );
          actions.push({
            name: "map-close",
            ok: result?.ok !== false,
            result
          });
        } catch (error) {
          actions.push({ name: "map-close", ok: false, error: String(error.message || error) });
        }
      }
      try {
        const resized = runPythonQa(
          waitWindowArgs(runtime, resizeWindowPath, 15000, Number(args.resizeWidth || 1450), Number(args.resizeHeight || 900)),
          { timeoutMs: 20000 }
        );
        actions.push({ name: "resize", ok: Boolean(resized?.match) && resized?.ok !== false, result: resized });
      } catch (error) {
        actions.push({ name: "resize", ok: false, error: String(error.message || error) });
      }
    }

    await sleep(Math.max(0, Number(durationMs || 60000) - (Date.now() - monitorStartedAt)));
    const audit = await monitor;
    const logSegment = readLogSegment(GAME_SERVER_LOG_PATH, logOffset);
    fs.writeFileSync(logPath, logSegment, "utf8");
    const logSummary = summarizeRuntimeLog(logSegment);
    const popupSummary = audit?.summary || {};
    const actionFailures = actions.filter((action) => !actionSucceeded(action));
    const ok = Number(launchHealth?.statusCode || 0) === 200 &&
      Boolean(runtimeWindow?.match?.handle) &&
      !monitorError &&
      popupSummary.popupStormDetected !== true &&
      popupSummary.shellPopupSeen !== true &&
      Number(popupSummary.maxNavigatorWindowCount || 0) <= 1 &&
      Number(popupSummary.maxPluginWindowCount || 0) <= 1 &&
      actionFailures.length === 0;
    return {
      ok,
      projectRevision: PROJECT_REVISION,
      generatedAt: new Date().toISOString(),
      canonicalKey: entry.canonicalKey,
      sourceGroup,
      launchUrl: entry.launchUrl,
      launchHealth: {
        statusCode: launchHealth?.statusCode ?? null,
        error: launchHealth?.error || null
      },
      runtime: {
        pid: runtime.pid,
        playerKey: runtime.playerKey,
        processNames: runtime.processNames
      },
      runtimeWindow,
      capture: capture ? {
        imageSize: capture.imageSize,
        window: capture.window,
        targetWindow: capture.targetWindow,
        captureMode: capture.captureMode
      } : null,
      stage,
      actions,
      monitorError,
      popupAudit: audit,
      logSummary,
      artifacts: {
        windowPath,
        resizeWindowPath,
        screenshotPath,
        capturePath,
        stagePath,
        logPath,
        windowAuditPath: outputPath.replace(/\.json$/u, "-window-audit.json")
      },
      failedChecks: [
        ...(Number(launchHealth?.statusCode || 0) !== 200 ? ["launch_health_failed"] : []),
        ...(!runtimeWindow?.match?.handle ? ["window_not_found"] : []),
        ...(monitorError ? ["window_audit_failed"] : []),
        ...(popupSummary.popupStormDetected ? ["popup_storm_detected"] : []),
        ...(popupSummary.shellPopupSeen ? ["shell_popup_seen"] : []),
        ...(Number(popupSummary.maxNavigatorWindowCount || 0) > 1 ? ["multiple_navigator_windows"] : []),
        ...(Number(popupSummary.maxPluginWindowCount || 0) > 1 ? ["multiple_plugin_windows"] : []),
        ...actionFailures.map((action) => `${action.name}_failed`),
        ...(logSummary.externalCallCount > 0 ? ["external_call_seen"] : [])
      ]
    };
  } finally {
    if (monitor && typeof monitor.then === "function") {
      await monitor.catch(() => null);
    }
    // Pass the exact launcher PID so cleanup remains scoped even when another
    // QA task updates the shared marker while this case is winding down.
    stopNavigatorProcesses({ runtimePid: runtime?.pid });
  }
}

async function runRapidLaunchProbe({ config, entry, runDir, args }) {
  const stem = `rapid-${entry.canonicalKey}`;
  const responsePath = path.join(runDir, `${stem}-responses.json`);
  const auditPath = path.join(runDir, `${stem}-window-audit.json`);
  const requestCount = Math.max(3, Number(args.rapidRequestCount || args["rapid-request-count"] || 5));
  const { startWebLauncherServer } = require("./web-launcher");
  let serverInfo = null;
  let monitor = null;
  let monitorError = null;
  let responses = [];
  try {
    await mountSourceZip(config, "as2");
    serverInfo = await startWebLauncherServer({
      host: "127.0.0.1",
      port: 0,
      noSpawn: false
    });
    monitor = waitForPythonChild(spawnPythonQa([
      "window-audit",
      "--duration-ms", String(args.rapidAuditDurationMs || args["rapid-audit-duration-ms"] || 12000),
      "--interval-ms", String(args.intervalMs || 250),
      "--output", auditPath
    ])).catch((error) => {
      monitorError = String(error.message || error);
      return null;
    });
    const endpoint = `http://127.0.0.1:${serverInfo.port}/api/launch-island`;
    const body = JSON.stringify({
      islandId: entry.canonicalKey,
      windowSize: String(args.rapidWindowSize || args["rapid-window-size"] || "1186x760")
    });
    responses = await Promise.all(Array.from({ length: requestCount }, async () => {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body
        });
        return {
          status: response.status,
          payload: await response.json()
        };
      } catch (error) {
        return {
          status: 0,
          payload: { ok: false, error: String(error.message || error) }
        };
      }
    }));
    writeJson(responsePath, {
      endpoint,
      requestCount,
      responses
    });
    const audit = await monitor;
    const successful = responses.filter((item) => item.payload?.ok === true);
    const busy = responses.filter((item) => item.payload?.busy === true || item.payload?.error?.includes("启动") || item.payload?.error?.includes("运行"));
    const summary = audit?.summary || {};
    const ok = successful.length === 1 &&
      busy.length >= requestCount - 1 &&
      !monitorError &&
      summary.popupStormDetected !== true &&
      summary.shellPopupSeen !== true &&
      Number(summary.maxNavigatorWindowCount || 0) <= 1 &&
      Number(summary.maxPluginWindowCount || 0) <= 1;
    return {
      ok,
      canonicalKey: entry.canonicalKey,
      requestCount,
      successfulCount: successful.length,
      busyCount: busy.length,
      responses,
      audit,
      monitorError,
      artifacts: {
        responsePath,
        auditPath
      },
      failedChecks: [
        ...(successful.length !== 1 ? ["rapid_launch_success_count"] : []),
        ...(busy.length < requestCount - 1 ? ["rapid_launch_busy_guard"] : []),
        ...(monitorError ? ["rapid_launch_window_audit_failed"] : []),
        ...(summary.popupStormDetected ? ["rapid_launch_popup_storm"] : []),
        ...(summary.shellPopupSeen ? ["rapid_launch_shell_popup"] : []),
        ...(Number(summary.maxNavigatorWindowCount || 0) > 1 ? ["rapid_launch_multiple_navigator_windows"] : []),
        ...(Number(summary.maxPluginWindowCount || 0) > 1 ? ["rapid_launch_multiple_plugin_windows"] : [])
      ]
    };
  } finally {
    if (monitor && typeof monitor.then === "function") {
      await monitor.catch(() => null);
    }
    if (serverInfo?.server) {
      await new Promise((resolve) => serverInfo.server.close(() => resolve()));
    }
    const runtimePids = responses
      .map((item) => Number(item?.payload?.runtimePlan?.pid || item?.payload?.runtime?.pid || 0))
      .filter((pid, index, all) => Number.isInteger(pid) && pid > 0 && all.indexOf(pid) === index);
    for (const runtimePid of runtimePids) {
      stopNavigatorProcesses({ runtimePid });
    }
    // A failed request may have left only the marker; the scoped fallback is
    // still safe because it requires this process to own that marker.
    stopNavigatorProcesses();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  ensureManagedWorkspace(config);
  await ensureFlashpointServices(config);
  const runDir = ensureQaDir("window-stability", `run-${Date.now()}`);
  const manifest = generateLaunchManifest(config, { write: false });
  const as2Key = String(args.as2Island || args["as2-island"] || "time-tangled");
  const as3Key = String(args.as3Island || args["as3-island"] || "poptropicon");
  const as2Entry = manifest.entries.find((entry) => entry.canonicalKey === as2Key && entry.sourceGroup === "as2");
  const as3Entry = manifest.entries.find((entry) => entry.canonicalKey === as3Key && entry.sourceGroup === "as3");
  if (!as2Entry || !as3Entry) {
    throw new Error(`Popup regression entries not found: ${as2Key}, ${as3Key}`);
  }
  const reportPath = path.join(
    require("./lib/paths").qaDir,
    `window-stability-popup-regression-${Date.now()}.json`
  );
  const reports = [];
  let rapidLaunch = null;
  try {
    await mountSourceZip(config, "as2");
    reports.push(await runCase({
      config,
      entry: as2Entry,
      sourceGroup: "as2",
      runDir,
      durationMs: Number(args.durationMs || args["duration-ms"] || 60000),
      args
    }));
    try {
      rapidLaunch = await runRapidLaunchProbe({
        config,
        entry: as2Entry,
        runDir,
        args
      });
    } catch (error) {
      rapidLaunch = {
        ok: false,
        canonicalKey: as2Entry.canonicalKey,
        failedChecks: ["rapid_launch_probe_failed"],
        error: String(error.stack || error.message || error)
      };
    }
    await mountSourceZip(config, "as3");
    reports.push(await runCase({
      config,
      entry: as3Entry,
      sourceGroup: "as3",
      runDir,
      durationMs: Number(args.durationMs || args["duration-ms"] || 60000),
      args
    }));
  } finally {
    stopNavigatorProcesses();
  }
  const report = {
    ok: reports.length === 2 && reports.every((item) => item.ok) && rapidLaunch?.ok === true,
    projectRevision: PROJECT_REVISION,
    generatedAt: new Date().toISOString(),
    durationMs: Number(args.durationMs || args["duration-ms"] || 60000),
    runDir,
    reports,
    rapidLaunch
  };
  writeJson(reportPath, report);
  writeJson(path.join(require("./lib/paths").qaDir, "window-stability-popup-regression-latest.json"), report);
  printJson({ ...report, reportPath });
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  stopNavigatorProcesses();
  printJson({
    ok: false,
    projectRevision: PROJECT_REVISION,
    generatedAt: new Date().toISOString(),
    error: String(error.stack || error.message || error)
  });
  process.exitCode = 1;
});
