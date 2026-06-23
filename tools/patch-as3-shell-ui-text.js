const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, readJson, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const PATCH_CLASSES = [
  "game.ui.elements.ConfirmationDialogBox",
  "game.ui.settings.SettingsPopup",
  "game.ui.hud.Hud",
  "game.ui.hud.HudPopBrowser",
  "game.ui.inventory.Inventory",
  "game.data.game.GameData",
  "com.poptropica.shells.browser.steps.BrowserStepCreateGame",
  "game.scenes.map.map.Map",
  "game.scenes.map.map.groups.IslandPage",
  "game.scenes.map.map.MapIslandLoader",
  "game.creators.ui.ButtonCreator",
  "game.creators.ui.WordBalloonCreator",
  "game.util.TextUtils",
  "game.creators.ui.TextDisplayCreator"
];

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

function findScript(root, relativeSuffix) {
  const normalizedSuffix = relativeSuffix.replace(/\//gu, path.sep).toLowerCase();
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (fullPath.toLowerCase().endsWith(normalizedSuffix)) {
        return fullPath;
      }
    }
  }
  return null;
}

function addImport(source, afterImport, newImport) {
  if (source.includes(newImport)) {
    return source;
  }
  if (!source.includes(afterImport)) {
    throw new Error(`Unable to locate import anchor: ${afterImport}`);
  }
  return source.replace(`${afterImport}\n`, `${afterImport}\n${newImport}\n`);
}

function escapeAsString(value) {
  return String(value || "")
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, '\\"')
    .replace(/\r/gu, "\\r")
    .replace(/\n/gu, "\\n");
}

function readAs3IslandTitles() {
  const scenesRoot = path.join(
    paths.as3PackDir,
    "files",
    "content",
    "www.poptropica.com",
    "game",
    "data",
    "scenes"
  );
  if (!fileExists(scenesRoot)) {
    return [];
  }
  const titles = [];
  for (const entry of fs.readdirSync(scenesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const islandPath = path.join(scenesRoot, entry.name, "island.xml");
    if (!fileExists(islandPath)) {
      continue;
    }
    const xml = fs.readFileSync(islandPath, "utf8");
    const id = xml.match(/<island>\s*([^<]+?)\s*<\/island>/su)?.[1]?.trim();
    const name = xml.match(/<name>\s*([^<]+?)\s*<\/name>/su)?.[1]?.trim();
    if (id && name) {
      titles.push({ id, name });
    }
  }
  titles.sort((a, b) => a.id.localeCompare(b.id));
  return titles;
}

function buildIslandTitleSwitch(titles) {
  const cases = [];
  const seen = new Set();
  for (const { id, name } of titles) {
    const key = String(id || "").toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    cases.push(`            case "${escapeAsString(key)}":\n               return "${escapeAsString(name)}";`);
  }
  return cases.join("\n");
}

function findConfirmationDialogInsertIndex(source) {
  const markers = [
    "\n      override protected function onStageResize",
    "\n      private function onConfirmClick"
  ];
  for (const marker of markers) {
    const index = source.indexOf(marker);
    if (index !== -1) {
      return index;
    }
  }
  return -1;
}

function findSettingsPopupInsertIndex(source) {
  const markers = [
    "\n      override protected function onStageResize",
    "\n      private function setupDebugModeUnlock"
  ];
  for (const marker of markers) {
    const index = source.indexOf(marker);
    if (index !== -1) {
      return index;
    }
  }
  return -1;
}

function patchConfirmationDialogBox(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = next
    .replace('      public var confirmText:String = "OK";', '      public var confirmText:String = "确定";')
    .replace('      public var cancelText:String = "Cancel";', '      public var cancelText:String = "取消";')
    .replace("         this.dialogText = param2;", "         this.dialogText = this.zhNormalizeDialogText(param2);")
    .replace('            _loc2_ = TextUtils.refreshText(super.screen["tf"],"CreativeBlock BB");', '            _loc2_ = TextUtils.refreshText(super.screen["tf"]);')
    .replace("            if(DataUtils.validString(dialogText))\n            {\n               _loc2_.htmlText = dialogText;\n            }", "            this.zhApplyDialogTextFormat(_loc2_,22);\n            if(DataUtils.validString(dialogText))\n            {\n               _loc2_.htmlText = dialogText;\n               this.zhApplyDialogTextFormat(_loc2_,22);\n            }")
    .replace('            _loc4_ = new TextFormat("CreativeBlock BB",24,16777215);', '            _loc4_ = new TextFormat("_sans",22,16777215,true,null,null,null,null,"center");');
  next = next
    .replace("            DisplayPositionUtils.centerWithinArea(super.screen,super.shellApi.viewportWidth,super.shellApi.viewportHeight);", "            DisplayPositionUtils.centerWithinArea(super.screen,super.shellApi.viewportWidth,super.shellApi.viewportHeight);\n            this.zhPositionDialog();")
    .replace("            this.zhPositionDialog();\n            _loc4_ = new TextFormat", "            this.zhPositionDialog();\n            this.zhNormalizeButtonLabels();\n            _loc4_ = new TextFormat")
    .replace(/            this\.zhPositionDialog\(\);\n            this\.zhPositionDialog\(\);/gu, "            this.zhPositionDialog();")
    .replace(/               this\.zhEnsureButtonLabel\([^\n]+\);\n/gu, "");

  if (!next.includes("private function zhNormalizeDialogText")) {
    const markerIndex = findConfirmationDialogInsertIndex(next);
    if (markerIndex === -1) {
      throw new Error("Unable to locate ConfirmationDialogBox helper insertion marker.");
    }
    const methods = `
      
      private function zhNormalizeDialogText(param1:String) : String
      {
         var _loc2_:String = String(param1 || "");
         var _loc3_:String = _loc2_.toLowerCase();
         if(_loc3_.indexOf("poptropica realms") >= 0 || _loc3_.indexOf("leave this island") >= 0)
         {
            return "\\r确定要离开这个岛，前往创世空间吗？";
         }
         if(_loc3_.indexOf("go to the map") >= 0)
         {
            return "\\r确定要前往地图吗？";
         }
         if(_loc3_.indexOf("go to the store") >= 0)
         {
            return "\\r确定要进入商店吗？";
         }
         if(_loc3_.indexOf("go home") >= 0)
         {
            return "\\r确定要返回家园吗？";
         }
         if(_loc3_.indexOf("log out") >= 0)
         {
            return "\\r确定要退出登录吗？";
         }
         if(_loc3_.indexOf("graphics quality") >= 0)
         {
            return "确定要更改画质吗？当前场景会重新加载。";
         }
         return _loc2_;
      }
      
      private function zhApplyDialogTextFormat(param1:TextField, param2:Number = 22) : void
      {
         var _loc3_:TextFormat = null;
         if(param1 == null)
         {
            return;
         }
         param1.embedFonts = false;
         param1.multiline = true;
         param1.wordWrap = true;
         param1.selectable = false;
         _loc3_ = new TextFormat("_sans",param2,16777215,null,null,null,null,null,"center");
         param1.defaultTextFormat = _loc3_;
         param1.setTextFormat(_loc3_);
      }
      
      private function zhEnsureButtonLabel(param1:DisplayObjectContainer, param2:String) : void
      {
         var _loc3_:TextField = null;
         var _loc4_:TextFormat = null;
         if(param1 == null)
         {
            return;
         }
         _loc3_ = param1.getChildByName("zhButtonLabel") as TextField;
         if(_loc3_ == null)
         {
            _loc3_ = new TextField();
            _loc3_.name = "zhButtonLabel";
            _loc3_.mouseEnabled = false;
            _loc3_.selectable = false;
            _loc3_.embedFonts = false;
            _loc3_.width = param1.width;
            _loc3_.height = Math.max(28,param1.height);
            _loc3_.x = 0;
            _loc3_.y = Math.max(0,(param1.height - _loc3_.height) * 0.5 - 1);
            param1.addChild(_loc3_);
         }
         _loc4_ = new TextFormat("_sans",20,16777215,true,null,null,null,null,"center");
         _loc3_.defaultTextFormat = _loc4_;
         _loc3_.text = param2;
         _loc3_.setTextFormat(_loc4_);
      }
      
      private function zhPositionDialog() : void
      {
         if(super.screen == null || super.shellApi == null)
         {
            return;
         }
         super.screen.x = Math.max(12,(super.shellApi.viewportWidth - super.screen.width) * 0.5);
         super.screen.y = Math.max(90,(super.shellApi.viewportHeight - super.screen.height) * 0.42);
      }
`;
    next = `${next.slice(0, markerIndex)}${methods}${next.slice(markerIndex)}`;
  }
  if (!next.includes("private function zhNormalizeButtonLabels")) {
    const marker = "\n      private function zhNormalizeDialogText";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate ConfirmationDialogBox zhNormalizeDialogText marker.");
    }
    const methods = `
      
      private function zhNormalizeButtonLabels() : void
      {
         var _loc1_:String = String(this.confirmText || "").toLowerCase();
         var _loc2_:String = String(this.cancelText || "").toLowerCase();
         if(this.confirmText == null || this.confirmText == "" || _loc1_ == "ok")
         {
            this.confirmText = "确定";
         }
         else if(_loc1_ == "cancel")
         {
            this.confirmText = "取消";
         }
         if(this.cancelText == null || this.cancelText == "" || _loc2_ == "cancel")
         {
            this.cancelText = "取消";
         }
         if(_numVisibleBtns > 1 && (_loc2_ == "ok" || this.cancelText == this.confirmText))
         {
            this.cancelText = "取消";
         }
      }
`;
    next = `${next.slice(0, markerIndex)}${methods}${next.slice(markerIndex)}`;
  }
  if (!next.includes("private function zhEnsureButtonLabel")) {
    const markerIndex = findConfirmationDialogInsertIndex(next);
    if (markerIndex === -1) {
      throw new Error("Unable to locate ConfirmationDialogBox helper insertion marker for button label upgrade.");
    }
    const methods = `
      
      private function zhEnsureButtonLabel(param1:DisplayObjectContainer, param2:String) : void
      {
         var _loc3_:TextField = null;
         var _loc4_:TextFormat = null;
         if(param1 == null)
         {
            return;
         }
         _loc3_ = param1.getChildByName("zhButtonLabel") as TextField;
         if(_loc3_ == null)
         {
            _loc3_ = new TextField();
            _loc3_.name = "zhButtonLabel";
            _loc3_.mouseEnabled = false;
            _loc3_.selectable = false;
            _loc3_.embedFonts = false;
            _loc3_.width = param1.width;
            _loc3_.height = Math.max(28,param1.height);
            _loc3_.x = 0;
            _loc3_.y = Math.max(0,(param1.height - _loc3_.height) * 0.5 - 1);
            param1.addChild(_loc3_);
         }
         _loc4_ = new TextFormat("_sans",20,16777215,true,null,null,null,null,"center");
         _loc3_.defaultTextFormat = _loc4_;
         _loc3_.text = param2;
         _loc3_.setTextFormat(_loc4_);
      }
      
      private function zhPositionDialog() : void
      {
         if(super.screen == null || super.shellApi == null)
         {
            return;
         }
         super.screen.x = Math.max(12,(super.shellApi.viewportWidth - super.screen.width) * 0.5);
         super.screen.y = Math.max(90,(super.shellApi.viewportHeight - super.screen.height) * 0.42);
      }
`;
    next = `${next.slice(0, markerIndex)}${methods}${next.slice(markerIndex)}`;
  }
  return next;
}

