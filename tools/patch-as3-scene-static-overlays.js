const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadConfig } = require("./lib/config");
const paths = require("./lib/paths");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const { ensureDirSync, fileExists, readJson, removeDirContents, writeJson, writeText } = require("./lib/fs-utils");
const { printJson } = require("./lib/cli");

const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const GAME_SCENE_CLASS = "game.scene.template.GameScene";

const STATIC_SCENE_OVERLAYS = [
  {
    groupPrefix: "scenes/mocktropica/mainStreet/",
    overlays: [
      {
        type: "sign",
        x: 3660,
        y: 1484,
        width: 500,
        height: 176,
        fill: "0x263F4C",
        alpha: 1,
        lines: ["波普托皮卡", "全球总部", "新管理层接管中"]
      },
      {
        type: "sign",
        x: 3088,
        y: 956,
        width: 462,
        height: 278,
        fill: "0x226B7B",
        alpha: 0.95,
        lines: ["发型俱乐部", "", ""]
      },
      {
        type: "label",
        x: 3231,
        y: 1563,
        width: 112,
        height: 34,
        fill: "0xB55260",
        alpha: 0.78,
        text: "波普托皮卡",
        fontSize: 18,
        textColor: "0x632D36",
        bold: true
      },
      {
        type: "label",
        x: 3356,
        y: 1563,
        width: 112,
        height: 34,
        fill: "0xB55260",
        alpha: 0.78,
        text: "波普托皮卡",
        fontSize: 18,
        textColor: "0x632D36",
        bold: true
      }
    ]
  },
  {
    groupPrefix: "scenes/con1/parking/",
    overlays: [
      {
        type: "label",
        x: 708,
        y: 1094,
        width: 150,
        height: 36,
        fill: "0xE8CC77",
        alpha: 0.98,
        text: "佩佩的",
        fontSize: 25,
        textColor: "0x8E3D3D",
        bold: true
      },
      {
        type: "label",
        x: 718,
        y: 1124,
        width: 130,
        height: 35,
        fill: "0xE8CC77",
        alpha: 0.98,
        text: "披萨",
        fontSize: 25,
        textColor: "0x8E3D3D",
        bold: true
      },
      {
        type: "label",
        x: 722,
        y: 1154,
        width: 130,
        height: 36,
        fill: "0xE8CC77",
        alpha: 0.98,
        text: "泡芙",
        fontSize: 25,
        textColor: "0x8E3D3D",
        bold: true
      },
      {
        type: "label",
        x: 516,
        y: 1242,
        width: 132,
        height: 74,
        fill: "0x76B5D1",
        alpha: 0.82,
        text: "泡芙",
        fontSize: 25,
        textColor: "0xDDF7FF",
        bold: true
      },
      {
        type: "label",
        x: 22,
        y: 1286,
        width: 132,
        height: 34,
        fill: "0x214E76",
        alpha: 0.96,
        text: "洗手间",
        fontSize: 21,
        textColor: "0xFFE35B",
        bold: true
      },
      {
        type: "label",
        x: 535,
        y: 1356,
        width: 88,
        height: 70,
        fill: "0x4A4650",
        alpha: 0.96,
        text: "新鲜现做",
        fontSize: 17,
        textColor: "0xEFE8D8",
        bold: true
      },
      {
        type: "label",
        x: 642,
        y: 1384,
        width: 175,
        height: 42,
        fill: "0xB14134",
        alpha: 0.82,
        text: "佩佩的",
        fontSize: 24,
        textColor: "0x8E2622",
        bold: true
      },
      {
        type: "label",
        x: 300,
        y: 1140,
        width: 88,
        height: 30,
        fill: "0x392A54",
        alpha: 0.92,
        text: "小马",
        fontSize: 18,
        textColor: "0xEEDCFF",
        bold: true
      },
      {
        type: "label",
        x: 296,
        y: 1208,
        width: 98,
        height: 130,
        fill: "0x392A54",
        alpha: 0.92,
        text: "低语者",
        fontSize: 20,
        textColor: "0xEEDCFF",
        bold: true
      }
    ]
  },
  {
    groupPrefix: "scenes/carnival/mainStreet/",
    overlays: [
      {
        type: "label",
        x: 1518,
        y: 966,
        width: 392,
        height: 52,
        fill: "0x93AF45",
        alpha: 1,
        text: "药剂店",
        fontSize: 34,
        textColor: "0xF0FFD0",
        bold: true
      },
      {
        type: "label",
        x: 1518,
        y: 1014,
        width: 392,
        height: 30,
        fill: "0x496A2A",
        alpha: 1,
        text: "药品 化学套装 矿物",
        fontSize: 18,
        textColor: "0xF0FFD0",
        bold: true
      },
      {
        type: "label",
        x: 1932,
        y: 1008,
        width: 520,
        height: 55,
        fill: "0x99C5CB",
        alpha: 0.96,
        text: "嘉年华来了",
        fontSize: 29,
        textColor: "0xC64E83",
        bold: true
      },
      {
        type: "label",
        x: 2128,
        y: 808,
        width: 72,
        height: 180,
        fill: "0x6A9A8F",
        alpha: 0.88,
        text: "餐厅",
        fontSize: 24,
        textColor: "0x87FF7A",
        bold: true
      },
      {
        type: "label",
        x: 1798,
        y: 1082,
        width: 130,
        height: 104,
        fill: "0xCFA6DF",
        alpha: 0.88,
        text: "嘉年华",
        fontSize: 22,
        textColor: "0x6B347A",
        bold: true
      },
      {
        type: "label",
        x: 2720,
        y: 1088,
        width: 140,
        height: 112,
        fill: "0x79AEC0",
        alpha: 0.9,
        text: "圣代冰淇淋",
        fontSize: 19,
        textColor: "0xF3F6EA",
        bold: true
      }
    ]
  },
  {
    groupPrefix: "scenes/virusHunter/mainStreet/",
    overlays: [
      {
        type: "label",
        x: 2168,
        y: 908,
        width: 455,
        height: 58,
        fill: "0xC7C8AE",
        alpha: 1,
        text: "市政厅",
        fontSize: 38,
        textColor: "0x6E715F",
        bold: true
      },
      {
        type: "label",
        x: 1432,
        y: 1188,
        width: 112,
        height: 44,
        fill: "0x2F75B7",
        alpha: 0.98,
        text: "公交",
        fontSize: 27,
        textColor: "0xF6F7D3",
        bold: true
      },
      {
        type: "label",
        x: 1284,
        y: 1244,
        width: 188,
        height: 82,
        fill: "0x83C7CD",
        alpha: 0.92,
        text: "到此一游",
        fontSize: 22,
        textColor: "0x4FD2D7",
        bold: true
      },
      {
        type: "label",
        x: 1478,
        y: 1252,
        width: 190,
        height: 90,
        fill: "0x86C9CF",
        alpha: 0.92,
        text: "末日将近",
        fontSize: 25,
        textColor: "0x5A42D2",
        bold: true
      },
      {
        type: "label",
        x: 1596,
        y: 1366,
        width: 92,
        height: 36,
        fill: "0x36A848",
        alpha: 0.96,
        text: "垃圾",
        fontSize: 24,
        textColor: "0xC7FFC8",
        bold: true
      },
      {
        type: "label",
        x: 2115,
        y: 1268,
        width: 138,
        height: 34,
        fill: "0x9BD790",
        alpha: 0.95,
        text: "波普新闻",
        fontSize: 16,
        textColor: "0x257C4C",
        bold: true
      },
      {
        type: "label",
        x: 2110,
        y: 1324,
        width: 142,
        height: 32,
        fill: "0x10B957",
        alpha: 0.96,
        text: "招聘吗",
        fontSize: 17,
        textColor: "0xC9FFD8",
        bold: true
      },
      {
        type: "stack",
        x: 2530,
        y: 1216,
        width: 260,
        height: 160,
        fill: "0xD8C28C",
        alpha: 0.96,
        textColor: "0x5A4732",
        fontSize: 24,
        bold: true,
        lines: ["今日公告", "法庭听证", "失物招领"]
      }
    ]
  },
  {
    groupPrefix: "scenes/timmy/mainStreet/",
    overlays: [
      {
        type: "label",
        x: 4822,
        y: 1070,
        width: 640,
        height: 116,
        fill: "0xF3D46E",
        alpha: 0.96,
        text: "保龄球馆",
        fontSize: 58,
        textColor: "0xB45CD3",
        bold: true
      },
      {
        type: "label",
        x: 4878,
        y: 1186,
        width: 520,
        height: 76,
        fill: "0xF7D777",
        alpha: 0.96,
        text: "球道",
        fontSize: 48,
        textColor: "0x4268B9",
        bold: true
      },
      {
        type: "label",
        x: 4722,
        y: 1344,
        width: 138,
        height: 132,
        fill: "0x66CFE6",
        alpha: 0.9,
        text: "营业中",
        fontSize: 28,
        textColor: "0xEF4A72",
        bold: true
      }
    ]
  }
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

function as3String(value) {
  return JSON.stringify(String(value || ""));
}

function as3Number(value) {
  if (typeof value === "string") {
    return value;
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value));
}

