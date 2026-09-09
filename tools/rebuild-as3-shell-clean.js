const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, readJson, writeJson } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";

const PATCH_SEQUENCE = [
  {
    id: "qa-seed-events",
    script: "tools/patch-as3-shell-qa-seed-events.js",
    reason: "QA island event/start-position seeding"
  },
  {
    id: "layout-live",
    script: "tools/patch-as3-shell-layout-live.js",
    reason: "browser resize/fullscreen adaptive viewport"
  },
  {
    id: "loading-hold",
    script: "tools/patch-as3-shell-loading-hold.js",
    reason: "centered loading logo/progress and QA capture hold"
  },
  {
    id: "ui-text",
    script: "tools/patch-as3-shell-ui-text.js",
    reason: "CJK-safe native Shell UI/dialogue/menu text"
  },
  {
    id: "hud-labels",
    script: "tools/patch-as3-shell-hud-labels.js",
    reason: "remove Chinese overlay from static MENU art"
  }
];

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runChecked(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    cwd: paths.projectRoot,
    encoding: options.encoding ?? "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64,
    env: {
      ...process.env,
      POPTROPICA_QA_MUTE_RUNTIME: "1",
      POPTROPICA_SKIP_RUNTIME_REBUILD: "1"
    }
  });
  if (result.status !== 0) {
    const output = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8")
      : String(result.stderr || result.stdout || result.error?.message || "");
    throw new Error(`${label} failed: ${output.trim()}`);
  }
  return result;
}

function extractCleanShell(config, outputPath) {
  const sourceZip = config.sources?.as3Gamezip || path.join(paths.projectRoot, "AS3.zip");
  const tarBin = config.tools?.tarBin || "tar";
  if (!fileExists(sourceZip)) {
    throw new Error(`AS3 source zip is missing: ${sourceZip}`);
  }
  const result = spawnSync(tarBin, ["-xOf", sourceZip, AS3_SHELL_PATH], {
    cwd: paths.projectRoot,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0 || !result.stdout || result.stdout.length === 0) {
    const output = String(result.stderr || result.error?.message || "");
    throw new Error(`extract clean AS3 Shell failed: ${output.trim()}`);
  }
  ensureDirSync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, result.stdout);
  return {
    sourceZip,
    entry: AS3_SHELL_PATH,
    outputPath,
    sha256: sha256File(outputPath)
  };
}

function main() {
  const config = loadConfig();
  const packShell = path.join(paths.as3PackDir, "swf", AS3_SHELL_PATH.replace(/\//gu, path.sep));
  const cleanShell = extractCleanShell(config, packShell);
  const steps = [];

  for (const patch of PATCH_SEQUENCE) {
    const scriptPath = path.join(paths.projectRoot, patch.script);
    if (!fileExists(scriptPath)) {
      throw new Error(`Shell rebuild patch script is missing: ${scriptPath}`);
    }
    const beforeSha256 = sha256File(packShell);
    runChecked(process.execPath, [scriptPath], patch.id);
    steps.push({
      id: patch.id,
      script: patch.script,
      reason: patch.reason,
      beforeSha256,
      afterSha256: sha256File(packShell)
    });
  }

  const manifestPath = path.join(paths.as3PackDir, "manifest.json");
  const manifest = fileExists(manifestPath) ? readJson(manifestPath, {}) : {};
  const runtimeZip = buildRuntimeZipForSourceGroup({
    config,
    sourceGroup: "as3",
    manifest
  });
  writeJson(manifestPath, manifest);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    packShell,
    cleanShell,
    steps,
    finalSha256: sha256File(packShell),
    runtimeZip,
    note: "AS3 Shell rebuilt from clean AS3.zip base before applying the current fixed Shell patch sequence."
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-shell-clean-rebuild.json");
  ensureDirSync(path.dirname(reportPath));
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