function patchSettingsPopup(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import flash.display.DisplayObjectContainer;", "   import flash.display.DisplayObject;");
  next = addImport(next, "   import flash.display.MovieClip;", "   import flash.display.Sprite;");
  next = addImport(next, "   import flash.display.Sprite;", "   import flash.events.MouseEvent;");
  next = addImport(next, "   import flash.net.navigateToURL;", "   import flash.text.TextField;");
  next = next
    .replace('         TextUtils.refreshText(this.screen["settings"]).text = shellApi.getManager(LanguageManager).get("shared.settings.settings","Settings");', '         TextUtils.refreshText(this.screen["settings"]).text = shellApi.getManager(LanguageManager).get("shared.settings.settings","设置");')
    .replace('         TextUtils.refreshText(this.screen["loggedIn"]).text = shellApi.getManager(LanguageManager).get("shared.settings.loggedIn","Logged in as");', '         TextUtils.refreshText(this.screen["loggedIn"]).text = shellApi.getManager(LanguageManager).get("shared.settings.loggedIn","登录账号：");')
    .replace('         TextUtils.refreshText(this.screen["sounds"]).text = shellApi.getManager(LanguageManager).get("shared.settings.sounds","Sounds");', '         TextUtils.refreshText(this.screen["sounds"]).text = shellApi.getManager(LanguageManager).get("shared.settings.sounds","声音");')
    .replace('         TextUtils.refreshText(this.screen["music"]).text = shellApi.getManager(LanguageManager).get("shared.settings.music","Music");', '         TextUtils.refreshText(this.screen["music"]).text = shellApi.getManager(LanguageManager).get("shared.settings.music","音乐");')
    .replace('         TextUtils.refreshText(this.screen["effects"]).text = shellApi.getManager(LanguageManager).get("shared.settings.effects","Effects");', '         TextUtils.refreshText(this.screen["effects"]).text = shellApi.getManager(LanguageManager).get("shared.settings.effects","音效");')
    .replace('         TextUtils.refreshText(this.screen["dialog"]).text = shellApi.getManager(LanguageManager).get("shared.settings.dialog","Dialog Speed");', '         TextUtils.refreshText(this.screen["dialog"]).text = shellApi.getManager(LanguageManager).get("shared.settings.dialog","对话速度");')
    .replace('         TextUtils.refreshText(this.screen["slow"]).text = shellApi.getManager(LanguageManager).get("shared.settings.slow","Slow");', '         TextUtils.refreshText(this.screen["slow"]).text = shellApi.getManager(LanguageManager).get("shared.settings.slow","慢");')
    .replace('         TextUtils.refreshText(this.screen["medium"]).text = shellApi.getManager(LanguageManager).get("shared.settings.medium","Medium");', '         TextUtils.refreshText(this.screen["medium"]).text = shellApi.getManager(LanguageManager).get("shared.settings.medium","中");')
    .replace('         TextUtils.refreshText(this.screen["fast"]).text = shellApi.getManager(LanguageManager).get("shared.settings.fast","Fast");', '         TextUtils.refreshText(this.screen["fast"]).text = shellApi.getManager(LanguageManager).get("shared.settings.fast","快");')
    .replace('         TextUtils.refreshText(this.screen["quality"]).text = shellApi.getManager(LanguageManager).get("shared.settings.quality","Graphics Quality");', '         TextUtils.refreshText(this.screen["quality"]).text = shellApi.getManager(LanguageManager).get("shared.settings.quality","画质");')
    .replace('         TextUtils.refreshText(this.screen["lowq"]).text = shellApi.getManager(LanguageManager).get("shared.settings.lowq","Low");', '         TextUtils.refreshText(this.screen["lowq"]).text = shellApi.getManager(LanguageManager).get("shared.settings.lowq","低");')
    .replace('         TextUtils.refreshText(this.screen["mediumq"]).text = shellApi.getManager(LanguageManager).get("shared.settings.mediumq","Medium");', '         TextUtils.refreshText(this.screen["mediumq"]).text = shellApi.getManager(LanguageManager).get("shared.settings.mediumq","中");')
    .replace('         TextUtils.refreshText(this.screen["highq"]).text = shellApi.getManager(LanguageManager).get("shared.settings.highq","High");', '         TextUtils.refreshText(this.screen["highq"]).text = shellApi.getManager(LanguageManager).get("shared.settings.highq","高");')
    .replace('         var _loc1_:String = shellApi.getManager(LanguageManager).get("shared.settings.logOut","Log Out");', '         var _loc1_:String = shellApi.getManager(LanguageManager).get("shared.settings.logOut","退出登录");')
    .replace('         var _loc1_:String = shellApi.getManager(LanguageManager).get("shared.settings.help","Help & Support");', '         var _loc1_:String = shellApi.getManager(LanguageManager).get("shared.settings.help","帮助与支持");')
    .replace("         _loc3_ = \"Are you sure you\\'d like to change your graphics quality?  This will require the current scene to reload.\";", '         _loc3_ = "确定要更改画质吗？当前场景会重新加载。";')
    .replace('         this.screen["buildInfo"].text = AppConfig.appVersionString;', '         this.screen["buildInfo"].visible = false;');

  if (!next.includes("private function zhLocalizeAllTextFields")) {
    const callTarget = "         this.setupHelp();";
    if (!next.includes(callTarget)) {
      throw new Error("Unable to locate SettingsPopup setupHelp call.");
    }
    next = next.replace(callTarget, `${callTarget}\n         this.zhLocalizeAllTextFields(this.screen);`);

    const markerIndex = findSettingsPopupInsertIndex(next);
    if (markerIndex === -1) {
      throw new Error("Unable to locate SettingsPopup helper insertion marker.");
    }
    const methods = `
      
      private function zhCoverBuildInfoArea() : void
      {
         var _loc1_:Sprite = null;
         if(this.screen == null || this.screen.getChildByName("zhBuildInfoCover"))
         {
            return;
         }
         _loc1_ = new Sprite();
         _loc1_.name = "zhBuildInfoCover";
         _loc1_.mouseEnabled = false;
         _loc1_.mouseChildren = false;
         _loc1_.graphics.beginFill(0x26A8F2,1);
         _loc1_.graphics.drawRect(0,0,260,72);
         _loc1_.graphics.endFill();
         _loc1_.x = Math.max(0,this.screen.width - 285);
         _loc1_.y = Math.max(0,this.screen.height - 90);
         this.screen.addChild(_loc1_);
      }
      
      private function zhLocalizeAllTextFields(param1:DisplayObjectContainer) : void
      {
         var _loc3_:DisplayObject = null;
         var _loc4_:DisplayObjectContainer = null;
         if(param1 == null)
         {
            return;
         }
         var _loc2_:int = 0;
         while(_loc2_ < param1.numChildren)
         {
            _loc3_ = param1.getChildAt(_loc2_);
            if(_loc3_ is TextField)
            {
               this.zhLocalizeTextField(TextField(_loc3_));
            }
            _loc4_ = _loc3_ as DisplayObjectContainer;
            if(_loc4_)
            {
               this.zhLocalizeAllTextFields(_loc4_);
            }
            _loc2_++;
         }
      }
      
      private function zhLocalizeTextField(param1:TextField) : void
      {
         var _loc2_:TextFormat = null;
         var _loc3_:String = null;
         var _loc4_:String = null;
         if(param1 == null)
         {
            return;
         }
         param1.embedFonts = false;
         param1.selectable = false;
         _loc2_ = param1.defaultTextFormat || new TextFormat();
         _loc2_.font = "_sans";
         if(_loc2_.size == null || Number(_loc2_.size) <= 0)
         {
            _loc2_.size = 16;
         }
         param1.defaultTextFormat = _loc2_;
         _loc3_ = String(param1.text || "");
         _loc4_ = _loc3_.replace(/\\s+/g," ").toLowerCase();
         if(_loc4_ == "settings")
         {
            param1.text = "设置";
         }
         else if(_loc4_ == "logged in as")
         {
            param1.text = "登录账号：";
         }
         else if(_loc4_ == "sounds")
         {
            param1.text = "声音";
         }
         else if(_loc4_ == "music")
         {
            param1.text = "音乐";
         }
         else if(_loc4_ == "effects" || _loc4_ == "sound fx")
         {
            param1.text = "音效";
         }
         else if(_loc4_ == "dialog speed")
         {
            param1.text = "对话速度";
         }
         else if(_loc4_ == "slow")
         {
            param1.text = "慢";
         }
         else if(_loc4_ == "medium")
         {
            param1.text = "中";
         }
         else if(_loc4_ == "fast")
         {
            param1.text = "快";
         }
         else if(_loc4_ == "graphics quality")
         {
            param1.text = "画质";
         }
         else if(_loc4_ == "low")
         {
            param1.text = "低";
         }
         else if(_loc4_ == "high")
         {
            param1.text = "高";
         }
         else if(_loc4_.indexOf("build information") >= 0)
         {
            param1.visible = false;
         }
         else if(_loc4_.indexOf("hamburger") >= 0)
         {
            param1.text = "玩家";
         }
         param1.setTextFormat(_loc2_);
      }
`;
    next = `${next.slice(0, markerIndex)}${methods}${next.slice(markerIndex)}`;
  }
  if (!next.includes("private function zhCoverBuildInfoArea")) {
    const marker = "\n      private function zhLocalizeAllTextFields";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate SettingsPopup zhLocalizeAllTextFields marker.");
    }
    const method = `
      
      private function zhCoverBuildInfoArea() : void
      {
         var _loc1_:Sprite = null;
         if(this.screen == null || this.screen.getChildByName("zhBuildInfoCover"))
         {
            return;
         }
         _loc1_ = new Sprite();
         _loc1_.name = "zhBuildInfoCover";
         _loc1_.mouseEnabled = false;
         _loc1_.mouseChildren = false;
         _loc1_.graphics.beginFill(0x26A8F2,1);
         _loc1_.graphics.drawRect(0,0,260,72);
         _loc1_.graphics.endFill();
         _loc1_.x = Math.max(0,this.screen.width - 285);
         _loc1_.y = Math.max(0,this.screen.height - 90);
         this.screen.addChild(_loc1_);
      }
`;
    next = `${next.slice(0, markerIndex)}${method}${next.slice(markerIndex)}`;
  }
  next = next
    .replace("         this.zhLocalizeAllTextFields(this.screen);", "         this.zhLocalizeAllTextFields(this.screen);\n         this.zhCoverBuildInfoArea();")
    .replace(/         this\.zhCoverBuildInfoArea\(\);\n         this\.zhCoverBuildInfoArea\(\);/gu, "         this.zhCoverBuildInfoArea();")
    .replace('new TextFormat("CreativeBlock BB",17,16777215)', 'new TextFormat("_sans",17,16777215,true,null,null,null,null,"center")')
    .replace('new TextFormat("CreativeBlock BB",17,16777215)', 'new TextFormat("_sans",17,16777215,true,null,null,null,null,"center")')
    .replace('new TextFormat("CreativeBlock BB",17,16777215)', 'new TextFormat("_sans",17,16777215,true,null,null,null,null,"center")')
    .replace('param1.text = "版本信息";', 'param1.visible = false;')
    .replace('this.screen["buildInfo"].text = AppConfig.appVersionString;', 'this.screen["buildInfo"].visible = false;');
  return next;
}

