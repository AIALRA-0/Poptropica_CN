const path = require("node:path");
const electronBinary = require("electron");
const { _electron: electron } = require("playwright");
const paths = require("./lib/paths");
const { ensureDirSync, writeJson } = require("./lib/fs-utils");
const { spawnSync } = require("node:child_process");

function runPowershell(command) {
  return spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000
  });
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
    args: [path.join(paths.launcherRoot, "main.js"), "--smoke"],
    cwd: paths.projectRoot,
    env
  });

  try {
    const page = await app.firstWindow();
    await page.waitForSelector("text=旧版 Poptropica 启动器", { timeout: 30000 });
    await page.waitForSelector("text=进入 AS3", { timeout: 30000 });
    await page.waitForSelector("text=进入 AS2", { timeout: 30000 });
    await page.waitForSelector("text=旧岛状态", { timeout: 30000 });

    const advancedArea = page.locator("#advancedArea");
    const hasDirectLaunchText = await page.getByText("外部直启岛屿").count();
    const screenshotDir = ensureDirSync(path.join(paths.runtimeDataDir, "ui-checks"));
    const screenshotPath = path.join(screenshotDir, "launcher-default.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const result = {
      ok: true,
      generatedAt: new Date().toISOString(),
      screenshotPath,
      assertions: {
        titleVisible: await page.getByRole("heading", { name: "旧版 Poptropica 启动器" }).isVisible(),
        as3ButtonVisible: await page.getByRole("button", { name: "进入 AS3" }).isVisible(),
        as2ButtonVisible: await page.getByRole("button", { name: "进入 AS2" }).isVisible(),
        rebuildButtonVisible: await page.getByRole("button", { name: "重建汉化包" }).isVisible(),
        advancedHidden: await advancedArea.evaluate((node) => node.classList.contains("hidden")),
        directLaunchHidden: hasDirectLaunchText === 0
      }
    };

    writeJson(path.join(screenshotDir, "ui-smoke-report.json"), result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
