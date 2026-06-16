const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { buildCatalogIndex } = require("./lib/catalog");
const { fileExists, readJson, writeJson } = require("./lib/fs-utils");
const { generateLaunchManifest } = require("./lib/launch-manifest");
const { detectSteamPoptropica } = require("./lib/steam-detect");
const paths = require("./lib/paths");

const SOURCE_GROUPS = ["as2", "as3"];

function normalizeArchiveEntry(value) {
  return String(value || "").replace(/\\/gu, "/");
}

function listArchiveEntries(archivePath, tarBin) {
  if (!archivePath || !tarBin || !fileExists(archivePath) || !fileExists(tarBin)) {
    return {
      ok: false,
      archivePath,
      entryCount: 0,
      entries: [],
      error: "archive or tar binary is not configured"
    };
  }

  const result = spawnSync(tarBin, ["-tf", archivePath], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 256,
    timeout: 120000
  });
  if (result.status !== 0) {
    return {
      ok: false,
      archivePath,
      entryCount: 0,
      entries: [],
      error: (result.stderr || result.stdout || "tar list failed").trim()
    };
  }

  const entries = String(result.stdout || "")
    .split(/\r?\n/u)
    .map((line) => normalizeArchiveEntry(line.trim()))
    .filter(Boolean);
  return {
    ok: true,
    archivePath,
    entryCount: entries.length,
    entries,
    error: null
  };
}

function sampleMatches(entries, predicate, limit = 20) {
  const matches = [];
  for (const entry of entries) {
    if (!predicate(entry)) {
      continue;
    }
    matches.push(entry);
    if (matches.length >= limit) {
      break;
    }
  }
  return matches;
}

function findAs3SceneEvidence(entries, sceneFolder, roomParam) {
  const scene = String(sceneFolder || "").trim();
  const room = String(roomParam || "").trim();
  const scenePrefix = `content/www.poptropica.com/game/data/scenes/${scene}/`;
  const roomDataPrefix = `${scenePrefix}${room}/`;
  const roomAssetPrefix = `content/www.poptropica.com/game/assets/scenes/${scene}/${room}/`;
  const mapMetadataPrefix = `content/www.poptropica.com/game/data/scenes/map/map/islands/${scene}/`;

  return {
    expectedSceneFolder: scene || null,
    expectedRoom: room || null,
    dataSceneEntryCount: entries.filter((entry) => entry.startsWith(scenePrefix)).length,
    dataRoomEntryCount: entries.filter((entry) => entry.startsWith(roomDataPrefix)).length,
    assetRoomEntryCount: entries.filter((entry) => entry.startsWith(roomAssetPrefix)).length,
    mapMetadataEntryCount: entries.filter((entry) => entry.startsWith(mapMetadataPrefix)).length,
    dataRoomSamples: sampleMatches(entries, (entry) => entry.startsWith(roomDataPrefix)),
    assetRoomSamples: sampleMatches(entries, (entry) => entry.startsWith(roomAssetPrefix)),
    mapMetadataSamples: sampleMatches(entries, (entry) => entry.startsWith(mapMetadataPrefix)),
    tokenSamples: sampleMatches(entries, (entry) => scene && new RegExp(scene.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "iu").test(entry), 40)
  };
}

function findAs2LegacyEvidence(entries, canonicalKey) {
  if (canonicalKey !== "reality-tv-wild-safari") {
    return {
      legacyRealityEntryCount: 0,
      legacyRealitySamples: []
    };
  }
  const legacyPattern = /content\/www\.poptropica\.com\/scenes\/islandReality\/scene[^/]+\.swf$/iu;
  const legacySamples = sampleMatches(entries, (entry) => legacyPattern.test(entry), 40);
  return {
    legacyRealityEntryCount: entries.filter((entry) => legacyPattern.test(entry)).length,
    legacyRealitySamples: legacySamples,
    note: legacySamples.length > 0
      ? "These are original AS2 Reality TV Island bundles, not AS3 reality2 playable scene resources."
      : null
  };
}

function candidateSummary(candidates, config, steamDetection) {
  return candidates.map((candidate) => {
    if (candidate.source === "steam") {
      return {
        id: candidate.id,
        source: candidate.source,
        runtime: candidate.runtime,
        launchId: candidate.launchId,
        configured: Boolean(config.sources.steamRoot),
        rootExists: Boolean(config.sources.steamRoot && fileExists(config.sources.steamRoot)),
        detectedInstallCandidateCount: steamDetection.summary.existingCandidateInstallDirCount,
        localMatchCount: steamDetection.summary.uniqueRealityTokenMatchCount,
        realityAssetCandidateCount: steamDetection.summary.realityAssetCandidateCount,
        poptropicaAppCount: steamDetection.summary.poptropicaAppCount
      };
    }
    return {
      id: candidate.id,
      source: candidate.source,
      runtime: candidate.runtime,
      launchId: candidate.launchId,
      configured: candidate.source === "as2"
        ? Boolean(config.sources.as2Gamezip && fileExists(config.sources.as2Gamezip))
        : candidate.source === "as3"
          ? Boolean(config.sources.as3Gamezip && fileExists(config.sources.as3Gamezip))
          : false
    };
  });
}

