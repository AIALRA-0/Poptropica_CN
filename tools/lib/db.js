const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const paths = require("./paths");
const { ensureDirSync } = require("./fs-utils");

function openIndexDb() {
  ensureDirSync(path.dirname(paths.textIndexPath));
  const db = new DatabaseSync(paths.textIndexPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS assets (
      asset_id TEXT PRIMARY KEY,
      source_group TEXT NOT NULL,
      island_id TEXT,
      container_path TEXT NOT NULL,
      asset_path TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      extracted_path TEXT,
      metadata_json TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS strings (
      string_key TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      source_group TEXT NOT NULL,
      island_id TEXT,
      generic_key TEXT NOT NULL,
      source_text TEXT NOT NULL,
      context_key TEXT NOT NULL,
      context_json TEXT,
      state TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_strings_generic_key ON strings(generic_key);
    CREATE TABLE IF NOT EXISTS translations (
      generic_key TEXT PRIMARY KEY,
      source_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      style_version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS exact_translations (
      string_key TEXT PRIMARY KEY,
      generic_key TEXT NOT NULL,
      source_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      style_version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_exact_translations_generic_key ON exact_translations(generic_key);
    CREATE TABLE IF NOT EXISTS pack_outputs (
      source_group TEXT PRIMARY KEY,
      manifest_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec(`
    UPDATE strings
    SET state = 'pending', updated_at = datetime('now')
    WHERE generic_key IN (
      SELECT generic_key FROM translations WHERE translated_text = '[object Object]'
    );
    DELETE FROM translations WHERE translated_text = '[object Object]';
    UPDATE strings
    SET state = 'pending', updated_at = datetime('now')
    WHERE string_key IN (
      SELECT string_key FROM exact_translations WHERE translated_text = '[object Object]'
    );
    DELETE FROM exact_translations WHERE translated_text = '[object Object]';
  `);

  const statements = {
    deleteStringsByAsset: db.prepare("DELETE FROM strings WHERE asset_id = ?"),
    getStringsForPack: db.prepare(`
      SELECT s.*, a.asset_type, a.asset_path, a.container_path, a.extracted_path, a.metadata_json,
             COALESCE(et.translated_text, t.translated_text) AS translated_text
      FROM strings s
      JOIN assets a ON a.asset_id = s.asset_id
      LEFT JOIN exact_translations et ON et.string_key = s.string_key
      LEFT JOIN translations t ON t.generic_key = s.generic_key
      WHERE s.source_group = ?
        AND COALESCE(et.translated_text, t.translated_text) IS NOT NULL
      ORDER BY a.asset_path, s.context_key
    `),
    insertAsset: db.prepare(`
      INSERT INTO assets (asset_id, source_group, island_id, container_path, asset_path, asset_type, extracted_path, metadata_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(asset_id) DO UPDATE SET
        source_group = excluded.source_group,
        island_id = excluded.island_id,
        container_path = excluded.container_path,
        asset_path = excluded.asset_path,
        asset_type = excluded.asset_type,
        extracted_path = excluded.extracted_path,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `),
    insertPackOutput: db.prepare(`
      INSERT INTO pack_outputs (source_group, manifest_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(source_group) DO UPDATE SET
        manifest_json = excluded.manifest_json,
        updated_at = excluded.updated_at
    `),
    insertString: db.prepare(`
      INSERT INTO strings (string_key, asset_id, source_group, island_id, generic_key, source_text, context_key, context_json, state, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(string_key) DO UPDATE SET
        island_id = excluded.island_id,
        generic_key = excluded.generic_key,
        source_text = excluded.source_text,
        context_key = excluded.context_key,
        context_json = excluded.context_json,
        state = excluded.state,
        updated_at = excluded.updated_at
    `),
    insertTranslation: db.prepare(`
      INSERT INTO translations (generic_key, source_text, translated_text, provider, model, style_version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(generic_key) DO UPDATE SET
        source_text = excluded.source_text,
        translated_text = excluded.translated_text,
        provider = excluded.provider,
        model = excluded.model,
        style_version = excluded.style_version,
        updated_at = excluded.updated_at
    `),
    insertExactTranslation: db.prepare(`
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
    `),
    getStringsByGenericKey: db.prepare(`
      SELECT string_key, generic_key, source_text
      FROM strings
      WHERE generic_key = ?
      ORDER BY string_key
    `),
    getStringsBySourceText: db.prepare(`
      SELECT string_key, generic_key, source_text
      FROM strings
      WHERE source_text = ?
      ORDER BY string_key
    `),
    markStringTranslated: db.prepare("UPDATE strings SET state = 'translated', updated_at = ? WHERE string_key = ?"),
    markStringsSkipped: db.prepare("UPDATE strings SET state = 'skipped', updated_at = ? WHERE generic_key = ?"),
    stats: {
      assetCount: db.prepare("SELECT COUNT(*) AS total FROM assets"),
      stringCount: db.prepare("SELECT COUNT(*) AS total FROM strings"),
      translationCount: db.prepare("SELECT COUNT(*) AS total FROM translations"),
      exactTranslationCount: db.prepare("SELECT COUNT(*) AS total FROM exact_translations")
    },
    getAssetsForSourceGroup: db.prepare(`
      SELECT asset_id, source_group, island_id, container_path, asset_path, asset_type, extracted_path, metadata_json
      FROM assets
      WHERE source_group = ?
      ORDER BY asset_path
    `)
  };

  return {
    close: () => db.close(),
    countPendingStrings: ({ sourceGroup = null, islandIds = [], assetPatterns = [] } = {}) => {
      const filters = ["s.state != 'skipped'", "et.string_key IS NULL"];
      const values = [];
      if (sourceGroup) {
        filters.push("s.source_group = ?");
        values.push(sourceGroup);
      }
      if (islandIds.length > 0) {
        filters.push(`s.island_id IN (${islandIds.map(() => "?").join(", ")})`);
        values.push(...islandIds);
      }
      if (assetPatterns.length > 0) {
        filters.push(`(${assetPatterns.map(() => "a.asset_path LIKE ?").join(" OR ")})`);
        values.push(...assetPatterns.map((pattern) => `%${pattern}%`));
      }
      const sql = `
        SELECT COUNT(*) AS total
        FROM strings s
        JOIN assets a ON a.asset_id = s.asset_id
        LEFT JOIN exact_translations et ON et.string_key = s.string_key
        WHERE ${filters.join(" AND ")}
      `;
      return Number(db.prepare(sql).get(...values).total || 0);
    },
    getPendingStrings: ({ limit = 100, sourceGroup = null, islandIds = [], assetPatterns = [] } = {}) => {
      const filters = ["s.state != 'skipped'", "et.string_key IS NULL"];
      const values = [];
      if (sourceGroup) {
        filters.push("s.source_group = ?");
        values.push(sourceGroup);
      }
      if (islandIds.length > 0) {
        filters.push(`s.island_id IN (${islandIds.map(() => "?").join(", ")})`);
        values.push(...islandIds);
      }
      if (assetPatterns.length > 0) {
        filters.push(`(${assetPatterns.map(() => "a.asset_path LIKE ?").join(" OR ")})`);
        values.push(...assetPatterns.map((pattern) => `%${pattern}%`));
      }

      const sql = `
        SELECT s.string_key, s.asset_id, s.source_group, s.island_id, s.generic_key, s.source_text, s.context_key, s.context_json,
               a.asset_path, a.asset_type, t.translated_text AS fallback_translated_text
        FROM strings s
        JOIN assets a ON a.asset_id = s.asset_id
        LEFT JOIN exact_translations et ON et.string_key = s.string_key
        LEFT JOIN translations t ON t.generic_key = s.generic_key
        WHERE ${filters.join(" AND ")}
        ORDER BY s.source_group, s.island_id, a.asset_path, s.context_key
        LIMIT ?
      `;
      return db.prepare(sql).all(...values, limit);
    },
    seedExactFromGeneric: ({ sourceGroup = null, islandIds = [], assetPatterns = [], provider, model, styleVersion }) => {
      const filters = ["s.state != 'skipped'", "et.string_key IS NULL", "t.generic_key IS NOT NULL"];
      const values = [];
      if (sourceGroup) {
        filters.push("s.source_group = ?");
        values.push(sourceGroup);
      }
      if (islandIds.length > 0) {
        filters.push(`s.island_id IN (${islandIds.map(() => "?").join(", ")})`);
        values.push(...islandIds);
      }
      if (assetPatterns.length > 0) {
        filters.push(`(${assetPatterns.map(() => "a.asset_path LIKE ?").join(" OR ")})`);
        values.push(...assetPatterns.map((pattern) => `%${pattern}%`));
      }

      const countSql = `
        SELECT COUNT(*) AS total
        FROM strings s
        JOIN assets a ON a.asset_id = s.asset_id
        JOIN translations t ON t.generic_key = s.generic_key
        LEFT JOIN exact_translations et ON et.string_key = s.string_key
        WHERE ${filters.join(" AND ")}
      `;
      const total = Number(db.prepare(countSql).get(...values).total || 0);
      if (total <= 0) {
        return 0;
      }

      const now = new Date().toISOString();
      const insertSql = `
        INSERT INTO exact_translations (string_key, generic_key, source_text, translated_text, provider, model, style_version, updated_at)
        SELECT s.string_key, s.generic_key, s.source_text, t.translated_text, ?, ?, ?, ?
        FROM strings s
        JOIN assets a ON a.asset_id = s.asset_id
        JOIN translations t ON t.generic_key = s.generic_key
        LEFT JOIN exact_translations et ON et.string_key = s.string_key
        WHERE ${filters.join(" AND ")}
        ON CONFLICT(string_key) DO UPDATE SET
          generic_key = excluded.generic_key,
          source_text = excluded.source_text,
          translated_text = excluded.translated_text,
          provider = excluded.provider,
          model = excluded.model,
          style_version = excluded.style_version,
          updated_at = excluded.updated_at
      `;
      db.prepare(insertSql).run(provider, model, styleVersion, now, ...values);

      const translatedFilters = filters.filter((filter) => filter !== "et.string_key IS NULL");
      const updateSql = `
        UPDATE strings
        SET state = 'translated', updated_at = ?
        WHERE string_key IN (
          SELECT s.string_key
          FROM strings s
          JOIN assets a ON a.asset_id = s.asset_id
          JOIN translations t ON t.generic_key = s.generic_key
          WHERE ${translatedFilters.join(" AND ")}
        )
      `;
      db.prepare(updateSql).run(now, ...values);
      return total;
    },
    getIslandProgress: () => {
      const rows = db.prepare(`
        SELECT
          COALESCE(s.island_id, '__unknown__') AS island_id,
          s.source_group AS source_group,
          COUNT(*) AS string_count,
          SUM(CASE WHEN et.string_key IS NOT NULL OR t.generic_key IS NOT NULL THEN 1 ELSE 0 END) AS translated_count
        FROM strings s
        LEFT JOIN exact_translations et ON et.string_key = s.string_key
        LEFT JOIN translations t ON t.generic_key = s.generic_key
        GROUP BY COALESCE(s.island_id, '__unknown__'), s.source_group
      `).all();
      return rows.map((row) => ({
        islandId: row.island_id === "__unknown__" ? null : row.island_id,
        sourceGroup: row.source_group,
        stringCount: Number(row.string_count || 0),
        translatedCount: Number(row.translated_count || 0)
      }));
    },
    getStats: () => ({
      assetCount: statements.stats.assetCount.get().total,
      stringCount: statements.stats.stringCount.get().total,
      translationCount: statements.stats.translationCount.get().total,
      exactTranslationCount: statements.stats.exactTranslationCount.get().total
    }),
    getAssetsForSourceGroup: (sourceGroup) => statements.getAssetsForSourceGroup.all(sourceGroup),
    getStringsForPack: (sourceGroup) => statements.getStringsForPack.all(sourceGroup),
    markSkipped: (genericKey) => statements.markStringsSkipped.run(new Date().toISOString(), genericKey),
    replaceStringsForAsset: (assetId, rows) => {
      statements.deleteStringsByAsset.run(assetId);
      const now = new Date().toISOString();
      for (const row of rows) {
        statements.insertString.run(
          row.stringKey,
          assetId,
          row.sourceGroup,
          row.islandId,
          row.genericKey,
          row.sourceText,
          row.contextKey,
          JSON.stringify(row.context || {}),
          row.state || "pending",
          now
        );
      }
    },
    setPackOutput: (sourceGroup, manifest) =>
      statements.insertPackOutput.run(sourceGroup, JSON.stringify(manifest), new Date().toISOString()),
    upsertAsset: (asset) =>
      statements.insertAsset.run(
        asset.assetId,
        asset.sourceGroup,
        asset.islandId,
        asset.containerPath,
        asset.assetPath,
        asset.assetType,
        asset.extractedPath || null,
        JSON.stringify(asset.metadata || {}),
        new Date().toISOString()
      ),
    upsertTranslation: (row) => {
      statements.insertTranslation.run(
        row.genericKey,
        row.sourceText,
        row.translatedText,
        row.provider,
        row.model,
        row.styleVersion,
        new Date().toISOString()
      );
    },
    upsertExactTranslation: (row) => {
      const now = new Date().toISOString();
      statements.insertExactTranslation.run(
        row.stringKey,
        row.genericKey,
        row.sourceText,
        row.translatedText,
        row.provider,
        row.model,
        row.styleVersion,
        now
      );
      statements.markStringTranslated.run(now, row.stringKey);
    },
    upsertExactTranslationsForGeneric: (row) => {
      const now = new Date().toISOString();
      const strings = statements.getStringsByGenericKey.all(row.genericKey);
      for (const stringRow of strings) {
        statements.insertExactTranslation.run(
          stringRow.string_key,
          stringRow.generic_key,
          stringRow.source_text,
          row.translatedText,
          row.provider,
          row.model,
          row.styleVersion,
          now
        );
        statements.markStringTranslated.run(now, stringRow.string_key);
      }
      return strings.length;
    },
    upsertExactTranslationsForSource: (row) => {
      const now = new Date().toISOString();
      const strings = statements.getStringsBySourceText.all(row.sourceText);
      for (const stringRow of strings) {
        statements.insertExactTranslation.run(
          stringRow.string_key,
          stringRow.generic_key,
          stringRow.source_text,
          row.translatedText,
          row.provider,
          row.model,
          row.styleVersion,
          now
        );
        statements.markStringTranslated.run(now, stringRow.string_key);
      }
      return strings.length;
    }
  };
}

module.exports = {
  openIndexDb
};
