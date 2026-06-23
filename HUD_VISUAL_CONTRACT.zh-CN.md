# Poptropica HUD 视觉验收契约

更新时间：2026-06-23 00:20 EDT

## 适用范围

本文件用于 AS2/AS3 游戏内 HUD、弹窗和窗口缩放视觉验收。以后不得只凭“按钮能点”或代码坐标判断 HUD 正确，必须用截图、标注图或量化报告证明。

## 右上角 HUD 标准

- 以实际 Flash 舞台矩形为基准，不以浏览器窗口外框或桌面截图整体为基准。
- HUD 必须位于舞台右上安全区，单行排列，不能落到左上角、屏幕中部或弹窗内容上方。
- AS2 折叠 HUD 当前硬阈值：右边距 8-96 px，顶距 -4-36 px，图标纵向偏差 <= 10 px，相邻图标间距 10-56 px，HUD 总宽 <= 舞台宽度 24%。
- AS3 展开 HUD 必须以 MENU 为右锚，8 个槽位完整，settings/audio/home/store/map/costumizer/inventory/menu 不缺槽、不重叠、不下坠。
- 静态 MENU 图标、招牌、海报、美术字不使用中文 TextField 硬盖；只允许原图保留或走 bitmap/资产替换。

## 弹窗和任务物品

- popup 打开时，gameplay HUD 必须隐藏或被弹窗正确压住，隐藏 HUD 不能继续抢点击。
- 关闭按钮必须可见、可点；关闭后不得打开地图、Time Machine 或其它无关弹窗。
- 文件/任务物品弹窗关闭后不得留下黑色残留、越界内容或透明热区。

## 窗口和全屏

- 窗口缩放、最大化、F11 进入/退出后，角色必须可见，HUD 仍按本契约右上排列。
- 真实 gameplay 区域不得露左/右纯蓝块、底部蓝边或右侧白边；合法 letterbox 必须是稳定深色背景。
- loading 证据必须显式采样，进度条/Logo 要在可视窗口中心附近，不能只用“已经进入场景”替代。

## 当前自动证据

- AS2 HUD：`tools/qa-helper.py analyze-hud-diff`，输出 JSON 和带框标注图。
- AS3 HUD：`tools/qa-helper.py analyze-hud-row`，输出 8 槽位检测和带框图。
- AS2 弹窗关闭：`tools/qa-as2-interaction-smoke.js --popup-close-click --require-popup-close`，必须证明关闭按钮消失且无 `map.swf` 请求。

## 当前已知缺口

- AS2/AS3 视觉检测仍是代表样本门槛，不等于所有岛全量通过。
- Time Tangled `malidocs` 关闭链已通过，但该岛自然时间装置路线、更多年代场景、外链白屏和真实音频仍未封闭。
