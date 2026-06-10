const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");
const paths = require("./paths");
const { ensureDirSync, fileExists, hashFile, listFilesRecursive, readJson, removeDirContents, writeJson, writeText } = require("./fs-utils");
const { normalizeTranslatedText } = require("./text-utils");
const { generateAs3MapLogoOverrides } = require("./as3-logo-overrides");

const RUNTIME_FIX_VERSION = 20;
// Startup/login SWFs are excluded from the default runtime override set.
// They still rely on embedded legacy fonts, and forcing Chinese into those
// text fields can blank the buttons or destabilize the first menu. We keep
// the default runtime zip to external text assets until a dedicated SWF/font
// patch path is ready.
const SAFE_RUNTIME_SWF_PATTERNS = [
  /content\/www\.poptropica\.com\/game\/Shell\.swf$/iu,
  /content\/www\.poptropica\.com\/scenes\/islandHome\/sceneHome\.swf$/iu,
  /content\/www\.poptropica\.com\/game\/assets\/scenes\/map\/map\/interactive\.swf$/iu,
  /content\/www\.poptropica\.com\/game\/assets\/scenes\/map\/map\/islands\/[^/]+\/logo\.swf$/iu
];
const AS3_SHELL_PATH = "content/www.poptropica.com/game/Shell.swf";
const AS2_SUPER_POWER_GAMEPLAY_PATH = "content/www.poptropica.com/gameplay.swf";
const AS2_SUPER_POWER_FRAMEWORK_PATH = "content/www.poptropica.com/framework.swf";
const AS2_SUPER_POWER_BASE_PAGE_PATH = "content/www.poptropica.com/base.php";
const AS2_SHARED_GET_INVENTORY_MENU_PATH = "content/www.poptropica.com/get_inventory_menu.php";
const AS2_SHARED_INVENTORY_PATH = "content/www.poptropica.com/popups/inventory.swf";
const AS2_SHARED_WARDROBE_PATH = "content/www.poptropica.com/popups/wardrobe.swf";
const AS2_SHARED_MAP_PATH = "content/www.poptropica.com/popups/map.swf";
const AS2_SHARED_TRAVELMAP_PATH = "content/www.poptropica.com/popups/travelmap.swf";
const AS2_SHARED_RESTART_ISLAND_PATH = "content/www.poptropica.com/flashpoint/restartIsland.swf";
const AS2_SUPER_POWER_SHARED_CHAR_PATH = "content/www.poptropica.com/char.swf";
const AS2_SUPER_POWER_COUNTER_BALLOON_PATH = "content/www.poptropica.com/popups/counter/balloon.swf";
const AS2_SUPER_POWER_BALLOON_PATH = "content/www.poptropica.com/popups/balloon.swf";
const AS2_SUPER_POWER_SCENE_PATH = "content/www.poptropica.com/scenes/islandSuper/sceneSuperMain.swf";
const AS2_SUPER_POWER_DOWNTOWN_PATH = "content/www.poptropica.com/scenes/islandSuper/sceneDownTown.swf";
const AS2_STANDARD_GAMEPLAY_OFFSET_X = 186;
const AS2_STANDARD_GAMEPLAY_OFFSET_Y = 322;
const AS2_SUPER_POWER_SCENE_SWF_PATTERN = /content\/www\.poptropica\.com\/(?:flashpoint\/originalFiles\/)?scenes\/islandSuper\/scene[^/]+\.swf$/iu;
const AS2_SUPER_POWER_OPTIONAL_UI_SWF_PATTERN = /content\/www\.poptropica\.com\/popups\/super[^/]+\.swf$/iu;
const AS2_SUPER_POWER_SENTINEL_TEXT = "原版气泡中文测试";
const AS2_ROOM_NAME_LINE_PATTERN = /\broomName\s*=/iu;
const AS2_SUPER_POWER_SHARED_SWF_TEXT_SKIP_PATHS = new Set([
  AS2_SUPER_POWER_GAMEPLAY_PATH,
  AS2_SUPER_POWER_SHARED_CHAR_PATH,
  AS2_SUPER_POWER_COUNTER_BALLOON_PATH,
  AS2_SUPER_POWER_BALLOON_PATH
]);
const SKIP_RUNTIME_FILE_PATTERNS = [
  /content\/www\.poptropica\.com\/game\/data\/languages\/en\/islands\/start\/language\.xml$/iu,
  /content\/www\.poptropica\.com\/game\/data\/languages\/en\/shared\/language\.xml$/iu
];

const AS2_SHARED_INVENTORY_TEXT_REPLACEMENTS = [
  ["TYPE", "类型"],
  ["Turn off special effects", "关闭特效"],
  ["cancel", "取消"],
  ["ok", "确定"],
  ["PAGE", "页数"],
  ["You don't have any store items yet.", "你还没有任何商店物品。"],
  ["Visit the store to get the latest costumes and cool stuff!", "去商店看看，拿到最新服装和酷炫道具！"],
  ["You don’t have any items for this island yet.", "你在这座岛上还没有获得任何道具。"],
  ["You don't have any items for this island yet.", "你在这座岛上还没有获得任何道具。"],
  ["You don’t have any items for this campaign yet.", "你在这个章节里还没有任何道具。"],
  ["You don't have any items for this campaign yet.", "你在这个章节里还没有任何道具。"],
  ["Explore Poptropica to see what you can find!", "继续探索 Poptropica，看看你能发现什么！"],
  ["As a member, you have access to use all costumes and gold cards in the store-check it often for new items!", "成为会员后，你可以使用商店里的全部服装和金卡；记得常来看看新物品！"],
  ["WANT EARLY ACCESS TO THE LATEST ISLAND & USE OF ALL COSTUMES AND GOLD CARDS IN THE STORE? GET A POPTROPICA MEMBERSHIP!", "想抢先体验最新岛屿，并使用商店里的全部服装和金卡吗？快来开通 Poptropica 会员！"],
  ["Remove from store items", "从商店物品中移除"],
  ["renew your membership", "续费会员"],
  ["get with credits", "用点数获取"],
  ["DATE", "日期"],
  ["SORT", "排序"],
  ["Store membership items", "会员商店物品"],
  ["your items", "你的物品"]
];

const AS2_SHARED_WARDROBE_TEXT_REPLACEMENTS = [
  ["replace", "替换"],
  ["GO TO closet", "前往衣橱"],
  ["COSTUMIZER", "服装搭配"],
  ["YOUR CLOSET IS FULL!", "你的衣橱已满！"],
  ["saving...", "保存中..."],
  ["saving..", "保存中.."],
  ["saving.", "保存中."],
  ["saving", "保存中"],
  ["Look Saved!", "造型已保存！"],
  ["accept", "确认"],
  ["cancel", "取消"],
  ["save look to closet", "保存造型到衣橱"],
  ["click on [space 21]the [space 20]things you [", "点击[space 21]你想[space 20]穿上的物品["],
  ["want to wear", "来穿戴"],
  ["want to undo or remove", "想取消或移除"],
  ["Click Replace[space 5] to remove[space 6] this old [", "点击“替换”[space 5]即可移除[space 6]这套旧["],
  ["outfit and replace it with your [", "装扮，并换成你的["],
  ["new one, or[space 61] go [space 23]to your[space 60] closet [space 22]to [", "新造型，或者[space 61]前往[space 23]你的[space 60]衣橱[space 22]来["],
  ["pick a different one.", "挑选另一套。"],
  ["Save up to 30 looks in [", "最多可保存 30 套造型到["],
  ["your very own costume [", "你自己的服装["],
  ["closet with Membership!", "衣橱中，会员专享！"],
  ["learn more", "了解更多"]
];

const AS2_SHARED_MAP_TEXT_REPLACEMENTS = [
  ["cancel", "取消"],
  ["restart", "重置"],
  ["Restart Island?", "重启岛屿？"],
  ["Sorry, but there [\ny 960\n]is not a map for [\nx 920\ny 1520\n]this island.", "抱歉，这座岛[\ny 960\n]暂时没有[\nx 920\ny 1520\n]地图。"],
  ["the PURPLE\nGIANT", "紫色\n巨人"],
  ["Restart [\nx 220\ny 660\n]Island", "重启[\nx 220\ny 660\n]岛屿"]
];

const AS2_SHARED_TRAVELMAP_TEXT_REPLACEMENTS = [
  ["MORE\nISLANDS", "更多\n岛屿"],
  ["MORE ISLANDS", "更多岛屿"]
];

function applyExactReplacements(content, rows) {
  const ordered = [...rows]
    .filter((row) => row.source_text && row.translated_text)
    .sort((left, right) => right.source_text.length - left.source_text.length);
  let nextContent = content;
  for (const row of ordered) {
    const translatedText = normalizeTranslatedText(row.translated_text, row.source_text);
    nextContent = nextContent.split(row.source_text).join(translatedText);
  }
  return nextContent;
}

function applyStringPairReplacements(content, replacements) {
  const ordered = [...replacements]
    .filter(([sourceValue, translatedValue]) => sourceValue && translatedValue)
    .sort((left, right) => String(right[0]).length - String(left[0]).length);
  let nextContent = String(content || "");
  for (const [sourceValue, translatedValue] of ordered) {
    nextContent = nextContent.split(String(sourceValue)).join(String(translatedValue));
  }
  return nextContent;
}

function escapeForRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const UNSAFE_XML_LEAF_TAGS = new Set([
  "event",
  "eventsClass",
  "island",
  "islandFolder",
  "scene",
  "animation",
  "component",
  "data",
  "asset",
  "assets",
  "bitmap",
  "playerMap",
  "medallion",
  "islandMain",
  "pageFolder",
  "folder",
  "layout",
  "id",
  "class",
  "type",
  "action",
  "url",
  "path",
  "target",
  "source",
  "item",
  "fontfamily",
  "align",
  "verticalalign",
  "letterspacing",
  "leading",
  "marginleft",
  "marginright",
  "indent",
  "underline",
  "italic",
  "bold",
  "size",
  "color",
  "absoluteFilePaths",
  "sceneType",
  "movieClip",
  "clip",
  "background",
  "elementsToBitmap",
  "subGroup",
  "visible",
  "card"
]);

const UNSAFE_XML_CONTAINER_TAGS = new Set([
  "permanentEvents",
  "itemIdMap",
  "pages",
  "properties",
  "sceneMap",
  "eventMap"
]);

const CHARACTER_LOOK_XML_LEAF_TAGS = new Set([
  "gender",
  "skinColor",
  "hairColor",
  "body",
  "eyeState",
  "marks",
  "mouth",
  "facial",
  "head",
  "hair",
  "pants",
  "shirt",
  "overpants",
  "overshirt",
  "item",
  "item2",
  "pack",
  "eyes",
  "talkMouth"
]);

const UNSAFE_JSON_KEYS = new Set([
  "id",
  "event",
  "eventsClass",
  "island",
  "islandFolder",
  "scene",
  "playerMap",
  "medallion",
  "pageFolder",
  "path",
  "url",
  "href",
  "src",
  "target",
  "source",
  "asset",
  "file"
]);

const SAFE_XML_ATTR_NAMES = new Set([
  "name",
  "title",
  "label",
  "description",
  "text",
  "value",
  "tooltip",
  "caption",
  "message",
  "hint",
  "displayname",
  "display",
  "subtitle",
  "instructions",
  "prompt",
  "question",
  "answer"
]);

const UNSAFE_XML_ATTR_NAMES = new Set([
  "id",
  "event",
  "eventsclass",
  "island",
  "islandfolder",
  "scene",
  "animation",
  "component",
  "class",
  "type",
  "action",
  "url",
  "path",
  "target",
  "source",
  "href",
  "src",
  "link",
  "linkentityid",
  "triggerevent",
  "triggereventargs",
  "clustername",
  "playermap"
]);

const CJK_FONT_CHAIN = "SimHei, Microsoft YaHei UI, Microsoft YaHei, Arial Unicode MS, _sans";
const SWF_FONT_FILE_CANDIDATES = {
  simhei: [
    "C:\\Windows\\Fonts\\simhei.ttf"
  ],
  "microsoft yahei": [
    "C:\\Windows\\Fonts\\msyh.ttc",
    "C:\\Windows\\Fonts\\msyhbd.ttc",
    "C:\\Windows\\Fonts\\msyhl.ttc"
  ],
  "arial unicode ms": [
    "C:\\Windows\\Fonts\\ARIALUNI.ttf"
  ],
  fallback: [
    "C:\\Windows\\Fonts\\simhei.ttf",
    "C:\\Windows\\Fonts\\ARIALUNI.ttf",
    "C:\\Windows\\Fonts\\msyh.ttc",
    "C:\\Windows\\Fonts\\simsun.ttc"
  ]
};

function encodeNonAsciiAsHtmlEntities(text) {
  return String(text || "").replace(/[^\x00-\x7F]/gu, (character) => {
    const codePoint = character.codePointAt(0);
    return `&#${codePoint};`;
  });
}

function safeParseContext(row) {
  try {
    return JSON.parse(row.context_json || "{}");
  } catch (_error) {
    return {};
  }
}

function getLastPathSegment(pathSegments = []) {
  const normalized = [...pathSegments].reverse().find((segment) => segment && !/^\[\d+\]$/u.test(segment));
  return normalized || null;
}

function isSafeXmlRow(assetPath, row) {
  const context = safeParseContext(row);
  const pathSegments = Array.isArray(context.path) ? context.path : [];
  const leaf = getLastPathSegment(pathSegments);
  if (!leaf && context.kind !== "xml-attr") {
    return false;
  }

  if (context.kind === "xml-text") {
    if (/\/game\/data\/entity\/character\/partKeys\/[^/]+\.xml$/iu.test(assetPath)) {
      return false;
    }
    if (/\/framework\/data\/config\.xml$/iu.test(assetPath)) {
      return leaf === "clusterName";
    }
    if (UNSAFE_XML_LEAF_TAGS.has(leaf)) {
      return false;
    }
    if (
      CHARACTER_LOOK_XML_LEAF_TAGS.has(leaf) &&
      (
        /\/game\/data\/scenes\//iu.test(assetPath) ||
        /\/game\/data\/entity\/character\//iu.test(assetPath)
      )
    ) {
      return false;
    }
    if (pathSegments.some((segment) => UNSAFE_XML_CONTAINER_TAGS.has(segment))) {
      return false;
    }
    if (assetPath.includes("/game/data/scenes/") && /^(scene|event|action|path|url)$/iu.test(leaf)) {
      return false;
    }
    return true;
  }

  if (context.kind === "xml-attr") {
    const attr = String(context.attr || "").toLowerCase();
    if (!attr || UNSAFE_XML_ATTR_NAMES.has(attr)) {
      return false;
    }
    if (!SAFE_XML_ATTR_NAMES.has(attr)) {
      return false;
    }
    if (pathSegments.some((segment) => UNSAFE_XML_CONTAINER_TAGS.has(segment))) {
      return false;
    }
    return true;
  }

  return false;
}

function isSafeJsonRow(row) {
  const context = safeParseContext(row);
  if (context.kind !== "json") {
    return false;
  }
  const pathSegments = Array.isArray(context.path) ? context.path : [];
  const leaf = getLastPathSegment(pathSegments);
  if (!leaf) {
    return false;
  }
  return !UNSAFE_JSON_KEYS.has(leaf);
}

function setValueAtPath(root, pathSegments, value) {
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) {
    return false;
  }

  let current = root;
  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const segment = pathSegments[index];
    const arrayMatch = /^\[(\d+)\]$/u.exec(segment);
    if (arrayMatch) {
      current = current?.[Number.parseInt(arrayMatch[1], 10)];
    } else {
      current = current?.[segment];
    }
    if (current === undefined || current === null) {
      return false;
    }
  }

  const lastSegment = pathSegments[pathSegments.length - 1];
  const arrayMatch = /^\[(\d+)\]$/u.exec(lastSegment);
  if (arrayMatch) {
    const arrayIndex = Number.parseInt(arrayMatch[1], 10);
    if (!Array.isArray(current) || arrayIndex >= current.length) {
      return false;
    }
    current[arrayIndex] = value;
    return true;
  }

  if (typeof current !== "object" || current === null || !(lastSegment in current)) {
    return false;
  }
  current[lastSegment] = value;
  return true;
}

function applyXmlTranslations(content, assetPath, rows) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: false
  });
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    indentBy: "\t",
    suppressEmptyNode: false
  });

  let parsed;
  try {
    parsed = parser.parse(content);
  } catch (_error) {
    return content;
  }

  let applied = 0;
  for (const row of rows) {
    if (!isSafeXmlRow(assetPath, row)) {
      continue;
    }
    const context = safeParseContext(row);
    const translatedText = normalizeTranslatedText(row.translated_text, row.source_text);
    const pathSegments = context.kind === "xml-attr"
      ? [...(Array.isArray(context.path) ? context.path : []), `@_${context.attr}`]
      : context.path;
    if (setValueAtPath(parsed, pathSegments, translatedText)) {
      applied += 1;
    }
  }

  if (applied === 0) {
    return content;
  }

  return builder.build(parsed);
}

function applyLanguageXmlValueReplacements(content, assetPath, rows) {
  let nextContent = content;
  let applied = 0;

  for (const row of rows) {
    if (!isSafeXmlRow(assetPath, row)) {
      continue;
    }

    const context = safeParseContext(row);
    if (context.kind !== "xml-text") {
      continue;
    }

    const pathSegments = Array.isArray(context.path) ? context.path : [];
    const leaf = getLastPathSegment(pathSegments);
    if (!leaf) {
      continue;
    }

    const sourceText = String(row.source_text || "");
    if (!sourceText || /<(?:font|p|br)\b/iu.test(sourceText)) {
      continue;
    }

    const translatedText = normalizeTranslatedText(row.translated_text, row.source_text);
    const tagPattern = escapeForRegExp(leaf);
    const sourcePattern = escapeForRegExp(sourceText);

    const cdataPattern = new RegExp(
      `(<${tagPattern}(?:\\s[^>]*)?>\\s*<!\\[CDATA\\[)${sourcePattern}(\\]\\]>\\s*</${tagPattern}>)`,
      "gu"
    );
    const textPattern = new RegExp(
      `(<${tagPattern}(?:\\s[^>]*)?>\\s*)${sourcePattern}(\\s*</${tagPattern}>)`,
      "gu"
    );

    const withCdata = nextContent.replace(cdataPattern, `$1${translatedText}$2`);
    if (withCdata !== nextContent) {
      nextContent = withCdata;
      applied += 1;
      continue;
    }

    const withText = nextContent.replace(textPattern, `$1${translatedText}$2`);
    if (withText !== nextContent) {
      nextContent = withText;
      applied += 1;
    }
  }

  return {
    content: nextContent,
    applied
  };
}

function shouldUseExactXmlReplacement(assetPath, rows) {
  if (!/\/game\/data\/languages\//iu.test(assetPath)) {
    return false;
  }
  return rows.some((row) => typeof row.source_text === "string" && /<(?:font|p|br)\b/iu.test(row.source_text));
}

function applyJsonTranslations(content, rows) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_error) {
    return content;
  }

  let applied = 0;
  for (const row of rows) {
    if (!isSafeJsonRow(row)) {
      continue;
    }
    const context = safeParseContext(row);
    const translatedText = normalizeTranslatedText(row.translated_text, row.source_text);
    if (setValueAtPath(parsed, context.path, translatedText)) {
      applied += 1;
    }
  }

  if (applied === 0) {
    return content;
  }

  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function applyPhpTranslations(content, rows) {
  const replacements = [];

  for (const row of rows) {
    const context = safeParseContext(row);
    if (context.kind !== "php-value") {
      continue;
    }

    const valueStart = Number(context.valueStart);
    const valueEnd = Number(context.valueEnd);
    if (!Number.isFinite(valueStart) || !Number.isFinite(valueEnd) || valueStart < 0 || valueEnd < valueStart) {
      continue;
    }

    let translatedText = normalizeTranslatedText(row.translated_text, row.source_text);
    const quote = context.quote === '"' ? '"' : "'";
    translatedText = translatedText
      .replace(/\\/gu, "\\\\")
      .replace(quote === "'" ? /'/gu : /"/gu, quote === "'" ? "\\'" : '\\"');

    replacements.push({
      start: valueStart,
      end: valueEnd,
      value: translatedText
    });
  }

  if (!replacements.length) {
    return content;
  }

  replacements.sort((left, right) => right.start - left.start);
  let nextContent = content;
  for (const replacement of replacements) {
    nextContent = `${nextContent.slice(0, replacement.start)}${replacement.value}${nextContent.slice(replacement.end)}`;
  }
  return nextContent;
}

function applyStructuredReplacements(content, assetType, assetPath, rows) {
  if (assetType === "xml") {
    const htmlRows = rows.filter((row) => typeof row.source_text === "string" && /<(?:font|p|br)\b/iu.test(row.source_text));
    const attrRows = rows.filter((row) => safeParseContext(row).kind === "xml-attr");
    const textRows = rows.filter((row) => !htmlRows.includes(row) && safeParseContext(row).kind === "xml-text");

    let nextContent = content;
    if (textRows.length > 0) {
      nextContent = applyLanguageXmlValueReplacements(nextContent, assetPath, textRows).content;
    }
    if (attrRows.length > 0) {
      nextContent = applyXmlTranslations(nextContent, assetPath, attrRows);
    }
    if (htmlRows.length > 0) {
      nextContent = applyExactReplacements(nextContent, htmlRows);
    }

    return nextContent;
  }
  if (assetType === "json") {
    return applyJsonTranslations(content, rows);
  }
  if (assetType === "php") {
    return applyPhpTranslations(content, rows);
  }
  return applyExactReplacements(content, rows);
}

function applyFlashSafeTypography(assetPath, content) {
  if (!assetPath) {
    return content;
  }

  if (assetPath === "content/www.poptropica.com/game/data/languages/en/islands/start/language.xml") {
    const normalized = content
      // Flash start-screen HTML text renders more reliably with device fonts than
      // with legacy embedded font names inside this runtime.
      .replace(/face="SimHei"/gu, 'face="_sans"')
      .replace(/face="Microsoft YaHei UI"/gu, 'face="_sans"')
      .replace(/face="Microsoft YaHei"/gu, 'face="_sans"')
      .replace(/face="Arial Unicode MS"/gu, 'face="_sans"')
      .replace(/face="CreativeBlock BB Bold"/gu, 'face="_sans"')
      .replace(/face="CreativeBlock BB"/gu, 'face="_sans"');
    return encodeNonAsciiAsHtmlEntities(normalized);
  }

  if (/\/game\/style\/styles\.xml$/iu.test(assetPath)) {
    let next = content.replace(/<fontfamily>([^<]*)<\/fontfamily>/giu, `<fontfamily>${CJK_FONT_CHAIN}</fontfamily>`);
    next = next.replace(/<bold>\s*false\s*<\/bold>/giu, "<bold>true</bold>");
    return next;
  }

  return content;
}

function getPackPaths(sourceGroup) {
  const baseDir = sourceGroup === "as2" ? paths.as2PackDir : paths.as3PackDir;
  return {
    baseDir,
    filesDir: path.join(baseDir, "files"),
    swfDir: path.join(baseDir, "swf"),
    runtimeZipPath: sourceGroup === "as2" ? paths.as2RuntimeZipPath : paths.as3RuntimeZipPath
  };
}

function findSevenZip(config) {
  const candidates = [
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "x64", "7za.exe") : null,
    config?.sources?.flashpointRoot ? path.join(config.sources.flashpointRoot, "Launcher", "extern", "7zip-bin", "win", "ia32", "7za.exe") : null,
    "C:\\Program Files\\AMD\\CIM\\Bin64\\7z.exe",
    "C:\\Program Files\\Autodesk\\AdODIS\\V1\\Setup\\7za.exe"
  ];
  return candidates.find((candidate) => candidate && fileExists(candidate)) || null;
}

