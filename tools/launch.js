const { spawn } = require("node:child_process");
const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { buildInventory } = require("./lib/inventory");
const { generateLaunchManifest, loadLaunchManifest } = require("./lib/launch-manifest");
const { ensureFlashpointServices, ensureManagedWorkspace, getPoptropicaRecords, mountSourceZip, proxyRequest, spawnManagedRuntime } = require("./lib/flashpoint-runtime");
const { clearPoptropicaFlashState } = require("./lib/flash-state");
const { writeJson } = require("./lib/fs-utils");
const paths = require("./lib/paths");

const AS3_SAFE_MAXIMIZE_WIDTH = 2300;
const AS3_SAFE_MAXIMIZE_HEIGHT = 1320;
const WORK_AREA_SENTINEL_SIZE = 99999;

function flagEnabled(value) {
  if (value === true) {
    return true;
  }
  if (value === false || value === undefined || value === null) {
    return false;
  }
  return /^(1|true|yes|on)$/iu.test(String(value).trim());
}

function applyTargetMonitorEnv(args) {
  const targetMonitor = String(args.targetMonitor || args.monitor || process.env.POPTROPICA_QA_MONITOR || "").trim();
  if (targetMonitor) {
    process.env.POPTROPICA_QA_MONITOR = targetMonitor;
  }
  return targetMonitor || null;
}

function applyWindowGeometryEnv(args, sourceGroup) {
  const normalized = String(sourceGroup || "").toLowerCase();
  const sizeMatch = String(args.windowSize || args["window-size"] || "").match(/^(\d+)x(\d+)$/iu);
  const requestedWidth = Number(args.windowWidth || args["window-width"] || (sizeMatch ? sizeMatch[1] : 0));
  const requestedHeight = Number(args.windowHeight || args["window-height"] || (sizeMatch ? sizeMatch[2] : 0));
  const hasExplicitSize = Number.isFinite(requestedWidth) && requestedWidth > 0 && Number.isFinite(requestedHeight) && requestedHeight > 0;
  const maximize = flagEnabled(args.maximizeWindow || args["maximize-window"] || args.maximize);
  const unsafeMaximize = flagEnabled(args.trueMaximize || args["true-maximize"] || args.unsafeMaximize || args["unsafe-maximize"]);

  if (hasExplicitSize) {
    const width = Math.round(requestedWidth);
    const height = Math.round(requestedHeight);
    process.env.POPTROPICA_WINDOW_WIDTH = String(width);
    process.env.POPTROPICA_WINDOW_HEIGHT = String(height);
    return {
      mode: "explicit",
      width,
      height
    };
  }

  if (!maximize) {
    return null;
  }

  if (normalized === "as3" && !unsafeMaximize) {
    const safeWidth = Number(args.safeMaximizeWidth || args["safe-maximize-width"] || AS3_SAFE_MAXIMIZE_WIDTH);
    const safeHeight = Number(args.safeMaximizeHeight || args["safe-maximize-height"] || AS3_SAFE_MAXIMIZE_HEIGHT);
    const width = Number.isFinite(safeWidth) && safeWidth > 0 ? Math.round(safeWidth) : AS3_SAFE_MAXIMIZE_WIDTH;
    const height = Number.isFinite(safeHeight) && safeHeight > 0 ? Math.round(safeHeight) : AS3_SAFE_MAXIMIZE_HEIGHT;
    process.env.POPTROPICA_WINDOW_WIDTH = String(width);
    process.env.POPTROPICA_WINDOW_HEIGHT = String(height);
    return {
      mode: "as3-safe-maximize",
      width,
      height
    };
  }

  process.env.POPTROPICA_WINDOW_WIDTH = String(WORK_AREA_SENTINEL_SIZE);
  process.env.POPTROPICA_WINDOW_HEIGHT = String(WORK_AREA_SENTINEL_SIZE);
  return {
    mode: normalized === "as3" ? "as3-unsafe-workarea" : "workarea",
    width: null,
    height: null
  };
}