function patchHud(content) {
  let next = String(content || "")
    .replace(/\r\n/gu, "\n")
    .replace('shellApi.getManager(LanguageManager).get("shared.hud.map","Are you sure you want to " + "go to the Map?")', 'shellApi.getManager(LanguageManager).get("shared.hud.map","确定要前往地图吗？")')
    .replace('shellApi.getManager(LanguageManager).get("shared.hud.store","Are you sure you want to " + "go to the Store?")', 'shellApi.getManager(LanguageManager).get("shared.hud.store","确定要进入商店吗？")')
    .replace('shellApi.getManager(LanguageManager).get("shared.hud.home","Are you sure you want to " + "go Home?")', 'shellApi.getManager(LanguageManager).get("shared.hud.home","确定要返回家园吗？")');
  next = addImport(next, "   import flash.display.MovieClip;", "   import flash.display.Sprite;");
  next = addImport(next, "   import flash.display.Sprite;", "   import flash.events.MouseEvent;");
  next = addImport(next, "   import flash.events.MouseEvent;", "   import flash.external.ExternalInterface;");
  next = addImport(next, "   import flash.geom.ColorTransform;", "   import flash.utils.getTimer;");
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
  const hudLabelMethodStart = next.indexOf("\n      private function zhLocalizeHudStaticLabels");
  if (hudLabelMethodStart !== -1) {
    const hudLabelMethodEnd = next.indexOf("\n      private function zhRelayoutHud", hudLabelMethodStart);
    if (hudLabelMethodEnd === -1) {
      throw new Error("Unable to locate end of Hud static label overlay method.");
    }
    next = `${next.slice(0, hudLabelMethodStart)}${next.slice(hudLabelMethodEnd)}`;
  }
  if (next.includes("zhMenuOverlay") || next.includes('text = "菜单"')) {
    throw new Error("Hud static MENU text overlay was not removed.");
  }
  next = next.replace(
    "                  targetX = newHudX - 80 * (layoutCount - layoutIndex);",
    "                  targetX = this.zhHudButtonTargetX(newHudX,layoutCount,layoutIndex);"
  );
  next = next
    .replace(
      "         this._topRow.add(new Tween());\n         this.setupBottomRow();",
      "         this._topRow.add(new Tween());\n         EntityUtils.position(this._topRow,this.zhVisibleLeft(),this.zhHudVisibleY());\n         this.setupBottomRow();"
    )
    .replace(
      "         this.setupBottomRow();\n         this._hudBtnEntity = ButtonCreator.createButtonEntity(_loc4_.hudBtn,this,this.onHudBtnClick,null,null,null,false);",
      "         this.setupBottomRow();\n         this.zhEnsureHudHitArea(_loc4_.hudBtn);\n         this._hudBtnEntity = ButtonCreator.createButtonEntity(_loc4_.hudBtn,this,this.onHudBtnClick,null,null,null,false);\n         this.zhWireHudMouseFallback(_loc4_.hudBtn);"
    )
    .replace(/         EntityUtils\.position\(this\._topRow,this\.zhVisibleLeft\(\),this\.zhHudVisibleY\(\)\);\n         EntityUtils\.position\(this\._topRow,this\.zhVisibleLeft\(\),this\.zhHudVisibleY\(\)\);/gu, "         EntityUtils.position(this._topRow,this.zhVisibleLeft(),this.zhHudVisibleY());")
    .replace(/         this\.zhEnsureHudHitArea\(_loc4_\.hudBtn\);\n         this\.zhEnsureHudHitArea\(_loc4_\.hudBtn\);/gu, "         this.zhEnsureHudHitArea(_loc4_.hudBtn);")
    .replace(/         this\.zhWireHudMouseFallback\(_loc4_\.hudBtn\);\n         this\.zhWireHudMouseFallback\(_loc4_\.hudBtn\);/gu, "         this.zhWireHudMouseFallback(_loc4_.hudBtn);")
    .replace(
      "         this.zhEnsureHudHitArea(_loc4_.hudBtn);\n         this._hudBtnEntity = ButtonCreator.createButtonEntity(_loc4_.hudBtn,this,this.onHudBtnClick,null,null,null,false);",
      "         this.zhEnsureHudHitArea(_loc4_.hudBtn);\n         this._hudBtnEntity = ButtonCreator.createButtonEntity(_loc4_.hudBtn,this,this.onHudBtnClick,null,null,null,false);\n         this.zhWireHudMouseFallback(_loc4_.hudBtn);"
    )
    .replace(/         this\.zhWireHudMouseFallback\(_loc4_\.hudBtn\);\n         this\.zhWireHudMouseFallback\(_loc4_\.hudBtn\);/gu, "         this.zhWireHudMouseFallback(_loc4_.hudBtn);")
    .replace(/"y":-\(_loc3_\.height \+ 5\)/gu, '"y":this.zhVisibleTop() - (_loc3_.height + 5)')
    .replace(/"y":0,\n                  "ease":Back\.easeOut/gu, '"y":this.zhHudVisibleY(),\n                  "ease":Back.easeOut');
  if (!next.includes("private function zhHudButtonTargetX")) {
    const marker = "\n      public function createDebugConsoleButton";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate Hud createDebugConsoleButton marker for adaptive layout.");
    }
    const method = `
      
      private function zhHudButtonTargetX(param1:Number, param2:int, param3:int) : Number
      {
         var _loc4_:Number = Math.max(18,Math.min(50,param1 - 18));
         var _loc5_:Number = Math.max(1,param2);
         var _loc6_:Number = (param1 - _loc4_) / _loc5_;
         if(!isFinite(_loc6_) || _loc6_ <= 0)
         {
            _loc6_ = 80;
         }
         _loc6_ = Math.min(80,_loc6_);
         if(_loc6_ < 24)
         {
            _loc6_ = 24;
         }
         return Math.max(18,param1 - _loc6_ * (_loc5_ - param3));
      }
`;
    next = `${next.slice(0, markerIndex)}${method}${next.slice(markerIndex)}`;
  }
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
  next = next
    .replace(
      "         var backgroundClip:MovieClip = null;\n         if(!this._hudBtnEntity)",
      "         var backgroundClip:MovieClip = null;\n         var visibleLeft:Number = Number(NaN);\n         var visibleTop:Number = Number(NaN);\n         var visibleWidth:Number = Number(NaN);\n         var visibleHeight:Number = Number(NaN);\n         var visibleRight:Number = Number(NaN);\n         var visibleBottom:Number = Number(NaN);\n         var topRowSpatial:Spatial = null;\n         if(!this._hudBtnEntity)"
    )
    .replace(
      "         hudSpatial = this._hudBtnEntity.get(Spatial);\n         newHudX = this.shellApi.viewportWidth - (80 / 2 + 10);",
      "         visibleLeft = this.zhVisibleLeft();\n         visibleTop = this.zhVisibleTop();\n         visibleWidth = this.zhVisibleWidth();\n         visibleHeight = this.zhVisibleHeight();\n         visibleRight = visibleLeft + visibleWidth;\n         visibleBottom = visibleTop + visibleHeight;\n         if(this._topRow)\n         {\n            topRowSpatial = this._topRow.get(Spatial);\n            if(topRowSpatial)\n            {\n               topRowSpatial.x = visibleLeft;\n               if(topRowSpatial.y >= visibleTop - 1)\n               {\n                  topRowSpatial.y = this.zhHudVisibleY();\n               }\n            }\n         }\n         hudSpatial = this._hudBtnEntity.get(Spatial);\n         newHudX = visibleRight - (80 / 2 + 10);"
    )
    .replace(/EntityUtils\.position\(this\._bottomRow,0,this\.shellApi\.viewportHeight\);/gu, "EntityUtils.position(this._bottomRow,this.zhVisibleLeft(),this.zhVisibleBottom());")
    .replace(/this\.shellApi\.viewportHeight \+ _loc3_\.height \+ 10/gu, "this.zhVisibleBottom() + _loc3_.height + 10")
    .replace(/"y":this\.shellApi\.viewportHeight/g, '"y":this.zhVisibleBottom()')
    .replace("               backgroundClip.graphics.drawRect(0,0,this.shellApi.viewportWidth,this.shellApi.viewportHeight);", "               backgroundClip.graphics.drawRect(visibleLeft,visibleTop,visibleWidth,visibleHeight);")
    .replace("         _loc4_.x = this.shellApi.viewportWidth - _loc3_.width / 2 - param2;", "         _loc4_.x = this.zhVisibleRight() - _loc3_.width / 2 - param2;");
  if (!next.includes("var topRowSpatial:Spatial = null;")) {
    next = next.replace(
      "         var visibleBottom:Number = Number(NaN);\n",
      "         var visibleBottom:Number = Number(NaN);\n         var topRowSpatial:Spatial = null;\n"
    );
  }
  if (!next.includes("topRowSpatial.x = visibleLeft;")) {
    next = next.replace(
      "         visibleBottom = visibleTop + visibleHeight;\n",
      "         visibleBottom = visibleTop + visibleHeight;\n         if(this._topRow)\n         {\n            topRowSpatial = this._topRow.get(Spatial);\n            if(topRowSpatial)\n            {\n               topRowSpatial.x = visibleLeft;\n               if(topRowSpatial.y >= visibleTop - 1)\n               {\n                  topRowSpatial.y = this.zhHudVisibleY();\n               }\n            }\n         }\n"
    );
  }
  if (!next.includes("private function zhVisibleLeft")) {
    const marker = "\n      private function zhHudButtonTargetX";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate Hud zhHudButtonTargetX marker for visible viewport helpers.");
    }
    const methods = `
      
      private function zhVisibleLeft() : Number
      {
         var _loc1_:* = null;
         var _loc2_:Number = Number(NaN);
         if(this.shellApi != null && this.shellApi.screenManager != null && this.shellApi.screenManager.container != null)
         {
            _loc1_ = this.shellApi.screenManager.container;
            _loc2_ = Number(_loc1_.scaleX);
            if(!isFinite(_loc2_) || _loc2_ == 0)
            {
               _loc2_ = 1;
            }
            return -Number(_loc1_.x) / _loc2_;
         }
         return 0;
      }
      
      private function zhVisibleTop() : Number
      {
         var _loc1_:* = null;
         var _loc2_:Number = Number(NaN);
         if(this.shellApi != null && this.shellApi.screenManager != null && this.shellApi.screenManager.container != null)
         {
            _loc1_ = this.shellApi.screenManager.container;
            _loc2_ = Number(_loc1_.scaleY);
            if(!isFinite(_loc2_) || _loc2_ == 0)
            {
               _loc2_ = 1;
            }
            return -Number(_loc1_.y) / _loc2_;
         }
         return 0;
      }
      
      private function zhVisibleWidth() : Number
      {
         var _loc1_:* = null;
         var _loc2_:Number = Number(NaN);
         if(this.shellApi != null && this.shellApi.screenManager != null && this.shellApi.screenManager.stage != null && this.shellApi.screenManager.container != null)
         {
            _loc1_ = this.shellApi.screenManager.container;
            _loc2_ = Number(_loc1_.scaleX);
            if(!isFinite(_loc2_) || _loc2_ == 0)
            {
               _loc2_ = 1;
            }
            return Math.max(this.shellApi.viewportWidth,Number(this.shellApi.screenManager.stage.stageWidth) / _loc2_);
         }
         return this.shellApi.viewportWidth;
      }
      
      private function zhVisibleHeight() : Number
      {
         var _loc1_:* = null;
         var _loc2_:Number = Number(NaN);
         if(this.shellApi != null && this.shellApi.screenManager != null && this.shellApi.screenManager.stage != null && this.shellApi.screenManager.container != null)
         {
            _loc1_ = this.shellApi.screenManager.container;
            _loc2_ = Number(_loc1_.scaleY);
            if(!isFinite(_loc2_) || _loc2_ == 0)
            {
               _loc2_ = 1;
            }
            return Math.max(this.shellApi.viewportHeight,Number(this.shellApi.screenManager.stage.stageHeight) / _loc2_);
         }
         return this.shellApi.viewportHeight;
      }
      
      private function zhVisibleRight() : Number
      {
         return this.zhVisibleLeft() + this.zhVisibleWidth();
      }
      
      private function zhVisibleBottom() : Number
      {
         return this.zhVisibleTop() + this.zhVisibleHeight();
      }
`;
    next = `${next.slice(0, markerIndex)}${methods}${next.slice(markerIndex)}`;
  }
  if (!next.includes("private function zhHudTopMargin")) {
    const marker = "\n      private function zhVisibleLeft";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate Hud visible viewport helper marker for top margin.");
    }
    const methods = `
      
      private function zhHudTopMargin() : Number
      {
         return 100;
      }
      
      private function zhHudVisibleY() : Number
      {
         return this.zhVisibleTop() + this.zhHudTopMargin();
      }
`;
    next = `${next.slice(0, markerIndex)}${methods}${next.slice(markerIndex)}`;
  }
  if (!next.includes("this.zhEnsureHudHitArea(_loc4_.hudBtn);") || !next.includes("private function zhEnsureHudHitArea") || !next.includes("this.zhWireHudMouseFallback(_loc4_.hudBtn);") || !next.includes("private function zhHudMouseFallback") || !next.includes("MouseEvent.MOUSE_DOWN")) {
    throw new Error("Unable to add AS3 Hud MENU hit area and mouse fallback.");
  }
  return next;
}

