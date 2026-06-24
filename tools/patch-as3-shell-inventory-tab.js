const path = require("node:path");
const { spawnSync } = require("node:child_process");

const stripScript = path.join(__dirname, "strip-static-text-overlays.js");
const result = spawnSync(process.execPath, [stripScript, "--as3"], {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  windowsHide: true
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
