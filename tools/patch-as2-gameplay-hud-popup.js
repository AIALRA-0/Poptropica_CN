const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const {
  ensureDirSync,
  fileExists,
  readJson,
  removeDirContents,
  writeJson
} = require("./lib/fs-utils");

const AS2_GAMEPLAY_PATH = "content/www.poptropica.com/gameplay.swf";
const PATCH_ASSET_ID = "as2-shared:gameplay-hud-popup-anchor";

function runChecked(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 128,
    timeout: 300000,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim()}`);
  }
  return result;
}

function listAsScripts(root) {
  const scripts = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.as$/iu.test(entry.name)) {
        scripts.push(fullPath);
      }
    }
  }
  return scripts.sort((left, right) => left.localeCompare(right, "en"));
}

function translatedScriptFileEntry(filePath, scriptRoot) {
  const exportPath = path.relative(scriptRoot, filePath).replace(/\\/gu, "/");
  return {
    filePath,
    exportPath,
    replaceTarget: `\\${exportPath.replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`
  };
}

function replaceRequired(content, needle, replacement, label) {
  if (!content.includes(needle)) {
    throw new Error(`Unable to locate ${label}.`);
  }
  return content.replace(needle, replacement);
}

function findGameplayFrameOneScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes("function zhShowPopupBackdrop()") && content.includes("function layoutFramelessGameplayNav(forceLayout)");
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one AS2 gameplay frame_1 HUD script, found ${candidates.length}.`);
  }
  return candidates[0];
}

