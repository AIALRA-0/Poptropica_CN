const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, listFilesRecursive, readJson, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_PACK_FILES_ROOT = path.join(paths.as3PackDir, "files");
const AS3_SCENE_ENTRY_PREFIXES = [
  "content/www.poptropica.com/game/data/scenes",
  "content/www.poptropica.com/flashpoint/originals/game/data/scenes"
];
const SOURCE_EXTRACT_ROOT = path.join(paths.tempDir, "native-navigation-labels-as3-source");

const LABEL_TRANSLATIONS = new Map([
  ["Exit", "退出"],
  ["EXIT", "退出"],
  ["Enter", "进入"],
  ["ENTER", "进入"],
  ["Go Left", "向左走"],
  ["GO LEFT", "向左走"],
  ["Go Right", "向右走"],
  ["GO RIGHT", "向右走"],
  ["Go Up", "向上走"],
  ["GO UP", "向上走"],
  ["Go Down", "向下走"],
  ["GO DOWN", "向下走"],
  ["Left", "向左"],
  ["LEFT", "向左"],
  ["Right", "向右"],
  ["RIGHT", "向右"],
  ["Up", "向上"],
  ["UP", "向上"],
  ["Down", "向下"],
  ["DOWN", "向下"],
  ["Travel", "旅行"],
  ["TRAVEL", "旅行"],
  ["Common Room", "公共房间"],
  ["COMMON ROOM", "公共房间"],
  ["Exit to Map", "前往地图"],
  ["Exit to Common Room", "前往公共房间"],
  ["Go Back", "返回"],
  ["Leave Trash", "离开垃圾桶"],
  ["Examine", "查看"],
  ["Use", "使用"],
  ["Shop", "商店"],
  ["Arcade", "游戏厅"],
  ["PLAY", "开始"]
]);
const INTERNAL_ENGLISH_LABELS = new Set(["DISABLED"]);

function relativePath(filePath) {
  return path.relative(paths.projectRoot, filePath).replace(/\\/gu, "/");
}

function toPackFilePath(entryName) {
  return path.join(AS3_PACK_FILES_ROOT, entryName.replace(/\//gu, path.sep));
}

function collectCommentRanges(content) {
  const ranges = [];
  for (const match of content.matchAll(/<!--[\s\S]*?-->/gu)) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length
    });
  }
  return ranges;
}

function isInComment(index, ranges) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function patchAs3NativeLabelsContent(content, entryName) {
  const changes = [];
  const commentRanges = collectCommentRanges(content);
  const next = content.replace(/(<label\b[^>]*>[\s\S]*?<text>)([^<]*)(<\/text>[\s\S]*?<\/label>)/gu, (match, prefix, text, suffix, offset) => {
    if (isInComment(offset, commentRanges)) {
      return match;
    }
    const trimmed = String(text || "").trim();
    const translated = LABEL_TRANSLATIONS.get(trimmed);
    if (!translated) {
      return match;
    }
    changes.push({
      file: entryName,
      from: trimmed,
      to: translated
    });
    return `${prefix}${translated}${suffix}`;
  });
  return {
    content: next,
    changes
  };
}

