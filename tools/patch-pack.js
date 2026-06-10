const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { openIndexDb } = require("./lib/db");
const { writeJson } = require("./lib/fs-utils");
const { buildPackForSourceGroup } = require("./lib/pack");
const paths = require("./lib/paths");
const { STYLE_VERSION, getProviderConfig } = require("./lib/translator");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const db = openIndexDb();
  const requestedSource = args.source ? String(args.source).toLowerCase() : "all";
  const islandIds = args.island
    ? String(args.island)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const assetPatterns = args["asset-pattern"]
    ? String(args["asset-pattern"])
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const manifests = {};
  if (requestedSource === "all" || requestedSource === "as2") {
    manifests.as2 = buildPackForSourceGroup({ db, config, sourceGroup: "as2", islandIds, assetPatterns });
  }
  if (requestedSource === "all" || requestedSource === "as3") {
    manifests.as3 = buildPackForSourceGroup({ db, config, sourceGroup: "as3", islandIds, assetPatterns });
  }
  const provider = getProviderConfig();
  writeJson(paths.packMetaPath, {
    generatedAt: new Date().toISOString(),
    provider: provider.provider,
    model: provider.model,
    styleVersion: STYLE_VERSION,
    islandIds,
    assetPatterns,
    typography: {
      preferredFont: "SimHei",
      fallbackChain: ["Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI Symbol", "sans-serif"],
      fontWeight: 700
    },
    manifests
  });
  db.close();
  printJson(manifests);
}

main();
