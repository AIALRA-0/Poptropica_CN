const path = require("node:path");
const { spawnSync } = require("node:child_process");
const paths = require("./lib/paths");
const { fileExists, readJson, writeJson } = require("./lib/fs-utils");

function runNodeScript(scriptName, args = [], timeoutMs = 120000) {
  const scriptPath = path.join(paths.toolsRoot, scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: timeoutMs,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1"
    }
  });
  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim()
  };
}

function runSmoke(timeoutMs = 30000) {
  const result = spawnSync(process.execPath, [path.join(paths.toolsRoot, "launch.js"), "--smoke"], {
    cwd: paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: timeoutMs,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1"
    }
  });
  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim()
  };
}

function killNavigator() {
  spawnSync("taskkill", ["/IM", "FPNavigator.exe", "/F"], {
    encoding: "utf8",
    windowsHide: true
  });
}

function parseJsonOutput(result) {
  if (!result.stdout) {
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch (_error) {
    return null;
  }
}

function addStep(steps, label, result, details) {
  steps.push({
    label,
    ok: Boolean(result?.ok),
    exitCode: result?.exitCode ?? null,
    details: details || parseJsonOutput(result) || {
      stdout: result?.stdout || "",
      stderr: result?.stderr || ""
    }
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function summarize(report) {
  const failed = report.steps.filter((step) => !step.ok);
  return {
    passed: failed.length === 0,
    totalSteps: report.steps.length,
    failedSteps: failed.map((step) => step.label),
    launchableCount: report.doctor?.launchManifest?.launchableCount || 0,
    as3PatchedZipReady: Boolean(report.packMeta?.manifests?.as3?.runtimeZip?.status === "ready"),
    checkedIslands: report.launchedIslands
  };
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    steps: [],
    launchedIslands: [],
    doctor: null,
    packMeta: readJson(paths.packMetaPath, null)
  };

  try {
    const bootstrap = runNodeScript("bootstrap-flashpoint.js");
    addStep(report.steps, "准备托管运行环境", bootstrap);
    assert(bootstrap.ok, "bootstrap:flashpoint failed");

    const discover = runNodeScript("discover-launch-scenes.js");
    addStep(report.steps, "刷新可启动岛屿", discover);
    assert(discover.ok, "discover:launch-scenes failed");

    const doctor = runNodeScript("doctor-flashpoint.js");
    const doctorJson = parseJsonOutput(doctor);
    addStep(report.steps, "检查运行状态", doctor, doctorJson);
    assert(doctor.ok, "doctor:flashpoint failed");
    assert(doctorJson?.basePhp?.statusCode === 200, "base.php is not healthy");
    assert((doctorJson?.launchManifest?.launchableCount || 0) > 0, "no launchable islands were discovered");
    report.doctor = doctorJson;

    const smoke = runSmoke();
    addStep(report.steps, "打开并关闭启动器", smoke);
    assert(smoke.ok, "launcher smoke test failed");

    const audit = runNodeScript("window-audit.js");
    const auditJson = parseJsonOutput(audit);
    addStep(report.steps, "窗口审计", audit, auditJson);
    assert(audit.ok, "window audit failed");
    assert((auditJson?.summary?.shellPopupCount || 0) === 0, "shell popup windows are still visible");

    for (const sourceGroup of ["as3", "as2"]) {
      const runtimeLaunch = runNodeScript("launch.js", ["--runtime", sourceGroup], 60000);
      const runtimeJson = parseJsonOutput(runtimeLaunch);
      addStep(report.steps, `进入 ${sourceGroup.toUpperCase()} 旧版入口`, runtimeLaunch, runtimeJson);
      assert(runtimeLaunch.ok && runtimeJson?.ok, `runtime launch failed for ${sourceGroup}`);
      killNavigator();
    }

    for (const islandId of ["early-poptropica", "virus-hunter"]) {
      const launch = runNodeScript("launch.js", ["--island", islandId], 60000);
      const launchJson = parseJsonOutput(launch);
      addStep(report.steps, `高级直启 ${islandId}`, launch, launchJson);
      assert(launch.ok && launchJson?.ok, `launch failed for ${islandId}`);
      report.launchedIslands.push({
        islandId,
        source: launchJson.source,
        launchUrl: launchJson.launchEntry?.launchUrl || null
      });
      killNavigator();
    }

    assert(fileExists(paths.as3RuntimeZipPath), "patched AS3 runtime zip does not exist");

    report.summary = summarize(report);
    writeJson(paths.e2eQuickReportPath, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    report.summary = summarize(report);
    report.summary.passed = false;
    report.summary.error = error.message;
    writeJson(paths.e2eQuickReportPath, report);
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  } finally {
    killNavigator();
  }
}

main();
