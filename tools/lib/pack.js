const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const zlib = require("node:zlib");
const { XMLParser, XMLBuilder } = require("fast-xml-parser");
const paths = require("./paths");
const { ensureDirSync, fileExists, hashFile, listFilesRecursive, readJson, removeDirContents, writeJson, writeText } = require("./fs-utils");
const { containsCjk, normalizeTranslatedText } = require("./text-utils");
const { generateAs3MapLogoOverrides } = require("./as3-logo-overrides");
const { isItemXmlVisibleText, isProtectedTranslationRow } = require("./translation-guards");
const { AS3_DIRECT_WRAPPER_PATH, buildAs3DirectWrapperPhp } = require("./as3-direct-wrapper");
const { patchAs2PopupCloseShape } = require("./as2-popup-close-shape");

const RUNTIME_FIX_VERSION = 28;
const AS3_STAGE_BACKGROUND_RGB = Buffer.from([0x13, 0x9f, 0xfd]);
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
const AS2_STATIC_PACK_RELATIVE_PATHS = [
  "audio",
  "provenance",
  "files/content/www.poptropica.com/externalAssets/audio"
];
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
  /content\/www\.poptropica\.com\/game\/data\/languages\/en\/islands\/start\/language\.xml$/iu
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
  ["Restart [", "重启["],
  ["]Island", "]岛屿"],
  ["Sorry, but there [", "抱歉，这座岛["],
  ["]is not a map for [", "]暂时没有["],
  ["]this island.", "]地图。"],
  ["Sorry, but there [\ny 960\n]is not a map for [\nx 920\ny 1520\n]this island.", "抱歉，这座岛[\ny 960\n]暂时没有[\nx 920\ny 1520\n]地图。"],
  ["the PURPLE\nGIANT", "紫色\n巨人"],
  ["the PURPLE\rGIANT", "紫色\n巨人"],
  ["Restart [\nx 220\ny 660\n]Island", "重启[\nx 220\ny 660\n]岛屿"]
];

const AS2_SHARED_TRAVELMAP_TEXT_REPLACEMENTS = [
  ["MORE\nISLANDS", "更多\n岛屿"],
  ["MORE ISLANDS", "更多岛屿"]
];

const AS2_SHARED_GAMEPLAY_TEXT_REPLACEMENTS = [
  ["CLOSE", "关闭"]
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
  const normalized = [...pathSegments].reverse().find((segment) =>
    segment &&
    segment !== "#text" &&
    !/^\[\d+\]$/u.test(segment)
  );
  return normalized || null;
}

function isComplexXmlTextRow(row) {
  const context = safeParseContext(row);
  return context.kind === "xml-text" &&
    Array.isArray(context.path) &&
    context.path.includes("#text");
}

