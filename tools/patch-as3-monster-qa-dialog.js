const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, readJson, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const PATCH_CLASS = "game.scenes.carnival.mainStreet.MainStreet";
const WORDBALLOON_CLASS = "game.creators.ui.WordBalloonCreator";
const POPTOPICON_CLASS = "game.scenes.con1.parking.Parking";
const POPTOPICON_SHARED_CLASS = "game.scenes.con1.shared.Poptropicon1Scene";
const POPTOPICON_CENTER_CLASS = "game.scenes.con1.center.Center";
const POPTOPICON_ADSTREET3_CLASS = "game.scenes.con1.adStreet3.AdStreet3";
const POPTOPICON_ADMIXED_CLASS = "game.scenes.con1.adMixed.AdMixed";
const TIMMY_CLASS = "game.scenes.timmy.mainStreet.MainStreet";
const MISSION_SHIP_CLASS = "game.scenes.deepDive1.ship.Ship";
const FTUE_MAINLAND_CLASS = "game.scenes.ftue.mainLand.MainLand";
const SURVIVAL4_MAINHALL_CLASS = "game.scenes.survival4.mainHall.MainHall";
const ARAB1_BAZAAR_CLASS = "game.scenes.arab1.bazaar.Bazaar";
const PRISON_HILL_CLASS = "game.scenes.prison.hill.Hill";
const GHD_NEON_WIENER_CLASS = "game.scenes.ghd.neonWiener.NeonWiener";
const PATCH_ASSET_ID = "as3-shell:monster-carnival-qa-native-dialog";

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

function replaceAs3Function(source, signature, replacement) {
  const start = source.indexOf(signature);
  if (start === -1) {
    return source;
  }
  const braceStart = source.indexOf("{", start);
  if (braceStart === -1) {
    throw new Error(`Unable to locate function body for: ${signature}`);
  }
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return `${source.slice(0, start)}${replacement}${source.slice(index + 1)}`;
      }
    }
  }
  throw new Error(`Unable to find closing brace for: ${signature}`);
}

function patchMainStreet(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = next.replace("         this.zhLayoutParkingEdgeZones();\n", "");
  next = addImport(next, "   import engine.components.Display;", "   import engine.util.Command;");
  next = addImport(next, "   import game.creators.ui.ButtonCreator;", "   import game.data.TimedEvent;");
  next = addImport(next, "   import game.data.TimedEvent;", "   import game.data.scene.characterDialog.DialogData;");
  next = addImport(next, "   import game.util.MotionUtils;", "   import game.util.ProxyUtils;");

  const afterLoadMethod = `      private function flashpointQaSayDialogAfterLoad() : void
      {
         var npcId:String = null;
         var dialogId:String = null;
         if(super.groupContainer == null || super.groupContainer.root == null || super.groupContainer.root.loaderInfo == null)
         {
            return;
         }
         npcId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogNpc") as String;
         dialogId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId") as String;
         if(npcId == null || npcId == "" || !/^(man|father|junior|edgar)$/.test(npcId))
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(2,1,Command.create(this.flashpointQaSayDialog,npcId,dialogId)));
      }
`;

  const sayDialogMethod = `      private function flashpointQaSayDialog(param1:String, param2:String = "") : void
      {
         var target:Entity = null;
         var dialog:Dialog = null;
         var dialogData:* = null;
         switch(param1)
         {
            case "man":
               target = _man != null ? _man : getEntityById("man");
               if(param2 == null || param2 == "")
               {
                  param2 = "qaMan";
               }
               break;
            case "father":
               target = _father != null ? _father : getEntityById("father");
               if(param2 == null || param2 == "")
               {
                  param2 = "qaFather";
               }
               break;
            case "junior":
               target = _junior != null ? _junior : getEntityById("junior");
               if(param2 == null || param2 == "")
               {
                  param2 = "qaJunior";
               }
               break;
            case "edgar":
               target = _edgar != null ? _edgar : getEntityById("edgar");
               if(param2 == null || param2 == "")
               {
                  param2 = "waitingCarnival";
               }
         }
         if(target != null)
         {
            dialog = target.get(Dialog) as Dialog;
            if(dialog != null)
            {
               dialog.allowOverwrite = true;
               dialogData = param2 != null && param2 != "" ? dialog.getDialog(param2) : null;
               if(dialogData != null)
               {
                  if(dialogData is DialogData)
                  {
                     DialogData(dialogData).timeOverride = 60;
                     DialogData(dialogData).forceOnScreen = true;
                  }
                  dialog.sayById(param2);
               }
               else
               {
                  CharUtils.sayDialog(target);
               }
            }
            else
            {
               CharUtils.sayDialog(target);
            }
         }
      }
`;

  if (!next.includes("this.flashpointQaSayDialogAfterLoad();")) {
    const marker = "         checkReplay();\n";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate MainStreet checkReplay call.");
    }
    next = next.replace(marker, `${marker}         this.flashpointQaSayDialogAfterLoad();\n`);
  }

  if (!next.includes("override public function resize(param1:Number, param2:Number) : void")) {
    const marker = "\n      override public function loaded() : void";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate MainStreet loaded marker.");
    }
    const resizeMethod = `
      override public function resize(param1:Number, param2:Number) : void
      {
         super.resize(param1,param2);
         this.flashpointQaSayDialogAfterLoad();
      }
`;
    next = next.replace(marker, `${resizeMethod}${marker}`);
  }

  if (!next.includes("private function flashpointQaSayDialogAfterLoad")) {
    const marker = "\n      private function handleEventTriggered";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate MainStreet handleEventTriggered marker.");
    }
    const methods = `\n      \n${afterLoadMethod}      \n${sayDialogMethod}`;
    next = next.replace(marker, `${methods}${marker}`);
  } else {
    next = replaceAs3Function(next, "      private function flashpointQaSayDialogAfterLoad() : void", afterLoadMethod);
    if (next.includes('      private function flashpointQaSayDialog(param1:String, param2:String = "") : void')) {
      next = replaceAs3Function(next, '      private function flashpointQaSayDialog(param1:String, param2:String = "") : void', sayDialogMethod);
    } else if (next.includes("      private function flashpointQaSayDialog(param1:String, param2:int = 1) : void")) {
      next = replaceAs3Function(next, "      private function flashpointQaSayDialog(param1:String, param2:int = 1) : void", sayDialogMethod);
    } else {
      next = replaceAs3Function(next, "      private function flashpointQaSayDialog(param1:String) : void", sayDialogMethod);
    }
  }

  if (!next.includes("flashpointQaDialogNpc") || !next.includes("flashpointQaDialogId") || !next.includes("dialog.sayById(param2)") || !next.includes("DialogData(dialogData).timeOverride = 60") || !next.includes("new TimedEvent(2,1,Command.create(this.flashpointQaSayDialog,npcId,dialogId))") || !next.includes("override public function resize(param1:Number, param2:Number) : void")) {
    throw new Error("MainStreet QA dialog patch did not apply cleanly.");
  }
  return next;
}

function patchWordBalloonCreator(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  if (!next.includes("param3.timeOverride")) {
    const marker = "               _loc12_.lifespan = 1 + param7 * 0.05 * param3.dialog.length;\n";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate WordBalloonCreator dialog lifespan assignment.");
    }
    next = next.replace(marker, [
      "               _loc10_ = param3.timeOverride;\n",
      "               if(isNaN(_loc10_))\n",
      "               {\n",
      "                  _loc10_ = 1 + param7 * 0.05 * param3.dialog.length;\n",
      "               }\n",
      "               _loc12_.lifespan = _loc10_;\n"
    ].join(""));
  }
  if (!next.includes("param3.timeOverride") || !next.includes("_loc12_.lifespan = _loc10_;")) {
    throw new Error("WordBalloonCreator timeOverride patch did not apply cleanly.");
  }
  return next;
}

