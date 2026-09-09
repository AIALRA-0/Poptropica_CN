const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { parseArgs, printJson } = require("./lib/cli");
const { ensureDirSync, writeJson, writeText } = require("./lib/fs-utils");
const { applyFlashSafeTypography, applyStructuredReplacements } = require("./lib/pack");
const paths = require("./lib/paths");

function sourceGroupsFromArg(value) {
  const raw = String(value || "all").toLowerCase();
  if (raw === "all") {
    return ["as2", "as3"];
  }
  if (raw === "as2" || raw === "as3") {
    return [raw];
  }
  throw new Error(`Unsupported source: ${value}`);
}

function matchesAssetPatterns(assetPath, assetPatterns) {
  if (!assetPatterns.length) {
    return true;
  }
  const normalized = String(assetPath || "").replace(/\\/gu, "/").toLowerCase();
  return assetPatterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

function packFilesRoot(sourceGroup) {
  return sourceGroup === "as2"
    ? path.join(paths.as2PackDir, "files")
    : path.join(paths.as3PackDir, "files");
}

function queryComplexXmlAssets(db, sourceGroup) {
  return db.prepare(`
    SELECT DISTINCT a.asset_id, a.source_group, a.island_id, a.asset_path, a.asset_type, a.extracted_path
    FROM assets a
    JOIN strings s ON s.asset_id = a.asset_id
    LEFT JOIN exact_translations et ON et.string_key = s.string_key
    LEFT JOIN translations t ON t.generic_key = s.generic_key
    WHERE a.source_group = ?
      AND a.asset_type = 'xml'
      AND s.context_key LIKE '%/#text'
      AND COALESCE(et.translated_text, t.translated_text) IS NOT NULL
    ORDER BY a.asset_path
  `).all(sourceGroup);
}

function queryAssetRows(db, assetId) {
  return db.prepare(`
    SELECT s.*, a.asset_type, a.asset_path, a.container_path, a.extracted_path, a.metadata_json,
           COALESCE(et.translated_text, t.translated_text) AS translated_text
    FROM strings s
    JOIN assets a ON a.asset_id = s.asset_id
    LEFT JOIN exact_translations et ON et.string_key = s.string_key
    LEFT JOIN translations t ON t.generic_key = s.generic_key
    WHERE s.asset_id = ?
      AND COALESCE(et.translated_text, t.translated_text) IS NOT NULL
    ORDER BY s.context_key
  `).all(assetId);
}

function hasChineseTextNode(content) {
  return /<[^!?/][^>]*>[^<]*[\u4e00-\u9fff][^<]*<\/[^>]+>/u.test(String(content || ""));
}

function countResidualLatinSayText(content) {
  const matches = String(content || "").match(/<SayText\b[^>]*>\s*[A-Za-z][\s\S]*?<\/SayText>/gu);
  return matches ? matches.length : 0;
}

function patchSourceGroup({ db, sourceGroup, assetPatterns, dryRun }) {
  const assets = queryComplexXmlAssets(db, sourceGroup)
    .filter((asset) => matchesAssetPatterns(asset.asset_path, assetPatterns));
  const root = packFilesRoot(sourceGroup);
  const patchedAssets = [];
  const unchangedAssets = [];
  const skippedAssets = [];

  for (const asset of assets) {
    if (!asset.extracted_path || !fs.existsSync(asset.extracted_path)) {
      skippedAssets.push({
        assetPath: asset.asset_path,
        reason: "missing_extracted_path"
      });
      continue;
    }

    const rows = queryAssetRows(db, asset.asset_id);
    const originalContent = fs.readFileSync(asset.extracted_path, "utf8");
    const translatedContent = applyFlashSafeTypography(
      asset.asset_path,
      applyStructuredReplacements(originalContent, asset.asset_type, asset.asset_path, rows)
    );

    if (translatedContent === originalContent) {
      unchangedAssets.push({
        assetPath: asset.asset_path,
        rows: rows.length
      });
      continue;
    }

    const outputPath = path.join(root, asset.asset_path.replace(/\//gu, path.sep));
    if (!dryRun) {
      ensureDirSync(path.dirname(outputPath));
      writeText(outputPath, translatedContent);
    }
    patchedAssets.push({
      assetId: asset.asset_id,
      islandId: asset.island_id || null,
      assetPath: asset.asset_path,
      outputPath,
      rows: rows.length,
      residualLatinSayText: countResidualLatinSayText(translatedContent),
      hasChineseTextNode: hasChineseTextNode(translatedContent)
    });
  }

  return {
    sourceGroup,
    candidateAssets: assets.length,
    patchedCount: patchedAssets.length,
    unchangedCount: unchangedAssets.length,
    skippedCount: skippedAssets.length,
    patchedAssets,
    unchangedAssets,
    skippedAssets
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceGroups = sourceGroupsFromArg(args.source);
  const assetPatterns = args["asset-pattern"]
    ? String(args["asset-pattern"]).split(",").map((item) => item.trim()).filter(Boolean)
    : [];
  const dryRun = Boolean(args["dry-run"] || args.dryRun);
  const db = new DatabaseSync(paths.textIndexPath, { readOnly: true });
  const results = sourceGroups.map((sourceGroup) =>
    patchSourceGroup({ db, sourceGroup, assetPatterns, dryRun })
  );
  db.close();

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    assetPatterns,
    results,
    summary: {
      candidateAssets: results.reduce((sum, item) => sum + item.candidateAssets, 0),
      patchedCount: results.reduce((sum, item) => sum + item.patchedCount, 0),
      unchangedCount: results.reduce((sum, item) => sum + item.unchangedCount, 0),
      skippedCount: results.reduce((sum, item) => sum + item.skippedCount, 0)
    }
  };

  const reportPath = args.output || path.join(paths.qaDir, "runtime-xml-text-node-patch.json");
  if (!dryRun) {
    ensureDirSync(path.dirname(reportPath));
    writeJson(reportPath, report);
  }
  if (args.verbose) {
    printJson({
      ...report,
      reportPath: dryRun ? null : reportPath
    });
    return;
  }
  printJson({
    generatedAt: report.generatedAt,
    dryRun,
    assetPatterns,
    summary: report.summary,
    results: results.map((result) => ({
      sourceGroup: result.sourceGroup,
      candidateAssets: result.candidateAssets,
      patchedCount: result.patchedCount,
      unchangedCount: result.unchangedCount,
      skippedCount: result.skippedCount
    })),
    reportPath: dryRun ? null : reportPath
  });
}

main();