function validateZipArchive(sevenZip, zipPath) {
  if (!sevenZip || !zipPath || !fileExists(zipPath)) {
    return false;
  }
  const result = spawnSync(sevenZip, ["t", zipPath], {
    encoding: "utf8",
    windowsHide: true
  });
  return result.status === 0;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function replaceFileWithRetry(sourcePath, targetPath, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : 8;
  const retryDelayMs = Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : 500;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (fileExists(targetPath)) {
        fs.rmSync(targetPath, { force: true, maxRetries: 5, retryDelay: 150 });
      }
      fs.renameSync(sourcePath, targetPath);
      return { ok: true, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (!fileExists(sourcePath) || attempt >= retries) {
        break;
      }
      sleepSync(retryDelayMs * Math.min(attempt + 1, 4));
    }
  }

  return {
    ok: false,
    error: lastError instanceof Error ? lastError.message : String(lastError || "Unable to replace file")
  };
}

function hashReplacementSet(replacements) {
  const hash = crypto.createHash("sha256");
  for (const replacement of [...replacements].sort((left, right) => left.entryName.localeCompare(right.entryName, "en"))) {
    hash.update(replacement.entryName);
    hash.update("\n");
    hash.update(hashFile(replacement.sourceFilePath));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function shouldIncludeRuntimeSwfOverride(entryName, includeAllSwfRuntimeOverrides) {
  if (includeAllSwfRuntimeOverrides) {
    return true;
  }
  return SAFE_RUNTIME_SWF_PATTERNS.some((pattern) => pattern.test(entryName));
}

function shouldIncludeRuntimeFileOverride(entryName) {
  return !SKIP_RUNTIME_FILE_PATTERNS.some((pattern) => pattern.test(entryName));
}

function collectRuntimeReplacementsForSourceGroup(sourceGroup, options = {}) {
  const packPaths = getPackPaths(sourceGroup);
  const includeSwfRuntimeOverrides = options.includeSwfRuntimeOverrides ?? (
    sourceGroup === "as2" || process.env.POPTROPICA_ENABLE_SWF_RUNTIME_OVERRIDES === "1"
  );
  const replacements = [];

  if (fileExists(packPaths.filesDir)) {
    for (const filePath of listFilesRecursive(packPaths.filesDir)) {
      const entryName = path.relative(packPaths.filesDir, filePath).replace(/\\/gu, "/");
      if (!shouldIncludeRuntimeFileOverride(entryName)) {
        continue;
      }
      replacements.push({
        type: "file",
        entryName,
        sourceFilePath: filePath
      });
    }
  }

  if (fileExists(packPaths.swfDir)) {
    for (const filePath of listFilesRecursive(packPaths.swfDir)) {
      const entryName = path.relative(packPaths.swfDir, filePath).replace(/\\/gu, "/");
      if (!shouldIncludeRuntimeSwfOverride(entryName, includeSwfRuntimeOverrides)) {
        continue;
      }
      replacements.push({
        type: "swf",
        entryName,
        sourceFilePath: filePath
      });
    }
  }

  return replacements;
}

function patchRuntimeRenderMode(workingDir) {
  const runtimeRoot = path.join(workingDir, "content", "www.poptropica.com");
  if (!fileExists(runtimeRoot)) {
    return {
      patchedFiles: []
    };
  }

  const patchedFiles = [];
  const candidates = listFilesRecursive(runtimeRoot).filter((filePath) => /\.(?:php|html?|txt)$/iu.test(filePath));
  for (const filePath of candidates) {
    const entryName = path.relative(workingDir, filePath).replace(/\\/gu, "/");
    const original = fs.readFileSync(filePath, "utf8");
    let next = original
      .replace(/wmode=(["'])gpu\1/giu, "wmode=$1direct$1")
      .replace(/(<param[^>]+name=(["'])wmode\2[^>]+value=(["']))gpu((["'][^>]*>))/giu, "$1direct$4")
      .replace(/(<embed[^>]+wmode=(["']))gpu((["'][^>]*>))/giu, "$1direct$3");
    if (entryName === "content/www.poptropica.com/base.php") {
      next = applyAs3BasePageLayoutPatch(next);
    }

    if (next !== original) {
      writeText(filePath, next);
      patchedFiles.push(entryName);
    }
  }

  return {
    patchedFiles
  };
}

function applyAs3BasePageLayoutPatch(content) {
  if (!/SCENE_AS3_START/u.test(content)) {
    return content;
  }
  const stylePattern = /<style>[\s\S]*?<\/style>/u;
  if (!stylePattern.test(content)) {
    return content;
  }
  const patchedStyle = content.replace(stylePattern, `<style>
            html, body {
                margin: 0;
                width: 100%;
                height: 100%;
                overflow: hidden !important;
                background-color: #139ffd;
            }
            body { position: relative; }
            embed {
                background-color: #0099ff;
                outline-width: 0;
                position: absolute;
                left: 0;
                top: 0;
                width: 100vw;
                height: 100vh;
            }
        </style>`);
  return patchedStyle.replace(
    /width="<\?php echo \$width; \?>" height="<\?php echo \$height; \?>"/u,
    `width="100%" height="100%"`
  );
}

function runFfdecCommand(ffdecCli, args) {
  const timeoutMs = Number(process.env.POPTROPICA_FFDEC_TIMEOUT_MS || 180000);
  const result = spawnSync(ffdecCli, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 180000
  });
  const stderr = (result.stderr || "").trim();
  const stdout = (result.stdout || "").trim();
  const combined = [stderr, stdout].filter(Boolean).join("\n");
  const severeMatch = /SEVERE:\s*(.+)$/imu.exec(combined);
  const timedOut = result.error?.code === "ETIMEDOUT";
  return {
    ok: result.status === 0 && !severeMatch && !timedOut,
    error: timedOut ? `FFDec command timed out after ${timeoutMs}ms` : severeMatch ? severeMatch[1].trim() : combined,
    stdout,
    stderr
  };
}

function findPreferredSwfFontFile(config) {
  const preferredFont = String(config?.preferences?.preferredFont || "").toLowerCase();
  const candidates = [];

  if (preferredFont.includes("simhei")) {
    candidates.push(...SWF_FONT_FILE_CANDIDATES.simhei);
  }
  if (preferredFont.includes("yahei")) {
    candidates.push(...SWF_FONT_FILE_CANDIDATES["microsoft yahei"]);
  }
  if (preferredFont.includes("arial unicode")) {
    candidates.push(...SWF_FONT_FILE_CANDIDATES["arial unicode ms"]);
  }

  candidates.push(...SWF_FONT_FILE_CANDIDATES.fallback);
  return candidates.find((candidate) => fileExists(candidate)) || null;
}

function exportFormattedSwfTexts({ ffdecCli, inputSwf, outputDir }) {
  removeDirContents(outputDir);
  ensureDirSync(outputDir);
  const result = runFfdecCommand(ffdecCli, ["-cli", "-format", "text:formatted", "-export", "text", outputDir, inputSwf]);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "FFDec formatted text export failed"
    };
  }
  return {
    ok: true,
    outputDir
  };
}

function replaceFormattedVisibleText(content, translatedText) {
  const source = String(content || "");
  let index = 0;
  while (source[index] === "[") {
    const closingIndex = source.indexOf("]", index);
    if (closingIndex < 0) {
      return `${source}\n${translatedText}`;
    }
    index = closingIndex + 1;
    while (source[index] === "\r" || source[index] === "\n") {
      index += 1;
    }
  }

  const prefix = source.slice(0, index);
  const suffix = source.endsWith("\n") ? "\n" : "";
  return `${prefix}${translatedText}${suffix}`;
}

function normalizeSwfTextFileContent(content) {
  const normalized = String(content || "").replace(/\r?\n/gu, "\r\n");
  return normalized.endsWith("\r\n") ? normalized : `${normalized}\r\n`;
}

function splitFormattedTextSections(content) {
  const source = String(content || "");
  let index = 0;
  while (source[index] === "[") {
    const closingIndex = source.indexOf("]", index);
    if (closingIndex < 0) {
      return {
        prefix: source,
        bodyLines: [],
        suffix: source.endsWith("\n") ? "\n" : ""
      };
    }
    index = closingIndex + 1;
    while (source[index] === "\r" || source[index] === "\n") {
      index += 1;
    }
  }

  const prefix = source.slice(0, index);
  const suffix = source.endsWith("\n") ? "\n" : "";
  const body = suffix ? source.slice(index, -suffix.length) : source.slice(index);
  return {
    prefix,
    bodyLines: body.length ? body.split(/\r?\n/u) : [],
    suffix
  };
}

function sanitizeFormattedTextMetadata(prefix, translatedLines = []) {
  const hasNonAscii = translatedLines.some((line) => /[^\x00-\x7F]/u.test(String(line || "")));
  if (!hasNonAscii) {
    return prefix;
  }

  return prefix
    .split(/\r?\n/u)
    .filter((line) => !/^\s*spacing(?:pair)?\s+/iu.test(line))
    .join("\n");
}

function extractFontIdsFromFormattedText(content) {
  const fontIds = new Set();
  const pattern = /^font\s+(\d+)$/gimu;
  let match = pattern.exec(content);
  while (match) {
    fontIds.add(Number.parseInt(match[1], 10));
    match = pattern.exec(content);
  }
  return [...fontIds].filter(Number.isInteger);
}

function buildFormattedSwfTextPatch({ assetRows, inputSwf, ffdecCli, translatedTextRoot }) {
  const formattedExportRoot = path.join(paths.tempDir, `swf-formatted-export-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const exportResult = exportFormattedSwfTexts({
    ffdecCli,
    inputSwf,
    outputDir: formattedExportRoot
  });
  if (!exportResult.ok) {
    return {
      ok: false,
      error: exportResult.error
    };
  }

  const groupedRows = new Map();
  for (const row of assetRows) {
    const context = JSON.parse(row.context_json || "{}");
    if (context.kind && context.kind !== "swf-text") {
      continue;
    }
    if (!context.exportPath) {
      continue;
    }
    if (!groupedRows.has(context.exportPath)) {
      groupedRows.set(context.exportPath, []);
    }
    groupedRows.get(context.exportPath).push({
      ...row,
      lineNumber: Number(context.lineNumber || 1)
    });
  }

  const translatedFiles = [];
  const fontIds = new Set();
  for (const [exportPath, exportRows] of groupedRows.entries()) {
    const sourceFile = path.join(formattedExportRoot, exportPath);
    if (!fileExists(sourceFile)) {
      continue;
    }

    const sourceContent = fs.readFileSync(sourceFile, "utf8");
    const { prefix, bodyLines, suffix } = splitFormattedTextSections(sourceContent);
    const nextBodyLines = [...bodyLines];
    for (const row of exportRows.sort((left, right) => left.lineNumber - right.lineNumber)) {
      const targetIndex = Math.max(0, row.lineNumber - 1);
      if (targetIndex >= nextBodyLines.length) {
        continue;
      }
      nextBodyLines[targetIndex] = normalizeTranslatedText(row.translated_text, row.source_text);
    }

    const sanitizedPrefix = sanitizeFormattedTextMetadata(prefix, nextBodyLines);
    const nextContent = `${sanitizedPrefix}${nextBodyLines.join("\n")}${suffix}`;
    if (nextContent === sourceContent) {
      continue;
    }

    for (const fontId of extractFontIdsFromFormattedText(sourceContent)) {
      fontIds.add(fontId);
    }

    const targetFile = path.join(translatedTextRoot, exportPath);
    ensureDirSync(path.dirname(targetFile));
    writeText(targetFile, normalizeSwfTextFileContent(nextContent));
    translatedFiles.push({
      filePath: targetFile,
      exportPath
    });
  }

  removeDirContents(formattedExportRoot);

  return {
    ok: true,
    translatedFiles: translatedFiles.sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en")),
    fontIds: [...fontIds].sort((left, right) => left - right)
  };
}

function collectFontIdsFromFormattedExport({ formattedExportRoot, exportPaths = [] }) {
  const fontIds = new Set();
  for (const exportPath of exportPaths) {
    const formattedFile = path.join(formattedExportRoot, exportPath);
    if (!fileExists(formattedFile)) {
      continue;
    }
    const content = fs.readFileSync(formattedFile, "utf8");
    for (const fontId of extractFontIdsFromFormattedText(content)) {
      fontIds.add(fontId);
    }
  }
  return [...fontIds].sort((left, right) => left - right);
}

function collectFontIdsByExportPath({ formattedExportRoot, exportPaths = [] }) {
  const byExportPath = new Map();
  for (const exportPath of exportPaths) {
    const formattedFile = path.join(formattedExportRoot, exportPath);
    if (!fileExists(formattedFile)) {
      continue;
    }
    const content = fs.readFileSync(formattedFile, "utf8");
    const fontIds = extractFontIdsFromFormattedText(content);
    byExportPath.set(exportPath, fontIds.sort((left, right) => left - right));
  }
  return byExportPath;
}

function buildPlainSwfTextPatch({ assetRows, sourceTextRoot, inputSwf, ffdecCli, translatedTextRoot }) {
  const translatedFiles = buildTranslatedSwfFiles({
    assetRows,
    sourceTextRoot,
    translatedTextRoot
  });

  if (translatedFiles.length === 0) {
    return {
      ok: true,
      translatedFiles: [],
      fontIds: [],
      formattedFallbackFilesByExportPath: new Map(),
      cleanupPaths: []
    };
  }

  const formattedExportRoot = path.join(paths.tempDir, `swf-formatted-export-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const exportResult = exportFormattedSwfTexts({
    ffdecCli,
    inputSwf,
    outputDir: formattedExportRoot
  });
  if (!exportResult.ok) {
    return {
      ok: false,
      error: exportResult.error
    };
  }

  const fontIds = collectFontIdsFromFormattedExport({
    formattedExportRoot,
    exportPaths: translatedFiles.map((entry) => entry.exportPath)
  });
  const fontIdsByExportPath = collectFontIdsByExportPath({
    formattedExportRoot,
    exportPaths: translatedFiles.map((entry) => entry.exportPath)
  });
  const formattedFallbackRoot = path.join(paths.tempDir, `swf-formatted-fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const formattedFallbackPatch = buildFormattedSwfTextPatch({
    assetRows,
    inputSwf,
    ffdecCli,
    translatedTextRoot: formattedFallbackRoot
  });
  const formattedFallbackFilesByExportPath = new Map();
  if (formattedFallbackPatch.ok) {
    for (const entry of formattedFallbackPatch.translatedFiles || []) {
      formattedFallbackFilesByExportPath.set(entry.exportPath, entry.filePath);
    }
  }
  removeDirContents(formattedExportRoot);

  return {
    ok: true,
    translatedFiles,
    fontIds,
    fontIdsByExportPath,
    formattedFallbackFilesByExportPath,
    cleanupPaths: [formattedFallbackRoot]
  };
}

function buildManualFormattedSwfTextPatch({ inputSwf, ffdecCli, translatedTextRoot, replacements }) {
  const formattedExportRoot = path.join(paths.tempDir, `swf-manual-formatted-export-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const exportResult = exportFormattedSwfTexts({
    ffdecCli,
    inputSwf,
    outputDir: formattedExportRoot
  });
  if (!exportResult.ok) {
    return {
      ok: false,
      error: exportResult.error
    };
  }

  const translatedFiles = [];
  const fontIds = new Set();
  const fontIdsByExportPath = new Map();

  for (const sourceFile of listFilesRecursive(formattedExportRoot).filter((filePath) => /\.txt$/iu.test(filePath))) {
    const exportPath = path.relative(formattedExportRoot, sourceFile).replace(/\\/gu, "/");
    const sourceContent = fs.readFileSync(sourceFile, "utf8");
    const { prefix, bodyLines, suffix } = splitFormattedTextSections(sourceContent);
    const sourceBody = bodyLines.join("\n");
    const nextBody = applyStringPairReplacements(sourceBody, replacements);
    if (nextBody === sourceBody) {
      continue;
    }

    const nextBodyLines = nextBody.length > 0 ? nextBody.split(/\r?\n/u) : [];
    const targetFile = path.join(translatedTextRoot, exportPath);
    ensureDirSync(path.dirname(targetFile));
    writeText(
      targetFile,
      normalizeSwfTextFileContent(`${sanitizeFormattedTextMetadata(prefix, nextBodyLines)}${nextBody}${suffix}`)
    );

    const exportFontIds = extractFontIdsFromFormattedText(sourceContent).sort((left, right) => left - right);
    fontIdsByExportPath.set(exportPath, exportFontIds);
    for (const fontId of exportFontIds) {
      fontIds.add(fontId);
    }

    translatedFiles.push({
      filePath: targetFile,
      exportPath
    });
  }

  removeDirContents(formattedExportRoot);

  return {
    ok: true,
    translatedFiles: translatedFiles.sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en")),
    fontIds: [...fontIds].sort((left, right) => left - right),
    fontIdsByExportPath
  };
}

function replaceSingleSwfText({ ffdecCli, inputSwf, outputSwf, translatedFilePath, characterId, fontIds = [], fontFilePath = null }) {
  const replaceArgs = ["-replace", inputSwf, outputSwf];
  if (fontFilePath && fontIds.length > 0) {
    for (const fontId of fontIds) {
      replaceArgs.push(String(fontId), fontFilePath);
    }
  }
  replaceArgs.push(String(characterId), translatedFilePath);

  const result = runFfdecCommand(ffdecCli, replaceArgs);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "FFDec batch replace failed"
    };
  }

  return { ok: true };
}

function replaceSingleSwfExport({ ffdecCli, inputSwf, outputSwf, translatedFilePath, replaceTarget, fontIds = [], fontFilePath = null }) {
  const replaceArgs = ["-replace", inputSwf, outputSwf];
  if (fontFilePath && fontIds.length > 0) {
    for (const fontId of fontIds) {
      replaceArgs.push(String(fontId), fontFilePath);
    }
  }
  replaceArgs.push(String(replaceTarget), translatedFilePath);

  const result = runFfdecCommand(ffdecCli, replaceArgs);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "FFDec replace failed"
    };
  }

  return { ok: true };
}

function replaceSwfTexts({ ffdecCli, inputSwf, outputSwf, translatedFiles, fontIds = [], fontIdsByExportPath = new Map(), fontFilePath = null, fallbackFilesByExportPath = new Map(), sequential = false }) {
  if (!translatedFiles.length && !fontIds.length) {
    fs.copyFileSync(inputSwf, outputSwf);
    return { ok: true };
  }

  if (sequential) {
    let currentInput = inputSwf;
    const tempOutputs = [];
    const orderedEntries = [...translatedFiles].sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en"));
    try {
      for (let index = 0; index < orderedEntries.length; index += 1) {
        const entry = orderedEntries[index];
        const characterId = Number.parseInt(path.basename(entry.exportPath, path.extname(entry.exportPath)), 10);
        if (!Number.isInteger(characterId)) {
          return {
            ok: false,
            error: `Unable to resolve character id from ${entry.exportPath}`
          };
        }

        const tempOutput = index === orderedEntries.length - 1
          ? outputSwf
          : path.join(paths.tempDir, `swf-replace-step-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}.swf`);

        let result = replaceSingleSwfText({
          ffdecCli,
          inputSwf: currentInput,
          outputSwf: tempOutput,
          translatedFilePath: entry.filePath,
          characterId,
          fontIds: fontIdsByExportPath.get(entry.exportPath) || fontIds,
          fontFilePath
        });

        if (!result.ok) {
          const fallbackPath = fallbackFilesByExportPath.get(entry.exportPath);
          if (fallbackPath && fileExists(fallbackPath)) {
            result = replaceSingleSwfText({
              ffdecCli,
              inputSwf: currentInput,
              outputSwf: tempOutput,
              translatedFilePath: fallbackPath,
              characterId,
              fontIds: fontIdsByExportPath.get(entry.exportPath) || fontIds,
              fontFilePath
            });
          }
        }

        if (!result.ok) {
          return {
            ok: false,
            error: `${result.error || "FFDec replace failed"} [${entry.exportPath}]`
          };
        }

        if (tempOutput !== outputSwf) {
          tempOutputs.push(tempOutput);
        }
        currentInput = tempOutput;
      }
    } finally {
      for (const tempFile of tempOutputs) {
        if (fileExists(tempFile)) {
          fs.rmSync(tempFile, { force: true });
        }
      }
    }

    return { ok: true };
  }

  const replaceArgs = ["-replace", inputSwf, outputSwf];
  if (fontFilePath && fontIds.length > 0) {
    for (const fontId of fontIds) {
      replaceArgs.push(String(fontId), fontFilePath);
    }
  }

  for (const entry of translatedFiles) {
    const characterId = Number.parseInt(path.basename(entry.exportPath, path.extname(entry.exportPath)), 10);
    if (!Number.isInteger(characterId)) {
      return {
        ok: false,
        error: `Unable to resolve character id from ${entry.exportPath}`
      };
    }

    replaceArgs.push(String(characterId), entry.filePath);
  }

  const result = runFfdecCommand(ffdecCli, replaceArgs);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "FFDec batch replace failed"
    };
  }

  return { ok: true };
}

function buildTranslatedSwfFiles({ assetRows, sourceTextRoot, translatedTextRoot }) {
  const changedFiles = new Set();

  for (const row of assetRows) {
    const context = JSON.parse(row.context_json || "{}");
    if (context.kind && context.kind !== "swf-text") {
      continue;
    }
    if (!context.exportPath || !context.lineNumber) {
      continue;
    }

    const sourceFile = path.join(sourceTextRoot, context.exportPath);
    if (!fileExists(sourceFile)) {
      continue;
    }

    const sourceLines = fs.readFileSync(sourceFile, "utf8").split(/\r?\n/u);
    const lineIndex = Math.max(0, Number(context.lineNumber) - 1);
    const translatedLine = normalizeTranslatedText(row.translated_text, row.source_text);

    if (lineIndex >= sourceLines.length || translatedLine === sourceLines[lineIndex]) {
      continue;
    }

    const targetFile = path.join(translatedTextRoot, context.exportPath);
    ensureDirSync(path.dirname(targetFile));

    let nextLines = sourceLines;
    if (fileExists(targetFile)) {
      nextLines = fs.readFileSync(targetFile, "utf8").split(/\r?\n/u);
      if (lineIndex >= nextLines.length) {
        nextLines = sourceLines;
      }
    }

    nextLines[lineIndex] = translatedLine;
    writeText(targetFile, normalizeSwfTextFileContent(nextLines.join("\n")));
    changedFiles.add(targetFile);
  }

  return [...changedFiles]
    .filter((filePath) => /\.txt$/iu.test(filePath))
    .map((filePath) => ({
      filePath,
      exportPath: path.relative(translatedTextRoot, filePath).replace(/\\/gu, "/")
    }))
    .sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en"));
}

function escapeSwfScriptLiteral(text, quote = '"') {
  return String(text || "")
    .replace(/\\/gu, "\\\\")
    .replace(/\r/gu, "\\r")
    .replace(/\n/gu, "\\n")
    .replace(/\t/gu, "\\t")
    .replace(new RegExp(escapeForRegExp(quote), "gu"), `\\${quote}`);
}

function replaceSwfScriptLiteralInLine(line, { quote, rawLiteral, occurrenceIndex, translatedLiteral }) {
  let currentIndex = 0;
  return String(line || "").replace(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/gu, (match, doubleQuoted, singleQuoted) => {
    currentIndex += 1;
    if (currentIndex !== occurrenceIndex) {
      return match;
    }
    const matchQuote = match.startsWith("'") ? "'" : '"';
    const matchRawLiteral = matchQuote === '"' ? doubleQuoted : singleQuoted;
    if (matchQuote !== quote || matchRawLiteral !== rawLiteral) {
      return match;
    }
    return `${quote}${translatedLiteral}${quote}`;
  });
}

function shouldSkipSwfScriptTranslationLine(line) {
  return AS2_ROOM_NAME_LINE_PATTERN.test(String(line || ""));
}

function shouldSkipAs2SuperPowerSwfTextPatch(assetPath) {
  const normalizedAssetPath = String(assetPath || "");
  return AS2_SUPER_POWER_SCENE_SWF_PATTERN.test(normalizedAssetPath)
    || AS2_SUPER_POWER_OPTIONAL_UI_SWF_PATTERN.test(normalizedAssetPath)
    || AS2_SUPER_POWER_SHARED_SWF_TEXT_SKIP_PATHS.has(normalizedAssetPath);
}

function buildTranslatedSwfScriptFiles({ assetRows, sourceScriptRoot, translatedScriptRoot }) {
  const changedFiles = new Set();

  for (const row of assetRows) {
    const context = JSON.parse(row.context_json || "{}");
    if (context.kind !== "swf-script") {
      continue;
    }
    if (!context.exportPath || !context.lineNumber || !context.rawLiteral || !context.quote) {
      continue;
    }

    const sourceFile = path.join(sourceScriptRoot, context.exportPath);
    if (!fileExists(sourceFile)) {
      continue;
    }

    const sourceLines = fs.readFileSync(sourceFile, "utf8").split(/\r?\n/u);
    const lineIndex = Math.max(0, Number(context.lineNumber) - 1);
    if (lineIndex >= sourceLines.length) {
      continue;
    }
    if (shouldSkipSwfScriptTranslationLine(sourceLines[lineIndex])) {
      continue;
    }

    const targetFile = path.join(translatedScriptRoot, context.exportPath);
    ensureDirSync(path.dirname(targetFile));
    let nextLines = sourceLines;
    if (fileExists(targetFile)) {
      nextLines = fs.readFileSync(targetFile, "utf8").split(/\r?\n/u);
      if (lineIndex >= nextLines.length) {
        nextLines = sourceLines;
      }
    }

    const translatedLiteral = escapeSwfScriptLiteral(
      normalizeTranslatedText(row.translated_text, row.source_text),
      context.quote
    );
    const nextLine = replaceSwfScriptLiteralInLine(nextLines[lineIndex], {
      quote: context.quote,
      rawLiteral: context.rawLiteral,
      occurrenceIndex: Number(context.occurrenceIndex || 1),
      translatedLiteral
    });

    if (nextLine === nextLines[lineIndex]) {
      continue;
    }

    nextLines[lineIndex] = nextLine;
    writeText(targetFile, nextLines.join("\n"));
    changedFiles.add(targetFile);
  }

  return [...changedFiles]
    .filter((filePath) => /\.as$/iu.test(filePath))
    .map((filePath) => ({
      filePath,
      exportPath: path.relative(translatedScriptRoot, filePath).replace(/\\/gu, "/"),
      replaceTarget: `\\${path.relative(translatedScriptRoot, filePath).replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`
    }))
    .sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en"));
}

function replaceSwfScriptExports({ ffdecCli, inputSwf, outputSwf, translatedFiles }) {
  if (!translatedFiles.length) {
    if (inputSwf !== outputSwf) {
      fs.copyFileSync(inputSwf, outputSwf);
    }
    return { ok: true };
  }

  let currentInput = inputSwf;
  const tempOutputs = [];
  try {
    for (let index = 0; index < translatedFiles.length; index += 1) {
      const entry = translatedFiles[index];
      const nextOutput = index === translatedFiles.length - 1
        ? outputSwf
        : path.join(paths.tempDir, `swf-script-replace-step-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}.swf`);
      const result = replaceSingleSwfExport({
        ffdecCli,
        inputSwf: currentInput,
        outputSwf: nextOutput,
        translatedFilePath: entry.filePath,
        replaceTarget: entry.replaceTarget
      });
      if (!result.ok) {
        return {
          ok: false,
          error: `${result.error || "FFDec script replace failed"} [${entry.exportPath}]`
        };
      }
      if (nextOutput !== outputSwf) {
        tempOutputs.push(nextOutput);
      }
      currentInput = nextOutput;
    }
  } finally {
    for (const tempFile of tempOutputs) {
      if (fileExists(tempFile)) {
        fs.rmSync(tempFile, { force: true });
      }
    }
  }

  return { ok: true };
}

function collectSwfScriptFiles(translatedScriptRoot) {
  if (!translatedScriptRoot || !fileExists(translatedScriptRoot)) {
    return [];
  }

  return listFilesRecursive(translatedScriptRoot)
    .filter((filePath) => /\.as$/iu.test(filePath))
    .map((filePath) => ({
      filePath,
      exportPath: path.relative(translatedScriptRoot, filePath).replace(/\\/gu, "/"),
      replaceTarget: `\\${path.relative(translatedScriptRoot, filePath).replace(/^scripts[\\/]/iu, "").replace(/\.as$/iu, "").replace(/[\\/]/gu, "\\")}`
    }))
    .sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en"));
}

function normalizeScriptContent(content) {
  return String(content || "").replace(/\r\n/gu, "\n");
}

function replaceRequiredSnippet(content, searchValue, replacementValue, label) {
  const normalizedContent = normalizeScriptContent(content);
  const normalizedSearchValue = normalizeScriptContent(searchValue);
  if (!normalizedContent.includes(normalizedSearchValue)) {
    throw new Error(`Unable to locate ${label}`);
  }
  return normalizedContent.replace(normalizedSearchValue, normalizeScriptContent(replacementValue));
}

function ensureTranslatedScriptFromSource({ sourceScriptRoot, translatedScriptRoot, exportPath }) {
  const sourceFile = path.join(sourceScriptRoot, exportPath);
  if (!fileExists(sourceFile)) {
    throw new Error(`Missing source script export: ${exportPath}`);
  }

  const targetFile = path.join(translatedScriptRoot, exportPath);
  ensureDirSync(path.dirname(targetFile));
  fs.copyFileSync(sourceFile, targetFile);
  return targetFile;
}

function applyLiteralStringReplacements(content, replacements) {
  let nextContent = normalizeScriptContent(content);
  nextContent = nextContent.split("\\'").join("'");
  for (const [searchValue, replacementValue] of replacements) {
    const normalizedSearchValue = normalizeScriptContent(searchValue);
    const escapedSearchValue = normalizedSearchValue.split("\n").join("\\n");
    const escapedReplacementValue = normalizeScriptContent(replacementValue).split("\n").join("\\n");
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

const AS2_SUPER_POWER_SCENE_DIALOGUE_REPLACEMENTS = [
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
    ["Do you work here?", "你在这里工作吗？"],
    ["So you like comics?", "所以你喜欢漫画吗？"],
    ["Do you have anything\nother than comic books?", "除了漫画书，\n你还有别的东西吗？"],
    ["Here's a hot dog.", "给你一个热狗。"],
    ["I don't have\na hot dog.", "我没有\n热狗。"],
    ["I don't want to trade.", "我不想交换。"],
    ["Thanks for the handbook.", "谢谢你的手册。"],
    ["GO LEFT", "向左"],
    ["GO RIGHT", "向右"],
    ["GO UP", "向上"],
    ["GO DOWN", "向下"],
    ["ENTER", "进入"],
    ["EXIT", "离开"],
    ["TRAVEL", "前往"],
    ["COMMON ROOM", "公共休息室"]
  ];

function exportSwfScriptsForPatch({ ffdecCli, inputSwf, outputDir, selectClasses = null }) {
  removeDirContents(outputDir);
  ensureDirSync(outputDir);
  const args = ["-cli"];
  if (selectClasses) {
    args.push("-selectclass", selectClasses);
  }
  args.push("-export", "script", outputDir, inputSwf);
  return runFfdecCommand(ffdecCli, args);
}

function extractZipEntryToTemp({ archivePath, entryName, outputDir, tarBin }) {
  removeDirContents(outputDir);
  ensureDirSync(outputDir);
  const result = spawnSync(tarBin || "tar", ["-xf", archivePath, "-C", outputDir, entryName], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || `Failed to extract ${entryName}`).trim()
    };
  }
  return { ok: true };
}

function applyAs3SkinPartLoadedPatch(content) {
  const nextContent = normalizeScriptContent(content);
  const original = `      public function partLoaded(param1:SkinPart) : void
      {
         partsLoading.splice(partsLoading.indexOf(param1.id),1);
         if(partsLoading.length == 0)
         {
            partsMetaComplete();
         }
      }`;
  const replacement = `      public function partLoaded(param1:SkinPart) : void
      {
         var _loc2_:int = partsLoading.indexOf(param1.id);
         if(_loc2_ >= 0)
         {
            partsLoading.splice(_loc2_,1);
         }
         pruneCompletedParts();
         if(partsLoading.length == 0)
         {
            partsMetaComplete();
         }
      }

      private function pruneCompletedParts() : void
      {
         var _loc2_:Entity = null;
         var _loc3_:SkinPart = null;
         var _loc1_:int = int(partsLoading.length - 1);
         while(_loc1_ >= 0)
         {
            _loc2_ = getSkinPartEntity(partsLoading[_loc1_]);
            _loc3_ = _loc2_ ? _loc2_.get(SkinPart) as SkinPart : null;
            if(_loc3_ == null || !_loc3_._invalidate && !_loc3_.reload && !_loc3_.refreshDisplay)
            {
               partsLoading.splice(_loc1_,1);
            }
            _loc1_--;
         }
      }`;
  if (!nextContent.includes(original)) {
    throw new Error("Unable to locate AS3 Skin.partLoaded queue block");
  }
  return nextContent.replace(original, replacement);
}

function buildAs3ShellSkinPatch({ config, outputDir, manifest }) {
  const sourceZip = config.sources?.as3Gamezip;
  const ffdecCli = config.tools?.ffdecCli;
  if (!sourceZip || !fileExists(sourceZip) || !ffdecCli || !fileExists(ffdecCli)) {
    return;
  }

  const sharedTempRoot = path.join(paths.tempDir, "as3-shell-skin-patch");
  removeDirContents(sharedTempRoot);
  ensureDirSync(sharedTempRoot);

  const extractRoot = path.join(sharedTempRoot, "shell-source");
  const extractResult = extractZipEntryToTemp({
    archivePath: sourceZip,
    entryName: AS3_SHELL_PATH,
    outputDir: extractRoot,
    tarBin: config.tools.tarBin
  });
  if (!extractResult.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "as3-shell:skin-load-queue",
      assetPath: AS3_SHELL_PATH,
      reason: extractResult.error
    });
    return;
  }

  const sourceSwf = path.join(extractRoot, AS3_SHELL_PATH.replace(/\//gu, path.sep));
  const scriptRoot = path.join(sharedTempRoot, "shell-skin-source");
  const scriptExport = exportSwfScriptsForPatch({
    ffdecCli,
    inputSwf: sourceSwf,
    outputDir: scriptRoot,
    selectClasses: "game.components.entity.character.Skin"
  });
  if (!scriptExport.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "as3-shell:skin-load-queue",
      assetPath: AS3_SHELL_PATH,
      reason: scriptExport.error || "Unable to export Shell Skin script"
    });
    return;
  }

  const patchRoot = path.join(sharedTempRoot, "shell-skin-patch");
  const skinScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: scriptRoot,
    translatedScriptRoot: patchRoot,
    exportPath: path.join("scripts", "game", "components", "entity", "character", "Skin.as")
  });
  writeText(skinScript, applyAs3SkinPartLoadedPatch(fs.readFileSync(skinScript, "utf8")));

  const outputSwf = path.join(outputDir, "swf", AS3_SHELL_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(outputSwf));
  const replaceResult = replaceSwfScriptExports({
    ffdecCli,
    inputSwf: sourceSwf,
    outputSwf,
    translatedFiles: [{
      filePath: skinScript,
      exportPath: "scripts/game/components/entity/character/Skin.as",
      replaceTarget: "game.components.entity.character.Skin"
    }]
  });
  if (!replaceResult.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "as3-shell:skin-load-queue",
      assetPath: AS3_SHELL_PATH,
      reason: replaceResult.error || "Unable to rebuild Shell Skin script"
    });
    return;
  }

  manifest.assetsPatched += 1;
  manifest.swfPatchedAssets.push({
    assetId: "as3-shell:skin-load-queue",
    assetPath: AS3_SHELL_PATH,
    outputPath: outputSwf
  });
}

