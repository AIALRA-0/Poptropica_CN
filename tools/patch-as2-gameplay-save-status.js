const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const {
  ensureDirSync,
  fileExists,
  readJson,
  removeDirContents,
  writeJson
} = require("./lib/fs-utils");

const AS2_GAMEPLAY_PATH = "content/www.poptropica.com/gameplay.swf";
const PATCH_ASSET_ID = "as2-shared:gameplay-save-status-suppression";

function runChecked(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 128,
    timeout: 300000,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim()}`);
  }
  return result;
}

function listAsScripts(root) {
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

function translatedScriptFileEntry(filePath, scriptRoot) {
  const exportPath = path.relative(scriptRoot, filePath).replace(/\\/gu, "/");
  return {
    filePath,
    exportPath,
    replaceTarget: `\\${exportPath.replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`
  };
}

function findFrameOneScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes("function sendSceneVisit()") && content.includes("navBar.savingGame");
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one gameplay frame_1 save-status script, found ${candidates.length}.`);
  }
  return candidates[0];
}

function findFrameFiveScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes('logWWW("***gameplay frame 5")') && content.includes("zhEnsureDirectMapButton");
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one gameplay frame_5 nav script, found ${candidates.length}.`);
  }
  return candidates[0];
}

function insertSuppressHelper(content) {
  if (content.includes("function zhSuppressSavingGame()")) {
    return content;
  }
  const marker = "function layoutFramelessGameplayNav(forceLayout)\n{";
  if (!content.includes(marker)) {
    throw new Error("Unable to locate layoutFramelessGameplayNav helper insertion point.");
  }
  const helper = [
    "function zhSuppressSavingGame()",
    "{",
    "   if(navBar != undefined && navBar.savingGame != undefined)",
    "   {",
    "      navBar.savingGame.stop();",
    "      navBar.savingGame._visible = false;",
    "      navBar.savingGame._alpha = 0;",
    "   }",
    "}",
    marker
  ].join("\n");
  return content.replace(marker, helper);
}

function patchFrameOne(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const before = next;
  next = insertSuppressHelper(next);
  next = next.replace(
    /      if\(_root == undefined \|\| _root\.island != "Super"\)\n      \{\n         navBar\.savingGame\.play\(\);\n      \}\n      else if\(navBar\.savingGame != undefined\)\n      \{\n         navBar\.savingGame\.stop\(\);\n         navBar\.savingGame\._visible = false;\n      \}/u,
    [
      "      if(zhSuppressSavingGame != undefined)",
      "      {",
      "         zhSuppressSavingGame();",
      "      }",
      "      else if(navBar.savingGame != undefined)",
      "      {",
      "         navBar.savingGame.stop();",
      "         navBar.savingGame._visible = false;",
      "         navBar.savingGame._alpha = 0;",
      "      }"
    ].join("\n")
  );
  if (next.includes("navBar.savingGame.play();")) {
    next = next.replace(
      "      navBar.savingGame.play();",
      [
        "      if(zhSuppressSavingGame != undefined)",
        "      {",
        "         zhSuppressSavingGame();",
        "      }",
        "      else if(navBar.savingGame != undefined)",
        "      {",
        "         navBar.savingGame.stop();",
        "         navBar.savingGame._visible = false;",
        "         navBar.savingGame._alpha = 0;",
        "      }"
      ].join("\n")
    );
  }
  next = next.replace(
    /   if\(navBar\.savingGame != undefined\)\n   \{\n      navBar\.savingGame\.stop\(\);\n      navBar\.savingGame\._visible = false;\n      navBar\.savingGame\._alpha = 0;\n   \}/u,
    "   zhSuppressSavingGame();"
  );
  if (!next.includes("function zhSuppressSavingGame()") || next.includes("navBar.savingGame.play();")) {
    throw new Error("AS2 gameplay save-status suppression did not apply cleanly to frame_1.");
  }
  return {
    changed: next !== before,
    content: next
  };
}

function patchFrameFive(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const before = next;
  if (!next.includes("zhSuppressSavingGame")) {
    const marker = [
      "   if(_root != undefined && zhEnsureDirectMapButton != undefined)",
      "   {",
      "      zhEnsureDirectMapButton();",
      "   }"
    ].join("\n");
    const replacement = [
      marker,
      "   if(_root != undefined && zhSuppressSavingGame != undefined)",
      "   {",
      "      zhSuppressSavingGame();",
      "   }"
    ].join("\n");
    if (!next.includes(marker)) {
      throw new Error("Unable to locate frame_5 nav bridge block.");
    }
    next = next.replace(marker, replacement);
  }
  return {
    changed: next !== before,
    content: next
  };
}

function updateManifest(manifestPath, runtimeZip, patchEntry) {
  const manifest = fileExists(manifestPath) ? readJson(manifestPath, {}) : {};
  const entries = Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [];
  const previous = entries.find((entry) => entry?.assetId === patchEntry.assetId);
  if (!previous) {
    manifest.assetsPatched = Number(manifest.assetsPatched || 0) + 1;
  }
  manifest.generatedAt = new Date().toISOString();
  manifest.swfPatchedAssets = entries.filter((entry) => entry?.assetId !== patchEntry.assetId);
  manifest.swfPatchedAssets.push(patchEntry);
  manifest.runtimeZip = runtimeZip;
  writeJson(manifestPath, manifest);
  return manifest;
}

function main() {
  const config = loadConfig();
  const ffdecCli = config.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("FFDec CLI is not configured.");
  }

  const packSwf = path.join(paths.as2PackDir, "swf", ...AS2_GAMEPLAY_PATH.split("/"));
  if (!fileExists(packSwf)) {
    throw new Error(`AS2 gameplay SWF not found: ${packSwf}`);
  }

  const workDir = path.join(paths.tempDir, "as2-gameplay-save-status");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  ensureDirSync(scriptRoot);
  runChecked(ffdecCli, ["-cli", "-export", "script", scriptRoot, packSwf], "export AS2 gameplay scripts");

  const frameOneScript = findFrameOneScript(scriptRoot);
  const frameFiveScript = findFrameFiveScript(scriptRoot);
  const frameOnePatch = patchFrameOne(fs.readFileSync(frameOneScript, "utf8"));
  const frameFivePatch = patchFrameFive(fs.readFileSync(frameFiveScript, "utf8"));
  fs.writeFileSync(frameOneScript, frameOnePatch.content, "utf8");
  fs.writeFileSync(frameFiveScript, frameFivePatch.content, "utf8");

  const changed = frameOnePatch.changed || frameFivePatch.changed;
  const replacements = [];
  if (frameOnePatch.changed) {
    replacements.push(translatedScriptFileEntry(frameOneScript, scriptRoot));
  }
  if (frameFivePatch.changed) {
    replacements.push(translatedScriptFileEntry(frameFiveScript, scriptRoot));
  }

  let outputSwf = packSwf;
  if (replacements.length > 0) {
    outputSwf = path.join(workDir, "gameplay.save-status.swf");
    let inputSwf = packSwf;
    for (const replacement of replacements) {
      const patchedSwf = path.join(workDir, `gameplay.save-status.${replacements.indexOf(replacement)}.swf`);
      runChecked(ffdecCli, ["-replace", inputSwf, patchedSwf, replacement.replaceTarget, replacement.filePath], `replace ${replacement.exportPath}`);
      inputSwf = patchedSwf;
    }
    fs.copyFileSync(inputSwf, packSwf);
    outputSwf = packSwf;
  }

  const manifestPath = path.join(paths.as2PackDir, "manifest.json");
  const manifest = fileExists(manifestPath) ? readJson(manifestPath, {}) : {};
  const runtimeZip = buildRuntimeZipForSourceGroup({
    config,
    sourceGroup: "as2",
    manifest
  });
  const patchEntry = {
    assetId: PATCH_ASSET_ID,
    assetPath: AS2_GAMEPLAY_PATH,
    outputPath: packSwf,
    changed,
    replaceTargets: replacements.map((entry) => entry.replaceTarget),
    notes: "Hides the AS2 savingGame status movie clip globally so fullscreen/window resize does not expose a blue bottom band."
  };
  const updatedManifest = updateManifest(manifestPath, runtimeZip, patchEntry);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    assetPath: AS2_GAMEPLAY_PATH,
    outputSwf,
    changed,
    replacements,
    manifestPath,
    manifestEntry: updatedManifest.swfPatchedAssets.find((entry) => entry?.assetId === PATCH_ASSET_ID),
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "as2", "as2-gameplay-save-status-patch.json");
  ensureDirSync(path.dirname(reportPath));
  writeJson(reportPath, report);
  printJson({
    ok: true,
    changed,
    reportPath,
    runtimeZip
  });
}

main();
