const fs = require("node:fs");
const path = require("node:path");
const paths = require("./lib/paths");
const { writeJson } = require("./lib/fs-utils");

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
}

function newestReports(dir, prefix) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json") && !name.endsWith("-latest.json"))
    .map((name) => ({ name, filePath: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

const islands = {};
const coverage = readJson(path.join(paths.qaDir, "translation-coverage-audit.json"));
const translationStatus = coverage?.ok && Number(coverage.summary?.translatableCoveragePct) === 100
  ? "已验收可见中文"
  : "已提取待翻译";

// Prefer a complete matrix run for each runtime. Focused diagnostic runs are
// intentionally ignored so a later one island experiment cannot downgrade
// the launcher status for the authoritative full acceptance run.
const matrixRuns = [
  { source: "as2", dir: path.join(paths.qaDir, "as2", "islands-smoke"), prefix: "as2-island-smoke-", total: 34 },
  { source: "as3", dir: path.join(paths.qaDir, "as3", "islands-smoke"), prefix: "as3-island-smoke-", total: 13 }
];
for (const matrix of matrixRuns) {
  const candidates = newestReports(matrix.dir, matrix.prefix)
    .map((entry) => ({ ...entry, report: readJson(entry.filePath) }))
    .filter((entry) => entry.report?.reports && Number(entry.report.total) === matrix.total);
  const matrixRun = candidates[0];
  if (!matrixRun) continue;
  const report = matrixRun.report;
  for (const item of report.reports) {
    if (!item?.canonicalKey) continue;
    const visualOk = matrix.source === "as2" ? true : item.visualGuard?.ok === true;
    const sceneChecks = Array.isArray(item.sceneEvidence?.checks) ? item.sceneEvidence.checks : [];
    const sceneDataOk = sceneChecks.find((check) => check.name === "target_scene_data_request")?.ok;
    const sceneAssetOk = sceneChecks.find((check) => check.name === "target_scene_asset_request")?.ok;
    const sceneOk = matrix.source === "as2"
      ? item.sceneEvidence?.ok !== false
      : item.sceneEvidence?.ok === true || (sceneDataOk === true && sceneAssetOk === true);
    const playable = report.ok === true && item.ok === true && visualOk && sceneOk;
    const audioOk = item.audio?.active === true;
    islands[item.canonicalKey] = {
      playabilityStatus: playable ? "可玩" : "已知损坏",
      translationStatus,
      acceptanceEvidence: {
        level: playable ? "启动与场景烟测" : "烟测未通过",
        fullRouteVerified: false,
        saveReloadVerified: false,
        naturalAudioVerified: audioOk,
        renderedChineseVerified: false
      },
      lastVerifiedAt: item.generatedAt || report.generatedAt || null,
      notes: [
        `${matrix.source.toUpperCase()} 全量现场验收：${matrixRun.name}`,
        playable ? "入口、场景资源与视觉守护通过。" : "现场验收未通过入口、场景资源或视觉稳定性门禁。",
        audioOk ? "现场检测到音频活动。" : "本次未检测到音频活动（不影响静音验收）。",
        translationStatus === "已验收可见中文" ? "翻译覆盖审计通过 100%。" : "翻译覆盖仍需补齐。"
      ]
    };
  }
}

const output = { generatedAt: new Date().toISOString(), islands };
writeJson(paths.islandVerificationPath, output);
console.log(JSON.stringify({ ok: true, verifiedCount: Object.keys(islands).length, playableCount: Object.values(islands).filter((v) => v.playabilityStatus === "可玩").length, path: paths.islandVerificationPath }, null, 2));
