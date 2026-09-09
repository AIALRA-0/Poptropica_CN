const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { printJson } = require("./lib/cli");

function run(scriptName, args = []) {
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName), ...args], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${scriptName} failed`);
  }
  return JSON.parse(result.stdout);
}

function main() {
  printJson({
    bootstrap: run("bootstrap-flashpoint.js"),
    inventory: run("inventory-sources.js"),
    discover: run("discover-launch-scenes.js"),
    extractAs3Text: run("extract-text.js", ["--source", "as3", "--phase", "text-only"]),
    extractAs3PrioritySwf: run("extract-text.js", ["--source", "as3", "--phase", "priority-swf"]),
    translateAs3: run("translate-pack.js", ["--source", "as3", "--drain", "--limit", "180"]),
    seedKnownUi: run("seed-known-translations.js"),
    extractAs2PrioritySwf: run("extract-text.js", ["--source", "as2", "--phase", "priority-swf"]),
    translateAs2: run("translate-pack.js", ["--source", "as2", "--drain", "--limit", "180"]),
    patch: run("patch-pack.js"),
    patchStartFlow: run("patch-start-flow.js")
  });
}

main();
