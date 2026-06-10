const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const {
  ensureDirSync,
  fileExists,
  hashString,
  listFilesRecursive,
  removeDirContents,
  writeJson
} = require("./lib/fs-utils");
const { generateLaunchManifest } = require("./lib/launch-manifest");

const AUDIO_EXTENSION_RE = /\.(?:mp3|wav|flv|ogg)$/iu;
const SWF_EXTENSION_RE = /\.swf$/iu;
const AS2_SCENE_FOLDER_RE = /content\/www\.poptropica\.com\/scenes\/island([^/]+)\//iu;
const AS2_ISLAND_SCENE_SWF_RE = /^content\/www\.poptropica\.com\/scenes\/island[^/]+\/.*\.swf$/iu;
const SOUND_CALL_RE = /\b(showSound|attachSound|loadSound)\s*\(([^;\n]*)\)/giu;
const STRING_LITERAL_RE = /^\s*(["'])((?:\\.|(?!\1)[^\\])*)\1/u;
const AS_EXTENSION_SET = new Set([".as"]);
const EXPORTED_SOUND_EXTENSION_SET = new Set([".flv", ".mp3", ".ogg", ".wav"]);
const SCRIPT_EXPORT_MARKER = ".ffdec-script-export.json";
const SCRIPT_EXPORT_ERROR_MARKER = ".ffdec-script-export-error.json";
const SOUND_EXPORT_MARKER = ".ffdec-sound-export.json";
const SOUND_EXPORT_ERROR_MARKER = ".ffdec-sound-export-error.json";
const FFDEC_EXPORT_TIMEOUT_MS = Number.parseInt(process.env.POPTROPICA_FFDEC_EXPORT_TIMEOUT_MS || "120000", 10);

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, ...rest] = arg.slice(2).split("=");
    args[key] = rest.length ? rest.join("=") : "1";
  }
  return args;
}

function flagEnabled(value) {
  return value === true || /^(1|true|yes|y)$/iu.test(String(value || ""));
}

function parseNonNegativeInt(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parsePositiveInt(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function listArchiveEntries(archivePath, tarBin) {
  if (!archivePath || !fileExists(archivePath)) {
    throw new Error(`Archive not found: ${archivePath || "(empty)"}`);
  }
  if (!tarBin || !fileExists(tarBin)) {
    throw new Error("A tar executable is required to list zip contents.");
  }
  const result = spawnSync(tarBin, ["-tf", archivePath], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 256
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `Unable to list ${archivePath}`).trim());
  }
  return result.stdout
    .split(/\r?\n/gu)
    .map((line) => line.trim().replace(/\\/gu, "/"))
    .filter(Boolean);
}

function extractArchiveEntry(archivePath, tarBin, entry, outputRoot) {
  ensureDirSync(outputRoot);
  const result = spawnSync(tarBin, ["-xf", archivePath, "-C", outputRoot, entry], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 32
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `Unable to extract ${entry}`).trim());
  }
}

function listExportedScriptFiles(scriptRoot) {
  if (!fileExists(scriptRoot)) {
    return [];
  }
  return listFilesRecursive(scriptRoot, { includeExtensions: AS_EXTENSION_SET })
    .map((filePath) => path.relative(scriptRoot, filePath).replace(/\\/gu, "/"))
    .sort((left, right) => left.localeCompare(right, "en"));
}

function writeScriptExportMarker(outputDir, payload) {
  fs.writeFileSync(
    path.join(outputDir, SCRIPT_EXPORT_MARKER),
    `${JSON.stringify({
      exportedAt: new Date().toISOString(),
      ...payload
    }, null, 2)}\n`,
    "utf8"
  );
}

function writeScriptExportErrorMarker(outputDir, payload) {
  ensureDirSync(outputDir);
  fs.writeFileSync(
    path.join(outputDir, SCRIPT_EXPORT_ERROR_MARKER),
    `${JSON.stringify({
      failedAt: new Date().toISOString(),
      ...payload
    }, null, 2)}\n`,
    "utf8"
  );
}

function exportSwfScripts(swfPath, outputDir, ffdecCli) {
  const tempDir = path.join(
    paths.tempDir,
    "as2-sound-script-export",
    `${path.basename(outputDir)}-${process.pid}-${Date.now()}`
  );
  ensureDirSync(tempDir);
  removeDirContents(tempDir);
  const result = spawnSync(ffdecCli, ["-cli", "-export", "script", tempDir, swfPath], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 16,
    timeout: FFDEC_EXPORT_TIMEOUT_MS
  });
  if (result.status !== 0) {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    const error = (result.stderr || result.stdout || result.error?.message || "FFDec script export failed").trim();
    const timedOut = result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM";
    writeScriptExportErrorMarker(outputDir, {
      swfPath,
      timedOut,
      timeoutMs: FFDEC_EXPORT_TIMEOUT_MS,
      error
    });
    return {
      ok: false,
      outputDir,
      timedOut,
      error
    };
  }

  try {
    if (fileExists(outputDir)) {
      removeDirContents(outputDir);
      fs.rmSync(outputDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    }
    ensureDirSync(path.dirname(outputDir));
    fs.renameSync(tempDir, outputDir);
    const scriptFiles = listExportedScriptFiles(outputDir);
    writeScriptExportMarker(outputDir, {
      swfPath,
      scriptFileCount: scriptFiles.length
    });
    return {
      ok: true,
      outputDir,
      cacheUpdated: true,
      scriptFiles
    };
  } catch (error) {
    const scriptFiles = listExportedScriptFiles(tempDir);
    writeScriptExportMarker(tempDir, {
      swfPath,
      scriptFileCount: scriptFiles.length,
      cacheUpdateError: error.message
    });
    return {
      ok: true,
      outputDir: tempDir,
      cacheUpdated: false,
      cacheUpdateError: error.message,
      scriptFiles
    };
  }
}

