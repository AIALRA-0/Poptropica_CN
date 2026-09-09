const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, writeJson } = require("./lib/fs-utils");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const PATCH_CLASS = "game.scenes.ghd.neonWiener.NeonWiener";
const PATCH_ASSET_ID = "as3-ghd-neon-dialog-guard";

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_error) {
    return false;
  }
}

function removeDirContents(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function runFfdec(ffdecCli, args, label) {
  const result = spawnSync(ffdecCli, args, {
    cwd: paths.projectRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim()}`);
  }
  return result;
}

function findScript(root, relativePath) {
  const wanted = relativePath.replace(/\\/gu, "/").toLowerCase();
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        const rel = path.relative(root, fullPath).replace(/\\/gu, "/").toLowerCase();
        if (rel.endsWith(wanted)) {
          return fullPath;
        }
      }
    }
  }
  return null;
}

function patchNeonWiener(source) {
  const before = `                  dialog.sayById(param2);
                  this._flashpointQaGhdNeonDialogSpoken = true;`;
  const after = `                  dialog.setCurrentById(param2);
                  CharUtils.sayDialog(target);
                  this._flashpointQaGhdNeonDialogSpoken = true;`;
  const alreadyPatched = source.includes("dialog.setCurrentById(param2)") && source.includes("CharUtils.sayDialog(target)");
  if (!source.includes(before) && !source.includes(after) && !alreadyPatched) {
    throw new Error("Unable to locate GHD NeonWiener QA dialogue sayById block.");
  }
  const next = source.includes(before) ? source.replace(before, after) : source;
  const required = [
    "private function flashpointQaSayGhdNeonDialog",
    "dialog.setCurrentById(param2)",
    "CharUtils.sayDialog(target)",
    "this._flashpointQaGhdNeonDialogSpoken = true"
  ];
  const missing = required.filter((fragment) => !next.includes(fragment));
  if (!next.includes("DialogData(dialogData).timeOverride = 60") && !next.includes("dialogData.timeOverride = 60")) {
    missing.push("dialogData timeOverride");
  }
  if (!next.includes("DialogData(dialogData).forceOnScreen = true") && !next.includes("dialogData.forceOnScreen = true")) {
    missing.push("dialogData forceOnScreen");
  }
  if (missing.length) {
    throw new Error(`GHD NeonWiener dialogue guard did not apply cleanly. Missing: ${missing.join(" | ")}`);
  }
  return next;
}

function main() {
  const config = loadConfig();
  const ffdecCli = config.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("FFDec CLI is not configured.");
  }

  const packShell = path.join(paths.as3PackDir, "swf", AS3_SHELL_PATH.replace(/\//gu, path.sep));
  if (!fileExists(packShell)) {
    throw new Error(`AS3 pack Shell.swf is missing: ${packShell}`);
  }

  const workDir = path.join(paths.tempDir, "as3-ghd-neon-dialog-guard-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");

  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    PATCH_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export GHD NeonWiener class");

  const scriptPath = findScript(scriptRoot, "game/scenes/ghd/neonWiener/NeonWiener.as");
  if (!scriptPath) {
    throw new Error("Exported NeonWiener.as was not found.");
  }
  fs.writeFileSync(scriptPath, patchNeonWiener(fs.readFileSync(scriptPath, "utf8")));

  const outputSwf = path.join(workDir, "Shell-ghd-neon-dialog-guard.swf");
  runFfdec(ffdecCli, [
    "-replace",
    packShell,
    outputSwf,
    PATCH_CLASS,
    scriptPath
  ], "replace GHD NeonWiener class");
  fs.copyFileSync(outputSwf, packShell);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    packShell,
    patchedClass: PATCH_CLASS,
    patchedScriptPath: scriptPath,
    patchAssetId: PATCH_ASSET_ID,
    patch: "Use native Dialog.setCurrentById plus CharUtils.sayDialog for GHD NeonWiener QA dialogue proofs so translated runtime lines render like normal character speech."
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-ghd-neon-dialog-guard-patch.json");
  writeJson(reportPath, report);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main();
