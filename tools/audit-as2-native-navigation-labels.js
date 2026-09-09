const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, listFilesRecursive, removeDirContents, writeJson } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const DEFAULT_ISLAND_DIR = "islandTime";
const TARGET_LABELS = [
  "GO LEFT",
  "GO RIGHT",
  "GO UP",
  "GO DOWN",
  "ENTER",
  "EXIT",
  "TRAVEL",
  "COMMON ROOM"
];

const TRANSLATED_LABELS = [
  "向左",
  "向右",
  "向上",
  "向下",
  "进入",
  "退出",
  "离开",
  "旅行",
  "前往",
  "公共房间",
  "公共休息室"
];

function parseArgs(argv) {
  const args = {
    islandDir: DEFAULT_ISLAND_DIR,
    scopeName: "time-tangled",
    allIslands: false
  };
  for (const rawArg of argv) {
    const arg = String(rawArg || "");
    if (arg === "--all-islands") {
      args.allIslands = true;
    } else if (arg.startsWith("--island-dir=")) {
      args.islandDir = arg.slice("--island-dir=".length);
      args.scopeName = args.islandDir;
    } else if (arg.startsWith("--scope-name=")) {
      args.scopeName = arg.slice("--scope-name=".length);
    }
  }
  return args;
}

function rel(filePath) {
  return path.relative(paths.projectRoot, filePath).replace(/\\/gu, "/");
}

function runFfdecExport({ ffdecCli, type, inputSwf, outputDir }) {
  removeDirContents(outputDir);
  ensureDirSync(outputDir);
  const result = spawnSync(ffdecCli, ["-cli", "-export", type, outputDir, inputSwf], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 32
  });
  return {
    ok: result.status === 0,
    status: result.status,
    error: result.status === 0 ? null : (result.stderr || result.stdout || `FFDec ${type} export failed`).trim()
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function collectScriptOccurrences(rootDir, labels) {
  const occurrences = [];
  const labelPattern = new RegExp(`\\blabelText\\s*=\\s*["'](${labels.map(escapeRegExp).join("|")})["']`, "gu");
  for (const filePath of listFilesRecursive(rootDir, { includeExtensions: new Set([".as"]) })) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const match of content.matchAll(labelPattern)) {
      const before = content.slice(0, match.index);
      const line = before.split(/\r?\n/u).length;
      occurrences.push({
        file: rel(filePath),
        line,
        label: match[1],
        context: content.split(/\r?\n/u)[line - 1]?.trim() || ""
      });
    }
  }
  occurrences.sort((left, right) => left.label.localeCompare(right.label, "en") || left.file.localeCompare(right.file, "en") || left.line - right.line);
  return occurrences;
}

function normalizeTextValue(value) {
  return String(value || "")
    .replace(/\r/gu, "\n")
    .replace(/\s+/gu, " ")
    .trim();
}

function collectTextOccurrences(rootDir, labels) {
  const labelSet = new Set(labels);
  const occurrences = [];
  for (const filePath of listFilesRecursive(rootDir, { includeExtensions: new Set([".txt"]) })) {
    const content = fs.readFileSync(filePath, "utf8");
    const normalized = normalizeTextValue(content);
    if (labelSet.has(normalized)) {
      occurrences.push({
        file: rel(filePath),
        label: normalized
      });
    }
  }
  occurrences.sort((left, right) => left.label.localeCompare(right.label, "en") || left.file.localeCompare(right.file, "en"));
  return occurrences;
}

function collectSwfs({ allIslands, islandDir }) {
  const sceneRoot = path.join(paths.as2PackDir, "swf", "content", "www.poptropica.com", "scenes");
  if (!fileExists(sceneRoot)) {
    return [];
  }
  const scanRoot = allIslands ? sceneRoot : path.join(sceneRoot, islandDir);
  if (!fileExists(scanRoot)) {
    return [];
  }
  return listFilesRecursive(scanRoot, { includeExtensions: new Set([".swf"]) })
    .sort((left, right) => rel(left).localeCompare(rel(right), "en"));
}

function countByLabel(rows) {
  const counts = {};
  for (const row of rows) {
    counts[row.label] = (counts[row.label] || 0) + 1;
  }
  return counts;
}

