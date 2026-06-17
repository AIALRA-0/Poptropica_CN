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
    sourceText: "Island",
    translatedText: "岛屿",
    forceExact: true
  },
  {
    sourceText: "Prizes",
    translatedText: "奖品",
    forceExact: true
  },
  {
    sourceText: "Gold Cards",
    translatedText: "金卡",
    forceExact: true
  },
  {
    sourceText: "Costumes",
    translatedText: "服装",
    forceExact: true
  },
  {
    sourceText: "SETTINGS",
    translatedText: "设置",
    forceExact: true
  },
  {
    sourceText: "Sounds",
    translatedText: "声音",
    forceExact: true
  },
  {
    sourceText: "Music",
    translatedText: "音乐",
    forceExact: true
  },
  {
    sourceText: "Sound FX",
    translatedText: "音效",
    forceExact: true
  },
  {
    sourceText: "Your inventory is empty.<br/>Explore the island and see what you can find!",
    translatedText: "背包里还没有物品。<br/>去岛上探索，看看能找到什么！",
    forceExact: true
  },
  {
    sourceText: "You don't have any sponsored items.<br/>Visit the sponsor quests to get<br/>custom costumes and other prizes.",
    translatedText: "你还没有赞助任务物品。<br/>完成赞助任务，<br/>领取专属服装和奖励。",
    forceExact: true
  },
  {
    sourceText: "You don't have any store items yet.<br/>Visit the store to get the<br/>latest costumes and cool stuff.",
    translatedText: "你还没有商店物品。<br/>去商店看看，<br/>获取新服装和酷道具。",
    forceExact: true
  },
  {
    sourceText: "Your closet already has 30 looks. A look must be removed before adding another.",
    translatedText: "衣橱已经存满 30 套造型。请先移除一套，再添加新造型。",
    forceExact: true
  },
  {
    sourceText: "Save up to 30 looks in your very own costume closet with membership!",
    translatedText: "开通会员后，可在专属衣橱中保存最多 30 套造型！",
    forceExact: true
  },
  {
    sourceText: "Save your game to save a look in your very own costume closet.",
    translatedText: "保存游戏后，这套造型会存入你的专属衣橱。",
    forceExact: true
  },
  {
    sourceText: "Please wait while your purchases restore...",
    translatedText: "正在恢复购买内容，请稍候...",
    forceExact: true
  },
  {
    sourceText: "You must be connected to the internet to restore purchases.",
    translatedText: "需要连接互联网才能恢复购买内容。",
    forceExact: true
  },
  {
    sourceText: "USE",
    translatedText: "使用",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "VIEW",
    translatedText: "查看",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "EXAMINE",
    translatedText: "查看",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "EQUIP",
    translatedText: "装备",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "REMOVE",
    translatedText: "移除",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "PUT ON",
    translatedText: "穿上",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "TAKE OFF",
    translatedText: "脱下",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "PUT AWAY",
    translatedText: "收起",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "COSTUMIZE",
    translatedText: "换装",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "CHEW",
    translatedText: "咀嚼",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Island Medallion",
    translatedText: "岛屿奖章",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Cloth",
    translatedText: "布料",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Lamp",
    translatedText: "油灯",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Compass",
    translatedText: "指南针",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Hammer",
    translatedText: "锤子",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Bow",
    translatedText: "弓",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Key",
    translatedText: "钥匙",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Rope",
    translatedText: "绳子",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Egg",
    translatedText: "蛋",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Fruit",
    translatedText: "水果",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Guano",
    translatedText: "鸟粪",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Cake",
    translatedText: "蛋糕",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Helmet",
    translatedText: "头盔",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Script",
    translatedText: "剧本",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Painting",
    translatedText: "画作",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Sunflower",
    translatedText: "向日葵",
    forceExactSource: true,
    exactOnly: true
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
    translatedText: "你的超级币：",
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
  },
  {
    sourceText: "THE",
    translatedText: "这份",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "PAPER",
    translatedText: "报纸",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "the",
    translatedText: "这",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "The",
    translatedText: "这",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "That",
    translatedText: "那",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "not",
    translatedText: "不",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "how",
    translatedText: "如何",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "BUG",
    translatedText: "虫子",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "end",
    translatedText: "结束",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "GG.",
    translatedText: "打得好。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "HAZARD",
    translatedText: "危险",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Poptropolis",
    translatedText: "Poptropolis 运动会",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Poptropolis (AS2)",
    translatedText: "Poptropolis 运动会 (AS2)",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "PoptropiCon",
    translatedText: "PoptropiCon 漫展",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Fair in 1893! Before",
    translatedText: "1893 年的世界博览会！在此之前",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "close-up shot.",
    translatedText: "特写镜头。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "sight to get your shot.",
    translatedText: "瞄准目标再拍摄。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "fish hook",
    translatedText: "鱼钩",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "turkey:",
    translatedText: "火鸡：",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "about him:",
    translatedText: "关于他：",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "must remain vigilant!",
    translatedText: "必须保持警惕！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "discard my lucky pants. No",
    translatedText: "扔掉我的幸运裤。不",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "and explain to her that a",
    translatedText: "并向她解释，",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "those bizarrely mismatched",
    translatedText: "那些奇怪不搭的",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "missing!\" Behind her is a",
    translatedText: "不见了！”她身后有一",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "the eggshell repeatedly!",
    translatedText: "反复敲蛋壳！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "them first?",
    translatedText: "先装备它们吗？",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Journal:",
    translatedText: "日志：",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "passed through our town as he was",
    translatedText: "路过我们镇时，他正",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "making his way to the big city. \"Leave",
    translatedText: "前往大城市。“别",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "me alone! You people are crazy!\" said",
    translatedText: "管我！你们都疯了！”",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "in time.",
    translatedText: "及时。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "and you'll be thrown off!",
    translatedText: "否则你会被甩下来！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "the paint type is as claimed.",
    translatedText: "油漆种类是否如其所称。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "apprehended.",
    translatedText: "被逮捕。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "the steps below:",
    translatedText: "下面的步骤：",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "to obliterate every virus you encounter.",
    translatedText: "消灭你遇到的每一个病毒。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Nano-Combat Training mini-game.",
    translatedText: "纳米战斗训练小游戏。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "species of sharks.",
    translatedText: "种鲨鱼。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "the passcode.",
    translatedText: "密码。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "B.A.D. Control Center",
    translatedText: "B.A.D. 控制中心",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "closet with Membership!",
    translatedText: "会员专属衣橱！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "pick a different one.",
    translatedText: "换一个吧。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Home Island is the launching pad for your Poptropica adventure. Get new outfits and change your look in the shops. Visit the arcade to make friends, chat, and compete with other players. Try the Photo Booth to create and share unique Poptropica pictures. And keep an eye out for new characters and quests!",
    translatedText: "家园岛是你展开 Poptropica 冒险的起点。去商店换新装、改变造型；到街机厅结交朋友、聊天并和其他玩家比赛；还可以试试照相亭，制作并分享独一无二的 Poptropica 照片。也别忘了留意新角色和新任务！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "MISCELLANY",
    translatedText: "杂货铺",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "HABERDASHERY",
    translatedText: "帽饰店",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "threatens Poptropica!",
    translatedText: "威胁着 Poptropica！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "automatically.",
    translatedText: "自动完成。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "are you?",
    translatedText: "是吗？",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "THE FPS",
    translatedText: "帧率",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Lady GaGa: Poker ...",
    translatedText: "Lady Gaga 的歌：《Poker...》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Guns n' Roses: Sweet Child O' ...",
    translatedText: "Guns N' Roses 的歌：《Sweet Child O'...》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Dropkick Murphys: Shipping Up to ...",
    translatedText: "Dropkick Murphys 的歌：《Shipping Up to...》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Led Zeppelin: Stairway to ...",
    translatedText: "Led Zeppelin 的歌：《Stairway to...》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Michael Jackson: Billie ...",
    translatedText: "Michael Jackson 的歌：《Billie...》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Beatles: Hey ...",
    translatedText: "The Beatles 的歌：《Hey...》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Weezer: Pork and ...",
    translatedText: "Weezer 的歌：《Pork and...》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Bon Jovi: Wanted Dead or ...",
    translatedText: "Bon Jovi 的歌：《Wanted Dead or...》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Lady GaGa: Poker ...",
    translatedText: "Lady Gaga：《扑克脸》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Guns n' Roses: Sweet Child O' ...",
    translatedText: "枪炮与玫瑰：《甜蜜孩子》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Dropkick Murphys: Shipping Up to ...",
    translatedText: "踢踏墨菲乐队：《奔赴波士顿》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Led Zeppelin: Stairway to ...",
    translatedText: "齐柏林飞艇：《天堂阶梯》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Michael Jackson: Billie ...",
    translatedText: "迈克尔·杰克逊：《比莉·珍》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Beatles: Hey ...",
    translatedText: "披头士乐队：《嘿，裘德》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Weezer: Pork and ...",
    translatedText: "威泽乐队：《猪肉和豆子》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Bon Jovi: Wanted Dead or ...",
    translatedText: "邦·乔维：《死活通缉》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Erik Weisz looks a lot like Harry Houdini. Could they be the same person?",
    translatedText: "埃里克·韦斯看起来很像哈里·胡迪尼。他们会不会是同一个人？",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Houdini? The Harry Houdini? You should take a closer look in his cabin.",
    translatedText: "胡迪尼？那个大名鼎鼎的哈里·胡迪尼？你该去他的包厢仔细看看。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Like most Americans, Houdini is a thief. Did you know he stole his name from the French magician Robert Houdin?",
    translatedText: "和大多数美国人一样，胡迪尼是个小偷。你知道他的艺名是从法国魔术师罗贝尔·乌丹那里借来的吗？",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "I don't recall seeing Weisz onboard. I'm sure I would have recognized him. Everyone knows Houdini!",
    translatedText: "我不记得在车上见过韦斯。我肯定能认出他。谁不知道胡迪尼啊！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "I did think it was strange that this Weisz fellow was onboard with so many celebrities.",
    translatedText: "我确实觉得奇怪，这个韦斯怎么会和这么多名人同车。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Poptanium crystals",
    translatedText: "波普坦矿晶体",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Dig for Poptanium and destroy materials",
    translatedText: "挖掘波普坦矿并破坏材料",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "use poptanium to build",
    translatedText: "使用波普坦矿建造",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "mine for poptanium",
    translatedText: "开采波普坦矿",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "difficulties with Realms right now.",
    translatedText: "创世空间目前遇到技术问题。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "To play Realms",
    translatedText: "要玩创世空间",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "to play Realms!",
    translatedText: "才能玩创世空间！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Yes, I'd like to try Realms now.",
    translatedText: "是的，我想现在试试创世空间。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "I'll look into Realms later.",
    translatedText: "我稍后再了解创世空间。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Enter your www.poptropica.com username and password to import your web avatar's look.",
    translatedText: "输入你的 www.poptropica.com 用户名和密码，导入网页角色造型。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Mom told me to keep an eye on Sissy. She'd better not get lost in the Mirror Maze.",
    translatedText: "妈妈让我看好茜茜。她最好别在镜子迷宫里走丢。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Bubby's gonna win me a teddy bear! Mommy said so!",
    translatedText: "巴比会给我赢一个泰迪熊！妈妈说的！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Darn, that Edgar! He can't get enough of my fried dough, and now I'm out of sugar!",
    translatedText: "可恶，那个埃德加！他总吃不够我的油炸面团，现在糖都用完了！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Maybe Cam wasn't crazy after all.",
    translatedText: "也许卡姆根本没疯。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Cam loses all track of time when he's down there. He could wreck the equipment.",
    translatedText: "卡姆一潜下去就忘了时间，他可能会把设备弄坏。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Cosmoe needs this for his nuclear hibachi.",
    translatedText: "科斯莫的核能烤炉需要这个。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "I blew it. Cosmoe is really sore at me.",
    translatedText: "我搞砸了。科斯莫现在很生我的气。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Who's Cosmoe?",
    translatedText: "科斯莫是谁？",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "From the hit graphic novel comes the zaniest Poptropica adventure yet. Hop aboard the Neon Wiener for an intergalactic voyage with Cosmoe, Humphree, and Princess Dagger!",
    translatedText: "畅销漫画改编，Poptropica 史上最疯狂的冒险来了。登上霓虹热狗号，与科斯莫、汉弗里和达格公主一起开启星际航行。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Your MegaCoins:",
    translatedText: "你的超级币：",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "I've hacked a backdoor exploit that will allow you to bypass the MegaFightingBots paywall. Get in there and find our missing programmer!",
    translatedText: "我黑进了一个后门漏洞，可以让你绕过《超级格斗机器人》的付费墙。进去找到我们失踪的程序员！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Maybe we can re-hire him now that MegaFightingBots is kaput.",
    translatedText: "既然《超级格斗机器人》完蛋了，也许我们现在可以重新雇他。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "MegaFightingBots... Figures. They poached my best coder months ago!",
    translatedText: "《超级格斗机器人》……难怪。他们几个月前就挖走了我最好的程序员！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "We are the enemies who have been hiding in plain sight! Surprise: we own both Poptropica and MegaFightingBots.com!",
    translatedText: "我们就是一直藏在你眼皮底下的敌人！没想到吧：Poptropica 和超级格斗机器人网站都是我们的！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Can I have some Pop Coins?",
    translatedText: "能给我些波普币吗？",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Here's your Pop Coin, you thieving cheapskate.",
    translatedText: "给你波普币，你这个抠门小偷。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "No, now I'm handing out counterfeit Pop Coins. It's my revenge!",
    translatedText: "不，我现在在发假波普币。这是我的报复！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Literally everything! Want to feed your pet? 1 Pop Coin. Want to get on the blimp? 1 Pop Coin.",
    translatedText: "真的是所有东西！想喂宠物？1 枚波普币。想坐飞艇？1 枚波普币。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "If you don't like it, you're welcome to replace it with your own, less-annoying ad. Come see me when you have enough Pop Coins.",
    translatedText: "如果你不喜欢，欢迎你用自己不那么烦人的广告来替换。攒够波普币后来找我。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "They fixed the bug with my speech! If only I had something worthwhile to say...",
    translatedText: "他们修好了我说话的漏洞！可惜我没什么值得说的……",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Poptropica is under new management, and it's falling apart at the seams! The newest Island isn't finished, the staff is nowhere to be found, and you can't take two steps without running into a game-breaking bug. Get ready to go behind the scenes for your most important adventure yet - because this time, you've got to save Poptropica itself!",
    translatedText: "Poptropica 换了新管理层，现在简直一团糟！最新的岛还没完工，工作人员全都不见踪影，走两步就会遇到毁游戏的漏洞。准备好深入幕后，开启你最重要的冒险吧，因为这次你得拯救 Poptropica 本身！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "I'm the Cost-cutter, but my friends call me Slash. Actually I don't have friends, but if I did, they'd call me Slash!",
    translatedText: "我是成本削减员，但朋友们叫我斯拉什。其实我没有朋友，但如果有，他们会叫我斯拉什！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Why do they call you Slash? Do you play the guitar?",
    translatedText: "为什么他们叫你斯拉什？你弹吉他吗？",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Senor Burrito is just the prettiest, cutest, fuzzy-wuzziest.",
    translatedText: "布利托先生真是最漂亮、最可爱、毛茸茸的小家伙。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Aw, Senior Burrito likes you. That's how I know a good person when I see one.",
    translatedText: "哇，布利托先生喜欢你。我一看就知道你是好人。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Sorry, I had a big lunch order from GloboChem. I won't have any extra falafel for a while.",
    translatedText: "抱歉，我刚接到环球化工的大午餐订单。暂时没有多余的鹰嘴豆泥饼了。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "The Panacea prototype can shoot a basic projectile and use a handy laser scalpel. We'll also test some upgrades along the way.",
    translatedText: "万能号原型机可以发射基础弹丸，还能使用方便的激光手术刀。沿途我们也会测试一些升级功能。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "When Dr. Spyglass",
    translatedText: "当望远镜博士",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "you've completed the Back Lot",
    translatedText: "你已完成摄影棚岛",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Big Nate Island to celebrate the",
    translatedText: "人们在大内特岛上埋下了一个",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Nate beat you to",
    translatedText: "大内特抢先一步",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "She is too attentive for me to sneak past, maybe total can help me distract her.",
    translatedText: "她太警觉了，我溜不过去，也许小全能能帮我引开她。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Great -- now Total is stuck in there!",
    translatedText: "糟了，现在小全能卡在里面了！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Lady GaGa: Poker ...",
    translatedText: "嘎嘎小姐：《扑克脸》",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Lucas stayed in room 52 and is reported to have ordered pizza from Leoni's during",
    translatedText: "卢卡斯住在 52 号房，据称入住期间从莱奥尼披萨店订了披萨",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Nice try, but to earn the Poptropolis",
    translatedText: "表现不错，但要赢得波普特罗波利斯",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Who will you represent in the Poptropolis Games?",
    translatedText: "你将在波普特罗波利斯运动会中代表哪个部落？",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "An Astrozone store is located on",
    translatedText: "星域商店坐落于",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "this popular moon. Astrozone repairs and builds",
    translatedText: "这颗热门卫星上。星域商店负责维修和建造",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "<Running boot sequence rev 1.04",
    translatedText: "<正在运行启动序列，版本 1.04",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "<Running Dr. Hare virus scan rev 2.5",
    translatedText: "<正在运行海尔博士病毒扫描，版本 2.5",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Thanks everybody, and thank you, Amelia!",
    translatedText: "谢谢大家，也谢谢你，阿米莉亚！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "A journey of infinite discovery awaits you in Poptropica Realms. Create a brand-new world, and then use the power of Svadilfari to shape it into any form you can dream. Explore randomly generated terrain. Meet strange creatures. Build never-before-seen structures. Then share your creations with the world! In Poptropica Realms, the only limit is your imagination!",
    translatedText: "在 Poptropica 创世空间中，一场无限探索的旅程正等待着你。创造一个全新的世界，然后利用斯瓦迪尔法利的力量，将它塑造成你梦想中的任何形态。探索随机生成的地形，遇见奇异的生物，建造前所未见的建筑，并与全世界分享你的创作！在 Poptropica 创世空间里，唯一的限制就是你的想象力！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "We can't let Cam back into the sub. It's for his own safety!",
    translatedText: "不能让卡姆再进潜水艇了，这是为了他的安全！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "We're on an expedition for Cam Jameson's fish film. Whether he'll finish it is another story.",
    translatedText: "我们在为卡姆·詹姆森的鱼类纪录片进行探险，至于他能不能拍完就是另一回事了。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Weeks! Cam spends so much time in the sub that we had to lock it up for his own safety.",
    translatedText: "好几周了！卡姆在潜水艇里待得太久，我们不得不把它锁起来，免得他出事。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "I should come up with a clever name for these coins.... Maybe Pop Bucks! Or Pop-Sheckles? Poptropi-Currency?",
    translatedText: "我得给这些硬币起个聪明的名字……叫波普元？波普谢克尔？还是波普货币？",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "The Banana Heads, Popzart,",
    translatedText: "香蕉头乐队、波普扎特乐队、",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "I don't think Flambe ever actually trained at Le Cordon Bleu in Paris. This food is terrible.",
    translatedText: "我看弗朗贝根本没在巴黎蓝带厨艺学校培训过。这食物太难吃了。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "If you can trade me the Fremulon mask from the booth, i'll give up my spot.",
    translatedText: "如果你能把摊位上的弗雷穆隆面具换给我，我就把位置让给你。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "If you can find out what time the cosplay contest is, i'll give you my spot.",
    translatedText: "如果你能打听到角色扮演比赛的时间，我就把位置让给你。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "I still have no idea what zazzleblax is.",
    translatedText: "我还是不知道扎兹布拉克斯是什么。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Poptropolis Games",
    translatedText: "波普特罗波利斯运动会",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Poptropolis",
    translatedText: "波普特罗波利斯运动会",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Poptropolis (AS2)",
    translatedText: "波普特罗波利斯运动会 (AS2)",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Feeling mighty? Play the older AS2 version of the Poptropolis Games, and fight your way to the top of the scoreboard!",
    translatedText: "觉得自己很强？来玩旧版 AS2 的波普特罗波利斯运动会，一路冲上排行榜榜首吧！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Your tribe reigns supreme-- until the next Poptropolis Games.",
    translatedText: "你们的部落将保持至高荣耀，直到下一届波普特罗波利斯运动会。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Ladies and gentlemen, it is my honor to welcome you to the centennial Poptropolis Games!",
    translatedText: "女士们先生们，很荣幸欢迎你们来到百年波普特罗波利斯运动会！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Let the Poptropolis Flame illuminate this contest and ignite our thirst for victory!",
    translatedText: "让波普特罗波利斯圣火照亮这场竞赛，点燃我们对胜利的渴望！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "In the Poptropolis Games, there can be only one winner. I present to you the grand champion of all Poptropica...",
    translatedText: "在波普特罗波利斯运动会中，只能有一位胜者。现在，我将向你们介绍整个 Poptropica 的至高冠军……",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "I'm the official scorekeeper for the Poptropolis Games. Come back and see me whenever you want to know the rankings.",
    translatedText: "我是波普特罗波利斯运动会的官方记分员。想了解排名的话，随时可以来找我。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "What are the Poptropolis Games?",
    translatedText: "波普特罗波利斯运动会是什么？",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "I couldn't believe my eyes--the city of Poptropolis rose right up from the sea!",
    translatedText: "我简直不敢相信自己的眼睛，波普特罗波利斯城竟然从海里升起来了！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "My parents and grandparents never got to see the Poptropolis Games, but I do!",
    translatedText: "我的父母和祖父母都没机会看到波普特罗波利斯运动会，但我看到了！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Hey, what happened to the Poptropolis Games?",
    translatedText: "嘿，波普特罗波利斯运动会怎么了？",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Head into the diving chamber and help your tribe raise the Poptropolis Games!",
    translatedText: "进入潜水舱，帮你的部落把波普特罗波利斯运动会打捞上来吧！",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Dont give up! Without the Poptropolis Games Im nothing but a good-looking guy with a microphone.",
    translatedText: "别放弃！没有波普特罗波利斯运动会，我就只是个拿着麦克风的帅哥而已。",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Share on Facebook",
    translatedText: "分享到脸书",
    forceExactSource: true,
    exactOnly: true
  },
  {
    sourceText: "Share on Twitter",
    translatedText: "分享到推特",
    forceExactSource: true,
    exactOnly: true
  }
];

function main() {
  const db = openIndexDb();
  const provider = getProviderConfig();
  let insertedCount = 0;
  let exactSeededCount = 0;
  let sourceExactSeededCount = 0;

  for (const row of SEEDED_TRANSLATIONS) {
    const sourceText = normalizeSourceText(row.sourceText);
    const translatedText = normalizeTranslatedText(row.translatedText, sourceText);
    const genericKey = buildGenericKey(sourceText);
    if (!row.exactOnly) {
      db.upsertTranslation({
        genericKey,
        sourceText,
        translatedText,
        provider: "seeded-ui",
        model: provider.model,
        styleVersion: STYLE_VERSION
      });
    }
    if (row.forceExactSource) {
      sourceExactSeededCount += db.upsertExactTranslationsForSource({
        sourceText,
        translatedText,
        provider: "seeded-ui",
        model: provider.model,
        styleVersion: STYLE_VERSION
      });
    }
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
    sourceExactSeededCount,
    provider: "seeded-ui",
    styleVersion: STYLE_VERSION
  });
}

main();