function patchPoptropiconParking(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import engine.creators.InteractionCreator;", "   import engine.util.Command;");
  next = addImport(next, "   import flash.display.Sprite;", "   import flash.events.MouseEvent;");
  next = addImport(next, "   import game.data.TimedEvent;", "   import game.scenes.con1.center.Center;");
  next = addImport(next, "   import game.data.TimedEvent;", "   import game.scenes.con1.bathrooms.Bathrooms;");
  next = addImport(next, "   import game.scenes.con1.shared.Poptropicon1Scene;", "   import game.managers.ScreenManager;");
  next = addImport(next, "   import game.util.PlatformUtils;", "   import game.util.ProxyUtils;");

  if (!next.includes("private var _zhParkingCoreDoorLoading:Boolean")) {
    next = next.replace(
      "      private var _randomGlint:TimedEvent;\n",
      "      private var _randomGlint:TimedEvent;\n      \n      private var _zhParkingCoreDoorLoading:Boolean = false;\n"
    );
  }
  if (!next.includes("private var _zhParkingLeftZone:Sprite")) {
    next = next.replace(
      "      private var _zhParkingCoreDoorLoading:Boolean = false;\n",
      "      private var _zhParkingCoreDoorLoading:Boolean = false;\n      \n      private var _zhParkingStageListening:Boolean = false;\n      \n      private var _zhParkingLeftZone:Sprite;\n      \n      private var _zhParkingRightZone:Sprite;\n"
    );
  }
  if (!next.includes("private var _zhParkingStageListening:Boolean")) {
    next = next.replace(
      "      private var _zhParkingCoreDoorLoading:Boolean = false;\n",
      "      private var _zhParkingCoreDoorLoading:Boolean = false;\n      \n      private var _zhParkingStageListening:Boolean = false;\n"
    );
  }
  if (!next.includes("private var _zhParkingLastX:Number")) {
    next = next.replace(
      "      private var _zhParkingStageListening:Boolean = false;\n",
      "      private var _zhParkingStageListening:Boolean = false;\n      \n      private var _zhParkingLastX:Number = NaN;\n"
    );
  }
  if (!next.includes("private var _zhParkingDebugTick:int")) {
    next = next.replace(
      "      private var _zhParkingLastX:Number = NaN;\n",
      "      private var _zhParkingLastX:Number = NaN;\n      \n      private var _zhParkingDebugTick:int = 0;\n"
    );
  }
  if (!next.includes("this.zhDestroyParkingEdgeZones();")) {
    next = next.replace(
      "      override public function destroy() : void\n      {\n",
      "      override public function destroy() : void\n      {\n         this.zhDestroyParkingEdgeZones();\n"
    );
  }

  const afterLoadMethod = `      private function flashpointQaSayDialogAfterLoad() : void
      {
         var npcId:String = null;
         if(super.groupContainer == null || super.groupContainer.root == null || super.groupContainer.root.loaderInfo == null)
         {
            return;
         }
         npcId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogNpc") as String;
         if(npcId != "alien_teacher")
         {
            return;
         }
         this.flashpointQaSayDialog(npcId);
         SceneUtil.addTimedEvent(this,new TimedEvent(1,45,Command.create(this.flashpointQaSayDialog,npcId)));
      }
`;

  const sayDialogMethod = `      private function flashpointQaSayDialog(param1:String) : void
      {
         var target:Entity = null;
         var dialog:Dialog = null;
         target = getEntityById(param1);
         if(target != null)
         {
            dialog = target.get(Dialog) as Dialog;
            if(dialog != null)
            {
               dialog.allowOverwrite = true;
               if(dialog.getDialog("link_question") != null)
               {
                  dialog.sayById("link_question");
               }
               else
               {
                  dialog.sayCurrent();
               }
            }
         }
      }
`;

  const autoSceneAfterLoadMethod = `      private function flashpointQaAutoSceneAfterLoad() : void
      {
         var delayMs:Number = NaN;
         var delaySeconds:Number = 2;
         var targetScene:String = null;
         if(super.groupContainer == null || super.groupContainer.root == null || super.groupContainer.root.loaderInfo == null)
         {
            return;
         }
         targetScene = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaAutoScene") as String;
         if(targetScene != "center")
         {
            return;
         }
         delayMs = Number(ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaAutoSceneDelayMs"));
         if(!isNaN(delayMs) && delayMs > 0)
         {
            if(delayMs > 15000)
            {
               delayMs = 15000;
            }
            delaySeconds = Math.max(0.5,delayMs / 1000);
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(delaySeconds,1,Command.create(this.flashpointQaLoadScene,targetScene)));
      }
`;

  const autoSceneLoadMethod = `      private function flashpointQaLoadScene(param1:String) : void
      {
         if(param1 == "center")
         {
            this.shellApi.loadScene(Center,500,1790,"right");
         }
      }
`;

  const parkingDoorMethods = `      private function zhArmParkingCoreDoors() : void
      {
         var leftDoor:Entity = getEntityById("door1");
         var rightDoor:Entity = getEntityById("door2");
         var interaction:SceneInteraction = null;
         var doorDisplay:Display = null;
         if(leftDoor != null)
         {
            interaction = leftDoor.get(SceneInteraction) as SceneInteraction;
            if(interaction != null)
            {
               interaction.reached.addOnce(this.zhParkingLeftDoorReached);
            }
            doorDisplay = leftDoor.get(Display) as Display;
            if(doorDisplay != null && doorDisplay.displayObject != null)
            {
               doorDisplay.displayObject.addEventListener(MouseEvent.CLICK,this.zhParkingLeftMouseClicked,false,0,true);
               doorDisplay.displayObject.addEventListener(MouseEvent.MOUSE_DOWN,this.zhParkingLeftMouseClicked,false,0,true);
            }
         }
         if(rightDoor != null)
         {
            interaction = rightDoor.get(SceneInteraction) as SceneInteraction;
            if(interaction != null)
            {
               interaction.reached.addOnce(this.zhParkingRightDoorReached);
            }
            doorDisplay = rightDoor.get(Display) as Display;
            if(doorDisplay != null && doorDisplay.displayObject != null)
            {
               doorDisplay.displayObject.addEventListener(MouseEvent.CLICK,this.zhParkingRightMouseClicked,false,0,true);
               doorDisplay.displayObject.addEventListener(MouseEvent.MOUSE_DOWN,this.zhParkingRightMouseClicked,false,0,true);
            }
         }
         this.zhCreateParkingEdgeZones();
         this.zhArmParkingStageListener();
         SceneUtil.addTimedEvent(this,new TimedEvent(0.5,5,this.zhArmParkingStageListener,true));
         SceneUtil.addTimedEvent(this,new TimedEvent(0.25,0,this.zhCheckParkingCoreDoors,true));
      }

      
      private function zhCreateParkingEdgeZones() : void
      {
         var screenOverlay:DisplayObjectContainer = null;
         if(shellApi == null || shellApi.getManager(ScreenManager) == null)
         {
            return;
         }
         screenOverlay = ScreenManager(shellApi.getManager(ScreenManager)).overlayContainer;
         if(_zhParkingLeftZone == null)
         {
            _zhParkingLeftZone = new Sprite();
            _zhParkingLeftZone.graphics.beginFill(0,0.01);
            _zhParkingLeftZone.graphics.drawRect(0,0,190,170);
            _zhParkingLeftZone.graphics.endFill();
            _zhParkingLeftZone.mouseEnabled = true;
            _zhParkingLeftZone.mouseChildren = false;
            _zhParkingLeftZone.buttonMode = true;
            _zhParkingLeftZone.addEventListener(MouseEvent.CLICK,this.zhParkingLeftMouseClicked,false,0,true);
            _zhParkingLeftZone.addEventListener(MouseEvent.MOUSE_DOWN,this.zhParkingLeftMouseClicked,false,0,true);
            screenOverlay.addChild(_zhParkingLeftZone);
         }
         if(_zhParkingRightZone == null)
         {
            _zhParkingRightZone = new Sprite();
            _zhParkingRightZone.graphics.beginFill(0,0.01);
            _zhParkingRightZone.graphics.drawRect(0,0,190,260);
            _zhParkingRightZone.graphics.endFill();
            _zhParkingRightZone.mouseEnabled = true;
            _zhParkingRightZone.mouseChildren = false;
            _zhParkingRightZone.buttonMode = true;
            _zhParkingRightZone.addEventListener(MouseEvent.CLICK,this.zhParkingRightMouseClicked,false,0,true);
            _zhParkingRightZone.addEventListener(MouseEvent.MOUSE_DOWN,this.zhParkingRightMouseClicked,false,0,true);
            screenOverlay.addChild(_zhParkingRightZone);
         }
         this.zhLayoutParkingEdgeZones();
      }

      
      private function zhDestroyParkingEdgeZones() : void
      {
         if(_zhParkingStageListening && super.groupContainer != null && super.groupContainer.stage != null)
         {
            super.groupContainer.stage.removeEventListener(MouseEvent.CLICK,this.zhParkingStageClicked,true);
            super.groupContainer.stage.removeEventListener(MouseEvent.MOUSE_DOWN,this.zhParkingStageClicked,true);
            super.groupContainer.stage.removeEventListener(MouseEvent.CLICK,this.zhParkingStageClicked,false);
            super.groupContainer.stage.removeEventListener(MouseEvent.MOUSE_DOWN,this.zhParkingStageClicked,false);
         }
         _zhParkingStageListening = false;
         if(_zhParkingLeftZone != null)
         {
            _zhParkingLeftZone.removeEventListener(MouseEvent.CLICK,this.zhParkingLeftMouseClicked);
            _zhParkingLeftZone.removeEventListener(MouseEvent.MOUSE_DOWN,this.zhParkingLeftMouseClicked);
            if(_zhParkingLeftZone.parent != null)
            {
               _zhParkingLeftZone.parent.removeChild(_zhParkingLeftZone);
            }
            _zhParkingLeftZone = null;
         }
         if(_zhParkingRightZone != null)
         {
            _zhParkingRightZone.removeEventListener(MouseEvent.CLICK,this.zhParkingRightMouseClicked);
            _zhParkingRightZone.removeEventListener(MouseEvent.MOUSE_DOWN,this.zhParkingRightMouseClicked);
            if(_zhParkingRightZone.parent != null)
            {
               _zhParkingRightZone.parent.removeChild(_zhParkingRightZone);
            }
            _zhParkingRightZone = null;
         }
      }

      
      private function zhArmParkingStageListener() : void
      {
         if(_zhParkingStageListening || super.groupContainer == null || super.groupContainer.stage == null)
         {
            return;
         }
         super.groupContainer.stage.addEventListener(MouseEvent.CLICK,this.zhParkingStageClicked,true,999,true);
         super.groupContainer.stage.addEventListener(MouseEvent.MOUSE_DOWN,this.zhParkingStageClicked,true,999,true);
         super.groupContainer.stage.addEventListener(MouseEvent.CLICK,this.zhParkingStageClicked,false,999,true);
         super.groupContainer.stage.addEventListener(MouseEvent.MOUSE_DOWN,this.zhParkingStageClicked,false,999,true);
         _zhParkingStageListening = true;
      }

      
      private function zhLayoutParkingEdgeZones() : void
      {
         if(_zhParkingLeftZone != null)
         {
            _zhParkingLeftZone.x = 0;
            _zhParkingLeftZone.y = 0;
         }
         if(_zhParkingRightZone != null && shellApi != null)
         {
            _zhParkingRightZone.x = Math.max(0,shellApi.viewportWidth - 190);
            _zhParkingRightZone.y = Math.max(190,shellApi.viewportHeight - 300);
         }
      }

      
      private function zhCheckParkingCoreDoors() : void
      {
         var lastX:Number = NaN;
         var hasLast:Boolean = false;
         var playerSpatial:Spatial = null;
         if(_zhParkingCoreDoorLoading || player == null)
         {
            return;
         }
         playerSpatial = player.get(Spatial) as Spatial;
         if(playerSpatial == null)
         {
            return;
         }
         lastX = _zhParkingLastX;
         _zhParkingLastX = playerSpatial.x;
         _zhParkingDebugTick++;
         if(shellApi != null && _zhParkingDebugTick % 20 == 0)
         {
            shellApi.track("QA","Con1ParkingX",String(Math.round(playerSpatial.x)) + "," + String(Math.round(playerSpatial.y)),String(super.groupPrefix));
         }
         hasLast = !isNaN(lastX);
         if(hasLast)
         {
            if(playerSpatial.x <= 1720 && playerSpatial.x < lastX)
            {
               this.zhParkingLeftDoorReached(player,null);
               return;
            }
            if(playerSpatial.x >= 2500 && playerSpatial.x > lastX)
            {
               this.zhParkingRightDoorReached(player,null);
               return;
            }
         }
      }

      
      private function zhParkingStageClicked(param1:MouseEvent) : void
      {
         if(_zhParkingCoreDoorLoading || shellApi == null)
         {
            return;
         }
         if(param1.stageX <= 190 && param1.stageY <= 170)
         {
            param1.stopImmediatePropagation();
            this.zhParkingLeftDoorReached(player,null);
         }
         else if(param1.stageX >= Math.max(0,shellApi.viewportWidth - 190) && param1.stageY >= Math.max(190,shellApi.viewportHeight - 300))
         {
            param1.stopImmediatePropagation();
            this.zhParkingRightDoorReached(player,null);
         }
      }

      
      private function zhParkingLeftMouseClicked(param1:MouseEvent) : void
      {
         this.zhParkingLeftDoorReached(player,null);
      }

      
      private function zhParkingRightMouseClicked(param1:MouseEvent) : void
      {
         this.zhParkingRightDoorReached(player,null);
      }

      
      private function zhParkingLeftDoorReached(param1:Entity, param2:Entity) : void
      {
         if(_zhParkingCoreDoorLoading)
         {
            return;
         }
         _zhParkingCoreDoorLoading = true;
         this.shellApi.loadScene(Bathrooms,2000,1050,"left");
      }

      
      private function zhParkingRightDoorReached(param1:Entity, param2:Entity) : void
      {
         if(_zhParkingCoreDoorLoading)
         {
            return;
         }
         _zhParkingCoreDoorLoading = true;
         this.shellApi.loadScene(Center,800,1790,"right");
      }
`;

  if (!next.includes("override public function resize(param1:Number, param2:Number) : void")) {
    const marker = "\n      override public function loaded() : void";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Parking loaded marker.");
    }
    const resizeMethod = `

      override public function resize(param1:Number, param2:Number) : void
      {
         super.resize(param1,param2);
         this.zhLayoutParkingEdgeZones();
         this.flashpointQaSayDialogAfterLoad();
         this.flashpointQaAutoSceneAfterLoad();
      }
`;
    next = next.replace(marker, `${resizeMethod}${marker}`);
  } else if (!next.includes("         super.resize(param1,param2);\n         this.zhLayoutParkingEdgeZones();")) {
    next = next.replace(
      "         super.resize(param1,param2);\n",
      "         super.resize(param1,param2);\n         this.zhLayoutParkingEdgeZones();\n"
    );
  }

  const loadedCallMarker = "         randomGroup.setup(_hitContainer,this,creator);\n";
  const sayDialogCall = "         this.flashpointQaSayDialogAfterLoad();\n";
  const autoSceneCall = "         this.flashpointQaAutoSceneAfterLoad();\n";
  if (!next.includes("this.zhArmParkingCoreDoors();")) {
    const marker = "         super.loaded();\n";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Parking super.loaded marker for core door patch.");
    }
    next = next.replace(marker, `${marker}         this.zhArmParkingCoreDoors();\n`);
  }
  const loadedSayDialogBlock = `${loadedCallMarker}${sayDialogCall}`;
  const loadedAutoSceneBlock = `${loadedCallMarker}${sayDialogCall}${autoSceneCall}`;
  if (!next.includes(loadedSayDialogBlock) && !next.includes(loadedAutoSceneBlock)) {
    if (!next.includes(loadedCallMarker)) {
      throw new Error("Unable to locate Parking random NPC setup marker for QA dialog call.");
    }
    next = next.replace(loadedCallMarker, `${loadedCallMarker}${sayDialogCall}`);
  }
  if (!next.includes(loadedAutoSceneBlock)) {
    if (next.includes(loadedSayDialogBlock)) {
      next = next.replace(loadedSayDialogBlock, loadedAutoSceneBlock);
    } else if (next.includes(loadedCallMarker)) {
      next = next.replace(loadedCallMarker, loadedAutoSceneBlock);
    } else {
      throw new Error("Unable to locate Parking loaded marker for QA auto scene call.");
    }
  }

  if (!next.includes("private function flashpointQaSayDialogAfterLoad")) {
    const marker = "\n      override public function handleEventTrigger";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Parking handleEventTrigger marker.");
    }
    const methods = `\n      \n${afterLoadMethod}      \n${sayDialogMethod}      \n${autoSceneAfterLoadMethod}      \n${autoSceneLoadMethod}`;
    next = next.replace(marker, `${methods}${marker}`);
  } else {
    next = replaceAs3Function(next, "      private function flashpointQaSayDialogAfterLoad() : void", afterLoadMethod);
    next = replaceAs3Function(next, "      private function flashpointQaSayDialog(param1:String) : void", sayDialogMethod);
    if (!next.includes("private function flashpointQaAutoSceneAfterLoad")) {
      const marker = "\n      override public function handleEventTrigger";
      if (!next.includes(marker)) {
        throw new Error("Unable to locate Parking handleEventTrigger marker for QA auto scene methods.");
      }
      next = next.replace(marker, `\n      \n${autoSceneAfterLoadMethod}      \n${autoSceneLoadMethod}${marker}`);
    } else {
      next = replaceAs3Function(next, "      private function flashpointQaAutoSceneAfterLoad() : void", autoSceneAfterLoadMethod);
      next = replaceAs3Function(next, "      private function flashpointQaLoadScene(param1:String) : void", autoSceneLoadMethod);
    }
  }
  const parkingMethodMarker = "\n      override public function handleEventTrigger";
  const existingParkingMethodsStart = next.indexOf("\n      private function zhArmParkingCoreDoors");
  const parkingMethodRegionEnd = next.indexOf(parkingMethodMarker);
  if (existingParkingMethodsStart !== -1 && parkingMethodRegionEnd !== -1 && existingParkingMethodsStart < parkingMethodRegionEnd) {
    next = `${next.slice(0, existingParkingMethodsStart)}\n      \n${parkingDoorMethods}${next.slice(parkingMethodRegionEnd)}`;
  } else if (!next.includes("private function zhArmParkingCoreDoors")) {
    const marker = "\n      override public function handleEventTrigger";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Parking handleEventTrigger marker for core door methods.");
    }
    next = next.replace(marker, `\n      \n${parkingDoorMethods}${marker}`);
  }

  if (!next.includes('npcId != "alien_teacher"') || !next.includes('dialog.sayById("link_question")') || !next.includes(sayDialogCall) || !next.includes(autoSceneCall) || !next.includes('flashpointQaAutoSceneDelayMs') || !next.includes("this.shellApi.loadScene(Center,500,1790,\"right\")") || !next.includes("this.zhArmParkingCoreDoors();") || !next.includes("private function zhCreateParkingEdgeZones()") || !next.includes("private function zhLayoutParkingEdgeZones()") || !next.includes("private function zhCheckParkingCoreDoors()") || !next.includes("private var _zhParkingLastX:Number") || !next.includes("playerSpatial.x <= 1720 && playerSpatial.x < lastX") || !next.includes("playerSpatial.x >= 2500 && playerSpatial.x > lastX") || !next.includes("this.shellApi.loadScene(Bathrooms,2000,1050,\"left\")") || !next.includes("override public function resize(param1:Number, param2:Number) : void") || !next.includes("MouseEvent.CLICK")) {
    throw new Error("Parking QA dialog patch did not apply cleanly.");
  }
  return next;
}

