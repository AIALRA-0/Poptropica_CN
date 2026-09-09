const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const PATCH_ASSET_ID = "as3-ghd-rescue-dialog-proof";

const PATCHES = [
  {
    className: "game.scenes.ghd.barren2.Barren2",
    scriptSuffix: "game/scenes/ghd/barren2/Barren2.as",
    outputName: "Shell-ghd-barren2-dialog-proof.swf",
    patch: patchBarren2
  },
  {
    className: "game.scenes.ghd.mushroom2.Mushroom2",
    scriptSuffix: "game/scenes/ghd/mushroom2/Mushroom2.as",
    outputName: "Shell-ghd-mushroom2-dialog-proof.swf",
    patch: patchMushroom2
  },
  {
    className: "game.scenes.ghd.prehistoric2.Prehistoric2",
    scriptSuffix: "game/scenes/ghd/prehistoric2/Prehistoric2.as",
    outputName: "Shell-ghd-prehistoric2-dialog-proof.swf",
    patch: patchPrehistoric2
  },
  {
    className: "game.scenes.ghd.ghostShip.GhostShip",
    scriptSuffix: "game/scenes/ghd/ghostShip/GhostShip.as",
    outputName: "Shell-ghd-ghostship-dialog-proof.swf",
    patch: patchGhostShip
  }
];