function patchFrameOne(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const before = next;

  if (!next.includes("function zhGameplayLogicalRight()")) {
    const helperBlock = [
      "function zhGameplayLogicalRight()",
      "{",
      "   return 820;",
      "}",
      "function zhHideDirectMapButton()",
      "{",
      "   if(_root != undefined && _root.__zhDirectMapButton != undefined)",
      "   {",
      "      _root.__zhDirectMapButton.clear();",
      "      _root.__zhDirectMapButton._visible = false;",
      "      _root.__zhDirectMapButton.enabled = false;",
      "      _root.__zhDirectMapButton._x = -4000;",
      "      _root.__zhDirectMapButton._y = -4000;",
      "   }",
      "}",
      "function zhHideGameplayHudNow()",
      "{",
      "   var _loc2_;",
      "   var _loc3_;",
      "   var _loc4_;",
      "   if(navBar != undefined)",
      "   {",
      "      _loc2_ = [navBar.btnInventory,navBar.btnWardrobe,navBar.btnMap,navBar.btnSuperPower];",
      "      _loc3_ = 0;",
      "      while(_loc3_ < _loc2_.length)",
      "      {",
      "         _loc4_ = _loc2_[_loc3_];",
      "         if(_loc4_ != undefined)",
      "         {",
      "            _loc4_._visible = false;",
      "            _loc4_._alpha = 0;",
      "            _loc4_.enabled = false;",
      "            _loc4_._x = -4000;",
      "            _loc4_._y = -4000;",
      "         }",
      "         _loc3_ += 1;",
      "      }",
      "      navBar._visible = false;",
      "      navBar.enabled = false;",
      "   }",
      "   zhHideDirectMapButton();",
      "   zhHideLegacyPauseChrome();",
      "}",
      "function zhPopupLooksOpen()",
      "{",
      "   if(_root != undefined && _root.__zhPopupBackdrop != undefined && _root.__zhPopupBackdrop._visible == true)",
      "   {",
      "      return true;",
      "   }",
      "   if(popupClip != undefined && popupClip._visible != false)",
      "   {",
      "      return true;",
      "   }",
      "   if(popupBack != undefined && popupBack._visible == true)",
      "   {",
      "      return true;",
      "   }",
      "   if(popupClose != undefined && popupClose._visible == true)",
      "   {",
      "      return true;",
      "   }",
      "   return false;",
      "}",
      "function zhStartPopupHudWatchdog()",
      "{",
      "   if(_root == undefined || _root.__zhPopupHudWatchdog != undefined)",
      "   {",
      "      return undefined;",
      "   }",
      "   _root.__zhPopupHudWatchdogTicks = 0;",
      "   _root.__zhPopupHudWatchdogTick = function()",
      "   {",
      "      _root.__zhPopupHudWatchdogTicks = Number(_root.__zhPopupHudWatchdogTicks) + 1;",
      "      if(zhPopupLooksOpen())",
      "      {",
      "         _root.__zhPopupHudHidden = true;",
      "         zhHideGameplayHudNow();",
      "      }",
      "      else",
      "      {",
      "         clearInterval(_root.__zhPopupHudWatchdog);",
      "         _root.__zhPopupHudWatchdog = undefined;",
      "         zhSetPopupHudHidden(false);",
      "      }",
      "      if(_root.__zhPopupHudWatchdogTicks > 240)",
      "      {",
      "         clearInterval(_root.__zhPopupHudWatchdog);",
      "         _root.__zhPopupHudWatchdog = undefined;",
      "      }",
      "   };",
      "   _root.__zhPopupHudWatchdog = setInterval(_root,\"__zhPopupHudWatchdogTick\",100);",
      "}",
      "function zhSetPopupHudHidden(hidden)",
      "{",
      "   if(_root == undefined)",
      "   {",
      "      return undefined;",
      "   }",
      "   _root.__zhPopupHudHidden = hidden == true;",
      "   if(_root.__zhPopupHudHidden)",
      "   {",
      "      zhHideGameplayHudNow();",
      "   }",
      "   else",
      "   {",
      "      if(navBar != undefined)",
      "      {",
      "         navBar._visible = true;",
      "         navBar.enabled = true;",
      "      }",
      "      if(layoutFramelessGameplayNav != undefined)",
      "      {",
      "         layoutFramelessGameplayNav(true);",
      "      }",
      "   }",
      "}",
      "function zhHideNonGameplayNavChrome()",
      "{",
      "   var _loc2_;",
      "   var _loc3_;",
      "   var _loc4_;",
      "   if(navBar == undefined)",
      "   {",
      "      return undefined;",
      "   }",
      "   _loc2_ = new Object();",
      "   _loc2_.btnInventory = true;",
      "   _loc2_.btnWardrobe = true;",
      "   _loc2_.btnMap = true;",
      "   _loc2_.btnSuperPower = true;",
      "   for(_loc3_ in navBar)",
      "   {",
      "      if(String(_loc3_).indexOf(\"btn\") == 0 && _loc2_[_loc3_] != true)",
      "      {",
      "         _loc4_ = navBar[_loc3_];",
      "         if(_loc4_ != undefined)",
      "         {",
      "            _loc4_._visible = false;",
      "            _loc4_._alpha = 0;",
      "            _loc4_.enabled = false;",
      "            _loc4_._x = -4000;",
      "            _loc4_._y = -4000;",
      "         }",
      "      }",
      "   }",
      "}",
      "function zhShowPopupBackdrop()"
    ].join("\n");
    next = replaceRequired(next, "function zhShowPopupBackdrop()", helperBlock, "popup HUD helper insertion point");
  }

  if (!next.includes("zhStartPopupHudWatchdog();")) {
    next = replaceRequired(
      next,
      [
        "   if(_root == undefined)",
        "   {",
        "      return undefined;",
        "   }",
        "   _loc4_ = _root.__zhPopupBackdrop;"
      ].join("\n"),
      [
        "   if(_root == undefined)",
        "   {",
        "      return undefined;",
        "   }",
        "   zhSetPopupHudHidden(true);",
        "   zhStartPopupHudWatchdog();",
        "   _loc4_ = _root.__zhPopupBackdrop;"
      ].join("\n"),
      "popup show HUD hide hook"
    );
  }

  if (!next.includes("clearInterval(_root.__zhPopupHudWatchdog);") || !next.includes("zhSetPopupHudHidden(false);")) {
    next = replaceRequired(
      next,
      [
        "function zhHidePopupBackdrop()",
        "{",
        "   if(_root != undefined && _root.__zhPopupBackdrop != undefined)",
        "   {",
        "      _root.__zhPopupBackdrop._visible = false;",
        "   }",
        "}"
      ].join("\n"),
      [
        "function zhHidePopupBackdrop()",
        "{",
        "   if(_root != undefined && _root.__zhPopupBackdrop != undefined)",
        "   {",
        "      _root.__zhPopupBackdrop._visible = false;",
        "   }",
        "   if(_root != undefined && _root.__zhPopupHudWatchdog != undefined)",
        "   {",
        "      clearInterval(_root.__zhPopupHudWatchdog);",
        "      _root.__zhPopupHudWatchdog = undefined;",
        "   }",
        "   zhSetPopupHudHidden(false);",
        "}"
      ].join("\n"),
      "popup hide HUD restore hook"
    );
  }

  if (!next.includes("_root.__zhPopupHudHidden == true")) {
    next = replaceRequired(
      next,
      [
        "   if(navBar == undefined)",
        "   {",
        "      return undefined;",
        "   }",
        "   if(zhIsQaHideHudEnabled())"
      ].join("\n"),
      [
        "   if(navBar == undefined)",
        "   {",
        "      return undefined;",
        "   }",
        "   if(_root != undefined && _root.__zhPopupHudHidden == true)",
        "   {",
        "      zhHideGameplayHudNow();",
        "      return undefined;",
        "   }",
        "   navBar._visible = true;",
        "   navBar.enabled = true;",
        "   if(zhIsQaHideHudEnabled())"
      ].join("\n"),
      "layout popup HUD hidden gate"
    );
  }

  if (!next.includes("zhHideNonGameplayNavChrome();")) {
    next = replaceRequired(
      next,
      [
        "      zhHideLegacyPauseChrome();",
        "      return undefined;",
        "   }",
        "   if(navBar.area != undefined)"
      ].join("\n"),
      [
        "      zhHideLegacyPauseChrome();",
        "      return undefined;",
        "   }",
        "   zhHideNonGameplayNavChrome();",
        "   if(navBar.area != undefined)"
      ].join("\n"),
      "layout non-canonical nav hide hook"
    );
  }

  next = next.replace(
    [
      "   _loc11_ = zhGameplayLogicalRight();",
      "   _loc12_ = 14;",
      "   _loc13_ = 7;",
      "   _loc14_ = 12;"
    ].join("\n"),
    [
      "   _loc11_ = 640;",
      "   _loc12_ = 14;",
      "   _loc13_ = 14;",
      "   _loc14_ = 10;"
    ].join("\n")
  );

  const hardcodedBlock = [
    "   if(navBar.btnInventory != undefined)",
    "   {",
    "      navBar.btnInventory._x = 652;",
    "      navBar.btnInventory._y = -12;",
    "      navBar.btnInventory._visible = true;",
    "      navBar.btnInventory._alpha = 100;",
    "      navBar.btnInventory.enabled = true;",
    "   }",
    "   if(navBar.btnWardrobe != undefined)",
    "   {",
    "      navBar.btnWardrobe._x = 708;",
    "      navBar.btnWardrobe._y = -12;",
    "      navBar.btnWardrobe._visible = true;",
    "      navBar.btnWardrobe._alpha = 100;",
    "      navBar.btnWardrobe.enabled = true;",
    "   }",
    "   if(navBar.btnMap != undefined)",
    "   {",
    "      navBar.btnMap._x = 764;",
    "      navBar.btnMap._y = -12;",
    "      navBar.btnMap._visible = true;",
    "      navBar.btnMap._alpha = 100;",
    "      navBar.btnMap.enabled = true;",
      "      _root.__zhGameplayMapBounds = {left:744,top:-30,right:820,bottom:58};",
      "   }"
  ].join("\n");
  if (!next.includes("navBar.btnInventory._x = 652;")) {
    next = replaceRequired(
      next,
      "   zhEnsureDirectMapButton();",
      `${hardcodedBlock}\n   zhEnsureDirectMapButton();`,
      "AS2 hardcoded HUD anchor restore point"
    );
  }

  if (!next.includes("function zhGameplayLogicalRight()") || !next.includes("navBar.btnInventory._x = 652;")) {
    throw new Error("AS2 gameplay HUD popup patch did not apply cleanly.");
  }

  return {
    changed: next !== before,
    content: next
  };
}

