const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { generateAs3MapLogoOverrides } = require("./lib/as3-logo-overrides");

function main() {
  const _args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const result = generateAs3MapLogoOverrides({
    config,
    outputDir: paths.as3PackDir
  });
  printJson(result);
}

main();
