const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { generateLaunchManifest } = require("./lib/launch-manifest");
const { readJson, writeJson } = require("./lib/fs-utils");

function flagEnabled(value) {
  return value === true || /^(1|true|yes|on)$/iu.test(String(value || "").trim());
}

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: options.maxBuffer || 1024 * 1024 * 16,
    timeout: options.timeoutMs || 30000
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
}

function parseJsonArray(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return [];
  }
  try {
    return [].concat(JSON.parse(trimmed)).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function runPowershellJson(command) {
  const result = run("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
    timeoutMs: 20000,
    maxBuffer: 1024 * 1024 * 4
  });
  return {
    ok: result.ok,
    rows: parseJsonArray(result.stdout),
    error: result.ok ? null : (result.stderr || result.stdout || "PowerShell command failed")
  };
}

function readReport(relativePath) {
  const reportPath = path.join(paths.projectRoot, relativePath);
  return {
    path: reportPath,
    data: readJson(reportPath, null)
  };
}

function getWebCheck(report, name) {
  return (report?.checks || []).find((check) => check.name === name) || null;
}

function hasOkWebCheck(report, name) {
  return getWebCheck(report, name)?.ok === true;
}

function reportStatus(status, summary, evidence = {}, gaps = []) {
  return {
    status,
    summary,
    evidence,
    gaps
  };
}

function coverageForAggregate(report, expectedCount, extraChecks = {}) {
  const missingKeys = Array.isArray(report?.missingKeys) ? report.missingKeys : [];
  const aggregateOk = report?.aggregate === true;
  const countOk = Number(report?.expectedTotal || report?.total || 0) === expectedCount &&
    Number(report?.total || 0) === expectedCount &&
    Number(report?.passed || 0) === expectedCount &&
    Number(report?.failed || 0) === 0 &&
    missingKeys.length === 0;
  const missingRequestsOk = Number(report?.withMissingLogRequests || 0) === 0;
  const checks = {
    aggregateOk,
    countOk,
    missingRequestsOk,
    ...extraChecks
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    missingKeys
  };
}