function listExportedSoundFiles(soundRoot) {
  if (!fileExists(soundRoot)) {
    return [];
  }
  return listFilesRecursive(soundRoot)
    .filter((filePath) => EXPORTED_SOUND_EXTENSION_SET.has(path.extname(filePath).toLowerCase()))
    .map((filePath) => ({
      path: path.relative(soundRoot, filePath).replace(/\\/gu, "/"),
      bytes: fs.statSync(filePath).size,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase()
    }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
}

function stripSoundExtensions(value) {
  let current = String(value || "");
  let changed = true;
  while (changed) {
    changed = false;
    for (const extension of EXPORTED_SOUND_EXTENSION_SET) {
      if (current.endsWith(extension)) {
        current = current.slice(0, -extension.length);
        changed = true;
        break;
      }
    }
  }
  return current;
}

function addSoundNameCandidates(candidates, value) {
  const normalized = String(value || "").replace(/\\/gu, "/").trim().toLowerCase();
  if (!normalized) {
    return;
  }
  for (const candidate of [normalized, path.posix.basename(normalized)]) {
    candidates.add(candidate);
    const stripped = stripSoundExtensions(candidate);
    candidates.add(stripped);
    candidates.add(stripped.replace(/^\d+_/u, ""));
  }
}

function soundNameCandidates(value) {
  const candidates = new Set();
  addSoundNameCandidates(candidates, value);
  return candidates;
}

function readSwfAnalysisBytes(swfPath) {
  if (!fileExists(swfPath)) {
    return null;
  }
  const bytes = fs.readFileSync(swfPath);
  const signature = bytes.slice(0, 3).toString("ascii");
  if (signature === "FWS") {
    return bytes.slice(8);
  }
  if (signature === "CWS") {
    return zlib.inflateSync(bytes.slice(8));
  }
  return null;
}

function extractPrintableSwfStrings(swfPath) {
  let bytes = null;
  try {
    bytes = readSwfAnalysisBytes(swfPath);
  } catch {
    bytes = null;
  }
  if (!bytes) {
    return [];
  }
  const strings = new Set();
  let current = [];
  const flush = () => {
    const value = Buffer.from(current).toString("ascii").trim();
    if (value.length >= 3) {
      strings.add(value);
    }
    current = [];
  };
  for (const byte of bytes) {
    if (byte >= 32 && byte <= 126) {
      current.push(byte);
    } else {
      flush();
    }
  }
  flush();
  return [...strings].sort((left, right) => left.localeCompare(right, "en"));
}

function writeSoundExportMarker(outputDir, payload) {
  fs.writeFileSync(
    path.join(outputDir, SOUND_EXPORT_MARKER),
    `${JSON.stringify({
      exportedAt: new Date().toISOString(),
      ...payload
    }, null, 2)}\n`,
    "utf8"
  );
}

function writeSoundExportErrorMarker(outputDir, payload) {
  ensureDirSync(outputDir);
  fs.writeFileSync(
    path.join(outputDir, SOUND_EXPORT_ERROR_MARKER),
    `${JSON.stringify({
      failedAt: new Date().toISOString(),
      ...payload
    }, null, 2)}\n`,
    "utf8"
  );
}

function exportSwfSounds(swfPath, outputDir, ffdecCli) {
  const tempDir = path.join(
    paths.tempDir,
    "as2-sound-tag-export",
    `${path.basename(outputDir)}-${process.pid}-${Date.now()}`
  );
  ensureDirSync(tempDir);
  removeDirContents(tempDir);
  const result = spawnSync(ffdecCli, ["-cli", "-export", "sound", tempDir, swfPath], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 16,
    timeout: FFDEC_EXPORT_TIMEOUT_MS
  });
  if (result.status !== 0) {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    const error = (result.stderr || result.stdout || result.error?.message || "FFDec sound export failed").trim();
    const timedOut = result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM";
    writeSoundExportErrorMarker(outputDir, {
      swfPath,
      timedOut,
      timeoutMs: FFDEC_EXPORT_TIMEOUT_MS,
      error
    });
    return {
      ok: false,
      outputDir,
      timedOut,
      error
    };
  }
  writeJson(path.join(tempDir, SOUND_EXPORT_MARKER), {
    generatedAt: new Date().toISOString(),
    sourceSwf: swfPath
  });

  try {
    if (fileExists(outputDir)) {
      removeDirContents(outputDir);
      fs.rmSync(outputDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    }
    ensureDirSync(path.dirname(outputDir));
    fs.renameSync(tempDir, outputDir);
    const soundFiles = listExportedSoundFiles(outputDir);
    writeSoundExportMarker(outputDir, {
      swfPath,
      soundFileCount: soundFiles.length
    });
    return {
      ok: true,
      outputDir,
      cacheUpdated: true,
      soundFiles
    };
  } catch (error) {
    const soundFiles = listExportedSoundFiles(tempDir);
    writeSoundExportMarker(tempDir, {
      swfPath,
      soundFileCount: soundFiles.length,
      cacheUpdateError: error.message
    });
    return {
      ok: true,
      outputDir: tempDir,
      cacheUpdated: false,
      cacheUpdateError: error.message,
      soundFiles
    };
  }
}

function soundExportCacheState(soundRoot) {
  if (fileExists(path.join(soundRoot, SOUND_EXPORT_ERROR_MARKER))) {
    return "failed";
  }
  if (fileExists(path.join(soundRoot, SOUND_EXPORT_MARKER))) {
    return "ready";
  }
  if (listExportedSoundFiles(soundRoot).length > 0) {
    return "ready_unmarked";
  }
  if (fileExists(soundRoot)) {
    return "empty_or_partial";
  }
  return "missing";
}

function hasExportedScripts(scriptRoot) {
  return fileExists(path.join(scriptRoot, SCRIPT_EXPORT_MARKER)) || listExportedScriptFiles(scriptRoot).length > 0;
}

function scriptExportCacheState(scriptRoot) {
  if (fileExists(path.join(scriptRoot, SCRIPT_EXPORT_ERROR_MARKER))) {
    return "failed";
  }
  if (hasExportedScripts(scriptRoot)) {
    return "ready";
  }
  if (fileExists(scriptRoot)) {
    return "empty_or_partial";
  }
  return "missing";
}

function buildAssetId(sourceGroup, containerPath, assetPath) {
  return hashString(`${sourceGroup}::${containerPath}::${assetPath}`);
}

function normalizeSceneFolder(value) {
  return String(value || "").replace(/^island/iu, "").toLowerCase();
}

function buildAs2LaunchIndex(config) {
  const manifest = generateLaunchManifest(config, { write: false });
  const bySceneFolder = new Map();
  const as2Entries = manifest.entries.filter((entry) => entry.sourceGroup === "as2");
  for (const entry of as2Entries) {
    bySceneFolder.set(normalizeSceneFolder(entry.sceneFolder), entry);
  }
  return { as2Entries, bySceneFolder };
}

function sceneFolderFromAssetPath(assetPath) {
  const match = String(assetPath || "").replace(/\\/gu, "/").match(AS2_SCENE_FOLDER_RE);
  return match ? match[1] : null;
}

function inferIsland(assetPath, launchIndex) {
  const sceneFolder = sceneFolderFromAssetPath(assetPath);
  if (!sceneFolder) {
    return {
      canonicalKey: null,
      sceneFolder: null
    };
  }
  const entry = launchIndex.bySceneFolder.get(normalizeSceneFolder(sceneFolder));
  return {
    canonicalKey: entry?.canonicalKey || null,
    sceneFolder
  };
}

function buildLowerEntryIndex(entries) {
  const index = new Map();
  for (const entry of entries) {
    index.set(entry.toLowerCase(), entry);
  }
  return index;
}

function resolveLaunchSceneEntry(entry, swfEntryIndex) {
  const wanted = `content/www.poptropica.com/scenes/island${entry.sceneFolder}/scene${entry.roomParam}.swf`;
  return swfEntryIndex.get(wanted.toLowerCase()) || null;
}

function unescapeLiteral(value) {
  return String(value || "")
    .replace(/\\\\/gu, "\\")
    .replace(/\\"/gu, "\"")
    .replace(/\\'/gu, "'")
    .replace(/\\r/gu, "\r")
    .replace(/\\n/gu, "\n")
    .replace(/\\t/gu, "\t");
}

function firstArgument(rawArgs) {
  const text = String(rawArgs || "").trim();
  const commaIndex = text.indexOf(",");
  return commaIndex >= 0 ? text.slice(0, commaIndex).trim() : text;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function splitArguments(rawArgs) {
  const args = [];
  let current = "";
  let quote = null;
  let escaped = false;
  let depth = 0;

  for (const char of String(rawArgs || "")) {
    if (quote) {
      current += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim() || String(rawArgs || "").includes(",")) {
    args.push(current.trim());
  }
  return args;
}

function normalizeInferredSoundName(value) {
  const clean = String(value || "").replace(/\\/gu, "/").trim();
  if (!clean || /^(?:none|null|undefined)$/iu.test(clean)) {
    return null;
  }
  return clean;
}

function evaluateStringExpression(expression) {
  const parts = String(expression || "").split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  let value = "";
  for (const part of parts) {
    if (/^_root\.getFlashPrefix\(\)$/iu.test(part)) {
      continue;
    }
    const literal = part.match(STRING_LITERAL_RE);
    if (!literal) {
      return null;
    }
    value += unescapeLiteral(literal[2]);
  }

  return normalizeInferredSoundName(value);
}

function findRecentStringAssignment(lines, variableName, lineNumber) {
  const assignmentRe = new RegExp(`(?:var\\s+)?${escapeRegExp(variableName)}\\s*=\\s*(.+?);`, "u");
  const startIndex = Math.max(0, lineNumber - 90);
  for (let index = lineNumber - 2; index >= startIndex; index -= 1) {
    const match = lines[index]?.match(assignmentRe);
    if (!match) {
      continue;
    }
    const value = evaluateStringExpression(match[1]);
    if (value) {
      return {
        value,
        lineNumber: index + 1,
        line: lines[index].trim()
      };
    }
  }
  return null;
}

function findNearestFunction(lines, lineNumber) {
  for (let index = lineNumber - 1; index >= 0; index -= 1) {
    const line = lines[index] || "";
    const assignedMatch = line.match(/\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*=\s*function\s*\(([^)]*)\)/u);
    if (assignedMatch) {
      return {
        functionName: assignedMatch[1],
        params: assignedMatch[2].split(",").map((param) => param.trim()),
        lineNumber: index + 1,
        functionKind: "assigned-function"
      };
    }
    const match = line.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/u);
    if (!match) {
      continue;
    }
    const params = match[2].split(",").map((param) => param.trim());
    return {
      functionName: match[1],
      params,
      lineNumber: index + 1,
      functionKind: "named-function"
    };
  }
  return null;
}

function findContainingFunction(lines, lineNumber, variableName) {
  const nearestFunction = findNearestFunction(lines, lineNumber);
  if (nearestFunction) {
    const paramIndex = nearestFunction.params.indexOf(variableName);
    if (paramIndex >= 0) {
      return {
        functionName: nearestFunction.functionName,
        paramIndex,
        lineNumber: nearestFunction.lineNumber,
        functionKind: nearestFunction.functionKind
      };
    }
  }
  return null;
}

function addInferredCandidate(target, value) {
  const clean = normalizeInferredSoundName(value);
  if (clean) {
    target.add(clean);
  }
}

function collectStringAssignmentsForName(scriptFiles, variableName) {
  const values = new Set();
  const assignmentRe = new RegExp(`(?:\\.|\\b)${escapeRegExp(variableName)}\\s*=\\s*(["'])((?:\\\\.|(?!\\1)[^\\\\])*)\\1`, "gu");
  for (const scriptFile of scriptFiles) {
    for (const match of scriptFile.text.matchAll(assignmentRe)) {
      addInferredCandidate(values, unescapeLiteral(match[2]));
    }
  }
  return values;
}

function collectStringComparisonsForName(scriptFiles, variableName) {
  const values = new Set();
  const comparisonRe = new RegExp(`(?:\\.|\\b)${escapeRegExp(variableName)}\\s*={2,3}\\s*(["'])((?:\\\\.|(?!\\1)[^\\\\])*)\\1`, "gu");
  for (const scriptFile of scriptFiles) {
    for (const match of scriptFile.text.matchAll(comparisonRe)) {
      addInferredCandidate(values, unescapeLiteral(match[2]));
    }
  }
  return values;
}

function inferDynamicSoundNames({ rawFirstArg, lineNumber, lines, scriptFiles }) {
  const candidates = new Set();
  const assignment = findRecentStringAssignment(lines, rawFirstArg, lineNumber);
  if (assignment) {
    addInferredCandidate(candidates, assignment.value);
    return {
      type: "local-assignment",
      candidates: [...candidates].sort((left, right) => left.localeCompare(right, "en")),
      evidence: assignment
    };
  }

  const containingFunction = findContainingFunction(lines, lineNumber, rawFirstArg);
  if (containingFunction) {
    const callRe = new RegExp(`(?:^|[^A-Za-z0-9_$])${escapeRegExp(containingFunction.functionName)}\\s*\\(([^;\\n]*)\\)`, "gu");
    let usedPropertyComparison = false;
    for (const scriptFile of scriptFiles) {
      for (const match of scriptFile.text.matchAll(callRe)) {
        const before = scriptFile.text.slice(Math.max(0, match.index - 12), match.index);
        if (/function\s*$/iu.test(before)) {
          continue;
        }
        const args = splitArguments(match[1]);
        const valueExpression = args[containingFunction.paramIndex];
        if (!valueExpression) {
          continue;
        }
        const literal = valueExpression.match(STRING_LITERAL_RE);
        if (literal) {
          addInferredCandidate(candidates, unescapeLiteral(literal[2]));
          continue;
        }
        const propertyMatch = valueExpression.match(new RegExp(`\\.${escapeRegExp(rawFirstArg)}\\b`, "u"));
        if (propertyMatch) {
          const assignmentCandidates = collectStringAssignmentsForName(scriptFiles, rawFirstArg);
          const propertyCandidates = assignmentCandidates.size > 0
            ? assignmentCandidates
            : collectStringComparisonsForName(scriptFiles, rawFirstArg);
          usedPropertyComparison = usedPropertyComparison || (assignmentCandidates.size === 0 && propertyCandidates.size > 0);
          for (const value of propertyCandidates) {
            addInferredCandidate(candidates, value);
          }
        }
      }
    }
    if (candidates.size > 0) {
      return {
        type: usedPropertyComparison ? "function-argument-property-comparison" : "function-argument",
        candidates: [...candidates].sort((left, right) => left.localeCompare(right, "en")),
        evidence: containingFunction
      };
    }
  }

  const propertyCandidates = collectStringAssignmentsForName(scriptFiles, rawFirstArg);
  if (propertyCandidates.size > 0) {
    return {
      type: "asset-property-assignment",
      candidates: [...propertyCandidates].sort((left, right) => left.localeCompare(right, "en")),
      evidence: {
        variableName: rawFirstArg
      }
    };
  }

  const propertyComparisonCandidates = collectStringComparisonsForName(scriptFiles, rawFirstArg);
  if (propertyComparisonCandidates.size > 0) {
    return {
      type: "asset-property-comparison",
      candidates: [...propertyComparisonCandidates].sort((left, right) => left.localeCompare(right, "en")),
      evidence: {
        variableName: rawFirstArg
      }
    };
  }

  return null;
}

function parseSoundCall(match) {
  const method = match[1];
  const rawArgs = match[2] || "";
  const rawFirstArg = firstArgument(rawArgs);
  const literal = rawFirstArg.match(STRING_LITERAL_RE);
  return {
    method,
    rawFirstArg,
    soundName: literal ? unescapeLiteral(literal[2]).trim() : null,
    dynamic: !literal
  };
}

function collectSoundCalls(scriptRoot, asset) {
  if (!fileExists(scriptRoot)) {
    return [];
  }
  const calls = [];
  const scriptFiles = listFilesRecursive(scriptRoot, { includeExtensions: AS_EXTENSION_SET })
    .map((filePath) => {
      const text = fs.readFileSync(filePath, "utf8");
      return {
        filePath,
        rel: path.relative(scriptRoot, filePath).replace(/\\/gu, "/"),
        text,
        lines: text.split(/\r?\n/u)
      };
    });

  for (const scriptFile of scriptFiles) {
    const { rel, lines } = scriptFile;
    lines.forEach((line, index) => {
      for (const match of line.matchAll(SOUND_CALL_RE)) {
        const parsed = parseSoundCall(match);
        const functionContext = parsed.dynamic ? findNearestFunction(lines, index + 1) : null;
        const inferred = parsed.dynamic
          ? inferDynamicSoundNames({
            rawFirstArg: parsed.rawFirstArg,
            lineNumber: index + 1,
            lines,
            scriptFiles
          })
          : null;
        calls.push({
          ...parsed,
          inferredSoundNames: inferred?.candidates || [],
          dynamicInferenceType: inferred?.type || null,
          dynamicInferenceEvidence: inferred?.evidence || null,
          dynamicFunctionName: functionContext?.functionName || null,
          dynamicFunctionLineNumber: functionContext?.lineNumber || null,
          dynamicFunctionKind: functionContext?.functionKind || null,
          dynamicFunctionParams: functionContext?.params || [],
          assetId: asset.assetId,
          assetPath: asset.assetPath,
          canonicalKey: asset.canonicalKey,
          sceneFolder: asset.sceneFolder,
          scriptPath: rel,
          lineNumber: index + 1,
          line: line.trim()
        });
      }
    });
  }
  return calls;
}

function addSample(list, value, max = 8) {
  if (list.length < max) {
    list.push(value);
  }
}

function makeIslandBucket(key, entry = null) {
  return {
    canonicalKey: key,
    sceneFolder: entry?.sceneFolder || null,
    islandParam: entry?.islandParam || null,
    roomParam: entry?.roomParam || null,
    launchable: Boolean(entry?.launchable),
    swfCount: 0,
    scriptExportedSwfCount: 0,
    scriptPendingSwfCount: 0,
    scriptFailedSwfCount: 0,
    soundExportedSwfCount: 0,
    soundPendingSwfCount: 0,
    soundFailedSwfCount: 0,
    assetsWithSoundCalls: 0,
    soundCallCount: 0,
    literalSoundCallCount: 0,
    dynamicSoundCallCount: 0,
    inferredDynamicSoundCallCount: 0,
    unresolvedDynamicSoundCallCount: 0,
    looseAudioFiles: 0,
    embeddedSoundFiles: 0,
    literalSoundNames: [],
    inferredSoundNames: [],
    sampleAssets: [],
    sampleCalls: [],
    sampleLooseAudio: [],
    sampleEmbeddedSoundFiles: []
  };
}

function summarizeByIsland({ launchIndex, swfAssets, looseAudioEntries, callsByAsset }) {
  const buckets = new Map();
  for (const entry of launchIndex.as2Entries) {
    buckets.set(entry.canonicalKey, makeIslandBucket(entry.canonicalKey, entry));
  }
  const folderOnlyBuckets = new Map();

  function bucketForAsset(asset) {
    if (asset.canonicalKey && buckets.has(asset.canonicalKey)) {
      return buckets.get(asset.canonicalKey);
    }
    const key = asset.sceneFolder ? `folder:${asset.sceneFolder}` : "_other";
    if (!folderOnlyBuckets.has(key)) {
      folderOnlyBuckets.set(key, makeIslandBucket(asset.canonicalKey || key, {
        sceneFolder: asset.sceneFolder,
        launchable: false
      }));
    }
    return folderOnlyBuckets.get(key);
  }

  for (const asset of swfAssets) {
    const bucket = bucketForAsset(asset);
    bucket.swfCount += 1;
    if (asset.scriptExported) {
      bucket.scriptExportedSwfCount += 1;
    }
    if (!asset.scriptExported) {
      bucket.scriptPendingSwfCount += 1;
    }
    if (asset.scriptCacheState === "failed") {
      bucket.scriptFailedSwfCount += 1;
    }
    if (asset.soundExported) {
      bucket.soundExportedSwfCount += 1;
    }
    if (!asset.soundExported) {
      bucket.soundPendingSwfCount += 1;
    }
    if (asset.soundCacheState === "failed") {
      bucket.soundFailedSwfCount += 1;
    }
    const assetCalls = callsByAsset.get(asset.assetId) || [];
    if (assetCalls.length > 0) {
      bucket.assetsWithSoundCalls += 1;
      addSample(bucket.sampleAssets, asset.assetPath);
    }
    for (const call of assetCalls) {
      bucket.soundCallCount += 1;
      if (call.dynamic) {
        bucket.dynamicSoundCallCount += 1;
        if (call.inferredSoundNames?.length) {
          bucket.inferredDynamicSoundCallCount += 1;
          for (const soundName of call.inferredSoundNames) {
            if (!bucket.inferredSoundNames.includes(soundName)) {
              bucket.inferredSoundNames.push(soundName);
            }
          }
        } else {
          bucket.unresolvedDynamicSoundCallCount += 1;
        }
      } else {
        bucket.literalSoundCallCount += 1;
        if (call.soundName && !bucket.literalSoundNames.includes(call.soundName)) {
          bucket.literalSoundNames.push(call.soundName);
        }
      }
      addSample(bucket.sampleCalls, {
        assetPath: call.assetPath,
        method: call.method,
        soundName: call.soundName,
        inferredSoundNames: call.inferredSoundNames,
        dynamicInferenceType: call.dynamicInferenceType,
        rawFirstArg: call.rawFirstArg,
        scriptPath: call.scriptPath,
        lineNumber: call.lineNumber
      });
    }
    for (const soundFile of asset.embeddedSoundFiles || []) {
      bucket.embeddedSoundFiles += 1;
      addSample(bucket.sampleEmbeddedSoundFiles, {
        assetPath: asset.assetPath,
        ...soundFile
      });
    }
  }

  for (const entry of looseAudioEntries) {
    const inferred = inferIsland(entry, launchIndex);
    const key = inferred.canonicalKey || (inferred.sceneFolder ? `folder:${inferred.sceneFolder}` : "_other");
    if (!buckets.has(key) && !folderOnlyBuckets.has(key)) {
      folderOnlyBuckets.set(key, makeIslandBucket(key, {
        sceneFolder: inferred.sceneFolder,
        launchable: false
      }));
    }
    const bucket = buckets.get(key) || folderOnlyBuckets.get(key);
    bucket.looseAudioFiles += 1;
    addSample(bucket.sampleLooseAudio, entry);
  }

  return [...buckets.values(), ...folderOnlyBuckets.values()]
    .map((bucket) => ({
      ...bucket,
      scriptExportCoverageRatio: bucket.swfCount
        ? Number((bucket.scriptExportedSwfCount / bucket.swfCount).toFixed(6))
        : 0,
      soundExportCoverageRatio: bucket.swfCount
        ? Number((bucket.soundExportedSwfCount / bucket.swfCount).toFixed(6))
        : 0,
      literalSoundNames: bucket.literalSoundNames.sort((left, right) => left.localeCompare(right, "en")),
      inferredSoundNames: bucket.inferredSoundNames.sort((left, right) => left.localeCompare(right, "en"))
    }))
    .sort((left, right) => {
      if (left.launchable !== right.launchable) {
        return left.launchable ? -1 : 1;
      }
      return String(left.canonicalKey).localeCompare(String(right.canonicalKey), "en");
    });
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key, "en"));
}

function topDynamicCallSites(calls, { limit = 80 } = {}) {
  const sites = new Map();
  for (const call of calls) {
    const functionName = call.dynamicFunctionName || "(no function)";
    const key = [
      call.rawFirstArg || "(empty)",
      call.assetPath || "(unknown asset)",
      functionName
    ].join(" @ ");
    const existing = sites.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    sites.set(key, {
      key,
      count: 1,
      rawFirstArg: call.rawFirstArg,
      assetPath: call.assetPath,
      canonicalKey: call.canonicalKey,
      sceneFolder: call.sceneFolder,
      dynamicFunctionName: call.dynamicFunctionName || null,
      dynamicFunctionLineNumber: call.dynamicFunctionLineNumber || null,
      dynamicFunctionKind: call.dynamicFunctionKind || null,
      sampleScriptPath: call.scriptPath,
      sampleLineNumber: call.lineNumber,
      sampleLine: call.line
    });
  }
  return [...sites.values()]
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key, "en"))
    .slice(0, limit);
}

