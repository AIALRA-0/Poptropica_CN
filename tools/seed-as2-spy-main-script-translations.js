const { DatabaseSync } = require("node:sqlite");

const paths = require("./lib/paths");
const { normalizeTranslatedText } = require("./lib/text-utils");

const ASSET_PATH = "content/www.poptropica.com/scenes/islandSpy/sceneSpyMain.swf";
const PROVIDER = "codex-manual";
const MODEL = "gpt-5-codex";
const STYLE_VERSION = 3;

const TRANSLATIONS = new Map([
  ["Well done. But remember, a spy's work is never done.", "干得好。不过记住，特工的任务永远不会结束."],
  ["Good luck completing your mission.", "祝你顺利完成任务."],
  ["It's locked.", "锁住了."],
  ["Come see me after you talk to Director D.", "和 D 局长谈过后再来找我."],
  ["Do you ever get the feeling that you're being watched?", "你有没有觉得自己正在被人盯着？"],
  ["Aaah! What happened to my hair?!", "啊啊！我的头发怎么了？！"],
  ["I have an important message for you about Dr. Spyglass.", "我有个关于斯派格拉斯博士的重要消息要告诉你."],
  ["Director D. is waiting for you inside headquarters.", "D 局长在总部里面等你."],
  ["How do you like my new hair cut?", "你觉得我的新发型怎么样？"],
  ["meeoow", "喵呜"],
  ["Careful, it's a long way down!", "小心，下面很高！"],
  ["It's nice to know my hair is safe. Thanks!", "知道我的头发安全了真好。谢谢！"],
  ["Nothing can stop this hair now!", "现在谁也挡不住这头秀发了！"]
]);

function main() {
  const db = new DatabaseSync(paths.textIndexPath);
  const rows = db.prepare(`
    SELECT s.string_key, s.generic_key, s.source_text
    FROM strings s
    JOIN assets a ON a.asset_id = s.asset_id
    WHERE s.source_group = 'as2'
      AND a.asset_path = ?
      AND json_extract(s.context_json, '$.kind') = 'swf-script'
    ORDER BY s.context_key
  `).all(ASSET_PATH);
  const insertGeneric = db.prepare(`
    INSERT INTO translations (generic_key, source_text, translated_text, provider, model, style_version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(generic_key) DO UPDATE SET
      source_text = excluded.source_text,
      translated_text = excluded.translated_text,
      provider = excluded.provider,
      model = excluded.model,
      style_version = excluded.style_version,
      updated_at = excluded.updated_at
  `);
  const insertExact = db.prepare(`
    INSERT INTO exact_translations (string_key, generic_key, source_text, translated_text, provider, model, style_version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(string_key) DO UPDATE SET
      generic_key = excluded.generic_key,
      source_text = excluded.source_text,
      translated_text = excluded.translated_text,
      provider = excluded.provider,
      model = excluded.model,
      style_version = excluded.style_version,
      updated_at = excluded.updated_at
  `);
  const markTranslated = db.prepare("UPDATE strings SET state = 'translated', updated_at = ? WHERE string_key = ?");
  const now = new Date().toISOString();
  let seeded = 0;
  const missing = [];

  db.exec("BEGIN");
  try {
    for (const row of rows) {
      const translated = TRANSLATIONS.get(row.source_text);
      if (!translated) {
        missing.push(row.source_text);
        continue;
      }
      const normalized = normalizeTranslatedText(translated, row.source_text);
      insertGeneric.run(row.generic_key, row.source_text, normalized, PROVIDER, MODEL, STYLE_VERSION, now);
      insertExact.run(row.string_key, row.generic_key, row.source_text, normalized, PROVIDER, MODEL, STYLE_VERSION, now);
      markTranslated.run(now, row.string_key);
      seeded += 1;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }

  process.stdout.write(`${JSON.stringify({
    ok: missing.length === 0,
    assetPath: ASSET_PATH,
    totalRows: rows.length,
    seeded,
    missing: [...new Set(missing)]
  }, null, 2)}\n`);
}

main();
