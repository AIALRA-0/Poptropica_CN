const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const paths = require("./paths");
const { ensureDirSync, writeJson } = require("./fs-utils");

function getPythonBinary() {
  return process.env.PYTHON || "python";
}

function getQaHelperPath() {
  return path.join(paths.toolsRoot, "qa-helper.py");
}

function runPythonQa(args, options = {}) {
  const pythonBinary = getPythonBinary();
  const result = spawnSync(pythonBinary, [getQaHelperPath(), ...args], {
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
  return spawn(pythonBinary, [getQaHelperPath(), ...args], {
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

function writeQaReport(name, payload) {
  const filePath = path.join(paths.qaDir, name);
  writeJson(filePath, payload);
  return filePath;
}

module.exports = {
  ensureQaDir,
  runPythonQa,
  spawnPythonQa,
  waitForPythonChild,
  writeQaReport
};
