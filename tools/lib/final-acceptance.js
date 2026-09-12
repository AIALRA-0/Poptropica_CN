const fs = require("node:fs");
const path = require("node:path");
const paths = require("./paths");

const FINAL_ACCEPTANCE_DIR = path.join(paths.qaDir, "final-acceptance");
const ACCEPTANCE_FIELDS = Object.freeze([
  "fullRouteVerified",
  "saveReloadVerified",
  "renderedChineseVerified",
  "windowStableVerified"
]);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function safeSegment(value) {
  return String(value || "")
    .replace(/[^a-z0-9_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 100);
}

function candidatePaths(source, canonicalKey) {
  const sourceSegment = safeSegment(source);
  const keySegment = safeSegment(canonicalKey);
  return [
    path.join(FINAL_ACCEPTANCE_DIR, sourceSegment, `${keySegment}.json`),
    path.join(FINAL_ACCEPTANCE_DIR, `${sourceSegment}-${keySegment}.json`),
    path.join(FINAL_ACCEPTANCE_DIR, `${keySegment}.json`)
  ];
}

function isUsableEvidenceRecord(record, { source, canonicalKey, revision }) {
  if (!record || record.canonicalKey !== canonicalKey) {
    return false;
  }
  if (record.sourceGroup && record.sourceGroup !== source) {
    return false;
  }
  if (record.projectRevision !== revision && record.sourceRevision !== revision) {
    return false;
  }
  return record.evidence && typeof record.evidence === "object";
}

function loadFinalAcceptanceEvidence({ source, canonicalKey, revision }) {
  for (const filePath of candidatePaths(source, canonicalKey)) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const record = readJson(filePath);
    if (!isUsableEvidenceRecord(record, { source, canonicalKey, revision })) {
      continue;
    }
    const evidence = {};
    for (const field of ACCEPTANCE_FIELDS) {
      evidence[field] = record.evidence[field] === true;
    }
    return {
      filePath,
      fileName: path.basename(filePath),
      record,
      evidence,
      reportPaths: record.reportPaths || record.artifacts || {}
    };
  }
  return null;
}

module.exports = {
  ACCEPTANCE_FIELDS,
  FINAL_ACCEPTANCE_DIR,
  candidatePaths,
  loadFinalAcceptanceEvidence
};
