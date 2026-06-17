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

function applyLiveResizePatch(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const liveMethods = `      private function onStageResize(param1:Event) : void
      {
         var groupManager:GroupManager = null;
         if(!this.zhApplyBrowserLiveViewport())
         {
            return;
         }
         groupManager = this.shellApi.getManager(GroupManager) as GroupManager;
         if(groupManager != null)
         {
            groupManager.resize(this.shellApi.viewportWidth,this.shellApi.viewportHeight);
         }
      }
      
      private function zhApplyBrowserLiveViewport() : Boolean
      {
         var zhStageWidth:Number = Number(NaN);
         var zhStageHeight:Number = Number(NaN);
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
         this.shellApi.viewportWidth = zhStageWidth;
         this.shellApi.viewportHeight = zhStageHeight;
         this.shellApi.viewportDeltaX = 0;
         this.shellApi.viewportDeltaY = 0;
         this.shellApi.viewportScale = 1;
         _container.x = 0;
         _container.y = 0;
         _container.scaleX = 1;
         _container.scaleY = 1;
         if(_backgroundContainer != null)
         {
            _backgroundContainer.width = zhStageWidth;
            _backgroundContainer.height = zhStageHeight;
         }
         return true;
      }`;

  const resizePattern = /      private function onStageResize\(param1:Event\) : void\n      \{[\s\S]*?\n      override protected function construct/u;
  if (!resizePattern.test(next)) {
    throw new Error("Unable to locate ScreenManager resize method block.");
  }
  next = next.replace(resizePattern, `${liveMethods}
      
      override protected function construct`);

  const currentSetupPattern = /         if\(this\.zhApplyBrowser(?:Cover|Live)Viewport\(\)\)\n         \{\n            AppConfig\.platformType = "desktop";\n            createContainers\(_container\);\n            return;\n         \}/u;
  if (currentSetupPattern.test(next)) {
    next = next.replace(currentSetupPattern, `         if(this.zhApplyBrowserLiveViewport())
         {
            AppConfig.platformType = "desktop";
            createContainers(_container);
            return;
         }`);
  } else {
    const preLiveSetupPattern = /         var zhStageWidth:Number = Math\.max\(1,_stage\.stageWidth\);\n         var zhStageHeight:Number = Math\.max\(1,_stage\.stageHeight\);\n         if\(!AppConfig\.mobile && PlatformUtils\.inBrowser && zhStageWidth > 100 && zhStageHeight > 100\)\n         \{[\s\S]*?\n         \}\n         if\(AppConfig\.mobile \|\| AppConfig\.debug && !PlatformUtils\.inBrowser\)/u;
    if (!preLiveSetupPattern.test(next)) {
      throw new Error("Unable to locate ScreenManager browser setup block.");
    }
    next = next.replace(preLiveSetupPattern, `         if(this.zhApplyBrowserLiveViewport())
         {
            AppConfig.platformType = "desktop";
            createContainers(_container);
            return;
         }
         if(AppConfig.mobile || AppConfig.debug && !PlatformUtils.inBrowser)`);
  }

  if (!next.includes("zhApplyBrowserLiveViewport") || next.includes("zhApplyBrowserCoverViewport")) {
    throw new Error("ScreenManager live resize patch did not apply cleanly.");
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

  const workDir = path.join(paths.tempDir, "as3-shell-layout-live-patch");
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
  const patchedScript = applyLiveResizePatch(originalScript);
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
  manifest.swfPatchedAssets = Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [];
  manifest.swfPatchedAssets.push({
    assetId: "as3-shell:layout-live-resize",
    assetPath: AS3_SHELL_PATH,
    outputPath: packShell
  });

  const runtimeZip = buildRuntimeZipForSourceGroup({
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
    patch: "browser live stage viewport on setup and resize"
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-shell-layout-live-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
