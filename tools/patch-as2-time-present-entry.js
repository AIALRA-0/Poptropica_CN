const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, readJson, removeDirContents, writeJson } = require("./lib/fs-utils");

const AS2_TIME_PRESENT_PATH = "content/www.poptropica.com/scenes/islandTime/scenePresent.swf";
const PATCH_ASSET_ID = "time-tangled:present-auto-entry-dialog";

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

function scriptFileEntry(filePath, scriptRoot) {
  const exportPath = path.relative(scriptRoot, filePath).replace(/\\/gu, "/");
  return {
    filePath,
    exportPath,
    replaceTarget: `\\${exportPath.replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`
  };
}

function findTimePresentActionScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes('roomName = "Main Street";') &&
      content.includes("char1.sayFunction = function()") &&
      content.includes("createEmptyMovieClip(\"checkPos\"") &&
      content.includes("char1.onPress();");
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one Time Present action script, found ${candidates.length}.`);
  }
  return candidates[0];
}

function patchAutoEntryDialogue(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  if (!next.includes("AutoEntryManualSayBubble")) {
    const showSayLine = '         _root.showSay(char1,"请进来！");';
    const manualSayBlock = [
      "         char1._visible = true;",
      "         char1._alpha = 100;",
      "         char1._x = char._x - 160;",
      "         char1._y = char._y;",
      "         if(char1.coordinates == undefined)",
      "         {",
      "            char1.coordinates = new Object();",
      "         }",
      "         char1.coordinates.x = char1._x;",
      "         char1.coordinates.y = char1._y;",
      "         char1.targetX = char1._x;",
      "         char1.targetY = char1._y;",
      "         char1.talkHeight = 260;",
      "         if(char1.action != undefined)",
      "         {",
      "            char1.action(\"stand\");",
      "         }",
      "         char1.swapDepths(240000);",
      "         if(_root.manualSay != undefined)",
      "         {",
      "            _root.manualSay(char1,\"请进来！\");",
      "         }",
      "         else",
      "         {",
      "            _root.showSay(char1,\"请进来！\");",
      "         }",
      "         var _loc2_ = char1.sayDepth != undefined ? _root[\"say\" + char1.sayDepth] : undefined;",
      "         if(_loc2_ != undefined)",
      "         {",
      "            _loc2_.wait = Math.max(Number(_loc2_.wait),600);",
      "            _loc2_._visible = true;",
      "            _loc2_._alpha = 100;",
      "            _loc2_.swapDepths(250000);",
      "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=TimePresent&event=AutoEntryManualSayBubble&bubble=1&wait=\" + _loc2_.wait,0);",
      "         }",
      "         else",
      "         {",
      "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=TimePresent&event=AutoEntryManualSayBubble&bubble=0\",0);",
      "         }"
    ].join("\n");
    if (!next.includes(showSayLine)) {
      throw new Error("Unable to locate Time Present invite showSay line.");
    }
    next = next.replace(showSayLine, manualSayBlock);
  }

  const readyGuard = [
    "            if(char1.avatar == undefined || char1.avatar.head == undefined || char1.avatar.head.mouth == undefined || _root.showSay == undefined || _root.sayDepth == undefined)",
    "            {",
    "               loadVariablesNum(\"/brain/track.php?cluster=QA&scene=TimePresent&event=AutoEntryReadyWait\",0);",
    "               return undefined;",
    "            }"
  ].join("\n");

  const before = [
    "            _root.takeClick._visible = true;",
    "            delete this.onEnterFrame;",
    "            char1.onPress();"
  ].join("\n");

  const after = [
    readyGuard,
    "            _root.takeClick._visible = true;",
    "            delete this.onEnterFrame;",
    "            if(char1.sayFunction != undefined)",
    "            {",
    "               loadVariablesNum(\"/brain/track.php?cluster=QA&scene=TimePresent&event=AutoEntrySayFunction\",0);",
    "               char1.sayFunction();",
    "            }",
    "            else",
    "            {",
    "               loadVariablesNum(\"/brain/track.php?cluster=QA&scene=TimePresent&event=AutoEntryOnPressFallback\",0);",
    "               char1.onPress();",
    "            }"
  ].join("\n");

  if (!next.includes("AutoEntrySayFunction")) {
    if (!next.includes(before)) {
      throw new Error("Unable to locate Time Present auto-entry onPress block.");
    }
    next = next.replace(before, after);
  } else if (!next.includes("AutoEntryReadyWait")) {
    const marker = [
      "            _root.takeClick._visible = true;",
      "            delete this.onEnterFrame;",
      "            if(char1.sayFunction != undefined)"
    ].join("\n");
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Time Present patched auto-entry block.");
    }
    next = next.replace(marker, `${readyGuard}\n${marker}`);
  }
  if (!next.includes("AutoEntryReadyWait")) {
    throw new Error("Unable to locate Time Present auto-entry onPress block.");
  }
  return next;
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

  const packSwf = path.join(paths.as2PackDir, "swf", ...AS2_TIME_PRESENT_PATH.split("/"));
  if (!fileExists(packSwf)) {
    throw new Error(`Time Present pack SWF not found: ${packSwf}`);
  }

  const workDir = path.join(paths.tempDir, "as2-time-present-entry");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  ensureDirSync(scriptRoot);
  runChecked(ffdecCli, ["-cli", "-export", "script", scriptRoot, packSwf], "export Time Present scripts");

  const scriptPath = findTimePresentActionScript(scriptRoot);
  const before = fs.readFileSync(scriptPath, "utf8");
  const after = patchAutoEntryDialogue(before);
  const changed = after !== before;
  const replacement = scriptFileEntry(scriptPath, scriptRoot);

  if (changed) {
    fs.writeFileSync(scriptPath, after, "utf8");
    const patchedSwf = path.join(workDir, "scenePresent.auto-entry.swf");
    runChecked(ffdecCli, ["-replace", packSwf, patchedSwf, replacement.replaceTarget, replacement.filePath], "replace Time Present auto-entry script");
    fs.copyFileSync(patchedSwf, packSwf);
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
    assetPath: AS2_TIME_PRESENT_PATH,
    outputPath: packSwf,
    changed,
    replaceTarget: replacement.replaceTarget,
    notes: "Restores the Time Tangled Present auto-entry chain by calling the scene sayFunction before falling back to onPress."
  };
  const updatedManifest = updateManifest(manifestPath, runtimeZip, patchEntry);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    assetPath: AS2_TIME_PRESENT_PATH,
    outputSwf: packSwf,
    changed,
    replacement,
    manifestPath,
    manifestEntry: updatedManifest.swfPatchedAssets.find((entry) => entry?.assetId === PATCH_ASSET_ID),
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "as2", "as2-time-present-entry-patch.json");
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
