const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { fileExists, writeJson } = require("./lib/fs-utils");
const { resolveLaunchArchivePath } = require("./lib/launch-manifest");
const { parseCdxJson, requestSample } = require("./qa-reality2-source-probe");
const paths = require("./lib/paths");

const TARGET_PACKAGE = "game.scenes.reality2";
const TARGET_CLASS = "game.scenes.reality2.mainStreet.MainStreet";
const CONTROL_PACKAGES = [
  "game.scenes.ghd",
  "game.scenes.timmy",
  "game.scenes.prison",
  "game.scenes.virusHunter"
];
const SHELL_ARCHIVE_PATH = "content/www.poptropica.com/game/Shell.swf";
const SHELL_CDX_QUERIES = [
  "www.poptropica.com/game/Shell.swf",
  "www.poptropica.com/game/shell.swf",
  "poptropica.com/game/Shell.swf",
  "static.poptropica.com/game/Shell.swf",
  "static.poptropica.com/game/shell.swf",
  "www.poptropica.com/game/ShellLoader.swf",
  "www.poptropica.com/game/*Shell*.swf"
];

function inflateSwf(buffer) {
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

function swfClassSearchCandidates(qualifiedClassName) {
  if (!qualifiedClassName) {
    return [];
  }
  const parts = String(qualifiedClassName).split(".");
  const className = parts.pop();
  const packageName = parts.join(".");
  return [
    qualifiedClassName,
    packageName && className ? `${packageName}:${className}` : null
  ].filter(Boolean);
}

function bufferIncludesAny(buffer, values) {
  return values.some((value) => buffer.includes(Buffer.from(value, "utf8")));
}

function scanSwfBuffer(buffer) {
  const searchable = inflateSwf(buffer);
  const text = searchable ? searchable.toString("latin1") : "";
  const packages = searchable
    ? [...new Set([...text.matchAll(/game\.scenes\.[A-Za-z0-9_]+/g)].map((match) => match[0]))].sort()
    : [];
  return {
    inspected: Boolean(searchable),
    compressedBytes: buffer?.length || 0,
    searchableBytes: searchable?.length || 0,
    signature: buffer?.subarray(0, 3).toString("ascii") || null,
    targetPackagePresent: searchable ? searchable.includes(Buffer.from(TARGET_PACKAGE, "utf8")) : false,
    targetClassPresent: searchable ? bufferIncludesAny(searchable, swfClassSearchCandidates(TARGET_CLASS)) : false,
    controlPackages: Object.fromEntries(CONTROL_PACKAGES.map((pkg) => [
      pkg,
      searchable ? searchable.includes(Buffer.from(pkg, "utf8")) : false
    ])),
    packageCount: packages.length,
    packages
  };
}

function extractArchiveEntry(archivePath, entryPath, tarBin = "tar") {
  if (!archivePath || !fileExists(archivePath)) {
    return null;
  }
  const result = spawnSync(tarBin || "tar", ["-xOf", archivePath, entryPath], {
    encoding: "buffer",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 80,
    timeout: 120000
  });
  return result.status === 0 && result.stdout?.length ? result.stdout : null;
}

function listArchiveShellEntries(archivePath, tarBin = "tar") {
  if (!archivePath || !fileExists(archivePath)) {
    return [];
  }
  const result = spawnSync(tarBin || "tar", ["-tf", archivePath], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64,
    timeout: 120000
  });
  if (result.status !== 0) {
    return [];
  }
  return String(result.stdout || "")
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/\\/gu, "/"))
    .filter((entry) => /(?:^|\/)(?:Shell|shell|ShellLoader)[^/]*\.swf$/u.test(entry));
}

function scanArchiveShells(label, archivePath, options = {}) {
  const entries = listArchiveShellEntries(archivePath, options.tarBin);
  return entries.map((entryPath) => {
    const buffer = extractArchiveEntry(archivePath, entryPath, options.tarBin);
    return {
      source: "archive",
      label,
      archivePath,
      entryPath,
      exists: Boolean(buffer),
      scan: scanSwfBuffer(buffer)
    };
  });
}

function walkShellFiles(rootDir, options = {}) {
  const maxFiles = Number(options.maxFiles || 200);
  const maxDepth = Number(options.maxDepth || 8);
  const results = [];
  const stack = [{ dir: rootDir, depth: 0 }];
  const skip = /^(node_modules|\.git|workspaces|extracted)$/iu;
  while (stack.length > 0 && results.length < maxFiles) {
    const { dir, depth } = stack.pop();
    if (depth > maxDepth || !fileExists(dir)) {
      continue;
    }
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.test(entry.name)) {
          stack.push({ dir: fullPath, depth: depth + 1 });
        }
        continue;
      }
      if (/^(?:Shell|shell|ShellLoader)[^/\\]*\.swf$/u.test(entry.name)) {
        results.push(fullPath);
        if (results.length >= maxFiles) {
          break;
        }
      }
    }
  }
  return results;
}

