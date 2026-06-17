const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, readJson, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_SCENES_PREFIX = "content/www.poptropica.com/game/data/scenes/";
const MAIN_ISLAND_XML_RE = /^content\/www\.poptropica\.com\/game\/data\/scenes\/([^/]+)(?:\/[^/]+)?\/island\.xml$/u;
const MAP_ISLAND_XML_RE = /^content\/www\.poptropica\.com\/game\/data\/scenes\/map\/map\/islands\/([^/]+)\/island\.xml$/u;

function toCanonicalKeyGuess(folderName) {
  const directMap = {
    arab1: "arabian-nights",
    arab2: "arabian-nights",
    arab3: "arabian-nights",
    arabEpisodic: "arabian-nights",
    astro: "astro-knights",
    backlot: "back-lot",
    bigNate: "big-nate",
    boardwalk: "wimpy-boardwalk",
    carnival: "monster-carnival",
    carrot: "24-carrot",
    charlie: "charlie-and-the-chocolate-factory",
    con1: "poptropicon",
    con2: "poptropicon",
    con3: "poptropicon",
    conEpisodic: "poptropicon",
    counter: "counterfeit",
    cryptid: "cryptids",
    deepDive1: "mission-atlantis",
    deepDive2: "mission-atlantis",
    deepDive3: "mission-atlantis",
    deepDiveEpisodic: "mission-atlantis",
    early: "early-poptropica",
    gameShow: "game-show",
    ghd: "galactic-hot-dogs",
    ghost: "ghost-story",
    japan: "red-dragon",
    lands: "mystery-of-the-map",
    moon: "lunar-colony",
    mocktropica: "mocktropica",
    myth: "mythology",
    mythAS2: "mythology",
    mythMulti: "mythology",
    nabooti: "nabooti",
    nightWatch: "night-watch",
    peanuts: "timmy-failure",
    poptropolis: "poptropolis-games",
    poptropolisMulti: "poptropolis-games",
    prison: "escape-from-pelican-rock",
    reality: "reality-tv",
    reality2: "reality-tv-wild-safari",
    shark: "shark-tooth",
    shipwreck: "skullduggery",
    shrink: "shrink-ray",
    steam: "steamworks",
    super: "super-power",
    survival1: "survival",
    survival2: "survival",
    survival3: "survival",
    survival4: "survival",
    survival5: "survival",
    survivalEpisodic: "survival",
    time: "time-tangled",
    timmy: "timmy-failure",
    trade: "nabooti",
    train: "mystery-train",
    vampire: "vampires-curse",
    villain: "super-villain",
    virusHunter: "virus-hunter",
    west: "wild-west",
    wimpy: "wimpy-wonderland",
    woodland: "twisted-thicket",
    zombie: "zomberry"
  };
  return directMap[folderName] || folderName;
}

function runCommand(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim()}`);
  }
  return result;
}

function listZipEntries(config, sourceZip) {
  const tarBin = config.tools?.tarBin || "tar";
  const result = runCommand(tarBin, ["-tf", sourceZip], "list AS3 zip entries");
  return result.stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim().replace(/\\/gu, "/"))
    .filter(Boolean);
}

function extractZipEntries(config, sourceZip, entries, outputDir) {
  const tarBin = config.tools?.tarBin || "tar";
  const chunkSize = 40;
  ensureDirSync(outputDir);
  for (let index = 0; index < entries.length; index += chunkSize) {
    const chunk = entries.slice(index, index + chunkSize);
    runCommand(tarBin, ["-xf", sourceZip, "-C", outputDir, ...chunk], `extract AS3 island XML chunk ${index / chunkSize + 1}`);
  }
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

function resolveFolder(entryName) {
  const mapMatch = MAP_ISLAND_XML_RE.exec(entryName);
  if (mapMatch) {
    return mapMatch[1];
  }
  const mainMatch = MAIN_ISLAND_XML_RE.exec(entryName);
  if (!mainMatch || mainMatch[1] === "map") {
    return null;
  }
  return mainMatch[1];
}

function patchIslandNameXml(content, translatedName) {
  const next = String(content || "").replace(
    /(<name\b[^>]*>)([\s\S]*?)(<\/name>)/iu,
    `$1${xmlEscape(translatedName)}$3`
  );
  if (next === content) {
    return null;
  }
  return next;
}

function main() {
  const config = loadConfig();
  const sourceZip = config.sources?.as3Gamezip;
  if (!sourceZip || !fileExists(sourceZip)) {
    throw new Error(`AS3 source zip is missing: ${sourceZip || "(not configured)"}`);
  }

  const islandNames = readJson(paths.islandNamesPath, {});
  const entries = listZipEntries(config, sourceZip)
    .filter((entry) => entry.startsWith(AS3_SCENES_PREFIX))
    .filter((entry) => MAIN_ISLAND_XML_RE.test(entry) || MAP_ISLAND_XML_RE.test(entry));

  const workDir = path.join(paths.tempDir, "as3-island-name-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  extractZipEntries(config, sourceZip, entries, workDir);

  const patched = [];
  const skipped = [];
  for (const entryName of entries) {
    const folder = resolveFolder(entryName);
    const canonicalKey = folder ? toCanonicalKeyGuess(folder) : null;
    const translatedName = canonicalKey ? islandNames[canonicalKey] : null;
    if (!translatedName) {
      skipped.push({ entryName, folder, canonicalKey, reason: "no curated Chinese island name" });
      continue;
    }

    const packTarget = path.join(paths.as3PackDir, "files", entryName.replace(/\//gu, path.sep));
    const sourceFile = fileExists(packTarget)
      ? packTarget
      : path.join(workDir, entryName.replace(/\//gu, path.sep));
    if (!fileExists(sourceFile)) {
      skipped.push({ entryName, folder, canonicalKey, reason: "source XML missing after extraction" });
      continue;
    }

    const original = fs.readFileSync(sourceFile, "utf8");
    const next = patchIslandNameXml(original, translatedName);
    if (next == null) {
      skipped.push({ entryName, folder, canonicalKey, reason: "missing <name> tag" });
      continue;
    }
    if (next !== original || !fileExists(packTarget)) {
      writeText(packTarget, next);
    }
    patched.push({
      entryName,
      folder,
      canonicalKey,
      translatedName,
      outputPath: packTarget
    });
  }

  const manifestPath = path.join(paths.as3PackDir, "manifest.json");
  const manifest = fileExists(manifestPath)
    ? readJson(manifestPath, {})
    : {
        generatedAt: new Date().toISOString(),
        sourceGroup: "as3",
        canonicalKeys: [],
        assetsPatched: 0,
        externalTextAssets: [],
        swfPatchedAssets: [],
        pendingSwfAssets: []
      };
  manifest.assetsPatched = Number(manifest.assetsPatched || 0) + patched.length;
  manifest.externalTextAssets = Array.isArray(manifest.externalTextAssets) ? manifest.externalTextAssets : [];
  manifest.externalTextAssets.push({
    assetId: "as3-island-names:curated-zh-cn",
    assetPath: "content/www.poptropica.com/game/data/scenes/**/island.xml",
    patchedCount: patched.length,
    generatedAt: new Date().toISOString()
  });

  const runtimeZip = buildRuntimeZipForSourceGroup({
    config,
    sourceGroup: "as3",
    manifest
  });
  writeJson(manifestPath, manifest);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceZip,
    patchedCount: patched.length,
    skippedCount: skipped.length,
    patched,
    skipped,
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-island-name-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
