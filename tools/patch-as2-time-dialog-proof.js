const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, readJson, removeDirContents, writeJson } = require("./lib/fs-utils");

const AS2_TIME_LAB_PATH = "content/www.poptropica.com/scenes/islandTime/sceneLab.swf";
const PATCH_ASSET_ID = "time-tangled:lab-qa-dialog-proof";
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

function findTimeLabActionScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes('roomName = "Pendulums Lab";') &&
      content.includes("function initChars()") &&
      content.includes("char1.createNPC") &&
      content.includes("_root.showSay(char1");
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one Time Lab action script, found ${candidates.length}.`);
  }
  return candidates[0];
}

function insertTimeLabQaDialogHook(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  if (!next.includes("function flashpointQaMaybeShowTimeLabDialog()")) {
    const hook = [
      "flashpointQaTimeLabDialogShown = false;",
      "flashpointQaTimeLabDialogSceneUrl = String(_url) + \"&\" + String(this._url);",
      `flashpointQaTimeLabDialogModeCache = flashpointQaTimeLabDialogSceneUrl.indexOf("${QA_FLASHVARS_KEY}=time-lab") >= 0 ? "time-lab-help" : "";`,
      "function flashpointQaTimeLabDialogMode()",
      "{",
      `   var _loc1_ = String(_global.${QA_FLASHVARS_KEY});`,
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      `      _loc1_ = String(_root.${QA_FLASHVARS_KEY});`,
      "   }",
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
      "      _loc1_ = String(flashpointQaTimeLabDialogModeCache);",
      "   }",
      "   if(_loc1_ == \"time-lab\")",
      "   {",
      "      _loc1_ = \"time-lab-help\";",
      "   }",
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      "      var _loc2_ = String(_root._url) + \"&\" + String(_level0._url) + \"&\" + String(flashpointQaTimeLabDialogSceneUrl);",
      "      _loc2_ = _loc2_ + \"&\" + String(this._url) + \"&\" + String(_url);",
      `      if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=time-lab-printout") >= 0)`,
      "      {",
      "         _loc1_ = \"time-lab-printout\";",
      "      }",
      `      else if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=time-lab-followup") >= 0)`,
      "      {",
      "         _loc1_ = \"time-lab-followup\";",
      "      }",
      `      else if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=time-lab-help") >= 0 || _loc2_.indexOf("${QA_FLASHVARS_KEY}=time-lab") >= 0)`,
      "      {",
      "         _loc1_ = \"time-lab-help\";",
      "      }",
      "   }",
      "   return _loc1_;",
      "}",
      "function flashpointQaTimeLabDialogActor()",
      "{",
      "   return char1;",
      "}",
      "function flashpointQaTimeLabDialogText()",
      "{",
      "   var _loc1_ = flashpointQaTimeLabDialogMode();",
      "   var _loc2_ = flashpointQaTimeLabDialogActor();",
      "   if(_loc1_ == \"time-lab-printout\")",
      "   {",
      "      return \"这份打印资料会说明我们需要你做什么。\";",
      "   }",
      "   if(_loc1_ == \"time-lab-followup\")",
      "   {",
      "      return \"那份打印件会解释一切。我们全靠你了。\";",
      "   }",
      "   if(_loc2_ != undefined && _loc2_.talkyText != undefined && _loc2_.talkyText != \"\")",
      "   {",
      "      return _loc2_.talkyText;",
      "   }",
      "   return \"请帮帮我们。故障搅乱了时间，未来岌岌可危。\";",
      "}",
      "function flashpointQaTimeLabPlaceActor(target)",
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
      "function flashpointQaTimeLabDialogReady()",
      "{",
      "   var _loc1_ = flashpointQaTimeLabDialogActor();",
      "   if(_loc1_ == undefined || flashpointQaTimeLabDialogText() == \"\" || _root.manualSay == undefined)",
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
      "function flashpointQaMaybeShowTimeLabDialog()",
      "{",
      "   if(flashpointQaTimeLabDialogShown)",
      "   {",
      "      return undefined;",
      "   }",
      "   var _loc1_ = flashpointQaTimeLabDialogMode();",
      "   if(_loc1_ != \"time-lab-help\" && _loc1_ != \"time-lab-printout\" && _loc1_ != \"time-lab-followup\")",
      "   {",
      "      return undefined;",
      "   }",
      "   if(!flashpointQaTimeLabDialogReady())",
      "   {",
      "      return undefined;",
      "   }",
      "   var _loc2_ = flashpointQaTimeLabDialogActor();",
      "   var _loc3_ = flashpointQaTimeLabDialogText();",
      "   if(_root.takeClick != undefined)",
      "   {",
      "      _root.takeClick._visible = true;",
      "   }",
      "   flashpointQaTimeLabPlaceActor(_loc2_);",
      "   _loc2_.talkyText = _loc3_;",
      "   _root.manualSay(_loc2_,_loc3_);",
      "   var _loc4_ = _loc2_.sayDepth != undefined && _root[\"say\" + _loc2_.sayDepth] != undefined;",
      "   if(_loc4_)",
      "   {",
      "      _root[\"say\" + _loc2_.sayDepth].wait = 1200;",
      "      _root[\"say\" + _loc2_.sayDepth]._visible = true;",
      "      _root[\"say\" + _loc2_.sayDepth]._alpha = 100;",
      "      _root[\"say\" + _loc2_.sayDepth].swapDepths(250000);",
      "      flashpointQaTimeLabDialogShown = true;",
      "      flashpointQaTimeLabTrack(\"QaDialogShown\");",
      "   }",
      "   else",
      "   {",
      "      flashpointQaTimeLabTrack(\"QaDialogMissingBubble\");",
      "   }",
      "}",
      "function flashpointQaTimeLabTrack(eventName)",
      "{",
      "   var _loc1_ = flashpointQaTimeLabDialogMode();",
      "   if(_loc1_ == \"time-lab-help\" || _loc1_ == \"time-lab-printout\" || _loc1_ == \"time-lab-followup\")",
      "   {",
      "      var _loc2_ = flashpointQaTimeLabDialogActor();",
      "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=TimeLab&event=\" + eventName + \"&mode=\" + _loc1_ + \"&ready=\" + (_loc2_ != undefined) + \"&talky=\" + (flashpointQaTimeLabDialogText() != \"\") + \"&manual=\" + (_root.manualSay != undefined) + \"&coords=\" + (_loc2_ != undefined && _loc2_.coordinates != undefined && _loc2_.coordinates.x != undefined) + \"&avatar=\" + (_loc2_ != undefined && _loc2_.avatar != undefined && _loc2_.avatar.head != undefined) + \"&camera=\" + (_root.camera != undefined && _root.camera.scene != undefined) + \"&depth=\" + (_root.sayDepth != undefined) + \"&bubble=\" + (_loc2_ != undefined && _loc2_.sayDepth != undefined && _root[\"say\" + _loc2_.sayDepth] != undefined),0);",
      "   }",
      "}",
      "function flashpointQaTimeLabDialogTick()",
      "{",
      "   flashpointQaTimeLabDialogWait = flashpointQaTimeLabDialogWait + 1;",
      "   if(flashpointQaTimeLabDialogWait < 4)",
      "   {",
      "      return undefined;",
      "   }",
      "   if(flashpointQaTimeLabDialogWait == 4)",
      "   {",
      "      flashpointQaTimeLabTrack(\"QaHookTick4\");",
      "   }",
      "   flashpointQaMaybeShowTimeLabDialog();",
      "   if(flashpointQaTimeLabDialogShown || flashpointQaTimeLabDialogWait > 80)",
      "   {",
      "      clearInterval(flashpointQaTimeLabDialogInterval);",
      "   }",
      "}",
      "function flashpointQaArmTimeLabDialog()",
      "{",
      "   if(flashpointQaTimeLabDialogInterval != undefined)",
      "   {",
      "      clearInterval(flashpointQaTimeLabDialogInterval);",
      "   }",
      "   flashpointQaTimeLabDialogWait = 0;",
      "   flashpointQaTimeLabDialogInterval = setInterval(flashpointQaTimeLabDialogTick,250);",
      "}",
      ""
    ].join("\n");
    next = `${hook}${next}`;
  }
  next = next.replace(
    'flashpointQaTimeLabDialogInterval = setInterval(this,"flashpointQaTimeLabDialogTick",250);',
    "flashpointQaTimeLabDialogInterval = setInterval(flashpointQaTimeLabDialogTick,250);"
  );

  next = next.replace(
    new RegExp(
      `(function flashpointQaTimeLabDialogMode\\(\\)\\n\\{\\n\\s+var (_loc\\d+_) = String\\()_root\\.${QA_FLASHVARS_KEY.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\);`,
      "u"
    ),
    `$1_global.${QA_FLASHVARS_KEY});\n   if($2 == "" || $2 == "undefined")\n   {\n      $2 = String(_root.${QA_FLASHVARS_KEY});\n   }`
  );

  const legacyHelpFallback = [
    "   if(_loc2_ != undefined && _loc2_.talkyText != undefined && _loc2_.talkyText != \"\")",
    "   {",
    "      return _loc2_.talkyText;",
    "   }",
    "   return \"请帮帮我们。故障搅乱了时间，未来岌岌可危。\";"
  ].join("\n");
  const explicitHelpFallback = [
    "   if(_loc1_ == \"time-lab-help\")",
    "   {",
    "      return \"请帮帮我们。故障搅乱了时间，未来岌岌可危。\";",
    "   }",
    "   if(_loc2_ != undefined && _loc2_.talkyText != undefined && _loc2_.talkyText != \"\")",
    "   {",
    "      return _loc2_.talkyText;",
    "   }",
    "   return \"请帮帮我们。故障搅乱了时间，未来岌岌可危。\";"
  ].join("\n");
  if (next.includes(legacyHelpFallback)) {
    next = next.replace(legacyHelpFallback, explicitHelpFallback);
  }

  next = next.replace(
    /   if\((_loc\d+_) == "" \|\| \1 == "undefined"\)\n   \{\n      \1 = String\(flashpointQaTimeLabDialogModeCache\);\n   \}\n(?!   if\(\1 == "time-lab"\)\n   \{\n      \1 = "time-lab-help";\n   \}\n)   if\(\1 == "" \|\| \1 == "undefined"\)/u,
    [
      '   if($1 == "" || $1 == "undefined")',
      "   {",
      "      $1 = String(flashpointQaTimeLabDialogModeCache);",
      "   }",
      '   if($1 == "time-lab")',
      "   {",
      '      $1 = "time-lab-help";',
      "   }",
      '   if($1 == "" || $1 == "undefined")'
    ].join("\n")
  );
  next = next.replace(
    /(   if\((_loc\d+_) == "" \|\| \2 == "undefined"\)\n   \{\n      \2 = String\(flashpointQaTimeLabDialogModeCache\);\n   \}\n)(?!   if\(\2 == "time-lab"\)\n   \{\n      \2 = "time-lab-help";\n   \}\n)/u,
    [
      "$1",
      '   if($2 == "time-lab")',
      "   {",
      '      $2 = "time-lab-help";',
      "   }",
      ""
    ].join("\n")
  );

  next = next.replace(
    /(   if\((_loc\d+_) == "time-lab-help"\)\n   \{\n      return "请帮帮我们。故障搅乱了时间，未来岌岌可危。";\n   \}\n)(?:   if\(\2 == "time-lab-help"\)\n   \{\n      return "请帮帮我们。故障搅乱了时间，未来岌岌可危。";\n   \}\n)+/gu,
    "$1"
  );

  const armMarker = "   _root.nextFrame();";
  const armReplacement = [
    "   flashpointQaArmTimeLabDialog();",
    "   _root.nextFrame();"
  ].join("\n");
  if (!next.includes("flashpointQaArmTimeLabDialog();\n   _root.nextFrame();")) {
    if (!next.includes(armMarker)) {
      throw new Error("Unable to locate Time Lab initChars arm marker.");
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

  const packSwf = path.join(paths.as2PackDir, "swf", ...AS2_TIME_LAB_PATH.split("/"));
  if (!fileExists(packSwf)) {
    throw new Error(`Time Lab pack SWF not found: ${packSwf}`);
  }

  const workDir = path.join(paths.tempDir, "as2-time-lab-dialog-proof");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  ensureDirSync(scriptRoot);
  runChecked(ffdecCli, ["-cli", "-export", "script", scriptRoot, packSwf], "export Time Lab scripts");

  const scriptPath = findTimeLabActionScript(scriptRoot);
  const before = fs.readFileSync(scriptPath, "utf8");
  const after = insertTimeLabQaDialogHook(before);
  fs.writeFileSync(scriptPath, after, "utf8");
  const changed = after !== before;
  const replacement = translatedScriptFileEntry(scriptPath, scriptRoot);
  if (changed) {
    const patchedSwf = path.join(workDir, "sceneLab.qa-dialog.swf");
    runChecked(ffdecCli, ["-replace", packSwf, patchedSwf, replacement.replaceTarget, replacement.filePath], "replace Time Lab QA dialog script");
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
    assetPath: AS2_TIME_LAB_PATH,
    outputPath: packSwf,
    changed,
    replaceTarget: replacement.replaceTarget,
    notes: "QA only: triggers native Time Tangled Pendulums Lab manualSay bubbles via flashpointQaAs2Dialog for runtime Chinese dialogue proof."
  };
  const updatedManifest = updateManifest(manifestPath, runtimeZip, patchEntry);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    assetPath: AS2_TIME_LAB_PATH,
    outputSwf: packSwf,
    changed,
    replacement,
    manifestPath,
    manifestEntry: updatedManifest.swfPatchedAssets.find((entry) => entry?.assetId === PATCH_ASSET_ID),
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "as2", "as2-time-lab-dialog-proof-patch.json");
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
