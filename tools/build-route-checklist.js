const fs = require("node:fs");
const path = require("node:path");
const { loadConfig } = require("./lib/config");
const { generateLaunchManifest } = require("./lib/launch-manifest");
const paths = require("./lib/paths");
const { getProjectRevision } = require("./lib/qa");

const AS3_ROOT = path.join(
  paths.projectRoot,
  "packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes"
);
const AS2_SCENE_ROOT = path.join(
  paths.projectRoot,
  "packs/zh-CN/as2/swf/content/www.poptropica.com/scenes"
);
const OUTPUT_PATH = path.join(paths.projectRoot, "qa/route-checklist.json");

const AS3_FOLDER_ALIASES = {
  "early-poptropica": "early",
  "shark-tooth": "shark",
  "time-tangled": "time",
  "24-carrot": "carrot",
  "super-power": "super",
  spy: "spy",
  nabooti: "nabooti",
  "big-nate": "bigNate",
  "astro-knights": "astro",
  counterfeit: "counter",
  "reality-tv": "reality",
  mythology: "mythAS2",
  skullduggery: "trade",
  steamworks: "steam",
  "great-pumpkin": "peanuts",
  cryptids: "cryptid",
  "wild-west": "west",
  "wimpy-wonderland": "wimpy",
  "red-dragon": "japan",
  "shrink-ray": "shrink",
  "mystery-train": "train",
  "game-show": "gameShow",
  "ghost-story": "ghost",
  sos: "shipwreck",
  "vampires-curse": "vampire",
  "twisted-thicket": "woodland",
  "poptropolis-games": "tribal",
  "charlie-and-the-chocolate-factory": "charlie",
  "wimpy-boardwalk": "boardwalk",
  "lunar-colony": "moon",
  "super-villain": "villain",
  zomberry: "zombie",
  "night-watch": "nightWatch",
  "back-lot": "backlot",
  "virus-hunter": "virusHunter",
  mocktropica: "mocktropica",
  "monster-carnival": "carnival",
  survival: "survival1",
  "mission-atlantis": "deepDive1",
  poptropicon: "con1",
  "arabian-nights": "arab1",
  "mystery-of-the-map": "viking",
  "escape-from-pelican-rock": "prison",
  "timmy-failure": "timmy",
  "galactic-hot-dogs": "ghd",
  "monkey-wrench": "ftue",
  "reality-tv-wild-safari": "reality2"
};

const MINIGAME_WORDS = [
  "game",
  "race",
  "puzzle",
  "quiz",
  "trivia",
  "archery",
  "diving",
  "hurdles",
  "javelin",
  "jump",
  "vault",
  "shotput",
  "weight",
  "battle",
  "boss",
  "chase",
  "shootout",
  "sumo",
  "maze",
  "arena",
  "contest",
  "spin"
];

const SETTLEMENT_WORDS = [
  "complete",
  "completed",
  "victory",
  "won",
  "beat",
  "finished",
  "rescued",
  "saved",
  "destroyed",
  "defeated",
  "competition_finished",
  "medal"
];

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_error) {
    return "";
  }
}

function walk(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...walk(filePath));
    } else {
      result.push(filePath);
    }
  }
  return result;
}

