# Poptropica Flash P0 实玩质量 Checklist

更新时间：2026-06-23 02:16 EDT

当前分支：`codex/full-poptropica-qa-20260617`

## 当前结论

当前主线已经从“HUD 按钮矩阵”切换为“实际游玩质量”。HUD 矩阵已暂停/降级，它只能作为低优先级回归证据，不再代表项目接近完成。

2026-06-23 02:16 EDT：重开 AS2 HUD “右上角”验收并修正此前误判。根因不是简单坐标偏移，而是 AS2 `navBar` 中部分按钮 `getBounds()` 返回无效值，导致动态布局算出 `NaN`，Flash 写入后可见三枚 HUD 仍停在旧位置。已给 `gameplay.swf` 加 QA-only `HudLayout*` 运行时日志，确认当前可见 HUD 来自 `_level0.gameplay_container_mc.navBar`，并在基础三按钮 bounds 不可信时走固定右上 fallback：背包/服装/地图固定到 `x=652/708/764,y=-20`，静态 MENU/图标仍保留原图，不叠中文。Time Tangled 复测 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782195195133.json` 通过，标注图 `runtime-data/qa/as2/interaction-smoke/run-1782195195133/01-time-tangled-hud-anchor.png`：`rightMargin=43`、`topMargin=2`、`hudCenterYRatio=0.039`；日志记录 `HudLayoutFallback&count=1&invX=652&wardX=708&mapX=764`。Super Power 复测 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782195292167.json` 同样通过，`rightMargin=43`、`topMargin=2`。这只关闭 AS2 代表样本的右上 HUD 锚点/淡暂停按钮可见问题，不代表窗口/F11、任务物品弹窗、自然路线、对话热区、AS3 队列或音频源全量封闭。

2026-06-23 00:20 EDT：新增 `HUD_VISUAL_CONTRACT.zh-CN.md`，把“右上角 HUD 正确”改成以真实 Flash 舞台为基准的像素级契约；后续 HUD 不能再只凭代码坐标或能点击判断。AS2 Time Tangled `malidocs.swf` 任务文件关闭链已从 blocker 改为通过：修复隐藏地图热区抢关闭按钮的问题，popup 打开时任何隐藏地图入口触发都会关闭当前 popup，而不会跳到地图。最新 G32QC/no-foreground/静音自动回归 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782187745277.json` 通过，`popupClose.ok=true`，`closeButtonStillVisible=false`，`mapOpenedDuringClose=false`，关闭日志为 `PopupClosePressed&target=openDirectMapBlockedMap`；截图 `runtime-data/qa/as2/interaction-smoke/run-1782187745277/01-time-tangled-popup-close.png` 人工复核为回到 Mali 场景，无 `关闭` 按钮残留。该项只关闭任务文件关闭链，不代表 Time Tangled 全岛封版；左/右蓝边自然路线复核、时间装置物品链、自然 NPC no-repeat、外链白屏和真实音频仍未关闭。

2026-06-23 00:35 EDT：AS2 原生场景导航标签完成文件级全量封闭。新增 `tools/audit-as2-native-navigation-labels.js`，按“只处理原生脚本 `labelText` 和整项导出 TextField；静态美术字不覆盖”的规则扫描。Time Tangled 24 个 AS2 场景审计 `runtime-data/qa/as2/native-navigation-labels/time-tangled.json` 通过，`blockerCount=0`，`scenePresent.swf` 已有 `旅行/进入/公共房间` 脚本证据。全 AS2 首轮审计只发现 Early Poptropica `sceneMuseum.swf` 一个原生 TextField `EXIT` 漏项；已用 `tools/patch-as2-native-navigation-text-fields.js` 原位替换为 `退出`，报告 `runtime-data/qa/as2/native-navigation-labels/text-field-patch.json`，并重建 `runtime-data/patched-zips/as2-runtime.zip`。二次全 AS2 审计 `runtime-data/qa/as2/native-navigation-labels/all-islands.json` 通过，80 个场景 SWF、`blockerCount=0`。实景复核 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782189287851.json` 通过，截图 `runtime-data/qa/as2/interaction-smoke/run-1782189287851/01-early-poptropica-initial.png` 显示 Museum 门口原生 `退出`、角色可见、HUD 右上。该项关闭 AS2 原生导航标签漏翻；如果后续截图仍出现英文箭头/招牌/海报，则按静态美术资产记录，不再用中文文本层硬盖。

2026-06-23 00:42 EDT：Time Tangled 追加 6 场景直入视觉矩阵，不推进新岛。G32QC/no-foreground/静音覆盖 `Present/Lab/Future/Future2/Mali/Viking`，报告分别为 `as2-interaction-smoke-1782189496055.json`、`1782189530706.json`、`1782189565754.json`、`1782189600365.json`、`1782189635533.json`、`1782189670277.json`，6/6 均 `ok=true`、`visualGuardPassed=1`、`failedKeys=[]`。人工复核 `run-1782189600365/01-time-tangled-initial.png` 和 `run-1782189670277/01-time-tangled-initial.png`：角色可见，HUD 在真实舞台右上，边缘为深色 letterbox/场景内容，不是 `#139ffd` 蓝底泄漏；两张视觉守卫报告目标蓝色边缘占比均为 0%。该矩阵关闭 Time 代表场景“直入即崩/角色消失/蓝底泄漏”的一批样本，但仍不等于自然时间装置路线和全时代物品链通关。

当前项目还不能声明成品完成，但 AS3 P0 代表样本继续前进，AS2 对话和 AS2 窗口/F11 代表样本也开始闭环。`1781865386476` 四岛回归覆盖 Monster Carnival、Poptropicon、Reality TV Wild Safari、Timmy Failure，4/4 通过 resize、maximize、F11 fullscreen、视觉稳定和 post-viewport 中文对话检查。新的 F11 场景切换专项 `1781873821483` 已在 G32QC 真全屏 2560x1439 下抓到 Poptropicon Parking -> Center 的真实加载 Logo/进度点，中心偏移约 x=-3/y=12 与 x=10/y=-50，均在阈值内。随后 `1781874030360` 复测 Poptropicon + Timmy，2/2 通过中文对话、resize、maximize、F11 稳定性。AS2 Mystery Train `EdisonCabin` 已通过 `1781882735773`：原生 Edison 气泡显示中文“等我把这里布置好...先去见见其他乘客吧”，OCR 含预期片段 `乘客`，场景证据、地图点击、视觉守卫通过，音频会话为 0。AS2 Spy `SpyMain` 已通过 `1781886126401`：运行时进入真实 SpyMain 场景，QA hook 只调用游戏原生 `manualSay` 气泡，OCR 捕获中文，scene evidence/visual guard/audio mute 通过；人工复核 `1781885938525` 可见“和 D 局长谈过后再来找我。”，`1781886012217` 可见“我有个关于斯派格拉斯博士的重要消息要告诉你。”，静态 `the hair club` 美术字保持英文。AS2 Mystery Train 主街 `1781882945247` 通过窗口模式 loading 居中和 F11 稳定场景截图，F11 客户区截图为 `2560x1306`，超过当前 80% 尺寸门槛；人工检查 HUD/角色/场景稳定。AS2 Early Poptropica / Spy / Super Power 批量样本 `1781883257875` 进一步证明三岛均能进场景、F11 后 HUD/角色/场景稳定、音频会话为 0；其中 Early 还捕获到居中 `Poptropica LOADING`，Spy/Super Power 因加载已进入场景而未捕获 loading 帧，记为证据缺口，不记为画面崩坏。旧 AS2 F11 代表截图曾有底部蓝色保存栏/裁切带；Early 当前 build 已通过 `1782087918807` 和 `1782087997744` 证明底部蓝边修掉、角色可见、HUD 稳定，后续仍需把同一口径扩展验证到更多 AS2 岛。静态笔记本页、Menu 图标、店铺/博物馆/箭头图片文字均按规则保留英文，不再做中文覆盖。QA 误判口径已收紧：门牌 `进入/公共房间`、静态报纸/店铺英文、以及 F11 loading overlay 不再能伪造成“中文对话通过”或“稳定画面通过”。仍未闭环的是：更多岛屿实玩、Timmy 自然剧情全流程、Monster 普通 NPC/自然剧情热区、更多 UI 面板、AS2 更多岛屿/真全屏 loading、全岛屿深度实玩。

当前迭代方式改为“先样板岛，再逐岛复制验收”。Poptropicon 被设为第一样板岛：它目前已经能在 G32QC 侧屏静音打开到 `con1/parking`，截图 `runtime-data/qa/manual-poptropicon-demo.png` 显示场景进入、右上角 UI 稳定、原生中文气泡正常；静态 `HOBO/MIGHTY/LEARN TO SPEAK FREMLON!` 等场景美术字保持英文。后续不再同时漫游多个问题域；先把 Poptropicon 补成“房间切换、resize/F11、loading、对话、UI、箭头”完整样板，再按同一 checklist 逐岛推进。

2026-06-22 13:50 EDT：按中期试玩反馈，`Time Tangled 已封版` 结论重开，不再推进新岛。当前 wave 1 已修复 AS2 QA 参数污染 `gameplay.swf?` 后跳 `base.php/saveData` 黑页的问题：framework 改用 `_global.flashpointQaAs2Dialog/_global.flashpointQaLoadingHoldMs` 传 QA 开关，gameplay 与 Time Lab hook 读取 `_global`，正常 `gameplay.swf` URL 保持不带 query。已重打 `framework.swf`、`gameplay.swf`、`sceneLab.swf` 并重建 AS2 runtime zip。静音/G32QC/no-foreground 证据：loading 居中 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782150373279.json` 通过，0/500/1000/1500/2500/4000ms 均 OCR 到 `Poptropica LOADING`，中心偏移约 x=2/y=21-22；Time Lab 中文气泡 `as2-interaction-smoke-1782150448753.json` 通过，OCR 样本为“请帮帮我们。故障搅乱了时间，未来岌岌可危。”；Time 普通综合回归 `as2-interaction-smoke-1782150563288.json` 通过，地图点击、F11、scene evidence、缺失请求、静音均通过。当前仍不进入 Super Power；剩余 blocker 是全局 HUD/淡暂停图标、AS2/AS3 对话重复节流、任务物品弹窗/黑残留、科普外链白屏、更多自然场景路线和真实音频来源清单。

2026-06-22 14:50 EDT：修正 AS2 HUD 判断口径：`不重叠` 不等于 `右上角正确`。已定位 Time Tangled 可见三枚 HUD 图标来自 `gameplay.swf` 的 `navBar`，不是 framework 顶栏；诊断样本 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782153444792.json` 临时隐藏 gameplay HUD 后图标消失，证明层级判断。当前改为显式 AS2 坐标锚定，背包/服装/地图固定在 gameplay 可视区右上，暂停残影继续隐藏。新证据：`as2-interaction-smoke-1782153910199.json` 初始截图显示 HUD 在右上且不重叠；`1782153970576` 证明右移后的地图点击区仍可打开地图；`1782154039367` 证明 F11 后 HUD 仍在右上、角色可见；`1782154135577` 证明 loading 居中未回退。地图弹窗打开时 HUD 仍露在弹窗上沿外侧，归入后续“弹窗层级/任务物品弹窗” blocker，不把本项误判为完全封版。

2026-06-22 15:05 EDT：为避免再次主观误判“右上角”，新增 `tools/qa-helper.py analyze-hud-diff`，并给 AS2 QA 增加 `flashpointQaHideHud=1` 隐藏 HUD 基线。最新静音/G32QC/no-foreground 证据：正常截图 `as2-interaction-smoke-1782154863479.json`，隐藏基线 `as2-interaction-smoke-1782154908597.json`，差分报告 `runtime-data/qa/as2/interaction-smoke/as2-hud-diff-1782154863479.json` 通过。量化结果：3 个 HUD 图标，HUD 盒子 `left=1274 top=25 right=1498 bottom=80`，相对真实舞台右边距 44px、上边距 0px，图标纵向偏差 4px，间距 28px/22px，左上无异常差分。当前结论仅关闭 AS2 Time 顶层 HUD 右锚与淡暂停残影这一个子项；地图/任务物品弹窗层级、AS3 HUD 同口径复核、对话重复触发仍未关闭。

2026-06-22 15:35 EDT：HUD 验收从“JSON 通过”升级为“带框图可视证明”。`tools/qa-helper.py analyze-hud-diff` 现在默认使用更严格阈值，并输出 `--annotated-output`：黄色框为真实舞台，青色框为允许右上区域，绿色/橙色框为 HUD 与图标。当前 build 复测证据：正常截图 `as2-interaction-smoke-1782155801119.json`，隐藏 HUD 基线 `as2-interaction-smoke-1782155857042.json`，严格差分 `runtime-data/qa/as2/interaction-smoke/as2-hud-diff-1782155801119-strict.json`，带框图 `runtime-data/qa/as2/interaction-smoke/as2-hud-diff-1782155801119-annotated.png`。结果仍为 3 个 HUD 图标，右边距 44px、顶边距 0px、纵向偏差 4px、宽度占舞台 15%，当前截图人工复核为可接受右上角。另新增 AS2 全局 `showSay()` 重复保护：同一目标同一句在气泡未关闭或刚关闭时不再重复创建气泡。受控证明 `as2-interaction-smoke-1782156865837.json` 通过，截图 OCR 为 `重复对话测试`，server log 记录 `QaShowSayThrottle&suppressed=4&bubble=true&ticks=16`，即连续 5 次触发中 4 次被抑制。该项证明底层重复气泡入口已收敛；自然 NPC 热区和 AS3 对话队列仍需后续实玩回归。

2026-06-22 16:37 EDT：承认并修正 AS3 HUD 旧误判：旧 `qa:as3-hud-smoke` 只证明 MENU OCR 在右侧和按钮能点，不能证明展开后的整排图标视觉正确。已调整 `tools/patch-as3-shell-hud-labels.js`：AS3 `Hud` 的 MENU 顶距改为 26，展开图标以 MENU 为右锚点单行向左排布，静态 MENU 图标继续保留英文原图，不再叠中文文字层；脚本同时改为幂等写 manifest，避免重复追加同一 HUD 记录。已重打 `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf` 并重建 AS3 runtime zip，patch 报告为 `runtime-data/qa/as3/as3-shell-hud-labels-patch.json`。G32QC/no-foreground/静音样本通过：Poptropicon `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782159939059.json`，截图 `runtime-data/qa/as3/hud-smoke/run-1782159939059/01-poptropicon-resized.png`、`.../01-poptropicon-post-click.png`、裁切图 `.../01-poptropicon-resized-hud-crop.png`、`.../01-poptropicon-post-click-hud-crop.png`；Mystery of the Map `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782160130741.json`，截图 `runtime-data/qa/as3/hud-smoke/run-1782160130741/01-mystery-of-the-map-resized.png`、`.../01-mystery-of-the-map-post-click.png`、裁切图 `.../01-mystery-of-the-map-resized-hud-crop.png`、`.../01-mystery-of-the-map-post-click-hud-crop.png`。当前只关闭 AS3 代表样本的“左上散落/右上挤压”视觉问题，不等于所有 AS3 岛 HUD 封版；Poptropicon post-click diff 因截图高度不一致不能作为像素差分证据，以上裁切截图人工复核才是本项证据。下一步需要把这种裁切视觉标准固化成自动 full-row detector，并继续 Time Tangled 重开验收。

2026-06-22 16:55 EDT：AS3 HUD 视觉验收已从人工裁切进一步固化为自动槽位检测。`tools/qa-helper.py analyze-hud-row` 会以 MENU OCR 中心为锚点推算 8 个 AS3 HUD 槽位，逐槽检查边缘密度，并输出带框图；`tools/qa-as3-hud-smoke.js` 已在 post-click 后自动调用该检查，失败会写入 `expanded_hud_row_failed`。最新 G32QC/no-foreground/静音真实回归 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782161407460.json` 通过，报告内 `expandedHudRow.ok=true`、8/8 槽位通过，带框图为 `runtime-data/qa/as3/hud-smoke/run-1782161407460/01-poptropicon-expanded-hud-row.png`。旧误判负样本 `runtime-data/qa/as3/hud-smoke/run-1781972253353/01-poptropicon-post-click.png` 被新检测器判为失败：只有 5/8 槽位通过，缺 `settings/audio/home`，`row_top=132` 超阈值；负样本带框图为 `runtime-data/qa/as3/hud-smoke/run-1781972253353/as3-hud-row-auto-negative.png`。这项关闭“仅凭主观判断 HUD 正不正”的工具缺口；仍不等于所有 AS3 岛 HUD 全量通过。

2026-06-22 17:35 EDT：AS2 Time Tangled 公共 viewport/HUD gate 重新闭环。已把 AS2 `base.php` 改为 no-cache，并让 AS2 QA 启动 URL 自动 cache-bust，避免同一岛反复测试时随机拿到旧 `base.php`，这是此前“修好又退回白边/旧 HUD”的直接原因之一。AS2 gameplay viewport 改为三层结构：外层深色窗口兜底，中层只裁剪真实 gameplay 区域，Flash 本体保持 `noscale`；普通窗口不再露右侧白边或底部蓝底，F11 也不再露蓝底。`tools/qa-as2-interaction-smoke.js` 修正 `--require-f11` 只验收不触发的问题，现在要求 F11 就必定执行 F11；同脚本新增 `--require-hud-anchor`，自动生成隐藏 HUD 基线并调用 `analyze-hud-diff`，用舞台右上角而非浏览器窗口主观判断 HUD。最新 G32QC/no-foreground/静音硬门槛回归 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782163826135.json` 通过：`f11Passed=1`、`visualGuardPassed=1`、`hudAnchorPassed=1`、`mapClicksPassed=1`、`loadingCenterPassed=1`、`failedKeys=[]`。人工复核截图：初始 `runtime-data/qa/as2/interaction-smoke/run-1782163826135/01-time-tangled-initial.png`、F11 `.../01-time-tangled-f11.png`、地图 `.../01-time-tangled-map.png`、HUD 标注 `.../01-time-tangled-hud-anchor.png`；HUD 量化为右边距 43px、顶距 11px、行高差 3px。这关闭 AS2 Time 的窗口/F11/蓝边/HUD 量化 gate，不等于 Time Tangled 全岛剧情封版；任务物品弹窗、自然路线、更多 NPC 热区和外链白屏仍需后续逐项封闭。

2026-06-22 19:25 EDT：AS2 Time Tangled 的 F11/缩放恢复 gate 追加更严格复核。前一轮只能证明 F11 截图本身稳定，这轮修正为 F11 进入/退出和窗口缩放后自动重载当前场景，并在恢复重载 URL 中移除 `flashpointQaLoadingHoldMs`，避免退出 F11 后卡在 QA loading 覆盖层。最新 G32QC/no-foreground/静音完整回归 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782170505380.json` 通过：`ok=true`、`failedKeys=[]`、`audioActive=0`、`mapClicksPassed=1`、`sceneEvidencePassed=1`、`loadingCenterPassed=1`、`f11Passed=1`、`visualGuardPassed=1`、`hudAnchorPassed=1`。日志证明恢复重载两次请求 `flashpointResizeReload=1782170585104/1782170604252`，且均不再带 loading hold；地图请求 `/popups/map.swf` 和 `/popups/maps/Time.swf` 正常。人工复核 `runtime-data/qa/as2/interaction-smoke/run-1782170505380/01-time-tangled-post-f11.png`：角色可见、HUD 右上单行、无左上暂停残影、无蓝/白边；`.../01-time-tangled-hud-anchor.png`：HUD 三枚图标位于真实舞台右上，右边距 43px、顶距 11px、行高差 3px；`.../01-time-tangled-map.png`：地图弹窗可打开且 gameplay HUD 被压到弹窗下方，静态 `TIME TANGLED ISLAND` 原图保留英文。本段曾记录地图 `CLOSE` 按钮英文；20:30 EDT 复核已用静态按钮资产替换修复。仍未关闭：任务物品/文件弹窗黑残留、自然时间装置路线、更多 NPC 热区、外链白屏、AS3 对话队列和真实音频源清单。

2026-06-22 20:30 EDT：AS2 Time Tangled 地图弹窗 `CLOSE` 复核修复完成。根因不是普通 TextField，而是 `gameplay.swf` 顶层 `popupClose` 内的矢量路径字形；这解释了之前“文本已翻译但截图仍是 CLOSE”的反复。按静态美术规则，本次没有用运行时中文文本层硬盖，而是新增 `tools/lib/as2-popup-close-shape.js`，用 FFDec 把 shape 256 的静态按钮资产替换为中文 `关闭` 位图资产，并把补丁接入 `tools/patch-as2-gameplay-hud-popup.js` 和 `tools/lib/pack.js`，防止后续重包回退。最新 G32QC/no-foreground/静音完整回归 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782174297821.json` 通过：`ok=true`、`failedKeys=[]`、`audioActive=0`、`mapClicksPassed=1`、`sceneEvidencePassed=1`、`loadingCenterPassed=1`、`f11Passed=1`、`visualGuardPassed=1`、`hudAnchorPassed=1`。人工复核截图：地图 `runtime-data/qa/as2/interaction-smoke/run-1782174297821/01-time-tangled-map.png` 显示 `关闭` 与 `重启 岛屿`，静态 `TIME TANGLED ISLAND` 仍保留英文；HUD 标注图 `.../01-time-tangled-hud-anchor.png` 显示三枚 AS2 HUD 单行固定在真实舞台右上，右边距 43px、顶距 11px、行高差 3px；loading 样本 `.../01-time-tangled-loading-sequence/01-time-tangled-loading-300.png` 居中，OCR 偏移约 x=2/y=21；F11 截图 `.../01-time-tangled-f11.png` 角色可见、HUD 稳定、无蓝底泄漏。QA 口径补记：loading 必须显式传 `--loading-sample-ms` 才算证据；隐藏 HUD 基线会启动第二个 runtime，必须放在地图点击之后，避免旧窗口句柄失效。当前 Time Tangled 仍未全岛封版；剩余 blocker 是任务物品/文件弹窗黑残留和越界、自然时间装置路线、自然 NPC no-repeat 热区、箭头/原生标签全量 pass、外链白屏、AS3 对话队列和真实音频源清单。

