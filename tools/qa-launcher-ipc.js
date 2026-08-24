const EventEmitter = require("node:events");
const Module = require("node:module");
const path = require("node:path");
const paths = require("./lib/paths");
const { ensureDirSync, writeJson } = require("./lib/fs-utils");
const {
  AS3_SAFE_MAXIMIZE_HEIGHT,
  AS3_SAFE_MAXIMIZE_WIDTH
} = require("./lib/runtime-window-geometry");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function main() {
  const envSnapshot = {
    POPTROPICA_QA_MONITOR: process.env.POPTROPICA_QA_MONITOR,
    POPTROPICA_UI_TEST: process.env.POPTROPICA_UI_TEST,
    POPTROPICA_WINDOW_HEIGHT: process.env.POPTROPICA_WINDOW_HEIGHT,
    POPTROPICA_WINDOW_WIDTH: process.env.POPTROPICA_WINDOW_WIDTH
  };

  const handlers = new Map();
  const spawnCalls = [];
  const appEvents = [];
  const fakeConfig = {
    sources: {
      as2Gamezip: path.join(paths.projectRoot, "AS2.zip"),
      as3Gamezip: path.join(paths.projectRoot, "AS3.zip"),
      flashpointRoot: path.join(paths.runtimeDataDir, "mock-flashpoint-root")
    },
    preferences: {}
  };

  const fakeElectron = {
    app: {
      setPath() {},
      requestSingleInstanceLock() {
        return true;
      },
      on(eventName, handler) {
        appEvents.push({ eventName, handler });
      },
      whenReady() {
        return new Promise(() => {});
      },
      quit() {}
    },
    BrowserWindow: class FakeBrowserWindow {},
    dialog: {
      async showOpenDialog() {
        return { canceled: true, filePaths: [] };
      }
    },
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      }
    },
    shell: {
      async openPath() {
        return "";
      }
    }
  };

  const fakeFlashpointRuntime = {
    ensureFlashpointServices: async () => ({ healthy: true, started: [] }),
    ensureManagedWorkspace: () => ({ ok: true }),
    getFlashpointPaths: () => ({ root: fakeConfig.sources.flashpointRoot }),
    getPoptropicaRecords: () => ({
      as2: {
        title: "Poptropica AS2",
        launchCommand: "http://mock.local/as2/base.php"
      },
      as3: {
        title: "Poptropica AS3",
        launchCommand: "http://mock.local/as3/base.php"
      }
    }),
    mountSourceZip: async (_config, sourceGroup) => ({
      targetZipPath: path.join(paths.runtimeDataDir, `${sourceGroup}-runtime.zip`),
      mountFileName: `${sourceGroup}-runtime.zip`
    }),
    proxyRequest: async () => ({ statusCode: 200 }),
    spawnManagedRuntime: (config, sourceGroup, launchUrl, options) => {
      const child = new EventEmitter();
      child.killed = false;
      child.kill = () => {
        child.killed = true;
        child.emit("exit", 0);
      };
      spawnCalls.push({
        config,
        sourceGroup,
        launchUrl,
        options,
        child,
        env: {
          monitor: process.env.POPTROPICA_QA_MONITOR || null,
          width: process.env.POPTROPICA_WINDOW_WIDTH || null,
          height: process.env.POPTROPICA_WINDOW_HEIGHT || null
        }
      });
      return {
        child,
        playerKey: `${sourceGroup}-mock-player`
      };
    }
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") {
      return fakeElectron;
    }
    if (request === "../tools/lib/config") {
      return {
        loadConfig: () => fakeConfig,
        updateConfig: (patch) => Object.assign(fakeConfig, patch)
      };
    }
    if (request === "../tools/lib/inventory") {
      return {
        writeInventory: () => ({
          generatedAt: new Date(0).toISOString(),
          sources: fakeConfig.sources
        })
      };
    }
    if (request === "../tools/lib/fs-utils") {
      return {
        fileExists: () => true,
        readJson: (_targetPath, fallback) => fallback
      };
    }
    if (request === "../tools/lib/flashpoint-runtime") {
      return fakeFlashpointRuntime;
    }
    if (request === "../tools/lib/launch-manifest") {
      return {
        loadLaunchManifest: () => ({
          generatedAt: new Date(0).toISOString(),
          summary: {
            totalEntries: 2,
            launchableCount: 2,
            unresolvedCount: 0
          }
        })
      };
    }
    if (request === "../tools/lib/status-store") {
      return {
        loadIslandVerification: () => ({}),
        loadPlayerCompatibility: () => ({}),
        loadWindowAudit: () => ({})
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    process.env.POPTROPICA_QA_MONITOR = "SECONDARY_DISPLAY";
    delete process.env.POPTROPICA_WINDOW_HEIGHT;
    delete process.env.POPTROPICA_WINDOW_WIDTH;
    process.env.POPTROPICA_UI_TEST = "1";

    require(path.join(paths.launcherRoot, "main.js"));
    Module._load = originalLoad;

    const invoke = async (channel, ...args) => {
      const handler = handlers.get(channel);
      assert(handler, `IPC handler not registered: ${channel}`);
      return handler({}, ...args);
    };

    assert(handlers.has("flash:launch-runtime"), "flash:launch-runtime handler missing");
    assert(handlers.has("flash:launch-island"), "flash:launch-island handler missing");

    const invalid = await invoke("flash:launch-runtime", "bad-source");
    assert(invalid.ok === false, "invalid runtime source should fail");
    assert(spawnCalls.length === 0, "invalid source should not spawn a runtime");

    const as3 = await invoke("flash:launch-runtime", "as3");
    assert(as3.ok === true, "AS3 launch IPC should return ok");
    assert(as3.launched === true, "AS3 launch IPC should report launched");
    assert(as3.targetMonitor === "SECONDARY_DISPLAY", "AS3 launch should preserve the configured target");
    assert(as3.windowGeometry?.mode === "as3-safe-maximize", "AS3 launch should use safe maximize");
    assert(as3.windowGeometry?.width === AS3_SAFE_MAXIMIZE_WIDTH, "AS3 safe width mismatch");
    assert(as3.windowGeometry?.height === AS3_SAFE_MAXIMIZE_HEIGHT, "AS3 safe height mismatch");
    assert(spawnCalls.length === 1, "AS3 launch should spawn exactly one runtime");
    assert(spawnCalls[0].sourceGroup === "as3", "AS3 spawn source mismatch");
    assert(spawnCalls[0].env.monitor === "SECONDARY_DISPLAY", "AS3 spawn monitor env mismatch");
    assert(spawnCalls[0].env.width === String(AS3_SAFE_MAXIMIZE_WIDTH), "AS3 spawn width env mismatch");
    assert(spawnCalls[0].env.height === String(AS3_SAFE_MAXIMIZE_HEIGHT), "AS3 spawn height env mismatch");
    assert(process.env.POPTROPICA_WINDOW_WIDTH === undefined, "AS3 width env should be restored");
    assert(process.env.POPTROPICA_WINDOW_HEIGHT === undefined, "AS3 height env should be restored");

    const busy = await invoke("flash:launch-runtime", "as2");
    assert(busy.ok === false, "second launch should be blocked while runtime is active");
    assert(spawnCalls.length === 1, "busy launch should not spawn another runtime");
    spawnCalls[0].child.emit("exit", 0);

    const as2 = await invoke("flash:launch-runtime", "as2");
    assert(as2.ok === true, "AS2 launch IPC should return ok");
    assert(as2.launched === true, "AS2 launch IPC should report launched");
    assert(as2.targetMonitor === "SECONDARY_DISPLAY", "AS2 launch should preserve the configured target");
    assert(as2.windowGeometry === null, "AS2 launch should not force a bounded size by default");
    assert(spawnCalls.length === 2, "AS2 launch should spawn one more runtime");
    assert(spawnCalls[1].sourceGroup === "as2", "AS2 spawn source mismatch");
    assert(spawnCalls[1].env.monitor === "SECONDARY_DISPLAY", "AS2 spawn monitor env mismatch");
    assert(spawnCalls[1].env.width === null, "AS2 spawn should not set width env");
    assert(spawnCalls[1].env.height === null, "AS2 spawn should not set height env");
    spawnCalls[1].child.emit("exit", 0);

    process.env.POPTROPICA_WINDOW_WIDTH = "1450";
    process.env.POPTROPICA_WINDOW_HEIGHT = "900";
    const inheritedAs3 = await invoke("flash:launch-runtime", "as3");
    assert(inheritedAs3.ok === true, "AS3 inherited-size launch should return ok");
    assert(inheritedAs3.windowGeometry?.mode === "inherited", "AS3 inherited-size mode mismatch");
    assert(inheritedAs3.windowGeometry?.width === 1450, "AS3 inherited width mismatch");
    assert(inheritedAs3.windowGeometry?.height === 900, "AS3 inherited height mismatch");
    assert(spawnCalls[2].env.width === "1450", "AS3 inherited spawn width mismatch");
    assert(spawnCalls[2].env.height === "900", "AS3 inherited spawn height mismatch");
    assert(process.env.POPTROPICA_WINDOW_WIDTH === "1450", "inherited width env should be preserved");
    assert(process.env.POPTROPICA_WINDOW_HEIGHT === "900", "inherited height env should be preserved");
    spawnCalls[2].child.emit("exit", 0);

    const directIsland = await invoke("flash:launch-island");
    assert(directIsland.ok === false, "flash:launch-island should remain disabled in Electron UI");

    const report = {
      ok: true,
      generatedAt: new Date().toISOString(),
      registeredHandlerCount: handlers.size,
      registeredHandlers: Array.from(handlers.keys()).sort(),
      appEvents: appEvents.map((item) => item.eventName),
      assertions: {
        invalidSourceBlocked: invalid.ok === false,
        as3SafeMaximize: as3.windowGeometry,
        busyLaunchBlocked: busy.ok === false,
        as2WindowGeometry: as2.windowGeometry,
        inheritedAs3WindowGeometry: inheritedAs3.windowGeometry,
        directIslandDisabled: directIsland.ok === false,
        spawnCalls: spawnCalls.map((call) => ({
          sourceGroup: call.sourceGroup,
          launchUrl: call.launchUrl,
          options: call.options,
          env: call.env
        }))
      }
    };

    const reportDir = ensureDirSync(path.join(paths.runtimeDataDir, "qa"));
    const reportPath = path.join(reportDir, "launcher-ipc-smoke.json");
    writeJson(reportPath, report);
    process.stdout.write(`${JSON.stringify({ ...report, reportPath }, null, 2)}\n`);
  } finally {
    Module._load = originalLoad;
    restoreEnv(envSnapshot);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
