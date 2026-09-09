const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, removeDirContents } = require("./lib/fs-utils");

const ASSET_PATH = "content/www.poptropica.com/popups/maps/Time.swf";
const PATCH_ASSET_ID = "time-tangled:as2-map-room-names";

const ROOM_NAME_REPLACEMENTS = new Map([
  ["Ancient\\nGreece", "古希腊"],
  ["Vikings", "维京时代"],
  ["Mali\\nEmpire", "马里帝国"],
  ["Da Vinci\\'s\\nWorkshop", "达芬奇工坊"],
  ["Aztec\\nEmpire", "阿兹特克帝国"],
  ["Great Wall\\nof China", "中国长城"],
  ["The Graff\\nHouse", "格拉夫家"],
  ["Lewis and\\nClark", "刘易斯与克拉克"],
  ["Edison\\'s\\nWorkshop", "爱迪生工坊"],
  ["Statue of\\nLiberty", "自由女神像"],
  ["Mount\\nEverest", "珠穆朗玛峰"],
  ["Possible\\nFuture", "可能的未来"],
  ["Restored\\nFuture", "恢复的未来"],
  ["Main\\nStreet", "主街"]
]);

function runChecked(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 1024 * 1024 * 16
  });
  const output = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
  if (result.status !== 0 || /SEVERE:/iu.test(output)) {
    throw new Error(`${label} failed: ${output || result.error?.message || "unknown error"}`);
  }
  return result;
}

function normalizeAs(content) {
  const normalized = String(content || "").replace(/\r?\n/gu, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

function sourceSwfPath() {
  const runtimeZipExtracted = path.join(paths.tempDir, "runtime-zip-as2", ASSET_PATH.replace(/\//gu, path.sep));
  if (fileExists(runtimeZipExtracted)) {
    return runtimeZipExtracted;
  }
  const extractedRoot = path.join(paths.extractedDir, "as2");
  if (fileExists(extractedRoot)) {
    const stack = [extractedRoot];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else if (fullPath.replace(/\\/gu, "/").endsWith(`/${ASSET_PATH}`)) {
          return fullPath;
        }
      }
    }
  }
  throw new Error(`Unable to locate source ${ASSET_PATH}. Build or extract the AS2 runtime first.`);
}

function replaceTargetForScript(scriptRoot, filePath) {
  const relative = path.relative(path.join(scriptRoot, "scripts"), filePath).replace(/\\/gu, "/");
  return `\\${relative.replace(/\.as$/iu, "").replace(/\//gu, "\\")}`;
}

function patchTimeMap({ ffdecCli, inputSwf, outputSwf, workDir }) {
  const scriptRoot = path.join(workDir, "scripts");
  removeDirContents(scriptRoot);
  ensureDirSync(scriptRoot);
  runChecked(ffdecCli, ["-cli", "-export", "script", scriptRoot, inputSwf], "export Time map scripts");

  const patchRoot = path.join(workDir, "patch");
  removeDirContents(patchRoot);
  ensureDirSync(patchRoot);

  const translatedFiles = [];
  const scriptFiles = [];
  const stack = [path.join(scriptRoot, "scripts")];
  while (stack.length) {
    const current = stack.pop();
    if (!fileExists(current)) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.as$/iu.test(entry.name)) {
        scriptFiles.push(fullPath);
      }
    }
  }

  let replacementCount = 0;
  for (const filePath of scriptFiles) {
    const original = normalizeAs(fs.readFileSync(filePath, "utf8"));
    let next = original;
    for (const [english, chinese] of ROOM_NAME_REPLACEMENTS) {
      next = next.split(`RoomName = "${english}";`).join(`RoomName = "${chinese}";`);
    }
    if (next === original) {
      continue;
    }
    replacementCount += 1;
    const patchPath = path.join(patchRoot, path.relative(path.join(scriptRoot, "scripts"), filePath));
    ensureDirSync(path.dirname(patchPath));
    fs.writeFileSync(patchPath, next, "utf8");
    translatedFiles.push({
      filePath: patchPath,
      replaceTarget: replaceTargetForScript(scriptRoot, filePath)
    });
  }

  if (replacementCount !== ROOM_NAME_REPLACEMENTS.size) {
    throw new Error(`Expected ${ROOM_NAME_REPLACEMENTS.size} Time map room-name replacements, got ${replacementCount}.`);
  }

  let currentInput = inputSwf;
  translatedFiles.forEach((replacement, index) => {
    const passOutput = index === translatedFiles.length - 1
      ? outputSwf
      : path.join(workDir, `time-map-room-names-pass-${index}.swf`);
    runChecked(ffdecCli, ["-replace", currentInput, passOutput, replacement.replaceTarget, replacement.filePath], `replace ${replacement.replaceTarget}`);
    currentInput = passOutput;
  });

  return { replacementCount, translatedFiles };
}

function main() {
  const config = loadConfig();
  const ffdecCli = config.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("ffdec-cli is not configured.");
  }

  const inputSwf = sourceSwfPath();
  const outputSwf = path.join(paths.as2PackDir, "swf", ASSET_PATH.replace(/\//gu, path.sep));
  const workDir = path.join(paths.tempDir, "as2-time-map-room-names-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  ensureDirSync(path.dirname(outputSwf));

  const patch = patchTimeMap({
    ffdecCli,
    inputSwf,
    outputSwf,
    workDir
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceGroup: "as2",
    assetsPatched: 1,
    swfPatchedAssets: [
      {
        assetId: PATCH_ASSET_ID,
        assetPath: ASSET_PATH,
        outputPath: outputSwf
      }
    ],
    pendingSwfAssets: [],
    externalTextAssets: [],
    pendingExternalAssets: []
  };
  const runtimeZip = buildRuntimeZipForSourceGroup({ config, sourceGroup: "as2", manifest });
  const report = {
    ok: true,
    assetId: PATCH_ASSET_ID,
    assetPath: ASSET_PATH,
    inputSwf,
    outputSwf,
    replacementCount: patch.replacementCount,
    replacements: Object.fromEntries(ROOM_NAME_REPLACEMENTS),
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "as2", "time-tangled-map-room-names-patch.json");
  ensureDirSync(path.dirname(reportPath));
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  printJson({ ...report, reportPath });
}

main();
