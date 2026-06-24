const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const {
  ensureDirSync,
  fileExists,
  listFilesRecursive,
  readJson,
  removeDirContents,
  writeJson
} = require("./lib/fs-utils");
const paths = require("./lib/paths");

const SUPER_SCENE_DIR = path.join(
  paths.as2PackDir,
  "swf",
  "content",
  "www.poptropica.com",
  "scenes",
  "islandSuper"
);

const REPORT_PATH = path.join(paths.qaDir, "as2", "super-power-scene-loadcheck-patch.json");

const LOADCHECK_BASE_SNIPPET = `this.createEmptyMovieClip("loadCheck",1);
loadCheck.onEnterFrame = function()
{
   if(Chars.length <= 0)
   {
      delete this.onEnterFrame;
      initChars();
      removeMovieClip(loadCheck);
   }
   var _loc2_ = 0;
   while(_loc2_ < Chars.length)
   {
      if(Chars[_loc2_].loadingFinished)
      {
         Chars.splice(_loc2_,1);
      }
      _loc2_ += 1;
   }
};`;

const LOADCHECK_FORCE_TIMEOUT_SNIPPET = `this.createEmptyMovieClip("loadCheck",1);
loadCheck.wait = 0;
loadCheck.onEnterFrame = function()
{
   this.wait += 1;
   if(Chars.length <= 0 || this.wait > 24)
   {
      delete this.onEnterFrame;
      initChars();
      removeMovieClip(loadCheck);
      return undefined;
   }
   var _loc2_ = 0;
   while(_loc2_ < Chars.length)
   {
      if(Chars[_loc2_] == undefined || Chars[_loc2_].loadingFinished || Chars[_loc2_].createNPC != undefined || Chars[_loc2_].createBackPlayer != undefined)
      {
         Chars.splice(_loc2_,1);
         _loc2_ -= 1;
      }
      _loc2_ += 1;
   }
};`;

const LOADCHECK_NO_TIMEOUT_SNIPPET = `this.createEmptyMovieClip("loadCheck",1);
loadCheck.wait = 0;
loadCheck.onEnterFrame = function()
{
   this.wait += 1;
   var _loc2_ = 0;
   while(_loc2_ < Chars.length)
   {
      if(Chars[_loc2_] == undefined || Chars[_loc2_].loadingFinished || Chars[_loc2_].createNPC != undefined || Chars[_loc2_].createBackPlayer != undefined)
      {
         Chars.splice(_loc2_,1);
         _loc2_ -= 1;
      }
      _loc2_ += 1;
   }
   if(Chars.length <= 0)
   {
      delete this.onEnterFrame;
      initChars();
      removeMovieClip(loadCheck);
      return undefined;
   }
};`;

const LOADCHECK_COMPAT_SNIPPET = LOADCHECK_NO_TIMEOUT_SNIPPET.replace(
  "if(Chars.length <= 0)",
  "if(Chars.length <= 0 || this.wait > 120)"
);

function normalizeScript(content) {
  return String(content || "").replace(/\r\n/gu, "\n");
}

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

function replaceSingle(ffdecCli, inputSwf, outputSwf, replaceTarget, scriptFile) {
  runFfdec(ffdecCli, ["-replace", inputSwf, outputSwf, replaceTarget, scriptFile], `replace ${replaceTarget}`);
}

function replaceSequential(ffdecCli, inputSwf, outputSwf, replacements) {
  if (replacements.length === 0) {
    if (inputSwf !== outputSwf) {
      fs.copyFileSync(inputSwf, outputSwf);
    }
    return;
  }
  let currentInput = inputSwf;
  const tempOutputs = [];
  try {
    for (let index = 0; index < replacements.length; index += 1) {
      const nextOutput = index === replacements.length - 1
        ? outputSwf
        : path.join(paths.tempDir, `super-scene-loadcheck-${process.pid}-${Date.now()}-${index}.swf`);
      replaceSingle(ffdecCli, currentInput, nextOutput, replacements[index].replaceTarget, replacements[index].filePath);
      if (nextOutput !== outputSwf) {
        tempOutputs.push(nextOutput);
      }
      currentInput = nextOutput;
    }
  } finally {
    for (const tempFile of tempOutputs) {
      if (fileExists(tempFile)) {
        fs.rmSync(tempFile, { force: true });
      }
    }
  }
}

