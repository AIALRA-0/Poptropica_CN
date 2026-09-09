const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, removeDirContents, readJson, writeJson } = require("./lib/fs-utils");

const MAP_SWF_PATH = path.join(
  paths.as2PackDir,
  "swf",
  "content",
  "www.poptropica.com",
  "popups",
  "map.swf"
);

const PATCHES = new Map([
  ["31.txt", "抱歉，这座岛[\nx 220\ny 960\n]暂时没有[\nx 920\ny 1520\n]地图。"],
  ["36.txt", "紫色\n巨人"],
  ["42.txt", "重启[\nx 220\ny 660\n]岛屿"]
]);

const ISLAND_NAME_HELPER_PATCH = `function flashpointZhAs2MapIslandName(islandId, fallbackName)
{
   var names = new Object();
   names.Early = "早期波普岛";
   names.Shark = "鲨鱼牙岛";
   names.Carrot = "24 胡萝卜岛";
   names.Super = "超级英雄岛";
   names.Time = "时空缠结岛";
   names.Spy = "间谍岛";
   names.Nabooti = "纳布提岛";
   names.Astro = "太空岛";
   names.Counter = "伪造岛";
   names.Cryptid = "神秘生物岛";
   names.Steam = "蒸汽工厂岛";
   names.Trade = "贸易岛";
   names.Train = "神秘列车岛";
   names.GameShow = "游戏秀岛";
   names.Myth = "神话岛";
   if(names[String(islandId)] != undefined)
   {
      return names[String(islandId)];
   }
   return fallbackName;
}`;

const MAP_BUTTON_LAYOUT_PATCH = `${ISLAND_NAME_HELPER_PATCH}
stop();
if(resetIslandButton != undefined && !resetIslandButton.flashpointMapButtonLayoutApplied)
{
   resetIslandButton.flashpointMapButtonLayoutApplied = true;
   resetIslandButton._y -= 34;
}
_root.useArrow();`;

const BLIMP_HINT_CN = "到主街飞艇处\\n前往其他岛屿。";

const FONT_FILE_CANDIDATES = [
  "C:\\Windows\\Fonts\\simhei.ttf",
  "C:\\Windows\\Fonts\\msyh.ttc",
  "C:\\Windows\\Fonts\\msyhbd.ttc",
  "C:\\Windows\\Fonts\\ARIALUNI.ttf",
  "C:\\Windows\\Fonts\\simsun.ttc"
];

function runChecked(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 1024 * 1024 * 16
  });
  const output = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
  if (result.status !== 0 || /SEVERE:/iu.test(output)) {
    throw new Error(`${label} failed: ${output || result.error?.message || "unknown error"}`);
  }
  return result;
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
    while (/\s/u.test(source[index] || "")) {
      index += 1;
    }
  }
  const suffixMatch = source.slice(index).match(/(\s*)$/u);
  const suffix = suffixMatch ? suffixMatch[1] : "";
  return {
    prefix: source.slice(0, index),
    suffix,
    body: suffix ? source.slice(index, -suffix.length) : source.slice(index)
  };
}

function sanitizePrefix(prefix) {
  return String(prefix || "")
    .split(/\r?\n/u)
    .filter((line) => !/^\s*spacing(?:pair)?\s+/iu.test(line))
    .join("\n");
}

function normalizeTextFile(content) {
  const normalized = String(content || "").replace(/\r?\n/gu, "\r\n");
  return normalized.endsWith("\r\n") ? normalized : `${normalized}\r\n`;
}

function extractFontIds(content) {
  const ids = new Set();
  for (const match of String(content || "").matchAll(/^\s*font\s+(\d+)/gimu)) {
    ids.add(Number(match[1]));
  }
  return [...ids].filter(Number.isFinite).sort((left, right) => left - right);
}

