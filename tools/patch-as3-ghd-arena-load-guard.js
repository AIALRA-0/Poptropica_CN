const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const PATCH_CLASS = "game.scenes.ghd.arena.Arena";
const PATCH_ASSET_ID = "as3-ghd-arena-load-guard";

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

function replaceAs3Function(source, signature, replacement) {
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(`Unable to locate function: ${signature}`);
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
  throw new Error(`Unable to find end of function body for: ${signature}`);
}

function patchArena(content) {
  let source = String(content || "").replace(/\r\n/gu, "\n");
  if (!source.includes("import game.scene.template.CharacterDialogGroup;")) {
    source = source.replace(
      "   import game.scene.template.CharacterGroup;\n",
      "   import game.scene.template.CharacterGroup;\n   import game.scene.template.CharacterDialogGroup;\n"
    );
  }
  if (!source.includes("private var _flashpointArenaCharactersReady:Boolean = false;")) {
    source = source.replace(
      "      private var spatula:Entity;\n",
      "      private var spatula:Entity;\n      private var _flashpointArenaCharactersReady:Boolean = false;\n"
    );
  }
  const guardedAddCharacters = `      override protected function addCharacters() : void
      {
         super.addCharacters();
         _characterGroup = super.getGroupById("characterGroup") as CharacterGroup;
         _characterGroup.preloadAnimations(new <Class>[Crowbar],this);
         _animationLoader = super.getSystem(AnimationLoaderSystem) as AnimationLoaderSystem;
         SceneUtil.addTimedEvent(this,new TimedEvent(14,1,flashpointArenaForceCharactersLoaded),"arenaCharacterLoadFallback");
      }
`;
  const guardedAllCharactersLoaded = `      override protected function allCharactersLoaded() : void
      {
         if(_flashpointArenaCharactersReady)
         {
            return;
         }
         _flashpointArenaCharactersReady = true;
         super.allCharactersLoaded();
      }

      private function flashpointArenaForceCharactersLoaded() : void
      {
         allCharactersLoaded();
      }
`;
  const guardedLoaded = `      override public function loaded() : void
      {
         addSystem(new TimelineVariableSystem());
         switchInSpoon();
         super.loaded();
         setupRadio();
         var dialogGroup:CharacterDialogGroup = getGroupById("characterDialogGroup") as CharacterDialogGroup;
         if(radio != null && dialogGroup != null)
         {
            dialogGroup.assignDialog(radio,"radio");
         }
         shellApi.eventTriggered.add(handleEventTriggered);
         charGroup = getGroupById("characterGroup") as CharacterGroup;
         setupNpcs();
         setupNukeCart();
         correctAlienDialogPositioning();
         runQueenDialog();
      }
`;
  const guardedSwitchInSpoon = `      private function switchInSpoon() : void
      {
         var number:int = 0;
         if(_animationLoader == null || _animationLoader.animationLibrary == null)
         {
            return;
         }
         var crowbarAnimation:Crowbar = _animationLoader.animationLibrary.getAnimation(Crowbar) as Crowbar;
         if(crowbarAnimation == null || crowbarAnimation.data == null || crowbarAnimation.data.frames == null || crowbarAnimation.data.frames.length == 0 || crowbarAnimation.data.frames[0] == null || crowbarAnimation.data.frames[0].events == null)
         {
            return;
         }
         while(crowbarAnimation.data.frames[0].events.length > 0)
         {
            crowbarAnimation.data.frames[0].events.pop();
         }
         var frameEvents:Vector.<FrameEvent> = new <FrameEvent>[new FrameEvent("setPart","eyeState","casual")];
         for(number = 0; number < frameEvents.length; )
         {
            crowbarAnimation.data.frames[0].events.push(frameEvents[number]);
            number++;
         }
      }
`;
  const guardedRunIdle = `      private function runIdle(junk:*, char:Entity) : void
      {
         if(char == null || char.get(Timeline) == null)
         {
            return;
         }
         var timeline:Timeline = char.get(Timeline);
         timeline.gotoAndPlay("idle");
      }
`;
  const guardedRunTalk = `      private function runTalk(junk:*, char:Entity) : void
      {
         if(char == null || char.get(Timeline) == null)
         {
            return;
         }
         var timeline:Timeline = char.get(Timeline);
         timeline.gotoAndPlay("talk");
      }
`;
  const guardedFloatingStands = `      private function setupFloatingStands() : void
      {
         var stand:Entity = null;
         var plat:Entity = null;
         var clip:MovieClip = null;
         var i:int = 0;
         var rateOffset:Number = 0;
         for(i = 0; i < 4; )
         {
            rateOffset = 0.04 + i / 100;
            clip = _hitContainer["stand" + i];
            plat = getEntityById("stand" + i + "Plat");
            if(clip == null || plat == null || plat.get(Display) == null)
            {
               i++;
               continue;
            }
            if(PerformanceUtils.qualityLevel < 60)
            {
               BitmapUtils.convertContainer(clip,PerformanceUtils.defaultBitmapQuality);
            }
            stand = EntityUtils.createMovingEntity(this,clip,_hitContainer);
            if(stand == null || stand.get(SpatialAddition) == null)
            {
               i++;
               continue;
            }
            MotionUtils.addWaveMotion(stand,new WaveMotionData("y",6,rateOffset,"cos"),this);
            plat.get(Display).visible = false;
            plat.add(stand.get(SpatialAddition));
            if(i == 0)
            {
               insertAlienNpc(stand,"cook0");
            }
            else if(i == 1)
            {
               insertAlienNpc(stand,"chef");
               floatSpatula(stand);
            }
            else if(i == 2)
            {
               insertAlienNpc(stand,"cook1");
            }
            else if(i == 3)
            {
               insertAlienNpc(stand,"cook2");
            }
            i++;
         }
      }
`;
  const guardedFloatSpatula = `      private function floatSpatula(stand:Entity) : void
      {
         var prox:Proximity = null;
         if(stand == null || stand.get(SpatialAddition) == null || _hitContainer["giant_spatula"] == null)
         {
            return;
         }
         spatula = EntityUtils.createMovingEntity(this,_hitContainer["giant_spatula"],_hitContainer);
         if(spatula == null)
         {
            return;
         }
         if(PerformanceUtils.qualityLevel < 60)
         {
            BitmapUtils.convertContainer(EntityUtils.getDisplayObject(spatula),PerformanceUtils.defaultBitmapQuality);
         }
         if(shellApi.checkHasItem("giant_spatula"))
         {
            removeEntity(spatula);
         }
         else
         {
            super.addSystem(new ProximitySystem());
            ToolTipCreator.addToEntity(spatula);
            spatula.add(stand.get(SpatialAddition));
            prox = new Proximity(160,player.get(Spatial));
            prox.entered.addOnce(getSpatula);
            spatula.add(prox);
         }
      }
`;
  const guardedInsertAlienNpc = `      private function insertAlienNpc(stand:Entity, charID:String) : void
      {
         var char:Entity = null;
         if(stand == null || stand.get(SpatialAddition) == null || _hitContainer[charID] == null)
         {
            return;
         }
         var clip:MovieClip = _hitContainer[charID];
         if(PerformanceUtils.qualityLevel < 60)
         {
            char = BitmapTimelineCreator.convertToBitmapTimeline(char,clip,true,null,PerformanceUtils.defaultBitmapQuality,28);
            addEntity(char);
         }
         else
         {
            char = EntityUtils.createMovingTimelineEntity(this,clip,null,false,28);
         }
         if(char == null)
         {
            return;
         }
         var dialog:Dialog = new Dialog();
         dialog.faceSpeaker = false;
         dialog.dialogPositionPercents = new Point(0.1,2);
         dialog.start.add(Command.create(runTalk,char));
         dialog.complete.add(Command.create(runIdle,char));
         runIdle(null,char);
         char.add(dialog);
         char.add(new Id(charID));
         char.add(new Edge(50,50,50,50));
         var character:Character = new Character();
         character.costumizable = false;
         char.add(character);
         InteractionCreator.addToEntity(char,["click"]);
         var sceneInteraction:SceneInteraction = new SceneInteraction();
         sceneInteraction.offsetX = -100;
         sceneInteraction.offsetY = 200;
         ToolTipCreator.addToEntity(char);
         char.add(sceneInteraction);
         char.add(stand.get(SpatialAddition));
         if(charID == "chef")
         {
            chef = char;
         }
      }
`;
  const guardedSetupRadio = `      private function setupRadio() : void
      {
         var clip:MovieClip = _hitContainer["radio"];
         if(clip == null)
         {
            return;
         }
         if(PerformanceUtils.qualityLevel < 60)
         {
            radio = BitmapTimelineCreator.convertToBitmapTimeline(radio,clip,true,null,PerformanceUtils.defaultBitmapQuality);
            addEntity(radio);
         }
         else
         {
            radio = EntityUtils.createMovingTimelineEntity(this,clip);
         }
         if(radio == null)
         {
            return;
         }
         var dialog:Dialog = new Dialog();
         dialog.faceSpeaker = false;
         dialog.dialogPositionPercents = new Point(-1,6.2);
         dialog.start.add(Command.create(runTalk,radio));
         dialog.complete.add(Command.create(runIdle,radio));
         dialog.balloonPath = "ui/elements/wordBalloon.swf";
         radio.add(dialog);
         radio.add(new Id("radio"));
         radio.add(new Edge(50,50,50,50));
         var character:Character = new Character();
         character.costumizable = false;
         radio.add(character);
         InteractionCreator.addToEntity(radio,["click"]);
         var sceneInteraction:SceneInteraction = new SceneInteraction();
         sceneInteraction.autoSwitchOffsets = false;
         sceneInteraction.offsetDirection = true;
         sceneInteraction.offsetX = 5;
         sceneInteraction.offsetY = 180;
         ToolTipCreator.addToEntity(radio,"click",null,new Point(35,0));
         sceneInteraction.reached.removeAll();
         sceneInteraction.reached.add(useRadio);
         radio.add(sceneInteraction);
         radioTimer = SceneUtil.addTimedEvent(this,new TimedEvent(8,1,Command.create(startRadioDialog,dialog)),"radioTimer");
      }
`;
  const restoredAddCharacterDialog = `      override protected function addCharacterDialog(container:Sprite) : void
      {
         setupFloatingStands();
         super.addCharacterDialog(container);
      }
`;
  let next = replaceAs3Function(source, "      override protected function addCharacters() : void", guardedAddCharacters);
  next = replaceAs3Function(next, "      override public function loaded() : void", `${guardedAllCharactersLoaded}      override public function loaded() : void${guardedLoaded.slice("      override public function loaded() : void".length)}`);
  next = replaceAs3Function(next, "      override protected function addCharacterDialog(container:Sprite) : void", restoredAddCharacterDialog);
  next = replaceAs3Function(next, "      private function switchInSpoon() : void", guardedSwitchInSpoon);
  next = replaceAs3Function(next, "      private function runIdle(junk:*, char:Entity) : void", guardedRunIdle);
  next = replaceAs3Function(next, "      private function runTalk(junk:*, char:Entity) : void", guardedRunTalk);
  next = replaceAs3Function(next, "      private function setupFloatingStands() : void", guardedFloatingStands);
  next = replaceAs3Function(next, "      private function floatSpatula(stand:Entity) : void", guardedFloatSpatula);
  next = replaceAs3Function(next, "      private function insertAlienNpc(stand:Entity, charID:String) : void", guardedInsertAlienNpc);
  next = replaceAs3Function(next, "      private function setupRadio() : void", guardedSetupRadio);
  const requiredFragments = [
    "import game.scene.template.CharacterDialogGroup;",
    "private var _flashpointArenaCharactersReady:Boolean = false;",
    "flashpointArenaForceCharactersLoaded",
    'dialogGroup.assignDialog(radio,"radio")',
    "setupFloatingStands();",
    'dialog.balloonPath = "ui/elements/wordBalloon.swf"',
    'var clip:MovieClip = _hitContainer["radio"]',
    "if(_animationLoader == null || _animationLoader.animationLibrary == null)",
    "crowbarAnimation.data.frames[0].events == null",
    'clip = _hitContainer["stand" + i]',
    "if(stand == null || stand.get(SpatialAddition) == null || _hitContainer[charID] == null)"
  ];
  const missingFragments = requiredFragments.filter((fragment) => !next.includes(fragment));
  if (missingFragments.length > 0) {
    throw new Error(`Arena loading guard did not apply cleanly. Missing fragments: ${missingFragments.join(" | ")}`);
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

  const workDir = path.join(paths.tempDir, "as3-ghd-arena-load-guard-patch");
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
  ], "export GHD Arena class");

  const scriptPath = findScript(scriptRoot, "game/scenes/ghd/arena/Arena.as");
  if (!scriptPath) {
    throw new Error("Exported Arena.as was not found.");
  }
  writeText(scriptPath, patchArena(fs.readFileSync(scriptPath, "utf8")));

  const outputSwf = path.join(workDir, "Shell-ghd-arena-load-guard.swf");
  runFfdec(ffdecCli, [
    "-replace",
    packShell,
    outputSwf,
    PATCH_CLASS,
    scriptPath
  ], "replace GHD Arena class");
  fs.copyFileSync(outputSwf, packShell);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    packShell,
    patchedClass: PATCH_CLASS,
    patchedScriptPath: scriptPath,
    patchAssetId: PATCH_ASSET_ID,
    patch: "Guard GHD Arena setup helpers and use the stable default word balloon for radio dialogue while preserving radio, floating stands, and spatula gameplay."
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-ghd-arena-load-guard-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