function patchHudPopBrowser(content) {
  return String(content || "")
    .replace(/\r\n/gu, "\n")
    .replace('      private static const GO_TO_REALMS:String = "\\rleave this island and\\rgo to Poptropica Realms?";', '      private static const GO_TO_REALMS:String = "\\r确定要离开这个岛，前往创世空间吗？";')
    .replace('      private static const GO_TO_REALMS_REGISTER:String = "To enter Poptropica Realms\\ryou must save your game.\\r";', '      private static const GO_TO_REALMS_REGISTER:String = "要进入创世空间，请先保存游戏。\\r";')
    .replace('LanguageManager(shellApi.getManager(LanguageManager)).get("shared.hud.realms","Are you sure you want to " + "\\rleave this island and\\rgo to Poptropica Realms?")', 'LanguageManager(shellApi.getManager(LanguageManager)).get("shared.hud.realms","\\r确定要离开这个岛，前往创世空间吗？")');
}

function patchGameData(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  if (!next.includes("public var flashpointAutoLoadIsland:String;")) {
    next = next.replace(
      "      public var overrideScene:String;\n",
      "      public var overrideScene:String;\n      public var flashpointAutoLoadIsland:String;\n"
    );
  }
  if (!next.includes("public var flashpointAutoLoadIsland:String;")) {
    throw new Error("Unable to patch GameData flashpointAutoLoadIsland field.");
  }
  return next;
}

