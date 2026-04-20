const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { XMLParser } = require("fast-xml-parser");
const { buildCatalogIndex } = require("./catalog");
const { ensureDirSync, fileExists, hashFile, hashString, listFilesRecursive, removeDirContents } = require("./fs-utils");
const { buildGenericKey, buildStringKey, looksTranslatable, normalizeSourceText } = require("./text-utils");

const archiveCandidateExtensions = new Set([".xml", ".json", ".html", ".htm", ".txt", ".php", ".swf"]);
const directoryCandidateExtensions = new Set([".xml", ".json", ".html", ".htm", ".txt", ".php", ".swf"]);

const includePathPatterns = [
  /content\.json$/iu,
  /get_inventory_menu\.php$/iu,
  /photos\/get_scene_photos\.php$/iu,
  /\/game\/index\.html$/iu,
  /\/game\/ShellLoader\.swf$/iu,
  /\/game\/Shell\.swf$/iu,
  /\/game\/style\/styles\.xml$/iu,
  /\/game\/data\/languages\//iu,
  /\/framework\/data\//iu,
  /\/flashpoint\/memStatus\.swf$/iu,
  /\/framework\.swf$/iu,
  /\/scenes\//iu,
  /\/popups\//iu,
  /\/game\/data\/scenes\//iu,
  /\/game\/assets\/scenes\//iu,
  /\/game\/assets\/ui\//iu,
  /\/flashpoint\/originalFiles\/scenes\//iu,
  /\/flashpoint\/originalFiles\/popups\//iu,
  /\/flashpoint\/originals\/game\/data\/scenes\//iu,
  /\/flashpoint\/originals\/game\/assets\/scenes\//iu,
  /\/flashpoint\/originals\/game\/assets\/ui\//iu,
  /\/flashpoint\/originals\/scenes\//iu,
  /\/flashpoint\/originals\/popups\//iu
];

const excludePathPatterns = [
  /\/avatarParts\//iu,
  /\/game\/assets\/entity\/character\//iu,
  /\/images\//iu,
  /\/AMFPHP\//iu
];

const lowValueSwfPatterns = [
  /\/(background|backdrop|foreground)(?:_live)?\.swf$/iu
];

const prioritySwfIncludePatterns = [
  /\/game\/ShellLoader\.swf$/iu,
  /\/game\/Shell\.swf$/iu,
  /\/flashpoint\/memStatus\.swf$/iu,
  /\/framework\.swf$/iu,
  /\/game\/assets\/scenes\/start\//iu,
  /\/game\/assets\/ui\/login\//iu,
  /\/(dialog|popup|objective|journal|tutorial|quest|menu|login|start|logo|slide|title|medallion|icon)\.swf$/iu,
  /\/(blueButton|greenButton|profileButton|changeAll|changeColors|importLook|male|female|profile|startScreen|displayButton|tab)\.swf$/iu,
  /\/scenes\/island[^/]+\/scene[A-Za-z0-9]+\.swf$/iu,
  /\/(mainStreet|Mainstreet|MainStreet|commonRoom|common|town|landing|beach|center|lobby|intro|outro|main|hall|yard|store|shop|museum|school|house|office|lab|cave|forest|woods|temple|maze|arena|theater|alley|reef|spacePort|bazaar|crashLanding)\//iu,
  /\/(mainStreet|Mainstreet|MainStreet|commonRoom|common|town|landing|beach|center|lobby|intro|outro|main|hall|yard|store|shop|museum|school|house|office|lab|cave|forest|woods|temple|maze|arena|theater|alley|reef|spacePort|bazaar|crashLanding)\.swf$/iu
];

function detectAssetType(assetPath) {
  return path.extname(assetPath).toLowerCase().replace(/^\./u, "");
}

function matchesAssetPatterns(assetPath, assetPatterns = []) {
  if (!assetPatterns || assetPatterns.length === 0) {
    return true;
  }
  const normalized = assetPath.replace(/\\/gu, "/").toLowerCase();
  return assetPatterns.some((pattern) => normalized.includes(String(pattern || "").toLowerCase()));
}