2026-06-21 20:35 EDT：Early Poptropica 当前 build 封版基线通过，下一轮进入 Shark Tooth。已补 `early` 地图中文标题/介绍，并用 AS3 map smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782088417951.json` 证明地图介绍弹窗显示 `早期 Poptropica 岛`、中文介绍、`重新开始/开始`；静态 `EARLY POPTROPICA ISLAND` logo 和截图内欢迎牌保持英文原图。已用 `tools/seed-as2-early-translations.js` 补齐 44 条 Early AS2 原生脚本文本，并 patch `Balance/City/City2/Jamestown/Museum/Pit` 六个场景 SWF。AS2 F11/底部蓝边修复通过 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782087918807.json`，全量基线 `1782087997744` 证明地图请求、loading 居中、F11 稳定、视觉守卫和音频静音均通过。三段真实原生中文气泡通过 `1782087705505`、`1782087765988`、`1782087829923`，分别显示欢迎、旗帜、水塔/旧城区相关中文对话；QA hook 只在 `flashpointQaAs2Dialog` 参数存在时触发，不影响正常游玩。AS2 岛内旧地图弹窗也通过 `1782087997744` 证明可稳定打开；完整自然剧情通关和更多房间自然热区仍留到后续深测。

2026-06-21 21:40 EDT：Shark Tooth 当前 build 封版基线通过，下一轮进入 24 Carrot。已补 `shark` 地图中文介绍，AS3 map smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782092458415.json` 证明地图弹窗显示 `鲨鱼牙岛`、中文介绍、`重新开始/开始`，静态 `SHARK TOOTH ISLAND` logo 保持英文原图。已把 Shark AS2 原生脚本文本导入索引并补齐 68 条中文脚本翻译，patch `Booga/Castaway/Mainstreet/Medicine/Museum2/Ruins/Temple1/Temple2/Townhall` 九个场景 SWF。AS2 全量基线 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782090320593.json` 证明真实 `Shark/Mainstreet` 可进入、AS2 地图弹窗可打开、startup loading 居中、F11 稳定、角色可见、HUD 右上稳定、视觉守卫通过。三段真实原生中文气泡通过 `1782092019886`、`1782092069884`、`1782092117113`，分别显示鲨鱼鳍装扮、气泡椰奶、巨鲨恐慌相关中文对话；QA hook 只在 `flashpointQaAs2Dialog` 参数存在时触发，不影响正常游玩。静态 `WELCOME TO SHARK TOOTH`、地图 logo、场景招牌/海报/箭头/美术字保持英文或原图，不做中文文字层硬盖。完整自然剧情通关、Booga/Ruins/Temple/Medicine/Castaway 等更多房间自然热区和结局仍留到后续全岛深测。

2026-06-21 22:25 EDT：24 Carrot 当前 build 封版基线通过，下一轮进入 Time Tangled。已补 `carrot` 地图中文介绍，AS3 map smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782093999624.json` 证明地图弹窗显示 `24 根胡萝卜岛`、中文介绍、`重新开始/开始`，静态 `24 CARROT ISLAND` logo 保持英文原图。已导入 Carrot AS2 原生脚本文本并补齐活动缺失翻译，patch `CarrotMain/Diner/Factory/Farm/FarmHouse/Loading/Processing/Robot/Surplus` 九个场景 SWF。最终 AS2 全量基线 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782095220343.json` 证明真实 `CarrotMain` 可进入、AS2 地图弹窗可打开、startup loading 居中、F11 稳定、角色可见、HUD 右上稳定、视觉守卫和静音通过。三段真实原生中文气泡通过 `1782094725769`、`1782094806248`、`1782094882172`，分别显示胡萝卜不再消失、工厂关门找不到工作、汽油用完相关中文对话；QA hook 只在 `flashpointQaAs2Dialog` 参数存在时触发，不影响正常游玩。静态 `24 CARROT ISLAND`、`CARROT KING DINER`、`OPEN`、地图标题/场景招牌/海报/箭头/美术字保持英文或原图，不做中文文字层硬盖。完整自然剧情通关、农场/Charlie 店/餐厅/工厂/下水道/冷冻室/通风管/加工室/Rabbot 房间和结局仍留到后续全岛深测。

2026-06-22 00:05 EDT：Time Tangled 曾按旧门槛记录为封版基线通过，但 2026-06-22 13:50 EDT 中期反馈后已重开，不再作为进入 Super Power 的放行条件。旧证据仍保留：已补 `time` 地图中文介绍，AS3 map smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782097615542.json` 证明地图弹窗显示 `时空缠结岛`、中文介绍、`重新开始/开始`，静态 `TIME TANGLED ISLAND` logo 和希腊图中文字保持英文原图。已导入 Time AS2 原生脚本文本并补齐缺失翻译，patch `Aztec/China/Desolation/Edison/Everest/France/Future/Graff/Greece/Lab/Lewis/Mali/Present/Renaissance/Viking` 等 24 个场景 SWF；恢复 `scenes/islandTime/vendorCart.swf`，消除运行时缺失请求。旧 AS2 全量基线 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782100652713.json` 证明真实 `Time/Present` 可进入、AS2 地图弹窗可打开、startup loading 居中、F11 是真实游戏截图、角色可见、HUD 右上稳定、视觉守卫和静音通过。旧三段真实原生中文气泡通过 `1782099797488`、`1782099837988`、`1782099896495`。新增 wave 1 证据为 `1782150373279`、`1782150448753`、`1782150563288`；剩余全局 blocker 清完前，不声明 Time Tangled 完全封版。

2026-06-20 21:15 EDT：Reality TV Wild Safari 当前 build 封版基线通过。已通过 Shell class merge 恢复 `reality2` 可启动性，并重建 AS3 runtime；最终 P0 报告 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782003638919.json` 证明窗口模式、resize、maximize、F11、loading 观察、post-resize 中文对话和视觉稳定均通过，截图 `run-1782003638919/01-reality-tv-wild-safari-initial.png`、`...resized-dialogue-attempt-2.png`、`...maximized-retry-1.png`、`...f11.png` 已人工检查，角色不消失、菜单不漂移、不露蓝底。窗口 loading `as3-window-loading-transition-1782001447409.json` 和 F11/fullscreen loading `as3-f11-loading-transition-1782001638633.json` 通过，`run-f11-loading-1782001638633/f11-loading-sequence/f11-loading-500.png` 显示真全屏 loading 居中。地图介绍中文通过 `as3-island-smoke-1782003060696.json`，截图 `run-1782003060696/01-reality-tv-wild-safari-map.png` 显示 `真人秀：野外探险`、中文介绍、`重新开始/开始` 按钮。HUD/按钮通过 `as3-hud-smoke-1782001781173.json` 与 `as3-hud-button-matrix-1782002457747.json`；背包、确认框和设置/商店/地图入口按钮均按原生 UI 居中。对话稳定性通过 `as3-dialogue-stability-1782004103358.json`，3 张样本全中文，前两张同一句稳定，第三张正常进入下一句剧情；未发现重复气泡或抽搐。静态 `MENU`、`Reality TV/WILD SAFARI`、`DANGER/STAFF ONLY`、地图 Logo/Motel 图等美术字继续保留英文，不做中文叠层。

2026-06-21 02:10 EDT：Monkey Wrench 当前 build 封版基线通过，下一轮进入 Survival。已补 `ftue` 地图中文标题/介绍并重建 AS3 runtime；`as3-island-smoke-1782018890966.json` 显示 `扳手猴岛` 与中文介绍。P0 报告 `as3-p0-playability-1782019656438.json` 证明 `reloadOnResize=frame` 下窗口 resize、maximize 后角色、HUD、场景和中文对话稳定，未再出现页面级重载卡 loading。F11/loading 通过 `as3-f11-loading-transition-1782021663340.json`，G32QC 真全屏 `2560x1440`，3 个 `Poptropica` logo/loading 样本居中，无主屏/Codex 污染。对话稳定样本通过 Amelia `strange` `1782020113936`、Amelia `dialog_speed` `1782020195440`、Amelia `ring_bell` `1782020541562`，均为原生 Dialog 气泡，中文稳定、无重复抽搐。HUD 证据：设置面板 `as3-hud-smoke-1782020668442.json` 通过，背包 `as3-hud-smoke-1782021205618.json` 通过并显示 `扳手猴岛`、`背包里还没有物品。`、`去岛上探索...` 居中。FTUE `mainLand` 展开 HUD 本身不暴露商店/地图按钮，退出图标没有弹出确认框；这些记录为本岛 HUD 设计差异/后续自然路线补证，不用错误坐标强行点。静态 `MENU` 图标、`Juice Machine`、`Reception`、`CRUSOE'S CASTAWAY RETREAT`、地图 logo 和场景箭头/招牌按规则保留英文，不用中文文字层硬盖。废弃证据：`1782020999440` 背包误点、`1782021889627` 退出确认框未出现、`1782019893931` 后段采到 Codex 桌面、`1782021399945` F11 settle 过短、`1782021517022` 带 QA 起点 seed 的全屏灰屏，均不计入通过。

2026-06-21 06:15 EDT：Arabian Nights 当前 build 封版基线通过，下一轮进入 Escape from Pelican Rock。已补 `arab1/arab2/arab3` 与 `arabEpisodic` 地图中文标题/介绍；地图 smoke `as3-island-smoke-1782029786436.json` 显示第 1 集中文介绍与 `重新开始/开始`。最新 Shell 已扩展 `game.scenes.arab1.bazaar.Bazaar` 原生 Dialog QA hook 和 `qa_auto_scene_arab1_desert` loading 专用切场 hook；AS3 runtime zip 已写入新 Shell。窗口 resize/maximize 回归 `as3-p0-playability-1782036700970.json` 通过，最终截图 `run-1782036700970/01-arabian-nights-resized.png` 与 `...maximized-retry-1.png` 证明角色可见、MENU 右上稳定、无蓝底/非游戏 UI。窗口 loading `as3-window-loading-transition-1782036333988.json` 通过，代表图 `run-window-loading-1782036333988/window-loading-sequence/window-loading-4000.png`；F11/fullscreen loading `as3-f11-loading-transition-1782036503309.json` 通过，代表图 `run-f11-loading-1782036503309/f11-loading-sequence/f11-loading-0.png`，G32QC 真全屏且 loading 居中。HUD 样本通过：背包 `1782031265590`、设置 `1782031427653`、商店确认 `1782031583317`、地图确认 `1782031745867`。三段真实原生中文对话通过：Trader2 `1782034402463`、Trader1 `1782034488207`、Trader3 `1782034573399`，均为 `Dialog.sayById()`，中文气泡稳定；player `need_spy_glass` `1782034258831` 作为额外校准通过。静态 `MENU`、`Grand Bazaar`、`Your Highness`、海报、摊位招牌和场景美术字保持英文/原图，未使用中文文字层硬盖。

2026-06-21 07:34 EDT：Escape from Pelican Rock 当前 build 封版基线通过，下一轮进入 Galactic Hot Dogs。已补 `prison/island/page.xml` 地图中文标题/介绍，并用 `tools/update-as3-runtime-entries.js` 写入 AS3 runtime zip；最终地图 smoke `as3-island-smoke-1782038868052.json` 显示 `逃离鹈鹕岩`、中文介绍、`重新开始/开始`，静态 `ESCAPE FROM PELICAN ROCK` 标志保持英文原图。最新 Shell 已扩展 `game.scenes.prison.hill.Hill` 原生 Dialog QA hook 和 `qa_auto_scene_prison_yard/cellBlock` loading 专用切场 hook。窗口 resize/maximize/F11 回归 `as3-p0-playability-1782039033401.json` 通过，人工检查 `run-1782039033401/01-escape-from-pelican-rock-resized.png`、`...maximized-retry-1.png`、`...f11.png`：角色可见，MENU 右上稳定，无蓝底/非游戏 UI。窗口 loading `as3-window-loading-transition-1782039314137.json` 通过；F11/fullscreen loading `as3-f11-loading-transition-1782039474396.json` 通过，`f11.fullscreenLike=true` 且 loading 居中。HUD 样本通过：背包 `1782039730282`、设置 `1782040006268`、商店确认 `1782040688698`、地图确认 `1782040849648`，截图人工复核中文居中、不重叠。三段真实原生中文对话通过：player `tower` `1782041030923`、tex `listen_up` `1782041218501`、p2 `gee` `1782041576351`，均为 `Dialog.sayById()` 或同一原生 Dialog 链路，中文气泡稳定、无重复抽搐。废弃样本已标记：`p1/stop` 和 `bandit/odds` 在当前 seed 下无实体对白，`tex/listen_up` 与 `p2/gee` 的早期 run 仅因 OCR 精确子句失败，不计通过。静态 `MENU`、地图 logo、场景箭头/标牌/海报/美术字保持英文或原图，未使用中文文字层硬盖。

2026-06-20 11:56 EDT：按封版验收口径停止全局矩阵，只保留 Poptropicon 单岛任务。已修复 MapIslandLoader clean-build 回退问题：地图场景不再卡 loading，岛名不再显示 `function Function(){}`；新增 `flashpointAutoLoadIsland` direct 参数用于验收时自动打开指定岛屿介绍，不影响默认地图流程。证据：地图页 `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781969723905.json` 与截图 `runtime-data/qa/as3/islands-smoke/run-1781969723905/01-poptropicon-map.png`；PoptropiCon 地图介绍中文弹窗 `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781970833623.json` 与截图 `runtime-data/qa/as3/islands-smoke/run-1781970833623/01-poptropicon-map.png`，OCR 捕获“第1章：排队从这里开始”“PoptropiCon 是镇上最热门的入场券...”“开始”。当前仍未封版：地图弹窗左下 `RESTART`、更多菜单/背包/商店/确认框按钮居中、最新窗口/F11/loading/3 个 NPC 对话复测仍需继续。

2026-06-20 12:27 EDT：Poptropicon 封版第 2 项 UI 按钮/面板补证完成。地图弹窗左下 `RESTART` 已改为原生按钮层中文 `重新开始`，截图 `runtime-data/qa/as3/islands-smoke/run-1781971850505/01-poptropicon-map.png`，OCR 捕获 `重新开始/开始`。菜单展开截图 `runtime-data/qa/as3/hud-smoke/run-1781972253353/01-poptropicon-post-click.png` 显示静态图标仍保留英文/图形，不做中文硬盖；背包截图 `runtime-data/qa/as3/hud-smoke/run-1781972253353/01-poptropicon-inventory.png` 显示 `Poptropicon 漫展岛`、`背包里还没有物品。`、`去岛上探索，看看能找到什么！` 居中；商店入口确认框截图 `runtime-data/qa/as3/hud-smoke/run-1781972493179/01-poptropicon-secondary.png` 显示 `进入商店？` 与居中 `确定`；设置面板截图 `runtime-data/qa/as3/hud-smoke/run-1781972718330/01-poptropicon-secondary.png` 显示 `设置/声音/音效/音乐/对话速度/画质/退出登录` 中文居中。当前仍未封版：最新 build 的窗口缩放/最大化/F11、loading 居中、至少 3 个真实 NPC/剧情中文对话仍需继续复测。

2026-06-20 13:00 EDT：Poptropicon 封版第 3 项窗口缩放/最大化/F11 补证完成。修正 `tools/qa-as3-p0-playability.js` 的窗口重载验收夹具：resize/max/F11 后允许重新匹配新的 Flashpoint Navigator PID/句柄，F11 退出恢复按键改为 best-effort，避免把已经稳定的 F11 截图误判失败。通过报告 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781974446974.json`，截图 `run-1781974446974/01-poptropicon-resized-retry-1.png`、`01-poptropicon-maximized-retry-1.png`、`01-poptropicon-f11-retry-2.png` 证明角色可见、菜单保持右上、场景不露蓝底、不灰屏、UI 不漂移；静态 `MENU/SPACE JAUNT/HOBO/MIGHTY/NEW MERCH/FREMLON!` 等美术字保持英文。补充证据：`1781973519350` 暴露了 1450x900 直接跳最大化时的灰屏失败样本；当前通过样本使用 2200x1200 大窗口再最大化，1450x900 resize 独立通过。下一步仍只做 Poptropicon：loading 居中复测、至少 3 个真实 NPC/剧情中文对话。

2026-06-20 13:13 EDT：Poptropicon 封版第 4 项 F11/全屏 loading 居中复测完成。先手动启动 `tools/mute-poptropica-runtime.ps1` 12 小时静音守护，再运行 F11 场景切换 loading 专项；运行结束后清理残留 Flashpoint Game Server。通过报告 `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1781975368217.json`，截图 `run-f11-loading-1781975368217/f11-loading-sequence/f11-loading-1000.png` 与 `f11-loading-2000.png` 显示真实 Poptropica loading Logo/进度点居中。检测结果 2 帧，中心偏移分别约 x=-1/y=-50（x=-0.04%、y=-3.44%）和 x=14/y=-52（x=0.55%、y=-3.65%），均在阈值内。窗口模式专项 `1781975067353` 没抓到场景切换 loading，记录为采样路径问题，不作为失败画面。

2026-06-20 13:56 EDT：Poptropicon 封版第 5 项“至少 3 个真实 NPC/剧情中文对话”补证完成，均在 G32QC 静音运行，`audioActive=0`。通过证据：Alley `guard1/vips` 报告 `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781977471786.json`，截图 `run-1781977471786/01-poptropicon-alley.png`，OCR 命中“仅限VIP。”；Bathrooms `viking1/no cutting` 报告 `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781977773636.json`，截图 `run-1781977773636/01-poptropicon-bathrooms.png`，OCR 命中“喂！不许插队！”；Alley `bouncer/getOff` 报告 `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781978050743.json`，截图 `run-1781978050743/01-poptropicon-alley.png`，OCR 命中“快从那儿下来。”。静态 `EXIT ONLY / SNACKS FOR CONSEC ONLY / BUCKY LUCAS IS THOR / MIGHTY ACTION FORCE / RESTROOMS / MENU` 等美术字保持英文。未计入通过证据的尝试：Center `costume` 被 intro 弹窗挡住，Parking `wizard/alien_teacher` 未出气泡，Bathrooms `spFan` 镜头外，Alley `guard2` 未出气泡；这些只作为 QA hook/路线后续优化项，不影响本次 3 NPC 验收。

2026-06-20 16:48 EDT：修正 AS3 interaction QA 假阳性和静音误判。`tools/qa-as3-islands-smoke.js --help` 现在只输出帮助，不再误启动全岛测试；`--direct-scene` 已作为 `--override-scene` 别名；有本次 runtime PID 时，截图恢复不再降级匹配其他 AS3 岛窗口，避免 Mocktropica/Carnival 等旧窗口污染 Poptropicon 报告。`tools/qa-helper.py audio-check` 新增 `--respect-session-mute`，静音 QA 下按目标游戏音频会话是否未静音判断，不把用户主扬声器上的其他声音误记成游戏声音；最新 Poptropicon 交互失败样本 `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781988237937.json` 显示 `audioActive=0`、目标 session `audibleSessionCount=0`。同时给 interaction evidence 增加 `--expected-interaction-scene`，防止把像素变化或静态英文 OCR 误报为切场成功。当前明确失败项：后台 PostMessage 点击 Parking 左上透明出口区未触发 `con1/bathrooms` 场景加载，截图 `runtime-data/qa/as3/interaction-smoke/run-1781988237937/01-poptropicon-parking-interaction.png` 仍停在 Parking，证据检查 `expected_interaction_scene` 对 `bathrooms` 的 data/asset/SceneLoaded 计数均为 0。该失败不计入游戏内容退化，计入“自然后台输入路线未闭环”。

2026-06-20 16:54 EDT：Poptropicon con1 四房间当前 build 直接进入基线复核完成，均为 G32QC/no-foreground/静音，`audioActive=0`。通过：Parking `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781988445090.json`，Bathrooms `as3-island-smoke-1781988509474.json`，Alley `as3-island-smoke-1781988639833.json`。Center 第一次 `1781988574609` 在 18 秒采样仍处 loading，按失败记录；随后延长等待后 `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781988743837.json` 通过，截图 `run-1781988743837/01-poptropicon-center.png` 显示中文 intro “漫展岛火热开幕！想办法进场！”和居中 `开始`，静态 `COSTUME CLOSET` 等美术字保持英文。结论：房间资源、视觉、HUD、静态美术规则当前稳定；自然后台切场仍未封口。

2026-06-20 18:00 EDT：Timmy Failure 当前 build 的 resize/maximize/F11 窗口稳定性封口。先修复 QA 捕获层：`qa-helper.py` 支持按命令行片段匹配当前 direct scene，no-foreground 截图时临时 topmost 并重绘，click/key 先重捕当前窗口再定位；`qa-as3-p0-playability.js` 不再把 Codex/系统 UI OCR 当成中文对话，并用截图元数据里的当前窗口句柄继续点击。通过报告 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781992566369.json`，截图 `run-1781992566369/01-timmy-failure-resized.png`、`01-timmy-failure-maximized-retry-1.png`、`01-timmy-failure-f11-retry-2.png`。结论：1450x900 resize、最大化、F11 2560x1440 均稳定，角色不消失，菜单仍在右上，箭头/店招/博物馆静态美术保持英文，中文对话在 resize/max/F11 后可见且位置正常；`nonGameUiCapture=false`，`failedChecks=[]`。音频复核：游戏目标 sessionCount=0、audibleSessionCount=0、loopback inactive、`audioLikelyActive=false`。

