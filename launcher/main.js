const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { loadConfig, updateConfig } = require("../tools/lib/config");
const { writeInventory } = require("../tools/lib/inventory");
const { fileExists, readJson } = require("../tools/lib/fs-utils");
const paths = require("../tools/lib/paths");
const {
  ensureFlashpointServices,
  ensureManagedWorkspace,
  getFlashpointPaths,
  getPoptropicaRecords,
  mountSourceZip,
  proxyRequest,
  spawnManagedRuntime
} = require("../tools/lib/flashpoint-runtime");
const { loadLaunchManifest } = require("../tools/lib/launch-manifest");
const { loadIslandVerification, loadPlayerCompatibility, loadWindowAudit } = require("../tools/lib/status-store");
const {
  resolveLauncherRuntimeWindowGeometry,
  withWindowGeometryEnv
} = require("../tools/lib/runtime-window-geometry");

let mainWindow = null;
let activeRuntime = null;
const electronProfileRoot = path.join(
  paths.runtimeDataDir,
  process.env.POPTROPICA_UI_TEST
    ? "electron-profile-ui-test"
    : process.argv.includes("--smoke")
      ? "electron-profile-smoke"
      : "electron-profile"
);

function resolveNodeBinary() {
  const result = spawnSync("where", ["node"], {
    encoding: "utf8",
    windowsHide: true,
    shell: false
  });
  if (result.status === 0) {
    const first = result.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find(Boolean);
    if (first) {
      return first;
    }
  }
  return "node";
}

function emitStatus(stage, message, extra = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("flash:status", {
    stage,
    message,
    at: new Date().toISOString(),
    ...extra
  });
}

function resolveRuntimeTargetMonitor() {
  return String(process.env.POPTROPICA_QA_MONITOR || "").trim();
}

for (const profileDir of [
  electronProfileRoot,
  path.join(electronProfileRoot, "userData"),
  path.join(electronProfileRoot, "sessionData"),
  path.join(electronProfileRoot, "cache"),
  path.join(electronProfileRoot, "crashDumps")
]) {
  fs.mkdirSync(profileDir, { recursive: true });
}

app.setPath("userData", path.join(electronProfileRoot, "userData"));
app.setPath("sessionData", path.join(electronProfileRoot, "sessionData"));
app.setPath("cache", path.join(electronProfileRoot, "cache"));
app.setPath("crashDumps", path.join(electronProfileRoot, "crashDumps"));

