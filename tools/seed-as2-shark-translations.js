const { DatabaseSync } = require("node:sqlite");

const paths = require("./lib/paths");
const { normalizeTranslatedText } = require("./lib/text-utils");

const PROVIDER = "codex-manual";
const MODEL = "gpt-5-codex";
const STYLE_VERSION = 3;
const ISLAND_ID = "shark-tooth";

const TRANSLATIONS = new Map([
  ["Argh! I had a page from Hammerhead's journal, but the wind blew it onto the roof!", "啊！我原来有一页哈默黑德教授的日记，可风把它吹到屋顶上了！"],
  ["Booga must be really angry. He's destroying all our fishing boats!", "Booga 肯定非常生气。他正在毁掉我们所有渔船！"],
  ["Deep in the temple there is a wall carving. It will show you what you need to bring me.", "神庙深处有一幅墙雕。它会告诉你需要带什么给我。"],
  ["Do you know anything about Professor Hammerhead's journal?", "你知道哈默黑德教授的日记吗？"],
  ["Don't be afraid, I'm just a fruit bat.", "别害怕，我只是一只果蝠。"],
  ["Enjoy your drink!", "慢慢喝！"],
  ["Good luck deciphering the code!", "祝你破译密码顺利！"],
  ["How can I get through that door?", "我怎样才能通过那扇门？"],
  ["How can I translate the heiroglyphics?", "我怎样才能翻译这些象形文字？"],
  ["How did I get here? I should be on Time Twisted Island!", "我怎么会到这里？我应该在时间扭曲岛上！"],
  ["I actually pulled in a page from it once. I sold it to an archeologist.", "我曾经打捞到一页。我把它卖给了一位考古学家。"],
  ["I can make a potion to calm him, but the key ingredient is locked deep in the ancient ruins.", "我能调制一种让它冷静下来的药水，但关键材料锁在古代遗迹深处。"],
  ["I don't need to see. I use sonar.", "我不需要看。我用声呐。"],
  ["I mix potions and put them in coconuts.", "我会调药水，再把它们装进椰子里。"],
  ["I only talk to native islanders, and you don't look like one to me!", "我只和本地岛民说话，而你看起来不像本地人！"],
  ["I see you've brought everything. I'll put the potion into a coconut for you.", "我看到你把东西都带来了。我会把药水装进椰子里给你。"],
  ["I took some great pictures of Booga, but then he ate my film.", "我拍了几张 Booga 的好照片，可后来它把我的胶卷吃了。"],
  ["I'm a great white shark, the world's largest known predatory fish.", "我是大白鲨，世界上已知最大的掠食性鱼类。"],
  ["I've been studying those heiroglyphics by the door.", "我一直在研究门旁那些象形文字。"],
  ["I've got to get off this island! That giant shark terrifies me!", "我得离开这座岛！那条巨鲨太吓人了！"],
  ["Is it safe to swim out to that island?", "游到那座岛上安全吗？"],
  ["Is that a fish in your hand?", "你手里拿的是鱼吗？"],
  ["It's good to be back. Thanks again!", "能回来真好。再次感谢！"],
  ["It's my tasty lunch. I also like dolphins, porpoises, whale carcasses and seals.", "那是我美味的午餐。我也喜欢海豚、鼠海豚、鲸鱼尸体和海豹。"],
  ["Listen, kid. I'm just trying to make a living.", "听着，孩子。我只是想讨口饭吃。"],
  ["Long ago the people here worshipped the Great Booga, a giant shark who still prowls the waters today.", "很久以前，这里的人崇拜伟大的 Booga，一条至今仍在这片海域游荡的巨鲨。"],
  ["My sonar sense tells me that the bones of a great beast are nearby.", "我的声呐感应告诉我，一只巨兽的骨头就在附近。"],
  ["No way! Not with Booga in a rage like this.", "不行！Booga 现在这么暴躁，绝对不行。"],
  ["Now your outfit's complete!", "现在你的装扮完整了！"],
  ["Please help! My son is stranded at sea! Trapped by that MONSTROUS SHARK!", "请帮帮我！我儿子被困在海上！被那条可怕的巨鲨困住了！"],
  ["Rescued at last! Thank you! Will you lead us back to the mainland?", "终于获救了！谢谢你！你能带我们回大陆吗？"],
  ["Take a spiffy grass skirt. You'll look like a native islander!", "拿上这条漂亮的草裙吧。你会看起来像本地岛民！"],
  ["Tell me about that statue by the door.", "给我讲讲门旁那座雕像。"],
  ["Thank you for saving my son!", "谢谢你救了我的儿子！"],
  ["Thanks again!", "再次感谢！"],
  ["Thanks for rescuing me, but does this mean I have to go back to school?", "谢谢你救了我，不过这是不是表示我得回学校了？"],
  ["Thanks for your help! The fishing industry is back in business!", "谢谢你的帮助！渔业又能正常运转了！"],
  ["Thanks to you our island is safe again!", "多亏了你，我们的岛又安全了！"],
  ["That beastly shark sure has made a mess of things over on Booga Bay!", "那条凶恶的鲨鱼把 Booga Bay 那边弄得一团糟！"],
  ["That is one massive tooth!", "这颗牙可真巨大！"],
  ["That plant has got quite a bite!", "那株植物咬人可真厉害！"],
  ["That's Professor Hammerhead. Read the statue's plaque to learn more about him.", "那是哈默黑德教授。读读雕像上的铭牌，可以了解更多关于他的事。"],
  ["That's typical shark food.", "那是典型的鲨鱼食物。"],
  ["There's a study journal in the Shark Museum, but the translation key is missing!", "鲨鱼博物馆里有一本研究日记，但翻译钥匙不见了！"],
  ["There's nothing else I can do for you. Good luck!", "我没别的能帮你了。祝你好运！"],
  ["These books look more decorative than useful.", "这些书看起来装饰性比实用性强。"],
  ["Travel inland and you'll find the ruins of an ancient temple.", "往内陆走，你会找到一座古代神庙的遗迹。"],
  ["Try my carbonated coconut milk. It's on the house!", "尝尝我的气泡椰奶吧。免费请你喝！"],
  ["Well done my friend! Here, take this gold medallion.", "干得好，我的朋友！来，收下这枚金奖章。"],
  ["Well, back to school I guess.", "好吧，我想该回学校了。"],
  ["What can you tell me about this island?", "你能告诉我这座岛的事吗？"],
  ["What do you know about the Great Booga?", "你对伟大的 Booga 了解多少？"],
  ["What else can you tell me?", "你还能告诉我什么？"],
  ["What happened to all these boats?", "这些船怎么了？"],
  ["What is there to see around here?", "这附近有什么可看的？"],
  ["Why are your eyes closed?", "你的眼睛为什么闭着？"],
  ["You'll have to decipher the code.", "你得破译这个密码。"],
  ["You'll look like a native islander with that skirt!", "穿上那条裙子，你会看起来像本地岛民！"],
  ["You've saved my son! Thank you! Thank you! Thank you!", "你救了我的儿子！谢谢！谢谢！太感谢了！"],
  ["Your outfit's not complete without a slick shark fin!", "没有酷炫鲨鱼鳍，你的装扮还不完整！"]
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