2026-06-20 18:45 EDT：Timmy Failure 本轮补齐窗口 loading、地图介绍和 HUD UI 样本。窗口模式 loading 居中通过：`runtime-data/qa/as3/p0-playability/as3-window-loading-transition-1781993533751.json`，截图 `runtime-data/qa/as3/p0-playability/run-window-loading-1781993533751/window-loading-sequence/window-loading-1000.png`，中心 `Poptropica` logo/loading dots 在阈值内。地图介绍已从 native `page.xml` 补中文：`runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781994081095.json`，截图 `runtime-data/qa/as3/islands-smoke/run-1781994081095/01-timmy-failure-map.png`，OCR 含 `提米·失败岛` 和中文描述。HUD QA 已修正 `MENU/WENU` 识别、resize 后 `saving game` 等待和菜单坐标；背包通过 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781995142228.json`，截图 `run-1781995142228/01-timmy-failure-inventory.png`；商店确认框通过 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781995285510.json`，截图 `run-1781995285510/01-timmy-failure-secondary.png`；设置面板通过 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781995421944.json`，截图 `run-1781995421944/01-timmy-failure-secondary.png`。静态 `MENU/PRIZE/OPEN` 和场景牌仍保留英文，不做中文叠层。仍未封口：至少 3 段真实 NPC/剧情中文对话、重复点击对话不重复/不抽搐、更多场景进入。

2026-06-20 18:51 EDT：Timmy Failure F11/fullscreen loading 居中已封口。通过报告 `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1781995697003.json`，截图 `runtime-data/qa/as3/p0-playability/run-f11-loading-1781995697003/f11-loading-sequence/f11-loading-0.png`、`f11-loading-500.png`、`f11-loading-2000.png`；G32QC 全屏客户区 `2560x1392`，7 个 `Poptropica` logo/loading dots 样本全部在阈值内，最差 y 偏移约 `-0.0551`。这关闭 Timmy 当前 build 的 fullscreen loading blocker，剩余仍是 3 段真实对话、不重复/不抽搐和更多场景进入。

2026-06-20 19:27 EDT：Timmy Failure 真实中文对话和“不重复、不抽搐”补证完成。扩展 `tools/patch-as3-monster-qa-dialog.js` 的 Timmy 原生 Dialog QA hook：支持 `scutaro/timmy/player + flashpointQaDialogId`，仍调用游戏原生 `Dialog.sayById()`，并把旧的“每秒重复 45 次”改为延迟 2 秒的一次性触发，QA 截图时只延长 `DialogData.timeOverride`，不做文本覆盖。三段对话均通过 scene evidence、visual guard、音频 inactive：Scutaro `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781997500162.json`，截图 `run-1781997500162/01-timmy-failure-mainStreet.png`，OCR 含“哎呀！嘿，这可不好玩...”；Timmy `as3-island-smoke-1781997571581.json`，截图 `run-1781997571581/01-timmy-failure-mainStreet.png`，OCR 含“喂！新来的！小心点。这附近有坏事发生。”；player `as3-island-smoke-1781997647965.json`，截图 `run-1781997647965/01-timmy-failure-mainStreet.png`，OCR 含“我……会小心的。”。稳定性序列 `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1781997996988.json` 通过，5/5 帧中文一致，`uniqueHan=我会小心的`，`duplicateExpectedSampleCount=0`，stage/visual 全绿；代表截图 `run-1781997996988/sequence/dialogue-0.png` 到 `dialogue-4000.png`。静态 `MENU/OPEN/BOW...` 仍按规则保留英文。

2026-06-20 19:54 EDT：Timmy Failure 当前 build 封版回归通过。修正 `tools/qa-as3-p0-playability.js`：遇到 Flash 插件崩溃页可重试入口；识别并关闭 Timmy 静态剧情书页弹层，不翻译该美术页；resize 后已拿到中文对话时，最大化阶段只验证布局/角色/场景稳定；F11 改为先恢复窗口尺寸、等待 `reloadOnResize` 稳定后再切全屏，避免最大化状态下灰屏。通过报告 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781999359459.json`，`ok=true`，`failedChecks=[]`。证据：书页关闭后主街中文对话 `run-1781999359459/01-timmy-failure-story-popup-closed.png`；resize 中文对话 `run-1781999359459/01-timmy-failure-resized.png`；最大化稳定 `run-1781999359459/01-timmy-failure-maximized-retry-1.png`；F11 稳定 `run-1781999359459/01-timmy-failure-f11.png`。检查项：`sceneStable=true`、`visualStable=true`、`dialogueChinese=true`、`postResizeDialogueChinese=true`、`f11Stable=true`、`nonGameUiCapture=false`。静态剧情书页、`MENU`、店招、箭头/标牌继续保留英文，不做中文叠层。

Poptropicon 样板岛最新进展：用户指出的“角色消失”已定位到启动点、门返回坐标和样板岛 MotionBounds 三处不一致；当前已改为 scene.xml 约束值并重建 AS3 runtime。截图 `runtime-data/qa/poptropicon-player-boundsfix-start.png`、`runtime-data/qa/poptropicon-player-boundsfix-after-ground-right.png`、`runtime-data/qa/poptropicon-player-boundsfix-right-edge.png` 证明玩家启动、右移、接近右边界后仍可见，且不再露蓝色场景外底图。岛屿介绍弹窗已从 `Center.as` 原生 `introPopup.updateText(...)` 修为中文短文案，截图 `runtime-data/qa/poptropicon-intro-cn-short-popup.png` 证明文本和 `开始` 按钮完整显示；`runtime-data/qa/poptropicon-resize-win32-1600x900-after.png` 和最新封版样本 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781974446974.json` 证明真实窗口缩放、最大化和 F11 后玩家、菜单、对话和场景稳定。当前仍不能声明 Poptropicon 完全完成：全 con1 房间自然遍历、自然点击对话路线、剧情状态推进和前述未计入证据的 QA hook 边缘样本仍需继续。

2026-06-20 追加：Poptropicon/con1 继续按单岛方式推进，未切到其他岛。Parking 边缘调试红块已移除，透明边缘热区恢复；`tools/qa-as3-islands-smoke.js` 已支持 direct-scene 坐标/方向和 Flash 子窗口 PostMessage 点击，测试不抢主鼠标。Bathrooms 默认启动被误判为“走到边界”并弹回 Parking 的问题已修：con1 shared edge router 现在必须检测到玩家朝出口方向移动才切场。证据：`runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781943959078.json` 证明 Bathrooms 直接启动不再回弹；`runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781944355947.json` 证明 Parking -> Bathrooms；`runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781944459038.json` 证明 Parking -> Center 且 Center 介绍弹窗中文。AS3 fallback 背景已从亮蓝改为 `#59645d` 并重建 Shell/runtime zip；`runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781945227241.json` 与截图 `runtime-data/qa/as3/islands-smoke/run-1781945227241/01-poptropicon.png` 证明窗口模式 Parking 可加载且不再出现旧的亮蓝底边。仍未放行：最新 build 的 F11/fullscreen、Center/Bathrooms/Alley 往返、菜单面板内部按钮、更多自然剧情对话和全屏底部填充还需要继续验证。

2026-06-20 resize 复核：Poptropicon 普通窗口当前通过 `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781948027014.json`；大尺寸冷启动也通过，`2300x1320` 证据为 `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781947064184.json`，`2560x1392` 证据为 `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781947475547.json` 和截图 `runtime-data/qa/as3/islands-smoke/run-1781947475547/01-poptropicon.png`。此前“运行中最大化/resize”失败为 `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781947882989.json`，截图 `runtime-data/qa/as3/islands-smoke/run-1781947882989/01-poptropicon.png`：Flash 插件窗口已经被拉大，但内部 stage 仍按旧启动尺寸渲染，右侧和底部出现大片白区。已尝试 iframe -> embed wrapper、默认整页 resize reload、JS 动态重建 embed、`scale=exactfit`；`exactfit` 无效且已撤回。当前新路线是运行时级别的“尺寸变化后按新尺寸重启/重开 Navigator”，不再依赖旧 NPAPI Flash 原地 resize。

2026-06-20 resize relaunch 进展：新增 `tools/runtime-resize-relaunch.js`，并让 AS3 后台 layout watcher 在检测到稳定尺寸变化后重启当前 active-runtime URL。证据：小窗口基线 `runtime-data/qa/poptropicon-resize-relaunch/poptropicon-initial-small.png`，视觉守卫 `runtime-data/qa/poptropicon-resize-relaunch/poptropicon-initial-small-visual-guard.json` 通过；最大化触发 `runtime-data/qa/poptropicon-resize-relaunch/wait-maximize-trigger.json`，旧 PID `76720` 从 `1186x760` 变为 `2576x1408`；relaunch 报告 `runtime-data/qa/runtime-resize-relaunch/runtime-resize-relaunch-1781949073342.json` 证明已重启到新 PID `55688`，目标 G32QC，窗口 `2576x1408`；重启后截图 `runtime-data/qa/poptropicon-resize-relaunch/poptropicon-after-maximize-relaunch.png` 证明角色可见且没有旧白边/蓝底，视觉守卫 `runtime-data/qa/poptropicon-resize-relaunch/poptropicon-after-maximize-relaunch-visual-guard.json` 通过，右边白色 `0.054466%`、底部白色 `0.597767%`、旧亮蓝 `139ffd` 为 `0.0%`。这可以作为“运行中尺寸变化后稳定重载”的初步通过证据；但还不能关闭 Poptropicon 全岛验收，因为 F11/fullscreen/loading、菜单面板内部按钮、全 con1 往返和更多自然剧情对话仍未完成。

测试窗口现在默认静音。`tools/lib/flashpoint-runtime.js` 会在启动 Flashpoint/Poptropica 运行时前先调用 `tools/mute-poptropica-runtime.ps1`，默认守护 43200 秒；脚本只静音属于 Poptropica/Flashpoint 上下文的 Flashpoint Navigator、Basilisk、Flash 插件、Ruffle/浏览器壳音频会话，不改系统主音量，也不静音用户正常应用。AS2 HTML 音频桥还支持 `flashpointQaMuteAudio=1`，QA 启动会自动带这个参数，让补充音效资源可被请求/审计但不实际出声。2026-06-20 13:22 EDT 复核：静音守护 PID `64424` 仍在运行，当前无残留 Flashpoint/Ruffle 播放进程；后续 QA 必须继续在 G32QC 上静音运行。

## P0 Blocker 总表

