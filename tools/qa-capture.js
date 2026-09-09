const path = require("node:path");
const { parseArgs, printJson } = require("./lib/cli");
const { ensureQaDir, runPythonQa } = require("./lib/qa");
const { writeJson } = require("./lib/fs-utils");

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.handle) {
    throw new Error("--handle is required.");
  }
  const qaDir = ensureQaDir();
  const stem = String(args.name || "capture");
  const outputPath = args.output || path.join(qaDir, `${stem}.png`);
  const metadataPath = args.metadataOutput || path.join(qaDir, `${stem}.json`);
  const targetMonitor = String(args.targetMonitor || args.monitor || process.env.POPTROPICA_QA_MONITOR || "").trim();
  if (targetMonitor) {
    process.env.POPTROPICA_QA_MONITOR = targetMonitor;
  }
  const payload = runPythonQa([
    "capture-window",
    "--handle",
    String(args.handle),
    "--output",
    outputPath,
    "--metadata-output",
    metadataPath,
    "--maximize",
    ...(args.fullWindow ? [] : ["--client-only"])
  ], {
    timeoutMs: Number(args.timeoutMs || 40000)
  });
  writeJson(metadataPath, payload);
  printJson(payload);
}

main();
