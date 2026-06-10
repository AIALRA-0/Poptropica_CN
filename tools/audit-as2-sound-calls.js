const fs = require("node:fs");
const path = require("node:path");
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
const SOUND_EXPORT_MARKER = ".ffdec-sound-export.json";

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
    maxBuffer: 1024 * 1024 * 16
  });
  if (result.status !== 0) {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    return {
      ok: false,
      error: (result.stderr || result.stdout || "FFDec script export failed").trim()
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
      bytes: fs.statSync(filePath).size
    }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
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
    maxBuffer: 1024 * 1024 * 16
  });
  if (result.status !== 0) {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    return {
      ok: false,
      error: (result.stderr || result.stdout || "FFDec sound export failed").trim()
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
  for (const filePath of listFilesRecursive(scriptRoot, { includeExtensions: AS_EXTENSION_SET })) {
    const rel = path.relative(scriptRoot, filePath).replace(/\\/gu, "/");
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(SOUND_CALL_RE)) {
        const parsed = parseSoundCall(match);
        calls.push({
          ...parsed,
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
    assetsWithSoundCalls: 0,
    soundCallCount: 0,
    literalSoundCallCount: 0,
    dynamicSoundCallCount: 0,
    looseAudioFiles: 0,
    embeddedSoundFiles: 0,
    literalSoundNames: [],
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
    const assetCalls = callsByAsset.get(asset.assetId) || [];
    if (assetCalls.length > 0) {
      bucket.assetsWithSoundCalls += 1;
      addSample(bucket.sampleAssets, asset.assetPath);
    }
    for (const call of assetCalls) {
      bucket.soundCallCount += 1;
      if (call.dynamic) {
        bucket.dynamicSoundCallCount += 1;
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
      literalSoundNames: bucket.literalSoundNames.sort((left, right) => left.localeCompare(right, "en"))
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
  const missingOnly = (asset) => {
    if (force) {
      return true;
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
      : "missing";
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
      : "missing";
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
      : "missing";
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
      : "missing";
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
      soundExportedSwfCount: swfAssets.filter((asset) => asset.soundExported).length,
      partialSoundExportSwfCount: partialSoundExports.length,
      scriptExportCoverageRatio: swfEntries.length
        ? Number((swfAssets.filter((asset) => asset.scriptExported).length / swfEntries.length).toFixed(6))
        : 0,
      islandSceneScriptExportedSwfCount: islandSceneAssets.filter((asset) => asset.scriptExported).length,
      islandSceneScriptExportPendingCount: islandSceneAssets.filter((asset) => !asset.scriptExported).length,
      islandSceneScriptExportCoverageRatio: islandSceneAssets.length
        ? Number((islandSceneAssets.filter((asset) => asset.scriptExported).length / islandSceneAssets.length).toFixed(6))
        : 0,
      islandSceneSoundExportedSwfCount: islandSceneAssets.filter((asset) => asset.soundExported).length,
      islandSceneSoundExportPendingCount: islandSceneAssets.filter((asset) => !asset.soundExported).length,
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
      uniqueLiteralSoundNames: new Set(literalCalls.map((call) => call.soundName)).size,
      catalogEntriesWithSoundCalls: byIsland.filter((entry) => entry.launchable && entry.soundCallCount > 0).length,
      catalogEntriesWithLooseAudio: byIsland.filter((entry) => entry.launchable && entry.looseAudioFiles > 0).length,
      catalogEntriesWithoutScriptSoundCalls: byIsland.filter((entry) => entry.launchable && entry.soundCallCount === 0).length
    },
    topLiteralSoundNames: countBy(literalCalls, (call) => call.soundName).slice(0, 80),
    topMethods: countBy(calls, (call) => call.method),
    byIsland,
    samples: {
      looseAudio: looseAudioEntries.slice(0, 80),
      unmappedScriptDirs: unmappedScriptDirs.slice(0, 40),
      partialScriptExports: partialScriptExports.slice(0, 40).map((asset) => asset.assetPath),
      partialSoundExports: partialSoundExports.slice(0, 40).map((asset) => asset.assetPath),
      missingScriptExports: missingScriptExports.slice(0, 40).map((asset) => asset.assetPath),
      missingIslandSceneScriptExports: islandSceneAssets.filter((asset) => !asset.scriptExported).slice(0, 40).map((asset) => asset.assetPath),
      missingIslandSceneSoundExports: islandSceneAssets.filter((asset) => !asset.soundExported).slice(0, 40).map((asset) => asset.assetPath),
      launchSceneExportResults: launchSceneExportResults.slice(0, 80),
      launchSoundExportResults: launchSoundExportResults.slice(0, 80),
      islandSceneExportResults: islandSceneExportResults.slice(0, 80),
      islandSoundExportResults: islandSoundExportResults.slice(0, 80),
      dynamicCalls: dynamicCalls.slice(0, 40).map((call) => ({
        assetPath: call.assetPath,
        rawFirstArg: call.rawFirstArg,
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