function as3Bool(value) {
  return value ? "true" : "false";
}

function renderOverlayCall(overlay) {
  if (overlay.type === "sign") {
    const lines = overlay.lines || [];
    return `            this.zhAddStaticSceneSign(_loc2_,${as3Number(overlay.x)},${as3Number(overlay.y)},${as3Number(overlay.width)},${as3Number(overlay.height)},${as3Number(overlay.fill)},${as3Number(overlay.alpha)},${as3String(lines[0])},${as3String(lines[1])},${as3String(lines[2])});`;
  }
  if (overlay.type === "label") {
    return `            this.zhAddStaticLabelPatch(_loc2_,${as3Number(overlay.x)},${as3Number(overlay.y)},${as3Number(overlay.width)},${as3Number(overlay.height)},${as3Number(overlay.fill)},${as3Number(overlay.alpha)},${as3String(overlay.text)},${as3Number(overlay.fontSize)},${as3Number(overlay.textColor)},${as3Bool(overlay.bold)});`;
  }
  if (overlay.type === "stack") {
    const lines = overlay.lines || [];
    return `            this.zhAddStaticStackPatch(_loc2_,${as3Number(overlay.x)},${as3Number(overlay.y)},${as3Number(overlay.width)},${as3Number(overlay.height)},${as3Number(overlay.fill)},${as3Number(overlay.alpha)},${as3Number(overlay.textColor)},${as3Number(overlay.fontSize)},${as3Bool(overlay.bold)},${as3String(lines[0])},${as3String(lines[1])},${as3String(lines[2])});`;
  }
  throw new Error(`Unsupported overlay type: ${overlay.type}`);
}

