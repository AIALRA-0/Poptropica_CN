const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, listFilesRecursive, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");

const SCENE_ENTRY = "content/www.poptropica.com/scenes/islandSuper/sceneSuperMain.swf";
const DOWNTOWN_ENTRY = "content/www.poptropica.com/scenes/islandSuper/sceneDownTown.swf";
const GAMEPLAY_ENTRY = "content/www.poptropica.com/gameplay.swf";
const CHAR_ENTRY = "content/www.poptropica.com/char.swf";
const COUNTER_BALLOON_ENTRY = "content/www.poptropica.com/popups/counter/balloon.swf";
const BALLOON_ENTRY = "content/www.poptropica.com/popups/balloon.swf";
const SENTINEL_TEXT = "原版气泡中文测试";

function runCommand(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
}

function normalizeScript(content) {
  return String(content || "").replace(/\r\n/gu, "\n");
}

function replaceRequired(content, searchValue, replacementValue, label) {
  const normalizedContent = normalizeScript(content);
  const normalizedSearchValue = normalizeScript(searchValue);
  if (!normalizedContent.includes(normalizedSearchValue)) {
    throw new Error(`Unable to locate ${label}`);
  }
  return normalizedContent.replace(normalizedSearchValue, normalizeScript(replacementValue));
}

function applyLiteralStringReplacements(content, replacements) {
  let nextContent = normalizeScript(content);
  nextContent = nextContent.split("\\'").join("'");
  for (const [searchValue, replacementValue] of replacements) {
    const normalizedSearchValue = normalizeScript(searchValue);
    const escapedSearchValue = normalizedSearchValue.split("\n").join("\\n");
    const escapedReplacementValue = normalizeScript(replacementValue).split("\n").join("\\n");
    nextContent = nextContent.split(normalizedSearchValue).join(escapedReplacementValue);
    nextContent = nextContent.split(escapedSearchValue).join(escapedReplacementValue);
  }
  return nextContent;
}

function escapeAs2ScriptString(value) {
  return String(value || "")
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, '\\"')
    .replace(/\r?\n/gu, "\\n");
}

function renderAs2StaticOverlayHelpers(overlays, containerExpression = "this") {
  const lines = [
    "function zhOverlayFill(targetClip, width, height, color, alpha)",
    "{",
    "   targetClip.beginFill(color,alpha);",
    "   targetClip.moveTo(0,0);",
    "   targetClip.lineTo(width,0);",
    "   targetClip.lineTo(width,height);",
    "   targetClip.lineTo(0,height);",
    "   targetClip.lineTo(0,0);",
    "   targetClip.endFill();",
    "}",
    "function zhOverlayLabel(container, clipName, x, y, width, height, bgColor, bgAlpha, textValue, fontSize, textColor, rotation)",
    "{",
    "   var holder;",
    "   var fmt;",
    "   holder = container.createEmptyMovieClip(clipName,container.getNextHighestDepth());",
    "   holder._x = x;",
    "   holder._y = y;",
    "   if(rotation != undefined)",
    "   {",
    "      holder._rotation = rotation;",
    "   }",
    "   zhOverlayFill(holder,width,height,bgColor,bgAlpha);",
    "   holder.createTextField(\"txt\",holder.getNextHighestDepth(),4,0,Math.max(1,width - 8),height);",
    "   holder.txt.embedFonts = false;",
    "   holder.txt.selectable = false;",
    "   holder.txt.multiline = true;",
    "   holder.txt.wordWrap = true;",
    "   holder.txt.autoSize = false;",
    "   holder.txt.text = textValue;",
    "   fmt = new TextFormat();",
    "   fmt.font = \"_sans\";",
    "   fmt.size = fontSize;",
    "   fmt.color = textColor;",
    "   fmt.bold = true;",
    "   fmt.align = \"center\";",
    "   fmt.leading = 2;",
    "   holder.txt.setNewTextFormat(fmt);",
    "   holder.txt.setTextFormat(fmt);",
    "   holder.txt._height = height;",
    "   holder.txt._y = Math.max(0,Math.floor((height - holder.txt.textHeight - 6) / 2));",
    "   return holder;",
    "}",
    "function installZhStaticOverlay()",
    "{",
    "   var overlayRoot;",
    "   var overlayHost;",
    `   overlayHost = ${containerExpression};`,
    "   if(overlayHost == undefined || overlayHost.zhStaticOverlay != undefined)",
    "   {",
    "      return undefined;",
    "   }",
    "   overlayRoot = overlayHost.createEmptyMovieClip(\"zhStaticOverlay\",overlayHost.getNextHighestDepth());"
  ];
  for (const overlay of overlays) {
    lines.push(
      `   zhOverlayLabel(overlayRoot,"${overlay.name}",${overlay.x},${overlay.y},${overlay.width},${overlay.height},${overlay.bgColor},${overlay.bgAlpha},"${escapeAs2ScriptString(overlay.text)}",${overlay.textSize},${overlay.textColor},${overlay.rotation == undefined ? "undefined" : overlay.rotation});`
    );
  }
  lines.push("}");
  return lines.join("\n");
}

