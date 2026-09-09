const { DatabaseSync } = require("node:sqlite");

const paths = require("./lib/paths");
const { normalizeTranslatedText } = require("./lib/text-utils");

const PROVIDER = "codex-manual";
const MODEL = "gpt-5-codex";
const STYLE_VERSION = 3;
const ISLAND_ID = "early-poptropica";

const TRANSLATIONS = new Map([
  ["Glow sticks are the coolest! I saw another one up to the left.", "荧光棒最酷了！我看到左上方还有一根。"],
  ["Pick a balloon! Any balloon!", "挑一个气球吧！随便哪个都行！"],
  ["You'll never believe the things I've seen in the clouds!", "你绝对想不到我在云层里见过什么！"],
  ["You can really get some air off those clothes lines!", "从那些晾衣绳上弹起来，真的能飞很高！"],
  ["Welcome to Poptropica! If you ever get lost just look at your map.", "欢迎来到 Poptropica！如果迷路了，就看看地图。"],
  ["How did that flag get way up on the water tower?", "那面旗怎么跑到水塔顶上去了？"],
  ["Have you been to the old part of town? I've heard they need some help.", "你去过旧城区吗？我听说他们需要帮忙。"],
  ["Thanks for your help!", "谢谢你的帮助！"],
  ["Beware! There are thieves around! Three of our town's prized possessions have been stolen!", "小心！附近有小偷！我们镇上三件珍贵物品被偷走了！"],
  ["Thank you for returning the signal flag! Take this gold medallion as a token of my appreciation.", "谢谢你归还信号旗！请收下这枚金奖章，作为我的谢意。"],
  ["My precious pig! My prize-winning porker! Snatched by that sneaky spider!", "我心爱的小猪！我的获奖猪崽！被那只狡猾的蜘蛛抢走了！"],
  ["We used to fly our flag to signal the ships to shore, but the flag was lost. Now nobody comes to visit!", "我们过去会升旗引导船只靠岸，可旗子丢了。现在没人来拜访了！"],
  ["Someone has stolen our bucket! Without it, we can't get water from the well!", "有人偷走了我们的水桶！没有它，我们就没法从井里打水！"],
  ["Welcome to our town! We're Poptropica's first settlers.", "欢迎来到我们的小镇！我们是 Poptropica 最早的定居者。"],
  ["I'm the Curator at the Museum on Counterfeit Island.", "我是 Counterfeit 岛博物馆的馆长。"],
  ["Why did you call me here?", "你为什么叫我来这里？"],
  ["I'm afraid you've gotten yourself caught up in something much bigger than you realize.", "恐怕你已经卷入了一件远比你想象更大的事。"],
  ["The world's greatest artwork is hidden in a secure location, but now it's in danger!", "世界上最伟大的艺术品藏在安全地点，但现在它有危险！"],
  ["Just be safe – someone you trust is watching you very closely.", "一定要小心。你信任的人正密切盯着你。"],
  ["And take this key. Be careful with it, we lost much just to obtain it.", "还有，拿着这把钥匙。小心保管，我们为了得到它付出了很大代价。"],
  ["Do you do anything besides sculpting?", "除了雕塑，你还做别的吗？"],
  ["Tell me something interesting about yourself.", "说点关于你自己的趣事吧。"],
  ["Yes! I'm a painter and an inventor, and I enjoy studying science and anatomy!", "当然！我是画家，也是发明家，还喜欢研究科学和解剖学！"],
  ["I'm left-handed, and lived during a time when left- handedness was considered the devil's work.", "我是左撇子，而我生活的时代认为左撇子是恶魔的作为。"],
  ["What has influenced your painting style?", "什么影响了你的绘画风格？"],
  ["So what can you tell me about your life?", "那你能聊聊你的人生吗？"],
  ["I am Georges-Pierre Seurat.", "我是乔治-皮埃尔·修拉。"],
  ["I have always been fascinated by the science of color.", "我一直痴迷于色彩的科学。"],
  ["I don't like to discuss my private life.", "我不喜欢谈论我的私生活。"],
  ["How many paintings did you sell in your career?", "你一生卖出了多少幅画？"],
  ["Is it true you cut off your own ear?", "你真的割下了自己的耳朵吗？"],
  ["I am Vincent van Gogh.", "我是文森特·梵高。"],
  ["Just one! Sad, isn't it? And now my works sell for millions!", "只有一幅！很伤感吧？现在我的作品却能卖到几百万！"],
  ["Yes! I did so after a quarrel with another painter named Gauguin", "是的！那是在我和另一位名叫高更的画家争吵之后"],
  ["I hope you're not afraid of spiders.", "希望你不怕蜘蛛。"]
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
