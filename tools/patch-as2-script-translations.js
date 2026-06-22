const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const {
  ensureDirSync,
  fileExists,
  readJson,
  removeDirContents,
  writeJson
} = require("./lib/fs-utils");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { normalizeTranslatedText } = require("./lib/text-utils");

const QA_FLASHVARS_KEY = "flashpointQaAs2Dialog";

function escapeForRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function escapeSwfScriptLiteral(text, quote) {
  return String(text || "")
    .replace(/\\/gu, "\\\\")
    .replace(new RegExp(escapeForRegExp(quote), "gu"), `\\${quote}`)
    .replace(/\r/gu, "\\r")
    .replace(/\n/gu, "\\n")
    .replace(/\t/gu, "\\t");
}

function replaceSwfScriptLiteralInLine(line, { quote, rawLiteral, occurrenceIndex, translatedLiteral }) {
  let currentIndex = 0;
  return String(line || "").replace(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/gu, (match, doubleQuoted, singleQuoted) => {
    currentIndex += 1;
    if (currentIndex !== occurrenceIndex) {
      return match;
    }
    const matchQuote = match.startsWith("'") ? "'" : '"';
    const matchRawLiteral = matchQuote === '"' ? doubleQuoted : singleQuoted;
    if (matchQuote !== quote || matchRawLiteral !== rawLiteral) {
      return match;
    }
    return `${quote}${translatedLiteral}${quote}`;
  });
}

function translatedScriptFileEntry(filePath, translatedScriptRoot) {
  const exportPath = path.relative(translatedScriptRoot, filePath).replace(/\\/gu, "/");
  return {
    filePath,
    exportPath,
    replaceTarget: `\\${exportPath.replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`
  };
}

function openDb(dbPath) {
  const { DatabaseSync } = require("node:sqlite");
  return new DatabaseSync(dbPath, { readOnly: true });
}

function queryTranslatedScriptRows(assetPath) {
  const db = openDb(paths.textIndexPath);
  const rows = db.prepare(`
    SELECT s.asset_id, a.asset_path, s.source_text, s.context_json,
           a.extracted_path, a.metadata_json, COALESCE(et.translated_text, t.translated_text) AS translated_text
    FROM strings s
    JOIN assets a ON a.asset_id = s.asset_id
    LEFT JOIN exact_translations et ON et.string_key = s.string_key
    LEFT JOIN translations t ON t.generic_key = s.generic_key
    WHERE s.source_group = 'as2'
      AND a.asset_path = ?
      AND json_extract(s.context_json, '$.kind') = 'swf-script'
      AND COALESCE(et.translated_text, t.translated_text) IS NOT NULL
    ORDER BY s.context_key
  `).all(assetPath);
  db.close();
  return rows;
}

function writeTranslatedScriptFiles({ rows, sourceScriptRoot, translatedScriptRoot }) {
  const changedFiles = new Set();
  const skippedRows = [];

  for (const row of rows) {
    const context = JSON.parse(row.context_json || "{}");
    if (!context.exportPath || !context.lineNumber || !context.rawLiteral || !context.quote) {
      skippedRows.push({ sourceText: row.source_text, reason: "incomplete-context" });
      continue;
    }
    const sourceFile = path.join(sourceScriptRoot, context.exportPath);
    if (!fileExists(sourceFile)) {
      skippedRows.push({ sourceText: row.source_text, reason: "missing-source-script", exportPath: context.exportPath });
      continue;
    }
    const sourceLines = fs.readFileSync(sourceFile, "utf8").split(/\r?\n/u);
    const lineIndex = Math.max(0, Number(context.lineNumber) - 1);
    if (lineIndex >= sourceLines.length) {
      skippedRows.push({ sourceText: row.source_text, reason: "line-out-of-range", exportPath: context.exportPath });
      continue;
    }

    const targetFile = path.join(translatedScriptRoot, context.exportPath);
    ensureDirSync(path.dirname(targetFile));
    let nextLines = sourceLines;
    if (fileExists(targetFile)) {
      nextLines = fs.readFileSync(targetFile, "utf8").split(/\r?\n/u);
      if (lineIndex >= nextLines.length) {
        nextLines = sourceLines;
      }
    }

    const translatedLiteral = escapeSwfScriptLiteral(
      normalizeTranslatedText(row.translated_text, row.source_text),
      context.quote
    );
    const nextLine = replaceSwfScriptLiteralInLine(nextLines[lineIndex], {
      quote: context.quote,
      rawLiteral: context.rawLiteral,
      occurrenceIndex: Number(context.occurrenceIndex || 1),
      translatedLiteral
    });
    if (nextLine === nextLines[lineIndex]) {
      skippedRows.push({ sourceText: row.source_text, reason: "literal-not-replaced", exportPath: context.exportPath });
      continue;
    }

    nextLines[lineIndex] = nextLine;
    fs.writeFileSync(targetFile, nextLines.join("\n"), "utf8");
    changedFiles.add(targetFile);
  }

  return {
    translatedFiles: [...changedFiles]
      .filter((filePath) => /\.as$/iu.test(filePath))
      .map((filePath) => translatedScriptFileEntry(filePath, translatedScriptRoot))
      .sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en")),
    skippedRows
  };
}