function scriptSymbolKey(scriptPath) {
  const parts = String(scriptPath || "").split("/");
  if (parts[0] !== "scripts" || !/^DefineSprite_/u.test(parts[1] || "")) {
    return null;
  }
  return parts.slice(0, 2).join("/");
}

function normalizeSoundNameForCount(value) {
  const clean = String(value || "").replace(/\\/gu, "/").trim();
  if (!clean || /^(?:none|null|undefined)$/iu.test(clean)) {
    return null;
  }
  return clean.includes("/") ? clean : clean.toLowerCase();
}

function buildUnresolvedDynamicSameSymbolLiteralCandidates({ unresolvedDynamicCalls, literalCalls }) {
  const literalByAssetSymbol = new Map();
  for (const call of literalCalls) {
    const symbolKey = scriptSymbolKey(call.scriptPath);
    if (!symbolKey || !call.soundName) {
      continue;
    }
    const key = `${call.assetId}\t${symbolKey}`;
    if (!literalByAssetSymbol.has(key)) {
      literalByAssetSymbol.set(key, new Map());
    }
    literalByAssetSymbol.get(key).set(normalizeSoundNameForCount(call.soundName), {
      soundName: call.soundName,
      normalizedSoundName: normalizeSoundNameForCount(call.soundName),
      scriptPath: call.scriptPath,
      lineNumber: call.lineNumber,
      line: call.line
    });
  }

  const groupedRows = new Map();
  for (const call of unresolvedDynamicCalls) {
    const symbolKey = scriptSymbolKey(call.scriptPath);
    if (!symbolKey) {
      continue;
    }
    const literalCandidates = literalByAssetSymbol.get(`${call.assetId}\t${symbolKey}`);
    if (!literalCandidates?.size) {
      continue;
    }
    const rowKey = `${call.assetId}\t${symbolKey}`;
    if (!groupedRows.has(rowKey)) {
      groupedRows.set(rowKey, {
        assetPath: call.assetPath,
        canonicalKey: call.canonicalKey,
        sceneFolder: call.sceneFolder,
        symbolKey,
        candidateEvidence: "same-define-sprite-literal-sound-call",
        usedForInference: false,
        unresolvedDynamicCallCount: 0,
        unresolvedDynamicFunctions: new Map(),
        soundLiteralCandidates: [...literalCandidates.values()]
          .sort((left, right) => left.normalizedSoundName.localeCompare(right.normalizedSoundName, "en")),
        sampleDynamicCall: {
          rawFirstArg: call.rawFirstArg,
          dynamicFunctionName: call.dynamicFunctionName,
          scriptPath: call.scriptPath,
          lineNumber: call.lineNumber,
          line: call.line
        }
      });
    }
    const row = groupedRows.get(rowKey);
    row.unresolvedDynamicCallCount += 1;
    const functionKey = `${call.rawFirstArg} @ ${call.dynamicFunctionName || "(no function)"}`;
    row.unresolvedDynamicFunctions.set(functionKey, (row.unresolvedDynamicFunctions.get(functionKey) || 0) + 1);
  }

  return [...groupedRows.values()]
    .map((row) => ({
      ...row,
      unresolvedDynamicFunctions: [...row.unresolvedDynamicFunctions.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key, "en"))
    }))
    .sort((left, right) => {
      if (left.unresolvedDynamicCallCount !== right.unresolvedDynamicCallCount) {
        return right.unresolvedDynamicCallCount - left.unresolvedDynamicCallCount;
      }
      if (left.soundLiteralCandidates.length !== right.soundLiteralCandidates.length) {
        return left.soundLiteralCandidates.length - right.soundLiteralCandidates.length;
      }
      return left.assetPath.localeCompare(right.assetPath, "en");
    });
}

