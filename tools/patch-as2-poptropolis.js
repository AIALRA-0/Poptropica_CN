const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const {
  ensureDirSync,
  fileExists,
  hashFile,
  listFilesRecursive,
  readJson,
  removeDirContents,
  writeJson
} = require("./lib/fs-utils");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");

const AS2_RELATIVE_PATH = "content/www.poptropica.com/popups/Tribal/selectTribe.swf";
const PATCH_ASSET_ID = "poptropolis:select-tribe-script";
const PATCH_REPLACEMENT = "var _loc4_ = this.tribeName;";

const POPUP_MOUSE_ROUTER_BLOCK = [
  "function zhPoptropolisInvokeOnce(clip,handlerName)",
  "{",
  "   var _loc1_;",
  "   var _loc2_;",
  "   if(clip == undefined || handlerName == undefined || typeof clip[handlerName] != \"function\")",
  "   {",
  "      return undefined;",
  "   }",
  "   _loc1_ = getTimer();",
  "   _loc2_ = Number(clip.__zhPoptropolisLastInvokeAt);",
  "   if(!isNaN(_loc2_) && _loc1_ - _loc2_ < 350)",
  "   {",
  "      return undefined;",
  "   }",
  "   clip.__zhPoptropolisLastInvokeAt = _loc1_;",
  "   clip[handlerName]();",
  "}",
  "function zhPoptropolisRouteMouseUp()",
  "{",
  "   var _loc1_;",
  "   var _loc2_;",
  "   var _loc3_;",
  "   var _loc4_;",
  "   var _loc5_;",
  "   var _loc6_;",
  "   var _loc7_;",
  "   if(_root == undefined || _root.popupClip != this.__zhPoptropolisPopupRoot || this.__zhPoptropolisPopupRoot == undefined)",
  "   {",
  "      return undefined;",
  "   }",
  "   _loc1_ = _root._xmouse;",
  "   _loc2_ = _root._ymouse;",
  "   _loc3_ = 0;",
  "   while(_loc3_ < 8)",
  "   {",
  "      _loc4_ = this.__zhPoptropolisPopupRoot[\"btn\" + _loc3_];",
  "      if(_loc4_ != undefined && _loc4_._visible != false && _loc4_.enabled != false && _loc4_.getBounds != undefined)",
  "      {",
  "         _loc5_ = _loc4_.getBounds(_root);",
  "         if(_loc5_ != undefined && _loc1_ >= Number(_loc5_.xMin) && _loc1_ <= Number(_loc5_.xMax) && _loc2_ >= Number(_loc5_.yMin) && _loc2_ <= Number(_loc5_.yMax))",
  "         {",
  "            zhPoptropolisInvokeOnce(_loc4_,\"onRelease\");",
  "            loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PoptropolisTribeClickRouted&button=\" + _loc3_,0);",
  "            return undefined;",
  "         }",
  "      }",
  "      _loc3_ += 1;",
  "   }",
  "   _loc6_ = this.__zhPoptropolisPopupRoot.btnStart;",
  "   if(_loc6_ != undefined && _loc6_._visible != false && _loc6_.enabled != false && _loc6_.getBounds != undefined)",
  "   {",
  "      _loc7_ = _loc6_.getBounds(_root);",
  "      if(_loc7_ != undefined && _loc1_ >= Number(_loc7_.xMin) && _loc1_ <= Number(_loc7_.xMax) && _loc2_ >= Number(_loc7_.yMin) && _loc2_ <= Number(_loc7_.yMax))",
  "      {",
  "         zhPoptropolisInvokeOnce(_loc6_,\"onRelease\");",
  "         loadVariablesNum(\"/brain/track.php?cluster=QA&scene=Gameplay&event=PoptropolisStartClickRouted\",0);",
  "      }",
  "   }",
  "}",
  "function zhSelectTribeOnce()",
  "{",
  "   var _loc1_ = this;",
  "   var _loc2_ = getTimer();",
  "   if(_loc1_.__zhPoptropolisSelectAt != undefined && _loc2_ - Number(_loc1_.__zhPoptropolisSelectAt) < 350)",
  "   {",
  "      return undefined;",
  "   }",
  "   _loc1_.__zhPoptropolisSelectAt = _loc2_;",
  "   selectTribe.call(_loc1_);",
  "}",
  "function zhSelectAndCloseOnce()",
  "{",
  "   var _loc1_ = this;",
  "   var _loc2_ = getTimer();",
  "   if(_loc1_.__zhPoptropolisStartAt != undefined && _loc2_ - Number(_loc1_.__zhPoptropolisStartAt) < 350)",
  "   {",
  "      return undefined;",
  "   }",
  "   _loc1_.__zhPoptropolisStartAt = _loc2_;",
  "   selectAndClose.call(_loc1_);",
  "}",
  "function zhInstallPoptropolisMouseRouter()",
  "{",
  "   var _loc1_;",
  "   if(Mouse == undefined || this.__zhPoptropolisMouseRouterInstalled == true)",
  "   {",
  "      return undefined;",
  "   }",
  "   this.__zhPoptropolisPopupRoot = this;",
  "   this.__zhPoptropolisMouseRouterInstalled = true;",
  "   this.__zhPoptropolisMouseRouter = new Object();",
  "   this.__zhPoptropolisMouseRouter.__zhPoptropolisPopupRoot = this;",
  "   this.__zhPoptropolisMouseRouter.onMouseUp = zhPoptropolisRouteMouseUp;",
  "   Mouse.addListener(this.__zhPoptropolisMouseRouter);",
  "}"
].join("\n");

