const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

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
const { printJson } = require("./lib/cli");

const AS2_FRAMEWORK_PATH = "content/www.poptropica.com/framework.swf";
const AS2_GAMEPLAY_PATH = "content/www.poptropica.com/gameplay.swf";
const PATCH_ASSET_ID = "as2-shared:gameplay-qa-loading-hold";
const FRAMEWORK_PATCH_ASSET_ID = "as2-shared:framework-qa-loading-hold-bridge";
const QA_LOADING_HOLD_KEY = "flashpointQaLoadingHoldMs";

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

function runFfdec(ffdecCli, args, label) {
  return runChecked(ffdecCli, args, label);
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

function findGameplayFrameOneScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes('logWWW("frame 1 loads scenePath " + scenePath + " in to camera");') &&
      (content.includes("loader.loadClip(flashpointQaScenePath,camera);") ||
        content.includes("loader.loadClip(scenePath,camera);") ||
        content.includes(QA_LOADING_HOLD_KEY));
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one AS2 gameplay frame_1 load script, found ${candidates.length}.`);
  }
  return candidates[0];
}

function findFrameworkStartUpScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes('_loc2_.gameplay_url = "gameplay.swf";') &&
      content.includes('loadingSequenceComplete("startup")');
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one AS2 framework StartUpCommand script, found ${candidates.length}.`);
  }
  return candidates[0];
}

