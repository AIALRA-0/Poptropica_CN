const fs = require("node:fs");
const path = require("node:path");
const { printJson } = require("./lib/cli");
const { ensureDirSync, writeJson } = require("./lib/fs-utils");
const paths = require("./lib/paths");

const ROOT = path.join(
  paths.as3PackDir,
  "files",
  "content",
  "www.poptropica.com",
  "game",
  "data",
  "scenes",
  "reality2"
);

const TRANSLATIONS = new Map([
  ["Reality TV: Wild Safari", "真人秀：野外探险"],
  ["Exit", "离开"],
  ["EXIT", "出口"],
  ["COMMON ROOM", "公共房间"],
  ["TRAVEL", "旅行"],
  ["A bit foggy this evening, isn't it?", "今晚有点雾蒙蒙的，是吧？"],
  ["Absolutely!  Let's meet our challengers!", "当然！让我们见见挑战者们！"],
  ["And now for second place...A simply wonderful person.", "接下来是第二名……一位非常出色的人。"],
  ["And now for second place...Who could it be?", "接下来是第二名……会是谁呢？"],
  ["And now the moment we’ve all been waiting for. Who will reign as our Reality TV champions?", "现在到了大家期待已久的时刻。谁会成为我们的真人秀冠军？"],
  ["And second place... A dear friend.", "第二名……一位亲爱的朋友。"],
  ["And that's the end of the show! I'd like to thank Snakey for hugging my body the whole time. It was wonderfully awkward. Come back soon!!!", "节目到这里就结束了！感谢小蛇全程抱着我，这种尴尬真是妙不可言。下次再来！！！"],
  ["And the winner is...", "获胜者就是……"],
  ["Applause!!! Applause!!!", "鼓掌！！！鼓掌！！！"],
  ["Are you sure you can breathe fine?", "你确定呼吸没问题吗？"],
  ["As for you [Player Name], based on your achievements you have earned a grand total of...", "至于你，[Player Name]，根据你的表现，你一共获得了……"],
  ["Aye, there be much you don't know, har har!", "没错，你不知道的事还多着呢，哈哈！"],
  ["Beat your bongos like mad for our new island champion!!!  And first place goes too...", "疯狂敲响邦戈鼓，迎接我们的新岛屿冠军！！！第一名是……"],
  ["Beautiful choice.", "漂亮的选择。"],
  ["Blast! Why did you choose me?", "可恶！你为什么选我？"],
  ["Bring in the monkeys!!!", "把猴子带上来！！！"],
  ["Bring it on, cupcake.", "放马过来吧，小甜心。"],
  ["Bring on challenge number three!", "开始第三项挑战！"],
  ["Bring on challenge number two!", "开始第二项挑战！"],
  ["Bring on the next challenge!", "开始下一项挑战！"],
  ["Choose three challengers, my fearless friend.", "选择三名挑战者吧，我无畏的朋友。"],
  ["Choose wisely.", "谨慎选择。"],
  ["Congratulations to our challengers!", "祝贺我们的挑战者！"],
  ["Congratulations to our winners!", "祝贺我们的获胜者！"],
  ["Consider yourself dead.", "你已经完了。"],
  ["Do you want to save your game so you can earn these credits.", "你想先保存游戏，以便获得这些点数吗？"],
  ["Don't leave without your medallion!", "别忘了拿走你的奖章！"],
  ["Dwane, have you seen my extra camera?", "德韦恩，你看见我的备用摄像机了吗？"],
  ["Eeeeeek!", "呀啊啊啊！"],
  ["Excellent! Run fast, my good lad! A hunt is only as good as the chase it gives!", "太好了！快跑吧，小伙子！一场狩猎好不好，就看追逐够不够精彩！"],
  ["Excellent! Run fast, my good lass! A hunt is only as good as the chase it gives!", "太好了！快跑吧，小姑娘！一场狩猎好不好，就看追逐够不够精彩！"],
  ["Explore if you must, then come back and talk to me when you're ready.", "如果你想先探索一下也行，准备好了就回来找我。"],
  ["Got it. These games will be set to basic mode.", "明白。这些游戏会设为基础模式。"],
  ["Great! I'll set you up!", "很好！我这就为你安排！"],
  ["Hah! Spiders. Little fuzzies.", "哈！蜘蛛。毛茸茸的小东西。"],
  ["Hah... little brains.", "哈……小脑袋。"],
  ["Hahaha! Yes, I can!", "哈哈哈！没错，我可以！"],
  ["Hahaha! Yes, I can!  Let's meet our challengers!", "哈哈哈！没错，我可以！让我们见见挑战者们！"],
  ["Hee-hee! I'm so thrilled I can barely breathe! Let the games begin!", "嘻嘻！我激动得快喘不过气了！比赛开始！"],
  ["Heh heh. Yeah, man... Totally.", "嘿嘿。是啊，伙计……完全没错。"],
  ["Hello.", "你好。"],
  ["Hi there. Are you ok? Can you breathe?", "你好。你还好吗？能呼吸吗？"],
  ["Hi there. Can I play again?", "你好。我能再玩一次吗？"],
  ["Hoho! Someone's confident. You better be ready for the challenge of a lifetime!", "嚯嚯！有人很有自信嘛。你最好准备好迎接一生难忘的挑战！"],
  ["I don't want to talk about this.", "我不想谈这个。"],
  ["I hope one of them is me.", "希望其中一个是我。"],
  ["I just like to have fun.", "我只是喜欢找乐子。"],
  ["I like em.", "我挺喜欢它们。"],
  ["I love happy endings.", "我喜欢圆满结局。"],
  ["I love my baby croc.", "我爱我的小鳄鱼。"],
  ["I LOVE that you chose me.", "我太喜欢你选我了。"],
  ["I move like lightning.", "我行动如闪电。"],
  ["I respect your choice.", "我尊重你的选择。"],
  ["I want to travel Poptropica.", "我想去波普岛世界旅行。"],
  ["I'll dance past you.", "我会跳着舞超过你。"],
  ["I'll keep exploring.", "我再继续探索一下。"],
  ["I'll slip by you like a shadow.", "我会像影子一样从你身边溜过。"],
  ["I'm a beginner.", "我是新手。"],
  ["I'm competitive by nature.", "我天生就爱竞争。"],
  ["I'm ready to meet the challengers!", "我准备好见挑战者了！"],
  ["I'm ready, friend.", "我准备好了，朋友。"],
  ["Indeed, Neptune himself has covered the sea with his gossamer cloak.", "正是，海神尼普顿亲自用薄纱斗篷遮住了大海。"],
  ["It's time to announce our winners and then I will take a nap.", "该宣布获胜者了，然后我要去打个盹。"],
  ["It's time to announce our winners!  I'm sweating with joy!", "该宣布获胜者了！我高兴得直冒汗！"],
  ["It's time to announce our winners! Snakey is squeezing me very tight.", "该宣布获胜者了！小蛇把我勒得好紧。"],
  ["Just take it. It's a Poptropica thing.", "拿着吧。这是波普岛的传统。"],
  ["Know any good poems?", "你知道什么好诗吗？"],
  ["Let's choose new challengers.", "我们来选新的挑战者。"],
  ["Let's talk about this.", "我们谈谈这件事吧。"],
  ["Looks like we've lost the trail.", "看来我们跟丢踪迹了。"],
  ["Naw, I'll just explore instead.", "不了，我还是去探索吧。"],
  ["No matter, we'll set up camp here and resume the hunt presently!", "没关系，我们就在这里扎营，待会儿继续狩猎！"],
  ["No one can stop me.", "没人能阻止我。"],
  ["No thanks.", "不用了，谢谢。"],
  ["No worries.", "别担心。"],
  ["Of course, come back whenever you like. We'll be awaiting your return.", "当然，想回来时随时回来。我们会等你。"],
  ["Prepare to be my minon.", "准备成为我的手下吧。"],
  ["Prepare to be shredded.", "准备被我彻底击败吧。"],
  ["Prrrrrr-fect.", "完——美。"],
  ["Ready to rock!", "准备大干一场！"],
  ["Run if you must, but I will catch you.", "想跑就跑吧，但我一定会抓到你。"],
  ["Second place is reserved for the one with very toned biceps. You know who you are.", "第二名属于那位肱二头肌特别结实的人。你知道我说的是谁。"],
  ["Sorry, Wayne. I let the monkeys have it.", "抱歉，韦恩。我让猴子们拿走了。"],
  ["Splendid, as promised here are your credits.", "太棒了，按约定，这是你的点数。"],
  ["Sure! Where are they?", "当然！他们在哪儿？"],
  ["That's cool. Monkeys have little brains.", "挺好。猴子的脑袋很小。"],
  ["The challengers have been chosen! Are you ready?", "挑战者已经选好了！你准备好了吗？"],
  ["The moon shone pale as bone, as I stood there alone...", "月光惨白如骨，而我独自伫立……"],
  ["Third place will now be awarded. I'd salute you if I could lift my arm.", "现在颁发第三名。如果我抬得起手，我一定向你敬礼。"],
  ["This place rates 9.0 on my weird-o-meter.", "在我的怪异指数表上，这地方能打 9.0 分。"],
  ["Uh oh... if you want to earn these credits, you will have to save your game first.", "糟了……如果你想获得这些点数，必须先保存游戏。"],
  ["Watch me dominate!", "看我称霸全场！"],
  ["We'll find them in the heart of a snake infested jungle, Let's go!", "我们会在蛇群出没的丛林深处找到他们。走吧！"],
  ["Weird, I thought it was just water vapor?", "奇怪，我还以为那只是水汽呢？"],
  ["Welcome! Welcome! My name is Jim Probably and it's time to make your dreams a reality!", "欢迎！欢迎！我是吉姆·普罗巴布利，是时候让你的梦想成真了！"],
  ["What for?", "为什么？"],
  ["Woke up like this.", "我天生就这样。"],
  ["Would you like to get back to your game?", "你想回到你的比赛吗？"],
  ["Yeah... monkeys.", "是啊……猴子。"],
  ["Yes please.", "好的，谢谢。"],
  ["Yes.", "是的。"],
  ["You sound confident. This is sure to be quite the competition!", "听起来你很有信心。这场比赛一定很精彩！"],
  ["You're going down!", "你输定了！"],
  ["Your soul belongs to me.", "你的灵魂归我了。"]
]);