const SCENE_OVERLAY_CONFIGS = new Map([
  [
    SCENE_ENTRY,
    {
      insertSearch: "function initChars()\n{",
      callSearch: `bitmapBackground();
_root.makeBackdrop();`,
      callReplacement: `bitmapBackground();
_root.makeBackdrop();
installZhStaticOverlay();`,
      containerExpression: "bg",
      overlays: [
        { name: "costumeMain", x: 1010, y: 1572, width: 235, height: 78, bgColor: 0x3F5F88, bgAlpha: 92, text: "面具与披风", textSize: 26, textColor: 0xFFFFFF },
        { name: "costumeWindow", x: 872, y: 1738, width: 156, height: 24, bgColor: 0x506985, bgAlpha: 92, text: "面具与服装", textSize: 12, textColor: 0xFFFFFF },
        { name: "heroWindow", x: 1218, y: 1738, width: 184, height: 24, bgColor: 0x506985, bgAlpha: 92, text: "超级英雄配件", textSize: 12, textColor: 0xFFFFFF },
        { name: "openSign", x: 917, y: 1762, width: 74, height: 56, bgColor: 0xB56C73, bgAlpha: 96, text: "营业中", textSize: 20, textColor: 0xFFFFFF },
        { name: "comicShop", x: 590, y: 1682, width: 186, height: 56, bgColor: 0x5C8F58, bgAlpha: 90, text: "漫画店", textSize: 22, textColor: 0xFFFFFF },
        { name: "telephone", x: 3934, y: 1718, width: 134, height: 30, bgColor: 0xD6772E, bgAlpha: 100, text: "电话亭", textSize: 18, textColor: 0xFFFFFF },
        { name: "dailyPaper", x: 4340, y: 1672, width: 224, height: 44, bgColor: 0x5A716F, bgAlpha: 90, text: "每日新闻", textSize: 22, textColor: 0xF6E2BD },
        { name: "downtown", x: 2372, y: 1714, width: 92, height: 54, bgColor: 0x6F9B2F, bgAlpha: 96, text: "市中心", textSize: 18, textColor: 0xFFFFFF },
        { name: "countyPrison", x: 2360, y: 1818, width: 118, height: 36, bgColor: 0x5E8B3B, bgAlpha: 96, text: "县监狱", textSize: 16, textColor: 0xFFFFFF },
        { name: "tapeUpper", x: 1980, y: 1794, width: 278, height: 20, bgColor: 0xF5D200, bgAlpha: 96, text: "警戒线 禁止跨越", textSize: 13, textColor: 0x000000, rotation: -17 },
        { name: "tapeLower", x: 1670, y: 1884, width: 230, height: 20, bgColor: 0xF5D200, bgAlpha: 96, text: "警戒线 禁止跨越", textSize: 13, textColor: 0x000000, rotation: 15 }
      ]
    }
  ],
  [
    DOWNTOWN_ENTRY,
    {
      insertSearch: "function initChars()\n{",
      callSearch: `_root.makeBackground();
_root.makeBackdrop();`,
      callReplacement: `_root.makeBackground();
_root.makeBackdrop();
installZhStaticOverlay();`,
      containerExpression: "bg",
      overlays: [
        { name: "mainStreet", x: 246, y: 1718, width: 96, height: 52, bgColor: 0x6F9B2F, bgAlpha: 96, text: "主街", textSize: 22, textColor: 0xFFFFFF }
      ]
    }
  ]
]);

function applyStaticOverlayPatch(content, assetPath) {
  const config = SCENE_OVERLAY_CONFIGS.get(assetPath);
  if (!config) {
    return normalizeScript(content);
  }

  let nextContent = normalizeScript(content);
  const hasInsertAnchor = nextContent.includes(config.insertSearch);
  const hasCallAnchor = nextContent.includes(config.callSearch);
  if (!hasInsertAnchor && !hasCallAnchor) {
    return nextContent;
  }
  const hasHelper = nextContent.includes("function installZhStaticOverlay()");
  if (hasInsertAnchor && !hasHelper) {
    nextContent = replaceRequired(
      nextContent,
      config.insertSearch,
      `${renderAs2StaticOverlayHelpers(config.overlays, config.containerExpression)}\n${config.insertSearch}`,
      `${assetPath} static overlay helper insertion`
    );
  }
  if ((hasInsertAnchor || hasHelper) && hasCallAnchor && !nextContent.includes(config.callReplacement)) {
    nextContent = replaceRequired(
      nextContent,
      config.callSearch,
      config.callReplacement,
      `${assetPath} static overlay install call`
    );
  }
  return nextContent;
}

function collectScriptEntries(rootDir) {
  return listFilesRecursive(rootDir)
    .filter((filePath) => /\.as$/iu.test(filePath))
    .map((filePath) => ({
      filePath,
      exportPath: path.relative(rootDir, filePath).replace(/\\/gu, "/"),
      replaceTarget: `\\${path.relative(rootDir, filePath).replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`
    }))
    .sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en"));
}

