const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, readJson, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const ASSET_PATH = "content/www.poptropica.com/scenes/islandTrain/sceneEdisonCabin.swf";
const AS2_FRAMEWORK_PATH = "content/www.poptropica.com/framework.swf";
const AS2_GAMEPLAY_PATH = "content/www.poptropica.com/gameplay.swf";
const PATCH_ASSET_ID = "as2-train:edison-cabin-dialogue-zh";
const FRAMEWORK_QA_BRIDGE_ASSET_ID = "as2-shared:framework-qa-dialog-bridge";
const GAMEPLAY_QA_BRIDGE_ASSET_ID = "as2-shared:gameplay-qa-dialog-scene-bridge";
const QA_FLASHVARS_KEY = "flashpointQaAs2Dialog";

const STRING_REPLACEMENTS = [
  [
    `"Tesla and I are rivals,\\nbut I can\\'t believe he\\nwould resort to thievery."`,
    "特斯拉和我是竞争对手，\n但我不相信他会\n做出偷窃这种事。"
  ],
  [
    `"There must be more to the story..."`,
    "这件事背后一定还有隐情..."
  ],
  [
    `"Wait - the device! It was running at\\nthe time of the theft! Maybe it\\ncaptured the thief\\'s image!"`,
    "等等，那台装置！失窃时\n它还在运转！也许它\n拍到了小偷的影像！"
  ],
  [
    `"When we went around that curve,\\nTesla was all the way on the\\nother side of the train!"`,
    "火车转弯时，特斯拉\n明明在列车的\n另一头！"
  ],
  [
    `"I knew it. But you realize\\nwhat this means?"`,
    "我就知道。但你明白\n这意味着什么吗？"
  ],
  [
    `"The thief is still\\non the loose!"`,
    "小偷还在\n逍遥法外！"
  ],
  [
    `"Make haste and talk to Tesla.\\nPerhaps he knows something\\nthat can help us."`,
    "快去找特斯拉谈谈。\n也许他知道一些\n能帮上忙的事。"
  ],
  [
    `"I\\'ll need your help once I get\\nthis set up. You should\\ngo meet the other passengers\\nwhile you\\'re waiting."`,
    "等我把这里布置好，\n就需要你帮忙了。等候时，\n先去见见其他乘客吧。"
  ],
  [
    `"I\\'m going to unveil an\\nincredible new device. It\\nactually captures moving\\npictures! Let\\'s try it out."`,
    "我要展示一台\n不可思议的新装置。它能\n拍下会动的画面！来试试吧。"
  ],
  [
    `"It\\'s working! Wait here,\\nI\\'ve got to go find that\\nNew York Times reporter!"`,
    "它成功了！在这等着，\n我得去找那位\n《纽约时报》记者！"
  ],
  [
    `"I can\\'t see a thing!"`,
    "我什么都看不见！"
  ],
  [
    `"Hey... where\\'d it go!?"`,
    "嘿... 它去哪了！？"
  ],
  [
    `"*gasp* My machine! What have\\nyou done with it?"`,
    "天哪！我的机器！\n你把它弄到哪里去了？"
  ],
  [
    `"I don\\'t know what happened to it!\\nIt was here when the lights\\nwent out, and then..."`,
    "我不知道发生了什么！\n灯灭时它还在这里，\n然后就..."
  ],
  [
    `"My invention - stolen! The thief\\ncan\\'t have gone far..."`,
    "我的发明被偷了！小偷\n一定还没走远..."
  ]
];

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

function runFfdec(ffdecCli, args, label) {
  return runChecked(ffdecCli, args, label);
}

function listAsScripts(root) {
  const scripts = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.as$/iu.test(entry.name)) {
        scripts.push(fullPath);
      }
    }
  }
  return scripts.sort((left, right) => left.localeCompare(right, "en"));
}

function as2StringLiteral(value) {
  return `"${String(value)
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, "\\n")}"`;
}

function replaceAllExact(source, oldText, newText) {
  if (!source.includes(oldText)) {
    throw new Error(`Unable to locate EdisonCabin script fragment: ${oldText}`);
  }
  return source.split(oldText).join(newText);
}

