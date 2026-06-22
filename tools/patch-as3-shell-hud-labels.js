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
const PATCH_ASSET_ID = "as3-shell:hud-menu-text-overlay-removed";

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
  if (next.includes("private function zhHudTopMargin")) {
    next = next.replace(
      /private function zhHudTopMargin\(\) : Number\s*\{\s*return \d+;\s*\}/u,
      "private function zhHudTopMargin() : Number\n      {\n         return 26;\n      }"
    );
  }
  if (next.includes("private function zhHudTopMargin") && !next.includes("return 26;")) {
    throw new Error("Unable to update Hud top margin.");
  }
  next = next.replace(
    /var _loc2_:Spatial = this\._hudBtnEntity\.get\(Spatial\);\n\s*_loc2_\.x = this\.shellApi\.viewportWidth - \(80 \/ 2 \+ 10\);\n\s*var _loc5_:int = 0;/u,
    `var _loc2_:Spatial = this._hudBtnEntity.get(Spatial);
         var _loc7_:Number = Math.max(58,this.zhVisibleWidth() - 58);
         var _loc8_:Number = 86;
         _loc2_.x = _loc7_;
         var _loc5_:int = 0;
         _loc4_.settingsBtn.x = _loc7_ - _loc8_ * 7;
         _loc4_.audioBtn.x = _loc7_ - _loc8_ * 6 - 15;
         MovieClip(_loc4_.homeBtn).x = _loc7_ - _loc8_ * 5 - 25;`
  );
  next = next.replace(
    /_loc4_\.audioBtn\.x = _loc7_ - _loc8_ \* 6(?: - \d+)?;/u,
    "_loc4_.audioBtn.x = _loc7_ - _loc8_ * 6 - 15;"
  );
  next = next.replace(
    /MovieClip\(_loc4_\.homeBtn\)\.x = _loc7_ - _loc8_ \* 5(?: - \d+)?;/u,
    "MovieClip(_loc4_.homeBtn).x = _loc7_ - _loc8_ * 5 - 25;"
  );
  next = next.replace(
    /_loc4_\.homeBtn\.x = _loc7_ - _loc8_ \* 5(?: - \d+)?;/u,
    "_loc4_.homeBtn.x = _loc7_ - _loc8_ * 5 - 25;"
  );
  next = next.replace(
    /_loc6_ = _loc4_\.storeBtn;\n\s*_loc6_\.x = _loc2_\.x - \(80 \* 4 - 10\);/u,
    `_loc6_ = _loc4_.storeBtn;
         _loc6_.x = _loc7_ - _loc8_ * 4;`
  );
  next = next.replace(
    /_loc6_ = _loc4_\.mapBtn;\n\s*_loc6_\.x = _loc2_\.x - \(80 \* 3 - 10\);/u,
    `_loc6_ = _loc4_.mapBtn;
         _loc6_.x = _loc7_ - _loc8_ * 3;`
  );
  next = next.replace(
    /_loc6_ = _loc4_\.costumizerBtn;\n\s*_loc6_\.x = _loc2_\.x - \(80 \* 2 - 10\);/u,
    `_loc6_ = _loc4_.costumizerBtn;
         _loc6_.x = _loc7_ - _loc8_ * 2;`
  );
  next = next.replace(
    /_loc6_ = _loc4_\.inventoryBtn;\n\s*_loc6_\.x = _loc2_\.x - \(80 - 10\);/u,
    `_loc6_ = _loc4_.inventoryBtn;
         _loc6_.x = _loc7_ - _loc8_;`
  );
  if (!next.includes("_loc4_.audioBtn.x = _loc7_ - _loc8_ * 6 - 15") || !(next.includes("MovieClip(_loc4_.homeBtn).x = _loc7_ - _loc8_ * 5 - 25") || next.includes("_loc4_.homeBtn.x = _loc7_ - _loc8_ * 5 - 25")) || !next.includes("_loc4_.settingsBtn.x = _loc7_ - _loc8_ * 7") || next.includes("this.shellApi.viewportWidth - (80 / 2 + 10)")) {
    throw new Error("Unable to update AS3 Hud right-aligned button positions.");
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
  manifest.swfPatchedAssets = Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [];
  const hadPatchEntry = manifest.swfPatchedAssets.some((entry) => entry?.assetId === PATCH_ASSET_ID);
  if (!hadPatchEntry) {
    manifest.assetsPatched = Number(manifest.assetsPatched || 0) + 1;
  }
  manifest.swfPatchedAssets = manifest.swfPatchedAssets
    .filter((entry) => entry?.assetId !== PATCH_ASSET_ID);
  manifest.swfPatchedAssets.push({
    assetId: PATCH_ASSET_ID,
    assetPath: AS3_SHELL_PATH,
    outputPath: packShell
  });

  const runtimeZip = process.env.POPTROPICA_SKIP_RUNTIME_REBUILD === "1"
    ? {
        status: "skipped",
        reason: "POPTROPICA_SKIP_RUNTIME_REBUILD=1",
        runtimeZipPath: paths.as3RuntimeZipPath
      }
    : buildRuntimeZipForSourceGroup({
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
    patch: "remove Chinese TextField overlay from Hud static MENU art and keep every expanded HUD icon in one right-aligned row"
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-shell-hud-labels-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
