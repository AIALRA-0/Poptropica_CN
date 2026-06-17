const { DatabaseSync } = require("node:sqlite");
const { printJson } = require("./lib/cli");
const paths = require("./lib/paths");
const { containsCjk, normalizeTranslatedText } = require("./lib/text-utils");

function polishTable(db, tableName, keyColumn) {
  const rows = db.prepare(`
    SELECT ${keyColumn} AS row_key, source_text, translated_text
    FROM ${tableName}
    WHERE translated_text IS NOT NULL
    ORDER BY ${keyColumn}
  `).all();
  const update = db.prepare(`
    UPDATE ${tableName}
    SET translated_text = ?, provider = ?, updated_at = ?
    WHERE ${keyColumn} = ?
  `);
  let changed = 0;
  const samples = [];
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    for (const row of rows) {
      const translated = String(row.translated_text || "");
      if (!containsCjk(translated)) {
        continue;
      }
      const polished = normalizeTranslatedText(translated, row.source_text);
      if (polished === translated) {
        continue;
      }
      update.run(polished, "polished-cjk-punctuation", now, row.row_key);
      changed += 1;
      if (samples.length < 20) {
        samples.push({
          table: tableName,
          key: row.row_key,
          before: translated,
          after: polished
        });
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { changed, samples };
}

function main() {
  const db = new DatabaseSync(paths.textIndexPath);
  try {
    const generic = polishTable(db, "translations", "generic_key");
    const exact = polishTable(db, "exact_translations", "string_key");
    printJson({
      ok: true,
      changedRows: generic.changed + exact.changed,
      genericChangedRows: generic.changed,
      exactChangedRows: exact.changed,
      samples: [...generic.samples, ...exact.samples].slice(0, 20)
    });
  } finally {
    db.close();
  }
}

main();
