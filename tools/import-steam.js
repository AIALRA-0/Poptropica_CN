const { parseArgs, printJson } = require("./lib/cli");
const { updateConfig } = require("./lib/config");
const { fileExists, sanitizePathInput } = require("./lib/fs-utils");
const { writeInventory } = require("./lib/inventory");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const steamRoot = sanitizePathInput(args["steam-root"]);
  const updated = updateConfig({
    sources: {
      steamRoot: steamRoot || undefined
    }
  });
  const inventory = writeInventory(updated);

  printJson({
    steamRoot: updated.sources.steamRoot,
    steamRootExists: Boolean(updated.sources.steamRoot && fileExists(updated.sources.steamRoot)),
    inventorySummary: inventory.summary
  });
}

main();
