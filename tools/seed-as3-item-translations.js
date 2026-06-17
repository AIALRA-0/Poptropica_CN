const { DatabaseSync } = require("node:sqlite");
const { printJson } = require("./lib/cli");
const { openIndexDb } = require("./lib/db");
const paths = require("./lib/paths");
const { isProtectedTranslationRow } = require("./lib/translation-guards");
const { STYLE_VERSION } = require("./lib/translator");

const PROVIDER = "seeded-as3-item";
const MODEL = "curated-zh-cn";

const QUEST_NAMES = {
  "24 Carrot": "24 胡萝卜岛",
  "Arabian Nights - Episode 1": "阿拉伯之夜第 1 集",
  "Arabian Nights - Episode 2": "阿拉伯之夜第 2 集",
  "Arabian Nights - Episode 3": "阿拉伯之夜第 3 集",
  "First Island": "第一座岛",
  "Galactic Hot Dogs": "银河热狗岛",
  "Home Island": "家园岛",
  "Mission Atlantis - Episode 1": "亚特兰蒂斯任务第 1 集",
  "Mission Atlantis - Episode 2": "亚特兰蒂斯任务第 2 集",
  "Mission Atlantis: Out of the Blue": "亚特兰蒂斯任务：冲出蓝海",
  "Mocktropica": "模拟世界岛",
  "Monster Carnival": "怪物嘉年华岛",
  "Mystery of the Map": "神秘地图岛",
  "Mythology Island": "神话岛",
  "Pelican Rock": "鹈鹕岩监狱岛",
  "Poptropolis": "波普特罗波利斯运动会",
  "Poptropicon": "PoptropiCon 漫展岛",
  "Shrink Ray Island": "缩小光线岛",
  "Survival - Episode 1": "荒野求生第 1 集",
  "Survival - Episode 2": "荒野求生第 2 集",
  "Survival - Episode 3": "荒野求生第 3 集",
  "Survival - Episode 4": "荒野求生第 4 集",
  "Survival - Episode 5": "荒野求生第 5 集",
  "Timmy Failure": "蒂米失败岛",
  "Time Tangled": "时间错乱岛",
  "Virus Hunter": "病毒猎人岛"
};

