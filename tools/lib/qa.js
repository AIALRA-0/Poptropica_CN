const path = require("node:path");
const fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");
const paths = require("./paths");
const { ensureDirSync, writeJson } = require("./fs-utils");

const WINDOW_MONITOR_COMMANDS = new Set(["wait-window", "capture-window", "click-window"]);

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
    command === "click-window" &&
    flagEnabled(process.env.POPTROPICA_QA_POST_MESSAGE_CLICKS) &&
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
  ensureQaDir,
  runPythonQa,
  spawnPythonQa,
  waitForPythonChild,
  writeQaReport
};
