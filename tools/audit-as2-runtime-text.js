const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const {
  ensureDirSync,
  fileExists,
  hashString,
  listFilesRecursive,
  readJson,
  writeJson
} = require("./lib/fs-utils");
const { looksTranslatable, normalizeSourceText } = require("./lib/text-utils");

const SCRIPT_DIALOGUE_PATTERNS = [
  /\btalkyText\s*=/iu,
  /\bmanualSay\s*\(/iu,
  /\bshowSay\s*\(/iu,
  /\bq\d+\s*=/iu,
  /\ba\d+\s*=/iu,
  /\bansw\d+\s*=/iu
];

const NAVIGATION_TEXT_PATTERN = /^(?:enter|exit|go\s+(?:left|right|up|down)|(?:go\s+)?(?:left|right|up|down)|travel|map|menu|home|save|saving game)$/iu;

function listArchiveEntries(archivePath, tarBin) {
  const result = spawnSync(tarBin, ["-tf", archivePath], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0) {
    throw new Error(`Failed to list archive ${archivePath}: ${result.stderr || result.stdout}`);
  }
  return result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function splitPatterns(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/\\/gu, "/").toLowerCase())
    .filter(Boolean);
}

function matchesAnyPattern(assetPath, patterns) {
  if (!patterns.length) {
    return true;
  }
  const normalized = String(assetPath || "").replace(/\\/gu, "/").toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function unescapeScriptLiteral(text) {
  return String(text || "")
    .replace(/\\\\/gu, "\\")
    .replace(/\\'/gu, "'")
    .replace(/\\"/gu, '"')
    .replace(/\\r/gu, "\r")
    .replace(/\\n/gu, "\n")
    .replace(/\\t/gu, "\t");
}

function extractScriptLiterals(line) {
  const matches = [];
  for (const match of line.matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/gu)) {
    const rawLiteral = match[1] !== undefined ? match[1] : match[2];
    const sourceText = normalizeSourceText(unescapeScriptLiteral(rawLiteral));
    if (looksTranslatable(sourceText)) {
      matches.push(sourceText);
    }
  }
  return matches;
}

function scanScriptRoot(scriptRoot, sampleLimit) {
  const candidates = [];
  if (!fileExists(scriptRoot)) {
    return candidates;
  }

  for (const filePath of listFilesRecursive(scriptRoot, { includeExtensions: new Set([".as"]) })) {
    const rel = path.relative(scriptRoot, filePath).replace(/\\/gu, "/");
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!SCRIPT_DIALOGUE_PATTERNS.some((pattern) => pattern.test(line))) {
        continue;
      }
      for (const sourceText of extractScriptLiterals(line)) {
        candidates.push({
          kind: "script-dialogue",
          exportPath: rel,
          lineNumber: index + 1,
          sourceText,
          line: line.trim()
        });
        if (candidates.length >= sampleLimit) {
          return candidates;
        }
      }
    }
  }
  return candidates;
}

function countScriptCandidates(scriptRoot) {
  let count = 0;
  const uniqueTexts = new Set();
  if (!fileExists(scriptRoot)) {
    return { count, uniqueTextCount: 0 };
  }
  for (const filePath of listFilesRecursive(scriptRoot, { includeExtensions: new Set([".as"]) })) {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
    for (const line of lines) {
      if (!SCRIPT_DIALOGUE_PATTERNS.some((pattern) => pattern.test(line))) {
        continue;
      }
      for (const sourceText of extractScriptLiterals(line)) {
        count += 1;
        uniqueTexts.add(sourceText);
      }
    }
  }
  return { count, uniqueTextCount: uniqueTexts.size };
}

function scanTextRootForNavigation(textRoot, sampleLimit) {
  const candidates = [];
  let total = 0;
  if (!fileExists(textRoot)) {
    return { total, samples: candidates };
  }
  for (const filePath of listFilesRecursive(textRoot, { includeExtensions: new Set([".txt"]) })) {
    const rel = path.relative(textRoot, filePath).replace(/\\/gu, "/");
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      const sourceText = normalizeSourceText(line);
      if (!NAVIGATION_TEXT_PATTERN.test(sourceText)) {
        return;
      }
      total += 1;
      if (candidates.length < sampleLimit) {
        candidates.push({
          kind: "swf-text-navigation-candidate",
          exportPath: rel,
          lineNumber: index + 1,
          sourceText
        });
      }
    });
  }
  return { total, samples: candidates };
}