function shouldIncludeAssetPath(assetPath, assetPatterns = []) {
  const normalized = assetPath.replace(/\\/gu, "/");
  if (excludePathPatterns.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return includePathPatterns.some((pattern) => pattern.test(normalized)) && matchesAssetPatterns(normalized, assetPatterns);
}

function shouldProcessSwf(assetPath, swfProfile = "priority") {
  const normalized = assetPath.replace(/\\/gu, "/");
  if (swfProfile === "full") {
    return true;
  }
  if (lowValueSwfPatterns.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return prioritySwfIncludePatterns.some((pattern) => pattern.test(normalized));
}

function inferIslandId(assetPath) {
  const input = assetPath.toLowerCase();
  const normalizedInput = input.replace(/[^a-z0-9]+/gu, "");
  const { entries } = buildCatalogIndex();
  for (const entry of entries) {
    const rawLaunchId = String(entry.launchId || "");
    const launchId = rawLaunchId.toLowerCase();
    if (launchId && input.includes(launchId)) {
      return entry.canonicalKey;
    }
    const slug = entry.canonicalKey.replace(/[^a-z0-9]+/gu, "-");
    if (input.includes(slug)) {
      return entry.canonicalKey;
    }
    const compactSlug = slug.replace(/-/gu, "");
    if (compactSlug && normalizedInput.includes(compactSlug)) {
      return entry.canonicalKey;
    }

    if (launchId) {
      const compactLaunchId = launchId.replace(/[^a-z0-9]+/gu, "");
      if (compactLaunchId && normalizedInput.includes(compactLaunchId)) {
        return entry.canonicalKey;
      }

      const camelParts = rawLaunchId
        .match(/[A-Z]?[a-z]+|[0-9]+/gu)
        ?.map((item) => item.toLowerCase()) || [];
      let cumulative = "";
      for (const part of camelParts) {
        cumulative += part;
        if (cumulative.length >= 4 && normalizedInput.includes(cumulative)) {
          return entry.canonicalKey;
        }
        if (part.length >= 4 && normalizedInput.includes(part)) {
          return entry.canonicalKey;
        }
      }
    }
  }
  return null;
}

function extractStringsFromJson(raw) {
  const results = [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return results;
  }

  function walk(node, currentPath) {
    if (typeof node === "string") {
      const normalized = normalizeSourceText(node);
      if (looksTranslatable(normalized)) {
        results.push({
          contextKey: currentPath.join(".") || "$",
          context: { kind: "json", path: currentPath },
          sourceText: normalized
        });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((value, index) => walk(value, [...currentPath, String(index)]));
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        walk(value, [...currentPath, key]);
      }
    }
  }

  walk(parsed, []);
  return results;
}

function extractStringsFromXml(raw) {
  const results = [];
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: false
  });
  let parsed;
  try {
    parsed = parser.parse(raw);
  } catch (error) {
    return results;
  }

  function walk(node, currentPath) {
    if (typeof node === "string") {
      const normalized = normalizeSourceText(node);
      if (looksTranslatable(normalized)) {
        results.push({
          contextKey: currentPath.join("/") || "/",
          context: { kind: "xml-text", path: currentPath },
          sourceText: normalized
        });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((value, index) => walk(value, [...currentPath, `[${index}]`]));
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (key.startsWith("@_")) {
          const normalized = normalizeSourceText(value);
          if (looksTranslatable(normalized)) {
            results.push({
              contextKey: [...currentPath, key].join("/"),
              context: { kind: "xml-attr", path: currentPath, attr: key.slice(2) },
              sourceText: normalized
            });
          }
          continue;
        }
        walk(value, [...currentPath, key]);
      }
    }
  }

  walk(parsed, []);
  return results;
}

function extractStringsFromHtml(raw) {
  const results = [];
  const sanitized = raw
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ");

  let index = 0;
  for (const match of sanitized.matchAll(/>([^<>]+)</gu)) {
    const normalized = normalizeSourceText(match[1]);
    if (!looksTranslatable(normalized)) {
      continue;
    }
    results.push({
      contextKey: `html-text-${index}`,
      context: { kind: "html-text", index },
      sourceText: normalized
    });
    index += 1;
  }
  return results;
}

