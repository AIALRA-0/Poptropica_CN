const path = require("node:path");
const paths = require("./paths");
const { buildCatalogIndex, getTranslationMode } = require("./catalog");
const { describeConfiguredSources } = require("./config");
const { ensureDirSync, readJson, writeJson } = require("./fs-utils");
const { loadLaunchManifest } = require("./launch-manifest");
const { openIndexDb } = require("./db");
const { loadIslandVerification } = require("./status-store");

function getPackState() {
  const packMeta = readJson(paths.packMetaPath, null);
  const packs = {
    as2: readJson(path.join(paths.as2PackDir, "manifest.json"), null),
    as3: readJson(path.join(paths.as3PackDir, "manifest.json"), null)
  };
  return { packMeta, packs };
}

function getIslandNames() {
  return readJson(paths.islandNamesPath, {});
}

function getIslandProgressMap() {
  try {
    const db = openIndexDb();
    const rows = db.getIslandProgress();
    db.close();
    const progress = new Map();
    for (const row of rows) {
      const key = `${row.sourceGroup}:${row.islandId || "__unknown__"}`;
      progress.set(key, row);
    }
    return progress;
  } catch (_error) {
    return new Map();
  }
}

function buildAvailability(entry, configured, flashKeys) {
  if (entry.source === "haxe") {
    return "out_of_scope_for_flash_v1";
  }
  if (entry.source === "as2") {
    return configured.as2Gamezip ? "present" : "missing";
  }
  if (entry.source === "as3") {
    return configured.as3Gamezip ? "present" : "missing";
  }
  if (entry.source === "steam") {
    if (!configured.steamRoot) {
      return "missing";
    }
    if (flashKeys.has(entry.canonicalKey)) {
      return "duplicate";
    }
    return "present";
  }
  return "missing";
}

function buildNotes(entry, config, availability) {
  const notes = [];
  if ((entry.source === "as2" || entry.source === "as3") && config.sources.flashpointRoot && availability === "missing") {
    notes.push("Flashpoint 已配置，但对应的数据包还没挂上。");
  }
  if (entry.source === "steam" && availability === "duplicate") {
    notes.push("这个岛已经由 Flash 旧版来源覆盖，Steam 这里只做参考。");
  }
  if (entry.source === "haxe") {
    notes.push("这是现网页/Haxe 内容，只作对照，不放进这个旧版项目里。");
  }
  return notes;
}

function choosePreferredEntry(entries) {
  const ranked = ["as3", "as2", "steam", "haxe"];
  return [...entries].sort((left, right) => ranked.indexOf(left.source) - ranked.indexOf(right.source))[0] || null;
}

function getVerificationForKey(verification, canonicalKey) {
  return verification?.islands?.[canonicalKey] || null;
}

function buildTranslationStatus(entry, packState, progressMap, verification) {
  if (entry.source === "haxe") {
    return "范围外";
  }
  const verified = getVerificationForKey(verification, entry.canonicalKey);
  if (verified?.translationStatus) {
    return verified.translationStatus;
  }
  const manifest = entry.source === "as2" ? packState.packs.as2 : entry.source === "as3" ? packState.packs.as3 : null;
  if (manifest?.canonicalKeys?.includes(entry.canonicalKey)) {
    return "已打包未验收";
  }
  const progress = progressMap.get(`${entry.source}:${entry.canonicalKey}`) || null;
  if (progress?.stringCount > 0) {
    return "已提取待翻译";
  }
  return "未提取";
}

function buildPlayabilityStatus(entry, availability, launchEntry, verification) {
  if (entry.source === "haxe") {
    return "范围外";
  }
  const verified = getVerificationForKey(verification, entry.canonicalKey);
  if (verified?.playabilityStatus) {
    return verified.playabilityStatus;
  }
  if (availability === "missing") {
    return "未导入";
  }
  if (launchEntry?.launchable) {
    return "待验证";
  }
  return "未解析";
}

