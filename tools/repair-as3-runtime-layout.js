const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");

const AS3_BASE_PAGE = "content/www.poptropica.com/base.php";

function findSevenZip(config) {
  const candidates = [
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "x64", "7za.exe") : null,
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "ia32", "7za.exe") : null,
    "C:\\Program Files\\AMD\\CIM\\Bin64\\7z.exe",
    "C:\\Program Files\\Autodesk\\AdODIS\\V1\\Setup\\7za.exe"
  ];
  return candidates.find((candidate) => candidate && fileExists(candidate)) || null;
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64,
    ...options
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return result;
}

function patchAs3BasePageLayout(content) {
  if (!/SCENE_AS3_START/u.test(content)) {
    return content;
  }
  const stylePattern = /<style>[\s\S]*?<\/style>/u;
  if (!stylePattern.test(content)) {
    throw new Error("Unable to locate AS3 base.php style block.");
  }
  const patchedStyle = content.replace(stylePattern, `<style>
            html, body {
                margin: 0;
                width: 100%;
                height: 100%;
                overflow: hidden !important;
                background-color: #139ffd;
            }
            body { position: relative; }
            embed {
                background-color: #0099ff;
                outline-width: 0;
                position: absolute;
                left: 0;
                top: 0;
                width: 100vw;
                height: 100vh;
            }
        </style>`);
  return patchedStyle.replace(
    /width="<\?php echo \$width; \?>" height="<\?php echo \$height; \?>"/u,
    `width="100%" height="100%"`
  );
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

  const workDir = path.join(paths.tempDir, "as3-runtime-layout-repair");
  removeDirContents(workDir);
  ensureDirSync(workDir);

  runChecked(sevenZip, [
    "x",
    paths.as3RuntimeZipPath,
    AS3_BASE_PAGE.replace(/\//gu, "\\"),
    `-o${workDir}`,
    "-y"
  ]);

  const basePath = path.join(workDir, AS3_BASE_PAGE.replace(/\//gu, path.sep));
  if (!fileExists(basePath)) {
    throw new Error(`Unable to extract ${AS3_BASE_PAGE} from AS3 runtime zip.`);
  }

  const originalContent = fs.readFileSync(basePath, "utf8");
  const patchedContent = patchAs3BasePageLayout(originalContent);
  const changed = patchedContent !== originalContent;

  if (changed) {
    writeText(basePath, patchedContent);
    const updateListPath = path.join(workDir, "as3-runtime-layout-update-list.txt");
    fs.writeFileSync(updateListPath, `${AS3_BASE_PAGE.replace(/\//gu, "\\")}\r\n`, "utf8");
    runChecked(sevenZip, ["u", paths.as3RuntimeZipPath, `@${updateListPath}`, "-mx=1"], {
      cwd: workDir
    });
    runChecked(sevenZip, ["t", paths.as3RuntimeZipPath]);
  }

  const packTarget = path.join(paths.as3PackDir, "files", AS3_BASE_PAGE.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(packTarget));
  writeText(packTarget, patchedContent);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    runtimeZipPath: paths.as3RuntimeZipPath,
    assetPath: AS3_BASE_PAGE,
    changed
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-runtime-layout-repair.json");
  writeJson(reportPath, report);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main();
