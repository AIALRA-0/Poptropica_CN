const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { fileExists, writeJson } = require("./lib/fs-utils");
const { generateLaunchManifest } = require("./lib/launch-manifest");

const AUDIO_EXTENSION_RE = /\.(?:mp3|wav|flv|ogg)$/iu;
const SOUNDS_XML_RE = /(?:^|\/)sounds\.xml$/iu;

function listArchiveEntries(archivePath, tarBin) {
  if (!archivePath || !fileExists(archivePath)) {
    return [];
  }
  if (!tarBin || !fileExists(tarBin)) {
    throw new Error("A tar executable is required to list zip contents.");
  }
  const result = spawnSync(tarBin, ["-tf", archivePath], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 256
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `Unable to list ${archivePath}`).trim());
  }
  return result.stdout
    .split(/\r?\n/gu)
    .map((line) => line.trim().replace(/\\/gu, "/"))
    .filter(Boolean);
}

function makeBucket(key, sourceGroup) {
  return {
    key,
    sourceGroup,
    audioFiles: 0,
    soundXmlFiles: 0,
    sampleAudio: [],
    sampleSoundXml: []
  };
}

function addSample(list, value, max = 8) {
  if (list.length < max) {
    list.push(value);
  }
}

function collectAs2(entries) {
  const byFolder = new Map();
  const other = makeBucket("_other", "as2");

  for (const entry of entries) {
    const isAudio = AUDIO_EXTENSION_RE.test(entry);
    const isSoundsXml = SOUNDS_XML_RE.test(entry);
    if (!isAudio && !isSoundsXml) {
      continue;
    }

    const match = entry.match(/content\/www\.poptropica\.com\/scenes\/island([^/]+)\//iu);
    const key = match ? match[1] : "_other";
    const bucket = match
      ? (byFolder.get(key) || makeBucket(key, "as2"))
      : other;
    if (isAudio) {
      bucket.audioFiles += 1;
      addSample(bucket.sampleAudio, entry);
    }
    if (isSoundsXml) {
      bucket.soundXmlFiles += 1;
      addSample(bucket.sampleSoundXml, entry);
    }
    if (match) {
      byFolder.set(key, bucket);
    }
  }

  const buckets = [...byFolder.values()].sort((left, right) => left.key.localeCompare(right.key, "en"));
  if (other.audioFiles || other.soundXmlFiles) {
    buckets.push(other);
  }
  return buckets;
}

function collectAs3(entries) {
  const byFolder = new Map();
  const other = makeBucket("_other", "as3");

  for (const entry of entries) {
    const isAudio = AUDIO_EXTENSION_RE.test(entry);
    const isSoundsXml = SOUNDS_XML_RE.test(entry);
    if (!isAudio && !isSoundsXml) {
      continue;
    }

    const match = entry.match(/content\/www\.poptropica\.com\/game\/(?:assets|data)\/scenes\/([^/]+)\//iu);
    const key = match ? match[1] : "_other";
    const bucket = match
      ? (byFolder.get(key) || makeBucket(key, "as3"))
      : other;
    if (isAudio) {
      bucket.audioFiles += 1;
      addSample(bucket.sampleAudio, entry);
    }
    if (isSoundsXml) {
      bucket.soundXmlFiles += 1;
      addSample(bucket.sampleSoundXml, entry);
    }
    if (match) {
      byFolder.set(key, bucket);
    }
  }

  const buckets = [...byFolder.values()].sort((left, right) => left.key.localeCompare(right.key, "en"));
  if (other.audioFiles || other.soundXmlFiles) {
    buckets.push(other);
  }
  return buckets;
}

function indexBuckets(buckets) {
  return new Map(buckets.map((bucket) => [String(bucket.key).toLowerCase(), bucket]));
}

function summarizeManifest(manifest, as2Buckets, as3Buckets) {
  const as2Index = indexBuckets(as2Buckets);
  const as3Index = indexBuckets(as3Buckets);
  return manifest.entries.map((entry) => {
    const key = String(entry.sceneFolder || entry.islandParam || "").toLowerCase();
    const bucket = entry.sourceGroup === "as2" ? as2Index.get(key) : as3Index.get(key);
    return {
      canonicalKey: entry.canonicalKey,
      sourceGroup: entry.sourceGroup,
      launchable: Boolean(entry.launchable),
      sceneFolder: entry.sceneFolder || null,
      roomParam: entry.roomParam || null,
      audioFiles: bucket?.audioFiles || 0,
      soundXmlFiles: bucket?.soundXmlFiles || 0,
      hasAudioAssets: Boolean((bucket?.audioFiles || 0) > 0 || (bucket?.soundXmlFiles || 0) > 0),
      sampleAudio: bucket?.sampleAudio || [],
      sampleSoundXml: bucket?.sampleSoundXml || []
    };
  });
}

function sum(buckets, key) {
  return buckets.reduce((total, bucket) => total + Number(bucket[key] || 0), 0);
}

function main() {
  const config = loadConfig();
  const manifest = generateLaunchManifest(config, { write: false });
  const as2Entries = listArchiveEntries(config.sources.as2Gamezip, config.tools.tarBin);
  const as3Entries = listArchiveEntries(config.sources.as3Gamezip, config.tools.tarBin);
  const as2Buckets = collectAs2(as2Entries);
  const as3Buckets = collectAs3(as3Entries);
  const islands = summarizeManifest(manifest, as2Buckets, as3Buckets);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    sources: {
      as2Gamezip: config.sources.as2Gamezip,
      as3Gamezip: config.sources.as3Gamezip
    },
    summary: {
      as2AudioFiles: sum(as2Buckets, "audioFiles"),
      as2SoundXmlFiles: sum(as2Buckets, "soundXmlFiles"),
      as2FoldersWithAudio: as2Buckets.filter((bucket) => bucket.key !== "_other" && (bucket.audioFiles || bucket.soundXmlFiles)).length,
      as3AudioFiles: sum(as3Buckets, "audioFiles"),
      as3SoundXmlFiles: sum(as3Buckets, "soundXmlFiles"),
      as3FoldersWithAudio: as3Buckets.filter((bucket) => bucket.key !== "_other" && (bucket.audioFiles || bucket.soundXmlFiles)).length,
      catalogEntriesWithAudio: islands.filter((entry) => entry.hasAudioAssets).length,
      catalogEntriesWithoutAudio: islands.filter((entry) => !entry.hasAudioAssets).length
    },
    byArchiveFolder: {
      as2: as2Buckets,
      as3: as3Buckets
    },
    byCatalogEntry: islands
  };

  const reportPath = path.join(paths.qaDir, "audio-assets-audit.json");
  writeJson(reportPath, report);
  console.log(JSON.stringify({ ...report.summary, reportPath }, null, 2));
}

main();
