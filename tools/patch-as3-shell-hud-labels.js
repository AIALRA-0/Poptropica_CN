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

  if (!next.includes("import flash.display.Sprite;")) {
    next = next.replace("   import flash.display.MovieClip;\n", "   import flash.display.MovieClip;\n   import flash.display.Sprite;\n");
  }
  if (!next.includes("import flash.events.MouseEvent;")) {
    next = next.replace("   import flash.display.Sprite;\n", "   import flash.display.Sprite;\n   import flash.events.MouseEvent;\n");
  }
  if (!next.includes("import flash.external.ExternalInterface;")) {
    next = next.replace("   import flash.events.MouseEvent;\n", "   import flash.events.MouseEvent;\n   import flash.external.ExternalInterface;\n");
  }
  if (!next.includes("import flash.utils.getTimer;")) {
    next = next.replace("   import flash.geom.ColorTransform;\n", "   import flash.geom.ColorTransform;\n   import flash.utils.getTimer;\n");
  }

  if (!next.includes("_zhLastHudFallbackMs")) {
    next = next.replace(
      "      protected var _hudBtnEntity:Entity;\n",
      "      protected var _hudBtnEntity:Entity;\n      private var _zhLastHudFallbackMs:Number = 0;\n"
    );
  }
  if (!next.includes("this.zhRegisterHudBrowserCallbacks();")) {
    next = next.replace(
      "         this.reset();\n         super.groupReady();",
      "         this.reset();\n         this.zhInstallHudStageMouseFallback();\n         SceneUtil.delay(this,0.25,this.zhInstallHudStageMouseFallback);\n         SceneUtil.delay(this,1,this.zhInstallHudStageMouseFallback);\n         this.zhRegisterHudBrowserCallbacks();\n         super.groupReady();"
    );
  } else if (!next.includes("SceneUtil.delay(this,0.25,this.zhInstallHudStageMouseFallback);")) {
    next = next.replace(
      "         this.reset();\n         this.zhRegisterHudBrowserCallbacks();",
      "         this.reset();\n         this.zhInstallHudStageMouseFallback();\n         SceneUtil.delay(this,0.25,this.zhInstallHudStageMouseFallback);\n         SceneUtil.delay(this,1,this.zhInstallHudStageMouseFallback);\n         this.zhRegisterHudBrowserCallbacks();"
    );
  }

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
  next = next
    .replace(
      "         this.setupBottomRow();\n         this._hudBtnEntity = ButtonCreator.createButtonEntity(_loc4_.hudBtn,this,this.onHudBtnClick,null,null,null,false);",
      "         this.setupBottomRow();\n         this.zhEnsureHudHitArea(_loc4_.hudBtn);\n         this._hudBtnEntity = ButtonCreator.createButtonEntity(_loc4_.hudBtn,this,this.onHudBtnClick,null,null,null,false);\n         this.zhWireHudMouseFallback(_loc4_.hudBtn);"
    )
    .replace(/         this\.zhEnsureHudHitArea\(_loc4_\.hudBtn\);\n         this\.zhEnsureHudHitArea\(_loc4_\.hudBtn\);/gu, "         this.zhEnsureHudHitArea(_loc4_.hudBtn);")
    .replace(/         this\.zhWireHudMouseFallback\(_loc4_\.hudBtn\);\n         this\.zhWireHudMouseFallback\(_loc4_\.hudBtn\);/gu, "         this.zhWireHudMouseFallback(_loc4_.hudBtn);")
    .replace(
      "         this.zhEnsureHudHitArea(_loc4_.hudBtn);\n         this._hudBtnEntity = ButtonCreator.createButtonEntity(_loc4_.hudBtn,this,this.onHudBtnClick,null,null,null,false);\n         this._hudBtnEntity = ButtonCreator.createButtonEntity(_loc4_.hudBtn,this,this.onHudBtnClick,null,null,null,false);",
      "         this.zhEnsureHudHitArea(_loc4_.hudBtn);\n         this._hudBtnEntity = ButtonCreator.createButtonEntity(_loc4_.hudBtn,this,this.onHudBtnClick,null,null,null,false);\n         this.zhWireHudMouseFallback(_loc4_.hudBtn);"
    )
    .replace(
      "         this.zhEnsureHudHitArea(_loc4_.hudBtn);\n         this._hudBtnEntity = ButtonCreator.createButtonEntity(_loc4_.hudBtn,this,this.onHudBtnClick,null,null,null,false);",
      "         this.zhEnsureHudHitArea(_loc4_.hudBtn);\n         this._hudBtnEntity = ButtonCreator.createButtonEntity(_loc4_.hudBtn,this,this.onHudBtnClick,null,null,null,false);\n         this.zhWireHudMouseFallback(_loc4_.hudBtn);"
    )
    .replace(/         this\.zhWireHudMouseFallback\(_loc4_\.hudBtn\);\n         this\.zhWireHudMouseFallback\(_loc4_\.hudBtn\);/gu, "         this.zhWireHudMouseFallback(_loc4_.hudBtn);");
  const hudHitAreaMethod = `
      
      private function zhEnsureHudHitArea(param1:DisplayObjectContainer) : void
      {
         var _loc2_:DisplayObject = null;
         var _loc3_:Sprite = null;
         if(param1 == null)
         {
            return;
         }
         param1.mouseEnabled = true;
         param1.mouseChildren = true;
         _loc2_ = param1.getChildByName("hit");
         if(_loc2_ != null && _loc2_.parent != null)
         {
            _loc2_.parent.removeChild(_loc2_);
         }
         _loc3_ = new Sprite();
         _loc3_.name = "hit";
         _loc3_.mouseEnabled = true;
         _loc3_.mouseChildren = false;
         _loc3_.buttonMode = true;
         _loc3_.useHandCursor = true;
         _loc3_.alpha = 0.01;
         _loc3_.graphics.beginFill(16777215,0.01);
         _loc3_.graphics.drawRect(-96,-72,168,144);
         _loc3_.graphics.endFill();
         param1.addChild(_loc3_);
         if(param1 is MovieClip)
         {
            MovieClip(param1).mouseEnabled = true;
            MovieClip(param1).mouseChildren = true;
            MovieClip(param1).buttonMode = true;
            MovieClip(param1).useHandCursor = true;
            MovieClip(param1).hitArea = _loc3_;
            MovieClip(param1).hit = _loc3_;
         }
      }
      
      private function zhWireHudMouseFallback(param1:DisplayObjectContainer) : void
      {
         var _loc2_:DisplayObject = null;
         if(param1 == null)
         {
            return;
         }
         param1.mouseEnabled = true;
         param1.mouseChildren = true;
         if(param1 is MovieClip)
         {
            MovieClip(param1).mouseEnabled = true;
            MovieClip(param1).mouseChildren = true;
            MovieClip(param1).buttonMode = true;
            MovieClip(param1).useHandCursor = true;
         }
         param1.removeEventListener(MouseEvent.MOUSE_DOWN,this.zhHudMouseFallback);
         param1.removeEventListener(MouseEvent.MOUSE_UP,this.zhHudMouseFallback);
         param1.removeEventListener(MouseEvent.CLICK,this.zhHudMouseFallback);
         param1.addEventListener(MouseEvent.MOUSE_DOWN,this.zhHudMouseFallback,false,1000,true);
         param1.addEventListener(MouseEvent.MOUSE_UP,this.zhHudMouseFallback,false,1000,true);
         param1.addEventListener(MouseEvent.CLICK,this.zhHudMouseFallback,false,1000,true);
         _loc2_ = param1.getChildByName("hit");
         if(_loc2_ != null)
         {
            _loc2_.removeEventListener(MouseEvent.MOUSE_DOWN,this.zhHudMouseFallback);
            _loc2_.removeEventListener(MouseEvent.MOUSE_UP,this.zhHudMouseFallback);
            _loc2_.removeEventListener(MouseEvent.CLICK,this.zhHudMouseFallback);
            _loc2_.addEventListener(MouseEvent.MOUSE_DOWN,this.zhHudMouseFallback,false,1000,true);
            _loc2_.addEventListener(MouseEvent.MOUSE_UP,this.zhHudMouseFallback,false,1000,true);
            _loc2_.addEventListener(MouseEvent.CLICK,this.zhHudMouseFallback,false,1000,true);
         }
         this.zhInstallHudStageMouseFallback();
      }
      
      private function zhInstallHudStageMouseFallback() : void
      {
         var _loc1_:* = null;
         if(this.shellApi != null && this.shellApi.screenManager != null && this.shellApi.screenManager.stage != null)
         {
            _loc1_ = this.shellApi.screenManager.stage;
            _loc1_.removeEventListener(MouseEvent.MOUSE_DOWN,this.zhHudStageMouseFallback,true);
            _loc1_.removeEventListener(MouseEvent.MOUSE_UP,this.zhHudStageMouseFallback,true);
            _loc1_.removeEventListener(MouseEvent.CLICK,this.zhHudStageMouseFallback,true);
            _loc1_.addEventListener(MouseEvent.MOUSE_DOWN,this.zhHudStageMouseFallback,true,1000,true);
            _loc1_.addEventListener(MouseEvent.MOUSE_UP,this.zhHudStageMouseFallback,true,1000,true);
            _loc1_.addEventListener(MouseEvent.CLICK,this.zhHudStageMouseFallback,true,1000,true);
         }
      }
      
      private function zhHudStageMouseFallback(param1:MouseEvent) : void
      {
         var _loc2_:Number = Number(NaN);
         var _loc3_:Number = Number(NaN);
         var _loc4_:Spatial = null;
         var _loc5_:Number = Number(NaN);
         var _loc6_:Number = Number(NaN);
         var _loc7_:Number = Number(NaN);
         var _loc8_:Number = Number(NaN);
         var _loc9_:Boolean = false;
         if(param1 == null || this._hudBtnEntity == null)
         {
            return;
         }
         _loc2_ = Number(param1.stageX);
         _loc3_ = Number(param1.stageY);
         if(!isFinite(_loc2_) || !isFinite(_loc3_))
         {
            return;
         }
         _loc4_ = this._hudBtnEntity.get(Spatial);
         _loc5_ = _loc4_ != null ? _loc4_.x : this.zhVisibleRight() - 58;
         _loc6_ = _loc4_ != null ? _loc4_.y : this.zhHudVisibleY();
         _loc7_ = this.shellApi != null && this.shellApi.screenManager != null && this.shellApi.screenManager.stage != null ? Number(this.shellApi.screenManager.stage.stageWidth) : this.zhVisibleRight();
         _loc8_ = this.shellApi != null && this.shellApi.screenManager != null && this.shellApi.screenManager.stage != null ? Number(this.shellApi.screenManager.stage.stageHeight) : this.zhVisibleBottom();
         _loc9_ = _loc2_ >= _loc5_ - 140 && _loc2_ <= _loc5_ + 120 && _loc3_ >= _loc6_ - 130 && _loc3_ <= _loc6_ + 130;
         _loc9_ = _loc9_ || _loc2_ >= this.zhVisibleRight() - 220 && _loc2_ <= this.zhVisibleRight() + 48 && _loc3_ >= this.zhVisibleTop() && _loc3_ <= this.zhVisibleTop() + 230;
         _loc9_ = _loc9_ || _loc2_ >= _loc7_ - 220 && _loc2_ <= _loc7_ + 48 && _loc3_ >= 0 && _loc3_ <= 230;
         _loc9_ = _loc9_ || _loc2_ >= this.shellApi.viewportWidth - 220 && _loc2_ <= this.shellApi.viewportWidth + 48 && _loc3_ >= 0 && _loc3_ <= 230;
         if(!_loc9_)
         {
            return;
         }
         this.zhHudMouseFallback(param1);
      }
      
      private function zhHudMouseFallback(param1:MouseEvent) : void
      {
         var _loc2_:Number = Number(NaN);
         if(param1 != null)
         {
            param1.stopImmediatePropagation();
         }
         if(this._hudBtnEntity == null || this._isTransition)
         {
            return;
         }
         _loc2_ = getTimer();
         if(_loc2_ - this._zhLastHudFallbackMs < 250)
         {
            return;
         }
         this._zhLastHudFallbackMs = _loc2_;
         this.openHud(true);
      }
      
      private function zhRegisterHudBrowserCallbacks() : void
      {
         try
         {
            if(ExternalInterface.available)
            {
               ExternalInterface.addCallback("flashpointOpenHud",this.zhFlashpointOpenHud);
               ExternalInterface.addCallback("flashpointToggleHud",this.zhFlashpointToggleHud);
            }
         }
         catch(_loc1_:Error)
         {
         }
      }
      
      private function zhFlashpointOpenHud() : Boolean
      {
         if(this._hudBtnEntity == null)
         {
            return false;
         }
         this._zhLastHudFallbackMs = getTimer();
         this.openHud(true);
         return this._isHudOpen;
      }
      
      private function zhFlashpointToggleHud() : Boolean
      {
         if(this._hudBtnEntity == null)
         {
            return false;
         }
         this._zhLastHudFallbackMs = getTimer();
         this.openHud(!this._isHudOpen);
         return true;
      }
`;
  const hudHitAreaStart = next.indexOf("\n      private function zhEnsureHudHitArea");
  if (hudHitAreaStart !== -1) {
    const hudHitAreaEnd = next.indexOf("\n      public function createDebugConsoleButton", hudHitAreaStart);
    if (hudHitAreaEnd === -1) {
      throw new Error("Unable to locate end of Hud hit area helper.");
    }
    next = `${next.slice(0, hudHitAreaStart)}${hudHitAreaMethod}${next.slice(hudHitAreaEnd)}`;
  } else {
    const marker = "\n      public function createDebugConsoleButton";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate Hud createDebugConsoleButton marker for hit area helper.");
    }
    next = `${next.slice(0, markerIndex)}${hudHitAreaMethod}${next.slice(markerIndex)}`;
  }
  if (!next.includes("_loc4_.audioBtn.x = _loc7_ - _loc8_ * 6 - 15") || !(next.includes("MovieClip(_loc4_.homeBtn).x = _loc7_ - _loc8_ * 5 - 25") || next.includes("_loc4_.homeBtn.x = _loc7_ - _loc8_ * 5 - 25")) || !next.includes("_loc4_.settingsBtn.x = _loc7_ - _loc8_ * 7") || next.includes("this.shellApi.viewportWidth - (80 / 2 + 10)")) {
    throw new Error("Unable to update AS3 Hud right-aligned button positions.");
  }
  if (!next.includes("this.zhEnsureHudHitArea(_loc4_.hudBtn);") || !next.includes("private function zhEnsureHudHitArea") || !next.includes("this.zhWireHudMouseFallback(_loc4_.hudBtn);") || !next.includes("private function zhHudMouseFallback")) {
    throw new Error("Unable to add AS3 Hud MENU hit area.");
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
