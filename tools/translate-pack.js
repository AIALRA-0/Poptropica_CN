const { parseArgs, printJson } = require("./lib/cli");
const { getStaticCatalogs } = require("./lib/catalog");
const { openIndexDb } = require("./lib/db");
const { STYLE_VERSION, getProviderConfig, translateBatch } = require("./lib/translator");

function buildContextBatches(rows, maxItemsPerBatch) {
  const batches = [];
  let current = [];
  let currentKey = null;

  for (const row of rows) {
    const blockKey = `${row.source_group || "unknown"}::${row.island_id || "shared"}::${row.asset_path || row.asset_id}`;
    if (current.length >= maxItemsPerBatch || (current.length > 0 && blockKey !== currentKey && current.length >= Math.max(10, Math.floor(maxItemsPerBatch * 0.5)))) {
      batches.push(current);
      current = [];
      currentKey = null;
    }
    if (!currentKey) {
      currentKey = blockKey;
    }
    current.push({
      stringKey: row.string_key,
      genericKey: row.generic_key,
      sourceText: row.source_text,
      sourceGroup: row.source_group,
      islandId: row.island_id,
      assetPath: row.asset_path,
      assetType: row.asset_type,
      contextKey: row.context_key,
      context: JSON.parse(row.context_json || "{}")
    });
  }

  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

async function translateBatchRobust(batch, glossary) {
  const result = await translateBatch(batch, glossary);
  if (result.ok) {
    return {
      ok: true,
      translations: result.translations,
      provider: result.provider,
      model: result.model,
      styleVersion: result.styleVersion
    };
  }

  if (batch.length <= 1) {
    return result;
  }

  if (!/invalid json|request failed|status\s+\d+/iu.test(String(result.error || ""))) {
    return result;
  }

  const midpoint = Math.ceil(batch.length / 2);
  const left = await translateBatchRobust(batch.slice(0, midpoint), glossary);
  if (!left.ok) {
    return left;
  }
  const right = await translateBatchRobust(batch.slice(midpoint), glossary);
  if (!right.ok) {
    return right;
  }

  return {
    ok: true,
    translations: [...left.translations, ...right.translations],
    provider: left.provider || right.provider,
    model: left.model || right.model,
    styleVersion: left.styleVersion || right.styleVersion
  };
}

async function translateBatchesConcurrent(batches, glossary, concurrency) {
  const collected = [];
  let provider = null;
  let model = null;
  let styleVersion = null;
  let nextIndex = 0;
  let failure = null;

  async function worker() {
    while (!failure) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= batches.length) {
        return;
      }

      const result = await translateBatchRobust(batches[index], glossary);
      if (!result.ok) {
        failure = result;
        return;
      }

      provider = provider || result.provider;
      model = model || result.model;
      styleVersion = styleVersion || result.styleVersion;
      collected.push(...result.translations);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, batches.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failure) {
    return failure;
  }
  return {
    ok: true,
    translations: collected,
    provider,
    model,
    styleVersion
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Number(args.limit || 160);
  const concurrency = Math.max(1, Number(args.concurrency || 4));
  const sourceGroup = args.source ? String(args.source).toLowerCase() : null;
  const islandIds = args.island
    ? String(args.island)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const assetPatterns = args["asset-pattern"]
    ? String(args["asset-pattern"])
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const drain = Boolean(args.drain);
  const db = openIndexDb();
  const glossary = getStaticCatalogs().glossary;
  const provider = getProviderConfig();
  let translatedCount = 0;
  let seededFromMemoryCount = 0;
  let pendingCount = 0;
  let passCount = 0;
  let lastError = null;

  do {
    const seededBulk = db.seedExactFromGeneric({
      sourceGroup,
      islandIds,
      assetPatterns,
      provider: provider.provider,
      model: provider.model,
      styleVersion: STYLE_VERSION
    });
    seededFromMemoryCount += seededBulk;

    const pending = db.getPendingStrings({ limit, sourceGroup, islandIds, assetPatterns });
    pendingCount = pending.length;
    if (pending.length === 0) {
      break;
    }
    passCount += 1;

    const fallbackRows = pending.filter((row) => typeof row.fallback_translated_text === "string" && row.fallback_translated_text.trim());
    const translateRows = pending.filter((row) => !fallbackRows.includes(row));

    for (const row of fallbackRows) {
      db.upsertExactTranslation({
        stringKey: row.string_key,
        genericKey: row.generic_key,
        sourceText: row.source_text,
        translatedText: row.fallback_translated_text,
        provider: provider.provider,
        model: provider.model,
        styleVersion: STYLE_VERSION
      });
      seededFromMemoryCount += 1;
    }

    const batches = buildContextBatches(translateRows, Math.min(40, limit));
    let translatedThisPass = 0;
    if (batches.length > 0) {
      const result = await translateBatchesConcurrent(batches, glossary, concurrency);
      if (!result.ok) {
        lastError = result.error;
      } else {
        for (const row of result.translations) {
          db.upsertExactTranslation({
            stringKey: row.stringKey,
            genericKey: row.genericKey,
            sourceText: row.sourceText,
            translatedText: row.translatedText,
            provider: result.provider,
            model: result.model,
            styleVersion: result.styleVersion
          });
          db.upsertTranslation({
            genericKey: row.genericKey,
            sourceText: row.sourceText,
            translatedText: row.translatedText,
            provider: result.provider,
            model: result.model,
            styleVersion: result.styleVersion
          });
          translatedThisPass += 1;
        }
      }
    }

    if (lastError) {
      break;
    }

    translatedCount += translatedThisPass;
    const processedThisPass = translatedThisPass + fallbackRows.length;
    if (!drain || processedThisPass === 0 || lastError) {
      break;
    }
  } while (drain);

  pendingCount = db.countPendingStrings({
    sourceGroup,
    islandIds,
    assetPatterns
  });

  printJson({
    provider: provider.provider,
    model: provider.model,
    sourceGroup,
    islandIds,
    assetPatterns,
    drain,
    passCount,
    translatedCount,
    seededFromMemoryCount,
    pendingCount,
    error: lastError
  });
  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
