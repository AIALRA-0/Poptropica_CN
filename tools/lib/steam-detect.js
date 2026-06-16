const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { fileExists, sanitizePathInput } = require("./fs-utils");
const paths = require("./paths");

const REALITY_PATTERNS = [
  /reality[-_\s]?tv[-_\s]?wild[-_\s]?safari/iu,
  /reality2/iu,
  /reality_safari/iu
];

const POPTROPICA_PATTERN = /\bpoptropica\b/iu;
const SKIP_DIR_PATTERN = /^(appcache|depotcache|shadercache|logs|crash dumps|crashes)$/iu;

function normalizePathInput(value) {
  return sanitizePathInput(value);
}

function pathKey(value) {
  return String(value || "").toLowerCase();
}

function addPathRow(rows, seen, value, source, extra = {}) {
  const resolved = normalizePathInput(value);
  if (!resolved) {
    return null;
  }
  const key = pathKey(resolved);
  const existing = seen.get(key);
  if (existing) {
    if (!existing.sources.includes(source)) {
      existing.sources.push(source);
    }
    return existing;
  }
  const row = {
    path: resolved,
    exists: fileExists(resolved),
    sources: [source],
    ...extra
  };
  rows.push(row);
  seen.set(key, row);
  return row;
}

function queryRegistryValue(registryKey, valueName) {
  if (process.platform !== "win32") {
    return null;
  }
  const result = spawnSync("reg", ["query", registryKey, "/v", valueName], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000,
    maxBuffer: 1024 * 256
  });
  if (result.status !== 0) {
    return null;
  }
  const lines = String(result.stdout || "").split(/\r?\n/u);
  for (const line of lines) {
    const match = line.match(new RegExp(`^\\s*${valueName}\\s+REG_\\w+\\s+(.+?)\\s*$`, "iu"));
    if (match) {
      return match[1];
    }
  }
  return null;
}

function getRegistrySteamRoots() {
  const queries = [
    ["HKCU\\Software\\Valve\\Steam", "SteamPath"],
    ["HKCU\\Software\\Valve\\Steam", "InstallPath"],
    ["HKLM\\SOFTWARE\\Valve\\Steam", "InstallPath"],
    ["HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "InstallPath"]
  ];
  return queries
    .map(([registryKey, valueName]) => ({
      path: queryRegistryValue(registryKey, valueName),
      source: `registry:${registryKey}:${valueName}`
    }))
    .filter((entry) => entry.path);
}

function driveLettersToProbe() {
  const letters = new Set(["C", "D", "E", "F"]);
  const projectDrive = path.parse(paths.projectRoot).root.match(/^([A-Za-z]):\\/u)?.[1];
  if (projectDrive) {
    letters.add(projectDrive.toUpperCase());
  }
  const systemDrive = String(process.env.SystemDrive || "").match(/^([A-Za-z]):/u)?.[1];
  if (systemDrive) {
    letters.add(systemDrive.toUpperCase());
  }
  return [...letters].filter((letter) => fileExists(`${letter}:\\`));
}

function getCommonSteamRoots() {
  const roots = [];
  for (const value of [
    process.env.STEAM_PATH,
    process.env.STEAM_HOME,
    process.env.STEAM_DIR,
    process.env.SteamPath,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Steam"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Steam")
  ]) {
    if (value) {
      roots.push({ path: value, source: "environment-or-programfiles" });
    }
  }

  for (const letter of driveLettersToProbe()) {
    for (const suffix of [
      "Steam",
      "SteamLibrary",
      "Games\\Steam",
      "Games\\SteamLibrary",
      "Program Files\\Steam",
      "Program Files (x86)\\Steam"
    ]) {
      roots.push({ path: `${letter}:\\${suffix}`, source: "common-path" });
    }
  }
  return roots;
}