function applyAs2SuperPowerSceneValidationPatch({ sourceScriptRoot, translatedScriptRoot, assetPath }) {
  const scriptEntries = collectSwfScriptFiles(sourceScriptRoot);
  let changed = false;
  for (const entry of scriptEntries) {
    const targetFile = path.join(translatedScriptRoot, entry.exportPath.replace(/\//gu, path.sep));
    const originalContent = fs.readFileSync(entry.filePath, "utf8");
    const baseContent = fileExists(targetFile) ? fs.readFileSync(targetFile, "utf8") : originalContent;
    let patchedContent = normalizeScriptContent(baseContent);
    patchedContent = applyLiteralStringReplacements(patchedContent, AS2_SUPER_POWER_SCENE_DIALOGUE_REPLACEMENTS);
    patchedContent = applyAs2SuperPowerStaticLabelPatch(patchedContent, assetPath);
    if (patchedContent === normalizeScriptContent(baseContent)) {
      continue;
    }
    ensureDirSync(path.dirname(targetFile));
    writeText(targetFile, patchedContent);
    changed = true;
  }
  return { ok: true, changed };
}

function applyAs2SuperPowerStaticLabelPatch(content, assetPath) {
  const normalizedAssetPath = String(assetPath || "").replace(/\\/gu, "/");
  const normalizedContent = normalizeScriptContent(content);
  if (!/scenes\/islandSuper\/sceneDownTown\.swf$/iu.test(normalizedAssetPath)) {
    return normalizedContent;
  }
  if (normalizedContent.includes("function zhAddDownTownMainStreetLabel(")) {
    return normalizedContent;
  }
  const overlaySnippet = `function zhAddDownTownMainStreetLabel(targetClip)
{
   var _loc1_;
   var _loc2_;
   if(targetClip == undefined || targetClip.__zhMainStreetLabel != undefined)
   {
      return undefined;
   }
   _loc1_ = targetClip.createEmptyMovieClip("__zhMainStreetLabel",1000000);
   _loc1_._x = 54;
   _loc1_._y = 2024;
   _loc1_._xscale = 100;
   _loc1_._yscale = 100;
   _loc1_.beginFill(5212463,100);
   _loc1_.lineStyle(3,13361319,100);
   _loc1_.moveTo(0,0);
   _loc1_.lineTo(92,0);
   _loc1_.lineTo(92,58);
   _loc1_.lineTo(0,58);
   _loc1_.lineTo(0,0);
   _loc1_.endFill();
   _loc1_.createTextField("label",1,0,8,92,44);
   _loc2_ = new TextFormat();
   _loc2_.font = "_sans";
   _loc2_.size = 25;
   _loc2_.bold = true;
   _loc2_.color = 16777215;
   _loc2_.align = "center";
   _loc1_.label.embedFonts = false;
   _loc1_.label.selectable = false;
   _loc1_.label.multiline = false;
   _loc1_.label.wordWrap = false;
   _loc1_.label.setNewTextFormat(_loc2_);
   _loc1_.label.text = "主街";
   _loc1_.label.setTextFormat(_loc2_);
}
zhAddDownTownMainStreetLabel(this);`;
  if (normalizedContent.includes("_root.makeBackdrop();")) {
    return normalizedContent.replace("_root.makeBackdrop();", `_root.makeBackdrop();\n${overlaySnippet}`);
  }
  if (normalizedContent.includes("_root.makeBackground();")) {
    return normalizedContent.replace("_root.makeBackground();", `_root.makeBackground();\n${overlaySnippet}`);
  }
  return normalizedContent;
}

const AS2_SUPER_POWER_SCENE_LOADCHECK_BASE_SNIPPET = `this.createEmptyMovieClip("loadCheck",1);
loadCheck.onEnterFrame = function()
{
   if(Chars.length <= 0)
   {
      delete this.onEnterFrame;
      initChars();
      removeMovieClip(loadCheck);
   }
   var _loc2_ = 0;
   while(_loc2_ < Chars.length)
   {
      if(Chars[_loc2_].loadingFinished)
      {
         Chars.splice(_loc2_,1);
      }
      _loc2_ += 1;
   }
};`;

const AS2_SUPER_POWER_SCENE_LOADCHECK_TIMEOUT_SNIPPET = `this.createEmptyMovieClip("loadCheck",1);
loadCheck.wait = 0;
loadCheck.onEnterFrame = function()
{
   this.wait += 1;
   if(Chars.length <= 0 || this.wait > 24)
   {
      delete this.onEnterFrame;
      initChars();
      removeMovieClip(loadCheck);
      return undefined;
   }
   var _loc2_ = 0;
   while(_loc2_ < Chars.length)
   {
      if(Chars[_loc2_] == undefined || Chars[_loc2_].loadingFinished || Chars[_loc2_].createNPC != undefined || Chars[_loc2_].createBackPlayer != undefined)
      {
         Chars.splice(_loc2_,1);
         _loc2_ -= 1;
      }
      _loc2_ += 1;
   }
};`;

function applyAs2SuperPowerSceneLoadCheckCompatibilityPatch({ sourceScriptRoot, translatedScriptRoot }) {
  const scriptEntries = collectSwfScriptFiles(sourceScriptRoot);
  let changed = false;
  for (const entry of scriptEntries) {
    const targetFile = path.join(translatedScriptRoot, entry.exportPath.replace(/\//gu, path.sep));
    const originalContent = fs.readFileSync(entry.filePath, "utf8");
    const baseContent = fileExists(targetFile) ? fs.readFileSync(targetFile, "utf8") : originalContent;
    let patchedContent = normalizeScriptContent(baseContent);
    if (patchedContent.includes(AS2_SUPER_POWER_SCENE_LOADCHECK_BASE_SNIPPET)) {
      patchedContent = patchedContent.replace(AS2_SUPER_POWER_SCENE_LOADCHECK_BASE_SNIPPET, AS2_SUPER_POWER_SCENE_LOADCHECK_TIMEOUT_SNIPPET);
    } else if (patchedContent.includes(AS2_SUPER_POWER_SCENE_LOADCHECK_TIMEOUT_SNIPPET)) {
      // Already patched.
    } else {
      continue;
    }
    if (patchedContent === normalizeScriptContent(baseContent)) {
      continue;
    }
    ensureDirSync(path.dirname(targetFile));
    writeText(targetFile, patchedContent);
    changed = true;
  }
  return { ok: true, changed };
}

function applyAs2SuperPowerDirectEdgeExitPatch({ sourceScriptRoot, translatedScriptRoot }) {
  const scriptEntries = collectSwfScriptFiles(sourceScriptRoot);
  let changed = false;
  for (const entry of scriptEntries) {
    const targetFile = path.join(translatedScriptRoot, entry.exportPath.replace(/\//gu, path.sep));
    const originalContent = fs.readFileSync(entry.filePath, "utf8");
    const baseContent = fileExists(targetFile) ? fs.readFileSync(targetFile, "utf8") : originalContent;
    let patchedContent = normalizeScriptContent(baseContent);
    if (!patchedContent.includes("labelText = \"GO ")) {
      continue;
    }
    const descMatch = patchedContent.match(/desc = \["(AdGround[^"]+)",\s*([-\d]+),\s*([-\d]+)\];/u);
    if (!descMatch) {
      continue;
    }
    const leftExitMatch = patchedContent.match(/leftExit = \["([^"]+)",\s*([-\d]+),\s*([-\d]+)\];/u);
    const rightExitMatch = patchedContent.match(/rightExit = \["([^"]+)",\s*([-\d]+),\s*([-\d]+)\];/u);
    let replacementDesc = null;
    if (patchedContent.includes('labelText = "GO LEFT";') && leftExitMatch) {
      replacementDesc = `desc = ["${leftExitMatch[1]}",${leftExitMatch[2]},${leftExitMatch[3]}];`;
    } else if (patchedContent.includes('labelText = "GO RIGHT";') && rightExitMatch) {
      replacementDesc = `desc = ["${rightExitMatch[1]}",${rightExitMatch[2]},${rightExitMatch[3]}];`;
    } else {
      continue;
    }
    patchedContent = patchedContent.replace(/desc = \["AdGround[^"]+",\s*[-\d]+,\s*[-\d]+\];/u, replacementDesc);
    if (patchedContent === normalizeScriptContent(baseContent)) {
      continue;
    }
    ensureDirSync(path.dirname(targetFile));
    writeText(targetFile, patchedContent);
    changed = true;
  }
  return { ok: true, changed };
}

function applyAs2SuperPowerSceneExitRegistryResetPatch({ sourceScriptRoot, translatedScriptRoot }) {
  const scriptEntries = collectSwfScriptFiles(sourceScriptRoot);
  let changed = false;
  const resetBlock = `if(_root != undefined)
{
   _root.__zhSuperLeftExitClip = undefined;
   _root.__zhSuperRightExitClip = undefined;
   if(_root.updateFramelessGameplayEdgeExits != undefined)
   {
      _root.updateFramelessGameplayEdgeExits();
   }
}`;
  for (const entry of scriptEntries) {
    const targetFile = path.join(translatedScriptRoot, entry.exportPath.replace(/\//gu, path.sep));
    const originalContent = fs.readFileSync(entry.filePath, "utf8");
    const baseContent = fileExists(targetFile) ? fs.readFileSync(targetFile, "utf8") : originalContent;
    let patchedContent = normalizeScriptContent(baseContent);
    if (patchedContent.includes("_root.__zhSuperLeftExitClip = undefined;")) {
      continue;
    }
    if (patchedContent.includes("_root.makeBackground();")) {
      patchedContent = patchedContent.replace(
        "_root.makeBackground();",
        `_root.makeBackground();
${resetBlock}`
      );
    } else if (patchedContent.includes("_root.makeBackdrop();")) {
      patchedContent = patchedContent.replace(
        "_root.makeBackdrop();",
        `_root.makeBackdrop();
${resetBlock}`
      );
    } else {
      continue;
    }
    if (patchedContent === normalizeScriptContent(baseContent)) {
      continue;
    }
    ensureDirSync(path.dirname(targetFile));
    writeText(targetFile, patchedContent);
    changed = true;
  }
  return { ok: true, changed };
}

function applyAs2SuperPowerEdgeExitRegistrationPatch({ sourceScriptRoot, translatedScriptRoot }) {
  const scriptEntries = collectSwfScriptFiles(sourceScriptRoot);
  let changed = false;
  for (const entry of scriptEntries) {
    const targetFile = path.join(translatedScriptRoot, entry.exportPath.replace(/\//gu, path.sep));
    const originalContent = fs.readFileSync(entry.filePath, "utf8");
    const baseContent = fileExists(targetFile) ? fs.readFileSync(targetFile, "utf8") : originalContent;
    let patchedContent = normalizeScriptContent(baseContent);
    const injectedLines = [];
    if (patchedContent.includes('labelText = "GO LEFT";') && !patchedContent.includes("_root.__zhSuperLeftExitClip")) {
      injectedLines.push("   _root.__zhSuperLeftExitClip = this;");
    }
    if (patchedContent.includes('labelText = "GO RIGHT";') && !patchedContent.includes("_root.__zhSuperRightExitClip")) {
      injectedLines.push("   _root.__zhSuperRightExitClip = this;");
    }
    if (injectedLines.length === 0) {
      continue;
    }
    injectedLines.push("   if(_root.updateFramelessGameplayEdgeExits != undefined)");
    injectedLines.push("   {");
    injectedLines.push("      _root.updateFramelessGameplayEdgeExits();");
    injectedLines.push("   }");
    patchedContent = patchedContent.replace(/\}\s*$/u, `${injectedLines.join("\n")}\n}`);
    if (patchedContent === normalizeScriptContent(baseContent)) {
      continue;
    }
    ensureDirSync(path.dirname(targetFile));
    writeText(targetFile, patchedContent);
    changed = true;
  }
  return { ok: true, changed };
}

function applyAs2SuperPowerSceneImmediateReadyPatch({ sourceScriptRoot, translatedScriptRoot }) {
  const scriptEntries = collectSwfScriptFiles(sourceScriptRoot);
  let changed = false;
  for (const entry of scriptEntries) {
    const targetFile = path.join(translatedScriptRoot, entry.exportPath.replace(/\//gu, path.sep));
    const originalContent = fs.readFileSync(entry.filePath, "utf8");
    const baseContent = fileExists(targetFile) ? fs.readFileSync(targetFile, "utf8") : originalContent;
    let patchedContent = normalizeScriptContent(baseContent);
    if (patchedContent.includes("_root.makeBackground();")) {
      patchedContent = patchedContent.replace(
        "_root.makeBackground();",
        `_root.makeBackground();
if(_root != undefined && _root._currentframe == 1)
{
   _root.nextFrame();
}`
      );
    } else if (patchedContent.includes("_root.makeBackdrop();")) {
      patchedContent = patchedContent.replace(
        "_root.makeBackdrop();",
        `_root.makeBackdrop();
if(_root != undefined && _root._currentframe == 1)
{
   _root.nextFrame();
}`
      );
    } else {
      continue;
    }
    if (patchedContent === normalizeScriptContent(baseContent)) {
      continue;
    }
    ensureDirSync(path.dirname(targetFile));
    writeText(targetFile, patchedContent);
    changed = true;
  }
  return { ok: true, changed };
}

function applyAs2GameplayShowSayScriptPatch(content) {
  let nextContent = normalizeScriptContent(content);
  if (!nextContent.includes("function decodeZhSayText(")) {
    nextContent = replaceRequiredSnippet(
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
function looksLikeZhHtmlText(rawText)
{
   var htmlValue;
   htmlValue = rawText == undefined || rawText == null ? "" : String(rawText);
   htmlValue = htmlValue.toUpperCase();
   return htmlValue.indexOf("<TEXTFORMAT") >= 0 || htmlValue.indexOf("<P") >= 0 || htmlValue.indexOf("<FONT") >= 0 || htmlValue.indexOf("<BR") >= 0;
}
function normalizeZhHtmlText(rawText)
{
   var htmlValue;
   htmlValue = decodeZhSayText(rawText);
   htmlValue = htmlValue.split("FACE=\\"Arial\\"").join("FACE=\\"_sans\\"");
   htmlValue = htmlValue.split("FACE='Arial'").join("FACE='_sans'");
   htmlValue = htmlValue.split("FACE=\\"Verdana\\"").join("FACE=\\"_sans\\"");
   htmlValue = htmlValue.split("FACE='Verdana'").join("FACE='_sans'");
   htmlValue = htmlValue.split("FACE=\\"_serif\\"").join("FACE=\\"_sans\\"");
   htmlValue = htmlValue.split("FACE='_serif'").join("FACE='_sans'");
   if(htmlValue.toUpperCase().indexOf("<TEXTFORMAT") < 0)
   {
      htmlValue = "<TEXTFORMAT LEADING=\\"2\\"><P ALIGN=\\"CENTER\\"><FONT FACE=\\"_sans\\">" + htmlValue + "</FONT></P></TEXTFORMAT>";
   }
   return htmlValue;
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
   fieldRef._width = 204;
   fieldRef._height = 86;
   fieldRef._x = -102;
   fieldRef._y = -40;
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
   var _loc3_;
   normalizeZhSayField(fieldRef);
   if(fieldRef == undefined)
   {
      return "";
   }
   _loc3_ = looksLikeZhHtmlText(rawText);
   _loc2_ = !_loc3_ ? decodeZhSayText(rawText) : normalizeZhHtmlText(rawText);
   fieldRef.html = _loc3_;
   if(_loc3_)
   {
      fieldRef.htmlText = _loc2_;
   }
   else
   {
      fieldRef.text = _loc2_;
   }
   if(fieldRef.__zhFmt != undefined)
   {
      fieldRef.setTextFormat(fieldRef.__zhFmt);
   }
   fieldRef._height = Math.max(40,Math.min(110,fieldRef.textHeight + 10));
   return _loc2_;
}
function showSay(target, sayText, id)
{`,
      "gameplay showSay helper insertion"
    );
  }

  nextContent = replaceRequiredSnippet(
    nextContent,
    "   positionChat(say,target);\n   say.fld.htmlText = sayText;",
    `   positionChat(say,target);
   sayText = setZhTextFieldValue(say.fld,sayText);
   say.sizeBubbles();
   positionChat(say,target);`,
    "gameplay showSay text assignment patch"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    "   if(camera.scene.char.targetPlayer.isAd)\n   {",
    `   if(camera.scene.char.targetPlayer != undefined && camera.scene.char.targetPlayer.isAd)
   {`,
    "gameplay targetPlayer isAd guard"
  );
  nextContent = replaceRequiredSnippet(
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
  nextContent = replaceRequiredSnippet(
    nextContent,
    "         if(!camera.scene.red5 || camera.scene.char.targetPlayer.npc == true)\n         {",
    `         if(!camera.scene.red5 || camera.scene.char.targetPlayer == undefined || camera.scene.char.targetPlayer.npc == true)
         {`,
    "gameplay targetPlayer npc guard"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    "            else if(camera.scene.char.targetPlayer.interaction == \"chat\")\n            {",
    `            else if(camera.scene.char.targetPlayer != undefined && camera.scene.char.targetPlayer.interaction == "chat")
            {`,
    "gameplay targetPlayer interaction guard"
  );
  if (!nextContent.includes("flashpointPlayAs2Sound")) {
    nextContent = replaceRequiredSnippet(
      nextContent,
      `function showSound(frameName, posX, posY, shakeAmount, isPopup)
{`,
      `function showSound(frameName, posX, posY, shakeAmount, isPopup)
{
   try
   {
      if(frameName != undefined && flash != undefined && flash.external != undefined && flash.external.ExternalInterface != undefined)
      {
         flash.external.ExternalInterface.call("flashpointPlayAs2Sound",String(frameName));
      }
   }
   catch(err)
   {
   }`,
      "gameplay showSound JS audio bridge"
    );
  }
  nextContent = replaceRequiredSnippet(
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

  nextContent = replaceRequiredSnippet(
    nextContent,
    "function turnOffWardrobe()\n{",
    `function layoutFramelessGameplayNav(forceLayout)
{
   var _loc2_;
   var _loc3_;
   var _loc4_;
   var _loc5_;
   var _loc6_;
   var _loc7_;
   var _loc8_;
   var _loc9_;
   var _loc10_;
   var _loc11_;
   var _loc12_;
   var _loc13_;
   var _loc14_;
   var _loc15_;
   var _loc16_;
   var _loc17_;
   var _loc18_;
   var _loc19_;
   var _loc20_;
   _loc20_ = _root != undefined && _root.island != undefined ? String(_root.island) : island;
   if(_loc20_ != "Super" || navBar == undefined)
   {
      return undefined;
   }
    if(navBar.area != undefined)
    {
       navBar.area._visible = false;
       navBar.area._alpha = 0;
       navBar.area.enabled = false;
       navBar.area._x = -4000;
       navBar.area._y = -4000;
    }
   if(navBar.logo != undefined)
   {
      navBar.logo._visible = false;
   }
   if(navBar.userInfo != undefined)
   {
      navBar.userInfo._visible = false;
   }
   if(navBar.emotions != undefined)
   {
      navBar.emotions._visible = false;
   }
   if(navBar.roomName != undefined)
   {
      navBar.roomName._visible = false;
   }
   if(navBar.btnHome != undefined)
   {
      navBar.btnHome._visible = false;
      navBar.btnHome.enabled = false;
   }
   if(navBar.btnSave != undefined)
   {
      navBar.btnSave._visible = false;
      navBar.btnSave._alpha = 0;
      navBar.btnSave.enabled = false;
      if(navBar.btnSave.saveText != undefined)
      {
         navBar.btnSave.saveText._visible = false;
      }
   }
   if(navBar.btnTime != undefined)
   {
      navBar.btnTime._visible = false;
      navBar.btnTime.enabled = false;
   }
   if(navBar.btnVentMap != undefined)
   {
      navBar.btnVentMap._visible = false;
      navBar.btnVentMap.enabled = false;
   }
   if(navBar.btnGrapple != undefined)
   {
      navBar.btnGrapple._visible = false;
      navBar.btnGrapple.enabled = false;
   }
   if(navBar.grappleHit != undefined)
   {
      navBar.grappleHit._visible = false;
      navBar.grappleHit._alpha = 0;
      navBar.grappleHit.enabled = false;
   }
   if(navBar.wardrobeSelect != undefined)
   {
      navBar.wardrobeSelect._visible = false;
      navBar.wardrobeSelect._alpha = 0;
      navBar.wardrobeSelect.enabled = false;
   }
   if(navBar.wardrobeDim != undefined)
   {
      navBar.wardrobeDim._visible = false;
      navBar.wardrobeDim._alpha = 0;
      navBar.wardrobeDim.enabled = false;
   }
   if(navBar.savingGame != undefined)
   {
      navBar.savingGame.stop();
      navBar.savingGame._visible = false;
      navBar.savingGame._alpha = 0;
   }
   if(navBar.__zhGameplayLayout == undefined)
   {
      navBar.__zhGameplayLayout = new Object();
   }
   _loc2_ = [navBar.btnInventory,navBar.btnWardrobe,navBar.btnMap,navBar.btnSuperPower];
   _loc9_ = "";
   _loc7_ = 0;
   while(_loc7_ < _loc2_.length)
   {
      _loc8_ = _loc2_[_loc7_];
       if(_loc8_ != undefined)
       {
          _loc8_._visible = true;
          _loc8_._alpha = 100;
          _loc8_.enabled = true;
          if(navBar.__zhGameplayLayout[_loc8_._name] == undefined)
          {
            _loc15_ = _loc8_.getBounds(navBar);
            navBar.__zhGameplayLayout[_loc8_._name] = {
               left:_loc15_.xMin,
               top:_loc15_.yMin,
               width:Math.max(1,_loc15_.xMax - _loc15_.xMin),
               height:Math.max(1,_loc15_.yMax - _loc15_.yMin),
               offsetX:_loc8_._x - _loc15_.xMin,
               offsetY:_loc8_._y - _loc15_.yMin
            };
         }
         _loc9_ = _loc9_ + _loc8_._name + ":" + _loc8_._visible + ":" + Math.round(_loc8_._width) + ":" + Math.round(_loc8_._height) + ";";
      }
      _loc7_ = _loc7_ + 1;
   }
   if(forceLayout != true && navBar.__zhNavSignature == _loc9_ && navBar.__zhNavLayoutReady == true)
   {
      return undefined;
   }
   navBar.__zhNavSignature = _loc9_;
   navBar.__zhNavLayoutReady = true;
    navBar._x = 0;
    navBar._y = 0;
    _loc10_ = 1010;
    _loc11_ = 110;
    _loc12_ = _root != undefined && _root.__zhFrameworkTopNavCenterY != undefined ? Number(_root.__zhFrameworkTopNavCenterY) : 122;
    _loc13_ = 8;
   _loc14_ = 0;
   _loc18_ = 0;
   _loc7_ = 0;
   while(_loc7_ < _loc2_.length)
   {
      _loc8_ = _loc2_[_loc7_];
      if(_loc8_ != undefined && _loc8_._visible)
      {
         _loc16_ = navBar.__zhGameplayLayout[_loc8_._name];
         if(_loc16_ != undefined)
         {
            _loc14_ += _loc16_.width;
            _loc18_ = _loc18_ + 1;
         }
      }
      _loc7_ = _loc7_ + 1;
   }
   if(_loc18_ <= 0)
   {
      return undefined;
   }
    _loc14_ += _loc13_ * Math.max(0,_loc18_ - 1);
    if(_root != undefined && _root.__zhFrameworkTopNavLeft != undefined)
    {
       _loc17_ = Number(_root.__zhFrameworkTopNavLeft) - _loc11_ - _loc14_;
    }
    else
    {
       _loc17_ = 516;
    }
    if(_loc17_ < 6)
    {
       _loc17_ = 6;
    }
    _root.__zhGameplayTopNavLeft = _loc17_;
    _root.__zhGameplayTopNavRight = _loc17_ + _loc14_;
    _root.__zhGameplayTopNavTop = _loc12_;
    _root.__zhGameplayTopNavCenterY = _loc12_;
   var _loc21_ = {
      btnInventory:360,
      btnWardrobe:416,
      btnMap:472,
      btnSuperPower:528
   };
   _loc7_ = 0;
   while(_loc7_ < _loc2_.length)
   {
      _loc8_ = _loc2_[_loc7_];
      if(_loc8_ != undefined)
      {
         _loc16_ = navBar.__zhGameplayLayout[_loc8_._name];
         if(_loc8_._visible && _loc16_ != undefined)
         {
             if(_loc21_[_loc8_._name] != undefined)
             {
                _loc8_._x = Math.round(Number(_loc21_[_loc8_._name]) + _loc16_.offsetX);
             }
             else
             {
                _loc8_._x = Math.round(_loc17_ + _loc16_.offsetX);
             }
             _loc8_._y = Math.round(_loc12_ - (_loc16_.top + _loc16_.height / 2));
             _loc17_ += _loc16_.width + _loc13_;
         }
      }
      _loc7_ = _loc7_ + 1;
   }
   if(_root != undefined)
   {
      var zhMapButton = _root.__zhDirectMapButton;
      var zhMapTextFormat;
      if(zhMapButton == undefined)
      {
         zhMapButton = _root.createEmptyMovieClip("__zhDirectMapButton",1040000);
      }
      zhMapButton.swapDepths(1040000);
      zhMapButton.clear();
      zhMapButton._x = 438;
      zhMapButton._y = 95;
      zhMapButton._visible = true;
      zhMapButton.enabled = true;
      zhMapButton.useHandCursor = true;
      zhMapButton.beginFill(5212463,92);
      zhMapButton.lineStyle(2,13361319,100);
      zhMapButton.moveTo(0,0);
      zhMapButton.lineTo(76,0);
      zhMapButton.lineTo(76,34);
      zhMapButton.lineTo(0,34);
      zhMapButton.lineTo(0,0);
      zhMapButton.endFill();
      if(zhMapButton.label == undefined)
      {
         zhMapButton.createTextField("label",1,0,5,76,24);
      }
      zhMapTextFormat = new TextFormat();
      zhMapTextFormat.font = "_sans";
      zhMapTextFormat.size = 18;
      zhMapTextFormat.bold = true;
      zhMapTextFormat.color = 16777215;
      zhMapTextFormat.align = "center";
      zhMapButton.label.embedFonts = false;
      zhMapButton.label.selectable = false;
      zhMapButton.label.setNewTextFormat(zhMapTextFormat);
      zhMapButton.label.text = "地图";
      zhMapButton.label.setTextFormat(zhMapTextFormat);
      if(zhMapButton.hit == undefined)
      {
         zhMapButton.createEmptyMovieClip("hit",3);
      }
      zhMapButton.hit.clear();
      zhMapButton.hit.beginFill(0,1);
      zhMapButton.hit.moveTo(0,0);
      zhMapButton.hit.lineTo(76,0);
      zhMapButton.hit.lineTo(76,34);
      zhMapButton.hit.lineTo(0,34);
      zhMapButton.hit.lineTo(0,0);
      zhMapButton.hit.endFill();
      zhMapButton.hit._alpha = 0;
      zhMapButton.hit.useHandCursor = true;
      var zhOpenMap = function()
      {
         _root.__zhMapSuppressBgUntil = getTimer() + 1200;
         _root.__zhDirectMapButton._visible = false;
         if(_root.popup != undefined)
         {
            _root.popup("map.swf",true);
         }
         else
         {
            popup("map.swf",true);
         }
         if(_root.trackEvent != undefined)
         {
            _root.trackEvent("MapClicked");
         }
      };
      _root.__zhDirectOpenMap = zhOpenMap;
      _root.__zhMapButtonBounds = {left:zhMapButton._x - 25,top:zhMapButton._y - 30,right:zhMapButton._x + 105,bottom:zhMapButton._y + 70};
      if(Mouse != undefined && _root.__zhMapMouseListener == undefined)
      {
         _root.__zhMapMouseListener = new Object();
         _root.__zhMapMouseListener.onMouseDown = function()
         {
            var zhMapBounds = _root.__zhMapButtonBounds;
            if(zhMapBounds != undefined && _root._xmouse >= zhMapBounds.left && _root._xmouse <= zhMapBounds.right && _root._ymouse >= zhMapBounds.top && _root._ymouse <= zhMapBounds.bottom)
            {
               if(_root.__zhDirectOpenMap != undefined)
               {
                  _root.__zhDirectOpenMap();
               }
            }
         };
         Mouse.addListener(_root.__zhMapMouseListener);
      }
      zhMapButton.onPress = zhMapButton.onRelease = zhOpenMap;
      zhMapButton.hit.onPress = zhMapButton.hit.onRelease = zhOpenMap;
      zhMapButton.label.onPress = zhMapButton.label.onRelease = zhOpenMap;
   }
}
function turnOffWardrobe()
{`,
    "gameplay frameless gameplay nav helper"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    "navBar.swapDepths(navDepth);",
`navBar.swapDepths(navDepth);
if(_root != undefined && _root.island == "Super")
{
   layoutFramelessGameplayNav(true);
}`,
    "gameplay frameless gameplay nav init"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    "      navBar.savingGame.play();",
    `      if(_root == undefined || _root.island != "Super")
      {
         navBar.savingGame.play();
      }
      else if(navBar.savingGame != undefined)
      {
         navBar.savingGame.stop();
         navBar.savingGame._visible = false;
      }`,
    "gameplay suppress saving text in frameless super"
  );

  return nextContent;
}

function applyAs2GameplayFrame5NavPatch(content) {
  let nextContent = normalizeScriptContent(content);
  nextContent = replaceRequiredSnippet(
    nextContent,
    `   if(globalScene)
   {
      navBar.btnSave._visible = false;
   }`,
    `   if(globalScene)
   {
      navBar.btnSave._visible = false;
   }
   if(_root != undefined && _root.island == "Super" && layoutFramelessGameplayNav != undefined)
   {
      layoutFramelessGameplayNav(true);
   }`,
    "gameplay frame_5 super nav relayout"
  );
  return nextContent;
}

function applyAs2GameplayFrame9InteractionPatch(content) {
  let nextContent = normalizeScriptContent(content);
  nextContent = replaceRequiredSnippet(
    nextContent,
    `var gMultiplayerRoomMoveReady = true;
var MOVE_TIMEOUT = 330;
camera.scene.bg.onPress = function()
{`,
    `var gMultiplayerRoomMoveReady = true;
var MOVE_TIMEOUT = 330;
function zhFindNearbyInteractiveChar(sceneRef, clickX, clickY)
{
   var _loc2_;
   var _loc3_;
   var _loc4_;
   var _loc5_;
   var _loc6_;
   var _loc7_ = null;
   var _loc8_ = 999999;
   for(var _loc9_ in sceneRef)
   {
      _loc2_ = sceneRef[_loc9_];
      if(_loc2_ != undefined && _loc2_ != sceneRef.char && _loc2_.interaction != undefined && _loc2_.interaction != "none" && _loc2_.avatar != undefined && _loc2_.isObject != true)
      {
         _loc3_ = Math.abs(_loc2_._x - clickX);
         _loc4_ = Math.abs(_loc2_._y - clickY);
         if(_loc3_ <= 180 && _loc4_ <= 150)
         {
            _loc5_ = _loc3_ + _loc4_;
            if(_loc5_ < _loc8_)
            {
               _loc8_ = _loc5_;
               _loc7_ = _loc2_;
            }
         }
      }
   }
   return _loc7_;
}
camera.scene.bg.onPress = function()
{
   if(_root.__zhMapSuppressBgUntil != undefined && getTimer() < _root.__zhMapSuppressBgUntil)
   {
      return undefined;
   }
   var zhMapBounds = _root.__zhMapButtonBounds;
   if(zhMapBounds != undefined && _root._xmouse >= zhMapBounds.left && _root._xmouse <= zhMapBounds.right && _root._ymouse >= zhMapBounds.top && _root._ymouse <= zhMapBounds.bottom)
   {
      if(_root.__zhDirectOpenMap != undefined)
      {
         _root.__zhDirectOpenMap();
      }
      return undefined;
   }`,
    "gameplay frame_9 nearby npc helper"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `      else
      {
         camera.scene.char.clickTarget(camera.scene._xmouse,camera.scene._ymouse);
      }`,
    `      else
      {
         var _loc1_ = zhFindNearbyInteractiveChar(camera.scene,camera.scene._xmouse,camera.scene._ymouse);
         if(_loc1_ != undefined && _loc1_.onPress != undefined)
         {
            _loc1_.onPress();
            return undefined;
         }
         else
         {
            camera.scene.char.clickTarget(camera.scene._xmouse,camera.scene._ymouse);
         }
      }`,
    "gameplay frame_9 nearby npc reroute"
  );
  return nextContent;
}

function applyAs2FrameworkTopRightNavPatch(content) {
  let nextContent = normalizeScriptContent(content);

  nextContent = replaceRequiredSnippet(
    nextContent,
    "function update(pObs, pInfoObj)\n   {",
    `function layoutTopRightNav()
   {
      if(this._nav_mc == undefined || this._nav_mc.gameplayBtn == undefined || this._nav_mc.homeBtn == undefined)
      {
         return undefined;
      }
      if(this._nav_original_layout == undefined)
      {
         this._nav_original_layout = new Object();
      }
      var _loc2_ = {
         gameplayBtn:true,
         dailypopBtn:true,
         statsBtn:true,
         friendshubBtn:true,
         homeBtn:true
      };
      for(var _loc8_ in this._nav_mc)
      {
         if(_loc2_[_loc8_] != true && this._nav_mc[_loc8_] != undefined && typeof this._nav_mc[_loc8_] == "movieclip")
         {
            this._nav_mc[_loc8_]._visible = false;
         }
      }
      var _loc3_ = [this._nav_mc.gameplayBtn,this._nav_mc.dailypopBtn,this._nav_mc.statsBtn,this._nav_mc.friendshubBtn,this._nav_mc.homeBtn];
      var _loc4_ = 1000;
      var _loc5_ = 12;
      var _loc6_ = 122;
      var _loc7_ = 10;
      var _loc9_ = 0;
      var _loc10_;
      var _loc11_;
      var _loc12_;
      var _loc13_;
      var _loc14_;
      var _loc15_;
      var _loc16_;
      var _loc17_;
      var _loc18_;
      var _loc19_;
      this._nav_mc.gotoAndStop(1);
      this._nav_mc._x = 0;
      this._nav_mc._y = 0;
      _loc8_ = 0;
      while(_loc8_ < _loc3_.length)
      {
         _loc10_ = _loc3_[_loc8_];
         if(_loc10_ != undefined)
         {
            if(this._nav_original_layout[_loc10_._name] == undefined)
            {
               _loc17_ = _loc10_.getBounds(this._nav_mc);
               this._nav_original_layout[_loc10_._name] = {
                  left:_loc17_.xMin,
                  top:_loc17_.yMin,
                  width:Math.max(1,_loc17_.xMax - _loc17_.xMin),
                  height:Math.max(1,_loc17_.yMax - _loc17_.yMin),
                  offsetX:_loc10_._x - _loc17_.xMin,
                  offsetY:_loc10_._y - _loc17_.yMin
               };
            }
            _loc10_._visible = true;
            _loc18_ = this._nav_original_layout[_loc10_._name];
            _loc9_ += _loc18_.width;
         }
         _loc8_ = _loc8_ + 1;
      }
      if(_loc9_ <= 0)
      {
         return undefined;
      }
      _loc9_ += _loc7_ * (_loc3_.length - 1);
      _loc19_ = _loc4_ - _loc5_ - _loc9_;
      if(_root != undefined)
      {
         _root.__zhFrameworkTopNavLeft = _loc19_;
         _root.__zhFrameworkTopNavRight = _loc4_ - _loc5_;
         _root.__zhFrameworkTopNavTop = _loc6_;
         _root.__zhFrameworkTopNavCenterY = _loc6_;
      }
      _loc8_ = 0;
      while(_loc8_ < _loc3_.length)
      {
         _loc10_ = _loc3_[_loc8_];
         if(_loc10_ != undefined)
         {
            _loc18_ = this._nav_original_layout[_loc10_._name];
            if(_loc18_ != undefined)
            {
               _loc10_._x = Math.round(_loc19_ + _loc18_.offsetX);
               _loc10_._y = Math.round(_loc6_ - (_loc18_.top + _loc18_.height / 2));
               _loc19_ += _loc18_.width + _loc7_;
            }
         }
         _loc8_ = _loc8_ + 1;
      }
      if(this._nav_logout != undefined)
      {
         this._nav_logout._visible = false;
      }
      if(this._nav_change_password != undefined)
      {
         this._nav_change_password._visible = false;
      }
      if(_root != undefined && _root.layoutFramelessGameplayNav != undefined)
      {
         _root.layoutFramelessGameplayNav(true);
      }
   }
   function applyGameplayViewportChrome(pSectionName)
   {
      var _loc2_ = pSectionName == "gameplay";
      var _loc3_ = _loc2_ || _root != undefined && _root.island == "Super";
      if(this._bg_mc != undefined)
      {
         this._bg_mc._visible = !_loc2_;
      }
      if(this._adWrapperView != undefined && this._adWrapperView.content_mc != undefined)
      {
         this._adWrapperView.content_mc._visible = !_loc3_;
      }
   }
   function update(pObs, pInfoObj)
   {`,
    "framework top-right nav helper"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    `      this.makeBG();
      this.makeNavBar();
   }`,
    `      this.makeBG();
      this.makeNavBar();
      this.layoutTopRightNav();
      this.applyGameplayViewportChrome(this._currentSectionName);
   }`,
    "framework MainView build nav layout"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    `      if(this._currentSectionName != pSectionName)
      {
         this.removeSection();
         this.setSection(pSectionName);
         this.updateNavBar(pSectionName);
      }
   }`,
    `      if(this._currentSectionName != pSectionName)
      {
         this.removeSection();
         this.setSection(pSectionName);
         this.updateNavBar(pSectionName);
      }
      this.layoutTopRightNav();
      this.applyGameplayViewportChrome(pSectionName);
   }`,
    "framework MainView section change nav layout"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    `         com.poptropica.models.PopModel.getInstance().sectionDimensionString = com.poptropica.views.MainView.sectionDimensions[_loc2_];
      }
   }`,
    `         com.poptropica.models.PopModel.getInstance().sectionDimensionString = com.poptropica.views.MainView.sectionDimensions[_loc2_];
      }
      this.layoutTopRightNav();
      this.applyGameplayViewportChrome(this._currentSectionName);
   }`,
    "framework MainView updateFrameDimensions chrome"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    `      this._nav_logout._visible = _loc2_;
      this._nav_change_password._visible = _loc2_;
   }`,
    `      this._nav_logout._visible = _loc2_;
      this._nav_change_password._visible = _loc2_;
      this.layoutTopRightNav();
   }`,
    "framework MainView logout nav layout"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    `      this._nav_mc.gotoAndStop(1);
      com.poptropica.controllers.PopController(this._controller).setPointerDisplay("arrow");`,
    `      this._nav_mc.gotoAndStop(1);
      com.poptropica.controllers.PopController(this._controller).setPointerDisplay("arrow");`,
    "framework MainView click nav layout"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    `      pItem.gotoAndStop(2);
      this._nav_mc.gotoAndStop(pIndex + 2);
      com.poptropica.controllers.PopController(this._controller).setPointerDisplay("click");
   }`,
    `      pItem.gotoAndStop(1);
      this._nav_mc.gotoAndStop(1);
      com.poptropica.controllers.PopController(this._controller).setPointerDisplay("click");
   }`,
    "framework MainView rollover nav layout"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    `      pItem.gotoAndStop(1);
      this._nav_mc.gotoAndStop(1);
      com.poptropica.controllers.PopController(this._controller).setPointerDisplay("arrow");
   }`,
    `      pItem.gotoAndStop(1);
      this._nav_mc.gotoAndStop(1);
      com.poptropica.controllers.PopController(this._controller).setPointerDisplay("arrow");
   }`,
    "framework MainView rollout nav layout"
  );

  return nextContent;
}

function applyAs2BasePageMinimalPatch(content) {
  let nextContent = normalizeScriptContent(content);
  if (!nextContent.includes("function flashpoint_audio_sanitize(")) {
    nextContent = nextContent.replace(
      "<!doctype html>",
      `<?php
function flashpoint_audio_sanitize($value) {
    $clean = preg_replace('/[^A-Za-z0-9_-]+/', '_', (string)$value);
    $clean = trim($clean);
    return $clean === '' ? null : $clean;
}

function flashpoint_audio_url_component($value) {
    return str_replace('%2F', '/', rawurlencode($value));
}

function flashpoint_collect_audio_overrides() {
    $root = __DIR__ . '/flashpoint/user-audio/as2';
    $urlRoot = '/flashpoint/user-audio/as2';
    $allowed = array('mp3' => true, 'ogg' => true, 'wav' => true, 'm4a' => true);
    $manifest = array();

    if(!is_dir($root))
        return $manifest;

    foreach(scandir($root) as $islandEntry) {
        if($islandEntry === '.' || $islandEntry === '..')
            continue;

        $islandDir = $root . DIRECTORY_SEPARATOR . $islandEntry;
        if(!is_dir($islandDir))
            continue;

        $islandKey = flashpoint_audio_sanitize($islandEntry);
        if($islandKey === null)
            continue;

        foreach(scandir($islandDir) as $fileEntry) {
            if($fileEntry === '.' || $fileEntry === '..')
                continue;

            $filePath = $islandDir . DIRECTORY_SEPARATOR . $fileEntry;
            if(!is_file($filePath))
                continue;

            $extension = strtolower(pathinfo($fileEntry, PATHINFO_EXTENSION));
            if(!isset($allowed[$extension]))
                continue;

            $sceneKey = flashpoint_audio_sanitize(pathinfo($fileEntry, PATHINFO_FILENAME));
            if($sceneKey === null)
                continue;

            $manifest[strtolower($islandKey . '/' . $sceneKey)] =
                $urlRoot . '/' . flashpoint_audio_url_component($islandEntry) . '/' . flashpoint_audio_url_component($fileEntry);
        }
    }

    return $manifest;
}
?>
<!doctype html>`
    );
  }
  const primaryEmbedPattern = /<embed id="game" scale="noscale" wmode="(?:direct|gpu|window|opaque)"(?: allowScriptAccess="always")? menu="false" bgcolor="139ffd" hidden>/u;
  if (!primaryEmbedPattern.test(nextContent)) {
    throw new Error("Unable to locate base.php primary embed wmode");
  }
  nextContent = nextContent.replace(
    primaryEmbedPattern,
    `<div id="gameViewport"><embed id="game" scale="noscale" wmode="opaque" allowScriptAccess="always" menu="false" bgcolor="139ffd" hidden></div>
        <audio id="flashpointSceneAudio" preload="auto" autoplay loop style="position:absolute;width:0;height:0;opacity:0;pointer-events:none"></audio>`
  );
  nextContent = nextContent.replace(
    /body,\s*embed\s*\{\s*background-color:\s*#139ffd;\s*\}\s*embed\s*\{\s*outline-width:\s*0;\s*position:\s*absolute;\s*\}/u,
    `html, body {
    margin: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

body, embed { background-color: #139ffd; }

#gameViewport {
    position: absolute;
    overflow: hidden;
}

embed {
    outline-width: 0;
    position: absolute;
}`
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `const game = document.getElementById("game"),
      errorText = document.getElementById("errorText"),
      lsKey = "lastScene";`,
    `const gameViewport = document.getElementById("gameViewport"),
      game = document.getElementById("game"),
      sceneAudio = document.getElementById("flashpointSceneAudio"),
      sceneAudioOverrides = <?php echo json_encode(flashpoint_collect_audio_overrides()); ?>,
      errorText = document.getElementById("errorText"),
      lsKey = "lastScene",
      as2SoundEffectPool = [],
      AS2_SOUND_EFFECT_POOL_LIMIT = 8,
      STANDARD_GAMEPLAY_VIEWPORT = { x: 0, y: 44, width: 1010, height: 500 };`,
    "base page viewport host constants"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `main();

function main() {
    const params = getInput();
    flashpointLoad(params.island, params.room, params.startup_path);
}`,
    `main();
window.addEventListener("resize", () => applyCurrentViewport());

function main() {
    const params = getInput();
    flashpointLoad(params.island, params.room, params.startup_path);
}

function computeScaledViewport(baseWidth, baseHeight, gameState) {
    let displayWidth = baseWidth;
    let displayHeight = baseHeight;
    let viewportWidth = baseWidth;
    let viewportHeight = baseHeight;
    let offsetLeft = 0;
    let offsetTop = 0;
    let viewportScale = 1;
    let useViewportCrop = false;

    if(gameState === "return_user_standard") {
        viewportScale = Math.max(0.25, Math.min(window.innerWidth / baseWidth, window.innerHeight / baseHeight));
        displayWidth = baseWidth;
        displayHeight = baseHeight;
        viewportWidth = baseWidth;
        viewportHeight = baseHeight;
        offsetLeft = Math.round((window.innerWidth - viewportWidth * viewportScale) / 2);
        offsetTop = Math.round((window.innerHeight - viewportHeight * viewportScale) / 2);
        useViewportCrop = true;
    }

    return { displayWidth, displayHeight, viewportWidth, viewportHeight, offsetLeft, offsetTop, viewportScale, useViewportCrop };
}

function applyGameViewport(viewport, gameState) {
    game.width = viewport.displayWidth;
    game.height = viewport.displayHeight;
    game.setAttribute("width", String(viewport.displayWidth));
    game.setAttribute("height", String(viewport.displayHeight));
    game.style.width = \`\${ viewport.displayWidth }px\`;
    game.style.height = \`\${ viewport.displayHeight }px\`;
    if(gameState === "return_user_standard") {
        gameViewport.style.width = \`\${ viewport.viewportWidth }px\`;
        gameViewport.style.height = \`\${ viewport.viewportHeight }px\`;
        gameViewport.style.left = "0px";
        gameViewport.style.top = "0px";
        gameViewport.style.transformOrigin = "top left";
        gameViewport.style.transform = \`translate(\${ viewport.offsetLeft }px, \${ viewport.offsetTop }px) scale(\${ viewport.viewportScale })\`;
        game.style.left = "0px";
        game.style.top = "0px";
    } else {
        gameViewport.style.width = \`\${ viewport.displayWidth }px\`;
        gameViewport.style.height = \`\${ viewport.displayHeight }px\`;
        gameViewport.style.left = \`calc(50vw - \${ viewport.displayWidth }px / 2)\`;
        gameViewport.style.top = \`calc(50vh - \${ viewport.displayHeight }px / 2)\`;
        gameViewport.style.transformOrigin = "";
        gameViewport.style.transform = "";
        game.style.left = "0px";
        game.style.top = "0px";
    }
}

function applyCurrentViewport() {
    if(!game.__zhViewportState)
        return;

    const viewport = computeScaledViewport(
        game.__zhViewportState.baseWidth,
        game.__zhViewportState.baseHeight,
        game.__zhViewportState.gameState
    );
    applyGameViewport(viewport, game.__zhViewportState.gameState);
}`,
    "base page scaled viewport helpers"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `function flashpointLoad(island, scene, path = PATH_DEFAULT) {`,
    `function sanitizeAudioKeyPart(value) {
    return String(value || "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function resolveAs2SoundEffect(soundName) {
    const soundKey = sanitizeAudioKeyPart(soundName);
    if(!soundKey)
        return null;
    return sceneAudioOverrides["_sounds/" + soundKey] || null;
}

function flashpointPlayAs2Sound(soundName) {
    const audioSrc = resolveAs2SoundEffect(soundName);
    if(!audioSrc)
        return false;

    try {
        const soundAudio = new Audio(audioSrc);
        soundAudio.preload = "auto";
        soundAudio.autoplay = true;
        soundAudio.loop = false;
        soundAudio.muted = false;
        soundAudio.volume = 0.55;
        as2SoundEffectPool.push(soundAudio);
        while(as2SoundEffectPool.length > AS2_SOUND_EFFECT_POOL_LIMIT) {
            const oldAudio = as2SoundEffectPool.shift();
            try { oldAudio.pause(); } catch(err) { }
        }
        soundAudio.addEventListener("ended", function() {
            const index = as2SoundEffectPool.indexOf(soundAudio);
            if(index >= 0)
                as2SoundEffectPool.splice(index, 1);
        });
        const playResult = soundAudio.play();
        if(playResult && typeof playResult.catch === "function")
            playResult.catch(function() { });
        return true;
    } catch(err) {
        return false;
    }
}

window.flashpointPlayAs2Sound = flashpointPlayAs2Sound;

function updateSceneAudio(island, scene, gameState) {
    if(!sceneAudio)
        return;

    let audioSrc = null;
    if(gameState === "return_user_standard") {
        const islandKey = sanitizeAudioKeyPart(island),
              sceneKey = sanitizeAudioKeyPart(scene),
              candidates = [
                  islandKey + "/" + sceneKey,
                  islandKey + "/default",
                  "_global/" + sceneKey,
                  "_global/default"
              ];

        for(let index = 0; index < candidates.length; index++) {
            if(sceneAudioOverrides[candidates[index]]) {
                audioSrc = sceneAudioOverrides[candidates[index]];
                break;
            }
        }
    }

    if(!audioSrc) {
        sceneAudio.pause();
        sceneAudio.removeAttribute("src");
        try { sceneAudio.load(); } catch(err) { }
        return;
    }

    if(sceneAudio.getAttribute("src") !== audioSrc) {
        sceneAudio.autoplay = true;
        sceneAudio.loop = true;
        sceneAudio.muted = false;
        sceneAudio.volume = 0.35;
        sceneAudio.setAttribute("autoplay", "autoplay");
        sceneAudio.setAttribute("src", audioSrc);
        sceneAudio.src = audioSrc;
        sceneAudio.load();
    }

    try {
        const playResult = sceneAudio.play();
        if(playResult && typeof playResult.catch === "function")
            playResult.catch(function() { });
    } catch(err) { }
}

function flashpointLoad(island, scene, path = PATH_DEFAULT) {`,
    "base page audio override helpers"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `    game.width = width;
    game.height = height;
    game.style.left = \`calc(50vw - \${ width }px / 2)\`;
    game.style.top = \`calc(50vh - \${ height }px / 2)\`;
    game.setAttribute("flashvars", flashVars);`,
    `    const viewport = computeScaledViewport(width, height, gameState);
    game.__zhViewportState = { baseWidth: width, baseHeight: height, gameState };
    applyGameViewport(viewport, gameState);
    game.setAttribute("flashvars", flashVars);`,
    "base page scaled viewport application"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `    game.setAttribute("flashvars", flashVars);

    if(pageState === STATE_FP_START)`,
    `    game.setAttribute("flashvars", flashVars);
    updateSceneAudio(island, scene, gameState);

    if(pageState === STATE_FP_START)`,
    "base page audio override sync"
  );
  return nextContent;
}

function buildAs2BasePageAsset({ config, outputDir, manifest }) {
  const sourceZip = config.sources?.as2Gamezip;
  if (!sourceZip || !fileExists(sourceZip)) {
    return;
  }

  const tempRoot = path.join(paths.tempDir, "as2-base-page-asset");
  removeDirContents(tempRoot);
  ensureDirSync(tempRoot);

  const extractRoot = path.join(tempRoot, "source");
  const extractResult = extractZipEntryToTemp({
    archivePath: sourceZip,
    entryName: AS2_SUPER_POWER_BASE_PAGE_PATH,
    outputDir: extractRoot,
    tarBin: config.tools.tarBin
  });
  if (!extractResult.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "as2-shared:base-page",
      assetPath: AS2_SUPER_POWER_BASE_PAGE_PATH,
      reason: extractResult.error
    });
    return;
  }

  const sourceFile = path.join(extractRoot, AS2_SUPER_POWER_BASE_PAGE_PATH.replace(/\//gu, path.sep));
  const outputFile = path.join(outputDir, "files", AS2_SUPER_POWER_BASE_PAGE_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(outputFile));
  writeText(outputFile, applyAs2BasePageMinimalPatch(fs.readFileSync(sourceFile, "utf8")));
  manifest.assetsPatched += 1;
  manifest.externalTextAssets.push({
    assetId: "as2-shared:base-page",
    assetPath: AS2_SUPER_POWER_BASE_PAGE_PATH,
    outputPath: outputFile
  });
}

function buildAs2SharedFormattedSwfAsset({
  config,
  outputDir,
  manifest,
  sourceZip,
  sharedTempRoot,
  assetId,
  assetPath,
  replacements
}) {
  const ffdecCli = config.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    manifest.pendingSwfAssets.push({
      assetId,
      assetPath,
      reason: "FFDec CLI is not configured"
    });
    return;
  }

  const extractRoot = path.join(sharedTempRoot, `${path.basename(assetPath, ".swf")}-source`);
  const extractResult = extractZipEntryToTemp({
    archivePath: sourceZip,
    entryName: assetPath,
    outputDir: extractRoot,
    tarBin: config.tools.tarBin
  });
  if (!extractResult.ok) {
    manifest.pendingSwfAssets.push({
      assetId,
      assetPath,
      reason: extractResult.error
    });
    return;
  }

  const sourceSwf = path.join(extractRoot, assetPath.replace(/\//gu, path.sep));
  const translatedTextRoot = path.join(sharedTempRoot, `${path.basename(assetPath, ".swf")}-texts`);
  const swfPatch = buildManualFormattedSwfTextPatch({
    inputSwf: sourceSwf,
    ffdecCli,
    translatedTextRoot,
    replacements
  });
  if (!swfPatch.ok) {
    manifest.pendingSwfAssets.push({
      assetId,
      assetPath,
      reason: swfPatch.error || `Unable to export ${path.basename(assetPath)} text`
    });
    return;
  }
  if ((swfPatch.translatedFiles || []).length === 0) {
    return;
  }

  const outputSwf = path.join(outputDir, "swf", assetPath.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(outputSwf));
  const replaceResult = replaceSwfTexts({
    ffdecCli,
    inputSwf: sourceSwf,
    outputSwf,
    translatedFiles: swfPatch.translatedFiles,
    fontIds: swfPatch.fontIds || [],
    fontIdsByExportPath: swfPatch.fontIdsByExportPath || new Map(),
    fontFilePath: findPreferredSwfFontFile(config),
    sequential: true
  });
  if (!replaceResult.ok) {
    manifest.pendingSwfAssets.push({
      assetId,
      assetPath,
      reason: replaceResult.error || `Unable to rebuild ${path.basename(assetPath)}`
    });
    return;
  }

  manifest.assetsPatched += 1;
  manifest.swfPatchedAssets.push({
    assetId,
    assetPath,
    outputPath: outputSwf
  });
}

function buildAs2SharedMenuAssets({ db, config, outputDir, manifest }) {
  const sourceZip = config.sources?.as2Gamezip;
  if (!sourceZip || !fileExists(sourceZip)) {
    return;
  }

  const sharedTempRoot = path.join(paths.tempDir, "as2-shared-menu-assets");
  removeDirContents(sharedTempRoot);
  ensureDirSync(sharedTempRoot);

  const assetRows = db ? db.getAssetsForSourceGroup("as2") : [];
  const stringRows = db ? db.getStringsForPack("as2") : [];

  const getAssetRow = (assetPath) => assetRows.find((row) => row.asset_path === assetPath) || null;
  const getAssetStrings = (assetPath) => stringRows.filter((row) => row.asset_path === assetPath);

  const sharedPhpAsset = getAssetRow(AS2_SHARED_GET_INVENTORY_MENU_PATH);
  const sharedPhpRows = getAssetStrings(AS2_SHARED_GET_INVENTORY_MENU_PATH);
  if (sharedPhpAsset?.extracted_path && fileExists(sharedPhpAsset.extracted_path) && sharedPhpRows.length > 0) {
    const outputFile = path.join(outputDir, "files", AS2_SHARED_GET_INVENTORY_MENU_PATH.replace(/\//gu, path.sep));
    ensureDirSync(path.dirname(outputFile));
    const originalContent = fs.readFileSync(sharedPhpAsset.extracted_path, "utf8");
    const translatedContent = applyStructuredReplacements(originalContent, sharedPhpAsset.asset_type, sharedPhpAsset.asset_path, sharedPhpRows);
    if (translatedContent !== originalContent) {
      writeText(outputFile, translatedContent);
      manifest.assetsPatched += 1;
      manifest.externalTextAssets.push({
        assetId: "as2-shared:get-inventory-menu",
        assetPath: AS2_SHARED_GET_INVENTORY_MENU_PATH,
        outputPath: outputFile
      });
    }
  }

  for (const popupSpec of [
    {
      assetId: "as2-shared:inventory-popup",
      assetPath: AS2_SHARED_INVENTORY_PATH,
      replacements: AS2_SHARED_INVENTORY_TEXT_REPLACEMENTS
    },
    {
      assetId: "as2-shared:wardrobe-popup",
      assetPath: AS2_SHARED_WARDROBE_PATH,
      replacements: AS2_SHARED_WARDROBE_TEXT_REPLACEMENTS
    },
    {
      assetId: "as2-shared:travelmap-popup",
      assetPath: AS2_SHARED_TRAVELMAP_PATH,
      replacements: AS2_SHARED_TRAVELMAP_TEXT_REPLACEMENTS
    }
  ]) {
    buildAs2SharedFormattedSwfAsset({
      config,
      outputDir,
      manifest,
      sourceZip,
      sharedTempRoot,
      assetId: popupSpec.assetId,
      assetPath: popupSpec.assetPath,
      replacements: popupSpec.replacements
    });
  }

  buildAs2SharedMapPopupAsset({
    config,
    outputDir,
    manifest,
    sourceZip,
    sharedTempRoot
  });
}

function applyAs2MapPopupScriptPatch(content) {
  let nextContent = normalizeScriptContent(content);
  const replacement = `function showResetDialog()
{
   gResetDialog = this.attachMovie("ResetIslandPopup","ResetIslandPopup",this.getNextHighestDepth());
   gResetDialog.label.htmlText = "确定要重置<FONT color=\\"#ffe23d\\">" + gCurrentIslandName + "</FONT>吗？该岛上的道具和进度都会丢失。";
   gResetDialog.resetButton.onRelease = function()
   {
      var _loc1_;
      if(_root != undefined && _root.island == "Super")
      {
         _loc1_ = com.poptropica.models.PopModelConst.avatar;
         if(_loc1_ != undefined && _loc1_.FunBrain_so != undefined)
         {
            delete _loc1_.FunBrain_so.data.dir;
            delete _loc1_.FunBrain_so.data.leftExit;
            delete _loc1_.FunBrain_so.data.leftExitX;
            delete _loc1_.FunBrain_so.data.leftExitY;
            delete _loc1_.FunBrain_so.data.rightExit;
            delete _loc1_.FunBrain_so.data.rightExitX;
            delete _loc1_.FunBrain_so.data.rightExitY;
            delete _loc1_.FunBrain_so.data.timeWarp;
            _loc1_.FunBrain_so.data.lastRoom = "SuperMain";
            _loc1_.FunBrain_so.data.lastIsland = "Super";
            _loc1_.FunBrain_so.data.SuperMainxPos = 2440;
            _loc1_.FunBrain_so.data.SuperMainyPos = 1270;
            _loc1_.FunBrain_so.flush();
         }
         delete resetIslandButton.onRelease;
         resetIslandButton._visible = false;
         _root.closePopup();
         gResetDialog.removeMovieClip();
         if(_root.loader_mc != undefined)
         {
            _root.loader_mc.removeMovieClip();
         }
         getURL("javascript:POSTToBase('SuperMain','Super','gameplay')");
         return undefined;
      }
      _root.char.loadScene("FlashpointIslandRestart",0,0);
      delete resetIslandButton.onRelease;
      resetIslandButton._visible = false;
      _root.closePopup();
      gResetDialog.removeMovieClip();
   };
   gResetDialog.cancelButton.onRelease = function()
   {
      gResetDialog.removeMovieClip();
   };
}`;
  const nextPatchedContent = nextContent.replace(/function showResetDialog\(\)\s*\{[\s\S]*?gResetDialog\.cancelButton\.onRelease = function\(\)\s*\{[\s\S]*?\};\s*\}/u, replacement);
  if (nextPatchedContent === nextContent) {
    throw new Error("Unable to locate map popup Super restart override");
  }
  nextContent = nextPatchedContent;
  return nextContent;
}

function buildAs2SharedMapPopupAsset({ config, outputDir, manifest, sourceZip, sharedTempRoot }) {
  const ffdecCli = config.tools?.ffdecCli;
  if (!sourceZip || !fileExists(sourceZip) || !ffdecCli || !fileExists(ffdecCli)) {
    return;
  }

  const extractRoot = path.join(sharedTempRoot, "map-source");
  const extractResult = extractZipEntryToTemp({
    archivePath: sourceZip,
    entryName: AS2_SHARED_MAP_PATH,
    outputDir: extractRoot,
    tarBin: config.tools.tarBin
  });
  if (!extractResult.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "as2-shared:map-popup",
      assetPath: AS2_SHARED_MAP_PATH,
      reason: extractResult.error
    });
    return;
  }

  const sourceSwf = path.join(extractRoot, AS2_SHARED_MAP_PATH.replace(/\//gu, path.sep));
  const translatedTextRoot = path.join(sharedTempRoot, "map-texts");
  const swfPatch = buildManualFormattedSwfTextPatch({
    inputSwf: sourceSwf,
    ffdecCli,
    translatedTextRoot,
    replacements: AS2_SHARED_MAP_TEXT_REPLACEMENTS
  });
  if (!swfPatch.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "as2-shared:map-popup",
      assetPath: AS2_SHARED_MAP_PATH,
      reason: swfPatch.error || "Unable to export map.swf text"
    });
    return;
  }

  const scriptRoot = path.join(sharedTempRoot, "map-scripts");
  const scriptExport = exportSwfScriptsForPatch({
    ffdecCli,
    inputSwf: sourceSwf,
    outputDir: scriptRoot
  });
  if (!scriptExport.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "as2-shared:map-popup",
      assetPath: AS2_SHARED_MAP_PATH,
      reason: scriptExport.error || "Unable to export map.swf scripts"
    });
    return;
  }

  const patchRoot = path.join(sharedTempRoot, "map-patch");
  const frame2Script = ensureTranslatedScriptFromSource({
    sourceScriptRoot: scriptRoot,
    translatedScriptRoot: patchRoot,
    exportPath: path.join("scripts", "frame_2", "DoAction.as")
  });
  writeText(frame2Script, applyAs2MapPopupScriptPatch(fs.readFileSync(frame2Script, "utf8")));

  const outputSwf = path.join(outputDir, "swf", AS2_SHARED_MAP_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(outputSwf));
  const tempTextOutput = path.join(sharedTempRoot, "map-text-pass.swf");
  let result = { ok: true };
  if ((swfPatch.translatedFiles || []).length > 0) {
    result = replaceSwfTexts({
      ffdecCli,
      inputSwf: sourceSwf,
      outputSwf: tempTextOutput,
      translatedFiles: swfPatch.translatedFiles || [],
      fontIds: swfPatch.fontIds || [],
      fontIdsByExportPath: swfPatch.fontIdsByExportPath || new Map(),
      fontFilePath: findPreferredSwfFontFile(config),
      sequential: true
    });
  } else {
    fs.copyFileSync(sourceSwf, tempTextOutput);
  }
  if (!result.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "as2-shared:map-popup",
      assetPath: AS2_SHARED_MAP_PATH,
      reason: result.error || "Unable to rebuild map.swf text pass"
    });
    return;
  }

  result = replaceSwfScriptExports({
    ffdecCli,
    inputSwf: tempTextOutput,
    outputSwf,
    translatedFiles: collectSwfScriptFiles(patchRoot)
  });
  if (fileExists(tempTextOutput)) {
    fs.rmSync(tempTextOutput, { force: true });
  }
  if (!result.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "as2-shared:map-popup",
      assetPath: AS2_SHARED_MAP_PATH,
      reason: result.error || "Unable to rebuild map.swf"
    });
    return;
  }

  manifest.assetsPatched += 1;
  manifest.swfPatchedAssets.push({
    assetId: "as2-shared:map-popup",
    assetPath: AS2_SHARED_MAP_PATH,
    outputPath: outputSwf
  });
}

function applyAs2RestartIslandScriptPatch(content) {
  let nextContent = normalizeScriptContent(content);
  nextContent = replaceRequiredSnippet(
    nextContent,
    `      public function main() : void
      {
         this.loadIslandXML();
      }`,
    `      public function main() : void
      {
         var _loc1_:PopUtils = null;
         var _loc2_:Vector.<Number> = null;
         if(loaderInfo != null && loaderInfo.parameters != null && loaderInfo.parameters.island === "Super")
         {
            _loc1_ = new PopUtils(loaderInfo.parameters);
            if(_loc1_.userLSO != null)
            {
               delete _loc1_.userLSO.data.dir;
               delete _loc1_.userLSO.data.leftExit;
               delete _loc1_.userLSO.data.leftExitX;
               delete _loc1_.userLSO.data.leftExitY;
               delete _loc1_.userLSO.data.rightExit;
               delete _loc1_.userLSO.data.rightExitX;
               delete _loc1_.userLSO.data.rightExitY;
               delete _loc1_.userLSO.data.timeWarp;
               this.restartIsland("Super",_loc1_.userLSO);
               _loc2_ = new Vector.<Number>(2);
               _loc2_[0] = 2440;
               _loc2_[1] = 1270;
               _loc1_.setSceneCoords("SuperMain",_loc2_);
               _loc1_.save();
            }
            navigateToURL(new URLRequest("javascript:POSTToBase('SuperMain','Super','gameplay')"),"_self");
            return;
         }
         this.loadIslandXML();
      }`,
    "restartIsland Super direct start fallback"
  );
  return nextContent;
}

function buildAs2RestartIslandAsset({ config, outputDir, manifest }) {
  const sourceZip = config.sources?.as2Gamezip;
  const ffdecCli = config.tools?.ffdecCli;
  if (!sourceZip || !fileExists(sourceZip) || !ffdecCli || !fileExists(ffdecCli)) {
    return;
  }

  const tempRoot = path.join(paths.tempDir, "as2-restart-island-asset");
  removeDirContents(tempRoot);
  ensureDirSync(tempRoot);

  const extractRoot = path.join(tempRoot, "source");
  const extractResult = extractZipEntryToTemp({
    archivePath: sourceZip,
    entryName: AS2_SHARED_RESTART_ISLAND_PATH,
    outputDir: extractRoot,
    tarBin: config.tools.tarBin
  });
  if (!extractResult.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "as2-shared:restart-island",
      assetPath: AS2_SHARED_RESTART_ISLAND_PATH,
      reason: extractResult.error
    });
    return;
  }

  const sourceSwf = path.join(extractRoot, AS2_SHARED_RESTART_ISLAND_PATH.replace(/\//gu, path.sep));
  const scriptRoot = path.join(tempRoot, "scripts");
  const scriptExport = exportSwfScriptsForPatch({
    ffdecCli,
    inputSwf: sourceSwf,
    outputDir: scriptRoot
  });
  if (!scriptExport.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "as2-shared:restart-island",
      assetPath: AS2_SHARED_RESTART_ISLAND_PATH,
      reason: scriptExport.error || "Unable to export restartIsland.swf scripts"
    });
    return;
  }

  const patchRoot = path.join(tempRoot, "patch");
  const mainTimelineScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: scriptRoot,
    translatedScriptRoot: patchRoot,
    exportPath: path.join("scripts", "restartIsland_fla", "MainTimeline.as")
  });
  writeText(mainTimelineScript, applyAs2RestartIslandScriptPatch(fs.readFileSync(mainTimelineScript, "utf8")));

  const outputSwf = path.join(outputDir, "swf", AS2_SHARED_RESTART_ISLAND_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(outputSwf));
  const replaceResult = replaceSwfScriptExports({
    ffdecCli,
    inputSwf: sourceSwf,
    outputSwf,
    translatedFiles: [
      {
        filePath: mainTimelineScript,
        exportPath: "scripts/restartIsland_fla/MainTimeline.as",
        replaceTarget: "restartIsland_fla.MainTimeline"
      }
    ]
  });
  if (!replaceResult.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "as2-shared:restart-island",
      assetPath: AS2_SHARED_RESTART_ISLAND_PATH,
      reason: replaceResult.error || "Unable to rebuild restartIsland.swf"
    });
    return;
  }

  manifest.assetsPatched += 1;
  manifest.swfPatchedAssets.push({
    assetId: "as2-shared:restart-island",
    assetPath: AS2_SHARED_RESTART_ISLAND_PATH,
    outputPath: outputSwf
  });
}

