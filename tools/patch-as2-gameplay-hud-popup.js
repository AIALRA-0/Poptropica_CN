const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { patchAs2PopupCloseShape } = require("./lib/as2-popup-close-shape");
const {
  ensureDirSync,
  fileExists,
  readJson,
  removeDirContents,
  writeJson
} = require("./lib/fs-utils");

const AS2_GAMEPLAY_PATH = "content/www.poptropica.com/gameplay.swf";
const AS2_GAMEPLAY_ALIAS_PATH = "content/www.poptropica.com/gameplay-zh.swf";
const PATCH_ASSET_ID = "as2-shared:gameplay-hud-popup-anchor";
const CLOSE_TEXT_CHARACTER_ID = 40;
const FONT_FILE_CANDIDATES = [
  "C:\\Windows\\Fonts\\simhei.ttf",
  "C:\\Windows\\Fonts\\msyh.ttc",
  "C:\\Windows\\Fonts\\msyhbd.ttc",
  "C:\\Windows\\Fonts\\ARIALUNI.ttf",
  "C:\\Windows\\Fonts\\simsun.ttc"
];

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

function splitFormattedTextSections(content) {
  const source = String(content || "");
  let index = 0;
  while (source[index] === "[") {
    const closingIndex = source.indexOf("]", index);
    if (closingIndex < 0) {
      return { prefix: source, suffix: "", body: "" };
    }
    index = closingIndex + 1;
    while (source[index] === "\r" || source[index] === "\n") {
      index += 1;
    }
  }
  const suffix = source.endsWith("\n") ? "\n" : "";
  return {
    prefix: source.slice(0, index),
    suffix,
    body: suffix ? source.slice(index, -suffix.length) : source.slice(index)
  };
}

function extractFontIds(content) {
  const ids = new Set();
  for (const match of String(content || "").matchAll(/^\s*font\s+(\d+)$/gimu)) {
    ids.add(Number.parseInt(match[1], 10));
  }
  return [...ids].filter(Number.isInteger).sort((left, right) => left - right);
}

function sanitizeFormattedTextMetadata(prefix, translatedText) {
  if (!/[^\x00-\x7F]/u.test(String(translatedText || ""))) {
    return prefix;
  }
  return String(prefix || "")
    .split(/\r?\n/u)
    .filter((line) => !/^\s*spacing(?:pair)?\s+/iu.test(line))
    .join("\n");
}

function normalizeSwfTextFile(content) {
  const normalized = String(content || "").replace(/\r?\n/gu, "\r\n");
  return normalized.endsWith("\r\n") ? normalized : `${normalized}\r\n`;
}

function findFontFile() {
  return FONT_FILE_CANDIDATES.find((candidate) => fileExists(candidate)) || null;
}

function patchCloseButtonText({ ffdecCli, inputSwf, outputSwf, workDir }) {
  const exportDir = path.join(workDir, "text-export");
  const patchDir = path.join(workDir, "text-patch");
  removeDirContents(exportDir);
  removeDirContents(patchDir);
  ensureDirSync(exportDir);
  ensureDirSync(patchDir);
  runChecked(ffdecCli, ["-cli", "-format", "text:formatted", "-export", "text", exportDir, inputSwf], "export AS2 gameplay text");

  const sourceFile = path.join(exportDir, `${CLOSE_TEXT_CHARACTER_ID}.txt`);
  if (!fileExists(sourceFile)) {
    return { changed: false, reason: "missing-close-text" };
  }

  const sourceContent = fs.readFileSync(sourceFile, "utf8");
  const { prefix, suffix, body } = splitFormattedTextSections(sourceContent);
  if (body.trim() === "关闭") {
    return { changed: false, reason: "already-translated" };
  }
  if (body.trim() !== "CLOSE") {
    return { changed: false, reason: `unexpected-close-body:${body.trim()}` };
  }

  const fontFile = findFontFile();
  if (!fontFile) {
    throw new Error("No CJK font file found for AS2 close button text replacement.");
  }

  const targetFile = path.join(patchDir, `${CLOSE_TEXT_CHARACTER_ID}.txt`);
  const translatedText = "关闭";
  fs.writeFileSync(
    targetFile,
    normalizeSwfTextFile(`${sanitizeFormattedTextMetadata(prefix, translatedText)}${translatedText}${suffix}`),
    "utf8"
  );

  const args = ["-replace", inputSwf, outputSwf];
  for (const fontId of extractFontIds(sourceContent)) {
    args.push(String(fontId), fontFile);
  }
  args.push(String(CLOSE_TEXT_CHARACTER_ID), targetFile);
  runChecked(ffdecCli, args, "replace AS2 gameplay close button text");
  return { changed: true, outputSwf, fontFile };
}

function findGameplayFrameOneScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes("function zhShowPopupBackdrop") && content.includes("function layoutFramelessGameplayNav(forceLayout)");
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
      "   var zhRight = 1010;",
      "   if(Stage != undefined && Stage.width != undefined && Number(Stage.width) > 0)",
      "   {",
      "      zhRight = Math.max(zhRight,Number(Stage.width));",
      "   }",
      "   if(zhRight > 1010)",
      "   {",
      "      zhRight = zhRight - 35;",
      "   }",
      "   return zhRight;",
      "}",
      "function zhHideDirectMapButton()",
      "{",
      "   if(_root != undefined && _root.__zhDirectMapButton != undefined)",
      "   {",
      "      _root.__zhDirectMapButton.clear();",
      "      _root.__zhDirectMapButton._visible = false;",
      "      _root.__zhDirectMapButton.enabled = false;",
      "      _root.__zhDirectMapButton.onPress = undefined;",
      "      _root.__zhDirectMapButton.onRelease = undefined;",
      "      _root.__zhDirectMapButton.useHandCursor = false;",
      "      _root.__zhDirectMapButton._x = -4000;",
      "      _root.__zhDirectMapButton._y = -4000;",
      "   }",
      "   if(_root != undefined)",
      "   {",
      "      _root.__zhMapButtonBounds = undefined;",
      "      _root.__zhDirectOpenMap = undefined;",
      "   }",
      "}",
      "function zhDisableGameplayHudButton(buttonClip)",
      "{",
      "   if(buttonClip == undefined)",
      "   {",
      "      return undefined;",
      "   }",
      "   if(buttonClip.__zhHudHandlersSaved != true)",
      "   {",
      "      buttonClip.__zhSavedOnPress = buttonClip.onPress;",
      "      buttonClip.__zhSavedOnRelease = buttonClip.onRelease;",
      "      buttonClip.__zhSavedOnRollOver = buttonClip.onRollOver;",
      "      buttonClip.__zhSavedUseHandCursor = buttonClip.useHandCursor;",
      "      buttonClip.__zhHudHandlersSaved = true;",
      "   }",
      "   buttonClip.onPress = undefined;",
      "   buttonClip.onRelease = undefined;",
      "   buttonClip.useHandCursor = false;",
      "   buttonClip._visible = false;",
      "   buttonClip._alpha = 0;",
      "   buttonClip.enabled = false;",
      "   buttonClip._x = -4000;",
      "   buttonClip._y = -4000;",
      "}",
      "function zhRestoreGameplayHudButton(buttonClip)",
      "{",
      "   var _loc2_;",
      "   if(buttonClip == undefined || buttonClip.__zhHudHandlersSaved != true)",
      "   {",
      "      return undefined;",
      "   }",
      "   _loc2_ = buttonClip.__zhSavedUseHandCursor;",
      "   buttonClip.onPress = buttonClip.__zhSavedOnPress;",
      "   buttonClip.onRelease = buttonClip.__zhSavedOnRelease;",
      "   buttonClip.onRollOver = buttonClip.__zhSavedOnRollOver;",
      "   buttonClip.useHandCursor = _loc2_ == undefined ? true : _loc2_;",
      "   delete buttonClip.__zhSavedOnPress;",
      "   delete buttonClip.__zhSavedOnRelease;",
      "   delete buttonClip.__zhSavedOnRollOver;",
      "   delete buttonClip.__zhSavedUseHandCursor;",
      "   buttonClip.__zhHudHandlersSaved = false;",
      "}",
      "function zhRestoreGameplayHudButtons()",
      "{",
      "   var _loc2_;",
      "   var _loc3_;",
      "   var _loc4_;",
      "   if(navBar == undefined)",
      "   {",
      "      return undefined;",
      "   }",
      "   _loc2_ = [navBar.btnInventory,navBar.btnWardrobe,navBar.btnMap,navBar.btnSuperPower];",
      "   _loc3_ = 0;",
      "   while(_loc3_ < _loc2_.length)",
      "   {",
      "      _loc4_ = _loc2_[_loc3_];",
      "      zhRestoreGameplayHudButton(_loc4_);",
      "      _loc3_ += 1;",
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
      "            zhDisableGameplayHudButton(_loc4_);",
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
      "      zhRestoreGameplayHudButtons();",
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
      "function zhIsSuperPowerIsland()",
      "{",
      "   var zhIslandName = \"\";",
      "   if(_root != undefined && _root.island != undefined)",
      "   {",
      "      zhIslandName = String(_root.island).toLowerCase();",
      "   }",
      "   else if(island != undefined)",
      "   {",
      "      zhIslandName = String(island).toLowerCase();",
      "   }",
      "   return zhIslandName == \"super\" || zhIslandName == \"super power\" || zhIslandName.indexOf(\"super\") >= 0;",
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
      "   if(gameMenu != undefined)",
      "   {",
      "      gameMenu._visible = false;",
      "      gameMenu._alpha = 0;",
      "      gameMenu.enabled = false;",
      "      gameMenu._x = -4000;",
      "      gameMenu._y = -4000;",
      "      delete gameMenu.onEnterFrame;",
      "   }",
      "   _loc2_ = new Object();",
      "   _loc2_.btnInventory = true;",
      "   _loc2_.btnWardrobe = true;",
      "   _loc2_.btnMap = true;",
      "   if(zhIsSuperPowerIsland())",
      "   {",
      "      _loc2_.btnSuperPower = true;",
      "   }",
      "   for(_loc3_ in navBar)",
      "   {",
      "      if(_loc2_[_loc3_] != true)",
      "      {",
      "         _loc4_ = navBar[_loc3_];",
      "         if(_loc4_ != undefined && typeof _loc4_ == \"movieclip\")",
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
      "function zhNotifyPopupViewport(active)",
      "{",
      "   var _loc1_ = active == \"map\" ? \"map\" : (active == true ? \"1\" : \"0\");",
      "   if(flash.external.ExternalInterface != undefined && flash.external.ExternalInterface.available == true)",
      "   {",
      "      try",
      "      {",
      "         flash.external.ExternalInterface.call(\"flashpointSetAs2PopupMode\",_loc1_);",
      "      }",
      "      catch(zhPopupViewportError)",
      "      {",
      "      }",
      "   }",
      "}",
      "function zhPopupUsesTightViewport(popupName)",
      "{",
      "   var _loc2_ = String(popupName).toLowerCase();",
      "   if(_loc2_ == \"inventory.swf\" || _loc2_ == \"wardrobe.swf\" || _loc2_ == \"games.swf\" || _loc2_ == \"getcard.swf\" || _loc2_ == \"givecard.swf\" || _loc2_ == \"malidocs.swf\")",
      "   {",
      "      return false;",
      "   }",
      "   return true;",
      "}",
      "function zhShowPopupBackdrop(popupName)"
    ].join("\n");
    next = replaceRequired(next, "function zhShowPopupBackdrop()", helperBlock, "popup HUD helper insertion point");
  }
  next = next.replace(
    [
      "function zhGameplayLogicalRight()",
      "{",
      "   return 820;",
      "}"
    ].join("\n"),
    [
      "function zhGameplayLogicalRight()",
      "{",
      "   var zhRight = 1010;",
      "   if(Stage != undefined && Stage.width != undefined && Number(Stage.width) > 0)",
      "   {",
      "      zhRight = Math.max(zhRight,Number(Stage.width));",
      "   }",
      "   if(zhRight > 1010)",
      "   {",
      "      zhRight = zhRight - 35;",
      "   }",
      "   return zhRight;",
      "}"
    ].join("\n")
  );
  next = next.replace(
    [
      "function zhGameplayLogicalRight()",
      "{",
      "   return 640;",
      "}"
    ].join("\n"),
    [
      "function zhGameplayLogicalRight()",
      "{",
      "   var zhRight = 1010;",
      "   if(Stage != undefined && Stage.width != undefined && Number(Stage.width) > 0)",
      "   {",
      "      zhRight = Math.max(zhRight,Number(Stage.width));",
      "   }",
      "   if(zhRight > 1010)",
      "   {",
      "      zhRight = zhRight - 35;",
      "   }",
      "   return zhRight;",
      "}"
    ].join("\n")
  );
  next = next.replace(
    [
      "function zhGameplayLogicalRight()",
      "{",
      "   return 1010;",
      "}"
    ].join("\n"),
    [
      "function zhGameplayLogicalRight()",
      "{",
      "   var zhRight = 1010;",
      "   if(Stage != undefined && Stage.width != undefined && Number(Stage.width) > 0)",
      "   {",
      "      zhRight = Math.max(zhRight,Number(Stage.width));",
      "   }",
      "   if(zhRight > 1010)",
      "   {",
      "      zhRight = zhRight - 35;",
      "   }",
      "   return zhRight;",
      "}"
    ].join("\n")
  );

  if (!next.includes("function zhQaHudDebugEnabled()")) {
    const helper = [
      "function zhQaHudDebugEnabled()",
      "{",
      "   if(_level0 != undefined && _level0.flashpointQaCacheBust != undefined && String(_level0.flashpointQaCacheBust) != \"\")",
      "   {",
      "      return true;",
      "   }",
      "   if(_root != undefined && _root.flashpointQaCacheBust != undefined && String(_root.flashpointQaCacheBust) != \"\")",
      "   {",
      "      return true;",
      "   }",
      "   return false;",
      "}",
      "function zhQaHudRound(value)",
      "{",
      "   if(value == undefined)",
      "   {",
      "      return \"na\";",
      "   }",
      "   return String(Math.round(Number(value)));",
      "}",
      "function zhQaHudClipPath(clip)",
      "{",
      "   var _loc1_;",
      "   if(clip == undefined)",
      "   {",
      "      return \"undefined\";",
      "   }",
      "   _loc1_ = \"\";",
      "   try",
      "   {",
      "      _loc1_ = String(clip);",
      "   }",
      "   catch(zhQaHudPathError)",
      "   {",
      "      _loc1_ = \"\";",
      "   }",
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      "      _loc1_ = String(clip._name);",
      "   }",
      "   return escape(_loc1_);",
      "}",
      "function zhQaHudClipX(clip)",
      "{",
      "   return clip == undefined ? \"na\" : zhQaHudRound(clip._x);",
      "}",
      "function zhQaHudClipY(clip)",
      "{",
      "   return clip == undefined ? \"na\" : zhQaHudRound(clip._y);",
      "}",
      "function zhQaHudClipVisible(clip)",
      "{",
      "   return clip == undefined ? \"na\" : String(clip._visible);",
      "}",
      "function zhQaHudLog(eventName,payload)",
      "{",
      "   if(!zhQaHudDebugEnabled() || _root == undefined)",
      "   {",
      "      return undefined;",
      "   }",
      "   if(_root.__zhHudLayoutDebugCount == undefined)",
      "   {",
      "      _root.__zhHudLayoutDebugCount = 0;",
      "   }",
      "   if(Number(_root.__zhHudLayoutDebugCount) >= 60)",
      "   {",
      "      return undefined;",
      "   }",
      "   _root.__zhHudLayoutDebugCount = Number(_root.__zhHudLayoutDebugCount) + 1;",
      "   loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=\" + eventName + \"&\" + payload,0);",
      "}"
    ].join("\n");
    next = replaceRequired(next, "function zhHideDirectMapButton()", `${helper}\nfunction zhHideDirectMapButton()`, "HUD QA debug helper insertion point");
  }

  if (!next.includes("function zhNotifyPopupViewport(active)")) {
    const helper = [
      "function zhNotifyPopupViewport(active)",
      "{",
      "   var _loc1_ = active == \"map\" ? \"map\" : (active == true ? \"1\" : \"0\");",
      "   if(flash.external.ExternalInterface != undefined && flash.external.ExternalInterface.available == true)",
      "   {",
      "      try",
      "      {",
      "         flash.external.ExternalInterface.call(\"flashpointSetAs2PopupMode\",_loc1_);",
      "      }",
      "      catch(zhPopupViewportError)",
      "      {",
      "      }",
      "   }",
      "}"
    ].join("\n");
    next = replaceRequired(next, "function zhShowPopupBackdrop()", `${helper}\nfunction zhShowPopupBackdrop()`, "popup viewport notify helper insertion point");
  }

  if (!next.includes("function zhPopupUsesTightViewport(popupName)")) {
    const helper = [
      "function zhPopupUsesTightViewport(popupName)",
      "{",
      "   var _loc2_ = String(popupName).toLowerCase();",
      "   if(_loc2_ == \"inventory.swf\" || _loc2_ == \"wardrobe.swf\" || _loc2_ == \"games.swf\" || _loc2_ == \"getcard.swf\" || _loc2_ == \"givecard.swf\" || _loc2_ == \"malidocs.swf\")",
      "   {",
      "      return false;",
      "   }",
      "   return true;",
      "}"
    ].join("\n");
    next = replaceRequired(next, "function zhShowPopupBackdrop()", `${helper}\nfunction zhShowPopupBackdrop()`, "popup viewport split helper insertion point");
  }

  const notifyPopupViewportHelper = [
    "function zhNotifyPopupViewport(active)",
    "{",
    "   var _loc1_ = active == \"map\" ? \"map\" : (active == true ? \"1\" : \"0\");",
    "   if(_root != undefined)",
    "   {",
    "      _root.__zhPopupMode = _loc1_;",
    "      _root.__zhPopupTightViewport = _loc1_ == \"1\" || _loc1_ == \"map\";",
    "   }",
    "   if(_root != undefined && (_root.flashpointQaCacheBust != undefined || (_level0 != undefined && _level0.flashpointQaCacheBust != undefined) || flashpointQaCacheBust != undefined))",
    "   {",
    "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupViewport&active=\" + _loc1_,0);",
    "   }",
    "   if(flash.external.ExternalInterface != undefined && flash.external.ExternalInterface.available == true)",
    "   {",
    "      try",
    "      {",
    "         flash.external.ExternalInterface.call(\"flashpointSetAs2PopupMode\",_loc1_);",
    "      }",
    "      catch(zhPopupViewportError)",
    "      {",
    "      }",
    "   }",
    "}"
  ].join("\n");
  const notifyPopupViewportPattern = /function zhNotifyPopupViewport\(active\)\n\{[\s\S]*?\n\}\nfunction zhPopupUsesTightViewport\(popupName\)/u;
  if (!notifyPopupViewportPattern.test(next)) {
    throw new Error("Unable to locate popup viewport notify helper for hardening.");
  }
  next = next.replace(notifyPopupViewportPattern, `${notifyPopupViewportHelper}\nfunction zhPopupUsesTightViewport(popupName)`);
  if (!/_root\.__zhPopupMode = _loc1_;/u.test(next)) {
    next = next.replace(
      "      _root.__zhPopupTightViewport = _loc1_ == \"1\" || _loc1_ == \"map\";",
      [
        "      _root.__zhPopupMode = _loc1_;",
        "      _root.__zhPopupTightViewport = _loc1_ == \"1\" || _loc1_ == \"map\";"
      ].join("\n")
    );
  }

  if (!next.includes("function zhInstallPopupCloseHandlers()")) {
    const helper = [
      "function zhInstallPopupCloseHandlers()",
      "{",
      "   if(popupClose != undefined)",
      "   {",
      "      popupClose.enabled = true;",
      "      popupClose.useHandCursor = true;",
      "      popupClose.onRollOver = _root.useArrow;",
      "      popupClose.onRelease = function()",
      "      {",
      "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=popupClose\",0);",
      "         _root.closePopup();",
      "      };",
      "      if(popupClose.btnClose != undefined)",
      "      {",
      "         popupClose.btnClose.enabled = true;",
      "         popupClose.btnClose.useHandCursor = true;",
      "         popupClose.btnClose.onRollOver = _root.useArrow;",
      "         popupClose.btnClose.onRelease = function()",
      "         {",
      "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=popupCloseBtn\",0);",
      "            _root.closePopup();",
      "         };",
      "      }",
      "   }",
      "   if(popupBack != undefined && popupBack.btnClose != undefined)",
      "   {",
      "      popupBack.btnClose.enabled = true;",
      "      popupBack.btnClose.useHandCursor = true;",
      "      popupBack.btnClose.onRollOver = _root.useArrow;",
      "      popupBack.btnClose.onRelease = function()",
      "      {",
      "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=popupBackBtn\",0);",
      "         _root.closePopup();",
      "      };",
      "   }",
      "}"
    ].join("\n");
    next = replaceRequired(next, "function zhShowPopupBackdrop(popupName)", `${helper}\nfunction zhShowPopupBackdrop(popupName)`, "popup close handler helper insertion point");
  }
  next = next.replace(
    [
      "      _root.__zhDirectMapButton._visible = false;",
      "      _root.__zhDirectMapButton.enabled = false;",
      "      _root.__zhDirectMapButton._x = -4000;"
    ].join("\n"),
    [
      "      _root.__zhDirectMapButton._visible = false;",
      "      _root.__zhDirectMapButton.enabled = false;",
      "      _root.__zhDirectMapButton.onPress = undefined;",
      "      _root.__zhDirectMapButton.onRelease = undefined;",
      "      _root.__zhDirectMapButton.useHandCursor = false;",
      "      _root.__zhDirectMapButton._x = -4000;"
    ].join("\n")
  );
  next = next.replace(
    [
      "      _root.__zhDirectMapButton._x = -4000;",
      "      _root.__zhDirectMapButton._y = -4000;",
      "   }",
      "}"
    ].join("\n"),
    [
      "      _root.__zhDirectMapButton._x = -4000;",
      "      _root.__zhDirectMapButton._y = -4000;",
      "   }",
      "   if(_root != undefined)",
      "   {",
      "      _root.__zhMapButtonBounds = undefined;",
      "      _root.__zhDirectOpenMap = undefined;",
      "   }",
      "}"
    ].join("\n")
  );
  if (!next.includes("function zhDisableGameplayHudButton(")) {
    next = replaceRequired(
      next,
      "function zhHideGameplayHudNow()",
      [
        "function zhDisableGameplayHudButton(buttonClip)",
        "{",
        "   if(buttonClip == undefined)",
        "   {",
        "      return undefined;",
        "   }",
        "   if(buttonClip.__zhHudHandlersSaved != true)",
        "   {",
        "      buttonClip.__zhSavedOnPress = buttonClip.onPress;",
        "      buttonClip.__zhSavedOnRelease = buttonClip.onRelease;",
        "      buttonClip.__zhSavedOnRollOver = buttonClip.onRollOver;",
        "      buttonClip.__zhSavedUseHandCursor = buttonClip.useHandCursor;",
        "      buttonClip.__zhHudHandlersSaved = true;",
        "   }",
        "   buttonClip.onPress = undefined;",
        "   buttonClip.onRelease = undefined;",
        "   buttonClip.useHandCursor = false;",
        "   buttonClip._visible = false;",
        "   buttonClip._alpha = 0;",
        "   buttonClip.enabled = false;",
        "   buttonClip._x = -4000;",
        "   buttonClip._y = -4000;",
        "}",
        "function zhRestoreGameplayHudButton(buttonClip)",
        "{",
        "   var _loc2_;",
        "   if(buttonClip == undefined || buttonClip.__zhHudHandlersSaved != true)",
        "   {",
        "      return undefined;",
        "   }",
        "   _loc2_ = buttonClip.__zhSavedUseHandCursor;",
        "   buttonClip.onPress = buttonClip.__zhSavedOnPress;",
        "   buttonClip.onRelease = buttonClip.__zhSavedOnRelease;",
        "   buttonClip.onRollOver = buttonClip.__zhSavedOnRollOver;",
        "   buttonClip.useHandCursor = _loc2_ == undefined ? true : _loc2_;",
        "   delete buttonClip.__zhSavedOnPress;",
        "   delete buttonClip.__zhSavedOnRelease;",
        "   delete buttonClip.__zhSavedOnRollOver;",
        "   delete buttonClip.__zhSavedUseHandCursor;",
        "   buttonClip.__zhHudHandlersSaved = false;",
        "}",
        "function zhRestoreGameplayHudButtons()",
        "{",
        "   var _loc2_;",
        "   var _loc3_;",
        "   var _loc4_;",
        "   if(navBar == undefined)",
        "   {",
        "      return undefined;",
        "   }",
        "   _loc2_ = [navBar.btnInventory,navBar.btnWardrobe,navBar.btnMap,navBar.btnSuperPower];",
        "   _loc3_ = 0;",
        "   while(_loc3_ < _loc2_.length)",
        "   {",
        "      _loc4_ = _loc2_[_loc3_];",
        "      zhRestoreGameplayHudButton(_loc4_);",
        "      _loc3_ += 1;",
        "   }",
        "}",
        "function zhHideGameplayHudNow()"
      ].join("\n"),
      "gameplay HUD handler save/restore helpers"
    );
  }
  if (!next.includes("zhDisableGameplayHudButton(_loc4_);")) {
    next = replaceRequired(
      next,
      [
        "         _loc4_ = _loc2_[_loc3_];",
        "         if(_loc4_ != undefined)",
        "         {",
        "            _loc4_._visible = false;"
      ].join("\n"),
      [
        "         _loc4_ = _loc2_[_loc3_];",
        "         if(_loc4_ != undefined)",
        "         {",
        "            zhDisableGameplayHudButton(_loc4_);",
        "            _loc4_._visible = false;"
      ].join("\n"),
      "disable gameplay HUD handlers while hidden"
    );
  }
  if (!next.includes("zhRestoreGameplayHudButtons();\n      if(navBar != undefined)")) {
    next = replaceRequired(
      next,
      [
        "   else",
        "   {",
        "      if(navBar != undefined)"
      ].join("\n"),
      [
        "   else",
        "   {",
        "      zhRestoreGameplayHudButtons();",
        "      if(navBar != undefined)"
      ].join("\n"),
      "restore gameplay HUD handlers after popup"
    );
  }
  if (!next.includes("function zhTryClosePopupFromMouse(")) {
    next = replaceRequired(
      next,
      "function zhHidePopupCloseHit()",
      [
        "function zhTryClosePopupFromMouse(source)",
        "{",
        "   var _loc2_;",
        "   var _loc3_ = 18;",
        "   var _loc4_;",
        "   var _loc5_;",
        "   if(_root == undefined || popupClose == undefined || popupClose._visible != true)",
        "   {",
        "      return false;",
        "   }",
        "   _loc4_ = _root._xmouse;",
        "   _loc5_ = _root._ymouse;",
        "   if(popupClose.getBounds != undefined)",
        "   {",
        "      _loc2_ = popupClose.getBounds(_root);",
        "      if(_loc2_ != undefined && _loc4_ >= Number(_loc2_.xMin) - _loc3_ && _loc4_ <= Number(_loc2_.xMax) + _loc3_ && _loc5_ >= Number(_loc2_.yMin) - _loc3_ && _loc5_ <= Number(_loc2_.yMax) + _loc3_)",
        "      {",
        "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=\" + source,0);",
        "         _root.closePopup();",
        "         return true;",
        "      }",
        "   }",
        "   if(_loc4_ >= 720 && _loc4_ <= 930 && _loc5_ >= 18 && _loc5_ <= 110)",
        "   {",
        "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=\" + source + \"Fallback\",0);",
        "      _root.closePopup();",
        "      return true;",
        "   }",
        "   return false;",
        "}",
        "function zhHidePopupCloseHit()"
      ].join("\n"),
      "popup close global mouse helper"
    );
  }
  if (!next.includes("zhOpenDirectMapBlockedByPopup")) {
    next = next.replace(
      [
        "function zhOpenDirectMap()",
        "{",
        "   if(_root == undefined)",
        "   {",
        "      return undefined;",
        "   }"
      ].join("\n"),
      [
        "function zhOpenDirectMap()",
        "{",
        "   if(_root == undefined)",
        "   {",
        "      return undefined;",
        "   }",
        "   if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())",
        "   {",
        "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhOpenDirectMapBlockedByPopup\",0);",
        "      return undefined;",
        "   }"
      ].join("\n")
    );
  }
  if (!next.includes("zhTryClosePopupFromMouse(\"openDirectMap\")")) {
    next = replaceRequired(
      next,
      [
        "   if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())",
        "   {",
        "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhOpenDirectMapBlockedByPopup\",0);",
        "      return undefined;",
        "   }"
      ].join("\n"),
      [
        "   if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())",
        "   {",
        "      if(zhTryClosePopupFromMouse(\"openDirectMap\"))",
        "      {",
        "         return undefined;",
        "      }",
        "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=openDirectMapBlockedMap\",0);",
        "      _root.closePopup();",
        "      return undefined;",
        "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhOpenDirectMapBlockedByPopup\",0);",
        "      return undefined;",
        "   }"
      ].join("\n"),
      "direct map popup close mouse bridge"
    );
  }
  if (!next.includes("openDirectMapBlockedMap")) {
    next = replaceRequired(
      next,
      [
        "      if(zhTryClosePopupFromMouse(\"openDirectMap\"))",
        "      {",
        "         return undefined;",
        "      }",
        "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhOpenDirectMapBlockedByPopup\",0);"
      ].join("\n"),
      [
        "      if(zhTryClosePopupFromMouse(\"openDirectMap\"))",
        "      {",
        "         return undefined;",
        "      }",
        "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=openDirectMapBlockedMap\",0);",
        "      _root.closePopup();",
        "      return undefined;",
        "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhOpenDirectMapBlockedByPopup\",0);"
      ].join("\n"),
      "blocked direct map closes popup"
    );
  }
  const directMapPopupCloseGate = [
    "   if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())",
    "   {",
    "      if(zhTryClosePopupFromMouse(\"openDirectMap\"))",
    "      {",
    "         return undefined;",
    "      }",
    "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=openDirectMapBlockedMap\",0);",
    "      _root.closePopup();",
    "      return undefined;",
    "   }"
  ].join("\n");
  const staleDirectMapPopupGate = [
    "   if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())",
    "   {",
    "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhOpenDirectMapBlockedByPopup\",0);",
    "      return undefined;",
    "   }",
    directMapPopupCloseGate
  ].join("\n");
  while (next.includes(staleDirectMapPopupGate)) {
    next = next.replace(staleDirectMapPopupGate, directMapPopupCloseGate);
  }
  if (!next.includes("zhDirectMapViewportForced")) {
    next = replaceRequired(
      next,
      [
        "   if(_root.__zhDirectMapButton != undefined)",
        "   {",
        "      _root.__zhDirectMapButton._visible = false;",
        "   }",
        "   if(_root.popup != undefined)"
      ].join("\n"),
      [
        "   if(_root.__zhDirectMapButton != undefined)",
        "   {",
        "      _root.__zhDirectMapButton._visible = false;",
        "   }",
        "   loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhDirectMapViewportForced\",0);",
        "   zhNotifyPopupViewport(\"map\");",
        "   if(_root.popup != undefined)"
      ].join("\n"),
      "direct map popup viewport force"
    );
  }
  if (!next.includes("zhDirectMapViewportDelayed")) {
    next = replaceRequired(
      next,
      [
        "   else",
        "   {",
        "      popup(\"map.swf\",true);",
        "   }",
        "   if(_root.trackEvent != undefined)"
      ].join("\n"),
      [
        "   else",
        "   {",
        "      popup(\"map.swf\",true);",
        "   }",
        "   loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhDirectMapViewportDelayed\",0);",
        "   zhNotifyPopupViewport(\"map\");",
        "   setTimeout(function()",
        "   {",
        "      zhNotifyPopupViewport(\"map\");",
        "   },50);",
        "   setTimeout(function()",
        "   {",
        "      zhNotifyPopupViewport(\"map\");",
        "   },250);",
        "   if(_root.trackEvent != undefined)"
      ].join("\n"),
      "direct map popup viewport delayed force"
    );
  }
  next = next.replace(
    "   loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhDirectMapViewportForced\",0);\n   zhNotifyPopupViewport(true);",
    "   loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhDirectMapViewportForced\",0);\n   zhNotifyPopupViewport(\"map\");"
  );
  next = next.replace(
    [
      "   loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhDirectMapViewportDelayed\",0);",
      "   zhNotifyPopupViewport(true);",
      "   setTimeout(function()",
      "   {",
      "      zhNotifyPopupViewport(true);",
      "   },50);",
      "   setTimeout(function()",
      "   {",
      "      zhNotifyPopupViewport(true);",
      "   },250);"
    ].join("\n"),
    [
      "   loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhDirectMapViewportDelayed\",0);",
      "   zhNotifyPopupViewport(\"map\");",
      "   setTimeout(function()",
      "   {",
      "      zhNotifyPopupViewport(\"map\");",
      "   },50);",
      "   setTimeout(function()",
      "   {",
      "      zhNotifyPopupViewport(\"map\");",
      "   },250);"
    ].join("\n")
  );
  next = next.replace(
    /(\n\s+)([A-Za-z_$][\w$]*)\._x = 785;\1\2\._y = 70;\1([A-Za-z_$][\w$]*) = 95;\1([A-Za-z_$][\w$]*) = 90;/u,
    "$1$2._x = 920;$1$2._y = -42;$1$3 = 90;$1$4 = 142;"
  );
  if (!next.includes("zhEnsureDirectMapButtonBlockedByPopup")) {
    next = replaceRequired(
      next,
      [
        "function zhEnsureDirectMapButton()",
        "{",
        "   if(_root == undefined)",
        "   {",
        "      return undefined;",
        "   }"
      ].join("\n"),
      [
        "function zhEnsureDirectMapButton()",
        "{",
        "   if(_root == undefined)",
        "   {",
        "      return undefined;",
        "   }",
        "   if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())",
        "   {",
        "      zhHideDirectMapButton();",
        "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhEnsureDirectMapButtonBlockedByPopup\",0);",
        "      return undefined;",
        "   }"
      ].join("\n"),
      "direct map ensure popup gate"
    );
  }
  if (!next.includes("zhMapMouseListenerBlockedByPopup") && !next.includes("zhTryClosePopupFromMouse(\"mapMouseListener\")")) {
    next = replaceRequired(
      next,
      [
        "      _root.__zhMapMouseListener.onMouseDown = function()",
        "      {",
        "         var _loc2_ = _root.__zhMapButtonBounds;"
      ].join("\n"),
      [
        "      _root.__zhMapMouseListener.onMouseDown = function()",
        "      {",
        "         if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())",
        "         {",
        "            zhHideDirectMapButton();",
        "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhMapMouseListenerBlockedByPopup\",0);",
        "            return undefined;",
        "         }",
        "         var _loc2_ = _root.__zhMapButtonBounds;"
      ].join("\n"),
      "direct map mouse listener popup gate"
    );
  }
  if (!next.includes("zhTryClosePopupFromMouse(\"mapMouseListener\")")) {
    next = replaceRequired(
      next,
      [
        "         if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())",
        "         {",
        "            zhHideDirectMapButton();",
        "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhMapMouseListenerBlockedByPopup\",0);",
        "            return undefined;",
        "         }"
      ].join("\n"),
      [
        "         if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())",
        "         {",
        "            if(zhTryClosePopupFromMouse(\"mapMouseListener\"))",
        "            {",
        "               return undefined;",
        "            }",
        "            zhHideDirectMapButton();",
        "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhMapMouseListenerBlockedByPopup\",0);",
        "            return undefined;",
        "         }"
      ].join("\n"),
      "map mouse listener popup close bridge"
    );
  }
  if (!next.includes("mapMouseListenerBlockedMap") && !next.includes("MapMouseListenerIgnoredPopup") && !next.includes("MapResetRootBridge")) {
    next = replaceRequired(
      next,
      [
        "            if(zhTryClosePopupFromMouse(\"mapMouseListener\"))",
        "            {",
        "               return undefined;",
        "            }",
        "            zhHideDirectMapButton();"
      ].join("\n"),
      [
        "            if(zhTryClosePopupFromMouse(\"mapMouseListener\"))",
        "            {",
        "               return undefined;",
        "            }",
        "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=mapMouseListenerBlockedMap\",0);",
        "            _root.closePopup();",
        "            return undefined;",
        "            zhHideDirectMapButton();"
      ].join("\n"),
      "blocked map mouse listener closes popup"
    );
  }
  next = next.replace(
    [
      "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=mapMouseListenerBlockedMap\",0);",
      "            _root.closePopup();",
      "            return undefined;",
      "            zhHideDirectMapButton();"
    ].join("\n"),
    [
      "            zhHideDirectMapButton();",
      "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=MapMouseListenerIgnoredPopup\",0);",
      "            return undefined;"
    ].join("\n")
  );
  next = next.replace(
    /            loadVariablesNum\("\/brain\/track\.php\?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=mapMouseListenerBlockedMap",0\);\r?\n            _root\.closePopup\(\);\r?\n            return undefined;/u,
    [
      "            zhHideDirectMapButton();",
      "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=MapMouseListenerIgnoredPopup&x=\" + Math.round(_root._xmouse) + \"&y=\" + Math.round(_root._ymouse),0);",
      "            return undefined;"
    ].join("\n")
  );
  next = next.replace(
    "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=MapMouseListenerIgnoredPopup\",0);",
    "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=MapMouseListenerIgnoredPopup&x=\" + Math.round(_root._xmouse) + \"&y=\" + Math.round(_root._ymouse),0);"
  );
  if (!/MapResetRootBridge/iu.test(next)) {
    next = next.replace(
      [
        "            if(zhTryClosePopupFromMouse(\"mapMouseListener\"))",
        "            {",
        "               return undefined;",
        "            }",
        "            zhHideDirectMapButton();"
      ].join("\n"),
      [
        "            if(zhTryClosePopupFromMouse(\"mapMouseListener\"))",
        "            {",
        "               return undefined;",
        "            }",
        "            if(_root.__zhPopupMode == \"map\" && _root.__zhMapPopupShowResetDialog != undefined && Number(_root._xmouse) >= 0 && Number(_root._xmouse) <= 130 && Number(_root._ymouse) >= 250 && Number(_root._ymouse) <= 390)",
        "            {",
        "               loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=MapResetRootBridge&x=\" + Math.round(_root._xmouse) + \"&y=\" + Math.round(_root._ymouse),0);",
        "               _root.__zhMapPopupShowResetDialog();",
        "               return undefined;",
        "            }",
        "            zhHideDirectMapButton();"
      ].join("\n")
    );
  }
  next = next.replace(
    /            return undefined;\r?\n            loadVariablesNum\("\/brain\/track\.php\?cluster=QA&scene=Gameplay&event=MapMouseListenerIgnoredPopup&x=" \+ Math\.round\(_root\._xmouse\) \+ "&y=" \+ Math\.round\(_root\._ymouse\),0\);\r?\n            return undefined;/u,
    "            return undefined;"
  );
  if (!next.includes("zhDirectMapButtonBlockedByPopup") && !next.includes("zhTryClosePopupFromMouse(\"directMapButton\")")) {
    next = replaceRequired(
      next,
      "   _loc2_.onPress = _loc2_.onRelease = zhOpenDirectMap;",
      [
        "   _loc2_.onPress = _loc2_.onRelease = function()",
        "   {",
        "      if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())",
        "      {",
        "         zhHideDirectMapButton();",
        "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhDirectMapButtonBlockedByPopup\",0);",
        "         return undefined;",
        "      }",
        "      return zhOpenDirectMap();",
        "   };"
      ].join("\n"),
      "direct map button popup gate"
    );
  }
  if (!next.includes("zhTryClosePopupFromMouse(\"directMapButton\")")) {
    next = replaceRequired(
      next,
      [
        "      if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())",
        "      {",
        "         zhHideDirectMapButton();",
        "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhDirectMapButtonBlockedByPopup\",0);",
        "         return undefined;",
        "      }"
      ].join("\n"),
      [
        "      if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())",
        "      {",
        "         if(zhTryClosePopupFromMouse(\"directMapButton\"))",
        "         {",
        "            return undefined;",
        "         }",
        "         zhHideDirectMapButton();",
        "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=zhDirectMapButtonBlockedByPopup\",0);",
        "         return undefined;",
        "      }"
      ].join("\n"),
      "direct map button popup close bridge"
    );
  }
  if (!next.includes("directMapButtonBlockedMap") && !next.includes("DirectMapButtonIgnoredPopup")) {
    next = replaceRequired(
      next,
      [
        "         if(zhTryClosePopupFromMouse(\"directMapButton\"))",
        "         {",
        "            return undefined;",
        "         }",
        "         zhHideDirectMapButton();"
      ].join("\n"),
      [
        "         if(zhTryClosePopupFromMouse(\"directMapButton\"))",
        "         {",
        "            return undefined;",
        "         }",
        "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=directMapButtonBlockedMap\",0);",
        "         _root.closePopup();",
        "         return undefined;",
        "         zhHideDirectMapButton();"
      ].join("\n"),
      "blocked direct map button closes popup"
    );
  }
  next = next.replace(
    [
      "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=directMapButtonBlockedMap\",0);",
      "         _root.closePopup();",
      "         return undefined;",
      "         zhHideDirectMapButton();"
    ].join("\n"),
    [
      "         zhHideDirectMapButton();",
      "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=DirectMapButtonIgnoredPopup\",0);",
      "         return undefined;"
    ].join("\n")
  );
  next = next.replace(
    /         loadVariablesNum\("\/brain\/track\.php\?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=directMapButtonBlockedMap",0\);\r?\n         _root\.closePopup\(\);\r?\n         return undefined;/u,
    [
      "         zhHideDirectMapButton();",
      "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=DirectMapButtonIgnoredPopup&x=\" + Math.round(_root._xmouse) + \"&y=\" + Math.round(_root._ymouse),0);",
      "         return undefined;"
    ].join("\n")
  );
  next = next.replace(
    "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=DirectMapButtonIgnoredPopup\",0);",
    "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=DirectMapButtonIgnoredPopup&x=\" + Math.round(_root._xmouse) + \"&y=\" + Math.round(_root._ymouse),0);"
  );
  if (!next.includes("MapMouseProbe")) {
    const mapBoundsPattern = /\n(\s*)var ([A-Za-z_$][\w$]*) = _root\.__zhMapButtonBounds;/u;
    const match = next.match(mapBoundsPattern);
    if (!match) {
      throw new Error("Unable to locate direct map mouse bounds probe insertion point.");
    }
    const indent = match[1];
    const boundsVar = match[2];
    next = next.replace(
      mapBoundsPattern,
      [
        "",
        `${indent}var ${boundsVar} = _root.__zhMapButtonBounds;`,
        `${indent}if(${boundsVar} != undefined && _root._ymouse <= 180 && _root._xmouse >= 600 && (_root.flashpointQaCacheBust != undefined || _level0.flashpointQaCacheBust != undefined || flashpointQaCacheBust != undefined))`,
        `${indent}{`,
        `${indent}   loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=MapMouseProbe&x=" + Math.round(_root._xmouse) + "&y=" + Math.round(_root._ymouse) + "&l=" + Math.round(${boundsVar}.left) + "&t=" + Math.round(${boundsVar}.top) + "&r=" + Math.round(${boundsVar}.right) + "&b=" + Math.round(${boundsVar}.bottom),0);`,
        `${indent}}`
      ].join("\n")
    );
  }
  const paddedMapBoundsPattern = /_root\.__zhMapButtonBounds = \{left:[^,]+,top:[^,]+ - 100,right:[^,]+,bottom:[^}]+ \+ 20\};/u;
  if (!paddedMapBoundsPattern.test(next)) {
    const mapBoundsAssignmentPattern = /_root\.__zhMapButtonBounds = \{left:([A-Za-z_$][\w$]*\._x),top:([A-Za-z_$][\w$]*\._y),right:([A-Za-z_$][\w$]*\._x) \+ ([A-Za-z_$][\w$]*),bottom:([A-Za-z_$][\w$]*\._y) \+ ([A-Za-z_$][\w$]*)\};/u;
    if (!mapBoundsAssignmentPattern.test(next)) {
      throw new Error("Unable to locate direct map mouse bounds assignment.");
    }
    next = next.replace(
      mapBoundsAssignmentPattern,
      (_match, leftX, topY, rightX, widthVar, bottomY, heightVar) => {
        return `_root.__zhMapButtonBounds = {left:${leftX},top:${topY} - 100,right:${rightX} + ${widthVar},bottom:${bottomY} + ${heightVar} + 20};`;
      }
    );
  }

  next = next.replace(
    "      popupClose.onRelease = closePopup;",
    [
      "      popupClose.onRelease = function()",
      "      {",
      "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=popupClose\",0);",
      "         _root.closePopup();",
      "      };"
    ].join("\n")
  );
  next = next.replace(
    "         popupClose.btnClose.onRelease = closePopup;",
    [
      "         popupClose.btnClose.onRelease = function()",
      "         {",
      "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=popupCloseBtn\",0);",
      "            _root.closePopup();",
      "         };"
    ].join("\n")
  );
  next = next.replace(
    "      popupBack.btnClose.onRelease = closePopup;",
    [
      "      popupBack.btnClose.onRelease = function()",
      "      {",
      "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=popupBackBtn\",0);",
      "         _root.closePopup();",
      "      };"
    ].join("\n")
  );
  if (!next.includes("function zhHidePopupCloseHit()")) {
    const helper = [
      "function zhHidePopupCloseHit()",
      "{",
      "   if(_root != undefined && _root.__zhPopupCloseHit != undefined)",
      "   {",
      "      _root.__zhPopupCloseHit.clear();",
      "      _root.__zhPopupCloseHit._visible = false;",
      "      _root.__zhPopupCloseHit.enabled = false;",
      "      _root.__zhPopupCloseHit._x = -4000;",
      "      _root.__zhPopupCloseHit._y = -4000;",
      "   }",
      "}",
      "function zhRefreshPopupCloseHit()",
      "{",
      "   var _loc2_;",
      "   var _loc3_;",
      "   var _loc4_ = 10;",
      "   if(_root == undefined || popupClose == undefined || popupClose._visible != true || popupClose.getBounds == undefined)",
      "   {",
      "      zhHidePopupCloseHit();",
      "      return undefined;",
      "   }",
      "   _loc2_ = popupClose.getBounds(_root);",
      "   if(!(_loc2_.xMax > _loc2_.xMin) || !(_loc2_.yMax > _loc2_.yMin))",
      "   {",
      "      zhHidePopupCloseHit();",
      "      return undefined;",
      "   }",
      "   _loc3_ = _root.__zhPopupCloseHit;",
      "   if(_loc3_ == undefined)",
      "   {",
      "      _loc3_ = _root.createEmptyMovieClip(\"__zhPopupCloseHit\",1042000);",
      "      _root.__zhPopupCloseHit = _loc3_;",
      "   }",
      "   _loc3_.swapDepths(1042000);",
      "   _loc3_.clear();",
      "   _loc3_._x = 0;",
      "   _loc3_._y = 0;",
      "   _loc3_._visible = true;",
      "   _loc3_.enabled = true;",
      "   _loc3_.useHandCursor = true;",
      "   _loc3_.beginFill(0,1);",
      "   _loc3_.moveTo(Number(_loc2_.xMin) - _loc4_,Number(_loc2_.yMin) - _loc4_);",
      "   _loc3_.lineTo(Number(_loc2_.xMax) + _loc4_,Number(_loc2_.yMin) - _loc4_);",
      "   _loc3_.lineTo(Number(_loc2_.xMax) + _loc4_,Number(_loc2_.yMax) + _loc4_);",
      "   _loc3_.lineTo(Number(_loc2_.xMin) - _loc4_,Number(_loc2_.yMax) + _loc4_);",
      "   _loc3_.lineTo(Number(_loc2_.xMin) - _loc4_,Number(_loc2_.yMin) - _loc4_);",
      "   _loc3_.moveTo(760,28);",
      "   _loc3_.lineTo(900,28);",
      "   _loc3_.lineTo(900,95);",
      "   _loc3_.lineTo(760,95);",
      "   _loc3_.lineTo(760,28);",
      "   _loc3_.endFill();",
      "   _loc3_._alpha = 1;",
      "   _loc3_.onRollOver = _root.useArrow;",
      "   _loc3_.onPress = function()",
      "   {",
      "   };",
      "   _loc3_.onRelease = function()",
      "   {",
      "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=popupCloseHit\",0);",
      "      _root.closePopup();",
      "   };",
      "}",
      "function zhShowPopupBackdrop(popupName)"
    ].join("\n");
    next = replaceRequired(next, "function zhShowPopupBackdrop(popupName)", helper, "popup close hit helper insertion point");
  }
  next = next.replace(/__zhPopupCloseHit",1030004/gu, "__zhPopupCloseHit\",1042000");
  next = next.replace(/swapDepths\(1030004\)/gu, "swapDepths(1042000)");
  next = next.replace("   _loc3_._alpha = 0;", "   _loc3_._alpha = 1;");
  if (!next.includes("   _loc3_.moveTo(760,28);")) {
    next = replaceRequired(
      next,
      [
        "   _loc3_.lineTo(Number(_loc2_.xMax) + _loc4_,Number(_loc2_.yMax) + _loc4_);",
        "   _loc3_.lineTo(Number(_loc2_.xMin) - _loc4_,Number(_loc2_.yMax) + _loc4_);",
        "   _loc3_.lineTo(Number(_loc2_.xMin) - _loc4_,Number(_loc2_.yMin) - _loc4_);",
        "   _loc3_.endFill();"
      ].join("\n"),
      [
        "   _loc3_.lineTo(Number(_loc2_.xMax) + _loc4_,Number(_loc2_.yMax) + _loc4_);",
        "   _loc3_.lineTo(Number(_loc2_.xMin) - _loc4_,Number(_loc2_.yMax) + _loc4_);",
        "   _loc3_.lineTo(Number(_loc2_.xMin) - _loc4_,Number(_loc2_.yMin) - _loc4_);",
        "   _loc3_.moveTo(760,28);",
        "   _loc3_.lineTo(900,28);",
        "   _loc3_.lineTo(900,95);",
        "   _loc3_.lineTo(760,95);",
        "   _loc3_.lineTo(760,28);",
        "   _loc3_.endFill();"
      ].join("\n"),
      "popup close fixed hit rect hook"
    );
  }

  if (!next.includes("function zhFitTightPopupClip()")) {
    const helper = [
      "function zhFitTightPopupClip()",
      "{",
      "   var _loc1_ = 640;",
      "   var _loc2_ = 480;",
      "   var _loc3_ = 16;",
      "   var _loc4_;",
      "   var _loc5_;",
      "   var _loc6_;",
      "   var _loc7_;",
      "   var _loc8_;",
      "   var _loc9_;",
      "   if(popupClip == undefined || popupClip.getBounds == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   if(popupClip.bgHit != undefined)",
      "   {",
      "      popupClip.bgHit._alpha = 0;",
      "   }",
      "   _loc8_ = _loc1_ - _loc3_ * 2;",
      "   _loc9_ = _loc2_ - _loc3_ * 2;",
      "   _loc4_ = popupClip.getBounds(_root);",
      "   _loc5_ = Number(_loc4_.xMax) - Number(_loc4_.xMin);",
      "   _loc6_ = Number(_loc4_.yMax) - Number(_loc4_.yMin);",
      "   if(!(_loc5_ > 0) || !(_loc6_ > 0))",
      "   {",
      "      return false;",
      "   }",
      "   if(_loc5_ <= _loc8_ && _loc6_ <= _loc9_)",
      "   {",
      "      return false;",
      "   }",
      "   _loc7_ = Math.min(100,_loc8_ * 100 / _loc5_);",
      "   _loc7_ = Math.min(_loc7_,_loc9_ * 100 / _loc6_);",
      "   if(!(_loc7_ > 0))",
      "   {",
      "      return false;",
      "   }",
      "   if(_loc7_ < 99)",
      "   {",
      "      popupClip._xscale = popupClip._xscale * _loc7_ / 100;",
      "      popupClip._yscale = popupClip._yscale * _loc7_ / 100;",
      "      _loc4_ = popupClip.getBounds(_root);",
      "      _loc5_ = Number(_loc4_.xMax) - Number(_loc4_.xMin);",
      "      _loc6_ = Number(_loc4_.yMax) - Number(_loc4_.yMin);",
      "   }",
      "   popupClip._x += (_loc1_ - _loc5_) / 2 - Number(_loc4_.xMin);",
      "   popupClip._y += (_loc2_ - _loc6_) / 2 - Number(_loc4_.yMin);",
      "   if(_root != undefined && _root.__zhTightPopupFitLogged != true)",
      "   {",
      "      _root.__zhTightPopupFitLogged = true;",
      "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=TightPopupFit&w=\" + Math.round(_loc5_) + \"&h=\" + Math.round(_loc6_) + \"&x=\" + Math.round(popupClip._x) + \"&y=\" + Math.round(popupClip._y),0);",
      "   }",
      "   return true;",
      "}",
      "function zhStartTightPopupFitWatchdog(popupName)",
      "{",
      "   if(_root == undefined || !zhPopupUsesTightViewport(popupName))",
      "   {",
      "      return undefined;",
      "   }",
      "   if(_root.__zhTightPopupFitInterval != undefined)",
      "   {",
      "      clearInterval(_root.__zhTightPopupFitInterval);",
      "   }",
      "   _root.__zhTightPopupFitLogged = false;",
      "   _root.__zhTightPopupFitTicks = 0;",
      "   _root.__zhTightPopupFitTick = function()",
      "   {",
      "      _root.__zhTightPopupFitTicks = Number(_root.__zhTightPopupFitTicks) + 1;",
      "      zhFitTightPopupClip();",
      "      if(_root.__zhTightPopupFitTicks > 600)",
      "      {",
      "         clearInterval(_root.__zhTightPopupFitInterval);",
      "         _root.__zhTightPopupFitInterval = undefined;",
      "      }",
      "   };",
      "   _root.__zhTightPopupFitInterval = setInterval(_root,\"__zhTightPopupFitTick\",100);",
      "}",
      "function zhStopTightPopupFitWatchdog()",
      "{",
      "   if(_root != undefined && _root.__zhTightPopupFitInterval != undefined)",
      "   {",
      "      clearInterval(_root.__zhTightPopupFitInterval);",
      "      _root.__zhTightPopupFitInterval = undefined;",
      "   }",
      "}"
    ].join("\n");
    next = replaceRequired(next, "function zhRaisePopupLayers()", `${helper}\nfunction zhRaisePopupLayers()`, "tight popup fit helper insertion point");
  }
  next = next.replace("   var _loc8_;\n   if(popupClip == undefined || popupClip.getBounds == undefined)", "   if(popupClip == undefined || popupClip.getBounds == undefined)");
  next = next.replace("   _loc4_ = popupClip.getBounds(popupClip);", "   _loc4_ = popupClip.getBounds(_root);");
  next = next.replace(
    "   _loc7_ = Math.min(100,(_loc1_ - _loc3_ * 2) * 100 / _loc5_,(_loc2_ - _loc3_ * 2) * 100 / _loc6_);",
    [
      "   _loc7_ = Math.min(100,(_loc1_ - _loc3_ * 2) * 100 / _loc5_);",
      "   _loc7_ = Math.min(_loc7_,(_loc2_ - _loc3_ * 2) * 100 / _loc6_);"
    ].join("\n")
  );
  if (!next.includes("_loc8_ = _loc1_ - _loc3_ * 2;")) {
    next = next.replace(
      "   var _loc7_;\n   if(popupClip == undefined || popupClip.getBounds == undefined)",
      [
        "   var _loc7_;",
        "   var _loc8_;",
        "   var _loc9_;",
        "   if(popupClip == undefined || popupClip.getBounds == undefined)"
      ].join("\n")
    );
    next = next.replace(
      "   _loc4_ = popupClip.getBounds(_root);",
      [
        "   _loc8_ = _loc1_ - _loc3_ * 2;",
        "   _loc9_ = _loc2_ - _loc3_ * 2;",
        "   _loc4_ = popupClip.getBounds(_root);"
      ].join("\n")
    );
  }
  if (!next.includes("popupClip.bgHit._alpha = 0;")) {
    next = next.replace(
      [
        "   if(popupClip == undefined || popupClip.getBounds == undefined)",
        "   {",
        "      return false;",
        "   }"
      ].join("\n"),
      [
        "   if(popupClip == undefined || popupClip.getBounds == undefined)",
        "   {",
        "      return false;",
        "   }",
        "   if(popupClip.bgHit != undefined)",
        "   {",
        "      popupClip.bgHit._alpha = 0;",
        "   }"
      ].join("\n")
    );
  }
  if (!next.includes("zhFitTightPopupChildClip(popupClip.board);")) {
    next = next.replace(
      [
        "   if(popupClip.bgHit != undefined)",
        "   {",
        "      popupClip.bgHit._alpha = 0;",
        "   }"
      ].join("\n"),
      [
        "   if(popupClip.bgHit != undefined)",
        "   {",
        "      popupClip.bgHit._alpha = 0;",
        "   }",
        "   if(popupClip.board != undefined)",
        "   {",
        "      popupClip._x = 0;",
        "      popupClip._y = 0;",
        "      popupClip._xscale = 100;",
        "      popupClip._yscale = 100;",
        "      popupClip.board._x = 92;",
        "      popupClip.board._y = 62;",
        "      popupClip.board._xscale = 78;",
        "      popupClip.board._yscale = 78;",
        "      return false;",
        "   }"
      ].join("\n")
    );
  }
  next = next.replace(
    [
      "      popupClip._x = 0;",
      "      popupClip._y = 0;",
      "      popupClip._xscale = 100;",
      "      popupClip._yscale = 100;",
      "      zhFitTightPopupChildClip(popupClip.board);",
      "      return false;"
    ].join("\n"),
    [
      "      popupClip._x = 0;",
      "      popupClip._y = 0;",
      "      popupClip._xscale = 100;",
      "      popupClip._yscale = 100;",
      "      popupClip.board._x = 92;",
      "      popupClip.board._y = 62;",
      "      popupClip.board._xscale = 78;",
      "      popupClip.board._yscale = 78;",
      "      return false;"
    ].join("\n")
  );
  if (!next.includes("popupClip._xscale = 100;")) {
    next = next.replace(
      [
        "   if(popupClip.board != undefined)",
        "   {",
        "      zhFitTightPopupChildClip(popupClip.board);",
        "   }"
      ].join("\n"),
      [
        "   if(popupClip.board != undefined)",
        "   {",
        "      popupClip._x = 0;",
        "      popupClip._y = 0;",
        "      popupClip._xscale = 100;",
        "      popupClip._yscale = 100;",
        "      zhFitTightPopupChildClip(popupClip.board);",
        "      return false;",
        "   }"
      ].join("\n")
    );
  }
  if (!next.includes("function zhFitTightPopupChildClip(targetClip)")) {
    const helper = [
      "function zhFitTightPopupChildClip(targetClip)",
      "{",
      "   var _loc2_ = 640;",
      "   var _loc3_ = 480;",
      "   var _loc4_ = 16;",
      "   var _loc5_;",
      "   var _loc6_;",
      "   var _loc7_;",
      "   var _loc8_;",
      "   var _loc9_;",
      "   var _loc10_;",
      "   var _loc11_;",
      "   if(targetClip == undefined || targetClip.getBounds == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   _loc5_ = targetClip.getBounds(_root);",
      "   _loc6_ = Number(_loc5_.xMax) - Number(_loc5_.xMin);",
      "   _loc7_ = Number(_loc5_.yMax) - Number(_loc5_.yMin);",
      "   if(!(_loc6_ > 0) || !(_loc7_ > 0))",
      "   {",
      "      return false;",
      "   }",
      "   if(_loc6_ <= _loc2_ - _loc4_ * 2 && _loc7_ <= _loc3_ - _loc4_ * 2 && Number(_loc5_.xMin) >= _loc4_ && Number(_loc5_.xMax) <= _loc2_ - _loc4_ && Number(_loc5_.yMin) >= _loc4_ && Number(_loc5_.yMax) <= _loc3_ - _loc4_)",
      "   {",
      "      return false;",
      "   }",
      "   _loc8_ = Math.min(100,(_loc2_ - _loc4_ * 2) * 100 / _loc6_);",
      "   _loc8_ = Math.min(_loc8_,(_loc3_ - _loc4_ * 2) * 100 / _loc7_);",
      "   if(!(_loc8_ > 0))",
      "   {",
      "      return false;",
      "   }",
      "   if(_loc8_ < 99)",
      "   {",
      "      targetClip._xscale = targetClip._xscale * _loc8_ / 100;",
      "      targetClip._yscale = targetClip._yscale * _loc8_ / 100;",
      "      _loc5_ = targetClip.getBounds(_root);",
      "      _loc6_ = Number(_loc5_.xMax) - Number(_loc5_.xMin);",
      "      _loc7_ = Number(_loc5_.yMax) - Number(_loc5_.yMin);",
      "   }",
      "   _loc9_ = targetClip._parent != undefined && targetClip._parent._xscale != undefined && targetClip._parent._xscale != 0 ? targetClip._parent._xscale / 100 : 1;",
      "   _loc10_ = targetClip._parent != undefined && targetClip._parent._yscale != undefined && targetClip._parent._yscale != 0 ? targetClip._parent._yscale / 100 : 1;",
      "   _loc11_ = (_loc2_ - _loc6_) / 2 - Number(_loc5_.xMin);",
      "   targetClip._x += _loc11_ / _loc9_;",
      "   targetClip._y += ((_loc3_ - _loc7_) / 2 - Number(_loc5_.yMin)) / _loc10_;",
      "   return true;",
      "}"
    ].join("\n");
    next = replaceRequired(next, "function zhStartTightPopupFitWatchdog(popupName)", `${helper}\nfunction zhStartTightPopupFitWatchdog(popupName)`, "tight popup child fit helper insertion point");
  }
  if (!next.includes("if(_loc5_ <= _loc8_ && _loc6_ <= _loc9_)")) {
    next = next.replace(
      [
        "   if(_loc5_ <= 0 || _loc6_ <= 0)",
        "   {",
        "      return false;",
        "   }",
        "   _loc7_ = Math.min(100,(_loc1_ - _loc3_ * 2) * 100 / _loc5_);",
        "   _loc7_ = Math.min(_loc7_,(_loc2_ - _loc3_ * 2) * 100 / _loc6_);"
      ].join("\n"),
      [
        "   if(_loc5_ <= 0 || _loc6_ <= 0)",
        "   {",
        "      return false;",
        "   }",
        "   if(_loc5_ <= _loc8_ && _loc6_ <= _loc9_)",
        "   {",
        "      return false;",
        "   }",
        "   _loc7_ = Math.min(100,_loc8_ * 100 / _loc5_);",
        "   _loc7_ = Math.min(_loc7_,_loc9_ * 100 / _loc6_);"
      ].join("\n")
    );
  }
  if (!next.includes("if(_loc6_ <= _loc2_ - _loc4_ * 2 && _loc7_ <= _loc3_ - _loc4_ * 2)")) {
    next = next.replace(
      [
        "   if(_loc6_ <= 0 || _loc7_ <= 0)",
        "   {",
        "      return false;",
        "   }",
        "   _loc8_ = Math.min(100,(_loc2_ - _loc4_ * 2) * 100 / _loc6_);",
        "   _loc8_ = Math.min(_loc8_,(_loc3_ - _loc4_ * 2) * 100 / _loc7_);"
      ].join("\n"),
      [
        "   if(_loc6_ <= 0 || _loc7_ <= 0)",
        "   {",
        "      return false;",
        "   }",
        "   if(_loc6_ <= _loc2_ - _loc4_ * 2 && _loc7_ <= _loc3_ - _loc4_ * 2)",
        "   {",
        "      return false;",
        "   }",
        "   _loc8_ = Math.min(100,(_loc2_ - _loc4_ * 2) * 100 / _loc6_);",
        "   _loc8_ = Math.min(_loc8_,(_loc3_ - _loc4_ * 2) * 100 / _loc7_);"
      ].join("\n")
    );
  }
  next = next.replace(
    [
      "   popupClip._xscale = _loc7_;",
      "   popupClip._yscale = _loc7_;",
      "   _loc8_ = _loc7_ / 100;",
      "   popupClip._x = (_loc1_ - _loc5_ * _loc8_) / 2 - Number(_loc4_.xMin) * _loc8_;",
      "   popupClip._y = (_loc2_ - _loc6_ * _loc8_) / 2 - Number(_loc4_.yMin) * _loc8_;"
    ].join("\n"),
    [
      "   if(_loc7_ < 99)",
      "   {",
      "      popupClip._xscale = popupClip._xscale * _loc7_ / 100;",
      "      popupClip._yscale = popupClip._yscale * _loc7_ / 100;",
      "      _loc4_ = popupClip.getBounds(_root);",
      "      _loc5_ = Number(_loc4_.xMax) - Number(_loc4_.xMin);",
      "      _loc6_ = Number(_loc4_.yMax) - Number(_loc4_.yMin);",
      "   }",
      "   popupClip._x += (_loc1_ - _loc5_) / 2 - Number(_loc4_.xMin);",
      "   popupClip._y += (_loc2_ - _loc6_) / 2 - Number(_loc4_.yMin);",
      "   if(_root != undefined && _root.__zhTightPopupFitLogged != true)",
      "   {",
      "      _root.__zhTightPopupFitLogged = true;",
      "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=TightPopupFit&w=\" + Math.round(_loc5_) + \"&h=\" + Math.round(_loc6_) + \"&x=\" + Math.round(popupClip._x) + \"&y=\" + Math.round(popupClip._y),0);",
      "   }"
    ].join("\n")
  );
  next = next.replace(
    "   _root.__zhTightPopupFitTicks = 0;",
    "   _root.__zhTightPopupFitLogged = false;\n   _root.__zhTightPopupFitTicks = 0;"
  );
  next = next.replace(
    "   _root.__zhTightPopupFitLogged = false;\n   _root.__zhTightPopupFitLogged = false;",
    "   _root.__zhTightPopupFitLogged = false;"
  );
  next = next.replace("if(_root.__zhTightPopupFitTicks > 80)", "if(_root.__zhTightPopupFitTicks > 600)");
  next = next.replace(
    'if(_loc2_ == "map.swf" || _loc2_ == "travelmap.swf" || _loc2_ == "inventory.swf" || _loc2_ == "wardrobe.swf" || _loc2_ == "games.swf" || _loc2_ == "getcard.swf" || _loc2_ == "givecard.swf")',
    'if(_loc2_ == "inventory.swf" || _loc2_ == "wardrobe.swf" || _loc2_ == "games.swf" || _loc2_ == "getcard.swf" || _loc2_ == "givecard.swf" || _loc2_ == "malidocs.swf")'
  );
  next = next.replace(
    'if(_loc1_ == "map.swf" || _loc1_ == "travelmap.swf" || _loc1_ == "inventory.swf" || _loc1_ == "wardrobe.swf" || _loc1_ == "games.swf" || _loc1_ == "getcard.swf" || _loc1_ == "givecard.swf")',
    'if(_loc1_ == "inventory.swf" || _loc1_ == "wardrobe.swf" || _loc1_ == "games.swf" || _loc1_ == "getcard.swf" || _loc1_ == "givecard.swf" || _loc1_ == "malidocs.swf")'
  );
  next = next.replace(
    [
      "function zhShowPopupBackdrop(popupName)",
      "{",
      "   var _loc1_ = zhPopupStageWidth();",
      "   var _loc2_ = zhPopupStageHeight();",
      "   var _loc3_;",
      "   if(_root == undefined)"
    ].join("\n"),
    [
      "function zhShowPopupBackdrop(popupName)",
      "{",
      "   var _loc1_ = zhPopupStageWidth();",
      "   var _loc2_ = zhPopupStageHeight();",
      "   var _loc3_;",
      "   if(_root == undefined)"
    ].join("\n")
  );
  next = next.replace(
    "   zhNotifyPopupViewport(zhPopupUsesTightViewport(popupName));",
    "   _root.__zhPopupTightViewport = zhPopupUsesTightViewport(popupName);\n   zhNotifyPopupViewport(_root.__zhPopupTightViewport);"
  );
  next = next.replace(
    "   _loc4_ = zhPopupUsesTightViewport(popupName);\n   zhNotifyPopupViewport(_loc4_);",
    "   _root.__zhPopupTightViewport = zhPopupUsesTightViewport(popupName);\n   zhNotifyPopupViewport(_root.__zhPopupTightViewport);"
  );
  next = next.replace(
    /   zhStartPopupHudWatchdog\(\);\n   (_loc\d+_ = _root\.__zhPopupBackdrop;)/,
    [
      "   zhStartPopupHudWatchdog();",
      "   if(_root.__zhPopupTightViewport != true)",
      "   {",
      "      if(_root.__zhPopupBackdrop != undefined)",
      "      {",
      "         _root.__zhPopupBackdrop._visible = false;",
      "      }",
      "      return undefined;",
      "   }",
      "   $1"
    ].join("\n")
  );

  next = next.replace("function zhShowPopupBackdrop()\n{", "function zhShowPopupBackdrop(popupName)\n{");
  next = next.replace("zhNotifyPopupViewport(true);", "zhNotifyPopupViewport(zhPopupUsesTightViewport(popupName));");
  next = next.replace(
    [
      "   zhShowPopupBackdrop();",
      "   createEmptyMovieClip(\"popupClip\",popupDepth);",
      "   popupClip.loadMovie(\"popups/inventory.swf\");"
    ].join("\n"),
    [
      "   zhShowPopupBackdrop(\"inventory.swf\");",
      "   createEmptyMovieClip(\"popupClip\",popupDepth);",
      "   popupClip.loadMovie(\"popups/inventory.swf\");"
    ].join("\n")
  );
  next = next.replace(
    [
      "   zhShowPopupBackdrop();",
      "   createEmptyMovieClip(\"popupClip\",popupDepth);",
      "   popupClip.loadMovie(\"popups/\" + popupName);"
    ].join("\n"),
    [
      "   zhShowPopupBackdrop(popupName);",
      "   createEmptyMovieClip(\"popupClip\",popupDepth);",
      "   popupClip.loadMovie(\"popups/\" + popupName);"
    ].join("\n")
  );
  if (!next.includes("zhStartTightPopupFitWatchdog(popupName);")) {
    next = replaceRequired(
      next,
      [
        "   zhShowPopupBackdrop(popupName);",
        "   createEmptyMovieClip(\"popupClip\",popupDepth);",
        "   popupClip.loadMovie(\"popups/\" + popupName);"
      ].join("\n"),
      [
        "   zhShowPopupBackdrop(popupName);",
        "   createEmptyMovieClip(\"popupClip\",popupDepth);",
        "   popupClip.loadMovie(\"popups/\" + popupName);",
        "   zhStartTightPopupFitWatchdog(popupName);"
      ].join("\n"),
      "tight popup fit watchdog load hook"
    );
  }
  if (!next.includes("zhInstallPopupCloseHandlers();\n   zhShowPopupBackdrop(popupName);")) {
    next = replaceRequired(
      next,
      [
        "   zhShowPopupBackdrop(popupName);",
        "   createEmptyMovieClip(\"popupClip\",popupDepth);"
      ].join("\n"),
      [
        "   zhInstallPopupCloseHandlers();",
        "   zhShowPopupBackdrop(popupName);",
        "   zhInstallPopupCloseHandlers();",
        "   createEmptyMovieClip(\"popupClip\",popupDepth);"
      ].join("\n"),
      "popup close handler show hook"
    );
  }
  if (!next.includes("zhScheduleQaPopup();")) {
    next = replaceRequired(
      next,
      [
        "if(_root != undefined && zhScheduleAutoMap != undefined)",
        "{",
        "   zhScheduleAutoMap();",
        "}",
        "if(_root != undefined && zhInstallExternalMapBridge != undefined)"
      ].join("\n"),
      [
        "if(_root != undefined && zhScheduleAutoMap != undefined)",
        "{",
        "   zhScheduleAutoMap();",
        "}",
        "if(_root != undefined && zhScheduleQaPopup != undefined)",
        "{",
        "   zhScheduleQaPopup();",
        "}",
        "if(_root != undefined && zhInstallExternalMapBridge != undefined)"
      ].join("\n"),
      "QA popup schedule init hook"
    );
  }

  const legacyNavHidePatterns = [
    {
      old: [
        "      if(String(_loc3_).indexOf(\"btn\") == 0 && _loc2_[_loc3_] != true)",
        "      {",
        "         _loc4_ = navBar[_loc3_];",
        "         if(_loc4_ != undefined)"
      ].join("\n"),
      replacement: [
        "      if(_loc2_[_loc3_] != true)",
        "      {",
        "         _loc4_ = navBar[_loc3_];",
        "         if(_loc4_ != undefined && typeof _loc4_ == \"movieclip\")"
      ].join("\n")
    },
    {
      old: [
        "      if(String(_loc2_).indexOf(\"btn\") == 0 && _loc1_[_loc2_] != true)",
        "      {",
        "         _loc3_ = navBar[_loc2_];",
        "         if(_loc3_ != undefined)"
      ].join("\n"),
      replacement: [
        "      if(_loc1_[_loc2_] != true)",
        "      {",
        "         _loc3_ = navBar[_loc2_];",
        "         if(_loc3_ != undefined && typeof _loc3_ == \"movieclip\")"
      ].join("\n")
    }
  ];
  for (const pattern of legacyNavHidePatterns) {
    next = next.replace(pattern.old, pattern.replacement);
  }

  if (!next.includes("function zhReadQaPopupName()")) {
    const helper = [
      "function zhReadQaPopupName()",
      "{",
      "   var _loc1_;",
      "   if(_global != undefined && _global.flashpointQaAs2Popup != undefined)",
      "   {",
      "      _loc1_ = _global.flashpointQaAs2Popup;",
      "   }",
      "   if((_loc1_ == undefined || _loc1_ == \"\" || String(_loc1_) == \"undefined\") && _root != undefined && _root.flashpointQaAs2Popup != undefined)",
      "   {",
      "      _loc1_ = _root.flashpointQaAs2Popup;",
      "   }",
      "   if((_loc1_ == undefined || _loc1_ == \"\" || String(_loc1_) == \"undefined\") && _level0 != undefined && _level0.flashpointQaAs2Popup != undefined)",
      "   {",
      "      _loc1_ = _level0.flashpointQaAs2Popup;",
      "   }",
      "   if(_loc1_ == undefined || String(_loc1_) == \"undefined\")",
      "   {",
      "      return \"\";",
      "   }",
      "   _loc1_ = String(_loc1_);",
      "   if(_loc1_.indexOf(\"/\") >= 0 || _loc1_.indexOf(\"\\\\\") >= 0 || _loc1_.indexOf(\"..\") >= 0)",
      "   {",
      "      return \"\";",
      "   }",
      "   if(_loc1_.indexOf(\".swf\") < 0)",
      "   {",
      "      _loc1_ += \".swf\";",
      "   }",
      "   return _loc1_;",
      "}",
      "function zhScheduleQaPopup()",
      "{",
      "   var _loc1_ = zhReadQaPopupName();",
      "   if(_root == undefined || _root.__zhQaPopupScheduled == true || _loc1_ == \"\")",
      "   {",
      "      return undefined;",
      "   }",
      "   _root.__zhQaPopupScheduled = true;",
      "   _root.__zhQaPopupName = _loc1_;",
      "   _root.__zhQaPopupTicks = 0;",
      "   _root.__zhQaPopupTick = function()",
      "   {",
      "      _root.__zhQaPopupTicks = Number(_root.__zhQaPopupTicks) + 1;",
      "      if(_root.__zhQaPopupTicks >= 24 && _root.popup != undefined && zhQaPopupSceneReady())",
      "      {",
      "         clearInterval(_root.__zhQaPopupInterval);",
      "         _root.__zhQaPopupInterval = undefined;",
      "         _root.popup(_root.__zhQaPopupName,true);",
      "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=QaPopupOpened&popup=\" + escape(_root.__zhQaPopupName) + \"&ticks=\" + _root.__zhQaPopupTicks,0);",
      "      }",
      "      else if(_root.__zhQaPopupTicks > 120)",
      "      {",
      "         clearInterval(_root.__zhQaPopupInterval);",
      "         _root.__zhQaPopupInterval = undefined;",
      "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=QaPopupTimeout&popup=\" + escape(_root.__zhQaPopupName),0);",
      "      }",
      "   };",
      "   _root.__zhQaPopupInterval = setInterval(_root,\"__zhQaPopupTick\",250);",
      "}",
      "function zhQaPopupSceneReady()",
      "{",
      "   var _loc1_;",
      "   if(_root == undefined || _root.camera == undefined || _root.camera.scene == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   _loc1_ = _root.camera.scene.char;",
      "   if(_loc1_ == undefined || _loc1_.avatar == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   return true;",
      "}"
    ].join("\n");
    next = replaceRequired(next, "function zhMaybeStartShowSayThrottleProof()", `${helper}\nfunction zhMaybeStartShowSayThrottleProof()`, "QA popup helper insertion point");
  }
  if (!next.includes("function zhQaPopupSceneReady()")) {
    const helper = [
      "function zhQaPopupSceneReady()",
      "{",
      "   var _loc1_;",
      "   if(_root == undefined || _root.camera == undefined || _root.camera.scene == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   _loc1_ = _root.camera.scene.char;",
      "   if(_loc1_ == undefined || _loc1_.avatar == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   return true;",
      "}"
    ].join("\n");
    next = replaceRequired(next, "function zhScheduleQaPopup()", `${helper}\nfunction zhScheduleQaPopup()`, "QA popup scene-ready helper insertion point");
  }
  next = next.replace(
    "if(_root.popup != undefined && _root.camera != undefined && _root.camera.scene != undefined)",
    "if(_root.__zhQaPopupTicks >= 24 && _root.popup != undefined && zhQaPopupSceneReady())"
  );
  next = next.replace("else if(_root.__zhQaPopupTicks > 80)", "else if(_root.__zhQaPopupTicks > 120)");

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

  if (!next.includes("zhNotifyPopupViewport(zhPopupUsesTightViewport(popupName));") && !next.includes("zhNotifyPopupViewport(_loc4_);") && !next.includes("zhNotifyPopupViewport(_root.__zhPopupTightViewport);")) {
    next = replaceRequired(
      next,
      [
        "   if(_root == undefined)",
        "   {",
        "      return undefined;",
        "   }",
        "   zhSetPopupHudHidden(true);"
      ].join("\n"),
      [
        "   if(_root == undefined)",
        "   {",
        "      return undefined;",
        "   }",
        "   zhNotifyPopupViewport(zhPopupUsesTightViewport(popupName));",
        "   zhSetPopupHudHidden(true);"
      ].join("\n"),
      "popup show viewport notify hook"
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

  if (!next.includes("zhNotifyPopupViewport(false);")) {
    next = replaceRequired(
      next,
      [
        "function zhHidePopupBackdrop()",
        "{",
        "   if(_root != undefined && _root.__zhPopupBackdrop != undefined)"
      ].join("\n"),
      [
        "function zhHidePopupBackdrop()",
        "{",
        "   zhNotifyPopupViewport(false);",
        "   if(_root != undefined && _root.__zhPopupBackdrop != undefined)"
      ].join("\n"),
      "popup hide viewport notify hook"
    );
  }
  if (!next.includes("zhStopTightPopupFitWatchdog();")) {
    next = replaceRequired(
      next,
      [
        "function zhHidePopupBackdrop()",
        "{",
        "   zhNotifyPopupViewport(false);"
      ].join("\n"),
      [
        "function zhHidePopupBackdrop()",
        "{",
        "   zhStopTightPopupFitWatchdog();",
        "   zhNotifyPopupViewport(false);"
      ].join("\n"),
      "popup hide fit watchdog stop hook"
    );
  }
  if (!next.includes("zhHidePopupCloseHit();\n   zhStopTightPopupFitWatchdog();")) {
    next = replaceRequired(
      next,
      [
        "function zhHidePopupBackdrop()",
        "{",
        "   zhStopTightPopupFitWatchdog();"
      ].join("\n"),
      [
        "function zhHidePopupBackdrop()",
        "{",
        "   zhHidePopupCloseHit();",
        "   zhStopTightPopupFitWatchdog();"
      ].join("\n"),
      "popup close hit hide hook"
    );
  }
  if (!next.includes("zhRaisePopupLayers();\n   zhRefreshPopupCloseHit();")) {
    next = next.replace(/   zhRaisePopupLayers\(\);/gu, "   zhRaisePopupLayers();\n   zhRefreshPopupCloseHit();");
  }

  const hidePopupBackdropHelper = [
    "function zhHidePopupBackdrop()",
    "{",
    "   zhHidePopupCloseHit();",
    "   zhStopTightPopupFitWatchdog();",
    "   zhNotifyPopupViewport(false);",
    "   if(_root != undefined)",
    "   {",
    "      _root.__zhPopupTightViewport = false;",
    "   }",
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
  ].join("\n");
  const hidePopupBackdropPattern = /function zhHidePopupBackdrop\(\)\n\{[\s\S]*?\n\}\nfunction zhOpenDirectMap\(\)/u;
  if (!hidePopupBackdropPattern.test(next)) {
    throw new Error("Unable to locate popup backdrop hide helper for hardening.");
  }
  next = next.replace(hidePopupBackdropPattern, `${hidePopupBackdropHelper}\nfunction zhOpenDirectMap()`);

  next = next.replace(
    /function closePopup\(\)\n\{\n(?!   zhNotifyPopupViewport\(false\);\n)/u,
    "function closePopup()\n{\n   zhNotifyPopupViewport(false);\n"
  );

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

  for (const source of [
    [
      "   _loc11_ = 640;",
      "   _loc12_ = 14;",
      "   _loc13_ = 14;",
      "   _loc14_ = 10;"
    ].join("\n"),
    [
      "   _loc11_ = zhGameplayLogicalRight();",
      "   _loc12_ = 14;",
      "   _loc13_ = 14;",
      "   _loc14_ = 10;"
    ].join("\n"),
    [
      "   _loc11_ = zhGameplayLogicalRight();",
      "   _loc12_ = 14;",
      "   _loc13_ = 7;",
      "   _loc14_ = 12;"
    ].join("\n")
  ]) {
    next = next.replace(
      source,
      [
      "   _loc11_ = zhGameplayLogicalRight();",
      "   _loc12_ = 14;",
      "   _loc13_ = -32;",
      "   _loc14_ = 20;"
      ].join("\n")
    );
  }

  if (!next.includes("HudLayoutNoNav")) {
    const noNavPattern = /(   (_loc\d+_) = _root != undefined && _root\.island != undefined \? String\(_root\.island\) : island;\n   if\(navBar == undefined\)\n   \{\n)      return undefined;/u;
    if (!noNavPattern.test(next)) {
      throw new Error("Unable to locate HUD layout no-nav debug hook.");
    }
    next = next.replace(noNavPattern, (_match, prefix, islandVar) => {
      return `${prefix}      zhQaHudLog("HudLayoutNoNav","island=" + escape(String(${islandVar})) + "&root=" + zhQaHudClipPath(_root));\n      return undefined;`;
    });
  }

  const countGuardPattern = /         if\((_loc\d+_) != undefined\)\n         \{\n            (_loc\d+_) \+= \1\.width;/u;
  if (countGuardPattern.test(next)) {
    next = next.replace(countGuardPattern, (_match, layoutVar, widthVar) => {
      return `         if(${layoutVar} != undefined && !isNaN(Number(${layoutVar}.width)) && !isNaN(Number(${layoutVar}.offsetX)) && !isNaN(Number(${layoutVar}.top)))\n         {\n            ${widthVar} += ${layoutVar}.width;`;
    });
  }

  const applyGuardPattern = /         if\((_loc\d+_)\._visible && (_loc\d+_) != undefined\)\n         \{\n            \1\._x = Math\.round\((_loc\d+_) \+ \2\.offsetX\);/u;
  if (applyGuardPattern.test(next)) {
    next = next.replace(applyGuardPattern, (_match, clipVar, layoutVar, leftVar) => {
      return `         if(${clipVar}._visible && ${layoutVar} != undefined && !isNaN(Number(${layoutVar}.width)) && !isNaN(Number(${layoutVar}.offsetX)) && !isNaN(Number(${layoutVar}.top)))\n         {\n            ${clipVar}._x = Math.round(${leftVar} + ${layoutVar}.offsetX);`;
    });
  }

  if (!next.includes("HudLayoutFallback")) {
    const fallbackVars = next.match(/   navBar\._x = 0;\n   navBar\._y = 0;\n   (_loc\d+_) = zhGameplayLogicalRight\(\);\n   (_loc\d+_) = 14;\n   (_loc\d+_) = -32;\n   (_loc\d+_) = 20;\n   (_loc\d+_) = 0;\n   (_loc\d+_) = 0;/u);
    if (!fallbackVars) {
      throw new Error("Unable to locate HUD layout fallback variable block.");
    }
    const countVar = fallbackVars[6];
    const emptyCountBlock = [
      `   if(${countVar} <= 0)`,
      "   {",
      "      return undefined;",
      "   }"
    ].join("\n");
    if (!next.includes(emptyCountBlock)) {
      throw new Error("Unable to locate HUD layout empty-count block.");
    }
    const fallbackBlock = [
      `   if(${countVar} < 3)`,
      "   {",
      "      var zhHudRight = zhGameplayLogicalRight();",
      "      var zhInventoryX = Math.max(6,zhHudRight - 358);",
      "      var zhWardrobeX = Math.max(62,zhHudRight - 302);",
      "      var zhMapX = Math.max(118,zhHudRight - 246);",
      "      if(navBar.btnInventory != undefined)",
      "      {",
      "         navBar.btnInventory._x = zhInventoryX;",
      "         navBar.btnInventory._y = -20;",
      "         navBar.btnInventory._visible = true;",
      "         navBar.btnInventory._alpha = 100;",
      "         navBar.btnInventory.enabled = true;",
      "      }",
      "      if(navBar.btnWardrobe != undefined)",
      "      {",
      "         navBar.btnWardrobe._x = zhWardrobeX;",
      "         navBar.btnWardrobe._y = -20;",
      "         navBar.btnWardrobe._visible = true;",
      "         navBar.btnWardrobe._alpha = 100;",
      "         navBar.btnWardrobe.enabled = true;",
      "      }",
      "      if(navBar.btnMap != undefined)",
      "      {",
      "         navBar.btnMap._x = zhMapX;",
      "         navBar.btnMap._y = -20;",
      "         navBar.btnMap._visible = true;",
      "         navBar.btnMap._alpha = 100;",
      "         navBar.btnMap.enabled = true;",
      "         _root.__zhGameplayMapBounds = {left:zhMapX - 20,top:-38,right:zhMapX + 56,bottom:50};",
      "      }",
      "      if(navBar.btnSuperPower != undefined && (!zhIsSuperPowerIsland() || isNaN(Number(navBar.btnSuperPower._y)) || Number(navBar.btnSuperPower._y) < -100))",
      "      {",
      "         navBar.btnSuperPower._visible = false;",
      "         navBar.btnSuperPower._alpha = 0;",
      "         navBar.btnSuperPower.enabled = false;",
      "         navBar.btnSuperPower._x = -4000;",
      "         navBar.btnSuperPower._y = -4000;",
      "      }",
      "      _root.__zhGameplayTopNavLeft = zhInventoryX;",
      "      _root.__zhGameplayTopNavRight = zhMapX + 56;",
      "      _root.__zhGameplayTopNavTop = -20;",
      "      _root.__zhGameplayTopNavCenterY = -20;",
      `      zhQaHudLog("HudLayoutFallback","count=" + zhQaHudRound(${countVar}) + "&invX=" + zhQaHudClipX(navBar.btnInventory) + "&wardX=" + zhQaHudClipX(navBar.btnWardrobe) + "&mapX=" + zhQaHudClipX(navBar.btnMap) + "&superY=" + zhQaHudClipY(navBar.btnSuperPower));`,
      "      zhEnsureDirectMapButton();",
      "      zhHideLegacyPauseChrome();",
      "      return undefined;",
      "   }"
    ].join("\n");
    next = next.replace(emptyCountBlock, `${fallbackBlock}\n${emptyCountBlock}`);
  }

  if (!next.includes("HudLayoutPlan")) {
    const layoutVars = next.match(/   navBar\._x = 0;\n   navBar\._y = 0;\n   (_loc\d+_) = zhGameplayLogicalRight\(\);\n   (_loc\d+_) = 14;\n   (_loc\d+_) = -32;\n   (_loc\d+_) = 20;\n   (_loc\d+_) = 0;\n   (_loc\d+_) = 0;/u);
    if (!layoutVars) {
      throw new Error("Unable to locate HUD layout variable block.");
    }
    const [, rightVar, , topVar, gapVar, widthVar, countVar] = layoutVars;
    const planPattern = /(   if\((_loc\d+_) < 6\)\n   \{\n      \2 = 6;\n   \}\n)(   _root\.__zhGameplayTopNavLeft = \2;)/u;
    if (!planPattern.test(next)) {
      throw new Error("Unable to locate HUD layout plan debug hook.");
    }
    next = next.replace(planPattern, (_match, prefix, leftVar, suffix) => {
      return `${prefix}   zhQaHudLog("HudLayoutPlan","right=" + zhQaHudRound(${rightVar}) + "&left=" + zhQaHudRound(${leftVar}) + "&top=" + zhQaHudRound(${topVar}) + "&gap=" + zhQaHudRound(${gapVar}) + "&width=" + zhQaHudRound(${widthVar}) + "&count=" + zhQaHudRound(${countVar}) + "&nav=" + zhQaHudClipPath(navBar) + "&parent=" + zhQaHudClipPath(navBar._parent));\n${suffix}`;
    });
  }

  if (!next.includes("HudLayoutApplied")) {
    next = replaceRequired(
      next,
      [
        "   }",
        "   zhEnsureDirectMapButton();",
        "   zhHideLegacyPauseChrome();",
        "}",
        "function turnOffWardrobe()"
      ].join("\n"),
      [
        "   }",
        "   zhQaHudLog(\"HudLayoutApplied\",\"navX=\" + zhQaHudRound(navBar._x) + \"&navY=\" + zhQaHudRound(navBar._y) + \"&invX=\" + zhQaHudClipX(navBar.btnInventory) + \"&invY=\" + zhQaHudClipY(navBar.btnInventory) + \"&wardX=\" + zhQaHudClipX(navBar.btnWardrobe) + \"&wardY=\" + zhQaHudClipY(navBar.btnWardrobe) + \"&mapX=\" + zhQaHudClipX(navBar.btnMap) + \"&mapY=\" + zhQaHudClipY(navBar.btnMap) + \"&superX=\" + zhQaHudClipX(navBar.btnSuperPower) + \"&superY=\" + zhQaHudClipY(navBar.btnSuperPower) + \"&invVis=\" + zhQaHudClipVisible(navBar.btnInventory) + \"&mapVis=\" + zhQaHudClipVisible(navBar.btnMap));",
        "   zhEnsureDirectMapButton();",
        "   zhHideLegacyPauseChrome();",
        "}",
        "function turnOffWardrobe()"
      ].join("\n"),
      "HUD layout applied debug hook"
    );
  }

  const hardcodedBlock = [
    "   if(navBar.btnInventory != undefined)",
    "   {",
      "      navBar.btnInventory._x = 652;",
      "      navBar.btnInventory._y = -20;",
    "      navBar.btnInventory._visible = true;",
    "      navBar.btnInventory._alpha = 100;",
    "      navBar.btnInventory.enabled = true;",
    "   }",
    "   if(navBar.btnWardrobe != undefined)",
    "   {",
      "      navBar.btnWardrobe._x = 708;",
      "      navBar.btnWardrobe._y = -20;",
    "      navBar.btnWardrobe._visible = true;",
    "      navBar.btnWardrobe._alpha = 100;",
    "      navBar.btnWardrobe.enabled = true;",
    "   }",
    "   if(navBar.btnMap != undefined)",
    "   {",
      "      navBar.btnMap._x = 764;",
      "      navBar.btnMap._y = -20;",
    "      navBar.btnMap._visible = true;",
    "      navBar.btnMap._alpha = 100;",
    "      navBar.btnMap.enabled = true;",
      "      _root.__zhGameplayMapBounds = {left:744,top:-38,right:820,bottom:50};",
      "   }"
  ].join("\n");
  if (next.includes(hardcodedBlock)) {
    next = next.replace(`${hardcodedBlock}\n`, "");
  }

  next = next
    .replace(/navBar\.btnInventory\._x = (?:472|652);/gu, "navBar.btnInventory._x = Math.max(6,zhGameplayLogicalRight() - 358);")
    .replace(/navBar\.btnInventory\._y = 10;/gu, "navBar.btnInventory._y = -20;")
    .replace(/navBar\.btnWardrobe\._x = (?:528|708);/gu, "navBar.btnWardrobe._x = Math.max(62,zhGameplayLogicalRight() - 302);")
    .replace(/navBar\.btnWardrobe\._y = 10;/gu, "navBar.btnWardrobe._y = -20;")
    .replace(/navBar\.btnMap\._x = (?:584|764);/gu, "navBar.btnMap._x = Math.max(118,zhGameplayLogicalRight() - 246);")
    .replace(/navBar\.btnMap\._y = 10;/gu, "navBar.btnMap._y = -20;")
    .replace(/zhMapButton\._x = (?:552|920);/gu, "zhMapButton._x = Math.max(6,zhGameplayLogicalRight() - 90);")
    .replace(/_root\.__zhGameplayMapBounds = \{left:(?:920|744|564),top:(?:-42|0|-38),right:(?:1010|820|640),bottom:(?:100|90|50)\};/gu, "_root.__zhGameplayMapBounds = {left:Math.max(6,zhGameplayLogicalRight() - 266),top:-38,right:Math.max(86,zhGameplayLogicalRight() - 190),bottom:50};")
    .replace(/_root\.__zhGameplayTopNavLeft = (?:472|652);/gu, "_root.__zhGameplayTopNavLeft = Math.max(6,zhGameplayLogicalRight() - 358);")
    .replace(/_root\.__zhGameplayTopNavRight = (?:640|820);/gu, "_root.__zhGameplayTopNavRight = Math.max(86,zhGameplayLogicalRight() - 190);")
    .replace(/_root\.__zhGameplayTopNavTop = 10;/gu, "_root.__zhGameplayTopNavTop = -20;")
    .replace(/_root\.__zhGameplayTopNavCenterY = 10;/gu, "_root.__zhGameplayTopNavCenterY = -20;");

  next = next.replace(
    /(\n   [A-Za-z_$][\w$]* = zhGameplayLogicalRight\(\);\n   [A-Za-z_$][\w$]* = 14;\n   )([A-Za-z_$][\w$]*) = 10;/u,
    "$1$2 = -32;"
  );

  if (!next.includes("function zhSuppressGameMenuNow()")) {
    next = replaceRequired(
      next,
      "function showGameMenu(target)",
      [
        "function zhSuppressGameMenuNow()",
        "{",
        "   if(gameMenu != undefined)",
        "   {",
        "      gameMenu._visible = false;",
        "      gameMenu._alpha = 0;",
        "      gameMenu.enabled = false;",
        "      gameMenu._x = -4000;",
        "      gameMenu._y = -4000;",
        "      delete gameMenu.onEnterFrame;",
        "      gameMenu.zhGameMenuSuppressed = true;",
        "   }",
        "}",
        "function showGameMenu(target)"
      ].join("\n"),
      "insert mini-game menu suppressor"
    );
  }

  if (!next.includes("zhGameMenuSuppressed")) {
    next = replaceRequired(
      next,
      [
        "function showGameMenu(target)",
        "{",
        "   menu._visible = false;",
        "   delete menu.onEnterFrame;",
        "   positionChat(gameMenu,target);",
        "   gameMenu.animateIn();",
        "   gameMenu._visible = true;",
        "   gameMenu.onEnterFrame = function()",
        "   {",
        "      positionChat(this,target);",
        "   };",
        "}"
      ].join("\n"),
      [
        "function showGameMenu(target)",
        "{",
        "   if(menu != undefined)",
        "   {",
        "      menu._visible = false;",
        "      delete menu.onEnterFrame;",
        "   }",
        "   if(gameMenu != undefined)",
        "   {",
        "      gameMenu._visible = false;",
        "      delete gameMenu.onEnterFrame;",
        "      gameMenu.zhGameMenuSuppressed = true;",
        "   }",
        "   return undefined;",
        "}"
      ].join("\n"),
      "suppress legacy mini-game menu"
    );
  }

  if (!next.includes("zhGameMenuSuppressInterval = setInterval")) {
    next = replaceRequired(
      next,
      "gameMenuDepth = 10000;",
      [
        "gameMenuDepth = 10000;",
        "if(zhGameMenuSuppressInterval == undefined)",
        "{",
        "   zhGameMenuSuppressInterval = setInterval(zhSuppressGameMenuNow,100);",
        "}"
      ].join("\n"),
      "start mini-game menu suppress interval"
    );
  }

  if (!next.includes("_root.layoutFramelessGameplayNav = layoutFramelessGameplayNav;")) {
    next = replaceRequired(
      next,
      [
        "if(_root != undefined)",
        "{",
        "   layoutFramelessGameplayNav(true);"
      ].join("\n"),
      [
        "if(_root != undefined)",
        "{",
        "   _root.layoutFramelessGameplayNav = layoutFramelessGameplayNav;",
        "   _root.layoutFramelessGameplayNav(true);"
      ].join("\n"),
      "publish gameplay nav layout helper on root"
    );
  }

  next = next.replace(
    [
      "         if(layoutFramelessGameplayNav != undefined)",
      "         {",
      "            layoutFramelessGameplayNav(true);",
      "         }"
    ].join("\n"),
    [
      "         if(_root.layoutFramelessGameplayNav != undefined)",
      "         {",
      "            _root.layoutFramelessGameplayNav(true);",
      "         }"
      ].join("\n")
  );

  // The generic popup normalization above rewrites every popup viewport notify
  // to boolean tight/fullscreen mode. Map popups need their own wider viewport.
  next = next.replace(
    /   loadVariablesNum\("\/brain\/track\.php\?cluster=QA&scene=Gameplay&event=zhDirectMapViewportForced",0\);\n(?:   _root\.__zhPopupTightViewport = zhPopupUsesTightViewport\(popupName\);\n   zhNotifyPopupViewport\(_root\.__zhPopupTightViewport\);\n|   zhNotifyPopupViewport\(zhPopupUsesTightViewport\(popupName\)\);\n|   zhNotifyPopupViewport\(true\);\n|   zhNotifyPopupViewport\("map"\);\n)(?=   if\(_root\.popup != undefined\))/u,
    [
      '   loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=zhDirectMapViewportForced",0);',
      '   zhNotifyPopupViewport("map");',
      ""
    ].join("\n")
  );

  next = next.replace(
    /   loadVariablesNum\("\/brain\/track\.php\?cluster=QA&scene=Gameplay&event=zhDirectMapViewportDelayed",0\);\n[\s\S]*?   ,250\);(?=\n   if\(_root\.trackEvent != undefined\))/u,
    [
      '   loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=zhDirectMapViewportDelayed",0);',
      '   zhNotifyPopupViewport("map");',
      "   setTimeout(function()",
      "   {",
      '      zhNotifyPopupViewport("map");',
      "   }",
      "   ,50);",
      "   setTimeout(function()",
      "   {",
      '      zhNotifyPopupViewport("map");',
      "   }",
      "   ,250);"
    ].join("\n")
  );

  if (!next.includes("function zhGameplayLogicalRight()") || (next.includes("navBar.btnInventory._x = 652;") && !next.includes("HudLayoutFallback"))) {
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
  const aliasSwf = path.join(paths.as2PackDir, "swf", ...AS2_GAMEPLAY_ALIAS_PATH.split("/"));

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
  let inputSwf = packSwf;
  if (replacements.length > 0) {
    for (const replacement of replacements) {
      const patchedSwf = path.join(workDir, `gameplay.hud-popup.${replacements.indexOf(replacement)}.swf`);
      runChecked(ffdecCli, ["-replace", inputSwf, patchedSwf, replacement.replaceTarget, replacement.filePath], `replace ${replacement.exportPath}`);
      inputSwf = patchedSwf;
    }
  }

  const closeTextPatch = patchCloseButtonText({
    ffdecCli,
    inputSwf,
    outputSwf: path.join(workDir, "gameplay.close-button.swf"),
    workDir
  });
  if (closeTextPatch.changed) {
    inputSwf = closeTextPatch.outputSwf;
  }

  const closeShapePatch = patchAs2PopupCloseShape({
    ffdecCli,
    inputSwf,
    outputSwf: path.join(workDir, "gameplay.popup-close-shape.swf"),
    workDir
  });
  if (closeShapePatch.changed) {
    inputSwf = closeShapePatch.outputSwf;
  }

  const changed = replacements.length > 0 || closeTextPatch.changed || closeShapePatch.changed;
  if (changed) {
    fs.copyFileSync(inputSwf, packSwf);
  }
  const aliasSynced = !fileExists(aliasSwf) || !fs.readFileSync(packSwf).equals(fs.readFileSync(aliasSwf));
  if (aliasSynced) {
    ensureDirSync(path.dirname(aliasSwf));
    fs.copyFileSync(packSwf, aliasSwf);
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
    aliasAssetPath: AS2_GAMEPLAY_ALIAS_PATH,
    aliasOutputPath: aliasSwf,
    changed: changed || aliasSynced,
    gameplayChanged: changed,
    aliasSynced,
    replaceTargets: replacements.map((entry) => entry.replaceTarget),
    closeTextPatch,
    closeShapePatch,
    notes: "Anchors AS2 gameplay HUD by visible icon bounds, hides HUD while popup/map/inventory overlays are open, localizes the native popup close text, and replaces the static vector CLOSE label asset."
  };
  const updatedManifest = updateManifest(manifestPath, runtimeZip, patchEntry);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    assetPath: AS2_GAMEPLAY_PATH,
    outputSwf: packSwf,
    aliasSwf,
    changed: changed || aliasSynced,
    gameplayChanged: changed,
    aliasSynced,
    replacements,
    closeTextPatch,
    closeShapePatch,
    manifestPath,
    manifestEntry: updatedManifest.swfPatchedAssets.find((entry) => entry?.assetId === PATCH_ASSET_ID),
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "as2", "as2-gameplay-hud-popup-patch.json");
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
