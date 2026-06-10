const fs = require("node:fs");
const paths = require("./paths");
const { fileExists } = require("./fs-utils");

function parseEnvFile(filePath) {
  const map = {};
  if (!fileExists(filePath)) {
    return map;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    map[key] = value;
  }
  return map;
}

function loadProjectEnv() {
  const layers = [paths.rootEnvPath, paths.localEnvPath];
  for (const filePath of layers) {
    const envMap = parseEnvFile(filePath);
    for (const [key, value] of Object.entries(envMap)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
  return process.env;
}

module.exports = {
  loadProjectEnv
};
