const { printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { writeInventory } = require("./lib/inventory");

function main() {
  const config = loadConfig();
  const inventory = writeInventory(config);
  printJson({
    generatedAt: inventory.generatedAt,
    configuredSources: inventory.configuredSources,
    summary: inventory.summary
  });
}

main();
