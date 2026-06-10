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

function adaptFlashTypography(text) {
  let next = String(text || "");
  if (!containsCjk(next)) {
    return next;
  }

  next = next.replace(/face\s*=\s*"[^"]*"/giu, 'face="SimHei"');
  next = next.replace(/face\s*=\s*'[^']*'/giu, "face='SimHei'");

  next = next.replace(/size\s*=\s*"(\d+)"/giu, (_match, rawSize) => {
    const size = Number(rawSize);
    if (!Number.isFinite(size)) {
      return `size="${rawSize}"`;
    }
    if (size >= 38) {
      return `size="${Math.max(30, size - 4)}"`;
    }
    if (size >= 28) {
      return `size="${Math.max(24, size - 2)}"`;
    }
    return `size="${size}"`;
  });

  return next;
}

function normalizeTranslatedText(text, sourceText = "") {
  let next = normalizeWhitespace(text)
    .replace(/\u3002/gu, ".")
    .replace(/\u2026/gu, "...")
    .replace(/\s+/gu, " ");

  if (looksLikeProtectedIdentifier(sourceText) || looksLikeProtectedIdentifier(next)) {
    return next.trim();
  }

  next = normalizePunctuationSpacing(next).trim();

  if (!sourceHasTerminalPunctuation(sourceText)) {
    next = next.replace(/[。.]\s*$/u, "").trim();
  } else {
    next = next.replace(/。\s*$/u, ".");
  }

  next = adaptFlashTypography(next);
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
  normalizeSourceText,
  normalizeTranslatedText,
  normalizeWhitespace
};