function collectScripts(scriptRoot) {
  return listFilesRecursive(scriptRoot, { includeExtensions: new Set([".as"]) })
    .map((filePath) => {
      const exportPath = path.relative(scriptRoot, filePath).replace(/\\/gu, "/");
      return {
        filePath,
        exportPath,
        replaceTarget: `\\${exportPath.replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`
      };
    })
    .sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en"));
}

function patchScriptFile(filePath, options = {}) {
  const original = normalizeScript(fs.readFileSync(filePath, "utf8"));
  let next = original;
  let alreadyPatched = false;
  if (next.includes(LOADCHECK_COMPAT_SNIPPET)) {
    alreadyPatched = true;
  } else if (next.includes(LOADCHECK_NO_TIMEOUT_SNIPPET)) {
    next = next.replace(LOADCHECK_NO_TIMEOUT_SNIPPET, LOADCHECK_COMPAT_SNIPPET);
  } else if (next.includes(LOADCHECK_FORCE_TIMEOUT_SNIPPET)) {
    next = next.replace(LOADCHECK_FORCE_TIMEOUT_SNIPPET, LOADCHECK_COMPAT_SNIPPET);
  } else if (next.includes(LOADCHECK_BASE_SNIPPET)) {
    next = next.replace(LOADCHECK_BASE_SNIPPET, LOADCHECK_COMPAT_SNIPPET);
  }
  next = applyAvatarReadinessPatch(next);
  if (options.diagnostics) {
    next = applyBankDiagnosticsPatch(next);
  }
  if (next === original) {
    return { changed: false, alreadyPatched };
  }
  fs.writeFileSync(filePath, next, "utf8");
  return { changed: true, alreadyPatched: false };
}

function applyBankDiagnosticsPatch(content) {
  let next = normalizeScript(content);
  if (!next.includes("function initChars()") || next.includes("function zhSuperBankQaLog(")) {
    return next;
  }
  const helpers = `function zhSuperBankQaEnabled()
{
   return _root != undefined && (_root.flashpointQaCacheBust != undefined || (_level0 != undefined && _level0.flashpointQaCacheBust != undefined));
}
function zhSuperBankQaBool(value)
{
   return value ? "1" : "0";
}
function zhSuperBankQaLog(eventName,payload)
{
   if(!zhSuperBankQaEnabled())
   {
      return undefined;
   }
   loadVariablesNum("/brain/track.php?cluster=QA&scene=SuperBank&event=" + eventName + "&" + payload,0);
}
function zhSuperBankQaState()
{
   return "len=" + (Chars != undefined ? Chars.length : "na") + "&charBack=" + zhSuperBankQaBool(char != undefined && char.createBackPlayer != undefined) + "&charAvatar=" + zhSuperBankQaBool(char != undefined && char.avatar != undefined) + "&c1Npc=" + zhSuperBankQaBool(char1 != undefined && char1.createNPC != undefined) + "&c1Avatar=" + zhSuperBankQaBool(char1 != undefined && char1.avatar != undefined);
}
`;
  next = next.replace("function initChars()\n{", `${helpers}function initChars()\n{\n   zhSuperBankQaLog("InitStart",zhSuperBankQaState());`);
  next = next.replace(
    "   _root.nextFrame();",
    "   zhSuperBankQaLog(\"InitBeforeNext\",zhSuperBankQaState());\n   _root.nextFrame();"
  );
  next = next.replace(
    "   this.wait += 1;\n   var _loc2_ = 0;",
    "   this.wait += 1;\n   if(this.wait == 1 || this.wait == 30 || this.wait == 90 || this.wait == 120 || this.wait == 121 || this.wait == 180)\n   {\n      zhSuperBankQaLog(\"LoadCheck\",\"wait=\" + this.wait + \"&\" + zhSuperBankQaState());\n   }\n   var _loc2_ = 0;"
  );
  next = next.replace(
    "      initChars();\n      removeMovieClip(loadCheck);",
    "      zhSuperBankQaLog(\"LoadCheckInit\",\"wait=\" + this.wait + \"&\" + zhSuperBankQaState());\n      initChars();\n      removeMovieClip(loadCheck);"
  );
  return next;
}