| P0 | 验收目标 | 当前状态 | 已知证据 | 当前缺口 | 下一步 |
|---|---|---|---|---|---|
| 1 | 窗口大小变化/全屏切换后，当前场景稳定重新加载或重新布局；UI、角色、对话、按钮不漂移、不崩坏 | Poptropicon/Timmy/Reality TV 当前封版样本通过；全项目仍 In progress | AS3 `base.php` 已改为 960x640 逻辑视口按窗口等比居中；Reality TV + Poptropicon `1781852948141` 二岛通过；Monster + Poptropicon + Reality TV `1781862435394` 三岛通过；Timmy `1781865156687` 单岛通过；Monster + Poptropicon + Reality + Timmy `1781865386476` 四岛通过；最终 Poptropicon + Timmy `1781874030360` 2/2 通过；Poptropicon 当前样板图 `runtime-data/qa/poptropicon-player-boundsfix-start.png`、`runtime-data/qa/poptropicon-player-boundsfix-after-ground-right.png`、`runtime-data/qa/poptropicon-player-boundsfix-right-edge.png`、`runtime-data/qa/poptropicon-resize-win32-1600x900-after.png` 和 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781974446974.json` 证明玩家不消失、右边界不露底、真实窗口缩放/最大化/F11 后稳定；Timmy 当前 build `1781999359459` 封版通过；Reality TV 当前 build `1782003638919` 证明窗口、resize、maximize、F11 后角色/HUD/场景稳定且 resize 后中文对话可继续；AS2 Mystery Train `1781882945247` F11 截图 `2560x1306`，场景/HUD/角色人工检查稳定；AS2 `1781883257875` 覆盖 Early Poptropica、Spy、Super Power，三岛 F11 均 `2560x1306`、scene evidence/visual guard 均通过，人工检查 HUD/角色/场景稳定 | 1450x900 直接跳 maximize 曾有灰屏失败样本 `1781973519350`，当前以 2200x1200 大窗口再最大化通过，后续可继续优化这个边缘路径；Poptropicon 自然后台切场仍未封口；Timmy/Reality 更深剧情通关仍未全闭环；Monster 自然剧情/普通 NPC 热区仍未全审；AS2 F11 底部蓝色保存栏/裁切带仍需优化；全 47 岛未深度巡检 | 下一轮进入 Monster Carnival；Poptropicon 自然后台切场另列输入 harness blocker |
| 2 | 场景加载进度条始终在窗口中心，覆盖窗口模式、全屏、不同分辨率 | In progress, AS3 Poptropicon/Timmy/Reality TV 窗口和 F11 样本通过；AS2 窗口和 fullscreen 代表样本通过 | `1781839546495`：1186x760 捕获 `Poptropica LOADING`，中心偏移 x=-3/y=2；`1781840348376`：1450x900 捕获 initial loading，中心偏移 x=-2/y=2；`1781869169141`：start-flow 窗口 loading-only gate 通过，中心偏移 x=-3/y=2；Poptropicon F11 `as3-f11-loading-transition-1781873821483.json` 和 `1781975368217` 均通过；Timmy 窗口 loading `as3-window-loading-transition-1781993533751.json` 通过；Timmy F11/fullscreen loading `as3-f11-loading-transition-1781995697003.json` 通过，G32QC `2560x1392`，7 帧居中；Reality TV 窗口 loading `as3-window-loading-transition-1782001447409.json` 和 F11/fullscreen loading `as3-f11-loading-transition-1782001638633.json` 通过，代表截图 `run-f11-loading-1782001638633/f11-loading-sequence/f11-loading-500.png` 居中；AS2 Mystery Train `1781882945247` 窗口 loading 居中；AS2 Mystery Train `1781888576562` 与 Early Poptropica `1781888862295` fullscreen loading hold 样本居中 | Spy/Super Power 窗口 loading 因当前采样时已进入场景而没有捕获，属于证据缺口；更多 AS3/AS2 场景和更多窗口尺寸仍未覆盖；start-flow F11 过早按 F11 会触发 Flash 插件崩溃，不能采用 | 继续逐岛补窗口/fullscreen loading 样本；必要时加 QA-only loading hold，但不能用假覆盖层冒充真实 loading |
| 3 | 运行时 NPC/场景对话必须套用中文；不能只看覆盖率报告 | In progress, Poptropicon/Timmy/Reality TV 当前封版对话样本通过；AS3 四岛代表对话通过；AS2 EdisonCabin 和 SpyMain 代表样本通过 | Reality TV + Poptropicon `1781852948141` 在 resize/maximize 后实测中文 NPC 气泡；Poptropicon `1781862189094` resize/maximize 后 Alien Teacher 原生中文选项通过；Monster + Poptropicon + Reality TV `1781862435394` 三岛 post-viewport/post-resize 中文对话检查通过；Timmy `1781865156687` Scutaro 原生中文气泡通过；四岛 `1781865386476` 与最终双岛 `1781874030360` 通过；Poptropicon 当前样板 `runtime-data/qa/poptropicon-intro-cn-short-popup.png` 显示原生介绍弹窗中文和 `开始` 按钮完整显示，`runtime-data/qa/poptropicon-intro-cn-short-after-start.png` 显示弹窗后 NPC 对话中文；Poptropicon 最新 3 NPC 证据 `1781977471786`、`1781977773636`、`1781978050743` 分别命中“仅限VIP。”、“喂！不许插队！”、“快从那儿下来。”；Timmy 最新 3 段原生 Dialog 证据 `1781997500162`、`1781997571581`、`1781997647965` 分别命中 Scutaro、Timmy、player 中文台词；Timmy 稳定性序列 `1781997996988` 5/5 帧同一中文气泡、无重复文本；Reality TV 当前 P0 `1782003638919` 初始选项和 resize 后摄影组对话均为中文，稳定性序列 `1782004103358` 捕获“欢迎！欢迎！我是吉姆·普罗巴布利...”与“你好。你还好吗？能呼吸吗？”且无重复气泡；AS2 用户确认聊天中文可用；`tools/patch-as2-train-edison-dialogue.js` 已将 Mystery Train `sceneEdisonCabin.swf` 内 15 条 `talkyText/manualSay` 英文替换为中文并重建 `as2-runtime.zip`；AS2 `1781882735773` 截图验证 Edison 原生中文气泡，OCR 样本含 `乘客`，`QaDialogShown` 诊断为 `bubble=true`；AS2 `sceneSpyMain.swf` 已通过 `tools/patch-as2-script-translations.js --qa-dialog-mode spy-main` 打入 15 条脚本中文和 QA-only 原生气泡触发；`1781886126401` 自动通过中文对话，人工复核 `1781885938525/01-spy-initial.png` 与 `1781886012217/01-spy-initial.png` 均为原生中文气泡 | 这只是 Timmy/Poptropicon/Reality TV/AS2 Mystery Train/AS2 Spy 的代表房间，不代表所有岛屿全对话已完成；Poptropicon 还需自然点击路径和更多剧情状态推进；更多硬编码 AS2 场景脚本还需扫描/补丁 | 下一轮 Monster Carnival 按同一口径补 3 段真实中文对话和稳定性序列 |
| 4 | 按钮文字或图标居中，系统性修 UI 对齐，不只修单个按钮 | In progress, Poptropicon、Timmy、Reality TV 首批真实 UI 通过 | `ButtonCreator.addLabel()` 已走 `_sans`、非嵌入字体、默认居中和长文本缩放；Poptropicon 背包/商店确认/设置/地图通过；Timmy 背包 `1781995142228`、商店确认 `1781995285510`、设置 `1781995421944`、地图 `1781994081095` 通过；Reality TV HUD smoke `1782001781173` 与按钮矩阵 `1782002457747` 通过，地图介绍 `1782003060696`、背包/确认框/设置入口样本人工检查居中；离岛确认弹窗从“确定 确定”重叠修为单个居中“确定” | 还不是全部岛屿/全部面板；HUD button-index 后续岛屿仍需实图回归 | 继续逐岛扩 UI 截图审计；静态图标/美术字只保留英文或走图片资产替换 |
| 5 | 场景箭头 enter/exit/go left/go right 等按规则处理 | AS3 native label 当前扫描范围完成；Poptropicon con1 door return 坐标已修；AS2 SWF 文本候选已首轮分类，静态资产替换仍未做 | `native-navigation-labels-patch.json` 最新扫描 2959 个 AS3 场景 XML，最终 479 个 native-label override 文件，玩家可见英文 native label 为 0；Poptropicon runtime zip 直接抽检 `con1/parking`、`center`、`bathrooms`、`alley` 的 `doors.xml`，无 `<y>1470</y>`，原生 `向左走/向右走/进入/退出` 留在 XML 字段；Timmy runtime zip 直接抽检 `doors.xml` 已含 `进入/向左走/向右走/旅行`；截图 `run-1781836576482/...resized-dialogue-attempt-1.png` 证明原生门牌 `进入` 可见；AS2 `as2-runtime-text-audit-full.json` 找到 16 个 SWF text-navigation 候选/26 条文本，包含 `framework/gameplay` 的 `Home/Map/EXIT/saving game`、popup 的 `EXIT/ENTER/SAVE`、场景内 Early Museum `EXIT`、Ghost Boat `Exit`、Trade BattleMap `MAP`；Early Museum `1781886555841` 截图显示 `EXIT` 是门上红色场景标牌，按静态/美术牌处理，当前保留英文 | FFDec `-importText`/`-replace` 对 `sceneMuseum.swf` 的 `79.txt` 临时替换均未生效并报 `Error during text import`，不能安全直接替换 SWF text tag；Poptropicon 静态箭头/标牌/美术字仍按规则保留英文；静态箭头/标牌/美术字尚未建立 bitmap 替换清单 | Poptropicon 继续验证所有 con1 入口/出口可自然切换；AS2 可见导航候选先按原生 UI/静态场景牌分类；静态图标/箭头只登记或走 bitmap/image replacement，不叠中文 |

## 已降级项目

| 项目 | 当前处理 |
|---|---|
| AS3 HUD 全量按钮矩阵 | 已停止/降级。它曾用于发现按钮点击链问题，但当前不再作为主验收。 |
| 静态标牌/菜单图标中文叠层 | 禁止继续作为翻译方案。Menu 这类静态图标保留英文，或以后用真实图片资产替换。 |
| 纯覆盖率翻译报告 | 只能作为辅助指标。真实验收必须进入游戏看 NPC/场景对话。 |

## 翻译规则

必须翻译：

- 原生对话文本。
- language XML、item XML、dialogue XML、NPC/任务/场景脚本里的运行时动态文本。
- 原生 TextField 形式的按钮、箭头、提示语。

不能硬翻：

- 静态图标，例如 Menu 背包按钮这类美术字。
- 岛屿场景标牌、告示、墙面文字、海报、地图图案、奖杯图。
- 任何只能靠额外中文 TextField 叠层盖上去的静态图片文字。

处理规则：

- 原生 TextField：翻译并修文本框/字体/居中。
- 静态图片/美术字：默认保留英文。
- 需要中文化的静态图片：只能走真实 bitmap/image replacement 管线；未做前登记为未完成项。

## 当前可复用证据

这些证据仍然有价值，但只能作为基础健康检查，不能替代 P0 实玩验收：

| 检查 | 最近结果 |
|---|---|
| launch manifest | `npm run qa:launch-gaps`：47/47 launchable，0 unresolved |
| pack inputs | 最新 `npm run verify:pack-inputs`：replacement count 匹配但因 Git 跟踪卫生失败；AS2 43/43，未跟踪 runtime input 1 个；AS3 1277/1277，未跟踪 runtime input 628 个，新增包含 `flashpoint/as3-direct.php`，需在 GitHub 同步前 stage/commit |
| 旧翻译覆盖率 | `npm run audit:translation-coverage`：15888/15888，但现在已确认口径不够 |
| 旧翻译质量审计 | `npm run audit:translation-quality`：0 issues，但同样不覆盖所有运行时对话 |
| 声音引用 | `npm run audit:sound-refs:runtime`：missing 0，runtime references resolved |
| AS2 interaction smoke | 34/34 通过，音频/场景证据/视觉守卫通过 |
| AS3 interaction smoke | 13/13 通过，音频/场景证据/视觉守卫通过 |
| AS3 resize smoke | 13/13 通过，但需要升级为 P0 实玩 resize/fullscreen 验收 |

## 2026-06-18 P0 实测新证据

| 检查 | 结果 |
|---|---|
| AS3 Shell fixed-aspect 布局补丁 | `runtime-data/qa/as3/as3-shell-layout-fit-patch.json`：固定逻辑视口、外层等比居中、resize 不再触发场景组重排；写入 `Shell.swf` 和 AS3 runtime zip |
| Timmy Failure 2300x1320 resize | `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781797614392.json`：通过，顶部暗色从旧失败的约 96% 降到约 0.79% |
| Timmy Failure P0 playability | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781797908486.json`：通过；初始对话中文、resize/maximize 视觉稳定 |
| Poptropicon 1450/900 resize | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781798912365.json`：visual 通过；对话点击未通过 |
| Poptropicon 2300x1320 resize | `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781800354913.json`：通过；黑色顶部背景已消失 |
| Loading center launch sampling | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781799366043.json`：未捕获 loading，说明 direct-scene 入口不适合该验收 |
| AS3 start-flow loading center | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781801129750.json`：真实启动流捕获 `Poptropica LOADING`，窗口模式 loading 居中通过 |
| Timmy strict dialogue/resize check | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781802637696.json`：resize 后 1 秒内中文对话仍在；maximize 后对话消失，不能作为完整通过 |
| Timmy iframe reload resize experiment | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781802775950.json`：resize 后中文存在，但 maximize 视觉不稳，暂不采用 reload-on-resize 路线 |
| Monster Carnival NPC calibration | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781802149623.json`、`1781801726652.json`：点位会触发店铺/报纸热区，未形成通过证据 |
| Poptropicon camera drift fix | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781805416576.json`：resize/maximize 后不再只剩天空；角色、NPC、地面、Menu 位置正常 |
| Monster fixed-aspect regression | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781806307004.json`：resize/maximize 视觉通过 |
| Timmy maximize dialogue strict check | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781805539693.json`：resize 后中文仍在；maximize 后跑到 Bowling 区，NPC 对话未通过 |
| Poptropicon NPC calibration after fix | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781805855873.json`：多点点击仍未触发中文对话，确认需要热区/组件级路径 |
| AS3 start-flow initial-maximize loading sample | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781806085007.json`：最大化启动没有抓到 loading，不作为居中通过证据 |
| AS3 ButtonCreator shared label patch | `runtime-data/qa/as3/as3-shell-ui-text-patch.json`：`game.creators.ui.ButtonCreator` 已纳入 CJK-safe UI 补丁 |
| Reality TV resize/maximize dialogue | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781807824364.json`：resize/maximize 后场景、HUD、中文对话选项稳定 |
| Reality TV F11 dialogue/layout | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781808127877.json`：F11 后截图 2560x1391，中文对话选项稳定，Menu 静态英文图标保留 |
| Reality TV fresh P0 full path | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781827867114.json`：静音/G32QC/no-foreground 路径通过；打开后 resize、maximize、F11 均保持中文对话选项、HUD、角色和场景稳定；人工检查 `resized/maximized/f11.png` 通过 |
| Reality TV post-native-label regression | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781835506810.json`：AS3 runtime zip 重新补 native label 后复测通过；resize、maximize、F11 均保持中文对话和稳定画面；人工检查 `run-1781835506810/01-reality-tv-wild-safari-f11.png` 通过 |
| AS3 start-flow 1450x900 loading center | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781807946211.json`：大窗口启动 loading 居中；`01-as3-start-flow-launch-loading-80.png` 人工检查通过 |
| AS3 start-flow button click fix | `tools/qa-as3-p0-playability.js` 已修：`NEW PLAYER` 被 OCR 拆成 `NEW` + `PLAYER` 时会组合相邻文本框点击；`run-1781827496142/01-as3-start-flow-new-player-click.json` 证明点击落在 G32QC 的 Flash 子窗口；后续进入性别页，不作为 loading 证据 |
| Native navigation labels final AS3 pass | `runtime-data/qa/native-navigation-labels-patch.json` 2026-06-19T02:56:36Z：从 `AS3.zip` 原始场景 XML 复扫 2959 个文件，最终 479 个 native-label override 文件；玩家可见英文 native label 为 0，剩余仅 `DISABLED` 内部/禁用标签；AS3 runtime zip `replacementCount=1276` |
| Timmy native door label visual proof | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781836576482.json`：通过；截图 `run-1781836576482/01-timmy-failure-resized-dialogue-attempt-1.png` 显示原生门牌 `进入`，静态 store/museum/sign art 保持英文 |
| Timmy F11 visual proof | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781836840767.json`：通过；截图 `run-1781836840767/01-timmy-failure-f11.png` 证明 F11 下画面、HUD、角色稳定 |
| Timmy NPC Chinese split evidence | `as3-p0-playability-1781835666638.json` 有初始/maximized Scutaro 中文气泡截图；`as3-p0-playability-1781835907517.json` 有 resized Scutaro 中文气泡截图。两份报告因同一轮重复点击 NPC 的自动化状态互相影响而失败，不能作为整轮 pass，但可证明运行时 NPC 文本是中文 |
| HUD smoke strict expected-pattern | `tools/qa-as3-hud-smoke.js` 已修：如果提供 expected pattern，像素变化不能再伪造通过；旧误点会正确失败 |
| Settings panel visual proof | `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781810492978.json` 失败原因是期望错配，但截图 `run-1781810492978/01-reality-tv-wild-safari-secondary.png` 证明设置面板中文、按钮/滑块对齐正常 |
| Leave-to-Realms confirmation proof | `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781810649153.json`：确认弹窗中文文案居中，按钮从旧截图的“确定 确定”重叠修为单个居中“确定” |
| HUD smoke AS3 override fix | `tools/qa-as3-hud-smoke.js` 已修 `--as3-scene-override=reality2/mainStreet` 到 AS3 类名，并默认 `reloadOnResize=0`，避免 resize 后进入下载弹窗 |
| Maximize loading attempt | `runtime-data/qa/as3/p0-playability/run-1781810870375` 有截图但没有通过报告；人工检查显示是 `NEW PLAYER` 首页，不是 loading，不能作为加载条通过证据 |
| AS2 dialogue-click harness | `tools/qa-as2-interaction-smoke.js` 已新增可选 `--dialogue-click`/`--require-dialogue-chinese`；Super Power 与 Mystery Train 单点尝试均只触发移动，未形成 AS2 中文对话通过证据 |
| Timmy Failure entry alignment | `catalog/launch-overrides.json` 已把 `timmy-failure` 从 `mainStreet` 改为 `timmysStreet`，与 `island.xml` firstScene 对齐；`catalog/launch-manifest.json` 已刷新为 `game.scenes.timmy.timmysStreet.TimmysStreet` |
| Timmy Failure corrected-entry P0 check | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781828431912.json`：仍失败；初始中文对白存在，但 resize 后先出现黑色过渡帧，随后画面推进/漂到 Bowling Lane 区域，post-viewport 中文对话未恢复 |
| AS3 start-flow post-rebuild loading attempts | `as3-p0-playability-1781837089202.json`：1450x900 启动流 Flash 插件崩溃；`as3-p0-playability-1781837339385.json`：1186x760 未崩但 loading 太快，未捕获 `Poptropica LOADING`。P0-2 仍需要可控 loading 捕获路线 |
| AS3 start-flow 1186x760 loading center recheck | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781839546495.json`：通过；`01-as3-start-flow-launch-loading-20.png` 人工检查，`Poptropica LOADING` 居中，中心偏移 x=-3/y=2 |
| AS3 start-flow 1450x900 loading center recheck | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781840348376.json`：通过；initial 截图直接计入 loading 证据，`Poptropica LOADING` 居中，中心偏移 x=-2/y=2 |
| AS3 start-flow post-loading large-window caveat | `runtime-data/qa/as3/p0-playability/run-1781840218854/01-as3-start-flow-outer-client.png`：1450x900 外层窗口里，NEW PLAYER 首屏以 960x640 固定 Flash 舞台居中显示；无重叠/崩溃，但不是响应式铺满 |
| F11 fullscreen loading probe | `runtime-data/qa/as3/p0-playability/fullscreen-loading-probe-1781840671365/report.json`：F11 后窗口确实在 G32QC 上为 2560x1440；截图 `04-f11-outer-client.png` 未捕获 loading，只看到 start-flow 框架和黑色中心区域，不能作为 P0-2 通过 |
| F11 early outer-client loading frame | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781843735292.json`：`--f11-before-initial` 改为早期无标题窗口捕获，并在 F11 后采外层客户区；截图 `run-1781843735292/01-as3-start-flow-launch-loading-0.png` 显示全屏启动加载框居中，但没有 `LOADING` 文案/进度条，不能单独关闭 P0-2 |
| Reality TV post-loading-hold regression | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781843948299.json`：通过；静音/G32QC/no-foreground 路径下，resize、maximize、F11 均保持中文对话、HUD、角色和场景稳定；人工检查 `run-1781843948299/01-reality-tv-wild-safari-f11.png` 通过 |
| AS3 base.php viewport-fit repair | `tools/repair-as3-runtime-layout.js` 已把 AS3 `base.php` 修为按 `FLASHPOINT_GAME_WIDTH/HEIGHT` 等比居中缩放 Flash embed，保留原始 `room/island/startup_path` 参数，不再用 resize 自动整页 reload；AS3 runtime zip 已重建到 `replacementCount=1277` |
| F11 start-flow viewport-fit proof | `runtime-data/qa/as3/p0-playability/f11-rapid-loading-after-fit-viewport-1781845975053/report.json`：F11 下启动框和进度条框居中；人工检查 `f11-start-flow-fit-viewport-0.png` 通过；`f11-fit-viewport-long-1781846062266/after-22s.png` 证明 22 秒后 start screen 居中进入 |
| AS3 visual guard hardening | `tools/qa-helper.py` 已加入 sampled unique colors 和 dominant color 检查，避免纯蓝/纯黑空画面被 stage coverage 误判为通过；`tools/lib/qa.js` 不再给 `capture-window` 自动加 `--target-monitor`，避免截图时改动已最大化/F11 窗口 |
| Reality TV post-viewport-fit regression | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781847990789.json`：通过；`reloadOnResize=frame` 下 resize、maximize、F11 均稳定；截图 `run-1781847990789/01-reality-tv-wild-safari-maximized-dialogue-attempt-2.png` 和 `...f11-retry-1.png` 人工检查通过 |
| AS3 dialogue proof guard hardening | `tools/qa-as3-p0-playability.js` 已把“有中文”细分为“真实对话中文”：`进入/出口/公共房间/向左走/向右走` 等 native label 和 OCR 单字不再能算作 NPC 对话；Monster `1781849692716` 因只有门牌/静态画面而正确失败 |
| AS3 F11 loading-overlay guard | `tools/qa-as3-p0-playability.js` 已识别 `Poptropica` + `LOADING/STARTING` 或 spinner 行；F11 捕到加载 overlay 时会继续 retry，不再把加载中画面算作稳定场景；Monster `1781850366374` 证明第一次 F11 loading overlay 被拦截，retry 后才进入稳定检查 |
| Monster Carnival real dialogue proof | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781849954198.json`：通过；从 `mainStreet` 的 Edgar zone 触发真实脚本中文气泡，截图 `run-1781849954198/01-monster-carnival-dialogue.png` 显示“大家都在等着嘉年华开幕...” |
| Monster Carnival full-run gap | `1781850366374`、`1781850591516`、`1781851122491`：resize/F11 视觉路线已稳定，resize 后可见中文对话；但 maximize 后同一轮复触发一次性 zone 对话失败，当前记为场景状态/QA 路径缺口，不记通过 |
| Monster ordinary NPC attempts | `1781853628913`、`1781853823808`、`run-1781854217627`、`1781854405353`：从 `npcs.xml` 推导 man/woman 普通 NPC 后仍未触发中文气泡；点击会落到店铺/出口/场景热区。当前结论是 postMessage 输入热区未闭环，不是翻译资源缺失 |
| Three-island AS3 broad run | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781848563481.json`：Timmy、Monster、Poptropicon 全部没有作为整轮通过；失败主因是 post-viewport 真实对话未捕获。Monster/Poptropicon 固定点位多次点到静态报纸、店门、空地，不能当翻译失败证据 |
| Poptropicon NPC calibration | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781852018500.json`：通过；从 runtime zip 的 `con1/parking/npcs.xml` 推导 `alien_teacher x=1740 y=1430`，QA seed 后触发原生中文对话选项；截图 `run-1781852018500/01-poptropicon-dialogue-attempt-1.png` 人工检查通过 |
| Poptropicon full P0 regression | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781852220193.json`：通过；`reloadOnResize=frame` 下 resize/maximize/F11 稳定，resize/maximize 后均重新触发 Alien Teacher 中文选项；静态 `MENU/SPACE JAUNT/HOBO/MIGHTY` 保持英文 |
| Reality dialogue target repair | `tools/qa-as3-p0-playability.js` 已固化 Reality 摄影组对话点 `0.32,0.50`；`1781852479974` 证明旧 generic 点位会误点地面而失败，随后 `1781852948141` 二岛回归通过 |
| Reality + Poptropicon AS3 P0 regression | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781852948141.json`：2/2 通过；Reality TV 与 Poptropicon 在 resize、maximize、F11 后均视觉稳定，并在 resize/maximize 后重新触发中文对话；人工检查 `run-1781852948141/...maximized-dialogue-attempt-2.png` 通过 |
| Poptropicon native Dialog hook regression | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781862189094.json`：通过；resize/maximize 后 Alien Teacher 原生中文对话选项可见，人工检查 `initial/resized/maximized.png` 通过；静态 `MENU/NEW MERCH/FREMLONH/HOBO/MIGHTY` 保持英文 |
| Monster + Poptropicon + Reality AS3 P0 F11 regression | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781862435394.json`：3/3 通过；显式 `--try-f11 --require-f11`，三岛 resize/maximize/F11 视觉稳定，post-viewport/post-resize 中文对话通过；人工检查 `01-monster-carnival-f11-retry-1.png`、`02-poptropicon-f11-retry-1.png`、`03-reality-tv-wild-safari-f11-retry-1.png`、Reality `maximized-dialogue-attempt-2.png` 通过 |
| Timmy Scutaro native Dialog hook | `tools/patch-as3-monster-qa-dialog.js` 现额外 patch `game.scenes.timmy.mainStreet.MainStreet`，`as3-direct.php`/wrapper 允许 `flashpointQaDialogNpc=scutaro`；`timmy/mainStreet/dialog.xml` 增加 `qaScutaro timeOverride=60`；静态笔记本和场景图片文字不翻译 |
| Timmy full P0 regression | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781865156687.json`：通过；resize、maximize、F11 后 Scutaro 原生中文气泡稳定；人工检查 `initial` 为静态英文笔记本页，符合不硬盖规则 |
| Four-island AS3 P0 regression | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781865386476.json`：4/4 通过；覆盖 Monster Carnival、Poptropicon、Reality TV Wild Safari、Timmy Failure；人工检查 Monster/Poptropicon/Reality/Timmy 代表截图通过 |
| AS3 start-flow loading-only recheck | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781869169141.json`：通过；窗口模式 `Poptropica LOADING` 捕获，中心偏移 x=-3/y=2；F11 带文案 loading 帧仍未捕获 |
| Final Poptropicon + Timmy regression after loading-hold rebuild | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781869272212.json`：2/2 通过；证明最后一次 Shell 重打没有破坏 Alien Teacher/Scutaro 原生 Dialog hook |
| F11 scene-transition loading center proof | `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1781873821483.json`：通过；Poptropicon Parking -> Center 真全屏切场，G32QC 2560x1439；加载 Logo/进度点视觉检测 2 帧通过，偏移约 x=-3/y=12、x=10/y=-50；人工检查 `run-f11-loading-1781873821483/f11-loading-sequence/f11-loading-14000.png` 通过 |
| Poptropicon + Timmy regression after F11 loading hook | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781874030360.json`：2/2 通过；覆盖 resize、maximize、F11、post-viewport/post-resize 中文对话；人工检查 Poptropicon F11、Timmy F11、F11 loading 三张关键截图通过 |
| Quiet runtime default + AS2 QA hardening | `tools/lib/flashpoint-runtime.js` 默认静音守护改为 12 小时/250ms；`tools/qa-as2-interaction-smoke.js` 新增 F11 尺寸门槛、loading 采样、房间覆盖、二次点击、hover/hold；`tools/qa-helper.py` 为后台点击增加 synthetic focus pulse |
| AS2 loading/dialogue calibration | `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781875020298.json`：Mystery Train 主街加载中心和视觉稳定通过，但旧 F11 被识别为误报；`1781876640525.json`：直接进入 `EdisonCabin`，场景证据通过；`1781876906937.json`/`1781877083443.json`：Edison 悬停/点击仍未弹对话，AS2 实机中文对话仍是 blocker |
| AS2 EdisonCabin 原生中文气泡通过 | `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781882735773.json`：通过；G32QC/no-foreground/post-message/静音路径下直接进入 `Train/EdisonCabin`，截图 `run-1781882735773/01-mystery-train-initial.png` 显示 Edison 原生中文气泡；OCR 样本为“等我把这里布置好， 就需要你帮忙了。等候时， 先去见见其他乘客吧。”；`QaDialogShown` 日志含 `depth=true&bubble=true`；音频 active 为 0 |
| AS2 SpyMain 原生中文气泡通过 | `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781886126401.json`：通过；G32QC/no-foreground/post-message/静音路径下进入 `Spy/SpyMain`，scene evidence、visual guard、中文对话和 audio active=0 均通过；截图 `run-1781886126401/01-spy-initial.png` 为原生中文气泡。人工复核额外保留 `run-1781885938525/01-spy-initial.png`：`和 D 局长谈过后再来找我。`，以及 `run-1781886012217/01-spy-initial.png`：`我有个关于斯派格拉斯博士的重要消息要告诉你。`；静态 `the hair club` 美术字保持英文 |
| AS2 Early Museum EXIT 分类证据 | `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781886555841.json`：通过；直接进入 `Early/Museum`，scene evidence、visual guard、audio active=0 通过；截图 `run-1781886555841/01-early-poptropica-initial.png` 显示门上红色 `EXIT` 标牌，当前按静态/场景美术牌保留英文，不做中文文字层覆盖 |
| AS2 Mystery Train loading/F11 代表样本 | `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781882945247.json`：通过；窗口 loading 样本 0-1000ms 均检测到居中 `Poptropica LOADING`，偏移约 x=-5/y=-28；F11 截图 `run-1781882945247/01-mystery-train-f11.png` 为 `2560x1306`，尺寸门槛通过，人工检查 HUD/角色/场景稳定；音频 active 为 0 |
| AS2 Early/Spy/Super F11 扩展样本 | `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781883257875.json`：总结果 1/3，因为 Spy 和 Super Power 的 loading 帧没有被采样捕获；但三岛 scene evidence、visual guard、F11 尺寸门槛均通过，音频 active 为 0。人工检查 `01-early-poptropica-f11.png`、`02-spy-f11.png`、`03-super-power-f11.png`：HUD/角色/场景稳定，静态英文美术字保留；AS2 F11 底部蓝色保存栏/裁切带仍需后续优化。Early loading `01-early-poptropica-loading-0.png` 人工检查居中，OCR 偏移 x=-1/y=22 |
| AS2 F11/fullscreen loading hold 样本 | `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781888576562.json`：Mystery Train 在 G32QC 真全屏客户区 `2560x1306` 下通过；`flashpointQaLoadingHoldMs=6000` 只 hold framework 原生 startup loading，不再传给 gameplay；0-1500ms 多帧 `Poptropica LOADING` 居中，偏移约 x=-16/y=-40；人工检查 `run-1781888576562/...loading-0.png` 与 `...loading-1500.png` 通过，之后 `initial.png` 正常进入场景。`runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781888862295.json`：Early Poptropica 同样通过 F11/fullscreen loading center，0-4500ms 多帧偏移约 x=-16/y=-40，audio active=0 |
| Poptropicon 样板岛展示 | 已更新：`runtime-data/qa/manual-poptropicon-demo.png` 是旧基线；最新证据为 `runtime-data/qa/poptropicon-player-boundsfix-start.png`、`runtime-data/qa/poptropicon-player-boundsfix-after-ground-right.png`、`runtime-data/qa/poptropicon-player-boundsfix-right-edge.png`、`runtime-data/qa/poptropicon-intro-cn-short-popup.png`、`runtime-data/qa/poptropicon-intro-cn-short-after-start.png`、`runtime-data/qa/poptropicon-resize-win32-1600x900-after.png`、`runtime-data/qa/as3/p0-playability/as3-p0-playability-1781974446974.json`。G32QC 侧屏静音打开，玩家不消失，右边界不露蓝底，原生介绍弹窗和 NPC 对话中文，真实窗口缩放/最大化/F11 后稳定；静态 `MENU/SPACE JAUNT/HOBO/MIGHTY/LEARN TO SPEAK FREMLON!/ENTRANCE` 等美术字保持英文，不使用中文覆盖层。该岛仍需补 loading 本轮复测、至少 3 个真实 NPC/剧情中文对话、完整房间自然遍历和自然剧情通关证据 |

