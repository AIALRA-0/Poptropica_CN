# POPTROPICA_FLASH

`POPTROPICA_FLASH` 是一个独立于当前 Haxe/Coolmath 汉化壳的旧版 Poptropica Flash 项目。它的目标是把 `AS2 + AS3` 的本地旧版资源、统一岛目录、托管 Flashpoint 运行时、预构建汉化和后续漏翻闭环放到同一套工作流里。

## 当前实现范围

- 统一项目结构：`launcher/`、`tools/`、`catalog/`、`packs/zh-CN/`、`runtime-data/`
- 用户自备原包导入：
  - `Flashpoint` 根目录
  - `AS2` gamezip
  - `AS3` gamezip
  - 可选 `Steam` 安装目录
- 覆盖矩阵与统一岛目录生成
- `launch-manifest` 场景发现与直启 URL 生成
- 托管 Flashpoint 运行时：
  - 后台启动 `Game Server + PHP Router`
  - 自动把 `AS2/AS3.zip` 挂到 `E:\Flashpoint\Data\Games`
  - 直接调用 `FPNavigator` 打开 `base.php?room=...&island=...`
  - 默认绕开 Flashpoint 原生大游戏库界面
- 分阶段提取链：
  - `text-only`
  - `priority-swf`
  - `full-swf`
- DeepSeek 预构建翻译：
  - 上下文块翻译
  - 大陆商业游戏本地化口吻
  - 中文句号转英文句号
  - 标点后统一一空格
  - 黑体 / SimHei 排版约束
- Electron 统一启动器壳

## 运行

建议先在本仓库根目录执行过一次 `npm install`。子项目会优先复用父级 `node_modules`。

```powershell
cd E:\Poptropica\POPTROPICA_FLASH
npm run bootstrap:flashpoint
npm run discover:launch-scenes
npm run doctor:flashpoint
npm run launch
```

也可以双击根目录里的 [Start-Poptropica-Flash.bat](E:/Poptropica/POPTROPICA_FLASH/Start-Poptropica-Flash.bat)。

## 可选本地音频覆盖

旧 AS2 岛屿的当前来源包里很多没有可恢复的原始音频。项目支持把你本机自备、可合法使用的音频放到被 Git 忽略的目录里，由本地运行时自动挂载到页面：

```text
runtime-data/user-audio/as2/<island>/<room>.mp3
runtime-data/user-audio/as2/<island>/default.mp3
runtime-data/user-audio/as2/_global/default.mp3
```

例如 Super Power 主街可使用：

```text
runtime-data/user-audio/as2/Super/DownTown.mp3
```

支持 `mp3`、`ogg`、`wav`、`m4a`。运行时会优先匹配 `<island>/<room>`，再退回 `<island>/default` 和 `_global/default`。该目录不会提交到 GitHub，避免把来源不明确的音频资产放进仓库。

## 典型工作流

```powershell
npm run import:flashpoint -- --flashpoint-root "E:\\Flashpoint" --as2-gamezip "E:\\Poptropica\\POPTROPICA_FLASH\\AS2.zip" --as3-gamezip "E:\\Poptropica\\POPTROPICA_FLASH\\AS3.zip" --ffdec-cli "E:\\FFDec\\ffdec-cli.exe"
npm run import:steam -- --steam-root "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Poptropica"
npm run bootstrap:flashpoint
npm run inventory:sources
npm run discover:launch-scenes
npm run extract:text -- --source as3 --phase text-only
npm run extract:text -- --source as3 --phase priority-swf
npm run translate:pack -- --source as3 --drain --limit 180
npm run extract:text -- --source as2 --phase priority-swf
npm run translate:pack -- --source as2 --drain --limit 180
npm run patch:pack
npm run launch
```

直接命令行验证某个岛的直启：

```powershell
npm run launch -- --island virus-hunter
```

一键重建当前推荐流程：

```powershell
npm run rebuild:pack
```

## 工具约定

- zip/gamezip 解包优先走系统 `tar.exe`
- `JPEXS FFDec` 需要用户自行安装或通过配置指定路径
- `DeepSeek` 只用于预构建翻译阶段，不参与默认运行时现网翻译
- 运行时默认优先走本地 pack，不再设计成“第一次英文、第二次中文”

## 关键输出

- `catalog/coverage-matrix.json`
- `catalog/islands.json`
- `catalog/launch-manifest.json`
- `runtime-data/text-index.sqlite`
- `runtime-data/doctor-flashpoint.json`
- `runtime-data/workspaces/flashpoint-managed/`
- `packs/zh-CN/as2/`
- `packs/zh-CN/as3/`
- `runtime-data/misses.jsonl`