function findLatestAs2AllIslandVisualReport(expectedCount) {
  const dir = path.join(paths.projectRoot, "runtime-data/qa/as2/interaction-smoke");
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^as2-interaction-smoke-\d+\.json$/u.test(entry.name))
      .map((entry) => {
        const reportPath = path.join(dir, entry.name);
        const stat = fs.statSync(reportPath);
        return { name: entry.name, path: reportPath, mtimeMs: stat.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (_error) {
    return { ok: false, path: null, reason: "as2 visual report directory not readable" };
  }

  for (const entry of entries) {
    const report = readJson(entry.path, null);
    const failedKeys = Array.isArray(report?.failedKeys) ? report.failedKeys : [];
    const ok = report?.ok === true &&
      Number(report?.total || 0) === expectedCount &&
      Number(report?.passed || 0) === expectedCount &&
      Number(report?.failed || 0) === 0 &&
      Number(report?.visualGuardPassed || 0) === expectedCount &&
      Number(report?.mapClicksPassed || 0) === expectedCount &&
      Number(report?.sceneEvidencePassed || 0) === expectedCount &&
      Number(report?.withMissingLogRequests || 0) === 0 &&
      failedKeys.length === 0;
    if (ok) {
      return {
        ok: true,
        path: entry.path,
        generatedAt: report.generatedAt || null,
        total: report.total,
        passed: report.passed,
        visualGuardPassed: report.visualGuardPassed,
        mapClicksPassed: report.mapClicksPassed,
        sceneEvidencePassed: report.sceneEvidencePassed,
        withMissingLogRequests: report.withMissingLogRequests,
        representativeDefault: report.representativeDefault === true
      };
    }
  }

  return { ok: false, path: null, reason: "no all-island AS2 visual/map/scene report found" };
}

function as3SceneSignalsOk(report, expectedCount) {
  const reports = Array.isArray(report?.reports) ? report.reports : [];
  return reports.length === expectedCount && reports.every((islandReport) =>
    Number(islandReport?.logSummary?.sceneLoadedCount || 0) > 0 ||
    Number(islandReport?.logSummary?.sceneMediaRequestCount || 0) > 0
  );
}

function gitEvidence() {
  const status = run("git", ["status", "--short", "--branch"], { timeoutMs: 30000 });
  const log = run("git", ["log", "-1", "--oneline"], { timeoutMs: 30000 });
  const lines = status.stdout.split(/\r?\n/u).filter(Boolean);
  const branchLine = lines[0] || "";
  return {
    ok: status.ok && log.ok,
    clean: lines.length === 1 && /\.\.\.origin\/main\b/u.test(branchLine) && !/\[(?:ahead|behind|gone)/iu.test(branchLine),
    branchLine,
    latestCommit: log.stdout,
    rawStatus: status.stdout,
    error: status.ok && log.ok ? null : [status.stderr, log.stderr].filter(Boolean).join("\n")
  };
}

function runtimeProcessEvidence() {
  const processes = runPowershellJson([
    "$rows = @(Get-Process flashpointnavigator,FPNavigator,FlashpointSecurePlayer,electron,node -ErrorAction SilentlyContinue |",
    "Where-Object { $_.Path -like '*Poptropica*' -or $_.MainWindowTitle -like '*Poptropica*' -or $_.ProcessName -in @('flashpointnavigator','FPNavigator','FlashpointSecurePlayer') } |",
    "Select-Object Id,ProcessName,MainWindowTitle,Path);",
    "$rows | ConvertTo-Json -Compress -Depth 4"
  ].join(" "));
  const listeners = runPowershellJson([
    "$rows = @(Get-NetTCPConnection -LocalPort 22800 -State Listen -ErrorAction SilentlyContinue |",
    "Select-Object LocalAddress,LocalPort,OwningProcess);",
    "$rows | ConvertTo-Json -Compress -Depth 4"
  ].join(" "));
  return {
    ok: processes.ok && listeners.ok,
    runtimeProcessCount: processes.rows.length,
    port22800ListenerCount: listeners.rows.length,
    processes: processes.rows,
    port22800Listeners: listeners.rows,
    errors: [processes.error, listeners.error].filter(Boolean)
  };
}

function buildRequirementResults({ manifest, reports, packageJson, git, runtimeProcesses }) {
  const entries = manifest.entries || [];
  const launchable = entries.filter((entry) => entry.launchable);
  const unresolved = entries.filter((entry) => !entry.launchable);
  const as2Launchable = launchable.filter((entry) => entry.sourceGroup === "as2");
  const as3Launchable = launchable.filter((entry) => entry.sourceGroup === "as3" && entry.launchMode === "as3-direct-scene");

  const as2Coverage = coverageForAggregate(reports.as2Aggregate.data, as2Launchable.length, {
    audioOk: Number(reports.as2Aggregate.data?.audioActive || 0) === as2Launchable.length,
    mapOk: Number(reports.as2Aggregate.data?.mapClicksPassed || 0) === as2Launchable.length,
    sceneOk: Number(reports.as2Aggregate.data?.sceneEvidencePassed || 0) === as2Launchable.length
  });
  const as3Coverage = coverageForAggregate(reports.as3Aggregate.data, as3Launchable.length, {
    audioOk: Number(reports.as3Aggregate.data?.audioActive || 0) === as3Launchable.length,
    sceneOk: as3SceneSignalsOk(reports.as3Aggregate.data, as3Launchable.length)
  });

  const web = reports.webLauncher.data;
  const webOk = web?.ok === true &&
    hasOkWebCheck(web, "healthz") &&
    hasOkWebCheck(web, "page") &&
    hasOkWebCheck(web, "state") &&
    hasOkWebCheck(web, "runtime-dry-run") &&
    hasOkWebCheck(web, "island-dry-run") &&
    hasOkWebCheck(web, "browser-render") &&
    hasOkWebCheck(web, "no-spawn-browser-render") &&
    hasOkWebCheck(web, "no-spawn-mode");

  const pack = reports.packInputs.data;
  const packOk = pack?.ok === true &&
    (pack.reports || []).some((report) => report.sourceGroup === "as2" && report.ok) &&
    (pack.reports || []).some((report) => report.sourceGroup === "as3" && report.ok);

  const sound = reports.soundRefs.data;
  const soundOk = sound?.ok === true &&
    Number(sound.missing || 0) === 0 &&
    Number(sound.fixableAddExtension || 0) === 0 &&
    Number(sound.fixableDedupeExtension || 0) === 0 &&
    Number(sound.crossFolderMatches || 0) === 0 &&
    Number(reports.as2Aggregate.data?.audioActive || 0) === as2Launchable.length &&
    Number(reports.as3Aggregate.data?.audioActive || 0) === as3Launchable.length;

  const as3Interaction = reports.as3Interaction.data;
  const as3InteractionVisualOk = as3Interaction?.ok === true &&
    Number(as3Interaction.visualGuardPassed || 0) === Number(as3Interaction.total || 0) &&
    Number(as3Interaction.total || 0) > 0;
  const as2AllIslandVisual = findLatestAs2AllIslandVisualReport(as2Launchable.length);
  const as2VisualAllIslandOk = as2AllIslandVisual.ok === true;

  const scripts = packageJson.scripts || {};
  const requirements = [
    {
      id: "all_islands_manifest_and_entry",
      title: "所有岛屿完全可用",
      ...reportStatus(
        unresolved.length === 0 && as2Coverage.ok && as3Coverage.ok ? "proved" : "incomplete",
        unresolved.length === 0
          ? "Manifest has no unresolved islands, and launchable AS2/AS3 aggregate evidence is complete."
          : `Manifest still has ${unresolved.length} unresolved island(s), although launchable AS2/AS3 aggregate evidence is complete.`,
        {
          manifestSummary: manifest.summary,
          as2Launchable: as2Launchable.length,
          as3LaunchableDirectScenes: as3Launchable.length,
          as2Aggregate: {
            ok: as2Coverage.ok,
            total: reports.as2Aggregate.data?.total,
            passed: reports.as2Aggregate.data?.passed,
            audioActive: reports.as2Aggregate.data?.audioActive,
            mapClicksPassed: reports.as2Aggregate.data?.mapClicksPassed,
            sceneEvidencePassed: reports.as2Aggregate.data?.sceneEvidencePassed,
            withMissingLogRequests: reports.as2Aggregate.data?.withMissingLogRequests
          },
          as3Aggregate: {
            ok: as3Coverage.ok,
            total: reports.as3Aggregate.data?.total,
            passed: reports.as3Aggregate.data?.passed,
            audioActive: reports.as3Aggregate.data?.audioActive,
            sceneEvidencePassed: reports.as3Aggregate.data?.sceneEvidencePassed,
            withMissingLogRequests: reports.as3Aggregate.data?.withMissingLogRequests
          },
          unresolved: unresolved.map((entry) => ({
            canonicalKey: entry.canonicalKey,
            sourceGroup: entry.sourceGroup,
            notes: entry.notes || []
          }))
        },
        unresolved.map((entry) => `${entry.canonicalKey}: ${entry.notes?.join("; ") || "unresolved launch scene"}`)
      )
    },
    {
      id: "local_browser_and_deployment_boundary",
      title: "本地浏览器可打开，并为后续服务器部署保留边界",
      ...reportStatus(
        webOk && scripts["web:launcher"] && scripts["web:launcher:no-spawn"] ? "proved" : "incomplete",
        webOk ? "Local and no-spawn browser launcher evidence is green." : "Web launcher smoke evidence is missing or failing.",
        {
          scripts: {
            webLauncher: scripts["web:launcher"] || null,
            webLauncherNoSpawn: scripts["web:launcher:no-spawn"] || null
          },
          checks: (web?.checks || []).map((check) => ({ name: check.name, ok: check.ok }))
        },
        webOk ? [] : ["Run npm run qa:web-launcher and inspect failing checks."]
      )
    },
    {
      id: "translation_pack_inputs",
      title: "全量翻译和 pack 输入一致性",
      ...reportStatus(
        packOk ? "partial" : "missing",
        packOk
          ? "Tracked runtime replacement inputs are consistent for AS2 and AS3; this is strong pack-integrity evidence but not a complete visual proof of every translated string."
          : "No current pack-input verifier artifact proves AS2/AS3 replacement consistency.",
        {
          packInputs: pack || null
        },
        packOk ? ["Need a broader text/visual translation coverage audit before marking all translations fully proved."] : ["Run npm run verify:pack-inputs."]
      )
    },
    {
      id: "ui_layout_and_resize",
      title: "UI 位置正确、窗口可调大小且对话/UI 稳定",
      ...reportStatus(
        as3InteractionVisualOk && as2VisualAllIslandOk ? "proved" : "partial",
        as3InteractionVisualOk && as2VisualAllIslandOk
          ? "AS2 all-island resize/visual guard and representative AS3 interaction visual guard are green."
          : "Resize/visual-guard evidence is still incomplete across AS2 and AS3.",
        {
          as3InteractionLatest: {
            total: as3Interaction?.total,
            passed: as3Interaction?.passed,
            visualGuardPassed: as3Interaction?.visualGuardPassed,
            sceneEvidencePassed: as3Interaction?.sceneEvidencePassed
          },
          as2AllIslandVisual,
          as2LatestVisualGuardPassed: reports.as2Aggregate.data?.visualGuardPassed || 0,
          as2Launchable: as2Launchable.length
        },
        [
          ...(as2VisualAllIslandOk ? [] : ["Add/refresh AS2 visual-guard coverage for all launchable AS2 islands."]),
          ...(as3InteractionVisualOk ? [] : ["Refresh AS3 interaction visual-guard evidence."])
        ]
      )
    },
    {
      id: "scene_entry_stability",
      title: "所有游戏场景能正确进入，不白屏、不卡死、不崩溃、不溢出",
      ...reportStatus(
        unresolved.length === 0 && as2Coverage.ok && as3Coverage.ok ? "proved" : "incomplete",
        "Launchable AS2/AS3 default entry evidence is green, but unresolved manifest entries prevent full completion.",
        {
          unresolvedCount: unresolved.length,
          as2Coverage: as2Coverage.checks,
          as3Coverage: as3Coverage.checks
        },
        unresolved.length === 0 ? [] : ["Resolve or legitimately source missing launch resources for unresolved islands."]
      )
    },
    {
      id: "runtime_audio",
      title: "所有岛屿声音正常并补全运行时声音引用",
      ...reportStatus(
        soundOk ? "proved" : "incomplete",
        soundOk
          ? "Runtime AS3 sound-reference audit is clean, and AS2/AS3 aggregate reports show active audio for every launchable island."
          : "Runtime audio evidence is missing or incomplete.",
        {
          soundReferenceAudit: sound || null,
          as2AudioActive: reports.as2Aggregate.data?.audioActive,
          as3AudioActive: reports.as3Aggregate.data?.audioActive
        },
        soundOk ? [] : ["Run npm run audit:sound-refs:runtime and aggregate audio-enabled AS2/AS3 reports."]
      )
    },
    {
      id: "no_main_display_or_mouse_interference",
      title: "尽量后台测试，不干扰主显示器和鼠标",
      ...reportStatus(
        runtimeProcesses.ok && runtimeProcesses.runtimeProcessCount === 0 && runtimeProcesses.port22800ListenerCount === 0 ? "proved" : "partial",
        "Current audit left no game/browser launcher runtime processes or 22800 listener behind.",
        runtimeProcesses,
        runtimeProcesses.runtimeProcessCount === 0 && runtimeProcesses.port22800ListenerCount === 0
          ? []
          : ["Stop leftover runtime processes/listeners before continuing."]
      )
    },
    {
      id: "launcher_ipc_and_safe_sizing",
      title: "Launcher UI / IPC 使用 G32QC 和安全窗口尺寸",
      ...reportStatus(
        reports.launcherIpc.data?.ok === true ? "proved" : "missing",
        reports.launcherIpc.data?.ok === true
          ? "Launcher IPC background smoke validates AS3 safe maximize, AS2 default sizing, inherited sizing, busy-launch guard, and G32QC target."
          : "Launcher IPC smoke evidence is missing or failing.",
        {
          launcherIpc: reports.launcherIpc.data
            ? {
                ok: reports.launcherIpc.data.ok,
                registeredHandlerCount: reports.launcherIpc.data.registeredHandlerCount,
                assertions: reports.launcherIpc.data.assertions
              }
            : null
        },
        reports.launcherIpc.data?.ok === true ? [] : ["Run npm run qa:launcher-ipc."]
      )
    },
    {
      id: "github_sync",
      title: "修改留痕并同步到 GitHub repo",
      ...reportStatus(
        git.clean ? "proved" : "partial",
        git.clean ? "Git worktree is clean and main is aligned with origin/main." : "Git worktree is not currently clean/aligned.",
        git,
        git.clean ? [] : ["Commit and push current changes, then rerun the audit."]
      )
    }
  ];

  return requirements;
}

function summarizeRequirements(requirements) {
  const byStatus = requirements.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  return {
    total: requirements.length,
    proved: byStatus.proved || 0,
    partial: byStatus.partial || 0,
    incomplete: byStatus.incomplete || 0,
    missing: byStatus.missing || 0,
    completionReady: requirements.every((item) => item.status === "proved"),
    incompleteIds: requirements.filter((item) => item.status !== "proved").map((item) => item.id)
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const manifest = generateLaunchManifest(config, { write: false });
  const packageJson = readJson(path.join(paths.projectRoot, "package.json"), {});
  const reports = {
    as2Aggregate: readReport("runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-latest.json"),
    as3Aggregate: readReport("runtime-data/qa/as3/islands-smoke/as3-island-smoke-latest.json"),
    as3Interaction: readReport("runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-latest.json"),
    webLauncher: readReport("runtime-data/qa/web-launcher-smoke.json"),
    launcherIpc: readReport("runtime-data/qa/launcher-ipc-smoke.json"),
    soundRefs: readReport("runtime-data/qa/sound-reference-audit-runtime.json"),
    packInputs: readReport("runtime-data/qa/pack-inputs-latest.json")
  };
  const git = gitEvidence();
  const runtimeProcesses = runtimeProcessEvidence();
  const requirements = buildRequirementResults({
    manifest,
    reports,
    packageJson,
    git,
    runtimeProcesses
  });
  const summary = summarizeRequirements(requirements);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    strict: flagEnabled(args.strict),
    goalComplete: summary.completionReady,
    summary,
    manifest: {
      generatedAt: manifest.generatedAt,
      summary: manifest.summary
    },
    artifacts: Object.fromEntries(Object.entries(reports).map(([key, value]) => [key, value.path])),
    requirements
  };
  const outputPath = args.output || args.report || path.join(paths.qaDir, "goal-evidence-latest.json");
  writeJson(outputPath, report);
  printJson({
    ok: report.ok,
    generatedAt: report.generatedAt,
    goalComplete: report.goalComplete,
    summary: report.summary,
    reportPath: outputPath
  });
  if (flagEnabled(args.strict) && !report.goalComplete) {
    process.exitCode = 1;
  }
}

main();
