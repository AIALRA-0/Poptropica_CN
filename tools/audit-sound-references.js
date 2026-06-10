const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { fileExists, writeJson } = require("./lib/fs-utils");

const SOUND_XML_RE = /content\/www\.poptropica\.com\/game\/data\/scenes\/[^/]+\/[^/]+\/sounds\.xml$/iu;
const SOUND_FILE_RE = /content\/www\.poptropica\.com\/game\/sound\/.*\.(?:mp3|wav|ogg)$/iu;
const AUDIO_EXTENSION_RE = /\.(?:mp3|wav|ogg)$/iu;
const SOUND_DIR_BY_TYPE = {
  ambient: "ambient",
  effects: "effects",
  music: "music"
};

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, ...rest] = arg.slice(2).split("=");
    args[key] = rest.length ? rest.join("=") : "1";
  }
  return args;
}

function listArchiveEntries(archivePath, tarBin) {
  if (!archivePath || !fileExists(archivePath)) {
    throw new Error(`Archive not found: ${archivePath || "(empty)"}`);
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
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/\\/gu, "/"))
    .filter(Boolean);
}

function readArchiveEntry(archivePath, tarBin, entry) {
  const result = spawnSync(tarBin, ["-xOf", archivePath, entry], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `Unable to extract ${entry}`).trim());
  }
  return result.stdout;
}

function getAttr(attrs, name) {
  const match = String(attrs || "").match(new RegExp(`\\b${name}=["']([^"']+)`, "iu"));
  return match ? match[1] : "";
}

function stripXmlTags(value) {
  return String(value || "").replace(/<[^>]+>/gu, "").trim();
}