function insertQaDialogHook(source) {
  let next = source;
  if (!next.includes("function flashpointQaMaybeShowEdisonDialog()")) {
    const hook = [
      "flashpointQaEdisonDialogShown = false;",
      "flashpointQaEdisonDialogSceneUrl = String(_url) + \"&\" + String(this._url);",
      `flashpointQaEdisonDialogModeCache = flashpointQaEdisonDialogSceneUrl.indexOf("${QA_FLASHVARS_KEY}=edison") >= 0 ? "edison" : "";`,
      "function flashpointQaEdisonDialogMode()",
      "{",
      `   var _loc1_ = String(_root.${QA_FLASHVARS_KEY});`,
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      `      _loc1_ = String(_level0.${QA_FLASHVARS_KEY});`,
      "   }",
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      `      _loc1_ = String(${QA_FLASHVARS_KEY});`,
      "   }",
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      "      _loc1_ = String(flashpointQaEdisonDialogModeCache);",
      "   }",
      "   if(_loc1_ == \"\" || _loc1_ == \"undefined\")",
      "   {",
      "      var _loc2_ = String(_root._url) + \"&\" + String(_level0._url) + \"&\" + String(flashpointQaEdisonDialogSceneUrl);",
      "      _loc2_ = _loc2_ + \"&\" + String(this._url) + \"&\" + String(_url);",
      `      if(_loc2_.indexOf("${QA_FLASHVARS_KEY}=edison") >= 0)`,
      "      {",
      "         _loc1_ = \"edison\";",
      "      }",
      "   }",
      "   return _loc1_;",
      "}",
      "function flashpointQaEdisonDialogReady()",
      "{",
      "   if(Edison == undefined || Edison.talkyText == undefined || Edison.talkyText == \"\" || _root.manualSay == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   if(Edison.coordinates == undefined || Edison.coordinates.x == undefined || Edison.coordinates.y == undefined || Edison.charScale == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   if(Edison.avatar == undefined || Edison.avatar.head == undefined || Edison.avatar.head.mouth == undefined || Edison.avatar.head.eyes == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   if(_root.camera == undefined || _root.camera.scene == undefined || _root.camera.scene.char == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   if(_root.sayDepth == undefined || _root.chatDepth == undefined)",
      "   {",
      "      return false;",
      "   }",
      "   return true;",
      "}",
      "function flashpointQaMaybeShowEdisonDialog()",
      "{",
      "   if(flashpointQaEdisonDialogShown)",
      "   {",
      "      return undefined;",
      "   }",
      "   var _loc1_ = flashpointQaEdisonDialogMode();",
      "   if(_loc1_ != \"edison\" && _loc1_ != \"edison-start\")",
      "   {",
      "      return undefined;",
      "   }",
      "   if(!flashpointQaEdisonDialogReady())",
      "   {",
      "      return undefined;",
      "   }",
      "   if(_root.takeClick != undefined)",
      "   {",
      "      _root.takeClick._visible = true;",
      "   }",
      "   _root.manualSay(Edison,Edison.talkyText);",
      "   var _loc2_ = Edison.sayDepth != undefined && _root[\"say\" + Edison.sayDepth] != undefined;",
      "   if(_loc2_)",
      "   {",
      "      _root[\"say\" + Edison.sayDepth].wait = 900;",
      "      _root[\"say\" + Edison.sayDepth]._visible = true;",
      "      _root[\"say\" + Edison.sayDepth]._alpha = 100;",
      "      _root[\"say\" + Edison.sayDepth].swapDepths(250000);",
      "      flashpointQaEdisonDialogShown = true;",
      "      flashpointQaEdisonTrack(\"QaDialogShown\");",
      "   }",
      "   else",
      "   {",
      "      flashpointQaEdisonTrack(\"QaDialogMissingBubble\");",
      "   }",
      "}",
      "function flashpointQaEdisonTrack(eventName)",
      "{",
      "   if(flashpointQaEdisonDialogMode() == \"edison\")",
      "   {",
      "      loadVariablesNum(\"/brain/track.php?cluster=QA&scene=EdisonCabin&event=\" + eventName + \"&ready=\" + (Edison != undefined) + \"&talky=\" + (Edison != undefined && Edison.talkyText != undefined && Edison.talkyText != \"\") + \"&manual=\" + (_root.manualSay != undefined) + \"&coords=\" + (Edison != undefined && Edison.coordinates != undefined && Edison.coordinates.x != undefined) + \"&avatar=\" + (Edison != undefined && Edison.avatar != undefined && Edison.avatar.head != undefined) + \"&camera=\" + (_root.camera != undefined && _root.camera.scene != undefined) + \"&depth=\" + (_root.sayDepth != undefined) + \"&bubble=\" + (Edison != undefined && Edison.sayDepth != undefined && _root[\"say\" + Edison.sayDepth] != undefined),0);",
      "   }",
      "}",
      "function flashpointQaEdisonDialogTick()",
      "{",
      "   flashpointQaEdisonDialogWait = flashpointQaEdisonDialogWait + 1;",
      "   if(flashpointQaEdisonDialogWait < 4)",
      "   {",
      "      return undefined;",
      "   }",
      "   if(flashpointQaEdisonDialogWait == 4)",
      "   {",
      "      flashpointQaEdisonTrack(\"QaHookTick4\");",
      "   }",
      "   flashpointQaMaybeShowEdisonDialog();",
      "   if(flashpointQaEdisonDialogShown || flashpointQaEdisonDialogWait > 80)",
      "   {",
      "      clearInterval(flashpointQaEdisonDialogInterval);",
      "   }",
      "}",
      "function flashpointQaArmEdisonDialog()",
      "{",
      "   if(flashpointQaEdisonDialogInterval != undefined)",
      "   {",
      "      clearInterval(flashpointQaEdisonDialogInterval);",
      "   }",
      "   flashpointQaEdisonDialogWait = 0;",
      "   flashpointQaEdisonDialogInterval = setInterval(this,\"flashpointQaEdisonDialogTick\",250);",
      "}",
      ""
    ].join("\n");
    const marker = "function initChars()\n{";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate initChars marker for EdisonCabin QA hook.");
    }
    next = next.replace(marker, `${hook}${marker}`);
  }

  if (!next.includes("   flashpointQaMaybeShowEdisonDialog();\n}\nfunction init2()")) {
    const marker = [
      "      else",
      "      {",
      "         setStart();",
      "      }",
      "   }",
      "}"
    ].join("\n");
    const replacement = [
      "      else",
      "      {",
      "         setStart();",
      "      }",
      "   }",
      "   flashpointQaMaybeShowEdisonDialog();",
      "}"
    ].join("\n");
    if (!next.includes(marker)) {
      throw new Error("Unable to locate init tail for EdisonCabin QA hook call.");
    }
    next = next.replace(marker, replacement);
  }
  if (!next.includes("_root.loadSceneChars(0);\nflashpointQaArmEdisonDialog();")) {
    const marker = "_root.loadSceneChars(0);";
    if (!next.includes(marker)) {
      throw new Error("Unable to locate loadSceneChars marker for EdisonCabin QA hook arm.");
    }
    next = next.replace(marker, `${marker}\nflashpointQaArmEdisonDialog();`);
  }
  return next;
}

