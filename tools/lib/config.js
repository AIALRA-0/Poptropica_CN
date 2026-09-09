const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const paths = require("./paths");
const { ensureDirSync, fileExists, readJson, sanitizePathInput, writeJson } = require("./fs-utils");

function findCommand(commandName) {
  const result = spawnSync("where", [commandName], {
    encoding: "utf8",
    shell: false,
    windowsHide: true
  });
  if (result.status === 0) {
    const first = result.stdout.split(/\r?\n/u).map((line) => line.trim()).find(Boolean);
    return first || null;
  }
  return null;
}

function detectToolPaths() {
  const candidates = {
    tarBin: [findCommand("tar"), "C:\\Windows\\system32\\tar.exe"],
    javaBin: [findCommand("java"), "C:\\Program Files\\Eclipse Adoptium\\jdk-23.0.2.7-hotspot\\bin\\java.exe"],
    ffdecCli: [
      process.env.FFDEC_CLI,
      "C:\\Program Files\\FFDec\\ffdec-cli.exe",
      "C:\\Program Files\\FFDec\\ffdec.bat",
      "C:\\Program Files (x86)\\FFDec\\ffdec-cli.exe",
      "C:\\Program Files (x86)\\FFDec\\ffdec.bat"
    ]
  };
  const resolved = {};
  for (const [key, list] of Object.entries(candidates)) {
    resolved[key] = list.find((value) => value && fileExists(value)) || null;
  }
  return resolved;
}

function getDefaultConfig() {
  const tools = detectToolPaths();
  return {
    version: 2,
    sources: {
      flashpointRoot: null,
      as2Gamezip: null,
      as3Gamezip: null,
      steamRoot: null
    },
    tools: {
      tarBin: tools.tarBin,
      javaBin: tools.javaBin,
      ffdecCli: tools.ffdecCli
    },
    preferences: {
      locale: "zh-CN",
      sourcePriority: ["as2", "as3", "steam"],
      translationProvider: "deepseek",
      launchMode: "direct-mounted",
      debugMode: false,
      preferredFont: "SimHei",
      preferredWeight: 700
    }
  };
}

function normalizeConfig(config) {
  const defaults = getDefaultConfig();
  const merged = {
    ...defaults,
    ...config,
    sources: {
      ...defaults.sources,
      ...(config?.sources || {})
    },
    tools: {
      ...defaults.tools,
      ...(config?.tools || {})
    },
    preferences: {
      ...defaults.preferences,
      ...(config?.preferences || {})
    }
  };

  for (const key of Object.keys(merged.sources)) {
    merged.sources[key] = sanitizePathInput(merged.sources[key]);
  }
  for (const key of Object.keys(merged.tools)) {
    merged.tools[key] = sanitizePathInput(merged.tools[key]);
  }

  return merged;
}

function loadConfig() {
  ensureDirSync(paths.runtimeDataDir);
  return normalizeConfig(readJson(paths.configPath, getDefaultConfig()));
}

function saveConfig(config) {
  ensureDirSync(paths.runtimeDataDir);
  const normalized = normalizeConfig(config);
  writeJson(paths.configPath, normalized);
  return normalized;
}

function updateConfig(patch) {
  const current = loadConfig();
  return saveConfig({
    ...current,
    ...patch,
    sources: {
      ...current.sources,
      ...(patch?.sources || {})
    },
    tools: {
      ...current.tools,
      ...(patch?.tools || {})
    },
    preferences: {
      ...current.preferences,
      ...(patch?.preferences || {})
    }
  });
}

function describeConfiguredSources(config) {
  return {
    flashpointRoot: Boolean(config.sources.flashpointRoot && fileExists(config.sources.flashpointRoot)),
    as2Gamezip: Boolean(config.sources.as2Gamezip && fileExists(config.sources.as2Gamezip)),
    as3Gamezip: Boolean(config.sources.as3Gamezip && fileExists(config.sources.as3Gamezip)),
    steamRoot: Boolean(config.sources.steamRoot && fileExists(config.sources.steamRoot))
  };
}

module.exports = {
  describeConfiguredSources,
  getDefaultConfig,
  loadConfig,
  saveConfig,
  updateConfig
};
