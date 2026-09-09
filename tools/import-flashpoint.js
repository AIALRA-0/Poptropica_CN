const { parseArgs, printJson } = require("./lib/cli");
const { updateConfig } = require("./lib/config");
const { fileExists, sanitizePathInput } = require("./lib/fs-utils");
const { writeInventory } = require("./lib/inventory");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const flashpointRoot = sanitizePathInput(args["flashpoint-root"]);
  const as2Gamezip = sanitizePathInput(args["as2-gamezip"]);
  const as3Gamezip = sanitizePathInput(args["as3-gamezip"]);
  const ffdecCli = sanitizePathInput(args["ffdec-cli"]);

  const updated = updateConfig({
    sources: {
      flashpointRoot: flashpointRoot || undefined,
      as2Gamezip: as2Gamezip || undefined,
      as3Gamezip: as3Gamezip || undefined
    },
    tools: {
      ffdecCli: ffdecCli || undefined
    }
  });

  const inventory = writeInventory(updated);

  printJson({
    flashpointRoot: updated.sources.flashpointRoot,
    as2Gamezip: updated.sources.as2Gamezip,
    as3Gamezip: updated.sources.as3Gamezip,
    flashpointRootExists: Boolean(updated.sources.flashpointRoot && fileExists(updated.sources.flashpointRoot)),
    as2GamezipExists: Boolean(updated.sources.as2Gamezip && fileExists(updated.sources.as2Gamezip)),
    as3GamezipExists: Boolean(updated.sources.as3Gamezip && fileExists(updated.sources.as3Gamezip)),
    inventorySummary: inventory.summary
  });
}

main();