function extractStringsFromTxt(raw) {
  const results = [];
  raw.split(/\r?\n/u).forEach((line, index) => {
    const normalized = normalizeSourceText(line);
    if (!looksTranslatable(normalized)) {
      return;
    }
    results.push({
      contextKey: `line-${index + 1}`,
      context: { kind: "line", lineNumber: index + 1 },
      sourceText: normalized
    });
  });
  return results;
}

function unescapePhpString(text) {
  return String(text || "")
    .replace(/\\\\/gu, "\\")
    .replace(/\\'/gu, "'")
    .replace(/\\"/gu, '"');
}

function escapePhpString(text, quote) {
  return String(text || "")
    .replace(/\\/gu, "\\\\")
    .replace(new RegExp(escapeForRegExp(quote), "gu"), `\\${quote}`);
}

function escapeForRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function extractStringsFromPhp(raw) {
  const results = [];
  let index = 0;

  for (const match of raw.matchAll(/=>\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1/gu)) {
    const quote = match[1];
    const escapedValue = match[2];
    const normalized = normalizeSourceText(unescapePhpString(escapedValue));
    if (!looksTranslatable(normalized)) {
      continue;
    }
    const quoteStart = String(match[0]).indexOf(quote);
    const valueStart = Number(match.index) + quoteStart + 1;
    const valueEnd = valueStart + escapedValue.length;
    results.push({
      contextKey: `php-value-${index}`,
      context: { kind: "php-value", index, quote, valueStart, valueEnd },
      sourceText: normalized
    });
    index += 1;
  }

  return results;
}

function extractStringsFromContent(assetType, raw) {
  switch (assetType) {
    case "json":
      return extractStringsFromJson(raw);
    case "xml":
      return extractStringsFromXml(raw);
    case "html":
    case "htm":
      return extractStringsFromHtml(raw);
    case "txt":
      return extractStringsFromTxt(raw);
    case "php":
      return extractStringsFromPhp(raw);
    default:
      return [];
  }
}

function isStylesAsset(assetPath) {
  return /\/game\/style\/styles\.xml$/iu.test(String(assetPath || "").replace(/\\/gu, "/"));
}

function listArchiveEntries(archivePath, tarBin) {
  const result = spawnSync(tarBin, ["-tf", archivePath], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0) {
    throw new Error(`Failed to list archive: ${archivePath}`);
  }
  return result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function extractArchiveEntries(archivePath, _entries, outputDir, tarBin) {
  ensureDirSync(outputDir);
  const result = spawnSync(tarBin, ["-xf", archivePath, "-C", outputDir], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 32
  });
  if (result.status !== 0) {
    throw new Error(`Failed to extract entries from ${archivePath}`);
  }
}

function exportSwfTexts(swfPath, outputDir, ffdecCli) {
  ensureDirSync(outputDir);
  removeDirContents(outputDir);
  const result = spawnSync(ffdecCli, ["-cli", "-format", "text:plain", "-export", "text", outputDir, swfPath], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || "FFDec export failed").trim()
    };
  }
  return {
    ok: true,
    outputDir
  };
}

function exportSwfScripts(swfPath, outputDir, ffdecCli) {
  ensureDirSync(outputDir);
  removeDirContents(outputDir);
  const result = spawnSync(ffdecCli, ["-cli", "-export", "script", outputDir, swfPath], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || "FFDec script export failed").trim()
    };
  }
  return {
    ok: true,
    outputDir
  };
}

function buildAssetId(sourceGroup, containerPath, assetPath) {
  return hashString(`${sourceGroup}::${containerPath}::${assetPath}`);
}

function buildStringRows(asset, extractedRows) {
  return extractedRows.map((row) => ({
    stringKey: buildStringKey(asset.assetId, row.contextKey, row.sourceText),
    sourceGroup: asset.sourceGroup,
    islandId: asset.islandId,
    genericKey: buildGenericKey(row.sourceText),
    sourceText: row.sourceText,
    contextKey: row.contextKey,
    context: row.context
  }));
}

