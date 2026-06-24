const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { printJson } = require("./lib/cli");
const { loadConfig } = require("./lib/config");
const { buildRuntimeZipForSourceGroup } = require("./lib/pack");
const paths = require("./lib/paths");
const { ensureDirSync, fileExists, removeDirContents } = require("./lib/fs-utils");

const PATCH_ASSET_PREFIX = "time-tangled:as2-external-links";
const TIME_SCENE_ROOT = "content/www.poptropica.com/scenes/islandTime";
const TIME_EXTRA_SWF_ASSET_PATHS = [
  `${TIME_SCENE_ROOT}/vendorCart.swf`
];
const INFO_POPUP_ASSET_PATH = "content/www.poptropica.com/popups/info/info.swf";
const FACTMONSTER_LINK_PATTERN = /popupLink = "https?:\/\/www\.factmonster\.com\/[^"]+";/gu;
const VENDOR_CART_LINK_PATTERN = /var gClickURL = "https?:\/\/www\.poptropica\.com\/books\/";/gu;

const TIME_POPUP_TEXT_REPLACEMENTS = new Map([
  [
    "Benjamin Franklin, John Adams, Robert R. Livingston, and Roger Sherman were also members of the committee asked to write the declaration, but Jefferson did the actual writing.",
    "本杰明·富兰克林、约翰·亚当斯、罗伯特·利文斯顿和罗杰·谢尔曼也参与了起草宣言的委员会，但实际执笔的是杰斐逊。"
  ],
  [
    "Guards on the towers used smoke signals to raise the alarm when invading forces were spotted.",
    "塔楼上的守卫发现入侵者时，会用烟火信号发出警报。"
  ],
  [
    "Many workers died during construction of the Great wall of China. Their bodies are actually buried inside the wall itself!",
    "修建中国长城时许多工人死去；传说他们的遗体就埋在城墙之中。"
  ],
  [
    "To design the Statue of Liberty, Bartholdi first sculpted a small study model. Successively larger versions were made from the original model.",
    "为了设计自由女神像，巴托尔迪先做了一个小模型，再以它为基础逐步制作更大的版本。"
  ],
  [
    "The framework for the statue of liberty was engineered and directed by Gustave Eiffel, who later constructed the Eiffel Tower.",
    "自由女神像的内部结构由古斯塔夫·埃菲尔设计并主持建造，他后来又建造了埃菲尔铁塔。"
  ],
  [
    "Hillary and Tenzing pitched a tent at 27,900 feet up. The next morning Hillary\\'s boots were frozen solid outside the tent.",
    "希拉里和丹增在 27900 英尺高处扎营。第二天早上，希拉里的靴子在帐篷外冻得硬邦邦的。"
  ],
  [
    "The last part of the climb was a 40-foot rock face later named the Hillary Step. Hillary and Tenzing reached the 29,028 ft summit of Everest on May 29, 1953.",
    "最后一段是 40 英尺高的岩壁，后来被称为希拉里台阶。1953 年 5 月 29 日，希拉里和丹增登上了 29028 英尺的珠峰顶。"
  ],
  [
    "Biomass, or organic matter, can be converted into usable energy. This is done by fermenting plant matter to produce liquid fuel, like ethanol, or by the bacterial decomposition of organic waste to produce methane.",
    "生物质，也就是有机物，可以转化为可用能源。植物发酵能产生乙醇等液体燃料，有机废弃物分解则能产生甲烷。"
  ],
  [
    "In the past, most solid waste was deposited in landfills or dumps. But landfills filled up and waste disposal led to environmental problems. Here in the future, waste is recycled whenever possible.",
    "过去，大多数固体废物会被送进填埋场或垃圾场。但这些地方会被填满，处理废物也会带来环境问题。在未来，这里的废物会尽可能回收利用。"
  ],
  [
    "Thomas Edison made hundreds of inventions. Among these are the first practical light bulb and the phonograph. He also helped develop motion picture cameras and the typewriter.",
    "托马斯·爱迪生发明了数百种东西，包括第一种实用电灯泡和留声机。他还参与改进了电影摄影机和打字机。"
  ],
  [
    "Leonardo da Vinci was a man of many talents and an artistic genius. His notebooks were filled with drawings of plants, animals, people, and his own inventions. Of all Leonardo’s work, the Mona Lisa is probably the most famous.",
    "列奥纳多·达·芬奇多才多艺，是一位艺术天才。他的笔记里画满了植物、动物、人物和自己的发明。在他的作品中，《蒙娜丽莎》可能最有名。"
  ],
  [
    "Thor\\'s Hammer, a symbol drawn from Viking mythology, was a common element in Viking jewelry. The hammer shape was believed to protect its bearer.",
    "雷神之锤来自维京神话，是维京饰品中常见的图案。人们相信锤子的形状能保护佩戴者。"
  ],
  [
    "The main temple of the Aztec capital rose 60 m (197 ft) above the city! A shrine to the sun god sat atop the temple.",
    "阿兹特克首都的主神庙高出城市 60 米（197 英尺）！神庙顶部供奉着太阳神的圣坛。"
  ],
  [
    "The Aztecs used a wooden rack, called a tzompantli, to display the skulls of war captives or other sacrificial victims.",
    "阿兹特克人会用一种名叫 tzompantli 的木架，展示战俘或祭品受害者的头骨。"
  ],
  [
    "Greek artists created pottery covered with elaborate geometric and figure paintings.",
    "希腊艺术家制作的陶器上，常绘有精细的几何图案和人物画。"
  ],
  [
    "Jefferson complained that he was pestered by flies while writing the Declaration of Independence in the Graff House.",
    "杰斐逊曾抱怨，他在格拉夫家起草《独立宣言》时一直被苍蝇打扰。"
  ],
  [
    "The Oracle of Delphi was a woman who was chosen from the peasants in the area. She sat near vapors of smoke that rose from the earth and prophesied for the god Apollo.",
    "德尔斐神谕是一位从当地平民中选出的女子。她坐在从地下升起的烟雾旁，为阿波罗神作出预言。"
  ],
  [
    "Renewable sources of energy can be used over and over again. Renewable resources include solar energy, wind, geothermal energy, biomass, and hydropower. They generate much less pollution than nonrenewable sources.",
    "可再生能源可以反复使用，包括太阳能、风能、地热能、生物质能和水力发电。它们造成的污染比不可再生能源少得多。"
  ],
  [
    "Timbuktu was a great center of learning. Thousands of manuscripts were preserved and treasured by the people of the city.",
    "廷巴克图曾是重要的学术中心。城里的人们保存并珍视着成千上万份手稿。"
  ],
  [
    "Sacagawea was a Shoshone woman who accompanied the expedition. She gave birth to her first child shortly after joining.",
    "萨卡加维亚是一位肖肖尼族女子，她陪同探险队前进。加入队伍后不久，她生下了自己的第一个孩子。"
  ]
]);