const EXACT = {
  "A corner of a larger map.": "一张更大地图的一角。",
  "Divination Dust": "占卜粉",
  "Galvanized Nail": "镀锌钉",
  "Have some lemonade, Dude.": "喝点柠檬水吧，老兄。",
  "It's a broken piece of colorful stone work.": "这是一块彩色石雕的碎片。",
  "Play another card on your remaining action slot.": "在剩余的行动格上再打出一张牌。",
  "Press ACTION to ready your defense!": "按动作键准备防御！",
  "Press ACTION to unleash the power!": "按动作键释放力量！",
  "Skeleton Key": "万能钥匙",
  "Smash through objects like a raging bull in the Shrink Shot mini game!": "在缩小射击小游戏里像暴怒公牛一样撞碎障碍！",
  "With this tool you can cut through wire.": "用这个工具可以剪断电线。",
  "A small study model of the Statue of Liberty": "自由女神像的小型研究模型。",
  "A well used sword.": "一把久经使用的剑。",
  "Access Super Jump in Mine Mode.": "在采矿模式中解锁超级跳跃。",
  "Access this ability in Mine Mode.": "在采矿模式中使用这项能力。",
  "Always wear your trusty hard hat in case you, or worse, something else falls off a tall structure.": "一定要戴好可靠的安全帽，以防你自己，或者更糟的别的东西，从高处掉下来。",
  "Ancient Warrior Outfit": "古代战士套装",
  "Armory Key": "军械库钥匙",
  "ASSEMBLE": "组装",
  "Atlantis Captain": "亚特兰蒂斯船长",
  "Axe Handle": "斧柄",
  "Backpack Straps": "背包肩带",
  "Bag of Wind": "风袋",
  "Battle Axe": "战斧",
  "Battle the bots": "迎战机器人",
  "Beach Ball": "沙滩球",
  "Bear Claw": "熊爪",
  "Black Lightbulb": "黑光灯泡",
  "Block your opponent's action if it is of equal or lesser value.": "如果对手的行动值不高于此牌，就阻挡该行动。",
  "Blunted Dart": "钝头飞镖",
  "Bon Bons": "夹心糖果",
  "Bone Meal": "骨粉",
  "Bounce Ball": "弹力球",
  "Bounce more in the Shrink Shot mini game!": "在缩小射击小游戏里弹得更高！",
  "Bowl of Milk": "一碗牛奶",
  "Bucket Bot Costume": "水桶机器人服装",
  "Bucket of Ink": "一桶墨水",
  "Bully Bot Costume": "恶霸机器人服装",
  "Burlap Sack": "粗麻袋",
  "Buy costumes, powers and more&#10;in the store!": "去商店购买服装、能力&#10;和更多好东西！",
  "Cake": "蛋糕",
  "CALL NUMBER": "拨打号码",
  "Camel Bridle": "骆驼缰绳",
  "Can you feel the power?": "你感受到这股力量了吗？",
  "Candy Bar": "巧克力棒",
  "Card Deck": "卡组",
  "Carrot Transporter": "胡萝卜传送器",
  "Cat": "猫",
  "Cat Burglar Costume": "飞贼服装",
  "Cell Phone": "手机",
  "Cheese Curds": "奶酪凝乳",
  "Chemical X": "X 化学剂",
  "Chemical X Formula": "X 化学剂配方",
  "Chicken Nuggets": "鸡块",
  "CLASSIC FLAVOR": "经典口味",
  "Climbing Axe": "登山斧",
  "Cloth": "布料",
  "Cola Soft Drink": "可乐汽水",
  "Comic Book Cover": "漫画书封面",
  "Compass": "指南针",
  "Copper Penny": "铜便士",
  "Cotton Candy": "棉花糖",
  "Counterfeit Coins": "假硬币",
  "Crispin Flavius's Car Keys": "克里斯平·弗拉维乌斯的车钥匙",
  "Crispy Rice Treats": "脆米点心",
  "Crown Jewel": "王冠宝石",
  "Cryptids Nessie Hat": "尼斯湖水怪帽",
  "Cup of Oil": "一杯油",
  "Cup of Plaster": "一杯石膏",
  "Cup of Water": "一杯水",
  "DC Diner": "DC 餐馆",
  "Dear Diary - open up!": "亲爱的日记，快打开！",
  "Declaration of Independence": "独立宣言",
  "Designer's ID Badge": "设计师工牌",
  "Developer's ID Badge": "开发者工牌",
  "Diary Key": "日记钥匙",
  "Dirt Claude": "泥土克劳德",
  "Dossier": "档案",
  "Double Vision": "双重视野",
  "Drachma": "德拉克马银币",
  "Draw an extra card from your deck.": "从你的牌组额外抽一张牌。",
  "Drill Bit": "钻头",
  "Dr.Smartypants": "聪明裤博士",
  "Drone Ears": "无人兔耳",
  "Dry Kindling": "干柴",
  "Dummy Head": "假人头",
  "Earth Day Shirt": "地球日衬衫",
  "Egg": "蛋",
  "Elf Archer": "精灵弓手",
  "Empty Bowl": "空碗",
  "Empty Bucket": "空桶",
  "Empty Pitcher": "空水罐",
  "Energy Drink": "能量饮料",
  "Energy Drinks": "能量饮料",
  "Extra Card": "额外卡牌",
  "Extra Reach": "额外射程",
  "Falafel": "鹰嘴豆泥饼",
  "Fashion Ninja": "时尚忍者",
  "Feel the Power": "感受力量",
  "Fishhook": "鱼钩",
  "Fishing Pole": "钓竿",
  "Fishing Suit": "钓鱼服",
  "Flint": "燧石",
  "Float longer and go further in the Shrink Shot mini game!": "在缩小射击小游戏里漂浮更久、飞得更远！",
  "Flying Ace": "飞行王牌",
  "FOLLOW": "跟随",
  "For the Summer Fashionista.": "献给夏日时尚达人。",
  "For your underwater adventures.": "适合你的水下冒险。",
  "Fremulon Mask": "弗雷穆隆面具",
  "Fremulon Pamphlet": "弗雷穆隆宣传册",
  "Fried Dough": "炸面团",
  "Fruit": "水果",
  "Fuel Cell": "燃料电池",
  "Full Pitcher": "满水罐",
  "Garbanzo Man Mask": "鹰嘴豆侠面具",
  "Gardening Shears": "园艺剪",
  "Gear": "齿轮",
  "Gelatin Salad": "明胶沙拉",
  "Geode Crystals": "晶洞水晶",
  "Geode Rock": "晶洞岩",
  "Giant Pearl": "巨型珍珠",
  "Giant Spatula": "巨型锅铲",
  "Glider": "滑翔翼",
  "Glyph 1": "刻文 1",
  "Glyph 2": "刻文 2",
  "Glyph 3": "刻文 3",
  "Glyph 4": "刻文 4",
  "Glyph 5": "刻文 5",
  "Glyph 6": "刻文 6",
  "Gold Face": "金面侠",
  "Golden Apple": "金苹果",
  "Golden Lamp": "金灯",
  "Golden Vase": "金花瓶",
  "Go forth and change the world!": "出发吧，去改变这个世界！",
  "GRAPE FLAVOR": "葡萄口味",
  "Guano": "鸟粪",
  "Gun Powder": "火药",
  "Hades' Crown": "哈迪斯的王冠",
  "Handbook Page": "手册页",
  "Handbook Pages": "手册页",
  "Hard Helmet": "硬头盔",
  "Hats": "帽子",
  "Haunted House": "鬼屋",
  "HELIO FLAVOR": "太阳口味",
  "Helmet": "头盔",
  "Hench-bot": "爪牙机器人",
  "Human Fly Mask": "苍蝇人面具",
  "Hydra Scale": "九头蛇鳞片",
  "If at first you don't succeed, pry, pry again.": "一次撬不开，就再撬一次。",
  "Ivory Camel": "象牙骆驼",
  "Jetpack Instructions": "喷气背包说明",
  "K-Man": "K 侠",
  "Key": "钥匙",
  "Knock through objects with greater ease in the Shrink Shot mini game!": "在缩小射击小游戏里更轻松地撞穿物体！",
  "Ladybug": "瓢虫",
  "Lamp": "油灯",
  "Legendary Swords": "传奇之剑",
  "Lemon Shark": "柠檬鲨",
  "Lens": "镜片",
  "Livin' La Vida Caliente.": "过一把热辣人生。",
  "LUCKY SHAMROCK FLAVOR": "幸运三叶草口味",
  "Maegashira": "前头",
  "Magic Book": "魔法书",
  "Magic Carpet": "魔毯",
  "Magic Sand": "魔法沙",
  "Magic Sand Formula": "魔法沙配方",
  "Magician's Hat": "魔术师帽",
  "Manifest": "货单",
  "Map-o-Sphere": "地图球",
  "Master Creator!": "创世大师！",
  "Meow-bot": "喵喵机器人",
  "Metal Cup": "金属杯",
  "Mighty Action Force Comic #178": "强力行动队漫画 #178",
  "Mighty Action Force Comic #367": "强力行动队漫画 #367",
  "Mission Printout": "任务打印件",
  "Mittens": "手套",
  "Mixer With Drill Bit": "装上钻头的搅拌器",
  "Modern Era Shield": "现代盾牌",
  "Money": "钱",
  "Moondust": "月尘",
  "Morse Code Key": "摩尔斯电码表",
  "Mutton Chops": "络腮胡",
  "Mystery Formula": "神秘配方",
  "Mysterious Glyphs": "神秘刻文",
  "Never leave home without it.": "出门绝不能少了它。",
  "Night Vision Goggles": "夜视镜",
  "NOT ALLOWED HERE": "这里不能使用",
  "Omegon Suit": "奥米冈套装",
  "ORGANIZE": "整理",
  "Owl": "猫头鹰",
  "Ozeki": "大关",
  "Painted Dummy Head": "上色的假人头",
  "Painted Pasta": "上色的意面",
  "Painting": "画作",
  "PDC ID Badge": "PDC 工牌",
  "Peace Medal": "和平奖章",
  "Permanent Marker": "永久记号笔",
  "Pet Bird Follower": "宠物鸟跟随者",
  "Petri Dish": "培养皿",
  "Photo": "照片",
  "Pickle Juice": "泡菜汁",
  "Piece of Paper": "一张纸",
  "Piece of Stone": "石块碎片",
  "Pipe Tune": "排箫曲谱",
  "Plow through obstacles like a Poptropican wrecking ball in the Shrink Shot mini game!": "在缩小射击小游戏里像 Poptropica 破坏球一样冲破障碍！",
  "Pocket Knife": "小折刀",
  "Pony Girl": "小马女孩",
  "POPGUM": "波普口香糖",
  "Poptropica Graphic Novel, Book 1": "Poptropica 图像小说第 1 册",
  "Poptropica Graphic Novel, Book 2": "Poptropica 图像小说第 2 册",
  "Poseidon's Trident": "波塞冬的三叉戟",
  "Positively negative.": "正好是负极。",
  "Power Amulet": "力量护符",
  "Powered Electron Pulse": "充能电子脉冲",
  "Prison Files": "监狱档案",
  "Prison Key": "牢房钥匙",
  "Prisoner Costume": "囚犯服装",
  "Propeller Hat": "螺旋桨帽",
  "Puzzle Key": "拼图钥匙",
  "Rare Flower": "稀有花朵",
  "READ NOW": "立即阅读",
  "Reed Pipe": "芦苇排箫",
  "Remote Control": "遥控器",
  "Research Journal": "研究日志",
  "Resistance Band": "弹力带",
  "Ring from the Minotaur": "弥诺陶洛斯的戒指",
  "Roc Feather": "神鸟羽毛",
  "Rope": "绳子",
  "Rusty Relic": "生锈遗物",
  "Sacred Item": "圣物",
  "Sacred Items Scroll": "圣物卷轴",
  "Salt Formula": "盐配方",
  "Salt Rocks": "盐块",
  "Sanyaku": "三役",
  "Sasha's Calling Card": "萨莎的名片",
  "Scarf": "围巾",
  "Scuba Gear": "潜水装备",
  "Screw Driver": "螺丝刀",
  "Sea Creature Files": "海洋生物档案",
  "Secret Message": "秘密信息",
  "Security Code": "安保密码",
  "Seed Pod": "种荚",
  "Seeds": "种子",
  "Senor Burrito": "布利托先生",
  "Sesame Oil": "芝麻油",
  "Sharpened Dart": "磨尖的飞镖",
  "Sharpened Spoon": "磨尖的勺子",
  "Shoelace": "鞋带",
  "Shredded Documents": "碎纸文件",
  "Shrink Ray Medallion": "缩小光线奖章",
  "Silver Age Shield": "白银时代盾牌",
  "Skip a turn": "跳过一回合",
  "Skull Mask": "骷髅面具",
  "Slackin' in the sun.": "在阳光下偷个闲。",
  "Smoke Bombs": "烟雾弹",
  "Soda Pop Bottle": "汽水瓶",
  "Souvenir Cup": "纪念杯",
  "Spiked Bounce Ball": "尖刺弹力球",
  "Spray Tan!": "喷雾美黑！",
  "Spy Glass": "望远镜",
  "Statuette of Liberty": "自由女神小雕像",
  "Steal A Gem": "偷取宝石",
  "Steal one gem from your opponent.": "从对手那里偷取一颗宝石。",
  "Sticks of Gum": "口香糖条",
  "Stone Bowl": "石碗",
  "STOP CHEWING": "停止咀嚼",
  "Sugar Formula": "糖配方",
  "Sunflower": "向日葵",
  "Super Agility": "超级敏捷",
  "Super Bouncy Ball": "超级弹力球",
  "Super Hard Helmet": "超硬头盔",
  "Survival Handbook": "求生手册",
  "Svadilfari": "斯瓦迪尔法利",
  "System Password": "系统密码",
  "Tainted Meat": "污染的肉",
  "Tap the ACTION button to cast your line!": "点按动作按钮抛出鱼线！",
  "Tap the ACTION button to show your might!": "点按动作按钮展示力量！",
  "Tap the ACTION button to unleash the power!": "点按动作按钮释放力量！",
  "Tap the ACTION to use!": "点按动作按钮使用！",
  "Teen Arachnid": "少年蛛侠",
  "The Bolt": "闪电",
  "The bowl is now filled with milk.": "碗里现在盛满了牛奶。",
  "The fruit of the gods.": "众神的果实。",
  "The words \"peace\" and \"friendship\" have been engraved on this silver medal.": "这枚银质奖章上刻着“和平”和“友谊”两个词。",
  "These goggles are designed for high altitude climbing.": "这副护目镜专为高海拔攀爬设计。",
  "These will will make you look like a bunny drone.": "戴上它们后，你会看起来像兔子无人机。",
  "This amulet has the shape of a hammer.": "这枚护符是锤子的形状。",
  "This appears to be a Phonograph, a device for recording and playing sounds.": "这看起来是一台留声机，用来录制和播放声音。",
  "This barrel is full of gunpowder. Be careful!": "这个桶里装满了火药。小心！",
  "This blueprint shows the layout of a vent system.": "这张蓝图显示了通风管系统的布局。",
  "This device has the ability to send you through time.": "这个装置能把你送往不同的时代。",
  "This device will transport you outside the factory.": "这个装置会把你传送到工厂外面。",
  "This headdress will make you look like an Aztec Warrior.": "这件头饰会让你看起来像阿兹特克战士。",
  "This is a bag of large salt rocks.": "这是一袋大块盐石。",
  "This is a Greek coin.": "这是一枚希腊硬币。",
  "This is a rough draft of the Declaration of Independence.": "这是《独立宣言》的草稿。",
  "This is an empty glass bowl.": "这是一个空玻璃碗。",
  "This notebook contains a lot of inventive drawings.": "这本笔记里有许多发明草图。",
  "This paper smells like lemon juice.": "这张纸闻起来有柠檬汁的味道。",
  "This printout shows a system password.": "这张打印件上有一个系统密码。",
  "This stone bowl has Chinese writing on it.": "这个石碗上刻着中文。",
  "This tune was taught to you by Euterpe, the muse of music.": "这首曲子是音乐缪斯欧忒耳佩教给你的。",
  "This vase appears to be made of solid gold!": "这个花瓶看起来是纯金打造的！",
  "This will help you glide in the air.": "它能帮你在空中滑翔。",
  "Thick Skin": "厚皮",
  "Thieves Garb": "盗贼服",
  "Thumb Drive": "U 盘",
  "Timmy's Detective Log": "蒂米的侦探日志",
  "Time Device": "时间装置",
  "Torn Page": "撕下的书页",
  "Total Failure Office Key": "全败事务所钥匙",
  "Touchscreen Mirror": "触屏镜子",
  "Trash Collector": "垃圾收集者",
  "Tray": "托盘",
  "Tribal Jersey": "部落球衣",
  "Tropic Beachwear 1": "热带海滩装 1",
  "Tropic Beachwear 2": "热带海滩装 2",
  "Tropic Outfit 1": "热带套装 1",
  "Tropic Outfit 2": "热带套装 2",
  "Trophy Room Key": "战利品室钥匙",
  "Twinkle, twinkle, little star.": "一闪一闪亮晶晶。",
  "Ugly Holiday Sweater": "丑萌节日毛衣",
  "UNLOCKED": "已解锁",
  "Uncooked Pasta": "未煮的意面",
  "Under Construction": "施工中",
  "Unpowered Electron Pulse": "未充能电子脉冲",
  "Utah McDiggs": "犹他·麦迪格斯",
  "Vent Blueprints": "通风管蓝图",
  "Vial of Osmium": "锇小瓶",
  "Viking Suit": "维京服",
  "Viper Skin": "蝰蛇皮",
  "Visit Store": "前往商店",
  "Voice Recording": "录音",
  "Vroom vroom!": "轰轰！",
  "Wagon": "马车",
  "Warrior Headdress": "战士头饰",
  "Watch Parts": "手表零件",
  "Wet Kindling": "湿柴",
  "Whisker from Cerberus": "刻耳柏洛斯的胡须",
  "White Robe": "白袍",
  "Wild Mushroom Extract": "野蘑菇提取液",
  "WINTER BLAST FLAVOR": "冬日劲爽口味",
  "Winter Bundle": "冬季礼包",
  "Wire Cutters": "剪线钳",
  "World Guy": "世界侠",
  "Writer's ID Badge": "编剧工牌",
  "Yokozuna": "横纲",
  "Your friends will be impressed when they see you in this!": "朋友们看到你穿成这样一定会很佩服！",
  "Your opponent's next turn is skipped.": "对手的下一回合会被跳过。",
  "Zeus stole this item!": "宙斯偷走了这个物品！",
  "ZOMBIFY": "僵尸化",
  "Zombify!": "变成僵尸！",
  "\"Add another one to the scrap heap.\"": "“废铁堆里又多一个。”",
  "\"Billionaire by day, superhero by night. Jealous?\"": "“白天是亿万富翁，晚上是超级英雄。羡慕吗？”",
  "\"From the mist I heard the guttural mewling that foretold my doom...\"": "“我从雾中听见低沉的喵声，预告着我的末日……”",
  "\"He's one tough tenderizer.\"": "“他可是个硬骨头嫩肉锤。”",
  "\"Meet Omegon's gaze, and behold the end of all things!\"": "“直视奥米冈的目光，见证万物终结！”",
  "\"Take aim at the heart of evil.\"": "“瞄准邪恶的心脏。”",
  "\"Under the banner of friendship, global peace is possible!\"": "“在友谊的旗帜下，世界和平并非不可能！”",
  "24 Carrot Beta Costume": "24 胡萝卜测试服装",
  "Apply liberally to any Poptropican!": "请大量喷涂到任意 Poptropica 角色身上！",
  "and will dig them up soon!": "我们很快就会把它们挖出来！",
  "Atlantis Captain": "亚特兰蒂斯船长",
  "Box": "盒子",
  "Bow": "弓",
  "Candy Bar": "糖果棒",
  "CINNAMON FIRE FLAVOR": "肉桂烈焰口味",
  "Don't see all your cards? Don't fret!": "看不到所有卡片？别担心！",
  "Dr.Smartypants": "聪明裤博士",
  "Dry Kindling": "干柴",
  "Flint": "燧石",
  "FOLLOW": "跟随",
  "Fremulon Pamphlet": "弗雷穆隆传单",
  "Gear": "齿轮",
  "Giant Spatula": "巨型锅铲",
  "Gold Face": "金面侠",
  "GRAPE FLAVOR": "葡萄口味",
  "Manifest": "货单",
  "Mittens": "手套",
  "Owl": "猫头鹰",
  "Photo": "照片",
  "Press ACTION to throw a Bon Bon!": "按动作键投掷夹心糖果！",
  "Press ACTION to throw a Crispy Rice Treat!": "按动作键投掷脆米点心！",
  "Press ACTION to shoot an arrow!": "按动作键射箭！",
  "Press ACTION to throw divination dust!": "按动作键投掷占卜粉！",
  "Press ACTION to throw a curd!": "按动作键投掷奶酪凝乳！",
  "Press ACTION to throw a smoke bomb!": "按动作键投掷烟雾弹！",
  "Press SPACEBAR to cast your line!": "按空格键抛出鱼线！",
  "Press SPACEBAR to ready your defense!": "按空格键准备防御！",
  "Press SPACEBAR to shoot an arrow!": "按空格键射箭！",
  "Press SPACEBAR to show your might!": "按空格键展示力量！",
  "Press SPACEBAR to swing the hammer!": "按空格键挥动锤子！",
  "Press SPACEBAR to throw a Bon Bon!": "按空格键投掷夹心糖果！",
  "Press SPACEBAR to throw a Crispy Rice Treat!": "按空格键投掷脆米点心！",
  "Press SPACEBAR to throw a curd!": "按空格键投掷奶酪凝乳！",
  "Press SPACEBAR to throw a smoke bomb!": "按空格键投掷烟雾弹！",
  "Press SPACEBAR to throw divination dust!": "按空格键投掷占卜粉！",
  "Press SPACEBAR to unleash the power!": "按空格键释放力量！",
  "Press SPACEBAR to use!": "按空格键使用！",
  "Rusty Relic": "生锈遗物",
  "Screw Driver": "螺丝刀",
  "SPOOKTACULAR FLAVOR": "惊魂口味",
  "The Bolt": "闪电",
  "We're doing some construction,": "我们正在整理施工，",
  "WINTER BLAST FLAVOR": "冬日劲爽口味"
};

