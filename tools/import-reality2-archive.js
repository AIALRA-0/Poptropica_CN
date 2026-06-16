const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { ensureDirSync, fileExists, readJson, removeDirContents, writeJson } = require("./lib/fs-utils");
const { requestSample } = require("./qa-reality2-source-probe");
const paths = require("./lib/paths");

const IMPORT_ROOT = "content/www.poptropica.com";
const REALITY2_CAPTURE_PATTERN = /https:\/\/www\.poptropica\.com\/game\/(?:data|assets)\/scenes\/reality2\//iu;
const REALITY2_MUSIC_PATTERN = /https:\/\/www\.poptropica\.com\/game\/sound\/music\/(?:Safari_Extended|Train_Finale)\.mp3$/iu;

function findSevenZip(config) {
  const candidates = [
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "x64", "7za.exe") : null,
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "ia32", "7za.exe") : null,
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files\\AMD\\CIM\\Bin64\\7z.exe",
    "C:\\Program Files\\Autodesk\\AdODIS\\V1\\Setup\\7za.exe"
  ];
  return candidates.find((candidate) => candidate && fileExists(candidate)) || null;
}

function captureImportable(capture) {
  const original = String(capture.original || "");
  return REALITY2_CAPTURE_PATTERN.test(original) || REALITY2_MUSIC_PATTERN.test(original);
}

function toRawReplayUrl(capture) {
  return capture.rawReplayUrl || (
    capture.timestamp && capture.original
      ? `https://web.archive.org/web/${capture.timestamp}id_/${capture.original}`
      : null
  );
}

function archivePathForOriginal(original) {
  const parsed = new URL(original);
  return `${IMPORT_ROOT}${parsed.pathname}`;
}

function hashBuffer(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex");
}

async function downloadBuffer(url, options = {}) {
  const response = await requestSample(url, {
    timeoutMs: options.timeoutMs || 60000,
    maxBytes: options.maxBytes || 16 * 1024 * 1024
  });
  if (!response.ok || Number(response.status) < 200 || Number(response.status) >= 300) {
    throw new Error(`Download failed ${response.status || "none"} for ${url}: ${response.error || "HTTP error"}`);
  }
  return Buffer.from(response.sampleText, "binary");
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
      headers: {
        "User-Agent": "POPTROPICA_FLASH reality2 archive importer"
      },
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
      response.on("end", () => resolve({
        buffer: Buffer.concat(chunks),
        status: response.statusCode,
        headers: response.headers
      }));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error(`Timed out after ${timeoutMs}ms: ${url}`)));
    request.on("error", reject);
    request.end();
  });
}

function validateDownloadedAsset(archivePath, buffer) {
  if (/\.xml$/iu.test(archivePath)) {
    const text = buffer.toString("utf8").trimStart();
    return {
      ok: text.startsWith("<") && !/^<!doctype html|^<html/iu.test(text),
      signature: text.slice(0, 40)
    };
  }
  if (/\.swf$/iu.test(archivePath)) {
    const signature = buffer.subarray(0, 3).toString("ascii");
    return {
      ok: ["FWS", "CWS", "ZWS"].includes(signature),
      signature
    };
  }
  if (/\.mp3$/iu.test(archivePath)) {
    const ascii = buffer.subarray(0, 3).toString("ascii");
    const first = buffer[0];
    return {
      ok: ascii === "ID3" || first === 0xff,
      signature: ascii === "ID3" ? ascii : buffer.subarray(0, 4).toString("hex")
    };
  }
  return {
    ok: buffer.length > 0,
    signature: buffer.subarray(0, 8).toString("hex")
  };
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: options.maxBuffer || 1024 * 1024 * 64,
    timeout: options.timeoutMs || 180000
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return result;
}

