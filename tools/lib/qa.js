const path = require("node:path");
const fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");
const paths = require("./paths");
const { ensureDirSync, writeJson } = require("./fs-utils");

const WINDOW_MONITOR_COMMANDS = new Set([
  "wait-window",
  "capture-window",
  "capture-window-sequence",
  "click-window",
  "key-window"
]);

function getPythonBinary() {
  return process.env.PYTHON || "python";
}

function getQaHelperPath() {
  return path.join(paths.toolsRoot, "qa-helper.py");
}

function hasCliArg(args, name) {
  return args.includes(name) || args.some((arg) => String(arg).startsWith(`${name}=`));
}

function flagEnabled(value) {
  return /^(1|true|yes|y)$/iu.test(String(value || ""));
}

function isMissingRequestLine(line) {
  const text = String(line || "");
  if (/flashpoint-gmp-dummy\.xml/iu.test(text)) {
    return false;
  }
  if (/\bStatus\s*=\s*404\b/iu.test(text)) {
    return true;
  }
  if (/\b(?:ENOENT|not found|missing)\b/iu.test(text)) {
    return !/\bStatus\s*=\s*200\b/iu.test(text);
  }
  return false;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function lineHasQueryValue(line, name, expectedValue) {
  const encoded = encodeURIComponent(String(expectedValue || ""));
  const alternatives = [String(expectedValue || ""), encoded]
    .filter(Boolean)
    .map(escapeRegExp);
  if (!alternatives.length) {
    return false;
  }
  const pattern = new RegExp(`(?:[?&]|\\b)${escapeRegExp(name)}=(?:${alternatives.join("|")})(?:[&#\\s]|$)`, "iu");
  return pattern.test(String(line || ""));
}

function splitCamelSceneName(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .trim();
}

function normalizeLogPath(line) {
  return String(line || "").replace(/\\/gu, "/");
}

function buildAs2SceneEvidence(entry, segment, args = {}) {
  const lines = String(segment || "")
    .split(/\r?\n/gu)
    .filter(Boolean);
  const normalizedLines = lines.map((line) => ({
    raw: line,
    normalized: normalizeLogPath(line)
  }));
  const sceneFolder = String(entry.sceneFolder || entry.islandParam || "").trim();
  const roomParam = String(entry.roomParam || "").trim();
  const islandParam = String(entry.islandParam || sceneFolder || "").trim();
  const sceneSwfPath = sceneFolder && roomParam
    ? `/scenes/island${sceneFolder}/scene${roomParam}.swf`
    : null;
  const sceneNameCandidates = [...new Set([
    roomParam,
    splitCamelSceneName(roomParam)
  ].filter(Boolean))];

  const baseRequestLines = normalizedLines
    .filter((line) => /base\.php/iu.test(line.normalized) &&
      (!roomParam || lineHasQueryValue(line.normalized, "room", roomParam)) &&
      (!islandParam || lineHasQueryValue(line.normalized, "island", islandParam)))
    .map((line) => line.raw);
  const sceneSwfLines = sceneSwfPath
    ? normalizedLines
        .filter((line) => line.normalized.toLowerCase().includes(sceneSwfPath.toLowerCase()))
        .map((line) => line.raw)
    : [];
  const sceneTrackLines = normalizedLines
    .filter((line) => /brain\/track\.php/iu.test(line.normalized) &&
      lineHasQueryValue(line.normalized, "event", "Loaded") &&
      sceneNameCandidates.some((candidate) => lineHasQueryValue(line.normalized, "scene", candidate)))
    .map((line) => line.raw);
  const checks = [
    {
      name: "target_base_php_request",
      ok: baseRequestLines.length > 0,
      expected: {
        room: roomParam || null,
        island: islandParam || null
      },
      count: baseRequestLines.length,
      samples: baseRequestLines.slice(0, 6)
    },
    {
      name: "target_scene_swf_request",
      ok: sceneSwfLines.length > 0,
      expectedPath: sceneSwfPath,
      count: sceneSwfLines.length,
      samples: sceneSwfLines.slice(0, 6)
    },
    {
      name: "target_scene_loaded_track",
      ok: sceneTrackLines.length > 0,
      informational: true,
      expected: {
        sceneCandidates: sceneNameCandidates
      },
      count: sceneTrackLines.length,
      samples: sceneTrackLines.slice(0, 6)
    }
  ];
  const requiredChecks = checks.filter((check) => !check.informational);
  return {
    required: flagEnabled(args.requireSceneEvidence),
    ok: requiredChecks.length > 0 && requiredChecks.every((check) => check.ok),
    target: {
      sceneFolder: sceneFolder || null,
      roomParam: roomParam || null,
      islandParam: islandParam || null,
      sceneSwfPath
    },
    checks
  };
}

function withDefaultWindowQaArgs(args) {
  const normalized = [...args];
  const command = normalized[0];
  const targetMonitor = String(process.env.POPTROPICA_QA_MONITOR || "").trim();
  if (targetMonitor && WINDOW_MONITOR_COMMANDS.has(command) && !hasCliArg(normalized, "--target-monitor")) {
    normalized.push("--target-monitor", targetMonitor);
  }

  if (
    command === "capture-window" &&
    flagEnabled(process.env.POPTROPICA_QA_NO_FOREGROUND) &&
    !hasCliArg(normalized, "--no-foreground")
  ) {
    normalized.push("--no-foreground");
  }

  if (
    (command === "click-window" || command === "key-window") &&
    flagEnabled(process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS) &&
    !(command === "key-window" && flagEnabled(process.env.POPTROPICA_QA_KEYBOARD_EVENTS)) &&
    !hasCliArg(normalized, "--post-message")
  ) {
    normalized.push("--post-message");
  }

  return normalized;
}

function runPythonQa(args, options = {}) {
  const pythonBinary = getPythonBinary();
  const helperArgs = withDefaultWindowQaArgs(args);
  const result = spawnSync(pythonBinary, [getQaHelperPath(), ...helperArgs], {
    cwd: paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeoutMs || 60000,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8"
    }
  });

  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();
  if (result.status !== 0) {
    const error = new Error(stderr || stdout || "Python QA helper failed.");
    error.stdout = stdout;
    error.stderr = stderr;
    error.status = result.status;
    throw error;
  }

  if (!stdout) {
    return null;
  }

  try {
    return JSON.parse(stdout);
  } catch (error) {
    const parseError = new Error(`Python QA helper returned invalid JSON: ${stdout}`);
    parseError.cause = error;
    throw parseError;
  }
}

