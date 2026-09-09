const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, listFilesRecursive, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const LABEL_REPLACEMENTS = new Map([
  ["GO LEFT", "向左"],
  ["GO RIGHT", "向右"],
  ["GO UP", "向上"],
  ["GO DOWN", "向下"],
  ["ENTER", "进入"],
  ["EXIT", "退出"],
  ["TRAVEL", "旅行"],
  ["COMMON ROOM", "公共房间"]
]);

const FONT_CANDIDATES = [
  "C:\\Windows\\Fonts\\simhei.ttf",
  "C:\\Windows\\Fonts\\ARIALUNI.ttf",
  "C:\\Windows\\Fonts\\msyh.ttc",
  "C:\\Windows\\Fonts\\simsun.ttc"
];

function parseArgs(argv) {
  const args = {
    islandDir: "",
    swf: "",
    allIslands: false
  };
  for (const rawArg of argv) {
    const arg = String(rawArg || "");
    if (arg === "--all-islands") {
      args.allIslands = true;
    } else if (arg.startsWith("--island-dir=")) {
      args.islandDir = arg.slice("--island-dir=".length);
    } else if (arg.startsWith("--swf=")) {
      args.swf = arg.slice("--swf=".length);
    }
  }
  return args;
}

function rel(filePath) {
  return path.relative(paths.projectRoot, filePath).replace(/\\/gu, "/");
}

function runFfdec(ffdecCli, args) {
  const result = spawnSync(ffdecCli, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 1024 * 1024 * 32
  });
  const output = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
  const severe = /SEVERE:\s*(.+)$/imu.exec(output);
  const timedOut = result.error?.code === "ETIMEDOUT";
  return {
    ok: result.status === 0 && !severe && !timedOut,
    status: result.status,
    error: timedOut ? "FFDec command timed out" : severe ? severe[1].trim() : output
  };
}

function exportSwfTexts({ ffdecCli, inputSwf, outputDir, formatted = false }) {
  removeDirContents(outputDir);
  ensureDirSync(outputDir);
  const args = ["-cli"];
  if (formatted) {
    args.push("-format", "text:formatted");
  }
  args.push("-export", "text", outputDir, inputSwf);
  return runFfdec(ffdecCli, args);
}

function normalizePlainText(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function normalizeSwfTextFile(value) {
  const normalized = String(value || "").replace(/\r?\n/gu, "\r\n");
  return normalized.endsWith("\r\n") ? normalized : `${normalized}\r\n`;
}

function extractFontIdsFromFormattedText(content) {
  const fontIds = new Set();
  const pattern = /^font\s+(\d+)$/gimu;
  let match = pattern.exec(content);
  while (match) {
    fontIds.add(Number.parseInt(match[1], 10));
    match = pattern.exec(content);
  }
  return [...fontIds].filter(Number.isInteger).sort((left, right) => left - right);
}

function findFontFile() {
  return FONT_CANDIDATES.find((candidate) => fileExists(candidate)) || null;
}

function collectTextPatchEntries({ plainRoot, formattedRoot, translatedRoot }) {
  const entries = [];
  for (const sourceFile of listFilesRecursive(plainRoot, { includeExtensions: new Set([".txt"]) })) {
    const exportPath = path.relative(plainRoot, sourceFile).replace(/\\/gu, "/");
    const originalLabel = normalizePlainText(fs.readFileSync(sourceFile, "utf8"));
    const translatedLabel = LABEL_REPLACEMENTS.get(originalLabel);
    if (!translatedLabel) {
      continue;
    }
    const characterId = Number.parseInt(path.basename(exportPath, path.extname(exportPath)), 10);
    if (!Number.isInteger(characterId)) {
      continue;
    }
    const translatedFile = path.join(translatedRoot, exportPath);
    ensureDirSync(path.dirname(translatedFile));
    writeText(translatedFile, normalizeSwfTextFile(translatedLabel));

    const formattedFile = path.join(formattedRoot, exportPath);
    const fontIds = fileExists(formattedFile)
      ? extractFontIdsFromFormattedText(fs.readFileSync(formattedFile, "utf8"))
      : [];

    entries.push({
      exportPath,
      characterId,
      originalLabel,
      translatedLabel,
      translatedFile,
      fontIds
    });
  }
  return entries.sort((left, right) => left.characterId - right.characterId);
}

function collectSwfs(args) {
  const as2SwfRoot = path.join(paths.as2PackDir, "swf");
  if (args.swf) {
    const swfPath = path.resolve(paths.projectRoot, args.swf);
    return fileExists(swfPath) ? [swfPath] : [];
  }
  const sceneRoot = path.join(as2SwfRoot, "content", "www.poptropica.com", "scenes");
  const scanRoot = args.allIslands
    ? sceneRoot
    : args.islandDir
      ? path.join(sceneRoot, args.islandDir)
      : sceneRoot;
  if (!fileExists(scanRoot)) {
    return [];
  }
  return listFilesRecursive(scanRoot, { includeExtensions: new Set([".swf"]) })
    .sort((left, right) => rel(left).localeCompare(rel(right), "en"));
}

function replaceEntries({ ffdecCli, swfPath, entries, fontFile }) {
  let currentInput = swfPath;
  const tempOutputs = [];
  const changed = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const outputSwf = index === entries.length - 1
      ? swfPath
      : path.join(paths.tempDir, `as2-native-nav-text-replace-${process.pid}-${Date.now()}-${index}.swf`);
    const args = ["-replace", currentInput, outputSwf];
    if (fontFile && entry.fontIds.length > 0) {
      for (const fontId of entry.fontIds) {
        args.push(String(fontId), fontFile);
      }
    }
    args.push(String(entry.characterId), entry.translatedFile);
    const result = runFfdec(ffdecCli, args);
    if (!result.ok) {
      return {
        ok: false,
        changed,
        error: `${result.error || "FFDec replace failed"} [${rel(swfPath)} ${entry.exportPath}]`
      };
    }
    changed.push({
      exportPath: entry.exportPath,
      characterId: entry.characterId,
      from: entry.originalLabel,
      to: entry.translatedLabel,
      fontIds: entry.fontIds
    });
    if (outputSwf !== swfPath) {
      tempOutputs.push(outputSwf);
      currentInput = outputSwf;
    }
  }
  for (const tempFile of tempOutputs) {
    if (fileExists(tempFile)) {
      fs.rmSync(tempFile, { force: true });
    }
  }
  return { ok: true, changed };
}

