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

const AS2_CARROT_MAIN_PATH = "content/www.poptropica.com/scenes/islandCarrot/sceneCarrotMain.swf";
const PATCH_ASSET_ID = "24-carrot:mainstreet-qa-dialog-proof";
const QA_FLASHVARS_KEY = "flashpointQaAs2Dialog";

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

function findCarrotMainActionScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes('roomName = "Main Street";') &&
      content.includes("function initChars()") &&
      content.includes("char1.createNPC") &&
      content.includes("char3.createNPC");
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one Carrot Main Street action script, found ${candidates.length}.`);
  }
  return candidates[0];
}

function insertCarrotMainQaDialogHook(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  if (!next.includes("function flashpointQaMaybeShowCarrotMainDialog()")) {
    const hook = [
      "flashpointQaCarrotMainDialogShown = false;",
      "flashpointQaCarrotMainDialogSceneUrl = String(_url) + \"&\" + String(this._url);",
      `flashpointQaCarrotMainDialogModeCache = flashpointQaCarrotMainDialogSceneUrl.indexOf("${QA_FLASHVARS_KEY}=carrot-main") >= 0 ? "carrot-main" : "";`,
      "function flashpointQaCarrotMainDialogMode()",
      "{",
      `   var _loc1_ = String(_root.${QA_FLASHVARS_KEY});`,
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      `      _loc1_ = String(_level0.${QA_FLASHVARS_KEY});`,
      "   }",
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      `      _loc1_ = String(${QA_FLASHVARS_KEY});`,
      "   }",
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      "      _loc1_ = String(flashpointQaCarrotMainDialogModeCache);",
      "   }",
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      "      var _loc2_ = String(_root._url) + \"&\" + String(_level0._url) + \"&\" + String(flashpointQaCarrotMainDialogSceneUrl);",
      "      _loc2_ = _loc2_ + \"&\" + String(this._url) + \"&\" + String(_url);",
      `      if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=carrot-main-hobo") >= 0)`,
      "      {",
      "         _loc1_ = \"carrot-main-hobo\";",
      "      }",
      `      else if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=carrot-main-gas") >= 0)`,
      "      {",
      "         _loc1_ = \"carrot-main-gas\";",
      "      }",
      `      else if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=carrot-main") >= 0)`,
      "      {",
      "         _loc1_ = \"carrot-main\";",
      "      }",
      "   }",
      "   return _loc1_;",
      "}",
      "function flashpointQaCarrotMainDialogActor()",
      "{",
      "   var _loc1_ = flashpointQaCarrotMainDialogMode();",
      "   if(_loc1_ == \"carrot-main-hobo\")",
      "   {",
      "      return char2;",
      "   }",
      "   if(_loc1_ == \"carrot-main-gas\")",
      "   {",
      "      return char3;",
      "   }",
      "   return char1;",
      "}",
      "function flashpointQaCarrotMainDialogText()",
      "{",
      "   var _loc1_ = flashpointQaCarrotMainDialogMode();",
      "   var _loc2_ = flashpointQaCarrotMainDialogActor();",
      "   if(_loc2_ != undefined && _loc2_.talkyText != undefined && _loc2_.talkyText != \"\")",
      "   {",
      "      return _loc2_.talkyText;",
      "   }",
      "   if(_loc1_ == \"carrot-main-hobo\")",
      "   {",
      "      return \"有很多活儿要干呢！\";",
      "   }",
      "   if(_loc1_ == \"carrot-main-gas\")",
      "   {",
      "      return \"这里的情况正在好转。我应该很快就能重新开放车站了！\";",
      "   }",
      "   if(_loc1_ == \"carrot-main\" || _loc1_ == \"carrot-main-mayor\")",
      "   {",
      "      return \"胡萝卜不再消失了！\";",
      "   }",
      "   return \"\";",
      "}",
      "function flashpointQaCarrotMainPlaceActor(target)",
      "{",
      "   if(target == undefined || char == undefined || target == char)",
      "   {",
      "      return undefined;",
      "   }",
      "   target._visible = true;",
      "   target._alpha = 100;",
      "   target._x = char._x + 150;",
      "   target._y = char._y;",
      "   if(target.coordinates == undefined)",
      "   {",
      "      target.coordinates = new Object();",
      "   }",
      "   if(char.coordinates != undefined && char.coordinates.x != undefined && char.coordinates.y != undefined)",
      "   {",
      "      target.coordinates.x = char.coordinates.x + 150;",
      "      target.coordinates.y = char.coordinates.y;",
      "   }",
      "   else",
      "   {",
      "      target.coordinates.x = target._x;",
      "      target.coordinates.y = target._y;",
      "   }",
      "   if(target.charScale == undefined)",
      "   {",
      "      target.charScale = char.charScale != undefined ? char.charScale : 100;",
      "   }",
      "   if(target.ground == undefined)",
      "   {",
      "      target.ground = char.ground != undefined ? char.ground : target._y;",
      "   }",
      "   target.targetX = target._x;",
      "   target.targetY = target._y;",
      "   target.maxLeft = target._x;",
      "   target.maxRight = target._x;",
      "   target.talkHeight = 260;",
      "   if(target.action != undefined)",
      "   {",
      "      target.action(\"stand\");",
      "   }",
      "   target.swapDepths(240000);",
      "}",
      "function flashpointQaCarrotMainDialogReady()",
      "{",
      "   var _loc1_ = flashpointQaCarrotMainDialogActor();",
      "   if(_loc1_ == undefined || flashpointQaCarrotMainDialogText() == \"\" || _root.manualSay == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   if(_loc1_.avatar == undefined || _loc1_.avatar.head == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   if(_root.camera == undefined || _root.camera.scene == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   if(_root.sayDepth == undefined || _root.chatDepth == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   return true;",
      "}",
      "function flashpointQaMaybeShowCarrotMainDialog()",
      "{",
      "   if(flashpointQaCarrotMainDialogShown)",
      "   {",
      "      return undefined;",
      "   }",
      "   var _loc1_ = flashpointQaCarrotMainDialogMode();",
      "   if(_loc1_ != \"carrot-main\" && _loc1_ != \"carrot-main-mayor\" && _loc1_ != \"carrot-main-hobo\" && _loc1_ != \"carrot-main-gas\")",
      "   {",
      "      return undefined;",
      "   }",
      "   if(!flashpointQaCarrotMainDialogReady())",
      "   {",
      "      return undefined;",
      "   }",
      "   var _loc2_ = flashpointQaCarrotMainDialogActor();",
      "   var _loc3_ = flashpointQaCarrotMainDialogText();",
      "   if(_root.takeClick != undefined)",
      "   {",
      "      _root.takeClick._visible = true;",
      "   }",
      "   flashpointQaCarrotMainPlaceActor(_loc2_);",
      "   _loc2_.talkyText = _loc3_;",
      "   _root.manualSay(_loc2_,_loc3_);",
      "   var _loc4_ = _loc2_.sayDepth != undefined && _root[\"say\" + _loc2_.sayDepth] != undefined;",
      "   if(_loc4_)",
      "   {",
      "      _root[\"say\" + _loc2_.sayDepth].wait = 1200;",
      "      _root[\"say\" + _loc2_.sayDepth]._visible = true;",
      "      _root[\"say\" + _loc2_.sayDepth]._alpha = 100;",
      "      _root[\"say\" + _loc2_.sayDepth].swapDepths(250000);",
      "      flashpointQaCarrotMainDialogShown = true;",
      "      flashpointQaCarrotMainTrack(\"QaDialogShown\");",
      "   }",
      "   else",
      "   {",
      "      flashpointQaCarrotMainTrack(\"QaDialogMissingBubble\");",
      "   }",
      "}",
      "function flashpointQaCarrotMainTrack(eventName)",
      "{",
      "   var _loc1_ = flashpointQaCarrotMainDialogMode();",
      "   if(_loc1_ == \"carrot-main\" || _loc1_ == \"carrot-main-mayor\" || _loc1_ == \"carrot-main-hobo\" || _loc1_ == \"carrot-main-gas\")",
      "   {",
      "      var _loc2_ = flashpointQaCarrotMainDialogActor();",
      "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=CarrotMain&event=\" + eventName + \"&mode=\" + _loc1_ + \"&ready=\" + (_loc2_ != undefined) + \"&talky=\" + (flashpointQaCarrotMainDialogText() != \"\") + \"&manual=\" + (_root.manualSay != undefined) + \"&coords=\" + (_loc2_ != undefined && _loc2_.coordinates != undefined && _loc2_.coordinates.x != undefined) + \"&avatar=\" + (_loc2_ != undefined && _loc2_.avatar != undefined && _loc2_.avatar.head != undefined) + \"&camera=\" + (_root.camera != undefined && _root.camera.scene != undefined) + \"&depth=\" + (_root.sayDepth != undefined) + \"&bubble=\" + (_loc2_ != undefined && _loc2_.sayDepth != undefined && _root[\"say\" + _loc2_.sayDepth] != undefined),0);",
      "   }",
      "}",
      "function flashpointQaCarrotMainDialogTick()",
      "{",
      "   flashpointQaCarrotMainDialogWait = flashpointQaCarrotMainDialogWait + 1;",
      "   if(flashpointQaCarrotMainDialogWait < 4)",
      "   {",
      "      return undefined;",
      "   }",
      "   if(flashpointQaCarrotMainDialogWait == 4)",
      "   {",
      "      flashpointQaCarrotMainTrack(\"QaHookTick4\");",
      "   }",
      "   flashpointQaMaybeShowCarrotMainDialog();",
      "   if(flashpointQaCarrotMainDialogShown || flashpointQaCarrotMainDialogWait > 80)",
      "   {",
      "      clearInterval(flashpointQaCarrotMainDialogInterval);",
      "   }",
      "}",
      "function flashpointQaArmCarrotMainDialog()",
      "{",
      "   if(flashpointQaCarrotMainDialogInterval != undefined)",
      "   {",
      "      clearInterval(flashpointQaCarrotMainDialogInterval);",
      "   }",
      "   flashpointQaCarrotMainDialogWait = 0;",
      "   flashpointQaCarrotMainDialogInterval = setInterval(this,\"flashpointQaCarrotMainDialogTick\",250);",
      "}",
      ""
    ].join("\n");
    next = `${hook}${next}`;
  }

  const armMarker = "   _root.nextFrame();";
  const armReplacement = [
    "   flashpointQaArmCarrotMainDialog();",
    "   _root.nextFrame();"
  ].join("\n");
  if (!next.includes("flashpointQaArmCarrotMainDialog();\n   _root.nextFrame();")) {
    if (!next.includes(armMarker)) {
      throw new Error("Unable to locate Carrot Main initChars arm marker.");
    }
    next = next.replace(armMarker, armReplacement);
  }

  return next;
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

  const packSwf = path.join(paths.as2PackDir, "swf", ...AS2_CARROT_MAIN_PATH.split("/"));
  if (!fileExists(packSwf)) {
    throw new Error(`Carrot Main Street pack SWF not found: ${packSwf}`);
  }

  const workDir = path.join(paths.tempDir, "as2-carrot-mainstreet-dialog-proof");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  ensureDirSync(scriptRoot);
  runChecked(ffdecCli, ["-cli", "-export", "script", scriptRoot, packSwf], "export Carrot Main Street scripts");

  const scriptPath = findCarrotMainActionScript(scriptRoot);
  const before = fs.readFileSync(scriptPath, "utf8");
  const after = insertCarrotMainQaDialogHook(before);
  fs.writeFileSync(scriptPath, after, "utf8");
  const changed = after !== before;
  const replacement = translatedScriptFileEntry(scriptPath, scriptRoot);
  if (changed) {
    const patchedSwf = path.join(workDir, "sceneCarrotMain.qa-dialog.swf");
    runChecked(ffdecCli, ["-replace", packSwf, patchedSwf, replacement.replaceTarget, replacement.filePath], "replace Carrot Main Street QA dialog script");
    fs.copyFileSync(patchedSwf, packSwf);
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
    assetPath: AS2_CARROT_MAIN_PATH,
    outputPath: packSwf,
    changed,
    replaceTarget: replacement.replaceTarget,
    notes: "QA only: triggers native Carrot Main Street NPC talkyText bubbles via flashpointQaAs2Dialog for runtime Chinese dialogue proof."
  };
  const updatedManifest = updateManifest(manifestPath, runtimeZip, patchEntry);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    assetPath: AS2_CARROT_MAIN_PATH,
    outputSwf: packSwf,
    changed,
    replacement,
    manifestPath,
    manifestEntry: updatedManifest.swfPatchedAssets.find((entry) => entry?.assetId === PATCH_ASSET_ID),
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "as2", "as2-carrot-mainstreet-dialog-proof-patch.json");
  ensureDirSync(path.dirname(reportPath));
  writeJson(reportPath, report);
  printJson({
    ok: true,
    changed,
    reportPath,
    runtimeZip
  });
}

main();
