const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, listFilesRecursive, removeDirContents, writeJson } = require("./lib/fs-utils");

const LOOK_TAGS = [
  "gender",
  "skinColor",
  "hairColor",
  "body",
  "eyeState",
  "marks",
  "mouth",
  "facial",
  "head",
  "hair",
  "pants",
  "shirt",
  "overpants",
  "overshirt",
  "item",
  "item2",
  "pack",
  "eyes",
  "talkMouth"
];

const SCENE_RUNTIME_TAGS = [
  "data",
  "absoluteFilePaths",
  "sceneType",
  "asset",
  "assets",
  "bitmap",
  "movieClip",
  "clip",
  "background",
  "elementsToBitmap",
  "subGroup",
  "visible",
  "card",
  "folder",
  "layout",
  "id"
];

function findSevenZip(config) {
  const candidates = [
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "x64", "7za.exe") : null,
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "ia32", "7za.exe") : null,
    "C:\\Program Files\\AMD\\CIM\\Bin64\\7z.exe",
    "C:\\Program Files\\Autodesk\\AdODIS\\V1\\Setup\\7za.exe"
  ];
  return candidates.find((candidate) => candidate && fileExists(candidate)) || null;
}

function findOriginalAs3Root() {
  const root = path.join(paths.extractedDir, "as3");
  if (!fileExists(root)) {
    throw new Error(`AS3 extracted root is missing: ${root}`);
  }

  const candidates = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter((candidate) => fileExists(path.join(candidate, "content", "www.poptropica.com", "game", "data")))
    .map((candidate) => ({
      path: candidate,
      mtimeMs: fs.statSync(candidate).mtimeMs
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (!candidates.length) {
    throw new Error(`No extracted AS3 content root was found under ${root}`);
  }
  return candidates[0].path;
}

function collectTagValues(content, tagName) {
  const expression = new RegExp(`(<${tagName}(?:\\s[^>]*)?>)([\\s\\S]*?)(</${tagName}>)`, "gu");
  const values = [];
  let match;
  while ((match = expression.exec(content)) !== null) {
    values.push(match[2]);
  }
  return values;
}

function restoreTagValues(content, originalContent, tagName) {
  const originalValues = collectTagValues(originalContent, tagName);
  if (!originalValues.length) {
    return {
      content,
      restored: 0,
      skipped: 0
    };
  }

  let index = 0;
  let restored = 0;
  let skipped = 0;
  const expression = new RegExp(`(<${tagName}(?:\\s[^>]*)?>)([\\s\\S]*?)(</${tagName}>)`, "gu");
  const nextContent = content.replace(expression, (match, openTag, value, closeTag) => {
    if (index >= originalValues.length) {
      skipped += 1;
      return match;
    }
    const originalValue = originalValues[index];
    index += 1;
    if (value === originalValue) {
      return match;
    }
    restored += 1;
    return `${openTag}${originalValue}${closeTag}`;
  });

  if (index !== originalValues.length) {
    skipped += originalValues.length - index;
  }

  return {
    content: nextContent,
    restored,
    skipped
  };
}

function shouldRestoreLookTags(relativePath) {
  return (
    /\/game\/data\/scenes\//iu.test(relativePath) ||
    /\/game\/data\/entity\/character\//iu.test(relativePath)
  );
}

function shouldRestoreSceneRuntimeTags(relativePath) {
  if (/\/sounds\.xml$/iu.test(relativePath)) {
    return false;
  }
  return /\/game\/data\/scenes\//iu.test(relativePath);
}

function isPartKeyFile(relativePath) {
  return /\/game\/data\/entity\/character\/partKeys\/[^/]+\.xml$/iu.test(relativePath);
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 128,
    ...options
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return result;
}

function main() {
  const config = loadConfig();
  const sevenZip = findSevenZip(config);
  if (!sevenZip) {
    throw new Error("No 7-Zip executable was found.");
  }
  if (!fileExists(paths.as3RuntimeZipPath)) {
    throw new Error(`AS3 runtime zip is missing: ${paths.as3RuntimeZipPath}`);
  }

  const originalRoot = findOriginalAs3Root();
  const workDir = path.join(paths.tempDir, "as3-internal-id-repair");
  removeDirContents(workDir);
  ensureDirSync(workDir);

  runChecked(sevenZip, [
    "x",
    paths.as3RuntimeZipPath,
    "content\\www.poptropica.com\\game\\data\\*.xml",
    "-r",
    `-o${workDir}`,
    "-y"
  ]);

  const changedFiles = [];
  const restoredByTag = {};
  const skippedByTag = {};
  const xmlFiles = listFilesRecursive(path.join(workDir, "content", "www.poptropica.com", "game", "data"), {
    includeExtensions: new Set([".xml"])
  });

  for (const filePath of xmlFiles) {
    const relativePath = path.relative(workDir, filePath).replace(/\\/gu, "/");
    const originalPath = path.join(originalRoot, relativePath.replace(/\//gu, path.sep));
    if (!fileExists(originalPath)) {
      continue;
    }

    const currentContent = fs.readFileSync(filePath, "utf8");
    const originalContent = fs.readFileSync(originalPath, "utf8");
    let nextContent = currentContent;
    let changed = false;

    if (isPartKeyFile(relativePath)) {
      nextContent = originalContent;
      changed = nextContent !== currentContent;
    } else if (shouldRestoreLookTags(relativePath)) {
      for (const tagName of LOOK_TAGS) {
        const result = restoreTagValues(nextContent, originalContent, tagName);
        nextContent = result.content;
        if (result.restored > 0) {
          restoredByTag[tagName] = (restoredByTag[tagName] || 0) + result.restored;
          changed = true;
        }
        if (result.skipped > 0) {
          skippedByTag[tagName] = (skippedByTag[tagName] || 0) + result.skipped;
        }
      }
      if (shouldRestoreSceneRuntimeTags(relativePath)) {
        for (const tagName of SCENE_RUNTIME_TAGS) {
          const result = restoreTagValues(nextContent, originalContent, tagName);
          nextContent = result.content;
          if (result.restored > 0) {
            restoredByTag[tagName] = (restoredByTag[tagName] || 0) + result.restored;
            changed = true;
          }
          if (result.skipped > 0) {
            skippedByTag[tagName] = (skippedByTag[tagName] || 0) + result.skipped;
          }
        }
      }
    }

    if (!changed) {
      continue;
    }

    fs.writeFileSync(filePath, nextContent, "utf8");
    changedFiles.push(relativePath);

    const packTarget = path.join(paths.as3PackDir, "files", relativePath.replace(/\//gu, path.sep));
    if (nextContent !== originalContent) {
      ensureDirSync(path.dirname(packTarget));
      fs.copyFileSync(filePath, packTarget);
    } else if (fileExists(packTarget)) {
      fs.rmSync(packTarget, { force: true });
    }
  }

  if (changedFiles.length > 0) {
    const listPath = path.join(workDir, "as3-internal-id-update-list.txt");
    fs.writeFileSync(listPath, `${changedFiles.map((entry) => entry.replace(/\//gu, "\\")).join("\r\n")}\r\n`, "utf8");
    runChecked(sevenZip, ["u", paths.as3RuntimeZipPath, `@${listPath}`, "-mx=1"], {
      cwd: workDir
    });
    runChecked(sevenZip, ["t", paths.as3RuntimeZipPath]);
  }

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    runtimeZipPath: paths.as3RuntimeZipPath,
    originalRoot,
    changedFileCount: changedFiles.length,
    changedFiles: changedFiles.slice(0, 200),
    restoredByTag,
    skippedByTag
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-internal-id-repair.json");
  writeJson(reportPath, report);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main();
