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
  },
  {
    sourceText: "BEGIN",
    translatedText: "开始",
    forceExact: true
  },
  {
    sourceText: "Continue",
    translatedText: "继续",
    forceExact: true
  },
  {
    sourceText: "HELP",
    translatedText: "帮助",
    forceExact: true
  },
  {
    sourceText: "save",
    translatedText: "保存",
    forceExact: true
  },
  {
    sourceText: "LAUNCH",
    translatedText: "发射",
    forceExact: true
  },
  {
    sourceText: "PLAYER",
    translatedText: "玩家",
    forceExact: true
  },
  {
    sourceText: "Games",
    translatedText: "游戏",
    forceExact: true
  },
  {
    sourceText: "credits",
    translatedText: "制作名单",
    forceExact: true
  },
  {
    sourceText: "AGAIN",
    translatedText: "再来一次",
    forceExact: true
  },
  {
    sourceText: "ANSWER",
    translatedText: "回答",
    forceExact: true
  },
  {
    sourceText: "COLLECT",
    translatedText: "收集",
    forceExact: true
  },
  {
    sourceText: "Collection:",
    translatedText: "收藏:",
    forceExact: true
  },
  {
    sourceText: "Buy More! Click Here",
    translatedText: "购买更多! 点这里",
    forceExact: true
  },
  {
    sourceText: "Your MegaCoins:",
    translatedText: "你的 MegaCoins:",
    forceExact: true
  },
  {
    sourceText: "Island",
    translatedText: "岛屿",
    forceExact: true
  },
  {
    sourceText: "Go",
    translatedText: "前往",
    forceExact: true
  },
  {
    sourceText: "FAIL",
    translatedText: "失败",
    forceExact: true
  },
  {
    sourceText: "Lose",
    translatedText: "失败",
    forceExact: true
  },
  {
    sourceText: "Hit",
    translatedText: "击中",
    forceExact: true
  },
  {
    sourceText: "OPEN",
    translatedText: "打开",
    forceExact: true
  },
  {
    sourceText: "Boy",
    translatedText: "男孩",
    forceExact: true
  },
  {
    sourceText: "Girl",
    translatedText: "女孩",
    forceExact: true
  },
  {
    sourceText: "Air",
    translatedText: "空气",
    forceExact: true
  },
  {
    sourceText: "Band",
    translatedText: "乐队",
    forceExact: true
  },
  {
    sourceText: "Escape",
    translatedText: "逃脱",
    forceExact: true
  },
  {
    sourceText: "Eyes",
    translatedText: "眼睛",
    forceExact: true
  },
  {
    sourceText: "Joe",
    translatedText: "乔",
    forceExact: true
  },
  {
    sourceText: "Man",
    translatedText: "人",
    forceExact: true
  },
  {
    sourceText: "Rocks",
    translatedText: "岩石",
    forceExact: true
  },
  {
    sourceText: "Scar",
    translatedText: "疤痕",
    forceExact: true
  },
  {
    sourceText: "Snow",
    translatedText: "雪",
    forceExact: true
  },
  {
    sourceText: "Soda",
    translatedText: "汽水",
    forceExact: true
  },
  {
    sourceText: "Up",
    translatedText: "上",
    forceExact: true
  },
  {
    sourceText: "ALMOST",
    translatedText: "快",
    forceExact: true
  },
  {
    sourceText: "THERE",
    translatedText: "到了",
    forceExact: true
  },
  {
    sourceText: "background",
    translatedText: "背景",
    forceExact: true
  },
  {
    sourceText: "backdrop",
    translatedText: "布景",
    forceExact: true
  },
  {
    sourceText: "camera",
    translatedText: "摄像机",
    forceExact: true
  },
  {
    sourceText: "safety",
    translatedText: "安全",
    forceExact: true
  },
  {
    sourceText: "launch rabbot",
    translatedText: "发射兔子机器人",
    forceExact: true
  },
  {
    sourceText: "Keep your balance and cross the high",
    translatedText: "保持平衡，穿过高高的",
    forceExact: true
  },
  {
    sourceText: "Live Web Proxy Crawls",
    translatedText: "实时网页代理抓取",
    forceExact: true
  },
  {
    sourceText: "Liveweb proxy is a component of Internet Archive's wayback machine project. The liveweb proxy captures the content of a web page in real time, archives it into a ARC or WARC file and returns the ARC/WARC record back to the wayback machine to process. The recorded ARC/WARC file becomes part of the wayback machine in due course of time.",
    translatedText: "Liveweb 代理是互联网档案馆 Wayback Machine 项目的一部分。它会实时抓取网页内容，归档为 ARC 或 WARC 文件，并把记录交回 Wayback Machine 处理。生成的 ARC/WARC 文件随后会成为 Wayback Machine 档案的一部分。",
    forceExact: true
  },
  {
    sourceText: "Purchase",
    translatedText: "购买",
    forceExact: true
  },
  {
    sourceText: "Music",
    translatedText: "音乐",
    forceExact: true
  },
  {
    sourceText: "Win",
    translatedText: "胜利",
    forceExact: true
  },
  {
    sourceText: "Turn",
    translatedText: "转动",
    forceExact: true
  },
  {
    sourceText: "STARTING",
    translatedText: "启动中",
    forceExact: true
  },
  {
    sourceText: "success",
    translatedText: "成功",
    forceExact: true
  },
  {
    sourceText: "thanks",
    translatedText: "谢谢",
    forceExact: true
  },
  {
    sourceText: "swallow",
    translatedText: "吞下",
    forceExact: true
  },
  {
    sourceText: "Steam",
    translatedText: "蒸汽",
    forceExact: true
  },
  {
    sourceText: "SHOW",
    translatedText: "节目",
    forceExact: true
  }
];

function main() {
  const db = openIndexDb();
  const provider = getProviderConfig();
  let insertedCount = 0;
  let exactSeededCount = 0;

  for (const row of SEEDED_TRANSLATIONS) {
    const sourceText = normalizeSourceText(row.sourceText);
    const translatedText = normalizeTranslatedText(row.translatedText, sourceText);
    const genericKey = buildGenericKey(sourceText);
    db.upsertTranslation({
      genericKey,
      sourceText,
      translatedText,
      provider: "seeded-ui",
      model: provider.model,
      styleVersion: STYLE_VERSION
    });
    if (row.forceExact) {
      exactSeededCount += db.upsertExactTranslationsForGeneric({
        genericKey,
        translatedText,
        provider: "seeded-ui",
        model: provider.model,
        styleVersion: STYLE_VERSION
      });
    }
    insertedCount += 1;
  }

  db.close();
  printJson({
    ok: true,
    insertedCount,
    exactSeededCount,
    provider: "seeded-ui",
    styleVersion: STYLE_VERSION
  });
}

main();
