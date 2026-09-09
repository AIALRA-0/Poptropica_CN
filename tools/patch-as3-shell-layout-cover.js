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
const SCREEN_MANAGER_REPLACE_TARGET = "game.managers.ScreenManager";

function runFfdec(ffdecCli, args, label) {
  const result = spawnSync(ffdecCli, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || "").trim()}`);
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

function applyCoverScalePatch(content) {
  let next = String(content || "");
  const oldResize = `      private function onStageResize(param1:Event) : void
      {
         var zhStageWidth:Number = NaN;
         var zhStageHeight:Number = NaN;
         var groupManager:GroupManager = null;
         if(AppConfig.mobile || !PlatformUtils.inBrowser || this.shellApi == null)
         {
            return;
         }
         zhStageWidth = Math.max(1,_stage.stageWidth);
         zhStageHeight = Math.max(1,_stage.stageHeight);
         this.shellApi.viewportWidth = zhStageWidth;
         this.shellApi.viewportHeight = zhStageHeight;
         this.shellApi.viewportDeltaX = 0;
         this.shellApi.viewportDeltaY = 0;
         this.shellApi.viewportScale = 1;
         if(_container != null)
         {
            _container.scaleX = _container.scaleY = 1;
         }
         if(_backgroundContainer != null)
         {
            _backgroundContainer.width = zhStageWidth;
            _backgroundContainer.height = zhStageHeight;
         }
         groupManager = this.shellApi.getManager(GroupManager) as GroupManager;
         if(groupManager != null)
         {
            groupManager.resize(zhStageWidth,zhStageHeight);
         }
      }`;
  const newResize = `      private function onStageResize(param1:Event) : void
      {
         var groupManager:GroupManager = null;
         if(!this.zhApplyBrowserCoverViewport())
         {
            return;
         }
         groupManager = this.shellApi.getManager(GroupManager) as GroupManager;
         if(groupManager != null)
         {
            groupManager.resize(this.shellApi.viewportWidth,this.shellApi.viewportHeight);
         }
      }
      
      private function zhApplyBrowserCoverViewport() : Boolean
      {
         var zhStageWidth:Number = NaN;
         var zhStageHeight:Number = NaN;
         var zhBaseWidth:Number = NaN;
         var zhBaseHeight:Number = NaN;
         var zhScale:Number = NaN;
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
         }
         else
         {
            zhBaseWidth = GAME_HEIGHT;
            zhBaseHeight = GAME_WIDTH;
         }
         zhScale = Math.max(zhStageWidth / zhBaseWidth,zhStageHeight / zhBaseHeight);
         if(!isFinite(zhScale) || zhScale <= 0)
         {
            zhScale = 1;
         }
         this.shellApi.viewportWidth = zhStageWidth / zhScale;
         this.shellApi.viewportHeight = zhStageHeight / zhScale;
         this.shellApi.viewportDeltaX = this.shellApi.viewportWidth - zhBaseWidth;
         this.shellApi.viewportDeltaY = this.shellApi.viewportHeight - zhBaseHeight;
         this.shellApi.viewportScale = zhScale;
         _container.scaleX = _container.scaleY = zhScale;
         if(_backgroundContainer != null)
         {
            _backgroundContainer.width = this.shellApi.viewportWidth;
            _backgroundContainer.height = this.shellApi.viewportHeight;
         }
         return true;
      }`;
  const resizePattern = /      private function onStageResize\(param1:Event\) : void\r?\n      \{[\s\S]*?\r?\n      \}\r?\n      \r?\n      override protected function construct/u;
  if (resizePattern.test(next)) {
    next = next.replace(resizePattern, `${newResize}
      
      override protected function construct`);
  } else if (next.includes(oldResize)) {
    next = next.replace(oldResize, newResize);
  } else {
    throw new Error("Unable to locate current ScreenManager.onStageResize block.");
  }

  const oldSetup = `         var zhStageWidth:Number = Math.max(1,_stage.stageWidth);
         var zhStageHeight:Number = Math.max(1,_stage.stageHeight);
         if(!AppConfig.mobile && PlatformUtils.inBrowser && zhStageWidth > 100 && zhStageHeight > 100)
         {
            AppConfig.platformType = "desktop";
            shellApi.viewportWidth = zhStageWidth;
            shellApi.viewportHeight = zhStageHeight;
            shellApi.viewportDeltaX = 0;
            shellApi.viewportDeltaY = 0;
            shellApi.viewportScale = 1;
            _container.scaleX = _container.scaleY = 1;
            createContainers(_container);
            return;
         }`;
  const newSetup = `         if(this.zhApplyBrowserCoverViewport())
         {
            AppConfig.platformType = "desktop";
            createContainers(_container);
            return;
         }`;
  const setupPattern = /         var zhStageWidth:Number = Math\.max\(1,_stage\.stageWidth\);\r?\n         var zhStageHeight:Number = Math\.max\(1,_stage\.stageHeight\);\r?\n         if\(!AppConfig\.mobile && PlatformUtils\.inBrowser && zhStageWidth > 100 && zhStageHeight > 100\)\r?\n         \{[\s\S]*?\r?\n         \}\r?\n         if\(AppConfig\.mobile \|\| AppConfig\.debug && !PlatformUtils\.inBrowser\)/u;
  if (setupPattern.test(next)) {
    next = next.replace(setupPattern, `${newSetup}
         if(AppConfig.mobile || AppConfig.debug && !PlatformUtils.inBrowser)`);
  } else if (next.includes(oldSetup)) {
    next = next.replace(oldSetup, newSetup);
  } else {
    throw new Error("Unable to locate current ScreenManager browser setup block.");
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

  const workDir = path.join(paths.tempDir, "as3-shell-layout-cover-patch");
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
  const patchedScript = applyCoverScalePatch(originalScript);
  writeText(screenManagerPath, patchedScript);

  runFfdec(ffdecCli, [
    "-replace",
    packShell,
    outputSwf,
    SCREEN_MANAGER_REPLACE_TARGET,
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
    assetId: "as3-shell:layout-cover-scale",
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
    patch: "browser cover-scale viewport on setup and resize"
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-shell-layout-cover-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
