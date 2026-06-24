const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, readJson, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const PATCH_CLASS = "com.poptropica.shellSteps.shared.SetActiveProfile";
const BROWSER_PROFILE_CLASS = "com.poptropica.shells.browser.steps.BrowserStepSetActiveProfile";
const BROWSER_PLAYER_DATA_CLASS = "com.poptropica.shells.browser.steps.BrowserStepGetPlayerData";
const PATCH_ASSET_ID = "as3-shell:qa-seed-events-and-start-position";

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
  throw new Error(`Unable to find end of function body for: ${signature}`);
}

function patchSetActiveProfile(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import game.managers.ProfileManager;", "   import game.data.profile.ProfileData;");
  next = addImport(next, "   import game.util.DataUtils;", "   import game.util.ProxyUtils;");
  next = next.replace("         built();", "         super.built();");
  const determineCall = "         _loc3_.activeLogin = param1;\n";
  if (!next.includes("this.flashpointApplyQaProfileState(_loc3_)")) {
    if (!next.includes(determineCall)) {
      throw new Error("Unable to locate SetActiveProfile activeLogin assignment.");
    }
    next = next.replace(determineCall, `${determineCall}         this.flashpointApplyQaProfileState(_loc3_);\n`);
  }

  const qaParamMethod = `      private function flashpointQaParam(param1:String) : String
      {
         var _loc2_:Object = null;
         var _loc3_:String = null;
         var _loc4_:Array = null;
         var _loc5_:String = null;
         var _loc6_:int = 0;
         if(shell != null && shell.root != null && shell.root.loaderInfo != null)
         {
            _loc2_ = ProxyUtils.getQueryStringData(shell.root.loaderInfo,param1);
            if(_loc2_ != null && String(_loc2_) != "" && String(_loc2_) != "undefined")
            {
               return unescape(String(_loc2_));
            }
            _loc2_ = shell.root.loaderInfo.parameters[param1];
            if(_loc2_ != null && String(_loc2_) != "" && String(_loc2_) != "undefined")
            {
               return unescape(String(_loc2_));
            }
            _loc3_ = String(shell.root.loaderInfo.url || "");
            _loc6_ = _loc3_.indexOf("?");
            if(_loc6_ >= 0)
            {
               _loc4_ = _loc3_.substr(_loc6_ + 1).split("&");
               for each(_loc5_ in _loc4_)
               {
                  if(_loc5_.indexOf(param1 + "=") == 0)
                  {
                     return unescape(_loc5_.substr(param1.length + 1));
                  }
               }
            }
         }
         return "";
      }
`;

  const applyMethod = `      private function flashpointApplyQaProfileState(param1:ProfileManager) : void
      {
         var _loc2_:ProfileData = null;
         var _loc3_:String = null;
         var _loc4_:String = null;
         var _loc5_:Array = null;
         var _loc6_:int = 0;
         var _loc7_:String = null;
         var _loc8_:String = null;
         var _loc9_:String = null;
         var _loc10_:String = null;
         var _loc11_:Boolean = false;
         if(param1 == null)
         {
            return;
         }
         _loc2_ = param1.active;
         if(_loc2_ == null)
         {
            return;
         }
         _loc3_ = this.flashpointQaParam("flashpointSeedIsland");
         _loc4_ = this.flashpointQaParam("flashpointSeedEvents");
         if(_loc3_ && _loc4_ && /^[A-Za-z0-9_]+$/.test(_loc3_) && /^[A-Za-z0-9_,]+$/.test(_loc4_))
         {
            if(!_loc2_.events[_loc3_])
            {
               _loc2_.events[_loc3_] = [];
            }
            _loc5_ = _loc4_.split(",");
            _loc6_ = 0;
            while(_loc6_ < _loc5_.length)
            {
               _loc7_ = String(_loc5_[_loc6_] || "");
               if(_loc7_ && _loc2_.events[_loc3_].indexOf(_loc7_) == -1)
               {
                  _loc2_.events[_loc3_].push(_loc7_);
                  _loc11_ = true;
               }
               _loc6_++;
            }
            _loc2_.island = _loc3_;
         }
         _loc8_ = this.flashpointQaParam("flashpointStartX");
         _loc9_ = this.flashpointQaParam("flashpointStartY");
         if(_loc8_ && _loc9_ && !isNaN(Number(_loc8_)) && !isNaN(Number(_loc9_)))
         {
            _loc2_.lastX = Number(_loc8_);
            _loc2_.lastY = Number(_loc9_);
            _loc11_ = true;
         }
         _loc10_ = this.flashpointQaParam("flashpointStartDirection");
         if(_loc10_ == "left" || _loc10_ == "right")
         {
            _loc2_.lastDirection = _loc10_;
            _loc11_ = true;
         }
         if(_loc11_)
         {
            param1.save();
         }
      }
`;

  if (!next.includes("private function flashpointApplyQaProfileState")) {
    const insertIndex = next.lastIndexOf("\n   }\n}");
    if (insertIndex === -1) {
      throw new Error("Unable to locate SetActiveProfile class closing brace.");
    }
    const methods = `
      
${qaParamMethod}      
${applyMethod}
`;
    next = `${next.slice(0, insertIndex)}${methods}${next.slice(insertIndex)}`;
  } else {
    if (!next.includes("private function flashpointQaParam")) {
      const marker = "\n      private function flashpointApplyQaProfileState";
      if (!next.includes(marker)) {
        throw new Error("Unable to locate SetActiveProfile QA method marker.");
      }
      next = next.replace(marker, `\n      \n${qaParamMethod}${marker}`);
    } else {
      next = replaceAs3Function(next, "      private function flashpointQaParam(param1:String) : String", qaParamMethod);
    }
    next = replaceAs3Function(next, "      private function flashpointApplyQaProfileState(param1:ProfileManager) : void", applyMethod);
  }
  if (!next.includes('this.flashpointQaParam("flashpointSeedIsland")') || !next.includes('shell.root.loaderInfo.url') || !next.includes("return unescape(_loc5_.substr(param1.length + 1))")) {
    throw new Error("SetActiveProfile QA seed patch did not apply cleanly.");
  }
  return next;
}