function patchSwf({ ffdecCli, swfPath, workRoot, fontFile }) {
  const token = path.basename(swfPath, ".swf").replace(/[^a-z0-9_-]+/giu, "_");
  const plainRoot = path.join(workRoot, token, "plain");
  const formattedRoot = path.join(workRoot, token, "formatted");
  const translatedRoot = path.join(workRoot, token, "translated");
  const plainExport = exportSwfTexts({ ffdecCli, inputSwf: swfPath, outputDir: plainRoot });
  if (!plainExport.ok) {
    return {
      ok: false,
      swfPath: rel(swfPath),
      error: plainExport.error || "plain text export failed"
    };
  }
  const formattedExport = exportSwfTexts({ ffdecCli, inputSwf: swfPath, outputDir: formattedRoot, formatted: true });
  const entries = collectTextPatchEntries({
    plainRoot,
    formattedRoot: formattedExport.ok ? formattedRoot : "",
    translatedRoot
  });
  if (entries.length === 0) {
    return {
      ok: true,
      swfPath: rel(swfPath),
      changedCount: 0,
      changed: []
    };
  }
  const replaceResult = replaceEntries({ ffdecCli, swfPath, entries, fontFile });
  return {
    ok: replaceResult.ok,
    swfPath: rel(swfPath),
    changedCount: replaceResult.changed.length,
    changed: replaceResult.changed,
    error: replaceResult.error || null
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const ffdecCli = config.tools?.ffdecCli;
  const errors = [];
  if (!ffdecCli || !fileExists(ffdecCli)) {
    errors.push("FFDec CLI is not configured.");
  }
  const swfs = collectSwfs(args);
  if (swfs.length === 0) {
    errors.push("No AS2 SWFs matched the requested scope.");
  }
  const fontFile = findFontFile();
  const workRoot = path.join(paths.tempDir, "as2-native-navigation-text-field-patch");
  removeDirContents(workRoot);
  ensureDirSync(workRoot);

  const results = errors.length === 0
    ? swfs.map((swfPath) => patchSwf({ ffdecCli, swfPath, workRoot, fontFile }))
    : [];
  const failures = results.filter((result) => !result.ok);
  const changedResults = results.filter((result) => Number(result.changedCount || 0) > 0);
  const report = {
    ok: errors.length === 0 && failures.length === 0,
    generatedAt: new Date().toISOString(),
    policy: "Patch exact AS2 native text fields only; no OCR overlays and no static art edits.",
    scope: args.swf ? "single-swf" : args.allIslands ? "all-islands" : args.islandDir || "all-scene-swfs",
    fontFile,
    swfCount: swfs.length,
    errors,
    failureCount: failures.length,
    failures,
    changedSwfCount: changedResults.length,
    changedTextFieldCount: changedResults.reduce((sum, result) => sum + Number(result.changedCount || 0), 0),
    changed: changedResults,
    results
  };
  const reportPath = path.join(paths.qaDir, "as2", "native-navigation-labels", "text-field-patch.json");
  writeJson(reportPath, report);
  printJson({
    ok: report.ok,
    generatedAt: report.generatedAt,
    scope: report.scope,
    swfCount: report.swfCount,
    changedSwfCount: report.changedSwfCount,
    changedTextFieldCount: report.changedTextFieldCount,
    changed: report.changed,
    failures,
    reportPath
  });
  if (!report.ok) {
    process.exitCode = 1;
  }
}

main();