## 2026-06-22 22:50 EDT：AS2 Time/Super HUD 与任务文件弹窗复核

- 当前状态：Time Tangled 仍是 **re-opened**，没有封版；本轮只关闭/推进公共 blocker 的一部分。
- 修复/工具改动：
  - `malidocs.swf` 从 AS2 tight popup viewport 白名单中排除，避免任务文件被 640x480 tight crop 放大裁切。
  - 非 tight popup 不再创建额外 `__zhPopupBackdrop` 黑色遮罩，只隐藏 gameplay HUD 并使用原游戏 popupBack。
  - `tools/qa-as2-interaction-smoke.js` 新增 `--popup-close-click` / `--popup-close-clicks`，并修正 Firefox client-only 截图与点击坐标 110px 偏移。
  - QA map 点击默认回到初始稳定场景，不再用 F11 退出后仍处于 LOADING 的截图算点击点；`--map-after-f11` 才使用 post-F11 截图。
- 验证通过：
  - Time Tangled 常规回归 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782182603714.json`：`ok=true`，`audioActive=0`，`mapClicksPassed=1`，`sceneEvidencePassed=1`，`f11Passed=1`，`visualGuardPassed=1`，`hudAnchorPassed=1`。
  - 人工复核：`run-1782182603714/01-time-tangled-hud-anchor.png` 显示三枚 AS2 HUD 图标右上单行；`01-time-tangled-f11.png` 角色可见、HUD 稳定、无左上暂停残影；`01-time-tangled-map.png` 地图可打开，静态 `TIME TANGLED ISLAND` 保留英文。
  - Super Power 常规回归 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782182763256.json`：`ok=true`，`audioActive=0`，`mapClicksPassed=1`，`sceneEvidencePassed=1`，`f11Passed=1`，`visualGuardPassed=1`，`hudAnchorPassed=1`。
  - 人工复核：`run-1782182763256/01-super-power-hud-anchor.png` 和 `01-super-power-f11.png` 显示 HUD 单行右上、角色可见、无左上暂停残影。
- 任务文件弹窗进展：
  - `malidocs` 打开截图 `runtime-data/qa/as2/interaction-smoke/run-1782181675632/01-time-tangled-initial.png` 已不再右侧裁切，关闭按钮可见，文件内容落在可视区域。
  - 未关闭：关闭 `malidocs` 后仍会露出 Time Machine/Time map 弹窗层，见 `runtime-data/qa/as2/interaction-smoke/run-1782182012427/01-time-tangled-popup-close.png`。因此“任务物品关闭后无黑残留/回到正常场景”仍是 blocker。
- 仍未关闭：
  - Time Tangled 自然时间装置路线、任务物品关闭链、自然 NPC 热区 no-repeat、箭头/native label 全量检查、外链白屏、AS3 对话队列、真实音频源清单。

## P0 验收流程

每轮修复后必须按下面顺序留证：

1. 打开游戏本地入口，不抢主显示器鼠标，优先在 G32QC 或后台窗口跑。
2. 进入代表性 AS2/AS3 岛屿和多个场景。
3. 在窗口模式、不同分辨率、全屏切换后截图。
4. 捕获加载中画面，验证进度条居中。
5. 与 NPC 或场景可交互对象对话，截图确认运行时中文。
6. 检查按钮、确认框、菜单、背包、地图、设置等 UI 是否居中、不重叠、不消失。
7. 检查 enter/exit/go left/go right 等箭头标签，按原生文本/静态图片规则处理。
8. 跑回归脚本，确认修复没有打坏 launch、声音、输入资源、基础交互。

## 代表性实测样本

首轮不再只跑“按钮能点”，而是选风险样本：

| 类型 | 样本 | 目的 |
|---|---|---|
| AS2 对话/场景文本 | Mystery Train / islandTrain | 已发现 runtime XML 英文，优先验证对话中文 |
| AS2 老岛和导航 | Super Power | 有既有 flow 检查，可扩展箭头/场景切换证据 |
| AS2 基础岛 | Early Poptropica 或 Spy Island | 验证经典 AS2 UI、对话、地图/入口 |
| AS3 对话和现代 HUD | Timmy Failure | 曾暴露 HUD QA 低像素变化问题，适合作为 UI 视觉样本 |
| AS3 场景入口风险 | Mission Atlantis | 当前 build 封版基线已通过，后续只补三集深度剧情/自然路线 |
| AS3 教程/入口风险 | Monkey Wrench | 当前 build 封版基线已通过；后续只补完整教程自然路线和更多 FTUE 场景 |

## 预计耗时

这是当前粗估，用于排优先级，不是完成承诺：

| 阶段 | 预计 |
|---|---|
| 文档/检查口径切换 | 已完成到本 checklist，`progress.md` 仍需同步 |
| P0 QA harness 梳理和首批截图样本 | 2-4 小时 |
| 运行时英文对话根因修复首轮 | 4-8 小时，取决于漏网 XML/脚本数量 |
| resize/fullscreen/loading 居中首轮修复 | 4-8 小时 |
| 按钮居中和箭头分类首轮修复 | 4-8 小时 |
| 多岛屿代表性实玩回归 | 首轮 6-12 小时；全 47 岛深度巡检需要分批继续跑 |
| GitHub 同步 | 当前 P0 首轮修复和截图证据稳定后提交推送 |

## 当前 Poptropicon 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| 窗口模式蓝底/角色/HUD | 通过 | `runtime-data/qa/poptropicon-current-fullscreen/fresh-small-g32qc-env.png`；窗口在 G32QC，角色可见，MENU 静态英文图保留 |
| F11 真全屏稳定 | 通过 | `runtime-data/qa/poptropicon-current-fullscreen/f11-fullscreen-init-g32qc-full-window.png`；窗口 `2560x1440`，视觉守卫 `f11-fullscreen-init-g32qc-full-window-visual-guard.json` 通过，旧亮蓝边缘 0% |
| F11 后重载/重排 | 通过 | `runtime-data/qa/runtime-resize-relaunch/runtime-resize-relaunch-1781952943043.json`；旧 PID `73636` relaunch 到 `66176`，`targetMonitor=G32QC`，自动 F11 成功 |
| 最新 build 窗口缩放/最大化/F11 | 通过 | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781974446974.json`；resize `run-1781974446974/01-poptropicon-resized-retry-1.png`，maximize `run-1781974446974/01-poptropicon-maximized-retry-1.png`，F11 `run-1781974446974/01-poptropicon-f11-retry-2.png`；角色可见、菜单右上、无蓝底/灰屏，静态美术字保留英文。1450x900 直接跳 maximize 的失败样本为 `1781973519350`，作为后续边缘路径优化记录。 |
| 最新 build F11 loading 居中 | 通过 | `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1781975368217.json`；截图 `run-f11-loading-1781975368217/f11-loading-sequence/f11-loading-1000.png` 和 `f11-loading-2000.png`；2 个 loading 样本通过中心阈值，偏移约 x=-1/y=-50 与 x=14/y=-52。旧证据 `1781953245305` 仍保留。 |
| NPC/剧情中文对话 | 通过样本，需继续扩样本 | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781953471933.json`；截图 `run-1781953471933/01-poptropicon-initial.png` 显示中文气泡 |
| Center 入口/intro popup | 通过 | `runtime-data/qa/as3/islands-smoke/run-1781954726353/01-poptropicon-center.png` 显示中文 intro popup 和 `开始` |
| Map 打开/地图介绍中文 | 通过 | `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781969723905.json` 证明 Map `SceneLoaded` 且岛名不再坏字；`runtime-data/qa/as3/islands-smoke/run-1781971850505/01-poptropicon-map.png` 显示 PoptropiCon 地图介绍中文、`重新开始` 和 `开始` 按钮 |
| Bathrooms direct entry | 通过但需说明 | `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781954635499.json` 和 server log `SceneLoaded Bathrooms`；截图外观类似 Parking，不能只靠画面命名 |
| Alley direct entry | 通过 | `runtime-data/qa/as3/islands-smoke/run-1781954812438/01-poptropicon-alley.png` |
| 原生箭头/门标签 | 文件级通过，仍需更多运行时样本 | `con1/parking/doors.xml`、`center/doors.xml`、`bathrooms/doors.xml`、`alley/doors.xml` 已是 `向左走/向右走/进入/退出`；静态 sign art 保留英文 |
| con1 自然往返切换 | 未完成 | 后台 PostMessage 只能显示方向箭头，未能稳定驱动角色走到边界；不能声明 Parking -> Bathrooms -> Parking -> Center -> Alley -> Center 自然往返完成 |
| 菜单面板内部按钮 | 通过本轮封版样本 | 菜单展开 `runtime-data/qa/as3/hud-smoke/run-1781972253353/01-poptropicon-post-click.png`；背包 `runtime-data/qa/as3/hud-smoke/run-1781972253353/01-poptropicon-inventory.png`；商店确认框 `runtime-data/qa/as3/hud-smoke/run-1781972493179/01-poptropicon-secondary.png`；设置面板 `runtime-data/qa/as3/hud-smoke/run-1781972718330/01-poptropicon-secondary.png`；地图弹窗 `runtime-data/qa/as3/islands-smoke/run-1781971850505/01-poptropicon-map.png`。静态 `MENU/PRIZE` 等图标文字保留英文，不做中文文字层硬盖。 |
| 音频静音 | 当前空闲通过，运行中仍需按脚本复核 | `runtime-data/qa/poptropicon-con1-traversal/audio-check-after-direct-smoke.json`：loopback RMS/peak 0，`audioLikelyActive=false` |

## 当前 Reality TV Wild Safari 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| Shell/入口可启动 | 通过 | `npm run merge:reality2-shell` 已恢复 `game.scenes.reality2.*` class；`packs/zh-CN/as3/provenance/reality2-shell-merge.json` 记录 merge；smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782000152912.json` 通过 |
| 窗口缩放/最大化/F11 稳定 | 通过 | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782003638919.json`；初始 `run-1782003638919/01-reality-tv-wild-safari-initial.png`，resize 对话 `...resized-dialogue-attempt-2.png`，maximize `...maximized-retry-1.png`，F11 `...f11.png`；角色/HUD/场景稳定，无蓝底、无角色消失 |
| loading 居中 | 通过 | 窗口模式 `runtime-data/qa/as3/p0-playability/as3-window-loading-transition-1782001447409.json`；F11/fullscreen `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782001638633.json`；代表截图 `run-f11-loading-1782001638633/f11-loading-sequence/f11-loading-500.png` |
| 地图打开/介绍中文 | 通过 | 新增 `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/reality/island/page.xml`；`runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782003060696.json` 通过；截图 `run-1782003060696/01-reality-tv-wild-safari-map.png` 显示 `真人秀：野外探险`、中文介绍、`重新开始/开始` |
| HUD/背包/确认框/地图/按钮居中 | 通过本轮样本 | HUD smoke `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782001781173.json`；按钮矩阵 `runtime-data/qa/as3/hud-button-matrix/as3-hud-button-matrix-1782002457747.json`；确认框截图 `runtime-data/qa/as3/hud-smoke/run-1782002085908/01-reality-tv-wild-safari-secondary.png`；背包截图 `runtime-data/qa/as3/hud-smoke/run-1782002344797/01-reality-tv-wild-safari-secondary.png`；地图截图同上 |
| 真实中文对话 | 通过本轮样本 | P0 初始选项 `当然！他们在哪儿？/不了，我还是去探索吧。`；resize 后摄影组对话 `嘿嘿。是啊，伙计......完全没错。`；稳定性报告 `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782004103358.json` 捕获 host/player 中文剧情，视觉稳定 |
| 对话不重复/不抽搐 | 通过 | `tools/qa-as3-dialogue-stability.js` 支持连续中文稳定段判定；`1782004103358` 中 3/3 样本中文，前两张同一句稳定，第三张正常剧情换句，`longestStableChineseRun.count=2`、`visualStable=true` |
| 静态美术字规则 | 通过 | `MENU`、`Reality TV/WILD SAFARI`、`DANGER/STAFF ONLY`、地图 Logo/Motel 图保留英文；未添加中文文字层覆盖 |
| 当前剩余 | 非封版 blocker | 未证明整岛从头到尾通关；更深剧情和更多场景自然遍历后续按全岛深测补，不阻塞本轮进入下一个岛 |

## 当前 Monster Carnival 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| Shell/入口可启动 | 通过 | `node tools\patch-as3-monster-qa-dialog.js` 已重建 AS3 `Shell.swf` 和 runtime zip；补丁报告 `runtime-data/qa/as3/as3-monster-qa-dialog-patch.json`，`replacementCount=1280` |
| 地图打开/介绍中文 | 通过 | 新增 `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/carnival/island/page.xml`；严格中文 smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782009180820.json` 通过；截图 `runtime-data/qa/as3/islands-smoke/run-1782009180820/01-monster-carnival-map.png` 显示 `怪物嘉年华岛`、中文介绍、`开始/重新开始` |
| 窗口缩放/最大化稳定 | 通过 | P0 报告 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782010036636.json` 通过；截图 `run-1782010036636/01-monster-carnival-initial.png`、`...resized.png`、`...maximized-retry-1.png`；角色可见，MENU 在右上，无蓝底/角色消失/非游戏 UI 污染 |
| F11/fullscreen 与 loading 居中 | 通过 | `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782010574985.json` 通过；使用 `--post-message-f11 1`，`noForegroundCapture=true`；截图 `run-f11-loading-1782010574985/f11-loading-sequence/f11-loading-500.png`；5 个 loading 样本居中，`f11.fullscreenLike=true` |
| HUD/菜单/背包/商店/地图/设置按钮居中 | 通过本轮样本 | 设置 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782011109661.json`；商店确认 `1782011226733`；地图确认 `1782011358737`；背包 `1782011471208`。人工复核对应 `run-*/01-monster-carnival-secondary.png`：中文按钮和面板文案居中、不重叠 |
| 3 个真实中文对话 | 通过 | Father `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782008820508.json`，Man `1782008910900`，Junior `1782009003168`；均为原生 `Dialog.sayById()`，3/3 中文样本，expectedCount=1 |
| 对话不重复/不抽搐 | 通过 | 三个稳定性报告均 `stableText=true`、`visualStable=true`、`duplicateExpectedSampleCount=0`；截图 `runtime-data/qa/as3/dialogue-stability/run-1782008820508/sequence/dialogue-0.png` 等已人工检查为单个原生气泡稳定显示 |
| 静态美术字规则 | 通过 | `MENU` 图标、`Lazy Sundae`、`Apothecary`、`CARNIVAL IS HERE`、地图 logo/海报/招牌等静态图保持英文；未使用中文文本层硬盖 |
| 废弃证据 | 已标记 | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782009633264.json` 捕到 Codex/Edge 前台 UI，不能用；`as3-f11-loading-transition-1782010283651.json` 走真实键盘 F11 导致前台 Edge/插件崩溃，不能用。后续 F11 只用 PostMessage 路径 |
| 当前剩余 | 非封版 blocker | 未证明整岛从头到尾通关；自然剧情和所有房间全遍历后续深测补，不阻塞进入下一个岛 |

## 当前 Mission Atlantis 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| Shell/入口可启动 | 通过 | `node tools\patch-as3-monster-qa-dialog.js` 已扩展 Mission `deepDive1/ship` 原生 Dialog QA hook，仍调用游戏原生 `Dialog.sayById()`；补丁报告 `runtime-data/qa/as3/as3-monster-qa-dialog-patch.json`，AS3 runtime replacementCount 更新到 `1286` |
| 地图打开/介绍中文 | 通过 | 新增 `deepDive1/deepDive2/deepDive3/deepDiveEpisodic` 地图 page XML；严格中文 smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782012530130.json` 通过；截图 `runtime-data/qa/as3/islands-smoke/run-1782012530130/01-mission-atlantis-map.png` 显示 `第 1 集：深入海底`、中文介绍、`开始/重新开始` |
| 窗口缩放/最大化稳定 | 通过 | P0 报告 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782015178827.json` 通过；截图 `run-1782015178827/01-mission-atlantis-resized.png` 与 `run-1782015178827/01-mission-atlantis-maximized-retry-2.png`；角色可见，MENU 在右上，无蓝底/角色消失/非游戏 UI 污染 |
| F11/fullscreen 与 loading 居中 | 通过 | `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782015395985.json` 通过；使用 `--post-message-f11 1`，`noForegroundCapture=true`；截图 `run-f11-loading-1782015395985/f11-loading-sequence/f11-loading-500.png`；5 个 fullscreen loading 样本居中，`f11.fullscreenLike=true` |
| HUD/菜单/背包/商店/地图/设置按钮居中 | 通过本轮样本 | 设置 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782016582947.json`；商店确认 `1782016779009`；地图确认 `1782016946794`；背包 `1782017109548`。人工复核对应 `run-*/01-mission-atlantis-secondary.png`：中文按钮和面板文案居中、不重叠；背包卡面 `Sea Creatures` 是静态美术图，按规则保留英文，原生标题 `海洋生物档案` 和按钮 `查看` 已中文 |
| 3 个真实中文剧情对话 | 通过 | Cam `findKey`：`runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782014515149.json`；Cam `subOpen`：`1782014590550`；Cam `needHelp`：`1782014753128`；三条均为原生 `Dialog.sayById()` 气泡，截图 `run-1782014515149/sequence/dialogue-0.png`、`run-1782014590550/sequence/dialogue-0.png`、`run-1782014753128/sequence/dialogue-0.png` 已人工检查 |
| 对话不重复/不抽搐 | 通过 | 三个稳定性报告均中文样本稳定，`duplicateExpectedSampleCount=0`，`visualStable=true`；Sailor2 `dumpedInk` 校准 `1782014671451` 未出气泡，未计入通过证据 |
| 静态美术字规则 | 通过 | `MENU` 图标、`MISSION ATLANTIS` 地图 logo、Ship introPopup 的 `MISSION ATLANTIS INTO THE DEEP/START`、背包卡面 `Sea Creatures`、场景木箱/潜艇等静态美术字保持英文；未使用中文文本层硬盖。`introPopup.swf` 文本替换因 FFDec import error 未采用，后续只能走真实图片/SWF 资产替换 |
| 当前剩余 | 非封版 blocker | 未证明三集从头到尾通关；Ship 以外的更多深海场景、自然剧情路线和静态 introPopup 图片替换后续深测补，不阻塞进入下一个岛 |

## 当前 Monkey Wrench 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| Shell/入口可启动 | 通过 | `tools/patch-as3-monster-qa-dialog.js` 已扩展 `game.scenes.ftue.mainLand.MainLand` 原生 Dialog QA hook；`tools/lib/as3-direct-wrapper.js` 和 `flashpoint/as3-direct.php` 默认 `reloadOnResize=frame`，避免 resize 后整页重载卡 loading；AS3 runtime zip 已重建，replacementCount `1298` |
| 地图打开/介绍中文 | 通过 | 新增 `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/ftue/island/page.xml`；严格中文 smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782018890966.json` 通过；截图 `runtime-data/qa/as3/islands-smoke/run-1782018890966/01-monkey-wrench-map.png` 显示 `扳手猴岛`、中文介绍、`开始/重新开始`；静态 map logo 保留英文 |
| 窗口缩放/最大化稳定 | 通过 | P0 报告 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782019656438.json` 通过；截图 `run-1782019656438/01-monkey-wrench-maximized.png` 已人工检查：角色可见，MENU 在右上，中文气泡稳定，无蓝底/非游戏 UI 污染 |
| F11/fullscreen 与 loading 居中 | 通过 | `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782021663340.json` 通过；使用 `--post-message-f11=1`，`noForegroundCapture=true`；G32QC 全屏 `2560x1440`，`f11.fullscreenLike=true`，3 个 loading 样本居中；代表截图 `run-f11-loading-1782021663340/f11-loading-sequence/f11-loading-0.png` |
| HUD/菜单/背包/设置按钮居中 | 通过本轮样本 | 设置 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782020668442.json`；背包 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782021205618.json`，截图 `run-1782021205618/01-monkey-wrench-secondary.png` 显示 `扳手猴岛`、背包空文案居中；FTUE `mainLand` 展开 HUD 只有设置、音量、主页、换装、背包、退出，不显示商店/地图入口，不能用通用 8 键矩阵硬套 |
| 确认框/商店/地图按钮 | 本场景不适用，待自然路线补证 | `mainLand` HUD 不暴露商店/地图按钮；退出图标尝试 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782021889627.json` 未出现确认框，未计入通过。本轮不把错误坐标或缺失图标当游戏缺陷 |
| 3 个真实中文剧情对话 | 通过 | Amelia `strange`：`runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782020113936.json`；Amelia `dialog_speed`：`1782020195440`；Amelia `ring_bell`：`1782020541562`；均为原生 `Dialog.sayById()` 气泡，截图序列已人工检查 |
| 对话不重复/不抽搐 | 通过 | 三个稳定性报告均中文样本稳定，`duplicateExpectedSampleCount=0`，`visualStable=true`。Crusoe `look`、Amelia `guests`、player `no_fruit` 三次灰屏/空白校准未计入通过证据 |
| 静态美术字规则 | 通过 | `MENU` 图标、`Juice Machine`、`Reception`、`CRUSOE'S CASTAWAY RETREAT`、场景箭头/招牌/地图 logo 等静态图片文字保持英文；未使用中文文本层硬盖 |
| 废弃证据 | 已标记 | 背包通用 index 误点 `1782020999440`、退出确认框未出现 `1782021889627`、F11 后段采到 Codex 桌面 `1782019893931`、短 settle 灰边 `1782021399945`、带 QA 起点 seed 的全屏灰屏 `1782021517022` 均不作为通过 |
| 当前剩余 | 非封版 blocker | 未证明从教程开头到结尾自然通关；更多 FTUE 场景、自然剧情路线和本场景不暴露的公共商店/地图入口后续深测补，不阻塞进入下一个岛 |

