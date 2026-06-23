const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, removeDirContents, writeJson } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_SHELL_ENTRY = "content/www.poptropica.com/game/Shell.swf";
const AS3_DIRECT_WRAPPER_ENTRY = "content/www.poptropica.com/flashpoint/as3-direct.php";
const HUD_CLASS = "game.ui.hud.Hud";

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function findSevenZip(config) {
  const candidates = [
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "x64", "7za.exe") : null,
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "ia32", "7za.exe") : null,
    "C:\\Program Files\\AMD\\CIM\\Bin64\\7z.exe",
    "C:\\Program Files\\Autodesk\\AdODIS\\V1\\Setup\\7za.exe"
  ];
  return candidates.find((candidate) => candidate && fileExists(candidate)) || null;
}

function runCommand(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || result.error?.message || "").trim()}`);
  }
  return result;
}

function findExportedHud(root) {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!fileExists(current)) {
      continue;
    }
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

function exportHud(ffdecCli, shellPath, outputRoot, label) {
  const scriptRoot = path.join(outputRoot, "scripts");
  ensureDirSync(scriptRoot);
  runCommand(ffdecCli, [
    "-cli",
    "-selectclass",
    HUD_CLASS,
    "-export",
    "script",
    scriptRoot,
    shellPath
  ], `export ${label} Hud`);
  const hudPath = findExportedHud(scriptRoot);
  if (!hudPath) {
    throw new Error(`Unable to find exported Hud.as for ${label}.`);
  }
  return hudPath;
}

function analyzeHud(hudPath) {
  const source = fs.readFileSync(hudPath, "utf8").replace(/\r\n/gu, "\n");
  const oldFormulaMatches = [
    "this.shellApi.viewportWidth - (80 / 2 + 10)",
    "shellApi.viewportWidth - (80 / 2 + 10)"
  ].filter((pattern) => source.includes(pattern));
  const staticOverlayMatches = [
    "zhLocalizeHudStaticLabels",
    "zhMenuOverlay",
    'text = "菜单"'
  ].filter((pattern) => source.includes(pattern));
  const helperMatches = [
    "private function zhVisibleLeft",
    "private function zhVisibleWidth",
    "private function zhVisibleRight",
    "private function zhHudButtonTargetX"
  ].filter((pattern) => source.includes(pattern));
  const rightAlignedMatches = [
    "_loc2_.x = _loc7_",
    "newHudX = visibleRight - (80 / 2 + 10)",
    "targetX = this.zhHudButtonTargetX(newHudX,layoutCount,layoutIndex)"
  ].filter((pattern) => source.includes(pattern));
  const hitAreaPatterns = [
    "import flash.events.MouseEvent;",
    "import flash.external.ExternalInterface;",
    "import flash.utils.getTimer;",
    "_zhLastHudFallbackMs",
    "private function zhEnsureHudHitArea",
    "this.zhEnsureHudHitArea(_loc4_.hudBtn);",
    "_loc3_.buttonMode = true",
    "_loc3_.alpha = 0.01",
    "_loc3_.graphics.beginFill(16777215,0.01)",
    "_loc3_.graphics.drawRect(-96,-72,168,144)",
    "param1.mouseEnabled = true",
    "param1.hitArea = _loc3_",
    "param1.hit = _loc3_",
    "this.zhWireHudMouseFallback(_loc4_.hudBtn);",
    "private function zhWireHudMouseFallback",
    "private function zhInstallHudStageMouseFallback",
    "private function zhHudStageMouseFallback",
    "private function zhHudMouseFallback",
    "this.zhInstallHudStageMouseFallback();",
    "SceneUtil.delay(this,0.25,this.zhInstallHudStageMouseFallback)",
    "SceneUtil.delay(this,1,this.zhInstallHudStageMouseFallback)",
    "this.zhRegisterHudBrowserCallbacks();",
    "private function zhRegisterHudBrowserCallbacks",
    "ExternalInterface.addCallback(\"flashpointOpenHud\"",
    "ExternalInterface.addCallback(\"flashpointToggleHud\"",
    "private function zhFlashpointOpenHud",
    "private function zhFlashpointToggleHud",
    "MouseEvent.MOUSE_DOWN",
    "MouseEvent.MOUSE_UP",
    "this.zhHudStageMouseFallback,true,1000,true",
    "param1.stageX",
    "this.zhVisibleRight() - 220",
    "this.shellApi.viewportWidth - 220",
    "getTimer()",
    "this._zhLastHudFallbackMs = _loc2_",
    "param1.stopImmediatePropagation()",
    "this.openHud(true)"
  ];
  const hitAreaMatches = hitAreaPatterns.filter((pattern) => source.includes(pattern));

  return {
    hudPath,
    hasOldViewportFormula: oldFormulaMatches.length > 0,
    oldFormulaMatches,
    hasStaticMenuChineseOverlay: staticOverlayMatches.length > 0,
    staticOverlayMatches,
    hasVisibleViewportHelpers: helperMatches.length >= 3,
    helperMatches,
    hasRightAlignedHudLogic: rightAlignedMatches.length > 0,
    rightAlignedMatches,
    hasMenuHitAreaPatch: hitAreaMatches.length === hitAreaPatterns.length,
    hitAreaMatches
  };
}

function analyzeWrapper(wrapperPath) {
  const source = fs.readFileSync(wrapperPath, "utf8").replace(/\r\n/gu, "\n");
  const browserFallbackPatterns = [
    "let hudMenuHitProxy = null;",
    "function ensureHudMenuHitProxy",
    'hudMenuHitProxy.id = "hudMenuHitProxy";',
    "hudMenuHitProxy.addEventListener(\"click\", maybeToggleHudFromPointer, true)",
    "function callFlashpointHudToggle",
    "callFlashpointHudToggle(attempt + 1)",
    "function maybeToggleHudFromPointer",
    "let lastResizeReloadAt = 0;",
    "document.documentElement.clientWidth",
    "document.documentElement.clientHeight",
    "Date.now() - lastResizeReloadAt < 5000",
    "embed.getBoundingClientRect()",
    "x < width - 180",
    "y > 200",
    "embed.flashpointToggleHud()",
    "callFlashpointHudToggle(0)",
    'nextEmbed.setAttribute("wmode", "direct")',
    'root.addEventListener("click", maybeToggleHudFromPointer, true)'
  ];
  const browserFallbackMatches = browserFallbackPatterns.filter((pattern) => source.includes(pattern));
  return {
    wrapperPath,
    hasHudBrowserClickFallback: browserFallbackMatches.length === browserFallbackPatterns.length,
    browserFallbackMatches,
    hasOuterViewportSizing: source.includes("window.outerWidth") || source.includes("window.outerHeight")
  };
}

function extractRuntimeEntry(sevenZip, runtimeZipPath, entry, outputRoot) {
  runCommand(sevenZip, [
    "x",
    runtimeZipPath,
    entry,
    `-o${outputRoot}`,
    "-y",
    "-bsp0"
  ], `extract ${entry}`);
  const extractedPath = path.join(outputRoot, entry.replace(/\//gu, path.sep));
  if (!fileExists(extractedPath)) {
    throw new Error(`Runtime entry was not extracted: ${entry}`);
  }
  return extractedPath;
}

function main() {
  const config = loadConfig();
  const ffdecCli = config.tools?.ffdecCli;
  const sevenZip = findSevenZip(config);
  const packShellPath = path.join(paths.as3PackDir, "swf", AS3_SHELL_ENTRY.replace(/\//gu, path.sep));
  const packWrapperPath = path.join(paths.as3PackDir, "files", AS3_DIRECT_WRAPPER_ENTRY.replace(/\//gu, path.sep));
  const runtimeZipPath = paths.as3RuntimeZipPath;
  const workDir = path.join(paths.tempDir, "as3-runtime-integrity");

  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("FFDec CLI is not configured.");
  }
  if (!sevenZip) {
    throw new Error("No 7-Zip executable was found.");
  }
  if (!fileExists(packShellPath)) {
    throw new Error(`AS3 pack Shell is missing: ${packShellPath}`);
  }
  if (!fileExists(runtimeZipPath)) {
    throw new Error(`AS3 runtime zip is missing: ${runtimeZipPath}`);
  }

  removeDirContents(workDir);
  ensureDirSync(workDir);
  const runtimeExtractRoot = path.join(workDir, "runtime");
  const runtimeShellPath = extractRuntimeEntry(sevenZip, runtimeZipPath, AS3_SHELL_ENTRY, runtimeExtractRoot);
  const runtimeWrapperPath = extractRuntimeEntry(sevenZip, runtimeZipPath, AS3_DIRECT_WRAPPER_ENTRY, runtimeExtractRoot);
  const packHudPath = exportHud(ffdecCli, packShellPath, path.join(workDir, "pack-shell"), "pack Shell");
  const runtimeHudPath = exportHud(ffdecCli, runtimeShellPath, path.join(workDir, "runtime-shell"), "runtime Shell");

  const packShellSha256 = sha256File(packShellPath);
  const runtimeShellSha256 = sha256File(runtimeShellPath);
  const packWrapperSha256 = fileExists(packWrapperPath) ? sha256File(packWrapperPath) : null;
  const runtimeWrapperSha256 = fileExists(runtimeWrapperPath) ? sha256File(runtimeWrapperPath) : null;
  const packHud = analyzeHud(packHudPath);
  const runtimeHud = analyzeHud(runtimeHudPath);
  const packWrapper = analyzeWrapper(packWrapperPath);
  const runtimeWrapper = analyzeWrapper(runtimeWrapperPath);

  const checks = [
    {
      id: "pack_runtime_shell_match",
      ok: packShellSha256 === runtimeShellSha256,
      packShellSha256,
      runtimeShellSha256
    },
    {
      id: "pack_runtime_wrapper_match",
      ok: packWrapperSha256 === runtimeWrapperSha256,
      packWrapperSha256,
      runtimeWrapperSha256
    },
    {
      id: "pack_hud_no_old_formula",
      ok: !packHud.hasOldViewportFormula,
      details: packHud.oldFormulaMatches
    },
    {
      id: "runtime_hud_no_old_formula",
      ok: !runtimeHud.hasOldViewportFormula,
      details: runtimeHud.oldFormulaMatches
    },
    {
      id: "pack_hud_no_static_menu_chinese_overlay",
      ok: !packHud.hasStaticMenuChineseOverlay,
      details: packHud.staticOverlayMatches
    },
    {
      id: "runtime_hud_no_static_menu_chinese_overlay",
      ok: !runtimeHud.hasStaticMenuChineseOverlay,
      details: runtimeHud.staticOverlayMatches
    },
    {
      id: "pack_hud_has_visible_viewport_helpers",
      ok: packHud.hasVisibleViewportHelpers,
      details: packHud.helperMatches
    },
    {
      id: "runtime_hud_has_visible_viewport_helpers",
      ok: runtimeHud.hasVisibleViewportHelpers,
      details: runtimeHud.helperMatches
    },
    {
      id: "pack_hud_has_right_aligned_logic",
      ok: packHud.hasRightAlignedHudLogic,
      details: packHud.rightAlignedMatches
    },
    {
      id: "runtime_hud_has_right_aligned_logic",
      ok: runtimeHud.hasRightAlignedHudLogic,
      details: runtimeHud.rightAlignedMatches
    },
    {
      id: "pack_hud_has_menu_hit_area_patch",
      ok: packHud.hasMenuHitAreaPatch,
      details: packHud.hitAreaMatches
    },
    {
      id: "runtime_hud_has_menu_hit_area_patch",
      ok: runtimeHud.hasMenuHitAreaPatch,
      details: runtimeHud.hitAreaMatches
    },
    {
      id: "pack_wrapper_has_hud_browser_click_fallback",
      ok: packWrapper.hasHudBrowserClickFallback,
      details: packWrapper.browserFallbackMatches
    },
    {
      id: "runtime_wrapper_has_hud_browser_click_fallback",
      ok: runtimeWrapper.hasHudBrowserClickFallback,
      details: runtimeWrapper.browserFallbackMatches
    },
    {
      id: "pack_wrapper_no_outer_viewport_sizing",
      ok: !packWrapper.hasOuterViewportSizing,
      details: packWrapper.hasOuterViewportSizing ? ["window.outerWidth/window.outerHeight"] : []
    },
    {
      id: "runtime_wrapper_no_outer_viewport_sizing",
      ok: !runtimeWrapper.hasOuterViewportSizing,
      details: runtimeWrapper.hasOuterViewportSizing ? ["window.outerWidth/window.outerHeight"] : []
    }
  ];
  const failedChecks = checks.filter((check) => !check.ok).map((check) => check.id);
  const report = {
    ok: failedChecks.length === 0,
    generatedAt: new Date().toISOString(),
    failedChecks,
    checks,
    paths: {
      packShellPath,
      packWrapperPath,
      runtimeZipPath,
      runtimeShellPath,
      runtimeWrapperPath,
      packHudPath,
      runtimeHudPath
    },
    packHud,
    runtimeHud,
    packWrapper,
    runtimeWrapper,
    sevenZip,
    ffdecCli
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-runtime-integrity.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
  if (!report.ok) {
    process.exitCode = 1;
  }
}

main();