function patchPoptropiconShared(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import game.components.entity.Dialog;", "   import ash.core.Entity;");
  next = addImport(next, "   import game.components.entity.Dialog;", "   import engine.components.MotionBounds;");
  next = addImport(next, "   import engine.components.MotionBounds;", "   import engine.components.Spatial;");
  next = addImport(next, "   import game.components.entity.character.Skin;", "   import flash.geom.Rectangle;");
  next = addImport(next, "   import flash.geom.Rectangle;", "   import flash.utils.getDefinitionByName;");
  next = addImport(next, "   import game.scene.template.PlatformerGameScene;", "   import game.data.TimedEvent;");
  next = addImport(next, "   import game.data.TimedEvent;", "   import engine.util.Command;");
  next = addImport(next, "   import game.scenes.con1.Con1Events;", "   import game.systems.motion.BoundsCheckSystem;");
  next = addImport(next, "   import game.systems.motion.BoundsCheckSystem;", "   import game.util.SceneUtil;");
  next = addImport(next, "   import game.util.SceneUtil;", "   import game.util.ProxyUtils;");

  if (!next.includes("private var _zhSampleEdgeDoorLoading:Boolean")) {
    next = next.replace(
      "      protected var _events:Con1Events;\n",
      "      protected var _events:Con1Events;\n      \n      private var _zhSampleEdgeDoorLoading:Boolean = false;\n      private var _zhLastSampleEdgeX:Number = NaN;\n"
    );
  } else if (!next.includes("private var _zhLastSampleEdgeX:Number")) {
    next = next.replace(
      "      private var _zhSampleEdgeDoorLoading:Boolean = false;\n",
      "      private var _zhSampleEdgeDoorLoading:Boolean = false;\n      private var _zhLastSampleEdgeX:Number = NaN;\n"
    );
  }

  if (!next.includes("this.zhApplySampleIslandBounds();")) {
    next = next.replace("         super.loaded();", "         super.loaded();\n         this.zhApplySampleIslandBounds();");
  }
  if (!next.includes("this.zhArmSampleIslandEdgeDoors();")) {
    next = next.replace("         this.zhApplySampleIslandBounds();", "         this.zhApplySampleIslandBounds();\n         this.zhArmSampleIslandEdgeDoors();");
  }
  if (!next.includes("this.flashpointQaSayCon1DialogAfterLoad();")) {
    next = next.replace("         this.zhArmSampleIslandEdgeDoors();", "         this.zhArmSampleIslandEdgeDoors();\n         this.flashpointQaSayCon1DialogAfterLoad();");
  }
  const method = `      private function zhApplySampleIslandBounds() : void
      {
         var _loc1_:String = null;
         var _loc2_:Rectangle = null;
         var _loc3_:MotionBounds = null;
         if(player == null)
         {
            return;
         }
         _loc1_ = String(super.groupPrefix || "").toLowerCase();
         if(_loc1_.indexOf("parking") >= 0)
         {
            _loc2_ = new Rectangle(0,0,3040,1490);
         }
         else if(_loc1_.indexOf("center") >= 0)
         {
            _loc2_ = new Rectangle(200,320,3950,1515);
         }
         else if(_loc1_.indexOf("bathrooms") >= 0)
         {
            _loc2_ = new Rectangle(0,0,2400,1080);
         }
         else if(_loc1_.indexOf("alley") >= 0)
         {
            _loc2_ = new Rectangle(400,320,3594,1560);
         }
         else if(_loc1_.indexOf("admixed") >= 0 || _loc1_.indexOf("adstreet3") >= 0)
         {
            _loc2_ = new Rectangle(-180,0,2280,1080);
         }
         else
         {
            return;
         }
         if(this.getSystem(BoundsCheckSystem) == null)
         {
            this.addSystem(new BoundsCheckSystem(),15);
         }
         _loc3_ = player.get(MotionBounds) as MotionBounds;
         if(_loc3_ == null)
         {
            _loc3_ = new MotionBounds(_loc2_);
            player.add(_loc3_);
         }
         else
         {
            _loc3_.box = _loc2_;
         }
         _loc3_.reposition = true;
      }
`;
  const edgeMethods = `      private function zhArmSampleIslandEdgeDoors() : void
      {
         if(player == null)
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(0.25,0,this.zhCheckSampleIslandEdgeDoors,true));
      }

      
      private function zhCheckSampleIslandEdgeDoors() : void
      {
         var lastX:Number = NaN;
         var hasLast:Boolean = false;
         var prefix:String = null;
         var spatial:Spatial = null;
         if(_zhSampleEdgeDoorLoading || player == null || shellApi == null)
         {
            return;
         }
         spatial = player.get(Spatial) as Spatial;
         if(spatial == null)
         {
            return;
         }
         lastX = _zhLastSampleEdgeX;
         _zhLastSampleEdgeX = spatial.x;
         hasLast = !isNaN(lastX);
         if(!hasLast)
         {
            return;
         }
         prefix = String(super.groupPrefix || "").toLowerCase();
         if(prefix.indexOf("parking") >= 0)
         {
            if(spatial.x <= 1720 && spatial.x < lastX)
            {
               this.zhLoadCon1Scene("game.scenes.con1.bathrooms.Bathrooms",2000,1050,"left");
            }
            else if(spatial.x >= 2500 && spatial.x > lastX)
            {
               this.zhLoadCon1Scene("game.scenes.con1.center.Center",800,1790,"right");
            }
         }
         else if(prefix.indexOf("bathrooms") >= 0)
         {
            if(spatial.x >= 2250 && spatial.x > lastX)
            {
               this.zhLoadCon1Scene("game.scenes.con1.parking.Parking",1850,1430,"right");
            }
         }
         else if(prefix.indexOf("center") >= 0)
         {
            if(spatial.x <= 650 && spatial.x < lastX)
            {
               this.zhLoadCon1Scene("game.scenes.con1.parking.Parking",2300,1430,"left");
            }
            else if(spatial.x >= 3600 && spatial.x > lastX)
            {
               this.zhLoadCon1Scene("game.scenes.con1.alley.Alley",800,1830,"right");
            }
         }
         else if(prefix.indexOf("alley") >= 0)
         {
            if(spatial.x <= 560 && spatial.x < lastX)
            {
               this.zhLoadCon1Scene("game.scenes.con1.center.Center",3400,1790,"left");
            }
         }
      }

      
      private function zhLoadCon1Scene(param1:String, param2:Number, param3:Number, param4:String) : void
      {
         var sceneClass:Class = null;
         if(_zhSampleEdgeDoorLoading)
         {
            return;
         }
         _zhSampleEdgeDoorLoading = true;
         sceneClass = getDefinitionByName(param1) as Class;
         shellApi.loadScene(sceneClass,param2,param3,param4);
      }
`;
  const qaDialogMethods = `      private function flashpointQaSayCon1DialogAfterLoad() : void
      {
         var npcId:String = null;
         if(super.groupContainer == null || super.groupContainer.root == null || super.groupContainer.root.loaderInfo == null)
         {
            return;
         }
         npcId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogNpc") as String;
         if(npcId == null || npcId == "")
         {
            return;
         }
         this.flashpointQaSayCon1Dialog(npcId);
         SceneUtil.addTimedEvent(this,new TimedEvent(1,45,Command.create(this.flashpointQaSayCon1Dialog,npcId)));
      }

      
      private function flashpointQaSayCon1Dialog(param1:String) : void
      {
         var target:Entity = null;
         var dialog:Dialog = null;
         var dialogId:String = null;
         target = getEntityById(param1);
         if(target == null)
         {
            return;
         }
         dialog = target.get(Dialog) as Dialog;
         if(dialog == null)
         {
            return;
         }
         dialog.allowOverwrite = true;
         if(super.groupContainer != null && super.groupContainer.root != null && super.groupContainer.root.loaderInfo != null)
         {
            dialogId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId") as String;
         }
         if(dialogId != null && dialogId != "" && dialog.getDialog(dialogId) != null)
         {
            dialog.sayById(dialogId);
         }
         else
         {
            dialog.sayCurrent();
         }
      }
`;
  if (!next.includes("private function zhApplySampleIslandBounds")) {
    const marker = "\n      public function handleEventTrigger";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Poptropicon1Scene handleEventTrigger marker.");
    }
    next = next.replace(marker, `\n      \n${method}\n${edgeMethods}\n${qaDialogMethods}${marker}`);
  } else {
    next = replaceAs3Function(next, "      private function zhApplySampleIslandBounds() : void", method);
    if (!next.includes("private function zhArmSampleIslandEdgeDoors")) {
      const marker = "\n      public function handleEventTrigger";
      if (!next.includes(marker)) {
        throw new Error("Unable to locate Poptropicon1Scene handleEventTrigger marker for edge door patch.");
      }
      next = next.replace(marker, `\n      \n${edgeMethods}\n${qaDialogMethods}${marker}`);
    } else {
      next = replaceAs3Function(next, "      private function zhArmSampleIslandEdgeDoors() : void", edgeMethods.match(/      private function zhArmSampleIslandEdgeDoors\(\) : void[\s\S]*?(?=\n      private function zhCheckSampleIslandEdgeDoors)/u)[0]);
      next = replaceAs3Function(next, "      private function zhCheckSampleIslandEdgeDoors() : void", edgeMethods.match(/      private function zhCheckSampleIslandEdgeDoors\(\) : void[\s\S]*?(?=\n      private function zhLoadCon1Scene)/u)[0]);
      next = replaceAs3Function(next, "      private function zhLoadCon1Scene(param1:String, param2:Number, param3:Number, param4:String) : void", edgeMethods.match(/      private function zhLoadCon1Scene\(param1:String, param2:Number, param3:Number, param4:String\) : void[\s\S]*$/u)[0]);
      if (!next.includes("private function flashpointQaSayCon1DialogAfterLoad")) {
        const marker = "\n      public function handleEventTrigger";
        if (!next.includes(marker)) {
          throw new Error("Unable to locate Poptropicon1Scene handleEventTrigger marker for QA dialog methods.");
        }
        next = next.replace(marker, `\n      \n${qaDialogMethods}${marker}`);
      } else {
        next = replaceAs3Function(next, "      private function flashpointQaSayCon1DialogAfterLoad() : void", qaDialogMethods.match(/      private function flashpointQaSayCon1DialogAfterLoad\(\) : void[\s\S]*?(?=\n      private function flashpointQaSayCon1Dialog)/u)[0]);
        next = replaceAs3Function(next, "      private function flashpointQaSayCon1Dialog(param1:String) : void", qaDialogMethods.match(/      private function flashpointQaSayCon1Dialog\(param1:String\) : void[\s\S]*$/u)[0]);
      }
    }
  }
  if (!next.includes("new Rectangle(0,0,3040,1490)") || !next.includes("new Rectangle(200,320,3950,1515)") || !next.includes("new Rectangle(-180,0,2280,1080)") || !next.includes("BoundsCheckSystem") || !next.includes("zhCheckSampleIslandEdgeDoors") || !next.includes("getDefinitionByName") || !next.includes("_zhLastSampleEdgeX") || !next.includes("flashpointQaDialogId") || !next.includes("dialog.sayById(dialogId)") || !next.includes("this.flashpointQaSayCon1DialogAfterLoad();")) {
    throw new Error("Poptropicon shared sample bounds patch did not apply cleanly.");
  }
  return next;
}

function patchPoptropiconCenter(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const previous = [
    'introPopup.updateText("Poptropicon is the hottest ticket in town. Find a way inside!","Start");',
    'introPopup.updateText("Poptropicon 是城里最热门的漫展。想办法进场！","开始");'
  ];
  const chinese = 'introPopup.updateText("漫展岛火热开幕！想办法进场！","开始");';
  for (const text of previous) {
    if (next.includes(text)) {
      next = next.replace(text, chinese);
      break;
    }
  }
  if (!next.includes(chinese)) {
    throw new Error("Poptropicon Center intro popup translation patch did not apply cleanly.");
  }
  return next;
}

function patchPoptropiconAdScene(content, className) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = next.replace(
    "   import game.scene.template.PlatformerGameScene;",
    "   import game.scenes.con1.shared.Poptropicon1Scene;"
  );
  next = addImport(next, "   import flash.display.DisplayObjectContainer;", "   import engine.components.Spatial;");
  next = addImport(next, "   import game.scenes.con1.shared.Poptropicon1Scene;", "   import game.data.TimedEvent;");
  next = addImport(next, "   import game.scenes.con1.shared.Poptropicon1Scene;", "   import game.scenes.con1.bathrooms.Bathrooms;");
  next = addImport(next, "   import game.scenes.con1.shared.Poptropicon1Scene;", "   import game.scenes.con1.center.Center;");
  next = addImport(next, "   import game.scenes.con1.shared.Poptropicon1Scene;", "   import game.scenes.con1.parking.Parking;");
  next = addImport(next, "   import game.scenes.con1.shared.Poptropicon1Scene;", "   import game.util.SceneUtil;");
  next = next.replace(
    `public class ${className} extends PlatformerGameScene`,
    `public class ${className} extends Poptropicon1Scene`
  );
  if (!next.includes("_zhEdgeDoorLoading")) {
    next = next.replace(
      `   public class ${className} extends Poptropicon1Scene\n   {\n      `,
      `   public class ${className} extends Poptropicon1Scene\n   {\n      private var _zhEdgeDoorLoading:Boolean = false;\n      \n      `
    );
  }
  if (!next.includes("this.zhArmAdEdgeDoors();")) {
    next = next.replace("         super.loaded();\n      }", "         super.loaded();\n         this.zhArmAdEdgeDoors();\n      }");
  }
  const edgeDoorBody = className === "AdStreet3"
    ? `         if(spatial.x <= 260)
         {
            _zhEdgeDoorLoading = true;
            shellApi.loadScene(Bathrooms,2200,1050,"left");
         }
         else if(previous.indexOf("bathrooms") >= 0 && spatial.x >= 1640)
         {
            _zhEdgeDoorLoading = true;
            shellApi.loadScene(Parking,520,1430,"right");
         }`
    : `         if(previous.indexOf("parking") >= 0 && spatial.x >= 1640)
         {
            _zhEdgeDoorLoading = true;
            shellApi.loadScene(Center,500,1790,"right");
         }
         else if(previous.indexOf("center") >= 0 && spatial.x <= 260)
         {
            _zhEdgeDoorLoading = true;
            shellApi.loadScene(Parking,2620,1430,"left");
         }`;
  const edgeDoorMethods = `      private function zhArmAdEdgeDoors() : void
      {
         SceneUtil.addTimedEvent(this,new TimedEvent(0.25,0,this.zhCheckAdEdgeDoors,true));
      }
      
      private function zhCheckAdEdgeDoors() : void
      {
         var spatial:Spatial = null;
         var previous:String = null;
         if(_zhEdgeDoorLoading || player == null || shellApi == null || shellApi.sceneManager == null)
         {
            return;
         }
         spatial = player.get(Spatial) as Spatial;
         if(spatial == null)
         {
            return;
         }
         previous = String(shellApi.sceneManager.previousScene || "").toLowerCase();
${edgeDoorBody}
      }
`;
  if (!next.includes("private function zhArmAdEdgeDoors")) {
    next = next.replace("\n   }\n}", `\n      \n${edgeDoorMethods}   }\n}`);
  } else {
    next = replaceAs3Function(next, "      private function zhArmAdEdgeDoors() : void", `      private function zhArmAdEdgeDoors() : void
      {
         SceneUtil.addTimedEvent(this,new TimedEvent(0.25,0,this.zhCheckAdEdgeDoors,true));
      }
`);
    next = replaceAs3Function(next, "      private function zhCheckAdEdgeDoors() : void", `      private function zhCheckAdEdgeDoors() : void
      {
         var spatial:Spatial = null;
         var previous:String = null;
         if(_zhEdgeDoorLoading || player == null || shellApi == null || shellApi.sceneManager == null)
         {
            return;
         }
         spatial = player.get(Spatial) as Spatial;
         if(spatial == null)
         {
            return;
         }
         previous = String(shellApi.sceneManager.previousScene || "").toLowerCase();
${edgeDoorBody}
      }
`);
  }
  if (!next.includes("import game.scenes.con1.shared.Poptropicon1Scene;") || !next.includes(`public class ${className} extends Poptropicon1Scene`) || !next.includes("this.zhArmAdEdgeDoors();") || !next.includes("new TimedEvent(0.25,0,this.zhCheckAdEdgeDoors,true)")) {
    throw new Error(`Poptropicon ${className} ad-scene base-class patch did not apply cleanly.`);
  }
  return next;
}