function buildUnresolvedDynamicAssetStringCandidates({ unresolvedDynamicCalls, swfAssetsByPath, extractedRoot, knownSoundNames }) {
  const groupedCalls = new Map();
  for (const call of unresolvedDynamicCalls) {
    if (!call.assetPath) {
      continue;
    }
    if (!groupedCalls.has(call.assetPath)) {
      groupedCalls.set(call.assetPath, []);
    }
    groupedCalls.get(call.assetPath).push(call);
  }

  const rows = [];
  for (const [assetPath, assetCalls] of groupedCalls.entries()) {
    const asset = swfAssetsByPath.get(assetPath);
    const swfPath = path.join(extractedRoot, assetPath);
    const candidates = extractPrintableSwfStrings(swfPath)
      .map((value) => ({
        value,
        normalizedSoundName: normalizeSoundNameForCount(value)
      }))
      .filter((candidate) => candidate.normalizedSoundName && knownSoundNames.has(candidate.normalizedSoundName));
    const uniqueCandidates = new Map();
    for (const candidate of candidates) {
      if (!uniqueCandidates.has(candidate.normalizedSoundName)) {
        uniqueCandidates.set(candidate.normalizedSoundName, candidate);
      }
    }
    if (uniqueCandidates.size === 0) {
      continue;
    }
    rows.push({
      assetPath,
      canonicalKey: asset?.canonicalKey || assetCalls[0]?.canonicalKey || null,
      sceneFolder: asset?.sceneFolder || assetCalls[0]?.sceneFolder || null,
      candidateEvidence: "raw-swf-printable-string-known-sound-name",
      usedForInference: false,
      unresolvedDynamicCallCount: assetCalls.length,
      unresolvedDynamicFunctions: countBy(assetCalls, (call) => `${call.rawFirstArg} @ ${call.dynamicFunctionName || "(no function)"}`).slice(0, 20),
      soundStringCandidates: [...uniqueCandidates.values()]
        .sort((left, right) => left.normalizedSoundName.localeCompare(right.normalizedSoundName, "en"))
    });
  }
  return rows.sort((left, right) => {
    if (left.unresolvedDynamicCallCount !== right.unresolvedDynamicCallCount) {
      return right.unresolvedDynamicCallCount - left.unresolvedDynamicCallCount;
    }
    return left.assetPath.localeCompare(right.assetPath, "en");
  });
}

