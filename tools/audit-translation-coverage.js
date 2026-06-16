const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { parseArgs, printJson } = require("./lib/cli");
const { ensureDirSync, writeJson } = require("./lib/fs-utils");
const paths = require("./lib/paths");
const { containsCjk, normalizeWhitespace } = require("./lib/text-utils");
const { isProtectedTranslationRow } = require("./lib/translation-guards");

const SAMPLE_LIMIT = 25;

function emptySummary() {
  return {
    totalRows: 0,
    protectedRows: 0,
    translatableRows: 0,
    translatedTranslatableRows: 0,
    missingTranslatableRows: 0,
    emptyTranslationRows: 0,
    invalidObjectRows: 0,
    cjkTranslatableRows: 0,
    unchangedTranslatableRows: 0,
    protectedMissingRows: 0,
    protectedTranslatedRows: 0
  };
}

function addSample(samples, key, row) {
  if (!samples[key]) {
    samples[key] = [];
  }
  if (samples[key].length >= SAMPLE_LIMIT) {
    return;
  }
  samples[key].push({
    sourceGroup: row.source_group,
    islandId: row.island_id || null,
    assetPath: row.asset_path,
    contextKey: row.context_key,
    sourceText: row.source_text,
    translatedText: row.translated_text || null
  });
}

function hasInvalidObjectTranslation(row) {
  return normalizeWhitespace(row.translated_text) === "[object Object]";
}

function hasUsableTranslation(row) {
  return typeof row.translated_text === "string" &&
    normalizeWhitespace(row.translated_text) !== "" &&
    !hasInvalidObjectTranslation(row);
}

function updateSummary(summary, row, samples) {
  summary.totalRows += 1;
  const protectedRow = isProtectedTranslationRow(row);
  const translated = hasUsableTranslation(row);

  if (protectedRow) {
    summary.protectedRows += 1;
    if (translated) {
      summary.protectedTranslatedRows += 1;
    } else {
      summary.protectedMissingRows += 1;
      addSample(samples, "protectedMissing", row);
    }
    return;
  }

  summary.translatableRows += 1;
  if (!translated) {
    summary.missingTranslatableRows += 1;
    addSample(samples, "missingTranslatable", row);
  } else {
    summary.translatedTranslatableRows += 1;
  }

  if (typeof row.translated_text === "string" && normalizeWhitespace(row.translated_text) === "") {
    summary.emptyTranslationRows += 1;
    addSample(samples, "emptyTranslations", row);
  }
  if (hasInvalidObjectTranslation(row)) {
    summary.invalidObjectRows += 1;
    addSample(samples, "invalidObjectTranslations", row);
  }
  if (translated && containsCjk(row.translated_text)) {
    summary.cjkTranslatableRows += 1;
  }
  if (translated && normalizeWhitespace(row.translated_text).toLowerCase() === normalizeWhitespace(row.source_text).toLowerCase()) {
    summary.unchangedTranslatableRows += 1;
    addSample(samples, "unchangedTranslatable", row);
  }
}

function finalizeSummary(summary) {
  return {
    ...summary,
    translatableCoveragePct: summary.translatableRows > 0
      ? Number(((summary.translatedTranslatableRows / summary.translatableRows) * 100).toFixed(6))
      : 100,
    cjkTranslatablePct: summary.translatableRows > 0
      ? Number(((summary.cjkTranslatableRows / summary.translatableRows) * 100).toFixed(6))
      : 100
  };
}

function readRows() {
  const db = new DatabaseSync(paths.textIndexPath, { readOnly: true });
  try {
    return db.prepare(`
      SELECT
        s.string_key,
        s.asset_id,
        s.source_group,
        s.island_id,
        s.generic_key,
        s.source_text,
        s.context_key,
        s.context_json,
        s.state,
        a.asset_path,
        a.asset_type,
        COALESCE(et.translated_text, t.translated_text) AS translated_text
      FROM strings s
      JOIN assets a ON a.asset_id = s.asset_id
      LEFT JOIN exact_translations et ON et.string_key = s.string_key
      LEFT JOIN translations t ON t.generic_key = s.generic_key
      ORDER BY s.source_group, COALESCE(s.island_id, ''), a.asset_path, s.context_key
    `).all();
  } finally {
    db.close();
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = readRows();
  const globalSummary = emptySummary();
  const bySourceGroup = {};
  const samples = {};

  for (const row of rows) {
    if (!bySourceGroup[row.source_group]) {
      bySourceGroup[row.source_group] = emptySummary();
    }
    updateSummary(globalSummary, row, samples);
    updateSummary(bySourceGroup[row.source_group], row, {});
  }

  const summary = finalizeSummary(globalSummary);
  const sourceGroups = Object.fromEntries(
    Object.entries(bySourceGroup).map(([sourceGroup, item]) => [sourceGroup, finalizeSummary(item)])
  );
  const ok = summary.missingTranslatableRows === 0 &&
    summary.emptyTranslationRows === 0 &&
    summary.invalidObjectRows === 0;
  const qualityReviewRequired = summary.unchangedTranslatableRows > 0;

  const report = {
    ok,
    qualityReviewRequired,
    generatedAt: new Date().toISOString(),
    textIndexPath: paths.textIndexPath,
    summary,
    sourceGroups,
    samples,
    policy: {
      protectedRows: "Runtime identifiers, paths, class names, scene links, skin part IDs, and framework config metadata are intentionally excluded from translatable coverage.",
      ok: "All non-protected extracted text rows must have a non-empty translation and no [object Object] placeholder.",
      qualityReviewRequired: "Rows where the normalized translation still equals the source text are reported as a translation-quality review queue, not as missing coverage."
    }
  };

  const outputPath = args.output || args.report || path.join(paths.qaDir, "translation-coverage-audit.json");
  ensureDirSync(path.dirname(outputPath));
  writeJson(outputPath, report);
  printJson({
    ok: report.ok,
    qualityReviewRequired: report.qualityReviewRequired,
    generatedAt: report.generatedAt,
    summary: report.summary,
    reportPath: outputPath
  });
  if (args.strict && !report.ok) {
    process.exitCode = 1;
  }
}

main();