function patchEdisonScript(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const before = next;
  const replacements = [];
  for (const [oldLiteral, translatedText] of STRING_REPLACEMENTS) {
    const translatedLiteral = as2StringLiteral(translatedText);
    if (next.includes(oldLiteral)) {
      next = replaceAllExact(next, oldLiteral, translatedLiteral);
      replacements.push({ oldLiteral, translatedLiteral });
    } else if (next.includes(translatedLiteral)) {
      replacements.push({ oldLiteral, translatedLiteral, alreadyPatched: true });
    } else {
      throw new Error(`Neither original nor translated EdisonCabin literal was found: ${oldLiteral}`);
    }
  }
  next = insertQaDialogHook(next);
  if (!next.includes("Edison.talkyText = \"等我把这里布置好") || !next.includes("flashpointQaMaybeShowEdisonDialog")) {
    throw new Error("EdisonCabin dialogue patch did not apply cleanly.");
  }
  return {
    changed: next !== before,
    content: next,
    replacements
  };
}

function patchFrameworkStartUpCommand(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const before = next;
  if (next.includes(`gameplay.swf?${QA_FLASHVARS_KEY}=`)) {
    return {
      changed: false,
      content: next
    };
  }

  const marker = '      _loc2_.gameplay_url = "gameplay.swf";';
  const replacement = [
    marker,
    `      if(this._rt_target.${QA_FLASHVARS_KEY} != undefined && String(this._rt_target.${QA_FLASHVARS_KEY}) != "")`,
    "      {",
    `         _loc2_.gameplay_url = "gameplay.swf?${QA_FLASHVARS_KEY}=" + escape(String(this._rt_target.${QA_FLASHVARS_KEY}));`,
    "      }"
  ].join("\n");

  if (!next.includes(marker)) {
    throw new Error("Unable to locate framework StartUpCommand gameplay_url assignment.");
  }
  next = next.replace(marker, replacement);
  if (!next.includes(`gameplay.swf?${QA_FLASHVARS_KEY}=`)) {
    throw new Error("Framework QA bridge patch did not apply cleanly.");
  }
  return {
    changed: next !== before,
    content: next
  };
}