function runChecked(command, args, label) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 1024 * 1024 * 24
  });
  const output = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
  if (result.status !== 0 || /SEVERE:/iu.test(output)) {
    throw new Error(`${label} failed: ${output || result.error?.message || "unknown error"}`);
  }
  return result;
}

function normalizeAs(content) {
  const normalized = String(content || "").replace(/\r?\n/gu, "\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

function packSwfPath(assetPath) {
  return path.join(paths.as2PackDir, "swf", assetPath.replace(/\//gu, path.sep));
}

function extractFromCurrentRuntimeZip(assetPath, scratchDir) {
  if (!fileExists(paths.as2RuntimeZipPath)) {
    return null;
  }
  const outputPath = path.join(scratchDir, "runtime-zip-source", assetPath.replace(/\//gu, path.sep));
  ensureDirSync(path.dirname(outputPath));
  const command = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem;",
    `$zip=[System.IO.Compression.ZipFile]::OpenRead(${JSON.stringify(paths.as2RuntimeZipPath)});`,
    "try {",
    `  $entry=$zip.GetEntry(${JSON.stringify(assetPath)});`,
    "  if ($null -eq $entry) { exit 2 }",
    `  $dest=${JSON.stringify(outputPath)};`,
    "  New-Item -ItemType Directory -Force -Path (Split-Path -LiteralPath $dest) | Out-Null;",
    "  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$dest,$true);",
    "} finally {",
    "  if ($zip -ne $null) { $zip.Dispose() }",
    "}"
  ].join(" ");
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 60000,
    maxBuffer: 1024 * 1024
  });
  if (result.status === 0 && fileExists(outputPath)) {
    return outputPath;
  }
  return null;
}

function sourceSwfPath(assetPath, scratchDir) {
  const packPath = packSwfPath(assetPath);
  if (fileExists(packPath)) {
    return packPath;
  }
  const runtimeZipExtracted = path.join(paths.tempDir, "runtime-zip-as2", assetPath.replace(/\//gu, path.sep));
  if (fileExists(runtimeZipExtracted)) {
    return runtimeZipExtracted;
  }
  const extractedRoot = path.join(paths.extractedDir, "as2");
  if (fileExists(extractedRoot)) {
    const stack = [extractedRoot];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else if (fullPath.replace(/\\/gu, "/").endsWith(`/${assetPath}`)) {
          return fullPath;
        }
      }
    }
  }
  if (scratchDir) {
    const runtimeZipAsset = extractFromCurrentRuntimeZip(assetPath, scratchDir);
    if (runtimeZipAsset) {
      return runtimeZipAsset;
    }
  }
  throw new Error(`Unable to locate source ${assetPath}. Build or extract the AS2 runtime first.`);
}

function replaceTargetForScript(scriptRoot, filePath) {
  const relative = path.relative(path.join(scriptRoot, "scripts"), filePath).replace(/\\/gu, "/");
  return `\\${relative.replace(/\.as$/iu, "").replace(/\//gu, "\\")}`;
}

function listScriptFiles(root) {
  const files = [];
  const stack = [path.join(root, "scripts")];
  while (stack.length) {
    const current = stack.pop();
    if (!fileExists(current)) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.as$/iu.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  return files.sort();
}

function patchSceneScript(content) {
  let next = normalizeAs(content);
  const original = next;
  const linkMatches = [...next.matchAll(FACTMONSTER_LINK_PATTERN)].map((match) => match[0]);
  next = next.replace(FACTMONSTER_LINK_PATTERN, 'popupLink = "";');
  const directLinkMatches = [...next.matchAll(VENDOR_CART_LINK_PATTERN)].map((match) => match[0]);
  next = next.replace(VENDOR_CART_LINK_PATTERN, 'var gClickURL = "";');
  const vendorGetUrlLine = '   getURL(gClickURL,"_blank");';
  if (next.includes(vendorGetUrlLine)) {
    next = next.split(vendorGetUrlLine).join([
      '   _root.trackCampaign(gCampaignName,"ClickedCartSuppressed");',
      '   gFloatingLabel.show("本地版资料链接不可用");',
      "   return undefined;"
    ].join("\n"));
  }
  next = next.split('gFloatingLabel.show("CLICK HERE TO LEARN MORE");').join('gFloatingLabel.show("本地版资料链接不可用");');

  let textReplacementCount = 0;
  for (const [english, chinese] of TIME_POPUP_TEXT_REPLACEMENTS) {
    const before = next;
    next = next.split(`popupText = "${english}";`).join(`popupText = "${chinese}";`);
    if (next !== before) {
      textReplacementCount += 1;
    }
  }

  return {
    changed: next !== original,
    content: next,
    linkReplacementCount: linkMatches.length,
    directLinkReplacementCount: directLinkMatches.length,
    directLinkSuppressionPresent: next.includes("ClickedCartSuppressed"),
    textReplacementCount,
    removedLinks: linkMatches.map((line) => line.replace(/^popupLink = "/u, "").replace(/";$/u, ""))
  };
}

function patchInfoPopupScript(content) {
  const original = normalizeAs(content);
  const targetLine = '   getURL(_root.popupLink + "?utm_source=FactMonsterBubbles&utm_medium=Bubbles&utm_campaign=Poptropica","_blank");';
  const replacement = [
    "   var zhPopupLink = \"\";",
    "   if(_root.popupLink != undefined && _root.popupLink != null)",
    "   {",
    "      zhPopupLink = String(_root.popupLink);",
    "   }",
    "   if(zhPopupLink == \"\" || zhPopupLink == \"undefined\" || zhPopupLink.substr(0,4) == \"http\")",
    "   {",
    "      _root.trackEvent(\"FactMonsterSiteSuppressed\");",
    "      fldInfo.text = String(_root.popupText) + \"\\n\\n本地版已禁用外部资料链接。\";",
    "      return undefined;",
    "   }",
    "   _root.trackEvent(\"FactMonsterSiteClicked\");",
    "   getURL(zhPopupLink + \"?utm_source=FactMonsterBubbles&utm_medium=Bubbles&utm_campaign=Poptropica\",\"_blank\");"
  ].join("\n");
  if (original.includes("FactMonsterSiteSuppressed")) {
    return { changed: false, content: original, guardAdded: false, guardPresent: true };
  }
  if (!original.includes(targetLine)) {
    return { changed: false, content: original, guardAdded: false, guardPresent: false };
  }
  return {
    changed: true,
    content: original.split(targetLine).join(replacement),
    guardAdded: true,
    guardPresent: true
  };
}

function patchSwf({ ffdecCli, assetPath, workDir, patchKind }) {
  const assetWorkDir = path.join(workDir, assetPath.replace(/[/:\\]/gu, "_"));
  removeDirContents(assetWorkDir);
  ensureDirSync(assetWorkDir);
  const sourcePath = sourceSwfPath(assetPath, assetWorkDir);
  const outputPath = packSwfPath(assetPath);
  ensureDirSync(path.dirname(outputPath));

  const inputCopy = path.join(assetWorkDir, "input.swf");
  fs.copyFileSync(sourcePath, inputCopy);

  const scriptRoot = path.join(assetWorkDir, "scripts");
  removeDirContents(scriptRoot);
  ensureDirSync(scriptRoot);
  runChecked(ffdecCli, ["-cli", "-export", "script", scriptRoot, inputCopy], `export ${assetPath} scripts`);

  const patchRoot = path.join(assetWorkDir, "patch");
  removeDirContents(patchRoot);
  ensureDirSync(patchRoot);

  const replacements = [];
  const details = {
    linkReplacementCount: 0,
    directLinkReplacementCount: 0,
    directLinkSuppressionPresent: false,
    textReplacementCount: 0,
    guardAdded: false,
    guardPresent: false,
    removedLinks: []
  };

  for (const filePath of listScriptFiles(scriptRoot)) {
    const original = fs.readFileSync(filePath, "utf8");
    const result = patchKind === "scene"
      ? patchSceneScript(original)
      : patchInfoPopupScript(original);
    details.linkReplacementCount += result.linkReplacementCount || 0;
    details.directLinkReplacementCount += result.directLinkReplacementCount || 0;
    details.directLinkSuppressionPresent = details.directLinkSuppressionPresent || Boolean(result.directLinkSuppressionPresent);
    details.textReplacementCount += result.textReplacementCount || 0;
    details.guardAdded = details.guardAdded || Boolean(result.guardAdded);
    details.guardPresent = details.guardPresent || Boolean(result.guardPresent);
    details.removedLinks.push(...(result.removedLinks || []));
    if (!result.changed) {
      continue;
    }

    const patchPath = path.join(patchRoot, path.relative(path.join(scriptRoot, "scripts"), filePath));
    ensureDirSync(path.dirname(patchPath));
    fs.writeFileSync(patchPath, result.content, "utf8");
    replacements.push({
      filePath: patchPath,
      replaceTarget: replaceTargetForScript(scriptRoot, filePath)
    });
  }

  if (replacements.length === 0) {
    return {
      changed: false,
      assetPath,
      sourcePath,
      outputPath,
      replacementCount: 0,
      ...details
    };
  }

  let currentInput = inputCopy;
  replacements.forEach((replacement, index) => {
    const passOutput = index === replacements.length - 1
      ? outputPath
      : path.join(assetWorkDir, `pass-${index}.swf`);
    runChecked(ffdecCli, ["-replace", currentInput, passOutput, replacement.replaceTarget, replacement.filePath], `replace ${assetPath} ${replacement.replaceTarget}`);
    currentInput = passOutput;
  });

  return {
    changed: true,
    assetPath,
    sourcePath,
    outputPath,
    replacementCount: replacements.length,
    replacements: replacements.map((replacement) => replacement.replaceTarget),
    ...details
  };
}

function timeSceneAssetPaths() {
  const sceneDir = path.join(paths.as2PackDir, "swf", TIME_SCENE_ROOT.replace(/\//gu, path.sep));
  if (!fileExists(sceneDir)) {
    throw new Error(`Missing Time Tangled scene directory: ${sceneDir}`);
  }
  const fromPack = fs.readdirSync(sceneDir)
    .filter((fileName) => /^scene.+\.swf$/iu.test(fileName))
    .sort()
    .map((fileName) => `${TIME_SCENE_ROOT}/${fileName}`);
  return [...new Set([...fromPack, ...TIME_EXTRA_SWF_ASSET_PATHS])].sort();
}

function main() {
  const config = loadConfig();
  const ffdecCli = config.tools?.ffdecCli;
  if (!ffdecCli || !fileExists(ffdecCli)) {
    throw new Error("ffdec-cli is not configured.");
  }

  const workDir = path.join(paths.tempDir, "as2-time-external-links-patch");
  removeDirContents(workDir);
  ensureDirSync(workDir);

  const sceneResults = [];
  for (const assetPath of timeSceneAssetPaths()) {
    const result = patchSwf({ ffdecCli, assetPath, workDir, patchKind: "scene" });
    if (result.changed || result.linkReplacementCount > 0 || result.directLinkReplacementCount > 0 || result.directLinkSuppressionPresent) {
      sceneResults.push(result);
    }
  }
  const infoResult = patchSwf({ ffdecCli, assetPath: INFO_POPUP_ASSET_PATH, workDir, patchKind: "info" });

  const changedResults = [...sceneResults, infoResult].filter((result) => result.changed);
  const linkReplacementCount = sceneResults.reduce((sum, result) => sum + result.linkReplacementCount, 0);
  const directLinkReplacementCount = sceneResults.reduce((sum, result) => sum + result.directLinkReplacementCount, 0);
  const directLinkSuppressionPresent = sceneResults.some((result) => result.directLinkSuppressionPresent);
  const textReplacementCount = sceneResults.reduce((sum, result) => sum + result.textReplacementCount, 0);
  const infoGuardPresent = Boolean(infoResult.guardPresent || infoResult.guardAdded);

  if (linkReplacementCount === 0 && directLinkReplacementCount === 0 && !directLinkSuppressionPresent && !infoGuardPresent) {
    throw new Error("No Time Tangled external links or info popup guard were patched.");
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceGroup: "as2",
    assetsPatched: changedResults.length,
    swfPatchedAssets: changedResults.map((result) => ({
      assetId: `${PATCH_ASSET_PREFIX}:${result.assetPath}`,
      assetPath: result.assetPath,
      outputPath: result.outputPath
    })),
    pendingSwfAssets: [],
    externalTextAssets: [],
    pendingExternalAssets: []
  };
  const runtimeZip = buildRuntimeZipForSourceGroup({ config, sourceGroup: "as2", manifest });
  const report = {
    ok: true,
    linkReplacementCount,
    directLinkReplacementCount,
    directLinkSuppressionPresent,
    textReplacementCount,
    infoGuardAdded: infoResult.guardAdded,
    infoGuardPresent,
    patchedAssets: changedResults,
    runtimeZip
  };
  const reportPath = path.join(paths.qaDir, "as2", "time-tangled-external-links-patch.json");
  ensureDirSync(path.dirname(reportPath));
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  printJson({ ...report, reportPath });
}

main();
