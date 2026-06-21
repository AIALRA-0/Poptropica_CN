const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, readJson, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const PATCH_CLASS = "game.ui.transitions.LogoLoadingScreen";
const PATCH_ASSET_ID = "as3-shell:loading-screen-hold-adaptive-center";
const REPLACED_PATCH_ASSET_IDS = new Set([
  "as3-shell:qa-loading-screen-hold",
  PATCH_ASSET_ID
]);

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

function findScript(root, relativeSuffix) {
  const normalizedSuffix = relativeSuffix.replace(/\//gu, path.sep).toLowerCase();
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (fullPath.toLowerCase().endsWith(normalizedSuffix)) {
        return fullPath;
      }
    }
  }
  return null;
}

function addImport(source, afterImport, newImport) {
  if (source.includes(newImport)) {
    return source;
  }
  if (!source.includes(afterImport)) {
    throw new Error(`Unable to locate import anchor: ${afterImport}`);
  }
  return source.replace(`${afterImport}\n`, `${afterImport}\n${newImport}\n`);
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

function patchLogoLoadingScreen(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import ash.core.Entity;", "   import com.poptropica.AppConfig;");
  if (!next.includes("private var _flashpointQaEarlyOutHoldSeconds")) {
    next = next.replace(
      "      private var _hints:Array;",
      "      private var _hints:Array;\n      \n      private var _flashpointQaEarlyOutHoldSeconds:Number = 0;"
    );
  }

  const transitionOutMethod = `      public function transitionOut(param1:Function = null) : void
      {
         var _loc2_:int = 0;
         var _loc4_:Entity = null;
         var _loc3_:LoadingScreenLetterComponent = null;
         var _loc5_:Number = Number(NaN);
         _callback = param1;
         _loc5_ = this.flashpointQaLoadingHoldSeconds();
         if(_displayed)
         {
            if(_loc5_ > 0)
            {
               SceneUtil.addTimedEvent(this,new TimedEvent(_loc5_,1,allDone));
            }
            else
            {
               _loc2_ = 1;
               while(_loc2_ <= 16)
               {
                  _loc4_ = getEntityById("letter" + _loc2_);
                  if(_loc4_ != null)
                  {
                     _loc3_ = _loc4_.get(LoadingScreenLetterComponent);
                     if(_loc3_ != null)
                     {
                        _loc3_.startY = -100;
                        _loc3_.baseY = -100;
                     }
                  }
                  _loc2_++;
               }
               SceneUtil.addTimedEvent(this,new TimedEvent(0.75,1,allDone));
            }
         }
         else
         {
            super.stopFileLoad(new Array("logoLoadingScreen.swf","hints.xml"));
            allDone();
         }
         if(_hintText != null && _hintText.parent != null)
         {
            _hintText.parent.removeChild(_hintText);
         }
      }
`;
  next = replaceAs3Function(next, "      public function transitionOut(param1:Function = null) : void", transitionOutMethod);
  if (!next.includes("this.flashpointQaShowEarlyOutHold();")) {
    next = next.replace(
      "         super.loaded();",
      "         super.loaded();\n         this.flashpointQaShowEarlyOutHold();"
    );
  }

  const setupPoptropicaLogoMethod = `      private function setupPoptropicaLogo() : void
      {
         var _loc2_:int = 0;
         var _loc1_:Boolean = false;
         var _loc3_:Boolean = false;
         var _loc4_:Entity = null;
         var _loc5_:Number = Number(NaN);
         var _loc6_:Number = Number(NaN);
         _loc5_ = this.flashpointAdaptiveLoadingExtraX();
         _loc6_ = this.flashpointAdaptiveLoadingExtraY();
         _loc2_ = 1;
         while(_loc2_ <= 16)
         {
            _loc1_ = false;
            if(_loc2_ < 11)
            {
               _loc1_ = true;
            }
            _loc3_ = true;
            if(_loc2_ > 11)
            {
               _loc3_ = false;
            }
            _loc4_ = EntityUtils.createSpatialEntity(this,_screen["l" + _loc2_]);
            _loc4_.add(new Id("letter" + _loc2_));
            _loc4_.get(Spatial).x = _loc4_.get(Spatial).x + super.shellApi.viewportDeltaX * 0.5 + _loc5_;
            _loc4_.get(Spatial).y = _loc4_.get(Spatial).y + super.shellApi.viewportDeltaY * 0.5 + _loc6_;
            _loc4_.add(new LoadingScreenLetterComponent(_loc4_.get(Spatial),_loc2_,_loc3_,_loc1_,_loc1_));
            _loc2_++;
         }
         super.systemManager.updateComplete.addOnce(showScreen);
         _displayed = true;
      }
`;
  next = replaceAs3Function(next, "      private function setupPoptropicaLogo() : void", setupPoptropicaLogoMethod);

  const loadingHoldMethod = `      private function flashpointQaLoadingHoldSeconds() : Number
      {
         var _loc1_:String = "";
         var _loc2_:Array = null;
         var _loc3_:Number = NaN;
         var _loc4_:Object = null;
         if(super.groupContainer != null && super.groupContainer.root != null && super.groupContainer.root.loaderInfo != null)
         {
            _loc4_ = super.groupContainer.root.loaderInfo.parameters;
            if(_loc4_ != null && _loc4_.hasOwnProperty("flashpointQaLoadingHoldMs"))
            {
               _loc3_ = Number(_loc4_["flashpointQaLoadingHoldMs"]);
               if(!isNaN(_loc3_) && _loc3_ > 0)
               {
                  if(_loc3_ > 15000)
                  {
                     _loc3_ = 15000;
                  }
                  return _loc3_ / 1000;
               }
            }
         }
         if(super.shellApi != null && super.shellApi.screenManager != null && super.shellApi.screenManager.stage != null)
         {
            _loc4_ = super.shellApi.screenManager.stage.loaderInfo.parameters;
            if(_loc4_ != null && _loc4_.hasOwnProperty("flashpointQaLoadingHoldMs"))
            {
               _loc3_ = Number(_loc4_["flashpointQaLoadingHoldMs"]);
               if(!isNaN(_loc3_) && _loc3_ > 0)
               {
                  if(_loc3_ > 15000)
                  {
                     _loc3_ = 15000;
                  }
                  return _loc3_ / 1000;
               }
            }
         }
         if(AppConfig.applicationUrl == null)
         {
            return 0;
         }
         _loc1_ = String(AppConfig.applicationUrl);
         _loc2_ = _loc1_.match(/[?&]flashpointQaLoadingHoldMs=([0-9]{1,5})/);
         if(_loc2_ == null || _loc2_.length < 2)
         {
            return 0;
         }
         _loc3_ = Number(_loc2_[1]);
         if(isNaN(_loc3_) || _loc3_ <= 0)
         {
            return 0;
         }
         if(_loc3_ > 15000)
         {
            _loc3_ = 15000;
         }
         return _loc3_ / 1000;
      }
`;

  const showEarlyOutMethod = `      private function flashpointQaShowEarlyOutHold() : void
      {
         if(this._flashpointQaEarlyOutHoldSeconds <= 0 || super.removalPending || _screen == null)
         {
            return;
         }
         if(!PlatformUtils.isMobileOS && !_displayed)
         {
            setupPoptropicaLogo();
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(this._flashpointQaEarlyOutHoldSeconds,1,allDone));
         this._flashpointQaEarlyOutHoldSeconds = 0;
      }
`;

  const adaptiveExtraXMethod = `      private function flashpointAdaptiveLoadingExtraX() : Number
      {
         var _loc1_:Number = Number(NaN);
         if(super.shellApi == null)
         {
            return 0;
         }
         _loc1_ = 960;
         if(super.shellApi.viewportHeight > super.shellApi.viewportWidth)
         {
            _loc1_ = 640;
         }
         return Math.max(0,(super.shellApi.viewportWidth - _loc1_) * 0.5);
      }
`;
  const adaptiveExtraYMethod = `      private function flashpointAdaptiveLoadingExtraY() : Number
      {
         var _loc1_:Number = Number(NaN);
         if(super.shellApi == null)
         {
            return 0;
         }
         _loc1_ = 640;
         if(super.shellApi.viewportHeight > super.shellApi.viewportWidth)
         {
            _loc1_ = 960;
         }
         return Math.max(0,(super.shellApi.viewportHeight - _loc1_) * 0.5);
      }
`;
  const adaptiveCenterMethods = `${adaptiveExtraXMethod}      
${adaptiveExtraYMethod}`;

  if (!next.includes("private function flashpointQaLoadingHoldSeconds")) {
    const marker = "\n      private function allDone() : void";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate LogoLoadingScreen allDone marker.");
    }
    next = `${next.slice(0, markerIndex)}\n      \n${loadingHoldMethod}${next.slice(markerIndex)}`;
  } else {
    next = replaceAs3Function(next, "      private function flashpointQaLoadingHoldSeconds() : Number", loadingHoldMethod);
  }
  if (!next.includes("private function flashpointQaShowEarlyOutHold")) {
    const marker = "\n      private function flashpointQaLoadingHoldSeconds";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate LogoLoadingScreen QA hold seconds marker.");
    }
    next = `${next.slice(0, markerIndex)}\n      \n${showEarlyOutMethod}${next.slice(markerIndex)}`;
  } else {
    next = replaceAs3Function(next, "      private function flashpointQaShowEarlyOutHold() : void", showEarlyOutMethod);
  }
  if (!next.includes("private function flashpointAdaptiveLoadingExtraX")) {
    const marker = "\n      private function flashpointQaShowEarlyOutHold";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate LogoLoadingScreen adaptive center marker.");
    }
    next = `${next.slice(0, markerIndex)}\n      \n${adaptiveCenterMethods}${next.slice(markerIndex)}`;
  } else {
    next = replaceAs3Function(next, "      private function flashpointAdaptiveLoadingExtraX() : Number", adaptiveExtraXMethod);
    next = replaceAs3Function(next, "      private function flashpointAdaptiveLoadingExtraY() : Number", adaptiveExtraYMethod);
  }

  if (!next.includes("flashpointQaLoadingHoldSeconds") || !next.includes("flashpointQaLoadingHoldMs") || !next.includes("flashpointQaShowEarlyOutHold") || !next.includes("stage.loaderInfo.parameters") || !next.includes("flashpointAdaptiveLoadingExtraX") || !next.includes("+ _loc5_;") || next.includes("else if(_loc5_ > 0)") || next.includes("-50 - _loc2_ * (50 + super.shellApi.viewportDeltaY * 0.5)")) {
    throw new Error("LogoLoadingScreen QA hold patch did not apply cleanly.");
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

  const workDir = path.join(paths.tempDir, "as3-shell-loading-hold-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");

  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    PATCH_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export AS3 LogoLoadingScreen");

  const scriptPath = findScript(scriptRoot, "game/ui/transitions/LogoLoadingScreen.as");
  if (!scriptPath) {
    throw new Error("Exported LogoLoadingScreen.as was not found.");
  }
  writeText(scriptPath, patchLogoLoadingScreen(fs.readFileSync(scriptPath, "utf8")));

  const outputSwf = path.join(workDir, "Shell-loading-hold.swf");
  runFfdec(ffdecCli, [
    "-replace",
    packShell,
    outputSwf,
    PATCH_CLASS,
    scriptPath
  ], "replace AS3 LogoLoadingScreen");
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
    .filter((entry) => !REPLACED_PATCH_ASSET_IDS.has(entry?.assetId));
  manifest.swfPatchedAssets.push({
    assetId: PATCH_ASSET_ID,
    assetPath: AS3_SHELL_PATH,
    outputPath: packShell,
    classes: [PATCH_CLASS]
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
    patchedScript: {
      className: PATCH_CLASS,
      scriptPath
    },
    patch: "LogoLoadingScreen hold via flashpointQaLoadingHoldMs plus adaptive wide-viewport logo centering"
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-shell-loading-hold-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