function patchGameplaySceneLoad(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  const before = next;
  if (next.includes("flashpointQaScenePath")) {
    return {
      changed: false,
      content: next
    };
  }

  const marker = [
    'logWWW("frame 1 loads scenePath " + scenePath + " in to camera");',
    "loader.loadClip(scenePath,camera);"
  ].join("\n");
  const replacement = [
    'logWWW("frame 1 loads scenePath " + scenePath + " in to camera");',
    "var flashpointQaScenePath = scenePath;",
    `var flashpointQaDialogMode = String(_root.${QA_FLASHVARS_KEY});`,
    'if(flashpointQaDialogMode == "" || flashpointQaDialogMode == "undefined")',
    "{",
    `   flashpointQaDialogMode = String(${QA_FLASHVARS_KEY});`,
    "}",
    'if((flashpointQaDialogMode == "" || flashpointQaDialogMode == "undefined") && String(_root._url).indexOf("' + QA_FLASHVARS_KEY + '=edison") >= 0)',
    "{",
    '   flashpointQaDialogMode = "edison";',
    "}",
    'if(flashpointQaDialogMode != "" && flashpointQaDialogMode != "undefined" && flashpointQaScenePath.indexOf("' + QA_FLASHVARS_KEY + '=") < 0)',
    "{",
    `   flashpointQaScenePath = flashpointQaScenePath + (flashpointQaScenePath.indexOf("?") >= 0 ? "&" : "?") + "${QA_FLASHVARS_KEY}=" + escape(flashpointQaDialogMode);`,
    "}",
    "loader.loadClip(flashpointQaScenePath,camera);"
  ].join("\n");

  if (!next.includes(marker)) {
    throw new Error("Unable to locate gameplay frame_1 scenePath load marker.");
  }
  next = next.replace(marker, replacement);
  if (!next.includes("flashpointQaScenePath") || !next.includes(`${QA_FLASHVARS_KEY}=`)) {
    throw new Error("Gameplay QA scene bridge patch did not apply cleanly.");
  }
  return {
    changed: next !== before,
    content: next
  };
}

function findEdisonScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot);
  const matching = candidates.filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes("function setStart()") &&
      content.includes("Edison.talkyText") &&
      content.includes("sceneEdisonCabin") === false;
  });
  if (matching.length === 1) {
    return matching[0];
  }
  const hardcoded = candidates.filter((scriptPath) => fs.readFileSync(scriptPath, "utf8").includes("I\\'ll need your help once I get"));
  if (hardcoded.length === 1) {
    return hardcoded[0];
  }
  throw new Error(`Expected one EdisonCabin action script, found ${matching.length || hardcoded.length}.`);
}

function findGameplayFrameOneScript(scriptRoot) {
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes('scenePath = "scenes/island" + island + "/" + sceneName;') &&
      (content.includes("loader.loadClip(scenePath,camera);") || content.includes("flashpointQaScenePath"));
  });
  if (candidates.length === 1) {
    return candidates[0];
  }
  throw new Error(`Expected one gameplay frame_1 scene loader script, found ${candidates.length}.`);
}

function findFrameworkStartUpCommandScript(scriptRoot) {
  const direct = path.join(scriptRoot, "__Packages", "com", "poptropica", "controllers", "commands", "StartUpCommand.as");
  if (fileExists(direct)) {
    return direct;
  }
  const candidates = listAsScripts(scriptRoot).filter((scriptPath) => {
    const content = fs.readFileSync(scriptPath, "utf8");
    return content.includes("class com.poptropica.controllers.commands.StartUpCommand") ||
      content.includes('_loc2_.gameplay_url = "gameplay.swf";') ||
      content.includes(`gameplay.swf?${QA_FLASHVARS_KEY}=`);
  });
  if (candidates.length === 1) {
    return candidates[0];
  }
  throw new Error(`Expected one framework StartUpCommand script, found ${candidates.length}.`);
}