function patchShellApi(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const qaParamMethod = `      private function flashpointQaShellParam(param1:String) : String
      {
         var _loc2_:Object = null;
         var _loc3_:String = null;
         var _loc4_:Array = null;
         var _loc5_:String = null;
         var _loc6_:int = 0;
         if(this._shell != null && this._shell.root != null && this._shell.root.loaderInfo != null)
         {
            _loc2_ = ProxyUtils.getQueryStringData(this._shell.root.loaderInfo,param1);
            if(_loc2_ != null && String(_loc2_) != "" && String(_loc2_) != "undefined")
            {
               return unescape(String(_loc2_));
            }
            _loc3_ = String(this._shell.root.loaderInfo.url || "");
            _loc6_ = _loc3_.indexOf("?");
            if(_loc6_ >= 0)
            {
               _loc4_ = _loc3_.substr(_loc6_ + 1).split("&");
               for each(_loc5_ in _loc4_)
               {
                  if(_loc5_.indexOf(param1 + "=") == 0)
                  {
                     return unescape(_loc5_.substr(param1.length + 1));
                  }
               }
            }
         }
         return "";
      }
`;

  const seedMatchMethod = `      private function flashpointQaSeedEventMatches(param1:String, param2:String = null) : Boolean
      {
         var _loc3_:String = null;
         var _loc4_:Array = null;
         var _loc5_:String = null;
         var _loc6_:String = null;
         var _loc7_:String = null;
         _loc3_ = this.flashpointQaShellParam("flashpointSeedEvents");
         if(_loc3_ == null || _loc3_ == "")
         {
            return false;
         }
         _loc4_ = _loc3_.split(",");
         _loc5_ = String(param1 || "");
         _loc6_ = this.flashpointQaShellParam("flashpointSeedIsland");
         _loc7_ = param2 == null || param2 == "" ? this.island : param2;
         if(_loc6_ != "" && _loc7_ != null && _loc7_ != "" && _loc7_ != _loc6_ && _loc7_ != this.island)
         {
            return false;
         }
         return _loc4_.indexOf(_loc5_) != -1;
      }
`;

  const checkEventMethod = `      public function checkEvent(param1:String, param2:String = null) : Boolean
      {
         if(param2 == null)
         {
            param2 = this.island;
         }
         if(this.flashpointQaSeedEventMatches(param1,param2))
         {
            return true;
         }
         return this.gameEventManager.check(param1,param2);
      }
`;

  if (!next.includes("private function flashpointQaShellParam")) {
    const marker = "\n      public function checkEvent";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate ShellApi checkEvent marker.");
    }
    next = next.replace(marker, `\n      \n${qaParamMethod}      \n${seedMatchMethod}${marker}`);
  } else {
    next = replaceAs3Function(next, "      private function flashpointQaShellParam(param1:String) : String", qaParamMethod);
    next = replaceAs3Function(next, "      private function flashpointQaSeedEventMatches(param1:String, param2:String = null) : Boolean", seedMatchMethod);
  }
  next = replaceAs3Function(next, "      public function checkEvent(param1:String, param2:String = null) : Boolean", checkEventMethod);
  if (!next.includes('this.flashpointQaShellParam("flashpointSeedEvents")') || !next.includes("this.flashpointQaSeedEventMatches(param1,param2)") || !next.includes("this._shell.root.loaderInfo.url")) {
    throw new Error("ShellApi QA seed event patch did not apply cleanly.");
  }
  return next;
}