function discoverSteamRoots(configuredSteamRoot, options = {}) {
  const rows = [];
  const seen = new Map();
  if (configuredSteamRoot) {
    addPathRow(rows, seen, configuredSteamRoot, "configured-steam-root");
  }
  for (const entry of getRegistrySteamRoots()) {
    addPathRow(rows, seen, entry.path, entry.source);
  }
  if (options.includeCommonPaths !== false) {
    for (const entry of getCommonSteamRoots()) {
      addPathRow(rows, seen, entry.path, entry.source);
    }
  }
  return rows;
}

function valveUnescape(value) {
  return String(value || "")
    .replace(/\\\\/gu, "\\")
    .replace(/\\"/gu, "\"")
    .replace(/\\n/gu, "\n")
    .replace(/\\t/gu, "\t");
}

function tokenizeValveData(text) {
  const tokens = [];
  const pattern = /"((?:\\.|[^"\\])*)"|([{}])/gu;
  let match = null;
  while ((match = pattern.exec(String(text || "")))) {
    tokens.push(match[2] || valveUnescape(match[1]));
  }
  return tokens;
}

function parseValveData(text) {
  const tokens = tokenizeValveData(text);
  let index = 0;

  function parseObject() {
    const object = {};
    while (index < tokens.length) {
      const key = tokens[index++];
      if (key === "}") {
        break;
      }
      if (key === "{") {
        continue;
      }
      const next = tokens[index++];
      if (next === "{") {
        object[key] = parseObject();
      } else if (next !== undefined && next !== "}") {
        object[key] = next;
      } else {
        break;
      }
    }
    return object;
  }

  const root = {};
  while (index < tokens.length) {
    const key = tokens[index++];
    const next = tokens[index++];
    if (!key || key === "}" || next === undefined) {
      break;
    }
    if (next === "{") {
      root[key] = parseObject();
    } else if (next !== "}") {
      root[key] = next;
    }
  }
  return root;
}

function collectLibraryPathsFromValveObject(value, output = []) {
  if (!value || typeof value !== "object") {
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") {
      const looksLikePath = /[:\\/]/u.test(child);
      if (/^(path|baseinstallfolder_\d+)$/iu.test(key) || (/^\d+$/u.test(key) && looksLikePath)) {
        output.push(child);
      }
      continue;
    }
    collectLibraryPathsFromValveObject(child, output);
  }
  return output;
}

function readValveDataFile(filePath) {
  try {
    return {
      ok: true,
      data: parseValveData(fs.readFileSync(filePath, "utf8")),
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      data: null,
      error: error.message
    };
  }
}

function normalizeLibraryRoot(rootPath) {
  const resolved = normalizePathInput(rootPath);
  if (!resolved) {
    return null;
  }
  if (path.basename(resolved).toLowerCase() === "steamapps") {
    return path.dirname(resolved);
  }
  return resolved;
}

function libraryFoldersVdfCandidates(rootPath) {
  return [
    path.join(rootPath, "steamapps", "libraryfolders.vdf"),
    path.basename(rootPath).toLowerCase() === "steamapps"
      ? path.join(rootPath, "libraryfolders.vdf")
      : null
  ].filter(Boolean);
}

function discoverLibraryRoots(steamRoots) {
  const rows = [];
  const seen = new Map();

  for (const root of steamRoots) {
    if (!root.exists) {
      continue;
    }
    const libraryRoot = normalizeLibraryRoot(root.path);
    if (libraryRoot && fileExists(path.join(libraryRoot, "steamapps"))) {
      addPathRow(rows, seen, libraryRoot, root.sources.join("+"));
    }

    for (const vdfPath of libraryFoldersVdfCandidates(root.path)) {
      if (!fileExists(vdfPath)) {
        continue;
      }
      const parsed = readValveDataFile(vdfPath);
      if (!parsed.ok) {
        continue;
      }
      for (const libraryPath of collectLibraryPathsFromValveObject(parsed.data)) {
        addPathRow(rows, seen, libraryPath, `libraryfolders:${vdfPath}`);
      }
    }
  }

  return rows.map((row) => {
    const steamAppsPath = path.join(row.path, "steamapps");
    let manifestCount = 0;
    let commonDirExists = false;
    try {
      const entries = fs.readdirSync(steamAppsPath, { withFileTypes: true });
      manifestCount = entries.filter((entry) => entry.isFile() && /^appmanifest_\d+\.acf$/iu.test(entry.name)).length;
      commonDirExists = fileExists(path.join(steamAppsPath, "common"));
    } catch (_error) {
      // Keep the row; the caller needs to know the root was found but unreadable.
    }
    return {
      ...row,
      steamAppsPath,
      steamAppsExists: fileExists(steamAppsPath),
      commonDirExists,
      manifestCount
    };
  });
}

