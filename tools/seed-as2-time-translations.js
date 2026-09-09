const { DatabaseSync } = require("node:sqlite");

const paths = require("./lib/paths");
const { normalizeTranslatedText } = require("./lib/text-utils");

const PROVIDER = "codex-manual";
const MODEL = "gpt-5-codex";
const STYLE_VERSION = 3;
const ISLAND_ID = "time-tangled";

const TRANSLATIONS = new Map([
  [". You're looking youthful today! Heading back up to your sky home?", "你今天看起来真年轻！要回天上的家吗？"],
  ["<FONT COLOR='#015201'>I found the Peace Medal!</FONT>", "<FONT COLOR='#015201'>我找到和平奖章了！</FONT>"],
  ["<FONT COLOR='#015201'>I found your goggles!</FONT>", "<FONT COLOR='#015201'>我找到你的护目镜了！</FONT>"],
  ["<FONT COLOR='#015201'>I found your notebook!</FONT>", "<FONT COLOR='#015201'>我找到你的笔记本了！</FONT>"],
  ["<FONT COLOR='#015201'>I found your salt rocks!</FONT>", "<FONT COLOR='#015201'>我找到你的盐岩了！</FONT>"],
  ["<FONT COLOR='#015201'>I have the declaration!</FONT>", "<FONT COLOR='#015201'>我拿到宣言了！</FONT>"],
  ["<FONT COLOR='#015201'>I have the golden vase!</FONT>", "<FONT COLOR='#015201'>我拿到金花瓶了！</FONT>"],
  ["<FONT COLOR='#015201'>I have the stone bowl!</FONT>", "<FONT COLOR='#015201'>我拿到石碗了！</FONT>"],
  ["<FONT COLOR='#015201'>I have the sun stone piece!</FONT>", "<FONT COLOR='#015201'>我拿到太阳石碎片了！</FONT>"],
  ["<FONT COLOR='#015201'>I have your amulet!</FONT>", "<FONT COLOR='#015201'>我拿到你的护身符了！</FONT>"],
  ["<FONT COLOR='#015201'>I have your phonograph!</FONT>", "<FONT COLOR='#015201'>我拿到你的留声机了！</FONT>"],
  ["<FONT COLOR='#015201'>I have your study model!</FONT>", "<FONT COLOR='#015201'>我拿到你的研究模型了！</FONT>"],
  ["Aaaargh!", "啊啊啊！"],
  ["Greetings stranger. Welcome to Delphi.", "你好，陌生人。欢迎来到德尔斐。"],
  ["I am Captain Meriwether Lewis.", "我是梅里韦瑟·刘易斯上尉。"],
  ["I am Edmund Hillary", "我是埃德蒙·希拉里。"],
  ["I am Thomas Jefferson.", "我是托马斯·杰斐逊。"],
  ["I was so worried! Thank you for returning it.", "我刚才担心坏了！谢谢你把它送回来。"],
  ["I'll need something to blast through those rocks.", "我需要能炸开那些岩石的东西。"],
  ["I'm York, Clark's servant.", "我是约克，克拉克的仆人。"],
  ["I'm you, but fifty years older.", "我是你，五十年后的你。"],
  ["It looks like things have calmed down at Pendulum's Lab.", "看起来钟摆实验室的情况已经平静下来了。"],
  ["It sort of looks like a helicopter.", "它有点像直升机。"],
  ["My phonoghraph is gone! It's an important invention and I need it back!", "我的留声机不见了！那是很重要的发明，我必须把它找回来！"],
  ["Please come inside!", "请进来！"],
  ["Tell me about the sun stone?", "跟我说说太阳石吧？"],
  ["Tenzing and I are climbing to the summit of Mount Everest.", "丹增和我正在攀登珠穆朗玛峰顶。"],
  ["Tenzing and I have reached Everest's summit! We're on our way down.", "丹增和我已经登上珠峰峰顶了！我们正在下山。"],
  ["Thank you for retrieving the vase! As a reward, you may speak to the oracle on the hill.", "谢谢你找回花瓶！作为奖励，你可以去山上见神谕者。"],
  ["That was an impressive grab!", "刚才那一下抓得真漂亮！"],
  ["The future is sound. There is nothing more to be found.", "未来安然无恙。这里已经没什么可找的了。"],
  ["There's something up on the ledge of that building.", "那栋建筑的檐台上有东西。"],
  ["These sketches show a man wearing wings!", "这些草图画的是一个戴着翅膀的人！"],
  ["This is terrible! Jefferson has lost the declaration, and Franklin is waiting outside!", "太糟了！杰斐逊把宣言弄丢了，富兰克林还在外面等着！"],
  ["This printout will explain what we need you to do.", "这份打印资料会说明我们需要你做什么。"],
  ["This will be our future if history is not restored!", "如果历史没有恢复，这就会是我们的未来！"],
  ["We're on an expedition to the west, but we've lost our Peace Medal!", "我们正在向西远征，但我们的和平奖章弄丢了！"],
  ["We're on an expedition to the west.", "我们正在向西远征。"],
  ["Wow, it's the Mona Lisa!", "哇，是《蒙娜丽莎》！"]
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