## 当前 Survival 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| Shell/入口可启动 | 通过 | `tools/patch-as3-monster-qa-dialog.js` 已扩展 `game.scenes.survival4.mainHall.MainHall` QA hook 与 Survival4 内部 `flashpointQaAutoScene` 场景切换；`tools/lib/as3-direct-wrapper.js`、`flashpoint/as3-direct.php`、`tools/qa-as3-p0-playability.js` 已允许完整 AS3 scene class；AS3 runtime zip 已重建，补丁报告 `runtime-data/qa/as3/as3-monster-qa-dialog-patch.json`，replacementCount `1297` |
| 地图打开/介绍中文 | 通过 | 新增 `survival1` 到 `survival5` 以及 `survivalEpisodic/episode1` 到 `episode5` 地图 page XML；严格中文 map smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782023762400.json` 通过；截图 `runtime-data/qa/as3/islands-smoke/run-1782023762400/01-survival-map.png` 显示 `第1集：坠机迫降`、中文介绍、`重新开始/开始`；静态 Survival logo 保留英文 |
| 窗口缩放/最大化稳定 | 通过 | P0 报告 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782024946797.json` 通过；截图 `run-1782024946797/01-survival-resized.png` 与 `run-1782024946797/01-survival-maximized.png` 已人工检查：角色可见，MENU 在右上，场景不露蓝底，中文剧情气泡可见 |
| F11/fullscreen 与 loading 居中 | 通过 | `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782027006669.json` 通过；使用 `--post-message-f11 1`，G32QC 真全屏，`f11.fullscreenLike=true`，`loading.observed=true`，`centerOk=true`，13 个 loading 样本居中；代表截图 `run-f11-loading-1782027006669/f11-before-transition.png`、`f11-loading-sequence/f11-loading-0.png`、`f11-loading-sequence/f11-loading-8000.png` |
| HUD/菜单/背包/商店/地图/设置按钮居中 | 通过本轮样本 | 菜单/背包 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782027860270.json`，截图 `run-1782027860270/01-survival-post-click.png` 和 `01-survival-inventory.png`；设置 `as3-hud-smoke-1782028291170.json`，截图 `run-1782028291170/01-survival-secondary.png`；商店确认 `as3-hud-smoke-1782028443657.json`，截图 `run-1782028443657/01-survival-secondary.png`；地图确认 `as3-hud-smoke-1782028603276.json`，截图 `run-1782028603276/01-survival-secondary.png`。人工复核中文标题/按钮居中、不重叠；菜单展开静态图标保留英文/图形 |
| 3 条中文剧情对话 | 通过 | Player `get_on_with_it`：`runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782027406622.json`；Player `must_escape`：`1782027601502`；Player `nom_noms`：`1782027689650`。三条均为原生 Dialog 数据路径，5/5 样本中文稳定，expectedCount=1 或 Han 匹配，截图 `run-1782027406622/sequence/dialogue-0.png`、`run-1782027601502/sequence/dialogue-0.png`、`run-1782027689650/sequence/dialogue-0.png` 已人工检查 |
| 对话不重复/不抽搐 | 通过本轮剧情样本 | 三个稳定性报告均 `stableText=true`、`visualStable=true`、`duplicateExpectedSampleCount=0`；未发现重复泡泡刷新或文本抽搐。Winston `dinner`、Van Buren `lucky` 和 `securityInteraction/keycode` 的 MainHall QA hook 未触发到 NPC Dialog，记录为自动化 hook/自然路线补证缺口，不计入通过证据 |
| 静态美术字规则 | 通过 | `MENU` 图标、Survival 地图 logo、场景招牌/海报/箭头/美术字保持英文或原图；未使用中文文本层硬盖静态图标、招牌、海报 |
| 废弃证据 | 已标记 | 入口 P0 `1782024092292`/`1782024416868`/`1782024707320`、F11 灰屏/延迟错误 `1782025153784`/`1782026819879`、Winston/Van Buren/security QA hook 未触发 `1782027284860`/`1782027499679`/`1782028804754` 均不作为通过证据 |
| 当前剩余 | 非封版 blocker | 未证明 Survival 五集从头到尾通关；真实自然 NPC 热区、更多房间、猎场/逃脱剧情、以及 MainHall NPC QA hook 后续仍需深测补证。本轮封版基线已可进入下一个岛 |

## 当前 Arabian Nights 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| Shell/入口可启动 | 通过 | `tools/patch-as3-monster-qa-dialog.js` 已扩展 `game.scenes.arab1.bazaar.Bazaar` 原生 Dialog QA hook，并新增 `qa_auto_scene_arab1_desert` QA-only 切场 hook；`runtime-data/qa/as3/as3-monster-qa-dialog-patch.json` 和 `runtime-data/qa/as3/as3-runtime-shell-only-update.json` 已更新，runtime Shell sha256 `55e2ddbc...` |
| 地图打开/介绍中文 | 通过 | 新增 `arab1/arab2/arab3` 与 `arabEpisodic/episode1..3` 地图 page XML；严格中文 map smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782029786436.json` 通过；截图 `runtime-data/qa/as3/islands-smoke/run-1782029786436/01-arabian-nights-map.png` 显示第 1 集中文标题/介绍、`重新开始/开始` |
| 窗口缩放/最大化稳定 | 通过 | 最新 P0 报告 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782036700970.json` 通过；截图 `run-1782036700970/01-arabian-nights-resized.png` 与 `run-1782036700970/01-arabian-nights-maximized-retry-1.png` 已人工检查：角色可见、MENU 稳定右上、场景不露蓝底、不捕获主屏 UI |
| 窗口与 F11/fullscreen loading 居中 | 通过 | 窗口模式 `runtime-data/qa/as3/p0-playability/as3-window-loading-transition-1782036333988.json` 通过，9 个 loading 样本居中；代表截图 `run-window-loading-1782036333988/window-loading-sequence/window-loading-4000.png`。F11/fullscreen `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782036503309.json` 通过，`f11.fullscreenLike=true`、10 个 loading 样本居中；代表截图 `run-f11-loading-1782036503309/f11-loading-sequence/f11-loading-0.png` |
| HUD/菜单/背包/商店/地图/设置按钮居中 | 通过本轮样本 | 背包 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782031265590.json`，设置 `1782031427653`，商店确认 `1782031583317`，地图确认 `1782031745867`。人工复核对应截图：`一千零一夜`、空背包文案、`设置`、`进入商店？/确定`、`确定要前往地图吗？/确定` 居中，不重叠 |
| 3 个真实中文剧情/NPC 对话 | 通过 | Trader2 `comment`：`runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782034402463.json`；Trader1 `comment`：`1782034488207`；Trader3 `comment`：`1782034573399`。三条均为原生 `Dialog.sayById()` 气泡，截图 `run-*/sequence/dialogue-0.png` 已人工检查 |
| 对话不重复/不抽搐 | 通过本轮样本 | 三个稳定性报告均中文样本稳定，`visualStable=true`，未观察到重复刷新或多气泡抽搐；player `need_spy_glass` `1782034258831` 作为额外中文气泡校准通过 |
| 静态美术字规则 | 通过 | `MENU`、`Your Highness/Grand Bazaar`、海报、摊位牌、地图 logo、箭头/场景美术字保持英文/原图；未用中文 TextField 覆盖静态图标、招牌、海报 |
| 废弃证据 | 已标记 | `as3-window-loading-transition-1782035113292.json`、`1782035732803` 未触发或采样错过 loading；`1782036150548` 实际已切到 Desert 但采样晚，不能当 loading 居中证据；`as3-p0-playability-1782034693409.json` 初始等待太短采到灰启动帧，后续 `1782034910525` 和最新 `1782036700970` 已通过 |
| 当前剩余 | 非封版 blocker | 未证明三集从头到尾自然通关；更多房间、自然热区、宫殿/洞穴/沙漠剧情和全流程后续深测补证。本轮封版基线已可进入下一个岛 |

## 当前 Escape from Pelican Rock 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| Shell/入口可启动 | 通过 | `tools/patch-as3-monster-qa-dialog.js` 已扩展 `game.scenes.prison.hill.Hill` 原生 Dialog QA hook，并新增 Prison QA-only 切场 hook；`runtime-data/qa/as3/as3-monster-qa-dialog-patch.json` 与 `runtime-data/qa/as3/as3-runtime-shell-only-update.json` 已更新 |
| 地图打开/介绍中文 | 通过 | 新增 `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/prison/island/page.xml`；用 `tools/update-as3-runtime-entries.js` 写入 runtime zip；严格中文 map smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782038868052.json` 通过；截图 `runtime-data/qa/as3/islands-smoke/run-1782038868052/01-escape-from-pelican-rock-map.png` 显示 `逃离鹈鹕岩`、中文介绍、`重新开始/开始` |
| 窗口缩放/最大化稳定 | 通过 | P0 报告 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782039033401.json` 通过；人工复核 `run-1782039033401/01-escape-from-pelican-rock-resized.png`、`01-escape-from-pelican-rock-maximized-retry-1.png`、`01-escape-from-pelican-rock-f11.png`：角色可见、MENU 稳定右上、无蓝底/非游戏 UI |
| 窗口与 F11/fullscreen loading 居中 | 通过 | 窗口模式 `runtime-data/qa/as3/p0-playability/as3-window-loading-transition-1782039314137.json` 通过，代表图 `run-window-loading-1782039314137/window-loading-sequence/window-loading-1000.png`。F11/fullscreen `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782039474396.json` 通过，代表图 `run-f11-loading-1782039474396/f11-loading-sequence/f11-loading-1000.png`，`f11.fullscreenLike=true` |
| HUD/菜单/背包/商店/地图/设置按钮居中 | 通过本轮样本 | 背包 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782039730282.json`，设置 `1782040006268`，商店确认 `1782040688698`，地图确认 `1782040849648`。人工复核对应截图：`逃离鹈鹕岩`、空背包文案、`设置`、`进入商店？/确定`、`确定要前往地图吗？/确定` 居中，不重叠 |
| 3 个真实中文剧情/NPC 对话 | 通过 | Player `tower`：`runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782041030923.json`；Tex `listen_up`：`1782041218501`；P2 `gee`：`1782041576351`。三条均使用原生 Dialog 数据路径，截图 `run-*/sequence/dialogue-1000.png` 已人工检查 |
| 对话不重复/不抽搐 | 通过本轮样本 | 三个稳定性报告均 `visualStable=true`，5 个样本连续稳定；player/tex 预期子句未重复，p2 用中文稳定模式通过；未观察到重复气泡或抽搐 |
| 静态美术字规则 | 通过 | `MENU`、`ESCAPE FROM PELICAN ROCK` 地图 logo、场景箭头/标牌/海报/美术字保持英文或原图；未用中文 TextField 覆盖静态图标、招牌、海报 |
| 废弃证据 | 已标记 | 地图早期 `1782038469318` 仍显示英文，原因是新 page XML 未写入 runtime zip；`1782038327704`/`1782038630339` 为 reload/difficulty 造成的灰屏，不计通过。对话 `p1/stop` `1782041299847`、`bandit/odds` `1782041389025` 当前 seed 下无实体气泡；`tex/listen_up` `1782041123097` 和 `p2/gee` `1782041472212` 是 OCR 精确子句失败，已用稳定子句/稳定中文模式复跑通过 |
| 当前剩余 | 非封版 blocker | 未证明 Pelican Rock 从头到尾自然通关；`messHall`、`prisonPromo`、`roof3`、`tower` 等历史直启仍需后续自然路线或资源级深测；更多普通 NPC 热区、全剧情、道具链、监狱内部路线和结局仍需后续全岛深测。本轮封版基线已可进入下一个岛 |

## 当前 Galactic Hot Dogs 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| Shell/入口可启动 | 通过 | 新增 `tools/patch-as3-ghd-rescue-dialog-proof.js`，保留此前 `tools/patch-as3-ghd-arena-load-guard.js` 与 `tools/patch-as3-ghd-neon-dialog-guard.js`；补丁报告 `runtime-data/qa/as3/as3-ghd-rescue-dialog-proof-patch.json` 通过，最新 runtime Shell sha256 为 `e1162f3364d4ceeb6bb832e864e096e8d6c3e13e34fd34bca4d270e5a01f62db` |
| 地图打开/介绍中文 | 通过 | `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782066719474.json` 通过；截图 `runtime-data/qa/as3/islands-smoke/run-1782066719474/01-galactic-hot-dogs-map.png` 显示中文标题/介绍和按钮，静态 Galactic Hot Dogs logo 保留英文原图 |
| 窗口缩放/最大化/F11 视觉稳定 | 通过 | `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782072751029.json` 通过；人工复核 `run-1782072751029/01-galactic-hot-dogs-resized.png`、`01-galactic-hot-dogs-maximized-retry-1.png`、`01-galactic-hot-dogs-f11.png`：角色可见，MENU 右上稳定，无蓝底/非游戏 UI；本报告用 `--skip-dialogue 1`，对话由下方三条专项报告证明 |
| loading 居中 | 部分通过，有自动化缺口 | 旧真全屏报告 `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782068407206.json` 已通过；本轮新 Shell 后 `as3-f11-loading-transition-1782073027690.json` 观察到 11 个 loading 样本且 `centerOk=true`，但 no-foreground PostMessage F11 没进入 fullscreen-sized，记为自动化缺口；窗口专项 `1782073196736` 未抓到 transition，不计通过 |
| 场景进入/不卡死 | 通过本轮重点样本 | 全 GHD 18 场景 sweep `runtime-data/qa/as3/ghd-scene-sweep-1782066621955-with-retry.json` 通过 18/18；本轮改 Shell 后重点复跑 Barren2 `1782072079682`、Mushroom2 `1782072160180`、Prehistoric2 `1782072235409`、GhostShip `1782072314003`，均 `ok=true`、`audioActive=0`、visual guard 通过 |
| HUD/菜单/背包/商店/地图/设置按钮居中 | 通过本轮前样本 | 地图/背包/菜单 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782066981168.json`，设置 `1782067146347`，商店确认 `1782067304910`，地图确认 `1782067473480`；人工复核中文按钮/标题居中，不重叠；MENU 静态图标保留英文，不叠中文 |
| 3 个真实中文剧情/NPC 对话 | 通过 | Dagger `trapped`：`runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782071166211.json`，Dagger `escaped`：`1782071563072`，GhostShip captain `rage`：`1782071930552`。三条均走原生 Dialog 路径，截图 `run-1782071166211/sequence/dialogue-1600.png`、`run-1782071563072/sequence/dialogue-1600.png`、`run-1782071930552/sequence/dialogue-1600.png` 已人工检查为中文气泡 |
| 对话不重复/不抽搐 | 通过本轮样本 | 三个稳定性报告均 `stableText=true`、`visualStable=true`、`duplicateExpectedSampleCount=0`，6/6 样本稳定；未观察到重复气泡刷新、角色抽搐或文本闪烁 |
| 静态美术字规则 | 通过 | `MENU`、场景招牌、海报、箭头、美术字、地图 logo 均保留英文/原图；没有使用中文 TextField 硬盖静态图标、标牌、海报 |
| 废弃证据 | 已标记 | Humphree `free` `1782071267279` 气泡被左上裁切，Cosmoe `baby` `1782071367644` 灰屏，NeonWiener 早期 `1782069757681`/`1782069860234` 未出气泡，通用 P0 `1782072449108` 仅因泛用点击没触发中文对话失败，均不作为通过证据 |
| 当前剩余 | 非封版 blocker | 还没有证明从开头到结尾自然通关；Humphree/Cosmoe 当前 seed QA 证据不干净，后续需要自然路线或更稳的场景 seed 补证；新 Shell 后 true fullscreen loading 受 no-foreground F11 自动化限制，需要后续侧屏受控复跑 |