const ADVANCE_GAMEPLAY_FRAME_HELPER = `function zhSuperAdvanceTimeline(target, label)
{
   if(target == undefined || target.nextFrame == undefined)
   {
      return false;
   }
   var beforeFrame = Number(target._currentframe);
   var totalFrames = Number(target._totalframes);
   target.nextFrame();
   var afterFrame = Number(target._currentframe);
   if(!isNaN(beforeFrame) && !isNaN(afterFrame) && afterFrame == beforeFrame && target.gotoAndStop != undefined && (isNaN(totalFrames) || totalFrames > beforeFrame))
   {
      target.gotoAndStop(beforeFrame + 1);
      afterFrame = Number(target._currentframe);
   }
   if(typeof zhSuperBankQaLog == "function")
   {
      zhSuperBankQaLog("AdvanceFrame","target=" + label + "&before=" + beforeFrame + "&after=" + afterFrame + "&total=" + totalFrames);
   }
   return afterFrame != beforeFrame;
}
function zhSuperAdvanceGameplayFrame()
{
   var target = null;
   if(typeof com != "undefined" && com.poptropica != undefined && com.poptropica.models != undefined && com.poptropica.models.PopModelConst != undefined && com.poptropica.models.PopModelConst.gameplayMC != undefined)
   {
      target = com.poptropica.models.PopModelConst.gameplayMC;
   }
   if(zhSuperAdvanceTimeline(target,"gameplay"))
   {
      return "gameplay";
   }
   target = null;
   if(_root != undefined && _root.gameplay_container_mc != undefined)
   {
      target = _root.gameplay_container_mc;
   }
   if(zhSuperAdvanceTimeline(target,"container"))
   {
      return "container";
   }
   target = null;
   if(_parent != undefined && _parent._parent != undefined && _parent._parent != _root && _parent._parent.nextFrame != undefined)
   {
      target = _parent._parent;
   }
   if(zhSuperAdvanceTimeline(target,"parent"))
   {
      return "parent";
   }
   if(zhSuperAdvanceTimeline(_root,"root"))
   {
      return "root";
   }
   if(zhSuperAdvanceTimeline(_level0,"level0"))
   {
      return "level0";
   }
   if(typeof zhSuperBankQaLog == "function")
   {
      zhSuperBankQaLog("AdvanceFrame","target=none");
   }
   return "none";
}`;

