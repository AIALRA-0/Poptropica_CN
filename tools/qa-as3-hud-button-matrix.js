const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { ensureQaDir } = require("./lib/qa");
const { writeJson } = require("./lib/fs-utils");

const DEFAULT_BUTTONS = [
  { id: "settings", rightInset: 686, minChangedPixelRatio: 0.01, expectedPattern: "设置|声音|音效|音乐|对话速度|画质" },
  { id: "audio", rightInset: 606, minChangedPixelRatio: 0.0001 },
  { id: "home", rightInset: 526, minChangedPixelRatio: 0.01 },
  { id: "realms", rightInset: 446, minChangedPixelRatio: 0.01 },
  { id: "store", rightInset: 366, minChangedPixelRatio: 0.01, expectedPattern: "进入商店|确定要进入商店|确定|商店" },
  { id: "map", rightInset: 286, minChangedPixelRatio: 0.01, expectedPattern: "地图|确定要前往地图|怪物嘉年华|开始|重新开始" },
  { id: "costumizer", rightInset: 206, minChangedPixelRatio: 0.01 },
  { id: "inventory", rightInset: 126, minChangedPixelRatio: 0.01, expectedPattern: "背包|背包里还没有物品|去岛上探索|怪物嘉年华岛" }
];

function flagEnabled(value) {
  return value === true || /^(1|true|yes|y)$/iu.test(String(value || ""));
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseButtonSpec(value) {
  const byId = new Map(DEFAULT_BUTTONS.map((button, index) => [button.id, { ...button, index }]));
  const selected = splitCsv(value || DEFAULT_BUTTONS.map((button) => button.id).join(","));
  return selected.map((entry) => {
    const [id, inset, minRatio] = entry.split(":");
    const base = byId.get(id);
    if (!base && inset === undefined) {
      throw new Error(`Unknown button id: ${id}`);
    }
    return {
      id,
      index: base?.index ?? null,
      rightInset: inset === undefined ? base.rightInset : Number(inset),
      minChangedPixelRatio: minRatio === undefined ? (base?.minChangedPixelRatio ?? 0.01) : Number(minRatio),
      expectedPattern: base?.expectedPattern || ""
    };
  });
}

function extractJson(stdout) {
  const text = String(stdout || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON object found in child stdout: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

function runHudSmokeForButton(args, button) {
  const scriptPath = path.join(__dirname, "qa-as3-hud-smoke.js");
  const childArgs = [
    scriptPath,
    `--islands=${String(args.islands || args.island || "galactic-hot-dogs")}`,
    `--targetMonitor=${String(args.targetMonitor || args.monitor || process.env.POPTROPICA_QA_MONITOR || "G32QC")}`,
    `--initial-size=${String(args.initialSize || args["initial-size"] || "1186x760")}`,
    `--resized-size=${String(args.resizedSize || args["resized-size"] || "1450x900")}`,
    `--initial-settle-ms=${String(args.initialSettleMs || args["initial-settle-ms"] || 22000)}`,
    `--resize-settle-ms=${String(args.resizeSettleMs || args["resize-settle-ms"] || 45000)}`,
    `--click-wait-ms=${String(args.clickWaitMs || args["click-wait-ms"] || 3500)}`,
    `--secondary-click=1`,
    `--secondary-click-label=${button.id}`,
    `--secondary-click-right-inset=${button.rightInset}`,
    `--secondary-button-index=${button.index ?? 0}`,
    `--secondary-button-count=${DEFAULT_BUTTONS.length}`,
    `--min-secondary-click-changed-pixel-ratio=${button.minChangedPixelRatio}`,
    `--secondary-click-wait-ms=${String(args.secondaryClickWaitMs || args["secondary-click-wait-ms"] || 5000)}`
  ];
  if (button.expectedPattern) {
    childArgs.push(`--secondary-click-expected-pattern=${button.expectedPattern}`);
  }
  if (flagEnabled(args.forbidVisibleEnglish || args["forbid-visible-english"])) {
    childArgs.push("--forbid-visible-english=1");
  }
  if (args.forbiddenVisiblePattern || args["forbidden-visible-pattern"]) {
    childArgs.push(`--forbidden-visible-pattern=${String(args.forbiddenVisiblePattern || args["forbidden-visible-pattern"])}`);
  }
  const result = spawnSync(process.execPath, childArgs, {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    windowsHide: true,
    timeout: Number(args.perButtonTimeoutMs || args["per-button-timeout-ms"] || 220000),
    env: {
      ...process.env,
      POPTROPICA_QA_MONITOR: String(args.targetMonitor || args.monitor || process.env.POPTROPICA_QA_MONITOR || "G32QC"),
      POPTROPICA_QA_NO_FOREGROUND: process.env.POPTROPICA_QA_NO_FOREGROUND || "1",
      POPTROPICA_QA_POST_MESSAGE_CLICKS: process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS || "1",
      POPTROPICA_QA_CAPTURE_CHILD_CLASS: process.env.POPTROPICA_QA_CAPTURE_CHILD_CLASS || "GeckoFPSandboxChildWindow"
    },
    maxBuffer: 1024 * 1024 * 64
  });

  const childReport = result.stdout ? extractJson(result.stdout) : null;
  const islandReports = Array.isArray(childReport?.reports) ? childReport.reports : [];
  const islandSummaries = islandReports.map((entry) => {
    const secondary = entry?.menuClick?.secondary || {};
    return {
      canonicalKey: entry?.canonicalKey || null,
      ok: Boolean(entry?.ok && secondary?.check?.ok),
      failedChecks: entry?.failedChecks || [],
      observedChangedPixelRatio: secondary?.check?.observedChangedPixelRatio ?? null,
      text: secondary?.check?.text || "",
      screenshotPath: entry?.artifacts?.secondaryScreenshotPath || null,
      clickPath: entry?.artifacts?.secondaryClickPath || null,
      point: secondary?.check?.point || secondary?.click?.point || null
    };
  });
  const failedIslands = islandSummaries
    .filter((entry) => !entry.ok)
    .map((entry) => entry.canonicalKey)
    .filter(Boolean);
  const first = islandReports[0] || null;
  const firstSecondary = first?.menuClick?.secondary || {};
  return {
    id: button.id,
    index: button.index,
    rightInset: button.rightInset,
    minChangedPixelRatio: button.minChangedPixelRatio,
    ok: result.status === 0 && Boolean(childReport?.ok) && failedIslands.length === 0,
    childStatus: result.status,
    timedOut: Boolean(result.error && /timed out/iu.test(String(result.error.message || result.error))),
    stderr: String(result.stderr || "").slice(0, 2000),
    reportPath: childReport?.reportPath || null,
    artifactDir: childReport?.artifactDir || null,
    failedKeys: childReport?.failedKeys || [],
    failedIslands,
    failedChecks: first?.failedChecks || [],
    observedChangedPixelRatio: firstSecondary?.check?.observedChangedPixelRatio ?? null,
    text: firstSecondary?.check?.text || "",
    screenshotPath: first?.artifacts?.secondaryScreenshotPath || null,
    clickPath: first?.artifacts?.secondaryClickPath || null,
    rawReportPath: childReport?.reportPath || null,
    islandCount: islandSummaries.length,
    islandsPassed: islandSummaries.filter((entry) => entry.ok).length,
    islandsFailed: failedIslands.length,
    islandSummaries
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const buttons = parseButtonSpec(args.buttons || args.button);
  const startedAt = new Date().toISOString();
  const reports = [];
  for (const button of buttons) {
    reports.push(runHudSmokeForButton(args, button));
  }
  const runToken = String(Date.now());
  const qaDir = ensureQaDir("as3", "hud-button-matrix");
  const reportPath = path.join(qaDir, `as3-hud-button-matrix-${runToken}.json`);
  const latestPath = path.join(qaDir, "as3-hud-button-matrix-latest.json");
  const report = {
    ok: reports.every((entry) => entry.ok),
    generatedAt: new Date().toISOString(),
    startedAt,
    island: String(args.islands || args.island || "galactic-hot-dogs"),
    total: reports.length,
    passed: reports.filter((entry) => entry.ok).length,
    failed: reports.filter((entry) => !entry.ok).length,
    failedButtons: reports.filter((entry) => !entry.ok).map((entry) => entry.id),
    reports
  };
  writeJson(reportPath, report);
  writeJson(latestPath, report);
  printJson({ ...report, reportPath, latestPath });
}

main();
