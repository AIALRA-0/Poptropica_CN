const path = require("node:path");
const { spawnSync } = require("node:child_process");
const zlib = require("node:zlib");
const paths = require("./paths");
const { loadConfig } = require("./config");
const { buildCatalogIndex } = require("./catalog");
const { fileExists, readJson, writeJson } = require("./fs-utils");

const AS2_ROOM_PRIORITY = [
  "City2",
  "MainStreet",
  "Mainstreet",
  "Main",
  "RealityMain",
  "TradeMain",
  "CounterMain",
  "NabootiMain",
  "AstroMain",
  "Present"
];

const AS3_ROOM_PRIORITY = [
  "mainStreet",
  "town",
  "mainLand",
  "landing",
  "beach",
  "center",
  "spacePort",
  "bazaar",
  "reef",
  "crashLanding",
  "mainHall",
  "lobby",
  "intro",
  "startScreen",
  "login"
];
const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";

function capitalizeFirst(value) {
  const text = String(value || "");
  return text ? `${text.slice(0, 1).toUpperCase()}${text.slice(1)}` : "";
}

function toAs3SceneClass(sceneFolder, roomParam) {
  const islandPackage = String(sceneFolder || "");
  const roomPackage = String(roomParam || "");
  const roomClass = roomPackage
    .split(/[^a-z0-9]+/iu)
    .filter(Boolean)
    .map(capitalizeFirst)
    .join("");
  if (!islandPackage || !roomPackage || !roomClass) {
    return null;
  }
  return `game.scenes.${islandPackage}.${roomPackage}.${roomClass}`;
}

function listArchiveEntries(archivePath, tarBin) {
  if (!archivePath || !fileExists(archivePath) || !tarBin || !fileExists(tarBin)) {
    return [];
  }
  const result = spawnSync(tarBin, ["-tf", archivePath], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 128
  });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function extractArchiveEntry(archivePath, tarBin, entryPath) {
  if (!archivePath || !fileExists(archivePath) || !tarBin || !fileExists(tarBin)) {
    return null;
  }
  const result = spawnSync(tarBin, ["-xOf", archivePath, entryPath], {
    encoding: "buffer",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64,
    timeout: 120000
  });
  if (result.status !== 0 || !result.stdout || result.stdout.length === 0) {
    return null;
  }
  return result.stdout;
}

function inflateSwfForStringSearch(buffer) {
  if (!buffer || buffer.length < 8) {
    return null;
  }
  const signature = buffer.subarray(0, 3).toString("ascii");
  if (signature === "CWS") {
    try {
      return Buffer.concat([Buffer.from("FWS"), buffer.subarray(3, 8), zlib.unzipSync(buffer.subarray(8))]);
    } catch (_error) {
      return null;
    }
  }
  if (signature === "FWS") {
    return buffer;
  }
  return buffer;
}

function readAs3ShellClassEvidence(archivePath, tarBin) {
  const shellBuffer = extractArchiveEntry(archivePath, tarBin, AS3_SHELL_PATH);
  const inflated = inflateSwfForStringSearch(shellBuffer);
  return {
    inspected: Boolean(inflated),
    shellPath: AS3_SHELL_PATH,
    compressedBytes: shellBuffer?.length || 0,
    searchableBytes: inflated?.length || 0,
    buffer: inflated
  };
}

function shellContainsTargetClass(shellEvidence, as3TargetScene, sceneFolder) {
  if (!shellEvidence?.inspected || !shellEvidence.buffer || !as3TargetScene) {
    return null;
  }
  const candidates = [
    as3TargetScene,
    sceneFolder ? `game.scenes.${sceneFolder}` : null
  ].filter(Boolean);
  return candidates.some((candidate) => shellEvidence.buffer.includes(Buffer.from(candidate, "utf8")));
}

function resolveLaunchArchivePath(sourceGroup, config = loadConfig()) {
  const sourceZip = config.sources[sourceGroup === "as2" ? "as2Gamezip" : "as3Gamezip"];
  const runtimeZip = sourceGroup === "as2" ? paths.as2RuntimeZipPath : paths.as3RuntimeZipPath;
  if (runtimeZip && fileExists(runtimeZip)) {
    return {
      archivePath: runtimeZip,
      sourceZip: sourceZip || null,
      runtimeZip,
      usesRuntimeZip: true
    };
  }
  return {
    archivePath: sourceZip || null,
    sourceZip: sourceZip || null,
    runtimeZip,
    usesRuntimeZip: false
  };
}