function patchFrameworkLoadingHoldBridge(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const before = next;

  const oldSingleDialogBridge = [
    '      _loc2_.gameplay_url = "gameplay.swf";',
    '      if(this._rt_target.flashpointQaAs2Dialog != undefined && String(this._rt_target.flashpointQaAs2Dialog) != "")',
    "      {",
    '         _loc2_.gameplay_url = "gameplay.swf?flashpointQaAs2Dialog=" + escape(String(this._rt_target.flashpointQaAs2Dialog));',
    "      }"
  ].join("\n");
  if (next.includes(oldSingleDialogBridge)) {
    next = next.replace(oldSingleDialogBridge, '      _loc2_.gameplay_url = "gameplay.swf";');
  }

  next = next.replace(
    /\n      var _loc\d+_ = \[\];\n      if\(this\._rt_target\.flashpointQaAs2Dialog != undefined && String\(this\._rt_target\.flashpointQaAs2Dialog\) != ""\)\n      \{\n         _loc\d+_\.push\("flashpointQaAs2Dialog=" \+ escape\(String\(this\._rt_target\.flashpointQaAs2Dialog\)\)\);\n      \}\n      if\(this\._rt_target\.flashpointQaLoadingHoldMs != undefined && String\(this\._rt_target\.flashpointQaLoadingHoldMs\) != ""\)\n      \{\n         _loc\d+_\.push\("flashpointQaLoadingHoldMs=" \+ escape\(String\(this\._rt_target\.flashpointQaLoadingHoldMs\)\)\);\n      \}\n      _loc2_\.gameplay_url = "gameplay\.swf";\n      if\(_loc\d+_\.length > 0\)\n      \{\n         _loc2_\.gameplay_url = "gameplay\.swf\?" \+ _loc\d+_\.join\("&"\);\n      \}/u,
    '\n      _loc2_.gameplay_url = "gameplay.swf";'
  );

  next = next.replace(
    /\n      var flashpointQaGameplayParams = \[\];\n      if\(this\._rt_target\.flashpointQaAs2Dialog != undefined && String\(this\._rt_target\.flashpointQaAs2Dialog\) != ""\)\n      \{\n         flashpointQaGameplayParams\.push\("flashpointQaAs2Dialog=" \+ escape\(String\(this\._rt_target\.flashpointQaAs2Dialog\)\)\);\n      \}\n      if\(this\._rt_target\.flashpointQaLoadingHoldMs != undefined && String\(this\._rt_target\.flashpointQaLoadingHoldMs\) != ""\)\n      \{\n         flashpointQaGameplayParams\.push\("flashpointQaLoadingHoldMs=" \+ escape\(String\(this\._rt_target\.flashpointQaLoadingHoldMs\)\)\);\n      \}\n      _loc2_\.gameplay_url = "gameplay\.swf";\n      if\(flashpointQaGameplayParams\.length > 0\)\n      \{\n         _loc2_\.gameplay_url = "gameplay\.swf\?" \+ flashpointQaGameplayParams\.join\("&"\);\n      \}/u,
    '\n      _loc2_.gameplay_url = "gameplay.swf";'
  );

  const globalBridge = [
    '      _global.flashpointQaAs2Dialog = "";',
    '      if(this._rt_target.flashpointQaAs2Dialog != undefined && String(this._rt_target.flashpointQaAs2Dialog) != "")',
    "      {",
    "         _global.flashpointQaAs2Dialog = String(this._rt_target.flashpointQaAs2Dialog);",
    "      }",
    `      _global.${QA_LOADING_HOLD_KEY} = "";`,
    `      if(this._rt_target.${QA_LOADING_HOLD_KEY} != undefined && String(this._rt_target.${QA_LOADING_HOLD_KEY}) != "")`,
    "      {",
    `         _global.${QA_LOADING_HOLD_KEY} = String(this._rt_target.${QA_LOADING_HOLD_KEY});`,
    "      }"
  ].join("\n");
  if (!next.includes("_global.flashpointQaAs2Dialog")) {
    const simpleGameplayUrl = '      _loc2_.gameplay_url = "gameplay.swf";';
    if (!next.includes(simpleGameplayUrl)) {
      throw new Error("Unable to locate AS2 framework gameplay_url assignment.");
    }
    next = next.replace(simpleGameplayUrl, `${globalBridge}\n${simpleGameplayUrl}`);
  }

  next = next.replace(
    /\n      if\(this\._rt_target\.flashpointQaLoadingHoldMs != undefined && String\(this\._rt_target\.flashpointQaLoadingHoldMs\) != ""\)\n      \{\n         _loc\d+_\.push\("flashpointQaLoadingHoldMs=" \+ escape\(String\(this\._rt_target\.flashpointQaLoadingHoldMs\)\)\);\n      \}/u,
    ""
  );

  if (!next.includes("flashpointQaCompleteStartupLoading")) {
    const startupCompleteMatch = next.match(/\n      (_loc\d+_)\.loadingSequenceComplete\("startup"\);/u);
    const startupComplete = startupCompleteMatch ? startupCompleteMatch[0] : "";
    const startupController = startupCompleteMatch ? startupCompleteMatch[1] : "_loc3_";
    const startupHold = [
      `      var flashpointQaStartupHoldMs = Number(this._rt_target.${QA_LOADING_HOLD_KEY});`,
      "      if(isNaN(flashpointQaStartupHoldMs) || flashpointQaStartupHoldMs < 0)",
      "      {",
      "         flashpointQaStartupHoldMs = 0;",
      "      }",
      "      flashpointQaStartupHoldMs = Math.min(15000,flashpointQaStartupHoldMs);",
      "      if(flashpointQaStartupHoldMs > 0)",
      "      {",
      `         this._rt_target.flashpointQaStartupLoader = ${startupController};`,
      "         this._rt_target.flashpointQaCompleteStartupLoading = function()",
      "         {",
      "            clearInterval(this.flashpointQaStartupInterval);",
      '            this.flashpointQaStartupLoader.loadingSequenceComplete("startup");',
      "         };",
      '         this._rt_target.flashpointQaStartupInterval = setInterval(this._rt_target,"flashpointQaCompleteStartupLoading",flashpointQaStartupHoldMs);',
      "      }",
      "      else",
      "      {",
      `         ${startupController}.loadingSequenceComplete("startup");`,
      "      }"
    ].join("\n");
    if (!startupComplete) {
      throw new Error("Unable to locate AS2 framework startup loading completion call.");
    }
    next = next.replace(startupComplete, startupHold);
  }

  if (!next.includes(QA_LOADING_HOLD_KEY) || !next.includes("flashpointQaCompleteStartupLoading")) {
    throw new Error("AS2 framework startup loading hold patch did not apply cleanly.");
  }
  if (/gameplay\.swf\?/u.test(next)) {
    throw new Error("AS2 framework QA bridge must not append query parameters to gameplay.swf.");
  }
  return {
    changed: next !== before,
    content: next
  };
}

