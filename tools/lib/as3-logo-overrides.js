const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const paths = require("./paths");
const { ensureDirSync, fileExists, readJson, writeJson } = require("./fs-utils");
const { containsCjk, normalizeTranslatedText } = require("./text-utils");

const FONT_CANDIDATES = [
  "C:\\Windows\\Fonts\\simhei.ttf",
  "C:\\Windows\\Fonts\\msyhbd.ttc",
  "C:\\Windows\\Fonts\\msyh.ttc",
  "C:\\Windows\\Fonts\\ARIALUNI.ttf"
];

const SAFE_AS3_MAP_LOGO_FOLDERS = new Set([
  "early",
  "mocktropica",
  "nabooti",
  "super",
  "virusHunter"
]);

function findPythonLaunch() {
  const attempts = [
    { command: "python", args: ["-c", "print('ok')"] },
    { command: "py", args: ["-3", "-c", "print('ok')"] }
  ];

  for (const attempt of attempts) {
    const result = spawnSync(attempt.command, attempt.args, {
      encoding: "utf8",
      windowsHide: true
    });
    if (result.status === 0) {
      return attempt.command === "py"
        ? { command: "py", prefixArgs: ["-3"] }
        : { command: attempt.command, prefixArgs: [] };
    }
  }

  return null;
}

function findFontPath() {
  return FONT_CANDIDATES.find((candidate) => fileExists(candidate)) || null;
}

function resolveLatestAs3ExtractedRoot() {
  const extractedRoot = path.join(paths.extractedDir, "as3");
  if (!fileExists(extractedRoot)) {
    return null;
  }

  const candidates = fs.readdirSync(extractedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(extractedRoot, entry.name);
      return {
        fullPath,
        mtimeMs: fs.statSync(fullPath).mtimeMs
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return candidates[0]?.fullPath || null;
}

function loadIslandNameFallbacks() {
  return readJson(paths.islandNamesPath, {});
}

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
    moon: "lunar-colony",
    myth: "mythology",
    mythMulti: "mythology",
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
    train: "mystery-train",
    vampire: "vampires-curse",
    virusHunter: "virus-hunter",
    west: "wild-west",
    wimpy: "wimpy-wonderland",
    woodland: "twisted-thicket",
    zombie: "zomberry",
    villain: "super-villain",
    trade: "nabooti",
    japan: "red-dragon",
    lands: "mystery-of-the-map",
    con1: "poptropicon",
    con2: "poptropicon",
    con3: "poptropicon",
    conEpisodic: "poptropicon",
    viking: "viking"
  };
  return directMap[folderName] || folderName;
}

function queryAs3MapIslandTranslations() {
  const db = new DatabaseSync(paths.textIndexPath);
  try {
    const rows = db.prepare(`
      SELECT
        a.asset_path AS asset_path,
        s.source_text AS source_text,
        COALESCE(et.translated_text, t.translated_text) AS translated_text
      FROM strings s
      JOIN assets a ON a.asset_id = s.asset_id
      LEFT JOIN exact_translations et ON et.string_key = s.string_key
      LEFT JOIN translations t ON t.generic_key = s.generic_key
      WHERE s.source_group = 'as3'
        AND a.asset_path LIKE 'content/www.poptropica.com/game/data/scenes/map/map/islands/%/island.xml'
        AND json_extract(s.context_json, '$.path[1]') = 'name'
      ORDER BY a.asset_path
    `).all();

    const fallbackNames = loadIslandNameFallbacks();
    return rows.map((row) => {
      const folderMatch = /\/islands\/([^/]+)\/island\.xml$/iu.exec(row.asset_path);
      const folder = folderMatch?.[1];
      if (!folder) {
        return null;
      }
      let translatedText = normalizeTranslatedText(row.translated_text || "", row.source_text || "");
      if (!containsCjk(translatedText)) {
        const fallback = fallbackNames[toCanonicalKeyGuess(folder)];
        if (fallback) {
          translatedText = fallback;
        }
      }
      return {
        folder,
        sourceText: row.source_text,
        translatedText
      };
    }).filter(Boolean);
  } finally {
    db.close();
  }
}

function generateAs3MapLogoOverrides({ config, outputDir, allowedFolders = SAFE_AS3_MAP_LOGO_FOLDERS }) {
  const ffdecCli = config?.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    return {
      ok: false,
      generatedCount: 0,
      failures: [{ error: "FFDec CLI is not configured." }],
      results: []
    };
  }

  const python = findPythonLaunch();
  if (!python) {
    return {
      ok: false,
      generatedCount: 0,
      failures: [{ error: "Python is not available." }],
      results: []
    };
  }

  const fontPath = findFontPath();
  if (!fontPath) {
    return {
      ok: false,
      generatedCount: 0,
      failures: [{ error: "No Chinese font file was found." }],
      results: []
    };
  }

  const extractedRoot = resolveLatestAs3ExtractedRoot();
  if (!extractedRoot) {
    return {
      ok: false,
      generatedCount: 0,
      failures: [{ error: "No extracted AS3 content root was found." }],
      results: []
    };
  }

  const translations = queryAs3MapIslandTranslations();
  const entries = [];
  for (const item of translations) {
    if (!item.translatedText) {
      continue;
    }
    if (allowedFolders && !allowedFolders.has(item.folder)) {
      continue;
    }
    const sourceSwf = path.join(
      extractedRoot,
      "content",
      "www.poptropica.com",
      "game",
      "assets",
      "scenes",
      "map",
      "map",
      "islands",
      item.folder,
      "logo.swf"
    );
    if (!fileExists(sourceSwf)) {
      continue;
    }

    const outputSwf = path.join(
      outputDir,
      "swf",
      "content",
      "www.poptropica.com",
      "game",
      "assets",
      "scenes",
      "map",
      "map",
      "islands",
      item.folder,
      "logo.swf"
    );

    entries.push({
      folder: item.folder,
      sourceSwf,
      outputSwf,
      text: item.translatedText
    });
  }

  if (entries.length === 0) {
    return {
      ok: true,
      generatedCount: 0,
      failures: [],
      results: []
    };
  }

  const scriptPath = path.join(paths.toolsRoot, "native", "generate_as3_map_logo_overrides.py");
  const manifestPath = path.join(paths.tempDir, "as3-map-logo-overrides.manifest.json");
  ensureDirSync(paths.tempDir);
  writeJson(manifestPath, {
    ffdecCli,
    fontPath,
    entries
  });

  const result = spawnSync(
    python.command,
    [...python.prefixArgs, scriptPath, "--manifest", manifestPath],
    {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 64,
      env: {
        ...process.env,
        PYTHONUTF8: "1"
      }
    }
  );

  if (result.status !== 0) {
    return {
      ok: false,
      generatedCount: 0,
      failures: [{ error: (result.stderr || result.stdout || "AS3 logo override generation failed.").trim() }],
      results: []
    };
  }

  const payload = JSON.parse(result.stdout || "{}");
  return {
    ok: Boolean(payload.ok),
    generatedCount: Number(payload.generatedCount || 0),
    failures: Array.isArray(payload.failures) ? payload.failures : [],
    results: Array.isArray(payload.results) ? payload.results : []
  };
}

module.exports = {
  generateAs3MapLogoOverrides,
  SAFE_AS3_MAP_LOGO_FOLDERS
};