function translateQuestName(name) {
  return QUEST_NAMES[name] || name;
}

function templateTranslation(sourceText) {
  let match = /^Congratulations!&#10;You have completed the&#10;(.+) quest\.$/u.exec(sourceText);
  if (match) {
    return `恭喜！&#10;你完成了&#10;${translateQuestName(match[1])}任务。`;
  }

  match = /^Congratulations!&#10;You have completed&#10;the (.+) quest\.$/u.exec(sourceText);
  if (match) {
    return `恭喜！&#10;你完成了&#10;${translateQuestName(match[1])}任务。`;
  }

  match = /^Congratulations! You have completed the (.+) quest\.$/u.exec(sourceText);
  if (match) {
    return `恭喜！你完成了${translateQuestName(match[1])}任务。`;
  }

  match = /^Congratulations! You completed the (.+) quest\.$/u.exec(sourceText);
  if (match) {
    return `恭喜！你完成了${translateQuestName(match[1])}任务。`;
  }

  match = /^Congratulations!&#10;You have completed&#10;(.+)\.$/u.exec(sourceText);
  if (match) {
    return `恭喜！&#10;你完成了&#10;${translateQuestName(match[1])}。`;
  }

  if (sourceText === "Congratulations!&#10;You have completed your&#10;First Island!") {
    return "恭喜！&#10;你完成了自己的&#10;第一座岛！";
  }

  return null;
}