function runFfdec(ffdecCli, args, label) {
  const result = spawnSync(ffdecCli, args, {
    cwd: paths.projectRoot,
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

function insertBefore(source, marker, content) {
  if (!source.includes(marker)) {
    throw new Error(`Unable to locate insertion marker: ${marker}`);
  }
  return source.replace(marker, `${content}${marker}`);
}

function requireFragments(source, fragments, label) {
  const missing = fragments.filter((fragment) => !source.includes(fragment));
  if (missing.length) {
    throw new Error(`${label} patch did not apply cleanly. Missing: ${missing.join(" | ")}`);
  }
}

function requireAnyFragment(source, fragments, label) {
  if (!fragments.some((fragment) => source.includes(fragment))) {
    throw new Error(`${label} patch did not apply cleanly. Missing one of: ${fragments.join(" | ")}`);
  }
}

function patchBarren2(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import game.creators.scene.HitCreator;", "   import game.data.TimedEvent;");
  next = addImport(next, "   import game.data.profile.ProfileData;", "   import game.data.scene.characterDialog.DialogData;");

  const call = "         this.flashpointQaSayBarren2DialogAfterLoad();\n";
  if (!next.includes(call)) {
    next = next.replace("         setupDoors();\n", `         setupDoors();\n${call}`);
  }

  const methods = `
      private function flashpointQaSayBarren2DialogAfterLoad() : void
      {
         var dialogId:String = null;
         if(shellApi.checkEvent("qa_dialog_ghd_barren2_dagger_escaped","ghd") || shellApi.checkEvent("qa_dialog_ghd_barren2_dagger_escaped"))
         {
            dialogId = "escaped";
         }
         else if(shellApi.checkEvent("qa_dialog_ghd_barren2_dagger_trapped","ghd") || shellApi.checkEvent("qa_dialog_ghd_barren2_dagger","ghd") || shellApi.checkEvent("qa_dialog_ghd_barren2_dagger_trapped") || shellApi.checkEvent("qa_dialog_ghd_barren2_dagger"))
         {
            dialogId = "trapped";
         }
         if(dialogId == null)
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(2,1,Command.create(this.flashpointQaSayBarren2Dialog,dialogId)));
      }

      private function flashpointQaSayBarren2Dialog(param1:String) : void
      {
         var dialog:Dialog = null;
         var dialogData:Object = null;
         if(dagger == null || !dagger.has(Dialog))
         {
            return;
         }
         SceneUtil.setCameraTarget(this,dagger);
         dialog = dagger.get(Dialog);
         dialog.allowOverwrite = true;
         dialogData = dialog.getDialog(param1);
         if(dialogData is DialogData)
         {
            DialogData(dialogData).timeOverride = 60;
            DialogData(dialogData).forceOnScreen = true;
         }
         dialog.sayById(param1);
      }
`;

  if (!next.includes("private function flashpointQaSayBarren2DialogAfterLoad")) {
    next = insertBefore(next, "\n      private function setupDoors() : void", methods);
  }

  requireFragments(next, [
    "import game.data.TimedEvent;",
    "import game.data.scene.characterDialog.DialogData;",
    "this.flashpointQaSayBarren2DialogAfterLoad();",
    'shellApi.checkEvent("qa_dialog_ghd_barren2_dagger_trapped","ghd")',
    "new TimedEvent(2,1,Command.create(this.flashpointQaSayBarren2Dialog,dialogId))",
    "dialog.sayById(param1)"
  ], "Barren2");
  requireAnyFragment(next, ["DialogData(dialogData).timeOverride = 60", "dialogData.timeOverride = 60"], "Barren2");
  requireAnyFragment(next, ["DialogData(dialogData).forceOnScreen = true", "dialogData.forceOnScreen = true"], "Barren2");
  return next;
}

function patchMushroom2(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import engine.components.Id;", "   import engine.util.Command;");
  next = addImport(next, "   import game.creators.entity.BitmapTimelineCreator;", "   import game.data.TimedEvent;");

  const call = "         this.flashpointQaSayMushroom2DialogAfterLoad();\n";
  if (!next.includes(call)) {
    next = next.replace("         setupSnare();\n", `         setupSnare();\n${call}`);
  }

  const methods = `
      private function flashpointQaSayMushroom2DialogAfterLoad() : void
      {
         var dialogId:String = null;
         if(shellApi.checkEvent("qa_dialog_ghd_mushroom2_humphree_free","ghd") || shellApi.checkEvent("qa_dialog_ghd_mushroom2_humphree","ghd") || shellApi.checkEvent("qa_dialog_ghd_mushroom2_humphree_free") || shellApi.checkEvent("qa_dialog_ghd_mushroom2_humphree"))
         {
            dialogId = "free";
         }
         if(dialogId == null)
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(2,1,Command.create(this.flashpointQaSayMushroom2Dialog,dialogId)));
      }

      private function flashpointQaSayMushroom2Dialog(param1:String) : void
      {
         var dialog:Dialog = null;
         var dialogData:Object = null;
         if(_humphree == null || !_humphree.has(Dialog))
         {
            return;
         }
         SceneUtil.setCameraTarget(this,_humphree);
         dialog = _humphree.get(Dialog);
         dialog.allowOverwrite = true;
         dialogData = dialog.getDialog(param1);
         if(dialogData is DialogData)
         {
            DialogData(dialogData).timeOverride = 60;
            DialogData(dialogData).forceOnScreen = true;
         }
         dialog.sayById(param1);
      }
`;

  if (!next.includes("private function flashpointQaSayMushroom2DialogAfterLoad")) {
    next = insertBefore(next, "\n      private function setupSnare() : void", methods);
  }

  requireFragments(next, [
    "import engine.util.Command;",
    "import game.data.TimedEvent;",
    "this.flashpointQaSayMushroom2DialogAfterLoad();",
    'shellApi.checkEvent("qa_dialog_ghd_mushroom2_humphree_free","ghd")',
    "new TimedEvent(2,1,Command.create(this.flashpointQaSayMushroom2Dialog,dialogId))",
    "dialog.sayById(param1)"
  ], "Mushroom2");
  requireAnyFragment(next, ["DialogData(dialogData).timeOverride = 60", "dialogData.timeOverride = 60"], "Mushroom2");
  requireAnyFragment(next, ["DialogData(dialogData).forceOnScreen = true", "dialogData.forceOnScreen = true"], "Mushroom2");
  return next;
}

function patchPrehistoric2(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import engine.components.Spatial;", "   import engine.util.Command;");
  next = addImport(next, "   import game.creators.ui.ToolTipCreator;", "   import game.data.TimedEvent;");

  const call = "         this.flashpointQaSayPrehistoric2DialogAfterLoad();\n";
  if (!next.includes(call)) {
    next = next.replace("         prehistoricGroup.createDactyls(this,_hitContainer,approachNest);\n", `         prehistoricGroup.createDactyls(this,_hitContainer,approachNest);\n${call}`);
  }

  const methods = `
      private function flashpointQaSayPrehistoric2DialogAfterLoad() : void
      {
         var dialogId:String = null;
         if(shellApi.checkEvent("qa_dialog_ghd_prehistoric2_cosmoe_free","ghd") || shellApi.checkEvent("qa_dialog_ghd_prehistoric2_cosmoe_free"))
         {
            dialogId = "free";
         }
         else if(shellApi.checkEvent("qa_dialog_ghd_prehistoric2_cosmoe_baby","ghd") || shellApi.checkEvent("qa_dialog_ghd_prehistoric2_cosmoe","ghd") || shellApi.checkEvent("qa_dialog_ghd_prehistoric2_cosmoe_baby") || shellApi.checkEvent("qa_dialog_ghd_prehistoric2_cosmoe"))
         {
            dialogId = "baby";
         }
         if(dialogId == null)
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(2,1,Command.create(this.flashpointQaSayPrehistoric2Dialog,dialogId)));
      }

      private function flashpointQaSayPrehistoric2Dialog(param1:String) : void
      {
         var dialog:Dialog = null;
         var dialogData:Object = null;
         if(_cosmoe == null || !_cosmoe.has(Dialog))
         {
            return;
         }
         SceneUtil.setCameraTarget(this,_cosmoe);
         dialog = _cosmoe.get(Dialog);
         dialog.allowOverwrite = true;
         dialogData = dialog.getDialog(param1);
         if(dialogData is DialogData)
         {
            DialogData(dialogData).timeOverride = 60;
            DialogData(dialogData).forceOnScreen = true;
         }
         dialog.sayById(param1);
      }
`;

  if (!next.includes("private function flashpointQaSayPrehistoric2DialogAfterLoad")) {
    next = insertBefore(next, "\n      override protected function eventTriggers", methods);
  }

  requireFragments(next, [
    "import engine.util.Command;",
    "import game.data.TimedEvent;",
    "this.flashpointQaSayPrehistoric2DialogAfterLoad();",
    'shellApi.checkEvent("qa_dialog_ghd_prehistoric2_cosmoe_baby","ghd")',
    "new TimedEvent(2,1,Command.create(this.flashpointQaSayPrehistoric2Dialog,dialogId))",
    "dialog.sayById(param1)"
  ], "Prehistoric2");
  requireAnyFragment(next, ["DialogData(dialogData).timeOverride = 60", "dialogData.timeOverride = 60"], "Prehistoric2");
  requireAnyFragment(next, ["DialogData(dialogData).forceOnScreen = true", "dialogData.forceOnScreen = true"], "Prehistoric2");
  return next;
}

function patchGhostShip(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import game.data.TimedEvent;", "   import game.data.scene.characterDialog.DialogData;");
  next = next.replace(
    "minRange:Number = NaN, maxRange:Number = NaN",
    "minRange:Number = -1, maxRange:Number = -1"
  );
  next = next.replace("if(isNaN(minRange))", "if(minRange < 0)");
  next = next.replace("if(isNaN(maxRange))", "if(maxRange < 0)");

  const call = "         this.flashpointQaSayGhostShipDialogAfterLoad();\n";
  if (!next.includes(call)) {
    next = next.replace("         inter.reached.add(handleDoor);\n", `         inter.reached.add(handleDoor);\n${call}`);
  }

  const methods = `
      private function flashpointQaSayGhostShipDialogAfterLoad() : void
      {
         var npcId:String = null;
         var dialogId:String = null;
         if(shellApi.checkEvent("qa_dialog_ghd_ghostship_captain_rage","ghd") || shellApi.checkEvent("qa_dialog_ghd_ghostship_captain","ghd") || shellApi.checkEvent("qa_dialog_ghd_ghostship_captain_rage") || shellApi.checkEvent("qa_dialog_ghd_ghostship_captain"))
         {
            npcId = "captain";
            dialogId = "rage";
         }
         else if(shellApi.checkEvent("qa_dialog_ghd_ghostship_player_needPieces","ghd") || shellApi.checkEvent("qa_dialog_ghd_ghostship_player_needPieces"))
         {
            npcId = "player";
            dialogId = "needPieces";
         }
         if(npcId == null || dialogId == null)
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(2,1,Command.create(this.flashpointQaSayGhostShipDialog,npcId,dialogId)));
      }

      private function flashpointQaSayGhostShipDialog(param1:String, param2:String) : void
      {
         var target:Entity = null;
         var dialog:Dialog = null;
         var dialogData:Object = null;
         if(param1 == "captain")
         {
            target = _captain;
         }
         else if(param1 == "player")
         {
            target = player;
         }
         if(target == null || !target.has(Dialog))
         {
            return;
         }
         SceneUtil.setCameraTarget(this,target);
         dialog = target.get(Dialog);
         dialog.allowOverwrite = true;
         dialogData = dialog.getDialog(param2);
         if(dialogData is DialogData)
         {
            DialogData(dialogData).timeOverride = 60;
            DialogData(dialogData).forceOnScreen = true;
         }
         dialog.sayById(param2);
      }
`;

  if (!next.includes("private function flashpointQaSayGhostShipDialogAfterLoad")) {
    next = insertBefore(next, "\n      private function setupOverlay() : void", methods);
  }

  requireFragments(next, [
    "import game.data.scene.characterDialog.DialogData;",
    "this.flashpointQaSayGhostShipDialogAfterLoad();",
    'shellApi.checkEvent("qa_dialog_ghd_ghostship_captain_rage","ghd")',
    "minRange:Number = -1, maxRange:Number = -1",
    "if(minRange < 0)",
    "if(maxRange < 0)",
    "new TimedEvent(2,1,Command.create(this.flashpointQaSayGhostShipDialog,npcId,dialogId))",
    "dialog.sayById(param2)"
  ], "GhostShip");
  requireAnyFragment(next, ["DialogData(dialogData).timeOverride = 60", "dialogData.timeOverride = 60"], "GhostShip");
  requireAnyFragment(next, ["DialogData(dialogData).forceOnScreen = true", "dialogData.forceOnScreen = true"], "GhostShip");
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

  const workDir = path.join(paths.tempDir, "as3-ghd-rescue-dialog-proof-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");

  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    PATCHES.map((entry) => entry.className).join(","),
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export GHD rescue scene classes");

  const patched = [];
  let inputSwf = packShell;
  for (const entry of PATCHES) {
    const scriptPath = findScript(scriptRoot, entry.scriptSuffix);
    if (!scriptPath) {
      throw new Error(`Exported script was not found: ${entry.scriptSuffix}`);
    }
    writeText(scriptPath, entry.patch(fs.readFileSync(scriptPath, "utf8")));
    const outputSwf = path.join(workDir, entry.outputName);
    runFfdec(ffdecCli, [
      "-replace",
      inputSwf,
      outputSwf,
      entry.className,
      scriptPath
    ], `replace ${entry.className}`);
    inputSwf = outputSwf;
    patched.push({
      className: entry.className,
      scriptPath,
      outputSwf
    });
  }
  fs.copyFileSync(inputSwf, packShell);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    packShell,
    patchedClasses: patched,
    patchAssetId: PATCH_ASSET_ID,
    patch: "Adds QA-only seed-event triggers for native Galactic Hot Dogs Dialog.sayById proofs: Dagger trapped/escaped, Humphree free, Cosmoe baby, and Ghost Ship captain rage."
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-ghd-rescue-dialog-proof-patch.json");
  writeJson(reportPath, report);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main();
