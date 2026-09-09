const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const {
  ensureDirSync,
  fileExists,
  readJson,
  removeDirContents,
  writeJson,
  writeText
} = require("./lib/fs-utils");
const paths = require("./lib/paths");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const AS2_DOWNTOWN_PATH = "content/www.poptropica.com/scenes/islandSuper/sceneDownTown.swf";
const DISALLOWED_SWF_ASSET_IDS = new Set([
  "as3-shell:scene-static-text-overlays",
  "as3-shell:inventory-tab-prize-art-zh",
  "as3-shell:hud-menu-label-zh"
]);

function runFfdec(ffdecCli, args, label) {
  const result = spawnSync(ffdecCli, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 128,
    timeout: 300000
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim()}`);
  }
  return result;
}

function findScript(root, suffix) {
  const normalizedSuffix = suffix.replace(/\//gu, path.sep).toLowerCase();
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (fullPath.toLowerCase().endsWith(normalizedSuffix)) {
        return fullPath;
      }
    }
  }
  return null;
}

function listAsScripts(root) {
  if (!fileExists(root)) {
    return [];
  }
  const scripts = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.as$/iu.test(entry.name)) {
        scripts.push(fullPath);
      }
    }
  }
  return scripts.sort((left, right) => left.localeCompare(right, "en"));
}

function replaceSingle(ffdecCli, inputSwf, outputSwf, replaceTarget, scriptFile) {
  runFfdec(ffdecCli, ["-replace", inputSwf, outputSwf, replaceTarget, scriptFile], `replace ${replaceTarget}`);
}

function replaceSequential(ffdecCli, inputSwf, outputSwf, replacements) {
  if (!replacements.length) {
    if (inputSwf !== outputSwf) {
      fs.copyFileSync(inputSwf, outputSwf);
    }
    return;
  }
  let currentInput = inputSwf;
  const tempOutputs = [];
  for (let index = 0; index < replacements.length; index += 1) {
    const nextOutput = index === replacements.length - 1
      ? outputSwf
      : path.join(paths.tempDir, `strip-overlay-replace-${Date.now()}-${index}.swf`);
    replaceSingle(ffdecCli, currentInput, nextOutput, replacements[index].replaceTarget, replacements[index].filePath);
    if (nextOutput !== outputSwf) {
      tempOutputs.push(nextOutput);
    }
    currentInput = nextOutput;
  }
  for (const tempFile of tempOutputs) {
    fs.rmSync(tempFile, { force: true });
  }
}

function stripGameScene(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const before = next;
  next = next.replace(/\n\s*this\.zhApplyStaticSceneTextOverlays\(\);/gu, "");
  const methodStart = next.indexOf("\n      private function zhApplyStaticSceneTextOverlays");
  if (methodStart !== -1) {
    const methodEnd = next.indexOf("\n      protected function addGroups", methodStart);
    if (methodEnd === -1) {
      throw new Error("Unable to locate end of GameScene static overlay methods.");
    }
    next = `${next.slice(0, methodStart)}${next.slice(methodEnd)}`;
  }
  if (next.includes("zhApplyStaticSceneTextOverlays") || next.includes("zhStaticSceneTextOverlays")) {
    throw new Error("GameScene still contains static scene overlay markers after strip.");
  }
  return { changed: next !== before, content: next };
}

function stripInventoryTab(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const before = next;
  next = next.replace(/\n\s*this\.zhLocalizeStaticTabArt\((?:MovieClip\()?super\.displayObject\)?\);/gu, "");
  const methodStart = next.indexOf("\n      private function zhLocalizeStaticTabArt");
  if (methodStart !== -1) {
    const methodEnd = next.indexOf("\n   }\n}", methodStart);
    if (methodEnd === -1) {
      throw new Error("Unable to locate end of InventoryTab static tab overlay method.");
    }
    next = `${next.slice(0, methodStart)}${next.slice(methodEnd)}`;
  }
  if (next.includes("zhLocalizeStaticTabArt") || next.includes("zhPrizeOverlay") || next.includes('text = "奖品"')) {
    throw new Error("InventoryTab still contains static prize overlay markers after strip.");
  }
  return { changed: next !== before, content: next };
}

function stripAs2DowntownScript(content) {
  const before = String(content || "").replace(/\r\n/gu, "\n");
  const next = before.replace(
    /\n?function zhAddDownTownMainStreetLabel\(targetClip\)\n\{[\s\S]*?\n\}\nzhAddDownTownMainStreetLabel\(this\);/u,
    ""
  );
  if (next.includes("zhAddDownTownMainStreetLabel") || next.includes("__zhMainStreetLabel")) {
    throw new Error("AS2 DownTown script still contains static label overlay markers after strip.");
  }
  return { changed: next !== before, content: next };
}

function filterManifestOverlayAssets(manifestPath, extra = {}) {
  const manifest = fileExists(manifestPath) ? readJson(manifestPath, {}) : {};
  const beforeCount = Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets.length : 0;
  manifest.swfPatchedAssets = (Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [])
    .filter((entry) => !DISALLOWED_SWF_ASSET_IDS.has(entry?.assetId));
  manifest.staticTextOverlayPolicy = {
    generatedAt: new Date().toISOString(),
    status: "disabled",
    rule: "Do not translate scene signs, static icon art, logos, or other bitmap/static artwork with TextField overlays. Keep native art unchanged unless a real bitmap replacement pipeline is used.",
    ...extra
  };
  writeJson(manifestPath, manifest);
  return {
    manifestPath,
    removedSwfPatchedAssetEntries: beforeCount - manifest.swfPatchedAssets.length
  };
}

function stripAs3(config) {
  const ffdecCli = config.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("FFDec CLI is not configured.");
  }
  const packShell = path.join(paths.as3PackDir, "swf", AS3_SHELL_PATH.replace(/\//gu, path.sep));
  if (!fileExists(packShell)) {
    throw new Error(`AS3 pack Shell.swf is missing: ${packShell}`);
  }

  const workDir = path.join(paths.tempDir, "strip-as3-static-overlays");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  const outputSwf = path.join(workDir, "Shell.swf");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    "game.scene.template.GameScene,game.ui.inventory.InventoryTab",
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export AS3 static overlay classes");

  const replacements = [];
  const gameScenePath = findScript(scriptRoot, "game/scene/template/GameScene.as");
  if (gameScenePath) {
    const stripped = stripGameScene(fs.readFileSync(gameScenePath, "utf8"));
    if (stripped.changed) {
      writeText(gameScenePath, stripped.content);
      replacements.push({
        filePath: gameScenePath,
        replaceTarget: "game.scene.template.GameScene"
      });
    }
  }

  const inventoryTabPath = findScript(scriptRoot, "game/ui/inventory/InventoryTab.as");
  if (inventoryTabPath) {
    const stripped = stripInventoryTab(fs.readFileSync(inventoryTabPath, "utf8"));
    if (stripped.changed) {
      writeText(inventoryTabPath, stripped.content);
      replacements.push({
        filePath: inventoryTabPath,
        replaceTarget: "game.ui.inventory.InventoryTab"
      });
    }
  }

  replaceSequential(ffdecCli, packShell, outputSwf, replacements);
  fs.copyFileSync(outputSwf, packShell);
  const manifestUpdate = filterManifestOverlayAssets(path.join(paths.as3PackDir, "manifest.json"), {
    sourceGroup: "as3",
    strippedClasses: replacements.map((entry) => entry.replaceTarget)
  });
  const manifest = readJson(manifestUpdate.manifestPath, {});
  const runtimeZip = buildRuntimeZipForSourceGroup({ config, sourceGroup: "as3", manifest });
  writeJson(manifestUpdate.manifestPath, manifest);
  return {
    ok: true,
    sourceGroup: "as3",
    packShell,
    replacements: replacements.map((entry) => entry.replaceTarget),
    manifestUpdate,
    runtimeZip
  };
}

function stripAs2(config) {
  const ffdecCli = config.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("FFDec CLI is not configured.");
  }
  const packSwf = path.join(paths.as2PackDir, "swf", AS2_DOWNTOWN_PATH.replace(/\//gu, path.sep));
  if (!fileExists(packSwf)) {
    return {
      ok: true,
      sourceGroup: "as2",
      skipped: true,
      reason: `AS2 DownTown pack SWF is missing: ${packSwf}`
    };
  }

  const workDir = path.join(paths.tempDir, "strip-as2-static-overlays");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  const outputSwf = path.join(workDir, "sceneDownTown.swf");
  runFfdec(ffdecCli, ["-cli", "-export", "script", scriptRoot, packSwf], "export AS2 DownTown scripts");

  const replacements = [];
  for (const scriptPath of listAsScripts(scriptRoot)) {
    const original = fs.readFileSync(scriptPath, "utf8");
    if (!original.includes("zhAddDownTownMainStreetLabel")) {
      continue;
    }
    const stripped = stripAs2DowntownScript(original);
    if (stripped.changed) {
      writeText(scriptPath, stripped.content);
      const relative = path.relative(scriptRoot, scriptPath).replace(/\\/gu, "/");
      replacements.push({
        filePath: scriptPath,
        exportPath: relative,
        replaceTarget: `\\${relative.replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`
      });
    }
  }

  replaceSequential(ffdecCli, packSwf, outputSwf, replacements);
  fs.copyFileSync(outputSwf, packSwf);
  const manifestPath = path.join(paths.as2PackDir, "manifest.json");
  const manifest = fileExists(manifestPath) ? readJson(manifestPath, {}) : {};
  manifest.staticTextOverlayPolicy = {
    generatedAt: new Date().toISOString(),
    status: "disabled",
    rule: "Do not translate scene signs or other static artwork with TextField overlays. Keep original art unless a real bitmap replacement pipeline is used.",
    strippedAssetPath: AS2_DOWNTOWN_PATH,
    strippedScripts: replacements.map((entry) => entry.exportPath)
  };
  writeJson(manifestPath, manifest);
  const runtimeZip = buildRuntimeZipForSourceGroup({ config, sourceGroup: "as2", manifest });
  writeJson(manifestPath, manifest);
  return {
    ok: true,
    sourceGroup: "as2",
    packSwf,
    replacements: replacements.map((entry) => ({
      exportPath: entry.exportPath,
      replaceTarget: entry.replaceTarget
    })),
    manifestPath,
    runtimeZip
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const runAs3 = args.as3 || (!args.as2 && !args.as3);
  const runAs2 = args.as2 || (!args.as2 && !args.as3);
  const results = [];
  if (runAs3) {
    results.push(stripAs3(config));
  }
  if (runAs2) {
    results.push(stripAs2(config));
  }
  const report = {
    ok: results.every((result) => result.ok),
    generatedAt: new Date().toISOString(),
    policy: "Native translatable resources remain localized. TextField overlay translations for static signs, labels, logos, and static icon art are disabled.",
    results
  };
  const reportPath = path.join(paths.qaDir, "static-text-overlays-strip-latest.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
