const fs = require("node:fs");
const path = require("node:path");
const { printJson } = require("./lib/cli");
const { ensureDirSync, writeJson } = require("./lib/fs-utils");
const paths = require("./lib/paths");
const { startWebLauncherServer } = require("./web-launcher");

const BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json();
  return {
    ok: response.ok && payload.ok !== false,
    status: response.status,
    payload
  };
}

async function fetchText(url) {
  const response = await fetch(url);
  return {
    ok: response.ok,
    status: response.status,
    text: await response.text()
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hasArgPair(args, key, value) {
  for (let index = 0; index < args.length - 1; index += 1) {
    if (args[index] === key && args[index + 1] === value) {
      return true;
    }
  }
  return false;
}

function findBrowserExecutable() {
  return BROWSER_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

async function runBrowserRenderCheck(baseUrl) {
  let chromium = null;
  try {
    ({ chromium } = require("playwright"));
  } catch (_error) {
    return {
      skipped: true,
      reason: "playwright module is not available"
    };
  }

  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    return {
      skipped: true,
      reason: "no system Chrome or Edge executable was found"
    };
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath
  });
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 980
    }
  });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(String(error.message || error));
  });

  try {
    await page.goto(baseUrl, {
      waitUntil: "networkidle",
      timeout: 60000
    });
    await page.waitForFunction(() => {
      const text = window.render_launcher_to_text && window.render_launcher_to_text();
      if (!text) {
        return false;
      }
      const payload = JSON.parse(text);
      return payload.visibleRows > 0 && payload.launchableCount > 0;
    }, null, {
      timeout: 60000
    });
    await page.fill("#filterInput", "Monkey");
    await page.waitForFunction(() => JSON.parse(window.render_launcher_to_text()).visibleRows === 1, null, {
      timeout: 10000
    });
    const filteredState = JSON.parse(await page.evaluate(() => window.render_launcher_to_text()));
    await page.fill("#filterInput", "");
    const textState = JSON.parse(await page.evaluate(() => window.render_launcher_to_text()));
    const screenshotPath = path.join(paths.qaDir, "web-launcher-page.png");
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });
    return {
      skipped: false,
      ok: consoleErrors.length === 0,
      browser: executablePath,
      screenshotPath,
      textState,
      filteredState,
      consoleErrors
    };
  } finally {
    await browser.close();
  }
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function main() {
  const report = {
    ok: false,
    generatedAt: new Date().toISOString(),
    checks: [],
    reportPath: path.join(paths.qaDir, "web-launcher-smoke.json")
  };
  ensureDirSync(paths.qaDir);

  const instance = await startWebLauncherServer({ port: 0 });
  try {
    const health = await fetchJson(`${instance.url}healthz`);
    assert(health.ok, "healthz failed");
    report.checks.push({ name: "healthz", ok: true, status: health.status });

    const page = await fetchText(instance.url);
    assert(page.ok, "page did not return 200");
    assert(page.text.includes("POPTROPICA_FLASH Local"), "page title missing");
    assert(page.text.includes("islandTableBody"), "island table hook missing");
    report.checks.push({ name: "page", ok: true, status: page.status, bytes: Buffer.byteLength(page.text) });

    const state = await fetchJson(`${instance.url}api/state`);
    assert(state.ok, "state API failed");
    assert((state.payload.inventory?.summary?.flashIslandCount || 0) > 0, "state has no flash islands");
    assert((state.payload.launchManifest?.summary?.launchableCount || 0) > 0, "state has no launchable entries");
    report.checks.push({
      name: "state",
      ok: true,
      flashIslandCount: state.payload.inventory.summary.flashIslandCount,
      launchableCount: state.payload.launchManifest.summary.launchableCount
    });

    const runtimeDryRun = await fetchJson(`${instance.url}api/launch-runtime`, {
      method: "POST",
      body: JSON.stringify({ sourceGroup: "as3", dryRun: true })
    });
    assert(runtimeDryRun.ok, "runtime dry-run failed");
    assert(hasArgPair(runtimeDryRun.payload.args, "--runtime", "as3"), "runtime dry-run missing --runtime as3");
    assert(hasArgPair(runtimeDryRun.payload.args, "--targetMonitor", "G32QC"), "runtime dry-run missing G32QC target");
    assert(runtimeDryRun.payload.args.includes("--maximize"), "runtime dry-run missing --maximize");
    assert(runtimeDryRun.payload.windowGeometry?.mode === "as3-safe-maximize", "runtime dry-run did not resolve AS3 safe maximize");
    report.checks.push({
      name: "runtime-dry-run",
      ok: true,
      args: runtimeDryRun.payload.args,
      windowGeometry: runtimeDryRun.payload.windowGeometry
    });

    const islandDryRun = await fetchJson(`${instance.url}api/launch-island`, {
      method: "POST",
      body: JSON.stringify({ islandId: "monkey-wrench", dryRun: true, windowSize: "1450x900", maximize: false })
    });
    assert(islandDryRun.ok, "island dry-run failed");
    assert(hasArgPair(islandDryRun.payload.args, "--island", "monkey-wrench"), "island dry-run missing island id");
    assert(hasArgPair(islandDryRun.payload.args, "--windowSize", "1450x900"), "island dry-run missing window size");
    assert(islandDryRun.payload.windowGeometry?.mode === "explicit", "island dry-run did not resolve explicit size");
    report.checks.push({
      name: "island-dry-run",
      ok: true,
      launchMode: islandDryRun.payload.launchEntry?.launchMode || null,
      args: islandDryRun.payload.args,
      windowGeometry: islandDryRun.payload.windowGeometry
    });

    const invalidRuntime = await fetchJson(`${instance.url}api/launch-runtime`, {
      method: "POST",
      body: JSON.stringify({ sourceGroup: "bad", dryRun: true })
    });
    assert(invalidRuntime.status === 400 && invalidRuntime.payload.ok === false, "invalid runtime did not return 400");
    report.checks.push({ name: "invalid-runtime", ok: true, status: invalidRuntime.status });

    const browserRender = await runBrowserRenderCheck(instance.url);
    if (browserRender.skipped) {
      report.checks.push({ name: "browser-render", ok: true, skipped: true, reason: browserRender.reason });
    } else {
      assert(browserRender.ok, `browser render console errors: ${browserRender.consoleErrors.join("; ")}`);
      report.checks.push({ name: "browser-render", ok: true, ...browserRender });
    }

    report.ok = true;
  } catch (error) {
    report.error = String(error.stack || error.message || error);
    process.exitCode = 1;
  } finally {
    await closeServer(instance.server);
    writeJson(report.reportPath, report);
    printJson(report);
  }
}

main().catch((error) => {
  const reportPath = path.join(paths.qaDir, "web-launcher-smoke.json");
  const report = {
    ok: false,
    generatedAt: new Date().toISOString(),
    reportPath,
    error: String(error.stack || error.message || error)
  };
  ensureDirSync(path.dirname(reportPath));
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  printJson(report);
  process.exit(1);
});
