const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function ensureDirSync(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
  return targetPath;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}

function writeText(filePath, payload) {
  ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, payload, "utf8");
  return filePath;
}

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

function listFilesRecursive(rootDir, options = {}) {
  const {
    includeExtensions = null,
    maxDepth = Infinity,
    followSymlinks = false
  } = options;
  const output = [];

  function walk(currentDir, depth) {
    if (depth > maxDepth || !fileExists(currentDir)) {
      return;
    }
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isSymbolicLink() && !followSymlinks) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (!includeExtensions || includeExtensions.has(extension)) {
        output.push(fullPath);
      }
    }
  }

  walk(rootDir, 0);
  return output;
}

function hashString(value) {
  return crypto.createHash("sha1").update(value, "utf8").digest("hex");
}

function hashBuffer(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex");
}

function hashFile(filePath) {
  const hash = crypto.createHash("sha1");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function appendJsonLine(filePath, payload) {
  ensureDirSync(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

function makeWritableRecursive(targetPath) {
  if (!fileExists(targetPath)) {
    return;
  }

  const stat = fs.lstatSync(targetPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath)) {
      makeWritableRecursive(path.join(targetPath, entry));
    }
    try {
      fs.chmodSync(targetPath, 0o777);
    } catch (_error) {
      // Ignore Windows chmod inconsistencies.
    }
    return;
  }

  try {
    fs.chmodSync(targetPath, 0o666);
  } catch (_error) {
    // Ignore Windows chmod inconsistencies.
  }
}

function removeDirContents(targetDir) {
  if (!fileExists(targetDir)) {
    return;
  }
  for (const entry of fs.readdirSync(targetDir)) {
    const fullPath = path.join(targetDir, entry);
    makeWritableRecursive(fullPath);
    fs.rmSync(fullPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
}

function sanitizePathInput(value) {
  if (!value) {
    return null;
  }
  return path.resolve(String(value).trim().replace(/^["']|["']$/g, ""));
}

module.exports = {
  appendJsonLine,
  ensureDirSync,
  fileExists,
  hashBuffer,
  hashFile,
  hashString,
  listFilesRecursive,
  readJson,
  removeDirContents,
  sanitizePathInput,
  writeJson,
  writeText
};