function unresolvedDynamicStringCandidateRows(rows) {
  const candidates = [];
  for (const row of rows) {
    for (const candidate of row.soundStringCandidates || []) {
      candidates.push({
        soundName: candidate.normalizedSoundName,
        rawValue: candidate.value,
        assetPath: row.assetPath,
        canonicalKey: row.canonicalKey,
        sceneFolder: row.sceneFolder,
        unresolvedDynamicCallCount: row.unresolvedDynamicCallCount,
        unresolvedDynamicFunctions: row.unresolvedDynamicFunctions
      });
    }
  }
  return candidates;
}

function inferredSoundNameRows(calls) {
  const rows = [];
  for (const call of calls) {
    for (const soundName of call.inferredSoundNames || []) {
      rows.push({
        soundName,
        normalizedSoundName: normalizeSoundNameForCount(soundName),
        call
      });
    }
  }
  return rows;
}

function collectEmbeddedSoundFiles(assets) {
  return assets.flatMap((asset) => (asset.embeddedSoundFiles || []).map((soundFile) => ({
    canonicalKey: asset.canonicalKey,
    sceneFolder: asset.sceneFolder,
    assetPath: asset.assetPath,
    ...soundFile
  })));
}

function buildEmbeddedSoundNameMatches(literalCalls, embeddedSoundFiles) {
  const callCounts = new Map();
  for (const call of literalCalls) {
    callCounts.set(call.soundName, (callCounts.get(call.soundName) || 0) + 1);
  }
  const embeddedWithCandidates = embeddedSoundFiles.map((soundFile) => ({
    soundFile,
    candidates: soundNameCandidates(soundFile.path)
  }));
  return [...callCounts.entries()]
    .map(([soundName, callCount]) => {
      const candidates = soundNameCandidates(soundName);
      const matches = embeddedWithCandidates
        .filter((item) => [...candidates].some((candidate) => item.candidates.has(candidate)))
        .map((item) => item.soundFile);
      return {
        soundName,
        callCount,
        matches: matches.slice(0, 20)
      };
    })
    .filter((entry) => entry.matches.length > 0)
    .sort((left, right) => right.callCount - left.callCount || left.soundName.localeCompare(right.soundName, "en"));
}

function isAs2IslandSceneSwf(assetPath) {
  return AS2_ISLAND_SCENE_SWF_RE.test(String(assetPath || "").replace(/\\/gu, "/"));
}

function matchesIslandFilter(asset, filterValue) {
  const filter = String(filterValue || "").trim().toLowerCase();
  if (!filter) {
    return true;
  }
  return [asset.canonicalKey, asset.sceneFolder]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase() === filter);
}

function selectExportTargets({ assets, args, kind }) {
  const offset = parseNonNegativeInt(args.exportOffset, 0);
  const limit = parsePositiveInt(args.exportBatchSize || args.batchSize, Infinity);
  const islandFilter = args.island || args.sceneFolder || args.canonicalKey || "";
  const force = flagEnabled(args.forceExport);
  const retryFailed = flagEnabled(args.retryFailed);
  const missingOnly = (asset) => {
    if (force) {
      return true;
    }
    if (!retryFailed) {
      const state = kind === "script" ? asset.scriptCacheState : asset.soundCacheState;
      if (state === "failed") {
        return false;
      }
    }
    return kind === "script" ? !asset.scriptExported : !asset.soundExported;
  };
  return assets
    .filter((asset) => matchesIslandFilter(asset, islandFilter))
    .filter(missingOnly)
    .sort((left, right) => left.assetPath.localeCompare(right.assetPath, "en"))
    .slice(offset, Number.isFinite(limit) ? offset + limit : undefined);
}

function ensureAssetScriptExports({ config, archivePath, extractedRoot, assets }) {
  if (!config.tools?.ffdecCli || !fileExists(config.tools.ffdecCli)) {
    throw new Error("FFDec CLI is required for script export.");
  }
  const results = [];
  for (const asset of assets) {
    if (asset.scriptExported) {
      results.push({
        ok: true,
        skipped: true,
        reason: "script_export_already_present",
        canonicalKey: asset.canonicalKey,
        sceneFolder: asset.sceneFolder,
        assetPath: asset.assetPath,
        outputDir: asset.scriptRoot
      });
      continue;
    }
    const swfPath = path.join(extractedRoot, asset.assetPath);
    if (!fileExists(swfPath)) {
      extractArchiveEntry(archivePath, config.tools.tarBin, asset.assetPath, extractedRoot);
    }
    const exportResult = exportSwfScripts(swfPath, asset.scriptRoot, config.tools.ffdecCli);
    asset.scriptExported = exportResult.ok;
    asset.scriptRoot = exportResult.outputDir || asset.scriptRoot;
    asset.scriptCacheState = exportResult.ok
      ? (exportResult.cacheUpdated === false ? "ready_uncached" : "ready")
      : "failed";
    results.push({
      ...exportResult,
      skipped: false,
      canonicalKey: asset.canonicalKey,
      sceneFolder: asset.sceneFolder,
      assetPath: asset.assetPath
    });
  }
  return results;
}

function ensureAssetSoundExports({ config, archivePath, extractedRoot, assets }) {
  if (!config.tools?.ffdecCli || !fileExists(config.tools.ffdecCli)) {
    throw new Error("FFDec CLI is required for sound export.");
  }
  const results = [];
  for (const asset of assets) {
    if (asset.soundExported) {
      results.push({
        ok: true,
        skipped: true,
        reason: "sound_export_already_present",
        canonicalKey: asset.canonicalKey,
        sceneFolder: asset.sceneFolder,
        assetPath: asset.assetPath,
        outputDir: asset.soundRoot,
        soundFiles: asset.embeddedSoundFiles
      });
      continue;
    }
    const swfPath = path.join(extractedRoot, asset.assetPath);
    if (!fileExists(swfPath)) {
      extractArchiveEntry(archivePath, config.tools.tarBin, asset.assetPath, extractedRoot);
    }
    const exportResult = exportSwfSounds(swfPath, asset.soundRoot, config.tools.ffdecCli);
    asset.soundExported = exportResult.ok;
    asset.soundRoot = exportResult.outputDir || asset.soundRoot;
    asset.embeddedSoundFiles = exportResult.soundFiles || [];
    asset.soundCacheState = exportResult.ok
      ? (exportResult.cacheUpdated === false ? "ready_uncached" : "ready")
      : "failed";
    results.push({
      ...exportResult,
      skipped: false,
      canonicalKey: asset.canonicalKey,
      sceneFolder: asset.sceneFolder,
      assetPath: asset.assetPath
    });
  }
  return results;
}