function loadLaunchOverrides() {
  return readJson(paths.launchOverridesPath, { as2: {}, as3: {} }) || { as2: {}, as3: {} };
}

function buildAs2SceneMap(entries) {
  const sceneMap = new Map();
  for (const entry of entries) {
    const match = entry.match(/content\/www\.poptropica\.com\/scenes\/island([^/]+)\/scene([^/]+)\.swf$/iu);
    if (!match) {
      continue;
    }
    const sceneFolder = match[1];
    const room = match[2];
    if (!sceneMap.has(sceneFolder)) {
      sceneMap.set(sceneFolder, new Set());
    }
    sceneMap.get(sceneFolder).add(room);
  }
  return sceneMap;
}

function buildAs3SceneMap(entries) {
  const sceneMap = new Map();
  for (const entry of entries) {
    const match = entry.match(/content\/www\.poptropica\.com\/game\/data\/scenes\/([^/]+)\/([^/]+)/iu);
    if (!match) {
      continue;
    }
    const sceneFolder = match[1];
    const room = match[2];
    if (!sceneMap.has(sceneFolder)) {
      sceneMap.set(sceneFolder, new Set());
    }
    sceneMap.get(sceneFolder).add(room);
  }
  return sceneMap;
}

function chooseRoom(rooms, priorities) {
  for (const candidate of priorities) {
    if (rooms.has(candidate)) {
      return candidate;
    }
  }
  const viable = [...rooms].filter((room) => !/\.xml$/iu.test(room) && room !== "shared" && room !== "common");
  return viable.sort((left, right) => left.localeCompare(right))[0] || null;
}

function buildLaunchUrl({ sourceGroup, roomParam, islandParam, startupPath, as3TargetScene }) {
  if (sourceGroup === "as3") {
    return as3TargetScene
      ? `http://www.poptropica.com/game/Shell.swf?island&overrideScene=${encodeURIComponent(as3TargetScene)}`
      : "http://www.poptropica.com/base.php?room=FlashpointStart";
  }

  return `http://www.poptropica.com/base.php?room=${encodeURIComponent(roomParam)}&island=${encodeURIComponent(islandParam)}&startup_path=${encodeURIComponent(startupPath || "gameplay")}`;
}

function buildEntry({ catalogEntry, sourceGroup, sceneFolder, roomParam, islandParam, startupPath, discoveredRooms, shellEvidence }) {
  const resolvedStartupPath = startupPath || "gameplay";
  const as3TargetScene = sourceGroup === "as3" ? toAs3SceneClass(sceneFolder, roomParam) : null;
  const classPresent = sourceGroup === "as3" ? shellContainsTargetClass(shellEvidence, as3TargetScene, sceneFolder) : null;

  if (!sceneFolder || !roomParam || !islandParam || !discoveredRooms || discoveredRooms.size === 0) {
    return {
      canonicalKey: catalogEntry.canonicalKey,
      sourceGroup,
      runtime: "flash",
      launchable: false,
      fallbackMode: "unresolved",
      startupPath: resolvedStartupPath,
      notes: ["No stable launch scene could be resolved from the current gamezip."]
    };
  }
  if (sourceGroup === "as3" && classPresent === false) {
    return {
      canonicalKey: catalogEntry.canonicalKey,
      sourceGroup,
      runtime: "flash",
      launchable: false,
      fallbackMode: "unresolved",
      startupPath: resolvedStartupPath,
      sceneFolder,
      roomParam,
      islandParam,
      discoveredRooms: discoveredRooms ? [...discoveredRooms].sort() : [],
      as3TargetScene,
      classEvidence: {
        shellPath: shellEvidence.shellPath,
        inspected: shellEvidence.inspected,
        compressedBytes: shellEvidence.compressedBytes,
        searchableBytes: shellEvidence.searchableBytes,
        targetClassPresent: false
      },
      notes: [`AS3 Shell does not contain target scene class ${as3TargetScene}.`]
    };
  }

  return {
    canonicalKey: catalogEntry.canonicalKey,
    sourceGroup,
    runtime: "flash",
    launchable: true,
    islandParam,
    roomParam,
    startupPath: resolvedStartupPath,
    sceneFolder,
    discoveredRooms: discoveredRooms ? [...discoveredRooms].sort() : [],
    fallbackMode: sourceGroup === "as3" ? "as3-direct-shell" : "base-php",
    launchMode: sourceGroup === "as3" ? "as3-direct-scene" : "as2-scene",
    launchUrl: buildLaunchUrl({ sourceGroup, roomParam, islandParam, startupPath: resolvedStartupPath, as3TargetScene }),
    ...(as3TargetScene ? { as3TargetScene } : {}),
    ...(sourceGroup === "as3"
      ? {
          classEvidence: {
            shellPath: shellEvidence?.shellPath || AS3_SHELL_PATH,
            inspected: Boolean(shellEvidence?.inspected),
            compressedBytes: shellEvidence?.compressedBytes || 0,
            searchableBytes: shellEvidence?.searchableBytes || 0,
            targetClassPresent: classPresent
          }
        }
      : {})
  };
}