function readItemRows() {
  const db = new DatabaseSync(paths.textIndexPath, { readOnly: true });
  try {
    return db.prepare(`
      SELECT
        s.string_key,
        s.asset_id,
        s.source_group,
        s.island_id,
        s.generic_key,
        s.source_text,
        s.context_key,
        s.context_json,
        s.state,
        a.asset_path,
        a.asset_type,
        COALESCE(et.translated_text, t.translated_text) AS translated_text
      FROM strings s
      JOIN assets a ON a.asset_id = s.asset_id
      LEFT JOIN exact_translations et ON et.string_key = s.string_key
      LEFT JOIN translations t ON t.generic_key = s.generic_key
      WHERE s.source_group = 'as3'
        AND a.asset_path LIKE '%/game/data/items/%'
      ORDER BY a.asset_path, s.context_key
    `).all();
  } finally {
    db.close();
  }
}

function hasCjk(value) {
  return /[\u3400-\u9fff]/u.test(String(value || ""));
}

function shouldOverwrite(row, translatedText) {
  const current = String(row.translated_text || "").trim();
  if (!current) {
    return true;
  }
  if (!hasCjk(current)) {
    return true;
  }
  return current.toLowerCase() === String(row.source_text || "").trim().toLowerCase() &&
    current !== translatedText;
}

function main() {
  const rows = readItemRows().filter((row) => !isProtectedTranslationRow(row));
  const db = openIndexDb();
  let applied = 0;
  const unresolved = new Map();

  for (const row of rows) {
    const sourceText = String(row.source_text || "").trim();
    const translatedText = EXACT[sourceText] || templateTranslation(sourceText);
    if (!translatedText) {
      if (!String(row.translated_text || "").trim() || !hasCjk(row.translated_text)) {
        unresolved.set(sourceText, {
          sourceText,
          assetPath: row.asset_path,
          contextKey: row.context_key
        });
      }
      continue;
    }
    if (!shouldOverwrite(row, translatedText)) {
      continue;
    }
    db.upsertExactTranslation({
      stringKey: row.string_key,
      genericKey: row.generic_key,
      sourceText,
      translatedText,
      provider: PROVIDER,
      model: MODEL,
      styleVersion: STYLE_VERSION
    });
    applied += 1;
  }

  db.close();
  printJson({
    ok: unresolved.size === 0,
    sourceGroup: "as3",
    assetPattern: "game/data/items/",
    visibleRows: rows.length,
    applied,
    unresolvedCount: unresolved.size,
    unresolved: [...unresolved.values()].slice(0, 100)
  });
}

main();
