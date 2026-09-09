const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { parseArgs, printJson } = require("./lib/cli");
const { buildCatalogIndex } = require("./lib/catalog");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const {
  fileExists,
  hashString,
  listFilesRecursive,
  readJson
} = require("./lib/fs-utils");
const {
  buildGenericKey,
  buildStringKey,
  looksTranslatable,
  normalizeSourceText
} = require("./lib/text-utils");

const SCRIPT_DIALOGUE_PATTERNS = [
  /\btalkyText\s*=/iu,
  /\bmanualSay\s*\(/iu,
  /\bshowSay\s*\(/iu,
  /\bq\d+\s*=/iu,
  /\ba\d+\s*=/iu,
  /\bansw\d+\s*=/iu
];

function listArchiveEntries(archivePath, tarBin) {
  const result = spawnSync(tarBin, ["-tf", archivePath], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0) {
    throw new Error(`Failed to list archive ${archivePath}: ${result.stderr || result.stdout}`);
  }
  return result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function splitPatterns(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/\\/gu, "/").toLowerCase())
    .filter(Boolean);
}

function matchesAnyPattern(assetPath, patterns) {
  if (!patterns.length) {
    return true;
  }
  const normalized = String(assetPath || "").replace(/\\/gu, "/").toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function unescapeScriptLiteral(text) {
  return String(text || "")
    .replace(/\\\\/gu, "\\")
    .replace(/\\'/gu, "'")
    .replace(/\\"/gu, '"')
    .replace(/\\r/gu, "\r")
    .replace(/\\n/gu, "\n")
    .replace(/\\t/gu, "\t");
}

function extractScriptLiterals(line) {
  const rows = [];
  let occurrenceIndex = 0;
  for (const match of line.matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/gu)) {
    occurrenceIndex += 1;
    const quote = match[0].startsWith("'") ? "'" : '"';
    const rawLiteral = quote === '"' ? match[1] : match[2];
    const sourceText = normalizeSourceText(unescapeScriptLiteral(rawLiteral));
    if (!looksTranslatable(sourceText)) {
      continue;
    }
    rows.push({
      occurrenceIndex,
      quote,
      rawLiteral,
      sourceText
    });
  }
  return rows;
}

function extractScriptRowsForAsset({ assetId, sourceGroup, islandId, scriptRoot }) {
  const rows = [];
  if (!fileExists(scriptRoot)) {
    return rows;
  }

  for (const filePath of listFilesRecursive(scriptRoot, { includeExtensions: new Set([".as"]) })) {
    const rel = path.relative(scriptRoot, filePath).replace(/\\/gu, "/");
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (!SCRIPT_DIALOGUE_PATTERNS.some((pattern) => pattern.test(line))) {
        return;
      }
      for (const literal of extractScriptLiterals(line)) {
        const contextKey = `${rel}#${index + 1}#${literal.occurrenceIndex}`;
        rows.push({
          stringKey: buildStringKey(assetId, contextKey, literal.sourceText),
          assetId,
          sourceGroup,
          islandId,
          genericKey: buildGenericKey(literal.sourceText),
          sourceText: literal.sourceText,
          contextKey,
          context: {
            kind: "swf-script",
            exportPath: rel,
            lineNumber: index + 1,
            occurrenceIndex: literal.occurrenceIndex,
            quote: literal.quote,
            rawLiteral: literal.rawLiteral
          }
        });
      }
    });
  }
  return rows;
}

function buildIslandInferer() {
  const { entries } = buildCatalogIndex();
  const as2SceneFolderMap = new Map(
    (readJson(paths.launchManifestPath, {}).entries || [])
      .filter((entry) => entry.sourceGroup === "as2" && entry.sceneFolder && entry.canonicalKey)
      .map((entry) => [String(entry.sceneFolder).toLowerCase(), entry.canonicalKey])
  );
  return (assetPath) => {
    const input = String(assetPath || "").toLowerCase();
    const normalizedInput = input.replace(/[^a-z0-9]+/gu, "");
    const folderMatch = input.match(/\/scenes\/island([^/]+)\//u);
    if (folderMatch) {
      const mapped = as2SceneFolderMap.get(folderMatch[1].toLowerCase());
      if (mapped) {
        return mapped;
      }
    }
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
      const compactLaunchId = launchId.replace(/[^a-z0-9]+/gu, "");
      if (compactLaunchId && normalizedInput.includes(compactLaunchId)) {
        return entry.canonicalKey;
      }
    }
    return null;
  };
}

function openDb(dbPath) {
  const { DatabaseSync } = require("node:sqlite");
  return new DatabaseSync(dbPath);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = Boolean(args.apply);
  const config = loadConfig();
  const archivePath = path.resolve(config.sources.as2Gamezip || "");
  if (!archivePath || !fileExists(archivePath)) {
    throw new Error("AS2 source zip is not configured.");
  }

  const assetPatterns = splitPatterns(args["asset-pattern"]);
  const archiveHash = hashString(archivePath);
  const extractedRoot = path.join(paths.extractedDir, "as2", archiveHash);
  const scriptExportRoot = path.join(extractedRoot, "__ffdec_scripts__");
  const textExportRoot = path.join(extractedRoot, "__ffdec__");
  const inferIslandId = buildIslandInferer();
  const now = new Date().toISOString();

  const candidateAssets = listArchiveEntries(archivePath, config.tools.tarBin)
    .filter((entry) => /\.swf$/iu.test(entry))
    .filter((entry) => matchesAnyPattern(entry, assetPatterns))
    .map((entry) => {
      const assetId = hashString(`as2::${archivePath}::${entry}`);
      const scriptRoot = path.join(scriptExportRoot, assetId);
      return {
        assetId,
        assetPath: entry,
        islandId: inferIslandId(entry),
        extractedPath: path.join(extractedRoot, entry),
        textRoot: path.join(textExportRoot, assetId),
        scriptRoot,
        scriptExportPresent: fileExists(scriptRoot)
      };
    })
    .filter((asset) => asset.scriptExportPresent);

  const importedAssets = [];
  const skippedAssets = [];
  let candidateScriptRows = 0;
  let insertedOrUpdatedRows = 0;

  let db = null;
  let insertAsset = null;
  let insertString = null;
  if (apply) {
    db = openDb(paths.textIndexPath);
    insertAsset = db.prepare(`
      INSERT INTO assets (asset_id, source_group, island_id, container_path, asset_path, asset_type, extracted_path, metadata_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(asset_id) DO UPDATE SET
        source_group = excluded.source_group,
        island_id = COALESCE(assets.island_id, excluded.island_id),
        container_path = excluded.container_path,
        asset_path = excluded.asset_path,
        asset_type = excluded.asset_type,
        extracted_path = excluded.extracted_path,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `);
    insertString = db.prepare(`
      INSERT INTO strings (string_key, asset_id, source_group, island_id, generic_key, source_text, context_key, context_json, state, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(string_key) DO UPDATE SET
        asset_id = excluded.asset_id,
        source_group = excluded.source_group,
        island_id = excluded.island_id,
        generic_key = excluded.generic_key,
        source_text = excluded.source_text,
        context_key = excluded.context_key,
        context_json = excluded.context_json,
        updated_at = excluded.updated_at
    `);
  }

  for (const asset of candidateAssets) {
    const scriptRows = extractScriptRowsForAsset({
      assetId: asset.assetId,
      sourceGroup: "as2",
      islandId: asset.islandId,
      scriptRoot: asset.scriptRoot
    });
    candidateScriptRows += scriptRows.length;
    if (scriptRows.length === 0) {
      skippedAssets.push({
        assetPath: asset.assetPath,
        reason: "no-script-dialogue-candidates"
      });
      continue;
    }
    importedAssets.push({
      ...asset,
      scriptRows
    });
  }

  if (apply && db) {
    db.exec("BEGIN");
    try {
      for (const asset of importedAssets) {
        const metadata = {
          extractionProfile: "script-import",
          ffdec: {
            ok: fileExists(asset.textRoot),
            outputDir: asset.textRoot,
            scriptOutputDir: asset.scriptRoot,
            scriptExport: {
              ok: true,
              outputDir: asset.scriptRoot
            }
          }
        };
        insertAsset.run(
          asset.assetId,
          "as2",
          asset.islandId,
          archivePath,
          asset.assetPath,
          "swf",
          fileExists(asset.extractedPath) ? asset.extractedPath : null,
          JSON.stringify(metadata),
          now
        );
        for (const row of asset.scriptRows) {
          insertString.run(
            row.stringKey,
            row.assetId,
            row.sourceGroup,
            row.islandId,
            row.genericKey,
            row.sourceText,
            row.contextKey,
            JSON.stringify(row.context),
            "pending",
            now
          );
          insertedOrUpdatedRows += 1;
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.close();
    }
  }

  const report = {
    ok: true,
    generatedAt: now,
    apply,
    sourceGroup: "as2",
    archivePath,
    assetPatterns,
    totals: {
      assetsWithScriptExport: candidateAssets.length,
      assetsWithScriptRows: importedAssets.length,
      skippedAssets: skippedAssets.length,
      candidateScriptRows,
      insertedOrUpdatedRows: apply ? insertedOrUpdatedRows : 0
    },
    topAssets: importedAssets
      .map((asset) => ({
        assetId: asset.assetId,
        assetPath: asset.assetPath,
        islandId: asset.islandId,
        scriptRows: asset.scriptRows.length
      }))
      .sort((left, right) => right.scriptRows - left.scriptRows)
      .slice(0, 60),
    skippedAssets: skippedAssets.slice(0, 80)
  };

  const outputPath = path.resolve(String(args.output || path.join(paths.qaDir, "as2", "as2-runtime-script-import.json")));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  printJson({
    ok: true,
    outputPath,
    apply,
    totals: report.totals,
    topAssets: report.topAssets.slice(0, 10)
  });
}

main();