function ensureLaunchScriptExports({ args, config, archivePath, extractedRoot, launchEntries, swfEntryIndex, swfAssetsByPath }) {
  if (args.ensureLaunchScripts !== "1" && args.exportLaunchScripts !== "1") {
    return [];
  }
  if (!config.tools?.ffdecCli || !fileExists(config.tools.ffdecCli)) {
    throw new Error("FFDec CLI is required for --ensureLaunchScripts=1.");
  }
  const results = [];
  for (const launchEntry of launchEntries) {
    const assetPath = resolveLaunchSceneEntry(launchEntry, swfEntryIndex);
    if (!assetPath) {
      results.push({
        ok: false,
        skipped: true,
        reason: "launch_scene_swf_not_found",
        canonicalKey: launchEntry.canonicalKey,
        sceneFolder: launchEntry.sceneFolder,
        roomParam: launchEntry.roomParam
      });
      continue;
    }
    const asset = swfAssetsByPath.get(assetPath);
    if (!asset) {
      results.push({
        ok: false,
        skipped: true,
        reason: "launch_scene_asset_not_indexed",
        canonicalKey: launchEntry.canonicalKey,
        assetPath
      });
      continue;
    }
    if (asset.scriptExported && args.forceExport !== "1") {
      results.push({
        ok: true,
        skipped: true,
        reason: "script_export_already_present",
        canonicalKey: launchEntry.canonicalKey,
        assetPath,
        outputDir: asset.scriptRoot
      });
      continue;
    }
    const swfPath = path.join(extractedRoot, assetPath);
    if (!fileExists(swfPath)) {
      extractArchiveEntry(archivePath, config.tools.tarBin, assetPath, extractedRoot);
    }
    const exportResult = exportSwfScripts(swfPath, asset.scriptRoot, config.tools.ffdecCli);
    asset.scriptExported = exportResult.ok;
    asset.scriptRoot = exportResult.outputDir || asset.scriptRoot;
    asset.scriptCacheState = exportResult.ok
      ? (exportResult.cacheUpdated === false ? "ready_uncached" : "ready")
      : "failed";
    results.push({
      ...exportResult,
      skipped: false,
      canonicalKey: launchEntry.canonicalKey,
      assetPath
    });
  }
  return results;
}

