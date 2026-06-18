const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const { ensureDirSync, fileExists, readJson, writeJson } = require("./lib/fs-utils");
const paths = require("./lib/paths");
const {
  CONTROL_PACKAGES,
  SHELL_ARCHIVE_PATH,
  TARGET_CLASS,
  scanSwfBuffer
} = require("./qa-reality2-shell-probe");

const ASSET_ID = "as3-shell:reality2-class-merge";
const DEFAULT_RABCDASM_HOME = path.join(paths.tempDir, "tools", "rabcdasm-1.18");
const DEFAULT_DONOR_SHELL = path.join(paths.tempDir, "reality2-shell-candidates", "Shell-20201112013740.swf");
const DEFAULT_PACK_SHELL = path.join(
  paths.as3PackDir,
  "swf",
  "content",
  "www.poptropica.com",
  "game",
  "Shell.swf"
);
const DEFAULT_PROVENANCE = path.join(paths.as3PackDir, "provenance", "reality2-shell-merge.json");
const REALITY2_ASASM_DIR = path.join("game", "scenes", "reality2");
const REALITY2_INCLUDE_RE = /^\s*#include "game\/scenes\/reality2\/.+\.script\.asasm"\s*$/u;

function hashBuffer(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex");
}

function hashFile(filePath) {
  return hashBuffer(fs.readFileSync(filePath));
}