function runChecked(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 128,
    timeout: 300000,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim()}`);
  }
  return result;
}

function normalize(value) {
  return String(value || "").replace(/\\/gu, "/").toLowerCase();
}

function findSourceSwf() {
  const root = path.join(paths.extractedDir, "as2");
  const suffix = `/${AS2_RELATIVE_PATH.toLowerCase()}`;
  const candidates = listFilesRecursive(root, { includeExtensions: new Set([".swf"]) })
    .filter((filePath) => normalize(filePath).endsWith(suffix))
    .sort((left, right) => {
      const leftStat = fs.statSync(left);
      const rightStat = fs.statSync(right);
      return rightStat.mtimeMs - leftStat.mtimeMs || left.localeCompare(right, "en");
    });
  if (candidates.length === 0) {
    throw new Error(`Unable to find extracted AS2 asset: ${AS2_RELATIVE_PATH}`);
  }
  return candidates[0];
}

function findSelectTribeScript(scriptRoot) {
  const scripts = listFilesRecursive(scriptRoot, { includeExtensions: new Set([".as"]) });
  const candidates = scripts.filter((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    return content.includes("function selectTribe()") && content.includes("setTribe.getName()");
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one Poptropolis selectTribe script, found ${candidates.length}`);
  }
  return candidates[0];
}

function patchSelectTribeScript(filePath) {
  const before = fs.readFileSync(filePath, "utf8").replace(/\r\n/gu, "\n");
  let after = before.replace("var _loc4_ = setTribe.getName();", PATCH_REPLACEMENT);
  if (!after.includes("function zhInstallPoptropolisMouseRouter()")) {
    after = after.replace("function init()", `${POPUP_MOUSE_ROUTER_BLOCK}\nfunction init()`);
  }
  after = after.replace("_loc3_.onRelease = selectTribe;", "_loc3_.onRelease = zhSelectTribeOnce;");
  after = after.replace("btnStart.onRelease = selectAndClose;", "btnStart.onRelease = zhSelectAndCloseOnce;");
  if (after.includes("function init()") && !after.includes("zhInstallPoptropolisMouseRouter();")) {
    after = after.replace("   startText._visible = false;", "   startText._visible = false;\n   zhInstallPoptropolisMouseRouter();");
  }
  if (after === before) {
    throw new Error("Poptropolis selectTribe script did not contain the known setTribe bug");
  }
  fs.writeFileSync(filePath, after, "utf8");
  return {
    changed: true,
    original: "var _loc4_ = setTribe.getName();",
    replacement: PATCH_REPLACEMENT
  };
}

