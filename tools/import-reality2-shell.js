const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { ensureDirSync, fileExists, readJson, writeJson } = require("./lib/fs-utils");
const paths = require("./lib/paths");
const {
  CONTROL_PACKAGES,
  SHELL_ARCHIVE_PATH,
  TARGET_PACKAGE,
  downloadRaw,
  scanSwfBuffer
} = require("./qa-reality2-shell-probe");

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

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: options.maxBuffer || 1024 * 1024 * 64,
    timeout: options.timeoutMs || 300000
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim()}`);
  }
  return result;
}

function hashBuffer(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex");
}

function selectShellCandidate(probe, args) {
  const timestamp = args.timestamp ? String(args.timestamp) : null;
  const candidates = (probe.candidates || [])
    .filter((candidate) =>
      candidate.source === "wayback" &&
      candidate.rawReplayUrl &&
      candidate.scan?.targetClassPresent &&
      CONTROL_PACKAGES.every((pkg) => candidate.scan?.controlPackages?.[pkg])
    )
    .sort((left, right) => String(left.timestamp || "").localeCompare(String(right.timestamp || "")));
  if (timestamp) {
    return candidates.find((candidate) => String(candidate.timestamp || "") === timestamp) || null;
  }
  return candidates[candidates.length - 1] || null;
}

function validateShellBuffer(buffer) {
  const scan = scanSwfBuffer(buffer);
  const missingControls = CONTROL_PACKAGES.filter((pkg) => !scan.controlPackages?.[pkg]);
  const signatureOk = ["FWS", "CWS", "ZWS"].includes(scan.signature);
  return {
    ok: Boolean(scan.inspected && signatureOk && scan.targetClassPresent && missingControls.length === 0),
    signatureOk,
    missingControls,
    scan
  };
}

function writeImportList(rootDir) {
  const listPath = path.join(rootDir, "reality2-shell-import-list.txt");
  fs.writeFileSync(listPath, SHELL_ARCHIVE_PATH.replace(/\//gu, "\\") + "\r\n", "utf8");
  return listPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const probePath = args.probe || args.report || path.join(paths.qaDir, "reality2-shell-probe-latest.json");
  const probe = readJson(probePath, null);
  if (!probe?.ok) {
    throw new Error(`Missing or failing Shell probe report: ${probePath}`);
  }

  const candidate = args.url
    ? {
        timestamp: args.timestamp || null,
        original: args.original || args.url,
        rawReplayUrl: args.url
      }
    : selectShellCandidate(probe, args);
  if (!candidate?.rawReplayUrl) {
    throw new Error(`No Wayback Shell candidate with ${TARGET_PACKAGE} and required control packages was found.`);
  }

  const runtimeZipPath = args["runtime-zip"] || paths.as3RuntimeZipPath;
  if (!fileExists(runtimeZipPath)) {
    throw new Error(`AS3 runtime zip is missing: ${runtimeZipPath}`);
  }
  const sevenZip = findSevenZip(config);
  if (!sevenZip) {
    throw new Error("7-Zip executable was not found.");
  }

  const buffer = await downloadRaw(candidate.rawReplayUrl, {
    timeoutMs: Number(args.timeoutMs || args["timeout-ms"] || 90000),
    maxBytes: Number(args.maxBytes || args["max-bytes"] || 32 * 1024 * 1024)
  });
  const validation = validateShellBuffer(buffer);
  if (!validation.ok) {
    throw new Error(`Downloaded Shell failed validation: ${JSON.stringify({
      signature: validation.scan.signature,
      targetPackagePresent: validation.scan.targetPackagePresent,
      targetClassPresent: validation.scan.targetClassPresent,
      missingControls: validation.missingControls
    })}`);
  }

  const workRoot = path.join(paths.tempDir, `reality2-shell-import-${Date.now()}`);
  const outputPath = path.join(workRoot, ...SHELL_ARCHIVE_PATH.split("/"));
  ensureDirSync(path.dirname(outputPath));
  fs.writeFileSync(outputPath, buffer);
  const listPath = writeImportList(workRoot);
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
    shellArchivePath: SHELL_ARCHIVE_PATH,
    sevenZip,
    imported: {
      timestamp: candidate.timestamp || null,
      original: candidate.original || null,
      rawReplayUrl: candidate.rawReplayUrl,
      bytes: buffer.length,
      sha1: hashBuffer(buffer)
    },
    validation: {
      signature: validation.scan.signature,
      compressedBytes: validation.scan.compressedBytes,
      searchableBytes: validation.scan.searchableBytes,
      targetPackagePresent: validation.scan.targetPackagePresent,
      targetClassPresent: validation.scan.targetClassPresent,
      controlPackages: validation.scan.controlPackages,
      packageCount: validation.scan.packageCount
    }
  };
  const reportPath = args.output || path.join(paths.qaDir, "reality2-shell-import-latest.json");
  writeJson(reportPath, report);
  printJson({
    ok: true,
    generatedAt: report.generatedAt,
    runtimeZipPath,
    shellArchivePath: SHELL_ARCHIVE_PATH,
    imported: report.imported,
    validation: report.validation,
    reportPath
  });
}

main().catch((error) => {
  printJson({
    ok: false,
    error: error.stack || error.message
  });
  process.exitCode = 1;
});