function extractSourceSceneRoots(config) {
  const sourceZip = config.sources?.as3Gamezip || null;
  const roots = [];
  const errors = [];
  if (!sourceZip || !fileExists(sourceZip)) {
    return {
      sourceZip,
      extractRoot: null,
      roots,
      errors: ["AS3 source zip is not configured or does not exist."]
    };
  }

  removeDirContents(SOURCE_EXTRACT_ROOT);
  ensureDirSync(SOURCE_EXTRACT_ROOT);

  for (const entryPrefix of AS3_SCENE_ENTRY_PREFIXES) {
    const result = spawnSync(config.tools?.tarBin || "tar", ["-xf", sourceZip, "-C", SOURCE_EXTRACT_ROOT, entryPrefix], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 32
    });
    if (result.status !== 0) {
      errors.push((result.stderr || result.stdout || `Failed to extract ${entryPrefix}`).trim());
      continue;
    }
    const rootDir = path.join(SOURCE_EXTRACT_ROOT, entryPrefix.replace(/\//gu, path.sep));
    if (fileExists(rootDir)) {
      roots.push({
        entryPrefix,
        rootDir
      });
    }
  }

  return {
    sourceZip,
    extractRoot: SOURCE_EXTRACT_ROOT,
    roots,
    errors
  };
}

function collectSceneXmlRecords(sourceRoots) {
  const records = new Map();

  function upsert(entryName, patch) {
    const current = records.get(entryName) || { entryName, sourceFile: null, packFile: null };
    records.set(entryName, {
      ...current,
      ...patch
    });
  }

  for (const sourceRoot of sourceRoots) {
    for (const filePath of listFilesRecursive(sourceRoot.rootDir, { includeExtensions: new Set([".xml"]) })) {
      const relative = path.relative(sourceRoot.rootDir, filePath).replace(/\\/gu, "/");
      upsert(`${sourceRoot.entryPrefix}/${relative}`, { sourceFile: filePath });
    }
  }

  for (const entryPrefix of AS3_SCENE_ENTRY_PREFIXES) {
    const packRoot = path.join(AS3_PACK_FILES_ROOT, entryPrefix.replace(/\//gu, path.sep));
    if (!fileExists(packRoot)) {
      continue;
    }
    for (const filePath of listFilesRecursive(packRoot, { includeExtensions: new Set([".xml"]) })) {
      const relative = path.relative(packRoot, filePath).replace(/\\/gu, "/");
      upsert(`${entryPrefix}/${relative}`, { packFile: filePath });
    }
  }

  return [...records.values()].sort((left, right) => left.entryName.localeCompare(right.entryName, "en"));
}

function patchAs3NativeLabels(record) {
  const inputFile = record.packFile || record.sourceFile;
  if (!inputFile) {
    return [];
  }
  const original = fs.readFileSync(inputFile, "utf8");
  const result = patchAs3NativeLabelsContent(original, record.entryName);
  if (result.content === original) {
    return [];
  }
  const outputPath = toPackFilePath(record.entryName);
  writeText(outputPath, result.content);
  return result.changes.map((change) => ({
    ...change,
    outputPath: relativePath(outputPath)
  }));
}

function collectRemainingEnglishLabels(records) {
  const remaining = [];
  const ignored = [];
  for (const record of records) {
    const outputPath = toPackFilePath(record.entryName);
    const filePath = fileExists(outputPath) ? outputPath : record.sourceFile;
    if (!filePath) {
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    const commentRanges = collectCommentRanges(content);
    for (const match of content.matchAll(/<label\b[^>]*>[\s\S]*?<text>([^<]*)<\/text>[\s\S]*?<\/label>/gu)) {
      if (isInComment(match.index, commentRanges)) {
        continue;
      }
      const text = String(match[1] || "").trim();
      if (/[A-Za-z]/u.test(text)) {
        const row = {
          file: record.entryName,
          text
        };
        if (INTERNAL_ENGLISH_LABELS.has(text)) {
          ignored.push(row);
        } else {
          remaining.push(row);
        }
      }
    }
  }
  const sortRows = (rows) => rows.sort((left, right) =>
    left.text.localeCompare(right.text, "en") || left.file.localeCompare(right.file, "en")
  );
  return {
    remaining: sortRows(remaining),
    ignored: sortRows(ignored)
  };
}

function collectNativePatchedEntryNames(records) {
  const translatedValues = new Set([...LABEL_TRANSLATIONS.values()]);
  const patched = [];
  for (const record of records) {
    const outputPath = toPackFilePath(record.entryName);
    const filePath = fileExists(outputPath) ? outputPath : record.sourceFile;
    if (!filePath) {
      continue;
    }
    const content = fs.readFileSync(filePath, "utf8");
    const commentRanges = collectCommentRanges(content);
    let hasTranslatedNativeLabel = false;
    for (const match of content.matchAll(/<label\b[^>]*>[\s\S]*?<text>([^<]*)<\/text>[\s\S]*?<\/label>/gu)) {
      if (isInComment(match.index, commentRanges)) {
        continue;
      }
      const text = String(match[1] || "").trim();
      if (translatedValues.has(text)) {
        hasTranslatedNativeLabel = true;
        break;
      }
    }
    if (hasTranslatedNativeLabel && fileExists(outputPath)) {
      patched.push(record.entryName);
    }
  }
  return patched.sort((left, right) => left.localeCompare(right, "en"));
}

function updateManifestForNativeLabels(manifest, records, changes) {
  manifest.externalTextAssets = Array.isArray(manifest.externalTextAssets) ? manifest.externalTextAssets : [];
  const changedFiles = [...new Set(changes.map((change) => change.file))].sort((left, right) => left.localeCompare(right, "en"));
  const patchedFiles = collectNativePatchedEntryNames(records);
  const assetId = "as3-native-navigation-labels";
  manifest.externalTextAssets = manifest.externalTextAssets.filter((entry) => entry?.assetId !== assetId);
  manifest.externalTextAssets.push({
    assetId,
    assetPath: "content/www.poptropica.com/**/game/data/scenes/**/*.xml",
    policy: "native XML label text only; no static art overlays",
    patchedCount: patchedFiles.length,
    patchedFiles,
    changedCount: changedFiles.length,
    changedFiles,
    generatedAt: new Date().toISOString()
  });
  return patchedFiles;
}

function main() {
  const config = loadConfig();
  const sourceExtraction = extractSourceSceneRoots(config);
  const records = collectSceneXmlRecords(sourceExtraction.roots);

  const changes = [];
  for (const record of records) {
    changes.push(...patchAs3NativeLabels(record));
  }

  const manifestPath = path.join(paths.as3PackDir, "manifest.json");
  const manifest = fileExists(manifestPath) ? readJson(manifestPath, {}) : {};
  const patchedNativeLabelFiles = updateManifestForNativeLabels(manifest, records, changes);
  const runtimeZip = changes.length
    ? buildRuntimeZipForSourceGroup({
        config,
        sourceGroup: "as3",
        manifest
      })
    : (manifest.runtimeZip || null);
  writeJson(manifestPath, manifest);
  const remainingLabels = collectRemainingEnglishLabels(records);

  const report = {
    ok: sourceExtraction.errors.length === 0 && remainingLabels.remaining.length === 0,
    generatedAt: new Date().toISOString(),
    policy: "native XML navigation labels only; static scene art and icon artwork are not overlaid",
    sourceZip: sourceExtraction.sourceZip,
    sourceExtractRoot: sourceExtraction.extractRoot,
    sourceExtractionErrors: sourceExtraction.errors,
    as3SceneXmlFilesScanned: records.length,
    patchedNativeLabelFileCount: patchedNativeLabelFiles.length,
    patchedNativeLabelFiles,
    changedCount: changes.length,
    changes,
    remainingEnglishNativeLabels: remainingLabels.remaining,
    ignoredInternalEnglishLabels: remainingLabels.ignored,
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "native-navigation-labels-patch.json");
  ensureDirSync(path.dirname(reportPath));
  writeJson(reportPath, report);
  printJson({
    ...report,
    patchedNativeLabelFiles: patchedNativeLabelFiles.length <= 50 ? patchedNativeLabelFiles : patchedNativeLabelFiles.slice(0, 50),
    patchedNativeLabelFilesTruncated: patchedNativeLabelFiles.length > 50,
    changes: changes.length <= 50 ? changes : changes.slice(0, 50),
    changesTruncated: changes.length > 50,
    reportPath
  });
}

main();