function updateManifest(manifestPath, runtimeZip, patchEntry) {
  const manifest = fileExists(manifestPath) ? readJson(manifestPath, {}) : {};
  const entries = Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [];
  const previous = entries.find((entry) => entry?.assetId === PATCH_ASSET_ID);
  if (!previous) {
    manifest.assetsPatched = Number(manifest.assetsPatched || 0) + 1;
  }
  manifest.generatedAt = new Date().toISOString();
  manifest.swfPatchedAssets = entries.filter((entry) => entry?.assetId !== PATCH_ASSET_ID);
  manifest.swfPatchedAssets.push(patchEntry);
  manifest.runtimeZip = runtimeZip;
  writeJson(manifestPath, manifest);
  return manifest;
}

function main() {
  const config = loadConfig();
  const ffdecCli = config.tools?.ffdecCli || path.join(paths.runtimeDataDir, "tools", "ffdec_26.2.1", "ffdec-cli.exe");
  if (!fileExists(ffdecCli)) {
    throw new Error(`FFDec CLI is not configured: ${ffdecCli}`);
  }

  const sourceSwf = findSourceSwf();
  const outputSwf = path.join(paths.as2PackDir, "swf", ...AS2_RELATIVE_PATH.split("/"));
  const workDir = path.join(paths.tempDir, "as2-poptropolis-select-tribe");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  ensureDirSync(scriptRoot);
  runChecked(ffdecCli, ["-cli", "-export", "script", scriptRoot, sourceSwf], "export Poptropolis selectTribe scripts");

  const scriptFile = findSelectTribeScript(scriptRoot);
  const patch = patchSelectTribeScript(scriptFile);
  const patchedSwf = path.join(workDir, "selectTribe.patched.swf");
  const exportPath = path.relative(scriptRoot, scriptFile).replace(/\\/gu, "/");
  const replaceTarget = `\\${exportPath.replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`;
  runChecked(ffdecCli, ["-replace", sourceSwf, patchedSwf, replaceTarget, scriptFile], "replace Poptropolis selectTribe script");

  ensureDirSync(path.dirname(outputSwf));
  fs.copyFileSync(patchedSwf, outputSwf);

  const manifestPath = path.join(paths.as2PackDir, "manifest.json");
  const manifest = fileExists(manifestPath) ? readJson(manifestPath, {}) : {};
  const runtimeZip = buildRuntimeZipForSourceGroup({
    config,
    sourceGroup: "as2",
    manifest
  });
  const patchEntry = {
    assetId: PATCH_ASSET_ID,
    assetPath: AS2_RELATIVE_PATH,
    outputPath: outputSwf,
    sourcePath: sourceSwf,
    sourceHash: hashFile(sourceSwf),
    outputHash: hashFile(outputSwf),
    changed: patch.changed,
    replaceTarget,
    notes: "Fixes the original Poptropolis selectTribe handler reference to the selected button's tribe name so the START button and popup close chain remain usable."
  };
  const updatedManifest = updateManifest(manifestPath, runtimeZip, patchEntry);
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    assetPath: AS2_RELATIVE_PATH,
    sourceSwf,
    outputSwf,
    patch,
    replaceTarget,
    runtimeZip,
    manifestPath,
    manifestEntry: updatedManifest.swfPatchedAssets.find((entry) => entry?.assetId === PATCH_ASSET_ID)
  };
  const reportPath = path.join(paths.qaDir, "as2", "poptropolis-select-tribe-patch.json");
  writeJson(reportPath, report);
  printJson(report);
}

main();