function spawnPythonQa(args, options = {}) {
  const pythonBinary = getPythonBinary();
  const helperArgs = withDefaultWindowQaArgs(args);
  return spawn(pythonBinary, [getQaHelperPath(), ...helperArgs], {
    cwd: paths.projectRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8"
    },
    ...options
  });
}

function waitForPythonChild(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("close", (code) => {
      if (code !== 0) {
        const error = new Error((stderr || stdout || "Python QA helper failed.").trim());
        error.status = code;
        reject(error);
        return;
      }
      try {
        resolve(stdout.trim() ? JSON.parse(stdout) : null);
      } catch (error) {
        reject(new Error(`Python QA helper returned invalid JSON: ${stdout}`));
      }
    });
  });
}

function ensureQaDir(...segments) {
  return ensureDirSync(path.join(paths.qaDir, ...segments));
}

function isProcessAlive(pid) {
  const numericPid = Number(pid || 0);
  if (!numericPid || numericPid === process.pid) {
    return false;
  }
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function acquireQaLock(lockName, context = {}) {
  const lockPath = path.join(paths.qaDir, lockName);
  const payload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    command: process.argv.join(" "),
    ...context
  };

  ensureDirSync(path.dirname(lockPath));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let fd = null;
    try {
      fd = fs.openSync(lockPath, "wx");
      fs.writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      return {
        lockPath,
        release() {
          const current = readJsonIfExists(lockPath);
          if (!current || Number(current.pid) === process.pid) {
            try {
              fs.unlinkSync(lockPath);
            } catch (_error) {
              // Best effort cleanup only.
            }
          }
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
      const existing = readJsonIfExists(lockPath);
      if (existing && isProcessAlive(existing.pid)) {
        const lockError = new Error(`QA lock is already held by pid ${existing.pid}: ${lockPath}`);
        lockError.code = "QA_LOCKED";
        lockError.lockPath = lockPath;
        lockError.lock = existing;
        throw lockError;
      }
      try {
        fs.unlinkSync(lockPath);
      } catch (_error) {
        // Retry once; if that fails, surface a lock error below.
      }
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch (_error) {
          // Already closed or invalid.
        }
      }
    }
  }

  const lockError = new Error(`Unable to acquire QA lock: ${lockPath}`);
  lockError.code = "QA_LOCKED";
  lockError.lockPath = lockPath;
  lockError.lock = readJsonIfExists(lockPath);
  throw lockError;
}

function writeQaReport(name, payload) {
  const filePath = path.join(paths.qaDir, name);
  writeJson(filePath, payload);
  return filePath;
}

module.exports = {
  acquireQaLock,
  buildAs2SceneEvidence,
  ensureQaDir,
  isMissingRequestLine,
  runPythonQa,
  spawnPythonQa,
  waitForPythonChild,
  writeQaReport
};
