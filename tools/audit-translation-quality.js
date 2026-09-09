const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { parseArgs, printJson } = require("./lib/cli");
const { ensureDirSync, writeJson } = require("./lib/fs-utils");
const paths = require("./lib/paths");
const { containsCjk, normalizeWhitespace } = require("./lib/text-utils");
const { isProtectedTranslationRow } = require("./lib/translation-guards");

const SAMPLE_LIMIT = 30;
const CJK_RE = /[\u3400-\u9fff]/u;
const LATIN_WORD_RE = /\b[A-Za-z][A-Za-z'-]{2,}\b/gu;
const TAG_RE = /<\s*\/?\s*(br|font|p|b|i|u|a|img|span)\b[^>]*>/giu;
const INLINE_TAG_RE = /<[^>]+>/gu;

const ENGLISH_RESIDUE_ALLOWLIST = new Set([
  "poptropica",
  "poptropican",
  "poptropicans",
  "poptropicon",
  "mocktropica",
  "zeus",
  "hera",
  "hades",
  "poseidon",
  "athena",
  "apollo",
  "aphrodite",
  "hercules",
  "minotaur",
  "timmy",
  "corrina",
  "rolo",
  "omegon",
  "xavier",
  "mya",
  "oliver",
  "jorge",
  "pelican",
  "rock",
  "galactic",
  "dogs",
  "island",
  "islands",
  "menu",
  "map",
  "start",
  "ok",
  "npc",
  "as",
  "ui",
  "xp",
  "hp",
  "poptropiicore"
]);

function emptySummary() {
  return {
    reviewedRows: 0,
    structuralIssueRows: 0,
    reviewIssueRows: 0,
    missingCjkRows: 0,
    englishResidueRows: 0,
    tagMismatchRows: 0,
    cjkSpacingRows: 0,
    asciiPunctuationRows: 0,
    overlongRows: 0,
    repeatedPunctuationRows: 0,
    objectPlaceholderRows: 0
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

function textOnly(value) {
  return normalizeWhitespace(String(value || "").replace(INLINE_TAG_RE, " "));
}

function textForSpacingAudit(value) {
  return normalizeWhitespace(String(value || "").replace(INLINE_TAG_RE, " | "));
}

function textForPunctuationAudit(value) {
  return String(value || "").replace(/&#\d+;|&[a-z][a-z0-9]+;/giu, " ");
}

function removeAllowedInlineTokens(value) {
  return String(value || "")
    .replace(/https?:\/\/\S+|www\.\S+/giu, " ")
    .replace(/\[[^\]]+\]/gu, " ")
    .replace(/\{[^}]+\}/gu, " ")
    .replace(/\*[A-Za-z][A-Za-z0-9_-]*\*/gu, " ")
    .replace(/\b[a-z]+name\b/gu, " ")
    .replace(/\b[A-Z0-9_]{2,}\b/gu, " ");
}

function tagCounts(value) {
  const counts = {};
  const text = String(value || "");
  for (const match of text.matchAll(TAG_RE)) {
    const tag = String(match[1] || "").toLowerCase();
    counts[tag] = (counts[tag] || 0) + 1;
  }
  return counts;
}

function equalCounts(left, right) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left[key] || 0) !== (right[key] || 0)) {
      return false;
    }
  }
  return true;
}

function englishWords(value) {
  return [...removeAllowedInlineTokens(textOnly(value)).matchAll(LATIN_WORD_RE)]
    .map((match) => String(match[0] || "").toLowerCase())
    .filter((word) => !ENGLISH_RESIDUE_ALLOWLIST.has(word));
}

function hasMeaningfulEnglishSource(value) {
  return englishWords(value).length > 0;
}

function addSample(samples, key, row, details = {}) {
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
    translatedText: row.translated_text,
    ...details
  });
}

function addIslandSample(islandSamples, row) {
  const islandKey = `${row.source_group}:${row.island_id || "_shared"}`;
  if (!islandSamples[islandKey]) {
    islandSamples[islandKey] = [];
  }
  if (islandSamples[islandKey].length >= 8) {
    return;
  }
  const source = textOnly(row.source_text);
  if (source.length < 8) {
    return;
  }
  islandSamples[islandKey].push({
    sourceGroup: row.source_group,
    islandId: row.island_id || null,
    assetPath: row.asset_path,
    contextKey: row.context_key,
    sourceText: row.source_text,
    translatedText: row.translated_text
  });
}

function overlongRatio(row) {
  const source = textOnly(row.source_text);
  const translated = textOnly(row.translated_text);
  if (source.length < 8 || translated.length < 18) {
    return null;
  }
  const sourceWeighted = Math.max(1, source.length);
  return translated.length / sourceWeighted;
}