function getAppState(parsed) {
  return parsed?.AppState || parsed?.appstate || parsed?.Appstate || parsed || {};
}

function readAppManifests(libraryRoots) {
  const manifests = [];
  for (const libraryRoot of libraryRoots) {
    if (!libraryRoot.steamAppsExists) {
      continue;
    }
    let entries = [];
    try {
      entries = fs.readdirSync(libraryRoot.steamAppsPath, { withFileTypes: true });
    } catch (error) {
      manifests.push({
        libraryRoot: libraryRoot.path,
        manifestPath: null,
        ok: false,
        error: error.message,
        matched: false,
        matchReasons: []
      });
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !/^appmanifest_\d+\.acf$/iu.test(entry.name)) {
        continue;
      }
      const manifestPath = path.join(libraryRoot.steamAppsPath, entry.name);
      const parsed = readValveDataFile(manifestPath);
      const appState = getAppState(parsed.data);
      const appid = String(appState.appid || "").trim() || entry.name.match(/\d+/u)?.[0] || null;
      const name = String(appState.name || "").trim();
      const installdir = String(appState.installdir || "").trim();
      const installDir = installdir
        ? path.join(libraryRoot.steamAppsPath, "common", installdir)
        : null;
      const matchReasons = [];
      if (POPTROPICA_PATTERN.test(name)) {
        matchReasons.push("app-name");
      }
      if (POPTROPICA_PATTERN.test(installdir)) {
        matchReasons.push("install-dir");
      }
      manifests.push({
        libraryRoot: libraryRoot.path,
        manifestPath,
        ok: parsed.ok,
        error: parsed.error,
        appid,
        name,
        installdir,
        installDir,
        installDirExists: Boolean(installDir && fileExists(installDir)),
        matched: matchReasons.length > 0,
        matchReasons
      });
    }
  }
  return manifests;
}

function hasPoptropicaInstallMarkers(rootPath) {
  if (!rootPath || !fileExists(rootPath)) {
    return false;
  }
  const basename = path.basename(rootPath);
  if (POPTROPICA_PATTERN.test(basename)) {
    return true;
  }
  const markerNames = [
    "Poptropica.exe",
    "Poptropica_Data",
    "META-INF\\AIR\\application.xml",
    "game\\data\\scenes",
    "content\\www.poptropica.com"
  ];
  return markerNames.some((marker) => fileExists(path.join(rootPath, marker)));
}

function addCandidate(candidates, seen, candidate) {
  if (!candidate.path) {
    return null;
  }
  const resolved = normalizePathInput(candidate.path);
  if (!resolved) {
    return null;
  }
  const key = pathKey(resolved);
  const existing = seen.get(key);
  if (existing) {
    existing.sources = [...new Set([...existing.sources, ...candidate.sources])];
    existing.matchReasons = [...new Set([...existing.matchReasons, ...candidate.matchReasons])];
    return existing;
  }
  const row = {
    path: resolved,
    exists: fileExists(resolved),
    sources: candidate.sources,
    matchReasons: candidate.matchReasons,
    appid: candidate.appid || null,
    name: candidate.name || null,
    installdir: candidate.installdir || null,
    manifestPath: candidate.manifestPath || null
  };
  candidates.push(row);
  seen.set(key, row);
  return row;
}

