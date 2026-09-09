const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, removeDirContents, writeJson } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_SHELL_ENTRY = "content/www.poptropica.com/game/Shell.swf";
const AS3_DIRECT_WRAPPER_ENTRY = "content/www.poptropica.com/flashpoint/as3-direct.php";

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function findSevenZip(config) {
  const candidates = [
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "x64", "7za.exe") : null,
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "ia32", "7za.exe") : null,
    "C:\\Program Files\\AMD\\CIM\\Bin64\\7z.exe",
    "C:\\Program Files\\Autodesk\\AdODIS\\V1\\Setup\\7za.exe"
  ];
  return candidates.find((candidate) => candidate && fileExists(candidate)) || null;
}

function runSevenZip(sevenZip, args, options = {}) {
  const result = spawnSync(sevenZip, args, {
    cwd: options.cwd || paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || result.error?.message || "7-Zip command failed").trim());
  }
  return result;
}

function main() {
  const config = loadConfig();
  const sevenZip = findSevenZip(config);
  const packShellPath = path.join(paths.as3PackDir, "swf", AS3_SHELL_ENTRY.replace(/\//gu, path.sep));
  const directWrapperPath = path.join(paths.as3PackDir, "files", AS3_DIRECT_WRAPPER_ENTRY.replace(/\//gu, path.sep));
  const runtimeZipPath = paths.as3RuntimeZipPath;

  if (!sevenZip) {
    throw new Error("No 7-Zip executable was found for shell-only runtime update.");
  }
  if (!fileExists(packShellPath)) {
    throw new Error(`Patched AS3 Shell is missing: ${packShellPath}`);
  }
  if (!fileExists(runtimeZipPath)) {
    throw new Error(`AS3 runtime zip is missing: ${runtimeZipPath}`);
  }

  const beforeZipSha256 = sha256File(runtimeZipPath);
  const shellSha256 = sha256File(packShellPath);
  const workDir = path.join(paths.tempDir, `as3-shell-only-${process.pid}-${Date.now()}`);
  const entries = [
    {
      entry: AS3_SHELL_ENTRY,
      sourceFilePath: packShellPath,
      sha256: shellSha256
    }
  ];
  if (fileExists(directWrapperPath)) {
    entries.push({
      entry: AS3_DIRECT_WRAPPER_ENTRY,
      sourceFilePath: directWrapperPath,
      sha256: sha256File(directWrapperPath)
    });
  }
  removeDirContents(workDir);
  for (const entry of entries) {
    const stagedPath = path.join(workDir, entry.entry.replace(/\//gu, path.sep));
    ensureDirSync(path.dirname(stagedPath));
    fs.copyFileSync(entry.sourceFilePath, stagedPath);
  }

  runSevenZip(sevenZip, ["u", "-tzip", runtimeZipPath, ...entries.map((entry) => entry.entry), "-mx=1", "-bsp0"], {
    cwd: workDir
  });
  runSevenZip(sevenZip, ["t", runtimeZipPath]);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    runtimeZipPath,
    entries,
    packShellPath,
    shellSha256,
    beforeZipSha256,
    afterZipSha256: sha256File(runtimeZipPath),
    sevenZip
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-runtime-shell-only-update.json");
  ensureDirSync(path.dirname(reportPath));
  writeJson(reportPath, report);
  fs.rmSync(workDir, { recursive: true, force: true });
  printJson({ ...report, reportPath });
}

main();