function writeAs2SuperPowerAudioAudit({ outputDir, manifest }) {
  const reportPath = path.join(outputDir, "reports", "super-power-audio-audit.json");
  ensureDirSync(path.dirname(reportPath));
  writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    sourceGroup: "as2",
    islandId: "super-power",
    conclusion: "missing_original_audio_assets",
    summary: "Super Power AS2 still calls the shared showSound chain, but the shipped AS2 resources do not contain recoverable sound payloads for those calls.",
    evidence: [
      {
        type: "scene-script-call",
        assetPath: AS2_SUPER_POWER_SCENE_PATH,
        notes: "_root.showSound(\"ring\", ...) is present in scene scripts."
      },
      {
        type: "scene-script-call",
        assetPath: AS2_SUPER_POWER_DOWNTOWN_PATH,
        notes: "_root.showSound(\"crunch\", ...) and comicSound-based calls are present in scene scripts."
      },
      {
        type: "shared-api",
        assetPath: AS2_SUPER_POWER_GAMEPLAY_PATH,
        notes: "gameplay.swf exports SoundBubble and routes showSound(frameName, ...) through attachMovie(\"SoundBubble\")."
      },
      {
        type: "missing-sound-tags",
        assetPath: AS2_SUPER_POWER_GAMEPLAY_PATH,
        notes: "FFDec sound export is empty, and gameplay/framework/super scene tag dumps do not contain DefineSound, StartSound, or SoundStream tags."
      },
      {
        type: "missing-external-audio",
        assetPath: "content/www.poptropica.com/scenes/islandSuper/assets/",
        notes: "AS2.zip does not ship islandSuper mp3/wav/flv audio assets, unlike some other islands."
      }
    ],
    recoveryPolicy: "Original Super Power AS2 audio cannot be restored from the current archive. Any future audible version would require newly supplied replacement audio assets."
  });
  manifest.audioAuditReports = manifest.audioAuditReports || [];
  manifest.audioAuditReports.push({
    islandId: "super-power",
    conclusion: "missing_original_audio_assets",
    reportPath
  });
}

