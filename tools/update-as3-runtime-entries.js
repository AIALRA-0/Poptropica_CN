const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, removeDirContents, writeJson } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

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

function toArchiveEntry(filePath) {
  const absolute = path.resolve(paths.projectRoot, filePath);
  const prefixes = [
    path.join(paths.as3PackDir, "files"),
    path.join(paths.as3PackDir, "swf")
  ];
  for (const prefix of prefixes) {
    const relative = path.relative(prefix, absolute);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      return {
        absolute,
        entry: relative.replace(/\\/gu, "/")
      };
    }
  }
  throw new Error(`AS3 runtime entry must be under packs/zh-CN/as3/files or packs/zh-CN/as3/swf: ${filePath}`);
}

function main() {
  const inputPaths = process.argv.slice(2).filter((entry) => entry && !entry.startsWith("-"));
  if (inputPaths.length === 0) {
    throw new Error("Usage: node tools/update-as3-runtime-entries.js <pack-file> [pack-file...]");
  }

  const config = loadConfig();
  const sevenZip = findSevenZip(config);
  const runtimeZipPath = paths.as3RuntimeZipPath;
  if (!sevenZip) {
    throw new Error("No 7-Zip executable was found for AS3 runtime entry update.");
  }
  if (!fileExists(runtimeZipPath)) {
    throw new Error(`AS3 runtime zip is missing: ${runtimeZipPath}`);
  }

  const beforeZipSha256 = sha256File(runtimeZipPath);
  const workDir = path.join(paths.tempDir, `as3-runtime-entries-${process.pid}-${Date.now()}`);
  const entries = inputPaths.map(toArchiveEntry).map((entry) => {
    if (!fileExists(entry.absolute)) {
      throw new Error(`Pack file is missing: ${entry.absolute}`);
    }
    return {
      ...entry,
      sha256: sha256File(entry.absolute)
    };
  });

  removeDirContents(workDir);
  for (const entry of entries) {
    const stagedPath = path.join(workDir, entry.entry.replace(/\//gu, path.sep));
    ensureDirSync(path.dirname(stagedPath));
    fs.copyFileSync(entry.absolute, stagedPath);
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
    beforeZipSha256,
    afterZipSha256: sha256File(runtimeZipPath),
    sevenZip
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-runtime-entries-update.json");
  ensureDirSync(path.dirname(reportPath));
  writeJson(reportPath, report);
  fs.rmSync(workDir, { recursive: true, force: true });
  printJson({ ...report, reportPath });
}

main();
