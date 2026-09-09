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

const AS2_FRAMEWORK_PATH = "content/www.poptropica.com/framework.swf";
const PATCH_ASSET_ID = "as2-shared:framework-top-nav-anchor";

function runChecked(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64,
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

function findMainViewScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes("class com.poptropica.views.MainView") &&
      content.includes("function layoutTopRightNav()");
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one AS2 framework MainView script, found ${candidates.length}.`);
  }
  return candidates[0];
}

function findStartUpCommandScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes("class com.poptropica.controllers.commands.StartUpCommand") &&
      (content.includes('_loc3_.gameplay_url = "gameplay.swf"') ||
        content.includes("flashpointQaCacheBust") ||
        content.includes("flashpointQaGameplayUrl"));
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one AS2 framework StartUpCommand script, found ${candidates.length}.`);
  }
  return candidates[0];
}

function patchMainView(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const before = next;
  const pattern = /      var (_loc\d+_) = (?:1180|1400);\n      var (_loc\d+_) = 14;\n      var (_loc\d+_) = (?:55|3);\n      var (_loc\d+_) = (?:10|22);/u;
  if (!pattern.test(next)) {
    throw new Error("Unable to locate AS2 framework top nav anchor constants.");
  }
  next = next.replace(
    pattern,
    "      var $1 = 1400;\n      var $2 = 14;\n      var $3 = 3;\n      var $4 = 22;"
  );
  return {
    changed: next !== before,
    content: next
  };
}

function patchStartUpCommand(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const before = next;
  if (next.includes("flashpointQaGameplayUrl") && /_loc3_\.gameplay_url = _loc\d+_;/u.test(next)) {
    return {
      changed: false,
      content: next
    };
  }
  const queryBustPattern = /      var (_loc\d+_) = "";\n      if\(this\._rt_target\.flashpointQaCacheBust != undefined && String\(this\._rt_target\.flashpointQaCacheBust\) != ""\)\n      \{\n         \1 = "\?flashpointQaCacheBust=" \+ String\(this\._rt_target\.flashpointQaCacheBust\);\n      \}\n      _loc3_\.gameplay_url = "gameplay\.swf" \+ \1;/u;
  const aliasBlock = (localName) => [
    `      var ${localName} = "gameplay.swf";`,
    '      if(this._rt_target.flashpointQaGameplayUrl != undefined && String(this._rt_target.flashpointQaGameplayUrl) != "")',
    "      {",
    `         ${localName} = String(this._rt_target.flashpointQaGameplayUrl);`,
    "      }",
    `      _loc3_.gameplay_url = ${localName};`
  ].join("\n");
  const queryMatch = next.match(queryBustPattern);
  if (queryMatch) {
    next = next.replace(queryBustPattern, aliasBlock(queryMatch[1]));
    return {
      changed: next !== before,
      content: next
    };
  }
  const target = '      _loc3_.gameplay_url = "gameplay.swf";';
  if (!next.includes(target)) {
    throw new Error("Unable to locate AS2 framework gameplay URL assignment.");
  }
  next = next.replace(
    target,
    aliasBlock("_loc8_")
  );
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

  const packSwf = path.join(paths.as2PackDir, "swf", ...AS2_FRAMEWORK_PATH.split("/"));
  if (!fileExists(packSwf)) {
    throw new Error(`AS2 framework SWF not found: ${packSwf}`);
  }
  const gameplaySwf = path.join(paths.as2PackDir, "swf", "content", "www.poptropica.com", "gameplay.swf");
  const gameplayAliasSwf = path.join(paths.as2PackDir, "swf", "content", "www.poptropica.com", "gameplay-zh.swf");
  if (!fileExists(gameplaySwf)) {
    throw new Error(`AS2 gameplay SWF not found: ${gameplaySwf}`);
  }
  fs.copyFileSync(gameplaySwf, gameplayAliasSwf);

  const workDir = path.join(paths.tempDir, "as2-framework-top-nav");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  ensureDirSync(scriptRoot);
  runChecked(ffdecCli, ["-cli", "-export", "script", scriptRoot, packSwf], "export AS2 framework scripts");

  const mainViewScript = findMainViewScript(scriptRoot);
  const mainViewPatch = patchMainView(fs.readFileSync(mainViewScript, "utf8"));
  fs.writeFileSync(mainViewScript, mainViewPatch.content, "utf8");
  const startUpCommandScript = findStartUpCommandScript(scriptRoot);
  const startUpCommandPatch = patchStartUpCommand(fs.readFileSync(startUpCommandScript, "utf8"));
  fs.writeFileSync(startUpCommandScript, startUpCommandPatch.content, "utf8");

  let inputSwf = packSwf;
  const replacements = [
    mainViewPatch.changed ? translatedScriptFileEntry(mainViewScript, scriptRoot) : null,
    startUpCommandPatch.changed ? translatedScriptFileEntry(startUpCommandScript, scriptRoot) : null
  ].filter(Boolean);
  for (const replacement of replacements) {
    const patchedSwf = path.join(workDir, `framework.top-nav.${replacements.indexOf(replacement)}.swf`);
    runChecked(ffdecCli, ["-replace", inputSwf, patchedSwf, replacement.replaceTarget, replacement.filePath], `replace ${replacement.exportPath}`);
    inputSwf = patchedSwf;
  }
  if (replacements.length > 0) {
    fs.copyFileSync(inputSwf, packSwf);
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
    assetPath: AS2_FRAMEWORK_PATH,
    outputPath: packSwf,
    changed: replacements.length > 0,
    replaceTargets: replacements.map((entry) => entry.replaceTarget),
    notes: "Anchors the AS2 framework top navigation row and loads gameplay-zh.swf during QA so Flash cannot reuse stale HUD code without query-string side effects."
  };
  const updatedManifest = updateManifest(manifestPath, runtimeZip, patchEntry);

  printJson({
    ok: true,
    generatedAt: new Date().toISOString(),
    assetPath: AS2_FRAMEWORK_PATH,
    outputSwf: packSwf,
    changed: replacements.length > 0,
    replacements,
    manifestPath,
    manifestEntry: patchEntry,
    runtimeZip,
    assetsPatched: updatedManifest.assetsPatched
  });
}

main();
