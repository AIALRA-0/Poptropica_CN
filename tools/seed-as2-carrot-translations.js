const { DatabaseSync } = require("node:sqlite");

const paths = require("./lib/paths");
const { normalizeTranslatedText } = require("./lib/text-utils");

const PROVIDER = "codex-manual";
const MODEL = "gpt-5-codex";
const STYLE_VERSION = 3;
const ISLAND_ID = "24-carrot";

const TRANSLATIONS = new Map([
  ["<FONT COLOR='#015201'>Can you fill this bowl with milk?</FONT>", "<FONT COLOR='#015201'>能把这个碗装满牛奶吗？</FONT>"],
  ["<FONT COLOR='#015201'>I found your cat!</FONT>", "<FONT COLOR='#015201'>我找到你的猫了！</FONT>"],
  ["He's going to use his giant rabbot to mind control the entire planet from space!", "他要用那只巨型兔机器人从太空控制整个星球！"],
  ["I lost my cat, Whiskers.", "我的猫 Whiskers 走丢了。"],
  ["Momma Mia! It's never been worse!", "天哪！情况从来没这么糟过！"],
  ["Thanks again! Now watch out. If you're seen without rabbot ears you'll be captured!", "再次谢谢！现在小心点。如果你没戴兔耳被看见，就会被抓起来！"],
  ["Things are looking up around here. I should be able to reopen the station soon!", "这里的情况正在好转。我应该很快就能重新开放车站了！"],
  ["You did it! Now let's get out of here!", "你成功了！现在我们快离开这里！"],
  ["You've got to stop Dr. Hare!", "你必须阻止兔博士！"]
]);

function main() {
  const db = new DatabaseSync(paths.textIndexPath);
  const rows = db.prepare(`
    SELECT s.string_key, s.generic_key, s.source_text
    FROM strings s
    JOIN assets a ON a.asset_id = s.asset_id
    LEFT JOIN exact_translations et ON et.string_key = s.string_key
    LEFT JOIN translations t ON t.generic_key = s.generic_key
    WHERE s.source_group = 'as2'
      AND s.island_id = ?
      AND json_extract(s.context_json, '$.kind') = 'swf-script'
      AND COALESCE(et.translated_text, t.translated_text) IS NULL
    ORDER BY a.asset_path, s.context_key
  `).all(ISLAND_ID);
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
    ok: true,
    islandId: ISLAND_ID,
    totalScriptRows: rows.length,
    seeded,
    missing: [...new Set(missing)].sort()
  }, null, 2)}\n`);
}

main();
