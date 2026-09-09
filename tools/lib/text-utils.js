const { hashString } = require("./fs-utils");

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/gu, " ").trim();
}

function looksTranslatable(text) {
  const value = normalizeWhitespace(text);
  if (!value) {
    return false;
  }
  if (value.length < 2 || value.length > 400) {
    return false;
  }
  if (/^(https?:\/\/|www\.|[A-Z]:\\|\/)/iu.test(value)) {
    return false;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) {
    return false;
  }
  if (/^[\d\s.,:;/%#()[\]{}<>|\\/_+=*-]+$/u.test(value)) {
    return false;
  }
  if (/^[a-z0-9_.-]+\.(swf|xml|json|zip|png|jpg|jpeg|gif|mp3|wav)$/iu.test(value)) {
    return false;
  }
  if (/^0x[0-9a-f]+$/iu.test(value) || /^#[0-9a-f]{3,8}$/iu.test(value)) {
    return false;
  }
  return /[A-Za-z]/u.test(value);
}

function normalizeSourceText(text) {
  return normalizeWhitespace(text)
    .replace(/\u2019/gu, "'")
    .replace(/\u201c|\u201d/gu, '"');
}

function sourceHasTerminalPunctuation(sourceText) {
  return /[!?.,！？。，]\s*$/u.test(normalizeSourceText(sourceText));
}

function looksLikeProtectedIdentifier(text) {
  const value = normalizeWhitespace(text);
  if (!value) {
    return false;
  }
  if (/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2,}$/u.test(value)) {
    return true;
  }
  if (/^[A-Za-z0-9_-]+(?:_[A-Za-z0-9_-]+)+$/u.test(value)) {
    return true;
  }
  if (/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/u.test(value)) {
    return true;
  }
  if (/^[A-Za-z0-9_.-]+(?:\\[A-Za-z0-9_.-]+)+$/u.test(value)) {
    return true;
  }
  return false;
}

function normalizePunctuationSpacing(text) {
  return text
    .replace(/\s+([!?.,！？。，])/gu, "$1")
    .replace(/([!?.,！？。，])(?!\s|$)/gu, "$1 ");
}

function containsCjk(text) {
  return /[\u3400-\u9fff]/u.test(String(text || ""));
}

function protectInlineSegments(text) {
  const protectedSegments = [];
  const placeholderPrefix = "\uE000ZHSEG";
  const placeholderSuffix = "\uE001";
  const pattern = /\b[A-Za-z][.。](?:\s*[A-Za-z][.。]){1,}/gu;
  const value = String(text || "").replace(pattern, (match) => {
    const index = protectedSegments.length;
    protectedSegments.push(match.replace(/。/gu, "."));
    return `${placeholderPrefix}${index}${placeholderSuffix}`;
  });
  return {
    value,
    restore: (next) => String(next || "").replace(
      new RegExp(`${placeholderPrefix}(\\d+)${placeholderSuffix}`, "gu"),
      (_match, rawIndex) => protectedSegments[Number(rawIndex)] || ""
    )
  };
}

function protectXmlEntities(text) {
  const protectedSegments = [];
  const placeholderPrefix = "\uE000ZHENT";
  const placeholderSuffix = "\uE001";
  const value = String(text || "").replace(/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/giu, (match) => {
    const index = protectedSegments.length;
    protectedSegments.push(match);
    return `${placeholderPrefix}${index}${placeholderSuffix}`;
  });
  return {
    value,
    restore: (next) => String(next || "").replace(
      new RegExp(`${placeholderPrefix}(\\d+)${placeholderSuffix}`, "gu"),
      (_match, rawIndex) => protectedSegments[Number(rawIndex)] || ""
    )
  };
}

