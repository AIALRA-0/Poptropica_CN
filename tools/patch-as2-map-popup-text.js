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

const MAP_BUTTON_LAYOUT_PATCH = `stop();
if(resetIslandButton != undefined && !resetIslandButton.flashpointMapButtonLayoutApplied)
{
   resetIslandButton.flashpointMapButtonLayoutApplied = true;
   resetIslandButton._y -= 34;
}
_root.useArrow();`;

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
  if (!fileExists(frameScript)) {
    return { ok: false, changed: false, reason: "missing-frame-2-script" };
  }

  const sourceContent = fs.readFileSync(frameScript, "utf8");
  if (/flashpointMapButtonLayoutApplied/iu.test(sourceContent)) {
    fs.copyFileSync(inputSwf, outputSwf);
    return { ok: true, changed: false, reason: "already-patched" };
  }

  const nextContent = sourceContent.replace(/stop\(\);\s*_root\.useArrow\(\);/u, MAP_BUTTON_LAYOUT_PATCH);
  if (nextContent === sourceContent) {
    return { ok: false, changed: false, reason: "layout-anchor-not-found" };
  }
  fs.writeFileSync(frameScript, nextContent, "utf8");
  runChecked(ffdecCli, ["-replace", inputSwf, outputSwf, "\\frame_2\\DoAction", frameScript], "replace map popup layout script");
  return { ok: true, changed: true, reason: null };
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
