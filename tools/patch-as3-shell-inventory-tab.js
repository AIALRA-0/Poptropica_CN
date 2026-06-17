const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, readJson, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const INVENTORY_TAB_CLASS = "game.ui.inventory.InventoryTab";

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

function findInventoryTabScript(root) {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name === "InventoryTab.as" && /game[\\/]ui[\\/]inventory[\\/]InventoryTab\.as$/iu.test(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

function applyInventoryTabPatch(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  if (!next.includes("import flash.display.Sprite;")) {
    next = next.replace("   import flash.display.MovieClip;\n", "   import flash.display.MovieClip;\n   import flash.display.Sprite;\n");
  }
  if (!next.includes("zhLocalizeStaticTabArt")) {
    const iconGotoPattern = /(         )(?:MovieClip\(super\.displayObject\)|super\.displayObject)\.icon\.gotoAndStop\(super\.id\);/u;
    if (!iconGotoPattern.test(next)) {
      throw new Error("Unable to locate InventoryTab icon gotoAndStop call.");
    }
    next = next.replace(iconGotoPattern, "$&\n         this.zhLocalizeStaticTabArt(MovieClip(super.displayObject));");
    const classClose = "\n   }\n}";
    const classCloseIndex = next.lastIndexOf(classClose);
    if (classCloseIndex === -1) {
      throw new Error("Unable to locate InventoryTab class close.");
    }
    const method = `
      
      private function zhLocalizeStaticTabArt(param1:MovieClip) : void
      {
         var _loc2_:Sprite = null;
         var _loc3_:TextField = null;
         var _loc4_:TextFormat = null;
         if(super.id != "custom" || param1 == null || param1.getChildByName("zhPrizeOverlay"))
         {
            return;
         }
         _loc2_ = new Sprite();
         _loc2_.name = "zhPrizeOverlay";
         _loc2_.mouseEnabled = false;
         _loc2_.mouseChildren = false;
         _loc2_.x = 58;
         _loc2_.y = 27;
         _loc2_.graphics.beginFill(0xF3C56A,1);
         _loc2_.graphics.drawRoundRect(0,0,64,24,7,7);
         _loc2_.graphics.endFill();
         _loc3_ = new TextField();
         _loc3_.mouseEnabled = false;
         _loc3_.selectable = false;
         _loc3_.embedFonts = false;
         _loc3_.width = 64;
         _loc3_.height = 27;
         _loc3_.x = 0;
         _loc3_.y = -2;
         _loc4_ = new TextFormat("_sans",18,0x3D2600,true,null,null,null,null,"center");
         _loc3_.defaultTextFormat = _loc4_;
         _loc3_.text = "奖品";
         _loc3_.setTextFormat(_loc4_);
         _loc2_.addChild(_loc3_);
         param1.addChild(_loc2_);
      }
`;
    next = `${next.slice(0, classCloseIndex)}${method}   }\n}${next.slice(classCloseIndex + classClose.length)}`;
  }
  if (!next.includes("zhLocalizeStaticTabArt")) {
    throw new Error("Unable to patch InventoryTab static prize art localization.");
  }
  next = next
    .replace(/_loc2_\.x = [-\d.]+;/u, "_loc2_.x = 13;")
    .replace(/_loc2_\.y = [-\d.]+;/u, "_loc2_.y = 17;")
    .replace(/_loc2_\.graphics\.drawRoundRect\(0,0,\s*[-\d.]+,\s*[-\d.]+,\s*[-\d.]+,\s*[-\d.]+\);/u, "_loc2_.graphics.drawRoundRect(0,0,92,32,8,8);")
    .replace(/_loc3_\.width = [-\d.]+;/u, "_loc3_.width = 92;")
    .replace(/_loc3_\.height = [-\d.]+;/u, "_loc3_.height = 34;")
    .replace(/_loc3_\.y = [-\d.]+;/u, "_loc3_.y = -1;")
    .replace(/new TextFormat\("_sans",\s*[-\d.]+,\s*0x3D2600/u, "new TextFormat(\"_sans\",20,0x3D2600");
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

  const workDir = path.join(paths.tempDir, "as3-shell-inventory-tab-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  const outputSwf = path.join(workDir, "Shell.swf");

  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    INVENTORY_TAB_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export InventoryTab");

  const inventoryTabPath = findInventoryTabScript(scriptRoot);
  if (!inventoryTabPath) {
    throw new Error("Unable to find exported InventoryTab.as.");
  }

  const originalScript = fs.readFileSync(inventoryTabPath, "utf8");
  const patchedScript = applyInventoryTabPatch(originalScript);
  writeText(inventoryTabPath, patchedScript);

  runFfdec(ffdecCli, [
    "-replace",
    packShell,
    outputSwf,
    INVENTORY_TAB_CLASS,
    inventoryTabPath
  ], "replace InventoryTab");

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
    assetId: "as3-shell:inventory-tab-prize-art-zh",
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
    inventoryTabPath,
    patch: "overlay Chinese prize label on Inventory custom tab static trophy art"
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-shell-inventory-tab-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
