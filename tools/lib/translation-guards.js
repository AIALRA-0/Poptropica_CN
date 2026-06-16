const { looksLikeProtectedIdentifier, normalizeWhitespace } = require("./text-utils");

const PROTECTED_CONTEXT_SUFFIXES = new Set([
  "@_id",
  "@_hit",
  "@_action",
  "@_class",
  "@_compression",
  "@_data",
  "@_direction",
  "@_dna",
  "@_encoding",
  "@_ease",
  "@_event",
  "@_gender",
  "@_graphic",
  "@_link",
  "@_linkEntityId",
  "@_modifier",
  "@_modifiers",
  "@_name",
  "@_npc",
  "@_nowrap",
  "@_platform",
  "@_rootLandMap",
  "@_scene",
  "@_sides",
  "@_style",
  "@_target",
  "@_tileSet",
  "@_trigger",
  "@_triggeredByEvent",
  "@_triggerEvent",
  "@_triggerEventArgs",
  "@_type",
  "@_variant",
  "absoluteFilePaths",
  "action",
  "animation",
  "asset",
  "assets",
  "background",
  "bitmap",
  "body",
  "bottom",
  "card",
  "class",
  "clip",
  "color",
  "component",
  "condition",
  "data",
  "defaultDirection",
  "direction",
  "elementsToBitmap",
  "event",
  "eventsClass",
  "eyeState",
  "facial",
  "folder",
  "fontfamily",
  "gender",
  "gameVersion",
  "hair",
  "hairColor",
  "head",
  "hit",
  "hitChild",
  "id",
  "island",
  "islandFolder",
  "islandMain",
  "item",
  "item2",
  "layout",
  "marks",
  "medallion",
  "movieClip",
  "mouth",
  "overpants",
  "overshirt",
  "pack",
  "pageFolder",
  "pants",
  "path",
  "platform",
  "playerMap",
  "scene",
  "sceneId",
  "sceneLink",
  "sceneType",
  "shirt",
  "skin",
  "skinColor",
  "source",
  "styleId",
  "subGroup",
  "target",
  "talkMouth",
  "top",
  "type",
  "url",
  "videoId",
  "visible"
]);

const PROTECTED_LITERAL_VALUES = new Set([
  "--- RECORDSEPARATOR ---",
  "DISABLED",
  "Flash",
  "addClue",
  "default",
  "desktop",
  "down",
  "false",
  "left",
  "mobile",
  "npc",
  "platform",
  "player",
  "right",
  "thought",
  "true",
  "up",
  "utf-8",
  "utf8"
]);

function parseContext(row) {
  if (!row || typeof row.context_json !== "string") {
    return {};
  }
  try {
    return JSON.parse(row.context_json) || {};
  } catch (_error) {
    return {};
  }
}

function normalizedAssetPath(row) {
  return String(row?.asset_path || row?.assetPath || "").replace(/\\/gu, "/");
}

function contextSegments(row) {
  const context = parseContext(row);
  if (Array.isArray(context.path)) {
    return context.path.map((item) => String(item || ""));
  }
  return String(row?.context_key || row?.contextKey || "")
    .split(/[/.\\]+/u)
    .filter(Boolean);
}

function contextSuffix(row) {
  const context = parseContext(row);
  if (context.kind === "xml-attr" && context.attr) {
    return `@_${String(context.attr)}`;
  }
  const segments = contextSegments(row);
  return segments.length > 0 ? segments[segments.length - 1] : "";
}

function isFrameworkConfigRuntimeMetadata(row) {
  if (!/\/framework\/data\/config\.xml$/iu.test(normalizedAssetPath(row))) {
    return false;
  }
  return /^framework_config\/islands\/island\/\[\d+\]\/(?:name|islandMain|gameVersion|islandFolder|pages\/page\/(?:@_class|properties\/pageFolder))$/iu
    .test(String(row?.context_key || row?.contextKey || ""));
}

function looksLikeRuntimeToken(value) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return true;
  }
  if (PROTECTED_LITERAL_VALUES.has(text)) {
    return true;
  }
  if (/^(?:game|scenes|assets|entity|framework|content)\b[./\\]/iu.test(text)) {
    return true;
  }
  if (/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/u.test(text)) {
    return true;
  }
  if (/^[A-Za-z0-9_.-]+(?:\\[A-Za-z0-9_.-]+)+$/u.test(text)) {
    return true;
  }
  if (/^[A-Za-z0-9_.-]+\.(?:swf|xml|json|png|jpg|jpeg|gif|mp3|wav)$/iu.test(text)) {
    return true;
  }
  if (/^game\.scenes\.[A-Za-z0-9_.]+$/u.test(text)) {
    return true;
  }
  return looksLikeProtectedIdentifier(text);
}

function isProtectedContext(row) {
  const suffix = contextSuffix(row);
  if (PROTECTED_CONTEXT_SUFFIXES.has(suffix)) {
    return true;
  }
  const key = String(row?.context_key || row?.contextKey || "");
  return /(?:^|\/)(?:connectingSceneDoors|defaultScene|layers\/layer\/\[\d+\]\/condition|skin|label\/type|SayText\/@_type|Action\/@_type|Response\/\[\d+\]\/@_npc)(?:\/|$)/iu.test(key);
}

function isProtectedTranslationRow(row) {
  if (!row) {
    return false;
  }
  if (isFrameworkConfigRuntimeMetadata(row)) {
    return true;
  }
  if (isProtectedContext(row)) {
    return true;
  }
  if (looksLikeRuntimeToken(row.source_text || row.sourceText)) {
    return true;
  }
  return looksLikeRuntimeToken(row.source_text || row.sourceText) &&
    /\/(?:game\/data\/scenes|game\/assets\/scenes|flashpoint\/originals\/game\/data\/scenes|flashpoint\/originals\/game\/assets\/scenes)\//iu.test(normalizedAssetPath(row));
}

module.exports = {
  isProtectedTranslationRow,
  looksLikeRuntimeToken,
  normalizedAssetPath
};