function scanDirectShells(rootDir, args) {
  return walkShellFiles(rootDir, {
    maxFiles: args.maxDirectFiles,
    maxDepth: args.maxDirectDepth
  }).map((filePath) => {
    let buffer = null;
    let error = null;
    try {
      buffer = fs.readFileSync(filePath);
    } catch (readError) {
      error = readError.message;
    }
    return {
      source: "file",
      filePath,
      exists: Boolean(buffer),
      error,
      scan: scanSwfBuffer(buffer)
    };
  });
}

function configuredArchiveCandidates(config) {
  const as2 = resolveLaunchArchivePath("as2", config);
  const as3 = resolveLaunchArchivePath("as3", config);
  const rows = [
    { label: "as2-runtime-or-source", archivePath: as2.archivePath },
    { label: "as3-runtime-or-source", archivePath: as3.archivePath },
    { label: "as2-source", archivePath: config.sources.as2Gamezip },
    { label: "as3-source", archivePath: config.sources.as3Gamezip }
  ];
  const seen = new Set();
  return rows.filter((row) => {
    if (!row.archivePath || seen.has(path.resolve(row.archivePath).toLowerCase())) {
      return false;
    }
    seen.add(path.resolve(row.archivePath).toLowerCase());
    return true;
  });
}

function flashpointArchiveCandidates(config) {
  const gamesDir = config.sources.flashpointRoot
    ? path.join(config.sources.flashpointRoot, "Data", "Games")
    : null;
  if (!gamesDir || !fileExists(gamesDir)) {
    return [];
  }
  let entries = [];
  try {
    entries = fs.readdirSync(gamesDir, { withFileTypes: true });
  } catch (_error) {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && /\.zip$/iu.test(entry.name))
    .map((entry) => ({ label: "flashpoint-data-games", archivePath: path.join(gamesDir, entry.name) }));
}

function buildCdxUrl(query, limit) {
  const params = new URLSearchParams({
    url: query,
    output: "json",
    fl: "timestamp,original,statuscode,mimetype,digest,length",
    filter: "statuscode:200",
    collapse: "digest",
    limit: String(limit || 50)
  });
  return `https://web.archive.org/cdx?${params.toString()}`;
}

async function downloadRaw(url, options = {}) {
  const http = require("node:http");
  const https = require("node:https");
  const timeoutMs = Number(options.timeoutMs || 60000);
  const maxBytes = Number(options.maxBytes || 32 * 1024 * 1024);
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "http:" ? http : https;
    const request = transport.request(parsed, {
      method: "GET",
      headers: { "User-Agent": "POPTROPICA_FLASH reality2 shell probe" },
      timeout: timeoutMs
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(Number(response.statusCode)) && response.headers.location) {
        response.resume();
        downloadRaw(new URL(response.headers.location, parsed).href, options).then(resolve, reject);
        return;
      }
      if (Number(response.statusCode) < 200 || Number(response.statusCode) >= 300) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          request.destroy(new Error(`Response exceeded ${maxBytes} bytes for ${url}`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error(`Timed out after ${timeoutMs}ms: ${url}`)));
    request.on("error", reject);
    request.end();
  });
}

async function queryWaybackShells(args) {
  const queries = [];
  const candidates = [];
  const seen = new Set();
  for (const query of SHELL_CDX_QUERIES) {
    const url = buildCdxUrl(query, args.cdxLimit);
    const response = await requestSample(url, {
      timeoutMs: args.timeoutMs,
      maxBytes: args.cdxMaxBytes
    });
    let rows = [];
    let parseError = null;
    const statusOk = response.ok && Number(response.status) >= 200 && Number(response.status) < 300;
    if (statusOk) {
      try {
        rows = parseCdxJson(response.sampleText);
      } catch (error) {
        parseError = error.message;
      }
    }
    queries.push({
      query,
      url,
      ok: statusOk && !parseError,
      status: response.status,
      rowCount: rows.length,
      error: parseError || response.error || (statusOk ? null : `HTTP ${response.status || "none"}`)
    });
    for (const row of rows) {
      const rawReplayUrl = row.timestamp && row.original
        ? `https://web.archive.org/web/${row.timestamp}id_/${row.original}`
        : null;
      const key = `${row.digest || row.timestamp}:${row.original}`;
      if (!rawReplayUrl || seen.has(key)) {
        continue;
      }
      seen.add(key);
      let buffer = null;
      let error = null;
      try {
        buffer = await downloadRaw(rawReplayUrl, {
          timeoutMs: args.timeoutMs,
          maxBytes: args.downloadMaxBytes
        });
      } catch (downloadError) {
        error = downloadError.message;
      }
      candidates.push({
        source: "wayback",
        timestamp: row.timestamp,
        original: row.original,
        rawReplayUrl,
        mimetype: row.mimetype,
        digest: row.digest,
        expectedLength: row.length,
        downloaded: Boolean(buffer),
        error,
        scan: scanSwfBuffer(buffer)
      });
    }
  }
  return { queries, candidates };
}