function tags(text, tag) {
  return [...String(text || "").matchAll(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "giu"))]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function attributes(text, tag, attribute) {
  const values = [];
  const pattern = new RegExp(`<${tag}\\b[^>]*\\b${attribute}="([^"]+)"[^>]*>`, "giu");
  for (const match of String(text || "").matchAll(pattern)) {
    values.push(match[1].trim());
  }
  return values.filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function classToScene(value) {
  const parts = String(value || "").split(".");
  return parts.length >= 4 ? parts.slice(-2, -1)[0] : String(value || "");
}

function chooseXmlFolder(entry) {
  const alias = AS3_FOLDER_ALIASES[entry.canonicalKey];
  if (!alias) {
    return null;
  }
  const candidate = path.join(AS3_ROOT, alias);
  return fs.existsSync(candidate) ? candidate : null;
}

function islandXml(folder) {
  return folder ? path.join(folder, "island.xml") : null;
}

function buildAs3Evidence(entry) {
  const folder = chooseXmlFolder(entry);
  const islandPath = islandXml(folder);
  const islandText = readText(islandPath);
  const files = folder ? walk(folder) : [];
  const routeFiles = files
    .filter((filePath) => /(?:doors|items|npcs|scene|games)\.xml$/iu.test(filePath))
    .map((filePath) => path.relative(AS3_ROOT, filePath).replace(/\\/gu, "/"))
    .sort();
  const doorScenes = unique(
    files
      .filter((filePath) => path.basename(filePath).toLowerCase() === "doors.xml")
      .flatMap((filePath) => tags(readText(filePath), "scene"))
  );
  const itemIds = unique([
    ...attributes(islandText, "item", "id"),
    ...files
      .filter((filePath) => path.basename(filePath).toLowerCase() === "items.xml")
      .flatMap((filePath) => [
        ...attributes(readText(filePath), "item", "id"),
        ...tags(readText(filePath), "id")
      ])
  ]);
  const npcIds = unique(
    files
      .filter((filePath) => /npcs\.xml$/iu.test(filePath))
      .flatMap((filePath) => {
        const text = readText(filePath);
        return [
          ...attributes(text, "npc", "id"),
          ...attributes(text, "character", "id"),
          ...attributes(text, "npc", "name")
        ];
      })
  );
  const events = unique(tags(islandText, "event"));
  const medallion = tags(islandText, "medallion")[0] || itemIds.find((item) => /medal/i.test(item)) || null;
  const minigames = unique([
    ...routeFiles
      .filter((filePath) => MINIGAME_WORDS.some((word) => filePath.toLowerCase().includes(word)))
      .map((filePath) => filePath.replace(/\/(doors|items|npcs|scene|games)\.xml$/iu, "")),
    ...events.filter((event) => MINIGAME_WORDS.some((word) => event.toLowerCase().includes(word)))
  ]);
  const settlementEvents = events.filter((event) =>
    SETTLEMENT_WORDS.some((word) => event.toLowerCase().includes(word))
  );
  const effectiveSettlementEvents = settlementEvents.length > 0
    ? settlementEvents
    : events.slice(-Math.min(5, events.length));
  const firstScene = (islandText.match(/<firstScene>[\s\S]*?<scene>([^<]+)/iu) || [])[1]?.trim() || null;
  const firstSceneFromManifest = entry.as3TargetScene || entry.roomParam || null;
  return {
    folder: folder ? path.relative(AS3_ROOT, folder).replace(/\\/gu, "/") : null,
    islandXml: islandPath ? path.relative(paths.projectRoot, islandPath).replace(/\\/gu, "/") : null,
    firstScene: firstScene || firstSceneFromManifest,
    keyScenes: unique([firstScene, ...doorScenes.map(classToScene)]),
    requiredItems: itemIds,
    keyNpcs: npcIds,
    minigames,
    settlementEvents: effectiveSettlementEvents,
    completionEvents: events.slice(-8),
    reward: medallion,
    sourceFiles: routeFiles
  };
}

function buildAs2Evidence(entry) {
  const folder = path.join(AS2_SCENE_ROOT, `island${entry.sceneFolder || ""}`);
  const sceneFiles = fs.existsSync(folder)
    ? fs.readdirSync(folder)
      .filter((name) => /^scene.+\.swf$/iu.test(name))
      .sort()
    : [];
  const xmlEvidence = buildAs3Evidence(entry);
  const keyScenes = unique([
    entry.roomParam,
    ...xmlEvidence.keyScenes,
    ...sceneFiles.map((name) => name.replace(/^scene/iu, "").replace(/\.swf$/iu, ""))
  ]);
  return {
    ...xmlEvidence,
    as2Folder: fs.existsSync(folder) ? path.relative(AS2_SCENE_ROOT, folder).replace(/\\/gu, "/") : null,
    islandXml: xmlEvidence.islandXml,
    firstScene: entry.roomParam || xmlEvidence.firstScene,
    keyScenes,
    sourceFiles: unique([
      ...sceneFiles.map((name) => path.join("packs/zh-CN/as2/swf/content/www.poptropica.com/scenes", `island${entry.sceneFolder}`, name).replace(/\\/gu, "/")),
      ...xmlEvidence.sourceFiles
    ])
  };
}

function buildRoute(entry) {
  const evidence = entry.sourceGroup === "as2" ? buildAs2Evidence(entry) : buildAs3Evidence(entry);
  const routeNodes = [
    {
      id: "start",
      kind: "start",
      target: evidence.firstScene || entry.roomParam || entry.as3TargetScene,
      evidence: ["launchHealth", "window", "visibleStage"]
    },
    {
      id: "scene-transition",
      kind: "scene",
      targets: evidence.keyScenes.slice(0, Math.max(1, Math.min(4, evidence.keyScenes.length))),
      evidence: ["targetSceneRequest", "sceneVisible"]
    },
    {
      id: "item-interaction",
      kind: "item",
      targets: evidence.requiredItems.slice(0, 3),
      evidence: evidence.requiredItems.length ? ["itemRequest", "itemState"] : ["noItemMetadata"]
    },
    {
      id: "npc-interaction",
      kind: "npc",
      targets: evidence.keyNpcs.slice(0, 3),
      evidence: evidence.keyNpcs.length ? ["npcVisible", "dialogueVisible"] : ["noNpcMetadata"]
    },
    {
      id: "minigame",
      kind: "minigame",
      targets: evidence.minigames.slice(0, 4),
      evidence: evidence.minigames.length ? ["minigameEntered", "minigameAction", "minigameResult"] : ["notRequired"]
    },
    {
      id: "settlement",
      kind: "settlement",
      targets: evidence.settlementEvents.slice(-5),
      evidence: evidence.settlementEvents.length ? ["completionEvent", "settlementVisible"] : ["completionMetadataMissing"]
    },
    {
      id: "reward",
      kind: "reward",
      targets: evidence.reward ? [evidence.reward] : [],
      evidence: evidence.reward ? ["rewardItem", "medallionVisible"] : ["rewardMetadataMissing"]
    }
  ];
  return {
    canonicalKey: entry.canonicalKey,
    displayName: entry.title || entry.name || entry.canonicalKey,
    source: entry.sourceGroup,
    launchMode: entry.launchMode,
    launchUrl: entry.launchUrl,
    internalIsland: entry.islandParam,
    routeNodes,
    metadata: evidence,
    verification: {
      fullRouteVerified: false,
      saveReloadVerified: false,
      renderedChineseVerified: false,
      windowStableVerified: false,
      reportPath: null
    }
  };
}

function main() {
  const config = loadConfig();
  const manifest = generateLaunchManifest(config, { write: false });
  const entries = manifest.entries
    .filter((entry) => entry.launchable && ["as2", "as3"].includes(entry.sourceGroup))
    .sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey, "en"));
  const routes = entries.map(buildRoute);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const result = {
    generatedAt: new Date().toISOString(),
    sourceRevision: getProjectRevision(),
    total: routes.length,
    routes
  };
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(JSON.stringify({
    ok: routes.length === 47,
    outputPath: OUTPUT_PATH,
    sourceRevision: result.sourceRevision,
    total: routes.length,
    as2: routes.filter((route) => route.source === "as2").length,
    as3: routes.filter((route) => route.source === "as3").length,
    missingMetadata: routes.filter((route) =>
      route.metadata.keyScenes.length === 0 ||
      route.metadata.requiredItems.length === 0 ||
      route.metadata.settlementEvents.length === 0
    ).map((route) => route.canonicalKey)
  }, null, 2));
}

main();
