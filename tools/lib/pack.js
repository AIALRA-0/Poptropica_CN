const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");
const paths = require("./paths");
const { ensureDirSync, fileExists, hashFile, listFilesRecursive, readJson, removeDirContents, writeJson, writeText } = require("./fs-utils");
const { normalizeTranslatedText } = require("./text-utils");
const { generateAs3MapLogoOverrides } = require("./as3-logo-overrides");

const RUNTIME_FIX_VERSION = 5;
// Startup/login SWFs are excluded from the default runtime override set.
// They still rely on embedded legacy fonts, and forcing Chinese into those
// text fields can blank the buttons or destabilize the first menu. We keep
// the default runtime zip to external text assets until a dedicated SWF/font
// patch path is ready.
const SAFE_RUNTIME_SWF_PATTERNS = [
  /content\/www\.poptropica\.com\/scenes\/islandHome\/sceneHome\.swf$/iu,
  /content\/www\.poptropica\.com\/game\/assets\/scenes\/map\/map\/interactive\.swf$/iu,
  /content\/www\.poptropica\.com\/game\/assets\/scenes\/map\/map\/islands\/[^/]+\/logo\.swf$/iu
];
const AS2_SUPER_POWER_GAMEPLAY_PATH = "content/www.poptropica.com/gameplay.swf";
const AS2_SUPER_POWER_SHARED_CHAR_PATH = "content/www.poptropica.com/char.swf";
const AS2_SUPER_POWER_COUNTER_BALLOON_PATH = "content/www.poptropica.com/popups/counter/balloon.swf";
const AS2_SUPER_POWER_BALLOON_PATH = "content/www.poptropica.com/popups/balloon.swf";
const AS2_SUPER_POWER_SCENE_PATH = "content/www.poptropica.com/scenes/islandSuper/sceneSuperMain.swf";
const AS2_SUPER_POWER_DOWNTOWN_PATH = "content/www.poptropica.com/scenes/islandSuper/sceneDownTown.swf";
const AS2_SUPER_POWER_SENTINEL_TEXT = "原版气泡中文测试";
const SKIP_RUNTIME_FILE_PATTERNS = [
  /content\/www\.poptropica\.com\/game\/data\/languages\/en\/islands\/start\/language\.xml$/iu,
  /content\/www\.poptropica\.com\/game\/data\/languages\/en\/shared\/language\.xml$/iu
];

function applyExactReplacements(content, rows) {
  const ordered = [...rows]
    .filter((row) => row.source_text && row.translated_text)
    .sort((left, right) => right.source_text.length - left.source_text.length);
  let nextContent = content;
  for (const row of ordered) {
    const translatedText = normalizeTranslatedText(row.translated_text, row.source_text);
    nextContent = nextContent.split(row.source_text).join(translatedText);
  }
  return nextContent;
}

function escapeForRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const UNSAFE_XML_LEAF_TAGS = new Set([
  "event",
  "eventsClass",
  "island",
  "islandFolder",
  "scene",
  "animation",
  "component",
  "data",
  "playerMap",
  "medallion",
  "islandMain",
  "pageFolder",
  "class",
  "type",
  "action",
  "url",
  "path",
  "target",
  "source",
  "item",
  "fontfamily",
  "align",
  "verticalalign",
  "letterspacing",
  "leading",
  "marginleft",
  "marginright",
  "indent",
  "underline",
  "italic",
  "bold",
  "size",
  "color"
]);

const UNSAFE_XML_CONTAINER_TAGS = new Set([
  "permanentEvents",
  "itemIdMap",
  "pages",
  "properties",
  "sceneMap",
  "eventMap"
]);

const UNSAFE_JSON_KEYS = new Set([
  "id",
  "event",
  "eventsClass",
  "island",
  "islandFolder",
  "scene",
  "playerMap",
  "medallion",
  "pageFolder",
  "path",
  "url",
  "href",
  "src",
  "target",
  "source",
  "asset",
  "file"
]);

const SAFE_XML_ATTR_NAMES = new Set([
  "name",
  "title",
  "label",
  "description",
  "text",
  "value",
  "tooltip",
  "caption",
  "message",
  "hint",
  "displayname",
  "display",
  "subtitle",
  "instructions",
  "prompt",
  "question",
  "answer"
]);

const UNSAFE_XML_ATTR_NAMES = new Set([
  "id",
  "event",
  "eventsclass",
  "island",
  "islandfolder",
  "scene",
  "animation",
  "component",
  "class",
  "type",
  "action",
  "url",
  "path",
  "target",
  "source",
  "href",
  "src",
  "link",
  "linkentityid",
  "triggerevent",
  "triggereventargs",
  "clustername",
  "playermap"
]);

const CJK_FONT_CHAIN = "SimHei, Microsoft YaHei UI, Microsoft YaHei, Arial Unicode MS, _sans";
const SWF_FONT_FILE_CANDIDATES = {
  simhei: [
    "C:\\Windows\\Fonts\\simhei.ttf"
  ],
  "microsoft yahei": [
    "C:\\Windows\\Fonts\\msyh.ttc",
    "C:\\Windows\\Fonts\\msyhbd.ttc",
    "C:\\Windows\\Fonts\\msyhl.ttc"
  ],
  "arial unicode ms": [
    "C:\\Windows\\Fonts\\ARIALUNI.ttf"
  ],
  fallback: [
    "C:\\Windows\\Fonts\\simhei.ttf",
    "C:\\Windows\\Fonts\\ARIALUNI.ttf",
    "C:\\Windows\\Fonts\\msyh.ttc",
    "C:\\Windows\\Fonts\\simsun.ttc"
  ]
};

function encodeNonAsciiAsHtmlEntities(text) {
  return String(text || "").replace(/[^\x00-\x7F]/gu, (character) => {
    const codePoint = character.codePointAt(0);
    return `&#${codePoint};`;
  });
}

function safeParseContext(row) {
  try {
    return JSON.parse(row.context_json || "{}");
  } catch (_error) {
    return {};
  }
}

function getLastPathSegment(pathSegments = []) {
  const normalized = [...pathSegments].reverse().find((segment) => segment && !/^\[\d+\]$/u.test(segment));
  return normalized || null;
}

function isSafeXmlRow(assetPath, row) {
  const context = safeParseContext(row);
  const pathSegments = Array.isArray(context.path) ? context.path : [];
  const leaf = getLastPathSegment(pathSegments);
  if (!leaf && context.kind !== "xml-attr") {
    return false;
  }

  if (context.kind === "xml-text") {
    if (/\/framework\/data\/config\.xml$/iu.test(assetPath)) {
      return leaf === "clusterName";
    }
    if (UNSAFE_XML_LEAF_TAGS.has(leaf)) {
      return false;
    }
    if (pathSegments.some((segment) => UNSAFE_XML_CONTAINER_TAGS.has(segment))) {
      return false;
    }
    if (assetPath.includes("/game/data/scenes/") && /^(scene|event|action|path|url)$/iu.test(leaf)) {
      return false;
    }
    return true;
  }

  if (context.kind === "xml-attr") {
    const attr = String(context.attr || "").toLowerCase();
    if (!attr || UNSAFE_XML_ATTR_NAMES.has(attr)) {
      return false;
    }
    if (!SAFE_XML_ATTR_NAMES.has(attr)) {
      return false;
    }
    if (pathSegments.some((segment) => UNSAFE_XML_CONTAINER_TAGS.has(segment))) {
      return false;
    }
    return true;
  }

  return false;
}

function isSafeJsonRow(row) {
  const context = safeParseContext(row);
  if (context.kind !== "json") {
    return false;
  }
  const pathSegments = Array.isArray(context.path) ? context.path : [];
  const leaf = getLastPathSegment(pathSegments);
  if (!leaf) {
    return false;
  }
  return !UNSAFE_JSON_KEYS.has(leaf);
}

function setValueAtPath(root, pathSegments, value) {
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) {
    return false;
  }

  let current = root;
  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const segment = pathSegments[index];
    const arrayMatch = /^\[(\d+)\]$/u.exec(segment);
    if (arrayMatch) {
      current = current?.[Number.parseInt(arrayMatch[1], 10)];
    } else {
      current = current?.[segment];
    }
    if (current === undefined || current === null) {
      return false;
    }
  }

  const lastSegment = pathSegments[pathSegments.length - 1];
  const arrayMatch = /^\[(\d+)\]$/u.exec(lastSegment);
  if (arrayMatch) {
    const arrayIndex = Number.parseInt(arrayMatch[1], 10);
    if (!Array.isArray(current) || arrayIndex >= current.length) {
      return false;
    }
    current[arrayIndex] = value;
    return true;
  }

  if (typeof current !== "object" || current === null || !(lastSegment in current)) {
    return false;
  }
  current[lastSegment] = value;
  return true;
}

function applyXmlTranslations(content, assetPath, rows) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: false
  });
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    indentBy: "\t",
    suppressEmptyNode: false
  });

  let parsed;
  try {
    parsed = parser.parse(content);
  } catch (_error) {
    return content;
  }

  let applied = 0;
  for (const row of rows) {
    if (!isSafeXmlRow(assetPath, row)) {
      continue;
    }
    const context = safeParseContext(row);
    const translatedText = normalizeTranslatedText(row.translated_text, row.source_text);
    const pathSegments = context.kind === "xml-attr"
      ? [...(Array.isArray(context.path) ? context.path : []), `@_${context.attr}`]
      : context.path;
    if (setValueAtPath(parsed, pathSegments, translatedText)) {
      applied += 1;
    }
  }

  if (applied === 0) {
    return content;
  }

  return builder.build(parsed);
}

function applyLanguageXmlValueReplacements(content, assetPath, rows) {
  let nextContent = content;
  let applied = 0;

  for (const row of rows) {
    if (!isSafeXmlRow(assetPath, row)) {
      continue;
    }

    const context = safeParseContext(row);
    if (context.kind !== "xml-text") {
      continue;
    }

    const pathSegments = Array.isArray(context.path) ? context.path : [];
    const leaf = getLastPathSegment(pathSegments);
    if (!leaf) {
      continue;
    }

    const sourceText = String(row.source_text || "");
    if (!sourceText || /<(?:font|p|br)\b/iu.test(sourceText)) {
      continue;
    }

    const translatedText = normalizeTranslatedText(row.translated_text, row.source_text);
    const tagPattern = escapeForRegExp(leaf);
    const sourcePattern = escapeForRegExp(sourceText);

    const cdataPattern = new RegExp(
      `(<${tagPattern}(?:\\s[^>]*)?>\\s*<!\\[CDATA\\[)${sourcePattern}(\\]\\]>\\s*</${tagPattern}>)`,
      "gu"
    );
    const textPattern = new RegExp(
      `(<${tagPattern}(?:\\s[^>]*)?>\\s*)${sourcePattern}(\\s*</${tagPattern}>)`,
      "gu"
    );

    const withCdata = nextContent.replace(cdataPattern, `$1${translatedText}$2`);
    if (withCdata !== nextContent) {
      nextContent = withCdata;
      applied += 1;
      continue;
    }

    const withText = nextContent.replace(textPattern, `$1${translatedText}$2`);
    if (withText !== nextContent) {
      nextContent = withText;
      applied += 1;
    }
  }

  return {
    content: nextContent,
    applied
  };
}

function shouldUseExactXmlReplacement(assetPath, rows) {
  if (!/\/game\/data\/languages\//iu.test(assetPath)) {
    return false;
  }
  return rows.some((row) => typeof row.source_text === "string" && /<(?:font|p|br)\b/iu.test(row.source_text));
}

