const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const MOCKTROPICA_MAIN_STREET_CLASS = "game.scenes.mocktropica.mainStreet.MainStreet";
const PATCH_ASSET_ID = "as3-mocktropica-dialog-proof";

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

function patchMainStreet(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import game.util.MotionUtils;", "   import game.util.ProxyUtils;");

  const call = "         this.flashpointQaSayMocktropicaDialogAfterLoad();\n";
  if (!next.includes(call)) {
    next = next.replace("         setupAnimations();\n", `         setupAnimations();\n${call}`);
  }

  const methods = `
      private function flashpointQaSayMocktropicaDialogAfterLoad() : void
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
         if(npcId == null || npcId == "" || dialogId == null || dialogId == "" || !/^(player|projectManager|focusTester|boy|incompleteMan|leadDeveloper|safetyInspector|salesManager|costCutter)$/.test(npcId))
         {
            return;
         }
         seedEvent = "qa_dialog_mocktropica_mainStreet_" + npcId + "_" + dialogId;
         if(!super.shellApi.checkEvent(seedEvent,"mocktropica") && !super.shellApi.checkEvent(seedEvent))
         {
            return;
         }
         SceneUtil.addTimedEvent(this,new TimedEvent(2,1,Command.create(this.flashpointQaSayMocktropicaDialog,npcId,dialogId)));
      }

      private function flashpointQaSayMocktropicaDialog(param1:String, param2:String) : void
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
         if(target.has(Display))
         {
            Display(target.get(Display)).visible = true;
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

  if (!next.includes("private function flashpointQaSayMocktropicaDialogAfterLoad")) {
    next = insertBefore(next, "\n      private function positionFocusTester", methods);
  }

  requireFragments(next, [
    "import game.util.ProxyUtils;",
    "this.flashpointQaSayMocktropicaDialogAfterLoad();",
    '"qa_dialog_mocktropica_mainStreet_" + npcId + "_" + dialogId',
    'super.shellApi.checkEvent(seedEvent,"mocktropica")',
    "new TimedEvent(2,1,Command.create(this.flashpointQaSayMocktropicaDialog,npcId,dialogId))",
    "dialog.sayById(param2)"
  ], "Mocktropica MainStreet");
  requireAnyFragment(next, ["DialogData(dialogData).timeOverride = 60", "dialogData.timeOverride = 60"], "Mocktropica MainStreet");
  requireAnyFragment(next, ["DialogData(dialogData).forceOnScreen = true", "dialogData.forceOnScreen = true"], "Mocktropica MainStreet");
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

  const workDir = path.join(paths.tempDir, "as3-mocktropica-dialog-proof-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");

  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    MOCKTROPICA_MAIN_STREET_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export Mocktropica MainStreet class");

  const scriptPath = findScript(scriptRoot, "game/scenes/mocktropica/mainStreet/MainStreet.as");
  if (!scriptPath) {
    throw new Error("Exported Mocktropica MainStreet script was not found.");
  }
  writeText(scriptPath, patchMainStreet(fs.readFileSync(scriptPath, "utf8")));

  const outputSwf = path.join(workDir, "Shell-mocktropica-dialog-proof.swf");
  runFfdec(ffdecCli, [
    "-replace",
    packShell,
    outputSwf,
    MOCKTROPICA_MAIN_STREET_CLASS,
    scriptPath
  ], "replace Mocktropica MainStreet class");
  fs.copyFileSync(outputSwf, packShell);

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    packShell,
    patchedClass: {
      className: MOCKTROPICA_MAIN_STREET_CLASS,
      scriptPath,
      outputSwf
    },
    patchAssetId: PATCH_ASSET_ID,
    patch: "Adds QA-only seed-event + query-parameter triggers for native Mocktropica MainStreet Dialog.sayById proofs."
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-mocktropica-dialog-proof-patch.json");
  writeJson(reportPath, report);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main();