function patchTimmyMainStreet(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import game.util.PerformanceUtils;", "   import game.util.ProxyUtils;");

  const afterLoadMethod = `      private function flashpointQaSayDialogAfterLoad() : void
      {
         var npcId:String = null;
         var dialogId:String = null;
         if(super.groupContainer == null || super.groupContainer.root == null || super.groupContainer.root.loaderInfo == null)
         {
            return;
         }
         npcId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogNpc") as String;
         dialogId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId") as String;
         if(npcId != "scutaro" && npcId != "timmy" && npcId != "player")
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(2,1,Command.create(this.flashpointQaSayDialog,npcId,dialogId)));
      }
`;

  const sayDialogMethod = `      private function flashpointQaSayDialog(param1:String, param2:String = "") : void
      {
         var target:Entity = null;
         var dialog:Dialog = null;
         var dialogData:* = null;
         if(param1 == "scutaro")
         {
            target = _scutaro != null ? _scutaro : getEntityById("scutaro");
         }
         else if(param1 == "timmy")
         {
            target = _timmy != null ? _timmy : getEntityById("timmy");
         }
         else if(param1 == "player")
         {
            target = player;
         }
         if(param2 == null || param2 == "")
         {
            if(param1 == "scutaro")
            {
               param2 = "qaScutaro";
            }
            else if(param1 == "timmy")
            {
               param2 = "evil_doings";
            }
            else if(param1 == "player")
            {
               param2 = "be_careful";
            }
         }
         if(target != null)
         {
            dialog = target.get(Dialog) as Dialog;
            if(dialog != null)
            {
               dialog.allowOverwrite = true;
               dialogData = param2 != null && param2 != "" ? dialog.getDialog(param2) : null;
               if(dialogData != null)
               {
                  if(dialogData is DialogData)
                  {
                     DialogData(dialogData).timeOverride = 60;
                     DialogData(dialogData).forceOnScreen = true;
                  }
                  dialog.sayById(param2);
               }
               else
               {
                  CharUtils.sayDialog(target);
               }
            }
            else
            {
               CharUtils.sayDialog(target);
            }
         }
      }
`;

  const loadedCallMarker = "            addItemHitSystem();\n";
  const loadedCallBlock = `${loadedCallMarker}            this.flashpointQaSayDialogAfterLoad();\n`;
  if (!next.includes(loadedCallBlock)) {
    if (!next.includes(loadedCallMarker)) {
      throw new Error("Unable to locate Timmy MainStreet addItemHitSystem marker.");
    }
    next = next.replace(loadedCallMarker, loadedCallBlock);
  }

  if (!next.includes("override public function resize(param1:Number, param2:Number) : void")) {
    const marker = "\n      private function setupAssets() : void";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Timmy MainStreet setupAssets marker.");
    }
    const resizeMethod = `
      override public function resize(param1:Number, param2:Number) : void
      {
         super.resize(param1,param2);
         this.flashpointQaSayDialogAfterLoad();
      }
`;
    next = next.replace(marker, `${resizeMethod}${marker}`);
  }

  if (!next.includes("private function flashpointQaSayDialogAfterLoad")) {
    const marker = "\n      private function setupAssets() : void";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Timmy MainStreet setupAssets marker for QA dialog methods.");
    }
    const methods = `\n      \n${afterLoadMethod}      \n${sayDialogMethod}`;
    next = next.replace(marker, `${methods}${marker}`);
  } else {
    next = replaceAs3Function(next, "      private function flashpointQaSayDialogAfterLoad() : void", afterLoadMethod);
    if (next.includes('      private function flashpointQaSayDialog(param1:String, param2:String = "") : void')) {
      next = replaceAs3Function(next, '      private function flashpointQaSayDialog(param1:String, param2:String = "") : void', sayDialogMethod);
    } else {
      next = replaceAs3Function(next, "      private function flashpointQaSayDialog(param1:String) : void", sayDialogMethod);
    }
  }

  if (!next.includes('npcId != "scutaro" && npcId != "timmy" && npcId != "player"') || !next.includes('new TimedEvent(2,1,Command.create(this.flashpointQaSayDialog,npcId,dialogId))') || !next.includes('DialogData(dialogData).timeOverride = 60') || !next.includes('dialog.sayById(param2)') || !next.includes('ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId")') || !next.includes("override public function resize(param1:Number, param2:Number) : void")) {
    throw new Error("Timmy MainStreet QA dialog patch did not apply cleanly.");
  }
  return next;
}

function patchMissionAtlantisShip(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import engine.components.Display;", "   import engine.util.Command;");
  next = addImport(next, "   import game.util.SceneUtil;", "   import game.util.ProxyUtils;");

  const afterLoadMethod = `      private function flashpointQaSayMissionDialogAfterLoad() : void
      {
         var npcId:String = null;
         var dialogId:String = null;
         if(super.groupContainer == null || super.groupContainer.root == null || super.groupContainer.root.loaderInfo == null)
         {
            return;
         }
         npcId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogNpc") as String;
         dialogId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId") as String;
         if(npcId != "cam" && npcId != "sailor2" && npcId != "player")
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(2,1,Command.create(this.flashpointQaSayMissionDialog,npcId,dialogId)));
      }
`;

  const sayDialogMethod = `      private function flashpointQaSayMissionDialog(param1:String, param2:String = "") : void
      {
         var target:Entity = null;
         var dialog:Dialog = null;
         var dialogData:* = null;
         if(param1 == "cam")
         {
            target = _cam != null ? _cam : getEntityById("cam");
         }
         else if(param1 == "sailor2")
         {
            target = _sailor2 != null ? _sailor2 : getEntityById("sailor2");
         }
         else if(param1 == "player")
         {
            target = player;
         }
         if(param2 == null || param2 == "")
         {
            if(param1 == "cam")
            {
               param2 = "findKey";
            }
            else if(param1 == "sailor2")
            {
               param2 = "water";
            }
            else if(param1 == "player")
            {
               param2 = "whatsGoingOn";
            }
         }
         if(target != null)
         {
            dialog = target.get(Dialog) as Dialog;
            if(dialog != null)
            {
               dialog.allowOverwrite = true;
               dialogData = param2 != null && param2 != "" ? dialog.getDialog(param2) : null;
               if(dialogData != null)
               {
                  if(dialogData is DialogData)
                  {
                     DialogData(dialogData).timeOverride = 60;
                     DialogData(dialogData).forceOnScreen = true;
                  }
                  dialog.sayById(param2);
               }
               else
               {
                  CharUtils.sayDialog(target);
               }
            }
            else
            {
               CharUtils.sayDialog(target);
            }
         }
      }
`;

  const loadedCallMarker = "         super.loaded();\n";
  const loadedCallBlock = `${loadedCallMarker}         this.flashpointQaSayMissionDialogAfterLoad();\n`;
  if (!next.includes(loadedCallBlock)) {
    if (!next.includes(loadedCallMarker)) {
      throw new Error("Unable to locate Mission Atlantis Ship loaded marker.");
    }
    next = next.replace(loadedCallMarker, loadedCallBlock);
  }

  if (!next.includes("override public function resize(param1:Number, param2:Number) : void")) {
    const marker = "\n      private function setup() : void";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Mission Atlantis Ship setup marker.");
    }
    const resizeMethod = `
      
      override public function resize(param1:Number, param2:Number) : void
      {
         super.resize(param1,param2);
         this.flashpointQaSayMissionDialogAfterLoad();
      }
`;
    next = next.replace(marker, `${resizeMethod}${marker}`);
  }

  if (!next.includes("private function flashpointQaSayMissionDialogAfterLoad")) {
    const marker = "\n      private function setup() : void";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Mission Atlantis Ship setup marker for QA dialog methods.");
    }
    next = next.replace(marker, `\n      \n${afterLoadMethod}      \n${sayDialogMethod}${marker}`);
  } else {
    next = replaceAs3Function(next, "      private function flashpointQaSayMissionDialogAfterLoad() : void", afterLoadMethod);
    next = replaceAs3Function(next, '      private function flashpointQaSayMissionDialog(param1:String, param2:String = "") : void', sayDialogMethod);
  }

  if (!next.includes('npcId != "cam" && npcId != "sailor2" && npcId != "player"') || !next.includes("new TimedEvent(2,1,Command.create(this.flashpointQaSayMissionDialog,npcId,dialogId))") || !next.includes("DialogData(dialogData).timeOverride = 60") || !next.includes("dialog.sayById(param2)") || !next.includes('ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId")') || !next.includes("this.flashpointQaSayMissionDialogAfterLoad();")) {
    throw new Error("Mission Atlantis Ship QA dialog patch did not apply cleanly.");
  }
  return next;
}

function patchFtueMainLand(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = next.replace(
    "         var _loc5_:* = §§findproperty(fruitsCollected);\n         var _loc6_:Number = Number(_loc5_.fruitsCollected) + 1;\n         _loc5_.fruitsCollected = _loc6_;\n",
    "         ++fruitsCollected;\n"
  );
  next = addImport(next, "   import game.util.PlatformUtils;", "   import game.util.ProxyUtils;");

  const afterLoadMethod = `      private function flashpointQaSayFtueDialogAfterLoad() : void
      {
         var npcId:String = null;
         var dialogId:String = null;
         if(super.groupContainer == null || super.groupContainer.root == null || super.groupContainer.root.loaderInfo == null)
         {
            return;
         }
         npcId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogNpc") as String;
         dialogId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId") as String;
         if(npcId != "crusoe" && npcId != "amelia" && npcId != "monkey" && npcId != "player")
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(2,1,Command.create(this.flashpointQaSayFtueDialog,npcId,dialogId)));
      }
`;

  const sayDialogMethod = `      private function flashpointQaSayFtueDialog(param1:String, param2:String = "") : void
      {
         var target:Entity = null;
         var dialog:Dialog = null;
         var dialogData:* = null;
         switch(param1)
         {
            case "crusoe":
               target = crusoe != null ? crusoe : getEntityById("crusoe");
               if(param2 == null || param2 == "")
               {
                  param2 = "look";
               }
               break;
            case "amelia":
               target = amelia != null ? amelia : getEntityById("amelia");
               if(param2 == null || param2 == "")
               {
                  param2 = "strange";
               }
               break;
            case "monkey":
               target = monkey != null ? monkey : getEntityById("monkey");
               if(param2 == null || param2 == "")
               {
                  param2 = "hello";
               }
               break;
            case "player":
               target = player;
               if(param2 == null || param2 == "")
               {
                  param2 = "no_fruit";
               }
         }
         if(target != null)
         {
            dialog = target.get(Dialog) as Dialog;
            if(dialog != null)
            {
               dialog.allowOverwrite = true;
               dialogData = param2 != null && param2 != "" ? dialog.getDialog(param2) : null;
               if(dialogData != null)
               {
                  if(dialogData is DialogData)
                  {
                     DialogData(dialogData).timeOverride = 60;
                     DialogData(dialogData).forceOnScreen = true;
                  }
                  dialog.sayById(param2);
               }
               else
               {
                  CharUtils.sayDialog(target);
               }
            }
            else
            {
               CharUtils.sayDialog(target);
            }
         }
      }
`;

  const loadedEndMarker = `         if(crusoe && crusoe.has(Skin))
         {
            facialPart = SkinUtils.getSkinPartEntity(crusoe,"facial");
            facialPart.get(Timeline).handleLabel("pop",crusoeBubblePop,false);
            facialPart.get(Timeline).handleLabel("pop2",crusoeBubblePop,false);
         }
`;
  const loadedCallBlock = `${loadedEndMarker}         this.flashpointQaSayFtueDialogAfterLoad();\n`;
  if (!next.includes(loadedCallBlock)) {
    if (!next.includes(loadedEndMarker)) {
      throw new Error("Unable to locate FTUE MainLand loaded end marker.");
    }
    next = next.replace(loadedEndMarker, loadedCallBlock);
  }

  if (!next.includes("override public function resize(param1:Number, param2:Number) : void")) {
    const marker = "\n      private function setupFruitCanvas() : void";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate FTUE MainLand setupFruitCanvas marker.");
    }
    const resizeMethod = `
      override public function resize(param1:Number, param2:Number) : void
      {
         super.resize(param1,param2);
         this.flashpointQaSayFtueDialogAfterLoad();
      }
`;
    next = next.replace(marker, `${resizeMethod}${marker}`);
  }

  if (!next.includes("private function flashpointQaSayFtueDialogAfterLoad")) {
    const marker = "\n      private function setupFruitCanvas() : void";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate FTUE MainLand setupFruitCanvas marker for QA dialog methods.");
    }
    next = next.replace(marker, `\n      \n${afterLoadMethod}      \n${sayDialogMethod}${marker}`);
  } else {
    next = replaceAs3Function(next, "      private function flashpointQaSayFtueDialogAfterLoad() : void", afterLoadMethod);
    next = replaceAs3Function(next, '      private function flashpointQaSayFtueDialog(param1:String, param2:String = "") : void', sayDialogMethod);
  }

  if (!next.includes('npcId != "crusoe" && npcId != "amelia" && npcId != "monkey" && npcId != "player"') || !next.includes("new TimedEvent(2,1,Command.create(this.flashpointQaSayFtueDialog,npcId,dialogId))") || !next.includes("DialogData(dialogData).timeOverride = 60") || !next.includes("dialog.sayById(param2)") || !next.includes('ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId")') || !next.includes("this.flashpointQaSayFtueDialogAfterLoad();")) {
    throw new Error("FTUE MainLand QA dialog patch did not apply cleanly.");
  }
  return next;
}

