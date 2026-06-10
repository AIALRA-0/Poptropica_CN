const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { openIndexDb } = require("./lib/db");
const { scanArchiveSource, scanDirectorySource } = require("./lib/extractors");
const paths = require("./lib/paths");
const { ensureDirSync } = require("./lib/fs-utils");

function persistAssets(db, assets) {
  let stringCount = 0;
  for (const asset of assets) {
    db.upsertAsset(asset);
    db.replaceStringsForAsset(asset.assetId, asset.stringRows || []);
    stringCount += (asset.stringRows || []).length;
  }
  return stringCount;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const db = openIndexDb();
  const requestedSource = args.source ? String(args.source).toLowerCase() : "all";
  const phase = String(args.phase || (args["no-swf"] ? "text-only" : "priority-swf")).toLowerCase();
  const includeSwf = phase !== "text-only";
  const swfProfile = phase === "full-swf" ? "full" : "priority";
  const assetPatterns = args["asset-pattern"]
    ? String(args["asset-pattern"])
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  ensureDirSync(paths.extractedDir);
  ensureDirSync(paths.tempDir);

  const assets = [];
  if (config.sources.as2Gamezip && (requestedSource === "all" || requestedSource === "as2")) {
    assets.push(...scanArchiveSource({
      archivePath: config.sources.as2Gamezip,
      outputRoot: paths.extractedDir,
      sourceGroup: "as2",
      tarBin: config.tools.tarBin,
      ffdecCli: config.tools.ffdecCli,
      includeSwf,
      swfProfile,
      assetPatterns
    }));
  }
  if (config.sources.as3Gamezip && (requestedSource === "all" || requestedSource === "as3")) {
    assets.push(...scanArchiveSource({
      archivePath: config.sources.as3Gamezip,
      outputRoot: paths.extractedDir,
      sourceGroup: "as3",
      tarBin: config.tools.tarBin,
      ffdecCli: config.tools.ffdecCli,
      includeSwf,
      swfProfile,
      assetPatterns
    }));
  }
  if (config.sources.steamRoot && (requestedSource === "all" || requestedSource === "steam")) {
    assets.push(...scanDirectorySource({
      rootPath: config.sources.steamRoot,
      outputRoot: paths.extractedDir,
      sourceGroup: "steam",
      ffdecCli: config.tools.ffdecCli,
      includeSwf,
      swfProfile,
      assetPatterns
    }));
  }
  if (args["scan-flashpoint-root"] && config.sources.flashpointRoot && (requestedSource === "all" || requestedSource === "flashpoint-root")) {
    assets.push(...scanDirectorySource({
      rootPath: config.sources.flashpointRoot,
      outputRoot: paths.extractedDir,
      sourceGroup: "flashpoint-root",
      ffdecCli: config.tools.ffdecCli,
      includeSwf,
      swfProfile,
      assetPatterns
    }));
  }

  const extractedStringCount = persistAssets(db, assets);
  const stats = db.getStats();
  db.close();

  printJson({
    requestedSource,
    phase,
    includeSwf,
    swfProfile,
    assetPatterns,
    extractedAssetCount: assets.length,
    extractedStringCount,
    stats
  });
}

main();