if (!process.argv.includes("--smoke") && !process.env.POPTROPICA_UI_TEST) {
  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    app.quit();
  }
  app.on("second-instance", () => {
    if (mainWindow) {
      mainWindow.show();
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

function getInventory() {
  return writeInventory(loadConfig());
}

function getState() {
  const config = loadConfig();
  const inventory = getInventory();
  const launchManifest = loadLaunchManifest();
  return {
    config,
    appMode: {
      smoke: process.argv.includes("--smoke")
    },
    inventory,
    launchManifest: {
      generatedAt: launchManifest?.generatedAt || null,
      summary: launchManifest?.summary || {
        totalEntries: 0,
        launchableCount: 0,
        unresolvedCount: 0
      }
    },
    runtimeState: readJson(paths.flashpointRuntimeStatePath, {}),
    doctorReport: readJson(paths.doctorReportPath, null),
    islandVerification: loadIslandVerification(),
    playerCompatibility: loadPlayerCompatibility(),
    windowAudit: loadWindowAudit(),
    paths: {
      projectRoot: paths.projectRoot,
      coverageMatrixPath: paths.coverageMatrixPath,
      islandsPath: paths.islandsPath,
      runtimeDataDir: paths.runtimeDataDir,
      packsDir: paths.packsDir,
      launchManifestPath: paths.launchManifestPath,
      doctorReportPath: paths.doctorReportPath,
      managedWorkspaceDir: paths.managedWorkspaceDir
    }
  };
}

function findFlashpointExecutable(rootDir) {
  const candidates = [
    path.join(rootDir, "Flashpoint.exe"),
    path.join(rootDir, "FlashpointLauncher.exe"),
    path.join(rootDir, "Launcher", "Flashpoint.exe"),
    path.join(rootDir, "Launcher", "FlashpointLauncher.exe"),
    path.join(rootDir, "Start Flashpoint.bat")
  ];
  return candidates.find((candidate) => fileExists(candidate)) || null;
}

async function buildRuntimePlan(sourceGroup) {
  const normalized = String(sourceGroup || "").toLowerCase();
  if (!["as2", "as3"].includes(normalized)) {
    return {
      ok: false,
      error: `Unsupported runtime source: ${sourceGroup}`
    };
  }

  const config = loadConfig();
  const zipPath = config.sources[normalized === "as2" ? "as2Gamezip" : "as3Gamezip"];
  if (!zipPath) {
    return {
      ok: false,
      source: normalized,
      error: `缺少 ${normalized.toUpperCase()} 数据包。`
    };
  }

  let flashpoint = null;
  try {
    flashpoint = getFlashpointPaths(config);
  } catch (error) {
    return {
      ok: false,
      source: normalized,
      error: error.message
    };
  }

  const records = getPoptropicaRecords(config);
  const record = records[normalized];
  if (!record?.launchCommand) {
    return {
      ok: false,
      source: normalized,
      error: `没有找到 ${normalized.toUpperCase()} 的启动入口。`
    };
  }

  const targetMonitor = resolveRuntimeTargetMonitor();
  const windowGeometry = resolveLauncherRuntimeWindowGeometry(normalized);
  ensureManagedWorkspace(config);
  const services = await ensureFlashpointServices(config);
  const mounted = await mountSourceZip(config, normalized);
  const health = await proxyRequest(record.launchCommand);
  if (health.statusCode < 200 || health.statusCode >= 400) {
    return {
      ok: false,
      source: normalized,
      error: `${record.title} 启动页返回状态 ${health.statusCode}。`
    };
  }

  return {
    ok: true,
    mode: "runtime-entry",
    source: normalized,
    runtimeTitle: normalized === "as2" ? "AS2 经典旧版" : "AS3 旧版世界",
    launchUrl: record.launchCommand,
    targetMonitor,
    windowGeometry,
    workspace: {
      workspaceDir: paths.managedWorkspaceDir,
      managedDbPath: paths.managedDbPath
    },
    mounted: {
      targetZipPath: mounted.targetZipPath,
      mountFileName: mounted.mountFileName
    },
    flashpoint: {
      root: flashpoint.root
    },
    health: {
      services: services.healthy,
      startupStatusCode: health.statusCode
    },
    notes: normalized === "as2"
      ? [
          "默认会改走更适合旧 Flash 的 AS2 运行器链路。",
          "进入后在游戏地图里切岛，不再从启动器外跳房间。"
        ]
      : [
          "默认进入 AS3 旧版世界，后续登录和切岛都在游戏内完成。",
          "启动器只负责准备环境、挂载数据包和接入汉化。"
        ]
  };
}

function runToolScriptAsync(scriptName, args = []) {
  const nodeBinary = resolveNodeBinary();
  return new Promise((resolve) => {
    const child = spawn(nodeBinary, [path.join(paths.toolsRoot, scriptName), ...args], {
      cwd: paths.projectRoot,
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1"
      }
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("close", (code) => {
      if (code !== 0) {
        resolve({
          ok: false,
          scriptName,
          error: (stderr || stdout || `${scriptName} failed`).trim(),
          runner: nodeBinary
        });
        return;
      }
      try {
        resolve({
          ok: true,
          scriptName,
          runner: nodeBinary,
          output: JSON.parse(stdout)
        });
      } catch (_error) {
        resolve({
          ok: false,
          scriptName,
          error: `脚本 ${scriptName} 返回的不是合法 JSON。`,
          runner: nodeBinary
        });
      }
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    backgroundColor: "#0b1220",
    title: "POPTROPICA_FLASH",
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      sandbox: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });
  if (process.argv.includes("--smoke")) {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(() => app.quit(), 1500);
    });
  }
}

async function launchRuntimeWindow(sourceGroup) {
  if (activeRuntime && !activeRuntime.killed) {
    return {
      ok: false,
      error: "已经有一个旧版游戏窗口在运行。请先关闭它，再切换 AS2 / AS3。"
    };
  }

  emitStatus("launch", `正在准备 ${String(sourceGroup).toUpperCase()} 入口…`);
  const plan = await buildRuntimePlan(sourceGroup);
  if (!plan.ok) {
    return plan;
  }

  const runtime = withWindowGeometryEnv(plan.windowGeometry, () =>
    spawnManagedRuntime(loadConfig(), plan.source, plan.launchUrl, { detach: false })
  );
  activeRuntime = runtime.child;
  activeRuntime.once("exit", () => {
    activeRuntime = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      emitStatus("launch", "游戏窗口已经关闭，启动器回到了前台。");
    }
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }

  return {
    ...plan,
    launched: true,
    playerKey: runtime.playerKey
  };
}

ipcMain.handle("flash:get-state", async () => getState());
ipcMain.handle("flash:set-debug-mode", async (_event, enabled) => {
  updateConfig({
    preferences: {
      debugMode: Boolean(enabled)
    }
  });
  return getState();
});
ipcMain.handle("flash:pick-path", async (_event, kind) => {
  const pickDirectory = kind === "flashpointRoot" || kind === "steamRoot";
  const response = await dialog.showOpenDialog(mainWindow, {
    properties: pickDirectory ? ["openDirectory"] : ["openFile"],
    filters: pickDirectory ? undefined : [{ name: "ZIP", extensions: ["zip"] }]
  });
  if (response.canceled || response.filePaths.length === 0) {
    return null;
  }
  const selectedPath = response.filePaths[0];
  const configPatch = {
    sources: {}
  };
  configPatch.sources[kind] = selectedPath;
  updateConfig(configPatch);
  return getState();
});
ipcMain.handle("flash:refresh", async () => getState());
ipcMain.handle("flash:open-path", async (_event, targetPath) => {
  if (!targetPath || !fileExists(targetPath)) {
    return false;
  }
  await shell.openPath(targetPath);
  return true;
});
ipcMain.handle("flash:run-command", async (_event, commandName) => {
  const commandMap = {
    "bootstrap:flashpoint": { script: "bootstrap-flashpoint.js", label: "准备运行环境" },
    "doctor:flashpoint": { script: "doctor-flashpoint.js", label: "检查运行状态" },
    "discover:launch-scenes": { script: "discover-launch-scenes.js", label: "刷新启动清单" },
    "inventory:sources": { script: "inventory-sources.js", label: "刷新清单" },
    "extract:text": { script: "extract-text.js", label: "提取文本" },
    "translate:pack": { script: "translate-pack.js", label: "翻译汉化包" },
    "patch:pack": { script: "patch-pack.js", label: "写入汉化包" },
    "rebuild:pack": { script: "rebuild-pack.js", label: "重建汉化包" },
    "qa:validate-as3": { script: "qa-validate-runtime.js", args: ["--source", "as3"], label: "闭环验收 AS3" },
    "qa:validate-as2": { script: "qa-validate-runtime.js", args: ["--source", "as2"], label: "闭环验收 AS2" },
    "qa:window-audit": { script: "window-audit.js", label: "桌面窗口审计" }
  };
  const command = commandMap[commandName];
  if (!command) {
    return {
      ok: false,
      error: `Unknown command: ${commandName}`
    };
  }
  emitStatus("command", `正在执行：${command.label}`);
  const result = await runToolScriptAsync(command.script, command.args || []);
  emitStatus("command", result.ok ? `${command.label}完成。` : `${command.label}失败。`);
  return result;
});
ipcMain.handle("flash:prepare-runtime", async () => {
  const steps = [];
  const sequence = [
    { id: "bootstrap", label: "准备运行环境", script: "bootstrap-flashpoint.js" },
    { id: "discover", label: "刷新启动清单", script: "discover-launch-scenes.js" },
    { id: "doctor", label: "检查运行状态", script: "doctor-flashpoint.js" }
  ];

  for (const step of sequence) {
    emitStatus("prepare", `${step.label}中…`);
    const result = await runToolScriptAsync(step.script);
    steps.push({ id: step.id, label: step.label, result });
    if (!result.ok) {
      emitStatus("prepare", `${step.label}失败。`);
      break;
    }
  }

  const ok = steps.every((step) => step.result?.ok);
  emitStatus("prepare", ok ? "运行环境已经准备好。" : "运行环境准备失败。");
  return {
    ok,
    steps,
    state: getState()
  };
});
ipcMain.handle("flash:launch-runtime", async (_event, sourceGroup) => launchRuntimeWindow(sourceGroup));
ipcMain.handle("flash:launch-island", async () => ({
  ok: false,
  error: "默认界面已经移除外部直启岛屿。请先进 AS2 / AS3，再在游戏里切岛。"
}));
ipcMain.handle("flash:open-original-flashpoint", async () => {
  const config = loadConfig();
  const executable = config.sources.flashpointRoot ? findFlashpointExecutable(config.sources.flashpointRoot) : null;
  if (!executable) {
    return {
      ok: false,
      error: "Original Flashpoint executable not found."
    };
  }
  const child = spawn(executable, [], {
    cwd: path.dirname(executable),
    detached: true,
    windowsHide: true,
    shell: /\.(bat|cmd)$/iu.test(executable),
    stdio: "ignore"
  });
  child.unref();
  return {
    ok: true,
    executable
  };
});

app.whenReady().then(() => {
  if (loadConfig().preferences?.debugMode) {
    updateConfig({
      preferences: {
        debugMode: false
      }
    });
  }
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