function patchSurvival4MainHall(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import engine.creators.InteractionCreator;", "   import engine.util.Command;");
  next = addImport(next, "   import game.util.MotionUtils;", "   import game.util.ProxyUtils;");
  next = addImport(next, "   import game.util.ProxyUtils;", "   import flash.utils.getDefinitionByName;");

  const afterLoadMethod = `      private function flashpointQaSaySurvival4DialogAfterLoad() : void
      {
         var npcId:String = null;
         var dialogId:String = null;
         if(super.groupContainer == null || super.groupContainer.root == null || super.groupContainer.root.loaderInfo == null)
         {
            return;
         }
         npcId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogNpc") as String;
         dialogId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId") as String;
         if(npcId != "vanBuren" && npcId != "winston" && npcId != "player" && npcId != "security" && npcId != "securityInteraction")
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(2,1,Command.create(this.flashpointQaSaySurvival4Dialog,npcId,dialogId)));
      }
`;

  const sayDialogMethod = `      private function flashpointQaSaySurvival4Dialog(param1:String, param2:String = "") : void
      {
         var target:Entity = null;
         var dialog:Dialog = null;
         var dialogData:* = null;
         switch(param1)
         {
            case "vanBuren":
               target = getEntityById("vanBuren");
               if(param2 == null || param2 == "")
               {
                  param2 = "lucky";
               }
               break;
            case "winston":
               target = getEntityById("winston");
               if(param2 == null || param2 == "")
               {
                  param2 = "dinner";
               }
               break;
            case "player":
               target = player;
               if(param2 == null || param2 == "")
               {
                  param2 = "get_on_with_it";
               }
               break;
            case "security":
            case "securityInteraction":
               target = getEntityById("securityInteraction");
               if(param2 == null || param2 == "")
               {
                  param2 = "keycode";
               }
         }
         if(target != null)
         {
            dialog = target.get(Dialog) as Dialog;
            if(dialog != null)
            {
               dialog.allowOverwrite = true;
               dialogData = param2 != null && param2 != "" ? dialog.getDialog(param2) : null;
               if(dialogData != null)
               {
                  if(dialogData is DialogData)
                  {
                     DialogData(dialogData).timeOverride = 60;
                     DialogData(dialogData).forceOnScreen = true;
                  }
                  dialog.sayById(param2);
               }
               else
               {
                  CharUtils.sayDialog(target);
               }
            }
            else
            {
               CharUtils.sayDialog(target);
            }
         }
      }
`;

  const autoSceneAfterLoadMethod = `      private function flashpointQaAutoSurvival4SceneAfterLoad() : void
      {
         var delayMs:Number = NaN;
         var delaySeconds:Number = 4;
         var targetScene:String = null;
         if(super.groupContainer == null || super.groupContainer.root == null || super.groupContainer.root.loaderInfo == null)
         {
            return;
         }
         targetScene = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaAutoScene") as String;
         if(targetScene == null || targetScene == "" || targetScene == "game.scenes.survival4.mainHall.MainHall")
         {
            return;
         }
         if(targetScene.indexOf("game.scenes.survival4.") != 0)
         {
            return;
         }
         delayMs = Number(ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaAutoSceneDelayMs"));
         if(!isNaN(delayMs) && delayMs > 0)
         {
            if(delayMs > 15000)
            {
               delayMs = 15000;
            }
            delaySeconds = Math.max(0.5,delayMs / 1000);
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(delaySeconds,1,Command.create(this.flashpointQaLoadSurvival4Scene,targetScene)));
      }
`;

  const autoSceneLoadMethod = `      private function flashpointQaLoadSurvival4Scene(param1:String) : void
      {
         var sceneClass:Class = null;
         if(param1 == null || param1 == "" || param1.indexOf("game.scenes.survival4.") != 0)
         {
            return;
         }
         sceneClass = getDefinitionByName(param1) as Class;
         if(sceneClass != null)
         {
            this.shellApi.loadScene(sceneClass,100,980,"right");
         }
      }
`;

  if (!next.includes("this.flashpointQaSaySurvival4DialogAfterLoad();")) {
    const marker = "         securityPanel.remove(SceneInteraction);\n            ToolTipCreator.removeFromEntity(securityPanel);\n         }\n      }\n";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Survival4 MainHall loaded end marker.");
    }
    next = next.replace(marker, `         securityPanel.remove(SceneInteraction);\n            ToolTipCreator.removeFromEntity(securityPanel);\n         }\n         this.flashpointQaSaySurvival4DialogAfterLoad();\n         this.flashpointQaAutoSurvival4SceneAfterLoad();\n      }\n`);
  } else if (!next.includes("this.flashpointQaAutoSurvival4SceneAfterLoad();")) {
    next = next.replace(
      "         this.flashpointQaSaySurvival4DialogAfterLoad();\n",
      "         this.flashpointQaSaySurvival4DialogAfterLoad();\n         this.flashpointQaAutoSurvival4SceneAfterLoad();\n"
    );
  }

  if (!next.includes("override public function resize(param1:Number, param2:Number) : void")) {
    const marker = "\n      private function optimizeAssets() : void";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Survival4 MainHall optimizeAssets marker.");
    }
    const resizeMethod = `
      override public function resize(param1:Number, param2:Number) : void
      {
         super.resize(param1,param2);
         this.flashpointQaSaySurvival4DialogAfterLoad();
         this.flashpointQaAutoSurvival4SceneAfterLoad();
      }
`;
    next = next.replace(marker, `${resizeMethod}${marker}`);
  } else if (!next.includes("         this.flashpointQaAutoSurvival4SceneAfterLoad();")) {
    next = next.replace(
      "         this.flashpointQaSaySurvival4DialogAfterLoad();\n",
      "         this.flashpointQaSaySurvival4DialogAfterLoad();\n         this.flashpointQaAutoSurvival4SceneAfterLoad();\n"
    );
  }

  if (!next.includes("private function flashpointQaSaySurvival4DialogAfterLoad")) {
    const marker = "\n      private function optimizeAssets() : void";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Survival4 MainHall optimizeAssets marker for QA dialog methods.");
    }
    next = next.replace(marker, `\n      \n${afterLoadMethod}      \n${sayDialogMethod}      \n${autoSceneAfterLoadMethod}      \n${autoSceneLoadMethod}${marker}`);
  } else {
    next = replaceAs3Function(next, "      private function flashpointQaSaySurvival4DialogAfterLoad() : void", afterLoadMethod);
    next = replaceAs3Function(next, '      private function flashpointQaSaySurvival4Dialog(param1:String, param2:String = "") : void', sayDialogMethod);
    if (!next.includes("private function flashpointQaAutoSurvival4SceneAfterLoad")) {
      const marker = "\n      private function optimizeAssets() : void";
      if (!next.includes(marker)) {
        throw new Error("Unable to locate Survival4 MainHall optimizeAssets marker for QA auto scene methods.");
      }
      next = next.replace(marker, `\n      \n${autoSceneAfterLoadMethod}      \n${autoSceneLoadMethod}${marker}`);
    } else {
      next = replaceAs3Function(next, "      private function flashpointQaAutoSurvival4SceneAfterLoad() : void", autoSceneAfterLoadMethod);
      next = replaceAs3Function(next, "      private function flashpointQaLoadSurvival4Scene(param1:String) : void", autoSceneLoadMethod);
    }
  }

  if (!next.includes('npcId != "vanBuren" && npcId != "winston" && npcId != "player" && npcId != "security" && npcId != "securityInteraction"') || !next.includes("new TimedEvent(2,1,Command.create(this.flashpointQaSaySurvival4Dialog,npcId,dialogId))") || !next.includes("DialogData(dialogData).timeOverride = 60") || !next.includes("dialog.sayById(param2)") || !next.includes('ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId")') || !next.includes("this.flashpointQaSaySurvival4DialogAfterLoad();") || !next.includes("this.flashpointQaAutoSurvival4SceneAfterLoad();") || !next.includes('ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaAutoScene")') || !next.includes("getDefinitionByName(param1) as Class") || !next.includes('param1.indexOf("game.scenes.survival4.") != 0')) {
    throw new Error("Survival4 MainHall QA dialog patch did not apply cleanly.");
  }
  return next;
}

function patchArab1Bazaar(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import game.components.scene.SceneInteraction;", "   import game.data.TimedEvent;");
  next = addImport(next, "   import game.data.TimedEvent;", "   import game.data.scene.characterDialog.DialogData;");
  next = addImport(next, "   import game.util.PlatformUtils;", "   import game.util.ProxyUtils;");
  next = addImport(next, "   import game.util.ProxyUtils;", "   import flash.utils.getDefinitionByName;");

  const afterLoadMethod = `      private function flashpointQaSayArab1DialogAfterLoad() : void
      {
         var npcId:String = null;
         var dialogId:String = null;
         if(super.groupContainer != null && super.groupContainer.root != null && super.groupContainer.root.loaderInfo != null)
         {
            npcId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogNpc") as String;
            dialogId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId") as String;
         }
         if(npcId == null || npcId == "")
         {
            if(shellApi.checkEvent("qa_dialog_arab1_npc1_default") || shellApi.checkEvent("qa_dialog_arab1_npc1"))
            {
               npcId = "npc1";
               dialogId = "default";
            }
            else if(shellApi.checkEvent("qa_dialog_arab1_npc2_default") || shellApi.checkEvent("qa_dialog_arab1_npc2"))
            {
               npcId = "npc2";
               dialogId = "default";
            }
            else if(shellApi.checkEvent("qa_dialog_arab1_npc3_default") || shellApi.checkEvent("qa_dialog_arab1_npc3"))
            {
               npcId = "npc3";
               dialogId = "default";
            }
            else if(shellApi.checkEvent("qa_dialog_arab1_npc4_default") || shellApi.checkEvent("qa_dialog_arab1_npc4"))
            {
               npcId = "npc4";
               dialogId = "default";
            }
            else if(shellApi.checkEvent("qa_dialog_arab1_trader1_comment") || shellApi.checkEvent("qa_dialog_arab1_trader1"))
            {
               npcId = "trader1";
               dialogId = "comment";
            }
            else if(shellApi.checkEvent("qa_dialog_arab1_trader2_comment") || shellApi.checkEvent("qa_dialog_arab1_trader2"))
            {
               npcId = "trader2";
               dialogId = "comment";
            }
            else if(shellApi.checkEvent("qa_dialog_arab1_trader3_comment") || shellApi.checkEvent("qa_dialog_arab1_trader3"))
            {
               npcId = "trader3";
               dialogId = "comment";
            }
            else if(shellApi.checkEvent("qa_dialog_arab1_player_need_spy_glass") || shellApi.checkEvent("qa_dialog_arab1_player"))
            {
               npcId = "player";
               dialogId = "need_spy_glass";
            }
         }
         if(npcId != "npc1" && npcId != "npc2" && npcId != "npc3" && npcId != "npc4" && npcId != "trader1" && npcId != "trader2" && npcId != "trader3" && npcId != "player")
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(2,1,Command.create(this.flashpointQaSayArab1Dialog,npcId,dialogId)));
      }
`;

  const sayDialogMethod = `      private function flashpointQaSayArab1Dialog(param1:String, param2:String = "") : void
      {
         var target:Entity = null;
         var dialog:Dialog = null;
         var dialogData:* = null;
         if(param1 == "player")
         {
            target = player;
         }
         else
         {
            target = getEntityById(param1);
         }
         if(param2 == "default")
         {
            param2 = "";
         }
         if(param2 == null || param2 == "")
         {
            if(param1 == "trader1" || param1 == "trader2" || param1 == "trader3")
            {
               param2 = "comment";
            }
            else if(param1 == "player")
            {
               param2 = "need_spy_glass";
            }
         }
         if(target != null)
         {
            dialog = target.get(Dialog) as Dialog;
            if(dialog != null)
            {
               dialog.allowOverwrite = true;
               dialogData = param2 != null && param2 != "" ? dialog.getDialog(param2) : null;
               if(dialogData != null)
               {
                  if(dialogData is DialogData)
                  {
                     DialogData(dialogData).timeOverride = 60;
                     DialogData(dialogData).forceOnScreen = true;
                  }
                  dialog.sayById(param2);
               }
               else
               {
                  CharUtils.sayDialog(target);
               }
            }
            else
            {
               CharUtils.sayDialog(target);
            }
         }
      }
`;

  const autoSceneAfterLoadMethod = `      private function flashpointQaAutoArab1SceneAfterLoad() : void
      {
         var delayMs:Number = NaN;
         var delaySeconds:Number = 4;
         var targetScene:String = null;
         if(super.groupContainer == null || super.groupContainer.root == null || super.groupContainer.root.loaderInfo == null)
         {
            return;
         }
         targetScene = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaAutoScene") as String;
         if(targetScene == null || targetScene == "")
         {
            if(shellApi.checkEvent("qa_auto_scene_arab1_desert"))
            {
               targetScene = "game.scenes.arab1.desert.Desert";
            }
            else if(shellApi.checkEvent("qa_auto_scene_arab1_palaceExterior"))
            {
               targetScene = "game.scenes.arab1.palaceExterior.PalaceExterior";
            }
         }
         if(targetScene == null || targetScene == "" || targetScene == "game.scenes.arab1.bazaar.Bazaar")
         {
            return;
         }
         if(targetScene.indexOf("game.scenes.arab1.") != 0)
         {
            return;
         }
         delayMs = Number(ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaAutoSceneDelayMs"));
         if(!isNaN(delayMs) && delayMs > 0)
         {
            if(delayMs > 15000)
            {
               delayMs = 15000;
            }
            delaySeconds = Math.max(0.5,delayMs / 1000);
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(delaySeconds,1,Command.create(this.flashpointQaLoadArab1Scene,targetScene)));
      }
`;

  const autoSceneLoadMethod = `      private function flashpointQaLoadArab1Scene(param1:String) : void
      {
         var sceneClass:Class = null;
         if(param1 == null || param1 == "" || param1.indexOf("game.scenes.arab1.") != 0)
         {
            return;
         }
         sceneClass = getDefinitionByName(param1) as Class;
         if(sceneClass != null)
         {
            this.shellApi.loadScene(sceneClass,120,1440,"right");
         }
      }
`;

  const loadedCallMarker = "         setUpIntro();\n";
  const sayDialogCall = "         this.flashpointQaSayArab1DialogAfterLoad();\n";
  const autoSceneCall = "         this.flashpointQaAutoArab1SceneAfterLoad();\n";
  const loadedSayDialogBlock = `${loadedCallMarker}${sayDialogCall}`;
  const loadedCallBlock = `${loadedCallMarker}${sayDialogCall}${autoSceneCall}`;
  if (!next.includes(loadedCallBlock)) {
    if (!next.includes(loadedCallMarker)) {
      throw new Error("Unable to locate Arabian Bazaar loaded marker.");
    }
    if (next.includes(loadedSayDialogBlock)) {
      next = next.replace(loadedSayDialogBlock, loadedCallBlock);
    } else {
      next = next.replace(loadedCallMarker, loadedCallBlock);
    }
  }

  if (!next.includes("override public function resize(param1:Number, param2:Number) : void")) {
    const marker = "\n      private function setUpInteractions() : void";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Arabian Bazaar setUpInteractions marker.");
    }
    const resizeMethod = `
      override public function resize(param1:Number, param2:Number) : void
      {
         super.resize(param1,param2);
         this.flashpointQaSayArab1DialogAfterLoad();
         this.flashpointQaAutoArab1SceneAfterLoad();
      }
`;
    next = next.replace(marker, `${resizeMethod}${marker}`);
  } else {
    const resizeSayOnlyBlock = `      override public function resize(param1:Number, param2:Number) : void
      {
         super.resize(param1,param2);
         this.flashpointQaSayArab1DialogAfterLoad();
      }
`;
    const resizeAutoSceneBlock = `      override public function resize(param1:Number, param2:Number) : void
      {
         super.resize(param1,param2);
         this.flashpointQaSayArab1DialogAfterLoad();
         this.flashpointQaAutoArab1SceneAfterLoad();
      }
`;
    if (!next.includes(resizeAutoSceneBlock)) {
      if (!next.includes(resizeSayOnlyBlock)) {
        throw new Error("Unable to locate Arabian Bazaar resize block for QA auto scene call.");
      }
      next = next.replace(resizeSayOnlyBlock, resizeAutoSceneBlock);
    }
  }

  if (!next.includes("private function flashpointQaSayArab1DialogAfterLoad")) {
    const marker = "\n      private function setUpInteractions() : void";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Arabian Bazaar methods marker.");
    }
    const methods = `\n      \n${afterLoadMethod}      \n${sayDialogMethod}      \n${autoSceneAfterLoadMethod}      \n${autoSceneLoadMethod}`;
    next = next.replace(marker, `${methods}${marker}`);
  } else {
    next = replaceAs3Function(next, "      private function flashpointQaSayArab1DialogAfterLoad() : void", afterLoadMethod);
    if (next.includes('      private function flashpointQaSayArab1Dialog(param1:String, param2:String = "") : void')) {
      next = replaceAs3Function(next, '      private function flashpointQaSayArab1Dialog(param1:String, param2:String = "") : void', sayDialogMethod);
    } else {
      next = replaceAs3Function(next, "      private function flashpointQaSayArab1Dialog(param1:String) : void", sayDialogMethod);
    }
    if (!next.includes("private function flashpointQaAutoArab1SceneAfterLoad")) {
      const marker = "\n      private function setUpInteractions() : void";
      if (!next.includes(marker)) {
        throw new Error("Unable to locate Arabian Bazaar setUpInteractions marker for QA auto scene methods.");
      }
      next = next.replace(marker, `\n      \n${autoSceneAfterLoadMethod}      \n${autoSceneLoadMethod}${marker}`);
    } else {
      next = replaceAs3Function(next, "      private function flashpointQaAutoArab1SceneAfterLoad() : void", autoSceneAfterLoadMethod);
      next = replaceAs3Function(next, "      private function flashpointQaLoadArab1Scene(param1:String) : void", autoSceneLoadMethod);
    }
  }

  if (!next.includes('npcId != "npc1" && npcId != "npc2" && npcId != "npc3" && npcId != "npc4" && npcId != "trader1" && npcId != "trader2" && npcId != "trader3" && npcId != "player"') || !next.includes("new TimedEvent(2,1,Command.create(this.flashpointQaSayArab1Dialog,npcId,dialogId))") || !next.includes("DialogData(dialogData).timeOverride = 60") || !next.includes("dialog.sayById(param2)") || !next.includes('ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId")') || !next.includes('shellApi.checkEvent("qa_dialog_arab1_trader2_comment")') || !next.includes("this.flashpointQaSayArab1DialogAfterLoad();") || !next.includes("this.flashpointQaAutoArab1SceneAfterLoad();") || !next.includes('ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaAutoScene")') || !next.includes('shellApi.checkEvent("qa_auto_scene_arab1_desert")') || !next.includes("getDefinitionByName(param1) as Class") || !next.includes('param1.indexOf("game.scenes.arab1.") != 0')) {
    throw new Error("Arabian Bazaar QA dialog patch did not apply cleanly.");
  }
  return next;
}

