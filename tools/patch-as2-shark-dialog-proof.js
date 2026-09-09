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

const AS2_SHARK_MAINSTREET_PATH = "content/www.poptropica.com/scenes/islandShark/sceneMainstreet.swf";
const PATCH_ASSET_ID = "shark-tooth:mainstreet-qa-dialog-proof";
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

function findSharkMainstreetActionScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes('roomName = "Main Street";') &&
      content.includes("_root.loadSceneChars(6);") &&
      content.includes("function initChars()");
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one Shark Mainstreet action script, found ${candidates.length}.`);
  }
  return candidates[0];
}

function insertSharkMainstreetQaDialogHook(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  if (!next.includes("function flashpointQaMaybeShowSharkMainstreetDialog()")) {
    const hook = [
      "flashpointQaSharkMainstreetDialogShown = false;",
      "flashpointQaSharkMainstreetDialogSceneUrl = String(_url) + \"&\" + String(this._url);",
      `flashpointQaSharkMainstreetDialogModeCache = flashpointQaSharkMainstreetDialogSceneUrl.indexOf("${QA_FLASHVARS_KEY}=shark-mainstreet") >= 0 ? "shark-mainstreet" : "";`,
      "function flashpointQaSharkMainstreetDialogMode()",
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
      "      _loc1_ = String(flashpointQaSharkMainstreetDialogModeCache);",
      "   }",
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      "      var _loc2_ = String(_root._url) + \"&\" + String(_level0._url) + \"&\" + String(flashpointQaSharkMainstreetDialogSceneUrl);",
      "      _loc2_ = _loc2_ + \"&\" + String(this._url) + \"&\" + String(_url);",
      `      if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=shark-mainstreet-coconut") >= 0)`,
      "      {",
      "         _loc1_ = \"shark-mainstreet-coconut\";",
      "      }",
      `      else if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=shark-mainstreet-afraid") >= 0)`,
      "      {",
      "         _loc1_ = \"shark-mainstreet-afraid\";",
      "      }",
      `      else if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=shark-mainstreet-boats") >= 0)`,
      "      {",
      "         _loc1_ = \"shark-mainstreet-boats\";",
      "      }",
      `      else if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=shark-mainstreet") >= 0)`,
      "      {",
      "         _loc1_ = \"shark-mainstreet\";",
      "      }",
      "   }",
      "   return _loc1_;",
      "}",
      "function flashpointQaSharkMainstreetDialogActor()",
      "{",
      "   var _loc1_ = flashpointQaSharkMainstreetDialogMode();",
      "   if(_loc1_ == \"shark-mainstreet-coconut\")",
      "   {",
      "      return char5;",
      "   }",
      "   if(_loc1_ == \"shark-mainstreet-afraid\")",
      "   {",
      "      return char2;",
      "   }",
      "   if(_loc1_ == \"shark-mainstreet-boats\")",
      "   {",
      "      return char3;",
      "   }",
      "   return char1;",
      "}",
      "function flashpointQaSharkMainstreetDialogText()",
      "{",
      "   var _loc1_ = flashpointQaSharkMainstreetDialogActor();",
      "   if(_loc1_ != undefined && _loc1_.talkyText != undefined && _loc1_.talkyText != \"\")",
      "   {",
      "      return _loc1_.talkyText;",
      "   }",
      "   return \"\";",
      "}",
      "function flashpointQaSharkMainstreetPlaceActor(target)",
      "{",
      "   if(target == undefined || char == undefined || target == char)",
      "   {",
      "      return undefined;",
      "   }",
      "   target._visible = true;",
      "   target._alpha = 100;",
      "   target._x = char._x + 150;",
      "   target._y = char._y;",
      "   if(target.coordinates != undefined && char.coordinates != undefined)",
      "   {",
      "      target.coordinates.x = char.coordinates.x + 150;",
      "      target.coordinates.y = char.coordinates.y;",
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
      "function flashpointQaSharkMainstreetClampDialogBubble(clip)",
      "{",
      "   if(clip == undefined || _root.camera == undefined)",
      "   {",
      "      return undefined;",
      "   }",
      "   var _loc1_ = _root.camera._y + 10;",
      "   var _loc2_ = _root.camera._y + 330;",
      "   if(clip._y < _loc1_)",
      "   {",
      "      clip._y = _loc1_;",
      "   }",
      "   if(clip._y > _loc2_)",
      "   {",
      "      clip._y = _loc2_;",
      "   }",
      "}",
      "function flashpointQaSharkMainstreetKeepBubbleVisible(clip)",
      "{",
      "   if(clip == undefined || clip.__flashpointQaSharkWrapped == true)",
      "   {",
      "      return undefined;",
      "   }",
      "   clip.__flashpointQaSharkWrapped = true;",
      "   clip.__flashpointQaSharkScene = this;",
      "   clip.__flashpointQaSharkOriginalOnEnterFrame = clip.onEnterFrame;",
      "   clip.onEnterFrame = function()",
      "   {",
      "      if(this.__flashpointQaSharkOriginalOnEnterFrame != undefined)",
      "      {",
      "         this.__flashpointQaSharkOriginalOnEnterFrame();",
      "      }",
      "      if(this.__flashpointQaSharkScene != undefined && this.__flashpointQaSharkScene.flashpointQaSharkMainstreetClampDialogBubble != undefined)",
      "      {",
      "         this.__flashpointQaSharkScene.flashpointQaSharkMainstreetClampDialogBubble(this);",
      "      }",
      "   };",
      "   flashpointQaSharkMainstreetClampDialogBubble(clip);",
      "}",
      "function flashpointQaSharkMainstreetDialogReady()",
      "{",
      "   var _loc1_ = flashpointQaSharkMainstreetDialogActor();",
      "   if(_loc1_ == undefined || flashpointQaSharkMainstreetDialogText() == \"\" || _root.manualSay == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   if(_loc1_.coordinates == undefined || _loc1_.coordinates.x == undefined || _loc1_.coordinates.y == undefined || _loc1_.charScale == undefined)",
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
      "function flashpointQaMaybeShowSharkMainstreetDialog()",
      "{",
      "   if(flashpointQaSharkMainstreetDialogShown)",
      "   {",
      "      return undefined;",
      "   }",
      "   var _loc1_ = flashpointQaSharkMainstreetDialogMode();",
      "   if(_loc1_ != \"shark-mainstreet\" && _loc1_ != \"shark-mainstreet-fin\" && _loc1_ != \"shark-mainstreet-coconut\" && _loc1_ != \"shark-mainstreet-afraid\" && _loc1_ != \"shark-mainstreet-boats\")",
      "   {",
      "      return undefined;",
      "   }",
      "   if(!flashpointQaSharkMainstreetDialogReady())",
      "   {",
      "      return undefined;",
      "   }",
      "   var _loc2_ = flashpointQaSharkMainstreetDialogActor();",
      "   var _loc3_ = flashpointQaSharkMainstreetDialogText();",
      "   if(_root.takeClick != undefined)",
      "   {",
      "      _root.takeClick._visible = true;",
      "   }",
      "   flashpointQaSharkMainstreetPlaceActor(_loc2_);",
      "   _loc2_.talkyText = _loc3_;",
      "   _root.manualSay(_loc2_,_loc3_);",
      "   var _loc4_ = _loc2_.sayDepth != undefined && _root[\"say\" + _loc2_.sayDepth] != undefined;",
      "   if(_loc4_)",
      "   {",
      "      _root[\"say\" + _loc2_.sayDepth].wait = 1200;",
      "      _root[\"say\" + _loc2_.sayDepth]._visible = true;",
      "      _root[\"say\" + _loc2_.sayDepth]._alpha = 100;",
      "      _root[\"say\" + _loc2_.sayDepth].swapDepths(250000);",
      "      flashpointQaSharkMainstreetDialogShown = true;",
      "      flashpointQaSharkMainstreetTrack(\"QaDialogShown\");",
      "   }",
      "   else",
      "   {",
      "      flashpointQaSharkMainstreetTrack(\"QaDialogMissingBubble\");",
      "   }",
      "}",
      "function flashpointQaSharkMainstreetTrack(eventName)",
      "{",
      "   var _loc1_ = flashpointQaSharkMainstreetDialogMode();",
      "   if(_loc1_ == \"shark-mainstreet\" || _loc1_ == \"shark-mainstreet-fin\" || _loc1_ == \"shark-mainstreet-coconut\" || _loc1_ == \"shark-mainstreet-afraid\" || _loc1_ == \"shark-mainstreet-boats\")",
      "   {",
      "      var _loc2_ = flashpointQaSharkMainstreetDialogActor();",
      "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=SharkMainstreet&event=\" + eventName + \"&mode=\" + _loc1_ + \"&ready=\" + (_loc2_ != undefined) + \"&talky=\" + (flashpointQaSharkMainstreetDialogText() != \"\") + \"&manual=\" + (_root.manualSay != undefined) + \"&coords=\" + (_loc2_ != undefined && _loc2_.coordinates != undefined && _loc2_.coordinates.x != undefined) + \"&avatar=\" + (_loc2_ != undefined && _loc2_.avatar != undefined && _loc2_.avatar.head != undefined) + \"&camera=\" + (_root.camera != undefined && _root.camera.scene != undefined) + \"&depth=\" + (_root.sayDepth != undefined) + \"&bubble=\" + (_loc2_ != undefined && _loc2_.sayDepth != undefined && _root[\"say\" + _loc2_.sayDepth] != undefined),0);",
      "   }",
      "}",
      "function flashpointQaSharkMainstreetDialogTick()",
      "{",
      "   flashpointQaSharkMainstreetDialogWait = flashpointQaSharkMainstreetDialogWait + 1;",
      "   if(flashpointQaSharkMainstreetDialogWait < 4)",
      "   {",
      "      return undefined;",
      "   }",
      "   if(flashpointQaSharkMainstreetDialogWait == 4)",
      "   {",
      "      flashpointQaSharkMainstreetTrack(\"QaHookTick4\");",
      "   }",
      "   flashpointQaMaybeShowSharkMainstreetDialog();",
      "   if(flashpointQaSharkMainstreetDialogShown || flashpointQaSharkMainstreetDialogWait > 80)",
      "   {",
      "      clearInterval(flashpointQaSharkMainstreetDialogInterval);",
      "   }",
      "}",
      "function flashpointQaArmSharkMainstreetDialog()",
      "{",
      "   if(flashpointQaSharkMainstreetDialogInterval != undefined)",
      "   {",
      "      clearInterval(flashpointQaSharkMainstreetDialogInterval);",
      "   }",
      "   flashpointQaSharkMainstreetDialogWait = 0;",
      "   flashpointQaSharkMainstreetDialogInterval = setInterval(this,\"flashpointQaSharkMainstreetDialogTick\",250);",
      "}",
      ""
    ].join("\n");
    next = `${hook}${next}`;
  }

  next = next.replace(
    /   target\._y = char\._y(?: [+-] \d+)?;\n/u,
    "   target._y = char._y;\n"
  );
  next = next.replace(
    /      target\.coordinates\.y = char\.coordinates\.y(?: [+-] \d+)?;\n/u,
    "      target.coordinates.y = char.coordinates.y;\n"
  );
  if (!next.includes("   target.talkHeight = 260;\n")) {
    next = next.replace(
      "   target.maxRight = target._x;\n",
      "   target.maxRight = target._x;\n   target.talkHeight = 260;\n"
    );
  }
  if (!next.includes("function flashpointQaSharkMainstreetClampDialogBubble(clip)")) {
    const clampHook = [
      "function flashpointQaSharkMainstreetClampDialogBubble(clip)",
      "{",
      "   if(clip == undefined || _root.camera == undefined)",
      "   {",
      "      return undefined;",
      "   }",
      "   var _loc1_ = _root.camera._y + 10;",
      "   var _loc2_ = _root.camera._y + 330;",
      "   if(clip._y < _loc1_)",
      "   {",
      "      clip._y = _loc1_;",
      "   }",
      "   if(clip._y > _loc2_)",
      "   {",
      "      clip._y = _loc2_;",
      "   }",
      "}",
      "function flashpointQaSharkMainstreetKeepBubbleVisible(clip)",
      "{",
      "   if(clip == undefined || clip.__flashpointQaSharkWrapped == true)",
      "   {",
      "      return undefined;",
      "   }",
      "   clip.__flashpointQaSharkWrapped = true;",
      "   clip.__flashpointQaSharkScene = this;",
      "   clip.__flashpointQaSharkOriginalOnEnterFrame = clip.onEnterFrame;",
      "   clip.onEnterFrame = function()",
      "   {",
      "      if(this.__flashpointQaSharkOriginalOnEnterFrame != undefined)",
      "      {",
      "         this.__flashpointQaSharkOriginalOnEnterFrame();",
      "      }",
      "      if(this.__flashpointQaSharkScene != undefined && this.__flashpointQaSharkScene.flashpointQaSharkMainstreetClampDialogBubble != undefined)",
      "      {",
      "         this.__flashpointQaSharkScene.flashpointQaSharkMainstreetClampDialogBubble(this);",
      "      }",
      "   };",
      "   flashpointQaSharkMainstreetClampDialogBubble(clip);",
      "}",
      ""
    ].join("\n");
    next = next.replace("function flashpointQaSharkMainstreetDialogReady()\n{", `${clampHook}function flashpointQaSharkMainstreetDialogReady()\n{`);
  }
  next = next.replace(
    /      flashpointQaSharkMainstreetKeepBubbleVisible\(_root\["say" \+ _loc\d+_\.sayDepth\]\);\n/gu,
    ""
  );

  const armMarker = [
    "   _root.blankNPC(char6);",
    "   _root.nextFrame();"
  ].join("\n");
  const armReplacement = [
    "   _root.blankNPC(char6);",
    "   flashpointQaArmSharkMainstreetDialog();",
    "   _root.nextFrame();"
  ].join("\n");
  if (!next.includes("flashpointQaArmSharkMainstreetDialog();\n   _root.nextFrame();")) {
    if (!next.includes(armMarker)) {
      throw new Error("Unable to locate Shark Mainstreet initChars arm marker.");
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

  const packSwf = path.join(paths.as2PackDir, "swf", ...AS2_SHARK_MAINSTREET_PATH.split("/"));
  if (!fileExists(packSwf)) {
    throw new Error(`Shark Mainstreet pack SWF not found: ${packSwf}`);
  }

  const workDir = path.join(paths.tempDir, "as2-shark-mainstreet-dialog-proof");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  ensureDirSync(scriptRoot);
  runChecked(ffdecCli, ["-cli", "-export", "script", scriptRoot, packSwf], "export Shark Mainstreet scripts");

  const scriptPath = findSharkMainstreetActionScript(scriptRoot);
  const before = fs.readFileSync(scriptPath, "utf8");
  const after = insertSharkMainstreetQaDialogHook(before);
  fs.writeFileSync(scriptPath, after, "utf8");
  const changed = after !== before;
  const replacement = translatedScriptFileEntry(scriptPath, scriptRoot);
  if (changed) {
    const patchedSwf = path.join(workDir, "sceneMainstreet.qa-dialog.swf");
    runChecked(ffdecCli, ["-replace", packSwf, patchedSwf, replacement.replaceTarget, replacement.filePath], "replace Shark Mainstreet QA dialog script");
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
    assetPath: AS2_SHARK_MAINSTREET_PATH,
    outputPath: packSwf,
    changed,
    replaceTarget: replacement.replaceTarget,
    notes: "QA only: triggers native Shark Mainstreet NPC talkyText bubbles via flashpointQaAs2Dialog for runtime Chinese dialogue proof."
  };
  const updatedManifest = updateManifest(manifestPath, runtimeZip, patchEntry);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    assetPath: AS2_SHARK_MAINSTREET_PATH,
    outputSwf: packSwf,
    changed,
    replacement,
    manifestPath,
    manifestEntry: updatedManifest.swfPatchedAssets.find((entry) => entry?.assetId === PATCH_ASSET_ID),
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "as2", "as2-shark-mainstreet-dialog-proof-patch.json");
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