function patchGameplayLoadingHold(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const before = next;
  if (next.includes(QA_LOADING_HOLD_KEY) && next.includes("flashpointQaLoadHeldScene")) {
    const rootOnlyRead = `var flashpointQaLoadingHoldMs = Number(_root.${QA_LOADING_HOLD_KEY});`;
    const globalAwareRead = [
      `var flashpointQaLoadingHoldMs = Number(_root.${QA_LOADING_HOLD_KEY});`,
      `if((isNaN(flashpointQaLoadingHoldMs) || flashpointQaLoadingHoldMs <= 0) && _global.${QA_LOADING_HOLD_KEY} != undefined && String(_global.${QA_LOADING_HOLD_KEY}) != "")`,
      "{",
      `   flashpointQaLoadingHoldMs = Number(_global.${QA_LOADING_HOLD_KEY});`,
      "}"
    ].join("\n");
    if (next.includes(rootOnlyRead) && !next.includes(`_global.${QA_LOADING_HOLD_KEY}`)) {
      next = next.replace(rootOnlyRead, globalAwareRead);
    }
    return {
      changed: next !== before,
      content: next
    };
  }

  const functionMarker = 'logWWW("frame 1 loads scenePath " + scenePath + " in to camera");';
  const heldSceneFunction = [
    "_root.flashpointQaLoadHeldScene = function()",
    "{",
    "   clearInterval(_root.flashpointQaSceneLoadInterval);",
    "   _root.flashpointQaSceneLoader.loadClip(_root.flashpointQaSceneLoadPath,_root.flashpointQaSceneCamera);",
    "};",
    ""
  ].join("\n");
  if (!next.includes(functionMarker)) {
    throw new Error("Unable to locate AS2 gameplay scene load log marker.");
  }
  next = next.replace(functionMarker, heldSceneFunction + functionMarker);

  const directLoadCandidates = [
    "loader.loadClip(flashpointQaScenePath,camera);",
    "loader.loadClip(scenePath,camera);"
  ];
  const directLoad = directLoadCandidates.find((candidate) => next.includes(candidate));
  const scenePathExpression = directLoad && directLoad.includes("flashpointQaScenePath") ? "flashpointQaScenePath" : "scenePath";
  const heldLoad = [
    `var flashpointQaLoadingHoldMs = Number(_root.${QA_LOADING_HOLD_KEY});`,
    `if((isNaN(flashpointQaLoadingHoldMs) || flashpointQaLoadingHoldMs <= 0) && _global.${QA_LOADING_HOLD_KEY} != undefined && String(_global.${QA_LOADING_HOLD_KEY}) != "")`,
    "{",
    `   flashpointQaLoadingHoldMs = Number(_global.${QA_LOADING_HOLD_KEY});`,
    "}",
    'if((isNaN(flashpointQaLoadingHoldMs) || flashpointQaLoadingHoldMs <= 0) && String(_root._url).indexOf("' + QA_LOADING_HOLD_KEY + '=") >= 0)',
    "{",
    '   var flashpointQaLoadingHoldRaw = String(_root._url).split("' + QA_LOADING_HOLD_KEY + '=")[1].split("&")[0];',
    "   flashpointQaLoadingHoldMs = Number(unescape(flashpointQaLoadingHoldRaw));",
    "}",
    "if(isNaN(flashpointQaLoadingHoldMs) || flashpointQaLoadingHoldMs < 0)",
    "{",
    "   flashpointQaLoadingHoldMs = 0;",
    "}",
    "flashpointQaLoadingHoldMs = Math.min(15000,flashpointQaLoadingHoldMs);",
    "if(flashpointQaLoadingHoldMs > 0)",
    "{",
    `   _root.flashpointQaSceneLoadPath = ${scenePathExpression};`,
    "   _root.flashpointQaSceneLoader = loader;",
    "   _root.flashpointQaSceneCamera = camera;",
    '   _root.flashpointQaSceneLoadInterval = setInterval(_root,"flashpointQaLoadHeldScene",flashpointQaLoadingHoldMs);',
    "}",
    "else",
    "{",
    `   loader.loadClip(${scenePathExpression},camera);`,
    "}"
  ].join("\n");

  if (!directLoad) {
    throw new Error("Unable to locate AS2 gameplay flashpointQaScenePath load call.");
  }
  next = next.replace(directLoad, heldLoad);

  if (!next.includes(QA_LOADING_HOLD_KEY) || !next.includes("flashpointQaLoadHeldScene")) {
    throw new Error("AS2 gameplay loading hold patch did not apply cleanly.");
  }
  return {
    changed: next !== before,
    content: next
  };
}

