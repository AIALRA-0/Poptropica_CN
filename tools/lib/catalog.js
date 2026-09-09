const path = require("node:path");
const paths = require("./paths");
const { readJson } = require("./fs-utils");

function loadCatalogFile(fileName) {
  return readJson(path.join(paths.catalogDir, fileName), []);
}

function getStaticCatalogs() {
  return {
    as2: loadCatalogFile("as2-islands.json"),
    as3: loadCatalogFile("as3-islands.json"),
    steam: loadCatalogFile("steam-islands.json"),
    haxe: loadCatalogFile("haxe-islands.json"),
    glossary: loadCatalogFile("glossary.zh-CN.json")
  };
}

function getAllEntries() {
  const catalogs = getStaticCatalogs();
  return [...catalogs.as2, ...catalogs.as3, ...catalogs.steam, ...catalogs.haxe];
}

function getTranslationMode(entry) {
  if (entry.source === "haxe") {
    return "runtime-only";
  }
  if (entry.runtime === "flash" || entry.runtime === "air") {
    return "swf-string";
  }
  return "xml";
}

function buildCatalogIndex() {
  const entries = getAllEntries();
  const byId = new Map();
  const byCanonical = new Map();
  for (const entry of entries) {
    byId.set(entry.id, entry);
    if (!byCanonical.has(entry.canonicalKey)) {
      byCanonical.set(entry.canonicalKey, []);
    }
    byCanonical.get(entry.canonicalKey).push(entry);
  }
  return {
    byCanonical,
    byId,
    entries
  };
}

module.exports = {
  buildCatalogIndex,
  getAllEntries,
  getStaticCatalogs,
  getTranslationMode
};