## 当前 Virus Hunter 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| Shell/入口可启动 | 通过 | 新增 `tools/patch-as3-virus-hunter-dialog-proof.js`，只在 QA seed/query 参数存在时触发 PDC Lab 原生 Dialog；补丁报告 `runtime-data/qa/as3/as3-virus-hunter-dialog-proof-patch.json` 通过；`tools/update-as3-runtime-shell-only.js` 已同步 runtime zip，Shell sha256 `b330b469f1ac24a011584ed5c36f0f5cbefe3f5b61f3f4c9c76d103aabafe17f` |
| 地图打开/介绍中文 | 通过 | 新增 `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/virusHunter/island/page.xml`；最终 map smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782074274865.json` 通过；截图 `runtime-data/qa/as3/islands-smoke/run-1782074274865/01-virus-hunter-map.png` 显示 `病毒猎手岛`、中文介绍、`重新开始/开始`；静态 `VIRUS HUNTER ISLAND` logo 保持英文原图 |
| 窗口缩放/最大化/F11 视觉稳定 | 通过 | P0 报告 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782074363553.json` 通过；人工复核 `run-1782074363553/01-virus-hunter-resized.png`、`01-virus-hunter-maximized-retry-2.png`、`01-virus-hunter-f11-retry-1.png`：角色可见，MENU 右上稳定，无蓝底/非游戏 UI；本报告用 `--skip-dialogue 1`，对话由下方三条专项报告证明 |
| F11/fullscreen loading 居中 | 通过 | `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782074683572.json` 通过，`f11.fullscreenLike=true`、`loading.observed=true`、`centerOk=true`；代表截图 `runtime-data/qa/as3/p0-playability/run-f11-loading-1782074683572/f11-loading-sequence/f11-loading-1000.png` 显示 G32QC 真全屏 loading 居中 |
| 场景进入/不卡死回归 | 通过本轮样本 | MainStreet 回归 `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782076686386.json` 通过，PdcLab 回归 `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782076773714.json` 通过；两条均 `ok=true`、`audioActive=0`、scene evidence 和 visual guard 通过 |
| HUD/菜单/背包/商店/地图/设置按钮居中 | 通过本轮样本 | 背包 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782074921756.json`，设置 `1782075051207`，商店确认 `1782075975053`，地图确认 `1782075862106`，公共确认框 `1782075327599`。人工复核中文标题/标签/按钮居中、不重叠；静态 HUD icon 与 `MENU` 保持原图英文 |
| 3 个真实中文剧情/NPC 对话 | 通过 | PDC Lab `npc2/checkIn`：`runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782076303669.json`，OCR `去跟我们的项目负责人兰格博士报到吧。`；`npc/workAroundClock`：`1782076399318`，OCR `我们一直在连轴转。`；`npc4/default`：`1782076596782`，OCR `坐电梯下去，找兰格博士谈谈。`。三条均走原生 Dialog/CharUtils 路径 |
| 对话不重复/不抽搐 | 通过本轮样本 | 三个稳定性报告均 6/6 样本中文稳定，`visualStable=true`、`duplicateExpectedSampleCount=0`；未观察到重复气泡刷新、文本闪烁或角色抽搐 |
| 静态美术字规则 | 通过 | `MENU`、地图 logo、场景店招/海报/标牌/箭头/墙面文字保持英文或原图；未用中文 TextField 覆盖静态图标、招牌、海报或美术字 |
| 废弃证据 | 已标记 | 早期 map smoke `1782074117564` 暴露英文介绍，已由 `1782074274865` 修复并复测通过；HUD index 3 `1782075457775` 点到错误/非目标，不计通过；map confirm `1782075607508` 是 Flash 插件崩溃页，不计通过，已由 `1782075862106` 复跑通过；`npc3/tech` `1782076495845` 采到纯灰镜头，不计入对话证据 |
| 当前剩余 | 非封版 blocker | 未证明 Virus Hunter 从头到尾自然通关；体内血液/肺/胃/脑、飞船、狗/乔线、更多 NPC 自然热区和结局仍需后续全岛深测。本轮封版基线已可进入下一个岛 |

## 当前 Mocktropica 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| Shell/入口可启动 | 通过 | 新增 `tools/patch-as3-mocktropica-dialog-proof.js`，只在 QA seed/query 参数存在时触发 `game.scenes.mocktropica.mainStreet.MainStreet` 原生 Dialog 证明；补丁报告 `runtime-data/qa/as3/as3-mocktropica-dialog-proof-patch.json` 通过；`tools/update-as3-runtime-shell-only.js` 已同步 runtime zip，Shell sha256 `1b52e8bc47d681eda777a24f9a67f587725d9823b8c03646610e0e0eb48d76a4` |
| 地图打开/介绍中文 | 通过 | 新增 `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/mocktropica/island/page.xml`；最终 map smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782077393563.json` 通过；截图 `runtime-data/qa/as3/islands-smoke/run-1782077393563/01-mocktropica-map.png` 显示 `Mocktropica 岛`、中文介绍、`重新开始/开始`；静态 Mocktropica logo 保持英文原图 |
| 窗口缩放/最大化/F11 视觉稳定 | 通过 | P0 报告 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782077973966.json` 通过；人工复核 `run-1782077973966/01-mocktropica-resized.png`、`01-mocktropica-maximized-retry-2.png`、`01-mocktropica-f11-retry-1.png`：角色可见，MENU 右上稳定，无蓝底/非游戏 UI |
| loading 居中 | 通过 | 同一 P0 报告 `1782077973966` 捕获启动 loading；代表截图 `runtime-data/qa/as3/p0-playability/run-1782077973966/01-mocktropica-launch-loading-120.png` 显示 `Poptropica` logo/loading dots 居中；场景稳定后 OCR 中的 HQ `Poptropica` 不再被误判为 loading |
| 场景进入/不卡死回归 | 通过本轮样本 | MainStreet smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782077488309.json` 通过；截图 `runtime-data/qa/as3/islands-smoke/run-1782077488309/01-mocktropica-mainStreet.png` 显示真实场景、角色、NPC 和右上 MENU 稳定 |
| HUD/菜单/背包/商店/地图按钮居中 | 通过本轮样本 | 背包 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782078344230.json`，地图确认 `1782078529579`，商店确认 `1782078703877`。人工复核中文标题/文案/按钮居中、不重叠；静态 HUD icon 与 `MENU` 保持原图英文 |
| 3 个真实中文剧情/NPC 对话 | 通过 | Project Manager `twist`：`runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782079082704.json`，OCR 含 `经典`；Project Manager `noRest`：`1782079544614`，OCR 含 `下一个岛`；Project Manager `rehire`：`1782079643385`，OCR 含 `重新雇`。三条均走原生 Dialog 路径，代表截图 `run-1782079082704/sequence/dialogue-1000.png`、`run-1782079544614/sequence/dialogue-1000.png`、`run-1782079643385/sequence/dialogue-1000.png` 已人工检查为中文气泡 |
| 对话不重复/不抽搐 | 通过本轮样本 | 三个稳定性报告均 6/6 样本中文稳定，`visualStable=true`、`duplicateExpectedSampleCount=0`；未观察到重复气泡刷新、文本闪烁或角色抽搐 |
| 静态美术字规则 | 通过 | `MENU`、HQ logo、`HEADQUARTERS/Under new management`、地图 logo、场景招牌/海报/箭头/美术字保持英文或原图；未用中文 TextField 覆盖静态图标、招牌、海报或美术字 |
| 废弃证据 | 已标记 | `boy/first_curd` `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782079175378.json` 画面和中文气泡可见，但白色 unfinished-art 背景触发 visual guard，不计通过；`focusTester/coinsPlease` `1782079328682` 灰屏，不计通过；`leadDeveloper/figures` `1782079415815` 中文命中但镜头进入大面积白色未完成背景，视觉守卫失败，不计通过 |
| 当前剩余 | 非封版 blocker | 未证明 Mocktropica 从头到尾自然通关；HQ 内部楼层、basement/island editor、Cheese Factory、University、Mountain、server/final boss、更多 NPC 自然热区和完整道具链仍需后续全岛深测。本轮封版基线已可进入下一个岛 |

## 当前 Mystery of the Map 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| Shell/入口可启动 | 通过 | 修正 `catalog/launch-overrides.json`：`mystery-of-the-map` 从错误的 `lands/lab1` 改为真实 `viking/jungle`，manifest 当前指向 `game.scenes.viking.jungle.Jungle`；新增 `tools/patch-as3-viking-dialog-proof.js`，只在 QA seed/query 参数存在时触发原生 Dialog；Shell 同步报告 `runtime-data/qa/as3/as3-runtime-shell-only-update.json`，Shell sha256 `324d0549fb7fda0b2545e31f81c28aee07434f572916540b57d5c062d529d941` |
| 地图打开/介绍中文 | 通过 | 新增/修正 `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/viking/island.xml` 与 `.../island/page.xml`；map smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782081341123.json` 通过；截图 `runtime-data/qa/as3/islands-smoke/run-1782081341123/01-mystery-of-the-map-map.png` 显示 `地图之谜`、中文介绍、`重新开始/开始`；静态 `MYSTERY of the MAP ISLAND` logo 保持英文原图 |
| 窗口缩放/最大化视觉稳定 | 通过 | P0 纯视口回归 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782084123056.json` 通过；人工复核 `run-1782084123056/01-mystery-of-the-map-resized.png` 与 `01-mystery-of-the-map-maximized-retry-1.png`：场景不露蓝底，MENU 右上稳定，无非游戏 UI 捕获；对话镜头跟随 Octavian，普通玩家可见由 main scene smoke `1782081438275` 证明 |
| loading 居中 | 通过 | P0 回归 `1782084123056` 捕获启动 loading，截图 `runtime-data/qa/as3/p0-playability/run-1782084123056/01-mystery-of-the-map-launch-loading-120.png` 居中；G32QC 真全屏 loading 专项 `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782082091089.json` 通过，`fullscreenLike=true`、`loading.centerOk=true`，代表截图 `run-f11-loading-1782082091089/f11-loading-sequence/f11-loading-1000.png` |
| 场景进入/不卡死回归 | 通过本轮样本 | Main scene smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782081438275.json` 通过；截图 `runtime-data/qa/as3/islands-smoke/run-1782081438275/01-mystery-of-the-map.png` 显示真实 Viking Jungle 场景、玩家、右上 MENU 和静态 `Viking's Grotto` 标牌 |
| HUD/菜单/背包/商店/地图按钮居中 | 通过本轮样本 | 背包 `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782082400503.json`，商店确认 `1782082615238`，地图确认 `1782082841936`。人工复核背包标题/文案、`进入商店？/确定`、`确定要前往地图吗？/确定` 均中文居中、不重叠；静态 `MENU`、奖杯 `PRIZE` 和 icon art 保持原图英文 |
| 3 个真实中文剧情/NPC 对话 | 通过 | Octavian `getDown`：`runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782083205609.json`，OCR `快把我弄下来！`；Octavian `look`：`1782083306370`，OCR `喂，你！往上看！`；Octavian `thisMap`：`1782083410914`，OCR `这座岛上一定有你能用的东西。这张地图会帮你找到它。`；代表截图均已人工检查 |
| 对话不重复/不抽搐 | 通过本轮样本 | 三个稳定性报告均为 6/6 样本中文稳定，`visualStable=true`、`duplicateExpectedSampleCount=0`；P0 回归 `1782084123056` 进一步证明 resize/maximize 后同一中文气泡仍可见 |
| 静态美术字规则 | 通过 | `MENU`、地图 logo、`Viking's Grotto`、场景箭头、标牌、海报、美术字保持英文或原图；未用中文 TextField 覆盖静态图标、招牌、海报或美术字。地图总览列表里的 `Mystery of the Map` 视作静态/嵌入资源，当前只记录，不硬盖 |
| 废弃证据 | 已标记 | `as3-f11-loading-transition-1782081899913.json` PostMessage F11 未进入 fullscreen-sized，不计通过；P0 `1782083512761` 泛用点击没点到 NPC，不计对话通过；P0 `1782083839170` 暴露缩放后旧窗口句柄点击失败，已修 QA 脚本并用 `1782084123056` 通过样本替代 |
| 当前剩余 | 非封版 blocker | 未证明 Mystery of the Map 从头到尾自然通关；Viking beach/fortress/diningHall/throneRoom/river/waterfall/peak 等更多场景、道具链、自然热区和结局仍需后续全岛深测。本轮封版基线已可进入下一个岛 |

## 当前 Early Poptropica 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| AS2 入口/启动场景 | 通过 | `catalog/launch-overrides.json` 当前指向 `sceneFolder=Early`、`roomParam=City2`、`islandParam=Early`、`startupPath=gameplay`；基线回归 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782087997744.json` 进入真实 Early City2 场景，`audioActive=0` |
| 地图打开/介绍中文 | 通过 | AS3 地图介绍 smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782088417951.json` 通过，截图 `runtime-data/qa/as3/islands-smoke/run-1782088417951/01-poptropicon-map.png` 显示 `早期 Poptropica 岛`、中文介绍、`重新开始/开始`；AS2 岛内旧地图弹窗通过 `1782087997744` 请求 `popups/map.swf` 与 `popups/maps/Early.swf`。静态 `EARLY POPTROPICA ISLAND` logo 和截图内欢迎牌保留英文原图 |
| AS2 原生文本/对话补丁 | 通过本轮样本 | `tools/seed-as2-early-translations.js` 补 44 条 Early 原生 `swf-script` 文本；`tools/patch-as2-script-translations.js` 已 patch `sceneBalance.swf`、`sceneCity.swf`、`sceneCity2.swf`、`sceneJamestown.swf`、`sceneMuseum.swf`、`scenePit.swf`，报告位于 `runtime-data/qa/as2/as2-script-translation-patch-scene*.json` |
| 窗口/F11/底部蓝边 | 通过 | 严格 F11 视觉守卫 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782087918807.json` 通过；截图 `runtime-data/qa/as2/interaction-smoke/run-1782087918807/01-early-poptropica-f11.png` 人工检查角色可见、HUD 在右上、底部不再露蓝底。实现点：`base.php` 恢复 AS2 gameplay 1010x580 裁切，`gameplay.swf` 保存状态条全局隐藏 |
| loading 居中 | 通过 | 全量 Early 基线 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782087997744.json` 通过 `loadingCenterPassed=1`；截图 `runtime-data/qa/as2/interaction-smoke/run-1782087997744/01-early-poptropica-loading-sequence/01-early-poptropica-loading-500.png` 人工检查居中 |
| HUD/菜单/地图 UI | 通过本轮样本 | `1782087997744` 证明右上 MENU 稳定、AS2 地图弹窗可打开；地图介绍截图 `1782088417951` 证明 `重新开始/开始` 中文按钮居中。静态 `MENU` 图标保留英文图形，不用中文文字层覆盖 |
| 3 个真实中文 NPC/剧情对话 | 通过 | City2 欢迎：`runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782087705505.json`；旗帜/水塔：`1782087765988`；旧城区提示：`1782087829923`。三张 `initial.png` 均为 AS2 原生气泡中文，不是静态贴图覆盖 |
| 对话不重复/不抽搐 | 通过本轮样本 | 三段 QA-only 触发均为单次原生 `talkyText` 气泡，截图人工检查没有重复气泡、文字抽搐或角色消失；后续自然 NPC 连点仍需扩样本 |
| 静态美术字规则 | 通过 | `EARLY POPTROPICA ISLAND`、欢迎牌、博物馆/店铺/厕所/停车/海报/门牌/箭头等静态美术字保持英文或原图；未用中文 TextField 硬盖静态图标、招牌、海报或美术字 |
| 废弃证据 | 已标记 | `as2-interaction-smoke-1782086887688.json` 用严苛蓝色边缘阈值检查 AS2 地图弹窗时失败，原因是地图弹窗原生蓝色背景大面积存在，不计为 gameplay 蓝底回归；真实 F11 无地图严格样本已由 `1782087918807` 替代 |
| 当前剩余 | 非封版 blocker | 未证明 Early Poptropica 从头到尾自然通关；Balance/City/Jamestown/Museum/Pit 更多自然对话、道具链、地下/云端等房间和全剧情仍需后续全岛深测。本轮封版基线已可进入 Shark Tooth |

## 当前 Shark Tooth 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| AS2 入口/启动场景 | 通过 | `catalog/launch-overrides.json` 当前指向 `sceneFolder=Shark`、`roomParam=Mainstreet`、`islandParam=Shark`、`startupPath=gameplay`；基线回归 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782090320593.json` 进入真实 Shark Mainstreet，scene evidence/visual guard/F11/loading/map 均通过 |
| 地图打开/介绍中文 | 通过 | 新增 `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/shark/island/page.xml` 并写入 AS3 runtime；AS3 map smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782092458415.json` 通过，截图 `runtime-data/qa/as3/islands-smoke/run-1782092458415/01-poptropicon-map.png` 显示 `鲨鱼牙岛`、中文介绍、`重新开始/开始`；AS2 岛内旧地图弹窗在 `1782090320593` 请求 `popups/map.swf` 与 `popups/maps/Shark.swf` |
| AS2 原生文本/对话补丁 | 通过本轮样本 | `tools/import-as2-runtime-script-text.js` 导入 Shark AS2 脚本文本，`tools/seed-as2-shark-translations.js` seeded 68/68 条 Shark 原生 `swf-script` 中文；`tools/patch-as2-script-translations.js` 已 patch `sceneBooga.swf`、`sceneCastaway.swf`、`sceneMainstreet.swf`、`sceneMedicine.swf`、`sceneMuseum2.swf`、`sceneRuins.swf`、`sceneTemple1.swf`、`sceneTemple2.swf`、`sceneTownhall.swf` |
| 窗口/F11/底部蓝边 | 通过 | Shark AS2 基线 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782090320593.json` 通过 `f11Passed=1` 与 visual guard；截图 `runtime-data/qa/as2/interaction-smoke/run-1782090320593/01-shark-tooth-f11.png` 人工检查角色可见、HUD 在右上、场景不露底部蓝边 |
| loading 居中 | 通过 | 同一基线 `1782090320593` 通过 `loadingCenterPassed=1`；截图 `runtime-data/qa/as2/interaction-smoke/run-1782090320593/01-shark-tooth-loading-sequence/01-shark-tooth-loading-500.png` 人工检查 `Poptropica LOADING` 居中 |
| HUD/菜单/地图 UI | 通过本轮样本 | `1782090320593` 证明右上 HUD/MENU 在窗口模式与 F11 下稳定，AS2 地图弹窗可打开；地图介绍截图 `1782092458415` 证明 `重新开始/开始` 中文按钮居中；静态 `MENU` 图标、地图 logo 和场景美术字保留英文/原图 |
| 3 个真实中文 NPC/剧情对话 | 通过 | Mainstreet 鲨鱼鳍装扮：`runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782092019886.json`；气泡椰奶：`1782092069884`；巨鲨恐慌：`1782092117113`。三张 `initial.png` 已人工检查，均为 AS2 原生气泡中文，不是静态贴图覆盖 |
| 对话不重复/不抽搐 | 通过本轮样本 | 三段 QA-only 触发均为单次原生 `talkyText/manualSay` 气泡；截图人工检查没有重复气泡、文字抽搐或角色消失。早期裁切样本已废弃，最终三段气泡完整可读 |
| 静音/后台 | 通过本轮口径 | QA 使用 `POPTROPICA_QA_MUTE_RUNTIME=1`、`POPTROPICA_QA_MUTE_HTML_AUDIO=1`、`G32QC`、`NO_FOREGROUND`；`1782090320593` 显示 `audioActive=0`。一次复测 `1782091696121` 的目标 session 为 `muted=true/volume=0.0`，但 loopback 捕到用户主机其它声音，按会话静音记录为误报，不作为游戏有声 |
| 静态美术字规则 | 通过 | `WELCOME TO SHARK TOOTH`、`SHARK TOOTH ISLAND` map logo、`RESTROOMS/PARKING LOT`、海报、招牌、箭头和其它 art-lettering 保持英文或原图；未用中文 TextField 覆盖静态图标、招牌、海报或美术字 |
| 废弃证据 | 已标记 | `1782090669748`、`1782090726409`、`1782090782494` 中文气泡被底部裁切，不计最终通过；`1782091487162` 因错误包裹气泡 onEnterFrame 导致气泡不可见，不计通过；`1782091696121` 游戏目标会话已静音但 loopback 被系统其它音频污染，不计游戏有声 |
| 当前剩余 | 非封版 blocker | 未证明 Shark Tooth 从头到尾自然通关；Booga Bay、Ancient Ruins、Temple、Medicine Man、Castaway、药水/救人/奖章完整路线和更多自然热区仍需后续全岛深测。本轮封版基线已可进入 24 Carrot |

## 当前 24 Carrot 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| AS2 入口/启动场景 | 通过 | `catalog/launch-overrides.json` 当前指向 `sceneFolder=Carrot`、`roomParam=CarrotMain`、`islandParam=Carrot`、`startupPath=gameplay`；最终基线回归 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782095220343.json` 进入真实 Carrot Main Street，scene evidence/visual guard/F11/loading/map 均通过 |
| 地图打开/介绍中文 | 通过 | 新增 `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/carrot/island/page.xml` 并写入 AS3 runtime；AS3 map smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782093999624.json` 通过，截图 `runtime-data/qa/as3/islands-smoke/run-1782093999624/01-poptropicon-map.png` 显示 `24 根胡萝卜岛`、中文介绍、`重新开始/开始`；AS2 岛内旧地图弹窗在 `1782095220343` 请求 `popups/map.swf` 与 `popups/maps/Carrot.swf` |
| AS2 原生文本/对话补丁 | 通过本轮样本 | `tools/import-as2-runtime-script-text.js` 导入 Carrot AS2 脚本文本，`tools/seed-as2-carrot-translations.js` 填补活动缺失行；`tools/patch-as2-script-translations.js` 已 patch `sceneCarrotMain.swf`、`sceneDiner.swf`、`sceneFactory.swf`、`sceneFarm.swf`、`sceneFarmHouse.swf`、`sceneLoading.swf`、`sceneProcessing.swf`、`sceneRobot.swf`、`sceneSurplus.swf` |
| 窗口/F11/底部蓝边 | 通过 | Carrot AS2 最终基线 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782095220343.json` 通过 `f11Passed=1` 与 visual guard；截图 `runtime-data/qa/as2/interaction-smoke/run-1782095220343/01-24-carrot-f11.png` 人工检查角色可见、HUD 在右上、场景不露底部蓝边 |
| loading 居中 | 通过 | 同一最终基线 `1782095220343` 通过 `loadingCenterPassed=1`；截图 `runtime-data/qa/as2/interaction-smoke/run-1782095220343/01-24-carrot-loading-sequence/01-24-carrot-loading-500.png` 人工检查 `Poptropica LOADING` 居中 |
| HUD/菜单/地图 UI | 通过本轮样本 | `1782095220343` 证明右上 HUD/MENU 在窗口模式与 F11 下稳定，AS2 地图弹窗可打开；地图介绍截图 `1782093999624` 证明 `重新开始/开始` 中文按钮居中；静态 `MENU` 图标、地图 logo 和场景美术字保留英文/原图 |
| 3 个真实中文 NPC/剧情对话 | 通过 | Main Street 胡萝卜不再消失：`runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782094725769.json`；工厂关门找不到工作：`1782094806248`；汽油用完：`1782094882172`。三张 `initial.png` 已人工检查，均为 AS2 原生气泡中文，不是静态贴图覆盖 |
| 对话不重复/不抽搐 | 通过本轮样本 | 三段 QA-only 触发均为单次原生 `talkyText/manualSay` 气泡；截图人工检查没有重复气泡、文字抽搐或角色消失 |
| 静音/后台 | 通过本轮口径 | QA 使用 `POPTROPICA_QA_MUTE_RUNTIME=1`、`POPTROPICA_QA_MUTE_HTML_AUDIO=1`、`G32QC`、`NO_FOREGROUND`；`1782095220343` 显示 `audioActive=0`；对话证明运行使用静音环境并跳过额外 loopback 采样，避免捕获用户主机其它声音 |
| 静态美术字规则 | 通过 | `24 CARROT ISLAND`、`CARROT KING DINER`、`OPEN`、AS2/AS3 地图 logo、海报、招牌、箭头和其它 art-lettering 保持英文或原图；未用中文 TextField 覆盖静态图标、招牌、海报或美术字 |
| 废弃证据 | 已标记 | `as2-interaction-smoke-1782094329354.json` 第一版 Carrot QA hook 过早触发，`talkyText=false/coords=false`，没有气泡，不计通过；已改为 QA-only fallback 使用同一 Carrot 主街脚本里的已翻译剧情台词，并补齐坐标字段后由 `1782094725769`、`1782094806248`、`1782094882172` 替代 |
| 当前剩余 | 非封版 blocker | 未证明 24 Carrot 从头到尾自然通关；Carrot Farm、Charlie 店、餐厅内、工厂、下水道、冷冻室、通风管、加工室、Robot/Rabbot 路线、道具链和更多自然热区仍需后续全岛深测。本轮封版基线已可进入 Time Tangled |

## 当前 Time Tangled 状态