function patchMapScript({ ffdecCli, inputSwf, outputSwf, workDir }) {
  const scriptDir = path.join(workDir, "scripts");
  removeDirContents(scriptDir);
  ensureDirSync(scriptDir);
  runChecked(ffdecCli, ["-cli", "-export", "script", scriptDir, inputSwf], "export map popup scripts");

  const frameScript = path.join(scriptDir, "scripts", "frame_2", "DoAction.as");
  const mapLoadScript = path.join(scriptDir, "scripts", "DefineSprite_38", "frame_1", "DoAction.as");
  if (!fileExists(frameScript) || !fileExists(mapLoadScript)) {
    return { ok: false, changed: false, reason: "missing-map-popup-script" };
  }

  const sourceFrameContent = fs.readFileSync(frameScript, "utf8");
  let nextFrameContent = sourceFrameContent;
  if (!/flashpointMapButtonLayoutApplied/iu.test(nextFrameContent)) {
    nextFrameContent = nextFrameContent.replace(/stop\(\);\s*_root\.useArrow\(\);/u, MAP_BUTTON_LAYOUT_PATCH);
    if (nextFrameContent === sourceFrameContent) {
      return { ok: false, changed: false, reason: "layout-anchor-not-found" };
    }
  }
  if (!/flashpointZhAs2MapIslandName/iu.test(nextFrameContent)) {
    nextFrameContent = nextFrameContent.replace(/function showResetDialog\(\)/u, `${ISLAND_NAME_HELPER_PATCH}\nfunction showResetDialog()`);
  }
  if (!/gResetDialog\._parent != undefined/iu.test(nextFrameContent)) {
    nextFrameContent = nextFrameContent.replace(
      /function showResetDialog\(\)\r?\n\{/u,
      [
        "function showResetDialog()",
        "{",
        "   if(gResetDialog != undefined && gResetDialog._parent != undefined)",
        "   {",
        "      return undefined;",
        "   }"
      ].join("\n")
    );
  }
  if (!/gCurrentIslandName\s*=\s*flashpointZhAs2MapIslandName/iu.test(nextFrameContent)) {
    nextFrameContent = nextFrameContent.replace(
      /var gCurrentIslandName = islandDescriptiveNames\[islandIndex\];/u,
      "var gCurrentIslandName = islandDescriptiveNames[islandIndex];\ngCurrentIslandName = flashpointZhAs2MapIslandName(_root.island,gCurrentIslandName);"
    );
  }
  if (!/flashpointMapResetRequestToken/iu.test(nextFrameContent)) {
    nextFrameContent = nextFrameContent.replace(
      /resetIslandButton\.onRelease = Delegate\.create\(this,showResetDialog\);\r?\n/u,
      [
        "resetIslandButton.onRelease = Delegate.create(this,showResetDialog);",
        "var flashpointMapResetRequestToken = \"\";",
        "this.onEnterFrame = function()",
        "{",
        "   var requestToken = String(_root.__zhExternalMapResetRequest);",
        "   if(requestToken != \"\" && requestToken != \"undefined\" && requestToken != flashpointMapResetRequestToken)",
        "   {",
        "      flashpointMapResetRequestToken = requestToken;",
        "      showResetDialog();",
        "   }",
        "};",
        ""
      ].join("\n")
    );
  }
  if (!/__zhMapPopupShowResetDialog/iu.test(nextFrameContent)) {
    nextFrameContent = nextFrameContent.replace(
      /resetIslandButton\.onRelease = Delegate\.create\(this,showResetDialog\);\r?\n/u,
      [
        "resetIslandButton.onRelease = Delegate.create(this,showResetDialog);",
        "_root.__zhMapPopupShowResetDialog = function()",
        "{",
        "   return showResetDialog();",
        "};",
        ""
      ].join("\n")
    );
  }
  if (!/flashpointMapResetMouseBridge/iu.test(nextFrameContent)) {
    nextFrameContent = nextFrameContent.replace(
      /\};\r?\nvar gResetDialog;/u,
      [
        "};",
        "function flashpointMapResetMouseBridge()",
        "{",
        "   var _loc2_;",
        "   var _loc3_ = Math.round(_root._xmouse);",
        "   var _loc4_ = Math.round(_root._ymouse);",
        "   var _loc5_ = 32;",
        "   if(gResetDialog != undefined && gResetDialog._parent != undefined)",
        "   {",
        "      return false;",
        "   }",
        "   if(resetIslandButton != undefined && resetIslandButton.getBounds != undefined)",
        "   {",
        "      _loc2_ = resetIslandButton.getBounds(_root);",
        "      if(_loc2_ != undefined && _loc3_ >= Number(_loc2_.xMin) - _loc5_ && _loc3_ <= Number(_loc2_.xMax) + _loc5_ && _loc4_ >= Number(_loc2_.yMin) - _loc5_ && _loc4_ <= Number(_loc2_.yMax) + _loc5_)",
        "      {",
        "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=MapPopup&event=MapResetMouseBridge&x=\" + _loc3_ + \"&y=\" + _loc4_,0);",
        "         showResetDialog();",
        "         return true;",
        "      }",
        "   }",
        "   if(_loc3_ >= 0 && _loc3_ <= 190 && _loc4_ >= 410 && _loc4_ <= 650)",
        "   {",
        "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=MapPopup&event=MapResetMouseFallback&x=\" + _loc3_ + \"&y=\" + _loc4_,0);",
        "      showResetDialog();",
        "      return true;",
        "   }",
        "   return false;",
        "}",
        "this.flashpointMapResetMouseListener = new Object();",
        "this.flashpointMapResetMouseListener.onMouseDown = function()",
        "{",
        "   flashpointMapResetMouseBridge();",
        "};",
        "Mouse.addListener(this.flashpointMapResetMouseListener);",
        "var gResetDialog;"
      ].join("\n")
    );
  }
  nextFrameContent = nextFrameContent.replace(
    [
      "var flashpointMapResetMouseListener = new Object();",
      "flashpointMapResetMouseListener.onMouseDown = function()",
      "{",
      "   flashpointMapResetMouseBridge();",
      "};",
      "Mouse.addListener(flashpointMapResetMouseListener);"
    ].join("\n"),
    [
      "this.flashpointMapResetMouseListener = new Object();",
      "this.flashpointMapResetMouseListener.onMouseDown = function()",
      "{",
      "   flashpointMapResetMouseBridge();",
      "};",
      "Mouse.addListener(this.flashpointMapResetMouseListener);"
    ].join("\n")
  );
  nextFrameContent = nextFrameContent.replace(
    /var flashpointMapResetMouseListener = new Object\(\);\r?\nflashpointMapResetMouseListener\.onMouseDown = function\(\)\r?\n\{\r?\n   flashpointMapResetMouseBridge\(\);\r?\n\};\r?\nMouse\.addListener\(flashpointMapResetMouseListener\);/u,
    [
      "this.flashpointMapResetMouseListener = new Object();",
      "this.flashpointMapResetMouseListener.onMouseDown = function()",
      "{",
      "   flashpointMapResetMouseBridge();",
      "};",
      "Mouse.addListener(this.flashpointMapResetMouseListener);"
    ].join("\n")
  );
  if (!/flashpointMapResetButtonsArmed/iu.test(nextFrameContent)) {
    nextFrameContent = nextFrameContent.replace(
      /(gResetDialog\.label\.htmlText = "确定要重置<FONT color=\\?"#ffe23d\\?">" \+ gCurrentIslandName \+ "<\/FONT>吗？该岛上的道具和进度都会丢失。";\r?\n)/u,
      [
        "$1",
        "   gResetDialog.resetButton.enabled = false;",
        "   gResetDialog.cancelButton.enabled = false;",
        "   gResetDialog.flashpointMapResetButtonsArmed = false;",
        ""
      ].join("\n")
    );
    nextFrameContent = nextFrameContent.replace(
      /   gResetDialog\.cancelButton\.onRelease = function\(\)\r?\n   \{\r?\n      gResetDialog\.removeMovieClip\(\);\r?\n   \};\r?\n/u,
      [
        "   gResetDialog.cancelButton.onRelease = function()",
        "   {",
        "      gResetDialog.removeMovieClip();",
        "   };",
        "   gResetDialog.onEnterFrame = function()",
        "   {",
        "      if(!this.flashpointMapResetButtonsArmed)",
        "      {",
        "         this.flashpointMapResetButtonsArmed = true;",
        "         this.resetButton.enabled = true;",
        "         this.cancelButton.enabled = true;",
        "         delete this.onEnterFrame;",
        "      }",
        "   };",
        ""
      ].join("\n")
    );
  }

  const sourceMapLoadContent = fs.readFileSync(mapLoadScript, "utf8");
  let nextMapLoadContent = sourceMapLoadContent.replace(
    /blimpText\s*=\s*"Go to the blimp on Main Street\\nto travel to another island\.";/u,
    `blimpText = "${BLIMP_HINT_CN}";`
  );

  let currentInput = inputSwf;
  let changed = false;
  const replacements = [];
  if (nextFrameContent !== sourceFrameContent) {
    const frameOutput = path.join(workDir, "map-popup-frame-script-pass.swf");
    fs.writeFileSync(frameScript, nextFrameContent, "utf8");
    runChecked(ffdecCli, ["-replace", currentInput, frameOutput, "\\frame_2\\DoAction", frameScript], "replace map popup frame script");
    currentInput = frameOutput;
    changed = true;
    replacements.push("frame_2/DoAction");
  }
  if (nextMapLoadContent !== sourceMapLoadContent) {
    const loadOutput = path.join(workDir, "map-popup-load-script-pass.swf");
    fs.writeFileSync(mapLoadScript, nextMapLoadContent, "utf8");
    runChecked(ffdecCli, ["-replace", currentInput, loadOutput, "\\DefineSprite_38\\frame_1\\DoAction", mapLoadScript], "replace map popup load script");
    currentInput = loadOutput;
    changed = true;
    replacements.push("DefineSprite_38/frame_1/DoAction");
  }
  fs.copyFileSync(currentInput, outputSwf);
  return { ok: true, changed, reason: null, replacements };
}

function findFontFile() {
  return FONT_FILE_CANDIDATES.find((candidate) => fileExists(candidate)) || null;
}

function main() {
  const config = loadConfig();
  if (!config.tools?.ffdecCli || !fileExists(config.tools.ffdecCli)) {
    throw new Error("FFDec CLI is required.");
  }
  if (!fileExists(MAP_SWF_PATH)) {
    throw new Error(`Missing packed AS2 map popup: ${MAP_SWF_PATH}`);
  }

  const workDir = path.join(paths.tempDir, "as2-map-popup-text-patch");
  const exportDir = path.join(workDir, "export");
  const patchDir = path.join(workDir, "patch");
  removeDirContents(workDir);
  ensureDirSync(exportDir);
  ensureDirSync(patchDir);

  runChecked(config.tools.ffdecCli, ["-cli", "-format", "text:formatted", "-export", "text", exportDir, MAP_SWF_PATH], "export map popup text");

  const fontFile = findFontFile();
  if (!fontFile) {
    throw new Error("No CJK font file found for SWF text replacement.");
  }

  const replacements = [];
  for (const [fileName, translatedBody] of PATCHES.entries()) {
    const sourceFile = path.join(exportDir, fileName);
    if (!fileExists(sourceFile)) {
      continue;
    }
    const sourceContent = fs.readFileSync(sourceFile, "utf8");
    const { prefix, suffix, body } = splitFormattedTextSections(sourceContent);
    if (!/[A-Za-z]/u.test(body)) {
      continue;
    }
    const targetFile = path.join(patchDir, fileName);
    writeJson(path.join(patchDir, `${fileName}.meta.json`), {
      fileName,
      originalBody: body,
      translatedBody
    });
    fs.writeFileSync(targetFile, normalizeTextFile(`${sanitizePrefix(prefix)}${translatedBody}${suffix}`), "utf8");
    replacements.push({
      fileName,
      targetFile,
      characterId: Number.parseInt(path.basename(fileName, ".txt"), 10),
      fontIds: extractFontIds(sourceContent)
    });
  }

  let currentInput = MAP_SWF_PATH;
  replacements.forEach((replacement, index) => {
    const outputSwf = path.join(workDir, `map-popup-pass-${index}.swf`);
    const args = ["-replace", currentInput, outputSwf];
    for (const fontId of replacement.fontIds) {
      args.push(String(fontId), fontFile);
    }
    args.push(String(replacement.characterId), replacement.targetFile);
    runChecked(config.tools.ffdecCli, args, `replace ${replacement.fileName}`);
    currentInput = outputSwf;
  });

  const scriptOutput = path.join(workDir, "map-popup-script-pass.swf");
  const scriptPatch = patchMapScript({
    ffdecCli: config.tools.ffdecCli,
    inputSwf: currentInput,
    outputSwf: scriptOutput,
    workDir
  });
  if (!scriptPatch.ok) {
    throw new Error(`Unable to patch map popup script: ${scriptPatch.reason}`);
  }

  const changed = replacements.length > 0 || scriptPatch.changed;
  if (!changed) {
    printJson({ ok: true, changed: false, mapSwfPath: MAP_SWF_PATH });
    return;
  }

  fs.copyFileSync(scriptOutput, MAP_SWF_PATH);

  const manifestPath = path.join(paths.as2PackDir, "manifest.json");
  const manifest = readJson(manifestPath, {
    generatedAt: new Date().toISOString(),
    sourceGroup: "as2",
    canonicalKeys: [],
    assetsPatched: 0,
    externalTextAssets: [],
    swfPatchedAssets: [],
    pendingSwfAssets: []
  });
  const runtimeZip = buildRuntimeZipForSourceGroup({ config, sourceGroup: "as2", manifest });
  writeJson(manifestPath, manifest);

  printJson({
    ok: true,
    changed: true,
    mapSwfPath: MAP_SWF_PATH,
    replacements: replacements.map((replacement) => replacement.fileName),
    scriptPatch,
    runtimeZip
  });
}

main();
