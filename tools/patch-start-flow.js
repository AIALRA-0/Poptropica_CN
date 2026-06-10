const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const { openIndexDb } = require("./lib/db");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, listFilesRecursive, readJson, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");

const TARGET_SWFS = [
  "content/www.poptropica.com/game/assets/scenes/start/login/login.swf",
  "content/www.poptropica.com/game/assets/scenes/start/login/warning.swf",
  "content/www.poptropica.com/game/assets/scenes/start/startScreen/startScreen.swf",
  "content/www.poptropica.com/game/assets/scenes/start/startScreen/groups/profileGroup/profile.swf",
  "content/www.poptropica.com/game/assets/scenes/start/startScreen/groups/profileGroup/profileButton.swf",
  "content/www.poptropica.com/game/assets/scenes/start/startScreen/shared/greenButton.swf",
  "content/www.poptropica.com/game/assets/scenes/start/startScreen/shared/blueButton.swf",
  "content/www.poptropica.com/game/assets/scenes/start/startScreen/groups/customizerGroup/changeAll.swf",
  "content/www.poptropica.com/game/assets/scenes/start/startScreen/groups/customizerGroup/changeColors.swf",
  "content/www.poptropica.com/game/assets/scenes/start/startScreen/groups/customizerGroup/importLook.swf",
  "content/www.poptropica.com/game/assets/scenes/start/startScreen/groups/genderGroup/male.swf",
  "content/www.poptropica.com/game/assets/scenes/start/startScreen/groups/genderGroup/female.swf"
];

function stopRuntimeProcesses() {
  spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", "Get-Process electron,FlashpointSecurePlayer,FPNavigator,flashpointnavigator -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000
  });
}

function findSevenZip(config) {
  const candidates = [
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "x64", "7za.exe") : null,
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "ia32", "7za.exe") : null,
    "C:\\Program Files\\7-Zip\\7z.exe"
  ];
  return candidates.find((candidate) => candidate && fileExists(candidate)) || null;
}

