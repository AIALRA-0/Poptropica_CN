const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { readJson } = require("./lib/fs-utils");
const paths = require("./lib/paths");
const { collectRuntimeReplacementsForSourceGroup } = require("./lib/pack");

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function toRepoPath(filePath) {
  return path.relative(paths.projectRoot, filePath).replace(/\\/gu, "/");
}

function gitLsFiles() {
  const result = spawnSync("git", ["ls-files"], {
    cwd: paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 32
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "git ls-files failed").trim());
  }
  return new Set(String(result.stdout || "").split(/\r?\n/u).filter(Boolean));
}

function manifestPathFor(sourceGroup) {
  return path.join(sourceGroup === "as2" ? paths.as2PackDir : paths.as3PackDir, "manifest.json");
}

function verifySourceGroup(sourceGroup, trackedFiles) {
  const replacements = collectRuntimeReplacementsForSourceGroup(sourceGroup);
  const manifest = readJson(manifestPathFor(sourceGroup), {});
  const manifestReplacementCount = Number(manifest?.runtimeZip?.replacementCount ?? -1);
  const replacementCountMatches = manifestReplacementCount === replacements.length;
  const untrackedRuntimeInputs = replacements
    .map((replacement) => ({
      type: replacement.type,
      entryName: replacement.entryName,
      repoPath: toRepoPath(replacement.sourceFilePath)
    }))
    .filter((replacement) => !trackedFiles.has(replacement.repoPath));

  return {
    sourceGroup,
    ok: replacementCountMatches && untrackedRuntimeInputs.length === 0,
    replacementCount: replacements.length,
    manifestReplacementCount,
    replacementCountMatches,
    untrackedRuntimeInputCount: untrackedRuntimeInputs.length,
    untrackedRuntimeInputs
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const requested = splitCsv(args.source || args.sources || "as2,as3");
  const sourceGroups = requested.length ? requested : ["as2", "as3"];
  for (const sourceGroup of sourceGroups) {
    if (!["as2", "as3"].includes(sourceGroup)) {
      throw new Error(`Unsupported source group: ${sourceGroup}`);
    }
  }

  const trackedFiles = gitLsFiles();
  const reports = sourceGroups.map((sourceGroup) => verifySourceGroup(sourceGroup, trackedFiles));
  const summary = {
    ok: reports.every((report) => report.ok),
    generatedAt: new Date().toISOString(),
    reports
  };
  printJson(summary);
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main();