function normalizeChinesePunctuation(text) {
  const protectedEntities = protectXmlEntities(text);
  let next = protectedEntities.value;
  next = next.replace(/(?:\s*\.\s*){3,}/gu, "……");
  next = next.replace(/!\s*\?/gu, "！？");
  next = next.replace(/\?\s*!/gu, "？！");
  next = next.replace(/([!?])(?:\s*\1){1,}/gu, (_match, mark) => (mark === "!" ? "！！" : "？？"));

  const cjk = "\u3400-\u9fff";
  const punctuationPairs = [
    [",", "，"],
    [";", "；"],
    [":", "："],
    ["!", "！"],
    ["?", "？"],
    [".", "。"]
  ];
  for (const [ascii, chinese] of punctuationPairs) {
    const escaped = ascii.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    next = next.replace(new RegExp(`([${cjk}])${escaped}`, "gu"), `$1${chinese}`);
    next = next.replace(new RegExp(`${escaped}([${cjk}])`, "gu"), `${chinese}$1`);
  }

  next = next
    .replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/gu, "$1$2")
    .replace(/([！？。，、；：])\s+([\u3400-\u9fff])/gu, "$1$2")
    .replace(/([\u3400-\u9fff])\s+([！？。，、；：])/gu, "$1$2")
    .replace(/\s+([！？。，、；：])/gu, "$1");

  return protectedEntities.restore(next).trim();
}

function adjustedFlashFontSize(size) {
  if (size >= 38) {
    return Math.max(30, size - 4);
  }
  if (size >= 28) {
    return Math.max(24, size - 2);
  }
  return size;
}

function adaptFlashTypography(text, sourceText = "") {
  let next = String(text || "");
  if (!containsCjk(next)) {
    return next;
  }

  const sourceSizes = [...String(sourceText || "").matchAll(/size\s*=\s*"(\d+)"/giu)]
    .map((match) => Number(match[1]))
    .filter((size) => Number.isFinite(size));
  let sourceSizeIndex = 0;
  const alreadyUsesCjkFont = /face\s*=\s*["']SimHei["']/iu.test(next);

  next = next.replace(/face\s*=\s*"[^"]*"/giu, 'face="SimHei"');
  next = next.replace(/face\s*=\s*'[^']*'/giu, "face='SimHei'");

  next = next.replace(/size\s*=\s*"(\d+)"/giu, (_match, rawSize) => {
    const sourceSize = sourceSizes[sourceSizeIndex++];
    const size = Number.isFinite(sourceSize) ? sourceSize : Number(rawSize);
    if (!Number.isFinite(size)) {
      return `size="${rawSize}"`;
    }
    if (sourceSizes.length === 0 && alreadyUsesCjkFont) {
      return `size="${rawSize}"`;
    }
    return `size="${adjustedFlashFontSize(size)}"`;
  });

  return next;
}

function normalizeTranslatedText(text, sourceText = "") {
  let next = normalizeWhitespace(text).replace(/\s+/gu, " ");

  if (looksLikeProtectedIdentifier(sourceText) || looksLikeProtectedIdentifier(next)) {
    return next.trim();
  }

  if (containsCjk(next)) {
    const protectedInline = protectInlineSegments(next);
    next = protectedInline.value;
    next = normalizeChinesePunctuation(next);
    if (!sourceHasTerminalPunctuation(sourceText)) {
      next = next.replace(/[。.]\s*$/u, "").trim();
    } else {
      next = next.replace(/\.\s*$/u, "。");
    }
    next = adaptFlashTypography(next, sourceText);
    return protectedInline.restore(normalizeChinesePunctuation(next));
  }

  next = next
    .replace(/\u3002/gu, ".")
    .replace(/\u2026/gu, "...");

  next = normalizePunctuationSpacing(next).trim();

  if (!sourceHasTerminalPunctuation(sourceText)) {
    next = next.replace(/[。.]\s*$/u, "").trim();
  } else {
    next = next.replace(/。\s*$/u, ".");
  }

  next = adaptFlashTypography(next, sourceText);
  return normalizePunctuationSpacing(next).trim();
}

function buildGenericKey(text) {
  return hashString(normalizeSourceText(text).toLowerCase());
}

function buildStringKey(assetId, contextKey, text) {
  return hashString(`${assetId}::${contextKey}::${normalizeSourceText(text)}`);
}

module.exports = {
  buildGenericKey,
  buildStringKey,
  containsCjk,
  looksTranslatable,
  looksLikeProtectedIdentifier,
  adaptFlashTypography,
  adjustedFlashFontSize,
  normalizeChinesePunctuation,
  normalizeSourceText,
  normalizeTranslatedText,
  normalizeWhitespace
};