function listFilesRecursive(rootDir, predicate = () => true) {
  const out = [];
  if (!fileExists(rootDir)) {
    return out;
  }
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(entryPath, predicate));
    } else if (predicate(entryPath)) {
      out.push(entryPath);
    }
  }
  return out;
}

function findSpyMainActionScript(sourceScriptRoot) {
  const direct = path.join(sourceScriptRoot, "scripts", "DefineSprite_196", "frame_1", "DoAction.as");
  if (fileExists(direct)) {
    return direct;
  }
  const candidates = listFilesRecursive(sourceScriptRoot, (filePath) => /\.as$/iu.test(filePath)).filter((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    return content.includes('roomName = "Main Street";') &&
      content.includes("char2.talkyText") &&
      content.includes("function initChars()");
  });
  if (candidates.length === 1) {
    return candidates[0];
  }
  throw new Error(`Expected one SpyMain action script, found ${candidates.length}.`);
}

function insertSpyMainQaDialogHook(source) {
  let next = String(source || "").replace(/\r\n/gu, "\n");
  if (!next.includes("function flashpointQaMaybeShowSpyMainDialog()")) {
    const hook = [
      "flashpointQaSpyMainDialogShown = false;",
      "flashpointQaSpyMainDialogSceneUrl = String(_url) + \"&\" + String(this._url);",
      `flashpointQaSpyMainDialogModeCache = flashpointQaSpyMainDialogSceneUrl.indexOf("${QA_FLASHVARS_KEY}=spy-main") >= 0 || flashpointQaSpyMainDialogSceneUrl.indexOf("${QA_FLASHVARS_KEY}=spy") >= 0 ? "spy-main" : "";`,
      "function flashpointQaSpyMainDialogMode()",
      "{",
      `   var _loc1_ = String(_root.${QA_FLASHVARS_KEY});`,
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      `      _loc1_ = String(_level0.${QA_FLASHVARS_KEY});`,
      "   }",
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      `      _loc1_ = String(${QA_FLASHVARS_KEY});`,
      "   }",
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      "      _loc1_ = String(flashpointQaSpyMainDialogModeCache);",
      "   }",
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      "      var _loc2_ = String(_root._url) + \"&\" + String(_level0._url) + \"&\" + String(flashpointQaSpyMainDialogSceneUrl);",
      "      _loc2_ = _loc2_ + \"&\" + String(this._url) + \"&\" + String(_url);",
      `      if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=spy-main") >= 0 || _loc2_.indexOf("${QA_FLASHVARS_KEY}=spy") >= 0)`,
      "      {",
      "         _loc1_ = \"spy-main\";",
      "      }",
      "   }",
      "   return _loc1_;",
      "}",
      "function flashpointQaSpyMainDialogActor()",
      "{",
      "   return char;",
      "}",
      "function flashpointQaSpyMainDialogText()",
      "{",
      "   if(char2 != undefined && char2.talkyText != undefined && char2.talkyText != \"\")",
      "   {",
      "      return char2.talkyText;",
      "   }",
      "   return \"\";",
      "}",
      "function flashpointQaSpyMainPlaceActor(target)",
      "{",
      "   if(target == undefined || char == undefined)",
      "   {",
      "      return undefined;",
      "   }",
      "   if(target == char)",
      "   {",
      "      return undefined;",
      "   }",
      "   target._visible = true;",
      "   target._alpha = 100;",
      "   target._x = char._x - 150;",
      "   target._y = char._y;",
      "   if(target.coordinates != undefined && char.coordinates != undefined)",
      "   {",
      "      target.coordinates.x = char.coordinates.x - 150;",
      "      target.coordinates.y = char.coordinates.y;",
      "   }",
      "   target.targetX = target._x;",
      "   target.targetY = target._y;",
      "   target.maxLeft = target._x;",
      "   target.maxRight = target._x;",
      "   if(target.action != undefined)",
      "   {",
      "      target.action(\"stand\");",
      "   }",
      "   target.swapDepths(240000);",
      "}",
      "function flashpointQaSpyMainDialogReady()",
      "{",
      "   var _loc1_ = flashpointQaSpyMainDialogActor();",
      "   if(_loc1_ == undefined || flashpointQaSpyMainDialogText() == \"\" || _root.manualSay == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   if(_loc1_.coordinates == undefined || _loc1_.coordinates.x == undefined || _loc1_.coordinates.y == undefined || _loc1_.charScale == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   if(_loc1_.avatar == undefined || _loc1_.avatar.head == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   if(_root.camera == undefined || _root.camera.scene == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   if(_root.sayDepth == undefined || _root.chatDepth == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   return true;",
      "}",
      "function flashpointQaMaybeShowSpyMainDialog()",
      "{",
      "   if(flashpointQaSpyMainDialogShown)",
      "   {",
      "      return undefined;",
      "   }",
      "   var _loc1_ = flashpointQaSpyMainDialogMode();",
      "   if(_loc1_ != \"spy-main\" && _loc1_ != \"spy\")",
      "   {",
      "      return undefined;",
      "   }",
      "   if(!flashpointQaSpyMainDialogReady())",
      "   {",
      "      return undefined;",
      "   }",
      "   var _loc2_ = flashpointQaSpyMainDialogActor();",
      "   var _loc3_ = flashpointQaSpyMainDialogText();",
      "   if(_root.takeClick != undefined)",
      "   {",
      "      _root.takeClick._visible = true;",
      "   }",
      "   flashpointQaSpyMainPlaceActor(_loc2_);",
      "   _loc2_.talkyText = _loc3_;",
      "   _root.manualSay(_loc2_,_loc3_);",
      "   var _loc4_ = _loc2_.sayDepth != undefined && _root[\"say\" + _loc2_.sayDepth] != undefined;",
      "   if(_loc4_)",
      "   {",
      "      _root[\"say\" + _loc2_.sayDepth].wait = 900;",
      "      _root[\"say\" + _loc2_.sayDepth]._visible = true;",
      "      _root[\"say\" + _loc2_.sayDepth]._alpha = 100;",
      "      _root[\"say\" + _loc2_.sayDepth].swapDepths(250000);",
      "      flashpointQaSpyMainDialogShown = true;",
      "      flashpointQaSpyMainTrack(\"QaDialogShown\");",
      "   }",
      "   else",
      "   {",
      "      flashpointQaSpyMainTrack(\"QaDialogMissingBubble\");",
      "   }",
      "}",
      "function flashpointQaSpyMainTrack(eventName)",
      "{",
      "   var _loc1_ = flashpointQaSpyMainDialogMode();",
      "   if(_loc1_ == \"spy-main\" || _loc1_ == \"spy\")",
      "   {",
      "      var _loc2_ = flashpointQaSpyMainDialogActor();",
      "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=SpyMain&event=\" + eventName + \"&ready=\" + (_loc2_ != undefined) + \"&talky=\" + (flashpointQaSpyMainDialogText() != \"\") + \"&manual=\" + (_root.manualSay != undefined) + \"&coords=\" + (_loc2_ != undefined && _loc2_.coordinates != undefined && _loc2_.coordinates.x != undefined) + \"&avatar=\" + (_loc2_ != undefined && _loc2_.avatar != undefined && _loc2_.avatar.head != undefined) + \"&camera=\" + (_root.camera != undefined && _root.camera.scene != undefined) + \"&depth=\" + (_root.sayDepth != undefined) + \"&bubble=\" + (_loc2_ != undefined && _loc2_.sayDepth != undefined && _root[\"say\" + _loc2_.sayDepth] != undefined),0);",
      "   }",
      "}",
      "function flashpointQaSpyMainDialogTick()",
      "{",
      "   flashpointQaSpyMainDialogWait = flashpointQaSpyMainDialogWait + 1;",
      "   if(flashpointQaSpyMainDialogWait < 4)",
      "   {",
      "      return undefined;",
      "   }",
      "   if(flashpointQaSpyMainDialogWait == 4)",
      "   {",
      "      flashpointQaSpyMainTrack(\"QaHookTick4\");",
      "   }",
      "   flashpointQaMaybeShowSpyMainDialog();",
      "   if(flashpointQaSpyMainDialogShown || flashpointQaSpyMainDialogWait > 80)",
      "   {",
      "      clearInterval(flashpointQaSpyMainDialogInterval);",
      "   }",
      "}",
      "function flashpointQaArmSpyMainDialog()",
      "{",
      "   if(flashpointQaSpyMainDialogInterval != undefined)",
      "   {",
      "      clearInterval(flashpointQaSpyMainDialogInterval);",
      "   }",
      "   flashpointQaSpyMainDialogWait = 0;",
      "   flashpointQaSpyMainDialogInterval = setInterval(this,\"flashpointQaSpyMainDialogTick\",250);",
      "}",
      ""
    ].join("\n");
    const marker = "function init()\n{";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate init marker for SpyMain QA hook.");
    }
    next = next.replace(marker, `${hook}${marker}`);
  }

  if (!next.includes("flashpointQaArmSpyMainDialog();\n   flashpointQaMaybeShowSpyMainDialog();\n}\nfunction init2()")) {
    const marker = "   };\n}\nfunction init2()";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate init tail for SpyMain QA hook call.");
    }
    next = next.replace(marker, "   };\n   flashpointQaArmSpyMainDialog();\n   flashpointQaMaybeShowSpyMainDialog();\n}\nfunction init2()");
  }

  if (!next.includes("   flashpointQaMaybeShowSpyMainDialog();\n}\nfunction spray()")) {
    const marker = "   }\n}\nfunction spray()";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate init2 tail for SpyMain QA hook call.");
    }
    next = next.replace(marker, "   }\n   flashpointQaMaybeShowSpyMainDialog();\n}\nfunction spray()");
  }

  if (!next.includes("   flashpointQaArmSpyMainDialog();\n   _root.nextFrame();")) {
    const marker = "   _root.nextFrame();\n}";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate initChars tail for SpyMain QA hook arm.");
    }
    next = next.replace(marker, "   flashpointQaArmSpyMainDialog();\n   _root.nextFrame();\n}");
  }

  return next;
}