| 验收项 | 状态 | 当前证据 |
|---|---|---|
| AS2 入口/启动场景 | 通过，封版重开中 | `catalog/launch-overrides.json` 当前指向 `sceneFolder=Time`、`roomParam=Present`、`islandParam=Time`、`startupPath=gameplay`；旧基线 `1782100652713` 进入真实 Time Present。中期反馈后 wave 1 复测 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782150563288.json` 通过 scene evidence、地图点击、F11、缺失请求和静音 |
| 地图打开/介绍中文 | 通过 | 新增 `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/time/island/page.xml` 并写入 AS3 runtime；AS3 map smoke `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782097615542.json` 通过，截图 `runtime-data/qa/as3/islands-smoke/run-1782097615542/01-poptropicon-map.png` 显示 `时空缠结岛`、中文介绍、`重新开始/开始`；AS2 岛内旧地图弹窗在 `1782100652713` 请求 `popups/map.swf` 与 `popups/maps/Time.swf` |
| AS2 原生文本/对话补丁 | 通过本轮样本 | `tools/import-as2-runtime-script-text.js` 导入 Time AS2 脚本文本，`tools/seed-as2-time-translations.js` seeded 缺失 Time 原生 `swf-script` 中文；`tools/patch-as2-script-translations.js` 已 patch `sceneAztec.swf`、`sceneChina.swf`、`sceneDesolation.swf`、`sceneEdison.swf`、`sceneEdison2.swf`、`sceneEverest2.swf`、`sceneEverest3.swf`、`sceneFrance.swf`、`sceneFrance2.swf`、`sceneFuture.swf`、`sceneFuture2.swf`、`sceneGraff.swf`、`sceneGraff2.swf`、`sceneGreece.swf`、`sceneGreece2.swf`、`sceneLab.swf`、`sceneLewis.swf`、`sceneMali.swf`、`sceneMali2.swf`、`scenePresent.swf`、`sceneRenaissance.swf`、`sceneRenaissance2.swf`、`sceneViking.swf`、`sceneViking2.swf` |
| 窗口/F11/底部蓝边 | wave 2 HUD 样本通过，继续全局回归 | 旧基线 `1782100652713` 与 wave 1 `1782150563288` 均通过 F11。修正右上锚点后新增 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782154039367.json`，截图 `run-1782154039367/01-time-tangled-f11.png` 显示 HUD 仍在右上、角色可见、未露明显蓝底；后续仍需覆盖更多 Time 年代场景和其它 AS2 岛 |
| loading 居中 | wave 2 通过 | wave 1 `1782150373279` 已通过；修正 HUD 后复测 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782154135577.json` 仍通过 `loadingCenterPassed=1`，0/500/1000/1500/2500/4000ms 均检测到居中 `Poptropica LOADING` |
| HUD/菜单/地图 UI | AS2 Time 顶层 HUD 右锚量化通过；弹窗层级仍开 | `1782153444792` 证明可见三枚 HUD 来自 gameplay 层；当前显式坐标锚定后，`1782153910199` 初始截图显示背包/服装/地图位于右上且不重叠，`1782153970576` 证明地图点击区仍可打开 AS2 地图，`1782154039367` 证明 F11 不漂移。新增 A/B 差分证据 `runtime-data/qa/as2/interaction-smoke/as2-hud-diff-1782154863479.json`：正常截图 `1782154863479` 对比隐藏 HUD 基线 `1782154908597`，识别 3 个 HUD 图标，右边距 44px、上边距 0px、行内偏差 4px，左上无异常差分。地图弹窗截图 `run-1782153970576/01-time-tangled-map.png` 仍可见 HUD 露在弹窗上沿外侧，后续按弹窗层级 blocker 处理 |
| 3 个真实中文 NPC/剧情对话 | 通过，新增 QA 参数黑页修复证据 | 旧三段：Lab 求助 `1782099797488`、打印资料 `1782099837988`、后续说明 `1782099896495`。中期反馈后修复 QA 参数污染导致跳 `base.php/saveData`，新增 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782150448753.json` 通过，OCR 样本为“请帮帮我们。故障搅乱了时间，未来岌岌可危。”；截图 `runtime-data/qa/as2/interaction-smoke/run-1782150448753/01-time-tangled-initial.png` 为 AS2 原生气泡中文 |
| 对话不重复/不抽搐 | 通过本轮样本 | 三段 QA-only 触发均为单次原生 `manualSay` 气泡；截图人工检查没有重复气泡、文字抽搐或角色消失 |
| 静音/后台 | 通过本轮口径 | QA 使用 `POPTROPICA_QA_MUTE_RUNTIME=1`、`POPTROPICA_QA_MUTE_HTML_AUDIO=1`、`G32QC`、`POPTROPICA_QA_NO_FOREGROUND=1`；`1782150373279`、`1782150448753`、`1782150563288` 均显示 `audioActive=0`，运行窗口在 G32QC 非主显示器 |
| 静态美术字规则 | 通过 | `TIME TANGLED ISLAND`、希腊图中文字、地图 parchment 标题、场景招牌/海报/箭头和其它 art-lettering 保持英文或原图；未用中文 TextField 覆盖静态图标、招牌、海报或美术字 |
| 废弃证据 | 已标记 | `as2-interaction-smoke-1782099985795.json` 逻辑通过但 F11 截图抓到桌面遮罩，不计最终通过；`as2-interaction-smoke-1782100294199.json` 前台捕获暴露未铺满白边和地图未打开，不计通过。已通过 QA helper 布局刷新修复，并由 `1782100652713` 替代 |
| 当前剩余 | 封版重开 blocker | 不进入 Super Power。待清：AS3 HUD 同口径复核、自然靠近 NPC 重复触发/抢话、任务物品/地图弹窗层级与黑残留/越界、使用物品后页面歪斜、科普/外链白屏、更多 Time 年代场景自然切换与时间机器物品链、真实音频来源清单。静态招牌/海报/美术字继续只记录或资产替换，不做中文叠层 |

## 当前下一步

1. Poptropicon 保留 1 个 blocker：con1 自然往返切换需要真实侧屏鼠标 pass 或更可靠的后台输入 harness；不能用 direct-room smoke 冒充自然通行完成。
2. Timmy Failure 当前 build 封版基线已通过：入口弹层关闭、resize/maximize/F11 稳定、窗口模式 loading、F11/fullscreen loading、地图介绍、背包、商店确认框、设置面板、3 段真实 NPC/剧情对话和“不重复、不抽搐”序列均有截图证据；下一步只补更多场景进入/自然剧情覆盖。
3. Reality TV Wild Safari 当前 build 封版基线已通过：入口、resize/maximize/F11、窗口和 fullscreen loading、地图介绍、HUD/背包/确认框、中文对话、对话稳定性均有截图证据；下一轮不再在 Reality 上空转。
4. Monster Carnival 当前 build 封版基线已通过：地图介绍、窗口缩放/最大化、F11/loading、HUD/背包/确认框、3 段真实中文对话、对话稳定性和静态美术规则均有截图证据；下一轮不再在 Monster 上空转。
5. Mission Atlantis 当前 build 封版基线已通过：地图介绍、窗口缩放/最大化、F11/loading、HUD/背包/确认框、3 段真实中文剧情对话、对话稳定性和静态美术规则均有截图证据；下一轮不再在 Mission 上空转。
6. Monkey Wrench 当前 build 封版基线已通过：地图介绍、窗口缩放/最大化、F11/loading、设置/背包、3 段真实中文剧情对话、对话稳定性和静态美术规则均有截图证据；FTUE `mainLand` 不暴露商店/地图按钮，作为设计差异记录。
7. Survival 当前 build 封版基线已通过：地图介绍、resize/maximize/F11、fullscreen loading、菜单/背包/设置/商店确认/地图确认、3 条中文剧情对话稳定性和静态美术规则均有截图证据；下一步只补更多自然 NPC/房间/剧情覆盖。
8. Arabian Nights 当前 build 封版基线已通过：地图介绍、resize/maximize、窗口和 F11 loading、HUD/背包/设置/商店确认/地图确认、3 条真实中文 NPC 对话稳定性和静态美术规则均有截图证据。
9. Escape from Pelican Rock 当前 build 封版基线已通过：地图介绍、resize/maximize、窗口和 F11 loading、HUD/背包/设置/商店确认/地图确认、3 条真实中文剧情/NPC 对话稳定性和静态美术规则均有截图证据。
10. Galactic Hot Dogs 当前 build 封版基线已通过：地图介绍、resize/maximize/F11 视觉、重点场景进入、HUD/背包/设置/商店确认/地图确认、3 条真实中文剧情/NPC 对话稳定性和静态美术规则均有截图证据；新 Shell 后 true fullscreen loading 仍保留 no-foreground 自动化复跑缺口。
11. Virus Hunter 当前 build 封版基线已通过：地图介绍、resize/maximize/F11、true fullscreen loading、MainStreet/PdcLab 场景回归、HUD/背包/设置/商店确认/地图确认、3 条真实中文 NPC 对话稳定性和静态美术规则均有截图证据。
12. Mocktropica 当前 build 封版基线已通过：地图介绍、resize/maximize/F11、启动 loading、MainStreet 场景回归、HUD/背包/商店确认/地图确认、3 条真实中文剧情对话稳定性和静态美术规则均有截图证据。
13. Mystery of the Map 当前 build 封版基线已通过：入口已纠正为 `viking/jungle`，地图介绍、resize/maximize、启动与 true fullscreen loading、Jungle 场景回归、HUD/背包/商店确认/地图确认、3 条真实中文剧情对话稳定性和静态美术规则均有截图证据。
14. Early Poptropica 当前 build 封版基线已通过：地图介绍、AS2 地图打开、F11/底部蓝边修复、loading 居中、3 段真实中文原生对话、HUD/MENU 稳定和静态美术规则均有截图证据。
15. Shark Tooth 当前 build 封版基线已通过：地图介绍、AS2 地图打开、F11/no-blue、loading 居中、3 段真实中文原生对话、HUD/MENU 稳定和静态美术规则均有截图证据。
16. 24 Carrot 当前 build 封版基线已通过：地图介绍、AS2 地图打开、F11/no-blue、loading 居中、3 段真实中文原生对话、HUD/MENU 稳定和静态美术规则均有截图证据。
17. Time Tangled 当前重开中：旧封版基线保留为历史证据；wave 1 已重新通过 loading 居中、Time Lab 中文对话、地图点击、F11、缺失请求和静音；wave 2 已量化关闭 AS2 Time 顶层 HUD 右锚和左上淡暂停残影，但 AS3 HUD 同口径、对话节流、弹窗/外链 blocker 未关闭。
18. 下一步不是 Super Power；先按中期反馈清全局 blocker，再重新跑 Time Tangled 完整验收。Time Tangled 重新封版后才进入 Super Power，并按同一 AS2 checklist 跑地图/介绍、窗口与 F11、loading、至少 3 段真实中文对话、HUD UI、静态美术规则、稳定性序列。
19. 建立静态箭头/标牌资产替换清单；静态图只登记或走 bitmap/image replacement，不叠中文。

## 逐岛执行顺序

原则：一个岛达到“窗口/F11/loading、主要场景切换、NPC/剧情对话、菜单/地图/背包 UI、原生箭头标签、静态美术字不硬盖、音频静音、截图记录”这一套通过标准后，才进入下一个岛。

当前执行：`17. time-tangled` 重开验收；`18. super-power` 暂停进入。`01. poptropicon` 保留自然后台切场 blocker，不再在当前输入限制上空转；`02. timmy-failure`、`03. reality-tv-wild-safari`、`04. monster-carnival`、`05. mission-atlantis`、`06. monkey-wrench`、`07. survival`、`08. arabian-nights`、`09. escape-from-pelican-rock`、`10. galactic-hot-dogs`、`11. virus-hunter`、`12. mocktropica`、`13. mystery-of-the-map`、`14. early-poptropica`、`15. shark-tooth` 和 `16. 24-carrot` 当前 build 封版基线通过；`17. time-tangled` 仅部分 blocker 关闭，仍不得标记全岛封版。

| 顺序 | 岛屿 | 引擎 | 当前状态 |
|---|---|---|---|
| 01 | poptropicon | AS3 | 可后台验证项已收口；自然后台切场 blocker 保留 |
| 02 | timmy-failure | AS3 | 当前 build 封版基线通过；`1781999359459` 覆盖入口弹层关闭、resize/maximize/F11 稳定、post-resize 中文对话、非游戏 UI 防误判；仍需更多场景进入/自然剧情覆盖 |
| 03 | reality-tv-wild-safari | AS3 | 当前 build 封版基线通过；`1782003638919` 覆盖 resize/maximize/F11、post-resize 中文对话和稳定画面；`1782001447409`/`1782001638633` 覆盖窗口与 fullscreen loading；`1782003060696` 地图介绍中文；`1782004103358` 对话稳定性通过 |
| 04 | monster-carnival | AS3 | 当前 build 封版基线通过；`1782010036636` 覆盖 resize/maximize 和中文对话；`1782010574985` 覆盖 PostMessage F11/fullscreen loading；`1782008820508`/`1782008910900`/`1782009003168` 覆盖 3 个真实 NPC 中文稳定对话；HUD smoke `1782011109661`、`1782011226733`、`1782011358737`、`1782011471208` 通过 |
| 05 | mission-atlantis | AS3 | 当前 build 封版基线通过；`1782015178827` 覆盖 resize/maximize 与中文对话；`1782015395985` 覆盖 PostMessage F11/fullscreen loading；`1782014515149`/`1782014590550`/`1782014753128` 覆盖 3 条真实剧情中文稳定对话；HUD smoke `1782016582947`、`1782016779009`、`1782016946794`、`1782017109548` 通过 |
| 06 | monkey-wrench | AS3 | 当前 build 封版基线通过；`1782019656438` 覆盖 resize/maximize 与中文对话；`1782021663340` 覆盖 PostMessage F11/fullscreen loading；`1782020113936`/`1782020195440`/`1782020541562` 覆盖 3 条真实剧情中文稳定对话；设置 `1782020668442` 和背包 `1782021205618` 通过；FTUE `mainLand` 不暴露商店/地图按钮，已记录为设计差异 |
| 07 | survival | AS3 | 当前 build 封版基线通过；`1782024946797` 覆盖 resize/maximize 与中文剧情对话；`1782027006669` 覆盖 PostMessage F11/fullscreen loading；`1782027406622`/`1782027601502`/`1782027689650` 覆盖 3 条中文剧情稳定对话；HUD smoke `1782027860270`、`1782028291170`、`1782028443657`、`1782028603276` 通过；NPC 自然热区/更多房间后续深测 |
| 08 | arabian-nights | AS3 | 当前 build 封版基线通过；`1782036700970` 覆盖 resize/maximize；`1782036333988`/`1782036503309` 覆盖窗口和 F11/fullscreen loading；`1782034402463`/`1782034488207`/`1782034573399` 覆盖 3 条真实中文 NPC 稳定对话；HUD smoke `1782031265590`、`1782031427653`、`1782031583317`、`1782031745867` 通过 |
| 09 | escape-from-pelican-rock | AS3 | 当前 build 封版基线通过；`1782039033401` 覆盖 resize/maximize/F11；`1782039314137`/`1782039474396` 覆盖窗口和 F11/fullscreen loading；`1782041030923`/`1782041218501`/`1782041576351` 覆盖 3 条真实中文剧情/NPC 稳定对话；HUD smoke `1782039730282`、`1782040006268`、`1782040688698`、`1782040849648` 通过 |
| 10 | galactic-hot-dogs | AS3 | 当前 build 封版基线通过；`1782072751029` 覆盖 resize/maximize/F11 视觉稳定；`1782068407206` 覆盖旧真全屏 loading，`1782073027690` 新 Shell 后观察到居中 loading 但自动化未进入 fullscreen-sized；`1782071166211`/`1782071563072`/`1782071930552` 覆盖 3 条真实中文剧情/NPC 稳定对话；HUD smoke `1782066981168`、`1782067146347`、`1782067304910`、`1782067473480` 通过；新 Shell 重点场景 smoke `1782072079682`、`1782072160180`、`1782072235409`、`1782072314003` 通过 |
| 11 | virus-hunter | AS3 | 当前 build 封版基线通过；`1782074363553` 覆盖 resize/maximize/F11 视觉稳定；`1782074683572` 覆盖 true fullscreen loading；`1782076303669`/`1782076399318`/`1782076596782` 覆盖 3 条真实中文 NPC 稳定对话；HUD smoke `1782074921756`、`1782075051207`、`1782075975053`、`1782075862106` 通过；MainStreet/PdcLab 回归 `1782076686386`、`1782076773714` 通过 |
| 12 | mocktropica | AS3 | 当前 build 封版基线通过；`1782077973966` 覆盖 resize/maximize/F11 和启动 loading；`1782079082704`/`1782079544614`/`1782079643385` 覆盖 3 条真实中文剧情对话稳定性；HUD smoke `1782078344230`、`1782078529579`、`1782078703877` 通过；MainStreet 回归 `1782077488309` 通过 |
| 13 | mystery-of-the-map | AS3 | 当前 build 封版基线通过；`1782084123056` 覆盖启动 loading、resize/maximize 与中文气泡稳定；`1782082091089` 覆盖 G32QC true fullscreen loading；`1782083205609`/`1782083306370`/`1782083410914` 覆盖 3 条真实中文剧情/NPC 稳定对话；HUD smoke `1782082400503`、`1782082615238`、`1782082841936` 通过；Jungle smoke `1782081438275` 通过 |
| 14 | early-poptropica | AS2 | 当前 build 封版基线通过；`1782087997744` 覆盖 AS2 地图打开、loading 居中、F11 稳定、视觉守卫和静音；`1782088417951` 覆盖 AS3 地图介绍中文；`1782087705505`/`1782087765988`/`1782087829923` 覆盖 3 条真实中文原生气泡；完整自然通关后续深测 |
| 15 | shark-tooth | AS2 | 当前 build 封版基线通过；`1782090320593` 覆盖 AS2 地图打开、loading 居中、F11 稳定、视觉守卫和静音；`1782092458415` 覆盖 AS3 地图介绍中文；`1782092019886`/`1782092069884`/`1782092117113` 覆盖 3 条真实中文原生气泡；完整自然通关后续深测 |
| 16 | 24-carrot | AS2 | 当前 build 封版基线通过；`1782095220343` 覆盖 AS2 地图打开、loading 居中、F11 稳定、视觉守卫和静音；`1782093999624` 覆盖 AS3 地图介绍中文；`1782094725769`/`1782094806248`/`1782094882172` 覆盖 3 条真实中文原生气泡；完整自然通关后续深测 |
| 17 | time-tangled | AS2 | 当前 build 封版基线通过；`1782100652713` 覆盖 AS2 地图打开、loading 居中、F11 稳定、视觉守卫和静音；`1782097615542` 覆盖 AS3 地图介绍中文；`1782099797488`/`1782099837988`/`1782099896495` 覆盖 3 条真实中文原生气泡；完整自然通关后续深测 |
| 18 | super-power | AS2 | 待开始 |
| 19 | spy | AS2 | 待开始 |
| 20 | nabooti | AS2 | 待开始 |
| 21 | big-nate | AS2 | 待开始 |
| 22 | astro-knights | AS2 | 待开始 |
| 23 | counterfeit | AS2 | 待开始 |
| 24 | reality-tv | AS2 | 待开始 |
| 25 | mythology | AS2 | 待开始 |
| 26 | skullduggery | AS2 | 待开始 |
| 27 | steamworks | AS2 | 待开始 |
| 28 | great-pumpkin | AS2 | 待开始 |
| 29 | cryptids | AS2 | 待开始 |
| 30 | wild-west | AS2 | 待开始 |
| 31 | wimpy-wonderland | AS2 | 待开始 |
| 32 | red-dragon | AS2 | 待开始 |
| 33 | shrink-ray | AS2 | 待开始 |
| 34 | mystery-train | AS2 | 待开始 |
| 35 | game-show | AS2 | 待开始 |
| 36 | ghost-story | AS2 | 待开始 |
| 37 | sos | AS2 | 待开始 |
| 38 | vampires-curse | AS2 | 待开始 |
| 39 | twisted-thicket | AS2 | 待开始 |
| 40 | poptropolis-games | AS2 | 待开始 |
| 41 | charlie-and-the-chocolate-factory | AS2 | 待开始 |
| 42 | wimpy-boardwalk | AS2 | 待开始 |
| 43 | lunar-colony | AS2 | 待开始 |
| 44 | super-villain | AS2 | 待开始 |
| 45 | zomberry | AS2 | 待开始 |
| 46 | night-watch | AS2 | 待开始 |
| 47 | back-lot | AS2 | 待开始 |

## 明确未完成

- 尚未证明所有 47 个岛从头到尾剧情通关。
- 尚未逐房间遍历所有内部房间。
- F11 真全屏已有 Reality TV/Poptropicon/Timmy/Mission Atlantis/Monkey Wrench/Survival/Arabian Nights/Escape from Pelican Rock/Virus Hunter/Mocktropica/Mystery of the Map 代表样本通过；Galactic Hot Dogs 视觉 F11 通过，但新 Shell 后 fullscreen-sized loading 复跑受 no-foreground 自动化限制，仍需补一轮；AS2 Mystery Train 主街已有 F11 尺寸门槛和人工稳定截图通过，Early Poptropica、Shark Tooth、24 Carrot、Time Tangled 当前 build 均已有 F11/no-blue/角色可见代表样本，但还不是 AS2 全岛覆盖。
- 加载条中心已有 AS3 1186x760、1450x900 窗口模式、AS3 Poptropicon F11 场景切换、Timmy 窗口/F11 loading、Reality TV 窗口/F11 loading、Mission Atlantis F11 loading、Monkey Wrench F11 loading、Survival F11 loading、Arabian Nights 窗口/F11 loading、Escape from Pelican Rock 窗口/F11 loading、Virus Hunter true fullscreen loading、Mocktropica 启动 loading、Mystery of the Map 启动/true fullscreen loading、Galactic Hot Dogs 旧 true fullscreen loading 与新 Shell 后居中 loading 观察样本，以及 AS2 Mystery Train、Early Poptropica、Shark Tooth、24 Carrot、Time Tangled loading 居中证据；尚未覆盖全部 AS2 F11/fullscreen loading、更多 AS3 场景和更多窗口尺寸。
- 跨岛 NPC 对话中文仍未全闭环；AS3 Timmy、Reality TV、Poptropicon、Monster、Mission Atlantis、Monkey Wrench、Survival、Arabian Nights、Escape from Pelican Rock、Galactic Hot Dogs、Virus Hunter、Mocktropica、Mystery of the Map 有可靠截图；AS2 Mystery Train `EdisonCabin`、Spy `SpyMain`、Early City2、Shark Mainstreet、Carrot Main Street 和 Time Lab 均已有原生中文气泡截图，但 AS2 全岛/全剧情对话仍未覆盖。
- Monster Carnival、Mission Atlantis、Monkey Wrench、Survival、Arabian Nights、Escape from Pelican Rock、Galactic Hot Dogs、Virus Hunter、Mocktropica、Mystery of the Map、Early Poptropica、Shark Tooth、24 Carrot 和 Time Tangled 当前 build 封版基线已闭合；自然剧情路径、普通 NPC 热区/更多深海/更多 FTUE/Survival/Arabian/Prison/GHD/Virus/Mocktropica/Viking/Early/Shark/Carrot/Time 更多房间和全流程仍未全审。
- 按钮居中已有 Poptropicon、Timmy、Reality TV、Monster Carnival、Mission Atlantis、Survival、Arabian Nights、Escape from Pelican Rock、Galactic Hot Dogs、Virus Hunter、Mocktropica、Mystery of the Map 的背包/地图/商店确认框/设置面板首批证据；Monkey Wrench 已有设置/背包证据但 FTUE `mainLand` 不暴露商店/地图按钮；Early Poptropica、Shark Tooth、24 Carrot 已有 AS3 地图弹窗 `重新开始/开始` 和 AS2 HUD/MENU 稳定样本；全岛屿/全部面板仍未系统审计。
- AS3 原生箭头/导航/native label 当前扫描范围已完成；AS2 native label 和静态资产替换清单未完成。