function findCommonDirectoryCandidates(libraryRoots) {
  const candidates = [];
  for (const libraryRoot of libraryRoots) {
    const commonDir = path.join(libraryRoot.steamAppsPath, "common");
    if (!fileExists(commonDir)) {
      continue;
    }
    let entries = [];
    try {
      entries = fs.readdirSync(commonDir, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && POPTROPICA_PATTERN.test(entry.name)) {
        candidates.push({
          path: path.join(commonDir, entry.name),
          sources: ["steam-common-directory"],
          matchReasons: ["directory-name"]
        });
      }
    }
  }
  return candidates;
}

function buildInstallCandidates({ appManifests, libraryRoots, configuredSteamRoot }) {
  const candidates = [];
  const seen = new Map();
  for (const manifest of appManifests) {
    if (!manifest.matched || !manifest.installDir) {
      continue;
    }
    addCandidate(candidates, seen, {
      path: manifest.installDir,
      sources: ["appmanifest"],
      matchReasons: manifest.matchReasons,
      appid: manifest.appid,
      name: manifest.name,
      installdir: manifest.installdir,
      manifestPath: manifest.manifestPath
    });
  }
  for (const candidate of findCommonDirectoryCandidates(libraryRoots)) {
    addCandidate(candidates, seen, candidate);
  }
  if (hasPoptropicaInstallMarkers(configuredSteamRoot)) {
    addCandidate(candidates, seen, {
      path: configuredSteamRoot,
      sources: ["configured-direct-root"],
      matchReasons: ["install-marker"]
    });
  }
  return candidates;
}

function normalizeRelativePath(rootDir, fullPath) {
  return path.relative(rootDir, fullPath).replace(/\\/gu, "/");
}

function emptyAssetScan(rootDir, error = null) {
  return {
    root: rootDir,
    ok: !error,
    error,
    visited: 0,
    truncated: false,
    directoryCount: 0,
    fileCount: 0,
    realityTokenMatchCount: 0,
    realityTokenSamples: [],
    dataReality2MainStreetCount: 0,
    assetReality2MainStreetCount: 0,
    swfCount: 0,
    airFileCount: 0,
    archiveLikeCount: 0,
    audioFileCount: 0,
    hasReality2PlayableAssets: false
  };
}