function patchPrisonHill(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import flash.geom.Rectangle;", "   import flash.utils.getDefinitionByName;");
  next = addImport(next, "   import game.data.TimedEvent;", "   import game.data.scene.characterDialog.DialogData;");
  next = addImport(next, "   import game.util.MotionUtils;", "   import game.util.ProxyUtils;");

  const afterLoadMethod = `      private function flashpointQaSayPrisonHillDialogAfterLoad() : void
      {
         var npcId:String = null;
         var dialogId:String = null;
         if(super.groupContainer != null && super.groupContainer.root != null && super.groupContainer.root.loaderInfo != null)
         {
            npcId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogNpc") as String;
            dialogId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId") as String;
         }
         if(npcId == null || npcId == "")
         {
            if(shellApi.checkEvent("qa_dialog_prison_hill_player_tower") || shellApi.checkEvent("qa_dialog_prison_hill_player"))
            {
               npcId = "player";
               dialogId = "tower";
            }
            else if(shellApi.checkEvent("qa_dialog_prison_hill_tex_listen_up") || shellApi.checkEvent("qa_dialog_prison_hill_tex"))
            {
               npcId = "tex";
               dialogId = "listen_up";
            }
            else if(shellApi.checkEvent("qa_dialog_prison_hill_p1_stop") || shellApi.checkEvent("qa_dialog_prison_hill_p1"))
            {
               npcId = "p1";
               dialogId = "stop";
            }
            else if(shellApi.checkEvent("qa_dialog_prison_hill_p2_stop") || shellApi.checkEvent("qa_dialog_prison_hill_p2"))
            {
               npcId = "p2";
               dialogId = "stop";
            }
            else if(shellApi.checkEvent("qa_dialog_prison_hill_bandit_odds") || shellApi.checkEvent("qa_dialog_prison_hill_bandit"))
            {
               npcId = "bandit";
               dialogId = "odds";
            }
         }
         if(npcId != "player" && npcId != "tex" && npcId != "bandit" && npcId != "sal" && npcId != "les" && npcId != "p1" && npcId != "p2" && npcId != "p3" && npcId != "p4" && npcId != "p5" && npcId != "p6")
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(2,1,Command.create(this.flashpointQaSayPrisonHillDialog,npcId,dialogId)));
      }
`;

  const sayDialogMethod = `      private function flashpointQaSayPrisonHillDialog(param1:String, param2:String = "") : void
      {
         var target:Entity = null;
         var dialog:Dialog = null;
         var dialogData:* = null;
         if(param1 == "player")
         {
            target = player;
         }
         else
         {
            target = getEntityById(param1);
         }
         if(param2 == "default")
         {
            param2 = "";
         }
         if(param2 == null || param2 == "")
         {
            if(param1 == "player")
            {
               param2 = "tower";
            }
            else if(param1 == "tex")
            {
               param2 = "listen_up";
            }
            else if(param1 == "bandit")
            {
               param2 = "odds";
            }
            else if(param1 == "sal" || param1 == "les")
            {
               param2 = "vamoose";
            }
            else
            {
               param2 = "stop";
            }
         }
         if(target != null)
         {
            dialog = target.get(Dialog) as Dialog;
            if(dialog != null)
            {
               dialog.allowOverwrite = true;
               dialogData = param2 != null && param2 != "" ? dialog.getDialog(param2) : null;
               if(dialogData != null)
               {
                  if(dialogData is DialogData)
                  {
                     DialogData(dialogData).timeOverride = 60;
                     DialogData(dialogData).forceOnScreen = true;
                  }
                  dialog.sayById(param2);
               }
               else
               {
                  CharUtils.sayDialog(target);
               }
            }
            else
            {
               CharUtils.sayDialog(target);
            }
         }
      }
`;

  const autoSceneAfterLoadMethod = `      private function flashpointQaAutoPrisonSceneAfterLoad() : void
      {
         var delayMs:Number = NaN;
         var delaySeconds:Number = 4;
         var targetScene:String = null;
         if(super.groupContainer != null && super.groupContainer.root != null && super.groupContainer.root.loaderInfo != null)
         {
            targetScene = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaAutoScene") as String;
            delayMs = Number(ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaAutoSceneDelayMs"));
         }
         if(targetScene == null || targetScene == "")
         {
            if(shellApi.checkEvent("qa_auto_scene_prison_yard"))
            {
               targetScene = "game.scenes.prison.yard.Yard";
            }
            else if(shellApi.checkEvent("qa_auto_scene_prison_cellBlock"))
            {
               targetScene = "game.scenes.prison.cellBlock.CellBlock";
            }
         }
         if(targetScene == null || targetScene == "" || targetScene == "game.scenes.prison.hill.Hill")
         {
            return;
         }
         if(targetScene.indexOf("game.scenes.prison.") != 0)
         {
            return;
         }
         if(!isNaN(delayMs) && delayMs > 0)
         {
            if(delayMs > 15000)
            {
               delayMs = 15000;
            }
            delaySeconds = Math.max(0.5,delayMs / 1000);
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(delaySeconds,1,Command.create(this.flashpointQaLoadPrisonScene,targetScene)));
      }
`;

  const autoSceneLoadMethod = `      private function flashpointQaLoadPrisonScene(param1:String) : void
      {
         var sceneClass:Class = null;
         if(param1 == null || param1 == "" || param1.indexOf("game.scenes.prison.") != 0)
         {
            return;
         }
         sceneClass = getDefinitionByName(param1) as Class;
         if(sceneClass != null)
         {
            this.shellApi.loadScene(sceneClass,1400,900,"right");
         }
      }
`;

  const loadedCallMarker = "         setupBandit();\n";
  const sayDialogCall = "         this.flashpointQaSayPrisonHillDialogAfterLoad();\n";
  const autoSceneCall = "         this.flashpointQaAutoPrisonSceneAfterLoad();\n";
  const loadedSayDialogBlock = `${loadedCallMarker}${sayDialogCall}`;
  const loadedCallBlock = `${loadedCallMarker}${sayDialogCall}${autoSceneCall}`;
  if (!next.includes(loadedCallBlock)) {
    if (!next.includes(loadedCallMarker)) {
      throw new Error("Unable to locate Prison Hill setupBandit marker.");
    }
    if (next.includes(loadedSayDialogBlock)) {
      next = next.replace(loadedSayDialogBlock, loadedCallBlock);
    } else {
      next = next.replace(loadedCallMarker, loadedCallBlock);
    }
  }

  if (!next.includes("override public function resize(param1:Number, param2:Number) : void")) {
    const marker = "\n      override protected function eventTriggered";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Prison Hill eventTriggered marker.");
    }
    const resizeMethod = `
      override public function resize(param1:Number, param2:Number) : void
      {
         super.resize(param1,param2);
         this.flashpointQaSayPrisonHillDialogAfterLoad();
         this.flashpointQaAutoPrisonSceneAfterLoad();
      }
`;
    next = next.replace(marker, `${resizeMethod}${marker}`);
  }

  if (!next.includes("private function flashpointQaSayPrisonHillDialogAfterLoad")) {
    const marker = "\n      override protected function eventTriggered";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate Prison Hill methods marker.");
    }
    const methods = `\n      \n${afterLoadMethod}      \n${sayDialogMethod}      \n${autoSceneAfterLoadMethod}      \n${autoSceneLoadMethod}`;
    next = next.replace(marker, `${methods}${marker}`);
  } else {
    next = replaceAs3Function(next, "      private function flashpointQaSayPrisonHillDialogAfterLoad() : void", afterLoadMethod);
    next = replaceAs3Function(next, '      private function flashpointQaSayPrisonHillDialog(param1:String, param2:String = "") : void', sayDialogMethod);
    if (!next.includes("private function flashpointQaAutoPrisonSceneAfterLoad")) {
      const marker = "\n      override protected function eventTriggered";
      if (!next.includes(marker)) {
        throw new Error("Unable to locate Prison Hill eventTriggered marker for QA auto scene methods.");
      }
      next = next.replace(marker, `\n      \n${autoSceneAfterLoadMethod}      \n${autoSceneLoadMethod}${marker}`);
    } else {
      next = replaceAs3Function(next, "      private function flashpointQaAutoPrisonSceneAfterLoad() : void", autoSceneAfterLoadMethod);
      next = replaceAs3Function(next, "      private function flashpointQaLoadPrisonScene(param1:String) : void", autoSceneLoadMethod);
    }
  }

  if (!next.includes('npcId != "player" && npcId != "tex" && npcId != "bandit" && npcId != "sal" && npcId != "les" && npcId != "p1"') || !next.includes("new TimedEvent(2,1,Command.create(this.flashpointQaSayPrisonHillDialog,npcId,dialogId))") || !next.includes("DialogData(dialogData).timeOverride = 60") || !next.includes("dialog.sayById(param2)") || !next.includes('ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId")') || !next.includes('shellApi.checkEvent("qa_dialog_prison_hill_tex_listen_up")') || !next.includes("this.flashpointQaSayPrisonHillDialogAfterLoad();") || !next.includes("this.flashpointQaAutoPrisonSceneAfterLoad();") || !next.includes('ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaAutoScene")') || !next.includes('shellApi.checkEvent("qa_auto_scene_prison_yard")') || !next.includes("getDefinitionByName(param1) as Class") || !next.includes('param1.indexOf("game.scenes.prison.") != 0')) {
    throw new Error("Prison Hill QA dialog patch did not apply cleanly.");
  }
  return next;
}

