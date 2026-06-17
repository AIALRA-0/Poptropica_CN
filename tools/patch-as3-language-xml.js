const fs = require("node:fs");
const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { openIndexDb } = require("./lib/db");
const { ensureDirSync, writeJson, writeText } = require("./lib/fs-utils");
const paths = require("./lib/paths");
const { applyFlashSafeTypography, applyStructuredReplacements } = require("./lib/pack");

function normalizeAssetPath(value) {
  return String(value || "").replace(/\\/gu, "/");
}

function parseList(value, fallback = []) {
  if (value === undefined || value === null || value === false) {
    return fallback;
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchesAnyPattern(assetPath, patterns) {
  if (!patterns.length) {
    return true;
  }
  const normalized = assetPath.toLowerCase();
  return patterns.some((pattern) => normalized.includes(String(pattern).toLowerCase()));
}

function groupRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.asset_id)) {
      grouped.set(row.asset_id, []);
    }
    grouped.get(row.asset_id).push(row);
  }
  return grouped;
}

function polishLanguageXml(content) {
  return String(content || "")
    .replace(/\. \. \./gu, "...")
    .replace(/([\u3400-\u9fff])\.\.\./gu, "$1...")
    .replace(/([\u3400-\u9fff])\.(?!\.)\s*/gu, "$1。")
    .replace(/([。！？、，])\s+/gu, "$1");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const assetPatterns = parseList(args["asset-pattern"], ["game/data/languages/"]);
  const outputRoot = paths.as3PackDir;
  const db = openIndexDb();
  const rows = db
    .getStringsForPack("as3")
    .filter((row) => {
      const assetPath = normalizeAssetPath(row.asset_path);
      return row.asset_type === "xml"
        && assetPath.includes("/game/data/languages/")
        && matchesAnyPattern(assetPath, assetPatterns);
    });
  const grouped = groupRows(rows);
  const report = {
    generatedAt: new Date().toISOString(),
    sourceGroup: "as3",
    assetPatterns,
    assetsConsidered: grouped.size,
    assetsWritten: 0,
    assetsUnchanged: 0,
    missingExtractedFiles: [],
    written: []
  };

  for (const assetRows of grouped.values()) {
    const sample = assetRows[0];
    const assetPath = normalizeAssetPath(sample.asset_path);
    if (!sample.extracted_path || !fs.existsSync(sample.extracted_path)) {
      report.missingExtractedFiles.push({
        assetId: sample.asset_id,
        assetPath,
        extractedPath: sample.extracted_path || null
      });
      continue;
    }

    const originalContent = fs.readFileSync(sample.extracted_path, "utf8");
    const translatedContent = polishLanguageXml(
      applyFlashSafeTypography(
        assetPath,
        applyStructuredReplacements(originalContent, sample.asset_type, assetPath, assetRows)
      )
    );

    if (translatedContent === originalContent) {
      report.assetsUnchanged += 1;
      continue;
    }

    const outputFile = path.join(outputRoot, "files", assetPath.replace(/\//gu, path.sep));
    ensureDirSync(path.dirname(outputFile));
    writeText(outputFile, translatedContent);
    report.assetsWritten += 1;
    report.written.push({
      assetId: sample.asset_id,
      assetPath,
      outputFile,
      rows: assetRows.length
    });
  }

  db.close();
  writeJson(path.join(paths.qaDir, "as3-language-xml-patch.json"), report);
  printJson(report);
}

main();
