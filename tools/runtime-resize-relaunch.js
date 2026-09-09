const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const {
  ensureFlashpointServices,
  ensureManagedWorkspace,
  mountSourceZip,
  spawnManagedRuntime
} = require("./lib/flashpoint-runtime");
const { ensureDirSync, readJson, writeJson } = require("./lib/fs-utils");
const { applyWindowGeometryEnv } = require("./lib/runtime-window-geometry");
const paths = require("./lib/paths");

function parsePositiveInt(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function writeReport(payload) {
  const outputDir = path.join(paths.qaDir, "runtime-resize-relaunch");
  ensureDirSync(outputDir);
  const reportPath = path.join(outputDir, `runtime-resize-relaunch-${Date.now()}.json`);
  writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    ...payload
  });
  return reportPath;
}

function withQueryParam(url, name, value) {
  try {
    const nextUrl = new URL(url);
    if (value === undefined || value === null || value === "") {
      nextUrl.searchParams.delete(name);
    } else {
      nextUrl.searchParams.set(name, String(value));
    }
    return nextUrl.toString();
  } catch (_error) {
    return url;
  }
}

function shouldInitializeFullscreen(width, height) {
  const minWidth = parsePositiveInt(process.env.POPTROPICA_QA_FULLSCREEN_INIT_MIN_WIDTH) || 2400;
  const minHeight = parsePositiveInt(process.env.POPTROPICA_QA_FULLSCREEN_INIT_MIN_HEIGHT) || 1430;
  return width >= minWidth && height >= minHeight && process.env.POPTROPICA_QA_FULLSCREEN_INIT !== "0";
}

function isProcessRunning(pid) {
  if (!pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

function runHelper(args, timeoutMs = 10000) {
  const python = process.env.PYTHON || "python";
  const helperPath = path.join(paths.toolsRoot, "qa-helper.py");
  const result = spawnSync(python, [helperPath, ...args], {
    cwd: paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: timeoutMs,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8"
    }
  });
  const stdout = String(result.stdout || "").trim();
  let parsed = null;
  if (stdout) {
    try {
      parsed = JSON.parse(stdout);
    } catch (_error) {
      parsed = null;
    }
  }
  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    error: result.error ? String(result.error.message || result.error) : null,
    stdout,
    stderr: String(result.stderr || "").trim(),
    json: parsed
  };
}

