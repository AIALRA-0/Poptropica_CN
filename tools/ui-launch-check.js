const path = require("node:path");
const { spawnSync } = require("node:child_process");
const electronBinary = require("electron");
const { _electron: electron } = require("playwright");
const paths = require("./lib/paths");
const { ensureDirSync, writeJson } = require("./lib/fs-utils");

function runPowershell(command) {
  return spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000
  });
}

function parseJson(stdout) {
  if (!stdout || !stdout.trim()) {
    return [];
  }
  return [].concat(JSON.parse(stdout)).filter(Boolean);
}

function auditRuntime() {
  const command = [
    "$rows = Get-Process | Where-Object { $_.ProcessName -in @('cmd','powershell','pwsh','FPNavigator','flashpointnavigator','FlashpointSecurePlayer') } |",
    "Select-Object ProcessName, Id, MainWindowTitle, Path;",
    "$rows | ConvertTo-Json -Depth 4"
  ].join(" ");
  const result = runPowershell(command);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "runtime audit failed").trim());
  }
  const rows = parseJson(result.stdout);
  const visibleShellPopups = rows.filter((row) => ["cmd", "powershell", "pwsh"].includes(String(row.ProcessName).toLowerCase()) && row.MainWindowTitle);
  const runtimeRows = rows.filter((row) => ["FlashpointSecurePlayer", "FPNavigator", "flashpointnavigator"].includes(String(row.ProcessName)));
  return {
    processes: rows,
    runtimeProcessCount: runtimeRows.length,
    shellPopupCount: visibleShellPopups.length
  };
}

function stopRuntimeProcesses() {
  runPowershell("Get-Process FlashpointSecurePlayer,FPNavigator,flashpointnavigator -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue");
}

async function main() {
  runPowershell("Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue");
  const env = {
    ...process.env,
    NODE_NO_WARNINGS: "1",
    POPTROPICA_UI_TEST: "1"
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    executablePath: electronBinary,
    args: [path.join(paths.launcherRoot, "main.js")],
    cwd: paths.projectRoot,
    env
  });

  const reportDir = ensureDirSync(path.join(paths.runtimeDataDir, "ui-checks"));
  const report = {
    generatedAt: new Date().toISOString(),
    checks: []
  };

  try {
    const page = await app.firstWindow();
    await page.waitForSelector("text=进入 AS3", { timeout: 30000 });
    await page.waitForSelector("text=进入 AS2", { timeout: 30000 });

    for (const item of [
      { sourceGroup: "as3", label: "进入 AS3" },
      { sourceGroup: "as2", label: "进入 AS2" }
    ]) {
      await page.getByRole("button", { name: item.label }).click();
      await page.waitForTimeout(5000);
      const audit = auditRuntime();
      report.checks.push({
        sourceGroup: item.sourceGroup,
        buttonLabel: item.label,
        runtimeProcessCount: audit.runtimeProcessCount,
        shellPopupCount: audit.shellPopupCount,
        ok: audit.runtimeProcessCount > 0 && audit.shellPopupCount === 0
      });
      stopRuntimeProcesses();
      await page.waitForTimeout(2000);
    }

    report.ok = report.checks.every((item) => item.ok);
    const reportPath = path.join(reportDir, "ui-launch-check.json");
    writeJson(reportPath, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    stopRuntimeProcesses();
    await app.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
