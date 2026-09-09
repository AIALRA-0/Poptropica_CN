const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { fileExists, readJson, writeJson } = require("./lib/fs-utils");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");

function resolveManifestPath(sourceGroup) {
  return path.join(sourceGroup === "as2" ? paths.as2PackDir : paths.as3PackDir, "manifest.json");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceGroup = String(args.source || "as3").toLowerCase();
  if (!["as2", "as3"].includes(sourceGroup)) {
    throw new Error(`Unsupported source group: ${sourceGroup}`);
  }

  const config = loadConfig();
  const manifestPath = resolveManifestPath(sourceGroup);
  const manifest = fileExists(manifestPath)
    ? readJson(manifestPath, {})
    : {
        generatedAt: new Date().toISOString(),
        sourceGroup,
        canonicalKeys: [],
        assetsPatched: 0,
        externalTextAssets: [],
        swfPatchedAssets: [],
        pendingSwfAssets: []
      };

  const runtimeZip = buildRuntimeZipForSourceGroup({
    config,
    sourceGroup,
    manifest
  });

  writeJson(manifestPath, manifest);
  printJson({
    ok: true,
    sourceGroup,
    manifestPath,
    runtimeZip
  });
}

main();