function patchBrowserStepCreateGame(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = next.replace("         built();", "         super.built();");
  next = next.replace(
    "         var queryStringScene:String = ProxyUtils.getQueryStringData(this.shell.root.loaderInfo,\"overrideScene\") as String;\n",
    "         var queryStringScene:String = ProxyUtils.getQueryStringData(this.shell.root.loaderInfo,\"overrideScene\") as String;\n         var flashpointAutoLoadIsland:String = ProxyUtils.getQueryStringData(this.shell.root.loaderInfo,\"flashpointAutoLoadIsland\") as String;\n"
  );
  if (!next.includes("flashpointAutoLoadIsland && /^[A-Za-z0-9_]+$/.test(flashpointAutoLoadIsland)")) {
    next = next.replace(
      "         if(queryStringScene)\n         {\n            shellApi.sceneManager.gameData.overrideScene = queryStringScene;\n         }\n",
      "         if(queryStringScene)\n         {\n            shellApi.sceneManager.gameData.overrideScene = queryStringScene;\n         }\n         if(flashpointAutoLoadIsland && /^[A-Za-z0-9_]+$/.test(flashpointAutoLoadIsland))\n         {\n            shellApi.sceneManager.gameData.flashpointAutoLoadIsland = flashpointAutoLoadIsland;\n         }\n"
    );
  }
  if (!next.includes("flashpointAutoLoadIsland")) {
    throw new Error("Unable to patch BrowserStepCreateGame flashpointAutoLoadIsland handling.");
  }
  return next;
}

function patchMap(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const marker = "         if(this.autoLoadIsland)\n         {\n";
  if (!next.includes("gameData.flashpointAutoLoadIsland")) {
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Map setupAutoLoadIsland marker.");
    }
    next = next.replace(marker, "         if(!this.autoLoadIsland && super.shellApi != null && super.shellApi.sceneManager != null && super.shellApi.sceneManager.gameData != null)\n         {\n            this.autoLoadIsland = super.shellApi.sceneManager.gameData.flashpointAutoLoadIsland;\n         }\n         if(this.autoLoadIsland)\n         {\n");
  }
  return next;
}

function patchIslandPage(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import flash.display.DisplayObjectContainer;", "   import flash.display.DisplayObject;");
  next = addImport(next, "   import flash.geom.Point;", "   import flash.geom.Rectangle;");
  next = addImport(next, "   import flash.text.TextField;", "   import flash.text.StaticText;");
  next = addImport(next, "   import flash.text.TextField;", "   import flash.text.TextFormat;");
  next = next
    .replace("         title.text = String(this.pageXML.title);", "         title.text = this.zhIslandPageTitle(String(this.pageXML.island),String(this.pageXML.title));\n         this.zhApplyIslandText(title,28,true);")
    .replace("         description.text = String(this.pageXML.description);", "         description.text = this.zhIslandPageDescription(String(this.pageXML.island),String(this.pageXML.description));\n         this.zhApplyIslandText(description,20,false);")
    .replace('            textfield.text = "Coming Soon";', '            textfield.text = this.zhIslandPageButtonLabel("Coming Soon");')
    .replace('            textfield.text = "Play";', '            textfield.text = this.zhIslandPageButtonLabel("Play");\n            this.zhApplyIslandText(textfield,24,true);')
    .replace('                  textfield.text = "Play";', '                  textfield.text = this.zhIslandPageButtonLabel("Play");\n                  this.zhApplyIslandText(textfield,24,true);')
    .replace('                  textfield.text = "Buy";', '                  textfield.text = this.zhIslandPageButtonLabel("Buy");\n                  this.zhApplyIslandText(textfield,24,true);')
    .replace('                  textfield.text = "Download & Play";', '                  textfield.text = this.zhIslandPageButtonLabel("Download & Play");\n                  this.zhApplyIslandText(textfield,20,true);')
    .replace('                  textfield.text = "Play";', '                  textfield.text = this.zhIslandPageButtonLabel("Play");\n                  this.zhApplyIslandText(textfield,24,true);')
    .replace("            ButtonCreator.createButtonEntity(clip,this,restartClicked);", "            ButtonCreator.createButtonEntity(clip,this,restartClicked);\n            this.zhLocalizeIslandPageTextFields(clip);\n            this.zhForceIslandPageButtonLabel(clip,\"重新开始\",18);")
    .replace('         var popup:ConfirmationDialogBox = new ConfirmationDialogBox(2,"Are you sure you want to reset your progress and restart the island?",restartIsland);', '         var popup:ConfirmationDialogBox = new ConfirmationDialogBox(2,"确定要重置进度并重新开始这个岛吗？",restartIsland);');

  next = next.replace(
    /            ButtonCreator\.createButtonEntity\(clip,this,restartClicked\);(?:(?:\n            this\.zhLocalizeIslandPageTextFields\(clip\);)|(?:\n            this\.zhForceIslandPageButtonLabel\(clip,"重新开始",18\);))*/u,
    "            ButtonCreator.createButtonEntity(clip,this,restartClicked);\n            this.zhLocalizeIslandPageTextFields(clip);\n            this.zhForceIslandPageButtonLabel(clip,\"重新开始\",18);"
  );

  const forcedIslandButtonMethods = `
      
      private function zhForceIslandPageButtonLabel(param1:MovieClip, param2:String, param3:Number = 20) : void
      {
         var _loc4_:TextField = null;
         var _loc5_:TextFormat = null;
         var _loc6_:Rectangle = null;
         if(param1 == null)
         {
            return;
         }
         _loc6_ = this.zhFindIslandPageTextBounds(param1,param1);
         this.zhHideIslandPageTextObjects(param1);
         _loc4_ = param1.getChildByName("zhButtonLabel") as TextField;
         if(_loc4_ == null)
         {
            _loc4_ = new TextField();
            _loc4_.name = "zhButtonLabel";
            _loc4_.mouseEnabled = false;
            _loc4_.selectable = false;
            param1.addChild(_loc4_);
         }
         _loc4_.visible = true;
         _loc4_.embedFonts = false;
         _loc4_.multiline = false;
         _loc4_.wordWrap = false;
         _loc4_.text = param2;
         if(_loc6_ != null)
         {
            _loc4_.width = Math.max(116,_loc6_.width + 36);
            _loc4_.height = Math.max(30,_loc6_.height + 10);
            _loc4_.x = Math.round(_loc6_.x + (_loc6_.width - _loc4_.width) * 0.5);
            _loc4_.y = Math.round(_loc6_.y + (_loc6_.height - _loc4_.height) * 0.5 - 1);
         }
         else
         {
            _loc4_.width = 140;
            _loc4_.height = 30;
            _loc4_.x = 24;
            _loc4_.y = 10;
         }
         _loc5_ = new TextFormat("_sans",param3,16777215,true,null,null,null,null,"center");
         _loc4_.defaultTextFormat = _loc5_;
         _loc4_.setTextFormat(_loc5_);
         param1.setChildIndex(_loc4_,param1.numChildren - 1);
      }
      
      private function zhFindIslandPageTextBounds(param1:DisplayObjectContainer, param2:DisplayObjectContainer) : Rectangle
      {
         var _loc3_:int = 0;
         var _loc4_:DisplayObject = null;
         var _loc5_:DisplayObjectContainer = null;
         var _loc6_:Rectangle = null;
         if(param1 == null)
         {
            return null;
         }
         while(_loc3_ < param1.numChildren)
         {
            _loc4_ = param1.getChildAt(_loc3_);
            if(_loc4_.name != "zhButtonLabel" && (_loc4_ is TextField || _loc4_ is StaticText))
            {
               return _loc4_.getBounds(param2);
            }
            _loc5_ = _loc4_ as DisplayObjectContainer;
            if(_loc5_ != null && _loc4_.name != "zhButtonLabel")
            {
               _loc6_ = this.zhFindIslandPageTextBounds(_loc5_,param2);
               if(_loc6_ != null)
               {
                  return _loc6_;
               }
            }
            _loc3_++;
         }
         return null;
      }
      
      private function zhHideIslandPageTextObjects(param1:DisplayObjectContainer) : void
      {
         var _loc2_:int = 0;
         var _loc3_:DisplayObject = null;
         var _loc4_:DisplayObjectContainer = null;
         if(param1 == null)
         {
            return;
         }
         while(_loc2_ < param1.numChildren)
         {
            _loc3_ = param1.getChildAt(_loc2_);
            if(_loc3_.name != "zhButtonLabel" && (_loc3_ is TextField || _loc3_ is StaticText))
            {
               _loc3_.visible = false;
            }
            _loc4_ = _loc3_ as DisplayObjectContainer;
            if(_loc4_ != null && _loc3_.name != "zhButtonLabel")
            {
               this.zhHideIslandPageTextObjects(_loc4_);
            }
            _loc2_++;
         }
      }
`;

  next = next.replace(
    /\n      private function zhForceIslandPageButtonLabel[\s\S]*?\n      private function setupTitle/u,
    `${forcedIslandButtonMethods}\n      private function setupTitle`
  );

  if (!next.includes("private function zhIslandPageTitle")) {
    const marker = "\n      private function setupTitle";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate IslandPage setupTitle marker.");
    }
    const methods = `
      
      private function zhIslandPageTitle(param1:String, param2:String) : String
      {
         var _loc3_:String = String(param1 || "").toLowerCase();
         var _loc4_:String = String(param2 || "");
         if(_loc3_ == "con1")
         {
            return "第1章：排队从这里开始";
         }
         if(_loc3_ == "con2")
         {
            return "第2章：挑战开始";
         }
         if(_loc3_ == "con3")
         {
            return "第3章：终极对决";
         }
         return _loc4_;
      }
      
      private function zhIslandPageDescription(param1:String, param2:String) : String
      {
         var _loc3_:String = String(param1 || "").toLowerCase();
         var _loc4_:String = String(param2 || "");
         if(_loc3_ == "con1")
         {
            return "PoptropiCon 是镇上最热门的入场券。你得靠机智和几套伪装，才能混进这场派对！";
         }
         if(_loc3_ == "con2")
         {
            return "漫展越来越混乱。继续寻找线索、完成任务，拿到进入下一阶段的资格。";
         }
         if(_loc3_ == "con3")
         {
            return "终极粉丝大战打响。准备好面对最难缠的挑战，完成 PoptropiCon 的最后一章。";
         }
         return _loc4_;
      }
      
      private function zhIslandPageButtonLabel(param1:String) : String
      {
         var _loc2_:String = String(param1 || "").replace(/\\s+/g," ").toLowerCase();
         if(_loc2_ == "play")
         {
            return "开始";
         }
         if(_loc2_ == "restart")
         {
            return "重新开始";
         }
         if(_loc2_ == "coming soon")
         {
            return "即将开放";
         }
         if(_loc2_ == "buy")
         {
            return "购买";
         }
         if(_loc2_ == "download & play")
         {
            return "下载并开始";
         }
         return param1;
      }
      
      private function zhApplyIslandText(param1:TextField, param2:Number = 20, param3:Boolean = false) : void
      {
         var _loc4_:TextFormat = null;
         if(param1 == null)
         {
            return;
         }
         param1.embedFonts = false;
         param1.selectable = false;
         param1.multiline = !param3;
         param1.wordWrap = !param3;
         _loc4_ = param1.defaultTextFormat || new TextFormat();
         _loc4_.font = "_sans";
         _loc4_.size = param2;
         _loc4_.align = "center";
         param1.defaultTextFormat = _loc4_;
         param1.setTextFormat(_loc4_);
      }
      
      private function zhLocalizeIslandPageTextFields(param1:DisplayObjectContainer) : void
      {
         var _loc2_:int = 0;
         var _loc3_:DisplayObject = null;
         var _loc4_:TextField = null;
         var _loc5_:DisplayObjectContainer = null;
         if(param1 == null)
         {
            return;
         }
         while(_loc2_ < param1.numChildren)
         {
            _loc3_ = param1.getChildAt(_loc2_);
            _loc4_ = _loc3_ as TextField;
            if(_loc4_ != null)
            {
               _loc4_.text = this.zhIslandPageButtonLabel(_loc4_.text);
               this.zhApplyIslandText(_loc4_,20,true);
            }
            _loc5_ = _loc3_ as DisplayObjectContainer;
            if(_loc5_ != null)
            {
               this.zhLocalizeIslandPageTextFields(_loc5_);
            }
            _loc2_++;
         }
      }
`;
    next = `${next.slice(0, markerIndex)}${methods}${next.slice(markerIndex)}`;
  }
  if (!next.includes("private function zhForceIslandPageButtonLabel")) {
    const marker = "\n      private function setupTitle";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate IslandPage setupTitle marker for forced button label.");
    }
    next = `${next.slice(0, markerIndex)}${forcedIslandButtonMethods}${next.slice(markerIndex)}`;
  }
  return next;
}