function buildInventory(config) {
  const configured = describeConfiguredSources(config);
  const { byCanonical, entries } = buildCatalogIndex();
  const packState = getPackState();
  const launchManifest = loadLaunchManifest();
  const launchByCanonical = new Map((launchManifest?.entries || []).map((entry) => [entry.canonicalKey, entry]));
  const progressMap = getIslandProgressMap();
  const verification = loadIslandVerification();
  const names = getIslandNames();
  const flashKeys = new Set();

  for (const entry of entries) {
    if (entry.source === "as2" && configured.as2Gamezip) {
      flashKeys.add(entry.canonicalKey);
    }
    if (entry.source === "as3" && configured.as3Gamezip) {
      flashKeys.add(entry.canonicalKey);
    }
  }

  const matrixEntries = entries.map((entry) => {
    const availability = buildAvailability(entry, configured, flashKeys);
    const launchEntry = launchByCanonical.get(entry.canonicalKey) || null;
    const verified = getVerificationForKey(verification, entry.canonicalKey);
    return {
      id: entry.id,
      canonicalKey: entry.canonicalKey,
      cnName: names[entry.canonicalKey] || entry.displayName,
      enName: entry.displayName,
      displayName: entry.displayName,
      packageName: entry.source.toUpperCase(),
      source: entry.source,
      sourceGroup: entry.source,
      runtime: entry.runtime,
      runtimeVersion: `${entry.source.toUpperCase()} Flash`,
      releaseYear: entry.releaseYear || null,
      availability,
      translationMode: getTranslationMode(entry),
      launchTarget: {
        source: entry.source,
        launchId: entry.launchId,
        launchable: Boolean(launchEntry?.launchable),
        roomParam: launchEntry?.roomParam || null,
        islandParam: launchEntry?.islandParam || null
      },
      playabilityStatus: buildPlayabilityStatus(entry, availability, launchEntry, verification),
      translationStatus: buildTranslationStatus(entry, packState, progressMap, verification),
      lastVerifiedAt: verified?.lastVerifiedAt || null,
      notes: [
        ...buildNotes(entry, config, availability),
        ...(verified?.notes || []),
        ...(launchEntry?.launchable ? [] : launchEntry?.notes || [])
      ]
    };
  });

  const islands = [];
  for (const [canonicalKey] of byCanonical.entries()) {
    const joined = matrixEntries.filter((entry) => entry.canonicalKey === canonicalKey);
    const preferred = choosePreferredEntry(joined);
    const presentEntries = joined.filter((entry) => entry.availability === "present");
    const duplicateEntries = joined.filter((entry) => entry.availability === "duplicate");
    const availability =
      preferred?.source === "haxe"
        ? "范围外"
        : presentEntries.length > 0
          ? "present"
          : duplicateEntries.length > 0
            ? "duplicate_only"
            : "missing";

    islands.push({
      id: canonicalKey,
      cnName: preferred?.cnName || preferred?.displayName || canonicalKey,
      enName: preferred?.enName || canonicalKey,
      displayName: preferred?.displayName || canonicalKey,
      packageName: preferred?.packageName || "—",
      preferredSource: preferred?.source || null,
      sourceGroup: preferred?.source || null,
      runtimeVersion: preferred?.runtimeVersion || "—",
      releaseYear: preferred?.releaseYear || null,
      availability,
      playabilityStatus: preferred?.playabilityStatus || "未导入",
      translationStatus: preferred?.translationStatus || "未提取",
      lastVerifiedAt: preferred?.lastVerifiedAt || null,
      launchTarget: preferred?.launchTarget || null,
      notes: preferred?.notes || [],
      entries: joined
    });
  }

  const flashIslands = islands.filter((island) => ["as2", "as3"].includes(island.preferredSource));
  const summary = {
    totalCatalogEntries: matrixEntries.length,
    totalIslands: islands.length,
    flashIslandCount: flashIslands.length,
    as2CatalogCount: matrixEntries.filter((entry) => entry.source === "as2").length,
    as3CatalogCount: matrixEntries.filter((entry) => entry.source === "as3").length,
    steamCatalogCount: matrixEntries.filter((entry) => entry.source === "steam").length,
    haxeCatalogCount: matrixEntries.filter((entry) => entry.source === "haxe").length,
    presentCount: matrixEntries.filter((entry) => entry.availability === "present").length,
    duplicateCount: matrixEntries.filter((entry) => entry.availability === "duplicate").length,
    missingCount: matrixEntries.filter((entry) => entry.availability === "missing").length,
    verifiedChineseCount: flashIslands.filter((entry) => entry.translationStatus === "已验收可见中文").length,
    verifiedPlayableCount: flashIslands.filter((entry) => entry.playabilityStatus === "可玩").length
  };

  return {
    generatedAt: new Date().toISOString(),
    configuredSources: configured,
    summary,
    entries: matrixEntries,
    islands
  };
}

function writeInventory(config) {
  ensureDirSync(paths.catalogDir);
  const inventory = buildInventory(config);
  writeJson(paths.coverageMatrixPath, inventory);
  writeJson(paths.islandsPath, inventory.islands);
  return inventory;
}

module.exports = {
  buildInventory,
  writeInventory
};
