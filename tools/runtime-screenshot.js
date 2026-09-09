const path = require("node:path");
const { spawnSync } = require("node:child_process");
const electronBinary = require("electron");
const { _electron: electron } = require("playwright");
const paths = require("./lib/paths");
const { parseArgs, printJson } = require("./lib/cli");
const { ensureDirSync } = require("./lib/fs-utils");

function runPowershell(command) {
  return spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000
  });
}

function stopRuntimeProcesses() {
  runPowershell("Get-Process FlashpointSecurePlayer,FPNavigator,flashpointnavigator -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue");
}

function getRuntimeWindows() {
  const result = runPowershell([
    "$rows = Get-Process FlashpointSecurePlayer,FPNavigator,flashpointnavigator -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } |",
    "Select-Object ProcessName, Id, MainWindowTitle, MainWindowHandle;",
    "$rows | ConvertTo-Json -Depth 4"
  ].join(" "));
  if (result.status !== 0 || !result.stdout.trim()) {
    return [];
  }
  return [].concat(JSON.parse(result.stdout)).filter(Boolean);
}

function focusWindow(handle) {
  const command = [
    "Add-Type @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class WinApi {",
    "  [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);",
    "  [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);",
    "}",
    "'@;",
    `$h=[IntPtr]::new(${handle});`,
    "[WinApi]::ShowWindowAsync($h, 9) | Out-Null;",
    "[WinApi]::SetForegroundWindow($h) | Out-Null;"
  ].join(" ");
  runPowershell(command);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceGroup = String(args.source || "as3").toLowerCase();
  const buttonLabel = sourceGroup === "as2" ? "进入 AS2" : "进入 AS3";
  const env = {
    ...process.env,
    NODE_NO_WARNINGS: "1",
    POPTROPICA_UI_TEST: "1"
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const reportDir = ensureDirSync(path.join(paths.runtimeDataDir, "ui-checks"));
  const screenshotPath = path.join(reportDir, `${sourceGroup}-runtime-window.png`);

  runPowershell("Get-Process electron,FlashpointSecurePlayer,FPNavigator,flashpointnavigator -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue");
  const app = await electron.launch({
    executablePath: electronBinary,
    args: [path.join(paths.launcherRoot, "main.js")],
    cwd: paths.projectRoot,
    env
  });

  try {
    const page = await app.firstWindow();
    await page.waitForSelector(`text=${buttonLabel}`, { timeout: 30000 });
    await page.getByRole("button", { name: buttonLabel }).click();
    await page.waitForTimeout(12000);

    const windows = getRuntimeWindows();
    if (windows[0]?.MainWindowHandle) {
      focusWindow(windows[0].MainWindowHandle);
      await page.waitForTimeout(1500);
    }

    if (!windows[0]?.MainWindowHandle) {
      throw new Error("No visible runtime window was found.");
    }

    const captureScript = path.join(paths.toolsRoot, "print-window.ps1");
    const shot = runPowershell(`powershell -ExecutionPolicy Bypass -File '${captureScript}' -Path '${screenshotPath}' -WindowHandle ${windows[0].MainWindowHandle}`);
    if (shot.status !== 0) {
      throw new Error((shot.stderr || shot.stdout || "screenshot failed").trim());
    }

    printJson({
      ok: true,
      sourceGroup,
      windows,
      screenshotPath
    });
  } finally {
    stopRuntimeProcesses();
    await app.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
