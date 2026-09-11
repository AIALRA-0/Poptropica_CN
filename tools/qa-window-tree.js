const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const paths = require("./lib/paths");
const { ensureQaDir, getProjectRevision } = require("./lib/qa");

function flagEnabled(value) {
  return value === true || /^(1|true|yes|y)$/iu.test(String(value || ""));
}

function safeSegment(value) {
  return String(value || "")
    .replace(/[^a-z0-9_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80) || "runtime";
}

function runChild(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: paths.projectRoot,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8"
      },
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => resolve({
      command,
      args,
      status: null,
      signal: null,
      error: String(error.stack || error),
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8")
    }));
    child.on("close", (status, signal) => resolve({
      command,
      args,
      status,
      signal,
      error: null,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8")
    }));
  });
}

function parseLastJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  const lines = text.split(/\r?\n/gu).reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch (_error) {
      // The QA children may print diagnostics before their final JSON line.
    }
  }
  return null;
}

function summarizeAudit(audit) {
  const samples = Array.isArray(audit?.processSamples) ? audit.processSamples : [];
  const navigatorPids = new Set();
  for (const sample of samples) {
    for (const process of sample.runtimeProcesses || []) {
      const name = String(process.processName || "").toLowerCase();
      if (name === "flashpointnavigator.exe" || name === "fpnavigator.exe" || name === "basilisk.exe") {
        navigatorPids.add(Number(process.pid));
      }
    }
  }
  return {
    sampleCount: samples.length,
    maxNavigatorWindowCount: Math.max(
      0,
      ...samples.map((sample) => Number(sample.navigatorWindowCount || 0))
    ),
    maxPluginWindowCount: Math.max(
      0,
      ...samples.map((sample) => Number(sample.pluginWindowCount || 0))
    ),
    maxRuntimeWindowCount: Math.max(
      0,
      ...samples.map((sample) => Number(sample.runtimeWindowCount || 0))
    ),
    maxNavigatorProcessCount: Math.max(
      0,
      ...samples.map((sample) => Number(sample.navigatorProcessCount || 0))
    ),
    maxPluginProcessCount: Math.max(
      0,
      ...samples.map((sample) => Number(sample.pluginProcessCount || 0))
    ),
    maxRuntimeProcessCount: Math.max(
      0,
      ...samples.map((sample) => Number(sample.runtimeProcessCount || 0))
    ),
    duplicateNavigatorSampleCount: samples.filter(
      (sample) => Number(sample.navigatorWindowCount || 0) > 1
    ).length,
    shellPopupCount: Number(audit?.summary?.shellPopupCount || 0),
    visibleShellPopupCount: Number(audit?.summary?.visibleShellPopupCount || 0),
    navigatorPids: [...navigatorPids].filter((pid) => Number.isFinite(pid) && pid > 0),
    runtimeWindows: audit?.runtimeWindows || null,
    runtimeProcesses: audit?.runtimeProcesses || []
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = String(args.source || "as2").toLowerCase();
  if (!["as2", "as3"].includes(source)) {
    throw new Error(`Unsupported source: ${source}`);
  }
  const island = String(args.island || args.islands || (source === "as2" ? "24-carrot" : "poptropicon")).split(",")[0].trim();
  if (!island) {
    throw new Error("An island is required.");
  }
  const durationMs = Math.max(1000, Number(args.durationMs || args["duration-ms"] || 60000));
  const intervalMs = Math.max(50, Number(args.intervalMs || args["interval-ms"] || 200));
  const runDir = ensureQaDir("window-tree");
  const runToken = String(Date.now());
  const prefix = `${source}-${safeSegment(island)}-${runToken}`;
  const auditPath = path.join(runDir, `${prefix}-window-audit.json`);
  const reportPath = path.join(runDir, `${prefix}.json`);
  const qaScript = source === "as3" ? "tools/qa-as3-islands-smoke.js" : "tools/qa-as2-interaction-smoke.js";
  const qaArgs = source === "as3"
    ? ["--islands", island, "--settleMs", String(durationMs), "--skipInteraction", "1", "--allowFailures", "1"]
    : ["--islands", island, "--settleMs", String(durationMs), "--skipAudio", "1", "--allowFailures", "1"];
  if (flagEnabled(args.noForegroundCapture || args["no-foreground-capture"])) {
    qaArgs.push("--noForegroundCapture", "1");
  }
  if (args.targetMonitor || args["target-monitor"]) {
    qaArgs.push("--targetMonitor", String(args.targetMonitor || args["target-monitor"]));
  }

  const pythonBinary = process.env.PYTHON || "python";
  const auditPromise = runChild(pythonBinary, [
    path.join(paths.toolsRoot, "qa-helper.py"),
    "window-audit",
    "--duration-ms",
    String(durationMs),
    "--interval-ms",
    String(intervalMs),
    "--output",
    auditPath
  ]);
  // Start the game a moment after the baseline sampler starts so existing
  // desktop windows are excluded from duplicate-window evidence.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const qaPromise = runChild(process.execPath, [path.join(paths.projectRoot, qaScript), ...qaArgs]);
  const [auditResult, qaResult] = await Promise.all([auditPromise, qaPromise]);
  let audit = null;
  try {
    audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  } catch (_error) {
    audit = null;
  }
  const auditSummary = summarizeAudit(audit);
  const smokeSummary = parseLastJson(qaResult.stdout);
  const report = {
    ok: Boolean(audit) &&
      auditSummary.duplicateNavigatorSampleCount === 0 &&
      auditSummary.shellPopupCount === 0 &&
      auditSummary.visibleShellPopupCount === 0,
    generatedAt: new Date().toISOString(),
    projectRevision: getProjectRevision(),
    source,
    island,
    durationMs,
    intervalMs,
    auditPath,
    smokeScript: qaScript,
    smokeExit: {
      status: qaResult.status,
      signal: qaResult.signal,
      error: qaResult.error
    },
    smokeSummary,
    auditSummary,
    failedChecks: [
      ...(!audit ? ["window_audit_missing"] : []),
      ...(auditSummary.duplicateNavigatorSampleCount > 0 ? ["duplicate_navigator_windows"] : []),
      ...(auditSummary.shellPopupCount > 0 ? ["shell_popup_seen"] : []),
      ...(auditSummary.visibleShellPopupCount > 0 ? ["visible_shell_popup_seen"] : [])
    ]
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  printJson({ ...report, reportPath });
  if (!report.ok && !flagEnabled(args.allowFailures || args["allow-failures"])) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  printJson({
    ok: false,
    generatedAt: new Date().toISOString(),
    projectRevision: getProjectRevision(),
    failedChecks: ["window_tree_audit_fatal"],
    error: String(error.stack || error)
  });
  process.exitCode = 1;
});

