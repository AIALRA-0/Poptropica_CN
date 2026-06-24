const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, readJson, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const SCREEN_MANAGER_CLASS = "game.managers.ScreenManager";

function runFfdec(ffdecCli, args, label) {
  const result = spawnSync(ffdecCli, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim()}`);
  }
  return result;
}

function findScreenManagerScript(root) {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name === "ScreenManager.as" && /game[\\/]managers[\\/]ScreenManager\.as$/iu.test(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

function replaceAs3Function(source, signature, replacement) {
  const start = source.indexOf(signature);
  if (start === -1) {
    return source;
  }
  const braceStart = source.indexOf("{", start);
  if (braceStart === -1) {
    throw new Error(`Unable to locate function body for: ${signature}`);
  }
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return `${source.slice(0, start)}${replacement}${source.slice(index + 1)}`;
      }
    }
  }
  throw new Error(`Unable to find closing brace for: ${signature}`);
}

function applyAdaptiveResizePatch(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  if (!next.includes("import engine.systems.CameraSystem;")) {
    next = next.replace(
      "   import engine.managers.GroupManager;\n",
      "   import engine.managers.GroupManager;\n   import engine.systems.CameraSystem;\n"
    );
  }

  next = next.replace(
    /      private function onStageResize\(param1:Event\) : void\n      \{[\s\S]*?\n      override protected function construct/u,
    "      override protected function construct"
  );

  const adaptiveHelpers = `      
      private function zhApplyBrowserAdaptiveViewport() : Boolean
      {
         var zhStageWidth:Number = Number(NaN);
         var zhStageHeight:Number = Number(NaN);
         var zhBaseWidth:Number = Number(NaN);
         var zhBaseHeight:Number = Number(NaN);
         var zhScale:Number = Number(NaN);
         var zhViewportWidth:Number = Number(NaN);
         var zhViewportHeight:Number = Number(NaN);
         if(AppConfig.mobile || !PlatformUtils.inBrowser || this.shellApi == null || _container == null)
         {
            return false;
         }
         zhStageWidth = Math.max(1,_stage.stageWidth);
         zhStageHeight = Math.max(1,_stage.stageHeight);
         if(zhStageWidth <= 100 || zhStageHeight <= 100)
         {
            return false;
         }
         if(zhStageWidth >= zhStageHeight)
         {
            zhBaseWidth = GAME_WIDTH;
            zhBaseHeight = GAME_HEIGHT;
            zhScale = zhStageHeight / zhBaseHeight;
            zhViewportWidth = zhStageWidth / zhScale;
            zhViewportHeight = zhBaseHeight;
         }
         else
         {
            zhBaseWidth = GAME_HEIGHT;
            zhBaseHeight = GAME_WIDTH;
            zhScale = zhStageWidth / zhBaseWidth;
            zhViewportWidth = zhBaseWidth;
            zhViewportHeight = zhStageHeight / zhScale;
         }
         if(!isFinite(zhScale) || zhScale <= 0)
         {
            zhScale = 1;
            zhViewportWidth = zhBaseWidth;
            zhViewportHeight = zhBaseHeight;
         }
         this.shellApi.viewportWidth = Math.max(zhBaseWidth,zhViewportWidth);
         this.shellApi.viewportHeight = Math.max(zhBaseHeight,zhViewportHeight);
         this.shellApi.viewportDeltaX = 0;
         this.shellApi.viewportDeltaY = 0;
         this.shellApi.viewportScale = zhScale;
         _container.x = 0;
         _container.y = 0;
         _container.scaleX = zhScale;
         _container.scaleY = zhScale;
         if(_backgroundContainer != null)
         {
            _backgroundContainer.width = this.shellApi.viewportWidth;
            _backgroundContainer.height = this.shellApi.viewportHeight;
         }
         return true;
      }`;

  const resizeMethod = `      public function resize(param1:Number, param2:Number) : void
      {
         var groupManager:GroupManager = null;
         var cameraSystem:CameraSystem = null;
         if(this.zhApplyBrowserAdaptiveViewport())
         {
            groupManager = this.shellApi.getManager(GroupManager) as GroupManager;
            if(groupManager != null)
            {
               groupManager.resize(this.shellApi.viewportWidth,this.shellApi.viewportHeight);
               cameraSystem = groupManager.getSystem(CameraSystem) as CameraSystem;
               if(cameraSystem != null)
               {
                  cameraSystem.jumpToTarget = true;
               }
            }
            return;
         }
         GroupManager(this.shellApi.getManager(GroupManager)).resize(param1,param2);
         if(_backgroundContainer != null)
         {
            _backgroundContainer.width = param1;
            _backgroundContainer.height = param2;
         }
      }`;
  next = replaceAs3Function(next, "      public function resize(param1:Number, param2:Number) : void", resizeMethod);

  const browserSetupCall = `         if(this.zhApplyBrowserAdaptiveViewport())
         {
            AppConfig.platformType = "desktop";
            createContainers(_container);
            return;
         }`;
  const currentSetupPattern = /         if\(this\.zhApplyBrowser(?:Adaptive|Cover|Live|Fit)Viewport\(\)\)\n         \{\n            AppConfig\.platformType = "desktop";\n            createContainers\(_container\);\n            return;\n         \}/u;
  if (currentSetupPattern.test(next)) {
    next = next.replace(currentSetupPattern, browserSetupCall);
  } else if (next.includes('         _stage.align = "TL";\n')) {
    next = next.replace('         _stage.align = "TL";\n', `         _stage.align = "TL";\n${browserSetupCall}\n`);
  } else {
    throw new Error("Unable to locate ScreenManager setupScreen stage align block.");
  }

  if (!next.includes("private function zhApplyBrowserAdaptiveViewport")) {
    const marker = "\n      public function resize";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate ScreenManager resize marker for adaptive helper.");
    }
    next = `${next.slice(0, markerIndex)}\n${adaptiveHelpers}\n${next.slice(markerIndex)}`;
  }

  if (!next.includes("zhApplyBrowserAdaptiveViewport") || !next.includes("cameraSystem.jumpToTarget = true") || next.includes("zhApplyBrowserCoverViewport") || next.includes("zhApplyBrowserLiveViewport") || next.includes("zhApplyBrowserFitViewport")) {
    throw new Error("ScreenManager adaptive camera viewport resize patch did not apply cleanly.");
  }
  next = next.replace(
    /_backgroundContainer = _loc2_\.createBox\(shellApi\.viewportWidth,shellApi\.viewportHeight(?:,\d+)?\);/u,
    "_backgroundContainer = _loc2_.createBox(shellApi.viewportWidth,shellApi.viewportHeight,5858397);"
  );
  if (!next.includes("_backgroundContainer = _loc2_.createBox(shellApi.viewportWidth,shellApi.viewportHeight,5858397);")) {
    throw new Error("Unable to patch ScreenManager browser background fill color.");
  }
  return next;
}

function main() {
  const config = loadConfig();
  const ffdecCli = config.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("FFDec CLI is not configured.");
  }

  const packShell = path.join(paths.as3PackDir, "swf", AS3_SHELL_PATH.replace(/\//gu, path.sep));
  if (!fileExists(packShell)) {
    throw new Error(`AS3 pack Shell.swf is missing: ${packShell}`);
  }

  const workDir = path.join(paths.tempDir, "as3-shell-layout-adaptive-camera-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  const outputSwf = path.join(workDir, "Shell.swf");

  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    SCREEN_MANAGER_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export ScreenManager");

  const screenManagerPath = findScreenManagerScript(scriptRoot);
  if (!screenManagerPath) {
    throw new Error("Unable to find exported ScreenManager.as.");
  }

  const originalScript = fs.readFileSync(screenManagerPath, "utf8");
  const patchedScript = applyAdaptiveResizePatch(originalScript);
  writeText(screenManagerPath, patchedScript);

  runFfdec(ffdecCli, [
    "-replace",
    packShell,
    outputSwf,
    SCREEN_MANAGER_CLASS,
    screenManagerPath
  ], "replace ScreenManager");

  fs.copyFileSync(outputSwf, packShell);

  const manifestPath = path.join(paths.as3PackDir, "manifest.json");
  const manifest = fileExists(manifestPath)
    ? readJson(manifestPath, {})
    : {
        generatedAt: new Date().toISOString(),
        sourceGroup: "as3",
        canonicalKeys: [],
        assetsPatched: 0,
        externalTextAssets: [],
        swfPatchedAssets: [],
        pendingSwfAssets: []
      };
  manifest.assetsPatched = Number(manifest.assetsPatched || 0) + 1;
  manifest.swfPatchedAssets = (Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [])
    .filter((entry) => !["as3-shell:layout-fit-scale-resize", "as3-shell:layout-cover-scale", "as3-shell:layout-live-resize", "as3-shell:layout-adaptive-resize"].includes(entry?.assetId));
  manifest.swfPatchedAssets.push({
    assetId: "as3-shell:layout-adaptive-camera-resize",
    assetPath: AS3_SHELL_PATH,
    outputPath: packShell
  });

  const runtimeZip = process.env.POPTROPICA_SKIP_RUNTIME_REBUILD === "1"
    ? {
        status: "skipped",
        reason: "POPTROPICA_SKIP_RUNTIME_REBUILD=1",
        runtimeZipPath: paths.as3RuntimeZipPath
      }
    : buildRuntimeZipForSourceGroup({
        config,
        sourceGroup: "as3",
        manifest
      });
  writeJson(manifestPath, manifest);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    packShell,
    runtimeZip,
    screenManagerPath,
    patch: "browser adaptive wide viewport on setup and resize; resize requests camera jump back to target"
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-shell-layout-adaptive-camera-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