function patchMapIslandLoader(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = next
    .replace(/\n         this\.zhApplyMapIslandName\(textField\);/gu, "")
    .replace(/\n\s+private function zhApplyMapIslandName\(param1:TextField\) : void\n\s+\{[\s\S]*?\n      private function progressesLoaded/gu, "\n      private function progressesLoaded");
  next = next
    .replace(
      "      private function islandXMLLoaded(xml:XML) : void\n      {\n         islandXML = xml;\n         this.setupIsland();\n      }",
      "      private function islandXMLLoaded(xml:XML) : void\n      {\n         islandXML = xml;\n         try\n         {\n            this.setupIsland();\n         }\n         catch(error:Error)\n         {\n            trace(\"MapIslandLoader skipped \" + _mapIsland + \": \" + error.message);\n            loaded.dispatch(this);\n         }\n      }"
    )
    .replace(/            islandName = (?:String\(islandXML\.island\)|islandXML\.island);\n            gameVersion = (?:String\(islandXML\.gameVersion\)|islandXML\.gameVersion);\n            numEpisodes = DataUtils\.getNumber\(islandXML\.numEpisodes\);/u, "            islandName = DataUtils.useString(String(islandXML.island),_mapIsland);\n            gameVersion = DataUtils.useString(String(islandXML.gameVersion),\"AS3\");\n            numEpisodes = int(DataUtils.useNumber(String(islandXML.numEpisodes),0));")
    .replace(
      "            if(DataUtils.getBoolean(islandXML.showProgress) && _showProgress)",
      "            if(DataUtils.useBoolean(String(islandXML.showProgress),false) && _showProgress)"
    )
    .replace(/         textField\.text = DataUtils\.(?:getString|useString)\((?:String\(islandXML\.name\)|islandXML\.name)(?:,_mapIsland)?\);/u, '         textField.text = DataUtils.useString(String(islandXML.child("name")[0]),_mapIsland);');
  next = next
    .replace('         textField.embedFonts = true;', '         textField.embedFonts = false;')
    .replace('         textField.defaultTextFormat = new TextFormat("CreativeBlock BB",15,0,null,null,null,null,null,"center");', '         textField.defaultTextFormat = new TextFormat("_sans",15,0,null,null,null,null,null,"center");');

  if (
    !next.includes('new TextFormat("_sans",15,0') ||
    !next.includes("textField.embedFonts = false;") ||
    !/islandName = DataUtils\.useString\((?:String\(islandXML\.island\)|islandXML\.island),_mapIsland\);/u.test(next) ||
    !/(?:String\()?islandXML\.child\("name"\)\[0\]/u.test(next) ||
    !next.includes("MapIslandLoader skipped ") ||
    next.includes("zhApplyMapIslandName")
  ) {
    throw new Error("MapIslandLoader restore patch did not apply cleanly.");
  }
  return next;
}

function patchInventory(content, islandTitleSwitch) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import flash.text.TextField;", "   import flash.text.TextFormat;");
  next = next
    .replace('         var _loc10_:TextFormat = new TextFormat("GhostKid AOE");', '         var _loc10_:TextFormat = zhInventoryTextFormat(26,16777215,"center");')
    .replace("         var _loc8_:TextField = TextUtils.convertText(_loc12_.islandTitle.tf,_loc10_,shellApi.islandName);\n         TextUtils.addShadow(_loc8_);", "         var _loc8_:TextField = TextUtils.convertText(_loc12_.islandTitle.tf,_loc10_,zhInventoryIslandTitle(shellApi.islandName));\n         zhApplyInventoryTitleField(_loc8_,_loc10_);\n         TextUtils.addShadow(_loc8_);")
    .replace('         _messageText = TextUtils.convertText(_loc12_.tfMessage,new TextFormat("CreativeBlock BB",32));', '         _messageText = TextUtils.convertText(_loc12_.tfMessage,zhInventoryTextFormat(30,16777215,"center"));\n         zhApplyInventoryTextField(_messageText,zhInventoryTextFormat(30,16777215,"center"));')
    .replace('         _messageText.htmlText = _loc7_ ? activePage.emptyMessage : "";', '         zhSetInventoryMessage(_loc7_ ? activePage.emptyMessage : "");')
    .replace(/         zhApplyInventoryTitleField\(_loc8_,_loc10_\);\n         zhApplyInventoryTitleField\(_loc8_,_loc10_\);/gu, "         zhApplyInventoryTitleField(_loc8_,_loc10_);")
    .replace(/         zhApplyInventoryTextField\(_messageText,zhInventoryTextFormat\(30,16777215,"center"\)\);\n         zhApplyInventoryTextField\(_messageText,zhInventoryTextFormat\(30,16777215,"center"\)\);/gu, '         zhApplyInventoryTextField(_messageText,zhInventoryTextFormat(30,16777215,"center"));');

  if (!next.includes("private function zhInventoryTextFormat")) {
    const marker = "\n      protected function createPages";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate Inventory createPages marker for CJK text helpers.");
    }
    const methods = `
      
      private function zhInventoryTextFormat(param1:Number = 30, param2:uint = 16777215, param3:String = "center") : TextFormat
      {
         return new TextFormat("_sans",param1,param2,null,null,null,null,null,param3);
      }
      
      private function zhApplyInventoryTextField(param1:TextField, param2:TextFormat = null) : TextField
      {
         if(!param1)
         {
            return null;
         }
         if(param2 == null)
         {
            param2 = zhInventoryTextFormat();
         }
         param1.embedFonts = false;
         param1.multiline = true;
         param1.wordWrap = true;
         param1.defaultTextFormat = param2;
         param1.setTextFormat(param2);
         return param1;
      }
      
      private function zhSetInventoryMessage(param1:String) : void
      {
         var _loc2_:TextFormat = zhInventoryTextFormat(30,16777215,"center");
         if(!_messageText)
         {
            return;
         }
         zhApplyInventoryTextField(_messageText,_loc2_);
         _messageText.htmlText = param1 || "";
         _messageText.setTextFormat(_loc2_);
      }
`;
    next = `${next.slice(0, markerIndex)}${methods}${next.slice(markerIndex)}`;
  }

  if (!next.includes("private function zhInventoryIslandTitle")) {
    const marker = "\n      private function zhInventoryTextFormat";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate Inventory zhInventoryTextFormat marker for title helper.");
    }
    const methods = `
      
      private function zhInventoryIslandTitle(param1:String) : String
      {
         var _loc2_:String = String(param1 || "");
         var _loc3_:String = _loc2_.replace(/\\s+/g," ").toLowerCase();
         var _loc4_:String = zhInventoryIslandTitleById(super.shellApi != null ? super.shellApi.island : "");
         if(_loc3_ == "" || _loc3_ == "island title" || _loc3_ == "null" || _loc3_ == "undefined")
         {
            return _loc4_ || "岛屿";
         }
         if(!/[\\u3400-\\u9FFF\\uF900-\\uFAFF]/.test(_loc2_) && _loc4_ != "")
         {
            return _loc4_;
         }
         return _loc2_;
      }
      
      private function zhInventoryIslandTitleById(param1:String) : String
      {
         var _loc2_:String = String(param1 || "").toLowerCase();
         switch(_loc2_)
         {
${islandTitleSwitch}
         }
         return "";
      }
      
      private function zhApplyInventoryTitleField(param1:TextField, param2:TextFormat = null) : TextField
      {
         var _loc3_:Number = Number(NaN);
         var _loc4_:TextFormat = null;
         if(!param1)
         {
            return null;
         }
         if(param2 == null)
         {
            param2 = zhInventoryTextFormat(26,16777215,"center");
         }
         param1.embedFonts = false;
         param1.selectable = false;
         param1.multiline = false;
         param1.wordWrap = false;
         _loc4_ = param2;
         _loc4_.font = "_sans";
         _loc4_.align = "center";
         _loc3_ = Number(_loc4_.size || 26);
         param1.defaultTextFormat = _loc4_;
         param1.setTextFormat(_loc4_);
         while(param1.textWidth + 8 > param1.width && _loc3_ > 16)
         {
            _loc3_ -= 1;
            _loc4_.size = _loc3_;
            param1.defaultTextFormat = _loc4_;
            param1.setTextFormat(_loc4_);
         }
         return param1;
      }
`;
    next = `${next.slice(0, markerIndex)}${methods}${next.slice(markerIndex)}`;
  } else {
    next = next.replace(/         switch\(_loc2_\)\n         \{\n[\s\S]*?\n         \}\n         return "";\n      }\n      \n      private function zhApplyInventoryTitleField/, `         switch(_loc2_)
         {
${islandTitleSwitch}
         }
         return "";
      }
      
      private function zhApplyInventoryTitleField`);
  }

  return next;
}