function buildUnresolvedDiagnostics({ manifest, config, archives, catalog, overrides, steamDetection }) {
  return (manifest.entries || [])
    .filter((entry) => !entry.launchable)
    .map((entry) => {
      const candidates = catalog.byCanonical.get(entry.canonicalKey) || [];
      const override = overrides?.[entry.sourceGroup]?.[entry.canonicalKey] || null;
      const archive = archives[entry.sourceGroup] || { entries: [] };
      const sceneFolder = override?.sceneFolder || candidates.find((candidate) => candidate.source === entry.sourceGroup)?.launchId || null;
      const roomParam = override?.roomParam || null;
      const diagnostics = {
        canonicalKey: entry.canonicalKey,
        sourceGroup: entry.sourceGroup,
        notes: entry.notes || [],
        override,
        candidates: candidateSummary(candidates, config, steamDetection),
        archive: {
          ok: archive.ok,
          path: archive.archivePath || null,
          entryCount: archive.entryCount || 0,
          error: archive.error || null
        }
      };

      if (entry.sourceGroup === "as3") {
        diagnostics.as3SceneEvidence = findAs3SceneEvidence(archive.entries || [], sceneFolder, roomParam);
      }
      if (entry.sourceGroup === "as2") {
        diagnostics.as2SceneEvidence = findAs2LegacyEvidence(archive.entries || [], entry.canonicalKey);
      } else {
        diagnostics.as2LegacyEvidence = findAs2LegacyEvidence(archives.as2?.entries || [], entry.canonicalKey);
      }
      diagnostics.steamEvidence = steamDetection;
      diagnostics.conclusion = diagnostics.as3SceneEvidence &&
        diagnostics.as3SceneEvidence.dataRoomEntryCount === 0 &&
        diagnostics.as3SceneEvidence.assetRoomEntryCount === 0
        ? "Missing playable AS3 scene data/assets for the configured override; map metadata and AS2 legacy bundles are insufficient."
        : "Unresolved launch scene requires further source inspection.";
      return diagnostics;
    });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const manifest = generateLaunchManifest(config, { write: false });
  const catalog = buildCatalogIndex();
  const overrides = readJson(paths.launchOverridesPath, { as2: {}, as3: {} });
  const archives = {
    as2: listArchiveEntries(config.sources.as2Gamezip, config.tools.tarBin),
    as3: listArchiveEntries(config.sources.as3Gamezip, config.tools.tarBin)
  };
  const steamDetection = detectSteamPoptropica({
    configuredSteamRoot: config.sources.steamRoot,
    maxScanEntries: args["max-scan-entries"] || args.maxScanEntries
  });
  const unresolved = buildUnresolvedDiagnostics({
    manifest,
    config,
    archives,
    catalog,
    overrides,
    steamDetection
  });
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    summary: {
      manifestTotalEntries: manifest.summary.totalEntries,
      manifestLaunchableCount: manifest.summary.launchableCount,
      manifestUnresolvedCount: manifest.summary.unresolvedCount,
      unresolvedCount: unresolved.length,
      unresolvedWithSteamCandidateCount: unresolved.filter((item) => item.candidates.some((candidate) => candidate.source === "steam")).length,
      steamRootConfigured: Boolean(config.sources.steamRoot),
      steamRootExists: Boolean(config.sources.steamRoot && fileExists(config.sources.steamRoot)),
      steamInstallRootCount: steamDetection.summary.existingSteamInstallRootCount,
      steamLibraryRootCount: steamDetection.summary.existingLibraryRootCount,
      steamPoptropicaCandidateCount: steamDetection.summary.existingCandidateInstallDirCount,
      steamRealityAssetCandidateCount: steamDetection.summary.realityAssetCandidateCount
    },
    steamDetection: {
      generatedAt: steamDetection.generatedAt,
      summary: steamDetection.summary,
      suggestions: steamDetection.suggestions
    },
    archives: Object.fromEntries(SOURCE_GROUPS.map((sourceGroup) => [
      sourceGroup,
      {
        ok: archives[sourceGroup].ok,
        path: archives[sourceGroup].archivePath || null,
        entryCount: archives[sourceGroup].entryCount || 0,
        error: archives[sourceGroup].error || null
      }
    ])),
    unresolved
  };

  const outputPath = args.output || args.report || path.join(paths.qaDir, "launch-manifest-gaps-latest.json");
  writeJson(outputPath, report);
  printJson({
    ok: report.ok,
    generatedAt: report.generatedAt,
    summary: report.summary,
    reportPath: outputPath
  });
}

main();
