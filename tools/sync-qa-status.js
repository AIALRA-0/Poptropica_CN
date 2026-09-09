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
for (const { name, filePath } of newestReports(path.join(paths.qaDir, "as3", "islands-smoke"), "as3-island-smoke-")) {
  const report = readJson(filePath);
  if (!report?.reports) continue;
  for (const item of report.reports) {
    if (!item?.canonicalKey || islands[item.canonicalKey]) continue;
    const visualOk = item.visualGuard?.ok === true;
    const sceneOk = item.sceneEvidence?.ok !== false;
    const audioOk = item.audio?.active === true;
    const playable = report.ok === true && item.ok === true && visualOk && sceneOk;
    islands[item.canonicalKey] = {
      playabilityStatus: playable ? "可玩" : "已知损坏",
      translationStatus: "已提取待翻译",
      lastVerifiedAt: item.generatedAt || report.generatedAt || null,
      notes: [
        `AS3 现场验收：${name}`,
        playable ? "入口、场景、视觉守护通过。" : "现场验收未通过视觉或场景稳定性门禁。",
        audioOk ? "现场检测到音频活动。" : "本次未检测到音频活动。"
      ]
    };
  }
}

const output = { generatedAt: new Date().toISOString(), islands };
writeJson(paths.islandVerificationPath, output);
console.log(JSON.stringify({ ok: true, verifiedCount: Object.keys(islands).length, playableCount: Object.values(islands).filter((v) => v.playabilityStatus === "可玩").length, path: paths.islandVerificationPath }, null, 2));
