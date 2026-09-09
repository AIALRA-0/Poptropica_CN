const { spawn } = require("node:child_process");
const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { buildInventory } = require("./lib/inventory");
const { generateLaunchManifest, loadLaunchManifest } = require("./lib/launch-manifest");
const { ensureFlashpointServices, ensureManagedWorkspace, getPoptropicaRecords, mountSourceZip, proxyRequest, spawnManagedRuntime } = require("./lib/flashpoint-runtime");
const { clearPoptropicaFlashState } = require("./lib/flash-state");
const { writeJson } = require("./lib/fs-utils");
const { applyWindowGeometryEnv, resolveCliWindowGeometry } = require("./lib/runtime-window-geometry");
const paths = require("./lib/paths");

function applyTargetMonitorEnv(args) {
  const targetMonitor = String(args.targetMonitor || args.monitor || process.env.POPTROPICA_QA_MONITOR || "").trim();
  if (targetMonitor) {
    process.env.POPTROPICA_QA_MONITOR = targetMonitor;
  }
  return targetMonitor || null;
}

function applyCliWindowGeometryEnv(args, sourceGroup) {
  const geometry = resolveCliWindowGeometry(args, sourceGroup);
  if (!geometry) {
    return null;
  }
  applyWindowGeometryEnv(geometry);
  if (geometry?.reportedWidth === null || geometry?.reportedHeight === null) {
    return {
      mode: geometry.mode,
      width: null,
      height: null
    };
  }
  return geometry;
}

async function launchRuntimeFromCli(sourceGroup, args = {}) {
  const normalized = String(sourceGroup || "").toLowerCase();
  if (!["as2", "as3"].includes(normalized)) {
    throw new Error(`Unsupported runtime source: ${sourceGroup}`);
  }

  const config = loadConfig();
  const windowGeometry = applyCliWindowGeometryEnv(args, normalized);
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

  const windowGeometry = applyCliWindowGeometryEnv(args, island.preferredSource);
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