function listXmlFiles(rootDir) {
  const out = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.toLowerCase().endsWith(".xml")) {
        out.push(full);
      }
    }
  }
  walk(rootDir);
  return out;
}

function hasCjk(value) {
  return /[\u3400-\u9fff]/u.test(value);
}

function main() {
  if (!fs.existsSync(ROOT)) {
    throw new Error(`Reality2 data root is missing: ${ROOT}`);
  }
  const translated = [];
  const unmapped = new Map();
  const tagPattern = /<(statement|question|answer|name|text)\b([^>]*)>([\s\S]*?)<\/\1>/gu;

  for (const filePath of listXmlFiles(ROOT)) {
    const before = fs.readFileSync(filePath, "utf8");
    let changed = 0;
    const after = before.replace(tagPattern, (match, tag, attrs, value) => {
      const trimmed = String(value).trim();
      const translatedValue = TRANSLATIONS.get(trimmed);
      if (translatedValue) {
        changed += 1;
        return `<${tag}${attrs}>${translatedValue}</${tag}>`;
      }
      if (/[A-Za-z]/u.test(trimmed) && !/^game\.scenes\./u.test(trimmed) && !hasCjk(trimmed) && trimmed !== "AS3") {
        const key = `${tag}:${trimmed}`;
        if (!unmapped.has(key)) {
          unmapped.set(key, { tag, value: trimmed, files: [] });
        }
        unmapped.get(key).files.push(path.relative(ROOT, filePath).replace(/\\/gu, "/"));
      }
      return match;
    });
    if (changed > 0) {
      fs.writeFileSync(filePath, after, "utf8");
      translated.push({
        file: path.relative(paths.projectRoot, filePath).replace(/\\/gu, "/"),
        changed
      });
    }
  }

  const report = {
    ok: unmapped.size === 0,
    generatedAt: new Date().toISOString(),
    root: path.relative(paths.projectRoot, ROOT).replace(/\\/gu, "/"),
    translationCount: translated.reduce((sum, entry) => sum + entry.changed, 0),
    fileCount: translated.length,
    translated,
    unmapped: [...unmapped.values()]
  };
  const reportPath = path.join(paths.as3PackDir, "provenance", "reality2-translation-report.json");
  ensureDirSync(path.dirname(reportPath));
  writeJson(reportPath, report);
  printJson({ ...report, reportPath });
  if (!report.ok) {
    process.exitCode = 1;
  }
}

main();