function patchButtonCreator(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = next
    .replace(
      'public static const FONT_DEFAULT:TextFormat = new TextFormat("CreativeBlock BB",20,14017023);',
      'public static const FONT_DEFAULT:TextFormat = new TextFormat("_sans",20,14017023,true,null,null,null,null,"center");'
    )
    .replace("         _loc7_.embedFonts = true;", "         _loc7_.embedFonts = false;")
    .replace("         _loc7_.text = param2;\n         param3 = param3 ? param3 : FONT_DEFAULT;\n         _loc7_.setTextFormat(param3);\n         _loc7_.autoSize = \"center\";", "         _loc7_.selectable = false;\n         _loc7_.multiline = false;\n         _loc7_.wordWrap = false;\n         _loc7_.text = param2;\n         param3 = ButtonCreator.zhNormalizeButtonFormat(param3 ? param3 : FONT_DEFAULT);\n         _loc7_.defaultTextFormat = param3;\n         _loc7_.setTextFormat(param3);\n         _loc7_.autoSize = \"center\";")
    .replace("         if(param4 == \"topLeft\")\n         {\n            _loc5_ = param1.width / param1.scaleX - _loc7_.width;\n            _loc6_ = param1.height / param1.scaleY - _loc7_.height;\n            _loc7_.x = _loc5_ * 0.5;\n            _loc7_.y = _loc6_ * 0.5;\n         }", "         if(param4 == \"topLeft\")\n         {\n            ButtonCreator.zhFitButtonLabel(_loc7_,param1);\n            _loc5_ = param1.width / param1.scaleX - _loc7_.width;\n            _loc6_ = param1.height / param1.scaleY - _loc7_.height;\n            _loc7_.x = _loc5_ * 0.5;\n            _loc7_.y = _loc6_ * 0.5;\n         }")
    .replace(/         ButtonCreator\.zhFitButtonLabel\(_loc7_,param1\);\n            ButtonCreator\.zhFitButtonLabel\(_loc7_,param1\);/gu, "         ButtonCreator.zhFitButtonLabel(_loc7_,param1);");

  if (!next.includes("private static function zhNormalizeButtonFormat")) {
    const marker = "\n      public static function addLabel";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate ButtonCreator addLabel marker.");
    }
    const methods = `
      
      private static function zhNormalizeButtonFormat(param1:TextFormat) : TextFormat
      {
         var _loc2_:TextFormat = param1 || new TextFormat();
         _loc2_.font = "_sans";
         _loc2_.align = "center";
         if(_loc2_.size == null || Number(_loc2_.size) <= 0)
         {
            _loc2_.size = 20;
         }
         return _loc2_;
      }
      
      private static function zhFitButtonLabel(param1:TextField, param2:DisplayObjectContainer) : void
      {
         var _loc3_:Number = Number(NaN);
         var _loc4_:Number = Number(NaN);
         var _loc5_:TextFormat = null;
         var _loc6_:Number = Number(NaN);
         if(param1 == null || param2 == null)
         {
            return;
         }
         _loc3_ = Math.max(12,param2.width / param2.scaleX - 6);
         _loc4_ = Math.max(12,param2.height / param2.scaleY - 4);
         _loc5_ = param1.defaultTextFormat || new TextFormat();
         _loc6_ = Number(_loc5_.size || 20);
         while((param1.width > _loc3_ || param1.height > _loc4_) && _loc6_ > 11)
         {
            _loc6_ -= 1;
            _loc5_.size = _loc6_;
            _loc5_.font = "_sans";
            _loc5_.align = "center";
            param1.defaultTextFormat = _loc5_;
            param1.setTextFormat(_loc5_);
         }
      }
`;
    next = `${next.slice(0, markerIndex)}${methods}${next.slice(markerIndex)}`;
  }
  return next;
}

function patchWordBalloonCreator(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import flash.text.TextField;", "   import flash.text.TextFormat;");
  next = next
    .replace("public static function getDialogTime(param1:String, param2:Number = NaN) : Number", "public static function getDialogTime(param1:String, param2:Number = 2) : Number")
    .replace("public function createEntity(param1:MovieClip, param2:Entity, param3:DialogData, param4:Point = null, param5:Entity = null, param6:DialogData = null, param7:Number = NaN, param8:Boolean = false, param9:Rectangle = null) : Entity", "public function createEntity(param1:MovieClip, param2:Entity, param3:DialogData, param4:Point = null, param5:Entity = null, param6:DialogData = null, param7:Number = 2, param8:Boolean = false, param9:Rectangle = null) : Entity")
    .replace(
      "         _loc23_ = TextUtils.refreshText(_loc23_);\n         _loc23_.mouseEnabled = false;\n         _loc23_.autoSize = \"center\";",
      "         _loc23_ = TextUtils.refreshText(_loc23_);\n         this.zhApplyBalloonTextFormat(_loc23_);\n         _loc23_.mouseEnabled = false;\n         _loc23_.autoSize = \"center\";"
    )
    .replace(
      "            _loc23_.htmlText = TextUtils.formatAsBlock(param3.dialog);",
      "            _loc23_.htmlText = TextUtils.formatAsBlock(param3.dialog);\n            this.zhApplyBalloonTextFormat(_loc23_);"
    )
    .replace(
      "            TextUtils.applyStyle(param3.textStyleData,_loc23_);",
      "            TextUtils.applyStyle(param3.textStyleData,_loc23_);\n            this.zhApplyBalloonTextFormat(_loc23_);"
    )
    .replace(/         this\.zhApplyBalloonTextFormat\(_loc23_\);\n         this\.zhApplyBalloonTextFormat\(_loc23_\);/gu, "         this.zhApplyBalloonTextFormat(_loc23_);")
    .replace(/            this\.zhApplyBalloonTextFormat\(_loc23_\);\n            this\.zhApplyBalloonTextFormat\(_loc23_\);/gu, "            this.zhApplyBalloonTextFormat(_loc23_);");

  if (!next.includes("private function zhApplyBalloonTextFormat")) {
    const marker = "\n      private function audioDone";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate WordBalloonCreator audioDone marker.");
    }
    const method = `
      
      private function zhApplyBalloonTextFormat(param1:TextField) : void
      {
         var _loc2_:TextFormat = null;
         if(param1 == null)
         {
            return;
         }
         param1.embedFonts = false;
         param1.multiline = true;
         param1.wordWrap = false;
         param1.selectable = false;
         _loc2_ = param1.defaultTextFormat || new TextFormat();
         _loc2_.font = "_sans";
         _loc2_.align = "center";
         if(_loc2_.size == null || Number(_loc2_.size) <= 0)
         {
            _loc2_.size = 18;
         }
         param1.defaultTextFormat = _loc2_;
         param1.setTextFormat(_loc2_);
      }
`;
    next = `${next.slice(0, markerIndex)}${method}${next.slice(markerIndex)}`;
  }
  return next;
}

