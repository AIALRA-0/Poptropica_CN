const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, readJson, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const HUD_CLASS = "game.ui.hud.Hud";

function runFfdec(ffdecCli, args, label) {
  const result = spawnSync(ffdecCli, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim()}`);
  }
  return result;
}

function findHudScript(root) {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name === "Hud.as" && /game[\\/]ui[\\/]hud[\\/]Hud\.as$/iu.test(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

function applyHudLabelPatch(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");

  next = next.replace(/\n\s*this\.zhLocalizeHudStaticLabels\(_loc4_\.hudBtn\);/gu, "");

  const methodStart = next.indexOf("\n      private function zhLocalizeHudStaticLabels");
  if (methodStart !== -1) {
    const methodEnd = next.indexOf("\n      private function zhRelayoutHud", methodStart);
    if (methodEnd === -1) {
      throw new Error("Unable to locate end of zhLocalizeHudStaticLabels method.");
    }
    next = `${next.slice(0, methodStart)}${next.slice(methodEnd)}`;
  }

  if (next.includes("zhMenuOverlay") || next.includes('text = "菜单"')) {
    throw new Error("Unable to remove Hud MENU text overlay.");
  }
  return next;
}

function main() {
  const config = loadConfig();
  const ffdecCli = config.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("FFDec CLI is not configured.");
  }

  const packShell = path.join(paths.as3PackDir, "swf", AS3_SHELL_PATH.replace(/\//gu, path.sep));
  if (!fileExists(packShell)) {
    throw new Error(`AS3 pack Shell.swf is missing: ${packShell}`);
  }

  const workDir = path.join(paths.tempDir, "as3-shell-hud-labels-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  const outputSwf = path.join(workDir, "Shell.swf");

  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    HUD_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Hud");

  const hudPath = findHudScript(scriptRoot);
  if (!hudPath) {
    throw new Error("Unable to find exported Hud.as.");
  }

  const originalScript = fs.readFileSync(hudPath, "utf8");
  const patchedScript = applyHudLabelPatch(originalScript);
  writeText(hudPath, patchedScript);

  runFfdec(ffdecCli, [
    "-replace",
    packShell,
    outputSwf,
    HUD_CLASS,
    hudPath
  ], "replace Hud");

  fs.copyFileSync(outputSwf, packShell);

  const manifestPath = path.join(paths.as3PackDir, "manifest.json");
  const manifest = fileExists(manifestPath)
    ? readJson(manifestPath, {})
    : {
        generatedAt: new Date().toISOString(),
        sourceGroup: "as3",
        canonicalKeys: [],
        assetsPatched: 0,
        externalTextAssets: [],
        swfPatchedAssets: [],
        pendingSwfAssets: []
      };
  manifest.assetsPatched = Number(manifest.assetsPatched || 0) + 1;
  manifest.swfPatchedAssets = Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [];
  manifest.swfPatchedAssets.push({
    assetId: "as3-shell:hud-menu-text-overlay-removed",
    assetPath: AS3_SHELL_PATH,
    outputPath: packShell
  });

  const runtimeZip = buildRuntimeZipForSourceGroup({
    config,
    sourceGroup: "as3",
    manifest
  });
  writeJson(manifestPath, manifest);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    packShell,
    runtimeZip,
    hudPath,
    patch: "remove Chinese TextField overlay from Hud static MENU art; keep original icon until bitmap replacement exists"
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-shell-hud-labels-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