function applyAvatarReadinessPatch(content) {
  let normalized = normalizeScript(content);
  normalized = normalized.replace(
    '      zhSuperAdvanceGameplayFrame();\n      return "root";',
    '      _root.nextFrame();\n      return "root";'
  );
  const timelineHelperStart = normalized.indexOf("function zhSuperAdvanceTimeline(target, label)\n{");
  const legacyHelperStart = normalized.indexOf("function zhSuperAdvanceGameplayFrame()\n{");
  const helperStart = timelineHelperStart >= 0 ? timelineHelperStart : legacyHelperStart;
  const initStart = helperStart >= 0 ? normalized.indexOf("\nfunction initChars()", helperStart) : -1;
  if (helperStart >= 0 && initStart > helperStart) {
    normalized = `${normalized.slice(0, helperStart)}${ADVANCE_GAMEPLAY_FRAME_HELPER}${normalized.slice(initStart)}`;
  } else if (normalized.includes("_root.nextFrame();") && !normalized.includes("function zhSuperAdvanceGameplayFrame()")) {
    normalized = normalized.replace(
      "function initChars()\n{",
      `${ADVANCE_GAMEPLAY_FRAME_HELPER}\nfunction initChars()\n{`
    );
  }
  const lines = normalized.split("\n");
  const output = [];
  let insideAdvanceHelper = false;
  let advanceHelperBraceDepth = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^function zhSuperAdvance(?:Timeline|GameplayFrame)\(/u.test(line.trim())) {
      insideAdvanceHelper = true;
      advanceHelperBraceDepth = 0;
      output.push(line);
      continue;
    }
    if (insideAdvanceHelper) {
      output.push(line);
      advanceHelperBraceDepth += (line.match(/\{/gu) || []).length;
      advanceHelperBraceDepth -= (line.match(/\}/gu) || []).length;
      if (advanceHelperBraceDepth <= 0 && line.trim() === "}") {
        insideAdvanceHelper = false;
      }
      continue;
    }
    const createBack = line.match(/^(\s*)([A-Za-z_$][\w$]*)\.createBackPlayer\(\);$/u);
    if (createBack && !hasRecentGuard(lines, index, `if(${createBack[2]}.createBackPlayer != undefined)`)) {
      output.push(`${createBack[1]}if(${createBack[2]}.createBackPlayer != undefined)`);
      output.push(`${createBack[1]}{`);
      output.push(`${createBack[1]}   ${createBack[2]}.createBackPlayer();`);
      output.push(`${createBack[1]}}`);
      continue;
    }
    const createNpc = line.match(/^(\s*)([A-Za-z_$][\w$]*)\.createNPC\((.*)\);$/u);
    if (createNpc && !hasRecentGuard(lines, index, `if(${createNpc[2]}.createNPC != undefined)`)) {
      output.push(`${createNpc[1]}if(${createNpc[2]}.createNPC != undefined)`);
      output.push(`${createNpc[1]}{`);
      output.push(`${createNpc[1]}   ${createNpc[2]}.createNPC(${createNpc[3]});`);
      output.push(`${createNpc[1]}}`);
      continue;
    }
    const nextFrame = line.match(/^(\s*)([A-Za-z_$][\w$]*)\.avatar\.nextFrame\(\);$/u);
    if (nextFrame && !hasRecentGuard(lines, index, `if(${nextFrame[2]}.avatar != undefined)`)) {
      output.push(`${nextFrame[1]}if(${nextFrame[2]}.avatar != undefined)`);
      output.push(`${nextFrame[1]}{`);
      output.push(`${nextFrame[1]}   ${nextFrame[2]}.avatar.nextFrame();`);
      output.push(`${nextFrame[1]}}`);
      continue;
    }
    const meanEyes = line.match(/^(\s*)([A-Za-z_$][\w$]*)\.avatar\.meanEyes\(\);$/u);
    if (meanEyes && !hasRecentGuard(lines, index, `if(${meanEyes[2]}.avatar != undefined && ${meanEyes[2]}.avatar.meanEyes != undefined)`)) {
      output.push(`${meanEyes[1]}if(${meanEyes[2]}.avatar != undefined && ${meanEyes[2]}.avatar.meanEyes != undefined)`);
      output.push(`${meanEyes[1]}{`);
      output.push(`${meanEyes[1]}   ${meanEyes[2]}.avatar.meanEyes();`);
      output.push(`${meanEyes[1]}}`);
      continue;
    }
    const setParts = line.match(/^(\s*)([A-Za-z_$][\w$]*)\.avatar\.setParts\(\);$/u);
    if (setParts && !hasRecentGuard(lines, index, `if(${setParts[2]}.avatar != undefined && ${setParts[2]}.avatar.setParts != undefined)`)) {
      output.push(`${setParts[1]}if(${setParts[2]}.avatar != undefined && ${setParts[2]}.avatar.setParts != undefined)`);
      output.push(`${setParts[1]}{`);
      output.push(`${setParts[1]}   ${setParts[2]}.avatar.setParts();`);
      output.push(`${setParts[1]}}`);
      continue;
    }
    const itemFrame = line.match(/^(\s*)([A-Za-z_$][\w$]*)\.avatar\.itemFrame = ([^;]+);$/u);
    if (itemFrame && !hasRecentGuard(lines, index, `if(${itemFrame[2]}.avatar != undefined)`)) {
      output.push(`${itemFrame[1]}if(${itemFrame[2]}.avatar != undefined)`);
      output.push(`${itemFrame[1]}{`);
      output.push(`${itemFrame[1]}   ${itemFrame[2]}.avatar.itemFrame = ${itemFrame[3]};`);
      output.push(`${itemFrame[1]}}`);
      continue;
    }
    const rootNext = line.match(/^(\s*)_root\.nextFrame\(\);$/u);
    if (rootNext) {
      output.push(`${rootNext[1]}zhSuperAdvanceGameplayFrame();`);
      if (
        String(lines[index + 1] || "").trim() === "if(_level0 != undefined && _level0 != _root && _level0.nextFrame != undefined)" &&
        String(lines[index + 2] || "").trim() === "{" &&
        String(lines[index + 3] || "").trim() === "_level0.nextFrame();" &&
        String(lines[index + 4] || "").trim() === "}"
      ) {
        index += 4;
      }
      continue;
    }
    output.push(line);
  }
  return output.join("\n");
}

function hasRecentGuard(lines, index, guardLine) {
  for (let cursor = index - 1; cursor >= 0 && index - cursor <= 3; cursor -= 1) {
    if (String(lines[cursor] || "").trim() === guardLine) {
      return true;
    }
  }
  return false;
}