function renderSceneCases() {
  return STATIC_SCENE_OVERLAYS.map((scene) => {
    const calls = scene.overlays.map(renderOverlayCall).join("\n");
    return `         if(_loc1_ == ${as3String(scene.groupPrefix)})\n         {\n${calls}\n         }`;
  }).join("\n");
}

function renderOverlayMethods() {
  const sceneCases = renderSceneCases();
  return `
      
      private function zhApplyStaticSceneTextOverlays() : void
      {
         var _loc2_:Sprite = null;
         var _loc1_:String = String(super.groupPrefix || "");
         if(_hitContainer == null || _loc1_ == "" || _hitContainer.getChildByName("zhStaticSceneTextOverlays") != null)
         {
            return;
         }
         _loc2_ = new Sprite();
         _loc2_.name = "zhStaticSceneTextOverlays";
         _loc2_.mouseEnabled = false;
         _loc2_.mouseChildren = false;
${sceneCases}
         if(_loc2_.numChildren > 0)
         {
            this.zhAddStaticOverlayLayer(_loc2_);
         }
      }
      
      private function zhAddStaticOverlayLayer(param1:Sprite) : void
      {
         var _loc2_:Display = null;
         var _loc3_:DisplayObject = null;
         var _loc4_:int = 0;
         if(_hitContainer == null || param1 == null)
         {
            return;
         }
         _hitContainer.addChild(param1);
         if(super.shellApi && super.shellApi.player)
         {
            _loc2_ = super.shellApi.player.get(Display);
            if(_loc2_ != null)
            {
               _loc3_ = _loc2_.displayObject;
               if(_loc3_ != null && _loc3_.parent == _hitContainer)
               {
                  _loc4_ = Math.max(0,_hitContainer.getChildIndex(_loc3_));
                  _hitContainer.setChildIndex(param1,_loc4_);
               }
            }
         }
      }
      
      private function zhAddStaticSceneSign(param1:Sprite, param2:Number, param3:Number, param4:Number, param5:Number, param6:uint, param7:Number, param8:String, param9:String, param10:String) : void
      {
         var _loc11_:Sprite = null;
         if(param1 == null)
         {
            return;
         }
         _loc11_ = new Sprite();
         _loc11_.mouseEnabled = false;
         _loc11_.mouseChildren = false;
         _loc11_.x = param2;
         _loc11_.y = param3;
         _loc11_.graphics.beginFill(param6,param7);
         _loc11_.graphics.drawRoundRect(0,0,param4,param5,14,14);
         _loc11_.graphics.endFill();
         _loc11_.graphics.lineStyle(4,0x8FCDE0,1);
         _loc11_.graphics.drawRoundRect(3,3,param4 - 6,param5 - 6,12,12);
         this.zhAddStaticText(_loc11_,param8,0,24,param4,70,44,0xF4FAFF,true);
         this.zhAddStaticText(_loc11_,param9,0,88,param4,48,31,0xD7ECF6,true);
         this.zhAddStaticText(_loc11_,param10,0,142,param4,40,24,0xFFE0D6,true);
         param1.addChild(_loc11_);
      }
      
      private function zhAddStaticLabelPatch(param1:Sprite, param2:Number, param3:Number, param4:Number, param5:Number, param6:uint, param7:Number, param8:String, param9:Number, param10:uint, param11:Boolean) : void
      {
         var _loc12_:Sprite = null;
         if(param1 == null)
         {
            return;
         }
         _loc12_ = new Sprite();
         _loc12_.mouseEnabled = false;
         _loc12_.mouseChildren = false;
         _loc12_.x = param2;
         _loc12_.y = param3;
         _loc12_.graphics.beginFill(param6,param7);
         _loc12_.graphics.drawRoundRect(0,0,param4,param5,4,4);
         _loc12_.graphics.endFill();
         this.zhAddStaticText(_loc12_,param8,0,Math.max(0,(param5 - param9 - 6) * 0.5),param4,param5,param9,param10,param11);
         param1.addChild(_loc12_);
      }
      
      private function zhAddStaticStackPatch(param1:Sprite, param2:Number, param3:Number, param4:Number, param5:Number, param6:uint, param7:Number, param8:uint, param9:Number, param10:Boolean, param11:String, param12:String, param13:String) : void
      {
         var _loc14_:Sprite = null;
         var _loc15_:Number = Number(NaN);
         var _loc16_:Number = Number(NaN);
         if(param1 == null)
         {
            return;
         }
         _loc14_ = new Sprite();
         _loc14_.mouseEnabled = false;
         _loc14_.mouseChildren = false;
         _loc14_.x = param2;
         _loc14_.y = param3;
         _loc14_.graphics.beginFill(param6,param7);
         _loc14_.graphics.drawRoundRect(0,0,param4,param5,10,10);
         _loc14_.graphics.endFill();
         _loc15_ = Math.max(18,param9 + 4);
         _loc16_ = Math.max(0,(param5 - _loc15_ * 3) * 0.5);
         this.zhAddStaticText(_loc14_,param11,0,_loc16_,param4,_loc15_,param9,param8,param10);
         this.zhAddStaticText(_loc14_,param12,0,_loc16_ + _loc15_,param4,_loc15_,param9,param8,param10);
         this.zhAddStaticText(_loc14_,param13,0,_loc16_ + _loc15_ * 2,param4,_loc15_,param9,param8,param10);
         param1.addChild(_loc14_);
      }
      
      private function zhAddStaticText(param1:Sprite, param2:String, param3:Number, param4:Number, param5:Number, param6:Number, param7:Number, param8:uint, param9:Boolean) : void
      {
         var _loc10_:TextField = null;
         var _loc11_:TextFormat = null;
         if(param1 == null)
         {
            return;
         }
         _loc10_ = new TextField();
         _loc10_.mouseEnabled = false;
         _loc10_.selectable = false;
         _loc10_.embedFonts = false;
         _loc10_.multiline = false;
         _loc10_.wordWrap = false;
         _loc10_.autoSize = TextFieldAutoSize.NONE;
         _loc10_.x = param3;
         _loc10_.y = param4;
         _loc10_.width = param5;
         _loc10_.height = param6;
         _loc11_ = new TextFormat("_sans",param7,param8,param9,null,null,null,null,"center");
         _loc10_.defaultTextFormat = _loc11_;
         _loc10_.text = param2;
         _loc10_.setTextFormat(_loc11_);
         param1.addChild(_loc10_);
      }
`;
}