function extractSourceSwf(config, workDir) {
  const sourceZip = config.sources?.as2Gamezip;
  if (!sourceZip || !fileExists(sourceZip)) {
    throw new Error(`AS2 source zip is missing: ${sourceZip || "(not configured)"}`);
  }
  runChecked(config.tools?.tarBin || "tar", ["-xf", sourceZip, "-C", workDir, ASSET_PATH], "extract AS2 EdisonCabin");
  const sourceSwf = path.join(workDir, ASSET_PATH.replace(/\//gu, path.sep));
  if (!fileExists(sourceSwf)) {
    throw new Error(`Extracted EdisonCabin SWF not found: ${sourceSwf}`);
  }
  return sourceSwf;
}

function extractFrameworkSourceSwf(config, workDir) {
  const sourceZip = config.sources?.as2Gamezip;
  if (!sourceZip || !fileExists(sourceZip)) {
    throw new Error(`AS2 source zip is missing: ${sourceZip || "(not configured)"}`);
  }
  runChecked(config.tools?.tarBin || "tar", ["-xf", sourceZip, "-C", workDir, AS2_FRAMEWORK_PATH], "extract AS2 framework");
  const sourceSwf = path.join(workDir, AS2_FRAMEWORK_PATH.replace(/\//gu, path.sep));
  if (!fileExists(sourceSwf)) {
    throw new Error(`Extracted framework SWF not found: ${sourceSwf}`);
  }
  return sourceSwf;
}

function extractGameplaySourceSwf(config, workDir) {
  const sourceZip = config.sources?.as2Gamezip;
  if (!sourceZip || !fileExists(sourceZip)) {
    throw new Error(`AS2 source zip is missing: ${sourceZip || "(not configured)"}`);
  }
  runChecked(config.tools?.tarBin || "tar", ["-xf", sourceZip, "-C", workDir, AS2_GAMEPLAY_PATH], "extract AS2 gameplay");
  const sourceSwf = path.join(workDir, AS2_GAMEPLAY_PATH.replace(/\//gu, path.sep));
  if (!fileExists(sourceSwf)) {
    throw new Error(`Extracted gameplay SWF not found: ${sourceSwf}`);
  }
  return sourceSwf;
}

function patchFrameworkQaDialogBridge(config, ffdecCli, workDir) {
  const packFramework = path.join(paths.as2PackDir, "swf", AS2_FRAMEWORK_PATH.replace(/\//gu, path.sep));
  const frameworkSourceRoot = path.join(workDir, "framework-source");
  const inputSwf = fileExists(packFramework)
    ? packFramework
    : extractFrameworkSourceSwf(config, frameworkSourceRoot);
  const inputSource = fileExists(packFramework) ? "pack" : "sourceZip";
  const scriptRoot = path.join(workDir, "framework-scripts");

  runFfdec(ffdecCli, ["-cli", "-export", "script", scriptRoot, inputSwf], "export AS2 framework scripts");
  const scriptPath = findFrameworkStartUpCommandScript(scriptRoot);
  const patched = patchFrameworkStartUpCommand(fs.readFileSync(scriptPath, "utf8"));
  const relative = path.relative(scriptRoot, scriptPath).replace(/\\/gu, "/");
  const replaceTarget = `\\${relative.replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`;

  if (!patched.changed) {
    return {
      assetPath: AS2_FRAMEWORK_PATH,
      inputSwf,
      inputSource,
      packFramework,
      patchedScript: relative,
      replaceTarget,
      changed: false,
      alreadyPatched: true
    };
  }

  writeText(scriptPath, patched.content);
  const outputSwf = path.join(workDir, "framework.qa-dialog-bridge.swf");
  runFfdec(ffdecCli, ["-replace", inputSwf, outputSwf, replaceTarget, scriptPath], "replace AS2 framework StartUpCommand script");

  ensureDirSync(path.dirname(packFramework));
  fs.copyFileSync(outputSwf, packFramework);
  return {
    assetPath: AS2_FRAMEWORK_PATH,
    inputSwf,
    inputSource,
    packFramework,
    patchedScript: relative,
    replaceTarget,
    changed: true,
    alreadyPatched: false
  };
}

function patchGameplayQaSceneDialogBridge(config, ffdecCli, workDir) {
  const packGameplay = path.join(paths.as2PackDir, "swf", AS2_GAMEPLAY_PATH.replace(/\//gu, path.sep));
  const gameplaySourceRoot = path.join(workDir, "gameplay-source");
  const inputSwf = fileExists(packGameplay)
    ? packGameplay
    : extractGameplaySourceSwf(config, gameplaySourceRoot);
  const inputSource = fileExists(packGameplay) ? "pack" : "sourceZip";
  const scriptRoot = path.join(workDir, "gameplay-scripts");

  runFfdec(ffdecCli, ["-cli", "-export", "script", scriptRoot, inputSwf], "export AS2 gameplay scripts");
  const scriptPath = findGameplayFrameOneScript(scriptRoot);
  const patched = patchGameplaySceneLoad(fs.readFileSync(scriptPath, "utf8"));
  const relative = path.relative(scriptRoot, scriptPath).replace(/\\/gu, "/");
  const replaceTarget = `\\${relative.replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`;

  if (!patched.changed) {
    return {
      assetPath: AS2_GAMEPLAY_PATH,
      inputSwf,
      inputSource,
      packGameplay,
      patchedScript: relative,
      replaceTarget,
      changed: false,
      alreadyPatched: true
    };
  }

  writeText(scriptPath, patched.content);
  const outputSwf = path.join(workDir, "gameplay.qa-dialog-scene-bridge.swf");
  runFfdec(ffdecCli, ["-replace", inputSwf, outputSwf, replaceTarget, scriptPath], "replace AS2 gameplay scene load script");

  ensureDirSync(path.dirname(packGameplay));
  fs.copyFileSync(outputSwf, packGameplay);
  return {
    assetPath: AS2_GAMEPLAY_PATH,
    inputSwf,
    inputSource,
    packGameplay,
    patchedScript: relative,
    replaceTarget,
    changed: true,
    alreadyPatched: false
  };
}

function updateManifest(manifestPath, packSwf, patchedScript, replacements, frameworkPatch, gameplayPatch, runtimeZip) {
  const manifest = fileExists(manifestPath)
    ? readJson(manifestPath, {})
    : {
        generatedAt: new Date().toISOString(),
        sourceGroup: "as2",
        canonicalKeys: [],
        assetsPatched: 0,
        externalTextAssets: [],
        swfPatchedAssets: [],
        pendingSwfAssets: []
      };
  const existingSwfPatchedAssets = Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [];
  const hadPatchEntry = existingSwfPatchedAssets.some((entry) => entry?.assetId === PATCH_ASSET_ID);
  const hadFrameworkBridgeEntry = existingSwfPatchedAssets.some((entry) => entry?.assetId === FRAMEWORK_QA_BRIDGE_ASSET_ID);
  const hadGameplayBridgeEntry = existingSwfPatchedAssets.some((entry) => entry?.assetId === GAMEPLAY_QA_BRIDGE_ASSET_ID);
  manifest.assetsPatched = Number(manifest.assetsPatched || 0) +
    (hadPatchEntry ? 0 : 1) +
    (hadFrameworkBridgeEntry ? 0 : 1) +
    (hadGameplayBridgeEntry ? 0 : 1);
  manifest.swfPatchedAssets = existingSwfPatchedAssets.filter((entry) =>
    entry?.assetId !== PATCH_ASSET_ID &&
    entry?.assetId !== FRAMEWORK_QA_BRIDGE_ASSET_ID &&
    entry?.assetId !== GAMEPLAY_QA_BRIDGE_ASSET_ID
  );
  manifest.swfPatchedAssets.push({
    assetId: PATCH_ASSET_ID,
    assetPath: ASSET_PATH,
    outputPath: packSwf,
    scripts: [patchedScript],
    translatedHardcodedStrings: replacements.length,
    qaHookFlashVars: QA_FLASHVARS_KEY,
    notes: "Native AS2 talkyText/manualSay strings only; no static TextField overlay is added."
  });
  manifest.swfPatchedAssets.push({
    assetId: FRAMEWORK_QA_BRIDGE_ASSET_ID,
    assetPath: AS2_FRAMEWORK_PATH,
    outputPath: frameworkPatch.packFramework,
    scripts: [frameworkPatch.patchedScript],
    qaHookFlashVars: QA_FLASHVARS_KEY,
    notes: "For QA only: forwards flashpointQaAs2Dialog from framework.swf FlashVars into gameplay.swf query so locked AS2 scene roots can read it."
  });
  manifest.swfPatchedAssets.push({
    assetId: GAMEPLAY_QA_BRIDGE_ASSET_ID,
    assetPath: AS2_GAMEPLAY_PATH,
    outputPath: gameplayPatch.packGameplay,
    scripts: [gameplayPatch.patchedScript],
    qaHookFlashVars: QA_FLASHVARS_KEY,
    notes: "For QA only: forwards flashpointQaAs2Dialog from gameplay.swf into scene SWF query so loaded AS2 scenes can read it from _url."
  });
  manifest.as2HardcodedDialoguePatches = {
    ...(manifest.as2HardcodedDialoguePatches || {}),
    mysteryTrainEdisonCabin: {
      generatedAt: new Date().toISOString(),
      assetPath: ASSET_PATH,
      translatedHardcodedStrings: replacements.length,
      qaHookFlashVars: QA_FLASHVARS_KEY,
      frameworkQaBridge: {
        assetPath: AS2_FRAMEWORK_PATH,
        outputPath: frameworkPatch.packFramework,
        changed: frameworkPatch.changed,
        alreadyPatched: frameworkPatch.alreadyPatched
      },
      gameplayQaBridge: {
        assetPath: AS2_GAMEPLAY_PATH,
        outputPath: gameplayPatch.packGameplay,
        changed: gameplayPatch.changed,
        alreadyPatched: gameplayPatch.alreadyPatched
      }
    }
  };
  manifest.runtimeZip = runtimeZip;
  writeJson(manifestPath, manifest);
  return manifest;
}

function main() {
  const config = loadConfig();
  const ffdecCli = config.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("FFDec CLI is not configured.");
  }

  const workDir = path.join(paths.tempDir, "as2-train-edison-dialogue-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const sourceSwf = extractSourceSwf(config, workDir);
  const scriptRoot = path.join(workDir, "scripts");

  runFfdec(ffdecCli, ["-cli", "-export", "script", scriptRoot, sourceSwf], "export AS2 EdisonCabin scripts");
  const scriptPath = findEdisonScript(scriptRoot);
  const patched = patchEdisonScript(fs.readFileSync(scriptPath, "utf8"));
  writeText(scriptPath, patched.content);

  const outputSwf = path.join(workDir, "sceneEdisonCabin.zh.swf");
  const relative = path.relative(scriptRoot, scriptPath).replace(/\\/gu, "/");
  const replaceTarget = `\\${relative.replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`;
  runFfdec(ffdecCli, ["-replace", sourceSwf, outputSwf, replaceTarget, scriptPath], "replace AS2 EdisonCabin script");

  const packSwf = path.join(paths.as2PackDir, "swf", ASSET_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(packSwf));
  fs.copyFileSync(outputSwf, packSwf);

  const frameworkPatch = patchFrameworkQaDialogBridge(config, ffdecCli, workDir);
  const gameplayPatch = patchGameplayQaSceneDialogBridge(config, ffdecCli, workDir);
  const manifestPath = path.join(paths.as2PackDir, "manifest.json");
  const manifest = fileExists(manifestPath) ? readJson(manifestPath, {}) : {};
  const runtimeZip = buildRuntimeZipForSourceGroup({
    config,
    sourceGroup: "as2",
    manifest
  });
  const updatedManifest = updateManifest(manifestPath, packSwf, relative, patched.replacements, frameworkPatch, gameplayPatch, runtimeZip);

  const report = {
    ok: runtimeZip.status === "ready" || runtimeZip.status === "reused",
    generatedAt: new Date().toISOString(),
    assetPath: ASSET_PATH,
    packSwf,
    patchedScript: {
      scriptPath,
      exportPath: relative,
      replaceTarget
    },
    frameworkQaBridge: frameworkPatch,
    gameplayQaBridge: gameplayPatch,
    translatedHardcodedStrings: patched.replacements.length,
    qaHookFlashVars: QA_FLASHVARS_KEY,
    runtimeZip,
    manifestPath,
    manifestEntry: updatedManifest.swfPatchedAssets.find((entry) => entry?.assetId === PATCH_ASSET_ID) || null,
    frameworkManifestEntry: updatedManifest.swfPatchedAssets.find((entry) => entry?.assetId === FRAMEWORK_QA_BRIDGE_ASSET_ID) || null,
    gameplayManifestEntry: updatedManifest.swfPatchedAssets.find((entry) => entry?.assetId === GAMEPLAY_QA_BRIDGE_ASSET_ID) || null
  };
  const reportPath = path.join(paths.qaDir, "as2", "as2-train-edison-dialogue-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