function applyJsonTranslations(content, rows) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_error) {
    return content;
  }

  let applied = 0;
  for (const row of rows) {
    if (!isSafeJsonRow(row)) {
      continue;
    }
    const context = safeParseContext(row);
    const translatedText = normalizeTranslatedText(row.translated_text, row.source_text);
    if (setValueAtPath(parsed, context.path, translatedText)) {
      applied += 1;
    }
  }

  if (applied === 0) {
    return content;
  }

  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function applyPhpTranslations(content, rows) {
  const replacements = [];

  for (const row of rows) {
    const context = safeParseContext(row);
    if (context.kind !== "php-value") {
      continue;
    }

    const valueStart = Number(context.valueStart);
    const valueEnd = Number(context.valueEnd);
    if (!Number.isFinite(valueStart) || !Number.isFinite(valueEnd) || valueStart < 0 || valueEnd < valueStart) {
      continue;
    }

    let translatedText = normalizeTranslatedText(row.translated_text, row.source_text);
    const quote = context.quote === '"' ? '"' : "'";
    translatedText = translatedText
      .replace(/\\/gu, "\\\\")
      .replace(quote === "'" ? /'/gu : /"/gu, quote === "'" ? "\\'" : '\\"');

    replacements.push({
      start: valueStart,
      end: valueEnd,
      value: translatedText
    });
  }

  if (!replacements.length) {
    return content;
  }

  replacements.sort((left, right) => right.start - left.start);
  let nextContent = content;
  for (const replacement of replacements) {
    nextContent = `${nextContent.slice(0, replacement.start)}${replacement.value}${nextContent.slice(replacement.end)}`;
  }
  return nextContent;
}

function applyStructuredReplacements(content, assetType, assetPath, rows) {
  if (assetType === "xml") {
    const htmlRows = rows.filter((row) => typeof row.source_text === "string" && /<(?:font|p|br)\b/iu.test(row.source_text));
    const attrRows = rows.filter((row) => safeParseContext(row).kind === "xml-attr");
    const textRows = rows.filter((row) => !htmlRows.includes(row) && safeParseContext(row).kind === "xml-text");

    let nextContent = content;
    if (textRows.length > 0) {
      nextContent = applyLanguageXmlValueReplacements(nextContent, assetPath, textRows).content;
    }
    if (attrRows.length > 0) {
      nextContent = applyXmlTranslations(nextContent, assetPath, attrRows);
    }
    if (htmlRows.length > 0) {
      nextContent = applyExactReplacements(nextContent, htmlRows);
    }

    return nextContent;
  }
  if (assetType === "json") {
    return applyJsonTranslations(content, rows);
  }
  if (assetType === "php") {
    return applyPhpTranslations(content, rows);
  }
  return applyExactReplacements(content, rows);
}

function applyFlashSafeTypography(assetPath, content) {
  if (!assetPath) {
    return content;
  }

  if (assetPath === "content/www.poptropica.com/game/data/languages/en/islands/start/language.xml") {
    const normalized = content
      // Flash start-screen HTML text renders more reliably with device fonts than
      // with legacy embedded font names inside this runtime.
      .replace(/face="SimHei"/gu, 'face="_sans"')
      .replace(/face="Microsoft YaHei UI"/gu, 'face="_sans"')
      .replace(/face="Microsoft YaHei"/gu, 'face="_sans"')
      .replace(/face="Arial Unicode MS"/gu, 'face="_sans"')
      .replace(/face="CreativeBlock BB Bold"/gu, 'face="_sans"')
      .replace(/face="CreativeBlock BB"/gu, 'face="_sans"');
    return encodeNonAsciiAsHtmlEntities(normalized);
  }

  if (/\/game\/style\/styles\.xml$/iu.test(assetPath)) {
    let next = content.replace(/<fontfamily>([^<]*)<\/fontfamily>/giu, `<fontfamily>${CJK_FONT_CHAIN}</fontfamily>`);
    next = next.replace(/<bold>\s*false\s*<\/bold>/giu, "<bold>true</bold>");
    return next;
  }

  return content;
}

function getPackPaths(sourceGroup) {
  const baseDir = sourceGroup === "as2" ? paths.as2PackDir : paths.as3PackDir;
  return {
    baseDir,
    filesDir: path.join(baseDir, "files"),
    swfDir: path.join(baseDir, "swf"),
    runtimeZipPath: sourceGroup === "as2" ? paths.as2RuntimeZipPath : paths.as3RuntimeZipPath
  };
}

function findSevenZip(config) {
  const candidates = [
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "x64", "7za.exe") : null,
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "ia32", "7za.exe") : null,
    "C:\\Program Files\\AMD\\CIM\\Bin64\\7z.exe",
    "C:\\Program Files\\Autodesk\\AdODIS\\V1\\Setup\\7za.exe"
  ];
  return candidates.find((candidate) => candidate && fileExists(candidate)) || null;
}

function validateZipArchive(sevenZip, zipPath) {
  if (!sevenZip || !zipPath || !fileExists(zipPath)) {
    return false;
  }
  const result = spawnSync(sevenZip, ["t", zipPath], {
    encoding: "utf8",
    windowsHide: true
  });
  return result.status === 0;
}