function patchBrowserStepSetActiveProfile(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = next.replace("         built();", "         super.built();");
  const determineCall = "         super.determineActiveProfile(login,clearProfile);\n";
  if (!next.includes("this.flashpointApplyBrowserQaProfileState(profileManager)")) {
    if (!next.includes(determineCall)) {
      throw new Error("Unable to locate BrowserStepSetActiveProfile determineActiveProfile call.");
    }
    next = next.replace(determineCall, `${determineCall}         this.flashpointApplyBrowserQaProfileState(profileManager);\n`);
  }

  const qaParamMethod = `      private function flashpointQaBrowserParam(param1:String) : String
      {
         var _loc2_:Object = null;
         var _loc3_:String = null;
         var _loc4_:Array = null;
         var _loc5_:String = null;
         var _loc6_:int = 0;
         if(shell != null && shell.root != null && shell.root.loaderInfo != null)
         {
            _loc2_ = ProxyUtils.getQueryStringData(shell.root.loaderInfo,param1);
            if(_loc2_ != null && String(_loc2_) != "" && String(_loc2_) != "undefined")
            {
               return unescape(String(_loc2_));
            }
            _loc2_ = shell.root.loaderInfo.parameters[param1];
            if(_loc2_ != null && String(_loc2_) != "" && String(_loc2_) != "undefined")
            {
               return unescape(String(_loc2_));
            }
            _loc3_ = String(shell.root.loaderInfo.url || "");
            _loc6_ = _loc3_.indexOf("?");
            if(_loc6_ >= 0)
            {
               _loc4_ = _loc3_.substr(_loc6_ + 1).split("&");
               for each(_loc5_ in _loc4_)
               {
                  if(_loc5_.indexOf(param1 + "=") == 0)
                  {
                     return unescape(_loc5_.substr(param1.length + 1));
                  }
               }
            }
         }
         return "";
      }
`;

  const applyMethod = `      private function flashpointApplyBrowserQaProfileState(param1:ProfileManager) : void
      {
         var _loc2_:ProfileData = null;
         var _loc3_:String = null;
         var _loc4_:String = null;
         var _loc5_:Array = null;
         var _loc6_:int = 0;
         var _loc7_:String = null;
         var _loc8_:String = null;
         var _loc9_:String = null;
         var _loc10_:String = null;
         var _loc11_:Boolean = false;
         if(param1 == null)
         {
            return;
         }
         _loc2_ = param1.active;
         if(_loc2_ == null)
         {
            return;
         }
         _loc3_ = this.flashpointQaBrowserParam("flashpointSeedIsland");
         _loc4_ = this.flashpointQaBrowserParam("flashpointSeedEvents");
         if(_loc3_ && _loc4_ && /^[A-Za-z0-9_]+$/.test(_loc3_) && /^[A-Za-z0-9_,]+$/.test(_loc4_))
         {
            if(!_loc2_.events[_loc3_])
            {
               _loc2_.events[_loc3_] = [];
            }
            _loc5_ = _loc4_.split(",");
            _loc6_ = 0;
            while(_loc6_ < _loc5_.length)
            {
               _loc7_ = String(_loc5_[_loc6_] || "");
               if(_loc7_)
               {
                  if(_loc2_.events[_loc3_].indexOf(_loc7_) == -1)
                  {
                     _loc2_.events[_loc3_].push(_loc7_);
                     _loc11_ = true;
                  }
                  if(shellApi.gameEventManager != null)
                  {
                     shellApi.gameEventManager.complete(_loc7_,_loc3_);
                  }
               }
               _loc6_++;
            }
            _loc2_.island = _loc3_;
         }
         _loc8_ = this.flashpointQaBrowserParam("flashpointStartX");
         _loc9_ = this.flashpointQaBrowserParam("flashpointStartY");
         if(_loc8_ && _loc9_ && !isNaN(Number(_loc8_)) && !isNaN(Number(_loc9_)))
         {
            _loc2_.lastX = Number(_loc8_);
            _loc2_.lastY = Number(_loc9_);
            _loc11_ = true;
         }
         _loc10_ = this.flashpointQaBrowserParam("flashpointStartDirection");
         if(_loc10_ == "left" || _loc10_ == "right")
         {
            _loc2_.lastDirection = _loc10_;
            _loc11_ = true;
         }
         if(_loc11_)
         {
            param1.save();
         }
      }
`;

  if (!next.includes("private function flashpointQaBrowserParam")) {
    const marker = "\n   }\n}";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate BrowserStepSetActiveProfile class closing brace.");
    }
    next = next.replace(marker, `\n      \n${qaParamMethod}      \n${applyMethod}${marker}`);
  } else {
    next = replaceAs3Function(next, "      private function flashpointQaBrowserParam(param1:String) : String", qaParamMethod);
    next = replaceAs3Function(next, "      private function flashpointApplyBrowserQaProfileState(param1:ProfileManager) : void", applyMethod);
  }
  if (!next.includes("this.flashpointApplyBrowserQaProfileState(profileManager)") || !next.includes("shellApi.gameEventManager.complete(_loc7_,_loc3_)") || !next.includes('this.flashpointQaBrowserParam("flashpointSeedEvents")')) {
    throw new Error("BrowserStepSetActiveProfile QA seed patch did not apply cleanly.");
  }
  return next;
}