async function launchRuntimeFromCli(sourceGroup, args = {}) {
  const normalized = String(sourceGroup || "").toLowerCase();
  if (!["as2", "as3"].includes(normalized)) {
    throw new Error(`Unsupported runtime source: ${sourceGroup}`);
  }

  const config = loadConfig();
  const windowGeometry = applyWindowGeometryEnv(args, normalized);
  ensureManagedWorkspace(config);
  const records = getPoptropicaRecords(config);
  const record = records[normalized];
  if (!record?.launchCommand) {
    throw new Error(`No runtime launch command found for ${normalized}`);
  }

  const services = await ensureFlashpointServices(config);
  if (!services.healthy.proxy || !services.healthy.zip || !services.healthy.php) {
    throw new Error(`Runtime services are not healthy. See logs in ${paths.managedLogsDir}`);
  }
  const mounted = await mountSourceZip(config, normalized);
  const startupHealth = await proxyRequest(record.launchCommand);
  if (startupHealth.statusCode < 200 || startupHealth.statusCode >= 400) {
    throw new Error(`Startup page failed with status ${startupHealth.statusCode}`);
  }

  const runtimePlan = spawnManagedRuntime(config, normalized, record.launchCommand, { detach: true });
  const plan = {
    ok: true,
    source: normalized,
    runtimeTitle: normalized === "as2" ? "AS2 经典旧版" : "AS3 旧版世界",
    launchUrl: record.launchCommand,
    targetMonitor: process.env.POPTROPICA_QA_MONITOR || null,
    windowGeometry,
    mounted: {
      targetZipPath: mounted.targetZipPath,
      mountFileName: mounted.mountFileName
    },
    health: {
      services: services.healthy,
      startupStatusCode: startupHealth.statusCode
    },
    runtimePlan: {
      playerKey: runtimePlan.playerKey,
      pid: runtimePlan.child?.pid || null,
      executable: runtimePlan.executable,
      args: runtimePlan.args
    }
  };
  writeJson(paths.lastLaunchPlanPath, plan);
  printJson(plan);
}

async function launchIslandFromCli(islandId, args = {}) {
  const config = loadConfig();
  const inventory = buildInventory(config);
  const island = inventory.islands.find((entry) => entry.id === islandId);
  if (!island) {
    throw new Error(`Island not found: ${islandId}`);
  }
  if (island.preferredSource === "haxe" || island.preferredSource === "steam") {
    throw new Error(`Island ${islandId} is not part of flash_v1 direct launch.`);
  }

  const launchManifest = loadLaunchManifest() || generateLaunchManifest(config);
  const launchEntry = launchManifest.entries.find((entry) => entry.canonicalKey === islandId);
  if (!launchEntry?.launchable) {
    throw new Error(`No stable launch scene was resolved for ${islandId}.`);
  }

  const windowGeometry = applyWindowGeometryEnv(args, island.preferredSource);
  ensureManagedWorkspace(config);
  const services = await ensureFlashpointServices(config);
  if (!services.healthy.proxy || !services.healthy.zip || !services.healthy.php) {
    throw new Error(`Runtime services are not healthy. See logs in ${paths.managedLogsDir}`);
  }
  const mounted = await mountSourceZip(config, island.preferredSource);
  const basePhp = await proxyRequest("http://www.poptropica.com/base.php");
  if (basePhp.statusCode < 200 || basePhp.statusCode >= 400) {
    throw new Error(`base.php health check failed with status ${basePhp.statusCode}`);
  }
  const flashStateReset = island.preferredSource === "as3" && launchEntry.launchMode === "as3-direct-scene"
    ? clearPoptropicaFlashState({ reason: `as3-direct-island:${islandId}` })
    : null;
  const runtimePlan = spawnManagedRuntime(config, island.preferredSource, launchEntry.launchUrl, { detach: true });
  const plan = {
    ok: true,
    islandId,
    source: island.preferredSource,
    targetMonitor: process.env.POPTROPICA_QA_MONITOR || null,
    windowGeometry,
    launchEntry,
    ...(flashStateReset ? { flashStateReset } : {}),
    mounted: {
      targetZipPath: mounted.targetZipPath,
      mountFileName: mounted.mountFileName
    },
    health: services.healthy,
    runtimePlan: {
      playerKey: runtimePlan.playerKey,
      pid: runtimePlan.child?.pid || null,
      executable: runtimePlan.executable,
      args: runtimePlan.args
    }
  };
  writeJson(paths.lastLaunchPlanPath, plan);
  printJson(plan);
}

function launchElectron(args) {
  const electronBinary = require("electron");
  const launcherEntry = path.join(__dirname, "..", "launcher", "main.js");
  const env = {
    ...process.env,
    NODE_NO_WARNINGS: "1"
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const foreground = args.includes("--smoke") || args.includes("--foreground");

  const child = spawn(electronBinary, [launcherEntry, ...args], {
    cwd: path.join(__dirname, ".."),
    env,
    detached: !foreground,
    windowsHide: !foreground,
    stdio: foreground ? "inherit" : "ignore"
  });

  if (!foreground) {
    child.unref();
    return;
  }

  child.on("exit", (code) => {
    process.exit(code || 0);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  applyTargetMonitorEnv(args);
  if (args.runtime) {
    await launchRuntimeFromCli(String(args.runtime), args);
    return;
  }
  if (args.island) {
    await launchIslandFromCli(String(args.island), args);
    return;
  }
  launchElectron(process.argv.slice(2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