function sendFullscreenKey(runtimePid) {
  const wait = runHelper([
    "wait-window",
    "--pid",
    String(runtimePid),
    "--process-names",
    "flashpointnavigator.exe",
    "--title-contains",
    "poptropica",
    "--timeout-ms",
    "5000"
  ], 7000);
  const handle = wait.json?.match?.handle;
  if (!handle) {
    return {
      ok: false,
      reason: "wait_window_failed",
      wait
    };
  }
  const key = runHelper([
    "key-window",
    "--handle",
    String(handle),
    "--pid",
    String(runtimePid),
    "--process-names",
    "flashpointnavigator.exe",
    "--title-contains",
    "poptropica",
    "--key",
    "VK_F11"
  ], 7000);
  return {
    ok: Boolean(key.ok && key.json?.ok),
    wait,
    key
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const width = parsePositiveInt(args.width || args.windowWidth || args["window-width"]);
  const height = parsePositiveInt(args.height || args.windowHeight || args["window-height"]);
  const expectedPid = parsePositiveInt(args.pid || args.runtimePid || args["runtime-pid"]);
  const expectedSource = String(args.sourceGroup || args["source-group"] || "").trim().toLowerCase();
  const activePath = path.join(paths.managedWorkspaceDir, "active-runtime.json");
  const active = readJson(activePath, null);

  if (!active) {
    const reportPath = writeReport({ ok: false, reason: "missing_active_runtime", activePath });
    printJson({ ok: false, reason: "missing_active_runtime", reportPath });
    process.exit(2);
  }

  const sourceGroup = String(active.sourceGroup || "").trim().toLowerCase();
  if (expectedSource && sourceGroup !== expectedSource) {
    const reportPath = writeReport({ ok: false, reason: "source_group_mismatch", expectedSource, sourceGroup, active });
    printJson({ ok: false, reason: "source_group_mismatch", reportPath });
    process.exit(2);
  }
  if (sourceGroup !== "as3") {
    const reportPath = writeReport({ ok: false, reason: "source_group_not_as3", sourceGroup, active });
    printJson({ ok: false, reason: "source_group_not_as3", reportPath });
    process.exit(2);
  }
  const activePid = parsePositiveInt(active.pid);
  if (expectedPid && activePid && activePid !== expectedPid) {
    const reportPath = writeReport({
      ok: false,
      reason: "stale_resize_watcher",
      expectedPid,
      activePid,
      active
    });
    printJson({ ok: false, reason: "stale_resize_watcher", reportPath });
    process.exit(2);
  }
  if (!expectedPid && activePid && !isProcessRunning(activePid)) {
    const reportPath = writeReport({
      ok: false,
      reason: "stale_active_runtime_pid",
      activePid,
      active
    });
    printJson({ ok: false, reason: "stale_active_runtime_pid", reportPath });
    process.exit(2);
  }
  if (!width || !height) {
    const reportPath = writeReport({ ok: false, reason: "invalid_window_size", width, height, active });
    printJson({ ok: false, reason: "invalid_window_size", reportPath });
    process.exit(2);
  }

  const targetMonitor = String(args.targetMonitor || args["target-monitor"] || active.targetMonitor || process.env.POPTROPICA_QA_MONITOR || "").trim();
  if (targetMonitor) {
    process.env.POPTROPICA_QA_MONITOR = targetMonitor;
  }
  applyWindowGeometryEnv({
    width,
    height
  });

  const baseLaunchUrl = active.requestedUrl || active.url;
  if (!baseLaunchUrl) {
    const reportPath = writeReport({ ok: false, reason: "missing_launch_url", active });
    printJson({ ok: false, reason: "missing_launch_url", reportPath });
    process.exit(2);
  }
  const fullscreenInit = shouldInitializeFullscreen(width, height);
  let launchUrl = withQueryParam(baseLaunchUrl, "flashpointFullscreenInit", "");
  launchUrl = withQueryParam(launchUrl, "flashpointEmbedDelayMs", "");
  if (fullscreenInit) {
    const embedDelayMs = parsePositiveInt(process.env.POPTROPICA_QA_FULLSCREEN_EMBED_DELAY_MS) || 6000;
    const watcherDelayMs = parsePositiveInt(process.env.POPTROPICA_QA_FULLSCREEN_WATCHER_DELAY_MS) || 7500;
    launchUrl = withQueryParam(launchUrl, "flashpointFullscreenInit", "1");
    launchUrl = withQueryParam(launchUrl, "flashpointEmbedDelayMs", embedDelayMs);
    process.env.POPTROPICA_QA_LAYOUT_WATCHER_START_DELAY_MS = String(watcherDelayMs);
  }

  const config = loadConfig();
  ensureManagedWorkspace(config);
  const services = await ensureFlashpointServices(config);
  const mounted = await mountSourceZip(config, sourceGroup);
  const runtime = spawnManagedRuntime(config, sourceGroup, launchUrl, { detach: true });
  const runtimePid = runtime.child?.pid || runtime.pid || null;
  const fullscreenKey = fullscreenInit && runtimePid ? sendFullscreenKey(runtimePid) : null;

  const report = {
    ok: true,
    reason: "resize_relaunch",
    sourceGroup,
    expectedPid,
    targetMonitor: targetMonitor || null,
    requestedWindow: {
      width,
      height
    },
    launchUrl,
    fullscreenInit: fullscreenInit ? {
      requested: true,
      embedDelayMs: parsePositiveInt(new URL(launchUrl).searchParams.get("flashpointEmbedDelayMs")) || null,
      watcherDelayMs: parsePositiveInt(process.env.POPTROPICA_QA_LAYOUT_WATCHER_START_DELAY_MS) || null,
      key: fullscreenKey
    } : {
      requested: false
    },
    services: services.healthy,
    mounted: {
      targetZipPath: mounted.targetZipPath,
      mountFileName: mounted.mountFileName
    },
    runtimePlan: {
      pid: runtimePid,
      playerKey: runtime.playerKey,
      executable: runtime.executable,
      args: runtime.args
    }
  };
  const reportPath = writeReport(report);
  printJson({
    ok: true,
    reportPath,
    runtimePid: report.runtimePlan.pid
  });
}

main().catch((error) => {
  const reportPath = writeReport({
    ok: false,
    reason: "exception",
    error: String(error?.stack || error?.message || error)
  });
  printJson({
    ok: false,
    reason: "exception",
    reportPath,
    error: String(error?.message || error)
  });
  process.exit(1);
});