function patchTextUtils(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = next
    .replace("_loc3_.embedFonts = true;", "_loc3_.embedFonts = false;")
    .replace("_loc4_.font = param2;", "_loc4_.font = param2;")
    .replace(/_loc7_\.embedFonts = true;/gu, "_loc7_.embedFonts = false;")
    .replace(/param2\.embedFonts = true;/gu, "param2.embedFonts = false;");

  const cjkGuard = `         if(param1 == null)
         {
            return "";
         }
         if(/[\\u3400-\\u9FFF\\uF900-\\uFAFF]/.test(param1))
         {
            return TextUtils.zhFormatCjkBlock(param1,int(Math.max(8,Math.floor(param2 * 0.55))));
         }`;
  if (!next.includes("zhFormatCjkBlock(param1")) {
    next = next.replace(
      "      public static function formatAsBlock(param1:String, param2:Number = 30) : String\n      {\n         var _loc3_:String = null;",
      `      public static function formatAsBlock(param1:String, param2:Number = 30) : String\n      {\n${cjkGuard}\n         var _loc3_:String = null;`
    );
  }

  if (!next.includes("private static function zhFormatCjkBlock")) {
    const marker = "\n      public static function applyStyle";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate TextUtils applyStyle marker.");
    }
    const method = `
      
      private static function zhFormatCjkBlock(param1:String, param2:int) : String
      {
         var _loc3_:String = "";
         var _loc4_:int = 0;
         var _loc5_:String = null;
         var _loc6_:int = int(Math.max(8,param2));
         var _loc7_:int = 0;
         if(param1 == null)
         {
            return "";
         }
         while(_loc7_ < param1.length)
         {
            _loc5_ = param1.charAt(_loc7_);
            if(_loc5_ == "\\r")
            {
               _loc7_++;
               continue;
            }
            if(_loc5_ == "\\n")
            {
               _loc3_ += "\\n";
               _loc4_ = 0;
               _loc7_++;
               continue;
            }
            _loc3_ += _loc5_;
            _loc4_++;
            if(_loc4_ >= _loc6_ && _loc7_ < param1.length - 1)
            {
               if("，。！？；：、,.!?;:)）】》」』".indexOf(param1.charAt(_loc7_ + 1)) >= 0)
               {
                  _loc7_++;
                  _loc3_ += param1.charAt(_loc7_);
               }
               _loc3_ += "\\n";
               _loc4_ = 0;
            }
            _loc7_++;
         }
         return _loc3_;
      }
`;
    next = `${next.slice(0, markerIndex)}${method}${next.slice(markerIndex)}`;
  }
  return next;
}

function patchTextDisplayCreator(content) {
  return String(content || "")
    .replace(/\r\n/gu, "\n")
    .replace(/new TextFormat\("CreativeBlock BB",14,14017023\)/gu, 'new TextFormat("_sans",14,14017023)')
    .replace(/_loc8_\.tf\.embedFonts = true;/gu, "_loc8_.tf.embedFonts = false;");
}

function patchSharedLanguageXml() {
  const sharedPath = path.join(
    paths.as3PackDir,
    "files",
    "content",
    "www.poptropica.com",
    "game",
    "data",
    "languages",
    "en",
    "shared",
    "language.xml"
  );
  if (!fileExists(sharedPath)) {
    return { changed: false, reason: "missing_shared_language_xml", sharedPath };
  }
  let text = fs.readFileSync(sharedPath, "utf8").replace(/\r\n/gu, "\n");
  const before = text;
  if (!/<quality>/u.test(text)) {
    text = text.replace("			<effects>音效</effects>\n", "			<effects>音效</effects>\n			<quality>画质</quality>\n");
  }
  if (!/<changeGraphicsQualityText>/u.test(text)) {
    text = text.replace("			<logOutText>确定要退出登录吗？</logOutText>\n", "			<logOutText>确定要退出登录吗？</logOutText>\n			<changeGraphicsQualityText>确定要更改画质吗？当前场景会重新加载。</changeGraphicsQualityText>\n");
  }
  if (!/<realms>/u.test(text)) {
    text = text.replace("			<store>进入商店？</store>\n", "			<store>进入商店？</store>\n			<realms>确定要离开这个岛，前往创世空间吗？</realms>\n");
  }
  if (text !== before) {
    writeText(sharedPath, text.replace(/\n/gu, "\r\n"));
  }
  return { changed: text !== before, sharedPath };
}

function patchScriptByClass(scriptRoot, className, islandTitleSwitch) {
  if (className === "game.ui.elements.ConfirmationDialogBox") {
    const scriptPath = findScript(scriptRoot, "game/ui/elements/ConfirmationDialogBox.as");
    writeText(scriptPath, patchConfirmationDialogBox(fs.readFileSync(scriptPath, "utf8")));
    return scriptPath;
  }
  if (className === "game.ui.settings.SettingsPopup") {
    const scriptPath = findScript(scriptRoot, "game/ui/settings/SettingsPopup.as");
    writeText(scriptPath, patchSettingsPopup(fs.readFileSync(scriptPath, "utf8")));
    return scriptPath;
  }
  if (className === "game.ui.hud.Hud") {
    const scriptPath = findScript(scriptRoot, "game/ui/hud/Hud.as");
    writeText(scriptPath, patchHud(fs.readFileSync(scriptPath, "utf8")));
    return scriptPath;
  }
  if (className === "game.ui.hud.HudPopBrowser") {
    const scriptPath = findScript(scriptRoot, "game/ui/hud/HudPopBrowser.as");
    writeText(scriptPath, patchHudPopBrowser(fs.readFileSync(scriptPath, "utf8")));
    return scriptPath;
  }
  if (className === "game.ui.inventory.Inventory") {
    const scriptPath = findScript(scriptRoot, "game/ui/inventory/Inventory.as");
    writeText(scriptPath, patchInventory(fs.readFileSync(scriptPath, "utf8"), islandTitleSwitch));
    return scriptPath;
  }
  if (className === "game.data.game.GameData") {
    const scriptPath = findScript(scriptRoot, "game/data/game/GameData.as");
    writeText(scriptPath, patchGameData(fs.readFileSync(scriptPath, "utf8")));
    return scriptPath;
  }
  if (className === "com.poptropica.shells.browser.steps.BrowserStepCreateGame") {
    const scriptPath = findScript(scriptRoot, "com/poptropica/shells/browser/steps/BrowserStepCreateGame.as");
    writeText(scriptPath, patchBrowserStepCreateGame(fs.readFileSync(scriptPath, "utf8")));
    return scriptPath;
  }
  if (className === "game.scenes.map.map.Map") {
    const scriptPath = findScript(scriptRoot, "game/scenes/map/map/Map.as");
    writeText(scriptPath, patchMap(fs.readFileSync(scriptPath, "utf8")));
    return scriptPath;
  }
  if (className === "game.scenes.map.map.groups.IslandPage") {
    const scriptPath = findScript(scriptRoot, "game/scenes/map/map/groups/IslandPage.as");
    writeText(scriptPath, patchIslandPage(fs.readFileSync(scriptPath, "utf8")));
    return scriptPath;
  }
  if (className === "game.scenes.map.map.MapIslandLoader") {
    const scriptPath = findScript(scriptRoot, "game/scenes/map/map/MapIslandLoader.as");
    writeText(scriptPath, patchMapIslandLoader(fs.readFileSync(scriptPath, "utf8")));
    return scriptPath;
  }
  if (className === "game.creators.ui.ButtonCreator") {
    const scriptPath = findScript(scriptRoot, "game/creators/ui/ButtonCreator.as");
    writeText(scriptPath, patchButtonCreator(fs.readFileSync(scriptPath, "utf8")));
    return scriptPath;
  }
  if (className === "game.creators.ui.WordBalloonCreator") {
    const scriptPath = findScript(scriptRoot, "game/creators/ui/WordBalloonCreator.as");
    writeText(scriptPath, patchWordBalloonCreator(fs.readFileSync(scriptPath, "utf8")));
    return scriptPath;
  }
  if (className === "game.util.TextUtils") {
    const scriptPath = findScript(scriptRoot, "game/util/TextUtils.as");
    writeText(scriptPath, patchTextUtils(fs.readFileSync(scriptPath, "utf8")));
    return scriptPath;
  }
  if (className === "game.creators.ui.TextDisplayCreator") {
    const scriptPath = findScript(scriptRoot, "game/creators/ui/TextDisplayCreator.as");
    writeText(scriptPath, patchTextDisplayCreator(fs.readFileSync(scriptPath, "utf8")));
    return scriptPath;
  }
  throw new Error(`Unsupported patch class: ${className}`);
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

  const workDir = path.join(paths.tempDir, "as3-shell-ui-text-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  const islandTitles = readAs3IslandTitles();
  const islandTitleSwitch = buildIslandTitleSwitch(islandTitles);

  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    PATCH_CLASSES.join(","),
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export AS3 shell UI text classes");

  const patchedScripts = [];
  for (const className of PATCH_CLASSES) {
    patchedScripts.push({ className, scriptPath: patchScriptByClass(scriptRoot, className, islandTitleSwitch) });
  }

  let inputSwf = path.join(workDir, "Shell-input.swf");
  fs.copyFileSync(packShell, inputSwf);
  for (const [index, patch] of patchedScripts.entries()) {
    const outputSwf = path.join(workDir, `Shell-${index + 1}.swf`);
    runFfdec(ffdecCli, [
      "-replace",
      inputSwf,
      outputSwf,
      patch.className,
      patch.scriptPath
    ], `replace ${patch.className}`);
    inputSwf = outputSwf;
  }
  fs.copyFileSync(inputSwf, packShell);

  const languageXmlPatch = patchSharedLanguageXml();
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
  manifest.assetsPatched = Number(manifest.assetsPatched || 0) + 1 + (languageXmlPatch.changed ? 1 : 0);
  manifest.swfPatchedAssets = Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [];
  manifest.swfPatchedAssets.push({
    assetId: "as3-shell:ui-text-cjk-dialog-settings",
    assetPath: AS3_SHELL_PATH,
    outputPath: packShell,
    classes: PATCH_CLASSES
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
    patchedScripts,
    islandTitleCount: islandTitles.length,
    languageXmlPatch,
    patch: "CJK-safe AS3 confirmation dialog/settings/HUD/inventory text, word balloons, and native TextField displays"
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-shell-ui-text-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