function applyAs2CharBalloonScriptPatch(content) {
  let nextContent = normalizeScriptContent(content);
  if (!nextContent.includes("function decodeZhBalloonText(")) {
    nextContent = replaceRequiredSnippet(
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
      "decodeZhBalloonText insertion"
    );
  }

  nextContent = replaceRequiredSnippet(
    nextContent,
    `      balloon = _parent.createEmptyMovieClip(balloonName,_parent.balloonDepth);
      _loc5_ = new MovieClipLoader();`,
    `      balloon = _parent.createEmptyMovieClip(balloonName,_parent.balloonDepth);
      if(char.talkyText != undefined)
      {
         char.talkyText = decodeZhBalloonText(char.talkyText);
      }
      _loc5_ = new MovieClipLoader();`,
    "showBalloon text decode injection"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `      _loc5_.loadClip("popups/balloon.swf",balloon);`,
    `      _loc5_.loadClip("popups/counter/balloon.swf?zhfix=sp2",balloon);`,
    "showBalloon patched balloon path"
  );
  nextContent = replaceRequiredSnippet(
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
    "hideBalloon guard patch"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `   balloon = _parent.createEmptyMovieClip(balloonName,_parent.getNextHighestDepth());
   var _loc4_ = new MovieClipLoader();`,
    `   balloon = _parent.createEmptyMovieClip(balloonName,_parent.getNextHighestDepth());
   if(char.talkyText != undefined)
   {
      char.talkyText = decodeZhBalloonText(char.talkyText);
   }
   var _loc4_ = new MovieClipLoader();`,
    "showCounterBalloon text decode injection"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `   _loc4_.loadClip("popups/counter/balloon.swf",balloon);`,
    `   _loc4_.loadClip("popups/counter/balloon.swf?zhfix=sp2",balloon);`,
    "showCounterBalloon patched balloon path"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `var npc;
if(isChar != true && _parent.home != true && interaction != "none")
{`,
    `function ensureZhInteractiveHitArea(targetClip)
{
   var _loc2_;
   var _loc3_;
   var _loc4_;
   var _loc5_;
   var _loc6_;
   if(targetClip == undefined || targetClip.avatar == undefined)
   {
      return undefined;
   }
   if(targetClip.__zhHitArea == undefined)
   {
      targetClip.createEmptyMovieClip("__zhHitArea",targetClip.getNextHighestDepth());
   }
   _loc2_ = targetClip.avatar.getBounds(targetClip);
   if(_loc2_ == undefined || _loc2_.xMax - _loc2_.xMin < 1 || _loc2_.yMax - _loc2_.yMin < 1)
   {
      _loc2_ = targetClip.getBounds(targetClip);
   }
   _loc3_ = _loc2_.xMin - 48;
   _loc4_ = _loc2_.yMin - 44;
   _loc5_ = _loc2_.xMax + 48;
   _loc6_ = _loc2_.yMax + 34;
   targetClip.__zhHitArea.clear();
   targetClip.__zhHitArea.beginFill(16711680,0);
   targetClip.__zhHitArea.moveTo(_loc3_,_loc4_);
   targetClip.__zhHitArea.lineTo(_loc5_,_loc4_);
   targetClip.__zhHitArea.lineTo(_loc5_,_loc6_);
   targetClip.__zhHitArea.lineTo(_loc3_,_loc6_);
   targetClip.__zhHitArea.lineTo(_loc3_,_loc4_);
   targetClip.__zhHitArea.endFill();
   targetClip.__zhHitArea._visible = false;
   targetClip.hitArea = targetClip.__zhHitArea;
}
var npc;
if(isChar != true && _parent.home != true && interaction != "none")
{`,
    "char larger interactive hit area helper"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `   };
}
if(false && isChar)`,
    `   };
   ensureZhInteractiveHitArea(this);
}
if(false && isChar)`,
    "char larger interactive hit area call"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `function exitRoom(clip)
{
   if(this.avatar.FunBrain_so.data.dontReturn == true)
   {
      this.avatar.FunBrain_so.data.dontReturn = false;
      this.avatar.FunBrain_so.flush();
   }
   trace("exitRoom: desc " + clip.desc);
   var _loc4_;
   if(!_root.gWaitingOnServer)
   {
      if(this.avatar.isRegistred())
      {
         _root.logWWW("avatar is registered, clipisle is " + clip.island + ", rootisle is " + _root.island);
         _loc4_ = clip.island;
         if(_loc4_ == undefined)
         {
            _loc4_ = _root.island;
         }
         this.avatar.updateIslandData(_loc4_,Delegate.create(this,exitRoomInternal,clip));
      }
      else
      {
         exitRoomInternal(clip);
      }
   }
   else
   {
      _root.gServerOperationComplete = Delegate.create(this,exitRoom,clip);
      trace("server op active, storing callback : " + _root.gServerOperationComplete);
   }
}`,
    `function directNavigateZhSuperExit(clip)
{
   var _loc2_;
   var _loc3_;
   if(_root == undefined || _root.island != "Super" || clip == undefined)
   {
      return false;
   }
   _loc2_ = undefined;
   if(clip.leftExit != undefined || clip.rightExit != undefined)
   {
      if(clip.scale != undefined && Number(clip.scale) < 0 && clip.rightExit != undefined)
      {
         _loc2_ = clip.rightExit;
      }
      else if(clip.labelText != undefined && String(clip.labelText).indexOf("右") >= 0 && clip.rightExit != undefined)
      {
         _loc2_ = clip.rightExit;
      }
      else if(clip.leftExit != undefined)
      {
         _loc2_ = clip.leftExit;
      }
      else if(clip.rightExit != undefined)
      {
         _loc2_ = clip.rightExit;
      }
   }
   if(_loc2_ == undefined && clip.desc != undefined && typeof clip.desc != "string" && clip.desc.length != undefined && clip.desc.length >= 1)
   {
      _loc2_ = clip.desc;
   }
   if(_loc2_ == undefined || _loc2_.length == undefined || _loc2_.length < 1)
   {
      return false;
   }
   _loc3_ = String(_loc2_[0]);
   if(_loc3_ == undefined || _loc3_ == null || _loc3_ == "" || _loc3_ == "undefined" || _loc3_ == "null")
   {
      return false;
   }
   if(_loc3_.substr(0,8) == "AdGround" || _loc3_ == "leftAd" || _loc3_ == "rightAd")
   {
      return false;
   }
   if(_root.takeClick != undefined)
   {
      _root.takeClick._visible = true;
   }
   if(this.avatar != undefined && this.avatar.FunBrain_so != undefined && _loc2_.length >= 3)
   {
      this.avatar.FunBrain_so.data[_loc3_ + "xPos"] = _loc2_[1];
      this.avatar.FunBrain_so.data[_loc3_ + "yPos"] = _loc2_[2];
      this.avatar.checkLSOStoreResult(this.avatar.FunBrain_so.flush(),"ZhSuperExit");
   }
   if(_root.loader_mc != undefined)
   {
      _root.loader_mc.removeMovieClip();
   }
   _root.createEmptyMovieClip("loader_mc",_root.getNextHighestDepth());
   _root.loader_mc.room = _loc3_;
   _root.loader_mc.island = "Super";
   _root.loader_mc.getURL("base.php","_self","POST");
   return true;
}
function exitRoom(clip)
{
   if(this.avatar.FunBrain_so.data.dontReturn == true)
   {
      this.avatar.FunBrain_so.data.dontReturn = false;
      this.avatar.FunBrain_so.flush();
   }
   trace("exitRoom: desc " + clip.desc);
   var _loc4_;
   if(!_root.gWaitingOnServer)
   {
      if(this.avatar.isRegistred())
      {
         _root.logWWW("avatar is registered, clipisle is " + clip.island + ", rootisle is " + _root.island);
         _loc4_ = clip.island;
         if(_loc4_ == undefined)
         {
            _loc4_ = _root.island;
         }
         this.avatar.updateIslandData(_loc4_,Delegate.create(this,exitRoomInternal,clip));
      }
      else
      {
         exitRoomInternal(clip);
      }
   }
   else
   {
      _root.gServerOperationComplete = Delegate.create(this,exitRoom,clip);
      trace("server op active, storing callback : " + _root.gServerOperationComplete);
   }
}`,
    "char direct Super exit helper"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `function exitRoomInternal(clip)
{
   _root.logWWW("exitRoomInternal() clipisle " + clip.island + ", rootisle " + _root.island + " desc : " + clip.desc + " desctype: " + typeof desc);
   var _loc4_;
   var _loc5_;
   var _loc8_;
   var _loc9_;
   var _loc6_;
   var _loc11_;
   var _loc10_;
   var _loc7_;
   var _loc13_;
   var _loc14_;
   var _loc12_;
   if(this.isPlayer)
   {`,
    `function exitRoomInternal(clip)
{
   _root.logWWW("exitRoomInternal() clipisle " + clip.island + ", rootisle " + _root.island + " desc : " + clip.desc + " desctype: " + typeof desc);
   var _loc4_;
   var _loc5_;
   var _loc8_;
   var _loc9_;
   var _loc6_;
   var _loc11_;
   var _loc10_;
   var _loc7_;
   var _loc13_;
   var _loc14_;
   var _loc12_;
   if(directNavigateZhSuperExit(clip))
   {
      return undefined;
   }
   if(this.isPlayer)
   {`,
    "char exitRoomInternal direct Super exit"
  );
  return nextContent;
}

