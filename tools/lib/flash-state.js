const fs = require("node:fs");
const path = require("node:path");
const { ensureDirSync, fileExists } = require("./fs-utils");

const POPTROPICA_SOL_NAME_PATTERN = /^(Backup|campaignData|CampaignTimers|Char|FlashpointStartFlow|poptropica.*|settings|trace|TransitToken)\.sol$/iu;
const POPTROPICA_HOST_PATTERN = /(?:^|[/\\])#?www\.poptropica\.com(?:$|[/\\])/iu;
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const AS2_CHAR_TEMPLATE_PATH = path.join(PROJECT_ROOT, "runtime-data", "tmp", "sol-state-test", "Char.sol");
const AS2_BACKUP_TEMPLATE_PATH = path.join(PROJECT_ROOT, "runtime-data", "tmp", "sol-backup", "Backup.sol");

function getPoptropicaFlashStateRoots(appData = process.env.APPDATA) {
  if (!appData) {
    return [];
  }

  return [
    path.join(appData, "Macromedia", "Flash Player", "#SharedObjects"),
    path.join(appData, "Macromedia", "Flash Player", "macromedia.com", "support", "flashplayer", "sys")
  ].filter(fileExists);
}

function assertInsideRoot(rootPath, targetPath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove Flash state outside expected root: ${target}`);
  }
}

function removeFlashStateEntry(rootPath, targetPath, removedPaths) {
  assertInsideRoot(rootPath, targetPath);
  fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  removedPaths.push(targetPath);
}

function clearPoptropicaFlashState(options = {}) {
  const roots = options.roots || getPoptropicaFlashStateRoots(options.appData);
  const removedPaths = [];

  for (const rootPath of roots) {
    if (!fileExists(rootPath)) {
      continue;
    }

    const walk = (currentPath) => {
      let entries = [];
      try {
        entries = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch (_error) {
        return;
      }

      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);
        const normalizedPath = entryPath.replace(/\\/gu, "/");
        const hostMatch = POPTROPICA_HOST_PATTERN.test(normalizedPath);
        const solMatch = entry.isFile() && POPTROPICA_SOL_NAME_PATTERN.test(entry.name);

        if (hostMatch || solMatch) {
          removeFlashStateEntry(rootPath, entryPath, removedPaths);
          continue;
        }

        if (entry.isDirectory()) {
          walk(entryPath);
        }
      }
    };

    walk(rootPath);
  }

  return {
    ok: true,
    reason: options.reason || "poptropica-flash-state-reset",
    roots,
    removedCount: removedPaths.length,
    removedPaths: removedPaths.slice(0, 50)
  };
}

function bufferFromParts(parts) {
  return Buffer.concat(parts.filter(Boolean));
}

function u16(value) {
  const output = Buffer.alloc(2);
  output.writeUInt16BE(value, 0);
  return output;
}

function u32(value) {
  const output = Buffer.alloc(4);
  output.writeUInt32BE(value, 0);
  return output;
}

function f64(value) {
  const output = Buffer.alloc(8);
  output.writeDoubleBE(Number(value) || 0, 0);
  return output;
}

function amfUtf(value) {
  const text = Buffer.from(String(value), "utf8");
  return bufferFromParts([u16(text.length), text]);
}

function amfValue(value) {
  if (value === null) {
    return Buffer.from([0x05]);
  }
  if (value === undefined) {
    return Buffer.from([0x06]);
  }
  if (typeof value === "boolean") {
    return Buffer.from([0x01, value ? 1 : 0]);
  }
  if (typeof value === "number") {
    return bufferFromParts([Buffer.from([0x00]), f64(value)]);
  }
  if (typeof value === "string") {
    return bufferFromParts([Buffer.from([0x02]), amfUtf(value)]);
  }
  if (Array.isArray(value)) {
    return bufferFromParts([
      Buffer.from([0x0a]),
      u32(value.length),
      ...value.map((entry) => amfValue(entry))
    ]);
  }
  if (typeof value === "object") {
    return bufferFromParts([Buffer.from([0x03]), amfProperties(value), Buffer.from([0x00, 0x00, 0x09])]);
  }
  return Buffer.from([0x06]);
}

function amfProperties(data) {
  return bufferFromParts(Object.entries(data).map(([key, value]) => bufferFromParts([amfUtf(key), amfValue(value)])));
}

function buildSol(sharedObjectName, data) {
  const name = Buffer.from(sharedObjectName, "utf8");
  const payload = bufferFromParts([
    Buffer.from("TCSO", "ascii"),
    u16(4),
    u32(0),
    u16(name.length),
    name,
    u32(0),
    amfProperties(data),
    Buffer.from([0x00, 0x00, 0x09])
  ]);
  return bufferFromParts([Buffer.from([0x00, 0xbf]), u32(payload.length), payload]);
}

function getSharedObjectsDomainDir(appData = process.env.APPDATA) {
  if (!appData) {
    return null;
  }
  const sharedObjectsRoot = path.join(appData, "Macromedia", "Flash Player", "#SharedObjects");
  ensureDirSync(sharedObjectsRoot);
  const existingDomain = findExistingPoptropicaDomainDir(sharedObjectsRoot);
  if (existingDomain) {
    return existingDomain;
  }
  const bucket = fs.readdirSync(sharedObjectsRoot, { withFileTypes: true }).find((entry) => entry.isDirectory())?.name || "POPTROPICA";
  const domainDir = path.join(sharedObjectsRoot, bucket, "www.poptropica.com");
  ensureDirSync(domainDir);
  return domainDir;
}

function findExistingPoptropicaDomainDir(sharedObjectsRoot) {
  if (!fileExists(sharedObjectsRoot)) {
    return null;
  }
  const buckets = fs.readdirSync(sharedObjectsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const bucket of buckets) {
    const candidate = path.join(sharedObjectsRoot, bucket.name, "www.poptropica.com");
    if (fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

function readAs2CharGender(charSolPath) {
  if (!fileExists(charSolPath)) {
    return null;
  }
  const bytes = fs.readFileSync(charSolPath);
  const key = Buffer.from("gender", "ascii");
  const index = bytes.indexOf(key);
  if (index < 2 || index + key.length + 9 >= bytes.length) {
    return null;
  }
  const valueTypeOffset = index + key.length;
  if (bytes[valueTypeOffset] !== 0x00) {
    return null;
  }
  const gender = bytes.readDoubleBE(valueTypeOffset + 1);
  return gender === 0 || gender === 1 ? gender : null;
}

function buildDefaultAs2Char(room, island) {
  return {
    gender: 1,
    skinColor: 16776160,
    hairColor: 7340000,
    lineColor: 0,
    eyelidsPos: 0,
    eyesFrame: "1",
    marksFrame: "empty",
    pantsFrame: "astrofarmer",
    lineWidth: 4,
    shirtFrame: "26",
    hairFrame: "lc_slayton",
    mouthFrame: "1",
    itemFrame: null,
    packFrame: null,
    facialFrame: "empty",
    overshirtFrame: null,
    overpantsFrame: null,
    specialAbility: "none",
    specialAbilityParams: null,
    firstAs3Load: true,
    last_island: island,
    last_room: room,
    [`${room}xPos`]: 600,
    [`${room}yPos`]: 430,
    dir: -1,
    login: "default2",
    completedEvents: {}
  };
}

function buildAs2TransitToken(room, island) {
  return {
    nextScene: room,
    nextIsland: island,
    prevDir: "left",
    nextX: null,
    nextY: null,
    dbid: null,
    pass_hash: null,
    look: "g1,16776160,7340000,0,0,1,empty,astrofarmer,4,26,lc_slayton,1,,empty,,none:"
  };
}

function parseAs2LaunchTarget(launchUrl, fallback = {}) {
  try {
    const parsed = new URL(launchUrl);
    return {
      room: parsed.searchParams.get("room") || fallback.room || "SuperMain",
      island: parsed.searchParams.get("island") || fallback.island || "Super"
    };
  } catch (_error) {
    return {
      room: fallback.room || "SuperMain",
      island: fallback.island || "Super"
    };
  }
}

function ensurePoptropicaAs2FlashState(options = {}) {
  const target = parseAs2LaunchTarget(options.launchUrl || "", {
    room: options.room,
    island: options.island
  });
  const domainDir = getSharedObjectsDomainDir(options.appData);
  if (!domainDir) {
    return { ok: false, reason: "missing-appdata", target };
  }

  const charPath = path.join(domainDir, "Char.sol");
  const transitTokenPath = path.join(domainDir, "TransitToken.sol");
  const backupPath = path.join(domainDir, "Backup.sol");
  const genderBefore = readAs2CharGender(charPath);
  let charAction = "preserved";

  if (genderBefore === null) {
    if (options.useTemplateChar && fileExists(AS2_CHAR_TEMPLATE_PATH)) {
      fs.copyFileSync(AS2_CHAR_TEMPLATE_PATH, charPath);
      charAction = "restored-template";
    } else {
      fs.writeFileSync(charPath, buildSol("Char", buildDefaultAs2Char(target.room, target.island)));
      charAction = "generated-target-default";
    }
  }

  if (!fileExists(backupPath) && fileExists(AS2_BACKUP_TEMPLATE_PATH)) {
    fs.copyFileSync(AS2_BACKUP_TEMPLATE_PATH, backupPath);
  }

  fs.writeFileSync(transitTokenPath, buildSol("TransitToken", buildAs2TransitToken(target.room, target.island)));
  return {
    ok: true,
    reason: "as2-flash-state-prepared",
    target,
    domainDir,
    charAction,
    genderBefore,
    genderAfter: readAs2CharGender(charPath),
    transitTokenAction: "generated"
  };
}

module.exports = {
  clearPoptropicaFlashState,
  ensurePoptropicaAs2FlashState,
  getPoptropicaFlashStateRoots
};
