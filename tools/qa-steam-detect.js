const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { sanitizePathInput, writeJson } = require("./lib/fs-utils");
const { detectSteamPoptropica } = require("./lib/steam-detect");
const paths = require("./lib/paths");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const configuredSteamRoot = sanitizePathInput(args["steam-root"]) || config.sources.steamRoot;
  const report = detectSteamPoptropica({
    configuredSteamRoot,
    includeCommonPaths: args["configured-only"] !== true,
    maxScanEntries: args["max-scan-entries"] || args.maxScanEntries
  });
  const outputPath = args.output || args.report || path.join(paths.qaDir, "steam-poptropica-detect-latest.json");
  writeJson(outputPath, report);
  printJson({
    ok: report.ok,
    generatedAt: report.generatedAt,
    summary: report.summary,
    reportPath: outputPath,
    suggestions: report.suggestions
  });
}

main();