function inspectRow(row) {
  const source = String(row.source_text || "");
  const translated = String(row.translated_text || "");
  const sourcePlain = textOnly(source);
  const translatedPlain = textOnly(translated);
  const translatedSpacingPlain = textForSpacingAudit(translated);
  const issues = [];

  if (normalizeWhitespace(translated) === "[object Object]") {
    issues.push({ key: "objectPlaceholder", structural: true });
  }
  if (!equalCounts(tagCounts(source), tagCounts(translated))) {
    issues.push({ key: "tagMismatch", structural: true });
  }
  if (hasMeaningfulEnglishSource(sourcePlain) && !containsCjk(translatedPlain)) {
    issues.push({ key: "missingCjk", structural: true });
  }
  const residue = englishWords(translatedPlain);
  if (containsCjk(translatedPlain) && residue.length > 0) {
    issues.push({ key: "englishResidue", structural: false, residue: [...new Set(residue)].slice(0, 8) });
  }
  if (CJK_RE.test(translatedPlain) && /[\u3400-\u9fff]\s+[\u3400-\u9fff]/u.test(translatedSpacingPlain)) {
    issues.push({ key: "cjkSpacing", structural: false });
  }
  if (CJK_RE.test(translatedPlain) && /[\u3400-\u9fff][,.;:][\s<]|[,.;:][\u3400-\u9fff]/u.test(textForPunctuationAudit(translated))) {
    issues.push({ key: "asciiPunctuation", structural: false });
  }
  if (/[!?！？。.,，]{4,}/u.test(translatedPlain)) {
    issues.push({ key: "repeatedPunctuation", structural: false });
  }
  const ratio = overlongRatio(row);
  if (ratio !== null && ratio > 2.8 && translatedPlain.length > 36) {
    issues.push({ key: "overlong", structural: false, ratio: Number(ratio.toFixed(3)) });
  }

  return issues;
}

function bump(summary, issueKey, structural) {
  if (structural) {
    summary.structuralIssueRows += 1;
  } else {
    summary.reviewIssueRows += 1;
  }
  if (issueKey === "missingCjk") {
    summary.missingCjkRows += 1;
  } else if (issueKey === "englishResidue") {
    summary.englishResidueRows += 1;
  } else if (issueKey === "tagMismatch") {
    summary.tagMismatchRows += 1;
  } else if (issueKey === "cjkSpacing") {
    summary.cjkSpacingRows += 1;
  } else if (issueKey === "asciiPunctuation") {
    summary.asciiPunctuationRows += 1;
  } else if (issueKey === "overlong") {
    summary.overlongRows += 1;
  } else if (issueKey === "repeatedPunctuation") {
    summary.repeatedPunctuationRows += 1;
  } else if (issueKey === "objectPlaceholder") {
    summary.objectPlaceholderRows += 1;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = readRows();
  const summary = emptySummary();
  const byIsland = {};
  const samples = {};
  const islandSamples = {};

  for (const row of rows) {
    if (isProtectedTranslationRow(row)) {
      continue;
    }
    const translated = normalizeWhitespace(row.translated_text);
    if (!translated) {
      continue;
    }

    const islandKey = `${row.source_group}:${row.island_id || "_shared"}`;
    if (!byIsland[islandKey]) {
      byIsland[islandKey] = emptySummary();
    }
    summary.reviewedRows += 1;
    byIsland[islandKey].reviewedRows += 1;
    addIslandSample(islandSamples, row);

    const issues = inspectRow(row);
    const seen = new Set();
    for (const issue of issues) {
      if (seen.has(issue.key)) {
        continue;
      }
      seen.add(issue.key);
      bump(summary, issue.key, issue.structural);
      bump(byIsland[islandKey], issue.key, issue.structural);
      addSample(samples, issue.key, row, issue.residue ? { residue: issue.residue } : issue.ratio ? { ratio: issue.ratio } : {});
    }
  }

  const structuralOk = summary.structuralIssueRows === 0;
  const qualityReviewRequired = summary.reviewIssueRows > 0;
  const report = {
    ok: structuralOk,
    qualityReviewRequired,
    generatedAt: new Date().toISOString(),
    textIndexPath: paths.textIndexPath,
    summary,
    byIsland,
    samples,
    islandSamples,
    policy: {
      ok: "No structural translation defects were found: missing Chinese for visible English, tag mismatches, or [object Object] placeholders.",
      qualityReviewRequired: "Review issue rows are not proof of bad translation, but they are a required human-polish queue before claiming non-machine translation quality.",
      islandSamples: "Deterministic per-island samples for manual wording review; these samples are evidence prompts, not a substitute for full playthrough proofreading."
    }
  };

  const outputPath = args.output || args.report || path.join(paths.qaDir, "translation-quality-audit.json");
  ensureDirSync(path.dirname(outputPath));
  writeJson(outputPath, report);
  printJson({
    ok: report.ok,
    qualityReviewRequired,
    generatedAt: report.generatedAt,
    summary,
    reportPath: outputPath
  });
  if (args.strict && (!report.ok || report.qualityReviewRequired)) {
    process.exitCode = 1;
  }
}

main();