function executableName(name) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function findRabcdasmHome(args) {
  const candidates = [
    args.rabcdasmHome,
    args["rabcdasm-home"],
    process.env.RABCDASM_HOME,
    DEFAULT_RABCDASM_HOME
  ].filter(Boolean).map((candidate) => path.resolve(String(candidate)));

  for (const candidate of candidates) {
    const tools = {
      abcexport: path.join(candidate, executableName("abcexport")),
      abcreplace: path.join(candidate, executableName("abcreplace")),
      rabcasm: path.join(candidate, executableName("rabcasm")),
      rabcdasm: path.join(candidate, executableName("rabcdasm"))
    };
    if (Object.values(tools).every(fileExists)) {
      return { home: candidate, tools };
    }
  }

  throw new Error([
    "RABCDAsm tools were not found.",
    `Set RABCDASM_HOME or pass --rabcdasm-home. Checked: ${candidates.join(", ")}`
  ].join(" "));
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: options.maxBuffer || 1024 * 1024 * 256,
    timeout: options.timeoutMs || 300000
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim()}`);
  }
  return result;
}

function countFiles(rootDir) {
  if (!fileExists(rootDir)) {
    return 0;
  }
  let count = 0;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        count += 1;
      }
    }
  }
  return count;
}

function collectReality2Includes(mainAsasmPath) {
  const lines = fs.readFileSync(mainAsasmPath, "utf8").split(/\r?\n/u);
  const seen = new Set();
  const includes = [];
  for (const line of lines) {
    if (!REALITY2_INCLUDE_RE.test(line)) {
      continue;
    }
    const normalized = line.trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      includes.push(` ${normalized}`);
    }
  }
  return includes;
}

function classNameFromInclude(includeLine) {
  const match = includeLine.match(/"(.+)\.script\.asasm"/u);
  return match ? match[1].replace(/\//gu, ".") : null;
}

function insertIncludes(mainAsasmPath, includes) {
  const text = fs.readFileSync(mainAsasmPath, "utf8");
  if (text.includes("game/scenes/reality2/")) {
    throw new Error(`${mainAsasmPath} already contains Reality2 includes; use a clean base Shell.`);
  }
  const lines = text.split(/\r?\n/u);
  const anchorIndex = lines.findIndex((line) => /^\s*#include "orphan_method_\d+\.method\.asasm"\s*$/u.test(line));
  if (anchorIndex < 0) {
    throw new Error(`Could not find orphan method include anchor in ${mainAsasmPath}`);
  }
  const nextLines = [
    ...lines.slice(0, anchorIndex),
    "",
    ...includes,
    "",
    ...lines.slice(anchorIndex)
  ];
  fs.writeFileSync(mainAsasmPath, nextLines.join("\r\n"), "utf8");
}

function copyReality2Tree(donorAsmDir, baseAsmDir) {
  const sourceDir = path.join(donorAsmDir, REALITY2_ASASM_DIR);
  const targetDir = path.join(baseAsmDir, REALITY2_ASASM_DIR);
  if (!fileExists(sourceDir)) {
    throw new Error(`Donor Reality2 ASASM directory is missing: ${sourceDir}`);
  }
  fs.rmSync(targetDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  ensureDirSync(path.dirname(targetDir));
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  return {
    sourceDir,
    targetDir,
    copiedFileCount: countFiles(targetDir)
  };
}

function writeManifestEntry({ generatedAt, outputShellPath, provenancePath, classes, donorShellPath, donorSha1, outputSha1 }) {
  const manifestPath = path.join(paths.as3PackDir, "manifest.json");
  const manifest = fileExists(manifestPath)
    ? readJson(manifestPath, {})
    : {
        generatedAt,
        sourceGroup: "as3",
        canonicalKeys: [],
        assetsPatched: 0,
        externalTextAssets: [],
        swfPatchedAssets: [],
        pendingSwfAssets: []
      };

  manifest.swfPatchedAssets = Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [];
  const asset = {
    assetId: ASSET_ID,
    assetPath: SHELL_ARCHIVE_PATH,
    outputPath: outputShellPath,
    classes,
    donorShellPath,
    donorSha1,
    outputSha1,
    provenancePath: path.relative(paths.projectRoot, provenancePath).replace(/\\/gu, "/"),
    generatedAt
  };
  const existingIndex = manifest.swfPatchedAssets.findIndex((entry) => entry?.assetId === ASSET_ID);
  if (existingIndex >= 0) {
    manifest.swfPatchedAssets[existingIndex] = asset;
  } else {
    manifest.swfPatchedAssets.push(asset);
    manifest.assetsPatched = Number(manifest.assetsPatched || 0) + 1;
  }
  manifest.reality2ShellMerge = {
    generatedAt,
    assetId: ASSET_ID,
    provenancePath: path.relative(paths.projectRoot, provenancePath).replace(/\\/gu, "/"),
    classCount: classes.length,
    donorSha1,
    outputSha1
  };
  writeJson(manifestPath, manifest);
  return manifestPath;
}

function buildAlreadyMergedReport({ generatedAt, baseShellPath, donorShellPath, outputShellPath, provenancePath, baseScan, donorScan }) {
  const outputSha1 = hashFile(outputShellPath);
  const donorSha1 = fileExists(donorShellPath) ? hashFile(donorShellPath) : null;
  const classes = [TARGET_CLASS];
  const manifestPath = writeManifestEntry({
    generatedAt,
    outputShellPath,
    provenancePath,
    classes,
    donorShellPath,
    donorSha1,
    outputSha1
  });
  return {
    ok: true,
    alreadyMerged: true,
    generatedAt,
    assetId: ASSET_ID,
    baseShellPath,
    donorShellPath,
    outputShellPath,
    provenancePath,
    manifestPath,
    validation: {
      baseTargetClassPresent: Boolean(baseScan.targetClassPresent),
      donorTargetClassPresent: Boolean(donorScan?.targetClassPresent),
      controlPackages: baseScan.controlPackages
    },
    output: {
      sha1: outputSha1
    }
  };
}

function summarizeScan(scan) {
  return {
    inspected: Boolean(scan?.inspected),
    signature: scan?.signature || null,
    compressedBytes: scan?.compressedBytes || 0,
    searchableBytes: scan?.searchableBytes || 0,
    targetClassPresent: Boolean(scan?.targetClassPresent),
    controlPackages: scan?.controlPackages || {}
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const baseShellPath = path.resolve(args.baseShell || args["base-shell"] || DEFAULT_PACK_SHELL);
  const donorShellPath = path.resolve(args.donorShell || args["donor-shell"] || DEFAULT_DONOR_SHELL);
  const outputShellPath = path.resolve(args.output || DEFAULT_PACK_SHELL);
  const provenancePath = path.resolve(args.provenance || DEFAULT_PROVENANCE);
  const keepTemp = Boolean(args.keepTemp || args["keep-temp"]);

  if (!fileExists(baseShellPath)) {
    throw new Error(`Base Shell is missing: ${baseShellPath}`);
  }
  if (!fileExists(donorShellPath)) {
    throw new Error(`Donor Shell is missing: ${donorShellPath}`);
  }

  const baseBuffer = fs.readFileSync(baseShellPath);
  const donorBuffer = fs.readFileSync(donorShellPath);
  const baseScan = scanSwfBuffer(baseBuffer);
  const donorScan = scanSwfBuffer(donorBuffer);
  if (!donorScan.targetClassPresent) {
    throw new Error(`Donor Shell does not contain ${TARGET_CLASS}: ${donorShellPath}`);
  }
  if (baseScan.targetClassPresent) {
    const report = buildAlreadyMergedReport({
      generatedAt,
      baseShellPath,
      donorShellPath,
      outputShellPath,
      provenancePath,
      baseScan,
      donorScan
    });
    writeJson(provenancePath, report);
    printJson(report);
    return;
  }

  const rabcdasm = findRabcdasmHome(args);
  const workRoot = path.join(paths.tempDir, `reality2-rabcdasm-merge-${Date.now()}`);
  ensureDirSync(workRoot);
  const baseWorkSwf = path.join(workRoot, "base.swf");
  const donorWorkSwf = path.join(workRoot, "donor.swf");
  const mergedWorkSwf = path.join(workRoot, "Shell.reality2-merged.swf");
  fs.copyFileSync(baseShellPath, baseWorkSwf);
  fs.copyFileSync(donorShellPath, donorWorkSwf);

  try {
    runChecked(rabcdasm.tools.abcexport, ["base.swf"], { cwd: workRoot, timeoutMs: 300000 });
    runChecked(rabcdasm.tools.abcexport, ["donor.swf"], { cwd: workRoot, timeoutMs: 300000 });
    runChecked(rabcdasm.tools.rabcdasm, ["base-0.abc"], { cwd: workRoot, timeoutMs: 300000 });
    runChecked(rabcdasm.tools.rabcdasm, ["donor-0.abc"], { cwd: workRoot, timeoutMs: 300000 });

    const baseAsmDir = path.join(workRoot, "base-0");
    const donorAsmDir = path.join(workRoot, "donor-0");
    const baseMainAsasm = path.join(baseAsmDir, "base-0.main.asasm");
    const donorMainAsasm = path.join(donorAsmDir, "donor-0.main.asasm");
    const includes = collectReality2Includes(donorMainAsasm);
    if (includes.length !== 18) {
      throw new Error(`Expected 18 Reality2 script includes, got ${includes.length}`);
    }
    const classes = includes.map(classNameFromInclude).filter(Boolean);
    const treeCopy = copyReality2Tree(donorAsmDir, baseAsmDir);
    insertIncludes(baseMainAsasm, includes);

    runChecked(rabcdasm.tools.rabcasm, ["base-0.main.asasm"], { cwd: baseAsmDir, timeoutMs: 300000 });
    fs.copyFileSync(baseWorkSwf, mergedWorkSwf);
    runChecked(rabcdasm.tools.abcreplace, [
      mergedWorkSwf,
      "0",
      path.join(baseAsmDir, "base-0.main.abc")
    ], { cwd: workRoot, timeoutMs: 300000 });

    const outputBuffer = fs.readFileSync(mergedWorkSwf);
    const outputScan = scanSwfBuffer(outputBuffer);
    const missingControls = CONTROL_PACKAGES.filter((pkg) => !outputScan.controlPackages?.[pkg]);
    if (!outputScan.targetClassPresent || missingControls.length) {
      throw new Error(`Merged Shell validation failed: ${JSON.stringify({
        targetClassPresent: outputScan.targetClassPresent,
        missingControls
      })}`);
    }

    ensureDirSync(path.dirname(outputShellPath));
    fs.copyFileSync(mergedWorkSwf, outputShellPath);
    const outputSha1 = hashBuffer(outputBuffer);
    const donorSha1 = hashBuffer(donorBuffer);
    const manifestPath = outputShellPath.toLowerCase() === DEFAULT_PACK_SHELL.toLowerCase()
      ? writeManifestEntry({
          generatedAt,
          outputShellPath,
          provenancePath,
          classes,
          donorShellPath,
          donorSha1,
          outputSha1
        })
      : null;

    const report = {
      ok: true,
      alreadyMerged: false,
      generatedAt,
      assetId: ASSET_ID,
      baseShellPath,
      donorShellPath,
      outputShellPath,
      provenancePath,
      manifestPath,
      rabcdasmHome: rabcdasm.home,
      workRoot: keepTemp ? workRoot : null,
      keepTemp,
      classCount: classes.length,
      classes,
      includes,
      treeCopy,
      source: {
        baseSha1: hashBuffer(baseBuffer),
        donorSha1
      },
      output: {
        sha1: outputSha1,
        bytes: outputBuffer.length
      },
      validation: {
        base: summarizeScan(baseScan),
        donor: summarizeScan(donorScan),
        output: summarizeScan(outputScan),
        missingControls
      }
    };
    writeJson(provenancePath, report);
    printJson(report);

    if (!keepTemp) {
      fs.rmSync(workRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    }
  } catch (error) {
    if (!keepTemp) {
      fs.rmSync(workRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    }
    throw error;
  }
}

main();