function summarize(candidates, wayback) {
  const inspected = candidates.filter((candidate) => candidate.scan?.inspected);
  const targetPackage = inspected.filter((candidate) => candidate.scan.targetPackagePresent);
  const targetClass = inspected.filter((candidate) => candidate.scan.targetClassPresent);
  const runtimeShell = inspected.find((candidate) =>
    candidate.source === "archive" &&
    candidate.label === "as3-runtime-or-source" &&
    candidate.entryPath === SHELL_ARCHIVE_PATH
  ) || null;
  return {
    candidateCount: candidates.length,
    inspectedCount: inspected.length,
    targetPackageCandidateCount: targetPackage.length,
    targetClassCandidateCount: targetClass.length,
    currentRuntimeTargetPackagePresent: Boolean(runtimeShell?.scan?.targetPackagePresent),
    waybackQueryCount: wayback.queries.length,
    waybackQueryOkCount: wayback.queries.filter((query) => query.ok).length,
    waybackCandidateCount: wayback.candidates.length,
    currentBlockerStillPresent: !runtimeShell?.scan?.targetPackagePresent,
    targetPackageCandidates: targetPackage.map((candidate) => ({
      source: candidate.source,
      label: candidate.label || null,
      archivePath: candidate.archivePath || null,
      entryPath: candidate.entryPath || null,
      filePath: candidate.filePath || null,
      original: candidate.original || null,
      timestamp: candidate.timestamp || null
    }))
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const archiveCandidates = [
    ...configuredArchiveCandidates(config),
    ...(args["scan-flashpoint"] || args.scanFlashpoint ? flashpointArchiveCandidates(config) : [])
  ];
  const archiveShells = archiveCandidates.flatMap((candidate) => scanArchiveShells(candidate.label, candidate.archivePath, {
    tarBin: config.tools?.tarBin
  }));
  const directShells = args["scan-direct"] || args.scanDirect
    ? scanDirectShells(paths.projectRoot, {
        maxDirectFiles: Number(args.maxDirectFiles || args["max-direct-files"] || 200),
        maxDirectDepth: Number(args.maxDirectDepth || args["max-direct-depth"] || 8)
      })
    : [];
  const wayback = args["skip-wayback"] || args.skipWayback
    ? { queries: [], candidates: [] }
    : await queryWaybackShells({
        timeoutMs: Number(args.timeoutMs || args["timeout-ms"] || 45000),
        cdxLimit: Number(args.cdxLimit || args["cdx-limit"] || 50),
        cdxMaxBytes: Number(args.cdxMaxBytes || args["cdx-max-bytes"] || 1024 * 1024),
        downloadMaxBytes: Number(args.downloadMaxBytes || args["download-max-bytes"] || 32 * 1024 * 1024)
      });
  const candidates = [...archiveShells, ...directShells, ...wayback.candidates];
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    target: {
      package: TARGET_PACKAGE,
      className: TARGET_CLASS,
      controls: CONTROL_PACKAGES
    },
    summary: summarize(candidates, wayback),
    archiveCandidates,
    candidates,
    wayback
  };
  const outputPath = args.output || args.report || path.join(paths.qaDir, "reality2-shell-probe-latest.json");
  writeJson(outputPath, report);
  printJson({
    ok: report.ok,
    generatedAt: report.generatedAt,
    summary: report.summary,
    reportPath: outputPath
  });
}

if (require.main === module) {
  main().catch((error) => {
    printJson({
      ok: false,
      error: error.stack || error.message
    });
    process.exitCode = 1;
  });
}

module.exports = {
  TARGET_PACKAGE,
  TARGET_CLASS,
  CONTROL_PACKAGES,
  SHELL_ARCHIVE_PATH,
  downloadRaw,
  scanSwfBuffer
};
