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
  "game.ui.hud.HudPopBrowser"
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
    .replace("               ButtonCreator.addLabel(super.screen.okButton,confirmText,_loc4_);", "               ButtonCreator.addLabel(super.screen.okButton,confirmText,_loc4_);\n               this.zhEnsureButtonLabel(super.screen.okButton,confirmText);")
    .replace("               ButtonCreator.addLabel(super.screen.cancelButton,cancelText,_loc4_);", "               ButtonCreator.addLabel(super.screen.cancelButton,cancelText,_loc4_);\n               this.zhEnsureButtonLabel(super.screen.cancelButton,cancelText);")
    .replace(/            this\.zhPositionDialog\(\);\n            this\.zhPositionDialog\(\);/gu, "            this.zhPositionDialog();")
    .replace(/               this\.zhEnsureButtonLabel\(super\.screen\.okButton,confirmText\);\n               this\.zhEnsureButtonLabel\(super\.screen\.okButton,confirmText\);/gu, "               this.zhEnsureButtonLabel(super.screen.okButton,confirmText);")
    .replace(/               this\.zhEnsureButtonLabel\(super\.screen\.cancelButton,cancelText\);\n               this\.zhEnsureButtonLabel\(super\.screen\.cancelButton,cancelText\);/gu, "               this.zhEnsureButtonLabel(super.screen.cancelButton,cancelText);");

  if (!next.includes("private function zhNormalizeDialogText")) {
    const marker = "\n      override protected function onStageResize";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate ConfirmationDialogBox onStageResize marker.");
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
  if (!next.includes("private function zhEnsureButtonLabel")) {
    const marker = "\n      override protected function onStageResize";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate ConfirmationDialogBox onStageResize marker for button label upgrade.");
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

    const marker = "\n      override protected function onStageResize";
    const markerIndex = next.indexOf(marker);
    if (markerIndex === -1) {
      throw new Error("Unable to locate SettingsPopup onStageResize marker.");
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
  next = next.replace(
    "                  targetX = newHudX - 80 * (layoutCount - layoutIndex);",
    "                  targetX = this.zhHudButtonTargetX(newHudX,layoutCount,layoutIndex);"
  );
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
  return next;
}

function patchHudPopBrowser(content) {
  return String(content || "")
    .replace(/\r\n/gu, "\n")
    .replace('      private static const GO_TO_REALMS:String = "\\rleave this island and\\rgo to Poptropica Realms?";', '      private static const GO_TO_REALMS:String = "\\r确定要离开这个岛，前往创世空间吗？";')
    .replace('      private static const GO_TO_REALMS_REGISTER:String = "To enter Poptropica Realms\\ryou must save your game.\\r";', '      private static const GO_TO_REALMS_REGISTER:String = "要进入创世空间，请先保存游戏。\\r";')
    .replace('LanguageManager(shellApi.getManager(LanguageManager)).get("shared.hud.realms","Are you sure you want to " + "\\rleave this island and\\rgo to Poptropica Realms?")', 'LanguageManager(shellApi.getManager(LanguageManager)).get("shared.hud.realms","\\r确定要离开这个岛，前往创世空间吗？")');
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

function patchScriptByClass(scriptRoot, className) {
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
    patchedScripts.push({ className, scriptPath: patchScriptByClass(scriptRoot, className) });
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
    patchedScripts,
    languageXmlPatch,
    patch: "CJK-safe AS3 confirmation dialog/settings HUD text and missing shared UI keys"
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-shell-ui-text-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