function hashReplacementSet(replacements) {
  const hash = crypto.createHash("sha256");
  for (const replacement of [...replacements].sort((left, right) => left.entryName.localeCompare(right.entryName, "en"))) {
    hash.update(replacement.entryName);
    hash.update("\n");
    hash.update(hashFile(replacement.sourceFilePath));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function shouldIncludeRuntimeSwfOverride(entryName, includeAllSwfRuntimeOverrides) {
  if (includeAllSwfRuntimeOverrides) {
    return true;
  }
  return SAFE_RUNTIME_SWF_PATTERNS.some((pattern) => pattern.test(entryName));
}

function shouldIncludeRuntimeFileOverride(entryName) {
  return !SKIP_RUNTIME_FILE_PATTERNS.some((pattern) => pattern.test(entryName));
}

function patchRuntimeRenderMode(workingDir) {
  const runtimeRoot = path.join(workingDir, "content", "www.poptropica.com");
  if (!fileExists(runtimeRoot)) {
    return {
      patchedFiles: []
    };
  }

  const patchedFiles = [];
  const candidates = listFilesRecursive(runtimeRoot).filter((filePath) => /\.(?:php|html?|txt)$/iu.test(filePath));
  for (const filePath of candidates) {
    const original = fs.readFileSync(filePath, "utf8");
    const next = original
      .replace(/wmode=(["'])gpu\1/giu, "wmode=$1direct$1")
      .replace(/(<param[^>]+name=(["'])wmode\2[^>]+value=(["']))gpu((["'][^>]*>))/giu, "$1direct$4")
      .replace(/(<embed[^>]+wmode=(["']))gpu((["'][^>]*>))/giu, "$1direct$3");

    if (next !== original) {
      writeText(filePath, next);
      patchedFiles.push(path.relative(workingDir, filePath).replace(/\\/gu, "/"));
    }
  }

  return {
    patchedFiles
  };
}

function runFfdecCommand(ffdecCli, args) {
  const result = spawnSync(ffdecCli, args, {
    encoding: "utf8",
    windowsHide: true
  });
  const stderr = (result.stderr || "").trim();
  const stdout = (result.stdout || "").trim();
  const combined = [stderr, stdout].filter(Boolean).join("\n");
  const severeMatch = /SEVERE:\s*(.+)$/imu.exec(combined);
  return {
    ok: result.status === 0 && !severeMatch,
    error: severeMatch ? severeMatch[1].trim() : combined,
    stdout,
    stderr
  };
}

function findPreferredSwfFontFile(config) {
  const preferredFont = String(config?.preferences?.preferredFont || "").toLowerCase();
  const candidates = [];

  if (preferredFont.includes("simhei")) {
    candidates.push(...SWF_FONT_FILE_CANDIDATES.simhei);
  }
  if (preferredFont.includes("yahei")) {
    candidates.push(...SWF_FONT_FILE_CANDIDATES["microsoft yahei"]);
  }
  if (preferredFont.includes("arial unicode")) {
    candidates.push(...SWF_FONT_FILE_CANDIDATES["arial unicode ms"]);
  }

  candidates.push(...SWF_FONT_FILE_CANDIDATES.fallback);
  return candidates.find((candidate) => fileExists(candidate)) || null;
}

function exportFormattedSwfTexts({ ffdecCli, inputSwf, outputDir }) {
  removeDirContents(outputDir);
  ensureDirSync(outputDir);
  const result = runFfdecCommand(ffdecCli, ["-cli", "-format", "text:formatted", "-export", "text", outputDir, inputSwf]);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "FFDec formatted text export failed"
    };
  }
  return {
    ok: true,
    outputDir
  };
}

function replaceFormattedVisibleText(content, translatedText) {
  const source = String(content || "");
  let index = 0;
  while (source[index] === "[") {
    const closingIndex = source.indexOf("]", index);
    if (closingIndex < 0) {
      return `${source}\n${translatedText}`;
    }
    index = closingIndex + 1;
    while (source[index] === "\r" || source[index] === "\n") {
      index += 1;
    }
  }

  const prefix = source.slice(0, index);
  const suffix = source.endsWith("\n") ? "\n" : "";
  return `${prefix}${translatedText}${suffix}`;
}

function normalizeSwfTextFileContent(content) {
  const normalized = String(content || "").replace(/\r?\n/gu, "\r\n");
  return normalized.endsWith("\r\n") ? normalized : `${normalized}\r\n`;
}

function splitFormattedTextSections(content) {
  const source = String(content || "");
  let index = 0;
  while (source[index] === "[") {
    const closingIndex = source.indexOf("]", index);
    if (closingIndex < 0) {
      return {
        prefix: source,
        bodyLines: [],
        suffix: source.endsWith("\n") ? "\n" : ""
      };
    }
    index = closingIndex + 1;
    while (source[index] === "\r" || source[index] === "\n") {
      index += 1;
    }
  }

  const prefix = source.slice(0, index);
  const suffix = source.endsWith("\n") ? "\n" : "";
  const body = suffix ? source.slice(index, -suffix.length) : source.slice(index);
  return {
    prefix,
    bodyLines: body.length ? body.split(/\r?\n/u) : [],
    suffix
  };
}

function sanitizeFormattedTextMetadata(prefix, translatedLines = []) {
  const hasNonAscii = translatedLines.some((line) => /[^\x00-\x7F]/u.test(String(line || "")));
  if (!hasNonAscii) {
    return prefix;
  }

  return prefix
    .split(/\r?\n/u)
    .filter((line) => !/^\s*spacing(?:pair)?\s+/iu.test(line))
    .join("\n");
}

function extractFontIdsFromFormattedText(content) {
  const fontIds = new Set();
  const pattern = /^font\s+(\d+)$/gimu;
  let match = pattern.exec(content);
  while (match) {
    fontIds.add(Number.parseInt(match[1], 10));
    match = pattern.exec(content);
  }
  return [...fontIds].filter(Number.isInteger);
}

function buildFormattedSwfTextPatch({ assetRows, inputSwf, ffdecCli, translatedTextRoot }) {
  const formattedExportRoot = path.join(paths.tempDir, `swf-formatted-export-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const exportResult = exportFormattedSwfTexts({
    ffdecCli,
    inputSwf,
    outputDir: formattedExportRoot
  });
  if (!exportResult.ok) {
    return {
      ok: false,
      error: exportResult.error
    };
  }

  const groupedRows = new Map();
  for (const row of assetRows) {
    const context = JSON.parse(row.context_json || "{}");
    if (context.kind && context.kind !== "swf-text") {
      continue;
    }
    if (!context.exportPath) {
      continue;
    }
    if (!groupedRows.has(context.exportPath)) {
      groupedRows.set(context.exportPath, []);
    }
    groupedRows.get(context.exportPath).push({
      ...row,
      lineNumber: Number(context.lineNumber || 1)
    });
  }

  const translatedFiles = [];
  const fontIds = new Set();
  for (const [exportPath, exportRows] of groupedRows.entries()) {
    const sourceFile = path.join(formattedExportRoot, exportPath);
    if (!fileExists(sourceFile)) {
      continue;
    }

    const sourceContent = fs.readFileSync(sourceFile, "utf8");
    const { prefix, bodyLines, suffix } = splitFormattedTextSections(sourceContent);
    const nextBodyLines = [...bodyLines];
    for (const row of exportRows.sort((left, right) => left.lineNumber - right.lineNumber)) {
      const targetIndex = Math.max(0, row.lineNumber - 1);
      if (targetIndex >= nextBodyLines.length) {
        continue;
      }
      nextBodyLines[targetIndex] = normalizeTranslatedText(row.translated_text, row.source_text);
    }

    const sanitizedPrefix = sanitizeFormattedTextMetadata(prefix, nextBodyLines);
    const nextContent = `${sanitizedPrefix}${nextBodyLines.join("\n")}${suffix}`;
    if (nextContent === sourceContent) {
      continue;
    }

    for (const fontId of extractFontIdsFromFormattedText(sourceContent)) {
      fontIds.add(fontId);
    }

    const targetFile = path.join(translatedTextRoot, exportPath);
    ensureDirSync(path.dirname(targetFile));
    writeText(targetFile, normalizeSwfTextFileContent(nextContent));
    translatedFiles.push({
      filePath: targetFile,
      exportPath
    });
  }

  removeDirContents(formattedExportRoot);

  return {
    ok: true,
    translatedFiles: translatedFiles.sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en")),
    fontIds: [...fontIds].sort((left, right) => left - right)
  };
}

function collectFontIdsFromFormattedExport({ formattedExportRoot, exportPaths = [] }) {
  const fontIds = new Set();
  for (const exportPath of exportPaths) {
    const formattedFile = path.join(formattedExportRoot, exportPath);
    if (!fileExists(formattedFile)) {
      continue;
    }
    const content = fs.readFileSync(formattedFile, "utf8");
    for (const fontId of extractFontIdsFromFormattedText(content)) {
      fontIds.add(fontId);
    }
  }
  return [...fontIds].sort((left, right) => left - right);
}

function collectFontIdsByExportPath({ formattedExportRoot, exportPaths = [] }) {
  const byExportPath = new Map();
  for (const exportPath of exportPaths) {
    const formattedFile = path.join(formattedExportRoot, exportPath);
    if (!fileExists(formattedFile)) {
      continue;
    }
    const content = fs.readFileSync(formattedFile, "utf8");
    const fontIds = extractFontIdsFromFormattedText(content);
    byExportPath.set(exportPath, fontIds.sort((left, right) => left - right));
  }
  return byExportPath;
}

function buildPlainSwfTextPatch({ assetRows, sourceTextRoot, inputSwf, ffdecCli, translatedTextRoot }) {
  const translatedFiles = buildTranslatedSwfFiles({
    assetRows,
    sourceTextRoot,
    translatedTextRoot
  });

  if (translatedFiles.length === 0) {
    return {
      ok: true,
      translatedFiles: [],
      fontIds: [],
      formattedFallbackFilesByExportPath: new Map(),
      cleanupPaths: []
    };
  }

  const formattedExportRoot = path.join(paths.tempDir, `swf-formatted-export-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const exportResult = exportFormattedSwfTexts({
    ffdecCli,
    inputSwf,
    outputDir: formattedExportRoot
  });
  if (!exportResult.ok) {
    return {
      ok: false,
      error: exportResult.error
    };
  }

  const fontIds = collectFontIdsFromFormattedExport({
    formattedExportRoot,
    exportPaths: translatedFiles.map((entry) => entry.exportPath)
  });
  const fontIdsByExportPath = collectFontIdsByExportPath({
    formattedExportRoot,
    exportPaths: translatedFiles.map((entry) => entry.exportPath)
  });
  const formattedFallbackRoot = path.join(paths.tempDir, `swf-formatted-fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const formattedFallbackPatch = buildFormattedSwfTextPatch({
    assetRows,
    inputSwf,
    ffdecCli,
    translatedTextRoot: formattedFallbackRoot
  });
  const formattedFallbackFilesByExportPath = new Map();
  if (formattedFallbackPatch.ok) {
    for (const entry of formattedFallbackPatch.translatedFiles || []) {
      formattedFallbackFilesByExportPath.set(entry.exportPath, entry.filePath);
    }
  }
  removeDirContents(formattedExportRoot);

  return {
    ok: true,
    translatedFiles,
    fontIds,
    fontIdsByExportPath,
    formattedFallbackFilesByExportPath,
    cleanupPaths: [formattedFallbackRoot]
  };
}

function replaceSingleSwfText({ ffdecCli, inputSwf, outputSwf, translatedFilePath, characterId, fontIds = [], fontFilePath = null }) {
  const replaceArgs = ["-replace", inputSwf, outputSwf];
  if (fontFilePath && fontIds.length > 0) {
    for (const fontId of fontIds) {
      replaceArgs.push(String(fontId), fontFilePath);
    }
  }
  replaceArgs.push(String(characterId), translatedFilePath);

  const result = runFfdecCommand(ffdecCli, replaceArgs);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "FFDec batch replace failed"
    };
  }

  return { ok: true };
}

function replaceSingleSwfExport({ ffdecCli, inputSwf, outputSwf, translatedFilePath, replaceTarget, fontIds = [], fontFilePath = null }) {
  const replaceArgs = ["-replace", inputSwf, outputSwf];
  if (fontFilePath && fontIds.length > 0) {
    for (const fontId of fontIds) {
      replaceArgs.push(String(fontId), fontFilePath);
    }
  }
  replaceArgs.push(String(replaceTarget), translatedFilePath);

  const result = runFfdecCommand(ffdecCli, replaceArgs);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "FFDec replace failed"
    };
  }

  return { ok: true };
}

function replaceSwfTexts({ ffdecCli, inputSwf, outputSwf, translatedFiles, fontIds = [], fontIdsByExportPath = new Map(), fontFilePath = null, fallbackFilesByExportPath = new Map(), sequential = false }) {
  if (!translatedFiles.length && !fontIds.length) {
    fs.copyFileSync(inputSwf, outputSwf);
    return { ok: true };
  }

  if (sequential) {
    let currentInput = inputSwf;
    const tempOutputs = [];
    const orderedEntries = [...translatedFiles].sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en"));
    try {
      for (let index = 0; index < orderedEntries.length; index += 1) {
        const entry = orderedEntries[index];
        const characterId = Number.parseInt(path.basename(entry.exportPath, path.extname(entry.exportPath)), 10);
        if (!Number.isInteger(characterId)) {
          return {
            ok: false,
            error: `Unable to resolve character id from ${entry.exportPath}`
          };
        }

        const tempOutput = index === orderedEntries.length - 1
          ? outputSwf
          : path.join(paths.tempDir, `swf-replace-step-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}.swf`);

        let result = replaceSingleSwfText({
          ffdecCli,
          inputSwf: currentInput,
          outputSwf: tempOutput,
          translatedFilePath: entry.filePath,
          characterId,
          fontIds: fontIdsByExportPath.get(entry.exportPath) || fontIds,
          fontFilePath
        });

        if (!result.ok) {
          const fallbackPath = fallbackFilesByExportPath.get(entry.exportPath);
          if (fallbackPath && fileExists(fallbackPath)) {
            result = replaceSingleSwfText({
              ffdecCli,
              inputSwf: currentInput,
              outputSwf: tempOutput,
              translatedFilePath: fallbackPath,
              characterId,
              fontIds: fontIdsByExportPath.get(entry.exportPath) || fontIds,
              fontFilePath
            });
          }
        }

        if (!result.ok) {
          return {
            ok: false,
            error: `${result.error || "FFDec replace failed"} [${entry.exportPath}]`
          };
        }

        if (tempOutput !== outputSwf) {
          tempOutputs.push(tempOutput);
        }
        currentInput = tempOutput;
      }
    } finally {
      for (const tempFile of tempOutputs) {
        if (fileExists(tempFile)) {
          fs.rmSync(tempFile, { force: true });
        }
      }
    }

    return { ok: true };
  }

  const replaceArgs = ["-replace", inputSwf, outputSwf];
  if (fontFilePath && fontIds.length > 0) {
    for (const fontId of fontIds) {
      replaceArgs.push(String(fontId), fontFilePath);
    }
  }

  for (const entry of translatedFiles) {
    const characterId = Number.parseInt(path.basename(entry.exportPath, path.extname(entry.exportPath)), 10);
    if (!Number.isInteger(characterId)) {
      return {
        ok: false,
        error: `Unable to resolve character id from ${entry.exportPath}`
      };
    }

    replaceArgs.push(String(characterId), entry.filePath);
  }

  const result = runFfdecCommand(ffdecCli, replaceArgs);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "FFDec batch replace failed"
    };
  }

  return { ok: true };
}

function buildTranslatedSwfFiles({ assetRows, sourceTextRoot, translatedTextRoot }) {
  const changedFiles = new Set();

  for (const row of assetRows) {
    const context = JSON.parse(row.context_json || "{}");
    if (context.kind && context.kind !== "swf-text") {
      continue;
    }
    if (!context.exportPath || !context.lineNumber) {
      continue;
    }

    const sourceFile = path.join(sourceTextRoot, context.exportPath);
    if (!fileExists(sourceFile)) {
      continue;
    }

    const sourceLines = fs.readFileSync(sourceFile, "utf8").split(/\r?\n/u);
    const lineIndex = Math.max(0, Number(context.lineNumber) - 1);
    const translatedLine = normalizeTranslatedText(row.translated_text, row.source_text);

    if (lineIndex >= sourceLines.length || translatedLine === sourceLines[lineIndex]) {
      continue;
    }

    const targetFile = path.join(translatedTextRoot, context.exportPath);
    ensureDirSync(path.dirname(targetFile));

    let nextLines = sourceLines;
    if (fileExists(targetFile)) {
      nextLines = fs.readFileSync(targetFile, "utf8").split(/\r?\n/u);
      if (lineIndex >= nextLines.length) {
        nextLines = sourceLines;
      }
    }

    nextLines[lineIndex] = translatedLine;
    writeText(targetFile, normalizeSwfTextFileContent(nextLines.join("\n")));
    changedFiles.add(targetFile);
  }

  return [...changedFiles]
    .filter((filePath) => /\.txt$/iu.test(filePath))
    .map((filePath) => ({
      filePath,
      exportPath: path.relative(translatedTextRoot, filePath).replace(/\\/gu, "/")
    }))
    .sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en"));
}

function escapeSwfScriptLiteral(text, quote = '"') {
  return String(text || "")
    .replace(/\\/gu, "\\\\")
    .replace(/\r/gu, "\\r")
    .replace(/\n/gu, "\\n")
    .replace(/\t/gu, "\\t")
    .replace(new RegExp(escapeForRegExp(quote), "gu"), `\\${quote}`);
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

function buildTranslatedSwfScriptFiles({ assetRows, sourceScriptRoot, translatedScriptRoot }) {
  const changedFiles = new Set();

  for (const row of assetRows) {
    const context = JSON.parse(row.context_json || "{}");
    if (context.kind !== "swf-script") {
      continue;
    }
    if (!context.exportPath || !context.lineNumber || !context.rawLiteral || !context.quote) {
      continue;
    }

    const sourceFile = path.join(sourceScriptRoot, context.exportPath);
    if (!fileExists(sourceFile)) {
      continue;
    }

    const sourceLines = fs.readFileSync(sourceFile, "utf8").split(/\r?\n/u);
    const lineIndex = Math.max(0, Number(context.lineNumber) - 1);
    if (lineIndex >= sourceLines.length) {
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
      continue;
    }

    nextLines[lineIndex] = nextLine;
    writeText(targetFile, nextLines.join("\n"));
    changedFiles.add(targetFile);
  }

  return [...changedFiles]
    .filter((filePath) => /\.as$/iu.test(filePath))
    .map((filePath) => ({
      filePath,
      exportPath: path.relative(translatedScriptRoot, filePath).replace(/\\/gu, "/"),
      replaceTarget: `\\${path.relative(translatedScriptRoot, filePath).replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`
    }))
    .sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en"));
}

function replaceSwfScriptExports({ ffdecCli, inputSwf, outputSwf, translatedFiles }) {
  if (!translatedFiles.length) {
    if (inputSwf !== outputSwf) {
      fs.copyFileSync(inputSwf, outputSwf);
    }
    return { ok: true };
  }

  let currentInput = inputSwf;
  const tempOutputs = [];
  try {
    for (let index = 0; index < translatedFiles.length; index += 1) {
      const entry = translatedFiles[index];
      const nextOutput = index === translatedFiles.length - 1
        ? outputSwf
        : path.join(paths.tempDir, `swf-script-replace-step-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}.swf`);
      const result = replaceSingleSwfExport({
        ffdecCli,
        inputSwf: currentInput,
        outputSwf: nextOutput,
        translatedFilePath: entry.filePath,
        replaceTarget: entry.replaceTarget
      });
      if (!result.ok) {
        return {
          ok: false,
          error: `${result.error || "FFDec script replace failed"} [${entry.exportPath}]`
        };
      }
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

  return { ok: true };
}

function collectSwfScriptFiles(translatedScriptRoot) {
  if (!translatedScriptRoot || !fileExists(translatedScriptRoot)) {
    return [];
  }

  return listFilesRecursive(translatedScriptRoot)
    .filter((filePath) => /\.as$/iu.test(filePath))
    .map((filePath) => ({
      filePath,
      exportPath: path.relative(translatedScriptRoot, filePath).replace(/\\/gu, "/"),
      replaceTarget: `\\${path.relative(translatedScriptRoot, filePath).replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`
    }))
    .sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en"));
}

function normalizeScriptContent(content) {
  return String(content || "").replace(/\r\n/gu, "\n");
}

function replaceRequiredSnippet(content, searchValue, replacementValue, label) {
  const normalizedContent = normalizeScriptContent(content);
  const normalizedSearchValue = normalizeScriptContent(searchValue);
  if (!normalizedContent.includes(normalizedSearchValue)) {
    throw new Error(`Unable to locate ${label}`);
  }
  return normalizedContent.replace(normalizedSearchValue, normalizeScriptContent(replacementValue));
}

function ensureTranslatedScriptFromSource({ sourceScriptRoot, translatedScriptRoot, exportPath }) {
  const sourceFile = path.join(sourceScriptRoot, exportPath);
  if (!fileExists(sourceFile)) {
    throw new Error(`Missing source script export: ${exportPath}`);
  }

  const targetFile = path.join(translatedScriptRoot, exportPath);
  ensureDirSync(path.dirname(targetFile));
  fs.copyFileSync(sourceFile, targetFile);
  return targetFile;
}

function applyLiteralStringReplacements(content, replacements) {
  let nextContent = normalizeScriptContent(content);
  nextContent = nextContent.split("\\'").join("'");
  for (const [searchValue, replacementValue] of replacements) {
    const normalizedSearchValue = normalizeScriptContent(searchValue);
    const escapedSearchValue = normalizedSearchValue.split("\n").join("\\n");
    const escapedReplacementValue = normalizeScriptContent(replacementValue).split("\n").join("\\n");
    nextContent = nextContent.split(normalizedSearchValue).join(escapedReplacementValue);
    nextContent = nextContent.split(escapedSearchValue).join(escapedReplacementValue);
  }
  return nextContent;
}

function escapeAs2ScriptString(value) {
  return String(value || "")
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, "\\n");
}

function renderAs2StaticOverlayHelpers(overlays, containerExpression = "this") {
  const lines = [
    "function zhOverlayFill(targetClip, width, height, color, alpha)",
    "{",
    "   targetClip.beginFill(color,alpha);",
    "   targetClip.moveTo(0,0);",
    "   targetClip.lineTo(width,0);",
    "   targetClip.lineTo(width,height);",
    "   targetClip.lineTo(0,height);",
    "   targetClip.lineTo(0,0);",
    "   targetClip.endFill();",
    "}",
    "function zhOverlayLabel(container, clipName, x, y, width, height, bgColor, bgAlpha, textValue, fontSize, textColor, rotation)",
    "{",
    "   var holder;",
    "   var fmt;",
    "   holder = container.createEmptyMovieClip(clipName,container.getNextHighestDepth());",
    "   holder._x = x;",
    "   holder._y = y;",
    "   if(rotation != undefined)",
    "   {",
    "      holder._rotation = rotation;",
    "   }",
    "   zhOverlayFill(holder,width,height,bgColor,bgAlpha);",
    "   holder.createTextField(\"txt\",holder.getNextHighestDepth(),4,0,Math.max(1,width - 8),height);",
    "   holder.txt.embedFonts = false;",
    "   holder.txt.selectable = false;",
    "   holder.txt.multiline = true;",
    "   holder.txt.wordWrap = true;",
    "   holder.txt.autoSize = false;",
    "   holder.txt.text = textValue;",
    "   fmt = new TextFormat();",
    "   fmt.font = \"_sans\";",
    "   fmt.size = fontSize;",
    "   fmt.color = textColor;",
    "   fmt.bold = true;",
    "   fmt.align = \"center\";",
    "   fmt.leading = 2;",
    "   holder.txt.setNewTextFormat(fmt);",
    "   holder.txt.setTextFormat(fmt);",
    "   holder.txt._height = height;",
    "   holder.txt._y = Math.max(0,Math.floor((height - holder.txt.textHeight - 6) / 2));",
    "   return holder;",
    "}",
    "function installZhStaticOverlay()",
    "{",
    "   var overlayRoot;",
    "   var overlayHost;",
    `   overlayHost = ${containerExpression};`,
    "   if(overlayHost == undefined || overlayHost.zhStaticOverlay != undefined)",
    "   {",
    "      return undefined;",
    "   }",
    "   overlayRoot = overlayHost.createEmptyMovieClip(\"zhStaticOverlay\",overlayHost.getNextHighestDepth());"
  ];
  for (const overlay of overlays) {
    lines.push(
      `   zhOverlayLabel(overlayRoot,"${overlay.name}",${overlay.x},${overlay.y},${overlay.width},${overlay.height},${overlay.bgColor},${overlay.bgAlpha},"${escapeAs2ScriptString(overlay.text)}",${overlay.textSize},${overlay.textColor},${overlay.rotation == undefined ? "undefined" : overlay.rotation});`
    );
  }
  lines.push("}");
  return lines.join("\n");
}

const AS2_SUPER_POWER_SCENE_OVERLAY_CONFIGS = new Map([
  [
    AS2_SUPER_POWER_SCENE_PATH,
    {
      insertSearch: "function initChars()\n{",
      callSearch: `bitmapBackground();
_root.makeBackdrop();`,
      callReplacement: `bitmapBackground();
_root.makeBackdrop();
installZhStaticOverlay();`,
      containerExpression: "bg",
      overlays: [
        { name: "costumeMain", x: 1010, y: 1572, width: 235, height: 78, bgColor: 0x3F5F88, bgAlpha: 92, text: "面具与披风", textSize: 26, textColor: 0xFFFFFF },
        { name: "costumeWindow", x: 872, y: 1738, width: 156, height: 24, bgColor: 0x506985, bgAlpha: 92, text: "面具与服装", textSize: 12, textColor: 0xFFFFFF },
        { name: "heroWindow", x: 1218, y: 1738, width: 184, height: 24, bgColor: 0x506985, bgAlpha: 92, text: "超级英雄配件", textSize: 12, textColor: 0xFFFFFF },
        { name: "openSign", x: 917, y: 1762, width: 74, height: 56, bgColor: 0xB56C73, bgAlpha: 96, text: "营业中", textSize: 20, textColor: 0xFFFFFF },
        { name: "comicShop", x: 590, y: 1682, width: 186, height: 56, bgColor: 0x5C8F58, bgAlpha: 90, text: "漫画店", textSize: 22, textColor: 0xFFFFFF },
        { name: "telephone", x: 3934, y: 1718, width: 134, height: 30, bgColor: 0xD6772E, bgAlpha: 100, text: "电话亭", textSize: 18, textColor: 0xFFFFFF },
        { name: "dailyPaper", x: 4340, y: 1672, width: 224, height: 44, bgColor: 0x5A716F, bgAlpha: 90, text: "每日新闻", textSize: 22, textColor: 0xF6E2BD },
        { name: "downtown", x: 2372, y: 1714, width: 92, height: 54, bgColor: 0x6F9B2F, bgAlpha: 96, text: "市中心", textSize: 18, textColor: 0xFFFFFF },
        { name: "countyPrison", x: 2360, y: 1818, width: 118, height: 36, bgColor: 0x5E8B3B, bgAlpha: 96, text: "县监狱", textSize: 16, textColor: 0xFFFFFF },
        { name: "tapeUpper", x: 1980, y: 1794, width: 278, height: 20, bgColor: 0xF5D200, bgAlpha: 96, text: "警戒线 禁止跨越", textSize: 13, textColor: 0x000000, rotation: -17 },
        { name: "tapeLower", x: 1670, y: 1884, width: 230, height: 20, bgColor: 0xF5D200, bgAlpha: 96, text: "警戒线 禁止跨越", textSize: 13, textColor: 0x000000, rotation: 15 }
      ]
    }
  ],
  [
    AS2_SUPER_POWER_DOWNTOWN_PATH,
    {
      insertSearch: "function initChars()\n{",
      callSearch: `_root.makeBackground();
_root.makeBackdrop();`,
      callReplacement: `_root.makeBackground();
_root.makeBackdrop();
installZhStaticOverlay();`,
      containerExpression: "bg",
      overlays: [
        { name: "mainStreet", x: 246, y: 1718, width: 96, height: 52, bgColor: 0x6F9B2F, bgAlpha: 96, text: "主街", textSize: 22, textColor: 0xFFFFFF }
      ]
    }
  ]
]);

function applyAs2SuperPowerStaticOverlayPatch(content, assetPath) {
  const config = AS2_SUPER_POWER_SCENE_OVERLAY_CONFIGS.get(assetPath);
  if (!config) {
    return normalizeScriptContent(content);
  }

  let nextContent = normalizeScriptContent(content);
  const hasInsertAnchor = nextContent.includes(config.insertSearch);
  const hasCallAnchor = nextContent.includes(config.callSearch);
  if (!hasInsertAnchor && !hasCallAnchor) {
    return nextContent;
  }
  const hasHelper = nextContent.includes("function installZhStaticOverlay()");
  if (hasInsertAnchor && !hasHelper) {
    nextContent = replaceRequiredSnippet(
      nextContent,
      config.insertSearch,
      `${renderAs2StaticOverlayHelpers(config.overlays, config.containerExpression)}\n${config.insertSearch}`,
      `${assetPath} static overlay helper insertion`
    );
  }
  if ((hasInsertAnchor || hasHelper) && hasCallAnchor && !nextContent.includes(config.callReplacement)) {
    nextContent = replaceRequiredSnippet(
      nextContent,
      config.callSearch,
      config.callReplacement,
      `${assetPath} static overlay install call`
    );
  }
  return nextContent;
}

const AS2_SUPER_POWER_SCENE_REPLACEMENTS = [
  ["I gave the Island Medallion\nto our hero, Ned Noodlehead!", "我把岛奖章交给了我们的英雄，\n内德·面条头！"],
  ["I think this meteor\nis a nice decoration\nfor the prison.", "我觉得这颗陨石\n很适合当监狱的装饰。"],
  ["It's a good thing those\nvillains are back in prison!", "那些坏蛋又回监狱了，\n真是太好了！"],
  ["The meteor's radioactivity\nhas worn off, so it's\nno longer a threat.", "陨石的放射性已经消退，\n不再构成威胁了。"],
  ["Great work!", "干得漂亮！"],
  ["Thanks, You're a real hero!", "谢谢，你是真正的英雄！"],
  ["Looks like the\nisland is safe again!", "看来这座岛\n又安全了！"],
  ["Well done, kid.\nNot bad at all.", "干得不错，小家伙。\n一点也不赖。"],
  ["Remember, with great power\ncomes great responsibility.", "记住，能力越大，\n责任越大。"],
  ["I'm impressed at what you've\naccomplished. I think you've\ngot what it takes, kid.", "你的成就让我印象深刻。\n我觉得你具备所需的一切，\n小家伙。"],
  ["There's just one more thing\nyou need. You'll find\nit in the phone booth.", "你还需要最后一样东西。\n你会在电话亭里找到它。"],
  ["You're clear to go.", "你可以出发了。"],
  ["Oh good, a new super hero!\nThat last one is just sitting\nup on the Daily Paper Building!", "太好了，来了个新超级英雄！\n上一个还坐在《每日新闻》\n大楼顶上呢！"],
  ["The prison warden and the\nscientist have some things\nfor you over at the prison.", "监狱长和科学家在监狱那边\n有些东西要给你。"],
  ["Those handcuffs will remove\nany villain's super power.", "这副手铐能消除任何反派的\n超能力。"],
  ["The rest is up to you.\nGood luck.", "剩下的就靠你了。\n祝你好运。"],
  ["The villains are all\nback behind bars,\nthanks to Ned Noodlehead\n...oh, and you.", "多亏了内德·面条头……\n哦，还有你，所有反派都\n重回牢笼了。"],
  ["Thanks for your help! That\nCopy Cat was a real trickster.", "谢谢你的帮助！\n那个模仿猫真是个狡猾的家伙。"],
  ["Looks like Speeding Spike\nwasn't fast enough\nto outrun you!", "看来疾速斯派克\n还是没你快！"],
  ["Sir Rebral won't be\nplaying any more of\nhis mind games now!", "瑞布拉尔爵士再也不能玩\n他的心理游戏了！"],
  ["Thanks to you, the\nRatman is caged again!", "多亏了你，鼠人又被\n关起来了！"],
  ["Excellent work! Now\nCrusher's back in his\nold stomping grounds.", "干得漂亮！现在粉碎者\n又回到他的老地盘了。"],
  ["Betty Jetty has finally been\ngrounded, thanks to you!", "多亏了你，贝蒂·杰蒂\n终于被禁足了！"],
  ["Be careful out there!", "在外面要小心！"],
  ["There's been a prison break!\nWe're all in danger!", "监狱发生越狱了！\n我们都有危险！"],
  ["This isn't a safe\nplace for civilians.", "这里对平民来说\n并不安全。"],
  ["We can't let civilians\npast this point. There are\nsuper villains on the loose!", "我们不能让平民通过这里。\n有超级反派在逃！"],
  ["Be careful, there are\nescaped prisoners around!", "小心，附近有\n逃犯出没！"],
  ["Civilians aren't allowed here.\nPlease head back to the mainland.", "平民不得入内。\n请返回大陆。"],
  ["Stand back! This\nthing isn't safe.", "退后！这东西\n不安全。"],
  ["Who are you?", "你是谁？"],
  ["I'm the prison warden.", "我是监狱长。"],
  ["What happened here?", "这里发生了什么？"],
  ["A meteor hit the\nprison and the\nconvicts have escaped!", "有颗陨石砸中了监狱，\n囚犯们全都逃走了！"],
  ["Tell me more about\nthe escaped prisoners.", "再跟我说说\n那些逃犯吧。"],
  ["Here are their\nprofile reports.", "这是他们的\n档案报告。"],
  ["The impact from this meteor\nsent out a radioactive shockwave\nthat mutated the prisoners.", "这颗陨石的撞击释放出\n放射性冲击波，让囚犯们\n发生了变异。"],
  ["So the prisoners\nhave super powers?", "所以那些囚犯\n都有超能力吗？"],
  ["Yes! You'll need these\nanti-power handcuffs\nto capture them.", "没错！你需要这些\n反超能手铐才能\n抓住他们。"],
  ["Are you a real\nsuper hero?", "你是真正的\n超级英雄吗？"],
  ["You better believe it, kid.\nI've defeated more villains\nthan you can count.", "你最好相信，小子。\n我打败的反派比你数过的\n还多。"],
  ["What are you\ndoing up here?", "你在这上面\n做什么？"],
  ["I can't keep up with all\nthese super villains anymore!", "我实在应付不了这么多\n超级反派了！"],
  ["I want to be\na super hero!", "我也想成为\n超级英雄！"],
  ["There's more to it than\nhaving a suit and ID!\nTalk to me after you've\ndefeated at least 5 villains.", "光有制服和证件可不够！\n等你打败至少5个反派\n再来找我。"],
  ['labelText = "TRAVEL";', 'labelText = "旅行";'],
  ['labelText = "ENTER";', 'labelText = "进入";'],
  ['labelText = "GO RIGHT";', 'labelText = "向右";'],
  ['labelText = "GO LEFT";', 'labelText = "向左";'],
  ['labelText = "GO DOWN";', 'labelText = "向下";'],
  ['labelText = "GO UP";', 'labelText = "向上";'],
  ['labelText = "COMMON ROOM";', 'labelText = "公共休息室";'],
  ['desc = ["Costume",426,380];', 'desc = ["服装店",426,380];'],
  ['desc = ["Comic",741,400];', 'desc = ["漫画店",741,400];'],
  ['desc = ["News",642,1050];', 'desc = ["新闻社",642,1050];'],
  ['desc = ["Bank",1295,1220];', 'desc = ["银行",1295,1220];'],
  ['desc = ["Station",234,102];', 'desc = ["车站",234,102];'],
  ['desc = ["Skyscraper",836,3052];', 'desc = ["摩天楼",836,3052];'],
  ['desc = ["Skyscraper",1204,3052];', 'desc = ["摩天楼",1204,3052];']
];

function exportSwfScriptsForPatch({ ffdecCli, inputSwf, outputDir }) {
  removeDirContents(outputDir);
  ensureDirSync(outputDir);
  return runFfdecCommand(ffdecCli, ["-cli", "-export", "script", outputDir, inputSwf]);
}

function extractZipEntryToTemp({ archivePath, entryName, outputDir, tarBin }) {
  removeDirContents(outputDir);
  ensureDirSync(outputDir);
  const result = spawnSync(tarBin || "tar", ["-xf", archivePath, "-C", outputDir, entryName], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || `Failed to extract ${entryName}`).trim()
    };
  }
  return { ok: true };
}

function applyAs2SuperPowerSceneValidationPatch({ sourceScriptRoot, translatedScriptRoot, assetPath }) {
  const scriptEntries = collectSwfScriptFiles(sourceScriptRoot);
  let changed = false;
  for (const entry of scriptEntries) {
    const originalContent = fs.readFileSync(entry.filePath, "utf8");
    const patchedContent = applyAs2SuperPowerStaticOverlayPatch(
      applyLiteralStringReplacements(originalContent, AS2_SUPER_POWER_SCENE_REPLACEMENTS),
      assetPath
    );
    if (patchedContent === normalizeScriptContent(originalContent)) {
      continue;
    }
    const targetFile = path.join(translatedScriptRoot, entry.exportPath.replace(/\//gu, path.sep));
    ensureDirSync(path.dirname(targetFile));
    writeText(targetFile, patchedContent);
    changed = true;
  }
  return { ok: true, changed };
}

function applyAs2GameplayShowSayScriptPatch(content) {
  let nextContent = normalizeScriptContent(content);
  if (!nextContent.includes("function decodeZhSayText(")) {
    nextContent = replaceRequiredSnippet(
      nextContent,
      "function showSay(target, sayText, id)\n{",
      `function decodeZhSayText(rawText)
{
   var _loc2_;
   _loc2_ = rawText == undefined || rawText == null ? "" : String(rawText);
   if(_root.decodeZhBalloonText != undefined)
   {
      _loc2_ = _root.decodeZhBalloonText(_loc2_);
   }
   return _loc2_;
}
function normalizeZhSayField(fieldRef)
{
   var fmt;
   if(fieldRef == undefined)
   {
      return undefined;
   }
   fieldRef.embedFonts = false;
   fieldRef.selectable = false;
   fieldRef.multiline = true;
   fieldRef.wordWrap = true;
   fieldRef.autoSize = false;
   fieldRef._width = 188;
   fieldRef._height = 72;
   fieldRef._x = -94;
   fieldRef._y = -34;
   if(fieldRef.__zhFmt == undefined)
   {
      fmt = new TextFormat();
      fmt.font = "_sans";
      fmt.size = 16;
      fmt.color = 0;
      fmt.leading = 2;
      fmt.align = "center";
      fieldRef.setNewTextFormat(fmt);
      fieldRef.__zhFmt = fmt;
   }
   if(fieldRef.__zhFmt != undefined)
   {
      fieldRef.setTextFormat(fieldRef.__zhFmt);
   }
}
function setZhTextFieldValue(fieldRef, rawText)
{
   var _loc2_;
   normalizeZhSayField(fieldRef);
   if(fieldRef == undefined)
   {
      return "";
   }
   _loc2_ = decodeZhSayText(rawText);
   fieldRef.text = _loc2_;
   if(fieldRef.__zhFmt != undefined)
   {
      fieldRef.setTextFormat(fieldRef.__zhFmt);
   }
   fieldRef._height = Math.max(36,Math.min(86,fieldRef.textHeight + 8));
   return _loc2_;
}
function showSay(target, sayText, id)
{`,
      "gameplay showSay helper insertion"
    );
  }

  nextContent = replaceRequiredSnippet(
    nextContent,
    "   positionChat(say,target);\n   say.fld.htmlText = sayText;",
    `   positionChat(say,target);
   sayText = setZhTextFieldValue(say.fld,sayText);
   say.sizeBubbles();
   positionChat(say,target);`,
    "gameplay showSay text assignment patch"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    "   if(camera.scene.char.targetPlayer.isAd)\n   {",
    `   if(camera.scene.char.targetPlayer != undefined && camera.scene.char.targetPlayer.isAd)
   {`,
    "gameplay targetPlayer isAd guard"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `   say = this.attachMovie(sayClip,"say" + sayDepth,sayDepth);
   if(camera.scene.char.targetPlayer.isAd)
   {
      say.adText._visible = true;
   }
   else
   {
      say.adText._visible = false;
   }
   positionChat(say,target);`,
    `   say = this.attachMovie(sayClip,"say" + sayDepth,sayDepth);
   if(camera.scene.char.targetPlayer != undefined && camera.scene.char.targetPlayer.isAd)
   {
      say.adText._visible = true;
   }
   else
   {
      say.adText._visible = false;
   }
   positionChat(say,target);`,
    "gameplay showSay isAd guard"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    "         if(!camera.scene.red5 || camera.scene.char.targetPlayer.npc == true)\n         {",
    `         if(!camera.scene.red5 || camera.scene.char.targetPlayer == undefined || camera.scene.char.targetPlayer.npc == true)
         {`,
    "gameplay targetPlayer npc guard"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    "            else if(camera.scene.char.targetPlayer.interaction == \"chat\")\n            {",
    `            else if(camera.scene.char.targetPlayer != undefined && camera.scene.char.targetPlayer.interaction == "chat")
            {`,
    "gameplay targetPlayer interaction guard"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `function hideSay(target)
{
   this["say" + target.sayDepth].onEnterFrame = shrinkSay;
   target.talking = false;
   target.avatar.head.mouth.gotoAndStop(target.avatar.mouthFrame);
   target.avatar.head.eyes.pupils.gotoAndStop(1);
   target.engaged = false;
   target.targeted = false;
}`,
    `function hideSay(target)
{
   if(target == undefined || target.sayDepth == undefined || this["say" + target.sayDepth] == undefined)
   {
      return undefined;
   }
   this["say" + target.sayDepth].onEnterFrame = shrinkSay;
   target.talking = false;
   target.avatar.head.mouth.gotoAndStop(target.avatar.mouthFrame);
   target.avatar.head.eyes.pupils.gotoAndStop(1);
   target.engaged = false;
   target.targeted = false;
}`,
    "gameplay hideSay guard patch"
  );

  return nextContent;
}

function applyAs2CharBalloonScriptPatch(content) {
  let nextContent = normalizeScriptContent(content);
  if (!nextContent.includes("function decodeZhBalloonText(")) {
    nextContent = replaceRequiredSnippet(
      nextContent,
      "function showBalloon(balloonFrame, ball)\n{",
      `function decodeZhBalloonText(rawText)
{
   if(rawText == undefined || rawText == null)
   {
      return "";
   }
   var _loc2_ = String(rawText);
   if(_loc2_.indexOf("%u") >= 0)
   {
      return unescape(_loc2_);
   }
   var _loc3_ = _loc2_.split(" ").join("");
   _loc3_ = _loc3_.split("\\r").join("");
   _loc3_ = _loc3_.split("\\n").join("");
   if(_loc3_.length >= 4 && _loc3_.length % 4 == 0)
   {
      var _loc4_ = "0123456789ABCDEFabcdef";
      var _loc5_ = true;
      var _loc6_ = 0;
      while(_loc6_ < _loc3_.length)
      {
         if(_loc4_.indexOf(_loc3_.charAt(_loc6_)) < 0)
         {
            _loc5_ = false;
            break;
         }
         _loc6_ += 1;
      }
      if(_loc5_)
      {
         var _loc7_ = "";
         _loc6_ = 0;
         while(_loc6_ < _loc3_.length)
         {
            _loc7_ += String.fromCharCode(parseInt(_loc3_.substr(_loc6_,4),16));
            _loc6_ += 4;
         }
         return _loc7_;
      }
   }
   return _loc2_;
}
function showBalloon(balloonFrame, ball)
{`,
      "decodeZhBalloonText insertion"
    );
  }

  nextContent = replaceRequiredSnippet(
    nextContent,
    `      balloon = _parent.createEmptyMovieClip(balloonName,_parent.balloonDepth);
      _loc5_ = new MovieClipLoader();`,
    `      balloon = _parent.createEmptyMovieClip(balloonName,_parent.balloonDepth);
      if(char.talkyText != undefined)
      {
         char.talkyText = decodeZhBalloonText(char.talkyText);
      }
      _loc5_ = new MovieClipLoader();`,
    "showBalloon text decode injection"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `      _loc5_.loadClip("popups/balloon.swf",balloon);`,
    `      _loc5_.loadClip("popups/balloon.swf?zhfix=sp2",balloon);`,
    "showBalloon patched balloon path"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `function hideBalloon()
{
   this.balloon.string.removeMovieClip();
   this.balloon.removeMovieClip();
}`,
    `function hideBalloon()
{
   if(this.balloon == undefined)
   {
      return undefined;
   }
   if(this.balloon.string != undefined && this.balloon.string.removeMovieClip != undefined)
   {
      this.balloon.string.removeMovieClip();
   }
   if(this.balloon.label != undefined && this.balloon.label.removeTextField != undefined)
   {
      this.balloon.label.removeTextField();
   }
   if(this.balloon.removeMovieClip != undefined)
   {
      this.balloon.removeMovieClip();
   }
}`,
    "hideBalloon guard patch"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `   balloon = _parent.createEmptyMovieClip(balloonName,_parent.getNextHighestDepth());
   var _loc4_ = new MovieClipLoader();`,
    `   balloon = _parent.createEmptyMovieClip(balloonName,_parent.getNextHighestDepth());
   if(char.talkyText != undefined)
   {
      char.talkyText = decodeZhBalloonText(char.talkyText);
   }
   var _loc4_ = new MovieClipLoader();`,
    "showCounterBalloon text decode injection"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `   _loc4_.loadClip("popups/counter/balloon.swf",balloon);`,
    `   _loc4_.loadClip("popups/counter/balloon.swf?zhfix=sp2",balloon);`,
    "showCounterBalloon patched balloon path"
  );
  return nextContent;
}

const AS2_GAMEPLAY_SAY_CLIP_FRAME1_SCRIPT = `function ensureZhField()
{
   var fmt;
   fld.embedFonts = false;
   fld.selectable = false;
   fld.multiline = true;
   fld.wordWrap = true;
   fld.autoSize = false;
   fld._width = 188;
   fld._height = 72;
   fld._x = -94;
   fld._y = -34;
   fmt = new TextFormat();
   fmt.font = "_sans";
   fmt.size = 16;
   fmt.color = 0;
   fmt.leading = 2;
   fmt.align = "center";
   fld.setNewTextFormat(fmt);
   fld.setTextFormat(fmt);
   fld.__zhFmt = fmt;
}
function sizeBubbles()
{
   fld._height = Math.max(36,Math.min(86,fld.textHeight + 8));
   txtBox._x = fld._x + fld._width / 2;
   txtBox._y = fld._y + fld._height / 2;
   txtBox._width = fld._width + padding * 2;
   txtBox._height = fld._height + padding * 2;
   clipHeight = txtBox._height;
}
padding = 10;
clipHeight = txtBox._height;
ensureZhField();
sizeBubbles();`;

const AS2_GAMEPLAY_CHAT_FRAME1_SCRIPT = `function ensureZhField(fieldRef)
{
   var fmt;
   fieldRef.embedFonts = false;
   fieldRef.selectable = false;
   fieldRef.multiline = true;
   fieldRef.wordWrap = true;
   fieldRef.autoSize = "center";
   fmt = new TextFormat();
   fmt.font = "_sans";
   fmt.size = 16;
   fmt.color = 0;
   fmt.leading = 2;
   fieldRef.setNewTextFormat(fmt);
   fieldRef.setTextFormat(fmt);
   fieldRef.__zhFmt = fmt;
}
stop();
clipHeight = 36;
ensureZhField(fld1);
ensureZhField(fld2);
ensureZhField(fld3);`;

const AS2_COUNTER_BALLOON_FRAME1_SCRIPT = `function decodeBalloonText(rawText)
{
   var textValue;
   if(rawText == undefined || rawText == null)
   {
      return "";
   }
   textValue = String(rawText);
   if(char != undefined && char.decodeZhBalloonText != undefined)
   {
      textValue = char.decodeZhBalloonText(textValue);
   }
   return textValue;
}
function ensureBalloonLabel()
{
   var fmt;
   if(label == undefined)
   {
      createTextField("label",3,0,0,220,96);
      label.multiline = true;
      label.wordWrap = true;
      label.selectable = false;
      label.embedFonts = false;
      fmt = new TextFormat();
      fmt.font = "_sans";
      fmt.size = 18;
      fmt.bold = true;
      fmt.leading = 2;
      fmt.align = "center";
      fmt.color = 0;
      label.setNewTextFormat(fmt);
      label.__fmt = fmt;
   }
}
function layoutBalloonLabel()
{
   var bounds;
   var widthValue;
   var heightValue;
   var textValue;
   ensureBalloonLabel();
   bounds = shape.getBounds(this);
   if(bounds.xMax <= bounds.xMin || bounds.yMax <= bounds.yMin)
   {
      label._x = -110;
      label._y = -78;
      label._width = 220;
      label._height = 96;
   }
   else
   {
      widthValue = Math.max(96,bounds.xMax - bounds.xMin - 30);
      heightValue = Math.max(32,bounds.yMax - bounds.yMin - 42);
      label._x = bounds.xMin + Math.max(12,Math.round((bounds.xMax - bounds.xMin - widthValue) / 2));
      label._y = bounds.yMin + 12;
      label._width = widthValue;
      label._height = heightValue;
   }
   textValue = char != undefined ? decodeBalloonText(char.talkyText) : "";
   if(label.__textValue != textValue)
   {
      label.text = textValue;
      label.setTextFormat(label.__fmt);
      label.__textValue = textValue;
   }
}
function init()
{
   speed = 0.8;
   t = 0;
   this._x = char._x;
   this._y = char._y - 160;
   vx = 0;
   vy = 0;
   ax = 0;
   ay = 0;
   damp = 0.85;
   r = 130;
   avatarScale = 0.36;
   stringName = char._name + "BalloonString";
   string = scene.createEmptyMovieClip(stringName,scene.getNextHighestDepth());
   ensureBalloonLabel();
   onEnterFrame = function()
   {
      dir = Math.abs(char._xscale) / char._xscale;
      scaleMag = char._yscale / 100;
      if(!char.speed)
      {
         char.speed = 0;
      }
      if(!char.vSpeed)
      {
         char.vSpeed = 0;
      }
      tx = char._x + scaleMag * (dir * char.avatar._x + dir * avatarScale * char.avatar.hand1._x) + char.speed;
      ty = char._y + scaleMag * (char.avatar._y + avatarScale * char.avatar.hand1._y) + char.vSpeed;
      dx = tx - this._x;
      dy = ty - r - this._y;
      ax = dx / 40;
      ay = dy / 40;
      vx += ax;
      vy += ay;
      vx *= damp;
      vy *= damp;
      this._x += vx;
      this._y += vy;
      speed = Math.sqrt(vx * vx + vy * vy);
      this._rotation += (-1.5 * vx - this._rotation) / 4;
      string.clear();
      string.lineStyle(1,16777215);
      string.moveTo(tx,ty);
      string.lineTo(this._x,this._y);
      layoutBalloonLabel();
      if(char == undefined || !char.avatar)
      {
         if(string != undefined)
         {
            string.removeMovieClip();
         }
         this.removeMovieClip();
      }
      if(char._visible && !_parent.pausedGame && dy > -100)
      {
         char.vSpeed -= 1.3;
      }
   };
   if(char == scene.char)
   {
      shape.onRollOver = _root.useArrow;
      shape.onRelease = function()
      {
         delete _root.char.avatar.FunBrain_so.data.counterBalloonFrame;
         delete _root.camera.scene.lastBalloon;
         delete onEnterFrame;
         nextFrame();
      };
   }
}
stop();
scene = this._parent;
avatarScale = 0.36;
onEnterFrame = function()
{
   if(_root.sceneIsVisible && char != undefined)
   {
      init();
   }
};`;

function buildAs2SuperPowerSharedAssets({ config, outputDir, manifest, islandIds }) {
  const scopedIslandIds = Array.isArray(islandIds) ? islandIds : [];
  if (scopedIslandIds.length > 0 && !scopedIslandIds.includes("super-power")) {
    return;
  }

  const sourceZip = config.sources?.as2Gamezip;
  const ffdecCli = config.tools?.ffdecCli;
  if (!sourceZip || !fileExists(sourceZip)) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:shared-assets",
      assetPath: AS2_SUPER_POWER_SHARED_CHAR_PATH,
      reason: "AS2 source zip is not configured"
    });
    return;
  }
  if (!ffdecCli || !fileExists(ffdecCli)) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:shared-assets",
      assetPath: AS2_SUPER_POWER_SHARED_CHAR_PATH,
      reason: "FFDec CLI is not configured"
    });
    return;
  }

  const sharedTempRoot = path.join(paths.tempDir, "as2-super-power-shared");
  removeDirContents(sharedTempRoot);
  ensureDirSync(sharedTempRoot);

  const gameplayExtractRoot = path.join(sharedTempRoot, "gameplay-source");
  const gameplayExtract = extractZipEntryToTemp({
    archivePath: sourceZip,
    entryName: AS2_SUPER_POWER_GAMEPLAY_PATH,
    outputDir: gameplayExtractRoot,
    tarBin: config.tools.tarBin
  });
  if (!gameplayExtract.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:gameplay",
      assetPath: AS2_SUPER_POWER_GAMEPLAY_PATH,
      reason: gameplayExtract.error
    });
    return;
  }

  const gameplaySourceSwf = path.join(gameplayExtractRoot, AS2_SUPER_POWER_GAMEPLAY_PATH.replace(/\//gu, path.sep));
  const gameplayScriptRoot = path.join(sharedTempRoot, "gameplay-scripts");
  const gameplayScriptExport = exportSwfScriptsForPatch({
    ffdecCli,
    inputSwf: gameplaySourceSwf,
    outputDir: gameplayScriptRoot
  });
  if (!gameplayScriptExport.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:gameplay",
      assetPath: AS2_SUPER_POWER_GAMEPLAY_PATH,
      reason: gameplayScriptExport.error || "Unable to export gameplay.swf scripts"
    });
    return;
  }

  const gameplayPatchRoot = path.join(sharedTempRoot, "gameplay-patch");
  const gameplayTargetScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: gameplayScriptRoot,
    translatedScriptRoot: gameplayPatchRoot,
    exportPath: path.join("scripts", "frame_1", "DoAction.as")
  });
  writeText(gameplayTargetScript, applyAs2GameplayShowSayScriptPatch(fs.readFileSync(gameplayTargetScript, "utf8")));

  const sayClipTargetScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: gameplayScriptRoot,
    translatedScriptRoot: gameplayPatchRoot,
    exportPath: path.join("scripts", "DefineSprite_78_SayClip", "frame_1", "DoAction.as")
  });
  writeText(sayClipTargetScript, AS2_GAMEPLAY_SAY_CLIP_FRAME1_SCRIPT);

  const peanutsSayClipTargetScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: gameplayScriptRoot,
    translatedScriptRoot: gameplayPatchRoot,
    exportPath: path.join("scripts", "DefineSprite_73_SayClipPeanuts", "frame_1", "DoAction.as")
  });
  writeText(peanutsSayClipTargetScript, AS2_GAMEPLAY_SAY_CLIP_FRAME1_SCRIPT);

  const chatTargetScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: gameplayScriptRoot,
    translatedScriptRoot: gameplayPatchRoot,
    exportPath: path.join("scripts", "DefineSprite_109_Chat", "frame_1", "DoAction.as")
  });
  writeText(chatTargetScript, AS2_GAMEPLAY_CHAT_FRAME1_SCRIPT);

  const gameplayOutputSwf = path.join(outputDir, "swf", AS2_SUPER_POWER_GAMEPLAY_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(gameplayOutputSwf));
  const gameplayReplace = replaceSwfScriptExports({
    ffdecCli,
    inputSwf: gameplaySourceSwf,
    outputSwf: gameplayOutputSwf,
    translatedFiles: collectSwfScriptFiles(gameplayPatchRoot)
  });
  if (!gameplayReplace.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:gameplay",
      assetPath: AS2_SUPER_POWER_GAMEPLAY_PATH,
      reason: gameplayReplace.error || "Unable to rebuild gameplay.swf"
    });
    return;
  }
  manifest.assetsPatched += 1;
  manifest.swfPatchedAssets.push({
    assetId: "super-power:gameplay",
    assetPath: AS2_SUPER_POWER_GAMEPLAY_PATH,
    outputPath: gameplayOutputSwf
  });

  const charExtractRoot = path.join(sharedTempRoot, "char-source");
  const charExtract = extractZipEntryToTemp({
    archivePath: sourceZip,
    entryName: AS2_SUPER_POWER_SHARED_CHAR_PATH,
    outputDir: charExtractRoot,
    tarBin: config.tools.tarBin
  });
  if (!charExtract.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:char",
      assetPath: AS2_SUPER_POWER_SHARED_CHAR_PATH,
      reason: charExtract.error
    });
    return;
  }

  const charSourceSwf = path.join(charExtractRoot, AS2_SUPER_POWER_SHARED_CHAR_PATH.replace(/\//gu, path.sep));
  const charScriptRoot = path.join(sharedTempRoot, "char-scripts");
  const charScriptExport = exportSwfScriptsForPatch({
    ffdecCli,
    inputSwf: charSourceSwf,
    outputDir: charScriptRoot
  });
  if (!charScriptExport.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:char",
      assetPath: AS2_SUPER_POWER_SHARED_CHAR_PATH,
      reason: charScriptExport.error || "Unable to export char.swf scripts"
    });
    return;
  }

  const charPatchRoot = path.join(sharedTempRoot, "char-patch");
  const charTargetScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: charScriptRoot,
    translatedScriptRoot: charPatchRoot,
    exportPath: path.join("scripts", "frame_1", "DoAction.as")
  });
  const charPatchedContent = applyAs2CharBalloonScriptPatch(fs.readFileSync(charTargetScript, "utf8"));
  writeText(charTargetScript, charPatchedContent);

  const charOutputSwf = path.join(outputDir, "swf", AS2_SUPER_POWER_SHARED_CHAR_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(charOutputSwf));
  const charReplace = replaceSwfScriptExports({
    ffdecCli,
    inputSwf: charSourceSwf,
    outputSwf: charOutputSwf,
    translatedFiles: collectSwfScriptFiles(charPatchRoot)
  });
  if (!charReplace.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:char",
      assetPath: AS2_SUPER_POWER_SHARED_CHAR_PATH,
      reason: charReplace.error || "Unable to rebuild char.swf"
    });
    return;
  }
  manifest.assetsPatched += 1;
  manifest.swfPatchedAssets.push({
    assetId: "super-power:char",
    assetPath: AS2_SUPER_POWER_SHARED_CHAR_PATH,
    outputPath: charOutputSwf
  });

  const balloonExtractRoot = path.join(sharedTempRoot, "balloon-source");
  const balloonExtract = extractZipEntryToTemp({
    archivePath: sourceZip,
    entryName: AS2_SUPER_POWER_COUNTER_BALLOON_PATH,
    outputDir: balloonExtractRoot,
    tarBin: config.tools.tarBin
  });
  if (!balloonExtract.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:counter-balloon",
      assetPath: AS2_SUPER_POWER_COUNTER_BALLOON_PATH,
      reason: balloonExtract.error
    });
    return;
  }

  const balloonSourceSwf = path.join(balloonExtractRoot, AS2_SUPER_POWER_COUNTER_BALLOON_PATH.replace(/\//gu, path.sep));
  const balloonPatchRoot = path.join(sharedTempRoot, "balloon-patch");
  const balloonTargetScript = path.join(balloonPatchRoot, "scripts", "frame_1", "DoAction.as");
  ensureDirSync(path.dirname(balloonTargetScript));
  writeText(balloonTargetScript, AS2_COUNTER_BALLOON_FRAME1_SCRIPT);

  const counterBalloonOutputSwf = path.join(outputDir, "swf", AS2_SUPER_POWER_COUNTER_BALLOON_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(counterBalloonOutputSwf));
  const balloonReplace = replaceSwfScriptExports({
    ffdecCli,
    inputSwf: balloonSourceSwf,
    outputSwf: counterBalloonOutputSwf,
    translatedFiles: collectSwfScriptFiles(balloonPatchRoot)
  });
  if (!balloonReplace.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:counter-balloon",
      assetPath: AS2_SUPER_POWER_COUNTER_BALLOON_PATH,
      reason: balloonReplace.error || "Unable to rebuild counter balloon"
    });
    return;
  }
  manifest.assetsPatched += 1;
  manifest.swfPatchedAssets.push({
    assetId: "super-power:counter-balloon",
    assetPath: AS2_SUPER_POWER_COUNTER_BALLOON_PATH,
    outputPath: counterBalloonOutputSwf
  });

  const balloonOutputSwf = path.join(outputDir, "swf", AS2_SUPER_POWER_BALLOON_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(balloonOutputSwf));
  fs.copyFileSync(counterBalloonOutputSwf, balloonOutputSwf);
  manifest.assetsPatched += 1;
  manifest.swfPatchedAssets.push({
    assetId: "super-power:balloon",
    assetPath: AS2_SUPER_POWER_BALLOON_PATH,
    outputPath: balloonOutputSwf
  });

  for (const sceneSpec of [
    { assetId: "super-power:downtown", assetPath: AS2_SUPER_POWER_DOWNTOWN_PATH }
  ]) {
    const sceneExtractRoot = path.join(sharedTempRoot, `${path.basename(sceneSpec.assetPath, ".swf")}-source`);
    const sceneExtract = extractZipEntryToTemp({
      archivePath: sourceZip,
      entryName: sceneSpec.assetPath,
      outputDir: sceneExtractRoot,
      tarBin: config.tools.tarBin
    });
    if (!sceneExtract.ok) {
      manifest.pendingSwfAssets.push({
        assetId: sceneSpec.assetId,
        assetPath: sceneSpec.assetPath,
        reason: sceneExtract.error
      });
      continue;
    }

    const sceneSourceSwf = path.join(sceneExtractRoot, sceneSpec.assetPath.replace(/\//gu, path.sep));
    const existingSceneOutputSwf = path.join(outputDir, "swf", sceneSpec.assetPath.replace(/\//gu, path.sep));
    const sceneBaseSwf = fileExists(existingSceneOutputSwf) ? existingSceneOutputSwf : sceneSourceSwf;
    const sceneScriptRoot = path.join(sharedTempRoot, `${path.basename(sceneSpec.assetPath, ".swf")}-scripts`);
    const sceneScriptExport = exportSwfScriptsForPatch({
      ffdecCli,
      inputSwf: sceneBaseSwf,
      outputDir: sceneScriptRoot
    });
    if (!sceneScriptExport.ok) {
      manifest.pendingSwfAssets.push({
        assetId: sceneSpec.assetId,
        assetPath: sceneSpec.assetPath,
        reason: sceneScriptExport.error || `Unable to export ${path.basename(sceneSpec.assetPath)} scripts`
      });
      continue;
    }

    const scenePatchRoot = path.join(sharedTempRoot, `${path.basename(sceneSpec.assetPath, ".swf")}-patch`);
    const scenePatchResult = applyAs2SuperPowerSceneValidationPatch({
      sourceScriptRoot: sceneScriptRoot,
      translatedScriptRoot: scenePatchRoot,
      assetPath: sceneSpec.assetPath
    });
    if (!scenePatchResult.ok) {
      manifest.pendingSwfAssets.push({
        assetId: sceneSpec.assetId,
        assetPath: sceneSpec.assetPath,
        reason: scenePatchResult.error || `Unable to patch ${path.basename(sceneSpec.assetPath)} scripts`
      });
      continue;
    }

    const sceneOutputSwf = path.join(outputDir, "swf", sceneSpec.assetPath.replace(/\//gu, path.sep));
    ensureDirSync(path.dirname(sceneOutputSwf));
    const sceneReplace = replaceSwfScriptExports({
      ffdecCli,
      inputSwf: sceneBaseSwf,
      outputSwf: sceneOutputSwf,
      translatedFiles: collectSwfScriptFiles(scenePatchRoot)
    });
    if (!sceneReplace.ok) {
      manifest.pendingSwfAssets.push({
        assetId: sceneSpec.assetId,
        assetPath: sceneSpec.assetPath,
        reason: sceneReplace.error || `Unable to rebuild ${path.basename(sceneSpec.assetPath)}`
      });
      continue;
    }
    manifest.assetsPatched += 1;
    manifest.swfPatchedAssets.push({
      assetId: sceneSpec.assetId,
      assetPath: sceneSpec.assetPath,
      outputPath: sceneOutputSwf
    });
  }
}

function buildRuntimeZipForSourceGroup({ config, sourceGroup, manifest }) {
  if (process.env.POPTROPICA_SKIP_RUNTIME_ZIP === "1") {
    manifest.runtimeZip = {
      status: "skipped",
      sourceZip: config.sources[sourceGroup === "as2" ? "as2Gamezip" : "as3Gamezip"] || null,
      runtimeZipPath: getPackPaths(sourceGroup).runtimeZipPath,
      replacementCount: 0
    };
    return manifest.runtimeZip;
  }

  const sourceZip = config.sources[sourceGroup === "as2" ? "as2Gamezip" : "as3Gamezip"];
  if (!sourceZip || !fileExists(sourceZip)) {
    manifest.runtimeZip = {
      status: "missing_source_zip",
      sourceZip: sourceZip || null,
      runtimeZipPath: null
    };
    return manifest.runtimeZip;
  }

  const packPaths = getPackPaths(sourceGroup);
  const sevenZip = findSevenZip(config);
  const includeSwfRuntimeOverrides = sourceGroup === "as2" || process.env.POPTROPICA_ENABLE_SWF_RUNTIME_OVERRIDES === "1";
  const replacements = [];

  if (fileExists(packPaths.filesDir)) {
    for (const filePath of listFilesRecursive(packPaths.filesDir)) {
      const entryName = path.relative(packPaths.filesDir, filePath).replace(/\\/gu, "/");
      if (!shouldIncludeRuntimeFileOverride(entryName)) {
        continue;
      }
      replacements.push({
        entryName,
        sourceFilePath: filePath
      });
    }
  }

  if (fileExists(packPaths.swfDir)) {
    for (const filePath of listFilesRecursive(packPaths.swfDir)) {
      const entryName = path.relative(packPaths.swfDir, filePath).replace(/\\/gu, "/");
      if (!shouldIncludeRuntimeSwfOverride(entryName, includeSwfRuntimeOverrides)) {
        continue;
      }
      replacements.push({
        entryName,
        sourceFilePath: filePath
      });
    }
  }

  if (replacements.length === 0) {
    manifest.runtimeZip = {
      status: "no_runtime_overrides",
      sourceZip,
      runtimeZipPath: null,
      replacementCount: 0
    };
    return manifest.runtimeZip;
  }

  ensureDirSync(paths.patchedZipsDir);
  const metadataPath = `${packPaths.runtimeZipPath}.meta.json`;
  const sourceHash = hashFile(sourceZip);
  const replacementHash = hashReplacementSet(replacements);
  const runtimeMeta = readJson(metadataPath, null);

  const shouldReuse =
    runtimeMeta &&
    runtimeMeta.sourceHash === sourceHash &&
    runtimeMeta.replacementHash === replacementHash &&
    runtimeMeta.runtimeFixVersion === RUNTIME_FIX_VERSION &&
    runtimeMeta.replacementCount === replacements.length &&
    validateZipArchive(sevenZip, packPaths.runtimeZipPath) &&
    fileExists(packPaths.runtimeZipPath);

  if (!shouldReuse) {
    if (!sevenZip) {
      manifest.runtimeZip = {
        status: "missing_7zip",
        sourceZip,
        runtimeZipPath: null,
        replacementCount: replacements.length,
        error: "No 7-Zip executable was found."
      };
      return manifest.runtimeZip;
    }

    const workingDir = path.join(paths.tempDir, `runtime-zip-${sourceGroup}`);
    removeDirContents(workingDir);
    ensureDirSync(workingDir);

    const extractResult = spawnSync(config.tools.tarBin || "tar", ["-xf", sourceZip, "-C", workingDir], {
      encoding: "utf8",
      windowsHide: true
    });
    if (extractResult.status !== 0) {
      manifest.runtimeZip = {
        status: "extract_failed",
        sourceZip,
        runtimeZipPath: null,
        replacementCount: replacements.length,
        error: (extractResult.stderr || extractResult.stdout || "Failed to extract source zip").trim()
      };
      return manifest.runtimeZip;
    }

    for (const replacement of replacements) {
      const targetPath = path.join(workingDir, replacement.entryName.replace(/\//gu, path.sep));
      ensureDirSync(path.dirname(targetPath));
      fs.copyFileSync(replacement.sourceFilePath, targetPath);
    }

    const runtimeFix = patchRuntimeRenderMode(workingDir);

    if (fileExists(packPaths.runtimeZipPath)) {
      fs.rmSync(packPaths.runtimeZipPath, { force: true });
    }

    const createResult = spawnSync(sevenZip, ["a", "-tzip", packPaths.runtimeZipPath, ".\\*", "-mx=1"], {
      cwd: workingDir,
      encoding: "utf8",
      windowsHide: true
    });
    if (createResult.status !== 0) {
      manifest.runtimeZip = {
        status: "patch_failed",
        sourceZip,
        runtimeZipPath: packPaths.runtimeZipPath,
        replacementCount: replacements.length,
        error: (createResult.stderr || createResult.stdout || "Failed to write runtime zip").trim()
      };
      return manifest.runtimeZip;
    }

    writeJson(metadataPath, {
      generatedAt: new Date().toISOString(),
      sourceGroup,
      sourceZip,
      sourceHash,
      replacementHash,
      runtimeFixVersion: RUNTIME_FIX_VERSION,
      runtimeZipPath: packPaths.runtimeZipPath,
      replacementCount: replacements.length,
      runtimeFix
    });
  }

  manifest.runtimeZip = {
    status: shouldReuse ? "reused" : "ready",
    sourceZip,
    runtimeZipPath: packPaths.runtimeZipPath,
    replacementCount: replacements.length,
    swfRuntimeOverrides: includeSwfRuntimeOverrides ? "enabled" : "safe_subset"
  };
  return manifest.runtimeZip;
}

function matchesPackFilter(assetRow, islandIds, assetPatterns) {
  if (islandIds.length === 0 && assetPatterns.length === 0) {
    return true;
  }

  const matchedIsland = islandIds.length > 0 && islandIds.includes(assetRow.island_id || "");
  const assetPath = String(assetRow.asset_path || "");
  const matchedPattern = assetPatterns.length > 0 && assetPatterns.some((pattern) => assetPath.toLowerCase().includes(pattern.toLowerCase()));
  return matchedIsland || matchedPattern;
}

function buildPackForSourceGroup({ db, config, sourceGroup, islandIds = [], assetPatterns = [] }) {
  const { baseDir: outputDir } = getPackPaths(sourceGroup);
  ensureDirSync(outputDir);
  removeDirContents(outputDir);
  ensureDirSync(outputDir);
  fs.writeFileSync(path.join(outputDir, ".gitkeep"), "", "utf8");

  const normalizedIslandIds = islandIds
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const normalizedAssetPatterns = assetPatterns
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const assets = db
    .getAssetsForSourceGroup(sourceGroup)
    .filter((assetRow) => matchesPackFilter(assetRow, normalizedIslandIds, normalizedAssetPatterns));
  const rows = db
    .getStringsForPack(sourceGroup)
    .filter((row) => matchesPackFilter(row, normalizedIslandIds, normalizedAssetPatterns));
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.asset_id)) {
      grouped.set(row.asset_id, []);
    }
    grouped.get(row.asset_id).push(row);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceGroup,
    islandIds: normalizedIslandIds,
    assetPatterns: normalizedAssetPatterns,
    canonicalKeys: [],
    assetsPatched: 0,
    externalTextAssets: [],
    swfPatchedAssets: [],
    pendingSwfAssets: []
  };
  const seenCanonical = new Set();

  for (const assetRow of assets) {
    const assetId = assetRow.asset_id;
    const assetRows = grouped.get(assetId) || [];
    const sample = assetRows[0] || {
      ...assetRow,
      metadata_json: assetRow.metadata_json,
      translated_text: null
    };
    if (sample.island_id) {
      seenCanonical.add(sample.island_id);
    }

    if (!sample.extracted_path || !fileExists(sample.extracted_path)) {
      continue;
    }

    if (sample.asset_type === "swf") {
      if (assetRows.length === 0) {
        continue;
      }

      const metadata = JSON.parse(sample.metadata_json || "{}");
      const ffdecMeta = metadata.ffdec || {};
      if (!ffdecMeta.ok || !config.tools.ffdecCli || !fileExists(config.tools.ffdecCli)) {
        manifest.pendingSwfAssets.push({
          assetId,
          assetPath: sample.asset_path,
          reason: ffdecMeta.error || "FFDec CLI is not configured"
        });
        continue;
      }

      const sourceTextRoot = ffdecMeta.outputDir;
      const translatedTextRoot = path.join(outputDir, "swf-texts", assetId);
      const sourceScriptRoot = ffdecMeta.scriptOutputDir;
      const translatedScriptRoot = path.join(outputDir, "swf-scripts", assetId);
      ensureDirSync(translatedTextRoot);
      ensureDirSync(translatedScriptRoot);
      const fontFilePath = findPreferredSwfFontFile(config);
      const swfPatch = sourceGroup === "as2"
        ? buildPlainSwfTextPatch({
          assetRows,
          sourceTextRoot,
          inputSwf: sample.extracted_path,
          ffdecCli: config.tools.ffdecCli,
          translatedTextRoot
        })
        : buildFormattedSwfTextPatch({
          assetRows,
          inputSwf: sample.extracted_path,
          ffdecCli: config.tools.ffdecCli,
          translatedTextRoot
        });
      if (!swfPatch.ok) {
        manifest.pendingSwfAssets.push({
          assetId,
          assetPath: sample.asset_path,
          reason: swfPatch.error || "FFDec formatted text export failed"
        });
        continue;
      }
      const translatedFiles = swfPatch.translatedFiles || [];
      const translatedScriptFiles = sourceGroup === "as2" && ffdecMeta.scriptExport?.ok && sourceScriptRoot && fileExists(sourceScriptRoot)
        ? buildTranslatedSwfScriptFiles({
          assetRows,
          sourceScriptRoot,
          translatedScriptRoot
        })
        : [];
      if (sourceGroup === "as2" && sample.asset_path === AS2_SUPER_POWER_SCENE_PATH && ffdecMeta.scriptExport?.ok && sourceScriptRoot && fileExists(sourceScriptRoot)) {
        try {
          applyAs2SuperPowerSceneValidationPatch({
            sourceScriptRoot,
            translatedScriptRoot,
            assetPath: sample.asset_path
          });
        } catch (error) {
          manifest.pendingSwfAssets.push({
            assetId,
            assetPath: sample.asset_path,
            reason: error instanceof Error ? error.message : String(error)
          });
          continue;
        }
      }
      const finalTranslatedScriptFiles = collectSwfScriptFiles(translatedScriptRoot);
      if (translatedFiles.length === 0 && finalTranslatedScriptFiles.length === 0) {
        continue;
      }

      const outputSwf = path.join(outputDir, "swf", sample.asset_path);
      ensureDirSync(path.dirname(outputSwf));
      const tempTextOutput = translatedFiles.length > 0 && translatedScriptFiles.length > 0
        ? path.join(paths.tempDir, `swf-text-pass-${Date.now()}-${Math.random().toString(16).slice(2)}.swf`)
        : outputSwf;
      let result = { ok: true };
      let currentInputSwf = sample.extracted_path;
      if (translatedFiles.length > 0) {
        result = replaceSwfTexts({
          ffdecCli: config.tools.ffdecCli,
          inputSwf: sample.extracted_path,
          outputSwf: tempTextOutput,
          translatedFiles,
          fontIds: swfPatch.fontIds,
          fontIdsByExportPath: swfPatch.fontIdsByExportPath || new Map(),
          fontFilePath,
          fallbackFilesByExportPath: swfPatch.formattedFallbackFilesByExportPath || new Map(),
          sequential: sourceGroup === "as2"
        });
        currentInputSwf = tempTextOutput;
      }
      if (result.ok && finalTranslatedScriptFiles.length > 0) {
        result = replaceSwfScriptExports({
          ffdecCli: config.tools.ffdecCli,
          inputSwf: currentInputSwf,
          outputSwf,
          translatedFiles: finalTranslatedScriptFiles
        });
      }
      if (tempTextOutput !== outputSwf && fileExists(tempTextOutput)) {
        fs.rmSync(tempTextOutput, { force: true });
      }
      if (result.ok) {
        manifest.assetsPatched += 1;
        manifest.swfPatchedAssets.push({
          assetId,
          assetPath: sample.asset_path,
          outputPath: outputSwf
        });
      } else {
        manifest.pendingSwfAssets.push({
          assetId,
          assetPath: sample.asset_path,
          reason: result.error || "FFDec replace failed"
        });
      }
      for (const cleanupPath of swfPatch.cleanupPaths || []) {
        if (fileExists(cleanupPath)) {
          removeDirContents(cleanupPath);
          fs.rmSync(cleanupPath, { recursive: true, force: true });
        }
      }
      continue;
    }

    const outputFile = path.join(outputDir, "files", sample.asset_path);
    ensureDirSync(path.dirname(outputFile));
    const originalContent = fs.readFileSync(sample.extracted_path, "utf8");
    const translatedContent = applyFlashSafeTypography(
      sample.asset_path,
      applyStructuredReplacements(originalContent, sample.asset_type, sample.asset_path, assetRows)
    );
    if (translatedContent !== originalContent) {
      writeText(outputFile, translatedContent);
      manifest.assetsPatched += 1;
      manifest.externalTextAssets.push({
        assetId,
        assetPath: sample.asset_path,
        outputPath: outputFile
      });
    }
  }

  manifest.canonicalKeys = [...seenCanonical].sort();

  if (sourceGroup === "as3") {
    const logoOverrides = generateAs3MapLogoOverrides({ config, outputDir });
    for (const result of logoOverrides.results || []) {
      manifest.assetsPatched += 1;
      manifest.swfPatchedAssets.push({
        assetId: `as3-map-logo:${result.folder}`,
        assetPath: `content/www.poptropica.com/game/assets/scenes/map/map/islands/${result.folder}/logo.swf`,
        outputPath: result.outputSwf
      });
    }
    for (const failure of logoOverrides.failures || []) {
      manifest.pendingSwfAssets.push({
        assetId: `as3-map-logo:${failure.folder || "unknown"}`,
        assetPath: failure.sourceSwf || null,
        reason: failure.error || "AS3 map logo override generation failed"
      });
    }
  }

  if (sourceGroup === "as2") {
    buildAs2SuperPowerSharedAssets({
      config,
      outputDir,
      manifest,
      islandIds: normalizedIslandIds
    });
  }

  buildRuntimeZipForSourceGroup({ config, sourceGroup, manifest });
  writeJson(path.join(outputDir, "manifest.json"), manifest);
  db.setPackOutput(sourceGroup, manifest);
  return manifest;
}

module.exports = {
  buildPackForSourceGroup,
  buildRuntimeZipForSourceGroup
};
