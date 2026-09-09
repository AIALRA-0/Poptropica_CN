const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig, updateConfig } = require("./lib/config");
const { fileExists, sanitizePathInput, writeJson } = require("./lib/fs-utils");
const { writeInventory } = require("./lib/inventory");
const { detectSteamPoptropica } = require("./lib/steam-detect");
const paths = require("./lib/paths");
const path = require("node:path");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const current = loadConfig();
  const explicitSteamRoot = sanitizePathInput(args["steam-root"]);
  let detection = null;
  let nextSteamRoot = null;
  let changed = false;
  let reason = "No steam root argument was supplied; config was left unchanged.";

  if (args.clear) {
    nextSteamRoot = null;
    changed = true;
    reason = "Cleared configured Steam/Poptropica root.";
  } else if (explicitSteamRoot) {
    nextSteamRoot = explicitSteamRoot;
    changed = true;
    reason = "Configured Steam/Poptropica root from --steam-root.";
  } else if (args.auto) {
    detection = detectSteamPoptropica({
      configuredSteamRoot: current.sources.steamRoot,
      maxScanEntries: args["max-scan-entries"] || args.maxScanEntries
    });
    const existingCandidates = detection.candidateInstallDirs.filter((candidate) => candidate.exists);
    const outputPath = args.output || args.report || path.join(paths.qaDir, "steam-poptropica-detect-latest.json");
    writeJson(outputPath, detection);
    if (existingCandidates.length === 1) {
      nextSteamRoot = existingCandidates[0].path;
      changed = true;
      reason = "Configured Steam/Poptropica root from the only detected install candidate.";
    } else {
      reason = existingCandidates.length === 0
        ? "Auto-detect found no existing Poptropica install candidate; config was left unchanged."
        : "Auto-detect found multiple Poptropica install candidates; config was left unchanged.";
    }
  }

  const updated = changed
    ? updateConfig({
        sources: {
          steamRoot: nextSteamRoot
        }
      })
    : current;
  const inventory = writeInventory(updated);

  printJson({
    changed,
    reason,
    steamRoot: updated.sources.steamRoot,
    steamRootExists: Boolean(updated.sources.steamRoot && fileExists(updated.sources.steamRoot)),
    detectionSummary: detection?.summary || null,
    inventorySummary: inventory.summary
  });
}

main();