function replaceSwfTexts({ ffdecCli, inputSwf, outputSwf, translatedFiles }) {
  if (!translatedFiles.length) {
    fs.copyFileSync(inputSwf, outputSwf);
    return { ok: true, replacedCount: 0 };
  }

  const tempDir = path.join(paths.tempDir, `start-flow-replace-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  ensureDirSync(tempDir);
  let currentInput = inputSwf;
  let step = 0;

  try {
    for (const entry of translatedFiles) {
      const characterId = Number.parseInt(path.basename(entry.exportPath, path.extname(entry.exportPath)), 10);
      if (!Number.isInteger(characterId)) {
        return { ok: false, error: `Unable to resolve character id from ${entry.exportPath}` };
      }
      const nextOutput = step === translatedFiles.length - 1 ? outputSwf : path.join(tempDir, `step-${step + 1}.swf`);
      ensureDirSync(path.dirname(nextOutput));
      const result = spawnSync(ffdecCli, ["-replace", currentInput, nextOutput, String(characterId), entry.filePath], {
        encoding: "utf8",
        windowsHide: true
      });
      if (result.status !== 0) {
        return { ok: false, error: (result.stderr || result.stdout || `FFDec replace failed for ${entry.exportPath}`).trim() };
      }
      currentInput = nextOutput;
      step += 1;
    }
    return { ok: true, replacedCount: translatedFiles.length };
  } finally {
    removeDirContents(tempDir);
  }
}

function main() {
  const config = loadConfig();
  const db = openIndexDb();
  const ffdecCli = config.tools.ffdecCli;
  const sevenZip = findSevenZip(config);
  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("FFDec CLI is not configured.");
  }
  if (!sevenZip) {
    throw new Error("7-Zip executable was not found.");
  }

  const rows = db.getStringsForPack("as3").filter((row) => TARGET_SWFS.includes(row.asset_path));
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.asset_id)) {
      grouped.set(row.asset_id, []);
    }
    grouped.get(row.asset_id).push(row);
  }

  const overlayRoot = path.join(paths.tempDir, "start-flow-overlay");
  removeDirContents(overlayRoot);
  ensureDirSync(overlayRoot);
  const patchedAssets = [];
  const skippedAssets = [];

  for (const [assetId, assetRows] of grouped.entries()) {
    const sample = assetRows[0];
    const metadata = JSON.parse(sample.metadata_json || "{}");
    const ffdecMeta = metadata.ffdec || {};
    if (!sample.extracted_path || !fileExists(sample.extracted_path) || !ffdecMeta.ok || !ffdecMeta.outputDir || !fileExists(ffdecMeta.outputDir)) {
      skippedAssets.push({
        assetId,
        assetPath: sample.asset_path,
        reason: "Missing extracted SWF or FFDec export directory."
      });
      continue;
    }

    const translatedRoot = path.join(paths.tempDir, "start-flow-texts", assetId);
    removeDirContents(translatedRoot);
    ensureDirSync(translatedRoot);
    for (const row of assetRows) {
      const context = JSON.parse(row.context_json || "{}");
      if (!context.exportPath || !context.lineNumber) {
        continue;
      }
      const sourceFile = path.join(ffdecMeta.outputDir, context.exportPath);
      if (!fileExists(sourceFile)) {
        continue;
      }
      const targetFile = path.join(translatedRoot, context.exportPath);
      ensureDirSync(path.dirname(targetFile));
      const lines = fs.readFileSync(sourceFile, "utf8").split(/\r?\n/u);
      lines[Math.max(0, context.lineNumber - 1)] = row.translated_text;
      writeText(targetFile, lines.join("\n"));
    }

    const translatedFiles = listFilesRecursive(translatedRoot)
      .filter((filePath) => /\.txt$/iu.test(filePath))
      .map((filePath) => ({
        filePath,
        exportPath: path.relative(translatedRoot, filePath).replace(/\\/gu, "/")
      }))
      .sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en"));

    const outputSwf = path.join(overlayRoot, sample.asset_path.replace(/\//gu, path.sep));
    ensureDirSync(path.dirname(outputSwf));
    const result = replaceSwfTexts({
      ffdecCli,
      inputSwf: sample.extracted_path,
      outputSwf,
      translatedFiles
    });

    if (!result.ok) {
      skippedAssets.push({
        assetId,
        assetPath: sample.asset_path,
        reason: result.error
      });
      continue;
    }

    patchedAssets.push({
      assetId,
      assetPath: sample.asset_path,
      outputSwf,
      replacedCount: result.replacedCount
    });
  }

  const runtimeZipPath = paths.as3RuntimeStartFlowZipPath;
  const sourceZip = config.sources.as3Gamezip;
  if (!sourceZip || !fileExists(sourceZip)) {
    throw new Error("AS3 source zip is missing.");
  }
  const baseZip = fileExists(paths.as3RuntimeZipPath) ? paths.as3RuntimeZipPath : sourceZip;

  stopRuntimeProcesses();
  ensureDirSync(path.dirname(runtimeZipPath));
  if (fileExists(runtimeZipPath)) {
    fs.rmSync(runtimeZipPath, { force: true });
  }
  fs.copyFileSync(baseZip, runtimeZipPath);

  const workingDir = path.join(paths.tempDir, "start-flow-runtimezip");
  removeDirContents(workingDir);
  ensureDirSync(workingDir);

  const extractResult = spawnSync(config.tools.tarBin || "tar", ["-xf", baseZip, "-C", workingDir], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 300000
  });
  if (extractResult.status !== 0) {
    throw new Error((extractResult.stderr || extractResult.stdout || "Failed to extract AS3 source zip").trim());
  }

  for (const filePath of listFilesRecursive(overlayRoot)) {
    const relativePath = path.relative(overlayRoot, filePath);
    const targetPath = path.join(workingDir, relativePath);
    ensureDirSync(path.dirname(targetPath));
    fs.copyFileSync(filePath, targetPath);
  }

  const createResult = spawnSync(sevenZip, ["a", "-tzip", runtimeZipPath, ".\\*", "-mx=1"], {
    cwd: workingDir,
    encoding: "utf8",
    windowsHide: true,
    timeout: 300000
  });
  if (createResult.status !== 0) {
    throw new Error((createResult.stderr || createResult.stdout || "7-Zip create failed").trim());
  }

  const metadataPath = `${runtimeZipPath}.meta.json`;
  const metadata = readJson(metadataPath, {});
  writeJson(metadataPath, {
    ...metadata,
    patchedAt: new Date().toISOString(),
    startFlowPatchVersion: 1,
    startFlowPatchedAssets: patchedAssets.map((asset) => ({
      assetPath: asset.assetPath,
      replacedCount: asset.replacedCount
    }))
  });

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    runtimeZipPath,
    patchedAssets,
    skippedAssets
  };
  const reportPath = path.join(paths.runtimeDataDir, "start-flow-patch-report.json");
  writeJson(reportPath, report);
  db.close();
  console.log(JSON.stringify({ ...report, reportPath, baseZip }, null, 2));
}

main();
