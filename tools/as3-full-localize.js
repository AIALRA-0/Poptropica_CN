const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");

function run(scriptName, args = []) {
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName), ...args], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 128
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${scriptName} failed`);
  }
  return JSON.parse(result.stdout);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = String(args.limit || "360");
  printJson({
    extractTextOnly: run("extract-text.js", ["--source", "as3", "--phase", "text-only"]),
    extractFullSwf: run("extract-text.js", ["--source", "as3", "--phase", "full-swf"]),
    translate: run("translate-pack.js", ["--source", "as3", "--drain", "--limit", limit]),
    seedKnownUi: run("seed-known-translations.js"),
    patch: run("patch-pack.js", ["--source", "as3"])
  });
}

main();