function ensureLaunchSoundExports({ args, config, archivePath, extractedRoot, launchEntries, swfEntryIndex, swfAssetsByPath }) {
  if (args.ensureLaunchSounds !== "1" && args.exportLaunchSounds !== "1") {
    return [];
  }
  if (!config.tools?.ffdecCli || !fileExists(config.tools.ffdecCli)) {
    throw new Error("FFDec CLI is required for --ensureLaunchSounds=1.");
  }
  const results = [];
  for (const launchEntry of launchEntries) {
    const assetPath = resolveLaunchSceneEntry(launchEntry, swfEntryIndex);
    if (!assetPath) {
      results.push({
        ok: false,
        skipped: true,
        reason: "launch_scene_swf_not_found",
        canonicalKey: launchEntry.canonicalKey,
        sceneFolder: launchEntry.sceneFolder,
        roomParam: launchEntry.roomParam
      });
      continue;
    }
    const asset = swfAssetsByPath.get(assetPath);
    if (!asset) {
      results.push({
        ok: false,
        skipped: true,
        reason: "launch_scene_asset_not_indexed",
        canonicalKey: launchEntry.canonicalKey,
        assetPath
      });
      continue;
    }
    if (asset.soundExported && args.forceExport !== "1") {
      results.push({
        ok: true,
        skipped: true,
        reason: "sound_export_already_present",
        canonicalKey: launchEntry.canonicalKey,
        assetPath,
        outputDir: asset.soundRoot,
        soundFiles: asset.embeddedSoundFiles
      });
      continue;
    }
    const swfPath = path.join(extractedRoot, assetPath);
    if (!fileExists(swfPath)) {
      extractArchiveEntry(archivePath, config.tools.tarBin, assetPath, extractedRoot);
    }
    const exportResult = exportSwfSounds(swfPath, asset.soundRoot, config.tools.ffdecCli);
    asset.soundExported = exportResult.ok;
    asset.soundRoot = exportResult.outputDir || asset.soundRoot;
    asset.embeddedSoundFiles = exportResult.soundFiles || [];
    asset.soundCacheState = exportResult.ok
      ? (exportResult.cacheUpdated === false ? "ready_uncached" : "ready")
      : "failed";
    results.push({
      ...exportResult,
      skipped: false,
      canonicalKey: launchEntry.canonicalKey,
      assetPath
    });
  }
  return results;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const archivePath = config.sources.as2Gamezip;
  const archiveEntries = listArchiveEntries(archivePath, config.tools.tarBin);
  const launchIndex = buildAs2LaunchIndex(config);
  const extractedRoot = path.join(paths.extractedDir, "as2", hashString(archivePath));
  const scriptsRoot = path.join(extractedRoot, "__ffdec_scripts__");
  const swfEntries = archiveEntries.filter((entry) => SWF_EXTENSION_RE.test(entry));
  const swfEntryIndex = buildLowerEntryIndex(swfEntries);
  const looseAudioEntries = archiveEntries.filter((entry) => AUDIO_EXTENSION_RE.test(entry));
  const swfAssets = swfEntries.map((entry) => {
    const assetId = buildAssetId("as2", archivePath, entry);
    const scriptRoot = path.join(scriptsRoot, assetId);
    const soundRoot = path.join(extractedRoot, "__ffdec_sounds__", assetId);
    const inferred = inferIsland(entry, launchIndex);
    const scriptCacheState = scriptExportCacheState(scriptRoot);
    const soundCacheState = soundExportCacheState(soundRoot);
    return {
      assetId,
      assetPath: entry,
      scriptRoot,
      soundRoot,
      scriptExported: scriptCacheState === "ready",
      scriptCacheState,
      soundExported: soundCacheState === "ready" || soundCacheState === "ready_unmarked",
      soundCacheState,
      embeddedSoundFiles: listExportedSoundFiles(soundRoot),
      canonicalKey: inferred.canonicalKey,
      sceneFolder: inferred.sceneFolder
    };
  });
  const swfAssetsByPath = new Map(swfAssets.map((asset) => [asset.assetPath, asset]));
  const islandSceneAssets = swfAssets.filter((asset) => isAs2IslandSceneSwf(asset.assetPath));
  const launchSceneExportResults = ensureLaunchScriptExports({
    args,
    config,
    archivePath,
    extractedRoot,
    launchEntries: launchIndex.as2Entries,
    swfEntryIndex,
    swfAssetsByPath
  });
  const launchSoundExportResults = ensureLaunchSoundExports({
    args,
    config,
    archivePath,
    extractedRoot,
    launchEntries: launchIndex.as2Entries,
    swfEntryIndex,
    swfAssetsByPath
  });
  const islandSceneScriptTargets = flagEnabled(args.ensureIslandScripts) || flagEnabled(args.exportIslandScripts)
    ? selectExportTargets({ assets: islandSceneAssets, args, kind: "script" })
    : [];
  const islandSceneExportResults = islandSceneScriptTargets.length > 0
    ? ensureAssetScriptExports({
      config,
      archivePath,
      extractedRoot,
      assets: islandSceneScriptTargets
    })
    : [];
  const islandSceneSoundTargets = flagEnabled(args.ensureIslandSounds) || flagEnabled(args.exportIslandSounds)
    ? selectExportTargets({ assets: islandSceneAssets, args, kind: "sound" })
    : [];
  const islandSoundExportResults = islandSceneSoundTargets.length > 0
    ? ensureAssetSoundExports({
      config,
      archivePath,
      extractedRoot,
      assets: islandSceneSoundTargets
    })
    : [];
  const knownAssetIds = new Set(swfAssets.map((asset) => asset.assetId));
  const exportedScriptDirs = fileExists(scriptsRoot)
    ? fs.readdirSync(scriptsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  const unmappedScriptDirs = exportedScriptDirs.filter((assetId) => !knownAssetIds.has(assetId));
  const partialScriptExports = swfAssets.filter((asset) => asset.scriptCacheState === "empty_or_partial");
  const partialSoundExports = swfAssets.filter((asset) => asset.soundCacheState === "empty_or_partial");
  const failedScriptExports = swfAssets.filter((asset) => asset.scriptCacheState === "failed");
  const failedSoundExports = swfAssets.filter((asset) => asset.soundCacheState === "failed");
  const calls = [];
  const callsByAsset = new Map();

  for (const asset of swfAssets.filter((item) => item.scriptExported)) {
    const assetCalls = collectSoundCalls(asset.scriptRoot, asset);
    if (assetCalls.length > 0) {
      callsByAsset.set(asset.assetId, assetCalls);
      calls.push(...assetCalls);
    }
  }

  const byIsland = summarizeByIsland({ launchIndex, swfAssets, looseAudioEntries, callsByAsset });
  const literalCalls = calls.filter((call) => !call.dynamic && call.soundName);
  const dynamicCalls = calls.filter((call) => call.dynamic);
  const inferredDynamicCalls = dynamicCalls.filter((call) => call.inferredSoundNames?.length);
  const unresolvedDynamicCalls = dynamicCalls.filter((call) => !call.inferredSoundNames?.length);
  const inferredRows = inferredSoundNameRows(inferredDynamicCalls);
  const literalRows = literalCalls.map((call) => ({
    soundName: call.soundName,
    normalizedSoundName: normalizeSoundNameForCount(call.soundName),
    call
  }));
  const knownSoundRows = [...literalRows, ...inferredRows];
  const inferredDynamicSites = topDynamicCallSites(inferredDynamicCalls, { limit: Number.MAX_SAFE_INTEGER });
  const unresolvedDynamicSites = topDynamicCallSites(unresolvedDynamicCalls, { limit: Number.MAX_SAFE_INTEGER });
  const unresolvedDynamicSameSymbolLiteralCandidates = buildUnresolvedDynamicSameSymbolLiteralCandidates({
    unresolvedDynamicCalls,
    literalCalls
  });
  const unresolvedDynamicSameSymbolLiteralRows = unresolvedDynamicSameSymbolLiteralCandidates.flatMap((row) =>
    row.soundLiteralCandidates.map((candidate) => ({
      soundName: candidate.normalizedSoundName,
      rawValue: candidate.soundName,
      assetPath: row.assetPath,
      canonicalKey: row.canonicalKey,
      sceneFolder: row.sceneFolder,
      symbolKey: row.symbolKey,
      unresolvedDynamicCallCount: row.unresolvedDynamicCallCount,
      unresolvedDynamicFunctions: row.unresolvedDynamicFunctions
    }))
  );
  const knownSoundNames = new Set(knownSoundRows.map((row) => row.normalizedSoundName).filter(Boolean));
  const unresolvedDynamicAssetStringCandidates = buildUnresolvedDynamicAssetStringCandidates({
    unresolvedDynamicCalls,
    swfAssetsByPath,
    extractedRoot,
    knownSoundNames
  });
  const unresolvedDynamicStringRows = unresolvedDynamicStringCandidateRows(unresolvedDynamicAssetStringCandidates);
  const embeddedSoundFiles = collectEmbeddedSoundFiles(islandSceneAssets);
  const embeddedSoundNameMatches = buildEmbeddedSoundNameMatches(literalCalls, embeddedSoundFiles);
  const missingScriptExports = swfAssets.filter((asset) => !asset.scriptExported);
  const launchSceneAssets = launchIndex.as2Entries
    .map((entry) => resolveLaunchSceneEntry(entry, swfEntryIndex))
    .filter(Boolean)
    .map((entry) => swfAssetsByPath.get(entry))
    .filter(Boolean);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    archivePath,
    extractedRoot,
    scriptsRoot,
    summary: {
      archiveEntries: archiveEntries.length,
      archiveSwfCount: swfEntries.length,
      islandSceneSwfCount: islandSceneAssets.length,
      scriptExportedSwfCount: swfAssets.filter((asset) => asset.scriptExported).length,
      partialScriptExportSwfCount: partialScriptExports.length,
      failedScriptExportSwfCount: failedScriptExports.length,
      soundExportedSwfCount: swfAssets.filter((asset) => asset.soundExported).length,
      partialSoundExportSwfCount: partialSoundExports.length,
      failedSoundExportSwfCount: failedSoundExports.length,
      scriptExportCoverageRatio: swfEntries.length
        ? Number((swfAssets.filter((asset) => asset.scriptExported).length / swfEntries.length).toFixed(6))
        : 0,
      islandSceneScriptExportedSwfCount: islandSceneAssets.filter((asset) => asset.scriptExported).length,
      islandSceneScriptExportPendingCount: islandSceneAssets.filter((asset) => !asset.scriptExported).length,
      islandSceneScriptExportFailedCachedCount: islandSceneAssets.filter((asset) => asset.scriptCacheState === "failed").length,
      islandSceneScriptExportCoverageRatio: islandSceneAssets.length
        ? Number((islandSceneAssets.filter((asset) => asset.scriptExported).length / islandSceneAssets.length).toFixed(6))
        : 0,
      islandSceneSoundExportedSwfCount: islandSceneAssets.filter((asset) => asset.soundExported).length,
      islandSceneSoundExportPendingCount: islandSceneAssets.filter((asset) => !asset.soundExported).length,
      islandSceneSoundExportFailedCachedCount: islandSceneAssets.filter((asset) => asset.soundCacheState === "failed").length,
      islandSceneSoundExportCoverageRatio: islandSceneAssets.length
        ? Number((islandSceneAssets.filter((asset) => asset.soundExported).length / islandSceneAssets.length).toFixed(6))
        : 0,
      islandSceneScriptExportAttempted: islandSceneExportResults.filter((result) => !result.skipped).length,
      islandSceneScriptExportSucceeded: islandSceneExportResults.filter((result) => !result.skipped && result.ok).length,
      islandSceneScriptExportFailed: islandSceneExportResults.filter((result) => !result.skipped && !result.ok).length,
      islandSceneSoundExportAttempted: islandSoundExportResults.filter((result) => !result.skipped).length,
      islandSceneSoundExportSucceeded: islandSoundExportResults.filter((result) => !result.skipped && result.ok).length,
      islandSceneSoundExportFailed: islandSoundExportResults.filter((result) => !result.skipped && !result.ok).length,
      islandSceneEmbeddedSoundFileCount: islandSceneAssets.reduce((total, asset) => total + asset.embeddedSoundFiles.length, 0),
      islandSceneSwfsWithEmbeddedSounds: islandSceneAssets.filter((asset) => asset.embeddedSoundFiles.length > 0).length,
      unmappedScriptDirCount: unmappedScriptDirs.length,
      looseAudioFiles: looseAudioEntries.length,
      as2CatalogEntries: launchIndex.as2Entries.length,
      launchSceneSwfCount: launchSceneAssets.length,
      launchSceneScriptExportedSwfCount: launchSceneAssets.filter((asset) => asset.scriptExported).length,
      launchSceneExportAttempted: launchSceneExportResults.filter((result) => !result.skipped).length,
      launchSceneExportSucceeded: launchSceneExportResults.filter((result) => !result.skipped && result.ok).length,
      launchSceneExportFailed: launchSceneExportResults.filter((result) => !result.skipped && !result.ok).length,
      launchSceneSoundExportedSwfCount: launchSceneAssets.filter((asset) => asset.soundExported).length,
      launchSceneSoundExportAttempted: launchSoundExportResults.filter((result) => !result.skipped).length,
      launchSceneSoundExportSucceeded: launchSoundExportResults.filter((result) => !result.skipped && result.ok).length,
      launchSceneSoundExportFailed: launchSoundExportResults.filter((result) => !result.skipped && !result.ok).length,
      launchSceneEmbeddedSoundFileCount: launchSceneAssets.reduce((total, asset) => total + asset.embeddedSoundFiles.length, 0),
      launchScenesWithEmbeddedSounds: launchSceneAssets.filter((asset) => asset.embeddedSoundFiles.length > 0).length,
      soundCallCount: calls.length,
      assetsWithSoundCalls: callsByAsset.size,
      literalSoundCallCount: literalCalls.length,
      dynamicSoundCallCount: dynamicCalls.length,
      inferredDynamicSoundCallCount: inferredDynamicCalls.length,
      unresolvedDynamicSoundCallCount: unresolvedDynamicCalls.length,
      inferredDynamicSoundCandidateCount: inferredRows.length,
      inferredDynamicSiteCount: inferredDynamicSites.length,
      unresolvedDynamicSiteCount: unresolvedDynamicSites.length,
      unresolvedDynamicAssetsWithSameSymbolLiteralSounds: new Set(unresolvedDynamicSameSymbolLiteralCandidates.map((row) => row.assetPath)).size,
      unresolvedDynamicSameSymbolLiteralSiteCount: unresolvedDynamicSameSymbolLiteralCandidates.length,
      unresolvedDynamicSameSymbolLiteralCallCount: unresolvedDynamicSameSymbolLiteralCandidates.reduce((total, row) => total + row.unresolvedDynamicCallCount, 0),
      unresolvedDynamicSameSymbolLiteralCandidateCount: unresolvedDynamicSameSymbolLiteralRows.length,
      unresolvedDynamicAssetsWithKnownSoundStrings: unresolvedDynamicAssetStringCandidates.length,
      unresolvedDynamicKnownSoundStringCandidateCount: unresolvedDynamicStringRows.length,
      uniqueUnresolvedDynamicKnownSoundStringCandidates: new Set(unresolvedDynamicStringRows.map((row) => row.soundName).filter(Boolean)).size,
      uniqueLiteralSoundNames: new Set(literalCalls.map((call) => call.soundName)).size,
      uniqueInferredDynamicSoundNames: new Set(inferredRows.map((row) => row.normalizedSoundName).filter(Boolean)).size,
      uniqueKnownSoundNames: new Set(knownSoundRows.map((row) => row.normalizedSoundName).filter(Boolean)).size,
      uniqueLiteralSoundNamesWithEmbeddedMatches: embeddedSoundNameMatches.length,
      catalogEntriesWithSoundCalls: byIsland.filter((entry) => entry.launchable && entry.soundCallCount > 0).length,
      catalogEntriesWithLooseAudio: byIsland.filter((entry) => entry.launchable && entry.looseAudioFiles > 0).length,
      catalogEntriesWithoutScriptSoundCalls: byIsland.filter((entry) => entry.launchable && entry.soundCallCount === 0).length
    },
    topLiteralSoundNames: countBy(literalCalls, (call) => call.soundName).slice(0, 80),
    topInferredDynamicSoundNames: countBy(inferredRows, (row) => row.normalizedSoundName).slice(0, 80),
    topKnownSoundNames: countBy(knownSoundRows, (row) => row.normalizedSoundName).slice(0, 80),
    topDynamicRawFirstArgs: countBy(dynamicCalls, (call) => call.rawFirstArg).slice(0, 40),
    topDynamicInferenceTypes: countBy(inferredDynamicCalls, (call) => call.dynamicInferenceType).slice(0, 40),
    topUnresolvedDynamicRawFirstArgs: countBy(unresolvedDynamicCalls, (call) => call.rawFirstArg).slice(0, 40),
    topUnresolvedDynamicFunctions: countBy(unresolvedDynamicCalls, (call) => `${call.rawFirstArg} @ ${call.dynamicFunctionName || "(no function)"}`).slice(0, 80),
    topUnresolvedDynamicSites: unresolvedDynamicSites.slice(0, 80),
    topInferredDynamicSites: inferredDynamicSites.slice(0, 80),
    topUnresolvedDynamicSameSymbolLiteralCandidates: countBy(unresolvedDynamicSameSymbolLiteralRows, (row) => row.soundName).slice(0, 80),
    topUnresolvedDynamicSameSymbolLiteralAssets: unresolvedDynamicSameSymbolLiteralCandidates.slice(0, 80),
    topUnresolvedDynamicKnownSoundStringCandidates: countBy(unresolvedDynamicStringRows, (row) => row.soundName).slice(0, 80),
    topUnresolvedDynamicKnownSoundStringAssets: [...unresolvedDynamicAssetStringCandidates]
      .sort((left, right) => {
        if (left.unresolvedDynamicCallCount !== right.unresolvedDynamicCallCount) {
          return right.unresolvedDynamicCallCount - left.unresolvedDynamicCallCount;
        }
        if (left.soundStringCandidates.length !== right.soundStringCandidates.length) {
          return left.soundStringCandidates.length - right.soundStringCandidates.length;
        }
        return left.assetPath.localeCompare(right.assetPath, "en");
      })
      .slice(0, 80),
    unresolvedDynamicAssetStringCandidates,
    topMethods: countBy(calls, (call) => call.method),
    byIsland,
    embeddedSoundFiles,
    embeddedSoundNameMatches,
    samples: {
      looseAudio: looseAudioEntries.slice(0, 80),
      embeddedSoundFiles: embeddedSoundFiles.slice(0, 80),
      embeddedSoundNameMatches: embeddedSoundNameMatches.slice(0, 40),
      unmappedScriptDirs: unmappedScriptDirs.slice(0, 40),
      partialScriptExports: partialScriptExports.slice(0, 40).map((asset) => asset.assetPath),
      partialSoundExports: partialSoundExports.slice(0, 40).map((asset) => asset.assetPath),
      failedScriptExports: failedScriptExports.slice(0, 40).map((asset) => asset.assetPath),
      failedSoundExports: failedSoundExports.slice(0, 40).map((asset) => asset.assetPath),
      missingScriptExports: missingScriptExports.slice(0, 40).map((asset) => asset.assetPath),
      missingIslandSceneScriptExports: islandSceneAssets.filter((asset) => !asset.scriptExported).slice(0, 40).map((asset) => asset.assetPath),
      missingIslandSceneSoundExports: islandSceneAssets.filter((asset) => !asset.soundExported).slice(0, 40).map((asset) => asset.assetPath),
      launchSceneExportResults: launchSceneExportResults.slice(0, 80),
      launchSoundExportResults: launchSoundExportResults.slice(0, 80),
      islandSceneExportResults: islandSceneExportResults.slice(0, 80),
      islandSoundExportResults: islandSoundExportResults.slice(0, 80),
      inferredDynamicCalls: inferredDynamicCalls.slice(0, 80).map((call) => ({
        assetPath: call.assetPath,
        rawFirstArg: call.rawFirstArg,
        inferredSoundNames: call.inferredSoundNames,
        dynamicInferenceType: call.dynamicInferenceType,
        dynamicInferenceEvidence: call.dynamicInferenceEvidence,
        dynamicFunctionName: call.dynamicFunctionName,
        dynamicFunctionLineNumber: call.dynamicFunctionLineNumber,
        dynamicFunctionKind: call.dynamicFunctionKind,
        dynamicFunctionParams: call.dynamicFunctionParams,
        scriptPath: call.scriptPath,
        lineNumber: call.lineNumber,
        line: call.line
      })),
      unresolvedDynamicSites: unresolvedDynamicSites.slice(0, 80),
      unresolvedDynamicSameSymbolLiteralCandidates: unresolvedDynamicSameSymbolLiteralCandidates.slice(0, 80),
      unresolvedDynamicAssetStringCandidates: unresolvedDynamicAssetStringCandidates.slice(0, 80),
      unresolvedDynamicKnownSoundStringCandidates: unresolvedDynamicStringRows.slice(0, 120),
      unresolvedDynamicCalls: unresolvedDynamicCalls.slice(0, 80).map((call) => ({
        assetPath: call.assetPath,
        rawFirstArg: call.rawFirstArg,
        dynamicFunctionName: call.dynamicFunctionName,
        dynamicFunctionLineNumber: call.dynamicFunctionLineNumber,
        dynamicFunctionKind: call.dynamicFunctionKind,
        dynamicFunctionParams: call.dynamicFunctionParams,
        scriptPath: call.scriptPath,
        lineNumber: call.lineNumber,
        line: call.line
      })),
      dynamicCalls: dynamicCalls.slice(0, 40).map((call) => ({
        assetPath: call.assetPath,
        rawFirstArg: call.rawFirstArg,
        inferredSoundNames: call.inferredSoundNames,
        dynamicInferenceType: call.dynamicInferenceType,
        dynamicFunctionName: call.dynamicFunctionName,
        dynamicFunctionLineNumber: call.dynamicFunctionLineNumber,
        dynamicFunctionKind: call.dynamicFunctionKind,
        scriptPath: call.scriptPath,
        lineNumber: call.lineNumber,
        line: call.line
      }))
    },
    calls
  };
  const outputPath = path.resolve(args.output || path.join(paths.qaDir, "as2-sound-calls-audit.json"));
  writeJson(outputPath, report);
  console.log(JSON.stringify({ ...report.summary, reportPath: outputPath }, null, 2));
}

main();