function writeImportList(rootDir, archivePaths) {
  const listPath = path.join(rootDir, "reality2-import-list.txt");
  fs.writeFileSync(listPath, archivePaths.map((entry) => entry.replace(/\//gu, "\\")).join("\r\n") + "\r\n", "utf8");
  return listPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const probePath = args.probe || args.report || path.join(paths.qaDir, "reality2-source-probe-latest.json");
  const probe = readJson(probePath, null);
  if (!probe?.ok) {
    throw new Error(`Missing or failing source probe report: ${probePath}`);
  }
  if (probe.summary?.archivedDeclaredMainStreetSourceFound !== true) {
    throw new Error("Source probe does not prove archived mainStreet declared-resource coverage.");
  }
  if (Number(probe.summary?.cdxSoundResourceCount || 0) < 2) {
    throw new Error("Source probe does not include all required reality2 music CDX coverage.");
  }
  const runtimeZipPath = args["runtime-zip"] || paths.as3RuntimeZipPath;
  if (!fileExists(runtimeZipPath)) {
    throw new Error(`AS3 runtime zip is missing: ${runtimeZipPath}`);
  }
  const sevenZip = findSevenZip(config);
  if (!sevenZip) {
    throw new Error("7-Zip executable was not found.");
  }

  const captures = (probe.cdx?.captures || [])
    .filter(captureImportable)
    .sort((left, right) => String(left.original || "").localeCompare(String(right.original || "")));
  if (captures.length === 0) {
    throw new Error("No importable reality2 captures were found in the source probe report.");
  }

  const workRoot = path.join(paths.tempDir, `reality2-import-${Date.now()}`);
  removeDirContents(workRoot);
  ensureDirSync(workRoot);
  const imported = [];
  const failures = [];

  for (const capture of captures) {
    const rawUrl = toRawReplayUrl(capture);
    const archivePath = archivePathForOriginal(capture.original);
    const outputPath = path.join(workRoot, ...archivePath.split("/"));
    try {
      const { buffer, status, headers } = await downloadRaw(rawUrl, {
        timeoutMs: Number(args.timeoutMs || args["timeout-ms"] || 90000),
        maxBytes: Number(args.maxBytes || args["max-bytes"] || 32 * 1024 * 1024)
      });
      const validation = validateDownloadedAsset(archivePath, buffer);
      if (!validation.ok) {
        throw new Error(`Downloaded asset failed signature check: ${validation.signature}`);
      }
      ensureDirSync(path.dirname(outputPath));
      fs.writeFileSync(outputPath, buffer);
      imported.push({
        archivePath,
        original: capture.original,
        rawReplayUrl: rawUrl,
        timestamp: capture.timestamp,
        mimetype: capture.mimetype,
        expectedLength: capture.length,
        status,
        contentType: headers["content-type"] || null,
        bytes: buffer.length,
        sha1: hashBuffer(buffer),
        signature: validation.signature
      });
    } catch (error) {
      failures.push({
        original: capture.original,
        rawReplayUrl: rawUrl,
        archivePath,
        error: error.message
      });
    }
  }

  if (failures.length > 0) {
    const report = {
      ok: false,
      generatedAt: new Date().toISOString(),
      probePath,
      runtimeZipPath,
      importedCount: imported.length,
      failureCount: failures.length,
      imported,
      failures
    };
    writeJson(path.join(paths.qaDir, "reality2-import-latest.json"), report);
    throw new Error(`Failed to download ${failures.length} archived reality2 resource(s).`);
  }

  const archivePaths = imported.map((entry) => entry.archivePath);
  const listPath = writeImportList(workRoot, archivePaths);
  runChecked(sevenZip, ["u", runtimeZipPath, `@${listPath}`, "-mx=1"], {
    cwd: workRoot,
    timeoutMs: Number(args.zipTimeoutMs || args["zip-timeout-ms"] || 300000)
  });
  runChecked(sevenZip, ["t", runtimeZipPath], {
    timeoutMs: Number(args.zipTimeoutMs || args["zip-timeout-ms"] || 300000)
  });

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    probePath,
    runtimeZipPath,
    sevenZip,
    importedCount: imported.length,
    sceneResourceCount: imported.filter((entry) => /\/game\/(?:data|assets)\/scenes\/reality2\//iu.test(entry.archivePath)).length,
    soundResourceCount: imported.filter((entry) => /\/game\/sound\/music\/(?:Safari_Extended|Train_Finale)\.mp3$/iu.test(entry.archivePath)).length,
    totalBytes: imported.reduce((sum, entry) => sum + entry.bytes, 0),
    imported
  };
  const outputPath = args.output || path.join(paths.qaDir, "reality2-import-latest.json");
  writeJson(outputPath, report);
  printJson({
    ok: report.ok,
    generatedAt: report.generatedAt,
    importedCount: report.importedCount,
    sceneResourceCount: report.sceneResourceCount,
    soundResourceCount: report.soundResourceCount,
    totalBytes: report.totalBytes,
    runtimeZipPath,
    reportPath: outputPath
  });
}

main().catch((error) => {
  printJson({
    ok: false,
    error: error.stack || error.message
  });
  process.exitCode = 1;
});
