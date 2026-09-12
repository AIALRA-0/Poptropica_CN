const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const paths = require("./lib/paths");
const { readJson, writeJson } = require("./lib/fs-utils");
const { loadFinalAcceptanceEvidence, FINAL_ACCEPTANCE_DIR } = require("./lib/final-acceptance");

const ROUTE_CHECKLIST_PATH = path.join(paths.projectRoot, "qa", "route-checklist.json");
const OUTPUT_PATH = path.join(paths.qaDir, "final-acceptance-latest.json");

function currentRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: paths.projectRoot,
      encoding: "utf8",
      windowsHide: true
    }).trim() || null;
  } catch (_error) {
    return null;
  }
}

function bool(value) {
  return value === true;
}

function existsWithinProject(value) {
  if (!value || typeof value !== "string") {
    return false;
  }
  const candidate = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(paths.projectRoot, value);
  const root = path.resolve(paths.projectRoot);
  return candidate.toLowerCase().startsWith(`${root.toLowerCase()}${path.sep}`) &&
    fs.existsSync(candidate);
}

function hasArtifact(record, field) {
  const pathsForField = [
    record?.reportPaths?.[field],
    record?.artifacts?.[field],
    record?.evidence?.reportPaths?.[field]
  ].filter(Boolean);
  return pathsForField.some(existsWithinProject);
}

function validateRoute(record, route) {
  const nodes = Array.isArray(record?.routeNodes) ? record.routeNodes : [];
  const expected = Array.isArray(route?.routeNodes) ? route.routeNodes : [];
  const byId = new Map(nodes.map((node) => [node?.id, node]));
  const checks = expected.map((node) => {
    const actual = byId.get(node.id);
    return {
      id: node.id,
      ok: bool(actual?.ok) && Array.isArray(actual?.evidence) &&
        actual.evidence.length > 0 && Boolean(actual?.completedAt)
    };
  });
  const ok = bool(record?.evidence?.fullRouteVerified) &&
    checks.length === expected.length &&
    checks.every((check) => check.ok) &&
    hasArtifact(record, "route");
  return { ok, checks, expectedCount: expected.length, observedCount: nodes.length };
}

function validateSaveReload(record) {
  const checks = record?.saveReload?.checks || record?.checks?.saveReload || {};
  const names = ["inProcessExit", "reopen", "refresh", "coldRestart"];
  const results = names.map((name) => ({ name, ok: bool(checks[name]) }));
  return {
    ok: bool(record?.evidence?.saveReloadVerified) &&
      results.every((item) => item.ok) &&
      hasArtifact(record, "saveReload"),
    checks: results
  };
}

function validateChinese(record) {
  const checks = record?.chinese?.checks || record?.checks?.chinese || {};
  const names = ["hud", "map", "dialogue", "task", "item", "minigame", "settlement"];
  const results = names.map((name) => ({ name, ok: bool(checks[name]) }));
  return {
    ok: bool(record?.evidence?.renderedChineseVerified) &&
      results.every((item) => item.ok) &&
      hasArtifact(record, "chinese"),
    checks: results
  };
}

function validateWindow(record) {
  const checks = record?.window?.checks || record?.checks?.window || {};
  const summary = record?.window?.summary || {};
  const results = [
    { name: "resizeStable", ok: bool(checks.resizeStable) },
    { name: "popupStormFree", ok: bool(checks.popupStormFree) },
    { name: "singleNavigator", ok: bool(checks.singleNavigator) },
    { name: "singlePlugin", ok: bool(checks.singlePlugin) },
    { name: "noUnexpectedWindows", ok: bool(checks.noUnexpectedWindows) },
    { name: "summaryLimits", ok:
      Number(summary.maxNavigatorWindowCount || 0) <= 1 &&
      Number(summary.maxPluginWindowCount || 0) <= 1 &&
      summary.popupStormDetected !== true &&
      summary.shellPopupSeen !== true }
  ];
  return {
    ok: bool(record?.evidence?.windowStableVerified) &&
      results.every((item) => item.ok) &&
      hasArtifact(record, "window"),
    checks: results
  };
}