function patchGameScene(content) {
  let next = String(content || "").replace(/\r\n/gu, "\n");
  next = addImport(next, "   import flash.display.DisplayObjectContainer;", "   import flash.display.DisplayObject;");
  next = addImport(next, "   import flash.display.Sprite;", "   import flash.text.TextField;");
  next = addImport(next, "   import flash.text.TextField;", "   import flash.text.TextFieldAutoSize;");
  next = addImport(next, "   import flash.text.TextFieldAutoSize;", "   import flash.text.TextFormat;");

  next = next.replace(/            this\.zhApplyStaticSceneTextOverlays\(\);\n/gu, "");
  if (!next.includes("this.zhApplyStaticSceneTextOverlays();")) {
    const loadedAnchor = "         super.loaded();\n         super.shellApi.defaultCursor = defaultCursor;";
    if (!next.includes(loadedAnchor)) {
      throw new Error("Unable to locate GameScene.loaded() anchor.");
    }
    next = next.replace(
      loadedAnchor,
      "         super.loaded();\n         this.zhApplyStaticSceneTextOverlays();\n         super.shellApi.defaultCursor = defaultCursor;"
    );
  }

  const marker = "\n      protected function addGroups";
  const markerIndex = next.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error("Unable to locate GameScene addGroups marker.");
  }
  const methods = renderOverlayMethods();
  const existingStart = next.indexOf("\n      private function zhApplyStaticSceneTextOverlays");
  if (existingStart !== -1 && existingStart < markerIndex) {
    next = `${next.slice(0, existingStart)}${methods}${next.slice(markerIndex)}`;
  } else {
    next = `${next.slice(0, markerIndex)}${methods}${next.slice(markerIndex)}`;
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

  const workDir = path.join(paths.tempDir, "as3-scene-static-overlays-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);
  const scriptRoot = path.join(workDir, "scripts");
  const outputSwf = path.join(workDir, "Shell.swf");

  runFfdec(ffdecCli, [
    "-cli",
    "-selectclass",
    GAME_SCENE_CLASS,
    "-export",
    "script",
    scriptRoot,
    packShell
  ], "export GameScene");

  const gameScenePath = findScript(scriptRoot, "game/scene/template/GameScene.as");
  if (!gameScenePath) {
    throw new Error("Unable to find exported GameScene.as.");
  }

  const originalScript = fs.readFileSync(gameScenePath, "utf8");
  const patchedScript = patchGameScene(originalScript);
  writeText(gameScenePath, patchedScript);

  runFfdec(ffdecCli, [
    "-replace",
    packShell,
    outputSwf,
    GAME_SCENE_CLASS,
    gameScenePath
  ], "replace GameScene");

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
  manifest.swfPatchedAssets = Array.isArray(manifest.swfPatchedAssets) ? manifest.swfPatchedAssets : [];
  manifest.swfPatchedAssets.push({
    assetId: "as3-shell:scene-static-text-overlays",
    assetPath: AS3_SHELL_PATH,
    outputPath: packShell,
    classes: [GAME_SCENE_CLASS],
    scenes: STATIC_SCENE_OVERLAYS.map((scene) => scene.groupPrefix)
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
    gameScenePath,
    patch: "data-driven static scene-art Chinese overlays via GameScene",
    scenes: STATIC_SCENE_OVERLAYS.map((scene) => ({
      groupPrefix: scene.groupPrefix,
      overlays: scene.overlays.map((overlay) => overlay.text || (overlay.lines || []).filter(Boolean).join(" / "))
    }))
  };
  const reportPath = path.join(paths.qaDir, "as3", "as3-scene-static-overlays-patch.json");
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
}

main();
