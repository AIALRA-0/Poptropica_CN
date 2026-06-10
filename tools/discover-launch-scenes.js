const { printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { generateLaunchManifest } = require("./lib/launch-manifest");

function main() {
  const manifest = generateLaunchManifest(loadConfig());
  printJson(manifest);
}

main();