function auditSwf({ ffdecCli, swfPath, workRoot }) {
  const token = path.basename(swfPath, ".swf").replace(/[^a-z0-9_-]+/giu, "_");
  const exportRoot = path.join(workRoot, token);
  const scriptRoot = path.join(exportRoot, "scripts");
  const textRoot = path.join(exportRoot, "texts");
  const scriptExport = runFfdecExport({ ffdecCli, type: "script", inputSwf: swfPath, outputDir: scriptRoot });
  const textExport = runFfdecExport({ ffdecCli, type: "text", inputSwf: swfPath, outputDir: textRoot });

  const scriptEnglish = scriptExport.ok ? collectScriptOccurrences(scriptRoot, TARGET_LABELS) : [];
  const scriptChinese = scriptExport.ok ? collectScriptOccurrences(scriptRoot, TRANSLATED_LABELS) : [];
  const textEnglish = textExport.ok ? collectTextOccurrences(textRoot, TARGET_LABELS) : [];
  const textChinese = textExport.ok ? collectTextOccurrences(textRoot, TRANSLATED_LABELS) : [];

  return {
    scene: path.basename(swfPath),
    swfPath: rel(swfPath),
    scriptExport,
    textExport,
    scriptEnglishCount: scriptEnglish.length,
    scriptChineseCount: scriptChinese.length,
    textEnglishCount: textEnglish.length,
    textChineseCount: textChinese.length,
    scriptEnglishByLabel: countByLabel(scriptEnglish),
    scriptChineseByLabel: countByLabel(scriptChinese),
    textEnglishByLabel: countByLabel(textEnglish),
    textChineseByLabel: countByLabel(textChinese),
    scriptEnglish,
    scriptChinese,
    textEnglish,
    textChinese
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
    errors.push(`No AS2 scene SWFs found for ${args.allIslands ? "all islands" : args.islandDir}.`);
  }

  const workRoot = path.join(paths.tempDir, "as2-native-navigation-label-audit", args.allIslands ? "all-islands" : args.islandDir);
  removeDirContents(workRoot);
  ensureDirSync(workRoot);

  const sceneResults = errors.length === 0
    ? swfs.map((swfPath) => auditSwf({ ffdecCli, swfPath, workRoot }))
    : [];
  const failedExports = sceneResults.filter((scene) => !scene.scriptExport.ok || !scene.textExport.ok);
  const blockerScenes = sceneResults.filter((scene) => scene.scriptEnglishCount > 0 || scene.textEnglishCount > 0);
  const proofScenes = sceneResults.filter((scene) => scene.scriptChineseCount > 0 || scene.textChineseCount > 0);

  const report = {
    ok: errors.length === 0 && failedExports.length === 0 && blockerScenes.length === 0,
    generatedAt: new Date().toISOString(),
    policy: "AS2 native navigation labels only: script labelText and exact exported text records; static art is not overlaid.",
    scope: args.allIslands ? "all-islands" : args.scopeName,
    islandDir: args.allIslands ? null : args.islandDir,
    ffdecCli,
    swfCount: swfs.length,
    targetLabels: TARGET_LABELS,
    translatedLabels: TRANSLATED_LABELS,
    errors,
    failedExports: failedExports.map((scene) => ({
      scene: scene.scene,
      swfPath: scene.swfPath,
      scriptExport: scene.scriptExport.ok ? "ok" : scene.scriptExport.error,
      textExport: scene.textExport.ok ? "ok" : scene.textExport.error
    })),
    blockerCount: blockerScenes.length,
    blockerScenes: blockerScenes.map((scene) => ({
      scene: scene.scene,
      swfPath: scene.swfPath,
      scriptEnglishByLabel: scene.scriptEnglishByLabel,
      textEnglishByLabel: scene.textEnglishByLabel,
      scriptEnglish: scene.scriptEnglish,
      textEnglish: scene.textEnglish
    })),
    proofCount: proofScenes.length,
    proofScenes: proofScenes.map((scene) => ({
      scene: scene.scene,
      swfPath: scene.swfPath,
      scriptChineseByLabel: scene.scriptChineseByLabel,
      textChineseByLabel: scene.textChineseByLabel
    })),
    scenes: sceneResults
  };

  const reportPath = path.join(paths.qaDir, "as2", "native-navigation-labels", `${args.allIslands ? "all-islands" : args.scopeName}.json`);
  writeJson(reportPath, report);
  printJson({
    ok: report.ok,
    generatedAt: report.generatedAt,
    scope: report.scope,
    swfCount: report.swfCount,
    blockerCount: report.blockerCount,
    blockerScenes: report.blockerScenes,
    proofCount: report.proofCount,
    failedExports: report.failedExports,
    reportPath
  });
}

main();