function discoverAs2Entries(as2Entries, sceneMap, overrides) {
  return as2Entries.map((entry) => {
    const override = overrides[entry.canonicalKey] || {};
    const sceneFolder = override.sceneFolder || entry.launchId;
    const discoveredRooms = sceneMap.get(sceneFolder) || new Set();
    const roomParam = override.roomParam || chooseRoom(discoveredRooms, AS2_ROOM_PRIORITY);
    const islandParam = override.islandParam || entry.launchId;
    return buildEntry({
      catalogEntry: entry,
      sourceGroup: "as2",
      sceneFolder,
      roomParam,
      islandParam,
      startupPath: override.startupPath || "gameplay",
      discoveredRooms
    });
  });
}

function discoverAs3Entries(as3Entries, sceneMap, overrides, shellEvidence) {
  return as3Entries.map((entry) => {
    const override = overrides[entry.canonicalKey] || {};
    const sceneFolder = override.sceneFolder || entry.launchId;
    const discoveredRooms = sceneMap.get(sceneFolder) || new Set();
    const roomParam = override.roomParam || chooseRoom(discoveredRooms, AS3_ROOM_PRIORITY);
    const islandParam = override.islandParam || sceneFolder;
    return buildEntry({
      catalogEntry: entry,
      sourceGroup: "as3",
      sceneFolder,
      roomParam,
      islandParam,
      startupPath: override.startupPath || "gameplay",
      discoveredRooms,
      shellEvidence
    });
  });
}

function generateLaunchManifest(config = loadConfig(), options = {}) {
  const { entries } = buildCatalogIndex();
  const launchOverrides = loadLaunchOverrides();
  const as2Catalog = entries.filter((entry) => entry.source === "as2");
  const as3Catalog = entries.filter((entry) => entry.source === "as3");
  const as2Archive = resolveLaunchArchivePath("as2", config);
  const as3Archive = resolveLaunchArchivePath("as3", config);

  const as2ArchiveEntries = listArchiveEntries(as2Archive.archivePath, config.tools.tarBin);
  const as3ArchiveEntries = listArchiveEntries(as3Archive.archivePath, config.tools.tarBin);

  const as2SceneMap = buildAs2SceneMap(as2ArchiveEntries);
  const as3SceneMap = buildAs3SceneMap(as3ArchiveEntries);
  const as3ShellEvidence = readAs3ShellClassEvidence(as3Archive.archivePath, config.tools.tarBin);

  const as2 = discoverAs2Entries(as2Catalog, as2SceneMap, launchOverrides.as2 || {});
  const as3 = discoverAs3Entries(as3Catalog, as3SceneMap, launchOverrides.as3 || {}, as3ShellEvidence);
  const entriesOut = [...as2, ...as3];

  const manifest = {
    generatedAt: new Date().toISOString(),
    sources: {
      as2Configured: Boolean(config.sources.as2Gamezip),
      as3Configured: Boolean(config.sources.as3Gamezip),
      as2Archive,
      as3Archive
    },
    as3Shell: {
      shellPath: as3ShellEvidence.shellPath,
      inspected: as3ShellEvidence.inspected,
      compressedBytes: as3ShellEvidence.compressedBytes,
      searchableBytes: as3ShellEvidence.searchableBytes
    },
    summary: {
      totalEntries: entriesOut.length,
      launchableCount: entriesOut.filter((entry) => entry.launchable).length,
      unresolvedCount: entriesOut.filter((entry) => !entry.launchable).length
    },
    entries: entriesOut
  };
  if (options.write !== false) {
    writeJson(paths.launchManifestPath, manifest);
  }
  return manifest;
}

function loadLaunchManifest() {
  return readJson(paths.launchManifestPath, null);
}

function getLaunchEntry(canonicalKey) {
  const manifest = loadLaunchManifest();
  return manifest?.entries?.find((entry) => entry.canonicalKey === canonicalKey) || null;
}

module.exports = {
  generateLaunchManifest,
  getLaunchEntry,
  loadLaunchManifest,
  resolveLaunchArchivePath,
  shellContainsTargetClass
};