function applyQaDialogHook({ assetPath, qaDialogMode, sourceScriptRoot, translatedScriptRoot, translatedFiles }) {
  const mode = String(qaDialogMode || "").trim().toLowerCase();
  if (!mode) {
    return { requested: false, changed: false };
  }
  if (mode !== "spy-main" && mode !== "spy") {
    throw new Error(`Unsupported --qa-dialog-mode value: ${qaDialogMode}`);
  }
  if (!/scenes\/islandSpy\/sceneSpyMain\.swf$/iu.test(assetPath)) {
    throw new Error(`--qa-dialog-mode=${qaDialogMode} is only supported for sceneSpyMain.swf right now.`);
  }

  const sourceFile = findSpyMainActionScript(sourceScriptRoot);
  const exportPath = path.relative(sourceScriptRoot, sourceFile).replace(/\\/gu, "/");
  const targetFile = path.join(translatedScriptRoot, exportPath);
  ensureDirSync(path.dirname(targetFile));
  if (!fileExists(targetFile)) {
    fs.copyFileSync(sourceFile, targetFile);
  }

  const before = fs.readFileSync(targetFile, "utf8");
  const after = insertSpyMainQaDialogHook(before);
  if (after !== before) {
    fs.writeFileSync(targetFile, after, "utf8");
  }

  const entry = translatedScriptFileEntry(targetFile, translatedScriptRoot);
  if (!translatedFiles.some((item) => item.exportPath === entry.exportPath)) {
    translatedFiles.push(entry);
    translatedFiles.sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en"));
  }

  return {
    requested: true,
    mode,
    changed: after !== before,
    exportPath: entry.exportPath,
    replaceTarget: entry.replaceTarget
  };
}