function isSafeXmlRow(assetPath, row) {
  const context = safeParseContext(row);
  const pathSegments = Array.isArray(context.path) ? context.path : [];
  const leaf = getLastPathSegment(pathSegments);
  if (!leaf && context.kind !== "xml-attr") {
    return false;
  }

  if (context.kind === "xml-text") {
    if (/\/game\/data\/items\/[^/]+\/[^/]+\.xml$/iu.test(assetPath)) {
      return isItemXmlVisibleText({
        ...row,
        asset_path: assetPath
      });
    }
    if (/\/game\/data\/entity\/character\/partKeys\/[^/]+\.xml$/iu.test(assetPath)) {
      return false;
    }
    if (/\/framework\/data\/config\.xml$/iu.test(assetPath)) {
      return leaf === "clusterName";
    }
    if (/\/game\/data\/languages\//iu.test(assetPath)) {
      return true;
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
    trimValues: false,
    allowBooleanAttributes: true
  });
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    indentBy: "\t",
    suppressEmptyNode: false,
    suppressBooleanAttributes: false
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
  const safeRows = rows.filter((row) => !isProtectedTranslationRow(row));
  if (assetType === "xml") {
    const htmlRows = safeRows.filter((row) => typeof row.source_text === "string" && /<(?:font|p|br)\b/iu.test(row.source_text));
    const attrRows = safeRows.filter((row) => safeParseContext(row).kind === "xml-attr");
    const textRows = safeRows.filter((row) => !htmlRows.includes(row) && safeParseContext(row).kind === "xml-text");
    const complexTextRows = textRows.filter(isComplexXmlTextRow);
    const simpleTextRows = textRows.filter((row) => !complexTextRows.includes(row));

    let nextContent = content;
    if (simpleTextRows.length > 0) {
      nextContent = applyLanguageXmlValueReplacements(nextContent, assetPath, simpleTextRows).content;
    }
    if (complexTextRows.length > 0) {
      nextContent = applyXmlTranslations(nextContent, assetPath, complexTextRows);
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
    return applyJsonTranslations(content, safeRows);
  }
  if (assetType === "php") {
    return applyPhpTranslations(content, safeRows);
  }
  return applyExactReplacements(content, safeRows);
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

  const shellSwfPath = path.join(workingDir, AS3_SHELL_PATH.replace(/\//gu, path.sep));
  if (fileExists(shellSwfPath)) {
    const shellPatch = patchSwfBackgroundColor(fs.readFileSync(shellSwfPath), AS3_STAGE_BACKGROUND_RGB);
    if (shellPatch.ok && shellPatch.changed) {
      fs.writeFileSync(shellSwfPath, shellPatch.buffer);
      patchedFiles.push(AS3_SHELL_PATH);
    }
  }

  const as3DirectWrapperPath = path.join(workingDir, AS3_DIRECT_WRAPPER_PATH.replace(/\//gu, path.sep));
  const wrapperContent = buildAs3DirectWrapperPhp();
  if (!fileExists(as3DirectWrapperPath) || fs.readFileSync(as3DirectWrapperPath, "utf8") !== wrapperContent) {
    ensureDirSync(path.dirname(as3DirectWrapperPath));
    writeText(as3DirectWrapperPath, wrapperContent);
    patchedFiles.push(AS3_DIRECT_WRAPPER_PATH);
  }

  return {
    patchedFiles
  };
}

function readSwfRectByteLength(body) {
  if (!body || body.length === 0) {
    return null;
  }
  const nbits = body[0] >> 3;
  return Math.ceil((5 + nbits * 4) / 8);
}

function decodeSwfBody(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    return { ok: false, error: "SWF is shorter than the 8-byte header." };
  }
  const signature = buffer.subarray(0, 3).toString("ascii");
  if (signature === "FWS") {
    return { ok: true, signature, body: buffer.subarray(8) };
  }
  if (signature === "CWS") {
    try {
      return { ok: true, signature, body: zlib.inflateSync(buffer.subarray(8)) };
    } catch (error) {
      return { ok: false, error: error.message || "Unable to inflate compressed SWF body." };
    }
  }
  return { ok: false, error: `Unsupported SWF signature: ${signature}` };
}

function encodeSwfBody(originalBuffer, signature, body) {
  const header = Buffer.from(originalBuffer.subarray(0, 8));
  header.writeUInt32LE(body.length + 8, 4);
  if (signature === "FWS") {
    return Buffer.concat([header, body]);
  }
  return Buffer.concat([header, zlib.deflateSync(body)]);
}

function patchSwfBackgroundColor(buffer, rgb) {
  const decoded = decodeSwfBody(buffer);
  if (!decoded.ok) {
    return decoded;
  }
  const rectByteLength = readSwfRectByteLength(decoded.body);
  if (!rectByteLength) {
    return { ok: false, error: "Unable to read SWF frame rectangle." };
  }
  const frameHeaderLength = rectByteLength + 4;
  if (decoded.body.length < frameHeaderLength) {
    return { ok: false, error: "SWF body is shorter than the frame header." };
  }

  let offset = frameHeaderLength;
  while (offset + 2 <= decoded.body.length) {
    const tagHeader = decoded.body.readUInt16LE(offset);
    const tagCode = tagHeader >> 6;
    let tagLength = tagHeader & 0x3f;
    let tagHeaderLength = 2;
    if (tagLength === 0x3f) {
      if (offset + 6 > decoded.body.length) {
        return { ok: false, error: "SWF long tag header is truncated." };
      }
      tagLength = decoded.body.readInt32LE(offset + 2);
      tagHeaderLength = 6;
    }
    const payloadOffset = offset + tagHeaderLength;
    const nextOffset = payloadOffset + tagLength;
    if (tagLength < 0 || nextOffset > decoded.body.length) {
      return { ok: false, error: "SWF tag payload is truncated." };
    }

    if (tagCode === 9) {
      if (tagLength < 3) {
        return { ok: false, error: "SetBackgroundColor tag is shorter than RGB payload." };
      }
      if (decoded.body.subarray(payloadOffset, payloadOffset + 3).equals(rgb)) {
        return { ok: true, changed: false, buffer };
      }
      const patchedBody = Buffer.from(decoded.body);
      rgb.copy(patchedBody, payloadOffset, 0, 3);
      return {
        ok: true,
        changed: true,
        buffer: encodeSwfBody(buffer, decoded.signature, patchedBody)
      };
    }

    if (tagCode === 0) {
      break;
    }
    offset = nextOffset;
  }

  const backgroundTagHeader = Buffer.alloc(2);
  backgroundTagHeader.writeUInt16LE((9 << 6) | 3, 0);
  const patchedBody = Buffer.concat([
    decoded.body.subarray(0, frameHeaderLength),
    backgroundTagHeader,
    rgb,
    decoded.body.subarray(frameHeaderLength)
  ]);
  return {
    ok: true,
    changed: true,
    buffer: encodeSwfBody(buffer, decoded.signature, patchedBody)
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
                background-color: #139ffd;
                outline-width: 0;
                position: absolute;
                left: 0;
                top: 0;
                width: 100vw;
                height: 100vh;
            }
        </style>`);
  return patchedStyle
    .replace(/<embed\s+src=/iu, `<embed bgcolor="111827" src=`)
    .replace(
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

function mergeTranslatedSwfFiles(entries) {
  const byExportPath = new Map();
  for (const entry of entries) {
    if (!entry?.exportPath || !entry?.filePath) {
      continue;
    }
    byExportPath.set(entry.exportPath, entry);
  }
  return [...byExportPath.values()]
    .sort((left, right) => left.exportPath.localeCompare(right.exportPath, "en"));
}

function buildAs2NativeNavigationTextFiles({ sourceTextRoot, translatedTextRoot, existingTranslatedFiles = [] }) {
  if (!sourceTextRoot || !fileExists(sourceTextRoot)) {
    return [];
  }
  const replacements = new Map(AS2_NATIVE_NAVIGATION_LABEL_REPLACEMENTS);
  const existingByExportPath = new Map(existingTranslatedFiles.map((entry) => [entry.exportPath, entry]));
  const changedFiles = [];

  for (const sourceFile of listFilesRecursive(sourceTextRoot, { includeExtensions: new Set([".txt"]) })) {
    const exportPath = path.relative(sourceTextRoot, sourceFile).replace(/\\/gu, "/");
    const sourceContent = fs.readFileSync(sourceFile, "utf8");
    const sourceLabel = String(sourceContent || "").replace(/\s+/gu, " ").trim();
    const translatedLabel = replacements.get(sourceLabel);
    if (!translatedLabel) {
      continue;
    }

    const targetFile = path.join(translatedTextRoot, exportPath);
    const targetContent = existingByExportPath.has(exportPath) && fileExists(targetFile)
      ? fs.readFileSync(targetFile, "utf8")
      : sourceContent;
    const targetLabel = String(targetContent || "").replace(/\s+/gu, " ").trim();
    if (targetLabel === translatedLabel) {
      continue;
    }

    ensureDirSync(path.dirname(targetFile));
    writeText(targetFile, normalizeSwfTextFileContent(translatedLabel));
    changedFiles.push({
      filePath: targetFile,
      exportPath
    });
  }

  return mergeTranslatedSwfFiles(changedFiles);
}

function buildPlainSwfTextPatch({ assetRows, sourceTextRoot, inputSwf, ffdecCli, translatedTextRoot }) {
  const translatedFiles = mergeTranslatedSwfFiles([
    ...buildTranslatedSwfFiles({
    assetRows,
    sourceTextRoot,
    translatedTextRoot
    }),
    ...buildAs2NativeNavigationTextFiles({
      sourceTextRoot,
      translatedTextRoot
    })
  ]);

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
    if (isProtectedTranslationRow(row)) {
      continue;
    }
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
    const sourceLine = sourceLines[lineIndex] || "";

    if (lineIndex >= sourceLines.length || translatedLine === sourceLines[lineIndex]) {
      continue;
    }
    if (!containsCjk(translatedLine) && sourceLine.trim().toLowerCase() === translatedLine.trim().toLowerCase()) {
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
    if (isProtectedTranslationRow(row)) {
      continue;
    }
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

const AS2_NATIVE_NAVIGATION_LABEL_REPLACEMENTS = [
  ["GO LEFT", "向左"],
  ["GO RIGHT", "向右"],
  ["GO UP", "向上"],
  ["GO DOWN", "向下"],
  ["ENTER", "进入"],
  ["EXIT", "退出"],
  ["TRAVEL", "旅行"],
  ["COMMON ROOM", "公共房间"]
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
    patchedContent = removeAs2SuperPowerStaticLabelPatch(patchedContent);
    if (patchedContent === normalizeScriptContent(baseContent)) {
      continue;
    }
    ensureDirSync(path.dirname(targetFile));
    writeText(targetFile, patchedContent);
    changed = true;
  }
  return { ok: true, changed };
}

function removeAs2SuperPowerStaticLabelPatch(content) {
  const normalizedContent = normalizeScriptContent(content);
  return normalizedContent.replace(
    /\n?function zhAddDownTownMainStreetLabel\(targetClip\)\n\{[\s\S]*?\n\}\nzhAddDownTownMainStreetLabel\(this\);/u,
    ""
  );
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

function applyAs2NativeNavigationLabelScriptPatch({ sourceScriptRoot, translatedScriptRoot }) {
  const scriptEntries = collectSwfScriptFiles(sourceScriptRoot);
  let changed = false;
  for (const entry of scriptEntries) {
    const targetFile = path.join(translatedScriptRoot, entry.exportPath.replace(/\//gu, path.sep));
    const originalContent = fs.readFileSync(entry.filePath, "utf8");
    const baseContent = fileExists(targetFile) ? fs.readFileSync(targetFile, "utf8") : originalContent;
    const patchedContent = applyLiteralStringReplacements(baseContent, AS2_NATIVE_NAVIGATION_LABEL_REPLACEMENTS);
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
  if (!nextContent.includes("__zhLastSayText")) {
    nextContent = replaceRequiredSnippet(
      nextContent,
      `function showSay(target, sayText, id)
{
   if(!target || !sayText)
   {
      return undefined;
   }
   hideSay(target);`,
      `function showSay(target, sayText, id)
{
   var zhNow;
   var zhSayTextKey;
   var zhActiveBubble;
   if(!target || !sayText)
   {
      return undefined;
   }
   zhNow = getTimer();
   zhSayTextKey = decodeZhSayText(sayText);
   zhActiveBubble = target.sayDepth != undefined && this["say" + target.sayDepth] != undefined;
   if(zhActiveBubble && target.__zhLastShowSayAt != undefined && zhNow - target.__zhLastShowSayAt < 2800)
   {
      if(_root != undefined)
      {
         _root.__zhSuppressedDuplicateSayCount = Number(_root.__zhSuppressedDuplicateSayCount) + 1;
      }
      return undefined;
   }
   if(target.__zhLastSayText == zhSayTextKey && (zhActiveBubble || target.__zhLastSayClosedAt != undefined && zhNow - target.__zhLastSayClosedAt < 1500 || target.__zhLastShowSayAt != undefined && zhNow - target.__zhLastShowSayAt < 900))
   {
      if(_root != undefined)
      {
         _root.__zhSuppressedDuplicateSayCount = Number(_root.__zhSuppressedDuplicateSayCount) + 1;
      }
      return undefined;
   }
   target.__zhLastSayText = zhSayTextKey;
   target.__zhActiveSayText = zhSayTextKey;
   target.__zhLastShowSayAt = zhNow;
   hideSay(target);`,
      "gameplay duplicate showSay throttle"
    );
  }
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
  if (!nextContent.includes("__zhLastSayClosedAt")) {
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
   target.__zhLastSayClosedAt = getTimer();
   target.__zhActiveSayText = "";
   target.talking = false;
   target.avatar.head.mouth.gotoAndStop(target.avatar.mouthFrame);
   target.avatar.head.eyes.pupils.gotoAndStop(1);
   target.engaged = false;
   target.targeted = false;
}`,
      "gameplay hideSay guard patch"
    );
  }

  nextContent = replaceRequiredSnippet(
    nextContent,
    "function turnOffWardrobe()\n{",
    `function zhPopupStageWidth()
{
   var _loc1_ = 1010;
   if(Stage != undefined && Stage.width != undefined && Number(Stage.width) > 0)
   {
      _loc1_ = Math.max(_loc1_,Number(Stage.width));
   }
   return _loc1_;
}
function zhPopupStageHeight()
{
   var _loc1_ = 645;
   if(Stage != undefined && Stage.height != undefined && Number(Stage.height) > 0)
   {
      _loc1_ = Math.max(_loc1_,Number(Stage.height));
   }
   return _loc1_;
}
function zhGameplayLogicalRight()
{
   var zhRight = 1010;
   if(Stage != undefined && Stage.width != undefined && Number(Stage.width) > 0)
   {
      zhRight = Math.max(zhRight,Number(Stage.width));
   }
   if(zhRight > 1010)
   {
      zhRight = zhRight - 35;
   }
   return zhRight;
}
function zhQaHudDebugEnabled()
{
   if(_level0 != undefined && _level0.flashpointQaCacheBust != undefined && String(_level0.flashpointQaCacheBust) != "")
   {
      return true;
   }
   if(_root != undefined && _root.flashpointQaCacheBust != undefined && String(_root.flashpointQaCacheBust) != "")
   {
      return true;
   }
   return false;
}
function zhQaHudRound(value)
{
   if(value == undefined)
   {
      return "na";
   }
   return String(Math.round(Number(value)));
}
function zhQaHudClipPath(clip)
{
   var _loc1_;
   if(clip == undefined)
   {
      return "undefined";
   }
   _loc1_ = "";
   try
   {
      _loc1_ = String(clip);
   }
   catch(zhQaHudPathError)
   {
      _loc1_ = "";
   }
   if(_loc1_ == "" || _loc1_ == "undefined")
   {
      _loc1_ = String(clip._name);
   }
   return escape(_loc1_);
}
function zhQaHudClipX(clip)
{
   return clip == undefined ? "na" : zhQaHudRound(clip._x);
}
function zhQaHudClipY(clip)
{
   return clip == undefined ? "na" : zhQaHudRound(clip._y);
}
function zhQaHudClipVisible(clip)
{
   return clip == undefined ? "na" : String(clip._visible);
}
function zhQaHudLog(eventName,payload)
{
   if(!zhQaHudDebugEnabled() || _root == undefined)
   {
      return undefined;
   }
   if(_root.__zhHudLayoutDebugCount == undefined)
   {
      _root.__zhHudLayoutDebugCount = 0;
   }
   if(Number(_root.__zhHudLayoutDebugCount) >= 60)
   {
      return undefined;
   }
   _root.__zhHudLayoutDebugCount = Number(_root.__zhHudLayoutDebugCount) + 1;
   loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=" + eventName + "&" + payload,0);
}
function zhHideDirectMapButton()
{
   if(_root != undefined && _root.__zhDirectMapButton != undefined)
   {
      _root.__zhDirectMapButton.clear();
      _root.__zhDirectMapButton._visible = false;
      _root.__zhDirectMapButton.enabled = false;
      _root.__zhDirectMapButton.onPress = undefined;
      _root.__zhDirectMapButton.onRelease = undefined;
      _root.__zhDirectMapButton.useHandCursor = false;
      _root.__zhDirectMapButton._x = -4000;
      _root.__zhDirectMapButton._y = -4000;
   }
   if(_root != undefined)
   {
      _root.__zhMapButtonBounds = undefined;
      _root.__zhDirectOpenMap = undefined;
   }
}
function zhDisableGameplayHudButton(buttonClip)
{
   if(buttonClip == undefined)
   {
      return undefined;
   }
   if(buttonClip.__zhHudHandlersSaved != true)
   {
      buttonClip.__zhSavedOnPress = buttonClip.onPress;
      buttonClip.__zhSavedOnRelease = buttonClip.onRelease;
      buttonClip.__zhSavedOnRollOver = buttonClip.onRollOver;
      buttonClip.__zhSavedUseHandCursor = buttonClip.useHandCursor;
      buttonClip.__zhHudHandlersSaved = true;
   }
   buttonClip.onPress = undefined;
   buttonClip.onRelease = undefined;
   buttonClip.useHandCursor = false;
   buttonClip._visible = false;
   buttonClip._alpha = 0;
   buttonClip.enabled = false;
   buttonClip._x = -4000;
   buttonClip._y = -4000;
}
function zhRestoreGameplayHudButton(buttonClip)
{
   var _loc1_;
   if(buttonClip == undefined || buttonClip.__zhHudHandlersSaved != true)
   {
      return undefined;
   }
   _loc1_ = buttonClip.__zhSavedUseHandCursor;
   buttonClip.onPress = buttonClip.__zhSavedOnPress;
   buttonClip.onRelease = buttonClip.__zhSavedOnRelease;
   buttonClip.onRollOver = buttonClip.__zhSavedOnRollOver;
   buttonClip.useHandCursor = _loc1_ == undefined ? true : _loc1_;
   delete buttonClip.__zhSavedOnPress;
   delete buttonClip.__zhSavedOnRelease;
   delete buttonClip.__zhSavedOnRollOver;
   delete buttonClip.__zhSavedUseHandCursor;
   buttonClip.__zhHudHandlersSaved = false;
}
function zhRestoreGameplayHudButtons()
{
   var _loc1_;
   var _loc2_;
   var _loc3_;
   var _loc4_;
   if(navBar == undefined)
   {
      return undefined;
   }
   _loc1_ = [navBar.btnInventory,navBar.btnWardrobe,navBar.btnMap,navBar.btnSuperPower];
   _loc2_ = 0;
   while(_loc2_ < _loc1_.length)
   {
      _loc3_ = _loc1_[_loc2_];
      zhRestoreGameplayHudButton(_loc3_);
      _loc2_ += 1;
   }
}
function zhHideGameplayHudNow()
{
   var _loc1_;
   var _loc2_;
   var _loc3_;
   if(navBar != undefined)
   {
      _loc1_ = [navBar.btnInventory,navBar.btnWardrobe,navBar.btnMap,navBar.btnSuperPower];
      _loc2_ = 0;
      while(_loc2_ < _loc1_.length)
      {
         _loc3_ = _loc1_[_loc2_];
         if(_loc3_ != undefined)
         {
            zhDisableGameplayHudButton(_loc3_);
            _loc3_._visible = false;
            _loc3_._alpha = 0;
            _loc3_.enabled = false;
            _loc3_._x = -4000;
            _loc3_._y = -4000;
         }
         _loc2_ = _loc2_ + 1;
      }
      navBar._visible = false;
      navBar.enabled = false;
   }
   zhHideDirectMapButton();
   zhHideLegacyPauseChrome();
}
function zhPopupLooksOpen()
{
   if(_root != undefined && _root.__zhPopupBackdrop != undefined && _root.__zhPopupBackdrop._visible == true)
   {
      return true;
   }
   if(popupClip != undefined && popupClip._visible != false)
   {
      return true;
   }
   if(popupBack != undefined && popupBack._visible == true)
   {
      return true;
   }
   if(popupClose != undefined && popupClose._visible == true)
   {
      return true;
   }
   return false;
}
function zhStartPopupHudWatchdog()
{
   if(_root == undefined || _root.__zhPopupHudWatchdog != undefined)
   {
      return undefined;
   }
   _root.__zhPopupHudWatchdogTicks = 0;
   _root.__zhPopupHudWatchdogTick = function()
   {
      _root.__zhPopupHudWatchdogTicks = Number(_root.__zhPopupHudWatchdogTicks) + 1;
      if(zhPopupLooksOpen())
      {
         _root.__zhPopupHudHidden = true;
         zhHideGameplayHudNow();
      }
      else
      {
         clearInterval(_root.__zhPopupHudWatchdog);
         _root.__zhPopupHudWatchdog = undefined;
         zhSetPopupHudHidden(false);
      }
      if(_root.__zhPopupHudWatchdogTicks > 240)
      {
         clearInterval(_root.__zhPopupHudWatchdog);
         _root.__zhPopupHudWatchdog = undefined;
      }
   };
   _root.__zhPopupHudWatchdog = setInterval(_root,"__zhPopupHudWatchdogTick",100);
}
function zhSetPopupHudHidden(hidden)
{
   if(_root == undefined)
   {
      return undefined;
   }
   _root.__zhPopupHudHidden = hidden == true;
   if(_root.__zhPopupHudHidden)
   {
      zhHideGameplayHudNow();
   }
   else
   {
      zhRestoreGameplayHudButtons();
      if(navBar != undefined)
      {
         navBar._visible = true;
         navBar.enabled = true;
      }
      if(layoutFramelessGameplayNav != undefined)
      {
         layoutFramelessGameplayNav(true);
      }
   }
}
function zhIsSuperPowerIsland()
{
   var zhIslandName = "";
   if(_root != undefined && _root.island != undefined)
   {
      zhIslandName = String(_root.island).toLowerCase();
   }
   else if(island != undefined)
   {
      zhIslandName = String(island).toLowerCase();
   }
   return zhIslandName == "super" || zhIslandName == "super power" || zhIslandName.indexOf("super") >= 0;
}
function zhHideNonGameplayNavChrome()
{
   var _loc1_;
   var _loc2_;
   var _loc3_;
   if(navBar == undefined)
   {
      return undefined;
   }
   if(gameMenu != undefined)
   {
      gameMenu._visible = false;
      gameMenu._alpha = 0;
      gameMenu.enabled = false;
      gameMenu._x = -4000;
      gameMenu._y = -4000;
      delete gameMenu.onEnterFrame;
   }
   _loc1_ = new Object();
   _loc1_.btnInventory = true;
   _loc1_.btnWardrobe = true;
   _loc1_.btnMap = true;
   if(zhIsSuperPowerIsland())
   {
      _loc1_.btnSuperPower = true;
   }
   for(_loc2_ in navBar)
   {
      if(_loc1_[_loc2_] != true)
      {
         _loc3_ = navBar[_loc2_];
         if(_loc3_ != undefined && typeof _loc3_ == "movieclip")
         {
            _loc3_._visible = false;
            _loc3_._alpha = 0;
            _loc3_.enabled = false;
            _loc3_._x = -4000;
            _loc3_._y = -4000;
         }
      }
   }
}
function zhNotifyPopupViewport(active)
{
   var _loc1_ = active == "map" ? "map" : (active == true ? "1" : "0");
   if(_root != undefined)
   {
      _root.__zhPopupMode = _loc1_;
      _root.__zhPopupTightViewport = _loc1_ == "1" || _loc1_ == "map";
   }
   if(_root != undefined && (_root.flashpointQaCacheBust != undefined || (_level0 != undefined && _level0.flashpointQaCacheBust != undefined) || flashpointQaCacheBust != undefined))
   {
      loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=PopupViewport&active=" + _loc1_,0);
   }
   if(flash.external.ExternalInterface != undefined && flash.external.ExternalInterface.available == true)
   {
      try
      {
         flash.external.ExternalInterface.call("flashpointSetAs2PopupMode",_loc1_);
      }
      catch(zhPopupViewportError)
      {
      }
   }
}
function zhPopupUsesTightViewport(popupName)
{
   var _loc1_ = String(popupName).toLowerCase();
   if(_loc1_ == "inventory.swf" || _loc1_ == "wardrobe.swf" || _loc1_ == "games.swf" || _loc1_ == "getcard.swf" || _loc1_ == "givecard.swf" || _loc1_ == "malidocs.swf")
   {
      return false;
   }
   return true;
}
function zhInstallPopupCloseHandlers()
{
   if(popupClose != undefined)
   {
      popupClose.enabled = true;
      popupClose.useHandCursor = true;
      popupClose.onRollOver = _root.useArrow;
      popupClose.onRelease = function()
      {
         loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=popupClose",0);
         _root.closePopup();
      };
      if(popupClose.btnClose != undefined)
      {
         popupClose.btnClose.enabled = true;
         popupClose.btnClose.useHandCursor = true;
         popupClose.btnClose.onRollOver = _root.useArrow;
         popupClose.btnClose.onRelease = function()
         {
            loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=popupCloseBtn",0);
            _root.closePopup();
         };
      }
   }
   if(popupBack != undefined && popupBack.btnClose != undefined)
   {
      popupBack.btnClose.enabled = true;
      popupBack.btnClose.useHandCursor = true;
      popupBack.btnClose.onRollOver = _root.useArrow;
      popupBack.btnClose.onRelease = function()
      {
         loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=popupBackBtn",0);
         _root.closePopup();
      };
   }
}
function zhHidePopupCloseHit()
{
   if(_root != undefined && _root.__zhPopupCloseHit != undefined)
   {
      _root.__zhPopupCloseHit.clear();
      _root.__zhPopupCloseHit._visible = false;
      _root.__zhPopupCloseHit.enabled = false;
      _root.__zhPopupCloseHit._x = -4000;
      _root.__zhPopupCloseHit._y = -4000;
   }
}
function zhTryClosePopupFromMouse(source)
{
   var _loc1_;
   var _loc2_ = 18;
   var _loc3_;
   var _loc4_;
   if(_root == undefined || popupClose == undefined || popupClose._visible != true)
   {
      return false;
   }
   _loc3_ = _root._xmouse;
   _loc4_ = _root._ymouse;
   if(popupClose.getBounds != undefined)
   {
      _loc1_ = popupClose.getBounds(_root);
      if(_loc1_ != undefined && _loc3_ >= Number(_loc1_.xMin) - _loc2_ && _loc3_ <= Number(_loc1_.xMax) + _loc2_ && _loc4_ >= Number(_loc1_.yMin) - _loc2_ && _loc4_ <= Number(_loc1_.yMax) + _loc2_)
      {
         loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=" + source,0);
         _root.closePopup();
         return true;
      }
   }
   if(_loc3_ >= 720 && _loc3_ <= 930 && _loc4_ >= 18 && _loc4_ <= 110)
   {
      loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=" + source + "Fallback",0);
      _root.closePopup();
      return true;
   }
   return false;
}
function zhRefreshPopupCloseHit()
{
   var _loc1_;
   var _loc2_;
   var _loc3_ = 10;
   if(_root == undefined || popupClose == undefined || popupClose._visible != true || popupClose.getBounds == undefined)
   {
      zhHidePopupCloseHit();
      return undefined;
   }
   _loc1_ = popupClose.getBounds(_root);
   if(!(_loc1_.xMax > _loc1_.xMin) || !(_loc1_.yMax > _loc1_.yMin))
   {
      zhHidePopupCloseHit();
      return undefined;
   }
   _loc2_ = _root.__zhPopupCloseHit;
   if(_loc2_ == undefined)
   {
      _loc2_ = _root.createEmptyMovieClip("__zhPopupCloseHit",1042000);
      _root.__zhPopupCloseHit = _loc2_;
   }
   _loc2_.swapDepths(1042000);
   _loc2_.clear();
   _loc2_._x = 0;
   _loc2_._y = 0;
   _loc2_._visible = true;
   _loc2_.enabled = true;
   _loc2_.useHandCursor = true;
   _loc2_.beginFill(0,1);
   _loc2_.moveTo(Number(_loc1_.xMin) - _loc3_,Number(_loc1_.yMin) - _loc3_);
   _loc2_.lineTo(Number(_loc1_.xMax) + _loc3_,Number(_loc1_.yMin) - _loc3_);
   _loc2_.lineTo(Number(_loc1_.xMax) + _loc3_,Number(_loc1_.yMax) + _loc3_);
   _loc2_.lineTo(Number(_loc1_.xMin) - _loc3_,Number(_loc1_.yMax) + _loc3_);
   _loc2_.lineTo(Number(_loc1_.xMin) - _loc3_,Number(_loc1_.yMin) - _loc3_);
   _loc2_.moveTo(760,28);
   _loc2_.lineTo(900,28);
   _loc2_.lineTo(900,95);
   _loc2_.lineTo(760,95);
   _loc2_.lineTo(760,28);
   _loc2_.endFill();
   _loc2_._alpha = 1;
   _loc2_.onRollOver = _root.useArrow;
   _loc2_.onPress = function()
   {
   };
   _loc2_.onRelease = function()
   {
      loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=popupCloseHit",0);
      _root.closePopup();
   };
}
function zhShowPopupBackdrop(popupName)
{
   var _loc1_ = zhPopupStageWidth();
   var _loc2_ = zhPopupStageHeight();
   var _loc3_;
   if(_root == undefined)
   {
      return undefined;
   }
   _root.__zhPopupTightViewport = zhPopupUsesTightViewport(popupName);
   zhNotifyPopupViewport(_root.__zhPopupTightViewport);
   zhSetPopupHudHidden(true);
   zhStartPopupHudWatchdog();
   if(_root.__zhPopupTightViewport != true)
   {
      if(_root.__zhPopupBackdrop != undefined)
      {
         _root.__zhPopupBackdrop._visible = false;
      }
      return undefined;
   }
   _loc3_ = _root.__zhPopupBackdrop;
   if(_loc3_ == undefined)
   {
      _loc3_ = _root.createEmptyMovieClip("__zhPopupBackdrop",popupBackDepth - 1);
      _root.__zhPopupBackdrop = _loc3_;
   }
   _loc3_.swapDepths(popupBackDepth - 1);
   _loc3_.clear();
   _loc3_._x = 0;
   _loc3_._y = 0;
   _loc3_.beginFill(0,72);
   _loc3_.moveTo(0,0);
   _loc3_.lineTo(_loc1_,0);
   _loc3_.lineTo(_loc1_,_loc2_);
   _loc3_.lineTo(0,_loc2_);
   _loc3_.lineTo(0,0);
   _loc3_.endFill();
   _loc3_._visible = true;
}
function zhFitTightPopupClip()
{
   var _loc1_ = 640;
   var _loc2_ = 480;
   var _loc3_ = 16;
   var _loc4_;
   var _loc5_;
   var _loc6_;
   var _loc7_;
   var _loc8_;
   var _loc9_;
   if(popupClip == undefined || popupClip.getBounds == undefined)
   {
      return false;
   }
   if(popupClip.bgHit != undefined)
   {
      popupClip.bgHit._alpha = 0;
   }
   if(popupClip.board != undefined)
   {
      popupClip._x = 0;
      popupClip._y = 0;
      popupClip._xscale = 100;
      popupClip._yscale = 100;
      popupClip.board._x = 92;
      popupClip.board._y = 62;
      popupClip.board._xscale = 78;
      popupClip.board._yscale = 78;
      return false;
   }
   _loc8_ = _loc1_ - _loc3_ * 2;
   _loc9_ = _loc2_ - _loc3_ * 2;
   _loc4_ = popupClip.getBounds(_root);
   _loc5_ = Number(_loc4_.xMax) - Number(_loc4_.xMin);
   _loc6_ = Number(_loc4_.yMax) - Number(_loc4_.yMin);
   if(!(_loc5_ > 0) || !(_loc6_ > 0))
   {
      return false;
   }
   if(_loc5_ <= _loc8_ && _loc6_ <= _loc9_)
   {
      return false;
   }
   _loc7_ = Math.min(100,_loc8_ * 100 / _loc5_);
   _loc7_ = Math.min(_loc7_,_loc9_ * 100 / _loc6_);
   if(!(_loc7_ > 0))
   {
      return false;
   }
   if(_loc7_ < 99)
   {
      popupClip._xscale = popupClip._xscale * _loc7_ / 100;
      popupClip._yscale = popupClip._yscale * _loc7_ / 100;
      _loc4_ = popupClip.getBounds(_root);
      _loc5_ = Number(_loc4_.xMax) - Number(_loc4_.xMin);
      _loc6_ = Number(_loc4_.yMax) - Number(_loc4_.yMin);
   }
   popupClip._x += (_loc1_ - _loc5_) / 2 - Number(_loc4_.xMin);
   popupClip._y += (_loc2_ - _loc6_) / 2 - Number(_loc4_.yMin);
   if(_root != undefined && _root.__zhTightPopupFitLogged != true)
   {
      _root.__zhTightPopupFitLogged = true;
      loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=TightPopupFit&w=" + Math.round(_loc5_) + "&h=" + Math.round(_loc6_) + "&x=" + Math.round(popupClip._x) + "&y=" + Math.round(popupClip._y),0);
   }
   return true;
}
function zhFitTightPopupChildClip(targetClip)
{
   var _loc2_ = 640;
   var _loc3_ = 480;
   var _loc4_ = 16;
   var _loc5_;
   var _loc6_;
   var _loc7_;
   var _loc8_;
   var _loc9_;
   var _loc10_;
   var _loc11_;
   if(targetClip == undefined || targetClip.getBounds == undefined)
   {
      return false;
   }
   _loc5_ = targetClip.getBounds(_root);
   _loc6_ = Number(_loc5_.xMax) - Number(_loc5_.xMin);
   _loc7_ = Number(_loc5_.yMax) - Number(_loc5_.yMin);
   if(!(_loc6_ > 0) || !(_loc7_ > 0))
   {
      return false;
   }
   if(_loc6_ <= _loc2_ - _loc4_ * 2 && _loc7_ <= _loc3_ - _loc4_ * 2 && Number(_loc5_.xMin) >= _loc4_ && Number(_loc5_.xMax) <= _loc2_ - _loc4_ && Number(_loc5_.yMin) >= _loc4_ && Number(_loc5_.yMax) <= _loc3_ - _loc4_)
   {
      return false;
   }
   _loc8_ = Math.min(100,(_loc2_ - _loc4_ * 2) * 100 / _loc6_);
   _loc8_ = Math.min(_loc8_,(_loc3_ - _loc4_ * 2) * 100 / _loc7_);
   if(!(_loc8_ > 0))
   {
      return false;
   }
   if(_loc8_ < 99)
   {
      targetClip._xscale = targetClip._xscale * _loc8_ / 100;
      targetClip._yscale = targetClip._yscale * _loc8_ / 100;
      _loc5_ = targetClip.getBounds(_root);
      _loc6_ = Number(_loc5_.xMax) - Number(_loc5_.xMin);
      _loc7_ = Number(_loc5_.yMax) - Number(_loc5_.yMin);
   }
   _loc9_ = targetClip._parent != undefined && targetClip._parent._xscale != undefined && targetClip._parent._xscale != 0 ? targetClip._parent._xscale / 100 : 1;
   _loc10_ = targetClip._parent != undefined && targetClip._parent._yscale != undefined && targetClip._parent._yscale != 0 ? targetClip._parent._yscale / 100 : 1;
   _loc11_ = (_loc2_ - _loc6_) / 2 - Number(_loc5_.xMin);
   targetClip._x += _loc11_ / _loc9_;
   targetClip._y += ((_loc3_ - _loc7_) / 2 - Number(_loc5_.yMin)) / _loc10_;
   return true;
}
function zhStartTightPopupFitWatchdog(popupName)
{
   if(_root == undefined || !zhPopupUsesTightViewport(popupName))
   {
      return undefined;
   }
   if(_root.__zhTightPopupFitInterval != undefined)
   {
      clearInterval(_root.__zhTightPopupFitInterval);
   }
   _root.__zhTightPopupFitLogged = false;
   _root.__zhTightPopupFitTicks = 0;
   _root.__zhTightPopupFitTick = function()
   {
      _root.__zhTightPopupFitTicks = Number(_root.__zhTightPopupFitTicks) + 1;
      zhFitTightPopupClip();
      if(_root.__zhTightPopupFitTicks > 600)
      {
         clearInterval(_root.__zhTightPopupFitInterval);
         _root.__zhTightPopupFitInterval = undefined;
      }
   };
   _root.__zhTightPopupFitInterval = setInterval(_root,"__zhTightPopupFitTick",100);
}
function zhStopTightPopupFitWatchdog()
{
   if(_root != undefined && _root.__zhTightPopupFitInterval != undefined)
   {
      clearInterval(_root.__zhTightPopupFitInterval);
      _root.__zhTightPopupFitInterval = undefined;
   }
}
function zhRaisePopupLayers()
{
   var _loc1_ = 1030000;
   if(_root != undefined && _root.__zhPopupBackdrop != undefined)
   {
      _root.__zhPopupBackdrop.swapDepths(_loc1_);
   }
   if(popupBack != undefined)
   {
      popupBack.swapDepths(_loc1_ + 1);
   }
   if(popupClip != undefined)
   {
      popupClip.swapDepths(_loc1_ + 2);
   }
   if(popupClose != undefined)
   {
      popupClose.swapDepths(_loc1_ + 3);
   }
}
function zhHidePopupBackdrop()
{
   zhHidePopupCloseHit();
   zhStopTightPopupFitWatchdog();
   zhNotifyPopupViewport(false);
   if(_root != undefined)
   {
      _root.__zhPopupTightViewport = false;
   }
   if(_root != undefined && _root.__zhPopupBackdrop != undefined)
   {
      _root.__zhPopupBackdrop._visible = false;
   }
   if(_root != undefined && _root.__zhPopupHudWatchdog != undefined)
   {
      clearInterval(_root.__zhPopupHudWatchdog);
      _root.__zhPopupHudWatchdog = undefined;
   }
   zhSetPopupHudHidden(false);
}
function zhOpenDirectMap()
{
   if(_root == undefined)
   {
      return undefined;
   }
   if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())
   {
      if(zhTryClosePopupFromMouse("openDirectMap"))
      {
         return undefined;
      }
      loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=PopupClosePressed&target=openDirectMapBlockedMap",0);
      _root.closePopup();
      return undefined;
      loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=zhOpenDirectMapBlockedByPopup",0);
      return undefined;
   }
   _root.__zhMapSuppressBgUntil = getTimer() + 1200;
   if(_root.__zhDirectMapButton != undefined)
   {
      _root.__zhDirectMapButton._visible = false;
   }
   loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=zhDirectMapViewportForced",0);
   zhNotifyPopupViewport("map");
   if(_root.popup != undefined)
   {
      _root.popup("map.swf",true);
   }
   else
   {
      popup("map.swf",true);
   }
   zhNotifyPopupViewport("map");
   setTimeout(function()
   {
      zhNotifyPopupViewport("map");
   },50);
   setTimeout(function()
   {
      zhNotifyPopupViewport("map");
   },250);
   if(_root.trackEvent != undefined)
   {
      _root.trackEvent("MapClicked");
   }
}
function zhReadAutoMapDelay()
{
   if(_root != undefined && _root.flashpoint_auto_open_map_after_ms != undefined)
   {
      return _root.flashpoint_auto_open_map_after_ms;
   }
   if(_level0 != undefined && _level0.flashpoint_auto_open_map_after_ms != undefined)
   {
      return _level0.flashpoint_auto_open_map_after_ms;
   }
   if(flashpoint_auto_open_map_after_ms != undefined)
   {
      return flashpoint_auto_open_map_after_ms;
   }
   return undefined;
}
function zhEnsureDirectMapButton()
{
   if(_root == undefined)
   {
      return undefined;
   }
   if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())
   {
      zhHideDirectMapButton();
      loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=zhEnsureDirectMapButtonBlockedByPopup",0);
      return undefined;
   }
   var zhMapButton = _root.__zhDirectMapButton;
   var zhMapBounds;
   var zhMapWidth;
   var zhMapHeight;
   if(zhMapButton == undefined)
   {
      zhMapButton = _root.createEmptyMovieClip("__zhDirectMapButton",1040000);
   }
   zhMapButton.swapDepths(1040000);
   zhMapButton.clear();
   zhMapBounds = _root.__zhGameplayMapBounds;
   if(zhMapBounds != undefined)
   {
      zhMapButton._x = zhMapBounds.left;
      zhMapButton._y = zhMapBounds.top;
      zhMapWidth = Math.max(32,zhMapBounds.right - zhMapBounds.left);
      zhMapHeight = Math.max(32,zhMapBounds.bottom - zhMapBounds.top);
   }
   else
   {
      zhMapButton._x = 920;
      zhMapButton._y = -42;
      zhMapWidth = 90;
      zhMapHeight = 142;
   }
   zhMapButton._visible = true;
   zhMapButton.enabled = true;
   zhMapButton.useHandCursor = true;
   zhMapButton.beginFill(0,1);
   zhMapButton.moveTo(0,0);
   zhMapButton.lineTo(zhMapWidth,0);
   zhMapButton.lineTo(zhMapWidth,zhMapHeight);
   zhMapButton.lineTo(0,zhMapHeight);
   zhMapButton.lineTo(0,0);
   zhMapButton.endFill();
   zhMapButton._alpha = 1;
   _root.__zhDirectOpenMap = zhOpenDirectMap;
   _root.__zhMapButtonBounds = {left:zhMapButton._x,top:zhMapButton._y - 100,right:zhMapButton._x + zhMapWidth,bottom:zhMapButton._y + zhMapHeight + 20};
   if(Mouse != undefined && _root.__zhMapMouseListener == undefined)
   {
      _root.__zhMapMouseListener = new Object();
      _root.__zhMapMouseListener.onMouseDown = function()
      {
         if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())
         {
            if(zhTryClosePopupFromMouse("mapMouseListener"))
            {
               return undefined;
            }
            if(_root.__zhPopupMode == "map" && _root.__zhMapPopupShowResetDialog != undefined && Number(_root._xmouse) >= 0 && Number(_root._xmouse) <= 130 && Number(_root._ymouse) >= 250 && Number(_root._ymouse) <= 390)
            {
               loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=MapResetRootBridge&x=" + Math.round(_root._xmouse) + "&y=" + Math.round(_root._ymouse),0);
               _root.__zhMapPopupShowResetDialog();
               return undefined;
            }
            zhHideDirectMapButton();
            loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=MapMouseListenerIgnoredPopup&x=" + Math.round(_root._xmouse) + "&y=" + Math.round(_root._ymouse),0);
            return undefined;
            loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=zhMapMouseListenerBlockedByPopup",0);
            return undefined;
         }
         var zhMapBounds = _root.__zhMapButtonBounds;
         if(zhMapBounds != undefined && _root._ymouse <= 180 && _root._xmouse >= 600 && (_root.flashpointQaCacheBust != undefined || _level0.flashpointQaCacheBust != undefined || flashpointQaCacheBust != undefined))
         {
            loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=MapMouseProbe&x=" + Math.round(_root._xmouse) + "&y=" + Math.round(_root._ymouse) + "&l=" + Math.round(zhMapBounds.left) + "&t=" + Math.round(zhMapBounds.top) + "&r=" + Math.round(zhMapBounds.right) + "&b=" + Math.round(zhMapBounds.bottom),0);
         }
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
   zhMapButton.onPress = zhMapButton.onRelease = function()
   {
      if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())
      {
         if(zhTryClosePopupFromMouse("directMapButton"))
         {
            return undefined;
         }
         zhHideDirectMapButton();
         loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=DirectMapButtonIgnoredPopup&x=" + Math.round(_root._xmouse) + "&y=" + Math.round(_root._ymouse),0);
         return undefined;
         loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=zhDirectMapButtonBlockedByPopup",0);
         return undefined;
      }
      return zhOpenDirectMap();
   };
}
function zhScheduleAutoMap()
{
   var _loc1_;
   if(_root == undefined || _root.__zhAutoMapScheduled == true)
   {
      return undefined;
   }
   _loc1_ = Number(zhReadAutoMapDelay());
   if(isNaN(_loc1_) || _loc1_ < 0)
   {
      return undefined;
   }
   _root.__zhAutoMapScheduled = true;
   setTimeout(zhOpenDirectMap,_loc1_);
}
function zhInstallExternalMapBridge()
{
   if(_root == undefined || _root.__zhExternalMapBridgeInstalled == true)
   {
      return undefined;
   }
   _root.__zhExternalMapBridgeInstalled = true;
   _root.__zhExternalMapLastRequest = "";
   if(flash.external.ExternalInterface != undefined && flash.external.ExternalInterface.available == true && flash.external.ExternalInterface.addCallback != undefined)
   {
      try
      {
         flash.external.ExternalInterface.addCallback("flashpointOpenMap",_root,zhOpenDirectMap);
      }
      catch(zhBridgeCallbackError)
      {
      }
   }
   _root.__zhExternalMapBridgeTimer = setInterval(function()
   {
      var zhMapRequest = _root.__zhExternalMapRequest;
      if((zhMapRequest == undefined || zhMapRequest == "0") && _level0 != undefined)
      {
         zhMapRequest = _level0.__zhExternalMapRequest;
      }
      zhMapRequest = zhMapRequest == undefined ? "" : String(zhMapRequest);
      if(zhMapRequest.length > 0 && zhMapRequest != "0" && zhMapRequest != _root.__zhExternalMapLastRequest)
      {
         _root.__zhExternalMapLastRequest = zhMapRequest;
         _root.__zhExternalMapRequest = "0";
         if(_level0 != undefined)
         {
            _level0.__zhExternalMapRequest = "0";
         }
         zhOpenDirectMap();
      }
   },100);
}
function zhSuppressSavingGame()
{
   if(navBar != undefined && navBar.savingGame != undefined)
   {
      navBar.savingGame.stop();
      navBar.savingGame._visible = false;
      navBar.savingGame._alpha = 0;
   }
   if(navBar != undefined && navBar.btnSave != undefined)
   {
      navBar.btnSave._visible = false;
      navBar.btnSave._alpha = 0;
      navBar.btnSave.enabled = false;
      navBar.btnSave._x = -4000;
      navBar.btnSave._y = -4000;
      if(navBar.btnSave.saveText != undefined)
      {
         navBar.btnSave.saveText._visible = false;
      }
   }
}
function zhHideLegacyPauseChrome()
{
   var _loc1_;
   var _loc2_;
   _loc1_ = ["btnSave","savingGame","pauseBtn","btnPause","pauseButton","pause_mc","pauseIcon","pause","saveStatus","saveIcon","save_mc"];
   _loc2_ = 0;
   while(_loc2_ < _loc1_.length)
   {
      zhHideNamedPauseChrome(navBar,_loc1_[_loc2_]);
      zhHideNamedPauseChrome(_root,_loc1_[_loc2_]);
      zhHideNamedPauseChrome(_level0,_loc1_[_loc2_]);
      _loc2_ = _loc2_ + 1;
   }
   zhSuppressSavingGame();
}
function zhHideNamedPauseChrome(parentClip, childName)
{
   var _loc1_;
   if(parentClip != undefined && childName != undefined && parentClip[childName] != undefined)
   {
      _loc1_ = parentClip[childName];
      if(_loc1_ != undefined)
      {
         _loc1_._visible = false;
         _loc1_._alpha = 0;
         _loc1_.enabled = false;
         _loc1_._x = -4000;
         _loc1_._y = -4000;
      }
   }
}
function zhIsQaHideHudEnabled()
{
   var _loc1_;
   if(_root != undefined && _root.flashpointQaHideHud != undefined)
   {
      _loc1_ = _root.flashpointQaHideHud;
   }
   if((_loc1_ == undefined || _loc1_ == "") && _level0 != undefined && _level0.flashpointQaHideHud != undefined)
   {
      _loc1_ = _level0.flashpointQaHideHud;
   }
   if((_loc1_ == undefined || _loc1_ == "") && flashpointQaHideHud != undefined)
   {
      _loc1_ = flashpointQaHideHud;
   }
   _loc1_ = String(_loc1_).toLowerCase();
   return _loc1_ == "1" || _loc1_ == "true" || _loc1_ == "yes" || _loc1_ == "y";
}
function zhQaAs2DialogMode()
{
   var _loc1_;
   if(_global != undefined && _global.flashpointQaAs2Dialog != undefined)
   {
      _loc1_ = _global.flashpointQaAs2Dialog;
   }
   if((_loc1_ == undefined || _loc1_ == "" || String(_loc1_) == "undefined") && _root != undefined && _root.flashpointQaAs2Dialog != undefined)
   {
      _loc1_ = _root.flashpointQaAs2Dialog;
   }
   if((_loc1_ == undefined || _loc1_ == "" || String(_loc1_) == "undefined") && _level0 != undefined && _level0.flashpointQaAs2Dialog != undefined)
   {
      _loc1_ = _level0.flashpointQaAs2Dialog;
   }
   if(_loc1_ == undefined || String(_loc1_) == "undefined")
   {
      _loc1_ = "";
   }
   return String(_loc1_);
}
function zhReadQaNumber(name)
{
   var _loc1_;
   if(_global != undefined && _global[name] != undefined)
   {
      _loc1_ = _global[name];
   }
   if((_loc1_ == undefined || _loc1_ == "" || String(_loc1_) == "undefined") && _root != undefined && _root[name] != undefined)
   {
      _loc1_ = _root[name];
   }
   if((_loc1_ == undefined || _loc1_ == "" || String(_loc1_) == "undefined") && _level0 != undefined && _level0[name] != undefined)
   {
      _loc1_ = _level0[name];
   }
   _loc1_ = Number(_loc1_);
   if(isNaN(_loc1_))
   {
      return undefined;
   }
   return _loc1_;
}
function zhApplyQaStartPosition()
{
   var _loc1_;
   var _loc2_;
   var _loc3_;
   var _loc4_;
   var _loc5_;
   if(_root == undefined)
   {
      return false;
   }
   _loc1_ = zhReadQaNumber("flashpointQaStartX");
   _loc2_ = zhReadQaNumber("flashpointQaStartY");
   if(_loc1_ == undefined && _loc2_ == undefined)
   {
      return false;
   }
   if(_root.camera == undefined || _root.camera.scene == undefined || _root.camera.scene.char == undefined || _root.camera.scene.char.avatar == undefined)
   {
      return false;
   }
   _loc3_ = _root.camera.scene.char;
   if(_loc1_ != undefined)
   {
      _loc3_._x = _loc1_;
   }
   if(_loc2_ != undefined)
   {
      _loc3_._y = _loc2_;
   }
   _loc4_ = _loc3_.avatar != undefined ? _loc3_.avatar.FunBrain_so : undefined;
   if(_loc4_ == undefined && _root.FunBrain_so != undefined)
   {
      _loc4_ = _root.FunBrain_so;
   }
   if(_loc4_ != undefined && _loc4_.data != undefined)
   {
      if(_loc1_ != undefined)
      {
         _loc4_.data.xPos = _loc1_;
         if(_root.desc != undefined)
         {
            _loc4_.data[String(_root.desc) + "xPos"] = _loc1_;
         }
      }
      if(_loc2_ != undefined)
      {
         _loc4_.data.yPos = _loc2_;
         if(_root.desc != undefined)
         {
            _loc4_.data[String(_root.desc) + "yPos"] = _loc2_;
         }
      }
   }
   _root.__zhQaStartPositionApplied = true;
   if(zhQaHudDebugEnabled != undefined && zhQaHudDebugEnabled())
   {
      _loc5_ = _root.camera.scene.char1;
      loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=QaStartPosition&tick=" + (_root.__zhQaStartPositionTicks != undefined ? _root.__zhQaStartPositionTicks : "na") + "&x=" + Math.round(Number(_loc3_._x)) + "&y=" + Math.round(Number(_loc3_._y)) + "&targetX=" + (_loc3_.targetX != undefined ? Math.round(Number(_loc3_.targetX)) : "na") + "&targetY=" + (_loc3_.targetY != undefined ? Math.round(Number(_loc3_.targetY)) : "na") + "&speed=" + (_loc3_.speed != undefined ? Math.round(Number(_loc3_.speed)) : "na") + "&vSpeed=" + (_loc3_.vSpeed != undefined ? Math.round(Number(_loc3_.vSpeed)) : "na") + "&sceneX=" + Math.round(Number(_root.camera.scene._x)) + "&sceneY=" + Math.round(Number(_root.camera.scene._y)) + "&camX=" + Math.round(Number(_root.camera._x)) + "&camY=" + Math.round(Number(_root.camera._y)) + "&rootCharX=" + (_root.char != undefined ? Math.round(Number(_root.char._x)) : "na") + "&rootCharY=" + (_root.char != undefined ? Math.round(Number(_root.char._y)) : "na") + "&panCharX=" + (_root.camera.scene.panChar != undefined ? Math.round(Number(_root.camera.scene.panChar._x)) : "na") + "&panCharY=" + (_root.camera.scene.panChar != undefined ? Math.round(Number(_root.camera.scene.panChar._y)) : "na") + "&char1x=" + (_loc5_ != undefined ? Math.round(Number(_loc5_._x)) : "na") + "&char1y=" + (_loc5_ != undefined ? Math.round(Number(_loc5_._y)) : "na") + "&char1Press=" + (_loc5_ != undefined && _loc5_.onPress != undefined ? "1" : "0") + "&cond1=" + (_loc5_ != undefined && _loc3_._x > _loc5_._x ? "1" : "0") + "&cond2=" + (_loc5_ != undefined && _loc3_._y > _loc5_._y - 400 ? "1" : "0"),0);
   }
   return true;
}
function zhScheduleQaStartPosition()
{
   if(_root == undefined || _root.__zhQaStartPositionInterval != undefined)
   {
      return undefined;
   }
   if(zhReadQaNumber("flashpointQaStartX") == undefined && zhReadQaNumber("flashpointQaStartY") == undefined)
   {
      return undefined;
   }
   _root.__zhQaStartPositionTicks = 0;
   _root.__zhQaStartPositionTick = function()
   {
      this.__zhQaStartPositionTicks = Number(this.__zhQaStartPositionTicks) + 1;
      if((zhApplyQaStartPosition() == true && this.__zhQaStartPositionTicks > 24) || this.__zhQaStartPositionTicks > 80)
      {
         clearInterval(this.__zhQaStartPositionInterval);
         this.__zhQaStartPositionInterval = undefined;
      }
   };
   _root.__zhQaStartPositionInterval = setInterval(_root,"__zhQaStartPositionTick",250);
}
function zhReadQaPopupName()
{
   var _loc1_;
   if(_global != undefined && _global.flashpointQaAs2Popup != undefined)
   {
      _loc1_ = _global.flashpointQaAs2Popup;
   }
   if((_loc1_ == undefined || _loc1_ == "" || String(_loc1_) == "undefined") && _root != undefined && _root.flashpointQaAs2Popup != undefined)
   {
      _loc1_ = _root.flashpointQaAs2Popup;
   }
   if((_loc1_ == undefined || _loc1_ == "" || String(_loc1_) == "undefined") && _level0 != undefined && _level0.flashpointQaAs2Popup != undefined)
   {
      _loc1_ = _level0.flashpointQaAs2Popup;
   }
   if(_loc1_ == undefined || String(_loc1_) == "undefined")
   {
      return "";
   }
   _loc1_ = String(_loc1_);
   if(_loc1_.indexOf("/") >= 0 || _loc1_.indexOf("\\") >= 0 || _loc1_.indexOf("..") >= 0)
   {
      return "";
   }
   if(_loc1_.indexOf(".swf") < 0)
   {
      _loc1_ += ".swf";
   }
   return _loc1_;
}
function zhScheduleQaPopup()
{
   var _loc1_ = zhReadQaPopupName();
   if(_root == undefined || _root.__zhQaPopupScheduled == true || _loc1_ == "")
   {
      return undefined;
   }
   _root.__zhQaPopupScheduled = true;
   _root.__zhQaPopupName = _loc1_;
   _root.__zhQaPopupTicks = 0;
   _root.__zhQaPopupTick = function()
   {
      _root.__zhQaPopupTicks = Number(_root.__zhQaPopupTicks) + 1;
      if(_root.__zhQaPopupTicks >= 24 && _root.popup != undefined && zhQaPopupSceneReady())
      {
         clearInterval(_root.__zhQaPopupInterval);
         _root.__zhQaPopupInterval = undefined;
         _root.popup(_root.__zhQaPopupName,true);
         loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=QaPopupOpened&popup=" + escape(_root.__zhQaPopupName) + "&ticks=" + _root.__zhQaPopupTicks,0);
      }
      else if(_root.__zhQaPopupTicks > 120)
      {
         clearInterval(_root.__zhQaPopupInterval);
         _root.__zhQaPopupInterval = undefined;
         loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=QaPopupTimeout&popup=" + escape(_root.__zhQaPopupName),0);
      }
   };
   _root.__zhQaPopupInterval = setInterval(_root,"__zhQaPopupTick",250);
}
function zhQaPopupSceneReady()
{
   var _loc1_;
   if(_root == undefined || _root.camera == undefined || _root.camera.scene == undefined)
   {
      return false;
   }
   _loc1_ = _root.camera.scene.char;
   if(_loc1_ == undefined || _loc1_.avatar == undefined)
   {
      return false;
   }
   return true;
}
function zhMaybeStartShowSayThrottleProof()
{
   var _loc1_;
   _loc1_ = zhQaAs2DialogMode();
   if((_loc1_ != "as2-show-say-throttle" && _loc1_ != "as2-show-say-active-throttle") || _root == undefined || _root.__zhQaShowSayThrottleStarted == true)
   {
      return undefined;
   }
   _root.__zhQaShowSayThrottleMode = _loc1_;
   _root.__zhQaShowSayThrottleStarted = true;
   _root.__zhQaShowSayThrottleTicks = 0;
   _root.__zhQaShowSayThrottleDone = false;
   _root.__zhQaShowSayThrottleTick = function()
   {
      var _loc2_;
      var _loc3_;
      var _loc4_;
      var _loc5_;
      var _loc6_;
      var _loc7_;
      this.__zhQaShowSayThrottleTicks = Number(this.__zhQaShowSayThrottleTicks) + 1;
      if(this.__zhQaShowSayThrottleTicks < 16)
      {
         return undefined;
      }
      _loc2_ = this.camera != undefined && this.camera.scene != undefined ? this.camera.scene.char : undefined;
      if(this.__zhQaShowSayThrottleDone != true && _loc2_ != undefined && _loc2_.avatar != undefined && this.showSay != undefined && this.sayDepth != undefined)
      {
         this.__zhQaShowSayThrottleDone = true;
         this.__zhSuppressedDuplicateSayCount = 0;
         _loc3_ = this.__zhQaShowSayThrottleMode == "as2-show-say-active-throttle" ? "第一句对话测试" : "重复对话测试";
         this.showSay(_loc2_,_loc3_);
         if(this.__zhQaShowSayThrottleMode == "as2-show-say-active-throttle")
         {
            this.showSay(_loc2_,"第二句不应该抢出来");
            this.showSay(_loc2_,"第三句不应该抢出来");
            this.showSay(_loc2_,"第四句不应该抢出来");
         }
         else
         {
            this.showSay(_loc2_,_loc3_);
            this.showSay(_loc2_,_loc3_);
            this.showSay(_loc2_,_loc3_);
            this.showSay(_loc2_,_loc3_);
         }
         _loc4_ = _loc2_.sayDepth != undefined && this["say" + _loc2_.sayDepth] != undefined;
         if(_loc4_)
         {
            this["say" + _loc2_.sayDepth].wait = 7000;
            this["say" + _loc2_.sayDepth]._visible = true;
            this["say" + _loc2_.sayDepth]._alpha = 100;
         }
         _loc5_ = Number(this.__zhSuppressedDuplicateSayCount);
         _loc6_ = _loc4_ && this["say" + _loc2_.sayDepth].fld != undefined ? escape(this["say" + _loc2_.sayDepth].fld.text) : "";
         _loc7_ = this.__zhQaShowSayThrottleMode == "as2-show-say-active-throttle" ? "QaShowSayActiveThrottle" : "QaShowSayThrottle";
         loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=" + _loc7_ + "&suppressed=" + _loc5_ + "&bubble=" + _loc4_ + "&text=" + _loc6_ + "&ticks=" + this.__zhQaShowSayThrottleTicks,0);
      }
      if(this.__zhQaShowSayThrottleDone == true || this.__zhQaShowSayThrottleTicks > 80)
      {
         clearInterval(this.__zhQaShowSayThrottleInterval);
         this.__zhQaShowSayThrottleInterval = undefined;
      }
   };
   _root.__zhQaShowSayThrottleInterval = setInterval(_root,"__zhQaShowSayThrottleTick",250);
}
function layoutFramelessGameplayNav(forceLayout)
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
   if(navBar == undefined)
   {
      zhQaHudLog("HudLayoutNoNav","island=" + escape(String(_loc20_)) + "&root=" + zhQaHudClipPath(_root));
      return undefined;
   }
   if(_root != undefined && _root.__zhPopupHudHidden == true)
   {
      zhHideGameplayHudNow();
      return undefined;
   }
   navBar._visible = true;
   navBar.enabled = true;
   if(zhIsQaHideHudEnabled())
   {
      _loc2_ = [navBar.btnInventory,navBar.btnWardrobe,navBar.btnMap,navBar.btnSuperPower];
      _loc7_ = 0;
      while(_loc7_ < _loc2_.length)
      {
         _loc8_ = _loc2_[_loc7_];
         if(_loc8_ != undefined)
         {
            _loc8_._visible = false;
            _loc8_._alpha = 0;
            _loc8_.enabled = false;
            _loc8_._x = -4000;
            _loc8_._y = -4000;
         }
         _loc7_ = _loc7_ + 1;
      }
      if(_root != undefined && _root.__zhDirectMapButton != undefined)
      {
         _root.__zhDirectMapButton.clear();
         _root.__zhDirectMapButton._visible = false;
         _root.__zhDirectMapButton.enabled = false;
         _root.__zhDirectMapButton._x = -4000;
         _root.__zhDirectMapButton._y = -4000;
      }
      zhHideLegacyPauseChrome();
      return undefined;
   }
   zhHideNonGameplayNavChrome();
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
   zhSuppressSavingGame();
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
    _loc10_ = zhGameplayLogicalRight();
    _loc11_ = 14;
    _loc12_ = -32;
    _loc13_ = 20;
   _loc14_ = 0;
   _loc18_ = 0;
   _loc7_ = 0;
   while(_loc7_ < _loc2_.length)
   {
      _loc8_ = _loc2_[_loc7_];
      if(_loc8_ != undefined && _loc8_._visible)
      {
         _loc16_ = navBar.__zhGameplayLayout[_loc8_._name];
         if(_loc16_ != undefined && !isNaN(Number(_loc16_.width)) && !isNaN(Number(_loc16_.offsetX)) && !isNaN(Number(_loc16_.top)))
         {
            _loc14_ += _loc16_.width;
            _loc18_ = _loc18_ + 1;
         }
      }
      _loc7_ = _loc7_ + 1;
   }
   if(_loc18_ < 3)
   {
      var zhHudRight = zhGameplayLogicalRight();
      var zhInventoryX = Math.max(6,zhHudRight - 358);
      var zhWardrobeX = Math.max(62,zhHudRight - 302);
      var zhMapX = Math.max(118,zhHudRight - 246);
      if(navBar.btnInventory != undefined)
      {
         navBar.btnInventory._x = zhInventoryX;
         navBar.btnInventory._y = -20;
         navBar.btnInventory._visible = true;
         navBar.btnInventory._alpha = 100;
         navBar.btnInventory.enabled = true;
      }
      if(navBar.btnWardrobe != undefined)
      {
         navBar.btnWardrobe._x = zhWardrobeX;
         navBar.btnWardrobe._y = -20;
         navBar.btnWardrobe._visible = true;
         navBar.btnWardrobe._alpha = 100;
         navBar.btnWardrobe.enabled = true;
      }
      if(navBar.btnMap != undefined)
      {
         navBar.btnMap._x = zhMapX;
         navBar.btnMap._y = -20;
         navBar.btnMap._visible = true;
         navBar.btnMap._alpha = 100;
         navBar.btnMap.enabled = true;
         _root.__zhGameplayMapBounds = {left:zhMapX - 20,top:-38,right:zhMapX + 56,bottom:50};
      }
      if(navBar.btnSuperPower != undefined && (!zhIsSuperPowerIsland() || isNaN(Number(navBar.btnSuperPower._y)) || Number(navBar.btnSuperPower._y) < -100))
      {
         navBar.btnSuperPower._visible = false;
         navBar.btnSuperPower._alpha = 0;
         navBar.btnSuperPower.enabled = false;
         navBar.btnSuperPower._x = -4000;
         navBar.btnSuperPower._y = -4000;
      }
      _root.__zhGameplayTopNavLeft = zhInventoryX;
      _root.__zhGameplayTopNavRight = zhMapX + 56;
      _root.__zhGameplayTopNavTop = -20;
      _root.__zhGameplayTopNavCenterY = -20;
      zhQaHudLog("HudLayoutFallback","count=" + zhQaHudRound(_loc18_) + "&invX=" + zhQaHudClipX(navBar.btnInventory) + "&wardX=" + zhQaHudClipX(navBar.btnWardrobe) + "&mapX=" + zhQaHudClipX(navBar.btnMap) + "&superY=" + zhQaHudClipY(navBar.btnSuperPower));
      zhEnsureDirectMapButton();
      zhHideLegacyPauseChrome();
      return undefined;
   }
   _loc14_ += _loc13_ * Math.max(0,_loc18_ - 1);
    _loc17_ = _loc10_ - _loc11_ - _loc14_;
    if(_loc17_ < 6)
    {
       _loc17_ = 6;
    }
    zhQaHudLog("HudLayoutPlan","right=" + zhQaHudRound(_loc10_) + "&left=" + zhQaHudRound(_loc17_) + "&top=" + zhQaHudRound(_loc12_) + "&gap=" + zhQaHudRound(_loc13_) + "&width=" + zhQaHudRound(_loc14_) + "&count=" + zhQaHudRound(_loc18_) + "&nav=" + zhQaHudClipPath(navBar) + "&parent=" + zhQaHudClipPath(navBar._parent) + "&sig=" + escape(_loc9_));
    _root.__zhGameplayTopNavLeft = _loc17_;
    _root.__zhGameplayTopNavRight = _loc17_ + _loc14_;
    _root.__zhGameplayTopNavTop = _loc12_;
    _root.__zhGameplayTopNavCenterY = _loc12_;
   _loc7_ = 0;
   while(_loc7_ < _loc2_.length)
   {
      _loc8_ = _loc2_[_loc7_];
      if(_loc8_ != undefined)
      {
         _loc16_ = navBar.__zhGameplayLayout[_loc8_._name];
         if(_loc8_._visible && _loc16_ != undefined && !isNaN(Number(_loc16_.width)) && !isNaN(Number(_loc16_.offsetX)) && !isNaN(Number(_loc16_.top)))
         {
             _loc8_._x = Math.round(_loc17_ + _loc16_.offsetX);
             _loc8_._y = Math.round(_loc12_ - _loc16_.top);
             if(_loc8_ == navBar.btnMap)
             {
                _root.__zhGameplayMapBounds = {left:_loc17_,top:_loc12_,right:_loc17_ + _loc16_.width,bottom:_loc12_ + _loc16_.height};
             }
             _loc17_ += _loc16_.width + _loc13_;
         }
      }
      _loc7_ = _loc7_ + 1;
   }
   zhQaHudLog("HudLayoutApplied","navX=" + zhQaHudRound(navBar._x) + "&navY=" + zhQaHudRound(navBar._y) + "&invX=" + zhQaHudClipX(navBar.btnInventory) + "&invY=" + zhQaHudClipY(navBar.btnInventory) + "&wardX=" + zhQaHudClipX(navBar.btnWardrobe) + "&wardY=" + zhQaHudClipY(navBar.btnWardrobe) + "&mapX=" + zhQaHudClipX(navBar.btnMap) + "&mapY=" + zhQaHudClipY(navBar.btnMap) + "&superX=" + zhQaHudClipX(navBar.btnSuperPower) + "&superY=" + zhQaHudClipY(navBar.btnSuperPower) + "&invVis=" + zhQaHudClipVisible(navBar.btnInventory) + "&mapVis=" + zhQaHudClipVisible(navBar.btnMap));
   zhEnsureDirectMapButton();
   zhHideLegacyPauseChrome();
}
function turnOffWardrobe()
{`,
    "gameplay frameless gameplay nav helper"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    "navBar.swapDepths(navDepth);",
`navBar.swapDepths(navDepth);
if(_root != undefined && zhEnsureDirectMapButton != undefined)
{
   zhEnsureDirectMapButton();
}
if(_root != undefined && zhSuppressSavingGame != undefined)
{
   zhSuppressSavingGame();
}
if(_root != undefined && zhHideLegacyPauseChrome != undefined)
{
   zhHideLegacyPauseChrome();
}
if(_root != undefined && zhScheduleAutoMap != undefined)
{
   zhScheduleAutoMap();
}
if(_root != undefined && zhScheduleQaPopup != undefined)
{
   zhScheduleQaPopup();
}
if(_root != undefined && zhScheduleQaStartPosition != undefined)
{
   zhScheduleQaStartPosition();
}
if(_root != undefined && zhInstallExternalMapBridge != undefined)
{
   zhInstallExternalMapBridge();
}
if(_root != undefined && zhMaybeStartShowSayThrottleProof != undefined)
{
   zhMaybeStartShowSayThrottleProof();
}
if(_root != undefined)
{
   _root.layoutFramelessGameplayNav = layoutFramelessGameplayNav;
   _root.layoutFramelessGameplayNav(true);
   if(_root.__zhGameplayNavRelayoutInterval == undefined)
   {
      _root.__zhGameplayNavRelayoutTicks = 0;
      _root.__zhGameplayNavRelayoutTick = function()
      {
         _root.__zhGameplayNavRelayoutTicks = Number(_root.__zhGameplayNavRelayoutTicks) + 1;
         if(_root.layoutFramelessGameplayNav != undefined)
         {
            _root.layoutFramelessGameplayNav(true);
         }
         if(_root.__zhGameplayNavRelayoutTicks > 40)
         {
            clearInterval(_root.__zhGameplayNavRelayoutInterval);
            _root.__zhGameplayNavRelayoutInterval = undefined;
         }
      };
      _root.__zhGameplayNavRelayoutInterval = setInterval(_root,"__zhGameplayNavRelayoutTick",250);
   }
}`,
    "gameplay frameless gameplay nav init"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    `btnPause._x = 14;
btnPause._y = 14;
btnPause.onRollOver = _root.useArrow;`,
    `btnPause._x = 14;
btnPause._y = 14;
if(_root != undefined && zhHideLegacyPauseChrome != undefined)
{
   zhHideLegacyPauseChrome();
}
btnPause.onRollOver = _root.useArrow;`,
    "gameplay hide legacy pause button after attach"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    "      navBar.savingGame.play();",
    `      if(zhSuppressSavingGame != undefined)
      {
         zhSuppressSavingGame();
      }
      else if(navBar.savingGame != undefined)
      {
         navBar.savingGame.stop();
         navBar.savingGame._visible = false;
         navBar.savingGame._alpha = 0;
      }`,
    "gameplay suppress saving status"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    `   popupClose._visible = false;
   createEmptyMovieClip("popupClip",popupDepth);
   popupClip.loadMovie("popups/inventory.swf");`,
   `   popupClose._visible = false;
   zhShowPopupBackdrop("inventory.swf");
   createEmptyMovieClip("popupClip",popupDepth);
   popupClip.loadMovie("popups/inventory.swf");
   zhRaisePopupLayers();
   zhRefreshPopupCloseHit();`,
    "gameplay inventory popup backdrop"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    `   popupBack._visible = false;
}
function popup(popupName, showBack, btnCloseOnTop, hideBtnClose)`,
    `   popupBack._visible = false;
   zhHidePopupBackdrop();
}
function popup(popupName, showBack, btnCloseOnTop, hideBtnClose)`,
    "gameplay inventory popup backdrop hide"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    `   if(hideBtnClose)
   {
      popupBack.btnClose._visible = false;
      popupClose._visible = false;
   }
   createEmptyMovieClip("popupClip",popupDepth);
   popupClip.loadMovie("popups/" + popupName);`,
   `   if(hideBtnClose)
   {
      popupBack.btnClose._visible = false;
      popupClose._visible = false;
   }
   zhInstallPopupCloseHandlers();
   zhShowPopupBackdrop(popupName);
   zhInstallPopupCloseHandlers();
   createEmptyMovieClip("popupClip",popupDepth);
   popupClip.loadMovie("popups/" + popupName);
   zhStartTightPopupFitWatchdog(popupName);
   zhRaisePopupLayers();
   zhRefreshPopupCloseHit();`,
    "gameplay popup backdrop"
  );

  nextContent = replaceRequiredSnippet(
    nextContent,
    `   popupBack._visible = false;
   popupClose._visible = false;
   _level0.ads_mc._ad1._visible = true;`,
    `   popupBack._visible = false;
   popupClose._visible = false;
   zhHidePopupBackdrop();
   _level0.ads_mc._ad1._visible = true;`,
    "gameplay popup backdrop hide"
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
   if(_root != undefined && zhEnsureDirectMapButton != undefined)
   {
      zhEnsureDirectMapButton();
   }
   if(_root != undefined && zhInstallExternalMapBridge != undefined)
   {
      zhInstallExternalMapBridge();
   }
   if(_root != undefined && layoutFramelessGameplayNav != undefined)
   {
      layoutFramelessGameplayNav(true);
   }
   if(_root != undefined && zhHideLegacyPauseChrome != undefined)
   {
      zhHideLegacyPauseChrome();
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
   var _loc10_ = clickX - sceneRef._x;
   var _loc11_ = clickY - sceneRef._y;
   for(var _loc9_ in sceneRef)
   {
      _loc2_ = sceneRef[_loc9_];
      if(_loc2_ != undefined && _loc2_ != sceneRef.char && _loc2_.interaction != undefined && _loc2_.interaction != "none" && _loc2_.isObject != true)
      {
         if(_loc2_._visible != false && _loc2_.hitTest != undefined && (_loc2_.hitTest(_root._xmouse,_root._ymouse,true) || _loc2_.hitTest(_root._xmouse,_root._ymouse,false)))
         {
            return _loc2_;
         }
      }
   }
   return _loc7_;
}
function zhCanTriggerNativeDialogue(targetPlayer)
{
   var _loc1_ = getTimer();
   if(targetPlayer == undefined || camera == undefined || camera.scene == undefined || camera.scene.char == undefined)
   {
      return false;
   }
   if(_root.__zhDialogueGateUntil != undefined && _loc1_ < _root.__zhDialogueGateUntil)
   {
      return false;
   }
   if(targetPlayer.__zhLastDialogueAt != undefined && _loc1_ - targetPlayer.__zhLastDialogueAt < 3500)
   {
      return false;
   }
   if(targetPlayer.talking == true || camera.scene.char.talking == true)
   {
      return false;
   }
   if(targetPlayer.sayDepth != undefined && _root["say" + targetPlayer.sayDepth] != undefined)
   {
      return false;
   }
   if(camera.scene.char.sayDepth != undefined && _root["say" + camera.scene.char.sayDepth] != undefined)
   {
      return false;
   }
   return true;
}
function zhMarkNativeDialogueTriggered(targetPlayer)
{
   var _loc1_ = getTimer();
   _root.__zhDialogueGateUntil = _loc1_ + 2800;
   if(targetPlayer != undefined)
   {
      targetPlayer.__zhLastDialogueAt = _loc1_;
   }
}
function zhTriggerNativeDialogue(targetPlayer)
{
   if(targetPlayer == undefined || camera == undefined || camera.scene == undefined || camera.scene.char == undefined)
   {
      return false;
   }
   if(!zhCanTriggerNativeDialogue(targetPlayer))
   {
      return false;
   }
   if(targetPlayer.interaction == "phrase" && targetPlayer.talkyText != undefined)
   {
      zhMarkNativeDialogueTriggered(targetPlayer);
      camera.scene.char.mouseFollow = false;
      camera.scene.char.targetPlayer = targetPlayer;
      targetPlayer.engaged = true;
      targetPlayer.targeted = true;
      hideChat();
      hideSay(camera.scene.char);
      hideSay(targetPlayer);
      responding = true;
      showSay(targetPlayer,targetPlayer.talkyText);
      return true;
   }
   if(targetPlayer.interaction == "chat")
   {
      zhMarkNativeDialogueTriggered(targetPlayer);
      camera.scene.char.mouseFollow = false;
      camera.scene.char.targetPlayer = targetPlayer;
      targetPlayer.engaged = true;
      targetPlayer.targeted = true;
      hideSay(camera.scene.char);
      hideSay(targetPlayer);
      hideChat();
      showChat(camera.scene.char);
      loadChat(targetPlayer);
      return true;
   }
   return false;
}
function zhTriggerNearbyNativeDialogueFromMouse()
{
   if(camera == undefined || camera.scene == undefined)
   {
      return false;
   }
   var _loc1_ = zhFindNearbyInteractiveChar(camera.scene,camera.scene._xmouse,camera.scene._ymouse);
   if(_loc1_ == undefined)
   {
      return false;
   }
   return zhTriggerNativeDialogue(_loc1_);
}
camera.scene.bg.onPress = function()
{
   if(_root.__zhMapSuppressBgUntil != undefined && getTimer() < _root.__zhMapSuppressBgUntil)
   {
      return undefined;
   }
   if(_root.__zhPopupHudHidden == true || zhPopupLooksOpen())
   {
      zhHideDirectMapButton();
      loadVariablesNum("/brain/track.php?cluster=QA&scene=Gameplay&event=zhBgMapBoundsBlockedByPopup",0);
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
    `   if(camera.scene.common)
   {
      pointer.gotoAndStop("target");
   }
   else
   {
      pointer.gotoAndStop("directional");
   }
   if(camera.scene.common)
   {`,
    `   if(camera.scene.common)
   {
      pointer.gotoAndStop("target");
   }
   else
   {
      pointer.gotoAndStop("directional");
   }
   var _loc3_ = zhFindNearbyInteractiveChar(camera.scene,camera.scene._xmouse,camera.scene._ymouse);
   if(_loc3_ != undefined)
   {
      if(zhTriggerNativeDialogue(_loc3_))
      {
         return undefined;
      }
      if(_loc3_.onPress != undefined)
      {
         _loc3_.onPress();
         return undefined;
      }
   }
   if(camera.scene.common)
   {`,
    "gameplay frame_9 nearby npc reroute before common check"
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
         if(_loc1_ != undefined)
         {
            if(zhTriggerNativeDialogue(_loc1_))
            {
               return undefined;
            }
            if(_loc1_.onPress != undefined)
            {
               _loc1_.onPress();
               return undefined;
            }
         }
         else
         {
            camera.scene.char.clickTarget(camera.scene._xmouse,camera.scene._ymouse);
         }
      }`,
    "gameplay frame_9 nearby npc reroute"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `onMouseUp = function()
{
   pointer.directional._alpha = 50;
   pointer.target._alpha = 50;
   camera.scene.char.mouseFollow = false;
};`,
    `onMouseUp = function()
{
   pointer.directional._alpha = 50;
   pointer.target._alpha = 50;
   camera.scene.char.mouseFollow = false;
};`,
    "gameplay frame_9 nearby npc mouseup fallback"
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
      var _loc4_ = 1400;
      var _loc5_ = 14;
      var _loc6_ = 3;
      var _loc7_ = 22;
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
      if(_root != undefined && _root.zhHideLegacyPauseChrome != undefined)
      {
         _root.zhHideLegacyPauseChrome();
      }
   }
   function applyGameplayViewportChrome(pSectionName)
   {
      var _loc2_ = pSectionName == "gameplay";
      var _loc3_ = _loc2_;
      if(this._bg_mc != undefined)
      {
         this._bg_mc._visible = !_loc2_;
      }
      if(this._adWrapperView != undefined && this._adWrapperView.content_mc != undefined)
      {
         this._adWrapperView.content_mc._visible = !_loc3_;
      }
      if(this._nav_mc != undefined)
      {
         this._nav_mc._visible = !_loc2_;
         this._nav_mc._alpha = _loc2_ ? 0 : 100;
         this._nav_mc.enabled = !_loc2_;
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

function applyAs2FrameworkGameplayCacheBustPatch(content) {
  let nextContent = normalizeScriptContent(content);
  if (nextContent.includes("flashpointQaGameplayUrl") && /_loc3_\.gameplay_url = _loc\d+_;/u.test(nextContent)) {
    return nextContent;
  }
  const queryBustPattern = /      var (_loc\d+_) = "";\n      if\(this\._rt_target\.flashpointQaCacheBust != undefined && String\(this\._rt_target\.flashpointQaCacheBust\) != ""\)\n      \{\n         \1 = "\?flashpointQaCacheBust=" \+ String\(this\._rt_target\.flashpointQaCacheBust\);\n      \}\n      _loc3_\.gameplay_url = "gameplay\.swf" \+ \1;/u;
  const aliasBlock = (localName) => [
    `      var ${localName} = "gameplay.swf";`,
    '      if(this._rt_target.flashpointQaGameplayUrl != undefined && String(this._rt_target.flashpointQaGameplayUrl) != "")',
    "      {",
    `         ${localName} = String(this._rt_target.flashpointQaGameplayUrl);`,
    "      }",
    `      _loc3_.gameplay_url = ${localName};`
  ].join("\n");
  const queryMatch = nextContent.match(queryBustPattern);
  if (queryMatch) {
    return nextContent.replace(queryBustPattern, aliasBlock(queryMatch[1]));
  }
  nextContent = replaceRequiredSnippet(
    nextContent,
    `      _loc3_.gameplay_url = "gameplay.swf";`,
    aliasBlock("_loc8_"),
    "framework gameplay URL QA alias"
  );
  return nextContent;
}

function applyAs2BasePageMinimalPatch(content) {
  let nextContent = normalizeScriptContent(content);
  if (!nextContent.includes("function flashpoint_audio_sanitize(")) {
    nextContent = nextContent.replace(
      "<!doctype html>",
      `<?php
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

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
  const primaryEmbedPattern = /<embed id="game" scale="noscale" wmode="(?:direct|gpu|window|opaque)"(?: allowScriptAccess="always")? menu="false" bgcolor="[0-9a-fA-F]{6}" hidden>/u;
  if (!primaryEmbedPattern.test(nextContent)) {
    throw new Error("Unable to locate base.php primary embed wmode");
  }
  nextContent = nextContent.replace(
    primaryEmbedPattern,
    `<div id="gameViewport"><div id="gameScaleHost"><embed id="game" scale="noscale" wmode="opaque" allowScriptAccess="always" menu="false" bgcolor="111827" hidden></div></div>
        <div id="flashpointMapHotspot" hidden aria-hidden="true"></div>
        <div id="flashpointMapResetHotspot" hidden aria-hidden="true"></div>
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

body { background-color: #111827; }

embed { background-color: #111827; }

#gameViewport {
    position: absolute;
    overflow: hidden;
    background: #111827;
}

#gameScaleHost {
    position: absolute;
    overflow: hidden;
    transform-origin: top left;
}

#flashpointMapHotspot,
#flashpointMapResetHotspot {
    position: absolute;
    z-index: 3;
    background: rgba(0, 0, 0, 0);
    cursor: pointer;
    touch-action: none;
}

#flashpointMapHotspot[hidden],
#flashpointMapResetHotspot[hidden] {
    display: none;
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
      gameScaleHost = document.getElementById("gameScaleHost"),
      game = document.getElementById("game"),
      flashpointMapHotspot = document.getElementById("flashpointMapHotspot"),
      flashpointMapResetHotspot = document.getElementById("flashpointMapResetHotspot"),
      sceneAudio = document.getElementById("flashpointSceneAudio"),
      sceneAudioOverrides = <?php echo json_encode(flashpoint_collect_audio_overrides()); ?>,
      errorText = document.getElementById("errorText"),
      lsKey = "lastScene",
      qaAudioMuteKey = "flashpointQaMuteAudio",
      as2SoundEffectPool = [],
      AS2_SOUND_EFFECT_POOL_LIMIT = 8,
      MAP_HOTSPOT = { x: 785, y: 70, width: 95, height: 90 },
      MAP_RESET_HOTSPOT = { x: 155, y: 462, width: 120, height: 105 },
      POPUP_VIEWPORT = { x: 0, y: 0, width: 640, height: 480 },
      MAP_POPUP_VIEWPORT = { x: 0, y: 0, width: 1000, height: 580 },
      STANDARD_GAMEPLAY_VIEWPORT = { x: 0, y: 0, width: 1000, height: 580 },
      TIME_TANGLED_GAMEPLAY_LAYOUT = {
          baseWidth: 1182,
          baseHeight: 645,
          viewport: { x: 186, y: 0, width: 996, height: 580 }
      };
let viewportResizeReloadTimer = 0,
    viewportResizeLastSize = null;`,
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
initMapHotspotBridge();
initMapResetHotspotBridge();
window.addEventListener("resize", () => {
    scheduleResizeRecoveryReload();
    applyCurrentViewport();
});
window.addEventListener("keydown", handleViewportRecoveryKey, true);

function main() {
    const params = getInput();
    flashpointLoad(params.island, params.room, params.startup_path);
}

function resolveGameplayViewportCrop(island, scene, gameState) {
    if(gameState === "return_user_standard" && game && game.__zhAs2PopupMode === "map")
        return MAP_POPUP_VIEWPORT;
    if(gameState === "return_user_standard" && game && game.__zhAs2PopupMode)
        return POPUP_VIEWPORT;
    if(gameState === "return_user_standard") {
        const qaViewport = resolveQaGameplayViewportCrop();
        if(qaViewport)
            return qaViewport;
        const layoutOverride = resolveGameplayLayoutOverride(island, scene);
        if(layoutOverride && layoutOverride.viewport)
            return layoutOverride.viewport;
        return STANDARD_GAMEPLAY_VIEWPORT;
    }
    return null;
}

function resolveGameplayLayoutOverride(island, scene) {
    const islandKey = String(island || "").toLowerCase();
    if(islandKey === "time")
        return TIME_TANGLED_GAMEPLAY_LAYOUT;
    return null;
}

function resolveQaGameplayViewportCrop() {
    const input = getInput();
    if(input.flashpointQaCacheBust === undefined)
        return null;
    if(input.flashpointQaViewportX === undefined && input.flashpointQaViewportY === undefined && input.flashpointQaViewportWidth === undefined && input.flashpointQaViewportHeight === undefined)
        return null;

    const x = Number(input.flashpointQaViewportX || 0),
          y = Number(input.flashpointQaViewportY || 0),
          width = Number(input.flashpointQaViewportWidth || STANDARD_GAMEPLAY_VIEWPORT.width),
          height = Number(input.flashpointQaViewportHeight || STANDARD_GAMEPLAY_VIEWPORT.height);
    if(!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height) || width < 320 || height < 240)
        return null;
    return { x, y, width, height };
}

function resolveQaGameplayBaseSize(width, height, gameState) {
    const input = getInput();
    if(gameState !== "return_user_standard" || input.flashpointQaCacheBust === undefined)
        return { width, height };

    const qaWidth = Number(input.flashpointQaBaseWidth || input.flashpointQaStageWidth || 0),
          qaHeight = Number(input.flashpointQaBaseHeight || input.flashpointQaStageHeight || 0);
    return {
        width: isFinite(qaWidth) && qaWidth >= width && qaWidth <= 1800 ? Math.round(qaWidth) : width,
        height: isFinite(qaHeight) && qaHeight >= height && qaHeight <= 1200 ? Math.round(qaHeight) : height
    };
}

function resolveGameplayBaseSize(width, height, gameState, island, scene) {
    if(gameState === "return_user_standard") {
        const layoutOverride = resolveGameplayLayoutOverride(island, scene);
        if(layoutOverride) {
            width = Math.max(width, Number(layoutOverride.baseWidth) || width);
            height = Math.max(height, Number(layoutOverride.baseHeight) || height);
        }
    }
    return resolveQaGameplayBaseSize(width, height, gameState);
}

function flashpointSetAs2PopupMode(active) {
    if(!game)
        return false;

    const activeMode = String(active).toLowerCase();
    const nextPopupMode = activeMode === "map" ? "map" : (String(active) === "1" || active === true || activeMode === "true");
    game.__zhAs2PopupMode = nextPopupMode;
    if(game.__zhViewportState) {
        game.__zhViewportState.viewportCrop = resolveGameplayViewportCrop(
            game.__zhViewportState.island,
            game.__zhViewportState.scene,
            game.__zhViewportState.gameState
        );
    }
    applyCurrentViewport();
    if(!nextPopupMode)
        scheduleAs2PopupViewportRecovery();
    return true;
}

function scheduleAs2PopupViewportRecovery() {
    [ 50, 150, 350, 800, 1500 ].forEach(function(delayMs) {
        setTimeout(function() {
            if(game && !game.__zhAs2PopupMode)
                applyCurrentViewport();
        }, delayMs);
    });
}

function initMapHotspotBridge() {
    if(!flashpointMapHotspot)
        return;

    const requestHandler = function(event) {
        if(event) {
            event.preventDefault();
            event.stopPropagation();
        }
        requestFlashMapOpen();
    };
    flashpointMapHotspot.addEventListener("mousedown", requestHandler, true);
    flashpointMapHotspot.addEventListener("click", requestHandler, true);
    flashpointMapHotspot.addEventListener("touchstart", requestHandler, { capture: true, passive: false });
}

function requestFlashMapOpen() {
    if(!game || !flashpointMapHotspot)
        return false;

    const now = Date.now();
    if(flashpointMapHotspot.__zhLastRequestAt && now - flashpointMapHotspot.__zhLastRequestAt < 450)
        return true;
    flashpointMapHotspot.__zhLastRequestAt = now;

    try {
        if(typeof game.flashpointOpenMap === "function") {
            game.flashpointOpenMap();
            return true;
        }
    } catch(err) { }

    try {
        if(typeof game.SetVariable === "function") {
            const token = String(now);
            game.SetVariable("__zhExternalMapRequest", token);
            game.SetVariable("_root.__zhExternalMapRequest", token);
            game.SetVariable("_level0.__zhExternalMapRequest", token);
            return true;
        }
    } catch(err) { }
    return false;
}

function initMapResetHotspotBridge() {
    if(!flashpointMapResetHotspot)
        return;

    const requestHandler = function(event) {
        if(event) {
            event.preventDefault();
            event.stopPropagation();
        }
        requestFlashMapResetDialog();
    };
    flashpointMapResetHotspot.addEventListener("mousedown", requestHandler, true);
    flashpointMapResetHotspot.addEventListener("click", requestHandler, true);
    flashpointMapResetHotspot.addEventListener("touchstart", requestHandler, { capture: true, passive: false });
}

function requestFlashMapResetDialog() {
    if(!game || !flashpointMapResetHotspot)
        return false;

    const now = Date.now();
    if(flashpointMapResetHotspot.__zhLastRequestAt && now - flashpointMapResetHotspot.__zhLastRequestAt < 450)
        return true;
    flashpointMapResetHotspot.__zhLastRequestAt = now;

    try {
        if(typeof game.SetVariable === "function") {
            const token = String(now);
            game.SetVariable("__zhExternalMapResetRequest", token);
            game.SetVariable("_root.__zhExternalMapResetRequest", token);
            game.SetVariable("_level0.__zhExternalMapResetRequest", token);
            return true;
        }
    } catch(err) { }
    return false;
}

function applyMapHotspot(viewport, gameState) {
    if(!flashpointMapHotspot)
        return;

    if(gameState !== "return_user_standard" || game.__zhAs2PopupMode) {
        flashpointMapHotspot.hidden = true;
        return;
    }

    const scale = viewport.useViewportCrop ? viewport.viewportScale : 1;
    const anchorLeft = viewport.useViewportCrop ? viewport.contentOffsetLeft : viewport.offsetLeft;
    const anchorTop = viewport.useViewportCrop ? viewport.contentOffsetTop : viewport.offsetTop;
    flashpointMapHotspot.hidden = false;
    flashpointMapHotspot.style.left = \`\${ anchorLeft + (MAP_HOTSPOT.x - viewport.cropLeft) * scale }px\`;
    flashpointMapHotspot.style.top = \`\${ anchorTop + (MAP_HOTSPOT.y - viewport.cropTop) * scale }px\`;
    flashpointMapHotspot.style.width = \`\${ MAP_HOTSPOT.width * scale }px\`;
    flashpointMapHotspot.style.height = \`\${ MAP_HOTSPOT.height * scale }px\`;
}

function applyMapResetHotspot(viewport, gameState) {
    if(!flashpointMapResetHotspot)
        return;

    if(gameState !== "return_user_standard" || !game.__zhAs2PopupMode || String(game.__zhAs2PopupMode).toLowerCase() !== "map") {
        flashpointMapResetHotspot.hidden = true;
        return;
    }

    const scale = viewport.useViewportCrop ? viewport.viewportScale : 1;
    const anchorLeft = viewport.useViewportCrop ? viewport.contentOffsetLeft : viewport.offsetLeft;
    const anchorTop = viewport.useViewportCrop ? viewport.contentOffsetTop : viewport.offsetTop;
    flashpointMapResetHotspot.hidden = false;
    flashpointMapResetHotspot.style.left = \`\${ anchorLeft + (MAP_RESET_HOTSPOT.x - viewport.cropLeft) * scale }px\`;
    flashpointMapResetHotspot.style.top = \`\${ anchorTop + (MAP_RESET_HOTSPOT.y - viewport.cropTop) * scale }px\`;
    flashpointMapResetHotspot.style.width = \`\${ MAP_RESET_HOTSPOT.width * scale }px\`;
    flashpointMapResetHotspot.style.height = \`\${ MAP_RESET_HOTSPOT.height * scale }px\`;
}

function computeScaledViewport(baseWidth, baseHeight, gameState, viewportCrop) {
    const crop = viewportCrop || { x: 0, y: 0, width: baseWidth, height: baseHeight };
    const browserViewport = stableBrowserViewportSize();
    let displayWidth = baseWidth;
    let displayHeight = baseHeight;
    let viewportWidth = baseWidth;
    let viewportHeight = baseHeight;
    let offsetLeft = 0;
    let offsetTop = 0;
    let contentOffsetLeft = 0;
    let contentOffsetTop = 0;
    let viewportScale = 1;
    let cropLeft = 0;
    let cropTop = 0;
    let useViewportCrop = false;

    if(gameState === "return_user_standard") {
        viewportScale = Math.max(0.25, Math.min(browserViewport.width / crop.width, browserViewport.height / crop.height));
        displayWidth = baseWidth;
        displayHeight = baseHeight;
        viewportWidth = Math.max(1, browserViewport.width);
        viewportHeight = Math.max(1, browserViewport.height);
        contentOffsetLeft = Math.max(0, Math.round((browserViewport.width - crop.width * viewportScale) / 2));
        contentOffsetTop = Math.max(0, Math.round((browserViewport.height - crop.height * viewportScale) / 2));
        cropLeft = crop.x;
        cropTop = crop.y;
        useViewportCrop = true;
    }

    return { displayWidth, displayHeight, viewportWidth, viewportHeight, offsetLeft, offsetTop, contentOffsetLeft, contentOffsetTop, viewportScale, cropLeft, cropTop, useViewportCrop, cropWidth: crop.width, cropHeight: crop.height };
}

function stableBrowserViewportSize() {
    const widthCandidates = [
        window.innerWidth,
        document.documentElement ? document.documentElement.clientWidth : 0,
        document.body ? document.body.clientWidth : 0,
        window.outerWidth ? window.outerWidth - 12 : 0
    ].map(Number).filter(function(value) { return isFinite(value) && value > 0; });
    const heightCandidates = [
        window.innerHeight,
        document.documentElement ? document.documentElement.clientHeight : 0,
        document.body ? document.body.clientHeight : 0,
        window.outerHeight ? window.outerHeight - 140 : 0
    ].map(Number).filter(function(value) { return isFinite(value) && value > 0; });
    return {
        width: Math.max(1, Math.round(Math.max.apply(Math, widthCandidates.length ? widthCandidates : [ window.innerWidth || 1 ]))),
        height: Math.max(1, Math.round(Math.max.apply(Math, heightCandidates.length ? heightCandidates : [ window.innerHeight || 1 ])))
    };
}

function scheduleResizeRecoveryReload() {
    const size = stableBrowserViewportSize();
    const state = game.__zhViewportState;
    if(!state || state.gameState !== "return_user_standard") {
        viewportResizeLastSize = size;
        return;
    }
    if(!viewportResizeLastSize) {
        viewportResizeLastSize = size;
        return;
    }
    const shrank = viewportResizeLastSize.width - size.width > 80 || viewportResizeLastSize.height - size.height > 80;
    viewportResizeLastSize = size;
    if(!shrank)
        return;
    if(viewportResizeReloadTimer)
        clearTimeout(viewportResizeReloadTimer);
    viewportResizeReloadTimer = setTimeout(reloadAfterViewportShrink, 900);
}

function reloadAfterViewportShrink() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete("flashpointQaLoadingHoldMs");
        url.searchParams.set("flashpointResizeReload", String(Date.now()));
        window.location.replace(url.toString());
    } catch(err) {
        window.location.reload();
    }
}

function handleViewportRecoveryKey(event) {
    const key = String(event && event.key || "").toUpperCase();
    const code = Number(event && (event.keyCode || event.which) || 0);
    if(key !== "F11" && code !== 122)
        return;
    if(viewportResizeReloadTimer)
        clearTimeout(viewportResizeReloadTimer);
    viewportResizeReloadTimer = setTimeout(reloadAfterViewportShrink, 3000);
}

function applyGameViewport(viewport, gameState) {
    document.documentElement.style.width = \`\${ viewport.viewportWidth }px\`;
    document.documentElement.style.height = \`\${ viewport.viewportHeight }px\`;
    document.body.style.width = \`\${ viewport.viewportWidth }px\`;
    document.body.style.height = \`\${ viewport.viewportHeight }px\`;
    game.setAttribute("scale", "noscale");
    game.width = viewport.displayWidth;
    game.height = viewport.displayHeight;
    game.setAttribute("width", String(viewport.displayWidth));
    game.setAttribute("height", String(viewport.displayHeight));
    game.style.width = \`\${ viewport.displayWidth }px\`;
    game.style.height = \`\${ viewport.displayHeight }px\`;
    if(gameState === "return_user_standard") {
        gameViewport.style.width = \`\${ viewport.viewportWidth }px\`;
        gameViewport.style.height = \`\${ viewport.viewportHeight }px\`;
        gameViewport.style.left = \`\${ viewport.offsetLeft }px\`;
        gameViewport.style.top = \`\${ viewport.offsetTop }px\`;
        gameViewport.style.transform = "";
        gameScaleHost.style.width = \`\${ viewport.cropWidth }px\`;
        gameScaleHost.style.height = \`\${ viewport.cropHeight }px\`;
        gameScaleHost.style.left = \`\${ viewport.contentOffsetLeft }px\`;
        gameScaleHost.style.top = \`\${ viewport.contentOffsetTop }px\`;
        gameScaleHost.style.transform = \`scale(\${ viewport.viewportScale })\`;
        game.style.left = \`-\${ viewport.cropLeft }px\`;
        game.style.top = \`-\${ viewport.cropTop }px\`;
    } else {
        gameViewport.style.width = \`\${ viewport.displayWidth }px\`;
        gameViewport.style.height = \`\${ viewport.displayHeight }px\`;
        gameViewport.style.left = \`calc(50vw - \${ viewport.displayWidth }px / 2)\`;
        gameViewport.style.top = \`calc(50vh - \${ viewport.displayHeight }px / 2)\`;
        gameViewport.style.transform = "";
        gameScaleHost.style.width = \`\${ viewport.displayWidth }px\`;
        gameScaleHost.style.height = \`\${ viewport.displayHeight }px\`;
        gameScaleHost.style.left = "0px";
        gameScaleHost.style.top = "0px";
        gameScaleHost.style.transform = "";
        game.style.left = "0px";
        game.style.top = "0px";
    }
    applyMapHotspot(viewport, gameState);
    applyMapResetHotspot(viewport, gameState);
    viewportResizeLastSize = stableBrowserViewportSize();
}

function applyCurrentViewport() {
    if(!game.__zhViewportState)
        return;

    game.__zhViewportState.viewportCrop = resolveGameplayViewportCrop(
        game.__zhViewportState.island,
        game.__zhViewportState.scene,
        game.__zhViewportState.gameState
    );
    const viewport = computeScaledViewport(
        game.__zhViewportState.baseWidth,
        game.__zhViewportState.baseHeight,
        game.__zhViewportState.gameState,
        game.__zhViewportState.viewportCrop
    );
    applyGameViewport(viewport, game.__zhViewportState.gameState);
}

function refreshCurrentViewport() {
    scheduleResizeRecoveryReload();
    applyCurrentViewport();
}

function scheduleViewportRefreshes() {
    [ 50, 150, 350, 800, 1500, 3000, 6000, 9000, 12000, 16000, 22000, 30000, 45000 ].forEach(function(delayMs) {
        setTimeout(refreshCurrentViewport, delayMs);
    });
    if(!scheduleViewportRefreshes.intervalId)
        scheduleViewportRefreshes.intervalId = setInterval(refreshCurrentViewport, 2000);
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

function isEnabledFlag(value) {
    return /^(1|true|yes|y|muted)$/i.test(String(value || ""));
}

function resolveQaAudioMuted() {
    const input = getInput(),
          explicitValue = input.flashpointQaMuteAudio !== undefined ? input.flashpointQaMuteAudio : input.flashpoint_mute_audio;

    if(explicitValue !== undefined) {
        const muted = isEnabledFlag(explicitValue);
        try {
            sessionStorage.setItem(qaAudioMuteKey, muted ? "1" : "0");
            localStorage.setItem(qaAudioMuteKey, muted ? "1" : "0");
        } catch(err) { }
        return muted;
    }

    try {
        return isEnabledFlag(sessionStorage.getItem(qaAudioMuteKey) || localStorage.getItem(qaAudioMuteKey));
    } catch(err) {
        return false;
    }
}

function applyQaAudioMute(audioElement, audibleVolume) {
    const muted = resolveQaAudioMuted();
    audioElement.muted = muted;
    audioElement.volume = muted ? 0 : audibleVolume;
    return muted;
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
        applyQaAudioMute(soundAudio, 0.55);
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
window.flashpointSetAs2PopupMode = flashpointSetAs2PopupMode;

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
                  "_global/" + sceneKey
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
        applyQaAudioMute(sceneAudio, 0.35);
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

function resolveSwfStateUrl(url) {
    const inputParams = getInput();
    if(url === "/framework.swf" && inputParams.flashpointQaCacheBust !== undefined) {
        const separator = url.indexOf("?") >= 0 ? "&" : "?";
        return url + separator + "flashpointQaCacheBust=" + encodeURIComponent(inputParams.flashpointQaCacheBust);
    }
    return url;
}

function flashpointLoad(island, scene, path = PATH_DEFAULT) {`,
    "base page audio override helpers"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `    flashVars.set("startup_path", path);
    flashVars.set("state", gameState);

    if(getCharLazyLoadStatus()) {`,
    `    flashVars.set("startup_path", path);
    flashVars.set("state", gameState);
    const inputParams = getInput();
    if(inputParams.flashpointQaCacheBust !== undefined) {
        flashVars.set("flashpointQaCacheBust", inputParams.flashpointQaCacheBust);
        flashVars.set("flashpointQaGameplayUrl", "gameplay-zh.swf");
    }
    if(inputParams.flashpoint_auto_open_map_after_ms !== undefined)
        flashVars.set("flashpoint_auto_open_map_after_ms", inputParams.flashpoint_auto_open_map_after_ms);
    if(inputParams.flashpointQaAs2Dialog !== undefined)
        flashVars.set("flashpointQaAs2Dialog", inputParams.flashpointQaAs2Dialog);
    if(inputParams.flashpointQaAs2Popup !== undefined)
        flashVars.set("flashpointQaAs2Popup", inputParams.flashpointQaAs2Popup);
    if(inputParams.flashpointQaLoadingHoldMs !== undefined)
        flashVars.set("flashpointQaLoadingHoldMs", inputParams.flashpointQaLoadingHoldMs);
    if(inputParams.flashpointQaHideHud !== undefined)
        flashVars.set("flashpointQaHideHud", inputParams.flashpointQaHideHud);
    if(inputParams.flashpointQaStartX !== undefined)
        flashVars.set("flashpointQaStartX", inputParams.flashpointQaStartX);
    if(inputParams.flashpointQaStartY !== undefined)
        flashVars.set("flashpointQaStartY", inputParams.flashpointQaStartY);

    game.__zhAs2PopupMode = false;
    if(getCharLazyLoadStatus()) {`,
    "base page QA map flashvar passthrough"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `    game.width = width;
    game.height = height;
    game.style.left = \`calc(50vw - \${ width }px / 2)\`;
    game.style.top = \`calc(50vh - \${ height }px / 2)\`;
    game.setAttribute("flashvars", flashVars);`,
    `    const gameplayBaseSize = resolveGameplayBaseSize(width, height, gameState, island, scene);
    width = gameplayBaseSize.width;
    height = gameplayBaseSize.height;

    const viewportCrop = resolveGameplayViewportCrop(island, scene, gameState);
    const viewport = computeScaledViewport(width, height, gameState, viewportCrop);
    game.__zhViewportState = { baseWidth: width, baseHeight: height, gameState, viewportCrop, island, scene, path };
    applyGameViewport(viewport, gameState);
    scheduleViewportRefreshes();
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
  nextContent = replaceRequiredSnippet(
    nextContent,
    `    if(pageState === STATE_FP_START)
        loadFPStart(SWF_STATES[pageState]);
    else {
        if(pageState === STATE_SCENE)
            sceneChange(island, scene);

        game.src = SWF_STATES[pageState];
    }`,
    `    if(pageState === STATE_FP_START)
        loadFPStart(resolveSwfStateUrl(SWF_STATES[pageState]));
    else {
        if(pageState === STATE_SCENE)
            sceneChange(island, scene);

        game.src = resolveSwfStateUrl(SWF_STATES[pageState]);
    }`,
    "base page framework cache bust"
  );
  nextContent = replaceRequiredSnippet(
    nextContent,
    `    window.flashpointLoad = function() {
        game.src = SWF_STATES[STATE_SCENE];
        game.hidden = extraMenu.hidden = false;`,
    `    window.flashpointLoad = function() {
        game.src = resolveSwfStateUrl(SWF_STATES[STATE_SCENE]);
        game.hidden = extraMenu.hidden = false;`,
    "base page FP start framework cache bust"
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
  if (!/flashpointMapButtonLayoutApplied/iu.test(nextContent)) {
    nextContent = replaceRequiredSnippet(
      nextContent,
      `stop();
_root.useArrow();`,
      `stop();
if(resetIslandButton != undefined && !resetIslandButton.flashpointMapButtonLayoutApplied)
{
   resetIslandButton.flashpointMapButtonLayoutApplied = true;
   resetIslandButton._y -= 34;
}
_root.useArrow();`
    );
  }
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
      const startupCommandTargetScript = ensureTranslatedScriptFromSource({
        sourceScriptRoot: frameworkScriptRoot,
        translatedScriptRoot: frameworkPatchRoot,
        exportPath: path.join("scripts", "__Packages", "com", "poptropica", "controllers", "commands", "StartUpCommand.as")
      });
      writeText(startupCommandTargetScript, applyAs2FrameworkGameplayCacheBustPatch(fs.readFileSync(startupCommandTargetScript, "utf8")));

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

  const gameplayTextRoot = path.join(sharedTempRoot, "gameplay-texts");
  const gameplayTextPatch = buildManualFormattedSwfTextPatch({
    inputSwf: gameplaySourceSwf,
    ffdecCli,
    translatedTextRoot: gameplayTextRoot,
    replacements: AS2_SHARED_GAMEPLAY_TEXT_REPLACEMENTS
  });
  if (!gameplayTextPatch.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:gameplay",
      assetPath: AS2_SUPER_POWER_GAMEPLAY_PATH,
      reason: gameplayTextPatch.error || "Unable to export gameplay.swf text"
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
  const gameplayTextOutputSwf = path.join(sharedTempRoot, "gameplay-text-pass.swf");
  let gameplayTextReplace = { ok: true };
  if ((gameplayTextPatch.translatedFiles || []).length > 0) {
    gameplayTextReplace = replaceSwfTexts({
      ffdecCli,
      inputSwf: gameplaySourceSwf,
      outputSwf: gameplayTextOutputSwf,
      translatedFiles: gameplayTextPatch.translatedFiles || [],
      fontIds: gameplayTextPatch.fontIds || [],
      fontIdsByExportPath: gameplayTextPatch.fontIdsByExportPath || new Map(),
      fontFilePath: findPreferredSwfFontFile(config),
      sequential: true
    });
  } else {
    fs.copyFileSync(gameplaySourceSwf, gameplayTextOutputSwf);
  }
  if (!gameplayTextReplace.ok) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:gameplay",
      assetPath: AS2_SUPER_POWER_GAMEPLAY_PATH,
      reason: gameplayTextReplace.error || "Unable to rebuild gameplay.swf text pass"
    });
    return;
  }

  const gameplayCloseShapeOutputSwf = path.join(sharedTempRoot, "gameplay-popup-close-shape-pass.swf");
  let gameplayCloseShapePatch = { changed: false, reason: "not-run" };
  try {
    gameplayCloseShapePatch = patchAs2PopupCloseShape({
      ffdecCli,
      inputSwf: gameplayTextOutputSwf,
      outputSwf: gameplayCloseShapeOutputSwf,
      workDir: path.join(sharedTempRoot, "gameplay-popup-close-shape")
    });
  } catch (error) {
    manifest.pendingSwfAssets.push({
      assetId: "super-power:gameplay",
      assetPath: AS2_SUPER_POWER_GAMEPLAY_PATH,
      reason: error?.message || "Unable to rebuild gameplay.swf popup close label shape"
    });
    return;
  }

  const gameplayReplace = replaceSwfScriptExports({
    ffdecCli,
    inputSwf: gameplayCloseShapePatch.changed ? gameplayCloseShapePatch.outputSwf : gameplayTextOutputSwf,
    outputSwf: gameplayOutputSwf,
    translatedFiles: collectSwfScriptFiles(gameplayPatchRoot)
  });
  if (fileExists(gameplayTextOutputSwf)) {
    fs.rmSync(gameplayTextOutputSwf, { force: true });
  }
  if (fileExists(gameplayCloseShapeOutputSwf)) {
    fs.rmSync(gameplayCloseShapeOutputSwf, { force: true });
  }
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
    outputPath: gameplayOutputSwf,
    popupCloseShapePatch: gameplayCloseShapePatch
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

function preserveStaticPackPaths({ outputDir, sourceGroup }) {
  if (sourceGroup !== "as2") {
    return null;
  }

  const tempRoot = path.join(paths.tempDir, `pack-static-${sourceGroup}-${process.pid}-${Date.now()}`);
  const preserved = [];
  for (const relativePath of AS2_STATIC_PACK_RELATIVE_PATHS) {
    const sourcePath = path.join(outputDir, relativePath.replace(/\//gu, path.sep));
    if (!fileExists(sourcePath)) {
      continue;
    }

    const targetPath = path.join(tempRoot, relativePath.replace(/\//gu, path.sep));
    ensureDirSync(path.dirname(targetPath));
    fs.cpSync(sourcePath, targetPath, {
      recursive: true,
      force: true,
      verbatimSymlinks: false
    });
    preserved.push(relativePath);
  }

  return { tempRoot, preserved };
}

function restoreStaticPackPaths({ outputDir, preservation }) {
  if (!preservation) {
    return;
  }

  for (const relativePath of preservation.preserved) {
    const sourcePath = path.join(preservation.tempRoot, relativePath.replace(/\//gu, path.sep));
    if (!fileExists(sourcePath)) {
      continue;
    }

    const targetPath = path.join(outputDir, relativePath.replace(/\//gu, path.sep));
    ensureDirSync(path.dirname(targetPath));
    fs.cpSync(sourcePath, targetPath, {
      recursive: true,
      force: true,
      verbatimSymlinks: false
    });
  }

  if (fileExists(preservation.tempRoot)) {
    removeDirContents(preservation.tempRoot);
    fs.rmSync(preservation.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
}

function buildPackForSourceGroup({ db, config, sourceGroup, islandIds = [], assetPatterns = [] }) {
  const { baseDir: outputDir } = getPackPaths(sourceGroup);
  ensureDirSync(outputDir);
  const staticPackPreservation = preserveStaticPackPaths({ outputDir, sourceGroup });
  removeDirContents(outputDir);
  ensureDirSync(outputDir);
  restoreStaticPackPaths({ outputDir, preservation: staticPackPreservation });
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
      if (sourceGroup === "as2" && ffdecMeta.scriptExport?.ok && sourceScriptRoot && fileExists(sourceScriptRoot)) {
        try {
          applyAs2NativeNavigationLabelScriptPatch({
            sourceScriptRoot,
            translatedScriptRoot
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
      const tempTextOutput = translatedFiles.length > 0 && finalTranslatedScriptFiles.length > 0
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
  applyFlashSafeTypography,
  applyStructuredReplacements,
  buildPackForSourceGroup,
  buildRuntimeZipForSourceGroup,
  collectRuntimeReplacementsForSourceGroup
};
