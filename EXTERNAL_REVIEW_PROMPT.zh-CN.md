# Poptropica Flash 坐标体系外部审计提示词

请你作为 Flash/浏览器嵌入式游戏运行时和 UI 坐标系统审计专家，帮我审查一个 Poptropica Flash 本地化项目的全局坐标方案。重点不是翻译内容，而是 HUD、viewport、popup、loading、窗口缩放/F11 后的位置稳定性。

## 背景

项目路径：`E:\Poptropica\POPTROPICA_FLASH`

游戏通过本地浏览器/Flashpoint Navigator 打开 AS2/AS3 Flash 内容。当前正在做中文本地化和本地部署准备。用户明确要求：

- 静态图标、招牌、海报、美术字不允许用中文文字层硬盖；默认保留英文，除非以后用真实图片资产替换。
- 要证明游戏“看起来对、玩起来对”，不是只证明按钮能点。
- 测试要尽量后台/侧屏静音，不抢主显示器和鼠标。

## 当前主要问题

过去多次出现“代码上看似锚到右上，但截图看明显不正”的问题。根因疑似是以下坐标系混用：

1. 浏览器窗口/client capture 坐标。
2. HTML `#gameViewport` / `#gameScaleHost` 的裁切和缩放坐标。
3. Flash embed 的 stage 坐标。
4. AS2 gameplay 内部 `_root` / `navBar` / `_level0.gameplay_container_mc` 坐标。
5. 场景 camera / world bounds 坐标。
6. popup（map、inventory、malidocs 等）自己的视觉尺寸和裁切坐标。
7. QA 截图识别使用的 stage rect / visual guard 坐标。

用户已经指出：我之前所谓“HUD 在右上角”在截图中仍然是歪的，所以需要把“右上角”和“居中”定义成像素级契约，不能凭代码坐标判断。

## 当前相关实现

AS2 页面承载逻辑在：

- `packs/zh-CN/as2/files/content/www.poptropica.com/base.php`
- 同步构建模板：`tools/lib/pack.js`

关键逻辑：

- 普通 AS2 gameplay 使用 `STANDARD_GAMEPLAY_VIEWPORT = { x:0, y:0, width:1000, height:580 }`。
- Time Tangled 当前专用布局：
  - `baseWidth=1182`
  - `baseHeight=645`
  - `viewport={ x:186, y:0, width:996, height:580 }`
- map popup 专用布局：
  - `MAP_POPUP_VIEWPORT={ x:0, y:0, width:1000, height:580 }`
- 普通 tight popup 使用：
  - `POPUP_VIEWPORT={ x:0, y:0, width:640, height:480 }`

AS2 gameplay 补丁在：

- `tools/patch-as2-gameplay-hud-popup.js`
- 同步构建模板：`tools/lib/pack.js`

当前修复包括：

- HUD fallback 使用 `zhGameplayLogicalRight()` 计算右边界，窗口逻辑宽度较大时减去 35px 安全边距。
- AS2 HUD 右上 fallback 当前能在 Time Tangled/Mali 样本中得到量化结果：
  - HUD box：`left=1155 top=26 right=1371 bottom=80`
  - 截图宽高：`1428x760`
  - 右边距 `57px`
  - 顶边距 `1px`
  - 图标间距 `23px/21px`
- map popup 过去被通用 popup 归一化覆盖成 `true/false`，导致使用 640x480 tight viewport，地图被放大裁切。现在导出的 AS 已确认 direct map 路径打出：
  - `zhNotifyPopupViewport("map")`

## 最近证据

最新通过报告：

- `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782210583755.json`

该报告在 G32QC 侧屏、静音、1440x900 窗口下通过：

- `ok=true`
- `mapClicksPassed=1`
- `sceneEvidencePassed=1`
- `visualGuardPassed=1`
- `playableCropGuardPassed=1`
- `hudAnchorPassed=1`
- `audioActive=0`

关键截图：

- 初始场景：`runtime-data/qa/as2/interaction-smoke/run-1782210583755/01-time-tangled-initial.png`
- HUD 标注：`runtime-data/qa/as2/interaction-smoke/run-1782210583755/01-time-tangled-hud-anchor.png`
- 地图弹窗：`runtime-data/qa/as2/interaction-smoke/run-1782210583755/01-time-tangled-map.png`
- 地图 guard 标注：`runtime-data/qa/as2/interaction-smoke/run-1782210583755/01-time-tangled-map-visual-guard.png`

地图专用 guard 指标：

- 地图纸张 bbox：`left=342 top=130 right=1103 bottom=724`
- 纸张中心偏差：`0.005952`
- 纸张像素占比：`38.578063%`
- 边缘蓝底：top/left/right `0%`，bottom `1.683437%`

## 需要你审计的问题

请给出端到端技术方案，重点回答：

1. 这些坐标系应该如何分层命名？每一层的 origin、scale、crop、anchor 应该如何定义，避免再把 Flash stage 右上角误当成截图右上角。
2. AS2 HUD 应该锚定哪个坐标系？对于 Time Tangled 这种需要 `baseWidth=1182`、`viewport.x=186` 的场景，右上角 fallback 应该基于 stage 宽、crop 宽、还是可见截图宽？
3. popup 应该如何独立处理？map / inventory / malidocs / generic 640x480 popup 是否应该走不同 viewport contract？
4. 窗口 resize、maximize、F11 后，应该采用“原地 relayout”还是“稳定后 reload/relaunch”？如何定义不会让角色消失、不会露蓝底的验收标准？
5. loading 居中应该锚定浏览器 client center、Flash viewport center，还是裁切后的可见 game viewport center？
6. QA visual guard 应该怎么拆分？普通场景、地图暗幕弹窗、任务文件弹窗不应使用同一个黑边规则。
7. 请指出当前 `MAP_POPUP_VIEWPORT={x:0,y:0,w:1000,h:580}` 和 Time Tangled `viewport={x:186,y:0,w:996,h:580}` 是否存在系统性风险。
8. 请给出一个像素级验收矩阵：HUD、player crop、blue edge、loading center、map popup、file popup、dialogue bubble 各自应该输出哪些度量。
9. 请指出最可能导致“一个岛修好，另一个岛又歪”的共享抽象问题，以及应该如何把 per-island override 限制在最小范围。

输出希望：

- 先给根因判断。
- 再给推荐坐标模型。
- 再给具体补丁方向。
- 最后给验收指标和测试顺序。