function patchGhdNeonWiener(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import flash.display.MovieClip;", "   import flash.external.ExternalInterface;");
  next = addImport(next, "   import flash.geom.Point;", "   import flash.utils.getDefinitionByName;");
  next = addImport(next, "   import game.util.CharUtils;", "   import game.util.Command;");
  next = addImport(next, "   import game.util.PerformanceUtils;", "   import game.util.ProxyUtils;");
  const fieldMarker = "      private var _humphreeFacingLeft:Boolean = false;\n";
  if (!next.includes("private var _flashpointQaGhdNeonDialogQueued:Boolean")) {
    if (!next.includes(fieldMarker)) {
      throw new Error("Unable to locate GHD NeonWiener field marker.");
    }
    next = next.replace(fieldMarker, `${fieldMarker}      private var _flashpointQaGhdNeonDialogQueued:Boolean = false;\n      private var _flashpointQaGhdNeonDialogSpoken:Boolean = false;\n      private var _flashpointQaGhdNeonDialogAttempts:int = 0;\n      private var _flashpointQaGhdAutoSceneQueued:Boolean = false;\n`);
  }
  if (!next.includes("private var _flashpointQaGhdNeonDialogSpoken:Boolean")) {
    next = next.replace("      private var _flashpointQaGhdNeonDialogQueued:Boolean = false;\n", "      private var _flashpointQaGhdNeonDialogQueued:Boolean = false;\n      private var _flashpointQaGhdNeonDialogSpoken:Boolean = false;\n      private var _flashpointQaGhdNeonDialogAttempts:int = 0;\n");
  }

  const paramMethod = `      private function flashpointQaGhdParam(param1:String) : String
      {
         var value:Object = null;
         var source:String = null;
         var queryIndex:int = 0;
         var pairs:Array = null;
         var entry:String = null;
         var equalsIndex:int = 0;
         if(super.groupContainer != null && super.groupContainer.root != null && super.groupContainer.root.loaderInfo != null)
         {
            value = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,param1);
            if(value != null && value != "" && value != "undefined")
            {
               return String(value);
            }
            if(super.groupContainer.root.loaderInfo.parameters != null && super.groupContainer.root.loaderInfo.parameters[param1] != null)
            {
               value = super.groupContainer.root.loaderInfo.parameters[param1];
               if(value != null && value != "" && value != "undefined")
               {
                  return String(value);
               }
            }
            source = super.groupContainer.root.loaderInfo.url || "";
            queryIndex = source.indexOf("?");
            if(queryIndex >= 0)
            {
               pairs = source.substr(queryIndex + 1).split("&");
               for each(entry in pairs)
               {
                  equalsIndex = entry.indexOf("=");
                  if(equalsIndex > 0 && entry.substr(0,equalsIndex) == param1)
                  {
                     return unescape(entry.substr(equalsIndex + 1));
                  }
               }
            }
         }
         if(ExternalInterface.available)
         {
            value = ExternalInterface.call("flashpointQaLocationHref");
            if(value != null && value != "" && value != "undefined")
            {
               source = String(value);
               queryIndex = source.indexOf("?");
               if(queryIndex >= 0)
               {
                  pairs = source.substr(queryIndex + 1).split("&");
                  for each(entry in pairs)
                  {
                     equalsIndex = entry.indexOf("=");
                     if(equalsIndex > 0 && entry.substr(0,equalsIndex) == param1)
                     {
                        return unescape(entry.substr(equalsIndex + 1));
                     }
                  }
               }
            }
         }
         return "";
      }
`;

  const afterLoadMethod = `      private function flashpointQaSayGhdNeonDialogAfterLoad() : void
      {
         var npcId:String = null;
         var dialogId:String = null;
         var seedEvents:String = null;
         if(this._flashpointQaGhdNeonDialogQueued)
         {
            return;
         }
         npcId = this.flashpointQaGhdParam("flashpointQaDialogNpc");
         dialogId = this.flashpointQaGhdParam("flashpointQaDialogId");
         seedEvents = this.flashpointQaGhdParam("flashpointSeedEvents");
         if(npcId == null || npcId == "")
         {
            if(seedEvents != null && seedEvents.indexOf("qa_dialog_ghd_neon_cosmoe_you_did_it") >= 0 || this.flashpointQaGhdProfileHasEvent("qa_dialog_ghd_neon_cosmoe_you_did_it") || shellApi.checkEvent("qa_dialog_ghd_neon_cosmoe_you_did_it","ghd") || shellApi.checkEvent("qa_dialog_ghd_neon_cosmoe","ghd"))
            {
               npcId = "cosmoe";
               dialogId = "you_did_it";
            }
            else if(seedEvents != null && seedEvents.indexOf("qa_dialog_ghd_neon_fred_help_find_them") >= 0 || this.flashpointQaGhdProfileHasEvent("qa_dialog_ghd_neon_fred_help_find_them") || shellApi.checkEvent("qa_dialog_ghd_neon_fred_help_find_them","ghd") || shellApi.checkEvent("qa_dialog_ghd_neon_fred","ghd"))
            {
               npcId = "fred";
               dialogId = "help_find_them";
            }
            else if(seedEvents != null && seedEvents.indexOf("qa_dialog_ghd_neon_humphree_warp_drive_busted") >= 0 || this.flashpointQaGhdProfileHasEvent("qa_dialog_ghd_neon_humphree_warp_drive_busted") || shellApi.checkEvent("qa_dialog_ghd_neon_humphree_warp_drive_busted","ghd") || shellApi.checkEvent("qa_dialog_ghd_neon_humphree","ghd"))
            {
               npcId = "humphree";
               dialogId = "warp_drive_busted";
            }
            else if(seedEvents != null && seedEvents.indexOf("qa_dialog_ghd_neon_dagger_worm_hole") >= 0 || this.flashpointQaGhdProfileHasEvent("qa_dialog_ghd_neon_dagger_worm_hole") || shellApi.checkEvent("qa_dialog_ghd_neon_dagger_worm_hole","ghd") || shellApi.checkEvent("qa_dialog_ghd_neon_dagger","ghd"))
            {
               npcId = "dagger";
               dialogId = "worm_hole";
            }
            else if(seedEvents != null && seedEvents.indexOf("qa_dialog_ghd_neon_player_worm_hole") >= 0 || this.flashpointQaGhdProfileHasEvent("qa_dialog_ghd_neon_player_worm_hole") || shellApi.checkEvent("qa_dialog_ghd_neon_player_worm_hole","ghd") || shellApi.checkEvent("qa_dialog_ghd_neon_player","ghd"))
            {
               npcId = "player";
               dialogId = "worm_hole";
            }
         }
         if(npcId != "player" && npcId != "cosmoe" && npcId != "fred" && npcId != "humphree" && npcId != "dagger")
         {
            return;
         }
         this._flashpointQaGhdNeonDialogQueued = true;
         this._flashpointQaGhdNeonDialogAttempts = 0;
         SceneUtil.addTimedEvent(this,new TimedEvent(1,12,Command.create(this.flashpointQaSayGhdNeonDialog,npcId,dialogId)));
      }
`;

  const profileEventMethod = `      private function flashpointQaGhdProfileHasEvent(param1:String) : Boolean
      {
         var events:* = null;
         if(shellApi == null || shellApi.currentProfile == null || shellApi.currentProfile.events == null)
         {
            return false;
         }
         events = shellApi.currentProfile.events["ghd"];
         return events != null && events.indexOf(param1) >= 0;
      }
`;

  const sayDialogMethod = `      private function flashpointQaSayGhdNeonDialog(param1:String, param2:String = "") : void
      {
         var target:Entity = null;
         var dialog:Dialog = null;
         var dialogData:* = null;
         if(this._flashpointQaGhdNeonDialogSpoken)
         {
            return;
         }
         this._flashpointQaGhdNeonDialogAttempts++;
         if(param1 == "player")
         {
            target = player;
         }
         else if(param1 == "cosmoe")
         {
            target = _cosmoe;
         }
         else if(param1 == "fred")
         {
            target = _fred;
         }
         else if(param1 == "humphree")
         {
            target = _humphree;
         }
         else if(param1 == "dagger")
         {
            target = _dagger;
         }
         else
         {
            target = getEntityById(param1);
         }
         if(param2 == "default")
         {
            param2 = "";
         }
         if(param2 == null || param2 == "")
         {
            if(param1 == "cosmoe")
            {
               param2 = "you_did_it";
            }
            else if(param1 == "fred")
            {
               param2 = "help_find_them";
            }
            else if(param1 == "humphree")
            {
               param2 = "warp_drive_busted";
            }
            else if(param1 == "dagger")
            {
               param2 = "worm_hole";
            }
            else
            {
               param2 = "worm_hole";
            }
         }
         if(target != null)
         {
            dialog = target.get(Dialog) as Dialog;
            if(dialog != null)
            {
               dialog.allowOverwrite = true;
               dialogData = param2 != null && param2 != "" ? dialog.getDialog(param2) : null;
               if(dialogData != null)
               {
                  if(dialogData is DialogData)
                  {
                     DialogData(dialogData).timeOverride = 60;
                     DialogData(dialogData).forceOnScreen = true;
                  }
                  dialog.setCurrentById(param2);
                  CharUtils.sayDialog(target);
                  this._flashpointQaGhdNeonDialogSpoken = true;
               }
               else if(this._flashpointQaGhdNeonDialogAttempts >= 12)
               {
                  CharUtils.sayDialog(target);
                  this._flashpointQaGhdNeonDialogSpoken = true;
               }
            }
            else if(this._flashpointQaGhdNeonDialogAttempts >= 12)
            {
               CharUtils.sayDialog(target);
               this._flashpointQaGhdNeonDialogSpoken = true;
            }
         }
      }
`;

  const autoSceneAfterLoadMethod = `      private function flashpointQaAutoGhdSceneAfterLoad() : void
      {
         var delayMs:Number = NaN;
         var delaySeconds:Number = 4;
         var targetScene:String = null;
         if(this._flashpointQaGhdAutoSceneQueued)
         {
            return;
         }
         targetScene = this.flashpointQaGhdParam("flashpointQaAutoScene");
         delayMs = Number(this.flashpointQaGhdParam("flashpointQaAutoSceneDelayMs"));
         if(targetScene == null || targetScene == "")
         {
            if(shellApi.checkEvent("qa_auto_scene_ghd_barren1"))
            {
               targetScene = "game.scenes.ghd.barren1.Barren1";
            }
            else if(shellApi.checkEvent("qa_auto_scene_ghd_spacePort"))
            {
               targetScene = "game.scenes.ghd.spacePort.SpacePort";
            }
         }
         if(targetScene == null || targetScene == "" || targetScene == "game.scenes.ghd.neonWiener.NeonWiener")
         {
            return;
         }
         if(targetScene.indexOf("game.scenes.ghd.") != 0)
         {
            return;
         }
         if(!isNaN(delayMs) && delayMs > 0)
         {
            if(delayMs > 15000)
            {
               delayMs = 15000;
            }
            delaySeconds = Math.max(0.5,delayMs / 1000);
         }
         this._flashpointQaGhdAutoSceneQueued = true;
         SceneUtil.addTimedEvent(this,new TimedEvent(delaySeconds,1,Command.create(this.flashpointQaLoadGhdScene,targetScene)));
      }
`;

  const autoSceneLoadMethod = `      private function flashpointQaLoadGhdScene(param1:String) : void
      {
         var sceneClass:Class = null;
         if(param1 == null || param1 == "" || param1.indexOf("game.scenes.ghd.") != 0)
         {
            return;
         }
         sceneClass = getDefinitionByName(param1) as Class;
         if(sceneClass != null)
         {
            this.shellApi.loadScene(sceneClass,1400,900,"right");
         }
      }
`;

  const loadedMarker = '         _sceneSound = AudioUtils.getAudio(this,"sceneSound");\n';
  const superLoadedMarker = "         super.loaded();\n";
  const sayDialogCall = "         this.flashpointQaSayGhdNeonDialogAfterLoad();\n";
  const autoSceneCall = "         this.flashpointQaAutoGhdSceneAfterLoad();\n";
  const loadedSayDialogBlock = `${loadedMarker}${sayDialogCall}`;
  const loadedCallBlock = `${loadedMarker}${sayDialogCall}${autoSceneCall}`;
  const preSuperCallBlock = `${sayDialogCall}${autoSceneCall}${superLoadedMarker}`;
  if (next.includes(preSuperCallBlock)) {
    next = next.replace(preSuperCallBlock, superLoadedMarker);
  }
  if (!next.includes(loadedCallBlock)) {
    if (!next.includes(loadedMarker)) {
      throw new Error("Unable to locate GHD NeonWiener scene sound marker.");
    }
    if (next.includes(loadedSayDialogBlock)) {
      next = next.replace(loadedSayDialogBlock, loadedCallBlock);
    } else {
      next = next.replace(loadedMarker, loadedCallBlock);
    }
  }

  if (!next.includes("override public function resize(param1:Number, param2:Number) : void")) {
    const marker = "\n      override protected function eventTriggers";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate GHD NeonWiener eventTriggers marker.");
    }
    const resizeMethod = `
      override public function resize(param1:Number, param2:Number) : void
      {
         super.resize(param1,param2);
         this.flashpointQaSayGhdNeonDialogAfterLoad();
         this.flashpointQaAutoGhdSceneAfterLoad();
      }
`;
    next = next.replace(marker, `${resizeMethod}${marker}`);
  }

  if (!next.includes("private function flashpointQaSayGhdNeonDialogAfterLoad")) {
    const marker = "\n      override protected function eventTriggers";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate GHD NeonWiener methods marker.");
    }
    const methods = `\n      \n${paramMethod}      \n${afterLoadMethod}      \n${profileEventMethod}      \n${sayDialogMethod}      \n${autoSceneAfterLoadMethod}      \n${autoSceneLoadMethod}`;
    next = next.replace(marker, `${methods}${marker}`);
  } else {
    if (!next.includes("private function flashpointQaGhdParam")) {
      const marker = "\n      private function flashpointQaSayGhdNeonDialogAfterLoad() : void";
      if (!next.includes(marker)) {
        throw new Error("Unable to locate GHD NeonWiener QA param insertion marker.");
      }
      next = next.replace(marker, `\n      \n${paramMethod}${marker}`);
    } else {
      next = replaceAs3Function(next, "      private function flashpointQaGhdParam(param1:String) : String", paramMethod);
    }
    next = replaceAs3Function(next, "      private function flashpointQaSayGhdNeonDialogAfterLoad() : void", afterLoadMethod);
    if (!next.includes("private function flashpointQaGhdProfileHasEvent")) {
      const marker = "\n      private function flashpointQaSayGhdNeonDialog";
      if (!next.includes(marker)) {
        throw new Error("Unable to locate GHD NeonWiener profile event insertion marker.");
      }
      next = next.replace(marker, `\n      \n${profileEventMethod}${marker}`);
    } else {
      next = replaceAs3Function(next, "      private function flashpointQaGhdProfileHasEvent(param1:String) : Boolean", profileEventMethod);
    }
    next = replaceAs3Function(next, '      private function flashpointQaSayGhdNeonDialog(param1:String, param2:String = "") : void', sayDialogMethod);
    if (!next.includes("private function flashpointQaAutoGhdSceneAfterLoad")) {
      const marker = "\n      override protected function eventTriggers";
      if (!next.includes(marker)) {
        throw new Error("Unable to locate GHD NeonWiener eventTriggers marker for QA auto scene methods.");
      }
      next = next.replace(marker, `\n      \n${autoSceneAfterLoadMethod}      \n${autoSceneLoadMethod}${marker}`);
    } else {
      next = replaceAs3Function(next, "      private function flashpointQaAutoGhdSceneAfterLoad() : void", autoSceneAfterLoadMethod);
      next = replaceAs3Function(next, "      private function flashpointQaLoadGhdScene(param1:String) : void", autoSceneLoadMethod);
    }
  }

  if (!next.includes("private var _flashpointQaGhdNeonDialogQueued:Boolean = false") || !next.includes("private var _flashpointQaGhdNeonDialogSpoken:Boolean = false") || !next.includes("private var _flashpointQaGhdNeonDialogAttempts:int = 0") || !next.includes("private var _flashpointQaGhdAutoSceneQueued:Boolean = false") || !next.includes("private function flashpointQaGhdParam(param1:String) : String") || !next.includes("private function flashpointQaGhdProfileHasEvent(param1:String) : Boolean") || !next.includes('shellApi.currentProfile.events["ghd"]') || !next.includes("super.groupContainer.root.loaderInfo.parameters[param1]") || !next.includes('ExternalInterface.call("flashpointQaLocationHref")') || !next.includes("return unescape(entry.substr(equalsIndex + 1))") || !next.includes("if(this._flashpointQaGhdNeonDialogQueued)") || !next.includes("if(this._flashpointQaGhdAutoSceneQueued)") || !next.includes('npcId != "player" && npcId != "cosmoe" && npcId != "fred" && npcId != "humphree" && npcId != "dagger"') || !next.includes("new TimedEvent(1,12,Command.create(this.flashpointQaSayGhdNeonDialog,npcId,dialogId))") || !next.includes("DialogData(dialogData).timeOverride = 60") || !next.includes("dialog.setCurrentById(param2)") || !next.includes("CharUtils.sayDialog(target)") || !next.includes('this.flashpointQaGhdParam("flashpointQaDialogId")') || !next.includes('this.flashpointQaGhdParam("flashpointSeedEvents")') || !next.includes('this.flashpointQaGhdProfileHasEvent("qa_dialog_ghd_neon_player_worm_hole")') || !next.includes('shellApi.checkEvent("qa_dialog_ghd_neon_fred_help_find_them","ghd")') || !next.includes("this._flashpointQaGhdNeonDialogSpoken = true") || !next.includes("this.flashpointQaSayGhdNeonDialogAfterLoad();") || !next.includes("this.flashpointQaAutoGhdSceneAfterLoad();") || !next.includes('this.flashpointQaGhdParam("flashpointQaAutoScene")') || !next.includes('shellApi.checkEvent("qa_auto_scene_ghd_barren1")') || !next.includes("getDefinitionByName(param1) as Class") || !next.includes('param1.indexOf("game.scenes.ghd.") != 0')) {
    throw new Error("GHD NeonWiener QA dialog patch did not apply cleanly.");
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

  const workDir = path.join(paths.tempDir, "as3-monster-qa-dialog-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");

  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    PATCH_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Monster Carnival MainStreet class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    WORDBALLOON_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export WordBalloonCreator class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    POPTOPICON_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Poptropicon Parking class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    POPTOPICON_SHARED_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Poptropicon shared scene class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    POPTOPICON_CENTER_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Poptropicon Center class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    POPTOPICON_ADSTREET3_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Poptropicon AdStreet3 class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    POPTOPICON_ADMIXED_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Poptropicon AdMixed class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    TIMMY_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Timmy MainStreet class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    MISSION_SHIP_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Mission Atlantis Ship class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    FTUE_MAINLAND_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Monkey Wrench MainLand class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    SURVIVAL4_MAINHALL_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Survival4 MainHall class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    ARAB1_BAZAAR_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Arabian Bazaar class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    PRISON_HILL_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Prison Hill class");
  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    GHD_NEON_WIENER_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Galactic Hot Dogs Neon Wiener class");

  const scriptPath = findScript(scriptRoot, "game/scenes/carnival/mainStreet/MainStreet.as");
  if (!scriptPath) {
    throw new Error("Exported MainStreet.as was not found.");
  }
  const wordBalloonScriptPath = findScript(scriptRoot, "game/creators/ui/WordBalloonCreator.as");
  if (!wordBalloonScriptPath) {
    throw new Error("Exported WordBalloonCreator.as was not found.");
  }
  const poptropiconScriptPath = findScript(scriptRoot, "game/scenes/con1/parking/Parking.as");
  if (!poptropiconScriptPath) {
    throw new Error("Exported Parking.as was not found.");
  }
  const poptropiconSharedScriptPath = findScript(scriptRoot, "game/scenes/con1/shared/Poptropicon1Scene.as");
  if (!poptropiconSharedScriptPath) {
    throw new Error("Exported Poptropicon1Scene.as was not found.");
  }
  const poptropiconCenterScriptPath = findScript(scriptRoot, "game/scenes/con1/center/Center.as");
  if (!poptropiconCenterScriptPath) {
    throw new Error("Exported Poptropicon Center.as was not found.");
  }
  const poptropiconAdStreet3ScriptPath = findScript(scriptRoot, "game/scenes/con1/adStreet3/AdStreet3.as");
  if (!poptropiconAdStreet3ScriptPath) {
    throw new Error("Exported Poptropicon AdStreet3.as was not found.");
  }
  const poptropiconAdMixedScriptPath = findScript(scriptRoot, "game/scenes/con1/adMixed/AdMixed.as");
  if (!poptropiconAdMixedScriptPath) {
    throw new Error("Exported Poptropicon AdMixed.as was not found.");
  }
  const timmyScriptPath = findScript(scriptRoot, "game/scenes/timmy/mainStreet/MainStreet.as");
  if (!timmyScriptPath) {
    throw new Error("Exported Timmy MainStreet.as was not found.");
  }
  const missionShipScriptPath = findScript(scriptRoot, "game/scenes/deepDive1/ship/Ship.as");
  if (!missionShipScriptPath) {
    throw new Error("Exported Mission Atlantis Ship.as was not found.");
  }
  const ftueMainLandScriptPath = findScript(scriptRoot, "game/scenes/ftue/mainLand/MainLand.as");
  if (!ftueMainLandScriptPath) {
    throw new Error("Exported Monkey Wrench MainLand.as was not found.");
  }
  const survival4MainHallScriptPath = findScript(scriptRoot, "game/scenes/survival4/mainHall/MainHall.as");
  if (!survival4MainHallScriptPath) {
    throw new Error("Exported Survival4 MainHall.as was not found.");
  }
  const arab1BazaarScriptPath = findScript(scriptRoot, "game/scenes/arab1/bazaar/Bazaar.as");
  if (!arab1BazaarScriptPath) {
    throw new Error("Exported Arabian Bazaar.as was not found.");
  }
  const prisonHillScriptPath = findScript(scriptRoot, "game/scenes/prison/hill/Hill.as");
  if (!prisonHillScriptPath) {
    throw new Error("Exported Prison Hill.as was not found.");
  }
  const ghdNeonWienerScriptPath = findScript(scriptRoot, "game/scenes/ghd/neonWiener/NeonWiener.as");
  if (!ghdNeonWienerScriptPath) {
    throw new Error("Exported Galactic Hot Dogs NeonWiener.as was not found.");
  }
  writeText(scriptPath, patchMainStreet(fs.readFileSync(scriptPath, "utf8")));
  writeText(wordBalloonScriptPath, patchWordBalloonCreator(fs.readFileSync(wordBalloonScriptPath, "utf8")));
  writeText(poptropiconScriptPath, patchPoptropiconParking(fs.readFileSync(poptropiconScriptPath, "utf8")));
  writeText(poptropiconSharedScriptPath, patchPoptropiconShared(fs.readFileSync(poptropiconSharedScriptPath, "utf8")));
  writeText(poptropiconCenterScriptPath, patchPoptropiconCenter(fs.readFileSync(poptropiconCenterScriptPath, "utf8")));
  writeText(poptropiconAdStreet3ScriptPath, patchPoptropiconAdScene(fs.readFileSync(poptropiconAdStreet3ScriptPath, "utf8"), "AdStreet3"));
  writeText(poptropiconAdMixedScriptPath, patchPoptropiconAdScene(fs.readFileSync(poptropiconAdMixedScriptPath, "utf8"), "AdMixed"));
  writeText(timmyScriptPath, patchTimmyMainStreet(fs.readFileSync(timmyScriptPath, "utf8")));
  writeText(missionShipScriptPath, patchMissionAtlantisShip(fs.readFileSync(missionShipScriptPath, "utf8")));
  writeText(ftueMainLandScriptPath, patchFtueMainLand(fs.readFileSync(ftueMainLandScriptPath, "utf8")));
  writeText(survival4MainHallScriptPath, patchSurvival4MainHall(fs.readFileSync(survival4MainHallScriptPath, "utf8")));
  writeText(arab1BazaarScriptPath, patchArab1Bazaar(fs.readFileSync(arab1BazaarScriptPath, "utf8")));
  writeText(prisonHillScriptPath, patchPrisonHill(fs.readFileSync(prisonHillScriptPath, "utf8")));
  writeText(ghdNeonWienerScriptPath, patchGhdNeonWiener(fs.readFileSync(ghdNeonWienerScriptPath, "utf8")));

  const mainStreetSwf = path.join(workDir, "Shell-monster-qa-dialog-mainStreet.swf");
  runFfdec(ffdecCli, [
    "-replace",
    packShell,
    mainStreetSwf,
    PATCH_CLASS,
    scriptPath
  ], "replace Monster Carnival MainStreet class");
  const wordBalloonSwf = path.join(workDir, "Shell-monster-qa-dialog-wordBalloon.swf");
  runFfdec(ffdecCli, [
    "-replace",
    mainStreetSwf,
    wordBalloonSwf,
    WORDBALLOON_CLASS,
    wordBalloonScriptPath
  ], "replace WordBalloonCreator class");
  const poptropiconSwf = path.join(workDir, "Shell-monster-qa-dialog-poptropicon.swf");
  runFfdec(ffdecCli, [
    "-replace",
    wordBalloonSwf,
    poptropiconSwf,
    POPTOPICON_CLASS,
    poptropiconScriptPath
  ], "replace Poptropicon Parking class");
  const poptropiconSharedSwf = path.join(workDir, "Shell-monster-qa-dialog-poptropicon-shared.swf");
  runFfdec(ffdecCli, [
    "-replace",
    poptropiconSwf,
    poptropiconSharedSwf,
    POPTOPICON_SHARED_CLASS,
    poptropiconSharedScriptPath
  ], "replace Poptropicon shared scene class");
  const poptropiconCenterSwf = path.join(workDir, "Shell-monster-qa-dialog-poptropicon-center.swf");
  runFfdec(ffdecCli, [
    "-replace",
    poptropiconSharedSwf,
    poptropiconCenterSwf,
    POPTOPICON_CENTER_CLASS,
    poptropiconCenterScriptPath
  ], "replace Poptropicon Center class");
  const poptropiconAdStreet3Swf = path.join(workDir, "Shell-monster-qa-dialog-poptropicon-adstreet3.swf");
  runFfdec(ffdecCli, [
    "-replace",
    poptropiconCenterSwf,
    poptropiconAdStreet3Swf,
    POPTOPICON_ADSTREET3_CLASS,
    poptropiconAdStreet3ScriptPath
  ], "replace Poptropicon AdStreet3 class");
  const poptropiconAdMixedSwf = path.join(workDir, "Shell-monster-qa-dialog-poptropicon-admixed.swf");
  runFfdec(ffdecCli, [
    "-replace",
    poptropiconAdStreet3Swf,
    poptropiconAdMixedSwf,
    POPTOPICON_ADMIXED_CLASS,
    poptropiconAdMixedScriptPath
  ], "replace Poptropicon AdMixed class");
  const timmySwf = path.join(workDir, "Shell-monster-qa-dialog-timmy.swf");
  runFfdec(ffdecCli, [
    "-replace",
    poptropiconAdMixedSwf,
    timmySwf,
    TIMMY_CLASS,
    timmyScriptPath
  ], "replace Timmy MainStreet class");
  const missionShipSwf = path.join(workDir, "Shell-monster-qa-dialog-mission.swf");
  runFfdec(ffdecCli, [
    "-replace",
    timmySwf,
    missionShipSwf,
    MISSION_SHIP_CLASS,
    missionShipScriptPath
  ], "replace Mission Atlantis Ship class");
  const ftueSwf = path.join(workDir, "Shell-monster-qa-dialog-ftue.swf");
  runFfdec(ffdecCli, [
    "-replace",
    missionShipSwf,
    ftueSwf,
    FTUE_MAINLAND_CLASS,
    ftueMainLandScriptPath
  ], "replace Monkey Wrench MainLand class");
  const arab1BazaarSwf = path.join(workDir, "Shell-monster-qa-dialog-arab1-bazaar.swf");
  runFfdec(ffdecCli, [
    "-replace",
    ftueSwf,
    arab1BazaarSwf,
    SURVIVAL4_MAINHALL_CLASS,
    survival4MainHallScriptPath
  ], "replace Survival4 MainHall class");
  const prisonHillSwf = path.join(workDir, "Shell-monster-qa-dialog-prison-hill.swf");
  runFfdec(ffdecCli, [
    "-replace",
    arab1BazaarSwf,
    prisonHillSwf,
    ARAB1_BAZAAR_CLASS,
    arab1BazaarScriptPath
  ], "replace Arabian Bazaar class");
  const outputSwf = path.join(workDir, "Shell-monster-qa-dialog.swf");
  const ghdNeonWienerSwf = path.join(workDir, "Shell-monster-qa-dialog-ghd-neon-wiener.swf");
  runFfdec(ffdecCli, [
    "-replace",
    prisonHillSwf,
    ghdNeonWienerSwf,
    PRISON_HILL_CLASS,
    prisonHillScriptPath
  ], "replace Prison Hill class");
  runFfdec(ffdecCli, [
    "-replace",
    ghdNeonWienerSwf,
    outputSwf,
    GHD_NEON_WIENER_CLASS,
    ghdNeonWienerScriptPath
  ], "replace Galactic Hot Dogs Neon Wiener class");
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
  manifest.swfPatchedAssets = (Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [])
    .filter((entry) => entry?.assetId !== PATCH_ASSET_ID);
  manifest.swfPatchedAssets.push({
    assetId: PATCH_ASSET_ID,
    assetPath: AS3_SHELL_PATH,
    outputPath: packShell,
    classes: [PATCH_CLASS, WORDBALLOON_CLASS, POPTOPICON_CLASS, POPTOPICON_SHARED_CLASS, POPTOPICON_CENTER_CLASS, POPTOPICON_ADSTREET3_CLASS, POPTOPICON_ADMIXED_CLASS, TIMMY_CLASS, MISSION_SHIP_CLASS, FTUE_MAINLAND_CLASS, SURVIVAL4_MAINHALL_CLASS, ARAB1_BAZAAR_CLASS, PRISON_HILL_CLASS, GHD_NEON_WIENER_CLASS]
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
    patchedScript: {
      className: PATCH_CLASS,
      scriptPath,
      wordBalloonClassName: WORDBALLOON_CLASS,
      wordBalloonScriptPath,
      poptropiconClassName: POPTOPICON_CLASS,
      poptropiconScriptPath,
      poptropiconSharedClassName: POPTOPICON_SHARED_CLASS,
      poptropiconSharedScriptPath,
      poptropiconCenterClassName: POPTOPICON_CENTER_CLASS,
      poptropiconCenterScriptPath,
      poptropiconAdStreet3ClassName: POPTOPICON_ADSTREET3_CLASS,
      poptropiconAdStreet3ScriptPath,
      poptropiconAdMixedClassName: POPTOPICON_ADMIXED_CLASS,
      poptropiconAdMixedScriptPath,
      timmyClassName: TIMMY_CLASS,
      timmyScriptPath,
      missionShipClassName: MISSION_SHIP_CLASS,
      missionShipScriptPath,
      ftueMainLandClassName: FTUE_MAINLAND_CLASS,
      ftueMainLandScriptPath,
      survival4MainHallClassName: SURVIVAL4_MAINHALL_CLASS,
      survival4MainHallScriptPath,
      arab1BazaarClassName: ARAB1_BAZAAR_CLASS,
      arab1BazaarScriptPath,
      prisonHillClassName: PRISON_HILL_CLASS,
      prisonHillScriptPath,
      ghdNeonWienerClassName: GHD_NEON_WIENER_CLASS,
      ghdNeonWienerScriptPath
    },
    patch: "QA-only Monster Carnival, Poptropicon, Timmy, Mission Atlantis, Monkey Wrench, Survival, Arabian Nights, Escape from Pelican Rock, and Galactic Hot Dogs native NPC dialog triggers plus scoped Poptropicon con1 sample-island motion bounds, Poptropicon ad-transition room bounds coverage, and native Poptropicon intro popup translation"
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-monster-qa-dialog-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