function updateManifest(manifestPath, runtimeZip, patchEntry) {
  const manifest = fileExists(manifestPath) ? readJson(manifestPath, {}) : {};
  const entries = Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [];
  const previous = entries.find((entry) => entry?.assetId === patchEntry.assetId);
  if (!previous) {
    manifest.assetsPatched = Number(manifest.assetsPatched || 0) + 1;
  }
  manifest.generatedAt = new Date().toISOString();
  manifest.swfPatchedAssets = entries.filter((entry) => entry?.assetId !== patchEntry.assetId);
  manifest.swfPatchedAssets.push(patchEntry);
  manifest.runtimeZip = runtimeZip;
  writeJson(manifestPath, manifest);
  return manifest;
}

function main() {
  const config = loadConfig();
  const ffdecCli = config.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("FFDec CLI is not configured.");
  }

  const packSwf = path.join(paths.as2PackDir, "swf", ...AS2_GAMEPLAY_PATH.split("/"));
  if (!fileExists(packSwf)) {
    throw new Error(`AS2 gameplay SWF not found: ${packSwf}`);
  }

  const workDir = path.join(paths.tempDir, "as2-gameplay-hud-popup");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  ensureDirSync(scriptRoot);
  runChecked(ffdecCli, ["-cli", "-export", "script", scriptRoot, packSwf], "export AS2 gameplay scripts");

  const frameOneScript = findGameplayFrameOneScript(scriptRoot);
  const patch = patchFrameOne(fs.readFileSync(frameOneScript, "utf8"));
  fs.writeFileSync(frameOneScript, patch.content, "utf8");

  const replacements = patch.changed ? [translatedScriptFileEntry(frameOneScript, scriptRoot)] : [];
  if (replacements.length > 0) {
    let inputSwf = packSwf;
    for (const replacement of replacements) {
      const patchedSwf = path.join(workDir, `gameplay.hud-popup.${replacements.indexOf(replacement)}.swf`);
      runChecked(ffdecCli, ["-replace", inputSwf, patchedSwf, replacement.replaceTarget, replacement.filePath], `replace ${replacement.exportPath}`);
      inputSwf = patchedSwf;
    }
    fs.copyFileSync(inputSwf, packSwf);
  }

  const manifestPath = path.join(paths.as2PackDir, "manifest.json");
  const manifest = fileExists(manifestPath) ? readJson(manifestPath, {}) : {};
  const runtimeZip = buildRuntimeZipForSourceGroup({
    config,
    sourceGroup: "as2",
    manifest
  });
  const patchEntry = {
    assetId: PATCH_ASSET_ID,
    assetPath: AS2_GAMEPLAY_PATH,
    outputPath: packSwf,
    changed: patch.changed,
    replaceTargets: replacements.map((entry) => entry.replaceTarget),
    notes: "Anchors AS2 gameplay HUD by visible icon bounds and hides HUD while popup/map/inventory overlays are open."
  };
  const updatedManifest = updateManifest(manifestPath, runtimeZip, patchEntry);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    assetPath: AS2_GAMEPLAY_PATH,
    outputSwf: packSwf,
    changed: patch.changed,
    replacements,
    manifestPath,
    manifestEntry: updatedManifest.swfPatchedAssets.find((entry) => entry?.assetId === PATCH_ASSET_ID),
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "as2", "as2-gameplay-hud-popup-patch.json");
  ensureDirSync(path.dirname(reportPath));
  writeJson(reportPath, report);
  printJson({
    ok: true,
    changed: patch.changed,
    reportPath,
    runtimeZip
  });
}

main();