function extractSwfStringRows(textRoot, asset) {
  const rows = [];
  for (const filePath of listFilesRecursive(textRoot, { includeExtensions: new Set([".txt"]) })) {
    const rel = path.relative(textRoot, filePath);
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      const normalized = normalizeSourceText(line);
      if (!looksTranslatable(normalized)) {
        return;
      }
      rows.push({
        contextKey: `${rel}#${index + 1}`,
        context: { kind: "swf-text", exportPath: rel, lineNumber: index + 1 },
        sourceText: normalized
      });
    });
  }
  return buildStringRows(asset, rows);
}

function unescapeSwfScriptLiteral(text) {
  return String(text || "")
    .replace(/\\\\/gu, "\\")
    .replace(/\\'/gu, "'")
    .replace(/\\"/gu, '"')
    .replace(/\\r/gu, "\r")
    .replace(/\\n/gu, "\n")
    .replace(/\\t/gu, "\t");
}

const SWF_SCRIPT_LINE_PATTERNS = [
  /\btalkyText\s*=/iu,
  /\bshowSay\s*\(/iu,
  /\bmanualSay\s*\(/iu,
  /\ba\d+\s*=/iu
];

function shouldExtractSwfScriptLine(line) {
  return SWF_SCRIPT_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

function extractSwfScriptStringRows(scriptRoot, asset) {
  const rows = [];
  for (const filePath of listFilesRecursive(scriptRoot, { includeExtensions: new Set([".as"]) })) {
    const rel = path.relative(scriptRoot, filePath).replace(/\\/gu, "/");
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (!shouldExtractSwfScriptLine(line)) {
        return;
      }
      const matches = [...line.matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/gu)];
      matches.forEach((match, occurrenceIndex) => {
        const quote = match[0].startsWith("'") ? "'" : '"';
        const rawLiteral = quote === '"' ? match[1] : match[2];
        const sourceText = unescapeSwfScriptLiteral(rawLiteral).trim();
        if (!looksTranslatable(sourceText)) {
          return;
        }
        rows.push({
          contextKey: `${rel}#${index + 1}#${occurrenceIndex + 1}`,
          context: {
            kind: "swf-script",
            exportPath: rel,
            lineNumber: index + 1,
            occurrenceIndex: occurrenceIndex + 1,
            quote,
            rawLiteral
          },
          sourceText
        });
      });
    });
  }
  return buildStringRows(asset, rows);
}

function scanArchiveSource({ archivePath, outputRoot, sourceGroup, tarBin, ffdecCli, includeSwf = true, swfProfile = "priority", assetPatterns = [] }) {
  if (!fileExists(archivePath)) {
    return [];
  }
  const archiveEntries = listArchiveEntries(archivePath, tarBin);
  const candidateEntries = archiveEntries.filter((entry) => {
    const extension = path.extname(entry).toLowerCase();
    return archiveCandidateExtensions.has(extension) && shouldIncludeAssetPath(entry, assetPatterns);
  });
  const extractedRoot = path.join(outputRoot, sourceGroup, hashString(archivePath));
  extractArchiveEntries(archivePath, candidateEntries, extractedRoot, tarBin);

  return candidateEntries.map((entry) => {
    const extractedPath = path.join(extractedRoot, entry);
    const assetType = detectAssetType(entry);
    const asset = {
      assetId: buildAssetId(sourceGroup, archivePath, entry),
      assetPath: entry,
      assetType,
      containerPath: archivePath,
      extractedPath,
      islandId: inferIslandId(entry),
      metadata: {
        extractionProfile: includeSwf ? swfProfile : "text-only"
      },
      sourceGroup,
      stringRows: []
    };

    if (assetType === "swf") {
      if (!includeSwf || !shouldProcessSwf(entry, swfProfile)) {
        asset.metadata.ffdec = {
          ok: false,
          skipped: true,
          error: includeSwf ? `SWF skipped by extraction profile (${swfProfile})` : "SWF extraction disabled"
        };
        return asset;
      }
      const ffdecRoot = path.join(extractedRoot, "__ffdec__", asset.assetId);
      if (ffdecCli && fileExists(ffdecCli)) {
        const exported = exportSwfTexts(extractedPath, ffdecRoot, ffdecCli);
        asset.metadata.ffdec = exported;
        if (exported.ok) {
          asset.stringRows = extractSwfStringRows(ffdecRoot, asset);
          const scriptRoot = path.join(extractedRoot, "__ffdec_scripts__", asset.assetId);
          const scriptExport = exportSwfScripts(extractedPath, scriptRoot, ffdecCli);
          asset.metadata.ffdec.scriptOutputDir = scriptRoot;
          asset.metadata.ffdec.scriptExport = scriptExport;
          if (scriptExport.ok) {
            asset.stringRows.push(...extractSwfScriptStringRows(scriptRoot, asset));
          }
        }
      } else {
        asset.metadata.ffdec = {
          ok: false,
          error: "FFDec CLI is not configured"
        };
      }
      return asset;
    }

    const raw = fs.readFileSync(extractedPath, "utf8");
    asset.metadata.originalHash = hashFile(extractedPath);
    asset.stringRows = isStylesAsset(entry)
      ? []
      : buildStringRows(asset, extractStringsFromContent(assetType, raw));
    return asset;
  });
}

function scanDirectorySource({ rootPath, outputRoot, sourceGroup, ffdecCli, includeSwf = true, swfProfile = "priority", assetPatterns = [] }) {
  if (!fileExists(rootPath)) {
    return [];
  }
  const files = listFilesRecursive(rootPath, { includeExtensions: directoryCandidateExtensions, maxDepth: 8 }).filter((filePath) =>
    shouldIncludeAssetPath(path.relative(rootPath, filePath), assetPatterns)
  );
  return files.map((filePath) => {
    const rel = path.relative(rootPath, filePath);
    const assetType = detectAssetType(rel);
    const copiedPath = path.join(outputRoot, sourceGroup, hashString(rootPath), rel);
    ensureDirSync(path.dirname(copiedPath));
    fs.copyFileSync(filePath, copiedPath);

    const asset = {
      assetId: buildAssetId(sourceGroup, rootPath, rel),
      assetPath: rel,
      assetType,
      containerPath: rootPath,
      extractedPath: copiedPath,
      islandId: inferIslandId(rel),
      metadata: {
        originalHash: hashFile(filePath),
        extractionProfile: includeSwf ? swfProfile : "text-only"
      },
      sourceGroup,
      stringRows: []
    };

    if (assetType === "swf") {
      if (!includeSwf || !shouldProcessSwf(rel, swfProfile)) {
        asset.metadata.ffdec = {
          ok: false,
          skipped: true,
          error: includeSwf ? `SWF skipped by extraction profile (${swfProfile})` : "SWF extraction disabled"
        };
        return asset;
      }
      const ffdecRoot = path.join(outputRoot, sourceGroup, "__ffdec__", asset.assetId);
      if (ffdecCli && fileExists(ffdecCli)) {
        const exported = exportSwfTexts(copiedPath, ffdecRoot, ffdecCli);
        asset.metadata.ffdec = exported;
        if (exported.ok) {
          asset.stringRows = extractSwfStringRows(ffdecRoot, asset);
          const scriptRoot = path.join(outputRoot, sourceGroup, "__ffdec_scripts__", asset.assetId);
          const scriptExport = exportSwfScripts(copiedPath, scriptRoot, ffdecCli);
          asset.metadata.ffdec.scriptOutputDir = scriptRoot;
          asset.metadata.ffdec.scriptExport = scriptExport;
          if (scriptExport.ok) {
            asset.stringRows.push(...extractSwfScriptStringRows(scriptRoot, asset));
          }
        }
      } else {
        asset.metadata.ffdec = {
          ok: false,
          error: "FFDec CLI is not configured"
        };
      }
      return asset;
    }

    const raw = fs.readFileSync(copiedPath, "utf8");
    asset.stringRows = isStylesAsset(rel)
      ? []
      : buildStringRows(asset, extractStringsFromContent(assetType, raw));
    return asset;
  });
}

module.exports = {
  scanArchiveSource,
  scanDirectorySource
};