const AS2_GAMEPLAY_SAY_CLIP_FRAME1_SCRIPT = `function ensureZhField()
{
   var fmt;
   fld.embedFonts = false;
   fld.selectable = false;
   fld.multiline = true;
   fld.wordWrap = true;
   fld.autoSize = false;
   fld._width = 204;
   fld._height = 86;
   fld._x = -102;
   fld._y = -40;
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
   fld._height = Math.max(40,Math.min(110,fld.textHeight + 10));
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

const AS2_GAMEPLAY_CHAT_FRAME1_SCRIPT = `function ensureZhField(fieldRef)
{
   var fmt;
   fieldRef.embedFonts = false;
   fieldRef.selectable = false;
   fieldRef.multiline = true;
   fieldRef.wordWrap = true;
   fieldRef.autoSize = false;
   fieldRef._width = 190;
   fieldRef._height = 38;
   fieldRef._x = -95;
   fmt = new TextFormat();
   fmt.font = "_sans";
   fmt.size = 15;
   fmt.color = 0;
   fmt.leading = 1;
   fmt.align = "center";
   fieldRef.setNewTextFormat(fmt);
   fieldRef.setTextFormat(fmt);
   fieldRef.__zhFmt = fmt;
}
stop();
clipHeight = 36;
padding = 8;
ensureZhField(fld1);
ensureZhField(fld2);
ensureZhField(fld3);`;

const AS2_GAMEPLAY_CHAT_FRAME2_SCRIPT = `function decodeChoiceText(rawText)
{
   var textValue;
   textValue = rawText == undefined || rawText == null ? "" : String(rawText);
   if(_root != undefined && _root.decodeZhBalloonText != undefined)
   {
      textValue = _root.decodeZhBalloonText(textValue);
   }
   return textValue;
}
function looksLikeChoiceHtml(rawText)
{
   var textValue;
   textValue = rawText == undefined || rawText == null ? "" : String(rawText);
   textValue = textValue.toUpperCase();
   return textValue.indexOf("<TEXTFORMAT") >= 0 || textValue.indexOf("<P") >= 0 || textValue.indexOf("<FONT") >= 0 || textValue.indexOf("<BR") >= 0;
}
function normalizeChoiceHtml(rawText)
{
   var htmlValue;
   htmlValue = decodeChoiceText(rawText);
   htmlValue = htmlValue.split("FACE=\\"Arial\\"").join("FACE=\\"_sans\\"");
   htmlValue = htmlValue.split("FACE='Arial'").join("FACE='_sans'");
   htmlValue = htmlValue.split("FACE=\\"Verdana\\"").join("FACE=\\"_sans\\"");
   htmlValue = htmlValue.split("FACE='Verdana'").join("FACE='_sans'");
   htmlValue = htmlValue.split("FACE=\\"_serif\\"").join("FACE=\\"_sans\\"");
   htmlValue = htmlValue.split("FACE='_serif'").join("FACE='_sans'");
   htmlValue = htmlValue.split(" ALIGN=\\"LEFT\\"").join(" ALIGN=\\"CENTER\\"");
   htmlValue = htmlValue.split(" ALIGN='LEFT'").join(" ALIGN='CENTER'");
   if(htmlValue.toUpperCase().indexOf("<TEXTFORMAT") < 0)
   {
      htmlValue = "<TEXTFORMAT LEADING=\\"1\\"><P ALIGN=\\"CENTER\\"><FONT FACE=\\"_sans\\" SIZE=\\"15\\">" + htmlValue + "</FONT></P></TEXTFORMAT>";
   }
   return htmlValue;
}
function getChoiceSourceText(fieldRef)
{
   if(fieldRef == undefined)
   {
      return "";
   }
   if(fieldRef.__zhSourceText != undefined)
   {
      return String(fieldRef.__zhSourceText);
   }
   if(fieldRef.htmlText != undefined && String(fieldRef.htmlText).length > 0)
   {
      return String(fieldRef.htmlText);
   }
   if(fieldRef.text != undefined)
   {
      return String(fieldRef.text);
   }
   return "";
}
function setChoiceFieldValue(fieldRef, rawText)
{
   var sourceValue;
   var textValue;
   if(fieldRef == undefined)
   {
      return "";
   }
   sourceValue = rawText == undefined || rawText == null ? "" : String(rawText);
   fieldRef.__zhSourceText = sourceValue;
   textValue = decodeChoiceText(sourceValue);
   fieldRef.__zhResponseText = textValue;
   ensureZhFieldMetrics(fieldRef);
   if(looksLikeChoiceHtml(sourceValue))
   {
      fieldRef.htmlText = normalizeChoiceHtml(sourceValue);
   }
   else
   {
      fieldRef.text = textValue;
   }
   if(fieldRef.__zhFmt != undefined)
   {
      fieldRef.setTextFormat(fieldRef.__zhFmt);
   }
   var targetWidth;
   targetWidth = Math.max(132,Math.min(210,fieldRef.textWidth + 16));
   fieldRef._width = targetWidth;
   fieldRef._x = -Math.round(targetWidth / 2);
   if(looksLikeChoiceHtml(sourceValue))
   {
      fieldRef.htmlText = normalizeChoiceHtml(sourceValue);
   }
   else
   {
      fieldRef.text = textValue;
   }
   if(fieldRef.__zhFmt != undefined)
   {
      fieldRef.setTextFormat(fieldRef.__zhFmt);
   }
   fieldRef._height = Math.max(38,Math.min(98,fieldRef.textHeight + 12));
   return textValue;
}
function ensureZhFieldMetrics(fieldRef)
{
   if(fieldRef == undefined)
   {
      return undefined;
   }
   fieldRef.embedFonts = false;
   fieldRef.selectable = false;
   fieldRef.multiline = true;
   fieldRef.wordWrap = true;
   fieldRef.autoSize = false;
   fieldRef._width = 250;
   fieldRef._x = -125;
   if(fieldRef.__zhFmt != undefined)
   {
      fieldRef.setNewTextFormat(fieldRef.__zhFmt);
      fieldRef.setTextFormat(fieldRef.__zhFmt);
   }
   fieldRef._height = Math.max(38,Math.min(98,fieldRef.textHeight + 12));
}
function applyChoiceLayout(fieldRef, boxRef, topY)
{
   fieldRef._y = topY;
   fieldRef._visible = true;
   boxRef._visible = true;
   boxRef._x = fieldRef._x + fieldRef._width / 2;
   boxRef._y = fieldRef._y + fieldRef._height / 2;
   boxRef._width = fieldRef._width + padding * 2;
   boxRef._height = fieldRef._height + padding * 2;
}
function init()
{
   i = 1;
   while(i <= 3)
   {
      txtBox = this["txtBox" + i];
      txtBox.num = i;
      txtBox.onPress = function()
      {
         fld = _parent.chat["fld" + this.num];
         var _loc4_ = _root.camera.scene.char.targetPlayer;
         if(_root.camera.scene.red5 && (_loc4_.login != undefined || _loc4_._name == "char"))
         {
            if(_root.server)
         {
               if(fld.quest_id == -2)
               {
                  _root.server.call("battle",null,_loc4_.login,fld.game,"start");
               }
               else
               {
                  _root.server.call("chat",null,_loc4_.login,fld.__zhResponseText != undefined ? fld.__zhResponseText : fld.htmlText,fld.quest_id);
               }
            }
         }
         else if(_root.responding)
         {
            _root.showSay(_loc4_,fld.__zhResponseText != undefined ? fld.__zhResponseText : fld.htmlText,this.num);
         }
         else
         {
            _root.showSay(_root.camera.scene.char,fld.__zhResponseText != undefined ? fld.__zhResponseText : fld.htmlText,this.num);
         }
         _root.hideChat();
      };
      i++;
   }
}
function sizeBubbles()
{
   var sourceValue;
   var nextY;
   nextY = -28;
   sourceValue = getChoiceSourceText(fld1);
   if(sourceValue.length == 0 || sourceValue == "undefined")
   {
      fld1.text = "";
      txtBox1._visible = false;
      fld1._visible = false;
      txtBox1._height = 30;
   }
   else
   {
      setChoiceFieldValue(fld1,sourceValue);
      applyChoiceLayout(fld1,txtBox1,nextY);
      nextY = fld1._y + fld1._height + Math.round(padding * 2.25);
   }
   sourceValue = getChoiceSourceText(fld2);
   if(sourceValue.length == 0 || sourceValue == "undefined")
   {
      fld2.text = "";
      txtBox2._visible = false;
      fld2._visible = false;
      txtBox2._height = 20;
      if(txtBox3.onPress != undefined)
      {
         txtBox3.onPress();
      }
   }
   else
   {
      setChoiceFieldValue(fld2,sourceValue);
      applyChoiceLayout(fld2,txtBox2,nextY);
      nextY = fld2._y + fld2._height + Math.round(padding * 2.25);
   }
   sourceValue = getChoiceSourceText(fld3);
   if(sourceValue.length == 0 || sourceValue == "undefined")
   {
      fld3.text = "";
      txtBox3._visible = false;
      fld3._visible = false;
      txtBox3._height = 20;
   }
   else
   {
      setChoiceFieldValue(fld3,sourceValue);
      applyChoiceLayout(fld3,txtBox3,nextY);
      nextY = fld3._y + fld3._height + Math.round(padding * 2);
   }
   clipHeight = Math.max(44,nextY + padding);
}
var padding = 12;
init();
sizeBubbles();`;

const AS2_COUNTER_BALLOON_FRAME1_SCRIPT = `function decodeBalloonText(rawText)
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
function ensureShapeMetrics()
{
   var bounds;
   if(shape == undefined)
   {
      return undefined;
   }
   if(shape.__zhBaseWidth == undefined)
   {
      bounds = shape.getBounds(this);
      if(bounds == undefined || bounds.xMax <= bounds.xMin || bounds.yMax <= bounds.yMin)
      {
         shape.__zhBaseXMin = -92;
         shape.__zhBaseXMax = 92;
         shape.__zhBaseYMin = -92;
         shape.__zhBaseYMax = -10;
      }
      else
      {
         shape.__zhBaseXMin = bounds.xMin;
         shape.__zhBaseXMax = bounds.xMax;
         shape.__zhBaseYMin = bounds.yMin;
         shape.__zhBaseYMax = bounds.yMax;
      }
      shape.__zhBaseWidth = Math.max(1,shape.__zhBaseXMax - shape.__zhBaseXMin);
      shape.__zhBaseHeight = Math.max(1,shape.__zhBaseYMax - shape.__zhBaseYMin);
      shape.__zhBaseXScale = shape._xscale == undefined ? 100 : shape._xscale;
      shape.__zhBaseYScale = shape._yscale == undefined ? 100 : shape._yscale;
      shape.__zhCenterX = Math.round((shape.__zhBaseXMin + shape.__zhBaseXMax) / 2);
      shape.__zhTopY = shape.__zhBaseYMin + 14;
      shape.__zhInnerWidth = Math.max(176,shape.__zhBaseWidth - 28);
      shape.__zhInnerHeight = Math.max(52,shape.__zhBaseHeight - 22);
   }
}
function ensureBalloonLabel()
{
   var fmt;
   ensureShapeMetrics();
   if(label == undefined)
   {
      createTextField("label",3,-88,-74,176,86);
      label.multiline = true;
      label.wordWrap = true;
      label.selectable = false;
      label.embedFonts = false;
      label.autoSize = false;
      fmt = new TextFormat();
      fmt.font = "_sans";
      fmt.size = 16;
      fmt.bold = true;
      fmt.leading = 3;
      fmt.align = "center";
      fmt.color = 0;
      label.setNewTextFormat(fmt);
      label.__fmt = fmt;
   }
}
function layoutBalloonLabel()
{
   var textValue;
   var targetWidth;
   var targetHeight;
   var widthScale;
   ensureBalloonLabel();
   if(label == undefined)
   {
      return undefined;
   }
   textValue = char != undefined ? decodeBalloonText(char.talkyText) : "";
   label._width = 236;
   label._height = 120;
   if(label.__textValue != textValue)
   {
      label.text = textValue;
      label.setTextFormat(label.__fmt);
      label.__textValue = textValue;
    }
   label._visible = textValue.length > 0;
   if(shape == undefined)
   {
      label._x = -88;
      label._y = -74;
      label._width = 176;
      label._height = 86;
      return undefined;
   }
   targetWidth = Math.max(shape.__zhInnerWidth,Math.min(236,label.textWidth + 26));
   targetHeight = Math.max(48,Math.min(110,label.textHeight + 18));
   label._width = targetWidth;
   label._height = targetHeight;
   label._x = shape.__zhCenterX - Math.round(targetWidth / 2);
   label._y = shape.__zhTopY + Math.max(0,Math.round((shape.__zhInnerHeight - targetHeight) / 2));
   widthScale = Math.max(100,Math.min(150,Math.round(targetWidth / Math.max(1,shape.__zhInnerWidth) * 100)));
   shape._xscale = Math.round(shape.__zhBaseXScale * widthScale / 100);
   shape._yscale = shape.__zhBaseYScale;
   if(string != undefined)
   {
      string._x = shape.__zhCenterX;
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

function buildAs2SuperPowerSharedAssets({ config, outputDir, manifest, islandIds }) {
  const scopedIslandIds = Array.isArray(islandIds) ? islandIds : [];
  if (scopedIslandIds.length > 0 && !scopedIslandIds.includes("super-power")) {
    return;
  }

  const sourceZip = config.sources?.as2Gamezip;
  const ffdecCli = config.tools?.ffdecCli;
  if (!sourceZip || !fileExists(sourceZip)) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:shared-assets",
      assetPath: AS2_SUPER_POWER_SHARED_CHAR_PATH,
      reason: "AS2 source zip is not configured"
    });
    return;
  }
  if (!ffdecCli || !fileExists(ffdecCli)) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:shared-assets",
      assetPath: AS2_SUPER_POWER_SHARED_CHAR_PATH,
      reason: "FFDec CLI is not configured"
    });
    return;
  }

  const sharedTempRoot = path.join(paths.tempDir, "as2-super-power-shared");
  removeDirContents(sharedTempRoot);
  ensureDirSync(sharedTempRoot);

  const frameworkExtractRoot = path.join(sharedTempRoot, "framework-source");
  const frameworkExtract = extractZipEntryToTemp({
    archivePath: sourceZip,
    entryName: AS2_SUPER_POWER_FRAMEWORK_PATH,
    outputDir: frameworkExtractRoot,
    tarBin: config.tools.tarBin
  });
  if (!frameworkExtract.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:framework",
      assetPath: AS2_SUPER_POWER_FRAMEWORK_PATH,
      reason: frameworkExtract.error
    });
  } else {
    const frameworkSourceSwf = path.join(frameworkExtractRoot, AS2_SUPER_POWER_FRAMEWORK_PATH.replace(/\//gu, path.sep));
    const frameworkScriptRoot = path.join(sharedTempRoot, "framework-scripts");
    const frameworkScriptExport = exportSwfScriptsForPatch({
      ffdecCli,
      inputSwf: frameworkSourceSwf,
      outputDir: frameworkScriptRoot
    });
    if (!frameworkScriptExport.ok) {
      manifest.pendingSwfAssets.push({
        assetId: "super-power:framework",
        assetPath: AS2_SUPER_POWER_FRAMEWORK_PATH,
        reason: frameworkScriptExport.error || "Unable to export framework.swf scripts"
      });
    } else {
      const frameworkPatchRoot = path.join(sharedTempRoot, "framework-patch");
      const mainViewTargetScript = ensureTranslatedScriptFromSource({
        sourceScriptRoot: frameworkScriptRoot,
        translatedScriptRoot: frameworkPatchRoot,
        exportPath: path.join("scripts", "__Packages", "com", "poptropica", "views", "MainView.as")
      });
      writeText(mainViewTargetScript, applyAs2FrameworkTopRightNavPatch(fs.readFileSync(mainViewTargetScript, "utf8")));

      const frameworkOutputSwf = path.join(outputDir, "swf", AS2_SUPER_POWER_FRAMEWORK_PATH.replace(/\//gu, path.sep));
      ensureDirSync(path.dirname(frameworkOutputSwf));
      const frameworkReplace = replaceSwfScriptExports({
        ffdecCli,
        inputSwf: frameworkSourceSwf,
        outputSwf: frameworkOutputSwf,
        translatedFiles: collectSwfScriptFiles(frameworkPatchRoot)
      });
      if (!frameworkReplace.ok) {
        manifest.pendingSwfAssets.push({
          assetId: "super-power:framework",
          assetPath: AS2_SUPER_POWER_FRAMEWORK_PATH,
          reason: frameworkReplace.error || "Unable to rebuild framework.swf"
        });
      } else {
        manifest.assetsPatched += 1;
        manifest.swfPatchedAssets.push({
          assetId: "super-power:framework",
          assetPath: AS2_SUPER_POWER_FRAMEWORK_PATH,
          outputPath: frameworkOutputSwf
        });
      }
    }
  }

  writeAs2SuperPowerAudioAudit({ outputDir, manifest });

  const gameplayExtractRoot = path.join(sharedTempRoot, "gameplay-source");
  const gameplayExtract = extractZipEntryToTemp({
    archivePath: sourceZip,
    entryName: AS2_SUPER_POWER_GAMEPLAY_PATH,
    outputDir: gameplayExtractRoot,
    tarBin: config.tools.tarBin
  });
  if (!gameplayExtract.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:gameplay",
      assetPath: AS2_SUPER_POWER_GAMEPLAY_PATH,
      reason: gameplayExtract.error
    });
    return;
  }

  const gameplaySourceSwf = path.join(gameplayExtractRoot, AS2_SUPER_POWER_GAMEPLAY_PATH.replace(/\//gu, path.sep));
  const gameplayScriptRoot = path.join(sharedTempRoot, "gameplay-scripts");
  const gameplayScriptExport = exportSwfScriptsForPatch({
    ffdecCli,
    inputSwf: gameplaySourceSwf,
    outputDir: gameplayScriptRoot
  });
  if (!gameplayScriptExport.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:gameplay",
      assetPath: AS2_SUPER_POWER_GAMEPLAY_PATH,
      reason: gameplayScriptExport.error || "Unable to export gameplay.swf scripts"
    });
    return;
  }

  const gameplayPatchRoot = path.join(sharedTempRoot, "gameplay-patch");
  const gameplayTargetScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: gameplayScriptRoot,
    translatedScriptRoot: gameplayPatchRoot,
    exportPath: path.join("scripts", "frame_1", "DoAction.as")
  });
  writeText(gameplayTargetScript, applyAs2GameplayShowSayScriptPatch(fs.readFileSync(gameplayTargetScript, "utf8")));

  const gameplayFrame5TargetScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: gameplayScriptRoot,
    translatedScriptRoot: gameplayPatchRoot,
    exportPath: path.join("scripts", "frame_5", "DoAction.as")
  });
  writeText(gameplayFrame5TargetScript, applyAs2GameplayFrame5NavPatch(fs.readFileSync(gameplayFrame5TargetScript, "utf8")));

  const gameplayFrame9TargetScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: gameplayScriptRoot,
    translatedScriptRoot: gameplayPatchRoot,
    exportPath: path.join("scripts", "frame_9", "DoAction.as")
  });
  writeText(gameplayFrame9TargetScript, applyAs2GameplayFrame9InteractionPatch(fs.readFileSync(gameplayFrame9TargetScript, "utf8")));

  const sayClipTargetScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: gameplayScriptRoot,
    translatedScriptRoot: gameplayPatchRoot,
    exportPath: path.join("scripts", "DefineSprite_78_SayClip", "frame_1", "DoAction.as")
  });
  writeText(sayClipTargetScript, AS2_GAMEPLAY_SAY_CLIP_FRAME1_SCRIPT);

  const peanutsSayClipTargetScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: gameplayScriptRoot,
    translatedScriptRoot: gameplayPatchRoot,
    exportPath: path.join("scripts", "DefineSprite_73_SayClipPeanuts", "frame_1", "DoAction.as")
  });
  writeText(peanutsSayClipTargetScript, AS2_GAMEPLAY_SAY_CLIP_FRAME1_SCRIPT);

  const chatTargetScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: gameplayScriptRoot,
    translatedScriptRoot: gameplayPatchRoot,
    exportPath: path.join("scripts", "DefineSprite_109_Chat", "frame_1", "DoAction.as")
  });
  writeText(chatTargetScript, AS2_GAMEPLAY_CHAT_FRAME1_SCRIPT);

  const chatFrame2TargetScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: gameplayScriptRoot,
    translatedScriptRoot: gameplayPatchRoot,
    exportPath: path.join("scripts", "DefineSprite_109_Chat", "frame_2", "DoAction.as")
  });
  writeText(chatFrame2TargetScript, AS2_GAMEPLAY_CHAT_FRAME2_SCRIPT);

  const gameplayOutputSwf = path.join(outputDir, "swf", AS2_SUPER_POWER_GAMEPLAY_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(gameplayOutputSwf));
  const gameplayReplace = replaceSwfScriptExports({
    ffdecCli,
    inputSwf: gameplaySourceSwf,
    outputSwf: gameplayOutputSwf,
    translatedFiles: collectSwfScriptFiles(gameplayPatchRoot)
  });
  if (!gameplayReplace.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:gameplay",
      assetPath: AS2_SUPER_POWER_GAMEPLAY_PATH,
      reason: gameplayReplace.error || "Unable to rebuild gameplay.swf"
    });
    return;
  }
  manifest.assetsPatched += 1;
  manifest.swfPatchedAssets.push({
    assetId: "super-power:gameplay",
    assetPath: AS2_SUPER_POWER_GAMEPLAY_PATH,
    outputPath: gameplayOutputSwf
  });

  const charExtractRoot = path.join(sharedTempRoot, "char-source");
  const charExtract = extractZipEntryToTemp({
    archivePath: sourceZip,
    entryName: AS2_SUPER_POWER_SHARED_CHAR_PATH,
    outputDir: charExtractRoot,
    tarBin: config.tools.tarBin
  });
  if (!charExtract.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:char",
      assetPath: AS2_SUPER_POWER_SHARED_CHAR_PATH,
      reason: charExtract.error
    });
    return;
  }

  const charSourceSwf = path.join(charExtractRoot, AS2_SUPER_POWER_SHARED_CHAR_PATH.replace(/\//gu, path.sep));
  const charScriptRoot = path.join(sharedTempRoot, "char-scripts");
  const charScriptExport = exportSwfScriptsForPatch({
    ffdecCli,
    inputSwf: charSourceSwf,
    outputDir: charScriptRoot
  });
  if (!charScriptExport.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:char",
      assetPath: AS2_SUPER_POWER_SHARED_CHAR_PATH,
      reason: charScriptExport.error || "Unable to export char.swf scripts"
    });
    return;
  }

  const charPatchRoot = path.join(sharedTempRoot, "char-patch");
  const charTargetScript = ensureTranslatedScriptFromSource({
    sourceScriptRoot: charScriptRoot,
    translatedScriptRoot: charPatchRoot,
    exportPath: path.join("scripts", "frame_1", "DoAction.as")
  });
  const charPatchedContent = applyAs2CharBalloonScriptPatch(fs.readFileSync(charTargetScript, "utf8"));
  writeText(charTargetScript, charPatchedContent);

  const charOutputSwf = path.join(outputDir, "swf", AS2_SUPER_POWER_SHARED_CHAR_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(charOutputSwf));
  const charReplace = replaceSwfScriptExports({
    ffdecCli,
    inputSwf: charSourceSwf,
    outputSwf: charOutputSwf,
    translatedFiles: collectSwfScriptFiles(charPatchRoot)
  });
  if (!charReplace.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:char",
      assetPath: AS2_SUPER_POWER_SHARED_CHAR_PATH,
      reason: charReplace.error || "Unable to rebuild char.swf"
    });
    return;
  }
  manifest.assetsPatched += 1;
  manifest.swfPatchedAssets.push({
    assetId: "super-power:char",
    assetPath: AS2_SUPER_POWER_SHARED_CHAR_PATH,
    outputPath: charOutputSwf
  });

  const balloonExtractRoot = path.join(sharedTempRoot, "balloon-source");
  const balloonExtract = extractZipEntryToTemp({
    archivePath: sourceZip,
    entryName: AS2_SUPER_POWER_COUNTER_BALLOON_PATH,
    outputDir: balloonExtractRoot,
    tarBin: config.tools.tarBin
  });
  if (!balloonExtract.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:counter-balloon",
      assetPath: AS2_SUPER_POWER_COUNTER_BALLOON_PATH,
      reason: balloonExtract.error
    });
    return;
  }

  const balloonSourceSwf = path.join(balloonExtractRoot, AS2_SUPER_POWER_COUNTER_BALLOON_PATH.replace(/\//gu, path.sep));
  const balloonPatchRoot = path.join(sharedTempRoot, "balloon-patch");
  const balloonTargetScript = path.join(balloonPatchRoot, "scripts", "frame_1", "DoAction.as");
  ensureDirSync(path.dirname(balloonTargetScript));
  writeText(balloonTargetScript, AS2_COUNTER_BALLOON_FRAME1_SCRIPT);

  const counterBalloonOutputSwf = path.join(outputDir, "swf", AS2_SUPER_POWER_COUNTER_BALLOON_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(counterBalloonOutputSwf));
  const balloonReplace = replaceSwfScriptExports({
    ffdecCli,
    inputSwf: balloonSourceSwf,
    outputSwf: counterBalloonOutputSwf,
    translatedFiles: collectSwfScriptFiles(balloonPatchRoot)
  });
  if (!balloonReplace.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:counter-balloon",
      assetPath: AS2_SUPER_POWER_COUNTER_BALLOON_PATH,
      reason: balloonReplace.error || "Unable to rebuild counter balloon"
    });
    return;
  }
  manifest.assetsPatched += 1;
  manifest.swfPatchedAssets.push({
    assetId: "super-power:counter-balloon",
    assetPath: AS2_SUPER_POWER_COUNTER_BALLOON_PATH,
    outputPath: counterBalloonOutputSwf
  });

  const balloonOutputSwf = path.join(outputDir, "swf", AS2_SUPER_POWER_BALLOON_PATH.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(balloonOutputSwf));
  fs.copyFileSync(counterBalloonOutputSwf, balloonOutputSwf);
  manifest.assetsPatched += 1;
  manifest.swfPatchedAssets.push({
    assetId: "super-power:balloon",
    assetPath: AS2_SUPER_POWER_BALLOON_PATH,
    outputPath: balloonOutputSwf
  });

}

