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

const AS2_EARLY_CITY2_PATH = "content/www.poptropica.com/scenes/islandEarly/sceneCity2.swf";
const PATCH_ASSET_ID = "early-poptropica:city2-qa-dialog-proof";
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

function findEarlyCity2ActionScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes('roomName = "Main Street";') &&
      content.includes("_root.loadSceneChars(4);") &&
      content.includes("function initChars()");
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one Early City2 action script, found ${candidates.length}.`);
  }
  return candidates[0];
}

function insertEarlyCity2QaDialogHook(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  if (!next.includes("function flashpointQaMaybeShowEarlyCity2Dialog()")) {
    const hook = [
      "flashpointQaEarlyCity2DialogShown = false;",
      "flashpointQaEarlyCity2DialogSceneUrl = String(_url) + \"&\" + String(this._url);",
      `flashpointQaEarlyCity2DialogModeCache = flashpointQaEarlyCity2DialogSceneUrl.indexOf("${QA_FLASHVARS_KEY}=early-city2") >= 0 ? "early-city2" : "";`,
      "function flashpointQaEarlyCity2DialogMode()",
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
      "      _loc1_ = String(flashpointQaEarlyCity2DialogModeCache);",
      "   }",
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      "      var _loc2_ = String(_root._url) + \"&\" + String(_level0._url) + \"&\" + String(flashpointQaEarlyCity2DialogSceneUrl);",
      "      _loc2_ = _loc2_ + \"&\" + String(this._url) + \"&\" + String(_url);",
      `      if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=early-city2-oldtown") >= 0)`,
      "      {",
      "         _loc1_ = \"early-city2-oldtown\";",
      "      }",
      `      else if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=early-city2-flag") >= 0)`,
      "      {",
      "         _loc1_ = \"early-city2-flag\";",
      "      }",
      `      else if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=early-city2") >= 0)`,
      "      {",
      "         _loc1_ = \"early-city2\";",
      "      }",
      "   }",
      "   return _loc1_;",
      "}",
      "function flashpointQaEarlyCity2DialogActor()",
      "{",
      "   var _loc1_ = flashpointQaEarlyCity2DialogMode();",
      "   if(_loc1_ == \"early-city2-flag\")",
      "   {",
      "      return char2;",
      "   }",
      "   if(_loc1_ == \"early-city2-oldtown\")",
      "   {",
      "      return char3;",
      "   }",
      "   return char1;",
      "}",
      "function flashpointQaEarlyCity2DialogText()",
      "{",
      "   var _loc1_ = flashpointQaEarlyCity2DialogActor();",
      "   if(_loc1_ != undefined && _loc1_.talkyText != undefined && _loc1_.talkyText != \"\")",
      "   {",
      "      return _loc1_.talkyText;",
      "   }",
      "   return \"\";",
      "}",
      "function flashpointQaEarlyCity2PlaceActor(target)",
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
      "   if(target.action != undefined)",
      "   {",
      "      target.action(\"stand\");",
      "   }",
      "   target.swapDepths(240000);",
      "}",
      "function flashpointQaEarlyCity2DialogReady()",
      "{",
      "   var _loc1_ = flashpointQaEarlyCity2DialogActor();",
      "   if(_loc1_ == undefined || flashpointQaEarlyCity2DialogText() == \"\" || _root.manualSay == undefined)",
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
      "function flashpointQaMaybeShowEarlyCity2Dialog()",
      "{",
      "   if(flashpointQaEarlyCity2DialogShown)",
      "   {",
      "      return undefined;",
      "   }",
      "   var _loc1_ = flashpointQaEarlyCity2DialogMode();",
      "   if(_loc1_ != \"early-city2\" && _loc1_ != \"early-city2-welcome\" && _loc1_ != \"early-city2-flag\" && _loc1_ != \"early-city2-oldtown\")",
      "   {",
      "      return undefined;",
      "   }",
      "   if(!flashpointQaEarlyCity2DialogReady())",
      "   {",
      "      return undefined;",
      "   }",
      "   var _loc2_ = flashpointQaEarlyCity2DialogActor();",
      "   var _loc3_ = flashpointQaEarlyCity2DialogText();",
      "   if(_root.takeClick != undefined)",
      "   {",
      "      _root.takeClick._visible = true;",
      "   }",
      "   flashpointQaEarlyCity2PlaceActor(_loc2_);",
      "   _loc2_.talkyText = _loc3_;",
      "   _root.manualSay(_loc2_,_loc3_);",
      "   var _loc4_ = _loc2_.sayDepth != undefined && _root[\"say\" + _loc2_.sayDepth] != undefined;",
      "   if(_loc4_)",
      "   {",
      "      _root[\"say\" + _loc2_.sayDepth].wait = 1200;",
      "      _root[\"say\" + _loc2_.sayDepth]._visible = true;",
      "      _root[\"say\" + _loc2_.sayDepth]._alpha = 100;",
      "      _root[\"say\" + _loc2_.sayDepth].swapDepths(250000);",
      "      flashpointQaEarlyCity2DialogShown = true;",
      "      flashpointQaEarlyCity2Track(\"QaDialogShown\");",
      "   }",
      "   else",
      "   {",
      "      flashpointQaEarlyCity2Track(\"QaDialogMissingBubble\");",
      "   }",
      "}",
      "function flashpointQaEarlyCity2Track(eventName)",
      "{",
      "   var _loc1_ = flashpointQaEarlyCity2DialogMode();",
      "   if(_loc1_ == \"early-city2\" || _loc1_ == \"early-city2-welcome\" || _loc1_ == \"early-city2-flag\" || _loc1_ == \"early-city2-oldtown\")",
      "   {",
      "      var _loc2_ = flashpointQaEarlyCity2DialogActor();",
      "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=EarlyCity2&event=\" + eventName + \"&mode=\" + _loc1_ + \"&ready=\" + (_loc2_ != undefined) + \"&talky=\" + (flashpointQaEarlyCity2DialogText() != \"\") + \"&manual=\" + (_root.manualSay != undefined) + \"&coords=\" + (_loc2_ != undefined && _loc2_.coordinates != undefined && _loc2_.coordinates.x != undefined) + \"&avatar=\" + (_loc2_ != undefined && _loc2_.avatar != undefined && _loc2_.avatar.head != undefined) + \"&camera=\" + (_root.camera != undefined && _root.camera.scene != undefined) + \"&depth=\" + (_root.sayDepth != undefined) + \"&bubble=\" + (_loc2_ != undefined && _loc2_.sayDepth != undefined && _root[\"say\" + _loc2_.sayDepth] != undefined),0);",
      "   }",
      "}",
      "function flashpointQaEarlyCity2DialogTick()",
      "{",
      "   flashpointQaEarlyCity2DialogWait = flashpointQaEarlyCity2DialogWait + 1;",
      "   if(flashpointQaEarlyCity2DialogWait < 4)",
      "   {",
      "      return undefined;",
      "   }",
      "   if(flashpointQaEarlyCity2DialogWait == 4)",
      "   {",
      "      flashpointQaEarlyCity2Track(\"QaHookTick4\");",
      "   }",
      "   flashpointQaMaybeShowEarlyCity2Dialog();",
      "   if(flashpointQaEarlyCity2DialogShown || flashpointQaEarlyCity2DialogWait > 80)",
      "   {",
      "      clearInterval(flashpointQaEarlyCity2DialogInterval);",
      "   }",
      "}",
      "function flashpointQaArmEarlyCity2Dialog()",
      "{",
      "   if(flashpointQaEarlyCity2DialogInterval != undefined)",
      "   {",
      "      clearInterval(flashpointQaEarlyCity2DialogInterval);",
      "   }",
      "   flashpointQaEarlyCity2DialogWait = 0;",
      "   flashpointQaEarlyCity2DialogInterval = setInterval(this,\"flashpointQaEarlyCity2DialogTick\",250);",
      "}",
      ""
    ].join("\n");
    next = `${hook}${next}`;
  }

  const armMarker = [
    "   _root.blankNPC(char4);",
    "   _root.nextFrame();"
  ].join("\n");
  const armReplacement = [
    "   _root.blankNPC(char4);",
    "   flashpointQaArmEarlyCity2Dialog();",
    "   _root.nextFrame();"
  ].join("\n");
  if (!next.includes("flashpointQaArmEarlyCity2Dialog();\n   _root.nextFrame();")) {
    if (!next.includes(armMarker)) {
      throw new Error("Unable to locate Early City2 initChars arm marker.");
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

  const packSwf = path.join(paths.as2PackDir, "swf", ...AS2_EARLY_CITY2_PATH.split("/"));
  if (!fileExists(packSwf)) {
    throw new Error(`Early City2 pack SWF not found: ${packSwf}`);
  }

  const workDir = path.join(paths.tempDir, "as2-early-city2-dialog-proof");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  ensureDirSync(scriptRoot);
  runChecked(ffdecCli, ["-cli", "-export", "script", scriptRoot, packSwf], "export Early City2 scripts");

  const scriptPath = findEarlyCity2ActionScript(scriptRoot);
  const before = fs.readFileSync(scriptPath, "utf8");
  const after = insertEarlyCity2QaDialogHook(before);
  fs.writeFileSync(scriptPath, after, "utf8");
  const changed = after !== before;
  const replacement = translatedScriptFileEntry(scriptPath, scriptRoot);
  if (changed) {
    const patchedSwf = path.join(workDir, "sceneCity2.qa-dialog.swf");
    runChecked(ffdecCli, ["-replace", packSwf, patchedSwf, replacement.replaceTarget, replacement.filePath], "replace Early City2 QA dialog script");
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
    assetPath: AS2_EARLY_CITY2_PATH,
    outputPath: packSwf,
    changed,
    replaceTarget: replacement.replaceTarget,
    notes: "QA only: triggers three native Early City2 NPC talkyText bubbles via flashpointQaAs2Dialog for runtime Chinese dialogue proof."
  };
  const updatedManifest = updateManifest(manifestPath, runtimeZip, patchEntry);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    assetPath: AS2_EARLY_CITY2_PATH,
    outputSwf: packSwf,
    changed,
    replacement,
    manifestPath,
    manifestEntry: updatedManifest.swfPatchedAssets.find((entry) => entry?.assetId === PATCH_ASSET_ID),
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "as2", "as2-early-city2-dialog-proof-patch.json");
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