function runFfdec(ffdecCli, args, label) {
  const result = spawnSync(ffdecCli, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 32
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${result.stderr || result.stdout || result.error?.message || "unknown error"}`);
  }
}

function replaceScriptsSequentially({ ffdecCli, inputSwf, outputSwf, translatedFiles }) {
  let currentInput = inputSwf;
  const tempOutputs = [];
  for (let index = 0; index < translatedFiles.length; index += 1) {
    const entry = translatedFiles[index];
    const nextOutput = index === translatedFiles.length - 1
      ? outputSwf
      : path.join(paths.tempDir, `as2-script-patch-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}.swf`);
    runFfdec(
      ffdecCli,
      ["-replace", currentInput, nextOutput, entry.replaceTarget, entry.filePath],
      `replace ${entry.exportPath}`
    );
    if (nextOutput !== outputSwf) {
      tempOutputs.push(nextOutput);
    }
    currentInput = nextOutput;
  }
  for (const tempOutput of tempOutputs) {
    if (fileExists(tempOutput)) {
      fs.rmSync(tempOutput, { force: true });
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const assetPath = String(args["asset-path"] || "").replace(/\\/gu, "/");
  const qaDialogMode = args["qa-dialog-mode"] || args["qa-dialog"] || "";
  if (!assetPath) {
    throw new Error("--asset-path is required.");
  }

  const config = loadConfig();
  const ffdecCli = config.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("FFDec CLI is not configured.");
  }

  const rows = queryTranslatedScriptRows(assetPath);
  if (!rows.length) {
    throw new Error(`No translated AS2 script rows found for ${assetPath}.`);
  }

  const first = rows[0];
  const metadata = JSON.parse(first.metadata_json || "{}");
  const sourceScriptRoot = metadata.ffdec?.scriptOutputDir;
  if (!sourceScriptRoot || !fileExists(sourceScriptRoot)) {
    throw new Error(`Missing FFDec script root for ${assetPath}.`);
  }
  const inputSwf = first.extracted_path;
  if (!inputSwf || !fileExists(inputSwf)) {
    throw new Error(`Missing extracted SWF for ${assetPath}.`);
  }

  const workDir = path.join(paths.tempDir, `as2-script-translation-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const translatedScriptRoot = path.join(workDir, "scripts");
  const outputSwf = path.join(paths.as2PackDir, "swf", assetPath);
  ensureDirSync(path.dirname(outputSwf));
  ensureDirSync(translatedScriptRoot);

  const scriptPatch = writeTranslatedScriptFiles({
    rows,
    sourceScriptRoot,
    translatedScriptRoot
  });
  const qaDialogPatch = applyQaDialogHook({
    assetPath,
    qaDialogMode,
    sourceScriptRoot,
    translatedScriptRoot,
    translatedFiles: scriptPatch.translatedFiles
  });
  if (!scriptPatch.translatedFiles.length) {
    throw new Error(`No script files changed for ${assetPath}.`);
  }

  replaceScriptsSequentially({
    ffdecCli,
    inputSwf,
    outputSwf,
    translatedFiles: scriptPatch.translatedFiles
  });

  const manifestPath = path.join(paths.as2PackDir, "manifest.json");
  const manifest = readJson(manifestPath, {
    generatedAt: new Date().toISOString(),
    sourceGroup: "as2",
    canonicalKeys: [],
    assetsPatched: 0,
    externalTextAssets: [],
    swfPatchedAssets: [],
    pendingSwfAssets: []
  });
  manifest.generatedAt = new Date().toISOString();
  manifest.assetsPatched = Number(manifest.assetsPatched || 0) + 1;
  manifest.swfPatchedAssets = [
    ...(manifest.swfPatchedAssets || []).filter((entry) => entry.assetPath !== assetPath),
    {
      assetId: first.asset_id,
      assetPath,
      outputPath: outputSwf
    }
  ];

  const runtimeZip = buildRuntimeZipForSourceGroup({
    config,
    sourceGroup: "as2",
    manifest
  });
  writeJson(manifestPath, manifest);

  if (fileExists(workDir)) {
    removeDirContents(workDir);
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceGroup: "as2",
    assetPath,
    outputSwf,
    translatedRows: rows.length,
    changedScriptFiles: scriptPatch.translatedFiles.length,
    qaDialogPatch,
    skippedRows: scriptPatch.skippedRows,
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "as2", `as2-script-translation-patch-${path.basename(assetPath, ".swf")}.json`);
  writeJson(reportPath, report);
  printJson({
    ok: true,
    reportPath,
    assetPath,
    outputSwf,
    translatedRows: rows.length,
    changedScriptFiles: scriptPatch.translatedFiles.length,
    qaDialogPatch,
    skippedRows: scriptPatch.skippedRows.length,
    runtimeZip
  });
}

main();