const SUPER_POWER_SCENE_REPLACEMENTS = [
  ["I gave the Island Medallion\nto our hero, Ned Noodlehead!", "我把岛奖章交给了我们的英雄，\n内德·面条头！"],
  ["I think this meteor\nis a nice decoration\nfor the prison.", "我觉得这颗陨石\n很适合当监狱的装饰。"],
  ["It's a good thing those\nvillains are back in prison!", "那些坏蛋又回监狱了，\n真是太好了！"],
  ["The meteor's radioactivity\nhas worn off, so it's\nno longer a threat.", "陨石的放射性已经消退，\n不再构成威胁了。"],
  ["Great work!", "干得漂亮！"],
  ["Thanks, You're a real hero!", "谢谢，你是真正的英雄！"],
  ["Looks like the\nisland is safe again!", "看来这座岛\n又安全了！"],
  ["Well done, kid.\nNot bad at all.", "干得不错，小家伙。\n一点也不赖。"],
  ["Remember, with great power\ncomes great responsibility.", "记住，能力越大，\n责任越大。"],
  ["I'm impressed at what you've\naccomplished. I think you've\ngot what it takes, kid.", "你的成就让我印象深刻。\n我觉得你具备所需的一切，\n小家伙。"],
  ["There's just one more thing\nyou need. You'll find\nit in the phone booth.", "你还需要最后一样东西。\n你会在电话亭里找到它。"],
  ["You're clear to go.", "你可以出发了。"],
  ["Oh good, a new super hero!\nThat last one is just sitting\nup on the Daily Paper Building!", "太好了，来了个新超级英雄！\n上一个还坐在《每日新闻》\n大楼顶上呢！"],
  ["The prison warden and the\nscientist have some things\nfor you over at the prison.", "监狱长和科学家在监狱那边\n有些东西要给你。"],
  ["Those handcuffs will remove\nany villain's super power.", "这副手铐能消除任何反派的\n超能力。"],
  ["The rest is up to you.\nGood luck.", "剩下的就靠你了。\n祝你好运。"],
  ["The villains are all\nback behind bars,\nthanks to Ned Noodlehead\n...oh, and you.", "多亏了内德·面条头……\n哦，还有你，所有反派都\n重回牢笼了。"],
  ["Thanks for your help! That\nCopy Cat was a real trickster.", "谢谢你的帮助！\n那个模仿猫真是个狡猾的家伙。"],
  ["Looks like Speeding Spike\nwasn't fast enough\nto outrun you!", "看来疾速斯派克\n还是没你快！"],
  ["Sir Rebral won't be\nplaying any more of\nhis mind games now!", "瑞布拉尔爵士再也不能玩\n他的心理游戏了！"],
  ["Thanks to you, the\nRatman is caged again!", "多亏了你，鼠人又被\n关起来了！"],
  ["Excellent work! Now\nCrusher's back in his\nold stomping grounds.", "干得漂亮！现在粉碎者\n又回到他的老地盘了。"],
  ["Betty Jetty has finally been\ngrounded, thanks to you!", "多亏了你，贝蒂·杰蒂\n终于被禁足了！"],
  ["Be careful out there!", "在外面要小心！"],
  ["There's been a prison break!\nWe're all in danger!", "监狱发生越狱了！\n我们都有危险！"],
  ["This isn't a safe\nplace for civilians.", "这里对平民来说\n并不安全。"],
  ["We can't let civilians\npast this point. There are\nsuper villains on the loose!", "我们不能让平民通过这里。\n有超级反派在逃！"],
  ["Be careful, there are\nescaped prisoners around!", "小心，附近有\n逃犯出没！"],
  ["Civilians aren't allowed here.\nPlease head back to the mainland.", "平民不得入内。\n请返回大陆。"],
  ["Stand back! This\nthing isn't safe.", "退后！这东西\n不安全。"],
  ["Who are you?", "你是谁？"],
  ["I'm the prison warden.", "我是监狱长。"],
  ["What happened here?", "这里发生了什么？"],
  ["A meteor hit the\nprison and the\nconvicts have escaped!", "有颗陨石砸中了监狱，\n囚犯们全都逃走了！"],
  ["Tell me more about\nthe escaped prisoners.", "再跟我说说\n那些逃犯吧。"],
  ["Here are their\nprofile reports.", "这是他们的\n档案报告。"],
  ["The impact from this meteor\nsent out a radioactive shockwave\nthat mutated the prisoners.", "这颗陨石的撞击释放出\n放射性冲击波，让囚犯们\n发生了变异。"],
  ["So the prisoners\nhave super powers?", "所以那些囚犯\n都有超能力吗？"],
  ["Yes! You'll need these\nanti-power handcuffs\nto capture them.", "没错！你需要这些\n反超能手铐才能\n抓住他们。"],
  ["Are you a real\nsuper hero?", "你是真正的\n超级英雄吗？"],
  ["You better believe it, kid.\nI've defeated more villains\nthan you can count.", "你最好相信，小子。\n我打败的反派比你数过的\n还多。"],
  ["What are you\ndoing up here?", "你在这上面\n做什么？"],
  ["I can't keep up with all\nthese super villains anymore!", "我实在应付不了这么多\n超级反派了！"],
  ["I want to be\na super hero!", "我也想成为\n超级英雄！"],
  ["There's more to it than\nhaving a suit and ID!\nTalk to me after you've\ndefeated at least 5 villains.", "光有制服和证件可不够！\n等你打败至少5个反派\n再来找我。"],
  ['labelText = "TRAVEL";', 'labelText = "旅行";'],
  ['labelText = "ENTER";', 'labelText = "进入";'],
  ['labelText = "GO RIGHT";', 'labelText = "向右";'],
  ['labelText = "GO LEFT";', 'labelText = "向左";'],
  ['labelText = "GO DOWN";', 'labelText = "向下";'],
  ['labelText = "GO UP";', 'labelText = "向上";'],
  ['labelText = "COMMON ROOM";', 'labelText = "公共休息室";'],
  ['desc = ["Costume",426,380];', 'desc = ["服装店",426,380];'],
  ['desc = ["Comic",741,400];', 'desc = ["漫画店",741,400];'],
  ['desc = ["News",642,1050];', 'desc = ["新闻社",642,1050];'],
  ['desc = ["Bank",1295,1220];', 'desc = ["银行",1295,1220];'],
  ['desc = ["Station",234,102];', 'desc = ["车站",234,102];'],
  ['desc = ["Skyscraper",836,3052];', 'desc = ["摩天楼",836,3052];'],
  ['desc = ["Skyscraper",1204,3052];', 'desc = ["摩天楼",1204,3052];']
];

