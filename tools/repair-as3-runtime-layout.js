const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { AS3_DIRECT_WRAPPER_PATH, buildAs3DirectWrapperPhp } = require("./lib/as3-direct-wrapper");

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

function replaceRequired(content, pattern, replacement, label) {
  const next = content.replace(pattern, replacement);
  if (next === content) {
    throw new Error(`Unable to patch AS3 base.php ${label}.`);
  }
  return next;
}

function patchAs3BasePageViewportFit(content) {
  let next = content;
  if (!next.includes("function getRawParam")) {
    next = replaceRequired(
      next,
      /function getParam\(string \$name, string \$default\) : string \{\r?\n    global \$reqObj;\r?\n    return isset\(\$reqObj\[\$name\]\) \? urlencode\(\$reqObj\[\$name\]\) : \$default;\r?\n\}/u,
      `function getParam(string $name, string $default) : string {
    global $reqObj;
    return isset($reqObj[$name]) ? urlencode($reqObj[$name]) : $default;
}

function getRawParam(string $name, string $default) : string {
    global $reqObj;
    return isset($reqObj[$name]) ? (string)$reqObj[$name] : $default;
}`,
      "raw parameter helper"
    );
  }

  if (!next.includes("$requestedRoom = getRawParam")) {
    next = replaceRequired(
      next,
      /\$scene = getParam\('room', 'Home'\);\r?\n\$island = getParam\('island', 'Home'\);\r?\n\$path = getParam\('startup_path', 'gameplay'\);/u,
      `$requestedRoom = getRawParam('room', 'Home');
$requestedIsland = getRawParam('island', 'Home');
$requestedStartupPath = getRawParam('startup_path', 'gameplay');
$scene = urlencode($requestedRoom);
$island = urlencode($requestedIsland);
$path = urlencode($requestedStartupPath);`,
      "request parameter preservation"
    );
  }

  if (!next.includes('value="<?php echo htmlspecialchars($requestedRoom')) {
    next = replaceRequired(
      next,
      /<input type="hidden" name="room">\r?\n            <input type="hidden" name="island">\r?\n            <input type="hidden" name="startup_path">/u,
      `<input type="hidden" name="room" value="<?php echo htmlspecialchars($requestedRoom, ENT_QUOTES, 'UTF-8'); ?>">
            <input type="hidden" name="island" value="<?php echo htmlspecialchars($requestedIsland, ENT_QUOTES, 'UTF-8'); ?>">
            <input type="hidden" name="startup_path" value="<?php echo htmlspecialchars($requestedStartupPath, ENT_QUOTES, 'UTF-8'); ?>">`,
      "form parameter preservation"
    );
  }

  next = next.replace(
    /const FLASHPOINT_CURRENT_REQUEST = <\?php echo json_encode\(array\([\s\S]*?\n\}, 500\);\r?\n\r?\n/u,
    ""
  );

  if (!next.includes("FLASHPOINT_GAME_WIDTH")) {
    const viewportFitScript = `const FLASHPOINT_GAME_WIDTH = <?php echo json_encode((int)$width); ?>;
const FLASHPOINT_GAME_HEIGHT = <?php echo json_encode((int)$height); ?>;
let flashpointViewportTimer = 0;

function flashpointApplyEmbedViewport() {
    const embed = document.querySelector("embed");
    if(!embed)
        return;

    const baseWidth = Math.max(1, Number(FLASHPOINT_GAME_WIDTH) || 1136);
    const baseHeight = Math.max(1, Number(FLASHPOINT_GAME_HEIGHT) || 673);
    const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    const scale = Math.min(viewportWidth / baseWidth, viewportHeight / baseHeight);
    const width = Math.max(1, Math.round(baseWidth * scale));
    const height = Math.max(1, Math.round(baseHeight * scale));

    embed.style.left = Math.round((viewportWidth - width) * 0.5) + "px";
    embed.style.top = Math.round((viewportHeight - height) * 0.5) + "px";
    embed.style.width = width + "px";
    embed.style.height = height + "px";
    embed.style.transform = "none";
}

function flashpointScheduleEmbedViewport() {
    window.clearTimeout(flashpointViewportTimer);
    flashpointApplyEmbedViewport();
    flashpointViewportTimer = window.setTimeout(flashpointApplyEmbedViewport, 120);
}

window.addEventListener("resize", flashpointScheduleEmbedViewport);
window.addEventListener("orientationchange", flashpointScheduleEmbedViewport);
[ 0, 50, 150, 350, 800, 1500, 3000, 6000 ].forEach(function(delayMs) {
    window.setTimeout(flashpointApplyEmbedViewport, delayMs);
});

`;
    next = replaceRequired(
      next,
      /<\?php if\(\$pageState === STATE_AS3\) \{ \?>/u,
      `${viewportFitScript}<?php if($pageState === STATE_AS3) { ?>`,
      "viewport fit script"
    );
  }

  next = next.replace(
    /function loadAS3Embassy\(\) \{\r?\n    if\(flashpointShouldReloadBeforeAs3Embassy\(\)\) \{\r?\n        flashpointRequestViewportReload\("as3EmbassyViewport"\);\r?\n        return;\r?\n    \}\r?\n\r?\n/u,
    "function loadAS3Embassy() {\n"
  );

  if (!next.includes("parent.insertBefore(embed, sibling);\n    flashpointApplyEmbedViewport();")) {
    next = replaceRequired(
      next,
      /parent\.insertBefore\(embed, sibling\);/u,
      `parent.insertBefore(embed, sibling);
    flashpointApplyEmbedViewport();`,
      "AS3 embassy viewport fit"
    );
  }

  return next;
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
                background-color: #59645d;
            }
            body { position: relative; }
            embed {
                background-color: #59645d;
                outline-width: 0;
                position: absolute;
                left: 50%;
                top: 50%;
                width: <?php echo $width; ?>px;
                height: <?php echo $height; ?>px;
                transform: translate(-50%, -50%);
            }
        </style>`);
  const neutralEmbed = patchedStyle.replace(
    /<embed bgcolor="[0-9a-fA-F#]+"/u,
    `<embed bgcolor="59645d"`
  );
  const resizedEmbed = neutralEmbed.replace(
    /width="<\?php echo \$width; \?>" height="<\?php echo \$height; \?>"/u,
    `width="100%" height="100%"`
  );
  return patchAs3BasePageViewportFit(resizedEmbed);
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
  const changedFiles = [];

  if (patchedContent !== originalContent) {
    writeText(basePath, patchedContent);
    changedFiles.push(AS3_BASE_PAGE);
  }

  const wrapperPath = path.join(workDir, AS3_DIRECT_WRAPPER_PATH.replace(/\//gu, path.sep));
  const wrapperContent = buildAs3DirectWrapperPhp();
  if (!fileExists(wrapperPath) || fs.readFileSync(wrapperPath, "utf8") !== wrapperContent) {
    ensureDirSync(path.dirname(wrapperPath));
    writeText(wrapperPath, wrapperContent);
    changedFiles.push(AS3_DIRECT_WRAPPER_PATH);
  }

  if (changedFiles.length > 0) {
    const updateListPath = path.join(workDir, "as3-runtime-layout-update-list.txt");
    fs.writeFileSync(updateListPath, `${changedFiles.map((entry) => entry.replace(/\//gu, "\\")).join("\r\n")}\r\n`, "utf8");
    runChecked(sevenZip, ["u", paths.as3RuntimeZipPath, `@${updateListPath}`, "-mx=1"], {
      cwd: workDir
    });
    runChecked(sevenZip, ["t", paths.as3RuntimeZipPath]);
  }

  const packTarget = path.join(paths.as3PackDir, "files", AS3_BASE_PAGE.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(packTarget));
  writeText(packTarget, patchedContent);
  const wrapperPackTarget = path.join(paths.as3PackDir, "files", AS3_DIRECT_WRAPPER_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(wrapperPackTarget));
  writeText(wrapperPackTarget, wrapperContent);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    runtimeZipPath: paths.as3RuntimeZipPath,
    assetPath: AS3_BASE_PAGE,
    directWrapperPath: AS3_DIRECT_WRAPPER_PATH,
    packAssetPath: packTarget,
    packDirectWrapperPath: wrapperPackTarget,
    changed: changedFiles.length > 0,
    changedFiles
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-runtime-layout-repair.json");
  writeJson(reportPath, report);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main();