function buildRuntimeZipForSourceGroup({ config, sourceGroup, manifest }) {
  if (process.env.POPTROPICA_SKIP_RUNTIME_ZIP === "1") {
    manifest.runtimeZip = {
      status: "skipped",
      sourceZip: config.sources[sourceGroup === "as2" ? "as2Gamezip" : "as3Gamezip"] || null,
      runtimeZipPath: getPackPaths(sourceGroup).runtimeZipPath,
      replacementCount: 0
    };
    return manifest.runtimeZip;
  }

  const sourceZip = config.sources[sourceGroup === "as2" ? "as2Gamezip" : "as3Gamezip"];
  if (!sourceZip || !fileExists(sourceZip)) {
    manifest.runtimeZip = {
      status: "missing_source_zip",
      sourceZip: sourceZip || null,
      runtimeZipPath: null
    };
    return manifest.runtimeZip;
  }

  const packPaths = getPackPaths(sourceGroup);
  const sevenZip = findSevenZip(config);
  const includeSwfRuntimeOverrides = sourceGroup === "as2" || process.env.POPTROPICA_ENABLE_SWF_RUNTIME_OVERRIDES === "1";
  const replacements = collectRuntimeReplacementsForSourceGroup(sourceGroup, { includeSwfRuntimeOverrides });

  if (replacements.length === 0) {
    manifest.runtimeZip = {
      status: "no_runtime_overrides",
      sourceZip,
      runtimeZipPath: null,
      replacementCount: 0
    };
    return manifest.runtimeZip;
  }

  ensureDirSync(paths.patchedZipsDir);
  const metadataPath = `${packPaths.runtimeZipPath}.meta.json`;
  const sourceHash = hashFile(sourceZip);
  const replacementHash = hashReplacementSet(replacements);
  const runtimeMeta = readJson(metadataPath, null);

  const shouldReuse =
    runtimeMeta &&
    runtimeMeta.sourceHash === sourceHash &&
    runtimeMeta.replacementHash === replacementHash &&
    runtimeMeta.runtimeFixVersion === RUNTIME_FIX_VERSION &&
    runtimeMeta.replacementCount === replacements.length &&
    validateZipArchive(sevenZip, packPaths.runtimeZipPath) &&
    fileExists(packPaths.runtimeZipPath);

  if (!shouldReuse) {
    if (!sevenZip) {
      manifest.runtimeZip = {
        status: "missing_7zip",
        sourceZip,
        runtimeZipPath: null,
        replacementCount: replacements.length,
        error: "No 7-Zip executable was found."
      };
      return manifest.runtimeZip;
    }

    const buildToken = `${process.pid}-${Date.now()}`;
    const workingDir = path.join(paths.tempDir, `runtime-zip-${sourceGroup}-${buildToken}`);
    const tempRuntimeZipPath = `${packPaths.runtimeZipPath}.${buildToken}.tmp`;
    removeDirContents(workingDir);
    ensureDirSync(workingDir);

    const extractResult = spawnSync(config.tools.tarBin || "tar", ["-xf", sourceZip, "-C", workingDir], {
      encoding: "utf8",
      windowsHide: true
    });
    if (extractResult.status !== 0) {
      manifest.runtimeZip = {
        status: "extract_failed",
        sourceZip,
        runtimeZipPath: null,
        replacementCount: replacements.length,
        error: (extractResult.stderr || extractResult.stdout || "Failed to extract source zip").trim()
      };
      return manifest.runtimeZip;
    }

    for (const replacement of replacements) {
      const targetPath = path.join(workingDir, replacement.entryName.replace(/\//gu, path.sep));
      ensureDirSync(path.dirname(targetPath));
      fs.copyFileSync(replacement.sourceFilePath, targetPath);
    }

    const runtimeFix = patchRuntimeRenderMode(workingDir);

    if (fileExists(tempRuntimeZipPath)) {
      fs.rmSync(tempRuntimeZipPath, { force: true });
    }

    const createResult = spawnSync(sevenZip, ["a", "-tzip", tempRuntimeZipPath, ".\\*", "-mx=1", "-bsp0"], {
      cwd: workingDir,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 64
    });
    if (createResult.status !== 0) {
      manifest.runtimeZip = {
        status: "patch_failed",
        sourceZip,
        runtimeZipPath: packPaths.runtimeZipPath,
        tempRuntimeZipPath,
        replacementCount: replacements.length,
        error: (createResult.stderr || createResult.stdout || "Failed to write runtime zip").trim()
      };
      return manifest.runtimeZip;
    }

    if (!validateZipArchive(sevenZip, tempRuntimeZipPath)) {
      manifest.runtimeZip = {
        status: "patch_failed",
        sourceZip,
        runtimeZipPath: packPaths.runtimeZipPath,
        tempRuntimeZipPath,
        replacementCount: replacements.length,
        error: "Generated runtime zip failed 7-Zip validation."
      };
      return manifest.runtimeZip;
    }

    const replaceResult = replaceFileWithRetry(tempRuntimeZipPath, packPaths.runtimeZipPath);
    if (!replaceResult.ok) {
      manifest.runtimeZip = {
        status: "patch_failed",
        sourceZip,
        runtimeZipPath: packPaths.runtimeZipPath,
        tempRuntimeZipPath,
        replacementCount: replacements.length,
        error: replaceResult.error || "Failed to replace runtime zip."
      };
      return manifest.runtimeZip;
    }
    removeDirContents(workingDir);
    fs.rmSync(workingDir, { recursive: true, force: true });

    writeJson(metadataPath, {
      generatedAt: new Date().toISOString(),
      sourceGroup,
      sourceZip,
      sourceHash,
      replacementHash,
      runtimeFixVersion: RUNTIME_FIX_VERSION,
      runtimeZipPath: packPaths.runtimeZipPath,
      replacementCount: replacements.length,
      runtimeFix
    });
  }

  manifest.runtimeZip = {
    status: shouldReuse ? "reused" : "ready",
    sourceZip,
    runtimeZipPath: packPaths.runtimeZipPath,
    replacementCount: replacements.length,
    swfRuntimeOverrides: includeSwfRuntimeOverrides ? "enabled" : "safe_subset"
  };
  return manifest.runtimeZip;
}

function matchesPackFilter(assetRow, islandIds, assetPatterns) {
  if (islandIds.length === 0 && assetPatterns.length === 0) {
    return true;
  }

  const matchedIsland = islandIds.length > 0 && islandIds.includes(assetRow.island_id || "");
  const assetPath = String(assetRow.asset_path || "");
  const matchedPattern = assetPatterns.length > 0 && assetPatterns.some((pattern) => assetPath.toLowerCase().includes(pattern.toLowerCase()));
  return matchedIsland || matchedPattern;
}

function buildPackForSourceGroup({ db, config, sourceGroup, islandIds = [], assetPatterns = [] }) {
  const { baseDir: outputDir } = getPackPaths(sourceGroup);
  ensureDirSync(outputDir);
  removeDirContents(outputDir);
  ensureDirSync(outputDir);
  fs.writeFileSync(path.join(outputDir, ".gitkeep"), "", "utf8");

  const normalizedIslandIds = islandIds
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const normalizedAssetPatterns = assetPatterns
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const superPowerOnlyScope = sourceGroup === "as2"
    && normalizedIslandIds.length > 0
    && normalizedIslandIds.every((item) => item === "super-power");

  const assets = db
    .getAssetsForSourceGroup(sourceGroup)
    .filter((assetRow) => matchesPackFilter(assetRow, normalizedIslandIds, normalizedAssetPatterns));
  const rows = db
    .getStringsForPack(sourceGroup)
    .filter((row) => matchesPackFilter(row, normalizedIslandIds, normalizedAssetPatterns));
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.asset_id)) {
      grouped.set(row.asset_id, []);
    }
    grouped.get(row.asset_id).push(row);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceGroup,
    islandIds: normalizedIslandIds,
    assetPatterns: normalizedAssetPatterns,
    canonicalKeys: [],
    assetsPatched: 0,
    externalTextAssets: [],
    swfPatchedAssets: [],
    pendingSwfAssets: [],
    audioAuditReports: []
  };
  const seenCanonical = new Set();

  for (const assetRow of assets) {
    const assetId = assetRow.asset_id;
    const assetRows = grouped.get(assetId) || [];
    const sample = assetRows[0] || {
      ...assetRow,
      metadata_json: assetRow.metadata_json,
      translated_text: null
    };
    if (sample.island_id) {
      seenCanonical.add(sample.island_id);
    }

    if (!sample.extracted_path || !fileExists(sample.extracted_path)) {
      continue;
    }

    if (sample.asset_type === "swf") {
      if (assetRows.length === 0) {
        continue;
      }

      const metadata = JSON.parse(sample.metadata_json || "{}");
      const ffdecMeta = metadata.ffdec || {};
      if (!ffdecMeta.ok || !config.tools.ffdecCli || !fileExists(config.tools.ffdecCli)) {
        manifest.pendingSwfAssets.push({
          assetId,
          assetPath: sample.asset_path,
          reason: ffdecMeta.error || "FFDec CLI is not configured"
        });
        continue;
      }

      const sourceTextRoot = ffdecMeta.outputDir;
      const translatedTextRoot = path.join(outputDir, "swf-texts", assetId);
      const sourceScriptRoot = ffdecMeta.scriptOutputDir;
      const translatedScriptRoot = path.join(outputDir, "swf-scripts", assetId);
      ensureDirSync(translatedTextRoot);
      ensureDirSync(translatedScriptRoot);
      const fontFilePath = findPreferredSwfFontFile(config);
      const swfTextRows = sourceGroup === "as2" && superPowerOnlyScope && shouldSkipAs2SuperPowerSwfTextPatch(sample.asset_path)
        ? []
        : assetRows;
      const swfPatch = sourceGroup === "as2"
        ? buildPlainSwfTextPatch({
          assetRows: swfTextRows,
          sourceTextRoot,
          inputSwf: sample.extracted_path,
          ffdecCli: config.tools.ffdecCli,
          translatedTextRoot
        })
        : buildFormattedSwfTextPatch({
          assetRows,
          inputSwf: sample.extracted_path,
          ffdecCli: config.tools.ffdecCli,
          translatedTextRoot
        });
      if (!swfPatch.ok) {
        manifest.pendingSwfAssets.push({
          assetId,
          assetPath: sample.asset_path,
          reason: swfPatch.error || "FFDec formatted text export failed"
        });
        continue;
      }
      const translatedFiles = swfPatch.translatedFiles || [];
      const translatedScriptFiles = sourceGroup === "as2" && ffdecMeta.scriptExport?.ok && sourceScriptRoot && fileExists(sourceScriptRoot)
        ? buildTranslatedSwfScriptFiles({
          assetRows,
          sourceScriptRoot,
          translatedScriptRoot
        })
        : [];
      if (sourceGroup === "as2" && AS2_SUPER_POWER_SCENE_SWF_PATTERN.test(sample.asset_path) && ffdecMeta.scriptExport?.ok && sourceScriptRoot && fileExists(sourceScriptRoot)) {
        try {
          applyAs2SuperPowerSceneValidationPatch({
            sourceScriptRoot,
            translatedScriptRoot,
            assetPath: sample.asset_path
          });
        } catch (error) {
          manifest.pendingSwfAssets.push({
            assetId,
            assetPath: sample.asset_path,
            reason: error instanceof Error ? error.message : String(error)
          });
          continue;
        }
      }
      const finalTranslatedScriptFiles = collectSwfScriptFiles(translatedScriptRoot);
      if (translatedFiles.length === 0 && finalTranslatedScriptFiles.length === 0) {
        continue;
      }

      const outputSwf = path.join(outputDir, "swf", sample.asset_path);
      ensureDirSync(path.dirname(outputSwf));
      const tempTextOutput = translatedFiles.length > 0 && translatedScriptFiles.length > 0
        ? path.join(paths.tempDir, `swf-text-pass-${Date.now()}-${Math.random().toString(16).slice(2)}.swf`)
        : outputSwf;
      let result = { ok: true };
      let currentInputSwf = sample.extracted_path;
      if (translatedFiles.length > 0) {
        result = replaceSwfTexts({
          ffdecCli: config.tools.ffdecCli,
          inputSwf: sample.extracted_path,
          outputSwf: tempTextOutput,
          translatedFiles,
          fontIds: swfPatch.fontIds,
          fontIdsByExportPath: swfPatch.fontIdsByExportPath || new Map(),
          fontFilePath,
          fallbackFilesByExportPath: swfPatch.formattedFallbackFilesByExportPath || new Map(),
          sequential: sourceGroup === "as2"
        });
        currentInputSwf = tempTextOutput;
      }
      if (result.ok && finalTranslatedScriptFiles.length > 0) {
        result = replaceSwfScriptExports({
          ffdecCli: config.tools.ffdecCli,
          inputSwf: currentInputSwf,
          outputSwf,
          translatedFiles: finalTranslatedScriptFiles
        });
      }
      if (tempTextOutput !== outputSwf && fileExists(tempTextOutput)) {
        fs.rmSync(tempTextOutput, { force: true });
      }
      if (result.ok) {
        manifest.assetsPatched += 1;
        manifest.swfPatchedAssets.push({
          assetId,
          assetPath: sample.asset_path,
          outputPath: outputSwf
        });
      } else {
        manifest.pendingSwfAssets.push({
          assetId,
          assetPath: sample.asset_path,
          reason: result.error || "FFDec replace failed"
        });
      }
      for (const cleanupPath of swfPatch.cleanupPaths || []) {
        if (fileExists(cleanupPath)) {
          removeDirContents(cleanupPath);
          fs.rmSync(cleanupPath, { recursive: true, force: true });
        }
      }
      continue;
    }

    const outputFile = path.join(outputDir, "files", sample.asset_path);
    ensureDirSync(path.dirname(outputFile));
    const originalContent = fs.readFileSync(sample.extracted_path, "utf8");
    const translatedContent = applyFlashSafeTypography(
      sample.asset_path,
      applyStructuredReplacements(originalContent, sample.asset_type, sample.asset_path, assetRows)
    );
    if (translatedContent !== originalContent) {
      writeText(outputFile, translatedContent);
      manifest.assetsPatched += 1;
      manifest.externalTextAssets.push({
        assetId,
        assetPath: sample.asset_path,
        outputPath: outputFile
      });
    }
  }

  manifest.canonicalKeys = [...seenCanonical].sort();

  if (sourceGroup === "as3") {
    buildAs3ShellSkinPatch({
      config,
      outputDir,
      manifest
    });
    const logoOverrides = generateAs3MapLogoOverrides({ config, outputDir });
    for (const result of logoOverrides.results || []) {
      manifest.assetsPatched += 1;
      manifest.swfPatchedAssets.push({
        assetId: `as3-map-logo:${result.folder}`,
        assetPath: `content/www.poptropica.com/game/assets/scenes/map/map/islands/${result.folder}/logo.swf`,
        outputPath: result.outputSwf
      });
    }
    for (const failure of logoOverrides.failures || []) {
      manifest.pendingSwfAssets.push({
        assetId: `as3-map-logo:${failure.folder || "unknown"}`,
        assetPath: failure.sourceSwf || null,
        reason: failure.error || "AS3 map logo override generation failed"
      });
    }
  }

  if (sourceGroup === "as2") {
    buildAs2BasePageAsset({
      config,
      outputDir,
      manifest
    });
    buildAs2SharedMenuAssets({
      db,
      config,
      outputDir,
      manifest
    });
    buildAs2RestartIslandAsset({
      config,
      outputDir,
      manifest
    });
    buildAs2SuperPowerSharedAssets({
      config,
      outputDir,
      manifest,
      islandIds: normalizedIslandIds
    });
  }

  buildRuntimeZipForSourceGroup({ config, sourceGroup, manifest });
  writeJson(path.join(outputDir, "manifest.json"), manifest);
  db.setPackOutput(sourceGroup, manifest);
  return manifest;
}

module.exports = {
  buildPackForSourceGroup,
  buildRuntimeZipForSourceGroup,
  collectRuntimeReplacementsForSourceGroup
};
