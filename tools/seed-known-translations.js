const { printJson } = require("./lib/cli");
const { openIndexDb } = require("./lib/db");
const { buildGenericKey, normalizeSourceText, normalizeTranslatedText } = require("./lib/text-utils");
const { getProviderConfig, STYLE_VERSION } = require("./lib/translator");

const SEEDED_TRANSLATIONS = [
  {
    sourceText: "<p align=\"center\"><font face=\"CreativeBlock BB Bold\" size=\"17\" color=\"#FFFFFF\">New<br/>Player</font></p>",
    translatedText: "<p align=\"center\"><font face=\"CreativeBlock BB Bold\" size=\"17\" color=\"#FFFFFF\">新<br/>玩家</font></p>"
  },
  {
    sourceText: "<p align=\"center\"><font face=\"CreativeBlock BB Bold\" size=\"17\" color=\"#FFFFFF\">Returning<br/>Player</font></p>",
    translatedText: "<p align=\"center\"><font face=\"CreativeBlock BB Bold\" size=\"17\" color=\"#FFFFFF\">继续<br/>游戏</font></p>"
  },
  {
    sourceText: "<font face=\"CreativeBlock BB Bold\" size=\"35\" color=\"#FFFFFF\">Are you a boy or a girl?</font>",
    translatedText: "<font face=\"CreativeBlock BB Bold\" size=\"35\" color=\"#FFFFFF\">你是男孩还是女孩?</font>"
  },
  {
    sourceText: "<font face=\"CreativeBlock BB Bold\" size=\"25\" color=\"#FFFFFF\">Boy</font>",
    translatedText: "<font face=\"CreativeBlock BB Bold\" size=\"25\" color=\"#FFFFFF\">男孩</font>"
  },
  {
    sourceText: "<font face=\"CreativeBlock BB Bold\" size=\"25\" color=\"#FFFFFF\">Girl</font>",
    translatedText: "<font face=\"CreativeBlock BB Bold\" size=\"25\" color=\"#FFFFFF\">女孩</font>"
  },
  {
    sourceText: "<font face=\"CreativeBlock BB Bold\" size=\"35\" color=\"#FFFFFF\">How old are you?</font>",
    translatedText: "<font face=\"CreativeBlock BB Bold\" size=\"35\" color=\"#FFFFFF\">你几岁了?</font>"
  },
  {
    sourceText: "<p align=\"center\"><font face=\"CreativeBlock BB\" size=\"20\" color=\"#FFFFFF\">Change<br/>All</font></p>",
    translatedText: "<p align=\"center\"><font face=\"CreativeBlock BB\" size=\"20\" color=\"#FFFFFF\">全部<br/>重选</font></p>"
  },
  {
    sourceText: "<p align=\"center\"><font face=\"CreativeBlock BB\" size=\"20\" color=\"#FFFFFF\">Change<br/>Colors</font></p>",
    translatedText: "<p align=\"center\"><font face=\"CreativeBlock BB\" size=\"20\" color=\"#FFFFFF\">更换<br/>颜色</font></p>"
  },
  {
    sourceText: "<p align=\"center\"><font face=\"CreativeBlock BB\" size=\"20\" color=\"#FFFFFF\">Import<br/>Look</font></p>",
    translatedText: "<p align=\"center\"><font face=\"CreativeBlock BB\" size=\"20\" color=\"#FFFFFF\">导入<br/>形象</font></p>"
  },
  {
    sourceText: "<font face=\"CreativeBlock BB\" size=\"40\" color=\"#FFFFFF\">Done</font>",
    translatedText: "<font face=\"CreativeBlock BB\" size=\"40\" color=\"#FFFFFF\">完成</font>"
  },
  {
    sourceText: "LOGOUT",
    translatedText: "退出登录"
  },
  {
    sourceText: "Back to Game",
    translatedText: "返回游戏"
  },
  {
    sourceText: "Daily Pop",
    translatedText: "每日活动"
  },
  {
    sourceText: "Store",
    translatedText: "商店"
  },
  {
    sourceText: "Friends",
    translatedText: "好友"
  },
  {
    sourceText: "Home",
    translatedText: "主页"
  },
  {
    sourceText: "ACCOUNT SETTINGS",
    translatedText: "账号设置"
  },
  {
    sourceText: "New photo",
    translatedText: "新照片"
  },
  {
    sourceText: "added!",
    translatedText: "已添加!"
  },
  {
    sourceText: "EXIT",
    translatedText: "退出"
  }
];

function main() {
  const db = openIndexDb();
  const provider = getProviderConfig();
  let insertedCount = 0;

  for (const row of SEEDED_TRANSLATIONS) {
    const sourceText = normalizeSourceText(row.sourceText);
    const translatedText = normalizeTranslatedText(row.translatedText, sourceText);
    db.upsertTranslation({
      genericKey: buildGenericKey(sourceText),
      sourceText,
      translatedText,
      provider: "seeded-ui",
      model: provider.model,
      styleVersion: STYLE_VERSION
    });
    insertedCount += 1;
  }

  db.close();
  printJson({
    ok: true,
    insertedCount,
    provider: "seeded-ui",
    styleVersion: STYLE_VERSION
  });
}

main();