function splitAssetRefs(value) {
  return stripXmlTags(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function makeSoundFileIndex(entries) {
  const byLowerPath = new Set();
  const byBaseName = new Map();
  for (const entry of entries) {
    const normalized = entry.replace(/\\/gu, "/");
    byLowerPath.add(normalized.toLowerCase());
    if (!SOUND_FILE_RE.test(normalized)) {
      continue;
    }
    const baseName = normalized.split("/").pop().toLowerCase();
    if (!byBaseName.has(baseName)) {
      byBaseName.set(baseName, []);
    }
    byBaseName.get(baseName).push(normalized);
  }
  return { byLowerPath, byBaseName };
}

function candidatePaths(name, type) {
  const normalized = String(name || "").replace(/^\/+/u, "");
  const pathsOut = [];
  if (/^game\/sound\//iu.test(normalized)) {
    pathsOut.push(`content/www.poptropica.com/${normalized}`);
  }
  if (/^sound\//iu.test(normalized)) {
    pathsOut.push(`content/www.poptropica.com/game/${normalized}`);
  }
  const folder = SOUND_DIR_BY_TYPE[type] || type;
  if (folder) {
    pathsOut.push(`content/www.poptropica.com/game/sound/${folder}/${normalized}`);
  }
  pathsOut.push(`content/www.poptropica.com/game/sound/${normalized}`);
  return pathsOut;
}

function findExistingCandidate(candidates, fileIndex) {
  return candidates.find((candidate) => fileIndex.byLowerPath.has(candidate.toLowerCase())) || null;
}

function classifyReference(ref, fileIndex) {
  const name = ref.name;
  if (/^none$/iu.test(name)) {
    return { status: "ignored", reason: "none" };
  }

  const exact = findExistingCandidate(candidatePaths(name, ref.type), fileIndex);
  if (exact) {
    return { status: "resolved", match: exact };
  }

  const withExtension = AUDIO_EXTENSION_RE.test(name) ? null : `${name}.mp3`;
  if (withExtension) {
    const extensionMatch = findExistingCandidate(candidatePaths(withExtension, ref.type), fileIndex);
    if (extensionMatch) {
      return { status: "fixable_add_extension", fix: withExtension, match: extensionMatch };
    }
  }

  const dedupedExtension = name.replace(/\.mp3\.mp3$/iu, ".mp3");
  if (dedupedExtension !== name) {
    const dedupeMatch = findExistingCandidate(candidatePaths(dedupedExtension, ref.type), fileIndex);
    if (dedupeMatch) {
      return { status: "fixable_dedupe_extension", fix: dedupedExtension, match: dedupeMatch };
    }
  }

  const baseName = (withExtension || name).split("/").pop().toLowerCase();
  const crossFolderMatches = fileIndex.byBaseName.get(baseName) || [];
  if (crossFolderMatches.length > 0) {
    return { status: "cross_folder_match", match: crossFolderMatches.slice(0, 8) };
  }

  return { status: "missing" };
}

function extractSoundReferences(xml, soundsXmlPath) {
  const refs = [];
  const pathParts = soundsXmlPath.split("/");
  for (const soundMatch of String(xml || "").matchAll(/<sound\b([^>]*)>([\s\S]*?)<\/sound>/giu)) {
    const soundAttrs = soundMatch[1] || "";
    const soundBody = soundMatch[2] || "";
    const type = getAttr(soundAttrs, "type");
    const action = getAttr(soundAttrs, "action");
    for (const assetMatch of soundBody.matchAll(/<asset\b([^>]*)>([\s\S]*?)<\/asset>/giu)) {
      const assetAttrs = assetMatch[1] || "";
      for (const name of splitAssetRefs(assetMatch[2])) {
        refs.push({
          soundsXml: soundsXmlPath,
          sceneFolder: pathParts[5] || null,
          sceneRoom: pathParts[6] || null,
          type,
          action,
          id: getAttr(assetAttrs, "id") || null,
          name
        });
      }
    }
  }
  return refs;
}

function resolveArchivePath(config, args) {
  const requested = String(args.archive || "source");
  if (requested === "source") {
    return config.sources.as3Gamezip;
  }
  if (requested === "runtime") {
    return paths.as3RuntimeZipPath;
  }
  return path.resolve(requested);
}

function summarize(findings) {
  const counts = findings.reduce((acc, finding) => {
    acc[finding.status] = (acc[finding.status] || 0) + 1;
    return acc;
  }, {});
  return {
    totalReferences: findings.length,
    resolved: counts.resolved || 0,
    ignored: counts.ignored || 0,
    fixableAddExtension: counts.fixable_add_extension || 0,
    fixableDedupeExtension: counts.fixable_dedupe_extension || 0,
    crossFolderMatches: counts.cross_folder_match || 0,
    missing: counts.missing || 0
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const archivePath = resolveArchivePath(config, args);
  const entries = listArchiveEntries(archivePath, config.tools.tarBin);
  const soundXmlEntries = entries.filter((entry) => SOUND_XML_RE.test(entry));
  const fileIndex = makeSoundFileIndex(entries);
  const findings = [];

  for (const entry of soundXmlEntries) {
    const xml = readArchiveEntry(archivePath, config.tools.tarBin, entry);
    for (const ref of extractSoundReferences(xml, entry)) {
      findings.push({
        ...ref,
        ...classifyReference(ref, fileIndex)
      });
    }
  }

  const summary = summarize(findings);
  const report = {
    ok: summary.missing === 0 && summary.fixableAddExtension === 0 && summary.fixableDedupeExtension === 0,
    generatedAt: new Date().toISOString(),
    archivePath,
    soundsXmlCount: soundXmlEntries.length,
    summary,
    findings: findings.filter((finding) => finding.status !== "resolved")
  };
  const outputPath = path.resolve(args.output || path.join(paths.qaDir, "sound-reference-audit.json"));
  writeJson(outputPath, report);
  console.log(JSON.stringify({ ...summary, soundsXmlCount: soundXmlEntries.length, reportPath: outputPath }, null, 2));

  if (args.failOnMissing === "1" && !report.ok) {
    process.exitCode = 1;
  }
}

main();
