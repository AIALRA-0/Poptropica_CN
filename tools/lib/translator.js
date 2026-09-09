const { loadProjectEnv } = require("./env");
const { normalizeSourceText, normalizeTranslatedText } = require("./text-utils");

const STYLE_VERSION = 3;
const MAX_RETRIES = 3;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getProviderConfig() {
  loadProjectEnv();
  return {
    provider: "deepseek",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    apiKey: process.env.DEEPSEEK_API_KEY || null,
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/chat/completions"
  };
}

function buildPrompt(items, glossary) {
  const glossaryText = Object.entries(glossary || {})
    .map(([source, target]) => `${source} => ${target}`)
    .join("\n");

  return [
    "You are the lead Simplified Chinese localization editor for legacy Poptropica.",
    "Your target audience is mainland China players, and the tone must feel like a polished commercial game localization.",
    "Context matters more than literal wording. Translate each batch as one connected scene block, not as isolated strings.",
    "Most items are NPC dialogue, interaction text, scene prompts, object descriptions, map labels, and UI strings from legacy Flash XML.",
    "",
    "Hard rules:",
    "- Keep placeholders, variables, item IDs, control codes, ordering, and choice counts unchanged.",
    "- Do not add explanations, brackets, notes, or translator comments.",
    "- Prefer short, natural, idiomatic mainland Chinese for UI, buttons, prompts, and dialogue.",
    "- Preserve lighthearted children's-adventure tone, character personality, and scene context.",
    "- Dialogue should sound conversational and grounded, not stiff or machine-translated.",
    "- NPC dialogue should sound like real spoken Chinese in a game, not literal textbook English-to-Chinese conversion.",
    "- Object/tool/item descriptions should read like concise in-game hints, not explanatory prose.",
    "- If several lines are part of the same conversation, keep tone, wording, and terminology consistent across the whole exchange.",
    "- Choices in the same set must match each other in tone and length.",
    "- If a source line has no terminal punctuation, do not invent one.",
    "- Use ASCII period '.' instead of Chinese '。' whenever a period is needed.",
    "- Keep translations compact enough for old Flash UI. If needed, shorten naturally rather than cramming literal detail.",
    "- Prefer stable, repeatable terminology. Use glossary terms whenever they match.",
    "",
    "Typography/layout constraints:",
    "- Chinese text will be rendered with SimHei / Microsoft YaHei style fonts at bold weight.",
    "- Avoid overly long phrases that would obviously overflow buttons, banners, narrow labels, or centered choices.",
    "- Titles, buttons, and short labels should read cleanly when centered.",
    "",
    "Return only JSON with a single array field named translations.",
    "",
    "Glossary:",
    glossaryText || "(none)",
    "",
    "Items:",
    JSON.stringify(items)
  ].join("\n");
}

function coerceTranslationValue(value, fallbackText) {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => coerceTranslationValue(item, fallbackText)).filter(Boolean).join(" ");
  }
  if (value && typeof value === "object") {
    const direct = value.translatedText || value.translation || value.text || value.output || value.result || value.value;
    if (typeof direct === "string") {
      return direct;
    }
    const firstString = Object.values(value).find((entry) => typeof entry === "string");
    if (firstString) {
      return firstString;
    }
  }
  return fallbackText;
}

async function translateBatch(items, glossary) {
  const config = getProviderConfig();
  if (!config.apiKey) {
    return {
      ok: false,
      provider: config.provider,
      model: config.model,
      error: "DEEPSEEK_API_KEY is not configured",
      translations: []
    };
  }

  let response = null;
  let payload = null;
  let requestError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      response = await fetch(config.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You output stable localization JSON." },
            { role: "user", content: buildPrompt(items, glossary) }
          ]
        })
      });
      if (!response.ok) {
        throw new Error(`DeepSeek request failed with status ${response.status}`);
      }
      payload = await response.json();
      requestError = null;
      break;
    } catch (error) {
      requestError = error;
      response = null;
      payload = null;
      if (attempt < MAX_RETRIES) {
        await delay(1200 * attempt);
      }
    }
  }

  if (!response || !payload) {
    return {
      ok: false,
      provider: config.provider,
      model: config.model,
      error: requestError?.message || "DeepSeek request failed",
      translations: []
    };
  }

  const content = payload?.choices?.[0]?.message?.content || "";
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return {
      ok: false,
      provider: config.provider,
      model: config.model,
      error: "DeepSeek returned invalid JSON",
      translations: []
    };
  }

  const translated = Array.isArray(parsed.translations) ? parsed.translations : [];
  return {
    ok: true,
    provider: config.provider,
    model: config.model,
    styleVersion: STYLE_VERSION,
    translations: items.map((item, index) => ({
      stringKey: item.stringKey,
      genericKey: item.genericKey,
      sourceText: normalizeSourceText(item.sourceText),
      translatedText: normalizeTranslatedText(coerceTranslationValue(translated[index], item.sourceText), item.sourceText)
    }))
  };
}

module.exports = {
  STYLE_VERSION,
  getProviderConfig,
  translateBatch
};