function validateIsland(route, source, revision) {
  const loaded = loadFinalAcceptanceEvidence({
    source,
    canonicalKey: route.canonicalKey,
    revision
  });
  if (!loaded) {
    return {
      canonicalKey: route.canonicalKey,
      sourceGroup: source,
      projectRevision: revision,
      ok: false,
      evidence: {
        fullRouteVerified: false,
        saveReloadVerified: false,
        renderedChineseVerified: false,
        windowStableVerified: false
      },
      failedChecks: ["per_island_final_acceptance_record_missing"],
      reportPath: null
    };
  }

  const record = loaded.record;
  const routeCheck = validateRoute(record, route);
  const saveReloadCheck = validateSaveReload(record);
  const chineseCheck = validateChinese(record);
  const windowCheck = validateWindow(record);
  const evidence = {
    fullRouteVerified: routeCheck.ok,
    saveReloadVerified: saveReloadCheck.ok,
    renderedChineseVerified: chineseCheck.ok,
    windowStableVerified: windowCheck.ok
  };
  const failedChecks = [
    ...(routeCheck.ok ? [] : ["full_route_not_proved"]),
    ...(saveReloadCheck.ok ? [] : ["save_reload_not_proved"]),
    ...(chineseCheck.ok ? [] : ["rendered_chinese_not_proved"]),
    ...(windowCheck.ok ? [] : ["window_stability_not_proved"])
  ];
  return {
    canonicalKey: route.canonicalKey,
    sourceGroup: source,
    projectRevision: revision,
    ok: failedChecks.length === 0,
    evidence,
    route: routeCheck,
    saveReload: saveReloadCheck,
    chinese: chineseCheck,
    window: windowCheck,
    failedChecks,
    reportPath: loaded.filePath,
    recordGeneratedAt: record.generatedAt || null
  };
}

function updateRouteChecklist(routes, results, revision) {
  const byKey = new Map(results.map((result) => [result.canonicalKey, result]));
  return routes.map((route) => {
    const result = byKey.get(route.canonicalKey);
    const verification = result
      ? {
          fullRouteVerified: result.evidence.fullRouteVerified === true,
          saveReloadVerified: result.evidence.saveReloadVerified === true,
          renderedChineseVerified: result.evidence.renderedChineseVerified === true,
          windowStableVerified: result.evidence.windowStableVerified === true,
          sourceRevision: revision,
          reportPath: result.reportPath
        }
      : {
          fullRouteVerified: false,
          saveReloadVerified: false,
          renderedChineseVerified: false,
          windowStableVerified: false,
          sourceRevision: revision,
          reportPath: null
        };
    return { ...route, verification };
  });
}

function syncIslandStatus() {
  const result = spawnSync(process.execPath, [path.join(paths.toolsRoot, "sync-qa-status.js")], {
    cwd: paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 8,
    env: { ...process.env, NODE_NO_WARNINGS: "1" }
  });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const revision = currentRevision();
  if (!revision) {
    throw new Error("Unable to determine the current Git revision.");
  }
  const checklist = readJson(ROUTE_CHECKLIST_PATH, null);
  const routes = Array.isArray(checklist?.routes) ? checklist.routes : [];
  const results = routes.map((route) => validateIsland(route, route.source, revision));
  const finalPassed = results.filter((result) => result.ok).length;
  const fieldCounts = {
    fullRouteVerified: results.filter((result) => result.evidence.fullRouteVerified).length,
    saveReloadVerified: results.filter((result) => result.evidence.saveReloadVerified).length,
    renderedChineseVerified: results.filter((result) => result.evidence.renderedChineseVerified).length,
    windowStableVerified: results.filter((result) => result.evidence.windowStableVerified).length
  };
  const report = {
    ok: routes.length === 47,
    generatedAt: new Date().toISOString(),
    projectRevision: revision,
    total: routes.length,
    finalPassed,
    fieldCounts,
    finalAcceptanceReady: routes.length === 47 && finalPassed === routes.length,
    evidenceRoot: FINAL_ACCEPTANCE_DIR,
    missingRecords: results.filter((result) => result.failedChecks.includes("per_island_final_acceptance_record_missing")).map((result) => result.canonicalKey),
    failedKeys: results.filter((result) => !result.ok).map((result) => result.canonicalKey),
    results
  };
  writeJson(OUTPUT_PATH, report);
  if (checklist && Array.isArray(checklist.routes)) {
    writeJson(ROUTE_CHECKLIST_PATH, {
      ...checklist,
      generatedAt: new Date().toISOString(),
      sourceRevision: revision,
      routes: updateRouteChecklist(checklist.routes, results, revision)
    });
  }
  const sync = syncIslandStatus();
  report.sync = sync;
  writeJson(OUTPUT_PATH, report);
  printJson({
    ok: report.ok,
    projectRevision: revision,
    total: report.total,
    finalPassed: report.finalPassed,
    fieldCounts,
    finalAcceptanceReady: report.finalAcceptanceReady,
    missingRecords: report.missingRecords,
    failedKeys: report.failedKeys,
    reportPath: OUTPUT_PATH,
    syncOk: sync.ok
  });
  if (bool(args.strict) && !report.finalAcceptanceReady) {
    process.exitCode = 1;
  }
}

main();