function patchFrameworkLoadingHoldBridgeSwf({ ffdecCli, workDir }) {
  const packSwf = path.join(paths.as2PackDir, "swf", ...AS2_FRAMEWORK_PATH.split("/"));
  if (!fileExists(packSwf)) {
    throw new Error(`AS2 framework SWF not found: ${packSwf}`);
  }

  const scriptRoot = path.join(workDir, "framework-scripts");
  ensureDirSync(scriptRoot);
  runFfdec(ffdecCli, ["-cli", "-export", "script", scriptRoot, packSwf], "export AS2 framework scripts");
  const scriptPath = findFrameworkStartUpScript(scriptRoot);
  const patched = patchFrameworkLoadingHoldBridge(fs.readFileSync(scriptPath, "utf8"));
  fs.writeFileSync(scriptPath, patched.content, "utf8");

  let replaceTarget = null;
  if (patched.changed) {
    const translatedEntry = translatedScriptFileEntry(scriptPath, scriptRoot);
    replaceTarget = translatedEntry.replaceTarget;
    const patchedSwf = path.join(workDir, "framework.qa-loading-hold.swf");
    runFfdec(ffdecCli, ["-replace", packSwf, patchedSwf, replaceTarget, scriptPath], "replace AS2 framework loading hold bridge script");
    fs.copyFileSync(patchedSwf, packSwf);
  }
  return {
    assetId: FRAMEWORK_PATCH_ASSET_ID,
    assetPath: AS2_FRAMEWORK_PATH,
    outputPath: packSwf,
    changed: patched.changed,
    replaceTarget,
    notes: "QA only: holds framework startup loading when flashpointQaLoadingHoldMs is present so real loading UI can be screenshot-verified before gameplay starts."
  };
}

function updateManifest(manifestPath, runtimeZip, patchEntries) {
  const manifest = fileExists(manifestPath) ? readJson(manifestPath, {}) : {};
  const entries = Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [];
  const patchIds = new Set(patchEntries.map((entry) => entry.assetId));
  const previousIds = new Set(entries.map((entry) => entry?.assetId).filter(Boolean));
  const newPatchCount = [...patchIds].filter((assetId) => !previousIds.has(assetId)).length;
  manifest.generatedAt = new Date().toISOString();
  if (newPatchCount > 0) {
    manifest.assetsPatched = Number(manifest.assetsPatched || 0) + newPatchCount;
  }
  manifest.swfPatchedAssets = entries.filter((entry) => !patchIds.has(entry?.assetId));
  manifest.swfPatchedAssets.push(...patchEntries);
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

  const workDir = path.join(paths.tempDir, "as2-gameplay-loading-hold");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const frameworkPatch = patchFrameworkLoadingHoldBridgeSwf({ ffdecCli, workDir });

  const scriptRoot = path.join(workDir, "scripts");
  ensureDirSync(scriptRoot);
  runFfdec(ffdecCli, ["-cli", "-export", "script", scriptRoot, packSwf], "export AS2 gameplay scripts");

  const scriptPath = findGameplayFrameOneScript(scriptRoot);
  const patched = patchGameplayLoadingHold(fs.readFileSync(scriptPath, "utf8"));
  fs.writeFileSync(scriptPath, patched.content, "utf8");

  let replaceTarget = null;
  let outputSwf = packSwf;
  if (patched.changed) {
    const translatedEntry = translatedScriptFileEntry(scriptPath, scriptRoot);
    replaceTarget = translatedEntry.replaceTarget;
    const patchedSwf = path.join(workDir, "gameplay.qa-loading-hold.swf");
    runFfdec(ffdecCli, ["-replace", packSwf, patchedSwf, replaceTarget, scriptPath], "replace AS2 gameplay loading hold script");
    fs.copyFileSync(patchedSwf, packSwf);
  }

  const manifestPath = path.join(paths.as2PackDir, "manifest.json");
  const manifest = fileExists(manifestPath) ? readJson(manifestPath, {}) : {};
  const runtimeZip = buildRuntimeZipForSourceGroup({
    config,
    sourceGroup: "as2",
    manifest
  });
  const gameplayPatch = {
    assetId: PATCH_ASSET_ID,
    assetPath: AS2_GAMEPLAY_PATH,
    outputPath: packSwf,
    changed: patched.changed,
    replaceTarget,
    notes: "QA only: delays AS2 gameplay scene loader when flashpointQaLoadingHoldMs is present so real loading UI can be screenshot-verified."
  };
  const updatedManifest = updateManifest(manifestPath, runtimeZip, [frameworkPatch, gameplayPatch]);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    assetPath: AS2_GAMEPLAY_PATH,
    outputSwf: packSwf,
    changed: patched.changed,
    replaceTarget,
    frameworkPatch,
    gameplayPatch,
    manifestPath,
    manifestEntries: updatedManifest.swfPatchedAssets.filter((entry) =>
      entry?.assetId === PATCH_ASSET_ID || entry?.assetId === FRAMEWORK_PATCH_ASSET_ID
    ),
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "as2", "as2-gameplay-loading-hold-patch.json");
  ensureDirSync(path.dirname(reportPath));
  writeJson(reportPath, report);
  printJson({
    ok: true,
    reportPath,
    changed: patched.changed,
    runtimeZip
  });
}

main();
