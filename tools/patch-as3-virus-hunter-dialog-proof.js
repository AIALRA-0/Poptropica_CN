const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const PDC_LAB_CLASS = "game.scenes.virusHunter.pdcLab.PdcLab";
const PATCH_ASSET_ID = "as3-virus-hunter-dialog-proof";

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

function patchPdcLab(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import engine.creators.InteractionCreator;", "   import engine.util.Command;");
  next = addImport(next, "   import game.creators.ui.ToolTipCreator;", "   import game.data.TimedEvent;");
  next = addImport(next, "   import game.data.animation.entity.character.Tremble;", "   import game.data.scene.characterDialog.DialogData;");
  next = addImport(next, "   import game.util.EntityUtils;", "   import game.util.ProxyUtils;");

  const call = "         this.flashpointQaSayPdcLabDialogAfterLoad();\n";
  if (!next.includes(call)) {
    next = next.replace("         super.loaded();\n", `         super.loaded();\n${call}`);
  }

  const methods = `
      private function flashpointQaSayPdcLabDialogAfterLoad() : void
      {
         var npcId:String = null;
         var dialogId:String = null;
         var seedEvent:String = null;
         if(super.groupContainer == null || super.groupContainer.root == null || super.groupContainer.root.loaderInfo == null)
         {
            return;
         }
         npcId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogNpc") as String;
         dialogId = ProxyUtils.getQueryStringData(super.groupContainer.root.loaderInfo,"flashpointQaDialogId") as String;
         if(npcId == null || npcId == "" || dialogId == null || dialogId == "" || !/^(player|npc|npc2|npc3|npc4)$/.test(npcId))
         {
            return;
         }
         seedEvent = "qa_dialog_virus_pdcLab_" + npcId + "_" + dialogId;
         if(!super.shellApi.checkEvent(seedEvent,"virusHunter") && !super.shellApi.checkEvent(seedEvent))
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(2,1,Command.create(this.flashpointQaSayPdcLabDialog,npcId,dialogId)));
      }

      private function flashpointQaSayPdcLabDialog(param1:String, param2:String) : void
      {
         var target:Entity = null;
         var dialog:Dialog = null;
         var dialogData:* = null;
         if(param1 == "player")
         {
            target = super.player;
         }
         else
         {
            target = super.getEntityById(param1);
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
         if(dialogData != null)
         {
            dialog.sayById(param2);
         }
         else
         {
            CharUtils.sayDialog(target);
         }
      }
`;

  if (!next.includes("private function flashpointQaSayPdcLabDialogAfterLoad")) {
    next = insertBefore(next, "\n      private function downClicked", methods);
  }

  requireFragments(next, [
    "import engine.util.Command;",
    "import game.data.TimedEvent;",
    "import game.data.scene.characterDialog.DialogData;",
    "import game.util.ProxyUtils;",
    "this.flashpointQaSayPdcLabDialogAfterLoad();",
    '"qa_dialog_virus_pdcLab_" + npcId + "_" + dialogId',
    'super.shellApi.checkEvent(seedEvent,"virusHunter")',
    "new TimedEvent(2,1,Command.create(this.flashpointQaSayPdcLabDialog,npcId,dialogId))",
    "dialog.sayById(param2)"
  ], "Virus Hunter PdcLab");
  requireAnyFragment(next, ["DialogData(dialogData).timeOverride = 60", "dialogData.timeOverride = 60"], "Virus Hunter PdcLab");
  requireAnyFragment(next, ["DialogData(dialogData).forceOnScreen = true", "dialogData.forceOnScreen = true"], "Virus Hunter PdcLab");
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

  const workDir = path.join(paths.tempDir, "as3-virus-hunter-dialog-proof-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");

  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    PDC_LAB_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Virus Hunter PdcLab class");

  const scriptPath = findScript(scriptRoot, "game/scenes/virusHunter/pdcLab/PdcLab.as");
  if (!scriptPath) {
    throw new Error("Exported PdcLab script was not found.");
  }
  writeText(scriptPath, patchPdcLab(fs.readFileSync(scriptPath, "utf8")));

  const outputSwf = path.join(workDir, "Shell-virus-hunter-dialog-proof.swf");
  runFfdec(ffdecCli, [
    "-replace",
    packShell,
    outputSwf,
    PDC_LAB_CLASS,
    scriptPath
  ], "replace Virus Hunter PdcLab class");
  fs.copyFileSync(outputSwf, packShell);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    packShell,
    patchedClass: {
      className: PDC_LAB_CLASS,
      scriptPath,
      outputSwf
    },
    patchAssetId: PATCH_ASSET_ID,
    patch: "Adds QA-only seed-event + query-parameter triggers for native Virus Hunter PdcLab Dialog.sayById proofs."
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-virus-hunter-dialog-proof-patch.json");
  writeJson(reportPath, report);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main();
