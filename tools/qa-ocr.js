const path = require("node:path");
const paths = require("./lib/paths");
const { parseArgs, printJson } = require("./lib/cli");
const { ensureQaDir, runPythonQa } = require("./lib/qa");

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    throw new Error("--input is required.");
  }
  const qaDir = ensureQaDir();
  const stem = String(args.name || "ocr");
  const outputPath = args.output || path.join(qaDir, `${stem}.json`);
  const payload = runPythonQa([
    "ocr-image",
    "--input",
    String(args.input),
    "--output",
    outputPath
  ], {
    timeoutMs: Number(args.timeoutMs || 120000)
  });
  printJson(payload);
}

main();
