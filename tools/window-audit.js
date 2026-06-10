const paths = require("./lib/paths");
const { parseArgs, printJson } = require("./lib/cli");
const { runPythonQa } = require("./lib/qa");
const { saveWindowAudit } = require("./lib/status-store");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = args.output || paths.windowAuditPath;
  const payload = runPythonQa([
    "window-audit",
    "--duration-ms",
    String(args.durationMs || 5000),
    "--interval-ms",
    String(args.intervalMs || 200),
    "--output",
    outputPath
  ], {
    timeoutMs: Number(args.timeoutMs || 70000)
  });
  saveWindowAudit(payload);
  printJson(payload);
}

main();
