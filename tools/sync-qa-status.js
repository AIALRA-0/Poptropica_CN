const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const paths = require("./lib/paths");
const { writeJson } = require("./lib/fs-utils");
const { derivePlayabilityStatus } = require("./lib/status-store");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function currentRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: paths.projectRoot,
      encoding: "utf8",
      windowsHide: true
    }).trim() || null;
  } catch {
    return null;
  }
}

function newestReports(dir, prefix) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json") && !name.endsWith("-latest.json"))
    .map((name) => ({
      name,
      filePath: path.join(dir, name),
      mtime: fs.statSync(path.join(dir, name)).mtimeMs,
      report: readJson(path.join(dir, name))
    }))
    .sort((a, b) => b.mtime - a.mtime);
}

function isCurrentReport(report, revision) {
  return Boolean(report?.projectRevision) && report.projectRevision === revision;
}

function reportForIsland(report, canonicalKey) {
  return Array.isArray(report?.reports)
    ? report.reports.find((item) => item?.canonicalKey === canonicalKey) || null
    : null;
}

function findEvidence({ source, kind, canonicalKey, revision }) {
  const base = path.join(paths.qaDir, source, kind === "interaction" ? "interaction-smoke" : "islands-smoke");
  const prefix = `${source}-` + (kind === "interaction" ? "interaction-smoke-" : "island-smoke-");
  for (const candidate of newestReports(base, prefix)) {
    if (!isCurrentReport(candidate.report, revision)) continue;
    const islandReport = reportForIsland(candidate.report, canonicalKey);
    if (!islandReport || !isCurrentReport(islandReport, revision)) continue;
    return {
      reportPath: candidate.filePath,
      reportFileName: candidate.name,
      report: islandReport
    };
  }
  return null;
}

function buildIslandStatus({ canonicalKey, source, revision, previous }) {
  const smoke = findEvidence({ source, kind: "smoke", canonicalKey, revision });
  const interaction = findEvidence({ source, kind: "interaction", canonicalKey, revision });
  const smokePassed = smoke?.report?.ok === true &&
    Array.isArray(smoke.report.failedChecks) &&
    smoke.report.failedChecks.length === 0;
  const interactionPassed = interaction?.report?.ok === true &&
    Array.isArray(interaction.report.failedChecks) &&
    interaction.report.failedChecks.length === 0;
  const oldEvidence = previous?.acceptanceEvidence || {};
  const oldEvidenceCurrent =
    oldEvidence.sourceRevision === revision ||
    previous?.sourceRevision === revision;
  const preservedEvidence = oldEvidenceCurrent ? oldEvidence : {};
  const evidence = {
    smokeVerified: smokePassed,
    interactionVerified: interactionPassed,
    fullRouteVerified: preservedEvidence.fullRouteVerified === true,
    saveReloadVerified: preservedEvidence.saveReloadVerified === true,
    renderedChineseVerified: preservedEvidence.renderedChineseVerified === true,
    windowStableVerified: preservedEvidence.windowStableVerified === true,
    naturalAudioVerified: interaction?.report?.audio?.active === true ||
      preservedEvidence.naturalAudioVerified === true
  };
  const failed = Boolean((smoke && !smokePassed) || (interaction && !interactionPassed));
  const reportPaths = {
    smoke: smoke?.reportPath || null,
    interaction: interaction?.reportPath || null,
    route: preservedEvidence.reportPaths?.route || preservedEvidence.routeReportPath || null,
    saveReload: preservedEvidence.reportPaths?.saveReload || preservedEvidence.saveReloadReportPath || null,
    chinese: preservedEvidence.reportPaths?.chinese || preservedEvidence.chineseReportPath || null,
    window: preservedEvidence.reportPaths?.window || preservedEvidence.windowReportPath || null
  };
  const playabilityStatus = derivePlayabilityStatus({
    available: true,
    smokeVerified: smokePassed,
    interactionVerified: interactionPassed,
    evidence,
    failed
  });
  return {
    playabilityStatus,
    translationStatus: oldEvidenceCurrent ? previous?.translationStatus || "已打包未验收" : "已打包未验收",
    acceptanceEvidence: {
      ...evidence,
      reportPaths,
      sourceRevision: revision
    },
    lastVerifiedAt: interaction?.report?.generatedAt ||
      smoke?.report?.generatedAt ||
      (oldEvidenceCurrent ? previous?.lastVerifiedAt : null),
    notes: [
      `${source.toUpperCase()} 证据按岛屿独立选择，当前版本为 ${revision}`,
      smokePassed ? "当前提交的启动烟测通过。" : "当前提交缺少通过的启动烟测证据。",
      interactionPassed ? "当前提交的基础交互通过。" : "当前提交缺少通过的基础交互证据。",
      evidence.fullRouteVerified ? "完整路线有独立现场证据。" : "完整路线尚未有独立现场证据。",
      evidence.saveReloadVerified ? "退出、刷新和重启恢复有独立现场证据。" : "存档恢复尚未有独立现场证据。",
      evidence.renderedChineseVerified ? "中文现场有独立截图证据。" : "中文现场尚未有独立截图证据。",
      evidence.windowStableVerified ? "窗口、弹窗和缩放回归有独立证据。" : "窗口稳定回归尚未有独立证据。"
    ]
  };
}

function main() {
  const revision = currentRevision();
  if (!revision) {
    throw new Error("Unable to determine the current Git revision.");
  }
  const manifest = readJson(paths.launchManifestPath);
  const previous = readJson(paths.islandVerificationPath)?.islands || {};
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const islands = {};
  for (const entry of entries.filter((item) => ["as2", "as3"].includes(item.sourceGroup))) {
    islands[entry.canonicalKey] = buildIslandStatus({
      canonicalKey: entry.canonicalKey,
      source: entry.sourceGroup,
      revision,
      previous: previous[entry.canonicalKey]
    });
  }
  const output = {
    generatedAt: new Date().toISOString(),
    sourceRevision: revision,
    islands
  };
  writeJson(paths.islandVerificationPath, output);
  const values = Object.values(islands);
  console.log(JSON.stringify({
    ok: true,
    sourceRevision: revision,
    verifiedCount: values.length,
    smokeVerifiedCount: values.filter((item) => item.playabilityStatus === "启动烟测通过").length,
    interactionVerifiedCount: values.filter((item) => item.playabilityStatus === "基础交互通过").length,
    routeVerifiedCount: values.filter((item) => item.playabilityStatus === "完整路线通过").length,
    finalAcceptanceCount: values.filter((item) => item.playabilityStatus === "最终验收通过").length,
    path: paths.islandVerificationPath
  }, null, 2));
}

main();