function patchBrowserStepGetPlayerData(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = next.replace(/(^|\s)built\(\);/gmu, "$1super.built();");
  const applyCall = "                  this.shellApi.gameEventManager.restore(profile.events);\n";
  if (next.includes(applyCall) && !next.includes("this.flashpointApplyBrowserQaDataSeedEvents(profile);")) {
    next = next.replace(applyCall, `${applyCall}                  this.flashpointApplyBrowserQaDataSeedEvents(profile);\n`);
  }
  const beforeBuildDone = "               profileManager.buildingProfile = false;\n";
  if (!next.includes("this.flashpointApplyBrowserQaDataSeedEvents(profile);")) {
    if (!next.includes(beforeBuildDone)) {
      throw new Error("Unable to locate BrowserStepGetPlayerData profile completion marker.");
    }
    next = next.replace(beforeBuildDone, `               this.flashpointApplyBrowserQaDataSeedEvents(profile);\n${beforeBuildDone}`);
  }

  const qaParamMethod = `      private function flashpointQaBrowserDataParam(param1:String) : String
      {
         var _loc2_:Object = null;
         var _loc3_:String = null;
         var _loc4_:Array = null;
         var _loc5_:String = null;
         var _loc6_:int = 0;
         if(shell != null && shell.root != null && shell.root.loaderInfo != null)
         {
            _loc2_ = ProxyUtils.getQueryStringData(shell.root.loaderInfo,param1);
            if(_loc2_ != null && String(_loc2_) != "" && String(_loc2_) != "undefined")
            {
               return unescape(String(_loc2_));
            }
            _loc2_ = shell.root.loaderInfo.parameters[param1];
            if(_loc2_ != null && String(_loc2_) != "" && String(_loc2_) != "undefined")
            {
               return unescape(String(_loc2_));
            }
            _loc3_ = String(shell.root.loaderInfo.url || "");
            _loc6_ = _loc3_.indexOf("?");
            if(_loc6_ >= 0)
            {
               _loc4_ = _loc3_.substr(_loc6_ + 1).split("&");
               for each(_loc5_ in _loc4_)
               {
                  if(_loc5_.indexOf(param1 + "=") == 0)
                  {
                     return unescape(_loc5_.substr(param1.length + 1));
                  }
               }
            }
         }
         return "";
      }
`;

  const applyMethod = `      private function flashpointApplyBrowserQaDataSeedEvents(param1:ProfileData) : void
      {
         var _loc2_:String = null;
         var _loc3_:String = null;
         var _loc4_:Array = null;
         var _loc5_:int = 0;
         var _loc6_:String = null;
         if(param1 == null)
         {
            return;
         }
         _loc2_ = this.flashpointQaBrowserDataParam("flashpointSeedIsland");
         _loc3_ = this.flashpointQaBrowserDataParam("flashpointSeedEvents");
         if(!(_loc2_ && _loc3_ && /^[A-Za-z0-9_]+$/.test(_loc2_) && /^[A-Za-z0-9_,]+$/.test(_loc3_)))
         {
            return;
         }
         if(!param1.events[_loc2_])
         {
            param1.events[_loc2_] = [];
         }
         _loc4_ = _loc3_.split(",");
         _loc5_ = 0;
         while(_loc5_ < _loc4_.length)
         {
            _loc6_ = String(_loc4_[_loc5_] || "");
            if(_loc6_)
            {
               if(param1.events[_loc2_].indexOf(_loc6_) == -1)
               {
                  param1.events[_loc2_].push(_loc6_);
               }
               if(shellApi.gameEventManager != null)
               {
                  shellApi.gameEventManager.complete(_loc6_,_loc2_);
               }
            }
            _loc5_++;
         }
         param1.island = _loc2_;
         shellApi.profileManager.save();
      }
`;

  if (!next.includes("private function flashpointQaBrowserDataParam")) {
    const marker = "\n      private function generateEventsForItems";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate BrowserStepGetPlayerData method insertion marker.");
    }
    next = next.replace(marker, `\n      \n${qaParamMethod}      \n${applyMethod}${marker}`);
  } else {
    next = replaceAs3Function(next, "      private function flashpointQaBrowserDataParam(param1:String) : String", qaParamMethod);
    next = replaceAs3Function(next, "      private function flashpointApplyBrowserQaDataSeedEvents(param1:ProfileData) : void", applyMethod);
  }
  if (!next.includes("this.flashpointApplyBrowserQaDataSeedEvents(profile)") || !next.includes('this.flashpointQaBrowserDataParam("flashpointSeedEvents")') || !next.includes("shellApi.gameEventManager.complete(_loc6_,_loc2_)")) {
    throw new Error("BrowserStepGetPlayerData QA seed patch did not apply cleanly.");
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

  const workDir = path.join(paths.tempDir, "as3-shell-qa-seed-events-patch");
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
  ], "export AS3 shell QA seed class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    BROWSER_PROFILE_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export AS3 browser profile QA seed class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    BROWSER_PLAYER_DATA_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export AS3 browser player data QA seed class");

  const scriptPath = findScript(scriptRoot, "com/poptropica/shellSteps/shared/SetActiveProfile.as");
  if (!scriptPath) {
    throw new Error("Exported SetActiveProfile.as was not found.");
  }
  const browserProfileScriptPath = findScript(scriptRoot, "com/poptropica/shells/browser/steps/BrowserStepSetActiveProfile.as");
  if (!browserProfileScriptPath) {
    throw new Error("Exported BrowserStepSetActiveProfile.as was not found.");
  }
  const browserPlayerDataScriptPath = findScript(scriptRoot, "com/poptropica/shells/browser/steps/BrowserStepGetPlayerData.as");
  if (!browserPlayerDataScriptPath) {
    throw new Error("Exported BrowserStepGetPlayerData.as was not found.");
  }
  writeText(scriptPath, patchSetActiveProfile(fs.readFileSync(scriptPath, "utf8")));
  writeText(browserProfileScriptPath, patchBrowserStepSetActiveProfile(fs.readFileSync(browserProfileScriptPath, "utf8")));
  writeText(browserPlayerDataScriptPath, patchBrowserStepGetPlayerData(fs.readFileSync(browserPlayerDataScriptPath, "utf8")));

  const profileSwf = path.join(workDir, "Shell-qa-seed-events-profile.swf");
  runFfdec(ffdecCli, [
    "-replace",
    packShell,
    profileSwf,
    PATCH_CLASS,
    scriptPath
  ], "replace AS3 shell QA seed class");
  const browserProfileSwf = path.join(workDir, "Shell-qa-seed-events-browser-profile.swf");
  runFfdec(ffdecCli, [
    "-replace",
    profileSwf,
    browserProfileSwf,
    BROWSER_PROFILE_CLASS,
    browserProfileScriptPath
  ], "replace AS3 browser profile QA seed class");
  const outputSwf = path.join(workDir, "Shell-qa-seed-events.swf");
  runFfdec(ffdecCli, [
    "-replace",
    browserProfileSwf,
    outputSwf,
    BROWSER_PLAYER_DATA_CLASS,
    browserPlayerDataScriptPath
  ], "replace AS3 browser player data QA seed class");
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
    .filter((entry) => entry?.assetId !== PATCH_ASSET_ID);
  manifest.swfPatchedAssets.push({
    assetId: PATCH_ASSET_ID,
    assetPath: AS3_SHELL_PATH,
    outputPath: packShell,
    classes: [PATCH_CLASS, BROWSER_PROFILE_CLASS, BROWSER_PLAYER_DATA_CLASS]
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
      scriptPath,
      browserProfileClassName: BROWSER_PROFILE_CLASS,
      browserProfileScriptPath,
      browserPlayerDataClassName: BROWSER_PLAYER_DATA_CLASS,
      browserPlayerDataScriptPath
    },
    patch: "QA-only AS3 Shell URL/profile event seeding, browser profile GameEventManager seed sync, and start-position injection"
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-shell-qa-seed-events-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