function hasFollowingLine(lines, index, expectedLine) {
  for (let cursor = index + 1; cursor < lines.length && cursor - index <= 4; cursor += 1) {
    if (String(lines[cursor] || "").trim() === expectedLine) {
      return true;
    }
  }
  return false;
}

function patchSwf({ ffdecCli, swfPath, workRoot, dryRun, diagnostics }) {
  const baseName = path.basename(swfPath, ".swf");
  const workDir = path.join(workRoot, baseName);
  const scriptRoot = path.join(workDir, "scripts");
  removeDirContents(workDir);
  ensureDirSync(scriptRoot);
  runFfdec(ffdecCli, ["-cli", "-export", "script", scriptRoot, swfPath], `export ${baseName} scripts`);

  const changedScripts = [];
  let alreadyPatchedCount = 0;
  let loadCheckCandidateCount = 0;

  for (const script of collectScripts(scriptRoot)) {
    const patch = patchScriptFile(script.filePath, {
      diagnostics: Boolean(diagnostics) && baseName === "sceneBank"
    });
    if (patch.alreadyPatched) {
      alreadyPatchedCount += 1;
    }
    if (patch.changed || patch.alreadyPatched) {
      loadCheckCandidateCount += 1;
    }
    if (patch.changed) {
      changedScripts.push(script);
    }
  }

  if (changedScripts.length > 0 && !dryRun) {
    const outputSwf = path.join(workDir, `${baseName}.patched.swf`);
    replaceSequential(ffdecCli, swfPath, outputSwf, changedScripts);
    fs.copyFileSync(outputSwf, swfPath);
  }

  return {
    swfPath: path.relative(paths.projectRoot, swfPath).replace(/\\/gu, "/"),
    changed: changedScripts.length > 0,
    dryRun: Boolean(dryRun),
    diagnostics: Boolean(diagnostics) && baseName === "sceneBank",
    loadCheckCandidateCount,
    alreadyPatchedCount,
    changedScripts: changedScripts.map((script) => ({
      exportPath: script.exportPath,
      replaceTarget: script.replaceTarget
    }))
  };
}

function collectTargetSwfs(args) {
  if (!fileExists(SUPER_SCENE_DIR)) {
    throw new Error(`Super Power scene directory is missing: ${SUPER_SCENE_DIR}`);
  }
  const requestedScenes = args.scene
    ? String(args.scene)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.endsWith(".swf") ? item : `${item}.swf`)
    : [];
  const requestedSet = new Set(requestedScenes.map((item) => item.toLowerCase()));
  return fs.readdirSync(SUPER_SCENE_DIR)
    .filter((entry) => /\.swf$/iu.test(entry))
    .filter((entry) => requestedSet.size === 0 || requestedSet.has(entry.toLowerCase()))
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((entry) => path.join(SUPER_SCENE_DIR, entry));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const ffdecCli = config.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("FFDec CLI is not configured.");
  }

  const targetSwfs = collectTargetSwfs(args);
  const workRoot = path.join(paths.tempDir, "as2-super-power-scene-loadcheck");
  removeDirContents(workRoot);
  ensureDirSync(workRoot);

  const results = targetSwfs.map((swfPath) => patchSwf({
    ffdecCli,
    swfPath,
    workRoot,
    dryRun: Boolean(args.dryRun),
    diagnostics: Boolean(args.diagnostics)
  }));
  const changedCount = results.filter((item) => item.changed).length;
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    dryRun: Boolean(args.dryRun),
    diagnostics: Boolean(args.diagnostics),
    changedCount,
    targetCount: targetSwfs.length,
    results
  };

  writeJson(REPORT_PATH, report);

  const manifestPath = path.join(paths.as2PackDir, "manifest.json");
  const manifest = readJson(manifestPath, null);
  if (manifest && changedCount > 0 && !args.dryRun) {
    manifest.superPowerSceneLoadCheckPatch = {
      generatedAt: report.generatedAt,
      reportPath: path.relative(paths.projectRoot, REPORT_PATH).replace(/\\/gu, "/"),
      changedCount,
      changedSwfs: results.filter((item) => item.changed).map((item) => item.swfPath)
    };
    writeJson(manifestPath, manifest);
  }

  printJson(report);
}

main();
