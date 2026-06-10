const path = require("node:path");
const paths = require("./lib/paths");
const { parseArgs, printJson } = require("./lib/cli");
const { ensureQaDir, runPythonQa } = require("./lib/qa");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const qaDir = ensureQaDir();
  const stem = String(args.name || "audio");
  const outputPath = args.output || path.join(qaDir, `${stem}.json`);
  const payload = runPythonQa([
    "audio-check",
    "--process-names",
    String(args.processNames || ""),
    "--duration-sec",
    String(args.durationSec || 2),
    "--sample-rate",
    String(args.sampleRate || 16000),
    "--peak-threshold",
    String(args.peakThreshold || 0.0005),
    "--output",
    outputPath
  ], {
    timeoutMs: Number(args.timeoutMs || 30000)
  });
  printJson(payload);
}

main();
