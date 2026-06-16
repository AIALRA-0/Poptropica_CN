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

### 本地浏览器控制台

普通浏览器可以打开本地控制台，用来查看岛屿状态、准备运行环境，并把 AS2 / AS3 或单个岛屿启动到 Flashpoint Navigator：

```powershell
cd E:\Poptropica\POPTROPICA_FLASH
npm run web:launcher
```

然后打开：

```text
http://127.0.0.1:22800/
```

控制台默认只监听 `127.0.0.1`，启动游戏窗口时默认使用副屏 `G32QC`。实际 Flash 播放仍由 Flashpoint Navigator 承担，因为现代普通浏览器不再直接运行 NPAPI Flash；这个本地 Web 入口为后续服务器化部署保留了清晰的 API/UI 边界。

如果要做服务器或容器部署预演，使用 no-spawn 模式：

```powershell
npm run web:launcher:no-spawn
```

该模式下页面和 API 仍会返回岛屿状态与启动命令计划，但不会在服务器主机上启动 Flashpoint 服务或 Flashpoint Navigator。

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

如果 `_global/default.*` 不存在，运行时会自动生成一个低音量的本地 WAV fallback，使缺少原始声音资产的 AS2 场景仍有可检测音频。用户提供的 `_global/default` 或岛屿/场景专用音频始终优先。

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