function readIndexedScriptCoverage(textIndexPath) {
  if (!fileExists(textIndexPath)) {
    return new Map();
  }
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(textIndexPath, { readOnly: true });
    const rows = db.prepare(`
      SELECT asset_id, COUNT(*) AS rowCount
      FROM strings
      WHERE source_group = 'as2'
        AND json_extract(context_json, '$.kind') = 'swf-script'
      GROUP BY asset_id
    `).all();
    db.close();
    return new Map(rows.map((row) => [row.asset_id, Number(row.rowCount || 0)]));
  } catch (error) {
    return new Map();
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const archivePath = path.resolve(config.sources.as2Gamezip || "");
  if (!archivePath || !fileExists(archivePath)) {
    throw new Error("AS2 source zip is not configured.");
  }

  const archiveHash = hashString(archivePath);
  const extractedRoot = path.join(paths.extractedDir, "as2", archiveHash);
  const scriptRoot = path.join(extractedRoot, "__ffdec_scripts__");
  const textRoot = path.join(extractedRoot, "__ffdec__");
  const assetPatterns = splitPatterns(args["asset-pattern"]);
  const sampleLimit = Math.max(1, Number(args["sample-limit"] || 8));
  const outputPath = path.resolve(String(args.output || path.join(paths.qaDir, "as2", "as2-runtime-text-audit.json")));

  const indexedScriptCoverage = readIndexedScriptCoverage(paths.textIndexPath);
  const entries = listArchiveEntries(archivePath, config.tools.tarBin)
    .filter((entry) => /\.swf$/iu.test(entry))
    .filter((entry) => matchesAnyPattern(entry, assetPatterns))
    .map((entry) => {
      const assetId = hashString(`as2::${archivePath}::${entry}`);
      const assetScriptRoot = path.join(scriptRoot, assetId);
      const assetTextRoot = path.join(textRoot, assetId);
      const packOverridePath = path.join(paths.as2PackDir, "swf", entry);
      const scriptCounts = countScriptCandidates(assetScriptRoot);
      const dialogueSamples = scanScriptRoot(assetScriptRoot, sampleLimit);
      const navigation = scanTextRootForNavigation(assetTextRoot, sampleLimit);
      return {
        assetId,
        assetPath: entry,
        scriptExportPresent: fileExists(assetScriptRoot),
        textExportPresent: fileExists(assetTextRoot),
        packSwfOverridePresent: fileExists(packOverridePath),
        packSwfOverridePath: fileExists(packOverridePath) ? packOverridePath : null,
        indexedScriptRows: indexedScriptCoverage.get(assetId) || 0,
        scriptDialogueCandidateCount: scriptCounts.count,
        uniqueScriptDialogueCandidateCount: scriptCounts.uniqueTextCount,
        navigationTextCandidateCount: navigation.total,
        dialogueSamples,
        navigationSamples: navigation.samples
      };
    });

  const withScriptDialogue = entries.filter((entry) => entry.scriptDialogueCandidateCount > 0);
  const withNavigationText = entries.filter((entry) => entry.navigationTextCandidateCount > 0);
  const withUnindexedScriptDialogue = withScriptDialogue.filter((entry) => entry.indexedScriptRows === 0);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceGroup: "as2",
    archivePath,
    assetPatterns,
    extractedRoot,
    totals: {
      swfAssetsScanned: entries.length,
      scriptExportsPresent: entries.filter((entry) => entry.scriptExportPresent).length,
      textExportsPresent: entries.filter((entry) => entry.textExportPresent).length,
      assetsWithScriptDialogue: withScriptDialogue.length,
      assetsWithNavigationTextCandidates: withNavigationText.length,
      assetsWithUnindexedScriptDialogue: withUnindexedScriptDialogue.length,
      assetsWithPackSwfOverrides: entries.filter((entry) => entry.packSwfOverridePresent).length,
      scriptDialogueCandidates: entries.reduce((sum, entry) => sum + entry.scriptDialogueCandidateCount, 0),
      uniqueScriptDialogueCandidates: entries.reduce((sum, entry) => sum + entry.uniqueScriptDialogueCandidateCount, 0),
      navigationTextCandidates: entries.reduce((sum, entry) => sum + entry.navigationTextCandidateCount, 0)
    },
    topScriptDialogueAssets: [...withScriptDialogue]
      .sort((a, b) => b.scriptDialogueCandidateCount - a.scriptDialogueCandidateCount)
      .slice(0, 40),
    unindexedScriptDialogueAssets: [...withUnindexedScriptDialogue]
      .sort((a, b) => b.scriptDialogueCandidateCount - a.scriptDialogueCandidateCount)
      .slice(0, 80),
    navigationTextAssets: [...withNavigationText]
      .sort((a, b) => b.navigationTextCandidateCount - a.navigationTextCandidateCount)
      .slice(0, 80)
  };

  ensureDirSync(path.dirname(outputPath));
  writeJson(outputPath, report);
  printJson({
    ok: true,
    outputPath,
    totals: report.totals,
    topScriptDialogueAssets: report.topScriptDialogueAssets.slice(0, 8).map((entry) => ({
      assetPath: entry.assetPath,
      scriptDialogueCandidateCount: entry.scriptDialogueCandidateCount,
      indexedScriptRows: entry.indexedScriptRows,
      packSwfOverridePresent: entry.packSwfOverridePresent
    })),
    topNavigationTextAssets: report.navigationTextAssets.slice(0, 8).map((entry) => ({
      assetPath: entry.assetPath,
      navigationTextCandidateCount: entry.navigationTextCandidateCount
    }))
  });
}

main();