function extractEntry({ archivePath, entryName, outputDir, tarBin }) {
  removeDirContents(outputDir);
  ensureDirSync(outputDir);
  runCommand(tarBin || "tar", ["-xf", archivePath, "-C", outputDir, entryName], `extract ${entryName}`);
  return path.join(outputDir, entryName.replace(/\//gu, path.sep));
}

function exportScripts({ ffdecCli, inputSwf, outputDir }) {
  removeDirContents(outputDir);
  ensureDirSync(outputDir);
  runCommand(ffdecCli, ["-cli", "-export", "script", outputDir, inputSwf], `export scripts ${path.basename(inputSwf)}`);
}

function replaceScriptExport({ ffdecCli, inputSwf, outputSwf, replaceTarget, scriptFile }) {
  ensureDirSync(path.dirname(outputSwf));
  runCommand(ffdecCli, ["-replace", inputSwf, outputSwf, replaceTarget, scriptFile], `replace ${replaceTarget}`);
}

function patchCharScript(content) {
  let nextContent = normalizeScript(content);
  nextContent = replaceRequired(
    nextContent,
    "function showBalloon(balloonFrame, ball)\n{",
    `function decodeZhBalloonText(rawText)
{
   if(rawText == undefined || rawText == null)
   {
      return "";
   }
   var _loc2_ = String(rawText);
   if(_loc2_.indexOf("%u") >= 0)
   {
      return unescape(_loc2_);
   }
   var _loc3_ = _loc2_.split(" ").join("");
   _loc3_ = _loc3_.split("\\r").join("");
   _loc3_ = _loc3_.split("\\n").join("");
   if(_loc3_.length >= 4 && _loc3_.length % 4 == 0)
   {
      var _loc4_ = "0123456789ABCDEFabcdef";
      var _loc5_ = true;
      var _loc6_ = 0;
      while(_loc6_ < _loc3_.length)
      {
         if(_loc4_.indexOf(_loc3_.charAt(_loc6_)) < 0)
         {
            _loc5_ = false;
            break;
         }
         _loc6_ += 1;
      }
      if(_loc5_)
      {
         var _loc7_ = "";
         _loc6_ = 0;
         while(_loc6_ < _loc3_.length)
         {
            _loc7_ += String.fromCharCode(parseInt(_loc3_.substr(_loc6_,4),16));
            _loc6_ += 4;
         }
         return _loc7_;
      }
   }
   return _loc2_;
}
function showBalloon(balloonFrame, ball)
{`,
    "char decode helper insertion"
  );
  nextContent = replaceRequired(
    nextContent,
    `      balloon = _parent.createEmptyMovieClip(balloonName,_parent.balloonDepth);
      _loc5_ = new MovieClipLoader();`,
    `      balloon = _parent.createEmptyMovieClip(balloonName,_parent.balloonDepth);
      if(char.talkyText != undefined)
      {
         char.talkyText = decodeZhBalloonText(char.talkyText);
      }
      _loc5_ = new MovieClipLoader();`,
    "char showBalloon decode injection"
  );
  nextContent = replaceRequired(
    nextContent,
    `      _loc5_.loadClip("popups/balloon.swf",balloon);`,
    `      _loc5_.loadClip("popups/balloon.swf?zhfix=sp2",balloon);`,
    "char normal balloon path patch"
  );
  nextContent = replaceRequired(
    nextContent,
    `function hideBalloon()
{
   this.balloon.string.removeMovieClip();
   this.balloon.removeMovieClip();
}`,
    `function hideBalloon()
{
   if(this.balloon == undefined)
   {
      return undefined;
   }
   if(this.balloon.string != undefined && this.balloon.string.removeMovieClip != undefined)
   {
      this.balloon.string.removeMovieClip();
   }
   if(this.balloon.label != undefined && this.balloon.label.removeTextField != undefined)
   {
      this.balloon.label.removeTextField();
   }
   if(this.balloon.removeMovieClip != undefined)
   {
      this.balloon.removeMovieClip();
   }
}`,
    "char hideBalloon guard patch"
  );
  nextContent = replaceRequired(
    nextContent,
    `   balloon = _parent.createEmptyMovieClip(balloonName,_parent.getNextHighestDepth());
   var _loc4_ = new MovieClipLoader();`,
    `   balloon = _parent.createEmptyMovieClip(balloonName,_parent.getNextHighestDepth());
   if(char.talkyText != undefined)
   {
      char.talkyText = decodeZhBalloonText(char.talkyText);
   }
   var _loc4_ = new MovieClipLoader();`,
    "char counter balloon decode injection"
  );
  nextContent = replaceRequired(
    nextContent,
    `   _loc4_.loadClip("popups/counter/balloon.swf",balloon);`,
    `   _loc4_.loadClip("popups/counter/balloon.swf?zhfix=sp2",balloon);`,
    "char counter balloon path patch"
  );
  return nextContent;
}

function patchSceneScripts(sceneScriptRoot, assetPath) {
  const modifiedEntries = [];
  for (const entry of collectScriptEntries(sceneScriptRoot)) {
    const originalContent = fs.readFileSync(entry.filePath, "utf8");
    let patchedContent = applyLiteralStringReplacements(originalContent, SUPER_POWER_SCENE_REPLACEMENTS);
    patchedContent = applyStaticOverlayPatch(patchedContent, assetPath);
    if (patchedContent === normalizeScript(originalContent)) {
      continue;
    }
    writeText(entry.filePath, patchedContent);
    modifiedEntries.push(entry);
  }
  return modifiedEntries;
}

function patchGameplayScript(content) {
  let nextContent = normalizeScript(content);
  nextContent = replaceRequired(
    nextContent,
    "function showSay(target, sayText, id)\n{",
    `function decodeZhSayText(rawText)
{
   var _loc2_;
   _loc2_ = rawText == undefined || rawText == null ? "" : String(rawText);
   if(_root.decodeZhBalloonText != undefined)
   {
      _loc2_ = _root.decodeZhBalloonText(_loc2_);
   }
   return _loc2_;
}
function normalizeZhSayField(fieldRef)
{
   var fmt;
   if(fieldRef == undefined)
   {
      return undefined;
   }
   fieldRef.embedFonts = false;
   fieldRef.selectable = false;
   fieldRef.multiline = true;
   fieldRef.wordWrap = true;
   fieldRef.autoSize = false;
   fieldRef._width = 188;
   fieldRef._height = 72;
   fieldRef._x = -94;
   fieldRef._y = -34;
   if(fieldRef.__zhFmt == undefined)
   {
      fmt = new TextFormat();
      fmt.font = "_sans";
      fmt.size = 16;
      fmt.color = 0;
      fmt.leading = 2;
      fmt.align = "center";
      fieldRef.setNewTextFormat(fmt);
      fieldRef.__zhFmt = fmt;
   }
   if(fieldRef.__zhFmt != undefined)
   {
      fieldRef.setTextFormat(fieldRef.__zhFmt);
   }
}
function setZhTextFieldValue(fieldRef, rawText)
{
   var _loc2_;
   normalizeZhSayField(fieldRef);
   if(fieldRef == undefined)
   {
      return "";
   }
   _loc2_ = decodeZhSayText(rawText);
   fieldRef.text = _loc2_;
   if(fieldRef.__zhFmt != undefined)
   {
      fieldRef.setTextFormat(fieldRef.__zhFmt);
   }
   fieldRef._height = Math.max(36,Math.min(86,fieldRef.textHeight + 8));
   return _loc2_;
}
function showSay(target, sayText, id)
{`,
    "gameplay showSay helper insertion"
  );
  nextContent = replaceRequired(
    nextContent,
    "   positionChat(say,target);\n   say.fld.htmlText = sayText;",
    `   positionChat(say,target);
   sayText = setZhTextFieldValue(say.fld,sayText);
   say.sizeBubbles();
   positionChat(say,target);`,
    "gameplay showSay text assignment patch"
  );
  nextContent = replaceRequired(
    nextContent,
    "   if(camera.scene.char.targetPlayer.isAd)\n   {",
    `   if(camera.scene.char.targetPlayer != undefined && camera.scene.char.targetPlayer.isAd)
   {`,
    "gameplay targetPlayer isAd guard"
  );
  nextContent = replaceRequired(
    nextContent,
    `   say = this.attachMovie(sayClip,"say" + sayDepth,sayDepth);
   if(camera.scene.char.targetPlayer.isAd)
   {
      say.adText._visible = true;
   }
   else
   {
      say.adText._visible = false;
   }
   positionChat(say,target);`,
    `   say = this.attachMovie(sayClip,"say" + sayDepth,sayDepth);
   if(camera.scene.char.targetPlayer != undefined && camera.scene.char.targetPlayer.isAd)
   {
      say.adText._visible = true;
   }
   else
   {
      say.adText._visible = false;
   }
   positionChat(say,target);`,
    "gameplay showSay isAd guard"
  );
  nextContent = replaceRequired(
    nextContent,
    "         if(!camera.scene.red5 || camera.scene.char.targetPlayer.npc == true)\n         {",
    `         if(!camera.scene.red5 || camera.scene.char.targetPlayer == undefined || camera.scene.char.targetPlayer.npc == true)
         {`,
    "gameplay targetPlayer npc guard"
  );
  nextContent = replaceRequired(
    nextContent,
    "            else if(camera.scene.char.targetPlayer.interaction == \"chat\")\n            {",
    `            else if(camera.scene.char.targetPlayer != undefined && camera.scene.char.targetPlayer.interaction == "chat")
            {`,
    "gameplay targetPlayer interaction guard"
  );
  nextContent = replaceRequired(
    nextContent,
    `function hideSay(target)
{
   this["say" + target.sayDepth].onEnterFrame = shrinkSay;
   target.talking = false;
   target.avatar.head.mouth.gotoAndStop(target.avatar.mouthFrame);
   target.avatar.head.eyes.pupils.gotoAndStop(1);
   target.engaged = false;
   target.targeted = false;
}`,
    `function hideSay(target)
{
   if(target == undefined || target.sayDepth == undefined || this["say" + target.sayDepth] == undefined)
   {
      return undefined;
   }
   this["say" + target.sayDepth].onEnterFrame = shrinkSay;
   target.talking = false;
   target.avatar.head.mouth.gotoAndStop(target.avatar.mouthFrame);
   target.avatar.head.eyes.pupils.gotoAndStop(1);
   target.engaged = false;
   target.targeted = false;
}`,
    "gameplay hideSay guard patch"
  );
  return nextContent;
}

const SAY_CLIP_FRAME1_SCRIPT = `function ensureZhField()
{
   var fmt;
   fld.embedFonts = false;
   fld.selectable = false;
   fld.multiline = true;
   fld.wordWrap = true;
   fld.autoSize = false;
   fld._width = 188;
   fld._height = 72;
   fld._x = -94;
   fld._y = -34;
   fmt = new TextFormat();
   fmt.font = "_sans";
   fmt.size = 16;
   fmt.color = 0;
   fmt.leading = 2;
   fmt.align = "center";
   fld.setNewTextFormat(fmt);
   fld.setTextFormat(fmt);
   fld.__zhFmt = fmt;
}
function sizeBubbles()
{
   fld._height = Math.max(36,Math.min(86,fld.textHeight + 8));
   txtBox._x = fld._x + fld._width / 2;
   txtBox._y = fld._y + fld._height / 2;
   txtBox._width = fld._width + padding * 2;
   txtBox._height = fld._height + padding * 2;
   clipHeight = txtBox._height;
}
padding = 10;
clipHeight = txtBox._height;
ensureZhField();
sizeBubbles();`;

const CHAT_FRAME1_SCRIPT = `function ensureZhField(fieldRef)
{
   var fmt;
   fieldRef.embedFonts = false;
   fieldRef.selectable = false;
   fieldRef.multiline = true;
   fieldRef.wordWrap = true;
   fieldRef.autoSize = "center";
   fmt = new TextFormat();
   fmt.font = "_sans";
   fmt.size = 16;
   fmt.color = 0;
   fmt.leading = 2;
   fieldRef.setNewTextFormat(fmt);
   fieldRef.setTextFormat(fmt);
   fieldRef.__zhFmt = fmt;
}
stop();
clipHeight = 36;
ensureZhField(fld1);
ensureZhField(fld2);
ensureZhField(fld3);`;

const BALLOON_FRAME1_SCRIPT = `function decodeBalloonText(rawText)
{
   var textValue;
   if(rawText == undefined || rawText == null)
   {
      return "";
   }
   textValue = String(rawText);
   if(char != undefined && char.decodeZhBalloonText != undefined)
   {
      textValue = char.decodeZhBalloonText(textValue);
   }
   return textValue;
}
function ensureBalloonLabel()
{
   var fmt;
   if(label == undefined)
   {
      createTextField("label",3,0,0,220,96);
      label.multiline = true;
      label.wordWrap = true;
      label.selectable = false;
      label.embedFonts = false;
      fmt = new TextFormat();
      fmt.font = "_sans";
      fmt.size = 18;
      fmt.bold = true;
      fmt.leading = 2;
      fmt.align = "center";
      fmt.color = 0;
      label.setNewTextFormat(fmt);
      label.__fmt = fmt;
   }
}
function layoutBalloonLabel()
{
   var bounds;
   var widthValue;
   var heightValue;
   var textValue;
   ensureBalloonLabel();
   bounds = shape.getBounds(this);
   if(bounds.xMax <= bounds.xMin || bounds.yMax <= bounds.yMin)
   {
      label._x = -110;
      label._y = -78;
      label._width = 220;
      label._height = 96;
   }
   else
   {
      widthValue = Math.max(96,bounds.xMax - bounds.xMin - 30);
      heightValue = Math.max(32,bounds.yMax - bounds.yMin - 42);
      label._x = bounds.xMin + Math.max(12,Math.round((bounds.xMax - bounds.xMin - widthValue) / 2));
      label._y = bounds.yMin + 12;
      label._width = widthValue;
      label._height = heightValue;
   }
   textValue = char != undefined ? decodeBalloonText(char.talkyText) : "";
   if(label.__textValue != textValue)
   {
      label.text = textValue;
      label.setTextFormat(label.__fmt);
      label.__textValue = textValue;
   }
}
function init()
{
   speed = 0.8;
   t = 0;
   this._x = char._x;
   this._y = char._y - 160;
   vx = 0;
   vy = 0;
   ax = 0;
   ay = 0;
   damp = 0.85;
   r = 130;
   avatarScale = 0.36;
   stringName = char._name + "BalloonString";
   string = scene.createEmptyMovieClip(stringName,scene.getNextHighestDepth());
   ensureBalloonLabel();
   onEnterFrame = function()
   {
      dir = Math.abs(char._xscale) / char._xscale;
      scaleMag = char._yscale / 100;
      if(!char.speed)
      {
         char.speed = 0;
      }
      if(!char.vSpeed)
      {
         char.vSpeed = 0;
      }
      tx = char._x + scaleMag * (dir * char.avatar._x + dir * avatarScale * char.avatar.hand1._x) + char.speed;
      ty = char._y + scaleMag * (char.avatar._y + avatarScale * char.avatar.hand1._y) + char.vSpeed;
      dx = tx - this._x;
      dy = ty - r - this._y;
      ax = dx / 40;
      ay = dy / 40;
      vx += ax;
      vy += ay;
      vx *= damp;
      vy *= damp;
      this._x += vx;
      this._y += vy;
      speed = Math.sqrt(vx * vx + vy * vy);
      this._rotation += (-1.5 * vx - this._rotation) / 4;
      string.clear();
      string.lineStyle(1,16777215);
      string.moveTo(tx,ty);
      string.lineTo(this._x,this._y);
      layoutBalloonLabel();
      if(char == undefined || !char.avatar)
      {
         if(string != undefined)
         {
            string.removeMovieClip();
         }
         this.removeMovieClip();
         return undefined;
      }
      if(char._visible && !_parent.pausedGame && dy > -100)
      {
         char.vSpeed -= 1.3;
      }
   };
   if(char == scene.char)
   {
      shape.onRollOver = _root.useArrow;
      shape.onRelease = function()
      {
         delete _root.char.avatar.FunBrain_so.data.counterBalloonFrame;
         delete _root.camera.scene.lastBalloon;
         delete onEnterFrame;
         nextFrame();
      };
   }
}
stop();
scene = this._parent;
avatarScale = 0.36;
onEnterFrame = function()
{
   if(_root.sceneIsVisible && char != undefined)
   {
      init();
   }
};`;

function main() {
  const config = loadConfig();
  if (!config.sources?.as2Gamezip || !fileExists(config.sources.as2Gamezip)) {
    throw new Error("AS2.zip is not configured.");
  }
  if (!config.tools?.ffdecCli || !fileExists(config.tools.ffdecCli)) {
    throw new Error("FFDec CLI is not configured.");
  }

  const tempRoot = path.join(paths.tempDir, "super-power-balloon-proof");
  removeDirContents(tempRoot);
  ensureDirSync(tempRoot);

  ensureDirSync(paths.as2PackDir);
  for (const subdir of ["swf", "files", "swf-scripts", "swf-texts"]) {
    const targetDir = path.join(paths.as2PackDir, subdir);
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  const sceneSwf = extractEntry({
    archivePath: config.sources.as2Gamezip,
    entryName: SCENE_ENTRY,
    outputDir: path.join(tempRoot, "scene-src"),
    tarBin: config.tools.tarBin
  });
  const downtownSwf = extractEntry({
    archivePath: config.sources.as2Gamezip,
    entryName: DOWNTOWN_ENTRY,
    outputDir: path.join(tempRoot, "downtown-src"),
    tarBin: config.tools.tarBin
  });
  const gameplaySwf = extractEntry({
    archivePath: config.sources.as2Gamezip,
    entryName: GAMEPLAY_ENTRY,
    outputDir: path.join(tempRoot, "gameplay-src"),
    tarBin: config.tools.tarBin
  });
  const charSwf = extractEntry({
    archivePath: config.sources.as2Gamezip,
    entryName: CHAR_ENTRY,
    outputDir: path.join(tempRoot, "char-src"),
    tarBin: config.tools.tarBin
  });
  const counterBalloonSwf = extractEntry({
    archivePath: config.sources.as2Gamezip,
    entryName: COUNTER_BALLOON_ENTRY,
    outputDir: path.join(tempRoot, "balloon-src"),
    tarBin: config.tools.tarBin
  });

  const sceneScriptRoot = path.join(tempRoot, "scene-scripts");
  exportScripts({ ffdecCli: config.tools.ffdecCli, inputSwf: sceneSwf, outputDir: sceneScriptRoot });
  const scenePatchedScripts = patchSceneScripts(sceneScriptRoot, SCENE_ENTRY);

  const downtownScriptRoot = path.join(tempRoot, "downtown-scripts");
  exportScripts({ ffdecCli: config.tools.ffdecCli, inputSwf: downtownSwf, outputDir: downtownScriptRoot });
  const downtownPatchedScripts = patchSceneScripts(downtownScriptRoot, DOWNTOWN_ENTRY);

  const gameplayScriptRoot = path.join(tempRoot, "gameplay-scripts");
  exportScripts({ ffdecCli: config.tools.ffdecCli, inputSwf: gameplaySwf, outputDir: gameplayScriptRoot });
  const gameplayScriptPath = path.join(gameplayScriptRoot, "scripts", "frame_1", "DoAction.as");
  writeText(gameplayScriptPath, patchGameplayScript(fs.readFileSync(gameplayScriptPath, "utf8")));
  const sayClipScriptPath = path.join(gameplayScriptRoot, "scripts", "DefineSprite_78_SayClip", "frame_1", "DoAction.as");
  writeText(sayClipScriptPath, SAY_CLIP_FRAME1_SCRIPT);
  const peanutsSayClipScriptPath = path.join(gameplayScriptRoot, "scripts", "DefineSprite_73_SayClipPeanuts", "frame_1", "DoAction.as");
  writeText(peanutsSayClipScriptPath, SAY_CLIP_FRAME1_SCRIPT);
  const chatScriptPath = path.join(gameplayScriptRoot, "scripts", "DefineSprite_109_Chat", "frame_1", "DoAction.as");
  writeText(chatScriptPath, CHAT_FRAME1_SCRIPT);

  const charScriptRoot = path.join(tempRoot, "char-scripts");
  exportScripts({ ffdecCli: config.tools.ffdecCli, inputSwf: charSwf, outputDir: charScriptRoot });
  const charScriptPath = path.join(charScriptRoot, "scripts", "frame_1", "DoAction.as");
  writeText(charScriptPath, patchCharScript(fs.readFileSync(charScriptPath, "utf8")));

  const balloonScriptRoot = path.join(tempRoot, "balloon-scripts", "scripts", "frame_1");
  ensureDirSync(balloonScriptRoot);
  const balloonScriptPath = path.join(balloonScriptRoot, "DoAction.as");
  writeText(balloonScriptPath, BALLOON_FRAME1_SCRIPT);

  const swfRoot = path.join(paths.as2PackDir, "swf");
  ensureDirSync(swfRoot);

  const sceneOutput = path.join(swfRoot, SCENE_ENTRY.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(sceneOutput));
  if (scenePatchedScripts.length === 0) {
    fs.copyFileSync(sceneSwf, sceneOutput);
  } else {
    let currentSceneInput = sceneSwf;
    for (const entry of scenePatchedScripts) {
      replaceScriptExport({
        ffdecCli: config.tools.ffdecCli,
        inputSwf: currentSceneInput,
        outputSwf: sceneOutput,
        replaceTarget: entry.replaceTarget,
        scriptFile: entry.filePath
      });
      currentSceneInput = sceneOutput;
    }
  }

  const downtownOutput = path.join(swfRoot, DOWNTOWN_ENTRY.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(downtownOutput));
  if (downtownPatchedScripts.length === 0) {
    fs.copyFileSync(downtownSwf, downtownOutput);
  } else {
    let currentDowntownInput = downtownSwf;
    for (const entry of downtownPatchedScripts) {
      replaceScriptExport({
        ffdecCli: config.tools.ffdecCli,
        inputSwf: currentDowntownInput,
        outputSwf: downtownOutput,
        replaceTarget: entry.replaceTarget,
        scriptFile: entry.filePath
      });
      currentDowntownInput = downtownOutput;
    }
  }

  const gameplayOutput = path.join(swfRoot, GAMEPLAY_ENTRY.replace(/\//gu, path.sep));
  replaceScriptExport({
    ffdecCli: config.tools.ffdecCli,
    inputSwf: gameplaySwf,
    outputSwf: gameplayOutput,
    replaceTarget: "\\frame_1\\DoAction",
    scriptFile: gameplayScriptPath
  });
  replaceScriptExport({
    ffdecCli: config.tools.ffdecCli,
    inputSwf: gameplayOutput,
    outputSwf: gameplayOutput,
    replaceTarget: "\\DefineSprite_78_SayClip\\frame_1\\DoAction",
    scriptFile: sayClipScriptPath
  });
  replaceScriptExport({
    ffdecCli: config.tools.ffdecCli,
    inputSwf: gameplayOutput,
    outputSwf: gameplayOutput,
    replaceTarget: "\\DefineSprite_73_SayClipPeanuts\\frame_1\\DoAction",
    scriptFile: peanutsSayClipScriptPath
  });
  replaceScriptExport({
    ffdecCli: config.tools.ffdecCli,
    inputSwf: gameplayOutput,
    outputSwf: gameplayOutput,
    replaceTarget: "\\DefineSprite_109_Chat\\frame_1\\DoAction",
    scriptFile: chatScriptPath
  });

  const charOutput = path.join(swfRoot, CHAR_ENTRY.replace(/\//gu, path.sep));
  replaceScriptExport({
    ffdecCli: config.tools.ffdecCli,
    inputSwf: charSwf,
    outputSwf: charOutput,
    replaceTarget: "\\frame_1\\DoAction",
    scriptFile: charScriptPath
  });

  const counterBalloonOutput = path.join(swfRoot, COUNTER_BALLOON_ENTRY.replace(/\//gu, path.sep));
  replaceScriptExport({
    ffdecCli: config.tools.ffdecCli,
    inputSwf: counterBalloonSwf,
    outputSwf: counterBalloonOutput,
    replaceTarget: "\\frame_1\\DoAction",
    scriptFile: balloonScriptPath
  });

  const balloonOutput = path.join(swfRoot, BALLOON_ENTRY.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(balloonOutput));
  fs.copyFileSync(counterBalloonOutput, balloonOutput);

  const manifestPath = path.join(paths.as2PackDir, "manifest.json");
  writeJson(manifestPath, {
    generatedAt: new Date().toISOString(),
    sourceGroup: "as2",
    canonicalKeys: ["super-power"],
    assetsPatched: 6,
    externalTextAssets: [],
    swfPatchedAssets: [
      { assetId: "super-power-proof:scene", assetPath: SCENE_ENTRY, outputPath: sceneOutput },
      { assetId: "super-power-proof:downtown", assetPath: DOWNTOWN_ENTRY, outputPath: downtownOutput },
      { assetId: "super-power-proof:gameplay", assetPath: GAMEPLAY_ENTRY, outputPath: gameplayOutput },
      { assetId: "super-power-proof:char", assetPath: CHAR_ENTRY, outputPath: charOutput },
      { assetId: "super-power-proof:counter-balloon", assetPath: COUNTER_BALLOON_ENTRY, outputPath: counterBalloonOutput },
      { assetId: "super-power-proof:balloon", assetPath: BALLOON_ENTRY, outputPath: balloonOutput }
    ],
    pendingSwfAssets: []
  });

  console.log(JSON.stringify({
    ok: true,
    sentinelText: SENTINEL_TEXT,
    outputs: {
      scene: sceneOutput,
      downtown: downtownOutput,
      gameplay: gameplayOutput,
      char: charOutput,
      counterBalloon: counterBalloonOutput,
      balloon: balloonOutput
    }
  }, null, 2));
}

main();