function scanInstallDir(rootDir, options = {}) {
  if (!rootDir || !fileExists(rootDir)) {
    return emptyAssetScan(rootDir || null, "candidate install directory does not exist");
  }
  const maxEntries = Number(options.maxEntries || 120000);
  const samplesLimit = Number(options.samplesLimit || 80);
  const scan = emptyAssetScan(rootDir);
  const stack = [rootDir];

  while (stack.length > 0 && scan.visited < maxEntries) {
    const current = stack.pop();
    scan.visited += 1;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_error) {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relativePath = normalizeRelativePath(rootDir, fullPath);
      const relativeLower = relativePath.toLowerCase();
      if (REALITY_PATTERNS.some((pattern) => pattern.test(relativePath))) {
        scan.realityTokenMatchCount += 1;
        if (scan.realityTokenSamples.length < samplesLimit) {
          scan.realityTokenSamples.push(relativePath);
        }
      }

      if (entry.isDirectory()) {
        scan.directoryCount += 1;
        if (!SKIP_DIR_PATTERN.test(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }

      scan.fileCount += 1;
      if (/^game\/data\/scenes\/reality2\/mainstreet\//u.test(relativeLower) ||
          /\/game\/data\/scenes\/reality2\/mainstreet\//u.test(relativeLower)) {
        scan.dataReality2MainStreetCount += 1;
      }
      if (/^game\/assets\/scenes\/reality2\/mainstreet\//u.test(relativeLower) ||
          /\/game\/assets\/scenes\/reality2\/mainstreet\//u.test(relativeLower)) {
        scan.assetReality2MainStreetCount += 1;
      }
      if (/\.swf$/iu.test(entry.name)) {
        scan.swfCount += 1;
      }
      if (/\.air$/iu.test(entry.name)) {
        scan.airFileCount += 1;
      }
      if (/\.(zip|pak|bundle|assetbundle|unity3d|obb)$/iu.test(entry.name)) {
        scan.archiveLikeCount += 1;
      }
      if (/\.(mp3|wav|ogg|m4a|aac)$/iu.test(entry.name)) {
        scan.audioFileCount += 1;
      }
    }
  }

  scan.truncated = stack.length > 0;
  scan.hasReality2PlayableAssets =
    scan.dataReality2MainStreetCount > 0 ||
    scan.assetReality2MainStreetCount > 0 ||
    scan.realityTokenMatchCount > 0;
  return scan;
}

function buildSummary({ configuredSteamRoot, steamRoots, libraryRoots, appManifests, installCandidates }) {
  const existingInstallCandidates = installCandidates.filter((candidate) => candidate.exists);
  const realityAssetCandidates = existingInstallCandidates.filter((candidate) => candidate.assetScan?.hasReality2PlayableAssets);
  return {
    steamRootConfigured: Boolean(configuredSteamRoot),
    steamRootExists: Boolean(configuredSteamRoot && fileExists(configuredSteamRoot)),
    steamInstallRootCount: steamRoots.length,
    existingSteamInstallRootCount: steamRoots.filter((root) => root.exists).length,
    libraryRootCount: libraryRoots.length,
    existingLibraryRootCount: libraryRoots.filter((root) => root.exists && root.steamAppsExists).length,
    appManifestCount: appManifests.filter((manifest) => manifest.manifestPath).length,
    poptropicaAppCount: appManifests.filter((manifest) => manifest.matched).length,
    candidateInstallDirCount: installCandidates.length,
    existingCandidateInstallDirCount: existingInstallCandidates.length,
    realityAssetCandidateCount: realityAssetCandidates.length,
    uniqueRealityTokenMatchCount: realityAssetCandidates.reduce((sum, candidate) => sum + Number(candidate.assetScan?.realityTokenMatchCount || 0), 0)
  };
}

function buildSuggestions(summary) {
  if (summary.existingCandidateInstallDirCount === 1) {
    return ["Run `node tools/import-steam.js --auto` to record the detected Poptropica install root, then rerun launch-gap evidence."];
  }
  if (summary.existingCandidateInstallDirCount > 1) {
    return ["Multiple Poptropica install roots were found; run `node tools/import-steam.js --steam-root <path>` with the intended root."];
  }
  return ["No local Steam Poptropica install was detected. Install or point `--steam-root` at a legitimate Poptropica Steam/AIR install before importing Wild Safari assets."];
}

function detectSteamPoptropica(options = {}) {
  const configuredSteamRoot = normalizePathInput(options.configuredSteamRoot);
  const steamRoots = discoverSteamRoots(configuredSteamRoot, options);
  const libraryRoots = discoverLibraryRoots(steamRoots);
  const appManifests = readAppManifests(libraryRoots);
  const installCandidates = buildInstallCandidates({
    appManifests,
    libraryRoots,
    configuredSteamRoot
  }).map((candidate) => ({
    ...candidate,
    assetScan: scanInstallDir(candidate.path, {
      maxEntries: options.maxScanEntries,
      samplesLimit: options.samplesLimit
    })
  }));
  const summary = buildSummary({
    configuredSteamRoot,
    steamRoots,
    libraryRoots,
    appManifests,
    installCandidates
  });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    configuredSteamRoot: configuredSteamRoot || null,
    summary,
    steamInstallRoots: steamRoots,
    libraryRoots,
    appManifests,
    candidateInstallDirs: installCandidates,
    suggestions: buildSuggestions(summary)
  };
}

module.exports = {
  REALITY_PATTERNS,
  detectSteamPoptropica,
  parseValveData,
  scanInstallDir
};
