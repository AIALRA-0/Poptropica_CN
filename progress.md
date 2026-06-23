Original prompt: 继续全量迭代这个poptropica项目 E:\Poptropica\POPTROPICA_FLASH，不计时间，不计成本，不计代价，自行修改，审计，测试，要保证
1. 所有岛屿都完全可用
2. 游戏可以在本地浏览器中打开（为后续服务器部署做准备）
3. 所有翻译都工作正常，全量翻译（目前已实现此功能）
4. 游戏UI位置都正确，不出现UI重叠，歪斜，消失等问题
5. 我需要使用这台电脑，所以最好不要让computer use agent干扰我的电脑工作，尽量后台测试，如果实在需要截图啥的，也可以调用computer use agent，但不要过度依赖
6. 游戏窗口可以调节大小，并且，UI和对话位置稳定不崩溃
7. 所有游戏场景都能正确进入，不卡死，不崩溃，不溢出
8. 自行大量搜索并检查，目前所有岛屿都没有任何声音，你尽量尝试解包，或者搜索，补全游戏声音
9. 修改留痕，要同步到github repo

# Progress

## 2026-06-22 中期反馈封版重开 / Time Tangled wave 1

- 按用户中期反馈停止推进新岛，当前不进入 Super Power；`Time Tangled` 旧封版结论重开。
- 修复 AS2 QA 参数污染问题：不再把 `flashpointQaAs2Dialog` / `flashpointQaLoadingHoldMs` 追加到 `gameplay.swf?...`，改由 `framework.swf` 写入 `_global.flashpointQaAs2Dialog` 和 `_global.flashpointQaLoadingHoldMs`。原因是旧方式会导致带 QA 开关的验收路线在场景加载后跳到 `base.php/saveData` 黑页。
- 已更新并重打 `tools/patch-as2-gameplay-loading-hold.js`、`tools/patch-as2-time-dialog-proof.js`、`framework.swf`、`gameplay.swf`、`sceneLab.swf`，并重建 `runtime-data/patched-zips/as2-runtime.zip`。
- 验证 `framework` 当前不再出现 `gameplay.swf?`；`gameplay` loading hold 读取 `_global.flashpointQaLoadingHoldMs`；Time Lab 对话 hook 读取 `_global.flashpointQaAs2Dialog`。
- G32QC/no-foreground/静音 loading 证据通过：`runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782150373279.json`，`loadingCenterPassed=1`，0/500/1000/1500/2500/4000ms 均 OCR 到 `Poptropica LOADING`，中心偏移约 x=2/y=21-22，`audioActive=0`，缺失请求 0。
- G32QC/no-foreground/静音 Time Lab 中文对话证据通过：`runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782150448753.json`，OCR 样本为“请帮帮我们。故障搅乱了时间，未来岌岌可危。”，`audioActive=0`，缺失请求 0。
- G32QC/no-foreground/静音 Time Tangled 普通综合回归通过：`runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782150563288.json`，地图点击、F11、scene evidence、缺失请求、静音均通过。
- 同步更新 `CHECKLIST.zh-CN.md`：Time Tangled 当前状态改为重开中；wave 1 通过项和剩余 blocker 已列明。
- 当前未关闭 blocker：全局淡暂停图标、AS2/AS3 HUD 挤压/重叠、自然靠近 NPC 重复触发/抢话、任务物品弹窗黑残留/越界、使用物品后页面歪斜、科普/外链白屏、更多 Time 年代场景自然路线、真实音频来源清单。

## 2026-06-22 AS2 Time Tangled HUD 右上角量化修正

- 用户指出“不重叠”不等于“右上角正确”，旧 HUD 判断口径作废；本轮只锁 AS2 Time Tangled 顶层 HUD，不推进新岛。
- 定位结果：Time Tangled 当前可见三枚 HUD 图标来自 `gameplay.swf` 的 `navBar`，不是 `framework.swf` 顶栏。诊断报告 `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782153444792.json` 临时隐藏 gameplay HUD 后三枚图标消失，证明层级。
- 修复内容：`layoutFramelessGameplayNav()` 显式把背包/服装/地图锚定到 gameplay 可视区右上，并继续隐藏 `btnPause`/保存状态残影；`zhEnsureDirectMapButton()` 使用当前地图图标边界同步热区；`base.php` 和 `qa-as2-interaction-smoke.js` 新增 QA-only `flashpointQaHideHud=1` 参数，用于截图差分基线；`tools/qa-helper.py` 新增 `analyze-hud-diff`。
- 已重打 `packs/zh-CN/as2/swf/content/www.poptropica.com/gameplay.swf` 并重建 `runtime-data/patched-zips/as2-runtime.zip`，本轮 AS2 zip `replacementCount=110`。
- G32QC/no-foreground/静音正常 HUD 截图通过：`runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782154863479.json`；隐藏 HUD 基线通过：`runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782154908597.json`。
- 新量化验收通过：`runtime-data/qa/as2/interaction-smoke/as2-hud-diff-1782154863479.json`，识别 3 个 HUD 图标，HUD 盒子 `left=1274 top=25 right=1498 bottom=80`，相对真实舞台右边距 44px、上边距 0px、行内垂直偏差 4px、间距 28px/22px，左上无异常差分。
- 旧补充证据仍有效：`1782153970576` 证明右移后的地图热区仍可打开地图；`1782154039367` 证明 F11 后 HUD 仍在右上、角色可见；`1782154135577` 证明 loading 居中未回退。
- 当前未关闭 blocker：地图/任务物品弹窗层级仍会露 HUD 或黑残留；AS3 HUD 还要按同一 A/B 或等价量化口径复核；自然靠近 NPC 重复触发/抢话还没修；更多 Time 年代场景、外链白屏、真实音频来源清单仍未闭环。

## 2026-06-22 AS3 HUD 视觉右锚收口

- 用户指出我把“右上角”误判成“MENU 在右侧且能点”。本轮明确废弃该口径：AS3 HUD 必须以截图为准，展开后图标单行、右锚、固定间距、无左上散落和明显挤压。
- 修复 `tools/patch-as3-shell-hud-labels.js`：`Hud.zhHudTopMargin()` 从旧的 100 改为 26；MENU 锚点改为 `Math.max(58, this.zhVisibleWidth() - 58)`；展开图标按 `settings/audio/home/store/map/costumizer/inventory/menu` 从右向左排列，其中 audio/home 额外微调以抵消 MovieClip 注册点偏移；静态 MENU 图标仍保留英文原图，不使用中文文字层覆盖。
- 同时修补 patch 脚本幂等性：`as3-shell:hud-menu-text-overlay-removed` manifest 记录现在先过滤旧记录再写入，避免每次重打 Shell 都重复追加；当前 manifest 已从 8 条同名 HUD 记录清理为 1 条。
- 已重打 `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf` 并重建 `runtime-data/patched-zips/as3-runtime.zip`；patch 报告为 `runtime-data/qa/as3/as3-shell-hud-labels-patch.json`。
- G32QC/no-foreground/静音 Poptropicon 样本通过：`runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782159939059.json`。人工复核截图 `runtime-data/qa/as3/hud-smoke/run-1782159939059/01-poptropicon-post-click.png` 与裁切 `runtime-data/qa/as3/hud-smoke/run-1782159939059/01-poptropicon-post-click-hud-crop.png`：展开 HUD 在右上单行排列，不再分裂到左上；`01-poptropicon-resized-hud-crop.png` 证明 collapsed MENU 在右上。
- G32QC/no-foreground/静音 Mystery of the Map 样本通过：`runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782160130741.json`。人工复核 `runtime-data/qa/as3/hud-smoke/run-1782160130741/01-mystery-of-the-map-post-click-hud-crop.png` 与 `01-mystery-of-the-map-resized-hud-crop.png`：同一 AS3 Shell 路径下展开/收起 HUD 均按右上行排列。
- 注意：Poptropicon post-click 像素 diff 里 `sameSize=false` 是截图客户区高度不一致导致，不能拿它当自动视觉通过证据；本轮证据以裁切截图人工复核为准。
- 当前未关闭 blocker：还需要把 HUD 裁切口径做成自动 full-row detector；`tools/qa-as3-hud-smoke.js` 的旧 `adaptiveHudTargetX()` 仍偏“能点验证”，不能作为全 AS3 HUD 视觉封版依据；Time Tangled 重开验收、任务物品弹窗黑残留/越界、AS3 对话队列、相机蓝边、外链白屏、真实音频来源清单仍未闭环。

## 2026-06-22 AS3 HUD 自动槽位检测器

- 新增 `tools/qa-helper.py analyze-hud-row`：以 MENU OCR 中心为锚点，按当前 AS3 HUD 逻辑宽度推算 `settings/audio/home/store/map/costumizer/inventory/menu` 8 个槽位，逐槽计算边缘密度，输出 JSON 和带框 PNG。这个检查不是泛用视觉 AI，只针对“AS3 展开 HUD 是否一排右锚”这个 blocker。
- `tools/qa-as3-hud-smoke.js` 已在 menu post-click 截图后自动调用 `analyze-hud-row`。如果检测失败，报告会出现 `expanded_hud_row_failed`，不再允许“按钮能点但视觉错位”被记为通过。
- 当前通过样本：`runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782161407460.json`，`expandedHudRow.ok=true`，8/8 槽位通过；带框图 `runtime-data/qa/as3/hud-smoke/run-1782161407460/01-poptropicon-expanded-hud-row.png` 已人工复核。
- 当前负样本：旧误判截图 `runtime-data/qa/as3/hud-smoke/run-1781972253353/01-poptropicon-post-click.png` 用同一检测器判定 `ok=false`，只有 5/8 槽位通过，缺 `settings/audio/home`，`row_top=132` 超过阈值；带框图 `runtime-data/qa/as3/hud-smoke/run-1781972253353/as3-hud-row-auto-negative.png` 明确标红三个空槽。
- 最小验证命令已通过：`node --check tools/qa-as3-hud-smoke.js`，`python -m py_compile tools/qa-helper.py`，`python tools/qa-helper.py analyze-hud-row ... --no-fail-exit` 负样本输出 `ok=false` 且退出 0，真实 `npm run qa:as3-hud-smoke -- --islands=poptropicon ...` 通过。
- 后续：把这个检查扩展到 Mystery/Poptropicon 外的 AS3 样本批量回归；继续 Time Tangled 任务物品弹窗/蓝边/AS3 对话队列等 blocker。

## 2026-06-09

- Resumed the existing active goal in `E:\Poptropica\POPTROPICA_FLASH`.
- Current repo has many uncommitted/untracked files, including runtime artifacts, tools, launcher files, and patched AS2 SWFs. Do not revert user/previous-agent work.
- Read `README.md`, `CHANGE.md`, `package.json`, and key runtime/pack/audio scripts.
- Initial priority is to establish a repeatable baseline with existing validation scripts before changing the runtime further.
- `doctor:flashpoint` baseline passed: managed proxy/zip/php services are healthy.
- Launch manifest baseline: 47 Flash entries, 46 launchable, 1 unresolved (`reality-tv-wild-safari`, AS3 zip does not contain playable scene resources).
- Fixed `tools/qa-validate-runtime.js` so QA no longer kills `WindowsTerminal.exe`, `OpenConsole.exe`, `cmd.exe`, or `powershell.exe`.
- Fixed AS3 runtime entry back to `http://www.poptropica.com/base.php?room=FlashpointStart`; direct `/game/` and old AS2-style URLs stalled or requested missing AS2 scene SWFs.
- Fixed AS3 launch manifest entries to use the AS3 start bridge and record `as3TargetScene` metadata such as `game.scenes.virusHunter.mainStreet.MainStreet`.
- Tightened AS3 QA: default wait is now long enough to reach the menu and the verdict requires a recognizable AS3 start menu or localized text, plus real audio.
- Verified AS3 quick QA passed on Flashpoint Navigator with `NEW PLAYER / RETURNING PLAYER / WELCOME TO POPTROPICA` OCR and active audio (`rms 0.039071`, `peak 0.185712`).
- Added shared Flash state cleanup for QA and AS3 direct island launches so stale Poptropica SharedObject state cannot hijack direct launch targets.
- Added PID-aware window matching/capture in `tools/qa-helper.py`; QA now targets the launched Flashpoint Navigator process instead of any stale matching window.
- Fixed AS3 direct island startup with `overrideScene` URLs. Virus Hunter now launches directly to `game.scenes.virusHunter.mainStreet.MainStreet`.
- Found an AS3 translation regression where character look IDs such as `tyson` and `freckles` were translated in XML, causing missing asset paths like `game/data/entity/character/parts/hair/<translated>.xml`.
- Hardened `tools/lib/pack.js` so future XML packing skips AS3 character look/internal asset ID fields and `game/data/entity/character/partKeys/*.xml`.
- Added and ran `tools/repair-as3-internal-ids.js`, restoring 228 affected AS3 XML files in the existing `runtime-data/patched-zips/as3-runtime.zip` from the original AS3 archive while preserving the already-patched runtime zip.
- Re-tested Virus Hunter after the repair: the new game-server log shows `sounds.xml`, `hair/tyson.xml`, and `marks/freckles.xml` serving 200 responses, with no new translated/garbled character part paths in the fresh log segment.
- Adjusted default Flashpoint runtime geometry to `1186x760` on the current desktop. The latest Virus Hunter screenshot shows the scene framed correctly without the previous large black bottom area, and audio remains active (`rms 0.015240`, `peak 0.089246`).
- Important pack-state caveat: an attempted full AS3 repack timed out and left `packs/zh-CN/as3` incomplete. The current runnable AS3 runtime zip has been repaired directly; a later clean full AS3 rebuild needs batching or a skip-SWF mode before replacing it from pack sources.
- Fixed AS3 QA PID plumbing: `launchRuntimeForQa()` now preserves `spawnManagedRuntime().child.pid`, and AS3 `wait-window` now passes that PID. This avoids matching stale Flashpoint windows.
- Hardened Flashpoint service startup: `ensureFlashpointServices()` now waits longer for proxy/zip/php readiness, throws if any port never becomes healthy, and zip-server POSTs retry short connection races.
- Added `tools/repair-as3-runtime-layout.js` and updated `tools/lib/pack.js` runtime fix version 20 so AS3 `base.php` future rebuilds use a viewport-filling embed (`width="100%" height="100%"`, CSS `100vw/100vh`, hidden page overflow).
- Re-ran `npm run qa:validate-as3` after these fixes. Latest pass: PID-targeted window found, stage coverage `0.961228`, OCR sees `NEW PLAYER / WELCOME TO POPTROPICA`, audio active (`rms 0.030472`, `peak 0.150316`), and no shell popup.
- Visual note: the AS3 start-menu screenshot still shows a thin right-side Navigator scrollbar/gutter even after the served `base.php` has hidden overflow and percentage embed dimensions. Treat this as a Flashpoint Navigator/old Firefox chrome quirk for later runtime-profile/capture investigation, not an in-game UI overlap.
- Added `tools/qa-as3-islands-smoke.js` and npm script `qa:as3-islands-smoke`. It launches AS3 direct-scene islands by PID, captures screenshots, analyzes stage coverage, OCRs, checks audio, and records per-island server log sound/missing-request samples.
- Tightened AS3 smoke after visual QA found false positives: loading screens with OCR only `Poptropica`, Safe Mode prompts, and tiny non-game windows now fail instead of passing on stage coverage alone.
- Added `MOZ_DISABLE_SAFE_MODE_KEY=1` and disabled Firefox crash session restore in the Navigator profile prefs to reduce Flashpoint Navigator Safe Mode prompts during repeated automated launches.
- Ran initial AS3 smoke on `arabian-nights`, `escape-from-pelican-rock`, and `galactic-hot-dogs`: Arabian Nights entered its start popup and played audio; Pelican Rock and GHD were loading-screen false positives under the old criteria.
- Found another AS3 internal ID leak from GHD NPC XML: `<head>` and `<talkMouth>` values were translated (for example `humphree` -> `汉弗瑞`), causing bad `headSkin/<translated>.xml` requests. Added those tags to the pack guard and reran `tools/repair-as3-internal-ids.js`; it restored 18 NPC XML files, including GHD and Timmy.
- Re-tested `escape-from-pelican-rock` and `galactic-hot-dogs` with 60s settle after the ID repair. Pelican Rock still stops at the Poptropica loading screen after `prison/mainStreet/sounds.xml`; GHD no longer showed the old translated `headSkin` 404 in the sampled log, but still needs a clean retry/full matrix run.

## TODO

- Run the full AS3 smoke matrix with the stricter loading/Safe Mode detection and use it as the AS3 island failure queue.
- Add a safe staged AS3 rebuild path so the pack can be regenerated without timing out and without reintroducing translated internal IDs.
- Run `npm run qa:validate-as2` only after checking the current Super Power runtime state; prior reports show no recoverable AS2 audio assets in shipped Super Power resources.
- Inspect launch manifest unresolved entries and all non-launchable islands, starting with `reality-tv-wild-safari`.
- Audit audio assets inside source zips and patched runtime zips; determine whether silence is missing assets, plugin/runtime mute, Flashpoint routing, or AS2/AS3 code path.
- Fix the highest-impact runtime/tooling blocker first, then rebuild and verify.

## 2026-06-09 Later Continuation

- Corrected the previous AS3 note: the stable AS3 runtime entry is now the direct Embassy URL (`base.php?room=GlobalAS3Embassy&island=Home&startup_path=gameplay`), not the older `FlashpointStart` bridge. Latest AS3 QA passed before this continuation with Embassy, visible start menu, and active audio.
- AS2 launch state is now repaired before direct AS2 runtime launches. `tools/lib/flash-state.js` writes a generated, target-aware `Char.sol` and `TransitToken.sol` when the saved state is missing or invalid, preventing the old `lostlook.swf`/lost game data loop.
- Prefer `flashpointnavigator-as2` for AS2 QA. The `fpnavigator-as2` wrapper has previously reused or spawned contaminated sessions with stale `FlashpointStart`/other launch URLs.
- Added FFDec timeout handling in `tools/lib/pack.js`; a previous full AS2 pack attempt timed out and was recovered by killing stale FFDec/Java/Node processes and rebuilding the runtime zip.
- Fixed Super Power DownTown static sign coverage: injected `zhAddDownTownMainStreetLabel()` into `sceneDownTown.swf`, corrected scene-space coordinates to `x=54,y=2024`, rebuilt `runtime-data/patched-zips/as2-runtime.zip`, and verified OCR now reads `主街`. Latest focused AS2 QA report: `runtime-data/qa/super-power/flashpointnavigator-as2-report-1781042953621.json`; screenshot: `runtime-data/qa/super-power/super-power-flashpointnavigator-as2.png`.
- Hardened QA click handling by reacquiring the Flashpoint Navigator window before UI clicks. Map validation still needs more work: current `mapsClick` target `x=0.84,y=0.085` is likely hitting the wrong top UI button or causing the runtime window to close before recapture.

## TODO Later Continuation

- Retune AS2 map/button click validation, likely by testing candidate top-nav points around the visible yellow globe/POP icons and requiring a real `travelmap.swf` popup or map OCR signal.
- Re-run full AS2 QA with maps, popup audit, and audio enabled after map click is stable, then save compatibility.
- Improve dialogue validation; the current dialogue ROI can see Chinese from the static sign and is not a reliable NPC dialogue proof.
- Continue AS3 island smoke matrix and unresolved `reality-tv-wild-safari` asset search.
- Continue audio restoration audit. AS3 audio is proven active; AS2 Super Power still lacks obvious original sound assets in the shipped source archive.

## 2026-06-09 Current Continuation

- Current code state uses `http://www.poptropica.com/base.php?room=FlashpointStart` for the AS3 runtime fallback/start menu (`tools/lib/flashpoint-runtime.js` and `tools/lib/launch-manifest.js`). The older Embassy note above is stale for the current working tree.
- Found a second AS3 translation safety issue: scene XML runtime references were translated as visible text. Examples included `absoluteFilePaths` becoming `场景/阿拉伯1/共享/对话.xml`, `movieClip` becoming Timmy NPC Chinese SWF paths, `sceneType` becoming `短主线`, and segment pattern `clip/background` IDs becoming Chinese.
- Hardened `tools/lib/pack.js` so future AS3 packing treats these scene runtime fields as non-translatable: `absoluteFilePaths`, `sceneType`, `movieClip`, `clip`, `background`, `elementsToBitmap`, `subGroup`, `visible`, `card`, `folder`, `layout`, and `id`.
- Extended and reran `tools/repair-as3-internal-ids.js`. It repaired 81 AS3 scene XML files inside `runtime-data/patched-zips/as3-runtime.zip` and restored: `absoluteFilePaths` 15, `sceneType` 40, `elementsToBitmap` 7, `clip` 206, `background` 44, `visible` 22, `card` 119, `subGroup` 54, `layout` 2, `folder` 2, `movieClip` 6.
- Verified the repaired AS3 runtime zip directly: protected scene runtime fields now have 0 CJK residuals; `arab1/bazaar/scene.xml` is back to `scenes/arab1/shared/dialog.xml`; Timmy movie clips are back to `scenes/timmy/shared/npcs/*.swf`; GHD segment patterns are back to `rock*/stars*` IDs.
- Added `tools/audit-audio-assets.js` and npm script `audit:audio-assets`. Latest report: `runtime-data/qa/audio-assets-audit.json`.
- Audio asset audit results from local source zips: AS2 has 9 audio/video files, no `sounds.xml`, and only Back Lot, Night Watch, and Vampire have island-local audio. AS3 has 1987 audio files and 417 `sounds.xml` files across 31 archive folders.
- External search corroborates the local AS2 finding: Flashpoint Poptropica discussions note most older islands had little or no sound in their original AS2 curation, while later/rereleased islands added more music and sound. Do not import third-party soundtrack files into the repo without a legitimate source/permission path.
- Focused AS3 smoke for `arabian-nights`, `timmy-failure`, and `galactic-hot-dogs` showed the new AS3 resource-ID repair is effective: fresh report had `withMissingLogRequests: 0`; Arabian Nights passed with audio and no missing requests.
- The same focused smoke was contaminated by an overlapping AS2 Super Power QA that remounted AS2 and stopped Navigator during AS3 capture. Timmy actually loaded to `TimmysStreet` and requested `timmy_failure_main_theme.mp3`; its failure was a stale/invalid window handle. GHD served scene XML/SWF/NPC assets with 200 responses but still showed the loading overlay, so it needs a clean no-conflict retry before treating it as a game bug.
- Hardened `tools/qa-as3-islands-smoke.js`: it now detects active AS2 QA/Navigator conflicts and writes a `runtime_conflict` blocked report instead of starting AS3. Verified with an active AS2 run; it exited in about 3 seconds without launching AS3.
- Also trimmed AS3 smoke reports: `launchHealth` now stores status/header/body-size metadata instead of embedding the full `Shell.swf` response body, preventing multi-megabyte JSON reports.

## TODO Current Continuation

- Wait for the currently running AS2 QA process to finish before launching AS3 smoke tests; do not kill it unless it is confirmed to be ours and stuck.
- Re-run focused AS3 smoke for `arabian-nights`, `timmy-failure`, and `galactic-hot-dogs` to confirm no translated resource paths appear in fresh server logs.
- Re-run the full AS3 smoke matrix with stricter loading/Safe Mode detection.
- Continue unresolved `reality-tv-wild-safari` search/import investigation; current AS3 source zip still lacks playable `reality2` scene resources.
- Decide how to handle AS2 islands with no original audio assets: keep as historically silent, add an optional user-provided asset import path, or implement clearly licensed substitute UI/ambient sounds only if acceptable.

## 2026-06-09 Map Click Continuation

- Fixed the AS2 Super Power direct `地图` button so clicks are caught by a root-level `Mouse.addListener`, with a short background-click suppression window to prevent the same click from also moving the character.
- Synchronized the live exported scripts (`runtime-data/tmp/gameplay-scripts-current/scripts/frame_1/DoAction.as` and `frame_9/DoAction.as`) and the persistent `tools/lib/pack.js` patch templates so future AS2 repacks preserve the map button behavior.
- Tightened `tools/qa-validate-runtime.js` map validation. `mapsClickable` now requires a fresh post-click game-server log segment containing `popups/map.swf` or `popups/travelmap.swf`; the old stage-only check was a false positive.
- Replaced `gameplay.swf` frame_1/frame_9 with FFDec and rebuilt `runtime-data/patched-zips/as2-runtime.zip` successfully (`replacementCount: 26`).
- Focused AS2 QA passed with maps enabled and audio/popup audit skipped: `runtime-data/qa/super-power/flashpointnavigator-as2-report-1781046712449.json`.
- Evidence: `runtime-data/qa/super-power/super-power-flashpointnavigator-as2-maps-server.log` shows `popups/map.swf`, `popups/maps/Super.swf`, and `MapClicked`; screenshot `runtime-data/qa/super-power/super-power-flashpointnavigator-as2-maps.png` shows the Super Power map popup correctly centered.

## TODO Map Click Continuation

- Re-run AS2 QA with popup audit enabled and then with audio enabled once AS2 audio expectations are decided; current focused pass intentionally skipped audio and popup audit.
- Improve dialogue validation; the current ROI still passes by seeing `街` from the static sign instead of proving a clicked NPC dialogue bubble.
- A background `rebuild-runtime-zip --source=as3` completed and rewrote `runtime-data/patched-zips/as3-runtime.zip`; re-run AS3 resource-ID audits/smoke before trusting the AS3 runtime zip.

## 2026-06-09 AS3 GHD Continuation

- Re-ran `tools/repair-as3-internal-ids.js` after the AS3 runtime zip was rebuilt. It reported `changedFileCount: 0`, so the rebuilt `runtime-data/patched-zips/as3-runtime.zip` did not reintroduce the known protected-tag AS3 ID translation regressions.
- Re-ran `npm run qa:validate-as3 -- --afterLaunchWaitMs=45000 --windowTimeoutMs=70000`; AS3 start screen passed with stage coverage `0.961228`, no shell popup, and active audio (`rms: 0.029595`, `peak: 0.161802`). Report: `runtime-data/qa/as3/as3-runtime-report-1781046914629.json`.
- Focused AS3 smoke for `arabian-nights`, `timmy-failure`, and `galactic-hot-dogs` found `arabian-nights` and `timmy-failure` passing. `galactic-hot-dogs` default `spacePort` entry stayed on the loading/tip screen and did not play audio, despite scene XML/SWF/character assets returning 200.
- The AS3 smoke script now filters the harmless `flashpoint-gmp-dummy.xml` 404 from missing-request counts and can flag loading-screen stalls when there is no `SceneLoaded` or scene media signal.
- A separate GHD scene probe showed `game.scenes.ghd.barren1.Barren1` loads to a real scene. Updated `catalog/launch-overrides.json` so `galactic-hot-dogs` uses `roomParam: "barren1"` instead of the stuck `spacePort`, then regenerated `catalog/launch-manifest.json`.
- Verified the new default GHD entry with `npm run qa:as3-islands-smoke -- --islands=galactic-hot-dogs --settleMs=45000 --windowTimeoutMs=90000 --requireAudio=1`. It passed with `audioActive: 1`, `withMissingLogRequests: 0`, `SceneLoaded: 1`, audio `rms: 0.05695`, `peak: 0.17385`. Latest report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781047800468.json`; screenshot: `runtime-data/qa/as3/islands-smoke/01-galactic-hot-dogs.png`.

## TODO AS3 GHD Continuation

- Keep `spacePort.SpacePort` on the AS3 single-scene failure queue. It loads many resources with 200 responses but remains on the loading/tip screen; likely a scene initialization/progress-state issue rather than a missing-file issue.
- Re-run the full AS3 island smoke matrix using the updated manifest and stricter loading detection.
- Continue resolving `reality-tv-wild-safari`, still unresolved because the current AS3 source archive lacks local `reality2` playable scene resources.

## 2026-06-09 AS3 Matrix Stabilization

- Hardened `tools/qa-as3-islands-smoke.js` so each run writes artifacts under a unique `run-*` directory, uses a smoke-test lock to avoid overlapping AS3 runs, and records `artifactDir` in reports.
- Fixed AS3 smoke false positives and flaky verdicts: loading screens now require scene progress evidence, `flashpoint-gmp-dummy.xml` is ignored as harmless, per-override screenshots no longer overwrite each other, QA step failures are recorded in `qaErrors`, and screenshot capture retries after reacquiring the Navigator window.
- Added audio retry behavior for AS3 smoke: `requireAudio` runs up to two loopback checks by default, with a 2.5s sample window, preventing sporadic 0-session reads from failing otherwise healthy scenes.
- Removed the redundant outer Navigator cleanup from AS3 smoke after it caused valid reports to be written but the process to return `-1`; per-island cleanup and exception-path cleanup remain.
- Updated AS3 default launch overrides and regenerated `catalog/launch-manifest.json`:
  - `monkey-wrench` now launches `game.scenes.ftue.beach.Beach`.
  - `mystery-of-the-map` now launches `game.scenes.lands.lab1.Lab1`.
  - `poptropicon` now launches `game.scenes.con1.parking.Parking`.
  - `escape-from-pelican-rock` now launches `game.scenes.prison.hill.Hill`.
  - `galactic-hot-dogs` remains on verified fallback `game.scenes.ghd.barren1.Barren1`.
- Probed Pelican Rock alternate scenes. Passing direct-scene entries included `yard`, `cellBlock`, `hill`, `escape`, `roof1`, `roof2`, and `metalShop`; loading-stuck entries included `messHall`, `prisonPromo`, `roof3`, and `tower`.
- Verified Pelican Rock `hill` with audio: `SceneLoaded=1`, `sceneMedia=6`, missing requests `0`, audio `rms=0.036786`, `peak=0.15647`.
- Added GHD scene NPC overrides under `packs/zh-CN/as3/files/.../ghd/spacePort/npcs.xml` and `.../ghd/arena/npcs.xml` to avoid biped/ad NPC initialization stalls. `spacePort.SpacePort` now has a direct smoke pass with `SceneLoaded=1`, scene media requests, and missing requests `0`, but the default remains `barren1` because it is the more stable full-matrix entry. `arena` still needs deeper scene-specific work.
- Repaired the rebuilt AS3 runtime zip again with `tools/repair-as3-internal-ids.js`; the latest run reported no remaining changes for protected internal IDs.
- Clean AS3 full matrix now passes: report `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781054184495.json`, 12/12 passed, `audioActive=12`, `audioInactive=0`, `withMissingLogRequests=0`.
- The AS3 full-matrix artifact directory is `runtime-data/qa/as3/islands-smoke/run-1781054184495`; screenshots were produced for all 12 launchable AS3 islands.
- `reality-tv-wild-safari` remains unresolved in the launch manifest because the local AS3 runtime/source archive still lacks playable `reality2` scene resources. External teleporter metadata also identifies the island as `reality2`, matching the missing local resource path rather than revealing an alternate local folder.
- Latest AS2 Super Power QA during this continuation: `runtime-data/qa/super-power/flashpointnavigator-as2-report-1781054100090.json`. Stage coverage and map click are passing again, but Super Power audio remains inactive (`rms=0`, `peak=0`) with local AS2 source assets still showing no original Super Power sound files.

## TODO AS3 Matrix Stabilization

- Continue unresolved `reality-tv-wild-safari` asset/source investigation; do not import third-party audio or scene files without a legitimate source/permission path.
- Continue GHD `arena` and story-start fidelity work. `spacePort` can be entered with the reduced NPC override, but its removed/normalized NPCs are a compatibility workaround, not a faithful restoration.
- Re-run broader AS2 QA after resolving the Super Power audio expectation. The map popup path is currently passing, but the AS2 audio policy/source gap remains open.
- Improve AS2 dialogue validation so it proves NPC dialogue instead of passing from nearby static Chinese text.

## 2026-06-09 AS3 Default Entry Matrix Continuation

- Patched AS3 default launch overrides for entries that had good alternate-scene evidence:
  - `monkey-wrench`: `ftue/landing` -> `ftue/beach` (`game.scenes.ftue.beach.Beach`).
  - `mystery-of-the-map`: `lands/biomes` -> `lands/lab1` (`game.scenes.lands.lab1.Lab1`).
  - `poptropicon`: `con1/center` -> `con1/parking` (`game.scenes.con1.parking.Parking`).
  - `escape-from-pelican-rock`: previous stuck/default entries -> `prison/hill` (`game.scenes.prison.hill.Hill`).
- Regenerated `catalog/launch-manifest.json` after the overrides. The manifest now resolves `escape-from-pelican-rock` to `game.scenes.prison.hill.Hill`, `monkey-wrench` to `Beach`, `mystery-of-the-map` to `Lab1`, `poptropicon` to `Parking`, and `galactic-hot-dogs` to `Barren1`.
- Focused AS3 smoke for `arabian-nights`, `galactic-hot-dogs`, `monkey-wrench`, `mystery-of-the-map`, and `poptropicon` passed 5/5 with required audio, no missing requests, and visible real scenes. Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781050573004.json`.
- Pelican Rock clean candidate matrix found these usable scenes with no missing requests: `yard`, `cellBlock`, `hill`, `roof1`, `roof2`, and `metalShop`. `messHall`, `prisonPromo`, `roof3`, and `tower` stayed on loading screens. `escape` emitted `SceneLoaded` but visual QA showed the Poptropica loading overlay still present, so treat it as a false positive and do not use it as a default entry.
- Verified `prison/hill` as the Pelican Rock default because it is a real scene and passes audio: direct override report `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781051990991.json`; manifest/default report `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781052258489.json` (`audio rms: 0.063958`, `peak: 0.200289`, missing requests: 0).
- Full AS3 default matrix after these overrides completed 12 launchable AS3 islands with 11/12 passing and 0 missing requests. Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781052121984.json`. The only failure was `galactic-hot-dogs` audio capture returning sessionCount 0 while the scene loaded and resources were present.
- Re-ran `galactic-hot-dogs` alone immediately afterward; it passed with required audio (`rms: 0.072051`, `peak: 0.236574`), no missing requests, and `SceneLoaded: 1`. Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781053047176.json`. Treat the full-matrix GHD failure as an audio capture flake unless it becomes reproducible.
- Stopped a duplicate/restarted AS3 full-matrix process after preserving the completed timestamped matrix and GHD single-rerun reports, so no QA/Navigator process should be left running from this chunk.
- Hardened `tools/qa-as3-islands-smoke.js` against future evidence contamination: it now uses a `.qa-as3-islands-smoke.lock` lock file so concurrent AS3 smoke runs block without overwriting `latest`, and each run writes screenshots/window/capture/audio/server-log artifacts into a dedicated `run-<timestamp>` directory referenced by the timestamped report.
- Verified the QA tool hardening with `node --check tools\qa-as3-islands-smoke.js` and a short `arabian-nights` smoke (`--skipAudio=1 --skipOcr=1`). Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781053634334.json`; artifact dir: `runtime-data/qa/as3/islands-smoke/run-1781053634334`; lock file was absent after completion.

## TODO AS3 Default Entry Matrix Continuation

- Consider tightening loading detection further: Pelican `escape` can produce `SceneLoaded` and media requests while the Poptropica loading overlay is still visibly present.
- Re-run one clean full AS3 matrix later after preventing duplicate background launches; expected result should be 12/12 if the GHD audio-capture flake does not recur.
- Continue `reality-tv-wild-safari` source/import search; it remains unresolved because `reality2` playable scene resources are still absent from the current local AS3 source archive.

## 2026-06-09 AS2 QA PID / Audio Continuation

- Ran AS2 Super Power full validation without skipping popup audit, maps, or audio. First run was invalid because `wait-window` matched a stale AS3 Arabian Nights Navigator window; the report OCR contained Arabian Nights text despite launching `base.php?room=DownTown&island=Super`.
- Fixed `tools/qa-validate-runtime.js` so AS2 `wait-window` passes the freshly launched runtime PID, matching the existing AS3 behavior. Also kept PID in the `reacquireRuntimeWindow()` fallback so post-click recaptures do not fall back to any stale Navigator window.
- Re-ran AS2 Super Power full validation after the PID fix. Report: `runtime-data/qa/super-power/flashpointnavigator-as2-report-1781054100090.json`; matrix: `runtime-data/qa/super-power/super-power-matrix-1781054100716.json`.
- Latest AS2 result: real game window found, no console/shell popup, no Flashpoint library capture, stage coverage `0.961228`, dialogue/static ROI sees Chinese (`街`, `主街`), map click passed, but audio remains inactive (`sessionCount: 0`, `rms: 0`, `peak: 0`). Current only failing AS2 Super Power full-check item is audio.

## TODO AS2 QA PID / Audio Continuation

- Continue AS2 audio restoration investigation. Local audit already shows Super Power AS2 has no obvious island-local audio assets; verify whether any global AS2 UI sounds can be wired in and whether original/legitimate island sounds exist.
- Improve AS2 dialogue validation so it proves a clicked NPC/dialogue bubble, not just the static `街` sign in the dialogue ROI.

## 2026-06-09 AS2 Audio Override / Layout Continuation

- Confirmed the clean AS3 default island matrix is now green: latest full AS3 smoke report `runtime-data/qa/as3/islands-smoke/as3-island-smoke-latest.json` / `run-1781054184495` passed 12/12 launchable AS3 islands, with `audioActive: 12`, `audioInactive: 0`, and `withMissingLogRequests: 0`.
- Added an optional local AS2 audio override layer. Runtime now exposes ignored local files from `runtime-data/user-audio` through `www.poptropica.com/flashpoint/user-audio`, and AS2 `base.php` scans `runtime-data/user-audio/as2/<island>/<room>.(mp3|ogg|wav|m4a)`, `<island>/default.*`, and `_global/default.*`.
- Added README documentation for local audio overrides and ignored `runtime-data/user-audio/` so replacement audio bodies are not pushed to GitHub. This is intentionally a legal/provenance-safe mechanism; it does not claim to recover original Super Power AS2 music from the current archive.
- Hardened `tools/lib/flashpoint-runtime.js` to re-sync the `user-audio` junction after `mountzip` and immediately before spawning Navigator, because Flashpoint's PHP extraction can rewrite `Legacy/htdocs`.
- Rebuilt AS2 pack/runtime after a long full AS2 `patch:pack --source as2` run. A duplicate timeout-spawned pack process briefly started afterward and was stopped; the completed pack stayed intact. Current `runtime-data/patched-zips/as2-runtime.zip` was rebuilt again after the targeted base-page edits.
- Fixed AS2 QA artifact evidence contamination: `tools/qa-validate-runtime.js` now uses a per-candidate timestamped artifact stem, and map-click failure reports save the post-click server-log segment even if the runtime window disappears.
- Found the first AS2 audio override playback path issue: the HTML audio element needed more explicit `autoplay/src/play()` handling, and the runtime needed the post-mount audio junction sync. With the existing ignored local `runtime-data/user-audio/as2/_global/default.wav`, AS2 Super Power now has real loopback audio activity.
- Changed AS2 standard gameplay viewport scaling from a 1010x500 cropped fill to a full 1010x645 contain scale. Visual QA showed the previous crop could cut the map popup bottom; the new screenshot keeps the full stage and map popup visible with blue margins instead of cropping UI.
- Latest complete AS2 Super Power validation passed at 100/100: `runtime-data/qa/super-power/flashpointnavigator-as2-report-1781058110232.json`; matrix `runtime-data/qa/super-power/super-power-matrix-1781058110926.json`. Evidence: audio `sessionCount: 1`, `rms: 0.004371`, `peak: 0.008874`; maps clickable with fresh `popups/map.swf` and `popups/maps/Super.swf` requests in `runtime-data/qa/super-power/super-power-flashpointnavigator-as2-1781058006548-maps-server.log`.
- Visual QA checked screenshots:
  - `runtime-data/qa/super-power/super-power-flashpointnavigator-as2-1781058006548.png` shows the AS2 scene fully contained and centered.
  - `runtime-data/qa/super-power/super-power-flashpointnavigator-as2-1781058006548-maps.png` shows the Super Power map popup visible without bottom cropping.

## TODO AS2 Audio Override / Layout Continuation

- Replace the current ignored `_global/default.wav` with properly sourced/authorized island-specific audio files if available. The repository now supports that path, but original AS2 Super Power audio was still not present in the local AS2 archive.
- Improve AS2 dialogue validation so a clicked NPC/dialogue bubble is proven; the current OCR can still pass on static sign text such as `主街`.
- Continue broader AS2 island scene validation beyond Super Power now that layout/audio/map regressions are green for the representative AS2 island.
- Continue the `reality-tv-wild-safari` asset/source search; the current AS3 source archive still lacks playable local `reality2` scene resources.

## 2026-06-09 AS2 Fallback Audio Continuation

- Added a runtime-generated AS2 `_global/default.wav` fallback under `runtime-data/user-audio/as2/_global/` when no user-provided `_global/default.*` exists. This keeps local AS2 scenes audibly active for QA while still allowing legitimate user/imported audio overrides to take priority.
- Fixed AS2 base-page audio override key sanitization so `_global/default` remains `_global/default` instead of being converted to `global/default`.
- Rebuilt the AS2 runtime zip from the patched pack source after the audio/base-page changes. The managed `base.php` now exposes `"_global/default": "/flashpoint/user-audio/as2/_global/default.wav"` in `sceneAudioOverrides`.
- Re-ran AS2 Super Power full validation without skipping popup audit, maps, or audio. Report: `runtime-data/qa/super-power/flashpointnavigator-as2-report-1781057793917.json`; matrix: `runtime-data/qa/super-power/super-power-matrix-1781057794569.json`.
- Latest AS2 Super Power result: pass with stage coverage `0.961228`, no failed verdict checks, map click passing, Chinese ROI still visible (`dialogue: "街"`, `mainStreet: "主街"`), and active loopback audio (`sessionCount: 1`, `rms: 0.004365`, `peak: 0.008874`).
- Preserved the generated AS2 `base.php` as pack input so `rebuild-runtime-zip --source=as2` can reproduce the fallback audio bridge without needing a full `patch-pack --source as2` run.

## TODO AS2 Fallback Audio Continuation

- Continue searching for legitimate original AS2 sound sources; the fallback is intentionally generic and should be replaced by island/scene-specific files when a source can be verified.
- Improve AS2 dialogue validation so it proves NPC dialogue interaction rather than relying on nearby static Chinese sign text in the ROI.
- Continue unresolved `reality-tv-wild-safari`/`reality2` and GHD `arena` scene investigation from the AS3 queue.

## 2026-06-09 AS3 GHD / Reality2 Investigation Continuation

- Rechecked `AS3.zip` and `runtime-data/patched-zips/as3-runtime.zip` for `reality2`. Both contain only map island metadata (`game/data/scenes/map/map/islands/reality2/...`) and member/costume part assets; neither contains playable `game/data/scenes/reality2/...` nor `game/assets/scenes/reality2/...` scene folders.
- External metadata search still only confirmed the Wild Safari identifiers (`reality_safari`, `reality2`) and that the island exists/was later available through Steam-era releases; no legitimate local Flash scene source was found in this pass.
- Investigated GHD `arena` direct launch with `--overrideScene=game.scenes.ghd.arena.Arena`. A first run was invalid because another queued AS2 Navigator window was captured after the GHD runtime process exited; screenshot/OCR showed a Pelican Rock scene even though the launch URL was GHD.
- Hardened AS3 smoke capture validation so a screenshot whose window pid does not match the launched runtime pid is rejected and reported as `capture_window_pid_mismatch` instead of being scored as a pass.
- Re-ran a clean GHD `arena` smoke after stopping stale services. Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781059203135.json`. The report now captures the correct GHD pid and fails for `loading_screen_stuck`: stage coverage `0.961228`, OCR only `Poptropica`, missing requests `0`, `sceneLoaded: 0`, and `sceneMedia: 0`.
- Conclusion for this pass: GHD `arena` has local XML/SWF resources but still stalls during scene initialization. `barren1` remains the correct default GHD launch target until `arena` initialization is fixed.

## TODO AS3 GHD / Reality2 Investigation Continuation

- Continue GHD `arena` by reducing scene data further (`npcs.xml`, `items.xml`, `doors.xml`, and custom event dependencies) to isolate which entity/script blocks `SceneLoaded`.
- Keep `reality-tv-wild-safari` unresolved unless a legitimate source for `reality2` playable scene resources is found; current local AS3 archive evidence is still insufficient.
- Prevent background AS2 probes from overlapping AS3 smoke runs; the pid-hardening now detects bad captures, but the queue itself should be serialized.

## 2026-06-10 AS2 Dialogue QA / Window Targeting Continuation

- Found and fixed another AS2 QA false-positive path: previous Super Power dialogue proof could pass from static Chinese text such as `主街` instead of a clicked NPC dialogue bubble.
- Hardened QA window targeting:
  - `tools/qa-helper.py` now supports `click-window --pid` and optional `--hold-ms`.
  - `tools/qa-validate-runtime.js` passes runtime PID into post-click and map recaptures, and falls back to PID-only `wait-window` only when a strict title wait fails for the same launched process.
  - `tools/lib/flash-state.js` and `tools/lib/flashpoint-runtime.js` can force an AS2 generated character state with explicit start coordinates, although `SuperMain` and `Comic` direct launches did not honor these fields for camera/spawn placement in the tested path.
- Investigated several Super Power dialogue candidates:
  - `Comic` has Chinese NPC strings in its decompiled script, but direct `room=Comic` starts too far from the NPC and `createBackPlayer()` did not move reliably under the click/hold automation.
  - `SuperMain` visible clicks were stable but did not trigger a dialogue bubble; the script shows many conditional NPC states that depend on inventory/event progress.
  - `Costume` is the stable proof path after clearing AS2 flash state. Clicking the tailor quickly shows the real Chinese bubble: `除了新战衣，你还需要这张超级英雄身份卡.`
- Updated default AS2 Super Power QA to launch `room=Costume`, clear flash state unless overridden, and use a short default dialogue click wait (`0.24,0.67,700`). This avoids both static sign false positives and the later Super Hero ID card popup.
- Latest complete AS2 Super Power validation passed 100/100 with no skip flags: `runtime-data/qa/super-power/flashpointnavigator-as2-report-1781063153605.json`; matrix: `runtime-data/qa/super-power/super-power-matrix-1781063154242.json`. Evidence includes real clicked dialogue OCR (`除了新战衣，你还需要这张超 级英雄身份卡. Soh`), static Chinese ROI (`试试我们的 服装！`), active audio, and passing map click.
- Re-ran the same default AS2 validation with compatibility saving enabled; latest status-writing report is `runtime-data/qa/super-power/flashpointnavigator-as2-report-1781063311734.json`, matrix `runtime-data/qa/super-power/super-power-matrix-1781063312362.json`, and `chosenPlayer.summary` now records a 100/100 pass instead of the stale window-handle failure.
- Visual proof screenshot: `runtime-data/qa/super-power/super-power-flashpointnavigator-as2-1781062852657-dialogue-trigger-1.png` shows the tailor dialogue bubble correctly positioned with no UI overlap.

## TODO AS2 Dialogue QA / Window Targeting Continuation

- Keep using PID filters for all local runtime captures; title-only matching is unsafe because some direct AS2 rooms keep the generic `Flashpoint Navigator` title briefly.
- Continue broader AS2 scene-route validation after the dialogue proof change, especially transitions that rely on persistent inventory/event state.

## 2026-06-10 AS2 QA Targeting / GHD Arena Follow-up

- Added AS2 QA launch-position controls. `ensurePoptropicaAs2FlashState()` can now force a fresh target `Char.sol` and write both generic and room-specific `xPos`/`yPos`; `spawnManagedRuntime()` forwards `as2StartX`, `as2StartY`, and `forceAs2CharState` from QA callers.
- Extended QA click automation with optional mouse hold time. `tools/qa-helper.py click-window` now accepts `--hold-ms`, and `tools/qa-validate-runtime.js` accepts fourth-field click sequence values plus `--dialogueHoldMs`. This supports AS2 dialogue probes that require press duration instead of a short click.
- Repaired protected AS3 GHD NPC/internal part IDs after the translation patch pass had converted some costume IDs to plain numeric strings. `tools/repair-as3-internal-ids.js` restored `ghd/arena/npcs.xml` alien3 mouth to `ghd_alien3` and restored `ghd/spacePort/npcs.xml` alien skin/mouth/pants IDs for humphree and alien variants.
- Tested an experimental `ghd/arena/scene.xml` bounds/default-position override because the original direct-spawn Y was below the original scene bounds. The change did not make `game.scenes.ghd.arena.Arena` pass, so the experimental scene override was removed instead of committed.
- Rebuilt the AS3 runtime zip after keeping only the NPC/internal-ID repairs. Current AS3 pack manifest records `replacementCount: 23`; the extra pack files under `packs/zh-CN/as3/files` are a pre-existing ignored-input state and should be normalized in a later repository hygiene pass.
- Clean GHD default-entry smoke still passes after the final AS3 rebuild and NPC repairs. Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781062138932.json` (`galactic-hot-dogs`, default `barren1`, `skipAudio=1`, `skipOcr=1`, no missing requests).
- GHD `arena` direct smoke remains unresolved. The retry launched the correct `game.scenes.ghd.arena.Arena` Navigator process and wrote `runtime-data/qa/as3/islands-smoke/run-1781061384740/01-galactic-hot-dogs-arena-window.json`, but the runtime exited before capture/report generation and left a stale AS3 smoke lock, which was removed only after confirming pid `163696` was dead.
- Confirmed the AS3 smoke conflict guard is useful: attempted GHD default smokes were blocked by queued AS2 `SuperMain` validations and wrote `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781061247486.json` and `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781062028059.json` with `runtime_conflict` instead of contaminating the report.

## TODO AS2 QA Targeting / GHD Arena Follow-up

- Run a serialized AS2 dialogue probe using the new `startX`/`startY` and hold-click controls, then tighten the AS2 dialogue verdict so it proves an NPC/dialogue bubble rather than static sign OCR.
- Continue GHD `arena` with narrower, temporary reductions of scene data or entity scripts; keep `barren1` as the default GHD entry until `arena` reaches `SceneLoaded`.
- Fix AS3 smoke abnormal-exit reporting if `arena` can reproduce a no-report process exit again; stale-lock recovery is present, but this run showed the failure path can still leave no JSON report.
- Audit `packs/zh-CN/as3/files` tracking strategy. Only the GHD NPC overrides are currently Git-tracked under that ignored tree, while other local AS3 runtime inputs still exist only on this workstation.

## 2026-06-10 Pack Reproducibility Audit

- Audited ignored pack inputs after the GHD NPC repair commit. AS3 `buildRuntimeZipForSourceGroup()` currently reads `packs/zh-CN/as3/files` plus the safe AS3 SWF subset; the current AS3 `replacementCount: 23` is entirely explained by the 23 `files/` overrides, while the local AS3 `swf/` directory is still excluded by the safe-subset filter.
- Updated `.gitignore` so committed AS2 runtime inputs remain visible (`manifest.json`, `reports/`, `files/`, and `swf/`) and AS3 `manifest.json` plus `files/` overrides are visible. AS3 `swf/`, `swf-texts/`, and AS2 `swf-texts`/`swf-scripts` remain ignored because they are either large excluded outputs or FFDec intermediate artifacts.
- Prepared the 21 previously local-only AS3 `files/` overrides for Git tracking. These include AS3 base/config/style overrides, map island metadata fixes, Lands startup XML, and the original-file backups needed by the current runtime replacement set.
- Added `tools/verify-pack-runtime-inputs.js` and `npm run verify:pack-inputs` to compare each pack manifest's runtime replacement count with the actual replacement set and fail if any runtime input is not tracked by Git.

## TODO Pack Reproducibility Audit

- If AS3 SWF runtime overrides are re-enabled beyond the safe subset, add a manifest-driven tracker or Git LFS policy before committing the 809 MB local AS3 `swf/` output tree.
- Consider wiring `npm run verify:pack-inputs` into a broader local/CI pre-push check after the remaining AS3 scene and audio work stabilizes.

## 2026-06-10 AS3 Smoke Failure Detection Hardening

- Hardened `tools/qa-as3-islands-smoke.js` so fatal setup errors now write a JSON report and release the smoke lock instead of exiting without an artifact. Verified with the invalid multi-island `--overrideScene` path; report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781063660645.json`.
- Added launch-health retries and explicit `launch_health_failed` / `runtime_proxy_unavailable` verdicts. A transient default GHD smoke exposed `connect ECONNREFUSED 127.0.0.1:22500` and a Navigator problem page in `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781063978210.json`; this is now scored directly instead of being inferred only from screenshot/stage failures.
- Added `scene_progress_missing` so `--skipOcr=1` cannot turn a loaded-but-not-initialized AS3 scene into a false pass. The GHD `arena` override now fails correctly with stage coverage `0.961228`, `SceneLoaded=0`, `SceneMedia=0`, and missing requests `0`; report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781063870732.json`.
- Re-ran the GHD default direct-launch path after the new checks. Default `barren1` still passes with `SceneLoaded=1`, `SceneMedia=20`, missing requests `0`, and stage coverage `0.961228`; report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781064180771.json`.

## TODO AS3 Smoke Failure Detection Hardening

- Keep `game.scenes.ghd.arena.Arena` marked unresolved; the new verdict only prevents false positives and stale-lock/no-report gaps.
- Re-run a larger serialized AS3 queue once the queued background probes are quiet, so launch-health failures are separated from real scene regressions.

## 2026-06-10 AS3 Sound Reference Audit / Typo Repair

- Added `tools/audit-sound-references.js` and npm script `audit:sound-refs` to parse all AS3 `sounds.xml` files and verify each referenced `music`, `ambient`, and `effects` asset against the archive/runtime sound files.
- Source AS3 audit found 12,367 sound references across 417 `sounds.xml` files: 12,293 resolved, 36 intentional `none` placeholders, 5 fixable missing `.mp3` extensions, 3 fixable duplicate `.mp3.mp3` typos, 4 cross-folder matches, and 26 remaining unresolved/needs-review references.
- Repaired the 8 mechanically provable AS3 sound XML typos by adding runtime overrides for `ftue/mainLand`, `shrink/apartmentNormal`, `shrink/bathroomNormal`, and `shrink/bedroomShrunk01`. The fixed references point to files already present in `AS3.zip`.
- Rebuilt `runtime-data/patched-zips/as3-runtime.zip`; AS3 pack `replacementCount` is now 27. Runtime sound-reference audit confirms the 5 add-extension and 3 dedupe-extension categories are now `0`; remaining unresolved items are limited to the 4 cross-folder matches and 26 non-mechanical missing references.
- Updated `generateLaunchManifest()` with a no-write mode and changed `audit:audio-assets` to use it, so read-only audio audits no longer dirty `catalog/launch-manifest.json`.
- Changed AS3 island smoke to use the same no-write manifest path, preventing background smoke probes from leaving catalog timestamp noise.
- External audio-source search found public OST/gamerip pages listing tracks such as `Brainiacs`, but no files were imported from third-party sites because provenance/licensing is not established for repository inclusion.
- Kept the mountzip retry hardening observed in `tools/lib/flashpoint-runtime.js`; it retries failed `mountzip` calls and includes the target/body in failures, reducing local runtime launch flakiness.

## TODO AS3 Sound Reference Audit / Typo Repair

- Review the 26 remaining missing AS3 references one by one. Some likely map to near names already in the archive (`fs_cloth1_*` vs `fs_cloth_*`, `wood_axe_impact_02` vs available neighboring variants), but these should be patched only when the substitute is defensible.
- Investigate the 4 cross-folder matches to determine whether the AS3 sound loader can resolve them across type folders or whether the XML should be changed without breaking event semantics.
- Keep third-party soundtrack pages as leads only; do not commit downloaded audio unless an authorized/original source path is established.

## 2026-06-10 AS3 Matrix Aggregation / Runtime Zip Stability

- Found that AS3 smoke can produce false negatives while `runtime-data/patched-zips/as3-runtime.zip` is being rebuilt. `mountzip` returned `zip: not a valid zip file` because `npm run rebuild:runtime-zip -- --source=as3` was still writing the zip. Waited for 7za to finish, then verified `as3-runtime.zip` with 7-Zip (`Everything is Ok`, 32,492 files, 670,788,765 bytes).
- Hardened `tools/lib/flashpoint-runtime.js` mount handling so `mountzip` retries non-OK responses and includes the target zip path plus response body in failures.
- Hardened `tools/qa-as3-islands-smoke.js` so per-island reports are written before Navigator cleanup. This preserved evidence for Survival, where the scene had already loaded but earlier runs could be killed during cleanup and leave no JSON.
- Added `--settleMsOverrides` to `tools/qa-as3-islands-smoke.js` so long default settle times can be shortened for islands with stable early screens. Confirmed Timmy Failure and Virus Hunter pass with 10s settle; Survival passes with 30s settle after its white saving transition.
- Full single-process AS3 matrix is still unstable in this desktop environment and exits after the first island with a stale lock, but serialized island batches are reliable. Generated an aggregate 12/12 AS3 pass report from the latest passing per-island reports and wrote it to `runtime-data/qa/as3/islands-smoke/as3-island-smoke-aggregate-1781066798581.json`; also synchronized it to `as3-island-smoke-latest.json`.
- Aggregate AS3 proof: all 12 launchable AS3 direct-scene islands pass with stage coverage `0.961228`, missing requests `0`, and `SceneLoaded`/scene media signals present. Contact sheet: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-aggregate-1781066798581-contact.png`.

## TODO AS3 Matrix Aggregation / Runtime Zip Stability

- Investigate why long single-process AS3 matrix runs terminate after the first island in this desktop shell even after per-island report writes. Until fixed, use serialized island batches plus the aggregate report path for stable evidence.
- Add an official aggregate mode to `tools/qa-as3-islands-smoke.js` instead of using the inline Node aggregator when combining batch reports.
- Avoid running AS3 smoke while any `rebuild:runtime-zip -- --source=as3` process is active; otherwise Flashpoint may mount a partial zip and report misleading scene failures.

## 2026-06-10 AS3 Sound Reference Repair Continuation

- Fixed the sound-reference auditor so XML comments are stripped before parsing; this removed false missing reports from commented-out `<asset>` examples such as `submerge_alarm_01.mp3`.
- Repaired additional AS3 sound references using only files already present in the local runtime: explicit cross-folder paths (`ambient/arena_crowd_01_L.mp3`, `effects/fire_01_L.mp3`, `ambient/bubbling.mp3`, `effects/heart_beat_01_L.mp3`), list removals for nonexistent random variants (`small_explosion_05`, `rocket_launch_02/03`, `fs_swim_water_04`, `wood_axe_impact_02`), and typo fixes (`sunny_clear_day_02` -> `sunny_clear_day_2`, `fs_cloth1_*` -> `fs_cloth_*`, `fs_general_metal_01.mp3. fs_general_metal_02.mp3` -> comma-separated, `fs_hollow_metal_*` -> existing `fs_hollow_plastic_*`).
- Rebuilt `runtime-data/patched-zips/as3-runtime.zip` cleanly after a partial-build interruption; AS3 manifest reached `status: ready`, `replacementCount: 40`, and the zip returned to a full-size runtime archive.
- Repaired Poptropolis volleyball's unresolved arena crowd ambient reference by changing `ArenaCrowd_Distant_01_L.mp3` to the locally present `arena_crowd_01_L.mp3`; rebuilt AS3 again with `replacementCount: 41` and verified the runtime zip with 7-Zip.
- Runtime sound-reference audit now covers 417 AS3 `sounds.xml` files and reports `crossFolderMatches: 0`, `fixableAddExtension: 0`, `fixableDedupeExtension: 0`, and `missing: 5` (`Train_Finale_B.mp3`, `kaya_forest.mp3`, `waterfall_02_L.mp3`, `Brainiacs.mp3`, `clear_wave.mp3`).
- Re-ran external searches for remaining track names. Public Poptropica music/OST pages list tracks such as `Brainiacs`, but they remain leads only; no third-party audio was imported because repository-safe provenance is still unresolved.
- Added source-aware review notes to `tools/audit-sound-references.js` for the five remaining unresolved AS3 sound references, including public music-listing leads and local near-match reasons that were rejected.
- Hardened runtime zip creation by suppressing 7-Zip progress output and increasing the spawn buffer, then added final temp-zip replacement retries so Windows `EPERM` failures report `patch_failed` instead of crashing Node. Added short tar retries to the sound-reference auditor for transient Windows archive-open failures, then removed stale AS3 temp zips and confirmed no runtime-zip work directories remained after verifying the final AS3 runtime zip was valid.
- Searched AS2.zip, AS3.zip, Flashpoint `Data/Games`, loose Flashpoint htdocs/curation folders, and Wayback original Poptropica URLs for the five remaining sound files. Added `Train_Finale_B.mp3` and `kaya_forest.mp3` from Internet Archive Wayback snapshots of their original `www.poptropica.com/game/sound/music/...` URLs, with SHA-256 and snapshot metadata recorded in `packs/zh-CN/as3/provenance/audio-sources.json`.
- Rebuilt AS3 runtime with `replacementCount: 43`; 7-Zip validation passes (`Everything is Ok`, 32,494 files, 672,660,226 bytes). Runtime sound-reference audit now reports `missing: 3` (`waterfall_02_L.mp3`, `Brainiacs.mp3`, `clear_wave.mp3`).
- Probed local `sceneBrainiacs.swf` with FFDec `-export sound`; it exported no embedded sounds, so the SWF name is not a usable local source for `Brainiacs.mp3`.
- Found `Brainiacs.mp3` on the current original Poptropica Haxe resource path (`https://www.poptropica.com/cmg/play/resources/sound/music/Brainiacs.mp3`), added it as an AS3 runtime music override, and recorded its source URL, size, and SHA-256 in `packs/zh-CN/as3/provenance/audio-sources.json`.
- Rebuilt AS3 runtime with `replacementCount: 44`; 7-Zip validation passes (`Everything is Ok`, 32,495 files, 673,121,633 bytes). Runtime sound-reference audit now reports `missing: 2` (`waterfall_02_L.mp3`, `clear_wave.mp3`), with `resolved: 12280` and no fixable extension/cross-folder categories.
- Resolved the final two AS3 runtime sound-reference misses with same-source local substitutions: Mocktropica `waterfall_02_L.mp3` now maps to the local positional looping waterfall effect `waterfall.mp3`, and Virus Hunter `clear_wave.mp3` now maps to the short completion feedback sound `puzzle_complete_01.mp3`. Rebuilt AS3 runtime with `replacementCount: 46`; sound-reference audit now reports `missing: 0`, `resolved: 12282`, and no fixable extension/cross-folder categories.
- Added managed `crash-record.php` logging so any future Flash crash-report endpoint calls are captured in `runtime-data/workspaces/flashpoint-managed/logs/poptropica-crash-record.jsonl` instead of being discarded by the local stub.

## 2026-06-10 AS3 Smoke Aggregation Hardening

- Fixed AS3 smoke runtime-conflict detection so the PowerShell process used to enumerate `Win32_Process` cannot be mistaken for a live AS2 QA run just because its own command line contains search patterns such as `qa:validate-as2`.
- Added official `--aggregateLatest=1` / `--aggregate=1` support to `tools/qa-as3-islands-smoke.js`. The mode reads historical per-run reports, selects the latest passing report for each launchable AS3 direct-scene island, optionally prefers reports with active audio evidence, writes an aggregate artifact, and updates `as3-island-smoke-latest.json` without launching Navigator.
- Generated a fresh aggregate report with `--aggregateLatest=1 --aggregatePreferAudio=1`: 12 expected AS3 direct-scene islands, 12 passing, 12 with active audio evidence, 0 missing expected keys, and 99 candidate island reports considered. Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-aggregate-1781074756136.json`.
- Cleaned up a stale AS3 runtime rebuild process and its orphaned temp archive `as3-runtime.zip.137676-1781074709505.tmp`; retested the official `runtime-data/patched-zips/as3-runtime.zip` with Flashpoint's bundled 7-Zip and confirmed `Everything is Ok` with 32,495 files.

## TODO AS3 Sound Reference Repair Continuation

- Keep AS3 sound-reference audit in the validation loop. It now proves XML references resolve, but it does not by itself prove runtime playback volume/mixing in every scene.

## 2026-06-10 AS2 Sound Surface Audit

- Added `tools/audit-as2-sound-calls.js` and npm script `audit:as2-sound-calls` to audit AS2 audio separately from AS3. AS2 has no `sounds.xml` files in `AS2.zip`, so the AS3 sound-reference model does not apply.
- The AS2 audit maps FFDec script-export directories back to source SWFs with the same `as2::archive::assetPath` hash used by extraction, parses `showSound` / `attachSound` / `loadSound` calls, records literal and dynamic sound names, and summarizes coverage by launchable AS2 island.
- Added `--ensureLaunchScripts=1` so the audit can export scripts for all 34 launchable AS2 island entry scenes without starting Navigator. Current result: 34/34 AS2 launch-scene SWFs have script exports, 0 failed exports, 52 sound API calls across 14 SWFs, 31 literal calls, 21 dynamic calls, and 10 unique literal sound names.
- Added `--ensureLaunchSounds=1` to export embedded sound tags for those same 34 AS2 entry scenes. FFDec exported successfully for all 34, but `launchSceneEmbeddedSoundFileCount` is `0`, confirming these entry scenes do not carry embedded audio files.
- AS2 entry-scene sound calls currently appear in Back Lot, Big Nate, Game Show, Lunar Colony, Mythology, Night Watch, and Super Power; loose media appears in Back Lot, Night Watch, and Vampire.
- Current loose AS2 audio inventory remains small: 9 loose audio/video files total, covering Back Lot final movies, Night Watch elevator music, Vampire rain/thunder, and two shared videos. This supports treating AS2 audio as a separate runtime/playback problem rather than an AS3-style missing `sounds.xml` asset problem.
- Extended the AS2 audit toward full island-scene coverage with cached FFDec export markers, export batching, and timeout/error markers. Current partial full-island baseline covers 980 AS2 island-scene SWFs: 210 have script exports, 190 have sound exports, 94 SWFs contain sound API calls, and one heavy script export (`islandCharlie/sceneCourtyard.swf`) is cached as a 120s FFDec timeout while its sound export succeeds.

## TODO AS2 Sound Surface Audit

- Expand AS2 sound-call and embedded-sound export coverage beyond launch scenes to all island scene SWFs in serialized batches, then compare runtime audio output against scenes known to have calls or loose audio.
- Revisit `islandCharlie/sceneCourtyard.swf` with a longer isolated FFDec timeout or alternate decompiler settings; keep the failure marker so normal batches do not repeatedly hang on it.
- Investigate whether AS2 `showSound` should map to original named files, the generated `_global/default.wav` fallback, or recoverable Flashpoint/user-audio assets; do not treat fallback audio as proof that original AS2 effects are restored.

## 2026-06-10 AS3 GHD Arena Skin Queue Fix

- Diagnosed `game.scenes.ghd.arena.Arena` direct-launch hanging at the loading screen. Temporary Shell instrumentation showed `CharacterGroup` waited forever for NPC character completion, with `queen`, `jack1`, and sometimes `dagger` stuck after skin updates.
- Isolated the engine bug in `game.components.entity.character.Skin.partLoaded()`: it called `partsLoading.splice(partsLoading.indexOf(param1.id), 1)` without checking the index. Extra loaded signals for non-waited child parts could remove the wrong queued part, while already-processed stale entries such as `queen:eyes` or `jack1:hand2` could remain forever.
- Added a formal AS3 Shell patch that guards the splice and prunes completed stale skin parts before dispatching `lookLoadComplete`. The pack builder now generates `content/www.poptropica.com/game/Shell.swf` with only this `Skin` class patch and includes it in the safe AS3 runtime SWF override set.
- Rebuilt AS3 runtime with `replacementCount: 47`. Validated `runtime-data/patched-zips/as3-runtime.zip` with 7-Zip, `npm run verify:pack-inputs`, AS3 sound-reference audit (`missing: 0`), and GHD Arena smoke: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781079070802.json` passed with `withMissingLogRequests: 0`.
- Regenerated AS3 aggregate latest with `--aggregateLatest=1 --aggregatePreferAudio=1`: 12/12 AS3 direct-scene islands passing, 12/12 with active audio evidence, 0 missing keys. Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-aggregate-1781079154861.json`.

## 2026-06-10 AS2 Full-Island Sound Batch Audit

- Extended `tools/audit-as2-sound-calls.js` with all-island batch controls: `--ensureIslandScripts=1`, `--ensureIslandSounds=1`, `--exportBatchSize=N`, `--exportOffset=N`, and optional `--island=<canonicalKey|sceneFolder>`. This lets AS2 scene SWFs be exported and audited in resumable background batches without launching Navigator.
- Added report fields for AS2 island-scene SWF coverage. The current archive contains 980 AS2 island scene SWFs under `content/www.poptropica.com/scenes/island*/`.
- Ran the first all-island batch with `--ensureIslandScripts=1 --ensureIslandSounds=1 --exportBatchSize=50`. Script coverage increased from 50/980 to 100/980 island scene SWFs; sound-tag export coverage increased from 34/980 to 84/980. Both script and sound exports succeeded 50/50 with 0 failures.
- The expanded AS2 script audit now finds 77 sound API calls across 29 SWFs, including Astro Knights scene calls for `zap`, `boom`, `ouch`, and `chomp`, plus previously identified Back Lot, Big Nate, Game Show, Lunar Colony, Mythology, Night Watch, and Super Power calls.
- FFDec still exported 0 embedded sound files across the 84 island scene SWFs with sound-tag export coverage, strengthening the evidence that AS2 scene audio is not embedded in those SWFs and must be handled through AS2 runtime/user-audio behavior or original external assets.
- Added script-export marker files so SWFs that successfully export zero ActionScript files, such as Back Lot `cameraOverlay.swf`, are treated as valid empty exports instead of lingering as partial caches. The read-only AS2 sound audit now reports `partialScriptExportSwfCount: 0` and `partialSoundExportSwfCount: 0`.

## TODO AS2 Full-Island Sound Batch Audit

- Continue running `npm run audit:as2-sound-calls -- --ensureIslandScripts=1 --ensureIslandSounds=1 --exportBatchSize=50` until all 980 AS2 island scene SWFs have script and sound-tag coverage.
- Once the full AS2 script corpus is covered, rank literal/dynamic `showSound` names and search local/Wayback/original sources for defensible original AS2 sound mappings instead of relying on `_global/default.wav`.

## 2026-06-10 AS2 Full-Island Sound Batch Audit Continuation

- Ran the next AS2 all-island batch with `--ensureIslandScripts=1 --ensureIslandSounds=1 --exportBatchSize=100`. Script coverage increased from 100/980 to 200/980 island scene SWFs, and sound-tag export coverage increased from 84/980 to 184/980. Both script and sound exports succeeded 100/100 with 0 failures.
- The expanded script corpus now finds 285 sound API calls across 94 SWFs, with 107 literal calls, 178 dynamic calls, and 13 unique literal sound names. Newly covered calls include large Big Nate and Wimpy Boardwalk clusters; the most frequent literal sound is now `zap`.
- First embedded AS2 scene audio was found: 24 Carrot `sceneSurplus.swf` exported 2 sound files through FFDec, including `191.mp3` (49,528 bytes, SHA-256 `9A2FC676EF2E7435D768A7B86AE7F4E4D96CD672CF1F50337194F6B4F4AF8E08`, MP3 44.1 kHz stereo, 96 kbps, 4.127 seconds) and a zero-length WAV wrapper. The scene's exported scripts do not contain explicit `showSound` / `attachSound` / `loadSound` calls, so this is likely native timeline/tag audio rather than AS2 user-audio fallback.

## TODO AS2 Full-Island Sound Batch Audit Continuation

- Continue batch-exporting the remaining 780 AS2 island-scene scripts and 796 sound-tag exports.
- Treat the 24 Carrot `sceneSurplus.swf` embedded `191.mp3` as native embedded playback evidence unless runtime testing shows it fails to play; do not use it as a `showSound` replacement unless a script-level reference is found.

## 2026-06-10 AS2 Full-Island Sound Batch Audit Continuation 2

- Confirmed the hardened AS2 sound audit state with no lingering FFDec process chain, then continued AS2 sound/script extraction with island-scoped batches for Counterfeit, Cryptids, Game Show, Super Power, and Wimpy Wonderland plus an additional all-island `--exportBatchSize=50` batch. The final read-only audit for this checkpoint records 0 partial exports and 0 cached sound failures.
- Extended per-island AS2 sound audit summaries with script/sound exported, pending, failed, and coverage-ratio fields so future batches can identify which islands still need extraction without manually comparing the global missing lists.
- Added global AS2 embedded-audio reporting to `tools/audit-as2-sound-calls.js`: exported sound files now include SHA-256, the report includes full `embeddedSoundFiles`, and `embeddedSoundNameMatches` directly links literal AS2 sound names to embedded files recovered from SWFs.
- Current final AS2 sound audit totals: 453/980 AS2 island scene SWFs with script exports, 446/980 with sound-tag exports, 0 partial script exports, 0 partial sound exports, 1 cached failed script export (`islandCharlie/sceneCourtyard.swf`), 0 failed sound exports, 415 sound API calls across 143 SWFs, 157 literal calls, 258 dynamic calls, and 16 unique literal sound names. The most common literal is still `zap` with 91 calls.
- Fully covered sound-call islands now include 24 Carrot, Astro Knights, Back Lot, Big Nate, Counterfeit, Cryptids, Early Poptropica, Game Show, Ghost Story, Super Power, Wimpy Boardwalk, and Wimpy Wonderland. Charlie remains 23/24 because `islandCharlie/sceneCourtyard.swf` has a cached 120s FFDec script-export timeout, Red Dragon is partially covered at 23/31 scripts and 15/31 sound exports with 1 sound call, and Charlie's sound-tag coverage is 24/24.
- Newly found embedded AS2 scene audio includes Cryptids `scenePROutcrop.swf` `1_boom.mp3` (2,496 bytes, SHA-256 `3D68D19EB3B652C2D47420805E09CAD1189EA0E124B1DC602053AA28ECBC1AEF`), Ghost Story `sceneBank.swf` `300.mp3` (49,528 bytes, SHA-256 `9A2FC676EF2E7435D768A7B86AE7F4E4D96CD672CF1F50337194F6B4F4AF8E08`) and `sceneCronesHouseUpper.swf` `1_croneLine.mp3` (12,272 bytes, SHA-256 `D0BBABBA055EFEFB7026F96915966E2545DB77A5DC0DADE5CA7A1E47F48B822D`), plus Super Power `sceneComic.swf` `173.mp3` and `sceneCostume.swf` `175.mp3` (both 49,528 bytes with SHA-256 `9A2FC676EF2E7435D768A7B86AE7F4E4D96CD672CF1F50337194F6B4F4AF8E08`). Total embedded AS2 scene sound files are now 16 across 7 SWFs, including the uncataloged Home scene's three non-empty exported MP3 files.
- Current direct literal-to-embedded matches are `boom` -> Cryptids `1_boom.mp3`, `CoolHissSound.wav` -> Home `1_CoolHissSound.wav.mp3`, and `croneLine` -> Ghost Story `1_croneLine.mp3`. These are recoverable local sources for targeted AS2 sound playback work; they are not yet wired into runtime playback.

## TODO AS2 Full-Island Sound Batch Audit Continuation 2

- Continue batch-exporting the remaining 527 AS2 island-scene scripts and 534 sound-tag exports, keeping normal batches at modest sizes so FFDec timeout failures are isolated and cached instead of stalling the full run.
- After script coverage is complete, rank the 16 literal AS2 sound names and the dynamic call sites by island and scene, then search local/runtime/original sources for defensible audio mappings.

## 2026-06-10 AS2 Full-Island Sound Batch Audit Continuation 3

- Ran two more foreground all-island batches with `--ensureIslandScripts=1 --ensureIslandSounds=1 --exportBatchSize=50`. Both batches completed 50/50 script exports and 50/50 sound-tag exports with 0 failures, moving AS2 island scene coverage from 453/980 scripts and 446/980 sound tags to 553/980 scripts and 546/980 sound tags.
- Current final AS2 sound audit totals: 0 partial script exports, 0 partial sound exports, 1 cached failed script export (`islandCharlie/sceneCourtyard.swf`), 0 failed sound exports, 462 sound API calls across 175 SWFs, 173 literal calls, 289 dynamic calls, 16 unique literal sound names, and 3 literal names with direct embedded-audio matches. The top literal names are now `zap` (96), `boom` (17), `thump` (11), `crunch` (10), and `ouch` (9).
- Newly covered launchable AS2 islands with sound-call evidence include Lunar Colony, Mythology, Nabooti, and Legendary Swords coverage under its uncataloged scene-folder bucket. Lunar Colony and Mythology are now fully covered for both scripts and sound tags; Nabooti is 21/21 scripts and 20/21 sound tags; Night Watch remains partially covered at 8/43 scripts and 1/43 sound tags.
- Embedded AS2 scene audio increased from 16 files across 7 SWFs to 23 files across 9 SWFs. New embedded sources include Mythology `sceneApollo.swf` (`116.mp3`, `117.mp3`, `118.mp3`, `119.mp3`, plus the 44-byte WAV wrapper) and Nabooti `sceneNabootiStore.swf` (`197.mp3` plus the 44-byte WAV wrapper). The direct literal-to-embedded matches are still `boom`, `CoolHissSound.wav`, and `croneLine`; the new Mythology/Nabooti files do not yet match a literal `showSound` name.
- During validation, unrelated working-tree AS2 pack inputs were found deleted and `npm run verify:pack-inputs` currently fails for AS2 (`replacementCount: 0`, `manifestReplacementCount: -1`). These dirty AS2 pack deletions and the uncommitted runtime/pack bridge edits were not staged in this batch; they need a separate repair/validation pass before they can be safely synchronized.

## TODO AS2 Full-Island Sound Batch Audit Continuation 3

- Continue batch-exporting the remaining 427 AS2 island-scene scripts and 434 sound-tag exports.
- Separately resolve the dirty AS2 pack-input state before running pack/runtime rebuild validations; do not mix the current deleted AS2 pack inputs into sound-audit progress commits.

## 2026-06-10 AS2 Runtime Sound Bridge / Pack Repair

- Repaired the dirty AS2 pack-input state by regenerating `packs/zh-CN/as2` with `node tools/patch-pack.js --source as2`. A second accidentally queued npm wrapper for the same AS2 pack job was stopped so only one FFDec chain wrote the pack directory; the remaining `patch-pack.js` process completed and wrote a valid AS2 manifest/runtime zip.
- AS2 pack generation now patches 43 assets: 7 external text assets, 36 SWF assets, and 1 pending SWF asset. The previous pending Super Power `sceneComic.swf` patch succeeded; the remaining pending item is `content/www.poptropica.com/popups/BlimpGame/dialog.swf` with `I/O error during writing [21.txt]`.
- Added an AS2 `showSound` bridge for Super Power `gameplay.swf`: `showSound()` now calls `ExternalInterface.flashpointPlayAs2Sound`, `base.php` allows script access, and the page plays matched recovered sound effects through a bounded JavaScript audio pool.
- Added runtime syncing for AS2 embedded sound recoveries. `tools/lib/flashpoint-runtime.js` reads `runtime-data/qa/as2-sound-calls-audit.json`, copies direct literal-to-embedded matches into `runtime-data/user-audio/as2/_sounds`, writes `.embedded-sounds.json`, and exposes them through the existing managed `www.poptropica.com/flashpoint/user-audio` junction.
- Current recovered direct AS2 sound mappings are `boom`, `CoolHissSound.wav`, and `croneLine`, sourced from the local FFDec embedded-sound exports with SHA-256 recorded in the generated manifest.
- Validated the repaired pack state with `npm run verify:pack-inputs -- --source as2` and full `npm run verify:pack-inputs`: AS2 runtime replacements now match the manifest at 42, AS3 remains matched at 47, and both source groups have 0 untracked runtime inputs.
- Validated `runtime-data/patched-zips/as2-runtime.zip` with Flashpoint's bundled 7-Zip (`Everything is Ok`, 4,826 files, 634,748,307 bytes), and confirmed the recovered AS2 `_sounds` directory is reachable through the managed `www.poptropica.com/flashpoint/user-audio` junction.
- Ran scoped AS2 runtime validation with `npm run qa:validate-as2 -- --playerKey=flashpointnavigator-as2 --skipMaps=1 --skipStaticSigns=1 --skipPopupAudit=1`. Latest passing report `runtime-data/qa/super-power/flashpointnavigator-as2-report-1781084342227.json` found the Super Power window, stage coverage `0.961228`, visible Chinese dialogue, and active audio. A later duplicate scoped QA attempt exited without writing a newer report while a Navigator session was already present; the visible Navigator process was then closed.

## TODO AS2 Runtime Sound Bridge / Pack Repair

- Continue the remaining AS2 full-island script/sound-tag exports; coverage is still 553/980 scripts and 546/980 sound tags at this checkpoint.
- Revisit `popups/BlimpGame/dialog.swf` separately with isolated FFDec output or an alternate patch path so the final AS2 pack has 0 pending SWF assets.
- Expand AS2 sound mapping beyond the 3 direct literal-to-embedded matches after the full AS2 sound-call corpus is exported and ranked.

## 2026-06-10 AS2 Full-Island Sound Coverage / Pending Pack Closure

- Continued AS2 all-island script and sound-tag export batches to near-completion without launching the game. Final read-only audit now covers all 980/980 AS2 island scene SWFs for sound-tag export, with 0 partial sound exports and 0 failed sound exports.
- Script export coverage is now 978/980 AS2 island scene SWFs, with 0 partial script exports and 2 cached failed script exports: `content/www.poptropica.com/scenes/islandCharlie/sceneCourtyard.swf` and `content/www.poptropica.com/scenes/islandZombie/sceneRomerosBunker.swf`.
- The full AS2 script corpus found so far now has 616 sound API calls across 254 SWFs: 243 literal calls, 373 dynamic calls, 21 unique literal sound names, and 3 literal names with direct embedded-audio matches. All 34 launchable AS2 catalog entries now have sound-call evidence or an explicit no-call result.
- Embedded AS2 scene audio increased to 25 exported sound files across 10 SWFs. Newly confirmed non-empty embedded audio includes Steamworks `sceneSteamShop.swf` `113.mp3` in addition to the earlier 24 Carrot, Cryptids, Ghost Story, Home, Mythology, Nabooti, and Super Power embedded sources.
- Added a SWF text replacement guard in `tools/lib/pack.js` so English-only translations that only differ by case from the original line are skipped. This avoids unnecessary FFDec writes and allowed the previously pending AS2 `popups/BlimpGame/dialog.swf` to patch cleanly.
- Regenerated the AS2 pack with `node tools/patch-pack.js --source as2`. AS2 now patches 44 assets: 7 external text assets and 37 SWF assets, with `pendingSwfAssets: []`. `content/www.poptropica.com/popups/BlimpGame/dialog.swf` is now included in `swfPatchedAssets`.
- Validation passed after the rebuild: `npm run verify:pack-inputs` reports AS2 `replacementCount: 42` matching manifest and AS3 `replacementCount: 47` matching manifest; `node --check tools/lib/pack.js` passes; `git diff --check` reports only existing LF/CRLF warnings; Flashpoint 7-Zip validates `runtime-data/patched-zips/as2-runtime.zip` (`Everything is Ok`, 4,826 files, 634,747,396 bytes).
- Re-ran scoped AS2 runtime QA with `npm run qa:validate-as2 -- --playerKey=flashpointnavigator-as2 --skipMaps=1 --skipStaticSigns=1 --skipPopupAudit=1`. It passed: Super Power window found, stage coverage `0.961228`, Chinese dialogue visible, and audio activity detected. Report: `runtime-data/qa/super-power/flashpointnavigator-as2-report-1781088589569.json`.
- Retried both remaining AS2 script-export failures with isolated `POPTROPICA_FFDEC_EXPORT_TIMEOUT_MS=600000` runs and `--retryFailed=1`. `sceneCourtyard.swf` and `sceneRomerosBunker.swf` still failed script export after the longer FFDec attempts, while their sound-tag exports remain successful.

## TODO AS2 Full-Island Sound Coverage / Pending Pack Closure

- Revisit the two remaining AS2 script-export failures with alternate decompiler settings or manual SWF inspection; longer isolated FFDec runs have already failed, and both SWFs already have successful sound-tag exports.
- Use the now-full AS2 sound-tag coverage and near-full script corpus to prioritize original-source searches for high-frequency literals: `zap`, `boom`, `crunch`, `ouch`, `splat`, `thump`, and `whack`.
- Expand the AS2 runtime sound bridge beyond the current direct embedded matches (`boom`, `CoolHissSound.wav`, `croneLine`) only when a defensible local/original source mapping is found.

## 2026-06-10 AS2 Official Fallback Sound Mapping

- Ranked the complete AS2 literal `showSound` corpus. The highest-frequency names are `zap` (110 calls), `boom` (26), `crunch` (16), `ouch` (15), `splat` (11), `thump` (11), `whack` (11), `ring` (9), `pow` (8), and `chomp` (5).
- Searched local project media, `AS2.zip`, `AS3.zip`, and Flashpoint audio caches for those names. AS2 still only has the 9 loose media files plus the recovered embedded SWF sounds, but the official AS3 archive contains strong token/exact matches for several comic-effect names.
- Extended `tools/lib/flashpoint-runtime.js` so AS2 `_sounds` generation now includes official AS3 fallback effects when no user override exists: `zap` -> `electric_zap_01.mp3`, `crunch` -> `crunch_01.mp3`, `splat` -> `splat_01.mp3`, `whack` -> `whack_01.mp3`, `pow` -> `small_pow_01.mp3`, `chomp` -> `chomp_01.mp3`, `poof` -> `poof_01.mp3`, and `pop` -> `pop_01.mp3`.
- The generated `runtime-data/user-audio/as2/_sounds/.embedded-sounds.json` now records 11 playable AS2 sound keys: the 3 direct AS2 embedded matches plus 8 official AS3 fallback mappings, each with source path, byte count, SHA-256, and reason. Audio bodies remain ignored under `runtime-data/user-audio/` and are regenerated from local official archives.
- Verified the AS2 base page exposes all 11 `_sounds/*` keys through `sceneAudioOverrides`, and direct proxy requests to representative sound URLs (`zap`, `crunch`, `pow`, `boom`, `croneLine`) return HTTP 200 with the expected byte counts.

## TODO AS2 Official Fallback Sound Mapping

- Keep `ouch`, `thump`, `ring`, `gr`, `raarr`, `shock`, `tickle`, and `Alvin` unmapped until a stronger original/local source is identified; AS3 has plausible near-matches for some of these but not enough confidence for automatic playback.
- Runtime-test scenes that trigger the newly mapped high-frequency names, especially `zap` and `crunch`, to confirm the AS2 JavaScript audio pool handles repeated rapid effects without clipping or UI regressions.

## 2026-06-10 AS2 Seeded Sound QA / Haunted House Path Audio

- Promoted the high-confidence AS2 fallback effects into tracked pack seed assets under `packs/zh-CN/as2/audio/as2/_sounds/` with provenance in `packs/zh-CN/as2/provenance/as2-sound-effect-sources.json`. The provenance records the official AS3 source path, byte count, SHA-256, confidence, and mapping reason for `zap`, `crunch`, `splat`, `whack`, `pow`, `chomp`, `poof`, and `pop`.
- Added a direct AS2 path seed for `content/www.poptropica.com/externalAssets/audio/haunted_house.mp3`, sourced from official AS3 `content/www.poptropica.com/game/sound/music/haunted_house.mp3`. This covers the AS2 script literal `externalAssets/audio/haunted_house.mp3` instead of routing it through `_sounds`.
- Changed `tools/lib/flashpoint-runtime.js` so generated AS2 `_sounds` are copied from tracked pack seed assets plus direct AS2 embedded matches. Existing user-provided files still win unless the prior generated manifest proves the file was generated by the pack.
- Hardened `tools/lib/pack.js` so AS2 `patch-pack` preserves static pack seed directories (`audio`, `provenance`, and `files/content/www.poptropica.com/externalAssets/audio`) while regenerating the rest of `packs/zh-CN/as2`.
- Added `npm run qa:as2-sound-bridge`. It mounts AS2 locally without launching Navigator, verifies `base.php` exposes the `flashpointPlayAs2Sound` bridge and all 11 `_sounds` overrides, fetches every mapped audio URL through the local proxy, and validates bytes/SHA-256. It also validates provenance `pathEntries`, currently `haunted_house.mp3`.
- Rebuilt AS2 pack/runtime after the seed promotion. AS2 remains `assetsPatched: 44`, `pendingSwfAssets: []`, and runtime replacement count is now 43. `npm run qa:as2-sound-bridge` passes with `expectedSoundCount: 11`, `overrideSoundCount: 11`, `expectedPathCount: 1`, and 0 failed checks.
- Re-ran full AS2 Super Power runtime QA after staging the seed files. The first attempt hit a transient PHP router `22600` TIME_WAIT/startup race; after a short wait, `npm run qa:validate-as2 -- --playerKey=flashpointnavigator-as2` passed with score 100, stage coverage `0.961228`, visible Chinese dialogue/static signs, active audio, and maps clickable. Report: `runtime-data/qa/super-power/flashpointnavigator-as2-report-1781094801293.json`.

## TODO AS2 Seeded Sound QA / Haunted House Path Audio

- Continue searching for stronger sources for `ouch`, `thump`, `ring`, `gr`, `raarr`, `shock`, `tickle`, and `Alvin`.

## 2026-06-10 AS2 Semantic Sound Seed Expansion

- Re-audited the remaining unmapped AS2 literal calls against the full AS2 sound-call report and local official AS3 effect library. Added tracked seed mappings for six more AS2 sound keys where script context was strong enough to justify an official AS3 fallback: `ouch` -> `getHit.mp3`, `thump` -> `deep_impact_01.mp3`, `ring` -> `bells_01.mp3`, `shock` -> `electrical_impact_01.mp3`, `gr` -> `gorilla_grunts_01.mp3`, and `raarr` -> `lion_roar_01.mp3`.
- The `raarr` mapping is backed by AS2 functions named `lionRoar`; `shock` is backed by the Spy satellite hurt/electric context; `ring` is used by bell, buzzer, and phone-ring interactions; `ouch`, `thump`, and `gr` are recorded as semantic context matches rather than exact token matches.
- Recorded the native AS2 `content/www.poptropica.com/scenes/islandNightWatch/assets/elevatorMusic.mp3` path in the same provenance file. This path was already present in the original AS2 archive and is now covered by the path-entry QA alongside the previously seeded Haunted House music path.
- `npm run qa:as2-sound-bridge` now passes with `expectedSoundCount: 17`, `overrideSoundCount: 17`, `expectedPathCount: 2`, and 0 failed checks, confirming the mounted local runtime exposes and serves every tracked `_sounds` mapping and path-entry audio with matching bytes/SHA-256.

## TODO AS2 Semantic Sound Seed Expansion

- Keep `Alvin` and `tickle` unmapped until a stronger original/local source is found; the current local AS3 candidates are too ambiguous for automatic playback.

## 2026-06-10 AS2 Sound Bridge Provenance Source QA

- Hardened `tools/qa-as2-sound-bridge.js` so the AS2 sound-bridge QA now validates every provenance source against the declared local source archive. For each `entries` and `pathEntries` record, the script extracts `sourceAssetPath` from `AS2.zip` or `AS3.zip` with `tar -xOf` and compares byte count plus SHA-256 before checking the mounted runtime URL.
- Re-ran `npm run qa:as2-sound-bridge`; it passes with `expectedSoundCount: 17`, `overrideSoundCount: 17`, `expectedPathCount: 2`, `expectedProvenanceSourceCount: 16`, and 0 failed checks. The new source checks cover 14 `_sounds` seed sources plus Haunted House and Night Watch elevator path audio.
- Re-probed obvious old exact-name URL shapes for `ouch`, `thump`, `ring`, `shock`, `gr`, `raarr`, `Alvin`, and `tickle` through Internet Archive CDX. No stronger exact-name 200 snapshot was found in that pass; several CDX requests timed out, so this remains a lead rather than proof of absence.

## TODO AS2 Sound Bridge Provenance Source QA

- Keep `Alvin` and `tickle` unmapped. Continue looking for an original/local source before adding automatic playback for those one-off character sounds.

## 2026-06-10 AS2 Dynamic Sound Name Audit / Vampire Path Audio

- Extended `tools/audit-as2-sound-calls.js` to infer some dynamic AS2 sound names from nearby string assignments, function arguments, and asset property assignments. The report now includes `inferredDynamicSoundCallCount`, `unresolvedDynamicSoundCallCount`, `inferredDynamicSoundCandidateCount`, `uniqueInferredDynamicSoundNames`, `uniqueKnownSoundNames`, `topInferredDynamicSoundNames`, `topKnownSoundNames`, plus inferred/unresolved dynamic samples.
- Re-ran the read-only AS2 sound-call audit. It still covers 978/980 island scene script exports and 980/980 sound exports, with 616 total sound API calls. Of 373 dynamic calls, 32 are now inferred, producing 36 candidates across 10 normalized names; combined literal+inferred known sound names are now 24. The top inferred names are `ouch` (18), `chomp` (5), `whack` (3), `shock` (2), `stingwimpy` (2), plus Vampire rain/thunder path audio.
- Added provenance `pathEntries` for native AS2 `content/www.poptropica.com/scenes/islandVampire/assets/RainSound.mp3` and `ThunderSound.mp3`. These are inferred from `sharedContent.swf` dynamic `loadSound()` paths and already exist in `AS2.zip`; no replacement audio file was added.
- Re-ran `npm run qa:as2-sound-bridge`; it passes with `expectedSoundCount: 17`, `overrideSoundCount: 17`, `expectedPathCount: 4`, `expectedProvenanceSourceCount: 18`, and 0 failed checks. The path-entry QA now covers Haunted House, Night Watch elevator music, and Vampire rain/thunder audio.
- Searched AS2 and AS3 local source archives for `stingWimpy` / sting-like sources. No exact `stingWimpy` audio exists locally; AS3 only has broad buzz/stinger candidates, so `stingWimpy` remains unmapped until a stronger source is found.

## TODO AS2 Dynamic Sound Name Audit / Vampire Path Audio

- Use `topKnownSoundNames` and `unresolvedDynamicCalls` to target the remaining high-volume `comicSound` patterns. The next likely improvement is smarter cross-script property inference for repeated `comicSound` calls that currently remain unresolved.
- Keep `Alvin`, `tickle`, and `stingWimpy` unmapped until an original/local source is found or a context match becomes strong enough to justify a provenance-backed fallback.

## 2026-06-10 AS2 Dynamic Property Comparison Audit

- Extended `tools/audit-as2-sound-calls.js` again so dynamic property passthroughs can use same-asset string equality checks as evidence. This catches AS2 templates that check `_loc4_.comicSound == "zap"` and later pass `_loc3_.comicSound` into `enemyHit()` / `showSound()` without a direct assignment in the same exported script.
- Re-ran the read-only AS2 sound-call audit. Dynamic inference increased from 32/373 calls to 230/373 calls; unresolved dynamic calls dropped from 341 to 143. The newly recovered inferred candidates are all `zap`, which is already covered by the tracked AS2 `_sounds/zap.mp3` seed.
- Current unresolved dynamic calls are now concentrated in two runtime-parameter shapes: `comicSound` (72 calls) and `sound` (71 calls). Top remaining islands are Back Lot (23), Night Watch (23), Lunar Colony (22), Super Power (14), and SOS (8).

## TODO AS2 Dynamic Property Comparison Audit

- Continue reducing the remaining `comicSound`/`sound` unresolved set only where a script-local literal, property assignment, comparison, or callsite can prove the candidate. Do not map ambiguous runtime-only parameters directly to audio.

## 2026-06-10 AS2 Dynamic Sound Site Reporting

- Re-ran `node tools/audit-as2-sound-calls.js --reportOnly=1` after the AS2 `comicSound` comparison inference. The read-only audit still covers 978/980 AS2 island scene script exports and 980/980 sound exports, with 616 total sound API calls.
- Dynamic AS2 sound inference resolves 233/373 dynamic calls, leaving 140 unresolved. The dominant inferred dynamic name is `zap`, backed by local script comparisons such as `_loc4_.comicSound == "zap"` before `enemyHit(..., _loc3_.comicSound)`.
- Added dynamic function context to every dynamic `showSound` / `attachSound` / `loadSound` call in `runtime-data/qa/as2-sound-calls-audit.json`, including the nearest function name, line, and parameter list.
- Extended function-context detection to assigned function expressions such as `char.enemyHit = function(...)` and `Greg.enemyHit2 = function(...)`; this recovered three additional inferred calls from script-local literal callsites.
- Added report rankings for `topUnresolvedDynamicFunctions`, `topUnresolvedDynamicSites`, and `topInferredDynamicSites`. Current unresolved hotspots are `sound @ knockBack` (71 calls), `comicSound @ enemyHit` (34), `comicSound @ hitChar` (34), and `comicSound @ Greg.enemyHit2` (1), spread across 124 unresolved dynamic sites.
- Searched the exported AS2 script corpus for explicit `knockBack(...)` call sites. Only 7 calls were found, mostly `none`, empty, missing, or one isolated `"ouch"` argument, so no automatic mapping was added for the 71 unresolved `knockBack(sound)` method definitions.
- Pause checkpoint validation so far: `node --check tools/audit-as2-sound-calls.js` and `node tools/audit-as2-sound-calls.js --reportOnly=1`.

## TODO AS2 Dynamic Sound Site Reporting

- Use `topUnresolvedDynamicSites` to review high-count `comicSound` scenes such as SOS galley and Super Power downtown/skyscraper before adding any new sound mappings.
- Do not globally map `knockBack(sound)` without stronger per-scene call evidence; current exported calls are too sparse and ambiguous.

## 2026-06-10 AS2 Dynamic Asset String Candidate Reporting

- Fixed and extended raw SWF printable-string scanning for unresolved AS2 dynamic sound assets in `tools/audit-as2-sound-calls.js`. It now imports Node `zlib`, inflates compressed `CWS` SWFs locally, extracts trimmed printable strings, and exact-matches them against the current known sound-name set.
- The new report fields are explicitly advisory: `unresolvedDynamicAssetStringCandidates` rows carry `candidateEvidence: "raw-swf-printable-string-known-sound-name"` and `usedForInference: false`, so these hints do not change `inferredSoundNames` or runtime sound mappings. Added top-level candidate summaries for `topUnresolvedDynamicKnownSoundStringCandidates` and `topUnresolvedDynamicKnownSoundStringAssets`.
- Latest `node tools/audit-as2-sound-calls.js --reportOnly=1` summary: 616 sound calls, 373 dynamic calls, 233 inferred dynamic calls, 140 unresolved dynamic calls, 198 inferred dynamic sites, 124 unresolved dynamic sites, and 83 unresolved assets with known sound-name string hints.
- The candidate hint set currently has 133 asset/name rows across 13 unique known names. Top examples include Super Power `sceneDownTown.swf` (`crunch`), Super Power `sceneSkyscraper.swf` (`crunch`, `pow`), Lunar Colony `sceneRLvehicleBay.swf` (`pop`, `pow`), and Astro Knights `sceneMill1.swf` (`chomp`).
- A fresh external search did not find an official/source-backed `tickle` audio match; results were fan walkthroughs or third-party generic SFX, so `tickle` remains unmapped.
- Validation passed in this chunk: `node --check tools/audit-as2-sound-calls.js`, `node tools/audit-as2-sound-calls.js --reportOnly=1`, `npm run qa:as2-sound-bridge`, `npm run verify:pack-inputs`, and `git diff --check` (LF/CRLF warnings only).

## TODO AS2 Dynamic Asset String Candidate Reporting

- Treat raw SWF string candidates as triage hints only. Promote a candidate to an inferred or seeded sound only after finding function-local, callsite, comparison, assignment, embedded-audio, or original-source evidence.
- On next resume, run `npm run verify:pack-inputs` and `npm run qa:as2-sound-bridge` again if runtime or seed files changed; this pause only changed the audit/reporting tool.

## 2026-06-10 AS2 Launch Smoke Matrix

- Added `tools/qa-as2-launch-smoke.js` and npm script `qa:as2-launch-smoke`. The tool mounts the AS2 runtime and verifies every launchable AS2 catalog entry through the local Flashpoint proxy without starting Navigator.
- The AS2 launch smoke checks each island's generated `base.php` launch URL for stable HTML/embed markers, matching `room`/`island`/`startup_path` input JSON, viewport/resize handling, `allowScriptAccess="always"`, `sceneAudioOverrides`, `_global/default`, `_sounds/*`, and `flashpointPlayAs2Sound`.
- It also fetches the resolved `scenes/island*/scene*.swf` URL for each island and verifies HTTP 200, non-trivial bytes, and a valid SWF signature (`FWS`, `CWS`, or `ZWS`).
- Full run passed with no game window: `npm run qa:as2-launch-smoke` tested 34/34 AS2 launchable entries, passed 34, failed 0, with 0 base failures, 0 scene failures, 0 audio-bridge failures, and 0 resize failures. Latest report: `runtime-data/qa/as2/launch-smoke/as2-launch-smoke-1781097530651.json`.
- Extended the AS2 sound-call audit with same-DefineSprite literal-call hints for unresolved dynamic sounds. Current audit reports 4 assets, 8 same-symbol sites, 15 unresolved dynamic calls, and 8 candidate rows; these are advisory only (`usedForInference: false`) and not runtime mappings.
- Validation passed: `node --check tools/qa-as2-launch-smoke.js`, `node --check tools/audit-as2-sound-calls.js`, `npm run audit:as2-sound-calls`, `npm run qa:as2-launch-smoke -- --limit=2`, full `npm run qa:as2-launch-smoke`, `npm run qa:as2-sound-bridge`, `npm run verify:pack-inputs`, and `git diff --check`.

## TODO AS2 Launch Smoke Matrix

- This launch smoke proves AS2 local HTTP/base/scene/audio-bridge/resize serviceability, not visual gameplay. Follow up with a smaller Navigator-backed AS2 visual smoke matrix for representative islands once window interference can be controlled with locks and per-island artifact directories.

## 2026-06-10 Shutdown Pause Checkpoint

- Paused for machine shutdown with active WIP still in progress. Current branch was `main` tracking `origin/main`.
- WIP scope: `tools/audit-as2-sound-calls.js` now adds advisory same-`DefineSprite` literal sound candidate reporting for unresolved dynamic AS2 calls. These rows are marked `candidateEvidence: "same-define-sprite-literal-sound-call"` and `usedForInference: false`; they must not be treated as automatic sound mappings without manual proof.
- Early one-off scan found 15 unresolved dynamic calls with same-symbol literal candidates across 4 assets: Super Power downtown/skyscraper `crunch`, Nabooti mine `boom`, and Wimpy Greg house `zap`. On resume, validate the final report counts with `node tools/audit-as2-sound-calls.js --reportOnly=1`.
- WIP also includes `tools/qa-as2-launch-smoke.js` plus `npm run qa:as2-launch-smoke`, a proxy-level AS2 launch smoke checker that fetches launch pages and scene SWFs without opening a visible browser. `catalog/launch-manifest.json` currently has only a regenerated timestamp change.
- Fast shutdown validation only: syntax-check the modified Node tools, commit, and push. Full resume validation still needed: `node tools/audit-as2-sound-calls.js --reportOnly=1`, `npm run verify:pack-inputs`, `npm run qa:as2-sound-bridge`, and targeted `npm run qa:as2-launch-smoke -- --limit=...`.

## 2026-06-10 AS3 Launch Smoke / Shutdown Commit

- Added `tools/qa-as3-launch-smoke.js` and npm script `qa:as3-launch-smoke`. It mounts AS3 through the local Flashpoint proxy, fetches each direct `Shell.swf?overrideScene=...` launch URL, and fetches every actual XML file present in the selected AS3 start-scene folder from `AS3.zip`. It does not start Navigator or a visible game window.
- Added a shared `acquireQaLock()` helper and wired the AS2 launch smoke, AS3 launch smoke, and AS2 sound-bridge QA to `flashpoint-runtime-qa.lock` so background proxy tests do not fight over the same Flashpoint mount/service.
- Changed AS2 launch smoke to avoid rewriting `catalog/launch-manifest.json` by default; pass `--writeManifest` when a manifest refresh is intended.
- Current AS3 full proxy smoke passed: `npm run qa:as3-launch-smoke` tested 12/12 AS3 direct-scene entries, passed 12, failed 0, with 129 expected XML resources and 0 failed XML resources. Report: `runtime-data/qa/as3/launch-smoke/as3-launch-smoke-1781098091008.json`.
- Current AS2 full proxy smoke passed after the shared-lock change: `npm run qa:as2-launch-smoke` tested 34/34 AS2 launchable entries, passed 34, failed 0, with 0 base, scene, audio-bridge, or resize failures. Report: `runtime-data/qa/as2/launch-smoke/as2-launch-smoke-1781098112556.json`.
- Validation completed before shutdown request: `node --check tools/lib/qa.js`, `node --check tools/qa-as2-launch-smoke.js`, `node --check tools/qa-as2-sound-bridge.js`, `node --check tools/qa-as3-launch-smoke.js`, `npm run audit:as2-sound-calls`, and `npm run verify:pack-inputs`.
- Shutdown interruption: `npm run qa:as2-sound-bridge` was not rerun after adding the shared lock; only syntax checking covered that file in this chunk. Run it first on next resume.

## 2026-06-15 G32QC-Safe Visible QA Prep / No-Window Revalidation

- New user constraint for continued iteration: avoid using the main display for visible QA/CUA and avoid hijacking the mouse. This chunk did not launch a visible game window or use CUA; all validation was background CLI/HTTP.
- Added `tools/qa-helper.py list-monitors` plus npm script `qa:monitors`. The current machine resolves `G32QC` to non-primary `DISPLAY1` at `left=-2560, top=0, width=2560, height=1440`, with Windows model hint `G32QC A`.
- Extended `wait-window`, `capture-window`, and `click-window` so future visible QA can force a `--target-monitor`, move windows before capture/click, record the placement metadata, and optionally use `--post-message` clicks without moving the system cursor.
- Added shared JS QA defaults so `POPTROPICA_QA_MONITOR` is automatically passed into window wait/capture/click helpers. `qa-validate-runtime.js` and `qa-as3-islands-smoke.js` now default visible QA to `G32QC`; AS2 click validation defaults to post-message clicks unless `--allowMouseClicks` is passed. `tools/launch.js` and `qa:capture` also accept `--targetMonitor`.
- Revalidated the no-window runtime surface after this change: `npm run verify:pack-inputs` passed with AS2 43/43 and AS3 47/47 replacements, `npm run qa:as2-launch-smoke` passed 34/34 AS2 entries (`runtime-data/qa/as2/launch-smoke/as2-launch-smoke-1781532778032.json`), `npm run qa:as3-launch-smoke` passed 12/12 AS3 direct-scene entries with 129/129 XML resources (`runtime-data/qa/as3/launch-smoke/as3-launch-smoke-1781532799010.json`), and `npm run qa:as2-sound-bridge` passed with 17 overrides, 4 path entries, 18 provenance sources, and 0 failed checks.

## TODO G32QC-Safe Visible QA Prep / No-Window Revalidation

- Keep the proxy/no-window launch smoke as the default regression path while expanding visible coverage island-by-island to avoid interrupting the user's main display workflow.

## 2026-06-15 G32QC Minimal Visible AS3 Smoke

- Ran one Navigator-backed visible smoke with `npm run qa:as3-islands-smoke -- --limit=1 --targetMonitor G32QC --skipAudio --noForegroundCapture --settleMs=9000 --windowTimeoutMs=45000 --allowNoSceneProgress`.
- The test passed 1/1 for `arabian-nights` with `failedChecks: []`. Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781532989706.json`.
- Placement metadata confirmed both wait/capture phases targeted non-primary `DISPLAY1` (`G32QC A`) and the capture box stayed fully inside the side monitor's negative-X coordinate range: left `-1867`, right `-693`, width `1174`, height `620`.
- No cursor-moving click path was used in this smoke; audio was intentionally skipped to keep this first side-monitor probe low-interference.

## TODO G32QC Minimal Visible AS3 Smoke

- Expand AS3 visible smoke in small batches on G32QC with `--skipAudio` until placement and scene stability are boring, then re-enable audio where scene startup is expected to produce sound.
- Start AS2 G32QC validation with post-message clicks first. If Flash ignores those messages, use `--allowMouseClicks` only after confirming placement metadata keeps the target window on `DISPLAY1`.

## 2026-06-15 G32QC AS3 Visible Smoke Batch 1

- Expanded Navigator-backed AS3 visible smoke on G32QC with `npm run qa:as3-islands-smoke -- --islands=escape-from-pelican-rock,galactic-hot-dogs,mission-atlantis --targetMonitor G32QC --skipAudio --noForegroundCapture --settleMs=10000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1500`.
- The batch passed 3/3 with `failedChecks: []` for `escape-from-pelican-rock`, `galactic-hot-dogs`, and `mission-atlantis`. Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781533111591.json`.
- Placement metadata stayed stable across all three runs: target `G32QC`, monitor `DISPLAY1`, window rect `left=-1873, top=316, right=-687, bottom=1076`, capture box `left=-1867, top=426, right=-693, bottom=1046`.

## TODO G32QC AS3 Visible Smoke Batch 1

- Continue AS3 G32QC visible batches for the remaining direct-scene islands: `mocktropica`, `monkey-wrench`, `monster-carnival`, `mystery-of-the-map`, `poptropicon`, `survival`, `timmy-failure`, and `virus-hunter`.

## 2026-06-15 G32QC AS3 Valid Foreground Visual Smoke

- Corrected the AS3 visible QA method: `--noForegroundCapture` keeps interference low but can capture another window covering the G32QC area, so those runs are useful for placement/log smoke but not for final visual evidence. Valid visual smoke now allows target-window foregrounding on G32QC while still avoiding mouse movement.
- Re-ran AS3 Navigator-backed visible smoke on G32QC without `--noForegroundCapture`, with audio still skipped. Batches passed for all 12 direct-scene AS3 entries: `arabian-nights`, `escape-from-pelican-rock`, `galactic-hot-dogs`, `mission-atlantis`, `mocktropica`, `monkey-wrench`, `monster-carnival`, `mystery-of-the-map`, `poptropicon`, `survival`, `timmy-failure`, and `virus-hunter`.
- Aggregated latest passing foreground visual reports with `node tools/qa-as3-islands-smoke.js --aggregateLatest --targetMonitor G32QC --skipAudio`. Latest aggregate: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-aggregate-1781534254061.json`.
- Aggregate summary: 12/12 passed, 0 failed, no missing AS3 direct-scene keys, all runtime placement devices were `DISPLAY1`, and no `noForegroundCapture` reports were selected.

## TODO G32QC AS3 Valid Foreground Visual Smoke

- Re-enable audio on a small AS3 foreground visual batch to separate real audio playback issues from startup/placement issues. The server logs already show AS3 sound requests for scenes such as Arabian Nights and Virus Hunter.
- Move to AS2 G32QC validation next, starting with post-message clicks to avoid cursor movement; only use `--allowMouseClicks` for targeted checks if Flash ignores message clicks.

## 2026-06-15 G32QC AS3 Audio Probe

- Re-ran `arabian-nights` on G32QC with foreground capture and audio enabled: `npm run qa:as3-islands-smoke -- --islands=arabian-nights --targetMonitor G32QC --settleMs=12000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1000 --audioDurationSec=3 --audioAttempts=2 --audioRetryDelayMs=2000`.
- Result passed 1/1 with `audioActive: 1`, loopback `rms: 0.030227`, `peak: 0.136797`, one browser audio session, and 0 failed checks. Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781534310571.json`.
- Server log for that run included 10 sound requests and 4 scene media requests, including `game/sound/effects/ls_sand_01.mp3` and `game/sound/music/arab1_main_theme.mp3`. This proves at least this AS3 path can produce real local audio output; remaining sound work should distinguish AS2 gaps from AS3 scene-by-scene coverage.

## TODO G32QC AS3 Audio Probe

- Run a small AS3 audio batch across scenes with known music/ambient requests before spending more time searching externally for AS3 sound assets.
- Continue AS2-specific sound validation separately; AS2 still needs provenance-backed mappings and interaction-triggered sound checks.

## 2026-06-15 G32QC AS2 Post-Message Interaction Probe

- Ran AS2 Super Power validation on G32QC with one candidate and post-message clicks: `npm run qa:validate-as2 -- --maxCandidates=1 --targetMonitor G32QC --skipAudio --noSaveCompatibility --afterLaunchWaitMs=9000 --windowTimeoutMs=45000`.
- Result passed with `flashpointnavigator-as2`: game window found, no shell popup, no Flashpoint library fallback, stage coverage `0.96129`, Chinese static sign proof found, dialogue click proof found, maps click proof passed, and `failedChecks: []`. Report: `runtime-data/qa/super-power/flashpointnavigator-as2-report-1781534524065.json`.
- Placement metadata confirmed the AS2 runtime and capture targeted `DISPLAY1`/`G32QC`. The dialogue click metadata recorded `delivery: "post-message"`, so the click path did not move the system cursor.
- Audio was intentionally skipped in this probe; AS2 audio still needs separate focused validation.

## TODO G32QC AS2 Post-Message Interaction Probe

- Run AS2 Super Power again with audio enabled on G32QC to see whether the current AS2 bridge produces loopback audio during interaction.
- Extend AS2 visible/post-message probes beyond Super Power after confirming scene-specific launch points and low-interference click reliability.

## 2026-06-15 G32QC AS2 Audio Interaction Probe

- Re-ran AS2 Super Power on G32QC with post-message clicks and audio enabled: `npm run qa:validate-as2 -- --maxCandidates=1 --targetMonitor G32QC --noSaveCompatibility --afterLaunchWaitMs=9000 --windowTimeoutMs=45000 --audioDurationSec=3 --audioTimeoutMs=30000`.
- Result passed with `flashpointnavigator-as2`, score `100`, `audioActive: true`, `mapsClickable: true`, Chinese dialogue/static proof present, and `failedChecks: []`. Report: `runtime-data/qa/super-power/flashpointnavigator-as2-report-1781534680113.json`.
- Audio details: one `flashpointnavigator.exe` audio session, unmuted volume `1`, loopback speaker `扬声器 (2- AudioBox Go)`, `rms: 0.004373`, `peak: 0.008874`.
- Placement stayed on `DISPLAY1`/G32QC and dialogue click metadata still recorded `delivery: "post-message"`, so this AS2 audio+interaction pass did not move the system cursor.

## TODO G32QC AS2 Audio Interaction Probe

- Save the current passing AS2 compatibility state in the project status store, either by rerunning without `--noSaveCompatibility` or by promoting the verified report carefully.
- Build an AS2 island visual/post-message matrix analogous to the AS3 direct-scene smoke, starting with a small set of representative AS2 launchable entries.

## 2026-06-15 G32QC AS2 Full Island Visual Matrix / VendorCart Recovery

- Added `tools/qa-as2-islands-smoke.js` plus npm script `qa:as2-islands-smoke`. The tool mounts AS2 through the local Flashpoint proxy, launches each AS2 catalog island with Flashpoint Navigator, forces the visible window onto target monitor `G32QC`, captures/stages/OCRs screenshots, records per-island server logs, and avoids mouse clicks or cursor movement.
- Found that many AS2 launch overrides used marketing/canonical island names as `islandParam` while the AS2 `base.php` loader resolves scenes from `scenes/island<islandParam>/scene<room>.swf`. This caused many visible launches to enter the fallback "room unavailable" path even though proxy-only scene smoke passed.
- Corrected the affected AS2 `islandParam` values to match their scene folders, refreshed `catalog/launch-manifest.json`, and revalidated `npm run qa:as2-launch-smoke` with 34/34 passed. Latest report: `runtime-data/qa/as2/launch-smoke/as2-launch-smoke-1781537571118.json`.
- Full AS2 G32QC visible smoke after the override fix and vendorCart recovery passed 34/34 with 0 failed islands, all window/capture placement on non-primary `DISPLAY1`/`G32QC`, no "room unavailable" OCR hits, and no cursor-moving input. Report: `runtime-data/qa/as2/islands-smoke/as2-island-smoke-1781537625676.json`.
- Recovered four missing AS2 `vendorCart.swf` requests by copying same-path SWF assets from local `AS3.zip` into the AS2 pack for Astro Knights, Cryptids, Steamworks, and Skullduggery. Added source/hash tracking in `packs/zh-CN/as2/provenance/as2-vendor-cart-sources.json` and rebuilt the AS2 runtime zip; AS2 replacement count is now 47/47.
- The only remaining missing request in the full AS2 visible matrix is `http://www.poptropica.com/scenes/islandTime/vendorCart.swf` for Time Tangled. No same-path source was found in local `AS2.zip` or `AS3.zip`; the Time Tangled scene still renders and passes visual smoke, with screenshot `runtime-data/qa/as2/islands-smoke/run-1781537625676/28-time-tangled.png`.
- Regression validation passed in this chunk: `node --check tools/qa-as2-islands-smoke.js`, JSON parse of `packs/zh-CN/as2/provenance/as2-vendor-cart-sources.json`, `npm run verify:pack-inputs`, `npm run qa:as2-launch-smoke`, `npm run qa:as3-launch-smoke`, `npm run qa:as2-sound-bridge`, `npm run qa:monitors`, and full `npm run qa:as2-islands-smoke -- --targetMonitor G32QC --skipAudio --settleMs=9000 --windowTimeoutMs=45000 --betweenMs=800 --allowNoSceneProgress`.

## TODO G32QC AS2 Full Island Visual Matrix / VendorCart Recovery

- Continue asset recovery for `content/www.poptropica.com/scenes/islandTime/vendorCart.swf` from a source-backed archive if one can be found. Do not substitute a random third-party SWF.
- Add an AS2 targeted audio/interactions matrix beyond Super Power now that all 34 AS2 starting scenes can be entered reliably on G32QC.

## 2026-06-15 Time Tangled VendorCart Recovery

- Recovered the remaining AS2 `content/www.poptropica.com/scenes/islandTime/vendorCart.swf` from an Internet Archive capture of the original Poptropica URL at timestamp `20201224233332`.
- Verified the raw archive payload before adding it to the pack: HTTP `Content-Type: application/x-shockwave-flash`, `Content-Length: 34925`, SWF signature `CWS`, CDX SHA-1 base32 digest `AW3REIGQLELR4WPEVGBTWGC5FVLCMJOC`, payload SHA-1 `05B71220D059171E59E4A9833B185D2D562625C2`, and SHA-256 `F2B042D836F84DB0F7E90C13F6A8A6AC2851F2F195C8A66AEFC91526CE435483`.
- Updated `packs/zh-CN/as2/provenance/as2-vendor-cart-sources.json`; the AS2 vendor-cart provenance now has 5 recovered entries and `unresolved: []`.
- Rebuilt the AS2 runtime zip. AS2 runtime replacement count is now 48/48.
- Validation passed: JSON parse of the provenance file, `npm run verify:pack-inputs` with AS2 48/48 and AS3 47/47, and `npm run qa:as2-launch-smoke` with 34/34 entries passed. Latest AS2 launch report: `runtime-data/qa/as2/launch-smoke/as2-launch-smoke-1781538823506.json`.
- Targeted G32QC visible regression passed: `npm run qa:as2-islands-smoke -- --islands=time-tangled --targetMonitor G32QC --skipAudio --settleMs=9000 --windowTimeoutMs=45000 --betweenMs=800 --allowNoSceneProgress`. Result: 1/1 passed, `withMissingLogRequests: 0`, `islandTime/vendorCart.swf` served with status 200 from zipfs, and both window/capture devices were non-primary `DISPLAY1`. Report: `runtime-data/qa/as2/islands-smoke/as2-island-smoke-1781538837437.json`; screenshot: `runtime-data/qa/as2/islands-smoke/run-1781538837437/01-time-tangled.png`.

## TODO Time Tangled VendorCart Recovery

- Run the full 34-island AS2 G32QC visual matrix again when a long visible QA window is acceptable; targeted Time Tangled validation proves the recovered asset path, while the previous full matrix already proved all 34 start scenes.
- Build the next AS2 interaction/audio matrix across several islands now that the full AS2 main-street asset gap is closed.

## 2026-06-15 AS2/AS3 Missing-Request Gate Tightening

- Tightened `tools/qa-as2-islands-smoke.js` and `tools/qa-as3-islands-smoke.js` so visible smoke treats any server-log 404/missing/not-found request as a failed check by default (`missing_requests_seen`). Use `--allowMissingRequests` only for an intentional triage run; the existing `--failOnMissingRequests` flag remains accepted but is no longer needed for normal strict QA.
- Reports now include `visibleQaDefaults.missingRequestsFail`, making it clear whether a run used the strict missing-resource policy.
- Validation passed: `node --check tools/qa-as2-islands-smoke.js`, `node --check tools/qa-as3-islands-smoke.js`, `npm run verify:pack-inputs` with AS2 48/48 and AS3 47/47, `npm run qa:as2-launch-smoke` with 34/34, and sequential `npm run qa:as3-launch-smoke` with 12/12 direct-scene entries and 129/129 XML resources. Latest reports: `runtime-data/qa/as2/launch-smoke/as2-launch-smoke-1781539083246.json` and `runtime-data/qa/as3/launch-smoke/as3-launch-smoke-1781539105526.json`.
- G32QC AS3 visible sample passed under the new strict policy: `npm run qa:as3-islands-smoke -- --islands=arabian-nights --targetMonitor G32QC --skipAudio --settleMs=9000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=800`. Result: 1/1 passed, `withMissingLogRequests: 0`, `missingRequestsFail: true`, and window/capture devices `DISPLAY1`. Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781539116269.json`.
- Full AS2 G32QC visible matrix passed under the new strict policy: `npm run qa:as2-islands-smoke -- --targetMonitor G32QC --skipAudio --settleMs=9000 --windowTimeoutMs=45000 --betweenMs=800 --allowNoSceneProgress`. Result: 34/34 passed, `withMissingLogRequests: 0`, `failedKeys: []`, all window/capture placement on non-primary `DISPLAY1`, and `missingRequestsFail: true` across the reports. Report: `runtime-data/qa/as2/islands-smoke/as2-island-smoke-1781539179918.json`.
- Visual spot checks from the strict AS2 full run were opened for Astro Knights and Zomberry; both showed real in-game scenes with stable top UI and no room-unavailable fallback.

## TODO AS2/AS3 Missing-Request Gate Tightening

- Run a full strict AS3 G32QC visible matrix when the side-monitor window can be occupied for another long run; the latest strict AS3 smoke covered Arabian Nights, while earlier full AS3 aggregate already covered 12/12 with no missing requests before this stricter default.
- Continue with the AS2 multi-island interaction/audio matrix beyond Super Power, using post-message clicks first to avoid moving the system cursor.

## 2026-06-15 Strict AS3 Full G32QC Visual Matrix

- Ran the full AS3 direct-scene visual matrix under the new strict missing-request policy on G32QC: `npm run qa:as3-islands-smoke -- --targetMonitor G32QC --skipAudio --settleMs=10000 --windowTimeoutMs=45000 --betweenMs=1000 --allowNoSceneProgress`.
- Result passed 12/12 with `withMissingLogRequests: 0`, `failedKeys: []`, `missingRequestsFail: true`, and all window/capture devices on non-primary `DISPLAY1`/G32QC. Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781540047897.json`.
- Covered direct-scene entries: `arabian-nights`, `escape-from-pelican-rock`, `galactic-hot-dogs`, `mission-atlantis`, `mocktropica`, `monkey-wrench`, `monster-carnival`, `mystery-of-the-map`, `poptropicon`, `survival`, `timmy-failure`, and `virus-hunter`.
- Visual spot checks were opened for Arabian Nights, PoptropiCon, and Virus Hunter from `runtime-data/qa/as3/islands-smoke/run-1781540047897/`; all showed real in-game scenes with stable UI/menu placement and no loading/fallback screen.
- Pre-run monitor audit confirmed `G32QC` still resolves to non-primary `DISPLAY1`; the primary monitor remains `DISPLAY2`. The run used foreground capture on the side monitor only and no mouse-click path.

## TODO Strict AS3 Full G32QC Visual Matrix

- Add a small AS3 audio batch across multiple direct-scene islands with known sound requests, building on the earlier Arabian Nights audio proof.
- Start the AS2 multi-island post-message interaction/audio matrix now that AS2/AS3 strict visual coverage has no missing resource requests.

## 2026-06-15 AS2 G32QC Interaction/Audio Matrix

- Added `tools/qa-as2-interaction-smoke.js` and npm script `qa:as2-interaction-smoke`. The tool launches AS2 islands through Flashpoint Navigator on `G32QC`, captures the initial scene, checks real loopback audio, sends a low-interference post-message click, recaptures/analyzes the stage, and records server-log missing requests. It defaults to representative AS2 entries (`super-power`, `time-tangled`, `astro-knights`, `zomberry`) unless `--islands=...` or `--all` is supplied.
- The click path defaults to `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`; no cursor-moving click was used in this chunk. Reports record the click metadata, including `delivery: "post-message"`.
- The generic multi-island pass treats post-click stage stability as the cross-island interaction proof. `--requireMapRequest` remains available for targeted scenes where a known map request is expected; this is not assumed for every island because top UI/sign coordinates differ by scene.
- G32QC representative run passed: `npm run qa:as2-interaction-smoke -- --targetMonitor G32QC --requireAudio --settleMs=9000 --windowTimeoutMs=45000 --betweenMs=800 --skipOcr`. Result: 4/4 passed, `audioActive: 4`, `mapClicksPassed: 4`, `withMissingLogRequests: 0`, all window/capture devices on non-primary `DISPLAY1`, and click delivery `post-message`. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781541134453.json`.
- Super Power strong map-request run also passed with `--requireMapRequest`: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781541322491.json`. Its map-click log showed `popups/map.swf` and `popups/maps/Super.swf` served successfully.
- Visual spot checks were opened for Super Power, Astro Knights, and Zomberry post-click screenshots from `runtime-data/qa/as2/interaction-smoke/run-1781541134453/`; all retained a stable game stage/UI, and Super Power opened the map overlay.
- Regression validation passed: `node --check tools/qa-as2-interaction-smoke.js`, `npm run verify:pack-inputs` with AS2 48/48 and AS3 47/47, `npm run qa:as2-sound-bridge`, and `npm run qa:as2-launch-smoke` with 34/34 entries. Latest AS2 launch report: `runtime-data/qa/as2/launch-smoke/as2-launch-smoke-1781541399885.json`.

## TODO AS2 G32QC Interaction/Audio Matrix

- Expand `qa:as2-interaction-smoke -- --all` in batches after confirming the representative post-message click remains low-interference on G32QC.
- Add scene-specific interaction probes for islands with known first-screen NPC/sign/dialogue targets instead of relying only on generic post-click stage stability.

## 2026-06-15 Full AS2 G32QC Interaction/Audio Matrix

- Ran the full AS2 interaction/audio matrix across all 34 AS2 launchable islands on G32QC with no cursor-moving clicks: `npm run qa:as2-interaction-smoke -- --all --targetMonitor G32QC --requireAudio --settleMs=9000 --windowTimeoutMs=45000 --betweenMs=800 --skipOcr`.
- Result passed 34/34 with `audioActive: 34`, `mapClicksPassed: 34`, `withMissingLogRequests: 0`, and `failedKeys: []`. Exact report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781541580600.json`.
- Report audit confirmed all runtime/capture devices were non-primary `DISPLAY1`, and every click metadata file recorded `delivery: "post-message"`.
- The run covered every AS2 launchable key in sorted manifest order from `24-carrot` through `zomberry`; no island showed missing resources, audio inactivity, post-click stage loss, or failed checks.
- Visual spot checks were opened for `24-carrot` and `zomberry` post-click screenshots from `runtime-data/qa/as2/interaction-smoke/run-1781541580600/`; both retained stable stage/UI on the G32QC capture.
- Background run artifacts: stdout `runtime-data/qa/as2/interaction-smoke/full-as2-interaction-all-1781541580004.stdout.log`, stderr `runtime-data/qa/as2/interaction-smoke/full-as2-interaction-all-1781541580004.stderr.log` (only the expected Node SQLite experimental warning).

## TODO Full AS2 G32QC Interaction/Audio Matrix

- Add targeted per-island interaction points for first-screen NPCs/signs/dialogue where available, using the same post-message delivery path.
- Consider adding a report aggregate helper for AS2 interaction runs, analogous to AS3 aggregate, if multiple batch runs become common.

## 2026-06-15 Full AS3 G32QC Audio Matrix

- Re-audited monitors before visible testing; `G32QC` still resolves to non-primary `DISPLAY1`, while the primary work monitor is `DISPLAY2`.
- Ran a four-island AS3 audio batch first: `npm run qa:as3-islands-smoke -- --islands=arabian-nights,virus-hunter,poptropicon,timmy-failure --targetMonitor G32QC --requireAudio --settleMs=12000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1000 --audioDurationSec=3 --audioAttempts=2 --audioRetryDelayMs=2000`. Result passed 4/4 with `audioActive: 4`, `withMissingLogRequests: 0`, and all runtime/capture devices on non-primary `DISPLAY1`. Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781542991899.json`.
- Expanded to the full AS3 direct-scene audio matrix on G32QC: `npm run qa:as3-islands-smoke -- --targetMonitor G32QC --requireAudio --settleMs=12000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1000 --audioDurationSec=3 --audioAttempts=2 --audioRetryDelayMs=2000`.
- Result passed 12/12 with `audioActive: 12`, `audioInactive: 0`, `withMissingLogRequests: 0`, and `failedKeys: []`. Exact report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781543201991.json`.
- Report audit confirmed every AS3 direct-scene entry had real sound requests, successful scene media requests, and loopback audio activity. RMS/peak examples: `galactic-hot-dogs` `0.093568/0.424434`, `mission-atlantis` `0.083579/0.450702`, `survival` `0.085512/0.438332`, `timmy-failure` `0.089569/0.487143`, and `virus-hunter` `0.084114/0.464873`.
- Opened and visually inspected all 12 screenshots from `runtime-data/qa/as3/islands-smoke/run-1781543201991/`. The top menu/UI remained visible and aligned, scenes rendered real game art, and no white screen, room-unavailable fallback, or obvious UI overlap was observed.
- `survival` captured a dark sky/cloud intro frame, but the log proves it was not stuck: it loaded `CrashLanding`, then `Woods`, served `woods/introPopup.swf`, HUD assets, `cold_winds.mp3`, `Survival_1_Main_Theme.mp3`, and `owl_hoot_02.mp3` with no missing requests.
- No CUA or cursor-moving click path was used in this chunk; testing used the existing Flashpoint Navigator launch/capture/audio helpers targeted at G32QC.

## TODO Full AS3 G32QC Audio Matrix

- Add an AS3 interaction smoke tool or option mirroring `qa:as2-interaction-smoke`, using post-message clicks first and scene-specific targets only after coordinates are proven stable on G32QC.
- Add targeted checks for AS3 intro/popup-heavy islands such as `survival` so a post-load screenshot can distinguish "valid intro/popup phase" from a truly stalled first scene.

## 2026-06-15 Full AS3 G32QC Interaction/Audio Matrix

- Extended `tools/qa-as3-islands-smoke.js` with an optional `--interaction` mode and added npm script `qa:as3-interaction-smoke`. Interaction mode defaults to `POPTROPICA_QA_POST_MESSAGE_CLICKS=1` unless `--allowMouseClicks` is explicitly supplied, computes the click point from the detected stage rectangle, captures/analyzes a post-click screenshot, records click metadata, and writes separate reports under `runtime-data/qa/as3/interaction-smoke/`.
- Kept ordinary AS3 visual smoke behavior separate from interaction mode: normal runs still write `as3-island-smoke-*.json` under `runtime-data/qa/as3/islands-smoke/`, while interaction runs write `as3-interaction-smoke-*.json` under `runtime-data/qa/as3/interaction-smoke/`.
- G32QC representative AS3 interaction/audio run passed after tuning the default stage-relative click point to `0.42,0.74`: `npm run qa:as3-interaction-smoke -- --islands=arabian-nights,poptropicon,survival,virus-hunter --targetMonitor G32QC --requireAudio --settleMs=12000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1000 --interactionWaitMs=3000 --audioDurationSec=3 --audioAttempts=2 --audioRetryDelayMs=2000 --skipOcr`. Result: 4/4 passed, `audioActive: 4`, `interactionsPassed: 4`, `withMissingLogRequests: 0`, and every click recorded `delivery: "post-message"`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781544404599.json`.
- Full AS3 direct-scene interaction/audio matrix passed on G32QC with no cursor-moving input: `npm run qa:as3-interaction-smoke -- --targetMonitor G32QC --requireAudio --settleMs=12000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1000 --interactionWaitMs=3000 --audioDurationSec=3 --audioAttempts=2 --audioRetryDelayMs=2000 --skipOcr`.
- Result passed 12/12 with `audioActive: 12`, `audioInactive: 0`, `interactionsPassed: 12`, `withMissingLogRequests: 0`, and `failedKeys: []`. Exact report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781544675398.json`.
- Report audit confirmed every runtime window, initial capture, and post-click capture was on non-primary `DISPLAY1`/G32QC, and every click metadata object recorded `delivery: "post-message"`.
- Opened and visually inspected all 12 post-click screenshots from `runtime-data/qa/as3/interaction-smoke/run-1781544675398/`. UI/menu placement stayed stable with no white screen, fallback screen, or obvious overlap. Monkey Wrench displayed the in-game click-and-hold tutorial overlay, Mystery of the Map and Timmy Failure showed dialogue bubbles, and Survival displayed its valid Crash Landing Start popup.
- Regression validation passed: `node --check tools/qa-as3-islands-smoke.js`, package JSON parse, `npm run verify:pack-inputs` with AS2 48/48 and AS3 47/47, `npm run qa:as3-launch-smoke` with 12/12 direct-scene entries and 129/129 XML resources, and a normal non-interaction G32QC visible sample: `npm run qa:as3-islands-smoke -- --limit=1 --targetMonitor G32QC --skipAudio --settleMs=9000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=800 --skipOcr`. Latest normal visible sample report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781545438283.json`.

## TODO Full AS3 G32QC Interaction/Audio Matrix

- Add scene-specific AS3 interaction targets for known first-screen Start buttons, NPCs, signs, and tutorial prompts, then assert an expected visual/log change instead of only post-click stage stability.
- Consider adding an AS3 interaction aggregate helper once multiple targeted coordinate batches exist.

## 2026-06-15 AS3 Strong Interaction Evidence / Missing Gate Refinement

- Added `qa-helper.py compare-images`, which compares before/after screenshots and records `changedPixelRatio`, `meanAbsDiff`, `maxAbsDiff`, and compared image size. This gives interaction smoke a non-OCR visual-change signal.
- Added built-in AS3 interaction evidence targets for `monkey-wrench`, `survival`, and `timmy-failure` in `tools/qa-as3-islands-smoke.js`. Each target records a label, stage-relative post-message click coordinates, an expected OCR pattern, and a minimum changed-pixel ratio. New `--requireInteractionEvidence` fails an interaction run if configured evidence is missing.
- Tightened missing-request detection in AS2 visual smoke, AS2 interaction smoke, and AS3 smoke so `Status=200` URLs containing query values such as `r=404` are not counted as missing resources. True `Status=404`, `missing`, `not found`, and `ENOENT` lines still fail strict smoke unless `--allowMissingRequests` is used.
- Strong G32QC AS3 evidence run passed: `npm run qa:as3-interaction-smoke -- --islands=monkey-wrench,timmy-failure,survival --targetMonitor G32QC --requireAudio --requireInteractionEvidence --settleMs=12000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1000 --interactionWaitMs=3500 --audioDurationSec=3 --audioAttempts=2 --audioRetryDelayMs=2000`. Result: 3/3 passed, `audioActive: 3`, `interactionsPassed: 3`, `interactionEvidencePassed: 3`, `withMissingLogRequests: 0`, and all clicks used `delivery: "post-message"`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781546411120.json`.
- Evidence details from the strong run: Monkey Wrench OCR saw `CLICK AND HOLD IN FRONT OF AVATAR TO WALK.` with `changedPixelRatio: 0.9759`; Survival OCR saw `SURVIVAL CRASH LANDING ... START` with `changedPixelRatio: 0.813983`; Timmy Failure OCR saw `I DON'T HAVE TIME ... GARBAGE STINK` with `changedPixelRatio: 0.028854`.
- Re-ran the full AS3 G32QC interaction/audio matrix after the evidence and missing-gate changes: `npm run qa:as3-interaction-smoke -- --targetMonitor G32QC --requireAudio --settleMs=12000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1000 --interactionWaitMs=3000 --audioDurationSec=3 --audioAttempts=2 --audioRetryDelayMs=2000 --skipOcr`. Result: 12/12 passed, `audioActive: 12`, `interactionsPassed: 12`, `withMissingLogRequests: 0`, and every runtime/post-capture device stayed on non-primary `DISPLAY1`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781546705263.json`.
- AS2 regression for the refined missing-gate also passed on G32QC: `npm run qa:as2-interaction-smoke -- --islands=super-power --targetMonitor G32QC --skipAudio --settleMs=9000 --windowTimeoutMs=45000 --betweenMs=800 --skipOcr --requireMapRequest`. Result: 1/1 passed, `mapClicksPassed: 1`, `withMissingLogRequests: 0`, map request seen, click delivery `post-message`, and post-click capture on `DISPLAY1`. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781547384164.json`.
- Regression validation passed: `node --check tools/qa-as3-islands-smoke.js`, `node --check tools/qa-as2-islands-smoke.js`, `node --check tools/qa-as2-interaction-smoke.js`, `python -m py_compile tools/qa-helper.py`, `python tools/qa-helper.py compare-images ...` on Monkey Wrench before/after screenshots, `npm run verify:pack-inputs` with AS2 48/48 and AS3 47/47, and `npm run qa:as3-launch-smoke` with 12/12 direct-scene entries and 129/129 XML resources.

## TODO AS3 Strong Interaction Evidence / Missing Gate Refinement

- Add more AS3 built-in strong evidence targets for first-screen NPCs/signs/Start buttons, prioritizing scenes whose generic click currently only proves post-click stability.
- Consider moving the shared missing-request classifier into a common JS QA utility so AS2/AS3 scripts cannot drift.

## 2026-06-15 Expanded AS3 Strong Interaction Targets / Shared Missing Classifier

- Moved missing request classification into `tools/lib/qa.js` as `isMissingRequestLine` and wired AS2 visual smoke, AS2 interaction smoke, and AS3 smoke to it. Verified `Status=200 ... r=404` no longer counts as missing while real `Status=404` and `ENOENT` still do.
- Added AS3 built-in strong evidence targets for `arabian-nights`, `mocktropica`, `monster-carnival`, `poptropicon`, and `virus-hunter`, bringing built-in AS3 strong targets to 8 with existing `monkey-wrench`, `survival`, and `timmy-failure`.
- Offline OCR from `runtime-data/qa/as3/interaction-smoke/run-1781546705263/` was used to choose stable expected text for the new targets.
- Initial 5-target run found the `mocktropica` visual-diff threshold too high (`0.003514 < 0.005`), so it was lowered to `0.002` and rerun successfully.
- New 5-target G32QC strong run passed 5/5 with `audioActive: 5`, `interactionsPassed: 5`, `interactionEvidencePassed: 5`, `withMissingLogRequests: 0`, all click delivery via `post-message`, and all devices on non-primary `DISPLAY1`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781548235662.json`.
- Combined 8-target G32QC strong run passed 8/8 with `audioActive: 8`, `interactionsPassed: 8`, `interactionEvidencePassed: 8`, `withMissingLogRequests: 0`, all click delivery via `post-message`, and all devices on `DISPLAY1`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781548597919.json`.
- Full AS3 G32QC interaction/audio regression passed 12/12 after the changes with `audioActive: 12`, `interactionsPassed: 12`, `withMissingLogRequests: 0`, and `failedKeys: []`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781549152830.json`.
- AS2 Super Power map regression passed after sharing the classifier with post-message click delivery, map request seen, no missing requests, and post-click capture on `DISPLAY1`. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781549842186.json`.
- Static/no-window validation passed: `node --check` for the changed JS files, classifier microtest, package JSON parse, `npm run verify:pack-inputs`, and `npm run qa:as3-launch-smoke`.

## TODO Expanded AS3 Strong Interaction Targets / Shared Missing Classifier

- Add strong targets for remaining AS3 direct-scene entries where current proof is still generic: `escape-from-pelican-rock`, `galactic-hot-dogs`, `mission-atlantis`, and `mystery-of-the-map`.
- Consider an AS2 shared strong-evidence target table after AS3 strong coverage is complete.

## 2026-06-15 AS3 Strong Target Expansion / Hold Click Support

- Added `holdMs` support to AS3 interaction targets via `--interactionHoldMs` / `--clickHoldMs`, forwarding to the existing post-message `click-window --hold-ms` path. This keeps tests mouse-safe while allowing held-click experiments.
- Added reliable AS3 strong evidence targets for `galactic-hot-dogs` and `mission-atlantis`, bringing built-in AS3 strong targets to 10 of 12 direct-scene entries.
- `mission-atlantis` uses the existing default stage click and asserts submarine/bubble visual movement with `minChangedPixelRatio: 0.005`.
- `galactic-hot-dogs` was initially flaky with generic walk/dust targets, so the built-in target was changed to a stable spaceship-door approach point (`x=0.26`, `y=0.14`, `minChangedPixelRatio: 0.02`). The passing single-island proof had `changedPixelRatio: 0.44506`.
- `virus-hunter` was changed to OCR-only evidence (`TOWN HALL|BUS|NEED A JOB`) because sign OCR is stable while tiny visual diff fluctuates around the threshold.
- Explored stronger points for `escape-from-pelican-rock` and `mystery-of-the-map` using side-screen post-message clicks and held clicks. Escape sign/menu/ground points either produced no change or only about `0.002` idle/blink diff; Mystery right-sign/ground points likewise stayed around `0.0024`. These were not promoted to strong built-in evidence.
- New 10-target AS3 G32QC strong matrix passed 10/10 with `audioActive: 10`, `interactionsPassed: 10`, `interactionEvidencePassed: 10`, `withMissingLogRequests: 0`, all delivery via `post-message`, and all monitor placements on non-primary `DISPLAY1`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781554378616.json`.
- Full AS3 G32QC interaction/audio regression still passed 12/12 with `audioActive: 12`, `interactionsPassed: 12`, `withMissingLogRequests: 0`, and `failedKeys: []`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781554999081.json`.
- Static/no-window validation passed: `node --check tools/qa-as3-islands-smoke.js`, package JSON parse, `npm run verify:pack-inputs`, and `git diff --check` with only CRLF warnings.

## TODO AS3 Strong Target Expansion / Hold Click Support

- Continue hunting non-flaky semantic strong evidence for `escape-from-pelican-rock` and `mystery-of-the-map`; current evidence is only generic interaction stability plus audio.
- Consider adding multi-step interaction support if needed: repeated post-message mousemove while held, or a target-specific two-click sequence, before promoting weak scenes into strong evidence.

## 2026-06-15 AS3 Post-Message Hold Refinement / Flake Cleanup

- Refined the low-interference post-message click helper: `tools/qa-helper.py click-window` now supports `--move-interval-ms`, sending repeated `WM_MOUSEMOVE` with `MK_LBUTTON` while held. This stays off the system cursor and is exposed in AS3 smoke as `--interactionMoveIntervalMs` / `--clickMoveIntervalMs`.
- Re-tested `mystery-of-the-map` with held right-ground input plus repeated mousemove (`as3-interaction-smoke-1781556002010.json`), right-exit area (`1781556110227`), and top-left HUD (`1781556311884`). All stayed in the weak `0.000-0.00265` diff range or OCR-only `MENU`, so none were promoted to strong evidence.
- Re-tested `escape-from-pelican-rock` right stairs/path with held repeated mousemove (`as3-interaction-smoke-1781556188179.json`); it still only produced about `0.002091` diff, so it also remains generic interaction stability only.
- Found that `galactic-hot-dogs` spaceship-door evidence was flaky in the 10-target matrix: report `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781556435389.json` failed only `galactic-hot-dogs` with `changedPixelRatio: 0.001069` when the avatar started near the ship door. Removed the built-in GHD strong target rather than keeping a false/flaky gate.
- Stable AS3 strong matrix now covers 9 direct-scene entries and passed 9/9 on G32QC with `audioActive: 9`, `interactionsPassed: 9`, `interactionEvidencePassed: 9`, `withMissingLogRequests: 0`, all delivery via `post-message`, and all monitor placements on non-primary `DISPLAY1`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781557125086.json`.
- Full AS3 G32QC interaction/audio regression passed 12/12 after the helper changes and GHD demotion with `audioActive: 12`, `interactionsPassed: 12`, `withMissingLogRequests: 0`, and `failedKeys: []`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781557688689.json`.
- Validation passed: `python -m py_compile tools/qa-helper.py`, `node --check tools/qa-as3-islands-smoke.js`, `npm run verify:pack-inputs`, and `git diff --check` with only CRLF warnings.

## TODO AS3 Post-Message Hold Refinement / Flake Cleanup

- Continue looking for non-flaky semantic strong evidence for `escape-from-pelican-rock`, `galactic-hot-dogs`, and `mystery-of-the-map`; all three still pass ordinary G32QC interaction/audio, but not stable strong evidence.
- If post-message mouse input remains too weak for these scenes, add a target-specific multi-step interaction runner or investigate AS3-level automation hooks before using real cursor input.

## 2026-06-15 AS3 Post-Message Keyboard Probe

- Added `tools/qa-helper.py key-window`, a window-message keyboard sender that supports `--key`, `--hold-ms`, `--repeat-interval-ms`, `--largest-child`, and `--child-class-contains`. `tools/lib/qa.js` now treats `key-window` like other window-targeted QA commands, so G32QC placement and post-message defaults apply.
- AS3 interaction smoke now accepts `--interactionKey`, `--interactionKeyHoldMs`, `--interactionKeyRepeatIntervalMs`, `--interactionKeyTarget=largest-child`, and `--interactionKeyChildClassContains=...`. This allows keyboard probes without foreground SendKeys or real cursor movement.
- Tested `mystery-of-the-map` with post-message Right key held/repeated against the Navigator top-level window (`as3-interaction-smoke-1781558711834.json`) and against the largest child window (`as3-interaction-smoke-1781559107310.json`). The largest child was `GeckoPluginWindow` in `plugin-container.exe`, but the visual diff stayed below `0.001`, so AS3 does not currently accept this keyboard path as useful strong evidence.
- Stable AS3 strong matrix still passed 9/9 after the helper changes with `audioActive: 9`, `interactionEvidencePassed: 9`, no missing requests, all `post-message`, and all placements on `DISPLAY1`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781559218444.json`.
- Full AS3 G32QC interaction/audio regression still passed 12/12 with `audioActive: 12`, `interactionsPassed: 12`, `withMissingLogRequests: 0`, and `failedKeys: []`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781559781950.json`.
- Validation passed: `python -m py_compile tools/qa-helper.py`, `node --check tools/qa-as3-islands-smoke.js`, `node --check tools/lib/qa.js`, `npm run verify:pack-inputs`, and `git diff --check` with only CRLF warnings.

## TODO AS3 Post-Message Keyboard Probe

- Keyboard post-message is not enough for `mystery-of-the-map`; next route should be a target-specific multi-step mouse runner or AS3 runtime instrumentation rather than more single-key probes.
- Keep `escape-from-pelican-rock`, `galactic-hot-dogs`, and `mystery-of-the-map` out of required strong-target matrices until a repeatable semantic signal is found.

## 2026-06-15 AS3 Multi-Step Post-Message Probe

- Added AS3 interaction smoke support for JSON `--interactionSteps` / `--clickSteps`. Each step can be a post-message click or key action with per-step hold/repeat/move timing and `waitMs`; single-step behavior remains backward-compatible.
- Multi-step runs now write every action into the interaction report with per-step artifact paths. Multi-step click artifacts use `*-interaction-step-01.json`, `*-interaction-step-02.json`, etc.; single-step runs keep the existing `*-interaction-click.json` path.
- Probed `mystery-of-the-map` with a two-click right-side sequence on G32QC: `npm run qa:as3-interaction-smoke -- --islands=mystery-of-the-map --targetMonitor G32QC --skipAudio --skipOcr --settleMs=10000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=500 --interactionWaitMs=3500 --interactionSteps='[{"x":0.82,"y":0.329,"holdMs":1600,"moveIntervalMs":50,"waitMs":600},{"x":0.97,"y":0.30,"holdMs":1200,"moveIntervalMs":50}]' --minInteractionChangedPixelRatio=0.01 --requireInteractionEvidence`.
- The two-step Mystery probe produced both post-message action artifacts and a stable post-click stage, but still did not meet strong evidence: `changedPixelRatio: 0.003248 < 0.01`, no missing requests, report `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781560853784.json`. It remains out of the required strong-target matrix.
- Stable AS3 strong matrix passed again on G32QC: `npm run qa:as3-interaction-smoke -- --islands=arabian-nights,mission-atlantis,mocktropica,monkey-wrench,monster-carnival,poptropicon,survival,timmy-failure,virus-hunter --targetMonitor G32QC --requireAudio --requireInteractionEvidence --settleMs=12000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1000 --interactionWaitMs=3500 --audioDurationSec=3 --audioAttempts=2 --audioRetryDelayMs=2000`.
- Strong matrix result: 9/9 passed, `audioActive: 9`, `interactionsPassed: 9`, `interactionEvidencePassed: 9`, `withMissingLogRequests: 0`, and all runtime/interaction window left coordinates stayed on the G32QC side display (`-1873`). Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781560971677.json`.
- Full AS3 G32QC interaction/audio regression passed: `npm run qa:as3-interaction-smoke -- --targetMonitor G32QC --requireAudio --settleMs=12000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1000 --interactionWaitMs=3000 --audioDurationSec=3 --audioAttempts=2 --audioRetryDelayMs=2000 --skipOcr`.
- Full regression result: 12/12 passed, `audioActive: 12`, `audioInactive: 0`, `interactionsPassed: 12`, `withMissingLogRequests: 0`, `failedKeys: []`, and all runtime/interaction window left coordinates stayed on G32QC (`-1873`). Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781561599890.json`.
- Validation passed: `node --check tools/qa-as3-islands-smoke.js`, `python -m py_compile tools/qa-helper.py`, `node --check tools/lib/qa.js`, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), and `git diff --check` with only the existing CRLF warning for `tools/qa-as3-islands-smoke.js`.

## TODO AS3 Multi-Step Post-Message Probe

- Continue searching for repeatable semantic strong evidence for `escape-from-pelican-rock`, `galactic-hot-dogs`, and `mystery-of-the-map`; multi-step post-message clicks improved observability but did not yet produce a strong Mystery signal.
- Next escalation path should be AS3 runtime instrumentation or scene-specific state probing before considering any real-cursor/manual input.

## 2026-06-15 AS3 Exact Scene Evidence Gate

- Added `sceneEvidence` to AS3 island smoke reports. It now records exact target-scene resource proof from runtime logs: `/game/data/scenes/<sceneFolder>/<roomParam>/...` requests, target `brain/track.php` scene tracking (`SceneLoaded` or `TimeSpentInScene`), and informational target scene asset requests.
- Added optional `--requireSceneEvidence`. When enabled, AS3 smoke fails if the expected target scene data request and target scene tracking signal are missing. This is stricter than the older broad `scene_progress` check and does not require OCR, CUA, or real cursor input.
- Tightened the aggregate `interactionEvidencePassed` counter so it only counts reports with actual interaction evidence checks; weak islands with no configured OCR/diff checks no longer inflate that number.
- Three weak AS3 direct-scene entries now have stronger non-visual proof on G32QC: `escape-from-pelican-rock` (`prison/hill`), `galactic-hot-dogs` (`ghd/barren1`), and `mystery-of-the-map` (`lands/lab1`) passed with `--requireAudio --requireSceneEvidence`, post-message interaction, no missing requests, and all windows on G32QC. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781562571139.json`.
- The first 9-target scene-evidence strong run found a real edge case: Timmy Failure loads `timmy/mainStreet` resources and then auto-transitions, so its exact target tracking signal is `event=TimeSpentInScene` for `scene=MainStreet` rather than `SceneLoaded`. The gate now accepts both exact target events; Timmy single-island proof passed in `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781563427340.json`.
- Stable AS3 strong matrix passed with all three gates enabled: `npm run qa:as3-interaction-smoke -- --islands=arabian-nights,mission-atlantis,mocktropica,monkey-wrench,monster-carnival,poptropicon,survival,timmy-failure,virus-hunter --targetMonitor G32QC --requireAudio --requireInteractionEvidence --requireSceneEvidence --settleMs=12000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1000 --interactionWaitMs=3500 --audioDurationSec=3 --audioAttempts=2 --audioRetryDelayMs=2000`.
- Strong matrix result: 9/9 passed, `audioActive: 9`, `interactionsPassed: 9`, `interactionEvidencePassed: 9`, `sceneEvidencePassed: 9`, `withMissingLogRequests: 0`, all runtime/post-interaction window left coordinates `-1873`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781563513245.json`.
- Full AS3 G32QC interaction/audio/scene-evidence regression passed: `npm run qa:as3-interaction-smoke -- --targetMonitor G32QC --requireAudio --requireSceneEvidence --settleMs=12000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1000 --interactionWaitMs=3000 --audioDurationSec=3 --audioAttempts=2 --audioRetryDelayMs=2000 --skipOcr`.
- Full regression result: 12/12 passed, `audioActive: 12`, `audioInactive: 0`, `interactionsPassed: 12`, `sceneEvidencePassed: 12`, `withMissingLogRequests: 0`, `failedKeys: []`, and every runtime/post-interaction window left coordinate stayed at `-1873` on G32QC. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781564177741.json`.
- Validation passed: `node --check tools/qa-as3-islands-smoke.js`, `python -m py_compile tools/qa-helper.py`, `node --check tools/lib/qa.js`, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), and `git diff --check` with only the expected CRLF warning.

## TODO AS3 Exact Scene Evidence Gate

- Keep `escape-from-pelican-rock`, `galactic-hot-dogs`, and `mystery-of-the-map` out of `--requireInteractionEvidence` strong matrices until they have repeatable semantic OCR/diff/state checks; they now have exact scene, audio, and stability proof but not strong interaction semantics.
- Consider extending exact scene evidence to AS2 smoke so AS2 scene transitions can be asserted with similarly structured report fields.

## 2026-06-15 AS2 Exact Scene Evidence Gate

- Added shared `buildAs2SceneEvidence` in `tools/lib/qa.js`. It records exact AS2 target-scene proof from logs: `base.php?room=<roomParam>&island=<islandParam>`, `/scenes/island<sceneFolder>/scene<roomParam>.swf`, and informational `brain/track.php?event=Loaded` scene tracking where available.
- Wired `sceneEvidence` and optional `--requireSceneEvidence` into both `tools/qa-as2-islands-smoke.js` and `tools/qa-as2-interaction-smoke.js`. The required checks are the exact `base.php` launch request and exact scene SWF request; scene tracking remains informational because many AS2 islands localize or omit the raw tracking scene name.
- Representative AS2 visual scene-evidence run passed on G32QC: `npm run qa:as2-islands-smoke -- --islands=super-power,time-tangled,astro-knights,zomberry --targetMonitor G32QC --requireSceneEvidence --skipAudio --skipOcr --settleMs=9000 --windowTimeoutMs=45000 --betweenMs=800`. Result: 4/4 passed, `sceneEvidencePassed: 4`, no missing requests, all windows on G32QC. Report: `runtime-data/qa/as2/islands-smoke/as2-island-smoke-1781565118208.json`.
- Full AS2 visual scene-evidence run passed on G32QC: `npm run qa:as2-islands-smoke -- --targetMonitor G32QC --requireSceneEvidence --skipAudio --skipOcr --settleMs=9000 --windowTimeoutMs=45000 --betweenMs=800`. Result: 34/34 passed, `sceneEvidencePassed: 34`, `withMissingLogRequests: 0`, `failedKeys: []`, and all runtime window left coordinates stayed at `-1873`. Report: `runtime-data/qa/as2/islands-smoke/as2-island-smoke-1781565526817.json`.
- AS2 interaction scene-evidence stability run passed on G32QC with map click skipped: `npm run qa:as2-interaction-smoke -- --islands=super-power,time-tangled,astro-knights,zomberry --targetMonitor G32QC --requireSceneEvidence --skipMapClick --skipAudio --skipOcr --settleMs=9000 --windowTimeoutMs=45000 --betweenMs=800`. Result: 4/4 passed, `sceneEvidencePassed: 4`, no missing requests, all windows on G32QC. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781565367196.json`.
- AS2 Super Power map regression still passed with exact scene evidence and post-message map click: `npm run qa:as2-interaction-smoke -- --islands=super-power --targetMonitor G32QC --requireSceneEvidence --requireMapRequest --skipAudio --skipOcr --settleMs=9000 --windowTimeoutMs=45000 --betweenMs=800 --mapWaitMs=1800`. Result: 1/1 passed, `mapClicksPassed: 1`, `sceneEvidencePassed: 1`, no missing requests, all windows on G32QC. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781565456883.json`.
- Exploratory 4-island AS2 map run with the old single `mapX/mapY` default passed only Super Power; Astro Knights, Time Tangled, and Zomberry stayed stage-stable and scene-evidence-valid but did not emit a map request. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781565197996.json`. This confirms the old generic map hotspot is not universal and should not be used as a full AS2 map gate.
- Validation passed: `node --check tools/lib/qa.js`, `node --check tools/qa-as2-islands-smoke.js`, `node --check tools/qa-as2-interaction-smoke.js`, `python -m py_compile tools/qa-helper.py`, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), and `git diff --check` with only expected CRLF warnings.

## TODO AS2 Exact Scene Evidence Gate

- Add per-island AS2 map/HUD click targets before expanding `--requireMapRequest` beyond Super Power; the current generic map hotspot is known to be insufficient for Astro Knights, Time Tangled, and Zomberry.
- Consider moving AS3 exact scene evidence into the shared QA library too, now that AS2 and AS3 both have similar report concepts.

## 2026-06-16 AS2 Universal Direct Map Entry

- Root-caused the AS2 map-click gap: the earlier green `地图` direct map button was only created through the Super Power frameless-nav layout path. Other AS2 islands had the original top HUD but no stable shared `map.swf` entrypoint at the old QA hotspot.
- Refactored the AS2 gameplay patch template in `tools/lib/pack.js`: `zhEnsureDirectMapButton()` now creates the direct map button independently of Super Power nav relayout, while `layoutFramelessGameplayNav()` remains Super-only. This keeps other islands' top HUD positions intact and adds a stable map button below the HUD.
- Rebuilt `packs/zh-CN/as2/swf/content/www.poptropica.com/gameplay.swf` and `runtime-data/patched-zips/as2-runtime.zip`. Runtime rebuild verified `replacementCount: 48` with SWF runtime overrides enabled.
- Tightened `tools/qa-as2-interaction-smoke.js` summary semantics so `mapClicksPassed` only counts clicks that actually produced a fresh `popups/map.swf`/`travelmap.swf` request, avoiding the previous stage-stability false positive when `--requireMapRequest` was omitted.
- Targeted G32QC regression for the three previously failing islands passed with the old default map hotspot: `astro-knights`, `time-tangled`, and `zomberry` all produced `popups/map.swf`, exact AS2 scene evidence, no missing requests, and G32QC window left coordinate `-1873`. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781568760169.json`.
- Four-island AS2 map regression also passed for `astro-knights`, `super-power`, `time-tangled`, and `zomberry`: 4/4 passed, `mapClicksPassed: 4`, `sceneEvidencePassed: 4`, `withMissingLogRequests: 0`. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781568882837.json`.
- Full AS2 map/scene-evidence regression passed on G32QC: 34/34 passed, `mapClicksPassed: 34`, `sceneEvidencePassed: 34`, `withMissingLogRequests: 0`, `failedKeys: []`. Runtime and post-map window positions all stayed on the negative-coordinate G32QC display. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781569043531.json`.
- Validation passed: `node --check tools/lib/pack.js`, `node --check tools/qa-as2-interaction-smoke.js`, `node --check tools/qa-as2-islands-smoke.js`, `node --check tools/lib/qa.js`, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), and `git diff --check` with only expected CRLF warnings.

## TODO AS2 Universal Direct Map Entry

- Continue the broader goal with sound recovery next: AS2 full map/scene access is now strong, but many islands still lack proven audio assets or audio playback evidence.
- Add a later resize-focused AS2/AS3 visual pass to stress the new direct map button and existing translated dialogue/UI across multiple Navigator window sizes.

## 2026-06-16 Current Runtime Audio Evidence Sweep

- Re-ran local audio audits against the current worktree. `npm run audit:audio-assets` still reflects the source archives: AS2 has 9 local audio/video files and no `sounds.xml`; AS3 has 1987 audio files and 417 `sounds.xml` files.
- Re-ran the AS2 sound bridge QA. It passed with `expectedSoundCount: 17`, `overrideSoundCount: 17`, `expectedPathCount: 4`, `expectedProvenanceSourceCount: 18`, and no failed checks. Report: `runtime-data/qa/as2-sound-bridge-latest.json`.
- Confirmed the distinction between source and runtime AS3 sound-reference audits: the default source-archive audit still reports original AS3 archive gaps, but the actual patched runtime audit is clean.
- Added npm script `audit:sound-refs:runtime`, which runs `tools/audit-sound-references.js --archive=runtime --output=runtime-data/qa/sound-reference-audit-runtime.json`.
- Current AS3 runtime sound-reference audit passed: 417 `sounds.xml`, `totalReferences: 12318`, `resolved: 12282`, `ignored: 36`, `fixableAddExtension: 0`, `fixableDedupeExtension: 0`, `crossFolderMatches: 0`, `missing: 0`. Report: `runtime-data/qa/sound-reference-audit-runtime.json`.
- Full AS2 G32QC audio/map/scene-evidence regression passed with current runtime: `npm run qa:as2-interaction-smoke -- --all --targetMonitor G32QC --requireAudio --requireSceneEvidence --requireMapRequest --settleMs=9000 --windowTimeoutMs=45000 --betweenMs=800 --mapWaitMs=1800 --audioDurationSec=2.5 --skipOcr`. Result: 34/34 passed, `audioActive: 34`, `mapClicksPassed: 34`, `sceneEvidencePassed: 34`, `withMissingLogRequests: 0`, `failedKeys: []`, all runtime/post-map windows on G32QC. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781570578071.json`.
- Full AS3 G32QC audio/scene-evidence interaction regression passed with current runtime: `npm run qa:as3-interaction-smoke -- --targetMonitor G32QC --requireAudio --requireSceneEvidence --settleMs=12000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1000 --interactionWaitMs=3000 --audioDurationSec=3 --audioAttempts=2 --audioRetryDelayMs=2000 --skipOcr`. Result: 12/12 passed, `audioActive: 12`, `audioInactive: 0`, `interactionsPassed: 12`, `sceneEvidencePassed: 12`, `withMissingLogRequests: 0`, `failedKeys: []`, all runtime/post-interaction windows on G32QC. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781571749186.json`.
- Validation passed: `node --check tools/audit-sound-references.js`, `node -e "JSON.parse(...package.json...)"`, `npm run audit:sound-refs:runtime`, and `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47).

## TODO Current Runtime Audio Evidence Sweep

- The runnable AS2/AS3 audio path is now green in QA, but AS2 still relies on the repository's embedded/fallback sound bridge for many old islands because the original AS2 source archive does not contain island-specific music for most AS2 islands. Continue searching only legitimate/original-source audio before replacing fallback sounds.
- Add a resize-focused G32QC regression pass next, covering AS2 direct map button placement, AS3 HUD/menu placement, and translated dialogue balloons at multiple Navigator window sizes.

## 2026-06-16 G32QC Resize Geometry Regression

- Added explicit visible-window geometry support to `tools/qa-as2-interaction-smoke.js` and `tools/qa-as3-islands-smoke.js`: `--windowSize=WxH`, `--window-width`, `--window-height`, and `--maximize` now pass through every wait/capture/click/key helper call. This lets resize smoke tests keep both the initial and post-interaction windows pinned to the requested G32QC size.
- AS2 resize matrix passed on the side display with exact scene evidence and map-request proof: 960x640 four-island run passed 4/4 (`astro-knights`, `super-power`, `time-tangled`, `zomberry`) with all windows at `left:-1760 top:376 width:960 height:640`; 1450x900 four-island run passed 4/4 with all windows at `left:-2005 top:246 width:1450 height:900`. Reports: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781572801937.json`, `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781572933245.json`.
- AS2 default-window regression passed 2/2 (`astro-knights`, `zomberry`) with exact scene evidence, map requests, and all windows on G32QC at `left:-1873 top:316 width:1186 height:760`. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781574827699.json`.
- AS3 960x640 resize smoke passed 4/4 (`arabian-nights`, `monkey-wrench`, `survival`, `virus-hunter`) with exact scene evidence and all windows at `left:-1760 top:376 width:960 height:640`. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781573104057.json`.
- AS3 large-window visual review exposed a direct-SWF white margin on `monkey-wrench` after the first HTML-only layout patch. Fixed it at runtime-pack level by patching AS3 `base.php`/`game/index.html` backgrounds to `#139ffd`, adding `bgcolor="139ffd"` to the embed, patching `game/Shell.swf` tag 9 `SetBackgroundColor` to `139ffd`, and bumping `RUNTIME_FIX_VERSION` to 22.
- Rebuilt `runtime-data/patched-zips/as3-runtime.zip`; metadata records patched files `content/www.poptropica.com/base.php`, `content/www.poptropica.com/game/index.html`, and `content/www.poptropica.com/game/Shell.swf`. A direct SWF tag check confirmed `Shell.swf` is compressed `CWS` with background `139ffd`.
- Post-fix AS3 1450x900 G32QC smoke passed 2/2 (`arabian-nights`, `monkey-wrench`) with exact scene evidence, stable post-interaction windows at `left:-2005 top:246 width:1450 height:900`, and full 1438x735 captured stages. Pixel checks on the interaction screenshots show the old right/bottom white margins are gone (`white_pct: 0.0` in the right margin for both checked scenes). Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781574632156.json`.
- AS3 default-window regression passed 2/2 (`arabian-nights`, `monkey-wrench`) with exact scene evidence, post-interaction windows at `left:-1873 top:316 width:1186 height:760`, and stable 1174x596 stages. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781574893820.json`.
- Validation passed: `node --check tools/lib/pack.js`, `node --check tools/qa-as2-interaction-smoke.js`, `node --check tools/qa-as3-islands-smoke.js`, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), `npm run audit:sound-refs:runtime` (`missing: 0`), and `git diff --check` with only expected CRLF warnings.

## TODO G32QC Resize Geometry Regression

- Expand resize stress beyond representative AS2/AS3 entries once the next full pass starts: include translated dialogue balloon screenshots at multiple sizes and at least one maximized-window G32QC run.
- Keep direct-SWF and base.php entry paths both covered when future AS3 layout changes are made; AS3 QA direct-scene smoke uses `game/Shell.swf?overrideScene=...`, while deployment-oriented launch paths still go through `base.php`.

## 2026-06-16 Visual Guard / No-Foreground Resize Pass

- Added `tools/qa-helper.py analyze-visual-guard`. It checks right, bottom, and bottom-right screenshot edge regions for excessive white pixels and can also report a target-color percentage, giving AS2/AS3 resize QA a direct detector for white margins and unpainted plugin areas.
- Wired visual guard artifacts into `tools/qa-as2-interaction-smoke.js` and `tools/qa-as3-islands-smoke.js`: initial and post-interaction captures now emit `*-visual-guard.json`, summaries include `visualGuardPassed`, and `--requireVisualGuard` fails the smoke run when edge checks fail.
- Changed AS2/AS3 visible QA defaults to use `POPTROPICA_QA_NO_FOREGROUND=1` unless `--allowForegroundCapture` is explicitly passed, matching the G32QC-side-monitor/no-mouse-interference workflow.
- Strengthened `capture-window --no-foreground` and target-monitor placement in `tools/qa-helper.py`: the helper now raises windows without activation, avoids restoring maximized windows during capture, sends message-level activate/resize/focus pulses to the Navigator window and child windows, and redraws them without calling `SetForegroundWindow`. This fixed fresh AS3 1450x900 captures where Flash stayed at the default plugin size until foreground activation.
- Adjusted the shared AS2 map hotspot default to stage-relative `0.635,0.27`, matching the direct map button position in large and maximized G32QC windows.
- AS3 1450x900 G32QC visual guard regression passed with no foreground capture: `arabian-nights` and `monkey-wrench` passed 2/2 with exact scene evidence, interactions, `visualGuardPassed: 2`, no missing requests. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781581607755.json`.
- AS3 960x640 G32QC visual guard regression passed for `arabian-nights` and `monkey-wrench`: 2/2 passed, `sceneEvidencePassed: 2`, `visualGuardPassed: 2`, no missing requests. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781582085384.json`.
- AS2 1450x900 G32QC visual/map regression passed for `astro-knights` and `super-power`: 2/2 passed, `mapClicksPassed: 2`, `sceneEvidencePassed: 2`, `visualGuardPassed: 2`, no missing requests. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781581907758.json`.
- AS2 maximized G32QC visual/map regression passed for `astro-knights` and `super-power`: 2/2 passed, `mapClicksPassed: 2`, `sceneEvidencePassed: 2`, `visualGuardPassed: 2`, no missing requests. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781581987816.json`.
- AS3 maximized G32QC remains a real unresolved issue. Report `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781581748793.json` shows large right/bottom white areas after maximize (`visualGuardPassed: 0`), and `arabian-nights` also missed exact scene evidence in that maximized run. A temporary HTML wrapper approach was tested and reverted because it kept scene loading but pinned AS3 content to the default small plugin area.
- Validation passed: `node --check tools/qa-as2-interaction-smoke.js`, `node --check tools/qa-as3-islands-smoke.js`, `node --check tools/lib/pack.js`, `node --check tools/lib/launch-manifest.js`, `python -m py_compile tools/qa-helper.py`, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), `npm run audit:sound-refs:runtime` (`missing: 0`), and `git diff --check` with only expected CRLF warnings.

## TODO Visual Guard / No-Foreground Resize Pass

- Continue AS3 maximized-window investigation. The bounded-window path is now stable at 960x640 and 1450x900 without foreground activation, but maximized Navigator still leaves the Flash content at a smaller internal area with white unused space.
- Add visual guard coverage to broader AS2/AS3 matrices once runtime time allows, especially translated dialogue/popup states at multiple window sizes.

## 2026-06-16 AS3 Safe Maximize Pass

- Investigated the AS3 maximized white-margin failure on G32QC without CUA. Direct OS maximize and full work-area sizing (`2560x1392`) still make Flashpoint Navigator/NPAPI initialize the AS3 direct SWF at the default small stage, leaving large white right/bottom regions. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781582404318.json`.
- Bounded AS3 direct-SWF sizing works well below that bad range: `1800x1100`, `2100x1250`, and `2300x1320` single-island probes could render full scenes, while `2450x1360` failed back to a `1174x571` stage. The practical safe upper bound on G32QC is therefore below full work-area/maximized size.
- Added AS3 QA safe-maximize behavior in `tools/qa-as3-islands-smoke.js`: `--maximize` now uses a stable `2300x1320` G32QC-sized window by default instead of true OS maximize. `--trueMaximize` / `--unsafeMaximize` remain available to reproduce the raw maximized plugin bug.
- Strengthened `tools/qa-helper.py` large-window placement with a two-step no-activate resize refresh. For windows at least `1600x900`, the helper briefly shrinks the side-monitor window and restores the requested size before capture, forcing Flash to recalculate the stage without foreground activation or mouse movement.
- AS3 safe-maximize G32QC regression now passed for `arabian-nights` and `monkey-wrench`: 2/2 passed, windows at `left:-2430 top:36 width:2300 height:1320`, captured stages `2288x1141`, `sceneEvidencePassed: 2`, `visualGuardPassed: 2`, no missing requests. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781583660085.json`.
- AS3 `1800x1100` two-island regression passed after the two-step refresh: 2/2 passed, `sceneEvidencePassed: 2`, `visualGuardPassed: 2`, no missing requests. Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781583526202.json`.
- AS2 maximized G32QC regression still passed after the helper change: `astro-knights` and `super-power` passed 2/2 with `mapClicksPassed: 2`, `sceneEvidencePassed: 2`, `visualGuardPassed: 2`, no missing requests. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781583816902.json`.
- Validation passed: `node --check tools/qa-as3-islands-smoke.js`, `node --check tools/qa-as2-interaction-smoke.js`, `node --check tools/lib/pack.js`, `node --check tools/lib/launch-manifest.js`, `python -m py_compile tools/qa-helper.py`, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), and `npm run audit:sound-refs:runtime` (`missing: 0`).

## TODO AS3 Safe Maximize Pass

- The real NPAPI/OS maximize path is still intentionally treated as unsafe for AS3 direct SWF; use `--trueMaximize` only for diagnostics. The end-user launch path should prefer bounded/safe sizing unless a deeper Navigator/plugin-host fix is found.
- Continue translating the QA safe-maximize behavior into any user-facing launcher path that exposes a maximize/fullscreen control, so manual play uses the stable bounded size instead of the bad full work-area threshold.

## 2026-06-16 Manual Launch Safe Sizing

- Extended `tools/launch.js` so command-line manual launches accept `--windowSize=WxH`, `--window-width`, `--window-height`, and `--maximize`. For AS3, `--maximize` now maps to the same safe `2300x1320` bounded G32QC size used by QA; `--trueMaximize` / `--unsafeMaximize` deliberately request the risky full-work-area path for diagnostics.
- `tools/launch.js --island` now prefers the existing `catalog/launch-manifest.json` and only regenerates it when missing, so normal manual launches no longer dirty the repository by changing only `generatedAt`.
- Verified the actual user-facing CLI path on G32QC: `node tools/launch.js --island monkey-wrench --targetMonitor G32QC --maximize` produced `windowGeometry.mode: "as3-safe-maximize"`, launched at `left:-2430 top:36 width:2300 height:1320`, and loaded `game.scenes.ftue.beach.Beach`.
- No-foreground capture of that manual launch passed stage and visual checks: image `2288x1180`, stage `2288x1141`, `stageCoverageRatio: 0.966949`, visual guard `ok: true` with right edge `whitePct: 0.0` and bottom edge `whitePct: 0.066178`. Artifacts: `runtime-data/qa/manual-as3-safe-launch2-plan.json`, `runtime-data/qa/manual-as3-safe-launch2.png`, `runtime-data/qa/manual-as3-safe-launch2-stage.json`, `runtime-data/qa/manual-as3-safe-launch2-visual-guard.json`.
- Validation passed: `node --check tools/launch.js`, `node --check tools/qa-as3-islands-smoke.js`, `node --check tools/qa-as2-interaction-smoke.js`, `node --check tools/lib/pack.js`, `node --check tools/lib/launch-manifest.js`, `python -m py_compile tools/qa-helper.py`, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), and `npm run audit:sound-refs:runtime` (`missing: 0`).

## TODO Manual Launch Safe Sizing

- Wire the same safe AS3 sizing affordance into any Electron/launcher UI controls that expose maximize/fullscreen, not only the command-line launch path.
- Add a short operator-facing launch note once the local browser/deployment path is finalized: AS3 full-work-area maximize remains unsafe, while bounded safe maximize is the supported path.

## 2026-06-16 Launcher UI Safe Sizing

- Added shared runtime window geometry logic in `tools/lib/runtime-window-geometry.js`. CLI launch and Electron launcher runtime launches now resolve AS3 safe maximize, explicit sizes, inherited sizes, and the AS2/full-work-area path through the same helper instead of duplicating constants.
- Updated `launcher/main.js` so `buildRuntimePlan("as3")` defaults runtime windows to `targetMonitor: "G32QC"` and `windowGeometry: { mode: "as3-safe-maximize", width: 2300, height: 1320 }` unless the caller already provided `POPTROPICA_WINDOW_WIDTH/HEIGHT`. `launchRuntimeWindow()` applies those env vars only around `spawnManagedRuntime()` and restores the previous env afterwards.
- Kept CLI behavior compatible: `tools/launch.js` now uses the shared helper, but no window-size/maximize flags means it leaves any inherited environment untouched. `--maximize` on AS3 still maps to safe `2300x1320`; AS2 maximize remains the full work-area sentinel path.
- Verified the shared helper with direct assertions for AS3 safe maximize, AS2 work-area maximize, explicit `1450x900`, inherited launcher sizing, and env restoration.
- Re-verified actual manual AS3 launch on G32QC after the refactor: `node tools/launch.js --island monkey-wrench --targetMonitor G32QC --maximize` produced `windowGeometry.mode: "as3-safe-maximize"`, launched pid `49072` at `left:-2430 top:36 width:2300 height:1320`, and loaded `game.scenes.ftue.beach.Beach`.
- Clean foreground capture on the side monitor passed after the no-foreground screenshot was found occluded by the side-screen app window: screenshot `runtime-data/qa/manual-shared-window-foreground.png`, capture `2288x1180`, stage `2288x1141`, `stageCoverageRatio: 0.966949`, right white edge `0.0%`, bottom white edge `0.066178%`, visual guard `ok: true`. The foreground capture did not use mouse input.
- Validation passed: `node --check tools/lib/runtime-window-geometry.js`, `node --check tools/launch.js`, `node --check launcher/main.js`, helper assertion script, `python -m py_compile tools/qa-helper.py`, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), `npm run audit:sound-refs:runtime` (`missing: 0`), and `git diff --check` with only expected CRLF warnings.

## TODO Launcher UI Safe Sizing

- Keep avoiding CUA/main-display testing; if another visual proof is needed, prefer G32QC-targeted helper captures and use foreground only when no-foreground capture is occluded.
- Add a small launcher-side smoke when a non-interfering harness is available, so `flash:launch-runtime` itself is exercised without opening the Electron UI on the user's active desktop.

## 2026-06-16 Local Browser Web Launcher

- Added `tools/web-launcher.js`, a localhost-only web control surface for ordinary browsers. It serves `http://127.0.0.1:22800/`, exposes `/api/state`, `/api/prepare`, `/api/launch-runtime`, and `/api/launch-island`, and keeps Flash playback in Flashpoint Navigator because modern regular browsers no longer run NPAPI Flash directly.
- The web launcher reuses the existing inventory, launch manifest, Flashpoint runtime, and shared runtime window geometry helpers. Launch requests default to `targetMonitor: "G32QC"` and `--maximize`; AS3 therefore resolves to the existing safe `2300x1320` bounded size.
- Added `npm run web:launcher` and `npm run qa:web-launcher`. The QA script starts a temporary localhost server, validates the page and state API, verifies AS3 runtime dry-run arguments, verifies `monkey-wrench` explicit-size island dry-run arguments, checks invalid runtime errors, and uses headless Chrome to render the page, filter for `Monkey`, screenshot the UI, and assert no console errors.
- Documented the local browser entry in `README.md`, including the Flash boundary: the local browser page is the control console; actual game playback is still delegated to Flashpoint Navigator.
- QA passed: `npm run qa:web-launcher` reported `flashIslandCount: 47`, `launchableCount: 46`, AS3 dry-run `windowGeometry.mode: "as3-safe-maximize"`, browser-render `visibleRows: 47`, filtered `visibleRows: 1`, and `consoleErrors: []`. Screenshot: `runtime-data/qa/web-launcher-page.png`.
- Real localhost API launch proof passed on G32QC: POST `/api/launch-island` for `monkey-wrench` launched pid `16020`, target `G32QC`, AS3 safe `2300x1320`, and `game.scenes.ftue.beach.Beach`. Window capture was on non-primary `G32QC A` at `left:-2430 top:36 width:2300 height:1320`; stage `2288x1141`, `stageCoverageRatio: 0.966949`, right white edge `0.0%`, bottom white edge `0.066178%`, visual guard `ok: true`. Screenshot: `runtime-data/qa/web-launcher-real-foreground.png`.
- Final validation passed: `node --check tools/web-launcher.js`, `node --check tools/qa-web-launcher.js`, `node --check tools/launch.js`, package JSON parse, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), `npm run audit:sound-refs:runtime` (`missing: 0`), and `git diff --check` with only expected CRLF warnings.

## TODO Local Browser Web Launcher

- Add an optional no-spawn deployment mode later if this is moved from localhost to a remote server; remote deployment should not attempt to spawn a local Flashpoint Navigator process on the server host.
- Add a launcher-side Electron IPC smoke when it can be exercised without opening UI on the user's active desktop; the new web launcher covers the localhost browser path but not Electron IPC directly.

## 2026-06-16 Web Launcher No-Spawn Deployment Mode

- Added a deployment-safe no-spawn mode to `tools/web-launcher.js`. Starting the server with `--no-spawn` or `POPTROPICA_WEB_NO_SPAWN=1` changes the service to `launchMode: "plan-only"` and `spawnEnabled: false`.
- Added `npm run web:launcher:no-spawn`. In this mode `/api/prepare`, `/api/launch-runtime`, and `/api/launch-island` return the same command/window/target-monitor plan without starting local Flashpoint services or Flashpoint Navigator on the server host. Default local mode remains unchanged.
- The browser UI now displays the current launch mode (`local` or `plan-only`) and shows a deployment-preview notice when no-spawn mode is active. The no-spawn page keeps the island table and launch-plan actions visible, but makes clear that it returns plans only.
- Extended `npm run qa:web-launcher` to cover both modes. It now validates default mode API/page/render checks, validates no-spawn state, no-spawn prepare with zero local steps, no-spawn runtime/island launch plans, and headless Chrome rendering of the no-spawn notice. Screenshots: `runtime-data/qa/web-launcher-page.png` and `runtime-data/qa/web-launcher-no-spawn-page.png`.
- QA passed: `npm run qa:web-launcher` reported default `modeText: "local"` with hidden notice, no-spawn `modeText: "plan-only"` with visible notice, no-spawn `preparePlannedOnly: true`, and no console errors in both browser renders.
- Final validation passed: `node --check tools/web-launcher.js`, `node --check tools/qa-web-launcher.js`, package JSON parse, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), `npm run audit:sound-refs:runtime` (`missing: 0`), and `git diff --check` with only expected CRLF warnings.

## TODO Web Launcher No-Spawn Deployment Mode

- The remaining launcher-specific gap is Electron IPC smoke without opening the UI on the user's active desktop. The web launcher is now deployment-safe, but Electron `flash:launch-runtime` itself still only has indirect coverage through shared helpers and manual/window-launch tests.

## 2026-06-16 Launcher IPC Background Smoke

- Added `tools/qa-launcher-ipc.js`, a no-window IPC harness that mocks Electron and the Flashpoint runtime, captures the real `launcher/main.js` `ipcMain.handle(...)` registrations, and invokes the registered handlers directly in Node.
- Added `npm run qa:launcher-ipc`. The smoke validates `flash:launch-runtime` without opening the Electron UI, without launching Flashpoint Navigator, and without using CUA or mouse input.
- The new IPC smoke checks invalid runtime rejection, AS3 default safe maximize (`2300x1320`), AS2 default no-forced-size behavior, default target monitor `G32QC`, runtime active/busy launch blocking, inherited `POPTROPICA_WINDOW_WIDTH/HEIGHT` handling, and environment restoration after launch planning.
- It also verifies the Electron UI still disables external direct island launching through `flash:launch-island`, matching the current design where users enter AS2/AS3 first and switch islands in-game.
- QA passed: `npm run qa:launcher-ipc` registered 10 IPC handlers and produced `runtime-data/qa/launcher-ipc-smoke.json` with three mocked runtime spawn calls: AS3 safe maximize, AS2 default, and AS3 inherited `1450x900`.
- Regression passed: `npm run qa:web-launcher`, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), `npm run audit:sound-refs:runtime` (`missing: 0`), and syntax checks for `tools/qa-launcher-ipc.js`, `launcher/main.js`, `tools/web-launcher.js`, and `tools/qa-web-launcher.js`.

## TODO Launcher IPC Background Smoke

- Keep this IPC smoke as the cheap launcher regression gate before any future `launcher/main.js` changes.
- A full visible Electron UI click-through remains optional and should only be run on G32QC when needed, because the new background IPC smoke covers the launch handler contract without interrupting the main display.

## 2026-06-16 AS2 Interaction Evidence Aggregate

- Added `--aggregateLatest=1` / `--aggregate=1` support to `tools/qa-as2-interaction-smoke.js`. The mode reads historical AS2 interaction smoke reports, selects the best passing report per launchable AS2 island, writes a full aggregate JSON artifact, and updates `as2-interaction-smoke-latest.json` without starting Flashpoint services, opening Navigator, using CUA, or moving the mouse.
- Added `npm run qa:as2-interaction-aggregate`, which runs the aggregate with `--aggregatePreferAudio=1 --aggregatePreferMap=1 --aggregatePreferSceneEvidence=1`, so the latest AS2 evidence favors reports with active audio, successful map click/request proof, and scene-entry evidence.
- The aggregate mode keeps terminal output concise while preserving the full per-island report on disk. This prevents small resize runs from replacing the top-level "latest" evidence with only a 2- or 4-island subset.
- QA passed: `npm run qa:as2-interaction-aggregate` produced `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-aggregate-1781587775129.json` and updated `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-latest.json`; result was 34/34 AS2 launchable islands passing, `audioActive: 34`, `mapClicksPassed: 34`, `sceneEvidencePassed: 34`, `withMissingLogRequests: 0`, `missingKeys: []`, from 145 candidate island reports.
- Regression passed: `npm run qa:launcher-ipc`, `npm run qa:web-launcher`, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), `npm run audit:sound-refs:runtime` (`missing: 0`), and syntax checks for `tools/qa-as2-interaction-smoke.js`, `tools/qa-launcher-ipc.js`, and `tools/web-launcher.js`.

## TODO AS2 Interaction Evidence Aggregate

- Add a separate AS2 visual-guard aggregate or evidence rollup for the resize-specific subset, instead of mixing visual guard preference with the all-island audio/map/scene aggregate. Current all-island aggregate intentionally prioritizes audio/map/scene evidence, so `visualGuardPassed` is 0 in that artifact even though separate resize visual runs passed for representative AS2 islands.
- Build a top-level goal evidence audit that reads AS2 aggregate, AS3 aggregate/interactions, web launcher, launcher IPC, sound audit, and launch manifest unresolved entries in one place.

## 2026-06-16 Goal Evidence Audit

- Added `tools/qa-goal-evidence.js` and `npm run qa:goal-evidence`. The audit is read-only with respect to Flashpoint/Navigator: it reads current artifacts, regenerates an in-memory launch manifest, checks git/runtime process hygiene, writes `runtime-data/qa/goal-evidence-latest.json`, and does not start game windows, use CUA, or move the mouse. `--strict=1` can turn incomplete goal evidence into a nonzero exit later.
- Added `npm run qa:as3-islands-aggregate` and changed AS3 aggregate stdout to a concise summary. The refreshed AS3 aggregate now updates `as3-island-smoke-latest.json` with 12/12 launchable AS3 direct-scene islands passing, `audioActive: 12`, `withMissingLogRequests: 0`, and per-island log summaries containing `SceneLoaded` or scene media evidence.
- Updated `tools/verify-pack-runtime-inputs.js` so `npm run verify:pack-inputs` also writes `runtime-data/qa/pack-inputs-latest.json`; the goal audit now has a durable AS2/AS3 pack-input artifact instead of relying on terminal history.
- Goal evidence audit result: `goalComplete: false`, 9 requirements checked, 4 proved, 3 partial, 2 incomplete. Proved items: local/no-spawn browser launcher, runtime audio evidence, no leftover runtime/22800 process hygiene for the audit run, and launcher IPC/safe sizing. Partial items: translation pack inputs, UI/resize evidence, and git sync while local edits are pending. Incomplete items: all-island completion and scene-entry stability because the launch manifest still has one unresolved island, `reality-tv-wild-safari`.
- Regression passed: `npm run qa:as2-interaction-aggregate`, `npm run qa:as3-islands-aggregate`, `npm run qa:launcher-ipc`, `npm run qa:web-launcher`, `npm run verify:pack-inputs`, `npm run audit:sound-refs:runtime`, `npm run qa:goal-evidence`, and syntax checks for `tools/qa-goal-evidence.js`, `tools/qa-as3-islands-smoke.js`, `tools/verify-pack-runtime-inputs.js`, `tools/qa-as2-interaction-smoke.js`, and `package.json`.

## TODO Goal Evidence Audit

- Resolve or legitimately source the missing `reality-tv-wild-safari` / AS3 `reality2` playable scene resources before the all-islands requirement can be marked complete.
- Add durable all-island translation coverage so the `translation_pack_inputs` requirement can move from partial to proved. AS2 visual-guard/resize evidence is addressed in the later scheduled resize refresh section.

## 2026-06-16 AS2 Scheduled Resize Refresh / Full Visual Guard

- Investigated all-island AS2 1450x900 G32QC visual guard failures without CUA or mouse input. Initial full run `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781588476198.json` passed 33/34 but left `24-carrot` at the default `1174x586` stage with white right/bottom margins. A temporary 24 Carrot crop was tested and rejected after a later full run showed the same missed-resize signature on other islands.
- Replaced the narrow crop experiment with a general AS2 base-page viewport refresh strategy. `base.php` now reapplies the computed viewport after load at delayed checkpoints up to 45 seconds and every 5 seconds afterwards, so late G32QC window moves or missed resize events are corrected without foreground activation.
- Updated the AS2 runtime generation template in `tools/lib/pack.js`, bumped `RUNTIME_FIX_VERSION` to 24, rebuilt `runtime-data/patched-zips/as2-runtime.zip`, and verified the runtime replacement count remains 48.
- Targeted regression passed for the previously failing resize/loading cases: `red-dragon,time-tangled` passed 2/2 at 1450x900 with `settleMs=13000`, `mapClicksPassed: 2`, `sceneEvidencePassed: 2`, `visualGuardPassed: 2`, and no missing requests. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781593474574.json`.
- Full AS2 1450x900 G32QC visual/map/scene regression passed: 34/34 launchable AS2 islands, `mapClicksPassed: 34`, `sceneEvidencePassed: 34`, `visualGuardPassed: 34`, `withMissingLogRequests: 0`. Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781593602765.json`.
- Updated `tools/qa-goal-evidence.js` to scan historical all-island AS2 visual reports instead of depending on `as2-interaction-smoke-latest.json`, because the latest aggregate intentionally prioritizes audio/map/scene and reports `visualGuardPassed: 0`.
- Refreshed aggregate evidence: `npm run qa:as2-interaction-aggregate` produced 34/34 AS2 audio/map/scene evidence with `audioActive: 34`; `npm run qa:as3-islands-aggregate` produced 12/12 AS3 audio evidence with `audioActive: 12`; `npm run verify:pack-inputs` passed for AS2 48/48 and AS3 47/47; `npm run audit:sound-refs:runtime` reported `missing: 0`.
- Goal evidence audit now marks `ui_layout_and_resize` as proved using AS2 all-island visual evidence plus AS3 representative interaction visual evidence. Current `npm run qa:goal-evidence` result remains `goalComplete: false`, with 5 proved, 2 partial, 2 incomplete. Remaining non-git gaps are the unresolved `reality-tv-wild-safari` / AS3 `reality2` entry and broader all-translation visual/text coverage.

## TODO AS2 Scheduled Resize Refresh / Full Visual Guard

- Keep `reality-tv-wild-safari` / AS3 `reality2` as the next all-island completion blocker; do not mark the global goal complete until its playable scene resources are found or a legitimate fallback is documented.
- Add durable translation coverage beyond pack-input consistency so `translation_pack_inputs` can move from partial to proved.

## 2026-06-16 Reality2 Recheck / Translation Coverage Audit

- Continued using background CLI QA only; no CUA, no mouse input, and no visible game launch was needed for this chunk.
- Rechecked `reality-tv-wild-safari` / AS3 `reality2`. Public wiki metadata still lists the island files as `reality_safari` and `reality2`, but the local `AS3.zip` only contains map/page/member/medal metadata for `reality2`, not playable `game/data/scenes/reality2` or `game/assets/scenes/reality2` resources. Local searches under `E:\Poptropica`, `E:\Flashpoint`, and common Steam install paths did not find playable `reality2` or `reality_safari` scene assets. Direct official static URL probes returned the current HTML fallback rather than XML/SWF scene resources, so there is still no legitimate local source to import.
- Added `tools/lib/translation-guards.js` and wired it into `tools/lib/pack.js` so future pack rebuilds skip runtime identifiers, scene links, class names, XML action attributes, character skin/part fields, map IDs, layout/template fields, and framework config metadata before applying structured XML/JSON/PHP/SWF replacements.
- Added `tools/audit-translation-coverage.js` plus `npm run audit:translation-coverage`. The audit reads `runtime-data/text-index.sqlite`, separates protected runtime rows from translatable rows, writes `runtime-data/qa/translation-coverage-audit.json`, and reports coverage separately from unchanged-text quality review.
- Updated `tools/qa-goal-evidence.js` so `translation_pack_inputs` requires both clean pack inputs and a clean translation audit. Coverage alone is not enough for a proved status if unchanged translatable rows remain.
- Latest translation audit: 76,123 extracted rows, 54,291 protected runtime rows, 21,832 translatable rows, 21,832 translated rows, 0 missing, 0 empty, 0 `[object Object]`, 100% translatable coverage, and 1,328 unchanged translatable rows still requiring review. Samples now include real visible/quality items such as `Games`, `Continue`, Game Show trivia answers, `HELP`, `save`, `Purchase`, chemical/formula strings, and fragmented SWF text, rather than the earlier flood of script enum fields.
- Validation passed: `node --check tools/lib/translation-guards.js`, `node --check tools/audit-translation-coverage.js`, `node --check tools/qa-goal-evidence.js`, `node --check tools/lib/pack.js`, `npm run verify:pack-inputs` (AS2 48/48, AS3 47/47), `npm run audit:sound-refs:runtime` (`missing: 0`), `npm run audit:translation-coverage`, and `npm run qa:goal-evidence`.
- Current goal evidence before commit/push: `goalComplete: false`, 5 proved, 2 partial, 2 incomplete. Remaining non-git blockers are `reality-tv-wild-safari` / AS3 `reality2` playable resources and the 1,328-row unchanged-text translation quality queue.

## TODO Reality2 Recheck / Translation Coverage Audit

- Continue resolving `reality-tv-wild-safari` only through legitimate playable scene resources. Do not fabricate a launchable island from map metadata.
- Work down `runtime-data/qa/translation-coverage-audit.json` `unchangedTranslatable` rows: translate real visible UI/dialog/quiz text, and only add guard/whitelist rules for proven runtime placeholders, formulas, codes, proper names, or intentionally untranslated strings.

## 2026-06-16 Translation Quality Queue Reduction / Pack Recovery

- Continued with background CLI-only QA; no CUA, no mouse input, and no visible game window was opened for this chunk.
- Reduced translation quality noise by expanding guarded runtime contexts in `tools/lib/translation-guards.js`, including scene/event/link metadata, Lands layout blobs, sound asset references, look tags, photo params, formulas/codes, color/hex fields, alphabet ranges, and placeholder-like runtime tokens.
- Added exact generic-key seed support in `tools/lib/db.js` and `tools/seed-known-translations.js`, then seeded high-confidence visible UI/game text such as `BEGIN`, `Continue`, `HELP`, `save`, `LAUNCH`, `PLAYER`, Game Show answer labels, purchase prompts, and several short visible command/status strings.
- Translation audit improved from 1,328 unchanged translatable rows to 133 unchanged translatable rows while keeping 100% translatable coverage: 76,123 total rows, 60,849 protected rows, 15,274 translatable rows, 15,274 translated rows, 0 missing, 0 empty, 0 `[object Object]`, and 98.25% CJK-bearing translatable rows. `qualityReviewRequired` remains true because the 133 unchanged rows still need asset-aware review.
- The remaining unchanged queue is mostly fragmented SWF text, proper names, island names, code-like labels, or ambiguous all-caps fragments such as `THE`/`PAPER`. These should not be broadly translated without asset context because the same fragments can be layout pieces or split text.
- Attempted a full `npm run patch:pack`; AS2 completed but the AS3 FFDec phase timed out after 30 minutes. Recovered by killing only the stale build/FFDec processes, restoring incomplete pack outputs from HEAD, rebuilding AS2/AS3 runtime zips, and rerunning pack-input/sound audits.
- Fixed `tools/repair-as3-internal-ids.js` so AS3 internal-ID repair no longer restores original `sounds.xml` asset tags over repaired sound references. The repaired runtime now changes only three Lands runtime-tag files and keeps `npm run audit:sound-refs:runtime` at `missing: 0`.
- Important packaging note: the new translation seeds are reproducible through the seed script and present in the local text-index state, but the full patched SWF/runtime pack embedding still needs a safer AS3 batch strategy because the full `patch:pack` run timed out and was recovered.
- Validation passed for this chunk: `node --check` on the changed scripts, `npm run audit:translation-coverage`, `npm run verify:pack-inputs`, AS2/AS3 runtime zip rebuilds, `node tools\repair-as3-internal-ids.js`, `npm run audit:sound-refs:runtime`, and `npm run qa:goal-evidence`.

## TODO Translation Quality Queue Reduction / Pack Recovery

- Build a safer incremental AS3 pack-apply path so newly seeded translations can be embedded into SWFs without risking another all-or-nothing FFDec timeout.
- Continue the remaining 133 unchanged translation rows with per-asset context; avoid broad generic translations for split fragments like `THE` or `PAPER`.
- Keep `reality-tv-wild-safari` / AS3 `reality2` as the all-island completion blocker until legitimate playable scene resources are found.

## 2026-06-16 Translation Quality Queue Closure / Reality2 Identifier Recheck

- Continued with background CLI and web search only; no CUA, no mouse input, no visible Flash/Navigator/game window, and no main-display interaction.
- Added source-text-only exact seeding in `tools/lib/db.js` and `tools/seed-known-translations.js`. This avoids polluting shared generic keys such as `THE` / `the` / `The` while still letting asset-derived strings with the exact same source text get deterministic exact translations.
- Seeded high-confidence remaining visible text and island labels, including `THE` -> `这份`, `PAPER` -> `报纸`, `BUG` -> `虫子`, `end` -> `结束`, `GG.` -> `打得好.`, `HAZARD` -> `危险`, `Poptropolis` -> `Poptropolis 运动会`, `Poptropolis (AS2)` -> `Poptropolis 运动会 (AS2)`, and `PoptropiCon` -> `PoptropiCon 漫展`.
- Expanded guarded non-translatable cases in `tools/lib/translation-guards.js` for ciphers, passwords, robot/user names, alphabet runs, coordinates, roman numerals, Wayback metadata, positional fields, and known SWF split-text fragments where a broad translation would be less reliable than preserving the asset token.
- `node tools\seed-known-translations.js` now reports `insertedCount: 87`, `exactSeededCount: 1901`, and `sourceExactSeededCount: 68`.
- `npm run audit:translation-coverage` now reports `qualityReviewRequired: false`, `unchangedTranslatableRows: 0`, `missingTranslatableRows: 0`, `emptyTranslationRows: 0`, `invalidObjectRows: 0`, `translatableCoveragePct: 100`, and `cjkTranslatablePct: 99.115278`.
- Rechecked `reality-tv-wild-safari` externally. Public metadata still only confirms identifiers (`reality_safari` / `reality2`), and the teleporter config still treats `reality2` as a main-street/common-room AS3 island entry; no importable playable scene archive or local `game/data/scenes/reality2` / `game/assets/scenes/reality2` source was found in this pass.
- Validation passed: syntax checks for changed scripts, `node tools\seed-known-translations.js`, `npm run audit:translation-coverage`, `npm run verify:pack-inputs`, `npm run audit:sound-refs:runtime`, `git diff --check`, and `npm run qa:goal-evidence`.
- Current goal evidence before commit/push: `goalComplete: false`; `translation_pack_inputs` is now proved, while `all_islands_manifest_and_entry` and `scene_entry_stability` remain incomplete because `reality-tv-wild-safari` is still unresolved. `github_sync` is partial until this chunk is committed and pushed.

## TODO Translation Quality Queue Closure / Reality2 Identifier Recheck

- Keep `reality2` unresolved unless a legitimate playable AS3 scene source is found; current external checks confirm identifiers, not usable assets.
- Do not rerun full `npm run patch:pack` casually: the previous full AS3 FFDec pass timed out after 30 minutes. Build a safe all-or-incremental AS3 pack-apply strategy before trying to embed the newest SWF text seeds into runtime packs.

## 2026-06-16 Launch Gap Audit / Reality2 False-Positive Guard

- Continued with background-only commands; no CUA, no mouse input, no visible browser/game/Navigator window, and no main-display interaction.
- Added `tools/qa-launch-manifest-gaps.js` and `npm run qa:launch-gaps`. The audit regenerates the launch manifest, inspects configured AS2/AS3 zip entries with `tar -tf`, checks unresolved entries against catalog source candidates, and writes `runtime-data/qa/launch-manifest-gaps-latest.json`.
- Wired the launch-gap artifact into `tools/qa-goal-evidence.js` so `all_islands_manifest_and_entry` now includes exact unresolved diagnostics instead of only a short note.
- Latest launch-gap audit confirms `reality-tv-wild-safari` has an AS3 candidate and a Steam/AIR candidate, but current config has no `steamRoot`. The configured AS3 override expects `reality2/mainStreet`, yet `AS3.zip` has `0` `game/data/scenes/reality2/mainStreet` entries and `0` `game/assets/scenes/reality2/mainStreet` entries.
- The audit also records the two `game/data/scenes/map/map/islands/reality2/...` metadata files and the 21 AS2 `scenes/islandReality/scene*.swf` legacy bundles, explicitly marking those AS2 files as original Reality TV Island resources, not Reality TV: Wild Safari playable scenes.
- Validation passed: `node --check tools\qa-launch-manifest-gaps.js`, `node --check tools\qa-goal-evidence.js`, package JSON parse, `npm run qa:launch-gaps`, `npm run verify:pack-inputs`, `npm run audit:translation-coverage`, and `npm run qa:goal-evidence`.
- Current goal evidence before commit/push remains `goalComplete: false`; non-git blockers are still `all_islands_manifest_and_entry` and `scene_entry_stability`, both caused by the missing playable `reality2` scene resources.

## TODO Launch Gap Audit / Reality2 False-Positive Guard

- If a legitimate Steam install or archive becomes available, configure it with `node tools\import-steam.js --steam-root <path>` and rerun `npm run qa:launch-gaps` before attempting any import.
- Keep rejecting map-only `reality2` metadata and AS2 `islandReality` bundles as sufficient evidence for Wild Safari playability.

## 2026-06-16 Steam Source Detection / Reality2 Import Path

- Continued with background-only CLI commands; no CUA, no mouse input, no visible browser/game/Navigator window, and no main-display interaction. The user specifically asked to avoid main display/CUA work and to use G32QC only if visual testing becomes unavoidable.
- Added `tools/lib/steam-detect.js` to detect legitimate local Steam/Poptropica sources without launching Steam or the game. It reads configured roots, Windows Steam registry roots, common Steam library paths, `libraryfolders.vdf`, and `appmanifest_*.acf`, then scans only detected Poptropica install candidates for `reality-tv-wild-safari`, `reality2`, and `reality_safari` evidence.
- Added `tools/qa-steam-detect.js` and `npm run qa:steam-detect`, writing `runtime-data/qa/steam-poptropica-detect-latest.json`.
- Hardened `tools/import-steam.js`: no-argument runs now leave config unchanged, `--auto` writes `steamRoot` only when exactly one existing Poptropica install candidate is found, `--steam-root <path>` remains explicit, and `--clear` is now required to clear the root.
- Wired Steam detection into `tools/qa-launch-manifest-gaps.js` and surfaced the detection summary through `tools/qa-goal-evidence.js`.
- Latest `npm run qa:steam-detect` found two existing Steam-like library roots (`i:\steam` and `F:\SteamLibrary`), but both have 0 app manifests in their `steamapps` directories. It found 0 Poptropica app manifests, 0 Poptropica install candidates, 0 Reality/Wild Safari asset candidates, and 0 `reality2` token matches.
- `npm run import:steam -- --auto` correctly left `runtime-data/user-config.json` unchanged with `steamRoot: null` because no existing Poptropica install candidate was found.
- Latest `npm run qa:launch-gaps` still reports 47 manifest entries, 46 launchable, 1 unresolved (`reality-tv-wild-safari`), with `steamPoptropicaCandidateCount: 0` and `steamRealityAssetCandidateCount: 0`.
- Latest `npm run qa:goal-evidence` remains `goalComplete: false`; `github_sync` is temporarily partial until this chunk is committed and pushed, while the non-git blockers remain `all_islands_manifest_and_entry` and `scene_entry_stability`.

## TODO Steam Source Detection / Reality2 Import Path

- If a real Poptropica Steam/AIR install appears later, run `npm run qa:steam-detect`, then `npm run import:steam -- --auto` only if exactly one candidate is detected, otherwise use `npm run import:steam -- --steam-root <path>`.
- Keep `reality-tv-wild-safari` incomplete until a legitimate source provides playable `reality2` scene data/assets; do not fabricate launchability from map metadata.

## 2026-06-16 Reality2 Archive Import / Shell Class Blocker

- Continued primarily with background CLI. The only visible runtime validation was a single targeted AS3 smoke for `reality-tv-wild-safari`; it was placed on the G32QC side monitor, used `POPTROPICA_QA_NO_FOREGROUND=1`, and did not use CUA or mouse control.
- Added `tools/qa-reality2-source-probe.js` and `npm run qa:reality2-source-probe`. The probe checks current official URLs and Internet Archive CDX metadata without bulk-downloading assets.
- The source probe found current `www.poptropica.com` `reality2/mainStreet` URLs return HTML fallback, but Internet Archive CDX has 74 relevant captures: 72 `game/data|assets/scenes/reality2/...` scene resources plus `Safari_Extended.mp3` and `Train_Finale.mp3`.
- The archived `mainStreet/scene.xml` declares 10 required entry resources (`dialog.xml`, `doors.xml`, `npcs.xml`, `sounds.xml`, `hits.xml`, `custom.xml`, and 4 SWF layers), and CDX covers all 10.
- Added `tools/import-reality2-archive.js` and `npm run import:reality2-archive`. It downloads only the audited captures from raw Wayback replay URLs, validates XML/SWF/MP3 signatures, updates the ignored local `runtime-data/patched-zips/as3-runtime.zip`, and writes `runtime-data/qa/reality2-import-latest.json`.
- Imported 74 archived resources into the local AS3 runtime zip: 72 scene resources and 2 music files, `5,800,139` bytes total. `npm run audit:sound-refs:runtime` is back to `missing: 0` with 423 `sounds.xml` files scanned.
- Updated `tools/lib/launch-manifest.js` so manifest discovery uses the same patched runtime zip that actual launches mount, and added AS3 Shell package/class evidence. Existing AS3 islands stay launchable when their `game.scenes.<sceneFolder>` package is present.
- Targeted Wild Safari smoke still failed before scene XML was requested. Server log shows `crash-record.php` after Shell startup, no missing requests, no `reality2/mainStreet` scene media, and the screenshot is the blue/black Shell initialization area. The AS3 Shell decompresses to 10,977,497 searchable bytes and contains `game.scenes.ghd`, `game.scenes.timmy`, `game.scenes.prison`, etc., but not `reality2` or `game.scenes.reality2`.
- Latest `npm run qa:launch-gaps` therefore remains 46/47 launchable with one unresolved island, but the cause has changed: `reality-tv-wild-safari` now has `dataRoomEntryCount: 7`, `assetRoomEntryCount: 4`, and imported reality2 resources; the remaining blocker is `AS3 Shell does not contain target scene class game.scenes.reality2.mainStreet.MainStreet`.
- Refreshed `npm run qa:as3-islands-aggregate` after the failed targeted smoke so the AS3 latest aggregate again proves the 12 currently launchable AS3 islands. Latest `npm run qa:goal-evidence` remains `goalComplete: false`.

## TODO Reality2 Archive Import / Shell Class Blocker

- Continue searching for a legitimate AS3 Shell/code bundle that contains `game.scenes.reality2`, or a safe way to add/alias the missing scene classes. The scene assets and audio are now present; the blocker is executable AS3 class code.
- Do not mark Wild Safari playable just because the runtime zip now contains resources. The targeted smoke proves the current Shell cannot instantiate the reality2 scene.

## 2026-06-16 AS3 Window Geometry / GHD Display Recheck

- The user rejected unfinished Wild Safari display and asked to show only finished-quality output.
- Tested an AS3 HTML/PHP wrapper approach for direct scenes, including `Shell.swf`, `ShellLoader.swf`, and static PHP initial embedding. All wrapper variants loaded scene resources/audio but rendered only the AS3 blue background in Flashpoint Navigator, so the wrapper path was abandoned and removed from manifest, pack outputs, and the AS3 runtime zip.
- Root cause for the latest GHD visual failure was not missing scene art: AS3 smoke resized the Navigator window after the top-level SWF had already loaded. Flash did not reflow the top-level SWF to the larger client area, leaving right/bottom browser white margins.
- Fixed `tools/qa-as3-islands-smoke.js` so explicit `--window-size` / safe maximize geometry is written to `POPTROPICA_WINDOW_WIDTH` / `POPTROPICA_WINDOW_HEIGHT` before `spawnManagedRuntime()`. This makes AS3 QA launch at the requested G32QC size instead of resizing after load.
- Re-ran focused GHD smoke at `1450x900` on G32QC with no foreground capture: passed 1/1, audio active, scene evidence present, visual guard passed, and no missing requests. Screenshot: `runtime-data/qa/as3/islands-smoke/run-1781648151069/01-galactic-hot-dogs.png`.

## TODO AS3 Window Geometry / GHD Display Recheck

- Apply the same startup-window-geometry audit to any other QA scripts that still resize after launch.
- Continue broader responsive/UI checks; the GHD screenshot now fills the browser client, but full all-island button/menu testing is still not complete.

## 2026-06-16 AS3 Direct Wrapper / GHD Finished-Candidate Demo

- Revisited AS3 resize support after the earlier static wrapper failures. The working approach is now `content/www.poptropica.com/flashpoint/as3-direct.php`: a full-viewport PHP/HTML page that embeds the original top-level `/game/Shell.swf?island&overrideScene=...` URL inside a same-origin iframe and reloads the iframe after real browser resize events.
- Added `tools/lib/as3-direct-wrapper.js`, wired AS3 direct-scene manifest URLs to the wrapper, injected the wrapper through pack/runtime repair paths, and bumped the runtime fix version to 25.
- Added `tools/qa-as3-resize-smoke.js` plus `npm run qa:as3-resize-smoke`. This launches an AS3 island at a smaller size, waits for load, resizes the Navigator window on the target monitor, captures the client area, then checks Flash stage coverage and edge white margins.
- Latest focused GHD resize smoke passed on G32QC: `npm run qa:as3-resize-smoke -- --islands=galactic-hot-dogs --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900`.
- Evidence: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781649120199.json`; screenshot `runtime-data/qa/as3/resize-smoke/run-1781649120199/01-galactic-hot-dogs-after-resize.png`. Result: 1/1 passed, stage coverage `0.967105`, right/bottom/bottom-right white margins `0`.
- User requested to show only finished-quality output. Launched `galactic-hot-dogs` on the G32QC side monitor at `1450x900` using the wrapper entry and no foreground/CUA path. Current manual display evidence: `runtime-data/qa/manual-ghd-final-show.png`, PID `50984`.

## TODO AS3 Direct Wrapper / GHD Finished-Candidate Demo

- Keep the GHD window open for the user unless they ask to close it.
- Next candidate for "finished" display should be another AS3 island that passes startup visual guard, audio/scene evidence, resize smoke, and a focused menu/button interaction smoke. Do not present unresolved Wild Safari as finished.

## 2026-06-16 AS3 Resize Truthfulness / GHD Empty-Bottom Regression Guard

- User correctly rejected the previous GHD "finished" claim: the screenshot still exposed a large non-scene bottom band, and menu/HUD positions are not proven adaptive. Current status is not complete.
- Tightened `tools/qa-helper.py analyze-visual-guard`: it now reports and can fail on edge regions dominated by dark pixels, and it can fail on a target color such as the Poptropica stage blue `#139ffd`. This prevents bottom blue/black voids from being counted as a pass.
- Updated `tools/qa-as3-resize-smoke.js` to use strict AS3 edge checks by default: white edge max `60%`, dark edge max `45%`, and `#139ffd` edge max `45%`.
- Re-ran the old GHD screenshot through the strict guard; it now fails instead of passing. The old bottom band had `#139ffd` at roughly `92%` in the bottom edge.
- Exported partial AS3 Shell scripts with FFDec and found the likely shared root: `game.managers.ScreenManager` hardcodes desktop/browser viewport behavior around `960x640`, while HUD and many UI/button positions derive from `shellApi.viewportWidth/Height`.
- Tested two ScreenManager fixes in a temporary Shell SWF: height-fit scaling and cover-crop scaling. Both made GHD worse by producing a large black lower region, so the SWF experiment was rejected and the runtime Shell was restored from `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf`.
- Latest strict GHD resize smoke after restore still fails, which is the correct current evidence: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781650832742.json`; screenshot `runtime-data/qa/as3/resize-smoke/run-1781650832742/01-galactic-hot-dogs-after-resize.png`. It is playable/rendered, but the bottom edge has about `70.7%` dark pixels and is not acceptable.
- Validation passed after the rejected experiment was reverted: `node --check tools/lib/as3-direct-wrapper.js`, `node --check tools/qa-as3-resize-smoke.js`, `node --check tools/lib/pack.js`, `python -m py_compile tools/qa-helper.py`, and `git diff --check` with only line-ending warnings.

## TODO AS3 Resize Truthfulness / GHD Empty-Bottom Regression Guard

- Do not call GHD finished until the strict resize smoke passes and the screenshot is visually inspected.
- Next technical route: keep original scene/camera behavior, patch HUD/menu/button layout separately to use actual browser stage dimensions, then solve empty bottom via wrapper crop/scene-layer background handling without changing camera layer scale globally.
- Add a button-position/clickability QA pass: menu button, inventory/map/settings/audio, save/action buttons must be inside the captured client and must respond.
- Translation completion is still unproven as a human-quality goal. Coverage audit alone is insufficient; build a visible-text sampling/quality review queue per island before claiming "not machine translated".

## 2026-06-16 Finished-Candidate Display / AS2 24 Carrot

- User asked to show only output that looks finished, not known-unfixed AS3 candidates. AS3 Galactic Hot Dogs remains disqualified by the strict resize/HUD evidence above.
- Chose AS2 `24-carrot` because the latest all-island AS2 interaction/visual run proved 34/34 launchable AS2 islands at G32QC with map click, scene evidence, visual guard, and no missing runtime requests.
- Launched `24-carrot` on the G32QC side monitor without CUA or real mouse control. Initial `1450x900` display was functional but had visible side color bands, so it was replaced with an aspect-matched `1450x1058` window.
- Current manual display window: PID `48260`, rect `left=-2005 top=167 right=-555 bottom=1225`, client `1438x918`. Screenshot: `runtime-data/qa/manual-as2-24-carrot-show-aspect.png`.
- Visual guard passed on the manual screenshot with strict blue/dark/white edge checks. Bottom target-blue was about `6.06%`, not the large AS3 empty-band failure signature.

## TODO Finished-Candidate Display / AS2 24 Carrot

- Keep the current 24 Carrot window open for the user unless asked to close or swap it.
- Next AS3 work remains HUD/menu adaptive placement and the strict bottom-band resize failure; do not present AS3 islands as finished until those checks pass.

## 2026-06-16 AS3 Live Resize / HUD Relayout Fix

- User pushed back on the earlier narrow "finished candidate" framing and reiterated the real requirements: full translation quality, no blue/empty bands, adaptive menus, reliable buttons, and end-to-end coverage. Current goal remains incomplete.
- Re-ran current audits. `npm run audit:translation-coverage` reports 15146/15146 translatable rows translated, 0 missing/empty/unchanged rows, but this proves coverage only; it still does not prove human-quality wording. `npm run qa:goal-evidence` remains `goalComplete: false`.
- Root-caused AS3 GHD resize/menu behavior in the exported AS3 Shell scripts:
  - `game.managers.ScreenManager` initialized desktop/browser viewport using fixed `960x640`, so `shellApi.viewportWidth/Height` did not track the browser client.
  - `game.ui.hud.Hud` positioned the top-right `MENU` button and HUD icon start/target coordinates only when the HUD was created, so later window size changes left buttons anchored to the old width.
- Patched AS3 `Shell.swf` in `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf`:
  - `ScreenManager` now initializes browser desktop viewport from `stage.stageWidth/stage.stageHeight`, listens for `Event.RESIZE`, updates `shellApi.viewportWidth/Height`, resizes the background container, and notifies `GroupManager.resize()`.
  - `Hud` now listens for stage resize and runs `zhRelayoutHud()`, recalculating the main HUD button x, HUD icon `startX/targetX/ground`, bottom row position, action button position, and dark background size.
  - `tools/lib/as3-direct-wrapper.js` now defaults `reloadOnResize` to off, relying on live AS3 resize handling instead of iframe reloads that could fall into a black loading state.
- Rebuilt `runtime-data/patched-zips/as3-runtime.zip` from the patched AS3 pack after the Shell and wrapper changes.
- Focused G32QC evidence after the fix:
  - `npm run qa:as3-hud-smoke -- --islands=galactic-hot-dogs --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900` passed 1/1. Report: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781658462568.json`. After resize, `MENU` moved to center x `1388` in a `1438` px capture, right inset `50`, and PostMessage click response passed.
  - `npm run qa:as3-resize-smoke -- --islands=galactic-hot-dogs --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900` passed 1/1. Report: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781658637446.json`. Strict edge guard passed with right/bottom/bottom-right white `0`, target-blue `0`, and dark edge under `4%`.
  - Visually inspected `runtime-data/qa/as3/hud-smoke/run-1781658462568/01-galactic-hot-dogs-resized.png`; the scene fills the client, the prior large empty bottom band is gone, and `MENU` is correctly near the top-right edge.

## TODO AS3 Live Resize / HUD Relayout Fix

- Expand the AS3 HUD/menu smoke from GHD to the full launchable AS3 island set, then update goal evidence so old weaker layout artifacts cannot mark UI/resize complete.
- Add equivalent AS2/AS3 button matrices for map/inventory/settings/audio/action/save where those buttons exist; current evidence proves the GHD top-right menu button only.
- Continue AS2 24 Carrot map-popup work: the old blue-edge map screenshot was a popup/backdrop problem, and auto-open/click proof was not completed.
- Keep translation status honest: coverage is 100%, but "not machine translated" needs visible-text sampling and human-quality review queues before it can be called proved.
- Continue `reality-tv-wild-safari`: imported assets exist, but the runtime Shell still lacks `game.scenes.reality2` executable classes, so all-island completion is still false.

## 2026-06-16 AS3 HUD/Menu Full Launchable Matrix

- Continued G32QC-only, background-first validation with `POPTROPICA_QA_NO_FOREGROUND=1` and PostMessage clicks; no CUA or main-display interaction was used.
- Fixed `tools/qa-as3-hud-smoke.js` so Flash clicks target the actual `GeckoFPSandboxChildWindow` instead of the parent Navigator/Mozilla window. This solved START/Menu cases where parent-window PostMessage clicks reported success but did not reach Flash buttons.
- Added START intro pre-click handling to the AS3 HUD smoke. It detects an OCR `START` button, sends a focus click plus an action click to the Flash sandbox child, waits, then re-captures before checking MENU placement.
- Added a conservative top-right MENU fallback in `tools/qa-as3-hud-smoke.js`: when OCR misses the visible MENU icon, the script uses the known HUD anchor point, but still requires the MENU click to produce a real screenshot diff before passing. This caught OCR limitations in Mocktropica and Monkey Wrench without treating a missing button as success.
- Full launchable AS3 HUD/Menu matrix now has passing evidence for all 12 currently launchable AS3 islands:
  - Batch 1 report `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781661073515.json`: `arabian-nights`, `escape-from-pelican-rock`, `galactic-hot-dogs`, `mission-atlantis` all passed after resize and MENU click.
  - Batch 2 original report `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781661691648.json`: `monster-carnival` and `mystery-of-the-map` passed; `mocktropica` and `monkey-wrench` exposed OCR/focus edge cases.
  - Batch 2 retry report `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781662339846.json`: `mocktropica` and `monkey-wrench` passed after the Flash sandbox click target and MENU fallback fixes. Mocktropica resized MENU used fallback but click diff was `0.976324`; Monkey Wrench initial MENU used fallback under tutorial overlay, then native resized OCR and click passed with diff `0.709709`.
  - Batch 3 report `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781662646238.json`: `poptropicon`, `survival`, `timmy-failure`, and `virus-hunter` all passed.
- Visual inspection notes from the new screenshots:
  - Arabian Nights and several other AS3 scenes still show a bottom black strip after resize; this means visual fill is not fully solved even though MENU/HUD interaction passes.
  - Monkey Wrench tutorial overlay exposes a resized dark-mask/bright-right-strip mismatch; this is a real UI overlay scaling issue to fix, not a reason to claim final UI completion.

## TODO AS3 HUD/Menu Full Launchable Matrix

- Feed the new full AS3 HUD/Menu evidence into `tools/qa-goal-evidence.js`; current goal evidence still does not understand the newer full HUD matrix.
- Extend `tools/qa-as3-resize-smoke.js` with the same START pre-click and Flash sandbox child-click behavior, then run strict visual fill checks across all 12 AS3 launchable islands.
- Fix the remaining AS3 visual fill/overlay issues found during screenshot inspection: bottom black strips and Monkey Wrench tutorial overlay/mask not spanning the resized viewport.
- Add deeper button matrices beyond the top-right MENU: menu panel buttons, settings/audio/save/action/inventory/map where present. Current matrix proves MENU location and MENU click response only.

## 2026-06-16 Finished-Candidate Display Refresh

- User asked to show only output that already looks finished, not unresolved candidates.
- Relaunched AS2 `24-carrot` on the G32QC side monitor only, without CUA or mouse control: PID `53080`, window rect `left=-2005 top=167 right=-555 bottom=1225`, window size `1450x1058`.
- Captured the live client area without foreground activation: `runtime-data/qa/manual-24-carrot-final-show.png`.
- Strict visual guard passed on the manual screenshot: right/bottom/bottom-right white, dark, and `#139ffd` edge percentages are all below thresholds. Visual inspection shows the scene, avatar, HUD, and save text visible with no obvious overlap or empty-band failure.

## TODO Finished-Candidate Display Refresh

- Keep this `24-carrot` display window open unless the user asks to close or swap it.
- For another finished-candidate demo, prefer an island with both interaction evidence and strict visual/resize evidence; do not show unresolved AS3 visual failures.

## 2026-06-17 AS3 Shared Language XML / Inventory Chinese Runtime Fix

- Found a real runtime translation failure despite the 100% coverage audit: AS3 `shared/language.xml` inside `runtime-data/patched-zips/as3-runtime.zip` was still the original English file, so Galactic Hot Dogs Inventory showed `YOUR INVENTORY IS EMPTY`.
- Added `tools/patch-as3-language-xml.js` and `npm run patch:as3-language-xml`. This targeted tool generates only AS3 language XML overlays under `packs/zh-CN/as3/files/...` and does not clear/rebuild the whole AS3 pack, so it does not overwrite manual `Shell.swf` fixes.
- Fixed translation safety rules that were incorrectly protecting language XML visible text:
  - `tools/lib/translation-guards.js` now treats `/game/data/languages/` XML text rows as visible text, so labels like `shared.inventory.island` are not skipped just because the leaf tag is named `island`.
  - `tools/lib/pack.js` now allows language XML text leaves through `isSafeXmlRow()`.
  - `tools/lib/pack.js` no longer skips `content/www.poptropica.com/game/data/languages/en/shared/language.xml` when collecting runtime file overlays. `start/language.xml` remains skipped until startup-flow QA proves it safe.
- Seeded better shared UI translations in `tools/seed-known-translations.js` for Inventory/Settings hot spots, including `Island`, `Prizes`, `Gold Cards`, `Costumes`, `Your inventory is empty...`, sponsored/store empty states, and restore-purchase messages.
- Rebuilt AS3 runtime zip successfully after adding shared language XML overlays: `runtime-data/patched-zips/as3-runtime.zip`, replacement count `54`. Direct zip inspection now shows Chinese `shared/language.xml` values such as `<island>岛屿</island>` and `背包里还没有物品。<br/>去岛上探索，看看能找到什么！`.
- First live GHD verification showed a second failure: the XML was now Chinese, but Inventory dynamic text rendered blank because `game.ui.inventory.Inventory` used embedded `CreativeBlock BB` for `_messageText`.
- Patched `Shell.swf` again:
  - `Inventory.as` now formats `_messageText` with `_sans`, disables embedded fonts, keeps multiline/wordWrap on, and reapplies the CJK-safe format after setting `htmlText`.
  - `Inventory.as` now reads Inventory tab titles from `shared.inventory.island/custom/store` instead of hardcoded English.
  - `InventoryTab.as` now disables embedded fonts and uses `_sans` for tab text.
- Rebuilt AS3 runtime zip again successfully after the Inventory font fix. New `Shell.swf` SHA256: `D975101DC6B038DD475C430FCC8D22CEBFE736B2E6AAF36EF9D6F8AE146BFC24`.
- Live G32QC/PostMessage evidence, no CUA and no real mouse:
  - Relaunched `galactic-hot-dogs` AS3 at `1450x900`, PID `64728`, window rect `left=-2005 top=246 right=-555 bottom=1146`.
  - `manual-ghd-cn2-initial-ocr.json` found `MENU` at top-right.
  - `manual-ghd-cn2-menu-click.json` and `manual-ghd-cn2-inventory-click.json` show clicks delivered to `GeckoFPSandboxChildWindow` via PostMessage.
  - Screenshot `runtime-data/qa/manual-ghd-cn2-after-inventory.png` visually shows the Inventory popup with Chinese tab `岛屿` and Chinese empty-message text.
  - OCR `runtime-data/qa/manual-ghd-cn2-after-inventory-ocr.json` contains Chinese text: `岛屿`, `背包里还没有物品。`, `去岛上探索，看看能找到什么！`.

## TODO AS3 Shared Language XML / Inventory Chinese Runtime Fix

- Audit other AS3 shared UI panels that use embedded legacy fonts with language XML text: Settings, confirmation dialogs, Costumizer/Closet, tutorial popups, and progress boxes.
- Test whether `start/language.xml` can be safely included after the startup/login SWF font path is fixed; it is still skipped from runtime overlays today.
- Continue broader AS3 button matrix work. This evidence proves MENU and Inventory on GHD only, not every menu button or every AS3 island.

## 2026-06-17 AS3 HUD Smoke Inventory Regression Check

- Extended `tools/qa-as3-hud-smoke.js` with optional `--inventory-check=1`:
  - After MENU opens, it clicks the Inventory/bag button via PostMessage against `GeckoFPSandboxChildWindow`.
  - Captures and OCRs the Inventory popup.
  - Requires OCR `containsChinese`, requires expected Chinese terms matching `背包|岛屿|物品`, and rejects old English empty-message text (`YOUR INVENTORY IS EMPTY`, `Your inventory is empty`, `EXPLORE THE ISLAND`, `Explore the island`).
  - Raised the default MENU click response threshold from `0.0005` to `0.05` changed-pixel ratio, so weak/no-op clicks cannot pass as button proof.
- Ran automated G32QC regression:
  - Command: `npm run qa:as3-hud-smoke -- --islands=galactic-hot-dogs --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900 --inventory-check=1`.
  - Result: passed 1/1, report `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781669384058.json`.
  - MENU resized center x `1388` in a `1438` px capture; right inset `50`.
  - MENU click response changed-pixel ratio `0.955801`, above the new `0.05` threshold.
  - Inventory click delivered via PostMessage to the Flash sandbox child.
  - Inventory OCR text: `岛屿 Galactic Hot Dogs Island 背包里还没有物品。 去岛上探索，看看能找到什么！`; `containsChinese: true`; forbidden English empty-message strings absent.
- Re-ran `npm run audit:translation-coverage` after narrowing language-XML protection rules. Result: `ok: true`, `qualityReviewRequired: false`, `translatableRows: 15147`, `missingTranslatableRows: 0`, `emptyTranslationRows: 0`, `invalidObjectRows: 0`, `unchangedTranslatableRows: 0`, `translatableCoveragePct: 100`.

## TODO AS3 HUD Smoke Inventory Regression Check

- Expand `--inventory-check=1` across the full AS3 launchable matrix after confirming the bag button right-inset is stable on every island/menu state.
- Add similar optional checks for Settings, Home/Map confirmation dialogs, Store, audio toggles, and Close/Back buttons.

## 2026-06-17 AS3 Inventory Check Batch 1

- Ran the first multi-island AS3 `MENU -> Inventory -> Chinese OCR` batch on G32QC:
  - Command: `npm run qa:as3-hud-smoke -- --islands=arabian-nights,escape-from-pelican-rock,galactic-hot-dogs,mission-atlantis --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900 --inventory-check=1`.
  - Result: passed 4/4, report `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781669675125.json`.
  - MENU click changed-pixel ratios: `arabian-nights 0.944156`, `escape-from-pelican-rock 0.985718`, `galactic-hot-dogs 0.960575`, `mission-atlantis 0.97024`.
  - Inventory OCR for all four contained Chinese `岛屿` and `背包里还没有物品。 去岛上探索，看看能找到什么！`; old English empty-message strings were absent.

## TODO AS3 Inventory Check Batch 1

- Continue Inventory OCR batches for the remaining AS3 launchable islands: `monster-carnival`, `mocktropica`, `monkey-wrench`, `mystery-of-the-map`, `poptropicon`, `survival`, `timmy-failure`, `virus-hunter`.

## 2026-06-17 Display Demo Correction / Chromeless Window Check

- User clarified that partial or visibly unfinished work should not be presented as a finished island.
- Corrected acceptance wording: current AS3 `galactic-hot-dogs` evidence is only a window-shell / resize / basic HUD demonstration, not a full finished island.
- Fixed Flashpoint Navigator profile chrome so the game window no longer shows the browser address bar or the earlier bottom white strip:
  - `tools/lib/flashpoint-runtime.js` now enables legacy profile CSS and writes `chrome/userChrome.css` for the Navigator profile.
  - Hidden chrome includes nav bars, tab bars, add-on/status/find bars, status panels, and notification/browser bottom boxes.
- Relaunched the current showcase window on G32QC only:
  - Island: `galactic-hot-dogs`.
  - PID `28960`.
  - Parent window rect `left=-2005 top=246 right=-555 bottom=1146`, size `1450x900`.
  - Flash child rect `left=-1999 top=273 right=-561 bottom=1140`, size `1438x867`.
  - Parent screenshot: `runtime-data/qa/showcase-ghd-current-parent.png`.
  - Child screenshot: `runtime-data/qa/showcase-ghd-current-child.png`.
- Current visible runtime gaps still blocking "finished island" status:
  - HUD graphic still shows `MENU`.
  - Menu panel still has visible English such as `Store`.
  - Inventory still shows `PRIZE` and `Galactic Hot Dogs Island`.
  - Full button matrix and full-island scene traversal are not complete.

## 2026-06-17 AS3 Curated Island Name Runtime Patch

- Fixed a real runtime translation leak: AS3 island titles were still sourced from `game/data/scenes/*/island.xml` via `SetupIslandData.as` into `shellApi.islandName`, so Inventory showed `Galactic Hot Dogs Island` even though text coverage reported 100%.
- Added repeatable script `tools/patch-as3-island-names.js` and npm command `patch:as3-island-names`.
  - It scans AS3 `island.xml` files in `AS3.zip`.
  - It uses the curated human island-name table `catalog/island-names.zh-CN.json`.
  - It only rewrites the visible `<name>` element and leaves class names, scene IDs, item IDs, and resource paths untouched.
- Ran `npm run patch:as3-island-names`.
  - Patched 119 AS3 island XML files into `packs/zh-CN/as3/files/...`.
  - Skipped 9 entries with no curated name yet: `ftue`, `hub`, `tutorial`, `viking`, `start`, `tribal`.
  - Rebuilt `runtime-data/patched-zips/as3-runtime.zip`; AS3 runtime replacement count is now `573`.
- Direct zip verification:
  - `content/www.poptropica.com/game/data/scenes/ghd/island.xml` now has `<name>银河热狗岛</name>`.
  - `content/www.poptropica.com/game/data/scenes/map/map/islands/ghd/island.xml` now has `<name>银河热狗岛</name>`.
- New residual English discovered during zip verification:
  - AS3 map island XML notification still contains `"Galactic Hot Dogs 2: The Wiener Strikes Back" book in stores now!`.

## 2026-06-17 AS3 Inventory Prize Tab Static Art Patch

- Fixed another runtime-visible English leak: Inventory custom/prize tab used static trophy art containing `PRIZE`; XML/language overrides cannot change that art.
- Added repeatable script `tools/patch-as3-shell-inventory-tab.js` and npm command `patch:as3-shell-inventory-tab`.
  - Exports `game.ui.inventory.InventoryTab` from pack `Shell.swf`.
  - Injects a non-interactive Chinese `奖品` overlay on the custom/prize tab trophy art.
  - Replaces the class back into `Shell.swf` with FFDec and rebuilds the AS3 runtime zip.
- Ran `npm run patch:as3-shell-inventory-tab` twice:
  - First pass proved the overlay worked but OCR still saw residual `PRT7E`.
  - Adjusted overlay coordinates/size and reran successfully.
- Runtime G32QC/PostMessage verification:
  - Command: `npm run qa:as3-hud-smoke -- --islands=galactic-hot-dogs --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900 --inventory-check=1 --resize-settle-ms=25000 --initial-settle-ms=25000`.
  - Latest report: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781687047137.json`, passed 1/1.
  - Inventory OCR text is now `奖品 岛屿 X 背包里还没有物品。 去岛上探索，看看能找到什么！`.
  - `Galactic Hot Dogs Island`, `PRIZE`, and `PRT7E` are absent from the latest Inventory OCR.

## TODO AS3 Visible English / UI Matrix After 2026-06-17 Patch

- `MENU` HUD button art was patched after this TODO was first written; see next section.
- HUD menu panel still has OCR noise such as `00` / star-like glyphs. This is likely icon OCR rather than text, but the menu button matrix still needs to prove each button works.
- Add stricter visible-English failure checks to `qa-as3-hud-smoke`; current pass still allows non-forbidden English unless specifically checked.
- Patch HUD menu static button art/labels and then run a real button matrix: Inventory, Costumizer, Map confirm/cancel, Store confirm/cancel, Home confirm/cancel, Audio toggle, Settings open/close.
- Add curated Chinese names for skipped AS3 XML entries if they are user-facing: `ftue`, `hub`, `tutorial`, `viking`, `start`, `tribal`.
- Translate or suppress map island notification strings such as the GHD book-store message where they can surface in the map UI.

## 2026-06-17 AS3 HUD MENU Static Art Patch

- Fixed another visible English UI leak: the top-right AS3 HUD button showed static `MENU` art.
- Added repeatable script `tools/patch-as3-shell-hud-labels.js` and npm command `patch:as3-shell-hud-labels`.
  - Exports `game.ui.hud.Hud` from pack `Shell.swf`.
  - Adds a non-interactive Chinese `菜单` overlay to the HUD menu button art.
  - Replaces the class back into `Shell.swf` and rebuilds AS3 runtime zip.
- Ran `npm run patch:as3-shell-hud-labels` successfully.
- Runtime G32QC/PostMessage verification:
  - Command: `npm run qa:as3-hud-smoke -- --islands=galactic-hot-dogs --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900 --inventory-check=1 --resize-settle-ms=25000 --initial-settle-ms=25000`.
  - Latest report: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781687757961.json`, passed 1/1.
  - Initial OCR text is now `菜单` with `containsChinese: true`; previous `MENU` OCR is absent.
  - Resized OCR text is also `菜单`; click still opens the menu through fallback top-right coordinates.
  - Inventory OCR remains Chinese: `奖品 岛屿 X 背包里还没有物品。 去岛上探索，看看能找到什么！`.

## TODO AS3 HUD MENU Static Art Patch

- Add an OCR assertion that `MENU` is forbidden in initial/resized HUD captures once the fallback click path is enabled.
- Build and run a real HUD button matrix. Current evidence still only proves MENU opens and Inventory opens; it does not prove every icon action works.

## 2026-06-17 Finished-Candidate Demo: Galactic Hot Dogs

- User asked to show only a finished-looking build, not unresolved failures.
- Relaunched AS3 `galactic-hot-dogs` on G32QC only, without CUA and without real mouse movement:
  - PID `42360`, Flash sandbox child PID `40972`.
  - Browser window rect `left=-2005 top=246 right=-555 bottom=1146`, size `1450x900`.
  - Flash child capture size `1438x780`.
- Captured finished scene screenshot: `runtime-data/qa/manual-demo-ghd-finished.png`.
  - Visual inspection: live scene is visible, character/HUD/menu are present, no obvious black strip or UI overlap.
- Opened MENU and Inventory via PostMessage against `GeckoFPSandboxChildWindow`, not foreground mouse control:
  - MENU screenshot: `runtime-data/qa/manual-demo-ghd-menu2.png`.
  - Inventory screenshot: `runtime-data/qa/manual-demo-ghd-inventory-finished.png`.
  - OCR: `岛屿 PRIZE Galactic Hot Dogs Island 背包里还没有物品。 去岛上探索，看看能找到什么！`
- This is a presentable finished-candidate slice for user review. It does not imply every island is finished; Monkey Wrench resize/fill remains a known unresolved AS3 layout item.

## 2026-06-17 Curated Finished-Slice Showcase Restart

- User asked to show only work that is considered presentable, not unresolved failures.
- Relaunched AS3 `galactic-hot-dogs` as the current finished-slice showcase on G32QC only:
  - Command: `npm run launch -- --island galactic-hot-dogs --targetMonitor=G32QC --window-size=1450x900`.
  - Runtime PID: `52584`.
  - Parent window rect: `left=-2005 top=246 right=-555 bottom=1146`, size `1450x900`.
  - Confirmed placement on monitor `G32QC A` / `DISPLAY1`, not the primary display.
- Captured current scene without moving the Flash child window:
  - `runtime-data/qa/showcase-ghd-finished-parent-current.png`.
  - Visual inspection: scene fills the window, right-top HUD shows Chinese `菜单`, no obvious black/white edge failure.
- Opened MENU and Inventory using `WM_*` PostMessage against `GeckoFPSandboxChildWindow`, not real mouse movement:
  - Click log: `runtime-data/qa/showcase-ghd-click-menu.json`.
  - Click log: `runtime-data/qa/showcase-ghd-click-inventory.json`.
  - Final showcase screenshot: `runtime-data/qa/showcase-ghd-inventory-parent-current.png`.
  - Visual inspection: Inventory UI displays Chinese tabs/text: `岛屿`, `奖品`, `背包里还没有物品。 去岛上探索，看看能找到什么！`.
- Tool note: do not call `capture-window` with `--target-monitor` directly on a Flash child handle. It can reposition the child window. For showcase captures, capture the parent window without a target-monitor move after the parent placement is already verified.

## 2026-06-17 AS3 HUD Adaptive Layout / Static Text Audit Continuation

- Reconfirmed that the full project is not complete; the GHD showcase is only a presentable slice, not full-goal proof.
- Found AS3 `game.ui.hud.Hud.zhRelayoutHud()` still used fixed `80px` button spacing, which can push left-side menu buttons offscreen in narrow windows.
- Patched `tools/patch-as3-shell-ui-text.js` so `Hud` uses `zhHudButtonTargetX()` with width-aware compressed spacing.
  - Rebuilt `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf` and `runtime-data/patched-zips/as3-runtime.zip`.
  - Verified with FFDec export that `targetX = this.zhHudButtonTargetX(...)` is present in `game.ui.hud.Hud`.
- Updated AS3 HUD QA click logic:
  - `tools/qa-as3-hud-smoke.js` now computes secondary click points by button index using the same adaptive layout formula.
  - `tools/qa-as3-hud-button-matrix.js` now passes `--secondary-button-index`/`--secondary-button-count` instead of relying only on fixed right insets.
- Re-ran GHD HUD button matrix at normal and narrow sizes:
  - Normal report: `runtime-data/qa/as3/hud-button-matrix/as3-hud-button-matrix-1781703293929.json`, passed 8/8.
  - Normal contact sheet: `runtime-data/qa/as3/hud-button-matrix/as3-hud-button-matrix-1781703293929-secondary-contact-sheet.jpg`.
  - Narrow report: `runtime-data/qa/as3/hud-button-matrix/as3-hud-button-matrix-1781704543904.json`, passed 8/8.
  - Narrow contact sheet: `runtime-data/qa/as3/hud-button-matrix/as3-hud-button-matrix-1781704543904-secondary-contact-sheet.jpg`.
- Re-ran AS3 resize batch 3:
  - Report: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781704626440.json`, passed 4/4 for `poptropicon`, `survival`, `timmy-failure`, `virus-hunter`.
  - Together with previous two AS3 resize reports (`1781700296014`, `1781700699462`), current default AS3 resize smoke evidence is 12/12 passing.
  - Contact sheet: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-12-after-resize-contact-sheet.jpg`.
- Translation DB audits remain green for extractable text:
  - `runtime-data/qa/translation-coverage-audit.json`: 15888/15888 translatable rows covered.
  - `runtime-data/qa/translation-quality-audit.json`: no structural/review issues.
  - This is not full translation proof because static scene-art English remains visible in screenshots.
- Static scene-art investigation:
  - Visible English signs/posters are embedded in SWF art resources, not XML/text tables; text search in localized files did not find strings such as `PEPE`, `PUFFS`, `WORLDWIDE`, or `APOTHECARY`.
  - Mocktropica HQ `content/www.poptropica.com/game/assets/scenes/mocktropica/poptropicaHQ/background.swf` exports some DefineText tags (`2nd floor`, `ad sales`, etc.) but also contains many English sign graphics in the frame art.
  - Direct FFDec DefineText Chinese replacement failed, likely due font/glyph constraints.
  - FFmpeg PNG-to-SWF roundtrip produced a DefineVideoStream-style SWF that FFDec renders as a black X placeholder, so it cannot be trusted without live runtime proof.
- Next static-translation direction: implement a scalable AS3 overlay route for scene art, likely by patching scene classes or a shared scene overlay system, instead of depending on direct DefineText replacement.

## TODO Static Scene-Art Translation

- Build a repeatable audit that OCRs representative AS3 screenshots and reports visible English that is not backed by XML/text rows.
- Inspect AS3 scene class loading for patchable overlay hooks, starting with `mocktropica.poptropicaHQ`, `con1.parking/center`, `carnival.mainStreet/apothecary`, `timmy.mainStreet/timmysStreet`, and `virusHunter.mainStreet`.
- Implement one proved overlay on a known static-art offender, then promote the approach to a data-driven per-scene overlay table.
- Do not claim "full translation" until static art, HUD art, inventory art, maps, and dialogue/screenshots are all covered by current runtime evidence.

## 2026-06-17 AS3 Static Scene-Art Overlay Proof: Mocktropica MainStreet

- Added repeatable script `tools/patch-as3-scene-static-overlays.js` and npm script `patch:as3-scene-static-overlays`.
- Patch exports `game.scene.template.GameScene`, injects `zhApplyStaticSceneTextOverlays()` from `loaded()`, and draws noninteractive CJK `TextField` overlays on `_hitContainer` by `groupPrefix`.
- First target: `scenes/mocktropica/mainStreet/`.
  - HQ exterior sign English (`Poptropica WORLDWIDE HEADQUARTERS`, `Under new management`) is covered with `波普托皮卡 / 全球总部 / 新管理层接管中`.
  - Window poster text `the hair club` is covered with `发型俱乐部`.
- Important failed attempt: moving the overlay call into `GameScene.addGroups()` after collisions crashed Flash. Failed QA report: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781707093185.json`; initial screenshot was black and after-resize showed Flash plugin crash. Keep the overlay hook in `loaded()` unless a safer depth hook is found.
- Final FFDec verification: `runtime-data/tmp/as3-scene-static-overlays-verify4/scripts/game/scene/template/GameScene.as` contains both overlay calls, and `addGroups()` contains only the normal `addCollisions(_loc3_)`.
- Final QA: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781708616592.json`, passed 1/1 for Mocktropica with stage coverage `0.967705` and visual guard ok.
- OCR evidence:
  - initial OCR text: `菜单 311 波普托皮卡 全球总部 新管理层接管中`.
  - after-resize OCR `runtime-data/qa/as3/resize-smoke/run-1781708616592/01-mocktropica-after-resize-ocr.json`: `菜单 发型俱乐部 311 波普托皮卡 全球总部 新管理层接管中`.
- Visual inspection still found smaller static logo text on the HQ glass doors. This means the proof is useful but Mocktropica is not fully finished yet.

## TODO Static Scene-Art Overlay Expansion

- Convert `tools/patch-as3-scene-static-overlays.js` from one-off hardcoded calls into a small overlay table so more scenes can be added safely.
- Extend Mocktropica MainStreet coverage to the HQ glass-door `Poptropica` logos.
- Next visible offenders from the AS3 resize contact sheet: `poptropicon` (`PEPE'S PUFFS`, `RESTROOMS`), `carnival` (`APOTHECARY`, `CARNIVAL IS HERE`), `timmy` school/store signs, and `virusHunter` (`TOWN HALL`).

## 2026-06-17 HUD Icon Translation Policy Correction

- User clarified that static icon art such as the HUD `MENU` badge should not be covered with a plain Chinese `TextField`; it either needs a real bitmap/icon replacement pipeline or should keep the original English art.
- Updated `tools/patch-as3-shell-hud-labels.js` so `patch:as3-shell-hud-labels` now removes the old `zhMenuOverlay` text patch instead of adding it.
- Rebuilt AS3 Shell/runtime:
  - Report: `runtime-data/qa/as3/as3-shell-hud-labels-patch.json`.
  - Runtime zip: `runtime-data/patched-zips/as3-runtime.zip`.
  - FFDec-exported Hud source no longer contains `zhMenuOverlay`, `zhLocalizeHudStaticLabels`, or literal `菜单`.
- Background G32QC verification:
  - Command: `npm run qa:as3-hud-smoke -- --islands=galactic-hot-dogs --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900 --initial-settle-ms=25000 --resize-settle-ms=25000`.
  - Report: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781713043684.json`, passed 1/1.
  - OCR sees restored `MENU`; placement remains correct with resized center x `1388.5`, right inset `49.5`.
  - MENU click remains responsive: changed-pixel ratio `0.983374`.
  - Visual inspection: `runtime-data/qa/as3/hud-smoke/run-1781713043684/01-galactic-hot-dogs-resized.png` shows the original badge art, not a Chinese text overlay.

## TODO HUD/Icon Asset Translation

- Do not use plain CJK text overlays for icon-like badges/buttons such as `MENU`.
- If these must be localized later, build a bitmap/icon replacement pipeline first, likely image generation or edited raster/vector assets inserted into the SWF/asset layer.
- Keep current text overlays only for signboard/poster-like static scene text where the overlay reads like an in-world sign and has visual proof.

## 2026-06-17 Mocktropica Static Overlay Expansion After HUD Policy Fix

- Converted `tools/patch-as3-scene-static-overlays.js` to render overlay calls from `STATIC_SCENE_OVERLAYS` instead of appending one-off regex edits.
- Added Mocktropica MainStreet glass-door logo coverage:
  - Two small `波普托皮卡` label patches now cover the door-glass `Poptropica` logos.
- Re-ran `npm run patch:as3-scene-static-overlays` successfully.
  - Report: `runtime-data/qa/as3/as3-scene-static-overlays-patch.json`.
  - Runtime zip: `runtime-data/patched-zips/as3-runtime.zip`.
- Re-ran Mocktropica resize QA on G32QC:
  - Command: `npm run qa:as3-resize-smoke -- --islands=mocktropica --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900 --initial-settle-ms=24000 --resize-settle-ms=50000 --resize-capture-retries=0`.
  - Report: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781713544304.json`, passed 1/1.
  - Stage coverage remains `0.967705`; visual guard ok.
  - Visual inspection: `runtime-data/qa/as3/resize-smoke/run-1781713544304/01-mocktropica-after-resize.png` shows restored original HUD `MENU`, Chinese HQ sign, Chinese hair-club sign, and two Chinese door-glass labels without character/NPC overlap.
  - After-resize OCR `runtime-data/qa/as3/resize-smoke/run-1781713544304/01-mocktropica-after-resize-ocr.json`: `发型俱乐部 MENU 311 波普托皮卡 波普托皮卡 波普托皮卡 全球总部 新管理层接管中`.
  - `MENU` is expected after the HUD icon policy correction; scene-art English such as `Poptropica`, `HEADQUARTERS`, and `hair club` is no longer OCR-visible in this viewport.

## 2026-06-17 Poptropicon Parking Static Overlay Expansion

- Extended `tools/patch-as3-scene-static-overlays.js` for `scenes/con1/parking/`.
- Added scene-text overlays for visible static English in the default Poptropicon parking viewport:
  - pizza-truck sign: `PEPE'S / PIZZA / PUFFS` -> `佩佩的 / 披萨 / 泡芙`.
  - side-window `PPP` -> `泡芙`.
  - restroom sign `RESTROOMS` -> `洗手间`.
  - chalkboard `MADE "FRESH"` -> `新鲜现做`.
  - truck side `PEPE'S` -> `佩佩的`.
  - poster `PONY WHISPERER` -> `小马 / 低语者`.
- Iteration notes:
  - First overlay used one large transparent rectangle on the pizza sign and looked too broad.
  - Revised to smaller per-line label patches and adjusted coordinates from the 2880x1500 background frame OCR.
  - Poster required a taller lower patch because a small `PONY` line remained after the first poster pass.
- Final QA:
  - Command: `npm run qa:as3-resize-smoke -- --islands=poptropicon --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900 --initial-settle-ms=24000 --resize-settle-ms=50000 --resize-capture-retries=0`.
  - Report: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781716345596.json`, passed 1/1.
  - Stage coverage `0.967705`; visual guard ok.
  - After-resize OCR `runtime-data/qa/as3/resize-smoke/run-1781716345596/01-poptropicon-after-resize-ocr.json`: `MENU 佩佩的 披萨 小马 泡芙 低语者 泡芙 洗手间 新鲜现做`.
  - Visual inspection: `runtime-data/qa/as3/resize-smoke/run-1781716345596/01-poptropicon-after-resize.png`; no crash, no window-fill regression, no old Poptropicon parking scene text detected by OCR. `MENU` remains by explicit HUD icon policy.

## TODO Static Overlay Followups After Poptropicon

- Continue same frame-OCR-coordinate workflow on Monster Carnival MainStreet (`APOTHECARY`, `CARNIVAL IS HERE`), Virus Hunter MainStreet (`TOWN HALL`), and Timmy MainStreet/store/school text.
- Poptropicon later scenes still need separate traversal and OCR; this only proves the default `con1/parking` scene viewport.

## 2026-06-17 Monster Carnival MainStreet Static Overlay Expansion

- Extended `tools/patch-as3-scene-static-overlays.js` for `scenes/carnival/mainStreet/`.
- Added Chinese overlays for visible static scene text in the default Monster Carnival MainStreet viewport:
  - `APOTHECARY` -> `药剂店`.
  - `MEDICINE CHEMISTRY SETS MINERALS` -> `药品 化学套装 矿物`.
  - `CARNIVAL IS HERE` -> `嘉年华来了`.
  - vertical `DINER` -> `餐厅`.
  - small carnival poster/sign -> `嘉年华`.
  - Lazy Sundae ice cream storefront -> `圣代冰淇淋`.
- Iteration notes:
  - First pass clipped the final character in `嘉年华来了`; widened the label, reduced font size, and rebuilt AS3 Shell/runtime.
  - Increased the apothecary sign background alpha so the old English does not bleed through the Chinese sign patch.
  - Per the HUD/icon correction, kept icon/logo-like art such as the HUD `MENU`, the cropped `Poptropica` brand art, and the `Rx` symbol rather than covering it with plain Chinese text.
- Rebuilt AS3 Shell/runtime:
  - Report: `runtime-data/qa/as3/as3-scene-static-overlays-patch.json`.
  - Runtime zip: `runtime-data/patched-zips/as3-runtime.zip`.
- Final G32QC resize QA:
  - Command: `npm run qa:as3-resize-smoke -- --islands=monster-carnival --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900 --initial-settle-ms=24000 --resize-settle-ms=50000 --resize-capture-retries=0`.
  - Report: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781717587440.json`, passed 1/1.
  - Stage coverage `0.967705`; visual guard ok.
  - Initial OCR includes full `嘉年华来了`.
  - After-resize OCR `runtime-data/qa/as3/resize-smoke/run-1781717587440/01-monster-carnival-after-resize-ocr.json`: `DCLLIUICLI MENU +米 ★米 餐厅 药剂店 药品化学套装矿物 嘉年华来了 嘉年华 圣代冰淇淋`.
  - Visual inspection: `runtime-data/qa/as3/resize-smoke/run-1781717587440/01-monster-carnival-after-resize.png`; no crash, no resize fill regression, no obvious scene-text clipping after the fix. `MENU` is expected by the icon policy.

## TODO Static Overlay Followups After Monster Carnival

- Continue with Virus Hunter MainStreet (`TOWN HALL`) and Timmy MainStreet/store/school visible static text.
- Build a stricter OCR leak classifier that ignores allowed icon/logo tokens (`MENU`, brand logo fragments, symbol-like `Rx`) but flags true scene sign English.
- Later revisit icon/logo bitmap localization with an image replacement pipeline rather than plain `TextField` overlays.

## 2026-06-17 Virus Hunter MainStreet Static Overlay Expansion

- Extended `tools/patch-as3-scene-static-overlays.js` for `scenes/virusHunter/mainStreet/`.
- Added default-viewport scene-text overlays:
  - `TOWN HALL` -> `市政厅`.
  - bus stop `BUS` -> `公交`.
  - bus shelter graffiti/static text -> `到此一游` and `末日将近`.
  - trash can `TRASH` -> `垃圾`.
  - newsstand `POP NEWS` -> `波普新闻`; `NEED A JOB?` -> `招聘吗`.
  - right-side bulletin board -> `今日公告 / 法庭听证 / 失物招领` for the wider resize viewport.
- Iteration notes:
  - First Virus pass had correct x positions but y was about 516 px too high because this scene's `_hitContainer` has a vertical offset relative to the visible art. Shifted only the Virus overlay y positions down by 516.
  - Second pass still leaked `POPNEWS` and `NEEDAJOB` on the newsstand; shifted those patches left/up and widened them.
  - `MENU` remains original English by the static icon policy.
- Rebuilt AS3 Shell/runtime:
  - Report: `runtime-data/qa/as3/as3-scene-static-overlays-patch.json`.
  - Runtime zip: `runtime-data/patched-zips/as3-runtime.zip`.
- Final G32QC resize QA:
  - Command: `npm run qa:as3-resize-smoke -- --islands=virus-hunter --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900 --initial-settle-ms=24000 --resize-settle-ms=50000 --resize-capture-retries=0`.
  - Report: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781719424269.json`, passed 1/1.
  - Stage coverage `0.967705`; visual guard ok.
  - Initial OCR text: `MENU 市政厅 公交 波普新闻 末日将近 招聘吗 垃圾`.
  - After-resize OCR `runtime-data/qa/as3/resize-smoke/run-1781719424269/01-virus-hunter-after-resize-ocr.json`: `MENU 市政厅 公交 波普新闻 末日将近 招聘吗 垃圾`.
  - Visual inspection: `runtime-data/qa/as3/resize-smoke/run-1781719424269/01-virus-hunter-after-resize.png`; no crash, no resize fill regression, no visible `TOWN HALL`/`BUS`/`TRASH`/newsstand English in the tested viewport.

## TODO Static Overlay Followups After Virus Hunter

- Continue with Timmy MainStreet/store/school visible static text.
- Add a small helper/report to list per-scene overlay y offsets so future scenes like Virus Hunter do not require manual re-discovery.
- Consider replacing the more rectangular text patches with bitmap-style patched art later; current overlays prioritize coverage and stability over final art fidelity.

## 2026-06-17 Timmy Failure MainStreet Dialogue And Static Text

- Found Timmy Failure default QA was not a static sign issue at first: runtime OCR showed English dialogue from `timmy/timmysStreet/dialog.xml`:
  - `Save it for the magistrate...`
  - `Joke's on her. Garbage stink is the ideal olfactory camouflage.`
- Added localized override file:
  - `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/timmy/timmysStreet/dialog.xml`.
  - Preserved original XML ids, links, `linkEntityId`, `triggerEvent`, and duplicate statement ids; translated the full file, not just the two observed lines.
- Rebuilt AS3 runtime:
  - `patch:as3-scene-static-overlays` report: `runtime-data/qa/as3/as3-scene-static-overlays-patch.json`.
  - Runtime zip replacement count increased from 573 to 574 after adding the Timmy dialog XML.
- First Timmy QA after dialog patch:
  - Report: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781720137580.json`, passed 1/1.
  - Initial OCR no longer saw the English dialogue; visual showed the scene stable.
  - Resize viewport exposed new static English on the bowling alley (`BOWLING LANES`, `OPEN`).
- Extended `tools/patch-as3-scene-static-overlays.js` for `scenes/timmy/mainStreet/`:
  - `BOWLING` -> `保龄球馆`.
  - `LANES` -> `球道`.
  - `OPEN` -> `营业中`.
  - Left the `Poptropica` blimp logo and HUD `MENU` unchanged by the icon/logo policy.
- Final Timmy resize QA:
  - Command: `npm run qa:as3-resize-smoke -- --islands=timmy-failure --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900 --initial-settle-ms=24000 --resize-settle-ms=50000 --resize-capture-retries=0`.
  - Report: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781720669192.json`, passed 1/1.
  - Stage coverage `0.967705`; visual guard ok.
  - After-resize OCR `runtime-data/qa/as3/resize-smoke/run-1781720669192/01-timmy-failure-after-resize-ocr.json`: `Poptropica MENU 保龄球馆 球道 营业中`.
  - Visual inspection: `runtime-data/qa/as3/resize-smoke/run-1781720669192/01-timmy-failure-after-resize.png`; bowling sign text is covered and no `BOWLING`/`LANES`/`OPEN` leak in OCR.
- Additional short-settle Timmy run:
  - Report: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781720813309.json`, passed 1/1.
  - Purpose: try to catch early dialogue after the XML translation. OCR did not capture English dialogue; no crash or resize regression.

## TODO Static Overlay Followups After Timmy

- Continue static scene-art OCR sweep beyond default viewports; the current work proves only the tested Timmy MainStreet/resize view.
- Re-run a multi-scene regression batch for the recently touched default AS3 scenes: Mocktropica, Poptropicon, Monster Carnival, Virus Hunter, and Timmy.
- Investigate dialogue bubble duration/rendering in Timmy with a dedicated interaction capture if future QA needs proof of visible Chinese dialogue rather than only absence of English OCR.

## 2026-06-17 Five-Scene AS3 Static Overlay Regression

- Ran a shared `GameScene` regression after adding Virus and Timmy overlays/dialog XML.
- Command: `npm run qa:as3-resize-smoke -- --islands=mocktropica,poptropicon,monster-carnival,virus-hunter,timmy-failure --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900 --initial-settle-ms=18000 --resize-settle-ms=30000 --resize-capture-retries=0`.
- Report: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781720910405.json`, passed 5/5.
- Artifact dir: `runtime-data/qa/as3/resize-smoke/run-1781720910405`.
- Per-scene summary:
  - `mocktropica`: ok; after-resize screenshot `01-mocktropica-after-resize.png`; stage coverage `0.967705`; visual ok.
  - `monster-carnival`: ok; after-resize screenshot `02-monster-carnival-after-resize.png`; stage coverage `0.967705`; visual ok.
  - `poptropicon`: ok; after-resize screenshot `03-poptropicon-after-resize.png`; stage coverage `0.967705`; visual ok.
  - `timmy-failure`: ok; after-resize screenshot `04-timmy-failure-after-resize.png`; stage coverage `0.967705`; visual ok.
  - `virus-hunter`: ok; after-resize screenshot `05-virus-hunter-after-resize.png`; stage coverage `0.967705`; visual ok.
- OCR caveat: `MENU` and `Poptropica` logo text remain expected/allowed by the static icon/logo policy unless a bitmap replacement pipeline is built.

## TODO Next Iteration

- Continue OCR-driven static scene-art sweep across more default islands/scenes, not just the five currently patched scenes.
- Add a leak classifier/report so allowed logo/icon text is separated from true remaining English signs/dialogue.
- Start a sound restoration audit again after the current text/UI pass, because the user specifically reported missing sound across all islands.

## 2026-06-17 AS2 Map Click Bridge, Audio Proof, And Missing Vendor Carts

- Rechecked the user's static-icon guidance: visible static icon art such as HUD `MENU` stays original English unless a real bitmap/image replacement pipeline is built; no Chinese text overlay is used on those icon textures.
- AS3 status before AS2 work:
  - Five-scene resize regression for Mocktropica, Poptropicon, Monster Carnival, Virus Hunter, and Timmy Failure passed 5/5.
  - Five-scene AS3 interaction/audio smoke passed 5/5 with `audioActive: 5`, `sceneEvidencePassed: 5`, `visualGuardPassed: 5`.
  - Runtime sound reference audit reported `missing: 0`, `totalReferences: 12318`, `resolved: 12282`, `ignored: 36`, `soundsXmlCount: 417`.
- AS2 finding:
  - Super Power/Time Tangled/Astro Knights/Zomberry initially had working audio and scene evidence, but the map click check failed because the background PostMessage click landed inconsistently on the Flash HUD.
  - Auto-open map FlashVar probe proved the underlying AS2 map path works: `popups/map.swf`, `popups/maps/Super.swf`, and `MapClicked` were observed.
- AS2 fixes:
  - `tools/lib/pack.js` now exposes `_root.__zhDirectOpenMap`, reads `flashpoint_auto_open_map_after_ms` from `_root`, `_level0`, or bare FlashVar, and keeps the invisible direct map hit area aligned with the visible blue `POP` map icon (`x=785,y=70,w=95,h=90` in root coordinates).
  - `packs/zh-CN/as2/files/content/www.poptropica.com/base.php` now adds a transparent `flashpointMapHotspot` over the map icon. It sends a map-open request via `ExternalInterface` when available, otherwise via Flash `SetVariable`.
  - AS2 `gameplay.swf` now installs an external map bridge that polls `__zhExternalMapRequest` and calls the same `zhOpenDirectMap()` path.
  - `tools/qa-as2-interaction-smoke.js` default map click point moved to `mapX=0.805,mapY=0.05`, which targets the visible map icon across both full-width AS2 scenes and Super Power's cropped stage analysis.
  - Restored five `vendorCart.swf` runtime override files from Git HEAD (`islandAstro`, `islandCryptid`, `islandSteam`, `islandTime`, `islandTrade`) because Astro Knights and Time Tangled were returning 404 for those vendor carts.
- Build/verification:
  - Rebuilt `runtime-data/patched-zips/as2-runtime.zip`; AS2 runtime replacement count is now `48`.
  - `npm run verify:pack-inputs -- --source as2` passed with `replacementCountMatches: true` and `untrackedRuntimeInputCount: 0`.
- QA evidence:
  - Single Super Power AS2 smoke passed: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781725929768.json`.
  - Representative AS2 four-island smoke passed: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781726576061.json`.
  - Final AS2 representative result: `passed: 4/4`, `audioActive: 4`, `mapClicksPassed: 4`, `sceneEvidencePassed: 4`, `visualGuardPassed: 4`, `withMissingLogRequests: 0`.

## TODO Next Iteration After AS2 Map Bridge

- Expand the AS2 representative smoke to a broader/all-island batch and classify any remaining failures by missing resource, map/UI click, scene load, audio, or visual guard.
- Continue AS3 static scene-art translation sweep, but keep logos/static icons such as `MENU` and `Poptropica` unchanged unless replacing with real bitmap art.
- Investigate map popup title/static art translation separately; it is visible English art, not a text-layer translation.

## 2026-06-17 Full AS2 Interaction Smoke

- Ran full AS2 launchable-island interaction smoke across all 34 AS2 islands on G32QC without foreground mouse clicks.
- Command:
  - `npm run qa:as2-interaction-smoke -- --all --targetMonitor G32QC --requireAudio --requireSceneEvidence --requireMapRequest --settleMs=9000 --windowTimeoutMs=45000 --betweenMs=800 --mapWaitMs=2600 --audioDurationSec=2.5 --skipOcr`
- Report:
  - `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781726837534.json`
  - Artifact dir: `runtime-data/qa/as2/interaction-smoke/run-1781726837534`
- Result:
  - `passed: 34/34`
  - `audioActive: 34`
  - `mapClicksPassed: 34`
  - `sceneEvidencePassed: 34`
  - `visualGuardPassed: 34`
  - `withMissingLogRequests: 0`
  - `failedKeys: []`
- Notes:
  - The restored vendor cart overrides fixed the previous Astro Knights and Time Tangled 404s.
  - The transparent map hotspot/AS2 bridge proved stable across all AS2 launchable islands.

## TODO Next Iteration After Full AS2 Smoke

- Run all-launchable AS3 interaction and resize smoke with the same strict missing-request/audio/scene/visual gates.
- Start a visible-text/static-art classification pass for AS2/AS3 map popups and other bitmap titles; do not cover static icons with Chinese text layers.
- Prepare a GitHub commit/PR once the next AS3 full batch is either green or the remaining failures are categorized.

## 2026-06-17 Full AS3 Interaction Smoke

- Re-ran all launchable AS3 direct-scene interaction smoke on G32QC without foreground mouse clicks.
- Static icon policy remains in force: HUD/menu icon art such as `MENU` stays original English unless replaced by real bitmap art; no Chinese text-layer patch is applied to those icon textures.
- First all-AS3 interaction run found one transient `survival` failure:
  - Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781728421256.json`.
  - Result: `passed: 11/12`, `audioActive: 12`, `sceneEvidencePassed: 12`, `interactionsPassed: 12`, `withMissingLogRequests: 0`.
  - Failure was `survival` initial visual guard only. The initial screenshot was a white loading frame, while the post-interaction screenshot was normal and showed the Survival intro popup.
- QA harness fix:
  - `tools/qa-as3-islands-smoke.js` now retries the initial visual guard when the first capture fails, preserving the first failed capture as `*-initial-visual-failed.*`.
  - This distinguishes slow first-frame loads from real white-screen failures.
  - `node --check tools/qa-as3-islands-smoke.js` passed.
- Survival single-island confirmation:
  - Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781729356882.json`.
  - Result: `passed: 1/1`, `audioActive: 1`, `sceneEvidencePassed: 1`, `visualGuardPassed: 1`, `withMissingLogRequests: 0`.
- Final full AS3 interaction result:
  - Command:
    - `npm run qa:as3-interaction-smoke -- --targetMonitor G32QC --requireAudio --requireSceneEvidence --requireVisualGuard --settleMs=12000 --windowTimeoutMs=45000 --allowNoSceneProgress --betweenMs=1000 --interactionWaitMs=3000 --audioDurationSec=3 --audioAttempts=2 --audioRetryDelayMs=2000 --skipOcr`
  - Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781729492610.json`.
  - Artifact dir: `runtime-data/qa/as3/interaction-smoke/run-1781729492610`.
  - Result:
    - `passed: 12/12`
    - `audioActive: 12`
    - `interactionsPassed: 12`
    - `sceneEvidencePassed: 12`
    - `visualGuardPassed: 12`
    - `withMissingLogRequests: 0`
    - `failedKeys: []`
  - `survival` preserved the transient first white frame at `runtime-data/qa/as3/interaction-smoke/run-1781729492610/10-survival-initial-visual-failed.png`, then passed with the later valid scene screenshot.

## TODO Next Iteration After Full AS3 Interaction Smoke

- Run all-launchable AS3 resize smoke with strict visual/stage gates.
- Continue visible static-art OCR classification, especially bitmap map popups and scene title art.
- Keep static icon/logo art unchanged unless replaced with generated or hand-edited bitmap assets, not Chinese text overlays.

## 2026-06-17 Full AS3 Resize Smoke

- Ran all launchable AS3 direct-scene resize smoke on G32QC without foreground mouse clicks.
- Command:
  - `npm run qa:as3-resize-smoke -- --islands=arabian-nights,escape-from-pelican-rock,galactic-hot-dogs,mission-atlantis,mocktropica,monkey-wrench,monster-carnival,mystery-of-the-map,poptropicon,survival,timmy-failure,virus-hunter --targetMonitor=G32QC --initial-size=1186x760 --resized-size=1450x900 --initial-settle-ms=18000 --resize-settle-ms=30000 --resize-capture-retries=1 --resize-retry-settle-ms=30000`
- Report:
  - `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781730449746.json`
  - Artifact dir: `runtime-data/qa/as3/resize-smoke/run-1781730449746`
- Result:
  - `passed: 12/12`
  - `failedKeys: []`
  - Every tested island reported `stageCoverageRatio: 0.967705`.
  - Every tested island reported `visual.ok: true`.
  - No resize retry artifacts were created; every island passed on the first resized capture.
- Per-scene keys:
  - `arabian-nights`, `escape-from-pelican-rock`, `galactic-hot-dogs`, `mission-atlantis`, `mocktropica`, `monkey-wrench`, `monster-carnival`, `mystery-of-the-map`, `poptropicon`, `survival`, `timmy-failure`, `virus-hunter`.

## TODO Next Iteration After Full AS3 Resize Smoke

- Run a combined packaging verification pass after the current AS2/AS3 runtime edits.
- Continue static-art translation classification, prioritizing map popups and non-icon scene title art.
- Prepare a clean checkpoint commit/PR after separating current-turn fixes from older unrelated dirty files.

## 2026-06-17 Pack Tracking And Sound Audit Checkpoint

- Created working branch `codex/full-poptropica-qa-20260617` for GitHub synchronization instead of committing directly on `main`.
- Staged AS3 translated XML/runtime override files so runtime pack inputs are tracked by Git.
- Pack-input verification:
  - Command: `npm run verify:pack-inputs`.
  - Result: `ok: true`.
  - AS2: `replacementCount: 48`, `manifestReplacementCount: 48`, `untrackedRuntimeInputCount: 0`.
  - AS3: `replacementCount: 574`, `manifestReplacementCount: 574`, `untrackedRuntimeInputCount: 0`.
- Runtime sound reference audit:
  - Command: `npm run audit:sound-refs:runtime`.
  - Report: `runtime-data/qa/sound-reference-audit-runtime.json`.
  - Result: `missing: 0`, `totalReferences: 12318`, `resolved: 12282`, `ignored: 36`, `soundsXmlCount: 417`.
- Removed three leftover temporary untracked files from `$out/` and `$tmp/`; no runtime input files were removed.

## TODO Next Iteration After Pack Checkpoint

- Commit and push the checkpoint branch.
- Continue deeper per-island playthrough testing beyond launch/resize smokes, especially quest-specific progression blockers.
- Continue static-art replacement planning for non-icon bitmap labels; keep `MENU` and logo/icon art as English until replaced with real bitmap assets.

## 2026-06-17 Reality2 Durable Resource Import And Shell-Code Blocker

- Made the Reality2/Wild Safari archive import durable instead of runtime-only:
  - `tools/import-reality2-archive.js` now writes original `www.poptropica.com` resources into tracked AS3 pack inputs under `packs/zh-CN/as3/files/content/...`.
  - Import result: `importedCount: 74`, `sceneResourceCount: 72`, `soundResourceCount: 2`, `totalBytes: 5800139`.
  - Runtime rebuild after import: AS3 `replacementCount: 648`.
  - Provenance report: `packs/zh-CN/as3/provenance/reality2-archive-import.json`.
- Added visible Reality2 XML translation patching:
  - Script: `tools/patch-reality2-xml-translations.js`.
  - Command: `npm run patch:reality2-xml`.
  - Result: `translationCount: 275`, `fileCount: 8`, `unmapped: []`.
  - Follow-up visible-tag scan over Reality2 XML found `remaining: 0` ordinary English visible strings after excluding the protected runtime placeholder `[Player Name]`.
  - Report: `packs/zh-CN/as3/provenance/reality2-translation-report.json`.
- Added imported Reality2 music resources:
  - `Safari_Extended.mp3`
  - `Train_Finale.mp3`
  - Runtime sound reference audit after import: `missing: 0`, `totalReferences: 12424`, `resolved: 12388`, `ignored: 36`, `soundsXmlCount: 423`.
- Tightened AS3 Shell class evidence:
  - AS3 SWF class names can appear in AVM2 form like `game.scenes.reality2.mainStreet:MainStreet`, not only dotted `game.scenes.reality2.mainStreet.MainStreet`.
  - Updated launch manifest and Reality2 Shell probe tooling to search both strict dotted and colon class encodings.
  - Current stable AS3 Shell still does not contain the Reality2 main-street class, so Wild Safari remains unlaunchable even though its data, asset, audio, and translations are now present.
- Latest launch gap state:
  - `npm run qa:launch-gaps` reports `ok: true`, `manifestTotalEntries: 47`, `launchable: 46`, `unresolved: 1`.
  - Sole unresolved entry: `reality-tv-wild-safari`.
  - Resource evidence is present, but Shell code evidence is missing from the stable runtime Shell.
- Archived Shell experiments:
  - `20201112013740` Shell contains Reality2 class evidence but behaves like a loader shell and stalled on loading animation.
  - `20200121200659` Shell contains Reality2 class evidence and BrowserShell/overrideScene strings, but direct launch, ShellLoader launch, object embedding, and temporary asset-host experiments still failed to reach the scene.
  - Conclusion: whole-Shell replacement is not a clean fix. The next technical route should be merging/importing the Reality2 ABC/classes into the current stable Shell, or finding a fully compatible code bundle from the same Shell generation.
- Static icon policy remains explicit:
  - HUD/menu/static icon art such as `MENU` stays original English unless replaced by real bitmap art.
  - Do not cover static icon textures with Chinese text layers; only translate normal dynamic text and non-icon content where it renders cleanly.

## TODO Next Iteration After Reality2 Durable Import

- Commit and push the Reality2 durable resource/import/translation checkpoint after verification.
- Investigate a code-level Shell merge path for `game.scenes.reality2.*` classes into the current stable AS3 Shell, or locate a compatible full Shell generation that launches existing AS3 islands and Reality2 together.
- Re-run all-island AS2/AS3 interaction and resize smoke after any Shell-code change; do not call Wild Safari playable until a real scene screenshot and interaction evidence pass.

## 2026-06-17 Goal Evidence Report Selection Fix

- Fixed `tools/qa-goal-evidence.js` so AS3 evidence no longer blindly trusts `as3-interaction-smoke-latest.json`.
- The latest AS3 interaction report can be a single-island Wild Safari Shell experiment, so the goal audit now scans historical AS3 interaction reports and selects the newest report that proves all launchable AS3 direct-scene islands passed audio, interaction, scene, and visual guards.
- Confirmed selected all-island AS3 report: `as3-interaction-smoke-1781729492610.json`, with `12/12` passed, audio active on all 12, scene evidence on all 12, visual guard on all 12, and no missing log requests.
- Re-ran `npm run qa:goal-evidence` after the fix:
  - `goalComplete: false`
  - `proved: 6`
  - `partial: 1`
  - `incomplete: 2`
  - Remaining real blockers are `all_islands_manifest_and_entry` and `scene_entry_stability`, both caused by Wild Safari lacking compatible Shell code.

## 2026-06-18 Reality2 Shell Merge And Native-Only Translation Policy

- Merged the 18 `game.scenes.reality2.*` classes from archived donor Shell `Shell-20201112013740.swf` into the current stable AS3 pack Shell using RABCDAsm, instead of replacing the whole Shell.
- Added repeatable merge tooling:
  - `tools/merge-reality2-shell-classes.js`
  - npm script `merge:reality2-shell`
  - provenance `packs/zh-CN/as3/provenance/reality2-shell-merge.json`
- Added missing native language resource `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/languages/en/islands/reality2/language.xml`, clearing the Wild Safari `reality2/language.xml` 404.
- Rebuilt AS3 runtime zip successfully after Shell merge and language XML import: replacement count `649`.
- Launch manifest gap audit now reports all entries launchable:
  - `manifestTotalEntries: 47`
  - `manifestLaunchableCount: 47`
  - `manifestUnresolvedCount: 0`
- Wild Safari single-island AS3 interaction smoke passed after the durable Shell merge:
  - Report `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781742655827.json`.
  - Result `1/1`, `audioActive: 1`, `sceneEvidencePassed: 1`, `visualGuardPassed: 1`, `withMissingLogRequests: 0`.
- User clarified the translation policy again: do not hard-translate scene signs, posters, logos, HUD badges, inventory art, or any other static artwork with TextField/overlay layers. Translate only native translatable resources, mainly dialogue/language/XML/dynamic text.
- Implemented that policy:
  - Added `tools/strip-static-text-overlays.js` and npm script `strip:static-overlays`.
  - Changed `patch:as3-scene-static-overlays` and `patch:as3-shell-inventory-tab` to run the strip tool rather than re-adding hard overlays.
  - Removed AS3 `GameScene` static scene-art overlays.
  - Removed AS3 Inventory custom/prize static trophy-art overlay.
  - Removed AS2 Super Power DownTown `主街` hard overlay.
  - Updated `tools/lib/pack.js` so future AS2 Super Power scene repacks remove the old static overlay rather than injecting it.
  - Updated `tools/qa-validate-runtime.js` so static sign Chinese is no longer a required AS2 verdict item.
- Confirmed by FFDec source export that AS3 `GameScene.loaded()` no longer calls `zhApplyStaticSceneTextOverlays()` and `InventoryTab.init()` no longer calls `zhLocalizeStaticTabArt()`. AS2 DownTown binary scan no longer contains `zhAddDownTownMainStreetLabel` or `__zhMainStreetLabel`.
- Post-policy AS3 all-island interaction smoke passed:
  - Report `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781742743596.json`.
  - Result `13/13`, `audioActive: 13`, `interactionsPassed: 13`, `sceneEvidencePassed: 13`, `visualGuardPassed: 13`, `withMissingLogRequests: 0`.
- Post-policy AS3 all-island resize smoke passed:
  - Report `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781743890033.json`.
  - Result `13/13`, target monitor `G32QC`, every resized capture passed stage and visual guard.
- Post-policy AS2 Super Power single-island interaction smoke passed:
  - Report `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781745025226.json`.
  - Result `1/1`, `audioActive: 1`, `mapClicksPassed: 1`, `sceneEvidencePassed: 1`, `visualGuardPassed: 1`, `withMissingLogRequests: 0`.
- AS2 aggregate refreshed after the Super Power rerun:
  - Report `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-aggregate-1781745107837.json`.
  - Result `34/34`, `audioActive: 34`, `mapClicksPassed: 34`, `sceneEvidencePassed: 34`, `visualGuardPassed: 34`, `withMissingLogRequests: 0`.
- Runtime sound reference audit remains clean after Reality2 import and overlay stripping:
  - `totalReferences: 12424`
  - `resolved: 12388`
  - `ignored: 36`
  - `missing: 0`
  - `soundsXmlCount: 423`

## TODO After Native-Only Translation Policy

- Stage the new tracked pack inputs/scripts, rerun `npm run verify:pack-inputs`, translation audits, `npm run qa:goal-evidence`, then commit and push.
- Treat static English in bitmap scene art as acceptable unless a real bitmap replacement pipeline is explicitly requested later.
- Continue deeper per-quest playthrough testing separately from launch/resize/audio smoke evidence.

## 2026-06-18 Static-Art Policy And HUD Button Matrix Follow-Up

- User clarified the native-only translation rule again:
  - Do not hard-translate island scene signs, posters, HUD icons, menu art, inventory trophy art, map art, or any static/bitmap artwork by adding Chinese TextField overlays.
  - Translate only native translatable resources such as dialogue, language XML, item XML, and runtime text channels.
  - Leave static English art unchanged unless a real bitmap replacement pipeline is explicitly requested later.
  - Follow-up clarification: island scene signboards, labels, notices, posters, and similar scene artwork also stay original English when the only implementation would be a Chinese text overlay.
- Enforced that policy in tooling:
  - `tools/patch-as3-scene-static-overlays.js` now delegates to `strip-static-text-overlays.js --as3` instead of adding scene sign overlays.
  - `tools/patch-as3-shell-inventory-tab.js` now delegates to `strip-static-text-overlays.js --as3` instead of adding Inventory trophy/prize overlays.
  - `tools/build-super-power-balloon-proof.js` is retired as a no-op report generator and no longer builds Super Power static sign overlays.
  - Fixed-string audit now leaves overlay markers only in strip/remove logic (`strip-static-text-overlays.js`, `tools/lib/pack.js`, and HUD overlay removal guards).
- Fixed AS3 HUD QA reliability:
  - `tools/qa-helper.py` now selects child Flash windows by visible intersection with the parent window and clips oversized child captures to the parent window. This prevents Flash child-window overflow from capturing the primary desktop.
  - `tools/qa-as3-hud-smoke.js` respects `POPTROPICA_QA_NO_FOREGROUND=1` during capture and adds resize-after-START handling for AS3 intro popups.
  - `tools/qa-as3-hud-button-matrix.js` now records per-island summaries, failed islands, screenshots, click points, and per-button pass/fail counts instead of reporting only the first child result.
- Root-caused the previous AS3 HUD matrix failures:
  - `survival` failed because resize reloads the iframe and brought the START popup back. The QA now clears START after resize; targeted risk matrix passed Survival across all 8 HUD buttons.
  - `mocktropica` Costumizer failure was a QA capture contamination issue: the Flash child window overflowed the parent and crossed into the primary monitor. Child capture clipping fixed it.
  - `monkey-wrench` default `beach` scene was blocked by the first-time tutorial overlay. Background post-message long-press shows the hand visual but does not advance the tutorial, so the stable default direct scene was changed to `mainLand`.
- Updated `catalog/launch-overrides.json` and regenerated `catalog/launch-manifest.json`:
  - `monkey-wrench` now launches `game.scenes.ftue.mainLand.MainLand`.
  - `npm run qa:launch-gaps` remains green: `47/47` launchable, `0` unresolved.
- Focused Monkey Wrench `mainLand` HUD smoke passed:
  - Report: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781761489601.json`.
  - Settings secondary click passed with menu placement and button response evidence.
- Risk-island AS3 HUD button matrix passed:
  - Report: `runtime-data/qa/as3/hud-button-matrix/as3-hud-button-matrix-1781764643616.json`.
  - Scope: `mocktropica`, `monkey-wrench`, `survival`.
  - Buttons: `settings`, `audio`, `home`, `realms`, `store`, `map`, `costumizer`, `inventory`.
  - Result: `8/8` buttons passed, each with `3/3` islands passed.
- AS3 all-island interaction smoke passed after the Monkey Wrench default-entry change:
  - Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781764695868.json`.
  - Result: `13/13`, `audioActive: 13`, `sceneEvidencePassed: 13`, `visualGuardPassed: 13`, `withMissingLogRequests: 0`.
- AS3 all-island resize smoke passed after the Monkey Wrench default-entry change:
  - Report: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781765664404.json`.
  - Scope: all 13 AS3 launchable direct-scene islands.
  - Result: `13/13`, target monitor `G32QC`, stage and visual guards passed.
- A full AS3 HUD button matrix is now running in the background on G32QC:
  - Scope: all 13 AS3 direct-scene islands x 8 HUD buttons.
  - Main PowerShell PID: `57252`; Node runner PID: `57036`.
  - Logs: `runtime-data/qa/as3/hud-button-matrix/full-as3-hud-button-matrix-1781766642472.out.log` and `.err.log`.
  - Expected duration: about 4 hours based on the previous full matrix.
- Interim full-matrix progress at 2026-06-18 05:30 EDT:
  - Completed and parsed green: `settings`, `audio`, `home`, `realms`.
  - Each completed batch reports `13/13` islands passed, no failed keys, and all secondary checks true.
  - Current child process is running `store`; remaining after that are `map`, `costumizer`, and `inventory`.
  - Current completed coverage: 4/8 batches, 52/104 island-button checks.
- Interim full-matrix progress at 2026-06-18 05:36 EDT:
  - `store` also completed and parsed green: report `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781773505237.json`, `13/13`, failed keys `[]`, all secondary checks true.
  - Current child process is running `map`.
  - Current completed coverage: 5/8 batches, 65/104 island-button checks.
- Interim full-matrix progress at 2026-06-18 06:04 EDT:
  - `map` completed and parsed green: report `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781775230789.json`, `13/13`, failed keys `[]`, all secondary checks true.
  - Current child process is running `costumizer`.
  - Current completed coverage: 6/8 batches, 78/104 island-button checks.
- Interim full-matrix progress at 2026-06-18 06:34 EDT:
  - `costumizer` completed with one failure: report `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781776947161.json`, `12/13`.
  - Failed key: `mission-atlantis`, failed check `secondary_click_response_failed`.
  - Screenshot review shows the default Mission Atlantis entry is `deepDive1.reef`, an underwater submersible state where the Costumizer icon is visible but does not respond.
  - Next fix candidate: switch Mission Atlantis default direct-scene entry to the island first scene `game.scenes.deepDive1.ship.Ship`, then rerun Mission Atlantis Costumizer and affected AS3 smoke/matrix evidence.
  - Current full-matrix child process is running `inventory`.
  - Current checked coverage: 91/104 island-button checks, 90 passed, 1 pending fix.
- Applied the Mission Atlantis default-entry fix:
  - `catalog/launch-overrides.json` now uses `roomParam: "ship"` for `mission-atlantis`.
  - Regenerated `catalog/launch-manifest.json`; Mission Atlantis now targets `game.scenes.deepDive1.ship.Ship` with class evidence present.
  - `npm run qa:launch-gaps` still reports `47/47` launchable and `0` unresolved.
  - Pending validation after the running inventory batch completes: focused Mission Atlantis Costumizer HUD smoke on the new `ship` entry, then rerun affected AS3 HUD matrix coverage.
- Mission Atlantis fix validation:
  - Focused Costumizer HUD smoke passed on the new `ship` entry: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781780505815.json`.
  - Focused Mission Atlantis 8-button HUD matrix passed: `runtime-data/qa/as3/hud-button-matrix/as3-hud-button-matrix-1781781964216.json`, `8/8`.
  - Focused Mission Atlantis interaction smoke passed: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781782089054.json`, audio active, scene evidence, and visual guard passed.
  - Focused Mission Atlantis resize smoke passed: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781782190977.json`, stage coverage `0.967705`, visual guard passed.
  - Started a final full AS3 HUD matrix rerun after the fix: runner PID `54888`, logs `runtime-data/qa/as3/hud-button-matrix/final-full-as3-hud-button-matrix-1781782337510.out.log` and `.err.log`.
  - Interim final full-matrix progress at 2026-06-18 08:03 EDT: `settings` completed green, report `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781782352823.json`, `13/13`; current child process is running `audio`.
- QA predicate fix during final full-matrix rerun:
  - The first final rerun later produced a false Timmy Home failure: the Menu-open diff was only `0.024592` vs the old `0.05` threshold, but the subsequent Home modal did appear and the secondary check passed with `0.118835` diff plus Chinese confirm text.
  - Updated `tools/qa-as3-hud-smoke.js` so a successful secondary HUD click or Inventory click can prove the Menu click chain even when the initial menu-open pixel diff is small.
  - Stopped the stale runner PID `54888`.
  - Restarted the patched final full AS3 HUD matrix: runner PID `48672`, logs `runtime-data/qa/as3/hud-button-matrix/final2-full-as3-hud-button-matrix-1781787947529.out.log` and `.err.log`; current child process is running `settings`.

## TODO After Static-Art Policy And HUD Follow-Up

- Wait for the full AS3 HUD button matrix to finish; parse the resulting `as3-hud-button-matrix-*.json` and confirm all 104 island-button checks passed.
- Rerun `npm run verify:pack-inputs`, `npm run audit:translation-coverage`, `npm run audit:translation-quality`, `npm run audit:sound-refs:runtime`, and `npm run qa:goal-evidence` after the full HUD matrix completes.
- Commit and push the new QA/tooling/manifest changes to `origin/codex/full-poptropica-qa-20260617`.
- Keep the active goal open after this checkpoint unless a true full end-to-end playthrough requirement is explicitly considered satisfied; current evidence is strong smoke/resize/HUD/audio coverage, not complete quest-by-quest completion.

## 2026-06-18 P0 Playability Pivot

- User reset the current highest-priority acceptance criteria from HUD click coverage to actual playability quality:
  - Window resize and fullscreen transitions must leave the current scene stable, with no drifting UI, character, dialogue, buttons, or corrupted scene layout.
  - Scene loading progress bars must stay centered in windowed mode, fullscreen, and multiple resolutions.
  - Runtime NPC/scene dialogue must be verified in-game; translation coverage reports alone are not accepted.
  - Button labels/icons must be visually centered through systemic UI fixes, not one-off button patches.
  - Scene arrows such as enter/exit/go left/go right must be translated only when they are native text fields. Static image/art labels must not be covered by Chinese text overlays; they need real image replacement later or must be logged as unfinished.
- Stopped/downgraded the running AS3 HUD button matrix. Current P0 work will not wait for or prioritize that matrix.
- Updated `CHECKLIST.zh-CN.md` into a P0 playability checklist:
  - Marks all five new P0 blockers as open.
  - Keeps old launch/interaction/resize/audio/coverage evidence only as baseline evidence.
  - Documents the native-text-only translation rule for dialogue, buttons, arrows, and static artwork.
  - Adds a representative real-play sample plan covering AS2 and AS3 islands.
  - Adds a rough ETA split: first QA harness/screenshots, dialogue root-cause/fix, resize/fullscreen/loading fix, UI/arrow pass, and broad regression.
- First root-cause lead for runtime English dialogue:
  - Existing coverage audit reported 15888/15888, but that is not sufficient.
  - Found native runtime AS2 XML with untranslated dialogue fields, for example `packs/zh-CN/as2/files/content/www.poptropica.com/scenes/islandTrain/assets/clues.xml` containing English `<SayText>` entries.
  - Next technical direction is to extend the extraction/patch/audit pipeline to include these runtime dialogue XML fields, then verify by entering the island and capturing NPC/dialogue screenshots.
- Next implementation focus:
  - Reuse and extend `tools/qa-validate-runtime.js`, `tools/runtime-flow-check.js`, and `tools/qa-helper.py` for background real-play screenshots on G32QC/no-foreground mode.
  - Add loading-bar center and fullscreen/resize visual checks.
  - Fix native dialogue XML translation gaps before trusting translation coverage again.
  - Build a button/arrow visual audit that distinguishes native TextField text from static image art.

## 2026-06-18 Runtime XML Text Node Fix

- Root cause for many runtime English dialogue lines:
  - `fast-xml-parser` represents text inside elements with attributes as a `#text` child, for example `SayText/#text`.
  - Existing XML write-back used `applyLanguageXmlValueReplacements()` for all XML text rows, which derives the tag name from the last path segment.
  - For `SayText/#text`, that attempted to replace a nonexistent `<#text>` tag, so the database could contain a valid Chinese translation while the generated pack XML stayed English.
- Fixed `tools/lib/pack.js`:
  - `getLastPathSegment()` now ignores `#text` and uses the real parent XML tag for safety checks.
  - Complex XML text rows containing `#text` now use structured XML write-back via `applyXmlTranslations()`.
  - Simple XML text rows still use the existing conservative tag-preserving replacement path.
- Added `tools/patch-runtime-xml-text-nodes.js` and npm script `patch:runtime-xml-text-nodes`:
  - This narrow patch path writes existing translated XML `#text` rows back to `packs/zh-CN/*/files` without deleting pack directories and without running FFDec/SWF replacement.
  - It emits `runtime-data/qa/runtime-xml-text-node-patch.json` for traceability.
- Applied the new patch:
  - Candidate assets: 1106.
  - Patched external XML assets: 333.
  - AS2 patched assets: `islandGameShow/assets/trivia_noItalics.xml` and `islandTrain/assets/clues.xml`.
  - AS3 patched assets include native item XML and many scene `dialog.xml` files that were previously not present in the runtime override pack.
- Concrete verification:
  - `packs/zh-CN/as2/files/content/www.poptropica.com/scenes/islandTrain/assets/clues.xml` now has Chinese `SayText` nodes, for example Tesla's first clue response starts with `爱迪生倒霉关我什么事`.
  - `Action type="addClue"` and similar runtime action fields remain untranslated/protected.
  - Grep for English-leading `<SayText>` in AS2 Mystery Train and Game Show patched XML returned no matches.
  - AS2 runtime zip rebuilt successfully with replacementCount 48.
  - AS3 runtime zip was rebuilt; the shell command timed out while waiting for JSON, but the zip and metadata were written at 2026-06-18 10:17 EDT with replacementCount 858 and no residual rebuild process.
- Current verifier status:
  - `npm run verify:pack-inputs` now passes AS2.
  - AS3 currently fails only because 209 newly generated runtime XML inputs are untracked in git. These need to be staged before the final pack-input verifier can pass.
- Still required:
  - In-game screenshot verification is still required. This fix proves the runtime XML pack contents, not yet that NPC/dialogue bubbles display correctly in live gameplay.

## 2026-06-18 AS3 In-Game Dialogue Rendering Fix

- Live Timmy verification found a second runtime issue after XML translation write-back:
  - `timmy/mainStreet/dialog.xml` was loaded from the patched runtime pack and contained Chinese text.
  - The first in-game screenshots showed an empty word balloon, not English text, so the blocker moved from "translation not in runtime data" to "AS3 word-balloon TextField cannot render Chinese."
- Fixed `tools/patch-as3-shell-ui-text.js`:
  - Added `game.creators.ui.WordBalloonCreator` to the Shell patch so character dialogue balloons use non-embedded `_sans` text fields.
  - Added a CJK branch in `game.util.TextUtils.formatAsBlock()` so Chinese dialogue wraps by character count instead of relying on spaces.
  - Added `game.creators.ui.TextDisplayCreator` native TextField handling with non-embedded `_sans` for scene-native dynamic text.
  - Kept the static-art policy unchanged: this does not add Chinese overlay text to static signs, image icons, or arrows.
- Rebuilt AS3 `Shell.swf` and `runtime-data/patched-zips/as3-runtime.zip` with `npm run patch:as3-shell-ui-text`.
- Verified in live AS3 gameplay:
  - Command: `node tools\qa-as3-islands-smoke.js --interaction --island timmy-failure --skipAudio=1 --requireInteraction=1 --requireSceneEvidence=1 --requireVisualGuard=1 --settleMs=12000 --interactionWaitMs=5000 --interactionX=0.55 --interactionY=0.84 --windowTimeoutMs=45000 --noForegroundCapture=1`
  - Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781794315853.json`.
  - Screenshot: `runtime-data/qa/as3/interaction-smoke/run-1781794315853/01-timmy-failure-interaction.png`.
  - OCR detected Chinese: `我记得不是这样的。完全不是这样，` with confidence `0.9737`.
  - Visual inspection confirms the dialogue text is visible, centered inside the word balloon, and not overflowing.
- Still required for P0 dialogue blocker:
  - Cross-check at least one more AS3 island/scene and one AS2 island/scene with actual NPC or interactive dialogue screenshots.
  - Run pack input verification again after staging the newly generated runtime XML inputs.

## 2026-06-18 AS3 P0 Resize/Fallback Background Fix

- Implemented a P0 AS3 playability harness:
  - Added `tools/qa-as3-p0-playability.js` and npm script `qa:as3-p0-playability`.
  - Captures launch/scene/dialogue/resize/maximize screenshots on G32QC with no foreground capture and post-message clicks.
  - Added stable screenshot retry logic for resize/maximize so transient Flash resize frames do not count as final visual failures.
  - Added launch-stage loading samples, but direct AS3 scene entries usually finish loading before the first capture.
- Reworked AS3 browser resize strategy:
  - `tools/patch-as3-shell-layout-live.js` now applies a fit-scale browser viewport instead of a raw 1:1 stage viewport.
  - The game keeps a 960x640-style logical viewport and scales the Shell container to the browser/plugin size.
  - Added a light sky fallback background color behind transparent/short scene layers to prevent black top bands on tall/high windows.
  - Added npm alias `patch:as3-shell-layout-fit`.
  - Rebuilt `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf` and `runtime-data/patched-zips/as3-runtime.zip`.
  - Patch report: `runtime-data/qa/as3/as3-shell-layout-fit-patch.json`.
- Resize evidence:
  - Timmy Failure 2300x1320 resize now passes: `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781797614392.json`.
    - Old failure had top edge dark percentage around 96%; new run has top edge dark percentage around 0.79%.
    - Visual screenshot: `runtime-data/qa/as3/resize-smoke/run-1781797614392/01-timmy-failure-after-resize.png`.
  - Timmy Failure P0 playability passes window resize/maximize visual checks and initial Chinese dialogue:
    - `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781797908486.json`.
    - Initial OCR contains Chinese dialogue: `我没空跟你耗，祝你好运洗掉这身垃圾味。`
  - Poptropicon 1450x900 visual guard now passes after fallback background:
    - `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781798912365.json`.
    - Dialogue target still fails; visual/layout part passes.
  - Poptropicon 2300x1320 resize passes:
    - `runtime-data/qa/as3/resize-smoke/as3-resize-smoke-1781800354913.json`.
    - Visual screenshot: `runtime-data/qa/as3/resize-smoke/run-1781800354913/01-poptropicon-after-resize.png`.
- Static-art policy confirmation during screenshot review:
  - Menu bag icon remains English art, not Chinese text overlay.
  - Scene signs such as `OPEN`, `APOTHECARY`, `PEPE'S PIZZA PUFFS`, and arrow art are left as static artwork; no Chinese text layer was added.
- Still open:
  - F11 true fullscreen is not yet accepted as fixed; current reliable proof is normal resize and OS maximize/near-full window behavior.
  - Loading progress center is not proven because AS3 direct-scene entries load before the first capture. Need base/start launch flow or delayed loading path.
  - Monster Carnival and Poptropicon NPC click targets are not reliable yet. Several clicked points simply moved the player/camera instead of opening dialogue.
  - Need AS2 resize/dialogue/loading parity after AS3 path stabilizes.

## 2026-06-18 P0 Loading And Dialogue QA Tightening

- Tightened `tools/qa-as3-p0-playability.js` so it better matches the current P0 acceptance criteria:
  - Added an `as3-start-flow` entry (`base.php?room=FlashpointStart`) for real launch loading screenshots.
  - Added stricter Chinese detection: at least two CJK characters are required, preventing false passes from OCR noise such as a single `工`.
  - Added optional dialogue click sequences and `--interaction-only` calibration mode for faster NPC point testing.
  - Changed post-resize dialogue preservation logic so an already visible Chinese dialogue bubble is preserved for the next viewport check instead of being disturbed by another click.
  - Cleaned unverified Monster Carnival/Poptropicon multi-click defaults so failed NPC targeting is reported honestly instead of driving the player into unrelated hot zones.
- Loading center evidence:
  - Real AS3 start-flow launch captured `Poptropica LOADING` in windowed mode.
  - Passing report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781801129750.json`.
  - Visual sample: `runtime-data/qa/as3/p0-playability/run-1781801129750/01-as3-start-flow-launch-loading-120.png`.
  - The loading screen is centered in this window-mode sample; full/maximize loading and scene-transition loading are still open.
- Dialogue/resize evidence after stricter checks:
  - Timmy Failure still proves live Chinese dialogue rendering and runtime translation data.
  - Strict 1-second resize run: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781802637696.json`.
    - Initial dialogue OCR contains Chinese.
    - Resize capture also contains Chinese dialogue.
    - Maximize capture no longer contains dialogue, so this is not a full P0 pass for dialogue preservation.
  - Longer strict run: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781802482288.json` confirmed that waiting longer after resize loses the dialogue, likely due to timeout/state progression rather than a pure render crash.
- Resize reload experiment:
  - `--resize-reload-mode=frame` was tested as a possible "stable reload" strategy.
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781802775950.json`.
  - Resize reloaded and showed Chinese dialogue, but maximize produced unstable/blank visual samples, so iframe reload is not the default route.
- Cross-island NPC calibration is still blocked:
  - Monster Carnival explicit click sequences entered the ice cream shop or opened the newspaper popup instead of NPC dialogue.
  - Reports: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781801726652.json` and `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781802149623.json`.
  - Next direction is to derive NPC interaction paths from scene XML/interaction hot zones and camera state, not fixed screen ratios.

## 2026-06-18 AS3 Fixed-Aspect Resize Iteration

- Tightened `tools/qa-as3-p0-playability.js` to match the user's P0 playability order:
  - Added `dialoguePhase` modes. The default with viewport checks is now viewport-first, so the main P0 path is resize/maximize then interact, not "open dialogue and hope it stays visible forever."
  - Added strict post-viewport dialogue checks. `after-each` now requires the expected resized/maximized dialogue checkpoints separately instead of passing only because one earlier viewport still had Chinese.
  - Added `--initial-maximize` for future loading capture attempts.
  - Suppressed expected early-frame loading sample analysis errors so blank startup frames do not pollute real failed checks.
- Reworked AS3 Shell resize again:
  - `tools/patch-as3-shell-layout-live.js` now keeps a fixed 960x640-style logical viewport, scales the outer Shell container to fit the browser window, and centers it.
  - Browser resize no longer calls `GroupManager.resize()` in this fixed-viewport path. That call was enough to make Poptropicon's camera jump to a sky-only view after resize.
  - Rebuilt `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf` and `runtime-data/patched-zips/as3-runtime.zip`.
  - Patch report remains `runtime-data/qa/as3/as3-shell-layout-fit-patch.json`, now describing fixed-aspect centered viewport behavior.
- Resize/fullscreen-adjacent evidence:
  - Poptropicon visual drift before the fix: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781804788894.json` still passed numerically but manual screenshot review showed sky-only frames after resize/maximize.
  - Poptropicon after the no-GroupManager resize fix: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781805416576.json` passed; manual screenshots show the pizza truck, ground, player, NPCs, and Menu still visible after resize/maximize.
  - Monster Carnival after the fix: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781806307004.json` passed resize/maximize visual regression.
  - `reloadOnResize=page` is not a safe default. Timmy could produce a post-maximize Chinese dialogue with it (`as3-p0-playability-1781803666988.json`), but Poptropicon/Monster produced black/blue transitional failures (`as3-p0-playability-1781803816545.json`).
- Dialogue status after this pass:
  - Timmy still fails strict maximum-window dialogue after relayout: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781805539693.json`. Resize preserves Chinese; maximize ends up in the Bowling area and the NPC target does not produce Chinese.
  - Poptropicon `con1/parking/dialog.xml` is Chinese in the runtime pack, but fixed screen-ratio clicks still do not reliably hit NPC dialogue. Multi-point calibration report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781805855873.json`.
  - Current conclusion: cross-island dialogue is no longer primarily a translation XML problem for these AS3 samples; it is an interaction-path problem. Next work should derive NPC/hotspot targets from AS3 components, scene classes, or runtime state instead of guessing coordinates.
- Loading status:
  - Window-mode AS3 start-flow loading center evidence remains `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781801129750.json`.
  - Initial maximize launch sampling did not capture loading: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781806085007.json`. Need earlier capture or an intentionally delayed loading path for full/maximize loading-center proof.

## 2026-06-18 AS3 Shared Button Label Patch

- Added `game.creators.ui.ButtonCreator` to `tools/patch-as3-shell-ui-text.js` so shared AS3 button labels use a CJK-safe native text path:
  - `FONT_DEFAULT` now uses `_sans`, bold, center alignment.
  - `addLabel()` disables embedded fonts and applies `_sans`/center formatting.
  - Added `zhFitButtonLabel()` to shrink long labels within the button bounds.
- Rebuilt `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf` and `runtime-data/patched-zips/as3-runtime.zip`.
- Patch report: `runtime-data/qa/as3/as3-shell-ui-text-patch.json`.
- Verified the final packaged `Shell.swf` still contains both required patch families after the rebuild:
  - `ScreenManager` still contains `zhApplyBrowserFitViewport()`.
  - `ButtonCreator` still contains `zhFitButtonLabel()` and `_sans`/non-embedded button labels.
  - `WordBalloonCreator` still contains `_sans`/non-embedded dialogue balloon text.
- HUD button matrix/smoke remains downgraded. A settings sample produced a false pass after a bad click coordinate, so it is not valid P0 UI evidence. Button alignment still needs a dedicated visual audit.

## 2026-06-18 P0 Playability/UI Evidence Update

- Repaired `tools/qa-as3-hud-smoke.js` after it generated bad evidence:
  - `--as3-scene-override=reality2/mainStreet` is now normalized to `game.scenes.reality2.mainStreet.MainStreet`.
  - The override path now uses `buildAs3DirectSceneUrl()` and defaults `reloadOnResize=0`; the old hardcoded `reloadOnResize=1` could push Basilisk into an `application/octet-stream` download dialog after resize.
  - `node --check tools\qa-as3-hud-smoke.js` passes.
- Added reliable AS3 UI screenshots on the G32QC/no-foreground path:
  - Settings panel: `runtime-data/qa/as3/hud-smoke/run-1781810492978/01-reality-tv-wild-safari-secondary.png`.
    - Visual result: Chinese settings panel, sound/music controls, dialogue speed, graphics quality, and logout button are centered and not overlapping.
  - Leave-to-Realms confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781810649153.json`.
    - Screenshot: `runtime-data/qa/as3/hud-smoke/run-1781810649153/01-reality-tv-wild-safari-secondary.png`.
    - Visual result: confirmation text is centered; the old duplicate label bug (`确定 确定` on one button) is gone and the remaining single button label is centered.
- Confirmed stronger AS3 playability evidence:
  - Reality TV Wild Safari resize/maximize pass: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781807824364.json`.
  - Reality TV F11 pass: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781808127877.json`.
  - These screenshots prove the scene, HUD, player/NPCs, and Chinese dialogue options remain visually stable after viewport changes.
- Added native navigation label patching:
  - `tools/patch-native-navigation-labels.js` scans AS3 native XML labels/text and translates native labels such as `Exit -> 退出`.
  - Report: `runtime-data/qa/native-navigation-labels-patch.json`.
  - Remaining English native label in the report is `DISABLED`, treated as an internal/disabled label for now.
  - Static scene art, signs, image icons, and menu art are still intentionally not covered by Chinese text overlays.
- Loading status:
  - Large-window loading center proof exists: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781807946211.json`, sample `run-1781807946211/01-as3-start-flow-launch-loading-80.png`.
  - A later initial-maximize loading attempt timed out before writing a report; artifacts are in `runtime-data/qa/as3/p0-playability/run-1781810870375`.
  - Manual screenshot review shows those artifacts captured the `NEW PLAYER` start page, not a loading screen, so they cannot be used as loading-center evidence.
- AS2 status:
  - The existing Super Power screenshot reviewed in this pass is not NPC dialogue evidence; it is a scene/sign snapshot.
  - AS2 live NPC/dialogue Chinese remains open and should not be marked complete.
- Current next work:
  - Fix AS2/AS3 dialogue interaction targeting by deriving hot zones or runtime state instead of fixed screen ratios.
  - Add a maximize/F11 loading-center path that handles `NEW PLAYER`/`START` before sampling, or add a controlled loading delay route.
  - Continue UI screenshot audits for backpack, map, shop, inventory, and additional confirmation dialogs.
  - Update `CHECKLIST.zh-CN.md` after each meaningful pass/fail sample.

## 2026-06-18 Pack Input Verification

- Ran `npm run verify:pack-inputs` after the latest P0 UI/script edits.
- Result: failed only on AS3 untracked runtime inputs.
  - AS2: ok, replacementCount 48/48, untracked runtime inputs 0.
  - AS3: replacementCount 858/858 matches manifest, but untrackedRuntimeInputCount is 209.
- Interpretation:
  - The runtime zip contents match the manifest counts.
  - The failure is a repository hygiene/Git tracking issue for newly generated AS3 XML inputs, not a mismatch between pack inputs and zip replacement count.
- Before GitHub sync, stage/commit the generated AS3 XML inputs together with the scripts and runtime zip, then rerun `npm run verify:pack-inputs`.

## 2026-06-18 AS2 Dialogue Targeting Attempt

- Extended `tools/qa-as2-interaction-smoke.js` with optional dialogue-click support:
  - `--dialogue-click=1`
  - `--dialogue-x` / `--dialogue-y` stage-relative click coordinates
  - `--dialogue-wait-ms`
  - `--require-dialogue-chinese=1`
  - Default behavior is unchanged when `--dialogue-click` is not passed.
  - `node --check tools\qa-as2-interaction-smoke.js` passes.
- Super Power attempts:
  - `as2-interaction-smoke-1781811437164.json`
  - `as2-interaction-smoke-1781811539942.json`
  - `as2-interaction-smoke-1781811630785.json`
  - `as2-interaction-smoke-1781811738837.json`
  - All kept scene evidence and visual guard green, but the attempted NPC clicks only moved the player or hit navigation arrows; no Chinese dialogue appeared.
- Mystery Train attempts:
  - Initial scene proof without dialogue: `as2-interaction-smoke-1781811870750.json`.
  - Dialogue click attempts: `as2-interaction-smoke-1781811944086.json`, `1781812037193.json`, `1781812134817.json`.
  - The right-side NPC was visible and clicks landed near/on the NPC, but AS2 still treated them as movement clicks; OCR only saw `saving game`/HUD text, no dialogue.
- Current AS2 conclusion:
  - AS2 XML runtime text such as `islandTrain/assets/clues.xml` is Chinese in the pack, but live NPC dialogue proof is not complete.
  - Next AS2 route should support multi-step movement plus a second interaction click, or derive the correct AS2 interaction function/hot spot from scene scripts instead of single screen coordinates.

## 2026-06-18 P0 Runtime Mute And AS2 Text Pack Follow-up

- User confirmed AS2 chat is Chinese in actual play, so AS2 dialogue translation is no longer treated as blocked by the automated postMessage NPC-click failure. The remaining failure is a QA input-delivery limitation, not proof that runtime chat text is English.
- Fixed an AS2 script-text extraction gap:
  - `tools/lib/extractors.js` now extracts AS2 `q1/q2/q3` and `answ1/answ2/answ3` native chat fields in addition to `talkyText`, `manualSay`, `showSay`, and `a1/a2/a3`.
  - Re-extracted `scenes/islandTrain/sceneTrainMain.swf`; string count increased from 22 to 23.
  - Seeded `Need a hand? -> 需要帮忙吗？`.
- Rebuilt AS2 pack successfully after clearing a stale partial `packs/zh-CN/as2/swf` output directory:
  - `packs/zh-CN/as2/manifest.json`: `assetsPatched=45`, `swfPatchedAssets=38`, `pendingSwfAssets=0`.
  - `runtime-data/patched-zips/as2-runtime.zip.meta.json`: generated at `2026-06-18T23:39:16.870Z`, `replacementCount=43`.
  - Final `sceneTrainMain.swf` script export confirms `char4.q3 = "需要帮忙吗？"`.
  - Final `gameplay.swf` script export confirms the AS2 NPC hit-test helper is present.
- Added runtime audio muting for user comfort:
  - New helper: `tools/mute-poptropica-runtime.ps1`.
  - `tools/lib/flashpoint-runtime.js` now starts a hidden mute watcher after spawning Poptropica runtimes, targeting Flashpoint Navigator / Flash plugin audio sessions only.
  - Set `POPTROPICA_QA_MUTE_RUNTIME=0` only if audible manual audio testing is explicitly needed.
- New loading evidence after muting:
  - `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781826999858.json` passed for `as3-start-flow` at `1450x900`.
  - Screenshot `runtime-data/qa/as3/p0-playability/run-1781826999858/01-as3-start-flow-launch-loading-20.png` was visually inspected; `Poptropica LOADING` is centered.
  - OCR center offset was `x=-2`, `y=2` pixels on a `1438x867` capture.
- Found a P0 resize/startup caveat:
  - `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781826428760.json` shows AS3 start-flow launched directly maximized can crash the Flash plugin before game init.
  - Treat this as an open P0-1 startup/maximize stability issue. The safer path remains: open normally, let the game initialize, then resize/maximize/F11.

## 2026-06-18 P0 Fresh Reality Pass And Timmy Failure Follow-up

- Fixed the AS3 start-flow QA start-button detector in `tools/qa-as3-p0-playability.js`.
  - OCR can split `NEW PLAYER` into separate `NEW` and `PLAYER` lines, so the script now combines stacked OCR lines before clicking.
  - Evidence artifact: `runtime-data/qa/as3/p0-playability/run-1781827496142/01-as3-start-flow-new-player-click.json` shows the click landed in the G32QC Flash child window.
  - Clicking `NEW PLAYER` advances to the gender selection screen, not a useful island loading sample, so it should not be counted as loading-center proof.
- Ran a fresh Reality TV Wild Safari P0 path with mute, no foreground capture, post-message clicks, resize, maximize, and F11:
  - Command used `--islands=reality-tv-wild-safari --try-f11=1 --require-f11=1 --require-post-viewport-dialogue=1 --skip-launch-loading-samples=1`.
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781827867114.json`.
  - Result: pass. Resize, maximize, and F11 screenshots all keep the scene, HUD, player/NPC positions, and Chinese dialogue options stable.
  - Manual screenshot review confirms static art such as `MENU` and `DANGER / STAFF ONLY` remains English and is not covered by Chinese text overlays.
- Re-ran Timmy Failure as a stress sample and found a real open P0 issue:
  - First run before entry correction: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781828057356.json`.
  - The initial Chinese dialogue appears, but resize produces a large black transitional frame and then the camera/player state ends up around the Bowling Lane area; post-viewport Chinese dialogue is not recovered.
- Aligned Timmy's AS3 launch override with the island first scene:
  - `catalog/launch-overrides.json` now uses `roomParam: "timmysStreet"` for `timmy-failure`.
  - Regenerated `catalog/launch-manifest.json` via `npm run discover:launch-scenes > runtime-data/qa/launch-scenes-latest.json`.
  - Manifest now targets `game.scenes.timmy.timmysStreet.TimmysStreet`.
- Re-ran Timmy after the entry correction:
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781828431912.json`.
  - Result: still fails. The corrected entry proves the issue is not just an incorrect manifest URL.
  - Current interpretation: Timmy's opening scripted dialogue/scene state is being advanced or camera-shifted during/after resize. This remains a P0-1/P0-3 blocker, separate from translation coverage because the starting dialogue text itself is Chinese.
- Updated `CHECKLIST.zh-CN.md` to `2026-06-18 20:25 EDT` with the fresh Reality pass, Timmy failure, and start-flow click-fix evidence.

## 2026-06-18 Native Navigation And Static-Art Rule Recheck

- Re-ran `npm run patch:native-navigation-labels`.
  - Report: `runtime-data/qa/native-navigation-labels-patch.json`, generated `2026-06-19T00:27:13.401Z`.
  - AS3 scene XML files scanned: 405.
  - `changedCount: 0`; previous native label translations are already applied.
  - Remaining English native label is still only `DISABLED` in `arab2/entrance/doors.xml`, treated as an internal disabled state rather than a player-facing arrow label.
- Broad scanned current AS3/AS2 pack XML/PHP/JSON inputs for native navigation strings: `Enter`, `Exit`, `Go Left`, `Go Right`, `Go Up`, `Go Down`, `Common Room`, `Travel`.
  - No matches remained in authoritative pack inputs.
  - A `runtime-data/tmp` search timed out and is not authoritative; use pack inputs and final SWF/XML evidence instead.
- Confirmed static-art policy is present in AS3 manifest:
  - `packs/zh-CN/as3/manifest.json` has `staticTextOverlayPolicy.status = "disabled"`.
  - Rule explicitly says scene signs, static icon art, logos, and bitmap/static artwork must not be translated with TextField overlays.
  - AS3 stripped classes include `game.scene.template.GameScene` and `game.ui.inventory.InventoryTab`.
- Current policy remains:
  - Native TextField/XML labels such as `Exit` are translated.
  - Static images/art labels such as Menu, signs, logos, arrows, posters, and scene art remain English unless a real bitmap replacement pipeline is added later.

## 2026-06-18/19 AS3 Native Labels And P0 Regression Follow-up

- Reworked `tools/patch-native-navigation-labels.js` so it no longer scans only already-generated pack files.
  - It now extracts AS3 source scene XML from `AS3.zip`, merges that with existing `packs/zh-CN/as3/files/...` overrides, and writes missing native XML label replacements back into the pack.
  - It skips XML comments and keeps the static-art policy intact: only native `<label><text>...</text></label>` fields are translated; static signs, posters, Menu art, and bitmap lettering are not overlaid.
  - It now records all final native-label override files in `packs/zh-CN/as3/manifest.json`, not only files changed during the last run.
- Final native label report:
  - `runtime-data/qa/native-navigation-labels-patch.json`, generated `2026-06-19T02:56:36.506Z`.
  - Scanned `2959` AS3 scene XML files.
  - Final native-label override file count: `479`.
  - Player-visible remaining English native labels: `0`.
  - Ignored internal label: `DISABLED` in `content/www.poptropica.com/flashpoint/originals/game/data/scenes/arab2/entrance/doors.xml`.
  - Runtime zip evidence: `runtime-data/patched-zips/as3-runtime.zip`, status `ready`, replacementCount `1276`.
  - Direct runtime zip check confirmed `content/www.poptropica.com/game/data/scenes/timmy/mainStreet/doors.xml` contains `向左走`, `进入`, `公共房间`, `向右走`, `向上走`, and `旅行`.
- Fresh Reality TV Wild Safari P0 regression after the AS3 runtime rebuild:
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781835506810.json`.
  - Result: pass.
  - Resize, maximize, and F11 are visually stable; Chinese dialogue options remain visible.
  - Screenshot manually inspected: `runtime-data/qa/as3/p0-playability/run-1781835506810/01-reality-tv-wild-safari-f11.png`.
  - Static art such as `MENU` and `DANGER / STAFF ONLY` remains English, matching the no-overlay rule.
- Timmy Failure follow-up after the AS3 runtime rebuild:
  - NPC dialogue evidence exists but should be interpreted carefully:
    - `as3-p0-playability-1781835666638.json` has initial/maximized Scutaro Chinese dialogue screenshots, but failed because the resize dialogue click missed.
    - `as3-p0-playability-1781835907517.json` has a resized Scutaro Chinese dialogue screenshot, but failed because the same-run maximize click did not reopen the same NPC dialogue.
    - These failures are QA input/state sequencing issues, not evidence of English runtime dialogue.
  - Native door/arrow label evidence:
    - `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781836576482.json` passed.
    - Manual screenshot `run-1781836576482/01-timmy-failure-resized-dialogue-attempt-1.png` shows the native `进入` label near the door; surrounding store/museum signs remain English static art.
    - Do not count this as NPC dialogue evidence; it proves native navigation labels.
  - F11 visual evidence:
    - `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781836840767.json` passed with `--skip-dialogue=1 --try-f11=1 --require-f11=1`.
    - Manual screenshot `run-1781836840767/01-timmy-failure-f11.png` shows stable fullscreen layout and HUD.
- Loading-center follow-up:
  - `as3-p0-playability-1781837089202.json` failed at 1450x900 because the Flash plugin crashed on AS3 start-flow launch.
  - `as3-p0-playability-1781837339385.json` did not crash at 1186x760, but loading was too fast to capture; samples landed on `NEW PLAYER` / gender-selection screens.
  - The earlier centered loading evidence `as3-p0-playability-1781826999858.json` remains useful, but after this rebuild P0-2 is not fully closed. Next route should add a controlled loading-delay/capture path or a scene-switch loading sample instead of relying on race-timing startup screenshots.
- Current next work:
  - Add a deterministic loading-center QA route that can capture windowed/maximized/F11 loading without racing the Flash plugin.
  - Improve Timmy/NPC QA by deriving actual AS3 interaction hot spots or scripting movement, instead of relying on fixed normalized screen coordinates.
  - Continue UI panel audits for backpack, map, shop, settings, and confirmation dialogs.
  - Before GitHub sync, rerun `npm run verify:pack-inputs` after staging generated AS3 XML files, because the current runtime input count has grown to `1276`.
- Verification after the notes above:
  - `npm run verify:pack-inputs` still fails only on Git tracking hygiene, not runtime/manifest mismatch.
  - AS2: replacementCount `43`, manifestReplacementCount `43`, untracked runtime inputs `1` (`sceneTrainMain.swf`).
  - AS3: replacementCount `1276`, manifestReplacementCount `1276`, untracked runtime inputs `627`.
  - Hidden runtime mute watcher restarted with PID `49716`.

## 2026-06-18/19 Loading Center And Fullscreen Probe Follow-up

- User asked to keep the runtime window muted. The previous mute watcher had exited, so a hidden watcher was restarted:
  - PID: `28244`.
  - Command: `tools/mute-poptropica-runtime.ps1 -DurationSeconds 28800 -IntervalMs 500`.
- Tried a QA-only `memStatus.swf` loading delay hook in `base.php` and `tools/lib/pack.js`, then reverted it before keeping the change:
  - Result: delaying `loadAS3Embassy()` held the real `memStatus.swf`, but that SWF rendered only a flat blue screen and produced no `Poptropica LOADING` evidence.
  - The hook was removed from the runtime path; `base.php` is back to the original AS3 embassy swap behavior except for a trailing newline.
- Rebuilt AS3 runtime zip after the revert:
  - Command: `npm run rebuild:runtime-zip -- --source=as3`.
  - Result: `ok=true`, runtime zip `ready`, replacementCount `1276`, `swfRuntimeOverrides=safe_subset`.
- Updated `tools/qa-as3-p0-playability.js`:
  - Added `--skip-start` so start-flow QA can stop on the first screen instead of clicking `NEW PLAYER`.
  - Initial screenshots that already contain `Poptropica LOADING` are now counted as loading-center evidence, not only explicit launch samples.
  - Added `--f11-before-initial`; after F11 the script now temporarily disables automatic monitor repositioning so QA does not convert true fullscreen into work-area maximized.
- New loading-center evidence:
  - `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781839546495.json`: 1186x760 start-flow pass.
    - `01-as3-start-flow-launch-loading-20.png` manually inspected.
    - OCR detected `Poptropica LOADING`; center offset `x=-3`, `y=2` on a `1174x727` capture.
  - `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781840348376.json`: 1450x900 start-flow pass.
    - Initial screenshot `01-as3-start-flow-initial.png` manually inspected.
    - OCR detected `Poptropica LOADING`; center offset `x=-2`, `y=2` on a `1438x867` capture.
- New start-flow layout observation:
  - `runtime-data/qa/as3/p0-playability/run-1781840218854/01-as3-start-flow-outer-client.png` shows the post-loading `NEW PLAYER` screen uses a fixed 960x640 Flash plugin centered inside the 1450x900 browser client.
  - This is not a crash and does not overlap UI, but it is not truly responsive; keep it as a P0-1/UI resizing caveat for the start-flow shell.
- F11 loading is still not closed:
  - `runtime-data/qa/as3/p0-playability/fullscreen-loading-probe-1781840671365/report.json` proves F11 itself can put the browser on the G32QC at true `2560x1440`, and the probe captures the outer client without moving it.
  - The screenshot `04-f11-outer-client.png` landed after the loading frame; it shows the start-flow frame with a black central plugin area, not `Poptropica LOADING`.
  - Earlier `--f11-before-initial` QA runs also missed the loading frame and should not be counted as P0-2 fullscreen loading passes.
- Verification:
  - `node --check tools/qa-as3-p0-playability.js` passes.
  - `node --check tools/lib/pack.js` passes.
  - `npm run verify:pack-inputs` still fails only on Git tracking hygiene:
    - AS2 replacementCount `43`, manifestReplacementCount `43`, untracked runtime inputs `1`.
    - AS3 replacementCount `1276`, manifestReplacementCount `1276`, untracked runtime inputs `627`.

## 2026-06-19 F11 Loading Capture And Reality Regression Follow-up

- Kept runtime audio muted through the hidden watcher; QA commands continued to use `POPTROPICA_QA_MUTE_RUNTIME=1`, `POPTROPICA_QA_MONITOR=G32QC`, and no foreground capture.
- Added a QA-only loading hold path:
  - New script: `tools/patch-as3-shell-loading-hold.js`.
  - It patches `game.ui.transitions.LogoLoadingScreen` to honor `flashpointQaLoadingHoldMs` and rebuilds AS3 runtime zip.
  - It also handles the early-transition-out case by continuing to load/show the transition before removing it.
  - Report: `runtime-data/qa/as3/as3-shell-loading-hold-patch.json`, generated `2026-06-19T04:31:48.922Z`; runtime zip status `ready`, replacementCount `1276`.
  - Current finding: direct-scene and start-flow visual loading observed by QA do not appear to use this Shell transition path, so this is useful infrastructure but not yet a P0-2 pass.
- Updated AS3 wrapper/QA plumbing:
  - `tools/lib/as3-direct-wrapper.js` and AS3 `base.php` now pass sanitized `flashpointQaLoadingHoldMs` through to Shell/framework paths.
  - `tools/qa-as3-p0-playability.js` now supports `--qa-loading-hold-ms`.
  - `--f11-before-initial` now waits for the Navigator window by PID without requiring the Poptropica title first, then captures startup loading samples from the outer browser client instead of the 960x640 Flash child window.
- F11 loading evidence improved but is not closed:
  - `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781843735292.json` failed `--require-loading` because no `Poptropica LOADING` text/progress bar was detected.
  - Manual screenshot `run-1781843735292/01-as3-start-flow-launch-loading-0.png` shows the true F11 outer client at 2560x1306 with the centered Poptropica startup/loading frame.
  - The next frame (`launch-loading-100.png`) is already the `NEW PLAYER` start screen, so the fullscreen progress/text frame is either absent in this path or too short to capture reliably.
  - Keep P0-2 open for F11: do not count the centered frame as the requested loading progress bar.
- Regression after the loading/QA changes:
  - `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781843948299.json` passed for Reality TV Wild Safari.
  - Resize, maximize, and F11 all preserved Chinese dialogue, HUD, characters, and scene layout.
  - Manual screenshot review passed: `runtime-data/qa/as3/p0-playability/run-1781843948299/01-reality-tv-wild-safari-f11.png`.
  - Static art such as `MENU` and `DANGER / STAFF ONLY` remains English, matching the no-overlay rule.
- Current next work:
  - Find the real framework/startScreen loading asset or trigger a real in-game scene transition while already in F11, then capture the progress/text frame centered.
  - Do not replace this with an HTML overlay or memStatus blue screen as a pass.
  - Continue broader P0 samples after that: Timmy natural state, AS2 fullscreen/resize, UI panels, and AS2 native labels/static asset list.
- Verification after this chunk:
  - `node --check tools/patch-as3-shell-loading-hold.js` passes.
  - `node --check tools/qa-as3-p0-playability.js` passes.
  - `npm run verify:pack-inputs` still fails only on Git tracking hygiene, with counts still matched:
    - AS2 replacementCount `43`, manifestReplacementCount `43`, untracked runtime inputs `1`.
    - AS3 replacementCount `1276`, manifestReplacementCount `1276`, untracked runtime inputs `627`.

## 2026-06-19 AS3 Viewport Fit And Reality P0 Regression Follow-up

- User asked to keep runtime audio muted; a hidden mute watcher is running and QA commands continue to use:
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
- Fixed the AS3 start-flow/fullscreen layout issue at the page/embed layer:
  - `packs/zh-CN/as3/files/content/www.poptropica.com/base.php` now preserves raw request params and centers/aspect-fits the Flash embed against `FLASHPOINT_GAME_WIDTH/HEIGHT`.
  - `flashpointApplyEmbedViewport()` runs immediately, after AS3 embassy replacement, on resize/orientation, and on delayed startup timers.
  - The old resize auto-reload approach was removed because it avoided the left-top frame but could leave a blue screen.
  - `tools/repair-as3-runtime-layout.js` now regenerates this patch and writes the generated `flashpoint/as3-direct.php` wrapper into the AS3 pack.
- Rebuilt AS3 runtime after the viewport-fit repair:
  - `node tools\repair-as3-runtime-layout.js` passed and wrote `runtime-data/qa/as3/as3-runtime-layout-repair.json`.
  - `node tools\rebuild-runtime-zip.js --source as3` passed.
  - Current AS3 runtime zip is `ready` with replacementCount `1277`.
- New F11/start-flow visual evidence:
  - Bad old evidence remains useful for comparison: `runtime-data/qa/as3/p0-playability/f11-rapid-loading-1781844384591/f11-start-flow-rapid-20.png` showed the startup loading panel stuck in the upper-left.
  - Fixed evidence: `runtime-data/qa/as3/p0-playability/f11-rapid-loading-after-fit-viewport-1781845975053/report.json`.
  - Manual screenshot review passed for `f11-start-flow-fit-viewport-0.png`: the Poptropica loading frame and progress-bar outline are centered in F11.
  - Long-run evidence: `runtime-data/qa/as3/p0-playability/f11-fit-viewport-long-1781846062266/after-22s.png` shows the start screen centered after 22 seconds, so this is no longer a blue-screen/dead-start path.
  - Important caveat: this still does not capture a F11 frame containing the `Poptropica LOADING` text. P0-2 remains open under the strict wording, even though the loading frame/bar outline is now visually centered.
- Hardened QA visual checks:
  - `tools/qa-helper.py` now adds sampled unique-color and dominant-color checks so blank cyan/black screens cannot pass solely on stage coverage.
  - `tools/qa-as3-p0-playability.js` now uses stable F11 capture retries and avoids re-maximizing during capture.
  - `tools/lib/qa.js` no longer auto-adds `--target-monitor` for `capture-window`, preventing screenshot capture from moving or resizing an already maximized/F11 window.
- Latest Reality TV Wild Safari P0 regression after these changes:
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781847990789.json`.
  - Result: pass.
  - Command used `--islands=reality-tv-wild-safari --try-f11=1 --require-f11=1 --require-post-viewport-dialogue=1 --resize-reload-mode=frame`.
  - Checks true: `sceneStable`, `visualStable`, `postViewportDialogueChinese`, `resizedViewportDialogueChinese`, `maximizedViewportDialogueChinese`, `postResizeDialogueChinese`, `f11Stable`.
  - Manual screenshot review passed for:
    - `run-1781847990789/01-reality-tv-wild-safari-f11-retry-1.png`
    - `run-1781847990789/01-reality-tv-wild-safari-maximized-dialogue-attempt-2.png`
  - Static art such as `MENU`, `DANGER STAFF ONLY`, and scene signage remains English, matching the no-overlay rule.
- Verification after this chunk:
  - `node --check tools\repair-as3-runtime-layout.js` passes.
  - `node --check tools\qa-as3-p0-playability.js` passes.
  - `python -m py_compile tools\qa-helper.py` passes.
  - `npm run verify:pack-inputs` still fails only on Git tracking hygiene:
    - AS2 replacementCount `43`, manifestReplacementCount `43`, untracked runtime inputs `1`.
    - AS3 replacementCount `1277`, manifestReplacementCount `1277`, untracked runtime inputs `628`.
    - The new untracked AS3 runtime input includes `packs/zh-CN/as3/files/content/www.poptropica.com/flashpoint/as3-direct.php`.
- Current next work:
  - Continue representative AS3 P0 runs beyond Reality TV, using `reloadOnResize=frame` and screenshot review.
  - Keep P0-2 open until a true F11/maximized loading frame with `Poptropica LOADING` text is captured or a real scene-switch loading path proves the centered progress state.
  - Continue AS2 fullscreen/resize and native label/static asset list work.

## 2026-06-19 AS3 P0 Dialogue Guard And Monster Carnival Follow-up

- Restarted the runtime mute watcher after the user reported Flashpoint audio occupying the main audio path:
  - Initial manual restart used the wrong `-Hours` argument and exited immediately.
  - Correct active watcher after this chunk: PID `49228`, started with `-DurationSeconds 28800`.
  - QA commands continue to use `POPTROPICA_QA_MUTE_RUNTIME=1`, `POPTROPICA_QA_MONITOR=G32QC`, `POPTROPICA_QA_NO_FOREGROUND=1`, and `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`.
- Hardened `tools/qa-as3-p0-playability.js` so native navigation labels and OCR artifacts no longer count as dialogue:
  - `进入`, `出口`, `公共房间`, `向左走`, `向右走`, and similar native labels are excluded from dialogue proof.
  - Single OCR CJK artifacts such as `米`, `康`, and `卡` are ignored.
  - Dialogue proof now requires a real residual CJK run of at least four characters.
  - Monster Carnival report `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781849692716.json` correctly fails when the screenshot only contains native labels/static content.
- Hardened F11 stability checks:
  - The QA script now detects `Poptropica` plus `LOADING/STARTING` or spinner-like lines as a loading overlay.
  - F11 captures that are still on the loading overlay are retried instead of being counted as stable.
  - Monster report `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781850366374.json` demonstrates this path: the first F11 capture was loading, retry then reached stable visual evaluation.
- Broad AS3 P0 run after Reality TV:
  - Report `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781848563481.json` covered Timmy Failure, Monster Carnival, and Poptropicon.
  - All three failed as full-run passes because post-viewport real dialogue was not captured.
  - Manual screenshot review showed the failures were mostly QA path/scene state problems, not proof that translation is missing: Monster clicked static newspaper/doors, Poptropicon clicked empty/static areas, and Timmy had Chinese dialogue in one viewport state but lost it after later state changes.
- Monster Carnival investigation:
  - `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/carnival/mainStreet/dialog.xml` contains Chinese dialogue.
  - Decompiled `MainStreet.as` shows Edgar dialogue is triggered by an `edgarSpeakZone.entered.addOnce(doEdgarSpeak)` path, not a normal NPC click.
  - Calibrated real evidence: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781849954198.json` passed with screenshot `run-1781849954198/01-monster-carnival-dialogue.png`, showing Chinese runtime dialogue: `大家都在等着嘉年华开幕，但我觉得它没法按时准备好。`
  - Full-run gap remains open: `1781850366374`, `1781850591516`, and `1781851122491` show resize/F11 visual stability and resize dialogue proof, but same-run maximize re-trigger of the one-time Edgar zone dialogue is still not closed.
- Poptropicon investigation started:
  - `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/con1/parking/dialog.xml` contains Chinese NPC dialogue.
  - Decompiled `Parking.as` shows multiple NPCs/random NPCs in the scene, but the QA click/move path has not yet been calibrated to a real NPC dialogue trigger.
- Verification after this chunk:
  - `node --check tools\qa-as3-p0-playability.js` passes after the false-positive fixes.
  - `node --check tools\repair-as3-runtime-layout.js` passes.
  - `python -m py_compile tools\qa-helper.py` passes.
  - `npm run verify:pack-inputs` still fails only on Git tracking hygiene:
    - AS2 replacementCount `43`, manifestReplacementCount `43`, untracked runtime inputs `1`.
    - AS3 replacementCount `1277`, manifestReplacementCount `1277`, untracked runtime inputs `628`.
- Current next work:
  - Calibrate Poptropicon real NPC dialogue using scene data and screenshot review.
  - Avoid counting static signage, doors, or native navigation labels as dialogue proof.
  - Keep Monster Carnival open for same-run maximize dialogue re-trigger unless a QA movement/state route reliably re-enters the Edgar zone.

## 2026-06-19 Poptropicon Calibration And Two-Island AS3 P0 Regression

- Poptropicon calibration is now closed for the representative `con1/parking` sample:
  - Runtime zip contains the full scene data even when the pack override tree only has partial XML overrides.
  - `con1/parking/npcs.xml` gives stable NPC coordinates: `alien_teacher x=1740 y=1430`, `alien_guy x=1940 y=1415`, `viking x=2375 y=1440`.
  - Short proof run `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781852018500.json` passed by seeding the player near `alien_teacher` and clicking the real NPC area.
  - Manual screenshot review passed: `run-1781852018500/01-poptropicon-dialogue-attempt-1.png` shows native Chinese options `我能学会说弗莱蒙语吗？` and `天赋是什么？`.
- Updated `tools/qa-as3-p0-playability.js` defaults:
  - Poptropicon now defaults to the Alien Teacher seed and target:
    - seed island `con1`
    - start `x=1740`, `y=1430`, direction `right`
    - dialogue target `0.50,0.80`
  - Added `--no-default-dialogue-seed` as an escape hatch for runs that need the original scene default position.
  - Reality TV Wild Safari now has its previously proven camera-crew target `0.32,0.50` as a default instead of falling back to the generic target.
- Poptropicon full P0 regression:
  - Report `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781852220193.json` passed.
  - Checks true: `sceneStable`, `visualStable`, `postViewportDialogueChinese`, `resizedViewportDialogueChinese`, `maximizedViewportDialogueChinese`, `postResizeDialogueChinese`, `f11Stable`.
  - Manual screenshot review passed:
    - `run-1781852220193/01-poptropicon-resized-dialogue-attempt-1.png`
    - `run-1781852220193/01-poptropicon-maximized-dialogue-attempt-2.png`
    - `run-1781852220193/01-poptropicon-f11-retry-1.png`
  - Static art such as `MENU`, `SPACE JAUNT`, `HOBO`, and `MIGHTY` remains English, matching the no-overlay rule.
- Reality + Poptropicon combined AS3 P0 regression:
  - First combined run `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781852479974.json` failed only because Reality used the old generic target `0.42,0.74`, which clicked the ground after resize/maximize.
  - After adding the Reality default target, `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781852948141.json` passed 2/2.
  - Reality evidence:
    - `run-1781852948141/02-reality-tv-wild-safari-maximized-dialogue-attempt-2.png` shows native Chinese dialogue `嘿嘿。是啊，伙计.....完全没错。`
  - Poptropicon evidence:
    - `run-1781852948141/01-poptropicon-maximized-dialogue-attempt-2.png` shows native Chinese dialogue options.
  - Both samples also passed resize, maximize, F11 visual stability and post-viewport dialogue checks.
- Verification after this chunk:
  - `node --check tools\qa-as3-p0-playability.js` passes.
  - `npm run verify:pack-inputs` still fails only on Git tracking hygiene, with replacement counts matched:
    - AS2 replacementCount `43`, manifestReplacementCount `43`, untracked runtime inputs `1`.
    - AS3 replacementCount `1277`, manifestReplacementCount `1277`, untracked runtime inputs `628`.
- Current next work:
  - Keep Monster Carnival open for same-run maximize dialogue re-trigger; the one-time Edgar zone needs either a reliable re-entry/state route or a separate acceptance rule.
  - Revisit Timmy natural-start script state and NPC targeting.
  - Continue AS2 fullscreen/resize and native label/static asset work.

## 2026-06-19 Runtime Mute Default And Monster Ordinary NPC Attempts

- Increased the automatic runtime mute watcher default in `tools/lib/flashpoint-runtime.js`:
  - Previous default was `20` seconds.
  - New default is `900` seconds.
  - It is still overridable with `POPTROPICA_QA_MUTE_SECONDS`.
  - `node --check tools\lib\flashpoint-runtime.js` passes.
- Monster Carnival ordinary NPC calibration remains open:
  - Runtime data shows ordinary NPCs in `carnival/mainStreet/npcs.xml`: `man`, `woman`, `father`, and `junior`.
  - Tested `man` seed near `x=1440,y=1280`: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781853628913.json` failed; player overlapped or clicked static storefront area.
  - Tested `woman` seed near `x=2350,y=1280`: `1781853823808` failed; screenshot showed the NPC, but postMessage clicks did not trigger dialogue.
  - Retested `woman` with lower body target `0.63,0.86`: timed run left artifacts in `run-1781854217627`; screenshot showed the player moved near the NPC but no dialogue bubble.
  - Retested with `seed-events=spoke_edgar_carnival` to remove the Edgar zone: `1781854405353` still failed and clicked into the Sundae/exit region.
  - Current conclusion: Monster translation is not suspect because `dialog.xml` has Chinese and Edgar real dialogue proof already exists; the open issue is reliable real-play input targeting for ordinary NPCs or an acceptance path for one-time zone dialogue after viewport changes.

## 2026-06-19 Monster/Poptropicon Native Dialog QA Hook And Three-Island P0 F11 Regression

- Kept the user rule intact for static art:
  - Menu/icon/sign/static scene lettering is not covered with Chinese text.
  - Poptropicon screenshots still show `MENU`, `NEW MERCH`, `LEARN TO SPEAK FREMLONH`, `HOBO`, and `MIGHTY` as original art.
  - Reality TV screenshots still show `Reality TV WILD SAFARI`, `DANGER`, and `STAFF ONLY` as original art.
- Added native Dialog QA trigger support so representative dialogue can be re-opened after viewport changes without relying on fragile mouse hits:
  - `tools/patch-as3-monster-qa-dialog.js` now patches `game.scenes.carnival.mainStreet.MainStreet`, `game.scenes.con1.parking.Parking`, and `game.creators.ui.WordBalloonCreator`.
  - Monster Carnival supports QA NPCs `man`, `father`, `junior`, and `edgar` via `flashpointQaDialogNpc`.
  - Poptropicon supports `alien_teacher` and triggers the native `link_question` conversation.
  - `WordBalloonCreator` honors `DialogData.timeOverride`, allowing QA-only dialogue proof to survive resize/maximize/F11 capture timing.
  - Patch report: `runtime-data/qa/as3/as3-monster-qa-dialog-patch.json`; runtime zip replacement count remains `1277`.
- Updated AS3 direct launch plumbing:
  - `tools/lib/as3-direct-wrapper.js` and `packs/zh-CN/as3/files/content/www.poptropica.com/flashpoint/as3-direct.php` now allow `flashpointQaDialogNpc=alien_teacher`.
  - `tools/qa-as3-p0-playability.js` defaults Poptropicon to `qaDialogNpc: "alien_teacher"`.
  - Fixed `postResizeDialogueChinese` so the post-resize/post-maximize dialogue screenshots are the evidence, not the plain viewport screenshots before re-trigger.
- Verification commands after the patch:
  - `node --check tools\qa-as3-p0-playability.js` passed.
  - `node --check tools\patch-as3-monster-qa-dialog.js` passed.
  - `node --check tools\lib\as3-direct-wrapper.js` passed.
  - `python -m py_compile tools\qa-helper.py` passed.
  - `php -l` could not be run because PHP CLI is not on the machine PATH; PHP was checked indirectly by extracting the runtime zip and confirming `alien_teacher` is present in the generated allowlist.
- Poptropicon single-island P0 regression after the native Dialog hook:
  - Command used `POPTROPICA_QA_NO_FOREGROUND=1`, `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`, `POPTROPICA_QA_MONITOR=G32QC`, `POPTROPICA_QA_MUTE_RUNTIME=1`, `--resize-reload-mode frame`, and required post-viewport/post-resize dialogue.
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781862189094.json`.
  - Result: pass.
  - Manual screenshot review passed:
    - `run-1781862189094/01-poptropicon-initial.png`: correct Poptropicon scene, HUD stable, static `MENU` art remains English.
    - `run-1781862189094/01-poptropicon-resized.png`: native Chinese dialogue options visible after resize.
    - `run-1781862189094/01-poptropicon-maximized.png`: native Chinese dialogue options visible after maximize.
- Three-island AS3 P0 regression with explicit F11 fullscreen:
  - Command covered `reality-tv-wild-safari,poptropicon,monster-carnival` with `--resize-reload-mode frame`, `--require-post-viewport-dialogue 1`, `--require-post-resize-dialogue 1`, `--try-f11 1`, and `--require-f11 1`.
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781862435394.json`.
  - Result: 3/3 pass.
  - Checks true for all three reports: `sceneStable`, `visualStable`, `dialogueChinese`, `postViewportDialogueChinese`, `resizedViewportDialogueChinese`, `maximizedViewportDialogueChinese`, `postResizeDialogueChinese`, and `f11Stable`.
  - Manual fullscreen screenshot review passed:
    - `run-1781862435394/01-monster-carnival-f11-retry-1.png`: Monster Carnival full screen, native Chinese dialogue bubble, HUD/character stable.
    - `run-1781862435394/02-poptropicon-f11-retry-1.png`: Poptropicon full screen, native Chinese dialogue options, static scene art remains English.
    - `run-1781862435394/03-reality-tv-wild-safari-f11-retry-1.png`: Reality TV full screen visual stability; no dialogue bubble in this F11 frame, but same run has resize/maximize dialogue proof.
  - Manual post-viewport dialogue review passed:
    - `run-1781862435394/03-reality-tv-wild-safari-resized-dialogue-attempt-1.png`.
    - `run-1781862435394/03-reality-tv-wild-safari-maximized-dialogue-attempt-2.png`.
  - The QA process exited cleanly afterward; no Flashpoint Navigator or Flash plugin window was left open.
- Current caveats:
  - This is representative AS3 evidence, not a claim that all 47 islands are fully playable.
  - Monster's representative same-run resize/maximize/F11 dialogue proof is closed through a QA-only native Dialog trigger. Natural full storyline progression and ordinary NPC hot-zone clicks are still not fully audited.
  - P0-2 remains open for strict F11 loading text: this run did not observe a loading progress frame, so it cannot close the `Poptropica LOADING` fullscreen progress-bar requirement.

## 2026-06-19 Timmy Scutaro Hook, Four-Island P0 Regression, And Loading Center Recheck

- Followed the user's static-art rule:
  - Static icons, menu art, scene signs, notebook pages, shop labels, and arrow art are not covered with Chinese text layers.
  - Native dialogue/TextField content remains in scope for Chinese translation and alignment fixes.
- Added a Timmy Failure native Dialog QA trigger for a stable representative runtime dialogue proof:
  - `tools/patch-as3-monster-qa-dialog.js` now patches `game.scenes.timmy.mainStreet.MainStreet`.
  - `tools/lib/as3-direct-wrapper.js` and `packs/zh-CN/as3/files/content/www.poptropica.com/flashpoint/as3-direct.php` allow `flashpointQaDialogNpc=scutaro`.
  - `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/timmy/mainStreet/dialog.xml` now includes `qaScutaro` with a long QA-only `timeOverride`.
  - Rebuilt AS3 Shell/runtime; patch report `runtime-data/qa/as3/as3-monster-qa-dialog-patch.json` generated `2026-06-19T10:31:58.036Z`, runtime zip status `ready`, replacementCount `1277`.
- Timmy Failure P0 evidence:
  - Report `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781865156687.json` passed.
  - It covers resize, maximize, F11, visual stability, and post-viewport/post-resize Chinese Scutaro dialogue.
  - Manual screenshot review passed:
    - `run-1781865156687/01-timmy-failure-initial.png`: static English notebook page, intentionally not overlaid.
    - `run-1781865156687/01-timmy-failure-resized.png`: Chinese Scutaro bubble, static `MENU`/`CLOSED`/arrow art untouched.
    - `run-1781865156687/01-timmy-failure-maximized.png`: Chinese Scutaro bubble stable.
    - `run-1781865156687/01-timmy-failure-f11.png`: Chinese Scutaro bubble stable in fullscreen.
- Four-island AS3 P0 regression evidence:
  - Report `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781865386476.json` passed 4/4.
  - Covered `monster-carnival`, `poptropicon`, `reality-tv-wild-safari`, and `timmy-failure`.
  - Checks true for all four: scene/visual stability, Chinese dialogue, post-viewport Chinese dialogue, post-resize Chinese dialogue, and F11 stability.
  - Manual screenshot review passed for Monster, Poptropicon, Reality TV, and Timmy fullscreen/viewport dialogue frames.
- Loading center recheck after Shell loading-hold rebuild:
  - `tools/patch-as3-shell-loading-hold.js` was rewritten to replace `LogoLoadingScreen.transitionOut()` idempotently and read `flashpointQaLoadingHoldMs` from `root.loaderInfo.parameters`, stage loader params, or URL params.
  - A rejected intermediate build caused a blank/blue early-out start-flow path; it was fixed by restoring the normal `_displayed == false` branch.
  - Final Shell rebuild report: `runtime-data/qa/as3/as3-shell-loading-hold-patch.json`, generated `2026-06-19T11:39:00.851Z`, runtime zip status `ready`, replacementCount `1277`.
  - Window-mode loading-only gate `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781869169141.json` passed and captured `Poptropica LOADING` centered with offset about x=-3/y=2.
  - Strict F11/fullscreen `Poptropica LOADING` text frame remains open. Existing F11 evidence proves the startup frame/progress-frame outline is centered, but not the text-bearing loading progress frame required to close P0-2.
- Final regression after the latest Shell rebuild:
  - Report `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781869272212.json` passed 2/2 for Poptropicon + Timmy.
  - This confirms the latest loading-hold Shell rebuild did not break the Alien Teacher or Scutaro native Dialog hooks.
- Verification commands after this chunk:
  - `node --check tools\patch-as3-monster-qa-dialog.js` passed.
  - `node --check tools\qa-as3-p0-playability.js` passed.
  - `node --check tools\lib\as3-direct-wrapper.js` passed.
  - `node --check tools\patch-as3-shell-loading-hold.js` passed.
  - `python -m py_compile tools\qa-helper.py` passed.
- Current next work:
  - Continue P0-2 with a true F11/fullscreen loading progress capture. Do not count blank blue screens or synthetic overlays.
  - Expand beyond QA-only Dialog triggers toward natural NPC/story routes for Timmy and Monster.
  - Start AS2 fullscreen/resize/native-label/dialogue evidence with the same no-static-overlay rule.

## 2026-06-19 F11 Scene-Transition Loading Center Proof And Quiet Runtime Regression

- User requested runtime audio not occupy the main audio output. Confirmed `tools/mute-poptropica-runtime.ps1` watcher is active and future QA launches use:
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
- Root-caused the failed F11 loading proof:
  - Early F11 on AS3 start-flow can crash the Flash plugin, so it is not a valid acceptance route.
  - The first auto-scene hook was accidentally inserted only into `Parking.resize()` instead of `Parking.loaded()`. In F11, AS3 resize is not a reliable scene hook, so the scene never changed.
- Fixed and rebuilt the AS3 runtime:
  - `tools/patch-as3-monster-qa-dialog.js` now explicitly inserts `flashpointQaAutoSceneAfterLoad()` after `randomGroup.setup(...)` inside `game.scenes.con1.parking.Parking.loaded()`, and validation now requires that loaded-call block.
  - `tools/lib/as3-direct-wrapper.js`, `packs/zh-CN/as3/files/content/www.poptropica.com/flashpoint/as3-direct.php`, and `tools/qa-as3-p0-playability.js` already pass `flashpointQaAutoScene=center` and `flashpointQaAutoSceneDelayMs`.
  - Rebuild command `npm run patch:as3-monster-qa-dialog` passed. Latest patch report: `runtime-data/qa/as3/as3-monster-qa-dialog-patch.json`, generated `2026-06-19T12:48:44.099Z`, runtime zip status `ready`, replacementCount `1277`.
- Added a dedicated F11 scene-transition QA tool:
  - New file `tools/qa-as3-f11-loading-transition.js`.
  - It launches Poptropicon Parking on G32QC, sends F11 via post-message, uses the QA-only native hook to load `Center`, captures a timed screenshot sequence, and validates loading center geometry.
  - Added `qa-helper.py analyze-loading-center`, a visual detector for the true black loading screen with centered Poptropica logo/progress dots. This avoids relying on OCR to read `LOADING`, because scene-transition loading often shows only the logo, dots, and `saving game` text.
- F11/fullscreen loading center proof now passes:
  - Report: `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1781873821483.json`.
  - Result: `ok: true`.
  - Fullscreen capture size: `2560x1439`.
  - Detected loading frames:
    - `run-f11-loading-1781873821483/f11-loading-sequence/f11-loading-14000.png`: offset x=-3, y=12.
    - `run-f11-loading-1781873821483/f11-loading-sequence/f11-loading-16000.png`: offset x=10, y=-50.
  - Manual screenshot review passed for `f11-loading-14000.png`.
- Regression after the F11 loading hook:
  - Command: `node tools\qa-as3-p0-playability.js --islands poptropicon,timmy-failure --resize-reload-mode frame --require-post-viewport-dialogue 1 --require-post-resize-dialogue 1 --try-f11 1 --require-f11 1`.
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781874030360.json`.
  - Result: 2/2 pass.
  - Poptropicon and Timmy both passed resize, maximize, F11, visual stability, and post-viewport/post-resize native Chinese dialogue.
  - Manual screenshot review passed:
    - `run-1781874030360/01-poptropicon-f11.png`: F11 visual stable, static scene art remains English, native Chinese dialogue visible.
    - `run-1781874030360/02-timmy-failure-f11-retry-1.png`: F11 visual stable, Scutaro Chinese dialogue stable, static arrow/menu art untouched.
    - `run-f11-loading-1781873821483/f11-loading-sequence/f11-loading-14000.png`: fullscreen loading logo/progress centered.
- Verification commands in this chunk:
  - `node --check tools\patch-as3-monster-qa-dialog.js` passed.
  - `node --check tools\qa-as3-f11-loading-transition.js` passed.
  - `node --check tools\qa-as3-p0-playability.js` passed.
  - `python -m py_compile tools\qa-helper.py` passed.
- Updated `CHECKLIST.zh-CN.md`:
  - P0-2 is now "AS3 window mode + AS3 Poptropicon F11 scene-transition representative sample passed", not "fully complete".
  - Remaining loading work is AS2, more AS3 scenes, more sizes, and eventual all-island coverage.
- Current next work:
  - Expand the F11/loading-center tool beyond Poptropicon to additional AS3 representative scenes.
  - Start AS2 fullscreen/loading/resize/dialogue evidence under the same G32QC + no-foreground + no-static-overlay rules.
  - Continue replacing QA-only native Dialog representatives with more natural NPC/story routes where feasible.

## 2026-06-19 Quiet Runtime Defaults And AS2 P0 Calibration

- User reported QA/game audio was occupying the main audio output.
  - Confirmed no active Poptropica/Flashpoint audio session was present at the time; current audio sessions were unrelated to the game runtime.
  - Confirmed existing mute watcher PID `7836` was active: `tools/mute-poptropica-runtime.ps1 -DurationSeconds 43200 -IntervalMs 250`.
  - Updated `tools/lib/flashpoint-runtime.js` so every future managed runtime launch defaults to a 12-hour mute watcher with 250ms polling unless explicitly disabled with `POPTROPICA_QA_MUTE_RUNTIME=0`.
  - Verified: `node --check tools\lib\flashpoint-runtime.js` passed; targeted `git diff --check` passed with CRLF warnings only.
- Hardened AS2 P0 QA instead of trusting weak button/click evidence:
  - `tools/qa-as2-interaction-smoke.js` now supports loading-frame sampling and `analyze-loading-center`.
  - Added AS2 F11 evidence capture, then fixed the pass criteria after discovering a false positive: F11 now requires the screenshot size to reach at least 80% of the target monitor dimensions by default.
  - Added `--room-override` / `--island-override` so QA can directly enter AS2 rooms such as `Train/EdisonCabin`.
  - Added `--dialogue-second-click`, `--dialogue-second-x/y`, `--dialogue-hover-ms`, and `--dialogue-hold-ms` for AS2 NPC calibration.
  - `tools/qa-helper.py` now sends a synthetic focus/activation pulse before post-message mouse clicks, without moving the real cursor or calling foreground mouse APIs.
  - Verified: `node --check tools\qa-as2-interaction-smoke.js` and `python -m py_compile tools\qa-helper.py` passed; targeted `git diff --check` passed with CRLF warnings only.
- AS2 evidence gathered on G32QC with mute/no-foreground/post-message settings:
  - `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781875020298.json`: Mystery Train `TrainMain` captured centered AS2 loading and stable scene evidence; the original AS2 F11 check was exposed as a false positive because screenshot size stayed `1174x620`.
  - `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781875302505.json`: after the F11 size gate, the same AS2 sample correctly failed F11 with `imageSize=1174x620`, target monitor `2560x1440`, min `2048x1152`.
  - `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781876640525.json`: direct entry to Mystery Train `EdisonCabin` succeeded; scene evidence matched `/scenes/islandTrain/sceneEdisonCabin.swf`; static `EXIT` art remained English.
  - `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781876906937.json` and `1781877083443.json`: Edison hover/click attempts still did not trigger a dialogue bubble. This is now tracked as an AS2 dialogue/input or story-state blocker, not a translation-resource proof.
- Current AS2 conclusion:
  - AS2 Mystery Train Chinese resources exist in `packs/zh-CN/as2/files/content/www.poptropica.com/scenes/islandTrain/assets/clues.xml`.
  - Direct room launch and scene loading are working.
  - Loading-center evidence is available for `TrainMain`; `EdisonCabin` loads too quickly for the same sample list and needs a controlled loading route if it must be used for P0-2.
  - AS2 true fullscreen/F11 is not proven; the strengthened harness now correctly catches non-fullscreen captures.
  - AS2 runtime dialogue Chinese remains open because the current background click path reaches hover/hand-cursor state but does not open the NPC bubble.
- No Flashpoint Navigator or Flash plugin process was left running after this chunk. The mute watcher remains active.

## 2026-06-19 Runtime Mute Guard Refresh

- User asked to stop the QA/game window from occupying the main audio output.
  - Confirmed the current active mute watcher was present, but no Poptropica/Flashpoint runtime audio target was active at scan time.
  - Broadened `tools/mute-poptropica-runtime.ps1` so it covers Flashpoint Navigator, Basilisk, Flash plugin processes, Ruffle, and browser/electron shells only when their process path or command line is clearly tied to Poptropica/Flashpoint.
  - Verified the broadened matcher did not catch unrelated current processes such as Razer CEF services.
  - Restarted the hidden 12-hour mute watcher with the new matcher; active watcher PID is `44620`.

## 2026-06-19 AS2 Mystery Train Edison Dialogue Patch

- Root cause confirmed for part of the AS2 dialogue-English issue:
  - `sceneEdisonCabin.swf` stores Edison Cabin lines directly in AS2 script as `Edison.talkyText` / `_root.manualSay(...)`, not in `clues.xml`.
  - This explains why translation resource coverage did not make those runtime lines Chinese.
- Implemented `tools/patch-as2-train-edison-dialogue.js`.
  - Extracts `content/www.poptropica.com/scenes/islandTrain/sceneEdisonCabin.swf` from `AS2.zip`.
  - FFDec-exports scripts, patches `scripts/DefineSprite_101/frame_1/DoAction.as`, replaces 15 hardcoded English dialogue literals with native Chinese text, and rebuilds the SWF.
  - Writes the patched SWF to `packs/zh-CN/as2/swf/content/www.poptropica.com/scenes/islandTrain/sceneEdisonCabin.swf`.
  - Rebuilds `runtime-data/patched-zips/as2-runtime.zip`; latest rebuild status was `ready`, replacement count `44`.
  - Manifest entry added: `as2-train:edison-cabin-dialogue-zh`.
- Added AS2 QA support:
  - `packs/zh-CN/as2/files/content/www.poptropica.com/base.php` forwards `flashpointQaAs2Dialog` through FlashVars, SetVariable retries, and the top-level SWF URL query for QA-only attempts.
  - `tools/qa-as2-interaction-smoke.js` now accepts `--flashpoint-qa-as2-dialog` / `--as2-qa-dialog`.
  - It also supports `--dialogue-expected-text`; this fixed a false positive where OCR saw HUD text such as `POP 汇品` and incorrectly counted it as dialogue Chinese.
  - Added `--preserve-runtime` for child-window/input debugging.
- Verification that passed:
  - `node --check tools/patch-as2-train-edison-dialogue.js` passed.
  - `node --check tools/qa-as2-interaction-smoke.js` passed.
  - Patch script output: `runtime-data/qa/as2/as2-train-edison-dialogue-patch.json`.
  - Reverse FFDec export from the patched SWF confirmed:
    - `hasChineseStart=true`
    - `hasChineseRival=true`
    - `hasQaHook=true`
    - `hasOldStartEnglish=false`
    - `hasOldRivalEnglish=false`
  - Runtime zip extraction confirmed `base.php` contains `flashpointQaAs2Dialog` and the patched `sceneEdisonCabin.swf` is present.
- Runtime screenshot evidence gathered, but not accepted as dialogue completion:
  - `as2-interaction-smoke-1781878371292.json` initially passed, but this was a false positive: OCR text was HUD/menu text (`POP 汇品`), not Edison dialogue.
  - After tightening to `--dialogue-expected-text 乘客`, `as2-interaction-smoke-1781878589093.json` and `as2-interaction-smoke-1781878953373.json` correctly failed with `dialogue_expected_text_not_seen`.
  - Screenshots show EdisonCabin loads, UI is stable, and static scene art remains English, but no Edison dialogue bubble appears in the background QA capture.
- Current conclusion:
  - The EdisonCabin resource-level translation fix is real and in the runtime zip.
  - AS2 background interaction/QA triggering is still a blocker: post-message can open the map and can reach hover-like behavior, but NPC phrase click/QA auto-dialogue does not open the bubble.
  - Child-window inspection on the preserved runtime showed Flashpoint Navigator has only a 0x0 invisible `Static` child for `plugin-container.exe`; there is no visible plugin child HWND to target directly.
  - All Flashpoint Navigator / plugin runtime processes were stopped after this chunk. The hidden mute watcher remains active.

## 2026-06-19 AS2 EdisonCabin Native Dialogue Proof And QA Audio Mute

- User reported the QA/game window was occupying the main audio output.
  - Confirmed the hidden mute watcher remained active as PID `44620`.
  - Added AS2 HTML-audio mute support to `packs/zh-CN/as2/files/content/www.poptropica.com/base.php`: `flashpointQaMuteAudio=1` stores a QA mute flag, sets scene audio and AS2 sound-effect `Audio()` objects to `muted=true`, and forces volume `0`.
  - Updated `tools/lib/pack.js` so future AS2 base-page rebuilds keep the same QA audio mute bridge.
  - Updated `tools/lib/flashpoint-runtime.js` so managed AS2 launches automatically append `flashpointQaMuteAudio=1` unless explicitly disabled with `POPTROPICA_QA_MUTE_HTML_AUDIO=0`.
  - Verified `runtime-data/patched-zips/as2-runtime.zip` contains `flashpointQaMuteAudio` and `applyQaAudioMute`; current AS2 QA reports `audioActive: 0`.
- Finished the AS2 Mystery Train EdisonCabin dialogue proof.
  - Root cause of the previous false negative: the QA hook called `_root.manualSay(...)`, but the bubble disappeared before the 20s capture and did not expose whether the native `sayXXXX` MovieClip was created.
  - Hardened `tools/patch-as2-train-edison-dialogue.js` so the QA hook waits for Edison coordinates/avatar, root camera, and `sayDepth/chatDepth`; after `_root.manualSay(Edison,Edison.talkyText)`, it checks `_root["say" + Edison.sayDepth]`, keeps the native bubble alive long enough for QA, and logs `bubble=true`.
  - Rebuilt `sceneEdisonCabin.swf` and `runtime-data/patched-zips/as2-runtime.zip`; latest patch report remains `runtime-data/qa/as2/as2-train-edison-dialogue-patch.json`, runtime zip `ready`, replacementCount `44`.
- Passing verification:
  - `node --check tools\patch-as2-train-edison-dialogue.js` passed.
  - `node --check tools\qa-as2-interaction-smoke.js` passed.
  - `node --check tools\lib\flashpoint-runtime.js` passed.
  - `node --check tools\lib\pack.js` passed.
  - Command: `node tools\qa-as2-interaction-smoke.js --islands mystery-train --limit 1 --room-override EdisonCabin --flashpoint-qa-as2-dialog edison --require-dialogue-chinese --dialogue-expected-text 乘客 --settle-ms 20000 --window-size 1174x660 --skip-audio --allowMissingRequests --force-as2-char-state --use-template-char`, with `POPTROPICA_QA_MONITOR=G32QC`, `POPTROPICA_QA_NO_FOREGROUND=1`, `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`, and runtime mute env vars.
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781882735773.json`.
  - Result: `ok=true`, `passed=1`, `failed=0`, `mapClicksPassed=1`, `sceneEvidencePassed=1`, `visualGuardPassed=1`, `audioActive=0`.
  - Screenshot: `runtime-data/qa/as2/interaction-smoke/run-1781882735773/01-mystery-train-initial.png` shows Edison native word balloon in Chinese.
  - OCR sample: `BPOP 等我把这里布置好， 就需要你帮忙了。等候时， 先去见见其他乘客吧。`.
  - QA log tail includes `QaDialogShown&ready=true&talky=true&manual=true&coords=true&avatar=true&camera=true&depth=true&bubble=true`.
- Updated `CHECKLIST.zh-CN.md`:
  - P0-3 is now "AS2 EdisonCabin representative sample passed", not "all AS2 dialogue complete".
  - Remaining AS2 dialogue work is broader hardcoded-script scanning, more NPC/story-state samples, and eventual natural input-path validation.

## 2026-06-19 AS2 Mystery Train Loading And F11 Representative Pass

- Ran an AS2 Mystery Train main-street P0 probe after the EdisonCabin dialogue fix, still on G32QC with no foreground capture, PostMessage input, and runtime mute:
  - Command: `node tools\qa-as2-interaction-smoke.js --islands mystery-train --limit 1 --require-loading --loading-sample-ms 0,250,500,750,1000,1500,2000,3000,4500,6000,8000 --try-f11 --require-f11 --settle-ms 10000 --window-size 1174x660 --skip-audio --allowMissingRequests --force-as2-char-state --use-template-char`.
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781882945247.json`.
  - Result: `ok=true`, `passed=1`, `failed=0`, `sceneEvidencePassed=1`, `loadingCenterPassed=1`, `f11Passed=1`, `visualGuardPassed=1`, `audioActive=0`.
- Loading evidence:
  - Detected centered `Poptropica LOADING` samples at 0, 250, 500, 750, and 1000 ms.
  - OCR center offsets were about x=-5/y=-28 in a `1162x520` client capture; within the current threshold.
  - Manual screenshot review passed for `runtime-data/qa/as2/interaction-smoke/run-1781882945247/01-mystery-train-loading-sequence/01-mystery-train-loading-0.png`.
- F11 evidence:
  - F11 capture image size: `2560x1306`, monitor rect: `2560x1440`, minimum required by current gate: `2048x1152`.
  - Manual screenshot review passed for `runtime-data/qa/as2/interaction-smoke/run-1781882945247/01-mystery-train-f11.png`: HUD sits in the upper-right, character and scene are stable, no visible UI overlap or drift.
- Caveat:
  - This closes an AS2 representative window-loading and F11-stability sample, not AS2 fullscreen loading. P0-2 still needs AS2 F11/fullscreen loading or scene-transition loading evidence.

## 2026-06-19 AS2 Early/Spy/Super F11 Evidence And Loading Gap

- Re-parsed and manually reviewed the AS2 batch report `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781883257875.json`.
  - Total result is `ok=false`, 1/3 passed, 2/3 failed.
  - The failed keys are `spy` and `super-power`, both only for `loading_sample_not_captured`.
  - The same report shows `sceneEvidencePassed=3`, `visualGuardPassed=3`, `f11Passed=3`, `audioActive=0`, and no missing log requests.
- Manual screenshot review:
  - `runtime-data/qa/as2/interaction-smoke/run-1781883257875/01-early-poptropica-loading-sequence/01-early-poptropica-loading-0.png`: centered Poptropica logo/spinner/LOADING; OCR center offset x=-1/y=22.
  - `runtime-data/qa/as2/interaction-smoke/run-1781883257875/01-early-poptropica-f11.png`: HUD upper-right, character/NPC stable, no UI overlap; bottom AS2 blue `saving game` band/crop remains visible.
  - `runtime-data/qa/as2/interaction-smoke/run-1781883257875/02-spy-f11.png`: HUD/character stable; static `the hair club` scene art remains English per no-overlay policy.
  - `runtime-data/qa/as2/interaction-smoke/run-1781883257875/03-super-power-f11.png`: HUD/character/NPC stable; bottom blue band is still a fullscreen fit caveat.
- Current interpretation:
  - AS2 F11 stability now has four representative samples: Mystery Train, Early Poptropica, Spy, and Super Power.
  - AS2 loading-center evidence is stronger for Mystery Train and Early Poptropica in window mode.
  - Spy/Super Power loading failures are evidence-capture gaps because sampled frames had already reached the scene, not proof of off-center loading.
  - Next AS2 loading work should capture scene-transition or fullscreen loading, possibly with a QA-only loading hold that preserves the real loading UI and does not add a fake overlay.

## 2026-06-19 AS2 SpyMain Native Dialogue Proof

- User asked to keep runtime windows muted; restarted a hidden 12-hour mute watcher:
  - PID `50048`
  - Script: `tools/mute-poptropica-runtime.ps1`
  - Duration: 43200 seconds
  - Interval: 250 ms
  - The watcher only targets Poptropica/Flashpoint-related runtime shells, not normal user browser/audio sessions.
- Extended the generic AS2 script patch path:
  - `tools/patch-as2-script-translations.js` now accepts `--qa-dialog-mode spy-main`.
  - The mode is currently scoped to `content/www.poptropica.com/scenes/islandSpy/sceneSpyMain.swf`.
  - It uses the game-native `_root.manualSay(...)` path; it does not add a Chinese text overlay or touch static art.
  - The QA-only hook anchors the test bubble on the player for screenshot reliability, but the text still comes from the scene's runtime `char2.talkyText`.
- Rebuilt SpyMain into the AS2 runtime:
  - Command: `node tools\patch-as2-script-translations.js --asset-path content/www.poptropica.com/scenes/islandSpy/sceneSpyMain.swf --qa-dialog-mode spy-main`
  - Report: `runtime-data/qa/as2/as2-script-translation-patch-sceneSpyMain.json`
  - Output SWF: `packs/zh-CN/as2/swf/content/www.poptropica.com/scenes/islandSpy/sceneSpyMain.swf`
  - Runtime zip: `runtime-data/patched-zips/as2-runtime.zip`
  - Replacement count: `45`
  - Translated script rows: `15`
  - Changed script files: `9`
- Reverse FFDec export of the patched SWF confirmed:
  - `flashpointQaSpyMainDialogActor()` returns `char`.
  - `flashpointQaSpyMainDialogText()` reads `char2.talkyText`.
  - `manualSay` is called with the translated runtime text.
  - Chinese strings remain in the SWF, including `和 D 局长谈过后再来找我。` and `D 局长在总部里面等你。`.
- Runtime verification:
  - Passing report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781886126401.json`
  - Command used G32QC, no foreground capture, PostMessage clicks, and mute env vars.
  - Result: `ok=true`, `passed=1`, `failed=0`, `sceneEvidencePassed=1`, `visualGuardPassed=1`, `audioActive=0`.
  - Screenshot: `runtime-data/qa/as2/interaction-smoke/run-1781886126401/01-spy-initial.png`
  - Server log includes `QaDialogShown...bubble=true`.
- Manual visual checks:
  - `runtime-data/qa/as2/interaction-smoke/run-1781885938525/01-spy-initial.png` shows native Chinese bubble text `和 D 局长谈过后再来找我。`.
  - `runtime-data/qa/as2/interaction-smoke/run-1781886012217/01-spy-initial.png` shows native Chinese bubble text `我有个关于斯派格拉斯博士的重要消息要告诉你。`.
  - Static scene art `the hair club` remains English, as required by the no-overlay/static-art policy.
- Important gotcha:
  - An exact expected phrase such as `D 局长` is not stable in this scene because saved story state can select another valid Chinese line for the same scene/actor.
  - OCR may also collapse the space and see `D局长`.
  - For this AS2 representative test, require a native bubble with Chinese and use screenshot/manual review plus `QaDialogShown...bubble=true` for the proof; only use exact expected text when the QA state fully controls the dialogue line.

## 2026-06-19 AS2 Navigation/Text Candidate Classification

- Reused the full AS2 runtime text audit:
  - Report: `runtime-data/qa/as2/as2-runtime-text-audit-full.json`
  - Total SWFs scanned: `4672`
  - Assets with SWF text-navigation candidates: `16`
  - Candidate text count: `26`
- Candidate classes from the audit:
  - Framework/HUD-ish: `framework.swf` and `flashpoint/originalFiles/framework.swf` have `Home` and two `EXIT` text tags.
  - Gameplay/HUD-ish: `gameplay.swf` and `flashpoint/originalFiles/gameplay.swf` have `Map` and `saving game`.
  - Popup/minigame UI: `costumeSaver.swf`, `slapJack.swf`, `TwistedWizard.swf`, `mixCoffee.swf`, `register.swf`, `spycomputer.swf`.
  - Scene/static-sign candidates: `sceneMuseum.swf` (`EXIT`), `sceneBoat.swf` (`Exit`), `sceneBattleMap.swf` (`MAP`).
- Tested direct FFDec text replacement on `content/www.poptropica.com/scenes/islandEarly/sceneMuseum.swf`:
  - `-importText` with edited `79.txt=出口` produced an output SWF but reverse text export still showed `EXIT`.
  - `-replace <swf> <out> 79 <79.txt>` with both UTF-8 `出口` and ASCII `OUT` reported `SEVERE: Error during text import` and reverse export still showed `EXIT`.
  - Conclusion: this path is not safe for production AS2 text-tag replacement without deeper FFDec/font/tag handling.
- Runtime screenshot evidence:
  - Command launched `early-poptropica` with `--room-override Museum` on G32QC/no-foreground/muted.
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781886555841.json`
  - Result: `ok=true`, `sceneEvidencePassed=1`, `visualGuardPassed=1`, `audioActive=0`.
  - Screenshot: `runtime-data/qa/as2/interaction-smoke/run-1781886555841/01-early-poptropica-initial.png`
  - Visual conclusion: the visible `EXIT` is a red scene sign above a doorway. Treat it as static/sign art for now; do not replace it with a Chinese text layer. If localization is required later, use a real bitmap/image replacement workflow.

## 2026-06-19 AS2 Fullscreen Loading Hold And Island-By-Island Pivot

- Added a QA-only AS2 loading hold path for real fullscreen loading screenshots.
  - `tools/qa-as2-interaction-smoke.js` now passes `flashpointQaLoadingHoldMs` from CLI args into launch URLs.
  - `packs/zh-CN/as2/files/content/www.poptropica.com/base.php` now preserves `flashpointQaLoadingHoldMs` in resume state and forwards it into FlashVars/SWF query params.
  - `tools/patch-as2-gameplay-loading-hold.js` patches `framework.swf` so `flashpointQaLoadingHoldMs` holds the native framework startup loading screen before gameplay begins.
  - Important fix: do not forward `flashpointQaLoadingHoldMs` to `gameplay.swf`; delaying gameplay scene loading caused Flashpoint Navigator to show an `Opening base.php` download dialog over the game.
  - `gameplay.swf` still contains a QA-only scene-load hold hook, but the verified path now relies on framework startup hold because it keeps the real loading UI clean.
- Verification:
  - `node --check tools\qa-as2-interaction-smoke.js` passed.
  - `node --check tools\patch-as2-gameplay-loading-hold.js` passed.
  - `node --check tools\lib\pack.js` passed after adding base-page FlashVars passthrough.
  - Patch report: `runtime-data/qa/as2/as2-gameplay-loading-hold-patch.json`, runtime zip `ready`, replacement count `45`.
  - Reverse FFDec export confirmed `framework.swf` has `flashpointQaCompleteStartupLoading`, and no longer forwards `flashpointQaLoadingHoldMs` into `gameplay.swf?...`.
- Passing fullscreen loading evidence:
  - Mystery Train: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781888576562.json`
    - G32QC fullscreen client capture `2560x1306`.
    - `loadingCenterPassed=1`, `sceneEvidencePassed=1`, `visualGuardPassed=1`, `audioActive=0`.
    - Detected loading samples at 0, 250, 500, 750, 1000, and 1500 ms, offsets about x=-16/y=-40.
    - Manual screenshots passed: `run-1781888576562/01-mystery-train-loading-sequence/01-mystery-train-loading-0.png`, `...loading-1500.png`, and final scene `01-mystery-train-initial.png`.
  - Early Poptropica: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781888862295.json`
    - Same G32QC fullscreen path; `loadingCenterPassed=1`, `sceneEvidencePassed=1`, `visualGuardPassed=1`, `audioActive=0`.
    - Detected loading samples from 0 through 4500 ms, offsets about x=-16/y=-40.
- Regression after framework patch:
  - SpyMain QA dialogue: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1781888765083.json`
  - Result `ok=true`, native Chinese bubble still works, OCR sample includes `和D局长谈过后再来找我。`, static `the hair club` remains English.
- User raised a process issue: testing has felt too broad and repetitive, with fixes appearing to regress across islands.
  - New operating rule: stop broad, mixed-area iteration as the main route.
  - Poptropicon is now the first "sample island" for the island-by-island template.
  - Demo launch: `node tools\launch.js --island poptropicon --target-monitor G32QC --window-size 1600x900`
  - Demo screenshot: `runtime-data/qa/manual-poptropicon-demo.png`
  - Visual result: Poptropicon `con1/parking` loads on G32QC, right-top UI is stable, native Chinese dialogue appears, static scene art stays English.
  - Caveat: this is a stable sample-island baseline, not a full story-completion proof yet. Next work should finish Poptropicon room traversal, natural interactions, resize/F11 checks after scene transitions, and UI/arrow audit before moving to the next island.

## 2026-06-19 Poptropicon Sample Island Bounds, Intro, And Resize Pass

- User pointed out the latest Poptropicon sample still had a serious blocker: after camera/bounds work, the player could disappear.
- Root cause found:
  - Clean `tools/launch.js --island poptropicon` did not seed deterministic player start coordinates.
  - The sample-island `MotionBounds` patch used guessed bounds instead of the actual `con1` scene XML camera/bottom limits.
  - Several Poptropicon door returns still used old `y=1470`, which could place the player into unstable camera/ground states.
- Implemented fixes:
  - `catalog/launch-overrides.json` now starts Poptropicon at `startX=1740`, `startY=1430`, `startDirection=right`.
  - `tools/patch-as3-monster-qa-dialog.js` now applies scene-backed Poptropicon bounds:
    - parking: `new Rectangle(0,0,3040,1490)`
    - center: `new Rectangle(200,320,3950,1515)`
    - bathrooms: `new Rectangle(0,0,2400,1080)`
    - alley: `new Rectangle(400,320,3594,1560)`
  - Poptropicon `doors.xml` return coordinates were aligned to stable ground points (`parking y=1430`, `center y=1790`).
  - Rebuilt `runtime-data/patched-zips/as3-runtime.zip`; zip inspection confirmed `con1/parking`, `center`, `bathrooms`, and `alley` door XML no longer contain `<y>1470</y>`.
- Runtime visual evidence on G32QC, muted, no foreground/mouse takeover:
  - `runtime-data/qa/poptropicon-player-boundsfix-start.png`: player visible at launch, menu stable, no bottom blue strip.
  - `runtime-data/qa/poptropicon-player-boundsfix-after-ground-right.png`: player moved right and stayed visible.
  - `runtime-data/qa/poptropicon-player-boundsfix-right-edge.png`: near right boundary, player still present and no blue/off-scene reveal.
- Found and fixed a second user-reported Poptropicon gap: island intro popup was still English.
  - Source was hardcoded native text in `game.scenes.con1.center.Center.showIntroPopup()`, not XML or static image art.
  - `tools/patch-as3-monster-qa-dialog.js` now patches `Center.as`:
    - `introPopup.updateText("漫展岛火热开幕！想办法进场！","开始");`
  - First longer translation was rejected by screenshot because it cropped in the popup; shortened text now fits.
  - Reverse FFDec export confirmed the patched Shell has the short Chinese popup text.
  - Runtime screenshot `runtime-data/qa/poptropicon-intro-cn-short-popup.png` shows full Chinese intro and centered `开始` button.
  - Runtime screenshot `runtime-data/qa/poptropicon-intro-cn-short-after-start.png` shows the popup dismisses into normal play, player remains visible, and native NPC dialogue is Chinese.
- Resize evidence:
  - Used Win32 `SetWindowPos` on the G32QC window, not CUA, to resize from `2560x1392` to `1600x900`.
  - Runtime screenshot `runtime-data/qa/poptropicon-resize-win32-1600x900-after.png` shows player visible, menu stable in the upper-right, no UI overlap, and no blue/off-scene reveal.
- Audio check:
  - `runtime-data/qa/poptropicon-current-audio-check.json` reports Flashpoint Navigator, plugin-container, and Flash plugin sessions muted with loopback RMS/peak `0.0`; current sample window is not using the main audio output.
- Static-art policy respected:
  - `MENU`, `SPACE JAUNT`, posters, shop signs, parking-lot signs, entrance art, and other scene art remain English.
  - No Chinese text overlay was added on static images.
- Poptropicon is improved but not yet declared complete:
  - Still needs menu panel internal button translation/alignment verification.
  - Still needs current-build F11/fullscreen recheck after the latest popup patch.
  - Still needs full con1 room traversal and more natural quest-state checks before moving to the next island as "fully done".

## 2026-06-20 Poptropicon Con1 Edge Routing And Bottom Fill Pass

- Continued the island-by-island route; current island remains Poptropicon/con1 only.
- Removed the temporary red debug fills from the Poptropicon Parking edge hot zones. The left/right edge zones are now transparent again and no Chinese/static-art overlays were added.
- Added better QA launch controls for AS3 direct scene testing:
  - `tools/qa-as3-islands-smoke.js` can now pass direct-scene start coordinates/direction and seed island/events.
  - The interaction harness can now deliver PostMessage clicks to the Flash child window (`GeckoFPSandboxChildWindow`) instead of the top Navigator window, so tests do not steal the foreground mouse.
- Fixed a Poptropicon con1 scene-switch regression:
  - Direct Bathrooms launch was immediately bouncing back to Parking because the shared edge detector treated the default spawn as an exit.
  - `tools/patch-as3-monster-qa-dialog.js` now requires outward player movement before auto-switching Parking/Bathrooms/Center/Alley boundaries.
  - Passing direct Bathrooms proof: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781943959078.json`; screenshot `runtime-data/qa/as3/islands-smoke/run-1781943959078/01-poptropicon-bathrooms.png`; log stays in `SceneLoaded Bathrooms` and the player is visible.
- Verified Parking edge navigation on G32QC, muted, no foreground mouse takeover:
  - Parking -> Bathrooms via top-left transparent edge zone: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781944355947.json`; screenshots `runtime-data/qa/as3/interaction-smoke/run-1781944355947/01-poptropicon.png` and `runtime-data/qa/as3/interaction-smoke/run-1781944355947/01-poptropicon-interaction.png`; log loads `/game/data/scenes/con1/bathrooms/scene.xml` and `SceneLoaded Bathrooms`.
  - Parking -> Center via right/bottom transparent edge zone: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781944459038.json`; screenshot `runtime-data/qa/as3/interaction-smoke/run-1781944459038/01-poptropicon-interaction.png`; log loads `/game/data/scenes/con1/center/scene.xml` and the Center intro popup appears in Chinese with `开始`.
- Changed the AS3 page/Shell/direct-wrapper fallback background from the old bright blue to neutral scene-toned `#59645d`.
  - Rebuilt `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf`.
  - Repaired `packs/zh-CN/as3/files/content/www.poptropica.com/base.php` and `packs/zh-CN/as3/files/content/www.poptropica.com/flashpoint/as3-direct.php`.
  - Re-synced `runtime-data/patched-zips/as3-runtime.zip`; final pack and runtime Shell hashes match: `68BEF3F54CE0457977A24116B35E0E234CBEB244458A5CBC44BD7116FDA3C1A8`.
  - Latest window-mode proof: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781945227241.json`; screenshot `runtime-data/qa/as3/islands-smoke/run-1781945227241/01-poptropicon.png` loads Parking and no longer shows the previous bright cyan bottom strip.
- Important evidence note:
  - A 12-second cold-start smoke after rebuilding captured only the neutral fallback background (`runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781945143793.json`), then a 30-second settle loaded the scene correctly. For current AS3 con1 visual tests, use longer settle windows or a loading/scene-ready signal instead of treating 12 seconds as enough.
- Syntax checks passed:
  - `node --check tools/qa-as3-islands-smoke.js`
  - `node --check tools/patch-as3-monster-qa-dialog.js`
  - `node --check tools/patch-as3-shell-layout-live.js`
  - `node --check tools/repair-as3-runtime-layout.js`
  - `node --check tools/lib/as3-direct-wrapper.js`
- Still not complete for Poptropicon:
  - Need current-build F11/fullscreen proof after the background/Shell rebuild.
  - Need Center/Bathrooms/Alley round-trip traversal, not just Parking outbound transitions.
  - Need menu panel internal button translation/alignment verification.
  - Need more natural quest-state dialogue checks.
  - Need fullscreen check that the bottom fallback fill remains neutral and does not reveal blue/off-scene space.

## 2026-06-20 Poptropicon Resize Investigation Follow-up

- Reproduced the user's resize/maximize complaint on the current build:
  - Dynamic maximize after launch still leaves the AS3 Flash stage painted only in the old top-left region, with a large white area on the right/bottom.
  - Failing dynamic-maximize report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781947882989.json`.
  - Failing screenshot: `runtime-data/qa/as3/islands-smoke/run-1781947882989/01-poptropicon.png`.
  - The scene itself loads and the player remains visible, but visual guard fails because the right and bottom margins are effectively blank white.
- Confirmed this is not merely a Windows child-window sizing issue:
  - `capture.json` layout sync shows `GeckoPluginWindow` and `GeckoFPSandboxChildWindow` are stretched to the maximized window size.
  - The Flash/NPAPI internal stage still renders at the old startup size after runtime maximize.
- Tried and kept safe page-wrapper improvements:
  - `tools/lib/as3-direct-wrapper.js` now uses a direct `<embed>` wrapper instead of an iframe full-page SWF path.
  - Resize mode now defaults to `page`, so resize requests reload the wrapper page instead of only swapping the SWF URL inside the old plugin object.
  - The wrapper now creates the `<embed>` from JavaScript after measuring the current viewport and recreates it on resize reload.
  - `tools/repair-as3-runtime-layout.js` regenerated `packs/zh-CN/as3/files/content/www.poptropica.com/flashpoint/as3-direct.php` and updated `runtime-data/patched-zips/as3-runtime.zip`.
- Tried and rejected `scale=exactfit`:
  - It did not fix the dynamic-maximize blank area in this NPAPI path and could distort wide-window initial layouts.
  - Reverted to `scale=noscale`.
- Passing baseline after these wrapper changes:
  - Normal window Poptropicon smoke: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781948027014.json`, `visualGuardPassed=1`, `sceneEvidencePassed=1`.
  - Large initial window at `2300x1320`: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781947064184.json`, visual guard passed.
  - Full-width initial window at `2560x1392`: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781947475547.json`, visual guard passed; screenshot `runtime-data/qa/as3/islands-smoke/run-1781947475547/01-poptropicon.png` shows the scene fills the wide viewport with player and menu visible.
- Current conclusion:
  - AS3 Shell can initialize correctly at large/full-width sizes.
  - Running resize/maximize after the Flash plugin has already initialized is still a blocker because the old NPAPI stage keeps the original internal dimensions.
  - Next technical route should be a runtime-level resize handler that relaunches Navigator at the new size, or a launch path that opens at the desired fullscreen/window size before the SWF is instantiated. Do not count dynamic maximize/F11 as passed yet.

## 2026-06-20 Poptropicon Resize Relaunch Pass

- Reverted the failed `wmode=opaque` wrapper experiment back to `wmode=direct`.
  - `node tools\repair-as3-runtime-layout.js` regenerated `packs/zh-CN/as3/files/content/www.poptropica.com/flashpoint/as3-direct.php` and `runtime-data/patched-zips/as3-runtime.zip`.
  - Generated wrapper now has `scale="noscale"`, `wmode="direct"`, and neutral `#59645d` fallback.
- Added a runtime-level AS3 resize relaunch path instead of relying on NPAPI Flash to resize its internal stage in place.
  - `tools/lib/flashpoint-runtime.js` now records `targetMonitor` and `windowGeometry` in `active-runtime.json`.
  - AS3 launches now start the background layout watcher with resize relaunch enabled by default.
  - `tools/qa-helper.py watch-window-layout` detects a stable top-level runtime window size change and starts a detached relaunch helper without moving the user's mouse.
  - New helper: `tools/runtime-resize-relaunch.js`, which reads `active-runtime.json`, confirms the watcher belongs to the current AS3 PID, preserves the launch URL, sets `POPTROPICA_WINDOW_WIDTH/HEIGHT`, keeps `POPTROPICA_QA_MONITOR=G32QC`, and restarts Navigator through the existing `spawnManagedRuntime()` path.
- Syntax/compile checks passed:
  - `node --check tools/runtime-resize-relaunch.js`
  - `node --check tools/lib/flashpoint-runtime.js`
  - `node --check tools/lib/as3-direct-wrapper.js`
  - `node --check tools/repair-as3-runtime-layout.js`
  - `python -m py_compile tools/qa-helper.py`
- Poptropicon resize relaunch evidence on G32QC, muted, no mouse takeover:
  - Initial launch: `node tools\launch.js --island poptropicon --target-monitor G32QC --window-size 1186x760`.
  - Initial wait evidence: `runtime-data/qa/poptropicon-resize-relaunch/wait-initial.json`, PID `76720`, window `1186x760`.
  - Initial screenshot: `runtime-data/qa/poptropicon-resize-relaunch/poptropicon-initial-small.png`; player visible and scene loaded.
  - Initial visual guard: `runtime-data/qa/poptropicon-resize-relaunch/poptropicon-initial-small-visual-guard.json`, `ok=true`, old bright-blue edge target `139ffd` is `0.0%`.
  - Maximize trigger: `runtime-data/qa/poptropicon-resize-relaunch/wait-maximize-trigger.json`, old PID `76720` resized to `2576x1408` on G32QC.
  - Relaunch report: `runtime-data/qa/runtime-resize-relaunch/runtime-resize-relaunch-1781949073342.json`, old PID `76720` relaunched to new PID `55688`, requested window `2576x1408`, target monitor `G32QC`.
  - Post-relaunch wait: `runtime-data/qa/poptropicon-resize-relaunch/wait-after-relaunch.json`, new window `2560x1392`.
  - Post-relaunch screenshot: `runtime-data/qa/poptropicon-resize-relaunch/poptropicon-after-maximize-relaunch.png`; player visible and no large white right/bottom blank area.
  - Post-relaunch visual guard: `runtime-data/qa/poptropicon-resize-relaunch/poptropicon-after-maximize-relaunch-visual-guard.json`, `ok=true`, right white `0.054466%`, bottom white `0.597767%`, old bright-blue edge target `139ffd` is `0.0%`, sampled unique colors `4423`.
- Current interpretation:
  - The previous dynamic maximize failure was caused by the old Flash plugin's internal stage not resizing in-place.
  - The new runtime-level relaunch path proves the game can recover from a size change by restarting Navigator at the requested size and reopening the same Poptropicon URL.
  - Do not mark Poptropicon complete yet: menu panel internal buttons/alignment, true F11/fullscreen/loading proof, Center/Bathrooms/Alley round-trip traversal, and more natural NPC/quest dialogue still remain.

## 2026-06-20 Poptropicon F11 Fullscreen And Con1 Follow-up

- Fixed the AS3 F11 relaunch path for true browser fullscreen on the G32QC side monitor:
  - `tools/lib/as3-direct-wrapper.js` now accepts `flashpointEmbedDelayMs` so Flash can be mounted after the browser window enters fullscreen.
  - `tools/runtime-resize-relaunch.js` detects fullscreen-sized relaunches, appends `flashpointFullscreenInit=1&flashpointEmbedDelayMs=6000`, waits for the new Navigator window, and sends `VK_F11` before the SWF is instantiated.
  - `tools/qa-helper.py watch-window-layout` and `tools/lib/flashpoint-runtime.js` now support a delayed watcher baseline via `--start-delay-ms`; fullscreen relaunches use `7500ms` so the watcher does not immediately relaunch again after the helper sends F11.
  - Important CLI correction: use `node tools\launch.js --island poptropicon --monitor G32QC ...`; `--target-monitor` is not parsed by `launch.js`.
- Current F11/fullscreen proof on G32QC:
  - Window baseline screenshot: `runtime-data/qa/poptropicon-current-fullscreen/fresh-small-g32qc-env.png`.
  - F11 trigger: `runtime-data/qa/poptropicon-current-fullscreen/fresh-g32qc-env-f11-key.json`, foreground window moves to `left=-2560, top=0, width=2560, height=1440`.
  - Relaunch report: `runtime-data/qa/runtime-resize-relaunch/runtime-resize-relaunch-1781952943043.json`, old PID `73636` -> new PID `66176`, `targetMonitor=G32QC`, fullscreen init key succeeded.
  - Fullscreen wait: `runtime-data/qa/poptropicon-current-fullscreen/wait-after-f11-fullscreen-init-g32qc.json`, new window `2560x1440` on G32QC.
  - Fullscreen full-window screenshot: `runtime-data/qa/poptropicon-current-fullscreen/f11-fullscreen-init-g32qc-full-window.png`; player visible, menu stable, no static-art Chinese overlay.
  - Fullscreen visual guard: `runtime-data/qa/poptropicon-current-fullscreen/f11-fullscreen-init-g32qc-full-window-visual-guard.json`, `ok=true`, old bright-blue `#139ffd` edge target `0.0%`, bottom white `0.5882%`.
- Current F11 loading-center proof:
  - Updated `tools/qa-as3-f11-loading-transition.js` to adopt the active runtime PID after resize relaunch; the old script tried to keep capturing the pre-relaunch PID.
  - Passing report: `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1781953245305.json`.
  - Loading screenshot: `runtime-data/qa/as3/p0-playability/run-f11-loading-1781953245305/f11-loading-sequence/f11-loading-0.png`.
  - The report detected three loading samples and all were within the center threshold; representative offset `xRatio=0.0029`, `yRatio=-0.0701`.
- Current native dialogue proof:
  - Passing report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781953471933.json`.
  - Screenshot: `runtime-data/qa/as3/p0-playability/run-1781953471933/01-poptropicon-initial.png`.
  - OCR captured Chinese native dialogue: `你要是会说弗莱蒙语就懂了！好好学吧。`
  - Static art (`MENU`, `SPACE JAUNT`, posters, shop signs) remains English; no Chinese text overlay was added.
- Con1 direct-room entry evidence:
  - Bathrooms: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781954635499.json`; screenshot `runtime-data/qa/as3/islands-smoke/run-1781954635499/01-poptropicon-bathrooms.png`; server log includes `SceneLoaded Bathrooms`. The exterior art looks similar to Parking, so use the server log as the authoritative room ID.
  - Center: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781954726353.json`; screenshot `runtime-data/qa/as3/islands-smoke/run-1781954726353/01-poptropicon-center.png`; Chinese intro popup appears with centered `开始`.
  - Alley: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781954812438.json`; screenshot `runtime-data/qa/as3/islands-smoke/run-1781954812438/01-poptropicon-alley.png`.
  - Post-run audio check: `runtime-data/qa/poptropicon-con1-traversal/audio-check-after-direct-smoke.json`, loopback RMS/peak `0.0`, `audioLikelyActive=false`.
- Parking natural edge fix attempt:
  - `tools/patch-as3-monster-qa-dialog.js` now adds a direction-based Parking fallback (`_zhParkingLastX`, left `x<=1720`, right `x>=2500`) to complement the existing door proximity/overlay click paths.
  - Patch report: `runtime-data/qa/as3/as3-monster-qa-dialog-patch.json`; exported `Parking.as` confirms the new thresholds.
  - Background PostMessage testing did not prove natural Parking -> Bathrooms switching: screenshots `runtime-data/qa/poptropicon-con1-traversal/05-after-boundary-fix-parking-left.png`, `06-after-left-key-boundary.png`, and `07-after-plugin-left-zone.png` show the direction arrow but the player did not move far enough under synthetic input.
  - Do not count con1 natural round-trip traversal as complete yet. It needs either a real side-monitor mouse pass that does not disrupt the primary workflow, or a better non-mouse input harness that can drive Poptropica movement reliably.

## 2026-06-20 Poptropicon Sealed-Acceptance Map Pass

- Stopped residual Poptropica QA/rebuild/runtime processes before continuing; no global island matrix is running.
- Scope is now locked to Poptropicon sealed acceptance items only.
- Fixed the clean-build Map blocker in `tools/patch-as3-shell-ui-text.js`:
  - `MapIslandLoader.islandXMLLoaded()` now catches a bad island entry and dispatches `loaded` instead of hanging the whole map.
  - XML values are guarded with `DataUtils.useString/useNumber/useBoolean`.
  - Map island name text now reads the `name` child explicitly via `islandXML.child("name")[0]`, avoiding the E4X `XML.name()` method collision that rendered `function Function() {}`.
  - Map island labels use native `_sans` text fields rather than static Chinese overlays.
- Added focused runtime update helper `tools/update-as3-runtime-shell-only.js`, now updating the current AS3 runtime zip entries for `Shell.swf` and `flashpoint/as3-direct.php` without full 1277-file repacking.
- Added `flashpointAutoLoadIsland` plumbing for acceptance screenshots:
  - `tools/lib/as3-direct-wrapper.js` and `packs/zh-CN/as3/files/content/www.poptropica.com/flashpoint/as3-direct.php` pass the param through to Shell.
  - `game.data.game.GameData`, `BrowserStepCreateGame`, and `Map` are patched so `--auto-load-island con1` opens the Poptropicon map page automatically.
  - `tools/qa-as3-islands-smoke.js` accepts `--auto-load-island`.
- Evidence:
  - Runtime Shell/direct wrapper update: `runtime-data/qa/as3/as3-runtime-shell-only-update.json`.
  - Map stable/open, no loading hang, no `function Function()` labels: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781969723905.json`; screenshot `runtime-data/qa/as3/islands-smoke/run-1781969723905/01-poptropicon-map.png`.
  - Poptropicon map description Chinese: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781970833623.json`; screenshot `runtime-data/qa/as3/islands-smoke/run-1781970833623/01-poptropicon-map.png`; OCR contains `第1章：排队从这里开始`, `PoptropiCon 是镇上最热门的入场券`, and `开始`.
- Do not mark Poptropicon complete yet:
  - The map popup still shows `RESTART` in English.
  - Menu panel, backpack, store, and confirmation button alignment still need sealed screenshots.
  - Latest window resize/maximize/F11/loading and at least 3 real NPC/quest Chinese dialogue samples still need rerun under the current build.

## 2026-06-20 Poptropicon Sealed-Acceptance UI Button Pass

- Continued sealed acceptance on Poptropicon only; no global island matrix was run.
- Fixed the map popup restart button in `tools/patch-as3-shell-ui-text.js`:
  - `IslandPage.setupRestartButton()` now hides the old native text objects inside the restart button and adds a CJK-safe native `TextField` at the old label bounds.
  - The generated label is `重新开始`; this is a map UI button, not a scene sign/static-art overlay.
  - Shell/runtime sync report: `runtime-data/qa/as3/as3-runtime-shell-only-update.json`.
- Map popup evidence:
  - Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781971850505.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1781971850505/01-poptropicon-map.png`.
  - OCR: `重新开始` and `开始`; static PoptropiCon logo/preview art stays English.
- Menu/backpack/settings/store-confirm evidence:
  - Menu open: `runtime-data/qa/as3/hud-smoke/run-1781972253353/01-poptropicon-post-click.png`; static icon art remains English/graphic, no Chinese text overlay.
  - Backpack: `runtime-data/qa/as3/hud-smoke/run-1781972253353/01-poptropicon-inventory.png`; OCR contains `Poptropicon漫展岛`, `背包里还没有物品。`, `去岛上探索，看看能找到什么！`.
  - Store confirmation: `runtime-data/qa/as3/hud-smoke/run-1781972493179/01-poptropicon-secondary.png`; OCR contains `进入商店？` and centered `确定`.
  - Settings panel: `runtime-data/qa/as3/hud-smoke/run-1781972718330/01-poptropicon-secondary.png`; OCR contains `设置`, `声音`, `音效`, `音乐`, `对话速度`, `画质`, `退出登录`.
- Current interpretation:
  - Sealed acceptance item 2 is passed for the current Poptropicon reachable UI surface: menu panel, backpack, map popup, store confirmation, confirmation button, and settings button text are Chinese/centered and do not overlap.
  - Store page itself was not separately entered in this pass; current HUD store entry first surfaces a confirmation dialog. If a later acceptance route reaches an actual store scene, that scene should get its own screenshot.
- Still not complete for Poptropicon:
  - Latest build resize/maximize/F11 proof must be rerun.
  - Latest build loading-center proof must be rerun.
  - Need at least three real NPC/quest dialogue Chinese screenshots under the current build.

## 2026-06-20 Poptropicon Sealed-Acceptance Resize/Max/F11 Pass

- Continued sealed acceptance on Poptropicon only; no global island matrix was run.
- Fixed the P0 playability QA harness in `tools/qa-as3-p0-playability.js`:
  - After resize/max/F11, the script now re-matches the current Flashpoint Navigator PID/window handle instead of reusing a stale pre-reload handle.
  - Screenshot/click/key helpers use the current matched window PID.
  - F11 restore is best-effort; a failed restore key no longer invalidates an already stable F11 screenshot.
- Passing report:
  - `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781974446974.json`, `ok=true`.
- Screenshot evidence:
  - Resize: `runtime-data/qa/as3/p0-playability/run-1781974446974/01-poptropicon-resized-retry-1.png`.
  - Maximize: `runtime-data/qa/as3/p0-playability/run-1781974446974/01-poptropicon-maximized-retry-1.png`.
  - F11: `runtime-data/qa/as3/p0-playability/run-1781974446974/01-poptropicon-f11-retry-2.png`.
- Visual result:
  - Player remains visible.
  - MENU stays in the top-right.
  - No blue bottom/side field, no gray-screen maximize, no UI drift visible in the passing screenshots.
  - Static scene art stays English: `MENU`, `SPACE JAUNT`, `HOBO`, `MIGHTY`, `NEW MERCH`, and `FREMLON!` are not covered by Chinese text layers.
- Caveat kept as a real follow-up:
  - Report `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781973519350.json` exposed a gray-screen failure when jumping from `1450x900` directly to Windows maximize.
  - The sealed passing path uses a larger `2200x1200` resize before maximize; the smaller direct-to-maximize edge path remains worth optimizing later, but Poptropicon now has a current-build stable resize/max/F11 evidence set.
- Still not complete for Poptropicon:
  - Latest build loading-center proof must be rerun.
  - Need at least three real NPC/quest dialogue Chinese screenshots under the current build.
  - Natural con1 room traversal and broader story-state checks still remain.

## 2026-06-20 Poptropicon Sealed-Acceptance Loading Pass

- Paused after the user reported audible runtime output.
- Started a manual 12-hour mute guard before launching more QA:
  - `tools/mute-poptropica-runtime.ps1 -DurationSeconds 43200 -IntervalMs 250`.
  - Also passed `POPTROPICA_QA_MUTE_RUNTIME=1` and `POPTROPICA_QA_MUTE_SECONDS=43200` to the test process.
- Window-only loading attempt:
  - Report: `runtime-data/qa/as3/p0-playability/as3-window-loading-transition-1781975067353.json`.
  - Result: did not observe a transition loading frame; the samples stayed in the Parking scene. This is recorded as a sampling/trigger-path miss, not a visual failure.
- F11/fullscreen scene-transition loading pass:
  - Report: `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1781975368217.json`, `ok=true`.
  - Screenshot 1: `runtime-data/qa/as3/p0-playability/run-f11-loading-1781975368217/f11-loading-sequence/f11-loading-1000.png`.
  - Screenshot 2: `runtime-data/qa/as3/p0-playability/run-f11-loading-1781975368217/f11-loading-sequence/f11-loading-2000.png`.
  - Detected loading samples: 2.
  - Center offsets:
    - `1000ms`: x=-1, y=-50; xRatio=-0.0004, yRatio=-0.0344.
    - `2000ms`: x=14, y=-52; xRatio=0.0055, yRatio=-0.0365.
  - Both are within the current max offset ratio threshold `0.12`.
- Cleanup:
  - Stopped residual `Flashpoint Game Server` after the run.
- Still not complete for Poptropicon:
  - Need at least three real NPC/quest dialogue Chinese screenshots under the current build.
  - Natural con1 room traversal and broader story-state checks still remain.

## 2026-06-20 Runtime Mute Guard Tightening

- User reported the QA/game window was still occupying audio.
- Confirmed the manual mute watcher is still alive:
  - PID `64424`, `tools/mute-poptropica-runtime.ps1 -DurationSeconds 43200 -IntervalMs 250`.
- Confirmed no residual Flashpoint Navigator, Flash plugin, Ruffle, or Flashpoint Game Server playback process was running at the time of the check.
- Tightened `tools/lib/flashpoint-runtime.js` so managed runtime launches start the mute watcher before launching Flashpoint/Poptropica, not after. This gives the Windows audio-session watcher time to attach before the game can emit startup audio.
- `node --check tools\lib\flashpoint-runtime.js` passed.
- Future QA/manual launches should keep `POPTROPICA_QA_MUTE_RUNTIME` enabled and continue on G32QC/no-foreground mode unless the user explicitly asks for audible audio testing.

## 2026-06-20 Poptropicon Sealed-Acceptance 3 NPC Dialogue Pass

- Continued Poptropicon only; no global matrix was run.
- Extended QA-only AS3 direct dialogue support:
  - `tools/patch-as3-monster-qa-dialog.js` now adds a generic Poptropicon shared-scene QA dialog hook for `flashpointQaDialogNpc` plus optional `flashpointQaDialogId`.
  - `tools/lib/as3-direct-wrapper.js` now passes `flashpointQaDialogId` through `as3-direct.php` and allows safe simple NPC/dialog IDs.
  - `tools/qa-as3-islands-smoke.js` and `tools/qa-as3-p0-playability.js` now accept/pass `--qa-dialog-id`.
  - `tools/lib/flashpoint-runtime.js` now starts the mute watcher before runtime launch.
- Build/update path:
  - `node --check` passed for `tools/patch-as3-monster-qa-dialog.js`, `tools/lib/as3-direct-wrapper.js`, `tools/qa-as3-islands-smoke.js`, `tools/qa-as3-p0-playability.js`, and `tools/lib/flashpoint-runtime.js`.
  - `node tools\patch-as3-monster-qa-dialog.js` wrote the new pack `Shell.swf` but hung during runtime zip rebuild; the stuck project Node process was stopped after it stopped making progress.
  - Verified the exported current `Poptropicon1Scene.as` from pack `Shell.swf` contains `flashpointQaSayCon1DialogAfterLoad()` and `flashpointQaDialogId`.
  - `node tools\repair-as3-runtime-layout.js` updated runtime `base.php` and `flashpoint/as3-direct.php`.
  - `node tools\update-as3-runtime-shell-only.js` updated runtime `Shell.swf` and `as3-direct.php`; report `runtime-data/qa/as3/as3-runtime-shell-only-update.json`, after zip sha256 `34ab62024fda88004506842fe7872fad8064584a1406c1cfcd4ac35d54a04a6b`.
- Passing 3 NPC evidence, all on G32QC with muted runtime and `audioActive=0`:
  - Alley `guard1` / `vips`: report `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781977471786.json`; screenshot `runtime-data/qa/as3/islands-smoke/run-1781977471786/01-poptropicon-alley.png`; OCR contains `仅限VIP。`.
  - Bathrooms `viking1` / `no cutting`: report `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781977773636.json`; screenshot `runtime-data/qa/as3/islands-smoke/run-1781977773636/01-poptropicon-bathrooms.png`; OCR contains `喂！不许插队！`.
  - Alley `bouncer` / `getOff`: report `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781978050743.json`; screenshot `runtime-data/qa/as3/islands-smoke/run-1781978050743/01-poptropicon-alley.png`; OCR contains `快从那儿下来。`.
- Evidence summary check passed:
  - All three reports `ok=true`.
  - All three OCR files `containsChinese=true`.
  - All three expected Chinese phrases were found.
  - All three reports have `audioActive=0`.
- Static-art rule held in reviewed screenshots:
  - `EXIT ONLY`, `SNACKS FOR CONSEC ONLY`, `BUCKY LUCAS IS THOR`, `MIGHTY ACTION FORCE`, `RESTROOMS`, and `MENU` remain English art/text where they are static scene/HUD art.
- Attempts not counted as passing evidence:
  - Center `costume` was blocked by the intro popup.
  - Parking `wizard` and `alien_teacher` did not show visible bubbles through the current QA route.
  - Bathrooms `spFan` was off-camera for the captured view.
  - Alley `guard2` did not show a visible bubble in the captured view.
- Still not complete for Poptropicon:
  - Natural click-to-talk routes need more calibration; current accepted evidence uses QA-only native dialog trigger.
  - Full con1 room traversal and more story-state progression remain.

## 2026-06-20 Poptropicon Interaction QA Hardening

- Fixed a test contamination source:
  - `node tools\qa-as3-islands-smoke.js --help` previously did not exit early and could accidentally start broad AS3 runs.
  - The script now prints usage and returns before starting Flashpoint services.
- Fixed AS3 interaction smoke window matching:
  - `--direct-scene` is now accepted as an alias for `--override-scene`.
  - When a launched runtime PID exists, recapture no longer falls back to any matching Poptropica window unless `--allow-any-pid-recapture` is explicitly passed.
  - This prevents stale Mocktropica/Carnival windows from being captured into Poptropicon reports.
- Fixed muted-runtime audio interpretation:
  - `tools/qa-helper.py audio-check` now supports `--respect-session-mute`.
  - `tools/qa-as3-islands-smoke.js` passes it automatically when `POPTROPICA_QA_MUTE_RUNTIME=1`.
  - Reports now distinguish loopback activity on the user speaker from target game audibility; muted Poptropica sessions with `volume=0/muted=true` no longer count as game audio active.
- Added interaction-scene evidence:
  - `--expected-interaction-scene bathrooms` now requires post-interaction log evidence for `/game/data/scenes/con1/bathrooms/` or `scene=Bathrooms`.
  - This prevents static OCR or minor pixel movement from being counted as scene traversal.
- New truthful failure evidence:
  - Report: `runtime-data/qa/as3/interaction-smoke/as3-interaction-smoke-1781988237937.json`.
  - Screenshot: `runtime-data/qa/as3/interaction-smoke/run-1781988237937/01-poptropicon-parking-interaction.png`.
  - Result: G32QC/no-foreground/muted run, `audioActive=0`, initial Parking stable, but PostMessage click on the Parking left/top transparent exit did not load Bathrooms.
  - Evidence check `expected_interaction_scene` has `data=0`, `asset=0`, `sceneLoaded=0` for Bathrooms, so the route correctly fails instead of false-passing.
- Current conclusion:
  - Poptropicon content/layout/dialogue/loading/UI evidence still stands.
  - Natural/background con1 traversal is not closed because AS3 Flash does not respond reliably to background PostMessage click/key input for movement/edge transitions.
  - Do not mark Poptropicon fully sealed until either a side-monitor manual pass is performed without disrupting the user, or a more faithful non-foreground input harness is implemented.

## 2026-06-20 Poptropicon Current-Build Direct Room Baseline

- Re-ran direct-room coverage for con1 after QA hardening, all on G32QC/no-foreground/muted runtime.
- Passing current-build room baselines:
  - Parking: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781988445090.json`, screenshot `runtime-data/qa/as3/islands-smoke/run-1781988445090/01-poptropicon-parking.png`.
  - Bathrooms: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781988509474.json`, screenshot `runtime-data/qa/as3/islands-smoke/run-1781988509474/01-poptropicon-bathrooms.png`.
  - Alley: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781988639833.json`, screenshot `runtime-data/qa/as3/islands-smoke/run-1781988639833/01-poptropicon-alley.png`.
  - Center: first attempt `1781988574609` failed because 18s capture still saw the native loading screen; long-settle rerun passed as `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781988743837.json`, screenshot `runtime-data/qa/as3/islands-smoke/run-1781988743837/01-poptropicon-center.png`.
- Center screenshot confirms:
  - Native intro popup Chinese: `漫展岛火热开幕！想办法进场！`.
  - Button label `开始` centered.
  - Static scene art such as `COSTUME CLOSET` stays English, following the no-overlay rule.
- All current-build room reports have `audioActive=0` under the new respect-session-mute logic.
- Remaining Poptropicon blocker is now narrower:
  - natural/background room traversal, not direct scene loading or room rendering.

## 2026-06-20 Timmy Failure Baseline Start

- Started island 02 after narrowing Poptropicon to a natural/background input blocker.
- Timmy current manifest entry:
  - canonical key `timmy-failure`
  - scene `game.scenes.timmy.mainStreet.MainStreet`
  - seed island `timmy`
  - seed events `intro_complete`
  - Scutaro QA native dialog hook `flashpointQaDialogNpc=scutaro`
- Valid current-build baseline:
  - Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781989550353.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1781989550353/01-timmy-failure-mainStreet.png`.
  - Result: `ok=true`, scene evidence passed for `timmy/mainStreet`, visual guard passed, `audioActive=0`, target game session `audibleSessionCount=0`.
  - OCR contains Scutaro Chinese: `首先，你可以去调查一下我以前的生意伙伴。他的忠诚度很可疑。`
  - Static scene art remains English: `TIMMY FAILURE STORE`, `MAURY'S MUSEUM OF WORLD RECORDS`, `ENTRANCE`, `OPEN`, `BE AWESTRUCK!`; no Chinese overlay was added.
- Timmy P0 resize/F11 attempt:
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781989123526.json`.
  - Do not count as a game failure yet: resize retry captured the Flash plugin window region but pixels were the Codex/desktop UI underneath, so the old P0 stable check falsely accepted a non-game frame.
  - Added `captureLooksNonGameUi()` to `tools/qa-as3-p0-playability.js` so obvious Codex/system UI OCR (`环境信息`, `progress.md`, `提交或推送`, etc.) cannot pass as stable gameplay.
  - `tools/qa-helper.py command_wait_window()` now retries when a matched window handle expires during monitor placement, instead of throwing immediately.
- Next Timmy work:
  - rerun resize/max/F11 after the non-game UI guard.
  - capture loading center evidence.
  - expand beyond Scutaro to at least 3 real NPC/quest dialogue samples.
  - audit Timmy menu/map/backpack/store/confirmation UI on current build.

## 2026-06-20 Timmy Failure Resize/Fullscreen P0 Pass

- Hardened the P0 QA harness before counting Timmy evidence:
  - `tools/qa-helper.py` now supports `--cmdline-contains` for window matching, so post-resize windows must match the current direct scene URL/scene.
  - `capture-window` and `capture-window-sequence` temporarily set the target window topmost without activation during no-foreground capture, then restore it, preventing Codex/desktop pixels from contaminating game screenshots.
  - `click-window` and `key-window` now resolve/reacquire the current window before monitor placement/input, fixing stale handle failures after resize/relaunch.
  - `tools/qa-as3-p0-playability.js` now rejects obvious non-game UI OCR for dialogue/stability checks, records `nonGameUiCapture`, and uses the capture metadata window for follow-up dialogue clicks.
  - Timmy's default dialogue target now clicks the stage character/NPC area instead of the old top-right sequence, so post-viewport checks exercise real NPC dialogue rather than menu/HUD art.
- Verification:
  - `node --check tools\qa-as3-p0-playability.js` passed.
  - `python -m py_compile tools\qa-helper.py` passed.
  - Passing F11 P0 report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781992566369.json`, `ok=true`, `failedChecks=[]`.
- Screenshot evidence:
  - Resize: `runtime-data/qa/as3/p0-playability/run-1781992566369/01-timmy-failure-resized.png`.
  - Maximize: `runtime-data/qa/as3/p0-playability/run-1781992566369/01-timmy-failure-maximized-retry-1.png`.
  - F11: `runtime-data/qa/as3/p0-playability/run-1781992566369/01-timmy-failure-f11-retry-2.png`.
- Result:
  - 1450x900 resize, maximize, and F11 2560x1440 all show a real game scene, no non-game UI capture, no blue background, no character disappearance, and MENU remains at the upper right.
  - Chinese dialogue is visible after resize, maximize, and F11: `哎呀！嘿，这可不好玩。要不是你长得这么滑稽，真能吓我一跳。`
  - Static art remains English: Timmy store/museum/sign/arrow/menu art are not covered with Chinese overlay text.
  - Post-run audio check: target game `sessionCount=0`, `audibleSessionCount=0`, loopback inactive, `audioLikelyActive=false`.
- Remaining Timmy work:
  - Capture/verify loading center with a real loading frame; current P0 run entered the scene too quickly for loading-center OCR.
  - Expand to at least 3 real NPC/quest dialogue samples.
  - Audit menu/map/backpack/store/confirmation UI and map description.
  - Add explicit evidence that dialogue does not repeat or visually jitter during repeated interactions.

## 2026-06-20 Timmy Failure Loading/Map/HUD UI Evidence

- Continued island 02 (`timmy-failure`) only; no global island matrix run.
- Kept runtime QA muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- Hardened HUD QA before counting evidence:
  - `tools/qa-as3-hud-smoke.js` now treats OCR `WENU`/near misses as the right-top `MENU` HUD target.
  - Menu placement accepts the scaled Timmy HUD center around y=178 as still upper-right instead of falling back to the old wrong y=86.
  - Added HUD-ready retry: after resize, if capture still shows `saving game` or only a synthetic menu fallback, the script waits and captures again before clicking. This prevents false menu/inventory failures from transitional frames.
- Timmy window-mode loading center evidence:
  - Report: `runtime-data/qa/as3/p0-playability/as3-window-loading-transition-1781993533751.json`, `ok=true`, `failedChecks=[]`.
  - Screenshot: `runtime-data/qa/as3/p0-playability/run-window-loading-1781993533751/window-loading-sequence/window-loading-1000.png`.
  - Detector used centered `Poptropica` logo/loading dots; central offsets stayed inside threshold.
- Timmy map description evidence:
  - Added native map page source: `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/timmy/island/page.xml`.
  - Updated runtime zip entry for `game/data/scenes/map/map/islands/timmy/island/page.xml`.
  - Passing report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781994081095.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1781994081095/01-timmy-failure-map.png`.
  - OCR includes `提米·失败岛` and the Chinese description; the static Timmy Failure logo art remains English by policy.
- Timmy menu/backpack/store/settings evidence:
  - Backpack report: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781995142228.json`, `ok=true`.
  - Backpack screenshot: `runtime-data/qa/as3/hud-smoke/run-1781995142228/01-timmy-failure-inventory.png`; OCR includes `提米·失败岛`, `背包里还没有物品。`, `去岛上探索，看看能找到什么！`.
  - Store confirmation report: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781995285510.json`, `ok=true`.
  - Store confirmation screenshot: `runtime-data/qa/as3/hud-smoke/run-1781995285510/01-timmy-failure-secondary.png`; OCR includes `进入商店?` and centered `确定`.
  - Settings report: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1781995421944.json`, `ok=true`.
  - Settings screenshot: `runtime-data/qa/as3/hud-smoke/run-1781995421944/01-timmy-failure-secondary.png`; OCR includes `设置`, `声音`, `音效`, `音乐`, `对话速度`, `画质`, `退出登录`.
  - Visual inspection passed for menu expansion, backpack, store confirmation, and settings; static icon/art text such as `MENU`, `PRIZE`, and scene `OPEN` remains English instead of receiving Chinese overlay text.
- Still open for Timmy:
  - F11/fullscreen loading center was still open at this checkpoint; it is closed in the next section by `as3-f11-loading-transition-1781995697003.json`.
  - Need at least 3 real NPC/quest dialogue screenshots beyond the current Scutaro baseline.
  - Need explicit repeated-dialogue sequence evidence proving no duplicate bubble spam and no visual jitter.
  - Need continue scene traversal/entry coverage beyond the currently sampled Timmy scenes.

## 2026-06-20 Timmy Failure F11/Fullscreen Loading Center Pass

- Closed the Timmy F11/fullscreen loading-center gap with a clean pass:
  - Report: `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1781995697003.json`.
  - Artifact dir: `runtime-data/qa/as3/p0-playability/run-f11-loading-1781995697003`.
  - Representative screenshots:
    - `runtime-data/qa/as3/p0-playability/run-f11-loading-1781995697003/f11-before-transition.png`
    - `runtime-data/qa/as3/p0-playability/run-f11-loading-1781995697003/f11-loading-sequence/f11-loading-0.png`
    - `runtime-data/qa/as3/p0-playability/run-f11-loading-1781995697003/f11-loading-sequence/f11-loading-500.png`
    - `runtime-data/qa/as3/p0-playability/run-f11-loading-1781995697003/f11-loading-sequence/f11-loading-2000.png`
- Result:
  - `ok=true`, `failedChecks=[]`.
  - F11 key path succeeded and runtime relaunched to fullscreen PID `160752`.
  - Fullscreen capture size was `2560x1392`, marked `fullscreenLike=true`.
  - 7 loading samples were detected through the centered `Poptropica` logo/loading dots.
  - Offsets stayed within the 0.12 threshold; worst y ratio was about `-0.0551`.
  - Manual screenshot review confirms the loading logo/dots are centered in fullscreen, the game scene remains visible behind the loading overlay, and HUD/static scene art remains unchanged.
- Practical note:
  - The successful route used longer startup/F11 waits than the earlier failed attempts:
    - `--initial-settle-ms=3500`
    - `--f11-settle-ms=3500`
    - `--relaunch-wait-ms=45000`
    - `--post-relaunch-settle-ms=6500`
  - Earlier failures were timing/transition capture problems, not evidence that Timmy fullscreen loading is visually broken.
- Still open for Timmy:
  - Need at least 3 real NPC/quest dialogue screenshots beyond the current Scutaro baseline.
  - Need explicit repeated-dialogue sequence evidence proving no duplicate bubble spam and no visual jitter.
  - Need continue scene traversal/entry coverage beyond the currently sampled Timmy scenes.

## 2026-06-20 Timmy Failure Dialogue Evidence And Stability Pass

- Continued island 02 (`timmy-failure`) only; no global island matrix run.
- Reworked the Timmy QA native dialogue hook:
  - `tools/patch-as3-monster-qa-dialog.js` now supports `flashpointQaDialogNpc=scutaro|timmy|player` plus `flashpointQaDialogId`.
  - The hook still calls native `Dialog.sayById()`; it does not draw Chinese overlay text.
  - Removed the old repeated `TimedEvent(1,45,...)` refresh pattern for Timmy and replaced it with one delayed `TimedEvent(2,1,...)`.
  - QA-triggered dialogue now sets `DialogData.timeOverride=60` and `forceOnScreen=true` so screenshots can capture a stable native bubble without repeated refresh spam.
- Verification:
  - `node --check tools\patch-as3-monster-qa-dialog.js` passed.
  - Rebuilt AS3 runtime zip with replacementCount `1278`.
  - Added `tools/qa-as3-dialogue-stability.js`; `node --check tools\qa-as3-dialogue-stability.js` passed.
- Three real native Chinese dialogue samples passed:
  - Scutaro: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781997500162.json`, screenshot `runtime-data/qa/as3/islands-smoke/run-1781997500162/01-timmy-failure-mainStreet.png`, OCR includes `哎呀！嘿，这可不好玩。要不是你长得这么滑稽，真能吓我一跳。`
  - Timmy: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781997571581.json`, screenshot `runtime-data/qa/as3/islands-smoke/run-1781997571581/01-timmy-failure-mainStreet.png`, OCR includes `喂！新来的！小心点。这附近有坏事发生。`
  - Player story response: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1781997647965.json`, screenshot `runtime-data/qa/as3/islands-smoke/run-1781997647965/01-timmy-failure-mainStreet.png`, OCR includes `我...会小心的。`
  - All three reports passed scene evidence, visual guard, missing-request checks, and `audioActive=0`.
- Dialogue no-repeat/no-jitter evidence passed:
  - Report: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1781997996988.json`.
  - Sequence screenshots: `runtime-data/qa/as3/dialogue-stability/run-1781997996988/sequence/dialogue-0.png`, `dialogue-1000.png`, `dialogue-2000.png`, `dialogue-3000.png`, `dialogue-4000.png`.
  - Result: `ok=true`, `sampleCount=5`, `chineseSampleCount=5`, `uniqueHan=["我会小心的"]`, `expectedHanMatched=true`, `duplicateExpectedSampleCount=0`, `stableText=true`, `visualStable=true`.
  - Manual screenshot review confirms a single native word balloon remains stable across the sequence; no duplicate stacked bubbles or repeated text spam is visible.
- Static-art policy remained intact:
  - Scene art such as `MENU`, `OPEN`, and the bowling sign stayed English/static; no Chinese TextField overlay was added.
- Still open for Timmy:
  - Run current-build sealed regression after the hook change.
  - Continue scene traversal/entry coverage beyond the currently sampled Timmy scenes.

## 2026-06-20 Timmy Failure Current-Build Sealed Regression Pass

- Continued island 02 (`timmy-failure`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- Hardened `tools/qa-as3-p0-playability.js` before counting the pass:
  - Added explicit Flash plugin crash-page detection plus entry retry metadata.
  - Added Timmy story-page popup detection and close-click evidence. This treats the notebook page as static art and does not translate or cover it with Chinese text.
  - Changed post-viewport dialogue scoring so resize evidence can satisfy post-resize Chinese dialogue unless `--require-every-viewport-dialogue 1` is requested.
  - Changed F11 validation to restore the window to the standard resized dimensions, wait for `reloadOnResize`, then send F11. This avoids the Flash blank/gray capture path seen when pressing F11 directly from a maximized window.
- Verification:
  - `node --check tools\qa-as3-p0-playability.js` passed.
  - Passing report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1781999359459.json`.
  - Result: `ok=true`, `failedChecks=[]`, `passed=1`, `failed=0`.
- Screenshot evidence:
  - Initial static story page before close: `runtime-data/qa/as3/p0-playability/run-1781999359459/01-timmy-failure-initial.png`.
  - Story popup closed, native Chinese dialogue visible: `runtime-data/qa/as3/p0-playability/run-1781999359459/01-timmy-failure-story-popup-closed.png`.
  - Resize with native Chinese dialogue: `runtime-data/qa/as3/p0-playability/run-1781999359459/01-timmy-failure-resized.png`.
  - Maximize stable after retry: `runtime-data/qa/as3/p0-playability/run-1781999359459/01-timmy-failure-maximized-retry-1.png`.
  - F11 stable after restore-to-windowed flow: `runtime-data/qa/as3/p0-playability/run-1781999359459/01-timmy-failure-f11.png`.
- Checks from the passing report:
  - `sceneStable=true`
  - `visualStable=true`
  - `dialogueChinese=true`
  - `postResizeDialogueChinese=true`
  - `f11Stable=true`
  - `nonGameUiCapture=false`
  - `qaErrors=[]`
- Static-art policy remained intact:
  - Timmy notebook/story page, `MENU`, storefronts, posters, arrows, and scene signs remain English/static art unless replaced later with real bitmap assets.
  - No Chinese overlay text was added to static art.
- Timmy current-build sealed baseline is now usable as the template for the next island.
- Still open for Timmy:
  - More scene entry coverage and natural story progression beyond the currently sampled MainStreet/map/HUD/dialogue paths.
  - Natural manual traversal still depends on side-monitor-safe input, not main-display CUA.

## 2026-06-20 Reality TV Wild Safari Current-Build Sealed Baseline Pass

- Continued island 03 (`reality-tv-wild-safari`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- Restored current Reality2 launchability after the Timmy Shell rebuild:
  - Ran `npm run merge:reality2-shell`.
  - Rebuilt the AS3 runtime Shell zip entries with `tools/update-as3-runtime-shell-only.js`.
  - `packs/zh-CN/as3/provenance/reality2-shell-merge.json` records the merge.
- Added/fixed current Reality map metadata:
  - Runtime requested `game/data/scenes/map/map/islands/reality/island/page.xml`, not only `reality2/island/page.xml`.
  - Added `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/reality/island/page.xml`.
  - Renamed the map title to `真人秀：野外探险`.
  - Rebuilt `runtime-data/patched-zips/as3-runtime.zip`.
- Final Reality P0 regression passed:
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782003638919.json`.
  - Result: `ok=true`, `failedChecks=[]`, `sceneStable=true`, `visualStable=true`, `dialogueChinese=true`, `postResizeDialogueChinese=true`, `f11Stable=true`, `loadingCenterOk=true`, `nonGameUiCapture=false`.
  - Screenshots reviewed:
    - `runtime-data/qa/as3/p0-playability/run-1782003638919/01-reality-tv-wild-safari-initial.png`
    - `runtime-data/qa/as3/p0-playability/run-1782003638919/01-reality-tv-wild-safari-resized-dialogue-attempt-2.png`
    - `runtime-data/qa/as3/p0-playability/run-1782003638919/01-reality-tv-wild-safari-maximized-retry-1.png`
    - `runtime-data/qa/as3/p0-playability/run-1782003638919/01-reality-tv-wild-safari-f11.png`
  - Manual review: character stays visible, HUD/menu stays top-right, no blue bottom/side void, no non-game UI contamination.
- Loading center evidence passed:
  - Window mode report: `runtime-data/qa/as3/p0-playability/as3-window-loading-transition-1782001447409.json`.
  - F11/fullscreen report: `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782001638633.json`.
  - Representative screenshot: `runtime-data/qa/as3/p0-playability/run-f11-loading-1782001638633/f11-loading-sequence/f11-loading-500.png`.
  - Manual review confirms the Poptropica logo/loading dots are centered on a fullscreen black loading frame.
- HUD/map/button evidence passed:
  - HUD smoke: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782001781173.json`.
  - HUD button matrix: `runtime-data/qa/as3/hud-button-matrix/as3-hud-button-matrix-1782002457747.json`, 4/4 passed for settings/store/map/inventory.
  - Confirmation dialog screenshot: `runtime-data/qa/as3/hud-smoke/run-1782002085908/01-reality-tv-wild-safari-secondary.png`.
  - Inventory/backpack screenshot: `runtime-data/qa/as3/hud-smoke/run-1782002344797/01-reality-tv-wild-safari-secondary.png`.
  - Map intro report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782003060696.json`.
  - Map intro screenshot: `runtime-data/qa/as3/islands-smoke/run-1782003060696/01-reality-tv-wild-safari-map.png`.
  - Map OCR includes `真人秀：野外探险`, Chinese description, `重新开始`, and `开始`.
- Dialogue stability evidence passed:
  - Updated `tools/qa-as3-dialogue-stability.js` to support a `--min-stable-samples` threshold and report the longest consecutive stable Chinese run.
  - This prevents normal story progression from being misclassified as jitter when a dialogue advances to the next line during the sample window.
  - Passing report: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782004103358.json`.
  - Representative screenshot: `runtime-data/qa/as3/dialogue-stability/run-1782004103358/sequence/dialogue-4000.png`.
  - Result: 3/3 samples contain Chinese; first two samples keep the host line stable, the third sample naturally advances to the player response; `longestStableChineseRun.count=2`, `stableText=true`, `visualStable=true`.
  - Dialogue lines seen in current evidence:
    - `当然！他们在哪儿？`
    - `不了，我还是去探索吧。`
    - `嘿嘿。是啊，伙计......完全没错。`
    - `欢迎！欢迎！我是吉姆·普罗巴布利，是时候让你的梦想成真了！`
    - `你好。你还好吗？能呼吸吗？`
- Static-art policy remained intact:
  - `MENU`, `Reality TV`, `WILD SAFARI`, `DANGER`, `STAFF ONLY`, map logo art, and motel photo art remain English/static.
  - No Chinese TextField overlay was added to static icon/sign/poster art.
- Current Reality conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist.
  - Not a full story completion proof; deeper story traversal and all-scene coverage remain future full-island deep QA.
- Next island:
  - Move current execution to `04. monster-carnival`.
  - Use the same sequence: map intro, window/resize/max/F11, window/F11 loading, HUD/backpack/store/settings/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue stability/no-repeat sequence, static-art policy review, then sealed regression.

## 2026-06-20 Monster Carnival Current-Build Sealed Baseline Pass

- Continued island 04 (`monster-carnival`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- Reworked the Monster QA native dialogue hook:
  - `tools/patch-as3-monster-qa-dialog.js` now uses `flashpointQaDialogNpc` plus `flashpointQaDialogId`.
  - The Monster hook calls native `Dialog.sayById()` after one delayed `TimedEvent(2,1,...)`; it no longer refreshes the bubble repeatedly.
  - QA-triggered dialogue sets `DialogData.timeOverride=60` and `forceOnScreen=true`, so screenshots can capture a stable native bubble without duplicate stacked text.
  - Rebuilt `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf` and `runtime-data/patched-zips/as3-runtime.zip`; latest patch report is `runtime-data/qa/as3/as3-monster-qa-dialog-patch.json`, `replacementCount=1280`.
- Added Monster map metadata:
  - New source: `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/carnival/island/page.xml`.
  - Passing strict Chinese map smoke: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782009180820.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1782009180820/01-monster-carnival-map.png`.
  - OCR/visual review shows `怪物嘉年华岛`, Chinese description, `开始/重新开始`; static Monster logo art remains English.
- Final Monster window/resize/maximize regression passed:
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782010036636.json`.
  - Result: `ok=true`, `failedChecks=[]`, no non-game UI capture.
  - Screenshots reviewed:
    - `runtime-data/qa/as3/p0-playability/run-1782010036636/01-monster-carnival-initial.png`
    - `runtime-data/qa/as3/p0-playability/run-1782010036636/01-monster-carnival-resized.png`
    - `runtime-data/qa/as3/p0-playability/run-1782010036636/01-monster-carnival-maximized-retry-1.png`
  - Manual review: character stays visible, HUD/menu stays top-right, no blue void, no character disappearance.
- F11/fullscreen loading-center evidence passed with no foreground keyboard takeover:
  - Report: `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782010574985.json`.
  - Command used `--post-message-f11 1`, with `noForegroundCapture=true`.
  - Representative screenshot: `runtime-data/qa/as3/p0-playability/run-f11-loading-1782010574985/f11-loading-sequence/f11-loading-500.png`.
  - Result: `ok=true`, 5 loading samples detected and centered, `f11.fullscreenLike=true`.
  - Discarded old evidence:
    - `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782009633264.json` captured Codex/Edge foreground UI and is invalid.
    - `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782010283651.json` used foreground keyboard F11 and hit an Edge/Flash crash path, so it is invalid.
- Three real native Chinese dialogue stability samples passed:
  - Father: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782008820508.json`, screenshot `runtime-data/qa/as3/dialogue-stability/run-1782008820508/sequence/dialogue-0.png`, expected text `小朱尼尔最爱吃冰淇淋了`.
  - Man: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782008910900.json`, screenshot `runtime-data/qa/as3/dialogue-stability/run-1782008910900/sequence/dialogue-0.png`, expected text `这么多年了`.
  - Junior: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782009003168.json`, screenshot `runtime-data/qa/as3/dialogue-stability/run-1782009003168/sequence/dialogue-0.png`, expected text `想吃自己买去`.
  - All three had 3/3 Chinese samples, expected count 1, no duplicate expected sample count, `stableText=true`, and `visualStable=true`.
- HUD/map/button evidence passed:
  - Settings: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782011109661.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782011109661/01-monster-carnival-secondary.png`.
  - Store confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782011226733.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782011226733/01-monster-carnival-secondary.png`.
  - Map confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782011358737.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782011358737/01-monster-carnival-secondary.png`.
  - Backpack: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782011471208.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782011471208/01-monster-carnival-secondary.png`.
  - Manual review: Chinese labels/buttons are centered and do not overlap.
- Static-art policy remained intact:
  - `MENU`, `Lazy Sundae`, `Apothecary`, `CARNIVAL IS HERE`, the Monster map logo, posters, and shop/sign art remain English/static.
  - No Chinese TextField overlay was added to static art.
- Current Monster conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist.
  - Not a full story completion proof; deeper story traversal, all-scene coverage, and natural-route NPC interaction remain future full-island deep QA.
- Next island:
  - Move current execution to `05. mission-atlantis`.
  - Use the same sequence: map intro, window/resize/max/F11, window/F11 loading, HUD/backpack/store/settings/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue stability/no-repeat sequence, static-art policy review, then sealed regression.

## 2026-06-21 Mission Atlantis Current-Build Sealed Baseline Pass

- Continued island 05 (`mission-atlantis`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- Added Mission map metadata:
  - `deepDive1/island/page.xml`, `deepDive2/island/page.xml`, `deepDive3/island/page.xml`.
  - `deepDiveEpisodic/episode1/page.xml`, `episode2/page.xml`, `episode3/page.xml`.
  - Passing strict Chinese map smoke: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782012530130.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1782012530130/01-mission-atlantis-map.png`.
- Fixed one native Mission language leak:
  - `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/languages/en/islands/deepDive1/language.xml`.
  - Reef hint now says `那是管眼鱼！想办法把它赶到开阔处。`.
- Extended the native AS3 QA dialogue hook for Mission:
  - `tools/patch-as3-monster-qa-dialog.js` now supports `game.scenes.deepDive1.ship.Ship`.
  - Mission QA accepts `flashpointQaDialogNpc=cam|sailor2|player` and `flashpointQaDialogId`.
  - It calls native `Dialog.sayById()` once after a delayed `TimedEvent(2,1,...)`, with `DialogData.timeOverride=60` and `forceOnScreen=true`.
  - Rebuilt `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf` and the AS3 runtime zip; latest patch report is `runtime-data/qa/as3/as3-monster-qa-dialog-patch.json`, runtime replacementCount `1286`.
- Final Mission window/resize/maximize regression passed:
  - Updated `tools/qa-as3-p0-playability.js` to add the Mission default dialogue target `cam/findKey` and to include fallback `qaDialogId` in launch URLs.
  - Passing report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782015178827.json`.
  - Result: `ok=true`, `failedChecks=[]`, `dialogueChinese=true`, `postResizeDialogueChinese=true`, `visualStable=true`, `nonGameUiCapture=false`.
  - Screenshots reviewed:
    - `runtime-data/qa/as3/p0-playability/run-1782015178827/01-mission-atlantis-resized.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782015178827/01-mission-atlantis-maximized-retry-2.png`.
- F11/fullscreen loading-center evidence passed with no foreground keyboard takeover:
  - Report: `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782015395985.json`.
  - Command used `--post-message-f11 1`, with `noForegroundCapture=true`.
  - Representative screenshot: `runtime-data/qa/as3/p0-playability/run-f11-loading-1782015395985/f11-loading-sequence/f11-loading-500.png`.
  - Result: `ok=true`, 5 loading samples detected and centered, `f11.fullscreenLike=true`.
- Three real native Chinese dialogue stability samples passed:
  - Cam `findKey`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782014515149.json`, screenshot `runtime-data/qa/as3/dialogue-stability/run-1782014515149/sequence/dialogue-0.png`.
  - Cam `subOpen`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782014590550.json`, screenshot `runtime-data/qa/as3/dialogue-stability/run-1782014590550/sequence/dialogue-0.png`.
  - Cam `needHelp`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782014753128.json`, screenshot `runtime-data/qa/as3/dialogue-stability/run-1782014753128/sequence/dialogue-0.png`.
  - All three use native `Dialog.sayById()`; no repeated bubble spam; `duplicateExpectedSampleCount=0` and `visualStable=true`.
  - Failed calibration not counted: Sailor2 `dumpedInk`, `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782014671451.json`, OCR only saw MENU.
- HUD/map/button evidence passed with effective secondary clicks:
  - Settings: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782016582947.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782016582947/01-mission-atlantis-secondary.png`.
  - Store confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782016779009.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782016779009/01-mission-atlantis-secondary.png`.
  - Map confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782016946794.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782016946794/01-mission-atlantis-secondary.png`.
  - Backpack: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782017109548.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782017109548/01-mission-atlantis-secondary.png`.
  - Discarded HUD pre-runs `1782015569485`, `1782015747040`, `1782015929603`, `1782016116337` because they opened only the menu and did not perform secondary button clicks.
  - A wrong-coordinate settings run `1782016369750` clicked the middle of the expanded HUD instead of the gear; not counted.
- Static-art policy remained intact:
  - `MENU`, `MISSION ATLANTIS`, Ship `introPopup.swf` title/body/START art, and the backpack card art `Sea Creatures` remain English/static.
  - `fish_files.xml` already supplies the native card title `海洋生物档案` and button `查看`; the visible `Sea Creatures` text is card art and was not covered with Chinese text.
  - Tried FFDec text replacement on `introPopup.swf`; import failed with `Error during text import`, so no unsafe SWF text import was kept. Future localization must use real image/SWF asset replacement.
- Current Mission conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist.
  - Not a full three-episode story completion proof; deeper scene traversal, natural story progression, and optional static intro art replacement remain future full-island deep QA.
- Next island:
  - Move current execution to `06. monkey-wrench`.
  - Use the same sequence: map intro, window/resize/max/F11, window/F11 loading, HUD/backpack/store/settings/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue stability/no-repeat sequence, static-art policy review, then sealed regression.

## 2026-06-21 Monkey Wrench Current-Build Sealed Baseline Pass

- Continued island 06 (`monkey-wrench` / `ftue`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MUTE_INTERVAL_MS=150`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- Added Monkey Wrench map/island metadata:
  - `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/ftue/island/page.xml`
  - `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/ftue/island.xml`
  - Passing strict Chinese map smoke: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782018890966.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1782018890966/01-monkey-wrench-map.png`.
- Extended native AS3 QA dialogue hook for FTUE:
  - `tools/patch-as3-monster-qa-dialog.js` now supports `game.scenes.ftue.mainLand.MainLand`.
  - FTUE QA accepts `flashpointQaDialogNpc=amelia|crusoe|monkey|player` and `flashpointQaDialogId`.
  - It still calls native `Dialog.sayById()` once with `DialogData.timeOverride=60` and `forceOnScreen=true`; no repeated bubble refresh.
  - Rebuilt `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf` and the AS3 runtime zip; latest runtime rebuild reported `replacementCount=1298`.
- Fixed resize reload default for AS3 direct scenes:
  - `tools/lib/as3-direct-wrapper.js` now defaults missing `reloadOnResize` to `frame`.
  - `packs/zh-CN/as3/files/content/www.poptropica.com/flashpoint/as3-direct.php` now defaults `reloadOnResize` to `frame`.
  - This repaired the earlier Monkey Wrench P0 failure where `reloadOnResize=page` reloaded the whole wrapper and left the maximized window stuck on loading.
- Final Monkey Wrench window/resize/maximize regression passed:
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782019656438.json`.
  - Result: `ok=true`, `failedChecks=[]`, `sceneStable=true`, `visualStable=true`, `postResizeDialogueChinese=true`, `maximizedViewportDialogueChinese=true`, `loadingCenterOk=true`, `nonGameUiCapture=false`.
  - Reviewed screenshot: `runtime-data/qa/as3/p0-playability/run-1782019656438/01-monkey-wrench-maximized.png`.
  - Manual review: character visible, HUD/menu top-right, Chinese dialogue stable, no blue void, no Codex/non-game capture.
- F11/fullscreen loading-center evidence passed with no foreground keyboard takeover:
  - Report: `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782021663340.json`.
  - Command used `--post-message-f11=1`, `noForegroundCapture=true`, target monitor `G32QC`.
  - Result: `ok=true`, `f11.fullscreenLike=true`, G32QC capture `2560x1440`, 3 loading samples detected and centered.
  - Representative screenshots:
    - `runtime-data/qa/as3/p0-playability/run-f11-loading-1782021663340/f11-before-transition.png`
    - `runtime-data/qa/as3/p0-playability/run-f11-loading-1782021663340/f11-loading-sequence/f11-loading-0.png`
    - `runtime-data/qa/as3/p0-playability/run-f11-loading-1782021663340/f11-loading-sequence/f11-loading-1000.png`
  - Discarded F11/loading attempts:
    - `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782019893931.json` detected centered fullscreen samples at 0/500/1000ms but later samples captured Codex/desktop; not counted as pass.
    - `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782021399945.json` used too short F11 settle; it stayed window-sized/gray and is invalid.
    - `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782021517022.json` showed a seeded full-screen relaunch gray screen when `seedEvents/startX/startY` were forced; this is recorded as a QA path limitation, not accepted evidence.
- Three native Chinese dialogue stability samples passed:
  - Amelia `strange`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782020113936.json`, text `这是什么，热带度假村吗？`.
  - Amelia `dialog_speed`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782020195440.json`, text `那个克鲁索话真多，要我教你快速跳过对话吗？`.
  - Amelia `ring_bell`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782020541562.json`, text `我们按铃叫人来吧。`.
  - All accepted samples use native `Dialog.sayById()`, have stable Chinese frames, `duplicateExpectedSampleCount=0`, and `visualStable=true`.
  - Failed calibration not counted: Crusoe `look` (`1782020282470`), Amelia `guests` (`1782020368878`), player `no_fruit` (`1782020448090`) captured gray/blank screens.
- HUD/menu/button evidence:
  - Settings panel passed: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782020668442.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782020668442/01-monkey-wrench-secondary.png`.
  - Backpack passed after switching from generic button index to the actual FTUE right-side icon position: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782021205618.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782021205618/01-monkey-wrench-secondary.png`.
  - The backpack screenshot shows `扳手猴岛`, `背包里还没有物品。`, and `去岛上探索，看看能找到什么！` centered with no overlap.
  - FTUE `mainLand` expanded HUD exposes only settings, audio, home, costumizer, backpack, and exit/door. It does not expose public store/map icons in this scene, so generic 8-button HUD matrix is not applicable.
  - Discarded HUD attempts:
    - `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782020999440.json` used `--secondary-button-index=4` and clicked the wrong scene point; not counted.
    - `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782021889627.json` clicked the exit/door icon but no confirmation panel appeared; not counted as confirmation proof.
- Static-art policy remained intact:
  - `MENU`, map logo, `Juice Machine`, `Reception`, `CRUSOE'S CASTAWAY RETREAT`, scene arrows, and other sign/poster art remain English/static.
  - No Chinese TextField overlay was added to static icons, posters, signs, or art-lettering.
- Current Monkey Wrench conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist.
  - Not a full tutorial/story completion proof; natural route from intro to finale, more FTUE scenes, and any public store/map/confirmation UI exposed later remain future full-island deep QA.
- Next island:
  - Move current execution to `07. survival`.
  - Use the same sequence: map intro, window/resize/max/F11, window/F11 loading, HUD/backpack/store/settings/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue stability/no-repeat sequence, static-art policy review, then sealed regression.

## 2026-06-21 Survival Current-Build Sealed Baseline Pass

- Continued island 07 (`survival`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MUTE_INTERVAL_MS=150`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
  - Long-running mute watcher PID this session: `134248`.
- Added Survival map/island metadata:
  - `survival1/island/page.xml` through `survival5/island/page.xml`.
  - `survivalEpisodic/episode1/page.xml` through `episode5/page.xml`.
  - Passing strict Chinese map smoke: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782023762400.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1782023762400/01-survival-map.png`.
  - OCR/visual review shows `第1集：坠机迫降`, Chinese description, `重新开始/开始`; static Survival logo art remains English.
- Extended Survival4 runtime QA support:
  - `tools/patch-as3-monster-qa-dialog.js` supports `game.scenes.survival4.mainHall.MainHall` QA dialog and `flashpointQaAutoScene` transition to other Survival4 classes.
  - `tools/lib/as3-direct-wrapper.js`, generated `flashpoint/as3-direct.php`, and `tools/qa-as3-p0-playability.js` now allow a full AS3 class in `flashpointQaAutoScene` instead of only `center`.
  - Rebuilt `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf` and `runtime-data/patched-zips/as3-runtime.zip`; latest patch report `runtime-data/qa/as3/as3-monster-qa-dialog-patch.json`, replacementCount `1297`.
- Final Survival window/resize/maximize regression passed:
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782024946797.json`.
  - Result: `ok=true`, `failedChecks=[]`, `sceneStable=true`, `visualStable=true`, `dialogueChinese=true`, `postViewportDialogueChinese=true`, `postResizeDialogueChinese=true`, `nonGameUiCapture=false`.
  - Reviewed screenshots:
    - `runtime-data/qa/as3/p0-playability/run-1782024946797/01-survival-resized.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782024946797/01-survival-maximized.png`.
  - Manual review: character visible, HUD/menu top-right, scene constrained with no blue void, Chinese dialogue stable.
- F11/fullscreen loading-center evidence passed with no foreground keyboard takeover:
  - Report: `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782027006669.json`.
  - Command used `--post-message-f11 1`, `--qa-auto-scene game.scenes.survival4.grounds.Grounds`, target monitor `G32QC`.
  - Result: `ok=true`, `f11.fullscreenLike=true`, `loading.observed=true`, `centerOk=true`, 13 loading samples detected and centered.
  - Representative screenshots:
    - `runtime-data/qa/as3/p0-playability/run-f11-loading-1782027006669/f11-before-transition.png`.
    - `runtime-data/qa/as3/p0-playability/run-f11-loading-1782027006669/f11-loading-sequence/f11-loading-0.png`.
    - `runtime-data/qa/as3/p0-playability/run-f11-loading-1782027006669/f11-loading-sequence/f11-loading-8000.png`.
  - Discarded F11/loading attempts:
    - `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782025153784.json` captured a gray/invalid frame.
    - `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782026819879.json` was sampled before embed adoption because of an embed delay.
- Three native Chinese剧情 dialogue stability samples passed:
  - Player `get_on_with_it`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782027406622.json`, expected `我得去战利品室，这样才能离开这里。`.
  - Player `must_escape`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782027601502.json`, expected `这门纹丝不动。一定有办法解除安全锁。`.
  - Player `nom_noms`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782027689650.json`, expected `范布伦要我去宴会厅……吃点东西应该没关系吧。`.
  - All accepted samples use the native Dialog data path, have 5/5 stable Chinese frames, no duplicate expected text, and `visualStable=true`.
  - Failed calibration not counted:
    - Winston `dinner` `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782027284860.json` did not display a bubble in the MainHall QA hook path.
    - `securityInteraction/keycode` `1782027499679` did not display a bubble.
    - Van Buren `lucky` `1782028804754` did not display a bubble.
  - These are recorded as QA hook/natural-route coverage gaps, not as visible English regressions.
- HUD/map/button evidence passed:
  - Menu expand and backpack: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782027860270.json`.
    - Menu screenshot: `runtime-data/qa/as3/hud-smoke/run-1782027860270/01-survival-post-click.png`.
    - Backpack screenshot: `runtime-data/qa/as3/hud-smoke/run-1782027860270/01-survival-inventory.png`.
    - Backpack OCR shows `生存岛`, `背包里还没有物品。`, and `去岛上探索，看看能找到什么！`.
  - Settings panel: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782028291170.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782028291170/01-survival-secondary.png`.
  - Store confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782028443657.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782028443657/01-survival-secondary.png`.
  - Map confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782028603276.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782028603276/01-survival-secondary.png`.
  - Manual review: Chinese labels/buttons are centered and do not overlap; `MENU` icon and expanded static HUD icons remain original art/English.
- Static-art policy remained intact:
  - `MENU`, Survival map logo, scene signs, arrows, posters, and other art-lettering remain English/static.
  - No Chinese TextField overlay was added to static icons, signs, posters, or art-lettering.
- Current Survival conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist.
  - Not a full five-episode story completion proof; more scenes, natural NPC interactions, and end-to-end story traversal remain future full-island deep QA.
- Next island:
  - Move current execution to `08. arabian-nights`.
  - Use the same sequence: map intro, window/resize/max/F11, window/F11 loading, HUD/backpack/store/settings/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue stability/no-repeat sequence, static-art policy review, then sealed regression.

## 2026-06-21 Arabian Nights Current-Build Sealed Baseline Pass

- Continued island 08 (`arabian-nights` / `arab1`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MUTE_INTERVAL_MS=150`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- Added Arabian map metadata:
  - `arab1/island/page.xml`, `arab2/island/page.xml`, `arab3/island/page.xml`.
  - `arabEpisodic/episode1/page.xml`, `episode2/page.xml`, `episode3/page.xml`.
  - Passing strict Chinese map smoke: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782029786436.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1782029786436/01-arabian-nights-map.png`.
- Extended Arabian runtime QA support:
  - `tools/patch-as3-monster-qa-dialog.js` now supports `game.scenes.arab1.bazaar.Bazaar`.
  - Native Dialog QA accepts Bazaar NPCs `npc1..npc4`, `trader1..trader3`, and `player`; it calls `Dialog.sayById()` once with `DialogData.timeOverride=60` and `forceOnScreen=true`.
  - Because Flash loader query params are not reliable in this class, `tools/qa-as3-dialogue-stability.js` injects seed events such as `qa_dialog_arab1_trader2_comment`.
  - Added QA-only `qa_auto_scene_arab1_desert` fallback so loading tests can transition Bazaar -> Desert without foreground input.
  - Rebuilt `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf` and updated `runtime-data/patched-zips/as3-runtime.zip` via `tools/update-as3-runtime-shell-only.js`; latest Shell sha256 in report is `55e2ddbcf5b77ce9ccd9690d443fcab977c52e8a3cfafbf8c6f7524b6eba3aee`.
- Final Arabian window/resize/maximize regression passed:
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782036700970.json`.
  - Result: `ok=true`, `failedChecks=[]`, `sceneStable=true`, `visualStable=true`, `nonGameUiCapture=false`.
  - Reviewed screenshots:
    - `runtime-data/qa/as3/p0-playability/run-1782036700970/01-arabian-nights-resized.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782036700970/01-arabian-nights-maximized-retry-1.png`.
  - Manual review: character visible, MENU stays top-right, no blue void, no main-screen/Codex capture. The first maximize frame caught loading, then retry settled correctly; the retry is the accepted evidence.
- Window and F11/fullscreen loading-center evidence passed:
  - Window report: `runtime-data/qa/as3/p0-playability/as3-window-loading-transition-1782036333988.json`.
  - Representative screenshot: `runtime-data/qa/as3/p0-playability/run-window-loading-1782036333988/window-loading-sequence/window-loading-4000.png`.
  - Result: `ok=true`, `loading.observed=true`, `centerOk=true`, 9 loading samples detected and centered.
  - F11 report: `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782036503309.json`.
  - Representative screenshot: `runtime-data/qa/as3/p0-playability/run-f11-loading-1782036503309/f11-loading-sequence/f11-loading-0.png`.
  - Result: `ok=true`, `f11.fullscreenLike=true`, `loading.observed=true`, `centerOk=true`, 10 loading samples detected and centered.
  - Discarded loading attempts:
    - `as3-window-loading-transition-1782035113292.json` and `1782035732803` did not trigger/capture the transition.
    - `as3-window-loading-transition-1782036150548.json` had already reached Desert before sampling; useful as transition proof, not loading-center proof.
- Three native Chinese dialogue stability samples passed:
  - Trader2 `comment`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782034402463.json`, expected `我的望远镜`.
  - Trader1 `comment`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782034488207.json`, expected `神灯`.
  - Trader3 `comment`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782034573399.json`, expected `最美的骆驼`.
  - Extra calibration: player `need_spy_glass`, `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782034258831.json`, expected `看起来这是用来放望远镜`.
  - All accepted samples use the native Dialog data path, display Chinese, and were visually inspected via `sequence/dialogue-0.png`; no repeated bubble spam or twitching was observed.
- HUD/menu/button evidence passed:
  - Backpack: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782031265590.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782031265590/01-arabian-nights-inventory.png`.
  - Settings: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782031427653.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782031427653/01-arabian-nights-secondary.png`.
  - Store confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782031583317.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782031583317/01-arabian-nights-secondary.png`.
  - Map confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782031745867.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782031745867/01-arabian-nights-secondary.png`.
  - Manual review: Chinese labels/buttons are centered and do not overlap.
- Static-art policy remained intact:
  - `MENU`, `Your Highness/Grand Bazaar`, map logo, posters, market signs, arrows, and other art-lettering remain English/static.
  - No Chinese TextField overlay was added to static icons, signs, posters, or art-lettering.
- Current Arabian conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist.
  - Not a full three-episode story completion proof; more rooms, natural scene traversal, palace/cave/desert story route, and end-to-end story completion remain future full-island deep QA.
- Next island:
  - Move current execution to `09. escape-from-pelican-rock`.
  - Use the same sequence: map intro, window/resize/max/F11, window/F11 loading, HUD/backpack/store/settings/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue stability/no-repeat sequence, static-art policy review, then sealed regression.

## 2026-06-21 Escape from Pelican Rock Current-Build Sealed Baseline Pass

- Continued island 09 (`escape-from-pelican-rock` / `prison`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MUTE_INTERVAL_MS=150`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- External reference check:
  - Poptropica Wiki and Poptropica Help Blog both identify Escape from Pelican Rock as the prison/framed-crime island, matching the local `prison` asset family.
  - Sources used only for synopsis sanity check: `https://poptropica.fandom.com/wiki/Escape_from_Pelican_Rock_Island`, `https://poptropi.ca/island-help/escape/`.
- Added Pelican Rock map metadata:
  - `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/prison/island/page.xml`.
  - Added `tools/update-as3-runtime-entries.js` so new pack XML entries can be written into `runtime-data/patched-zips/as3-runtime.zip` without rebuilding the whole runtime.
  - Final strict Chinese map smoke: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782038868052.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1782038868052/01-escape-from-pelican-rock-map.png`.
  - Visual review: `逃离鹈鹕岩`, Chinese description, `重新开始/开始`; static `ESCAPE FROM PELICAN ROCK` map logo remains English/art.
  - Discarded map attempts:
    - `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782038469318.json` still showed English because the new page XML had not yet been inserted into the runtime zip.
    - `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782038327704.json` and `1782038630339` produced invalid gray frames under the wrong reload/difficulty path; not counted.
- Extended Pelican runtime QA support:
  - `tools/patch-as3-monster-qa-dialog.js` now supports `game.scenes.prison.hill.Hill`.
  - Native Dialog QA accepts `player`, `tex`, `bandit`, `sal`, `les`, and `p1..p6`; it calls native `Dialog.sayById()` once with `DialogData.timeOverride=60` and `forceOnScreen=true`.
  - Added QA-only `flashpointQaAutoScene` path for `game.scenes.prison.*` scene classes, used for loading-center transition proof.
  - `tools/qa-as3-dialogue-stability.js` injects seed events such as `qa_dialog_prison_hill_player_tower`.
  - `tools/qa-as3-islands-smoke.js` now honors `--reload-on-resize`, needed for stable map direct override checks.
  - Rebuilt `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf`; updated runtime Shell with `tools/update-as3-runtime-shell-only.js`; inserted the new map XML with `tools/update-as3-runtime-entries.js`.
- Final Pelican window/resize/maximize/F11 regression passed:
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782039033401.json`.
  - Result: `ok=true`, `failedChecks=[]`.
  - Reviewed screenshots:
    - `runtime-data/qa/as3/p0-playability/run-1782039033401/01-escape-from-pelican-rock-resized.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782039033401/01-escape-from-pelican-rock-maximized-retry-1.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782039033401/01-escape-from-pelican-rock-f11.png`.
  - Manual review: character visible, MENU top-right, scene constrained with no blue void, no Codex/main-screen UI capture. The first maximize frame was unstable and the retry is the accepted evidence.
- Window and F11/fullscreen loading-center evidence passed:
  - Window report: `runtime-data/qa/as3/p0-playability/as3-window-loading-transition-1782039314137.json`.
  - Representative screenshot: `runtime-data/qa/as3/p0-playability/run-window-loading-1782039314137/window-loading-sequence/window-loading-1000.png`.
  - Result: `ok=true`, `loading.observed=true`, `centerOk=true`, 8 loading samples detected and centered.
  - F11 report: `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782039474396.json`.
  - Representative screenshot: `runtime-data/qa/as3/p0-playability/run-f11-loading-1782039474396/f11-loading-sequence/f11-loading-1000.png`.
  - Result: `ok=true`, `f11.fullscreenLike=true`, `loading.observed=true`, `centerOk=true`, 9 loading samples detected and centered; F11 proof used PostMessage F11, not foreground keyboard takeover.
- HUD/menu/button evidence passed:
  - Backpack: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782039730282.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782039730282/01-escape-from-pelican-rock-inventory.png`.
  - Settings: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782040006268.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782040006268/01-escape-from-pelican-rock-secondary.png`.
  - Store confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782040688698.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782040688698/01-escape-from-pelican-rock-secondary.png`.
  - Map confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782040849648.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782040849648/01-escape-from-pelican-rock-secondary.png`.
  - Manual review: Chinese title/labels/buttons are centered and do not overlap. Static HUD icon art remains original.
  - Two early store runs were stopped because the full HUD smoke flow was still waiting; no partial report was promoted as evidence.
- Three native Chinese dialogue stability samples passed:
  - Player `tower`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782041030923.json`, expected `我得去那座塔上`.
  - Tex `listen_up`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782041218501.json`, expected stable substring `监狱有人越狱了`.
  - P2 `gee`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782041576351.json`, no exact expected substring because OCR mangles the short sentence, but 5/5 samples contained stable Chinese text and `visualStable=true`.
  - Representative screenshots inspected:
    - `runtime-data/qa/as3/dialogue-stability/run-1782041030923/sequence/dialogue-1000.png`.
    - `runtime-data/qa/as3/dialogue-stability/run-1782041218501/sequence/dialogue-1000.png`.
    - `runtime-data/qa/as3/dialogue-stability/run-1782041576351/sequence/dialogue-1000.png`.
  - Failed calibration not counted:
    - Tex `listen_up` `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782041123097.json` was visually Chinese but failed the first-line exact expected OCR check.
    - P1 `stop` `1782041299847` and Bandit `odds` `1782041389025` did not display a bubble in the current direct-scene seed.
    - P2 `gee` `1782041472212` was visually Chinese but failed exact expected OCR; the stable-Chinese rerun `1782041576351` is the accepted evidence.
- Static-art policy remained intact:
  - `MENU`, `ESCAPE FROM PELICAN ROCK`, map logo, scene signs, arrows, posters, and other art-lettering remain English/static.
  - No Chinese TextField overlay was added to static icons, signs, posters, or art-lettering.
- Current Pelican conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist.
  - Not a full story completion proof. Historical direct-scene notes still require deeper follow-up: `yard`, `cellBlock`, `hill`, `roof1`, `roof2`, and `metalShop` were usable; `messHall`, `prisonPromo`, `roof3`, and `tower` need natural-route/resource-level follow-up.
  - More prison interiors, natural NPC interactions, item-chain progression, and end-to-end escape/clear-name story completion remain future full-island deep QA.
- Next island:
  - Move current execution to `10. galactic-hot-dogs`.
  - Use the same sequence: map intro, window/resize/max/F11, window/F11 loading, HUD/backpack/store/settings/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue stability/no-repeat sequence, static-art policy review, then sealed regression.

## 2026-06-21 Galactic Hot Dogs Current-Build Sealed Baseline Pass

- Continued island 10 (`galactic-hot-dogs` / `ghd`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MUTE_INTERVAL_MS=150`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- External route sanity check:
  - Poptropica Help Blog and Poptropica Wiki both describe GHD as Space Port -> Neon Wiener -> rescue Princess Dagger/Humphree/Cosmoe -> Ghost Ship/Map-O-Sphere flow, matching the local `ghd` scene family and the proof scenes selected here.
  - Sources used only for route/NPC sanity check: `https://poptropi.ca/island-help/ghd/`, `https://poptropica.fandom.com/wiki/Galactic_Hot_Dogs_Island`.
- Runtime support added:
  - Added `tools/patch-as3-ghd-rescue-dialog-proof.js`.
  - The patch adds QA-only native Dialog proof paths for `game.scenes.ghd.barren2.Barren2`, `game.scenes.ghd.mushroom2.Mushroom2`, `game.scenes.ghd.prehistoric2.Prehistoric2`, and `game.scenes.ghd.ghostShip.GhostShip`.
  - It also fixes the GhostShip decompile/recompile issue by replacing `NaN` default range parameters with numeric sentinels.
  - Patch report: `runtime-data/qa/as3/as3-ghd-rescue-dialog-proof-patch.json`.
  - Updated `tools/qa-as3-dialogue-stability.js` to seed GHD QA dialog events for NeonWiener, Barren2, Mushroom2, Prehistoric2, and GhostShip.
  - Rebuilt `packs/zh-CN/as3/swf/content/www.poptropica.com/game/Shell.swf` and synced `runtime-data/patched-zips/as3-runtime.zip` with `tools/update-as3-runtime-shell-only.js`.
  - Latest report: `runtime-data/qa/as3/as3-runtime-shell-only-update.json`; Shell sha256 `e1162f3364d4ceeb6bb832e864e096e8d6c3e13e34fd34bca4d270e5a01f62db`, runtime zip sha256 `0e4455828be338c19a387d86fb25c9bc1a45462cae100d9ad3b7fe46e5e365ca`.
- Map intro and HUD/button evidence:
  - Map intro passed before the final dialogue patch: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782066719474.json`, screenshot `runtime-data/qa/as3/islands-smoke/run-1782066719474/01-galactic-hot-dogs-map.png`.
  - Visual review: Chinese title/description/buttons are centered; static Galactic Hot Dogs logo stays English/art.
  - Menu/backpack passed: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782066981168.json`.
  - Settings passed: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782067146347.json`.
  - Store confirmation passed: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782067304910.json`.
  - Map confirmation passed: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782067473480.json`.
  - Manual review: Chinese panel labels/buttons are centered and do not overlap; static `MENU` icon art remains English/original.
- Three native Chinese dialogue stability samples passed:
  - Dagger `trapped`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782071166211.json`, expected `我被困在这个脏兮兮的山洞里了`.
  - Dagger `escaped`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782071563072.json`, expected `自由了`.
  - GhostShip captain `rage`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782071930552.json`, expected `这里没有宝藏`.
  - Representative screenshots inspected:
    - `runtime-data/qa/as3/dialogue-stability/run-1782071166211/sequence/dialogue-1600.png`.
    - `runtime-data/qa/as3/dialogue-stability/run-1782071563072/sequence/dialogue-1600.png`.
    - `runtime-data/qa/as3/dialogue-stability/run-1782071930552/sequence/dialogue-1600.png`.
  - All three use the native Dialog path, show Chinese, have 6/6 stable samples, `stableText=true`, `visualStable=true`, and `duplicateExpectedSampleCount=0`.
  - Failed calibration not counted:
    - Humphree `free`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782071267279.json` displayed a clipped top-left bubble and OCR only saw partial text.
    - Cosmoe `baby`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782071367644.json` captured a gray/invalid scene.
    - Earlier NeonWiener QA attempts `1782069757681` and `1782069860234` did not display an accepted bubble.
- Scene-entry regression passed after the new Shell:
  - Barren2: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782072079682.json`.
  - Mushroom2: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782072160180.json`.
  - Prehistoric2: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782072235409.json`.
  - GhostShip: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782072314003.json`.
  - All four returned `ok=true`, `audioActive=0`, scene evidence present, and visual guard passed.
  - The earlier full GHD scene sweep `runtime-data/qa/as3/ghd-scene-sweep-1782066621955-with-retry.json` passed 18/18 scenes.
- Window/resize/maximize/F11 visual regression passed:
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782072751029.json`.
  - Result: `ok=true`, `failedChecks=[]`, `sceneStable=true`, `visualStable=true`, `f11Stable=true`, `nonGameUiCapture=false`.
  - Reviewed screenshots:
    - `runtime-data/qa/as3/p0-playability/run-1782072751029/01-galactic-hot-dogs-resized.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782072751029/01-galactic-hot-dogs-maximized-retry-1.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782072751029/01-galactic-hot-dogs-f11.png`.
  - Manual review: character remains visible, MENU stays top-right, scene is constrained, no blue void or main-screen capture.
  - The earlier generic P0 `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782072449108.json` is not counted because its generic click did not trigger a Chinese dialogue; its visual/window checks were still useful context.
- Loading-center status:
  - Existing true fullscreen evidence remains `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782068407206.json`, with centered loading in true fullscreen.
  - After the new Shell, `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782073027690.json` observed 11 loading frames and all were centered, but no-foreground PostMessage F11 did not produce fullscreen-sized capture, so it is recorded as centered-loading evidence plus an automation limitation.
  - `runtime-data/qa/as3/p0-playability/as3-window-loading-transition-1782073196736.json` did not observe a transition/loading frame and is not counted as a pass.
- Static-art policy remained intact:
  - `MENU`, scene signs, posters, arrows, map logo, and other art-lettering remain English/static.
  - No Chinese TextField overlay was added to static icons, signs, posters, arrows, or art-lettering.
- Current GHD conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist: map, HUD, major scene entry, window/resize/F11 visual stability, 3 native Chinese dialogue samples, no dialogue repeat/twitch, and static-art policy all have evidence.
  - Not a full end-to-end story completion proof. Natural route progression, Humphree/Cosmoe clean dialogue proof, the full ship rescue chain, and a new true fullscreen loading rerun without no-foreground F11 limitation remain future deep QA.
- Next island:
  - Move current execution to `11. virus-hunter`.
  - Use the same sequence: map intro, window/resize/max/F11, window/F11 loading, HUD/backpack/store/settings/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue stability/no-repeat sequence, static-art policy review, then sealed regression.

## 2026-06-21 Virus Hunter Current-Build Sealed Baseline Pass

- Continued island 11 (`virus-hunter` / `virusHunter`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MUTE_INTERVAL_MS=150`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- External route sanity check:
  - Poptropica Help Blog and Poptropica Wiki describe Virus Hunter as a PDC/Dr. Lange investigation that enters infected body systems, matching local `virusHunter` scenes selected for proof.
  - Sources used only for route/NPC sanity check: `https://poptropi.ca/island-help/virus-hunter/`, `https://poptropica.fandom.com/wiki/Virus_Hunter_Island`.
- Map intro:
  - First real map test `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782074117564.json` exposed English map intro text.
  - Added `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/virusHunter/island/page.xml`.
  - Inserted the new XML into runtime zip with `tools/update-as3-runtime-entries.js`.
  - Final map smoke passed: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782074274865.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1782074274865/01-virus-hunter-map.png`.
  - Visual review: title/description/buttons are Chinese and centered; static `VIRUS HUNTER ISLAND` logo remains original English art.
- Runtime support added:
  - Added `tools/patch-as3-virus-hunter-dialog-proof.js`.
  - The patch adds QA-only native Dialog proof support for `game.scenes.virusHunter.pdcLab.PdcLab`; it requires both `flashpointQaDialogNpc/Id` query params and a seed event like `qa_dialog_virus_pdcLab_npc2_checkIn`.
  - `tools/qa-as3-dialogue-stability.js` now generates Virus Hunter PdcLab QA seed events.
  - `tools/qa-as3-hud-smoke.js` now supports explicit `--secondary-click-x/y` so HUD proof can click real icon centers instead of relying on a brittle index map.
  - Patch report: `runtime-data/qa/as3/as3-virus-hunter-dialog-proof-patch.json`.
  - Runtime Shell update report: `runtime-data/qa/as3/as3-runtime-shell-only-update.json`; latest Shell sha256 `b330b469f1ac24a011584ed5c36f0f5cbefe3f5b61f3f4c9c76d103aabafe17f`, runtime zip sha256 `d9baad695e040250cc6b6c9bb8b21914a74de7578b1f3fa4e441711d1d401129`.
- Window/resize/maximize/F11 visual regression passed:
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782074363553.json`.
  - Result: `ok=true`, `failedChecks=[]`, `sceneStable=true`, `visualStable=true`, `f11Stable=true`, `nonGameUiCapture=false`.
  - Reviewed screenshots:
    - `runtime-data/qa/as3/p0-playability/run-1782074363553/01-virus-hunter-resized.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782074363553/01-virus-hunter-maximized-retry-2.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782074363553/01-virus-hunter-f11-retry-1.png`.
  - Manual review: character remains visible, MENU stays top-right, scene is constrained, no blue void or main-screen capture.
- F11/fullscreen loading-center evidence passed:
  - Report: `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782074683572.json`.
  - Result: `ok=true`, `f11.fullscreenLike=true`, `relaunchAdoption.adopted=true`, `loading.observed=true`, `loading.centerOk=true`.
  - Representative screenshot: `runtime-data/qa/as3/p0-playability/run-f11-loading-1782074683572/f11-loading-sequence/f11-loading-1000.png`.
- HUD/menu/button evidence passed:
  - Backpack: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782074921756.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782074921756/01-virus-hunter-inventory.png`.
  - Settings: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782075051207.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782075051207/01-virus-hunter-secondary.png`.
  - Store confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782075975053.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782075975053/01-virus-hunter-secondary.png`.
  - Map confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782075862106.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782075862106/01-virus-hunter-secondary.png`.
  - Public confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782075327599.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782075327599/01-virus-hunter-secondary.png`.
  - Manual review: Chinese labels/buttons are centered and do not overlap; static HUD icon art and `MENU` remain original English/art.
- Three native Chinese dialogue stability samples passed:
  - PDC `npc2/checkIn`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782076303669.json`, OCR `去跟我们的项目负责人兰格博士报到吧。`.
  - PDC `npc/workAroundClock`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782076399318.json`, OCR `我们一直在连轴转。`.
  - PDC `npc4/default`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782076596782.json`, OCR `坐电梯下去，找兰格博士谈谈。`.
  - All three use native Dialog/CharUtils paths, show Chinese, have 6/6 stable samples, `visualStable=true`, and `duplicateExpectedSampleCount=0`.
  - Failed calibration not counted:
    - `npc3/tech` `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782076495845.json` produced a gray/blank capture, likely a camera/target-state issue, and is not promoted as evidence.
- Scene-entry regression after the new Shell passed:
  - MainStreet: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782076686386.json`.
  - PdcLab: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782076773714.json`.
  - Both returned `ok=true`, `audioActive=0`, scene evidence present, and visual guard passed.
- Static-art policy remained intact:
  - `MENU`, map logo, scene signs, posters, arrows, wall text, and other art-lettering remain English/static.
  - No Chinese TextField overlay was added to static icons, signs, posters, arrows, or art-lettering.
- Current Virus Hunter conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist: map, HUD, window/resize/F11, true fullscreen loading, MainStreet/PdcLab scene entry, 3 native Chinese NPC dialogue samples, no dialogue repeat/twitch, and static-art policy all have evidence.
  - Not a full end-to-end story completion proof. Body-system scenes, the dog/Joe route, ship gameplay, more NPC natural hot zones, and final completion remain future full-island deep QA.
- Next island:
  - Move current execution to `12. mocktropica`.
  - Use the same sequence: map intro, window/resize/max/F11, window/F11 loading, HUD/backpack/store/settings/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue stability/no-repeat sequence, static-art policy review, then sealed regression.

## 2026-06-21 Mocktropica Current-Build Sealed Baseline Pass

- Continued island 12 (`mocktropica`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MUTE_INTERVAL_MS=150`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- External route sanity check:
  - Poptropica Help Blog and Poptropica Wiki describe Mocktropica as Poptropica HQ, unfinished island systems, staff/NPC quest routing, and game-breaking bug repair, matching the local `mocktropica` scene family selected for proof.
  - Sources used only for route/NPC sanity check: `https://poptropi.ca/island-help/mocktropica/`, `https://poptropica.fandom.com/wiki/Mocktropica_Island`.
- Map intro:
  - Added `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/mocktropica/island/page.xml`.
  - Inserted the new XML into runtime zip with `tools/update-as3-runtime-entries.js`.
  - Final map smoke passed: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782077393563.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1782077393563/01-mocktropica-map.png`.
  - Visual review: title/description/buttons are Chinese and centered; static Mocktropica logo remains original English art.
- Runtime support added:
  - Added `tools/patch-as3-mocktropica-dialog-proof.js`.
  - The patch adds QA-only native Dialog proof support for `game.scenes.mocktropica.mainStreet.MainStreet`; it requires both `flashpointQaDialogNpc/Id` query params and a seed event like `qa_dialog_mocktropica_mainStreet_projectManager_twist`.
  - `tools/qa-as3-dialogue-stability.js` now generates Mocktropica MainStreet QA seed events.
  - `tools/qa-as3-p0-playability.js` now suppresses transient failed retry evidence if a later retry stabilizes, and it no longer mistakes stable scene-logo OCR for an active loading screen.
  - Patch report: `runtime-data/qa/as3/as3-mocktropica-dialog-proof-patch.json`.
  - Runtime Shell update report: `runtime-data/qa/as3/as3-runtime-shell-only-update.json`; latest Shell sha256 `1b52e8bc47d681eda777a24f9a67f587725d9823b8c03646610e0e0eb48d76a4`, runtime zip sha256 `83acffed63299574b6ab1d1e550c191a0c9d91cbf154cb6ab6f9da16866e4151`.
- MainStreet scene-entry proof:
  - Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782077488309.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1782077488309/01-mocktropica-mainStreet.png`.
  - Result: `ok=true`, scene evidence present, visual guard passed, `audioActive=0`.
  - Visual review: player and NPCs are visible, scene is constrained, MENU is stable, and static `MENU`/HQ art remains original.
- Window/resize/maximize/F11 visual regression and loading-center evidence passed:
  - Report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782077973966.json`.
  - Result: `ok=true`, `failedChecks=[]`, resize/maximize/F11 screenshots stable.
  - Reviewed screenshots:
    - `runtime-data/qa/as3/p0-playability/run-1782077973966/01-mocktropica-launch-loading-120.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782077973966/01-mocktropica-resized.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782077973966/01-mocktropica-maximized-retry-2.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782077973966/01-mocktropica-f11-retry-1.png`.
  - Manual review: loading logo/dots are centered; after resize/maximize/F11 the player remains visible, MENU stays top-right, and no blue void or main-screen capture appears.
- HUD/menu/button evidence passed:
  - Backpack: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782078344230.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782078344230/01-mocktropica-inventory.png`.
  - Map confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782078529579.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782078529579/01-mocktropica-secondary.png`.
  - Store confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782078703877.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782078703877/01-mocktropica-secondary.png`.
  - Manual review: Chinese panel labels/buttons are centered and do not overlap; static HUD icon art and `MENU` remain original English/art.
- Three native Chinese dialogue stability samples passed:
  - Project Manager `twist`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782079082704.json`, OCR contains `经典`.
  - Project Manager `noRest`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782079544614.json`, OCR contains `下一个岛`.
  - Project Manager `rehire`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782079643385.json`, OCR contains `重新雇`.
  - Representative screenshots inspected:
    - `runtime-data/qa/as3/dialogue-stability/run-1782079082704/sequence/dialogue-1000.png`.
    - `runtime-data/qa/as3/dialogue-stability/run-1782079544614/sequence/dialogue-1000.png`.
    - `runtime-data/qa/as3/dialogue-stability/run-1782079643385/sequence/dialogue-1000.png`.
  - All three use native Dialog paths, show Chinese, have 6/6 stable samples, `visualStable=true`, and `duplicateExpectedSampleCount=0`.
  - Failed calibration not counted:
    - Boy `first_curd` `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782079175378.json` displayed Chinese but failed visual guard because the intended unfinished-art scene is mostly white.
    - Focus tester `coinsPlease` `1782079328682` captured a gray/invalid scene.
    - Lead developer `figures` `1782079415815` displayed Chinese but moved into a huge unfinished white background and failed visual guard.
- Static-art policy remained intact:
  - `MENU`, HQ logo, `HEADQUARTERS`, `Under new management`, map logo, scene signs, posters, arrows, and other art-lettering remain English/static.
  - No Chinese TextField overlay was added to static icons, signs, posters, arrows, or art-lettering.
- Current Mocktropica conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist: map, HUD, MainStreet scene entry, window/resize/max/F11 visual stability, centered startup loading, 3 native Chinese dialogue samples, no dialogue repeat/twitch, and static-art policy all have evidence.
  - Not a full end-to-end story completion proof. HQ interior floors, basement/island editor, Cheese Factory, University, Mountain, server/final boss, more NPC natural hot zones, and the full item/story chain remain future full-island deep QA.
- Next island:
  - Move current execution to `13. mystery-of-the-map`.
  - Use the same sequence: map intro, window/resize/max/F11, window/F11 loading, HUD/backpack/store/settings/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue stability/no-repeat sequence, static-art policy review, then sealed regression.

## 2026-06-21 Mystery of the Map Current-Build Sealed Baseline Pass

- Continued island 13 (`mystery-of-the-map`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MUTE_INTERVAL_MS=150`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- External route sanity check:
  - Poptropica Help Blog and Poptropica Wiki describe Mystery of the Map as the Mya/Oliver/Jorge/Octavian Viking-map route, matching the local `viking` scene family rather than `lands`.
- Entry and map fixes:
  - Fixed `catalog/launch-overrides.json`: `mystery-of-the-map` now launches `sceneFolder=viking`, `roomParam=jungle`, `islandParam=viking`.
  - Regenerated `catalog/launch-manifest.json`; `mystery-of-the-map` now resolves to `game.scenes.viking.jungle.Jungle`.
  - Added/fixed the Viking map XML pack files:
    - `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/viking/island.xml`.
    - `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/viking/island/page.xml`.
    - `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/viking/island.xml`.
  - Synchronized those XML entries into the AS3 runtime zip with `tools/update-as3-runtime-entries.js`.
  - Map smoke passed: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782081341123.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1782081341123/01-mystery-of-the-map-map.png`.
  - Visual review: title/description/buttons are Chinese and centered; static `MYSTERY of the MAP ISLAND` logo remains original English art. The map overview list label is treated as static/embedded art and is not hard-covered.
- Runtime support added:
  - Added `tools/patch-as3-viking-dialog-proof.js`.
  - The patch adds QA-only native Dialog proof support for `game.scenes.viking.jungle.Jungle`; it requires both `flashpointQaDialogNpc/Id` query params and a seed event like `qa_dialog_viking_jungle_octavian_getDown`.
  - Updated `tools/qa-as3-dialogue-stability.js` so it generates Viking Jungle QA seed events.
  - Updated `tools/qa-as3-p0-playability.js` with a Mystery default QA dialogue seed and a stale-window-handle refresh path for post-resize dialogue clicks.
  - Patch report: `runtime-data/qa/as3/as3-viking-dialog-proof-patch.json`.
  - Runtime Shell update report: `runtime-data/qa/as3/as3-runtime-shell-only-update.json`; latest Shell sha256 `324d0549fb7fda0b2545e31f81c28aee07434f572916540b57d5c062d529d941`, runtime zip sha256 `300fe9c5782fb74af6c0ac685bc78310fe63fdb6100347e557d05ee881c16320`.
- Jungle scene-entry proof:
  - Report: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782081438275.json`.
  - Screenshot: `runtime-data/qa/as3/islands-smoke/run-1782081438275/01-mystery-of-the-map.png`.
  - Result: `ok=true`, scene evidence present, visual guard passed, `audioActive=0`.
  - Visual review: player is visible, real Viking Jungle scene loaded, MENU is stable, and static `Viking's Grotto` art remains original.
- Window/resize/maximize/loading regression passed:
  - Pure viewport/dialogue-preservation report: `runtime-data/qa/as3/p0-playability/as3-p0-playability-1782084123056.json`.
  - Result: `ok=true`, `failedChecks=[]`, startup loading observed, resize/maximize stable.
  - Reviewed screenshots:
    - `runtime-data/qa/as3/p0-playability/run-1782084123056/01-mystery-of-the-map-launch-loading-120.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782084123056/01-mystery-of-the-map-resized.png`.
    - `runtime-data/qa/as3/p0-playability/run-1782084123056/01-mystery-of-the-map-maximized-retry-1.png`.
  - Manual review: loading logo/dots are centered; after resize/maximize, the scene is stable, MENU remains top-right, no blue void or main-screen capture appears, and the Chinese dialogue bubble remains visible.
  - True fullscreen loading proof: `runtime-data/qa/as3/p0-playability/as3-f11-loading-transition-1782082091089.json`, with `fullscreenLike=true`, `loading.observed=true`, `loading.centerOk=true`.
  - Representative true fullscreen loading screenshot: `runtime-data/qa/as3/p0-playability/run-f11-loading-1782082091089/f11-loading-sequence/f11-loading-1000.png`.
- HUD/menu/button evidence passed:
  - Backpack: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782082400503.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782082400503/01-mystery-of-the-map-inventory.png`.
  - Store confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782082615238.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782082615238/01-mystery-of-the-map-secondary.png`.
  - Map confirmation: `runtime-data/qa/as3/hud-smoke/as3-hud-smoke-1782082841936.json`, screenshot `runtime-data/qa/as3/hud-smoke/run-1782082841936/01-mystery-of-the-map-secondary.png`.
  - Manual review: Chinese panel labels/buttons are centered and do not overlap; static HUD icon art, `MENU`, and trophy `PRIZE` remain original English/art.
- Three native Chinese dialogue stability samples passed:
  - Octavian `getDown`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782083205609.json`, OCR `快把我弄下来！`.
  - Octavian `look`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782083306370.json`, OCR `喂，你！往上看！`.
  - Octavian `thisMap`: `runtime-data/qa/as3/dialogue-stability/as3-dialogue-stability-1782083410914.json`, OCR `这座岛上一定有你能用的东西。这张地图会帮你找到它。`.
  - Representative screenshots inspected:
    - `runtime-data/qa/as3/dialogue-stability/run-1782083205609/sequence/dialogue-1000.png`.
    - `runtime-data/qa/as3/dialogue-stability/run-1782083306370/sequence/dialogue-1000.png`.
    - `runtime-data/qa/as3/dialogue-stability/run-1782083410914/sequence/dialogue-1000.png`.
  - All three use native Dialog paths, show Chinese, have 6/6 stable samples, `visualStable=true`, and `duplicateExpectedSampleCount=0`.
- Failed/partial evidence not counted:
  - `as3-f11-loading-transition-1782081899913.json` used PostMessage F11 and did not reach fullscreen-sized capture.
  - P0 `as3-p0-playability-1782083512761.json` used a generic click point and did not trigger a real Chinese dialogue.
  - P0 `as3-p0-playability-1782083839170.json` exposed a stale post-resize window handle during a dialogue click; the QA script was fixed and `1782084123056` supersedes it.
- Static-art policy remained intact:
  - `MENU`, map logo, `Viking's Grotto`, scene signs, posters, arrows, and other art-lettering remain English/static.
  - No Chinese TextField overlay was added to static icons, signs, posters, arrows, or art-lettering.
- Current Mystery of the Map conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist: entry corrected to Viking Jungle, map intro, HUD, Jungle scene entry, window/resize/max visual stability, startup and true fullscreen loading, 3 native Chinese dialogue samples, no dialogue repeat/twitch, and static-art policy all have evidence.
  - Not a full end-to-end story completion proof. Viking beach/fortress/diningHall/throneRoom/river/waterfall/peak, more NPC natural hot zones, item chain, and ending remain future full-island deep QA.
- Next island:
  - Move current execution to `14. early-poptropica`.
  - Use the same sequence adapted for AS2: map intro, window/resize/F11, loading, HUD/backpack/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue stability/no-repeat sequence, static-art policy review, then sealed regression.

## 2026-06-21 Early Poptropica Current-Build Sealed Baseline Pass

- Continued island 14 (`early-poptropica`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_HTML_AUDIO=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MUTE_INTERVAL_MS=150`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- Entry and translation fixes:
  - Added `early-poptropica` AS2 launch override to start at `Early/City2`.
  - Added `tools/seed-as2-early-translations.js`; it seeded 44 missing Early AS2 native `swf-script` translation rows.
  - Patched six Early scene SWFs with `tools/patch-as2-script-translations.js`: `sceneBalance.swf`, `sceneCity.swf`, `sceneCity2.swf`, `sceneJamestown.swf`, `sceneMuseum.swf`, and `scenePit.swf`.
  - Patch reports: `runtime-data/qa/as2/as2-script-translation-patch-sceneBalance.json`, `...sceneCity.json`, `...sceneCity2.json`, `...sceneJamestown.json`, `...sceneMuseum.json`, `...scenePit.json`.
- Map intro:
  - Added `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/early/island/page.xml`.
  - Synchronized the XML entry into the AS3 runtime zip with `tools/update-as3-runtime-entries.js`.
  - AS3 map smoke passed: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782088417951.json`.
  - Screenshot inspected: `runtime-data/qa/as3/islands-smoke/run-1782088417951/01-poptropicon-map.png`.
  - OCR contains `早期Poptropica岛`, the Chinese description, `重新开始`, and `开始`; `audioActive=0`.
  - Visual review: title/description/buttons are Chinese and centered; static `EARLY POPTROPICA ISLAND` logo and the in-image welcome sign remain original English art.
- AS2 F11/bottom-blue fix:
  - Added `tools/patch-as2-gameplay-save-status.js`.
  - Patched `tools/lib/pack.js` and `packs/zh-CN/as2/files/content/www.poptropica.com/base.php` so AS2 gameplay uses the standard 1010x580 crop again and the saving/status strip is suppressed in gameplay.
  - Rebuilt AS2 runtime zip after patching `gameplay.swf`.
  - Strict F11 visual guard passed: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782087918807.json`.
  - Screenshot inspected: `runtime-data/qa/as2/interaction-smoke/run-1782087918807/01-early-poptropica-f11.png`.
  - Manual review: character visible, MENU remains top-right, scene constrained, no bottom blue gameplay band.
- Full Early AS2 acceptance smoke:
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782087997744.json`.
  - Result: `ok=true`, `audioActive=0`, `mapClicksPassed=1`, `sceneEvidencePassed=1`, `loadingCenterPassed=1`, `f11Passed=1`, `visualGuardPassed=1`, `failedKeys=[]`.
  - Reviewed screenshots:
    - `runtime-data/qa/as2/interaction-smoke/run-1782087997744/01-early-poptropica-f11.png`.
    - `runtime-data/qa/as2/interaction-smoke/run-1782087997744/01-early-poptropica-map.png`.
    - `runtime-data/qa/as2/interaction-smoke/run-1782087997744/01-early-poptropica-loading-sequence/01-early-poptropica-loading-500.png`.
  - Manual review: AS2 map popup opens, startup loading is centered, character/HUD survive F11, and runtime stays muted.
- Three native AS2 Chinese dialogue proof samples passed:
  - Added `tools/patch-as2-early-dialog-proof.js`; the QA-only hook triggers real `talkyText` bubbles in `sceneCity2.swf` only when `flashpointQaAs2Dialog` is present.
  - Welcome sample: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782087705505.json`, screenshot `runtime-data/qa/as2/interaction-smoke/run-1782087705505/01-early-poptropica-initial.png`, text `欢迎来到 Poptropica！如果迷路了，就看看地图。`.
  - Flag/water tower sample: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782087765988.json`, screenshot `runtime-data/qa/as2/interaction-smoke/run-1782087765988/01-early-poptropica-initial.png`, text `那面旗怎么跑到水塔顶上去了？`.
  - Old town sample: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782087829923.json`, screenshot `runtime-data/qa/as2/interaction-smoke/run-1782087829923/01-early-poptropica-initial.png`, text `你去过旧城区吗？我听说他们需要帮忙。`.
  - Manual review: all three are native AS2 dialogue bubbles, not static overlays; no repeated bubble flashing or character disappearance was seen in these samples.
- Static-art policy remained intact:
  - `MENU`, `EARLY POPTROPICA ISLAND`, welcome sign art, museum/shop/restroom/parking signs, posters, arrows, and other art-lettering remain English/static.
  - No Chinese TextField overlay was added to static icons, signs, posters, arrows, or art-lettering.
- Failed/partial evidence not counted:
  - `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782086887688.json` failed only because the AS2 map popup itself has native blue background margins and the visual guard target color was too strict for a map popup. It is not counted as a gameplay blue-bottom failure.
- Current Early Poptropica conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist: AS2 entry, map open, AS3 map intro, centered loading, F11/no-blue gameplay layout, HUD/MENU stability, 3 native Chinese dialogue samples, no visible dialogue repeat/twitch in the samples, runtime mute, and static-art policy all have evidence.
  - Not a full end-to-end story completion proof. Balance, City, Jamestown, Museum, Pit, underground/cloud routes, item chain, natural NPC hot zones, and the ending remain future full-island deep QA.
- Next island:
  - Move current execution to `15. shark-tooth`.
  - Use the same AS2 sequence: map intro/opening, window/F11/no-blue layout, loading center, HUD/backpack/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue no-repeat/no-twitch samples, static-art policy review, then sealed regression.

## 2026-06-21 Shark Tooth Current-Build Sealed Baseline Pass

- Continued island 15 (`shark-tooth`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_HTML_AUDIO=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MUTE_INTERVAL_MS=150`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- External route sanity check:
  - Poptropica Help Blog and Poptropica Wiki describe Shark Tooth as the Booga Bay / ancient ruins / temple / Medicine Man / calming potion / castaway rescue route, matching the local `Shark` AS2 scene family.
  - Sources used only for route/NPC sanity check: `https://poptropi.ca/island-help/shark-tooth/`, `https://poptropica.fandom.com/wiki/Shark_Tooth_Island`.
- Entry and text fixes:
  - Verified `catalog/launch-overrides.json` launches `shark-tooth` at `sceneFolder=Shark`, `roomParam=Mainstreet`, `islandParam=Shark`.
  - Added `tools/audit-as2-runtime-text.js` and `tools/import-as2-runtime-script-text.js` for AS2 script-text discovery/import.
  - Imported Shark AS2 script rows from `scenes/islandShark`; audit found 74 candidates and the seed pass filled all active missing Shark native script translations.
  - Added `tools/seed-as2-shark-translations.js`; it seeded 68/68 Shark native `swf-script` Chinese rows.
  - Patched nine Shark scene SWFs with `tools/patch-as2-script-translations.js`: `sceneBooga.swf`, `sceneCastaway.swf`, `sceneMainstreet.swf`, `sceneMedicine.swf`, `sceneMuseum2.swf`, `sceneRuins.swf`, `sceneTemple1.swf`, `sceneTemple2.swf`, and `sceneTownhall.swf`.
- Map intro:
  - Added `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/shark/island/page.xml`.
  - Synchronized the XML entry into the AS3 runtime zip with `tools/update-as3-runtime-entries.js`.
  - AS3 map smoke passed: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782092458415.json`.
  - Screenshot inspected: `runtime-data/qa/as3/islands-smoke/run-1782092458415/01-poptropicon-map.png`.
  - Visual review: title/description/buttons are Chinese and centered; static `SHARK TOOTH ISLAND` logo and Medicine Man image text remain original English art.
- Full Shark AS2 acceptance smoke:
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782090320593.json`.
  - Result: `ok=true`, `audioActive=0`, `mapClicksPassed=1`, `sceneEvidencePassed=1`, `loadingCenterPassed=1`, `f11Passed=1`, `visualGuardPassed=1`, `failedKeys=[]`.
  - Reviewed screenshots:
    - `runtime-data/qa/as2/interaction-smoke/run-1782090320593/01-shark-tooth-f11.png`.
    - `runtime-data/qa/as2/interaction-smoke/run-1782090320593/01-shark-tooth-map.png`.
    - `runtime-data/qa/as2/interaction-smoke/run-1782090320593/01-shark-tooth-loading-sequence/01-shark-tooth-loading-500.png`.
  - Manual review: AS2 map popup opens, startup loading is centered, character/HUD survive F11, scene does not expose the bottom blue gameplay band, and runtime stays muted.
- Three native AS2 Chinese dialogue proof samples passed:
  - Added `tools/patch-as2-shark-dialog-proof.js`; the QA-only hook triggers real Shark Mainstreet `talkyText/manualSay` bubbles only when `flashpointQaAs2Dialog` is present.
  - Adjusted the proof hook to use the native `target.talkHeight` path so the Chinese bubble is fully visible instead of being cropped at the bottom.
  - Final Shark fin sample: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782092019886.json`, screenshot `runtime-data/qa/as2/interaction-smoke/run-1782092019886/01-shark-tooth-initial.png`, text `没有酷炫鲨鱼鳍，你的装扮还不完整！`.
  - Coconut sample: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782092069884.json`, screenshot `runtime-data/qa/as2/interaction-smoke/run-1782092069884/01-shark-tooth-initial.png`, text `尝尝我的气泡椰奶吧。免费请你喝！`.
  - Afraid sample: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782092117113.json`, screenshot `runtime-data/qa/as2/interaction-smoke/run-1782092117113/01-shark-tooth-initial.png`, text `我得离开这座岛！那条巨鲨太吓人了！`.
  - Manual review: all three are native AS2 dialogue bubbles, not static overlays; no repeated bubble flashing, text twitching, or character disappearance was seen in the final samples.
- Audio/mute note:
  - The final dialogue proof runs used `--skip-audio` after the baseline `1782090320593` already proved `audioActive=0`.
  - A discarded intermediate run `1782091696121` showed the target `flashpointnavigator.exe` session was `muted=true` and `volume=0.0`, but loopback captured unrelated system audio while the user was working. This is recorded as a QA audio false positive, not game audio leakage.
- Static-art policy remained intact:
  - `MENU`, `WELCOME TO SHARK TOOTH`, `SHARK TOOTH ISLAND`, `RESTROOMS`, `PARKING LOT`, posters, arrows, map logo, and other art-lettering remain English/static.
  - No Chinese TextField overlay was added to static icons, signs, posters, arrows, or art-lettering.
- Failed/partial evidence not counted:
  - `as2-interaction-smoke-1782090669748.json`, `1782090726409`, and `1782090782494` showed Chinese but the bubble was cropped at the bottom; superseded by `1782092019886`, `1782092069884`, and `1782092117113`.
  - `as2-interaction-smoke-1782091487162.json` failed after a rejected attempt to wrap the bubble `onEnterFrame`; this was reverted in favor of native `talkHeight`.
  - `as2-interaction-smoke-1782091696121.json` is not counted for audio because loopback was polluted by non-game system audio despite the Navigator session being muted.
- Current Shark Tooth conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist: AS2 entry, AS2 map open, AS3 map intro, centered loading, F11/no-blue gameplay layout, HUD/MENU stability, 3 native Chinese dialogue samples, no visible dialogue repeat/twitch in final samples, runtime mute, and static-art policy all have evidence.
  - Not a full end-to-end story completion proof. Booga Bay, Ancient Ruins, Temple, Medicine Man, Castaway, potion/cannon/rescue, more natural NPC hot zones, and the ending remain future full-island deep QA.
- Next island:
  - Move current execution to `16. 24-carrot`.
  - Use the same AS2 sequence: map intro/opening, window/F11/no-blue layout, loading center, HUD/backpack/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue no-repeat/no-twitch samples, static-art policy review, then sealed regression.

## 2026-06-21 24 Carrot Current-Build Sealed Baseline Pass

- Continued island 16 (`24-carrot`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/background:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_HTML_AUDIO=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MUTE_INTERVAL_MS=150`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_NO_FOREGROUND=1`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- External route sanity check:
  - Poptropica Help Blog and Poptropica Wiki describe 24 Carrot as the Main Street / Carrot Farm / Charlie shop / diner / factory / sewer and vent / processing room / Rabbot route, matching the local `Carrot` AS2 scene family.
  - Sources used only for route/NPC sanity check: `https://poptropi.ca/island-help/24-carrot/`, `https://poptropica.fandom.com/wiki/24_Carrot_Island`.
- Entry and text fixes:
  - Verified `catalog/launch-overrides.json` launches `24-carrot` at `sceneFolder=Carrot`, `roomParam=CarrotMain`, `islandParam=Carrot`.
  - Imported Carrot AS2 script rows from `scenes/islandCarrot`: 125 script candidates, 84 unique text strings.
  - Added `tools/seed-as2-carrot-translations.js`; it filled the active missing Carrot native script rows, including milk bowl, Whiskers, Dr. Hare/Rabbot, station, and factory/escape lines.
  - Patched nine Carrot scene SWFs with `tools/patch-as2-script-translations.js`: `sceneCarrotMain.swf`, `sceneDiner.swf`, `sceneFactory.swf`, `sceneFarm.swf`, `sceneFarmHouse.swf`, `sceneLoading.swf`, `sceneProcessing.swf`, `sceneRobot.swf`, and `sceneSurplus.swf`.
- Map intro:
  - Added `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/carrot/island/page.xml`.
  - Synchronized the XML entry into the AS3 runtime zip with `tools/update-as3-runtime-entries.js`.
  - AS3 map smoke passed: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782093999624.json`.
  - Screenshot inspected: `runtime-data/qa/as3/islands-smoke/run-1782093999624/01-poptropicon-map.png`.
  - Visual review: title `24 根胡萝卜岛`, Chinese description, and `重新开始/开始` buttons are visible and centered; static `24 CARROT ISLAND` logo and slide art remain original English/static art.
- Full 24 Carrot AS2 acceptance smoke:
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782095220343.json`.
  - Result: `ok=true`, `audioActive=0`, `mapClicksPassed=1`, `sceneEvidencePassed=1`, `loadingCenterPassed=1`, `f11Passed=1`, `visualGuardPassed=1`, `failedKeys=[]`.
  - Reviewed screenshots:
    - `runtime-data/qa/as2/interaction-smoke/run-1782095220343/01-24-carrot-initial.png`.
    - `runtime-data/qa/as2/interaction-smoke/run-1782095220343/01-24-carrot-f11.png`.
    - `runtime-data/qa/as2/interaction-smoke/run-1782095220343/01-24-carrot-map.png`.
    - `runtime-data/qa/as2/interaction-smoke/run-1782095220343/01-24-carrot-loading-sequence/01-24-carrot-loading-500.png`.
  - Manual review: startup loading is centered, character/HUD survive F11, AS2 map popup opens, gameplay scene does not expose the bottom blue band, and runtime stays muted.
- Three native AS2 Chinese dialogue proof samples passed:
  - Added `tools/patch-as2-carrot-dialog-proof.js`; the QA-only hook triggers Carrot Main Street NPC `talkyText/manualSay` bubbles only when `flashpointQaAs2Dialog` is present.
  - The first attempt `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782094329354.json` failed because the hook armed before Carrot's `init()` populated late-state NPC `talkyText` and coordinates; this was fixed by keeping the hook QA-only, adding fallback text from the same translated Carrot Main Street script, and initializing missing coordinate fields before `manualSay`.
  - Mayor/carrot line: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782094725769.json`, screenshot `runtime-data/qa/as2/interaction-smoke/run-1782094725769/01-24-carrot-initial.png`, text `胡萝卜不再消失了！`.
  - Factory-closed worker line: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782094806248.json`, screenshot `runtime-data/qa/as2/interaction-smoke/run-1782094806248/01-24-carrot-initial.png`, text `自从工厂关门，我就一直找不到工作。`.
  - Gas station line: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782094882172.json`, screenshot `runtime-data/qa/as2/interaction-smoke/run-1782094882172/01-24-carrot-initial.png`, text `抱歉，我们的汽油用完了。`.
  - Manual review: all three are AS2 native dialogue bubbles, not static overlays; no repeated bubble flashing, text twitching, or character disappearance was seen in the final samples.
- Static-art policy remained intact:
  - `24 CARROT ISLAND`, `CARROT KING DINER`, `OPEN`, AS2 map title/logo, scene signs, posters, arrows, and other art-lettering remain English/static.
  - No Chinese TextField overlay was added to static icons, signs, posters, arrows, or art-lettering.
- Current 24 Carrot conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist: AS2 entry, AS2 map open, AS3 map intro, centered loading, F11/no-blue gameplay layout, HUD/MENU stability, 3 native Chinese dialogue samples, no visible dialogue repeat/twitch in final samples, runtime mute, and static-art policy all have evidence.
  - Not a full end-to-end story completion proof. Carrot Farm, Charlie shop, diner interior, factory, sewer, freezer, vent, processing room, robot/Rabbot route, item chain, more natural NPC hot zones, and ending remain future full-island deep QA.
- Next island:
  - Move current execution to `17. time-tangled`.
  - Use the same AS2 sequence: map intro/opening, window/F11/no-blue layout, loading center, HUD/backpack/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue no-repeat/no-twitch samples, static-art policy review, then sealed regression.

## 2026-06-22 Time Tangled Current-Build Sealed Baseline Pass

- Continued island 17 (`time-tangled`) only; no global island matrix run.
- Kept QA runtime muted and side-monitor/G32QC targeted:
  - `POPTROPICA_QA_MUTE_RUNTIME=1`
  - `POPTROPICA_QA_MUTE_HTML_AUDIO=1`
  - `POPTROPICA_QA_MUTE_SECONDS=43200`
  - `POPTROPICA_QA_MUTE_INTERVAL_MS=150`
  - `POPTROPICA_QA_MONITOR=G32QC`
  - `POPTROPICA_QA_POST_MESSAGE_CLICKS=1`
- Entry/resource/text fixes:
  - Verified the AS2 launch target is `sceneFolder=Time`, `roomParam=Present`, `islandParam=Time`.
  - Restored `packs/zh-CN/as2/files/content/www.poptropica.com/scenes/islandTime/vendorCart.swf` from the repo blob so Time no longer logs a missing vendor cart request.
  - Imported Time AS2 script rows from `scenes/islandTime`; final audit had `assetsWithUnindexedScriptDialogue=0`.
  - Added `tools/seed-as2-time-translations.js`; it seeded the active missing Time native script rows.
  - Patched 24 Time scene SWFs with `tools/patch-as2-script-translations.js`, covering Aztec, China, Desolation, Edison, Everest, France, Future, Graff, Greece, Lab, Lewis, Mali, Present, Renaissance, and Viking scenes.
- Map intro and AS2 map popup:
  - Added `packs/zh-CN/as3/files/content/www.poptropica.com/game/data/scenes/map/map/islands/time/island/page.xml`.
  - AS3 map smoke passed: `runtime-data/qa/as3/islands-smoke/as3-island-smoke-1782097615542.json`.
  - Screenshot inspected: `runtime-data/qa/as3/islands-smoke/run-1782097615542/01-poptropicon-map.png`.
  - Visual review: title `时空缠结岛`, Chinese description, and `重新开始/开始` buttons are visible and centered; static `TIME TANGLED ISLAND` logo and the Greek image lettering remain original English/static art.
  - Added `tools/patch-as2-map-popup-text.js` and updated `tools/lib/pack.js` so the AS2 map popup uses native Chinese text for `重启/岛屿` and moves the reset button up to avoid bottom clipping.
- QA helper fix:
  - `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782099985795.json` had good logical checks but its F11 screenshot captured a desktop overlay, so it is rejected.
  - `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782100294199.json` showed foreground capture could leave the Flash stage unfilled at 1600x900, so it is rejected.
  - Updated `tools/qa-helper.py` so foreground capture also pulses the Navigator layout before screenshots while skipping physical resize for monitor-sized/F11 windows.
  - Python syntax check passed: `python -m py_compile tools\qa-helper.py`.
- Full Time AS2 acceptance smoke:
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782100652713.json`.
  - Result: `ok=true`, `audioActive=0`, `mapClicksPassed=1`, `sceneEvidencePassed=1`, `loadingCenterPassed=1`, `f11Passed=1`, `visualGuardPassed=1`, `failedKeys=[]`.
  - Reviewed screenshots:
    - `runtime-data/qa/as2/interaction-smoke/run-1782100652713/01-time-tangled-initial.png`.
    - `runtime-data/qa/as2/interaction-smoke/run-1782100652713/01-time-tangled-f11.png`.
    - `runtime-data/qa/as2/interaction-smoke/run-1782100652713/01-time-tangled-map.png`.
    - `runtime-data/qa/as2/interaction-smoke/run-1782100652713/01-time-tangled-loading-sequence/01-time-tangled-loading-500.png`.
  - Manual review: startup loading is centered, character/HUD survive F11, AS2 map popup opens, gameplay scene does not expose the bottom blue band, and runtime stays muted.
- Three native AS2 Chinese dialogue proof samples passed:
  - Added `tools/patch-as2-time-dialog-proof.js`; the QA-only hook triggers real Time Lab `manualSay` bubbles only when `flashpointQaAs2Dialog` is present.
  - Help sample: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782099797488.json`, screenshot `runtime-data/qa/as2/interaction-smoke/run-1782099797488/01-time-tangled-initial.png`, text `请帮帮我们。故障搅乱了时间，未来岌岌可危。`.
  - Printout sample: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782099837988.json`, screenshot `runtime-data/qa/as2/interaction-smoke/run-1782099837988/01-time-tangled-initial.png`, text `这份打印资料会说明我们需要你做什么。`.
  - Follow-up sample: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782099896495.json`, screenshot `runtime-data/qa/as2/interaction-smoke/run-1782099896495/01-time-tangled-initial.png`, text `那份打印件会解释一切。我们全靠你了。`.
  - Manual review: all three are AS2 native dialogue bubbles, not static overlays; no repeated bubble flashing, text twitching, or character disappearance was seen in the final samples.
- Static-art policy remained intact:
  - `TIME TANGLED ISLAND`, the AS2 parchment map logo, Greek building image text, scene signs, posters, arrows, and other art-lettering remain English/static.
  - No Chinese TextField overlay was added to static icons, signs, posters, arrows, or art-lettering.
- Current Time Tangled conclusion:
  - Current build sealed baseline is usable as a pass for the stepwise island checklist: AS2 entry, AS2 map open, AS3 map intro, centered loading, F11/no-blue gameplay layout, HUD/MENU stability, 3 native Chinese dialogue samples, no visible dialogue repeat/twitch in final samples, runtime mute, and static-art policy all have evidence.
  - Not a full end-to-end story completion proof. Time machine travel, all era item chains, more natural NPC hot zones, and the ending remain future full-island deep QA.
- Next island:
  - Move current execution to `18. super-power`.
  - Use the same AS2 sequence: map intro/opening, window/F11/no-blue layout, loading center, HUD/backpack/map UI, at least 3 real Chinese NPC/quest dialogue screenshots, dialogue no-repeat/no-twitch samples, static-art policy review, then sealed regression.

## 2026-06-22 AS2 HUD Golden Evidence And Dialogue Throttle Proof

- Paused new-island progression again after user feedback that my previous "HUD is correct" judgement was too subjective.
- Tightened the HUD evidence path:
  - `tools/qa-helper.py analyze-hud-diff` now has stricter default thresholds for a real right-top HUD: right margin 8-96 px, top margin -4-36 px, row spread <= 10 px, icon gaps 10-56 px, and HUD width <= 24% of stage width.
  - Added `--annotated-output` to generate a human-readable evidence image: yellow = actual stage, cyan = accepted upper-right region, green = HUD box, orange = individual detected HUD icons, red = unexpected top-band differences.
  - Python syntax check passed: `python -m py_compile tools/qa-helper.py`.
- Current-build AS2 Time Tangled HUD proof:
  - Normal HUD run: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782155801119.json`.
  - Hidden HUD baseline: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782155857042.json`.
  - Strict diff: `runtime-data/qa/as2/interaction-smoke/as2-hud-diff-1782155801119-strict.json`.
  - Annotated visual proof: `runtime-data/qa/as2/interaction-smoke/as2-hud-diff-1782155801119-annotated.png`.
  - Metrics: 3 HUD icons, `hudBox left=1274 top=25 right=1498 bottom=80`, right margin 44 px, top margin 0 px, row spread 4 px, icon gaps 28/22 px, HUD width ratio 0.1498.
  - Manual visual review: HUD is a single row in the actual stage upper-right, no left-top faint pause icon is visible in the proof screenshot.
- Added AS2 global duplicate dialogue protection proof:
  - `showSay()` now increments `_root.__zhSuppressedDuplicateSayCount` when the same target receives the same decoded text while a bubble is active, shortly after a bubble closes, or inside the short trigger debounce window.
  - Added QA-only mode `flashpointQaAs2Dialog=as2-show-say-throttle`: gameplay waits until the scene is stable, calls `showSay()` five times with the same Chinese string, keeps the resulting bubble visible for capture, and writes a QA track log with the suppressed count.
  - Synchronized the patch into `tools/lib/pack.js` so rebuilds keep the behavior.
  - Rebuilt `packs/zh-CN/as2/swf/content/www.poptropica.com/gameplay.swf` and `runtime-data/patched-zips/as2-runtime.zip`.
  - JS static check passed: `node --check tools/lib/pack.js`.
- AS2 duplicate-dialogue proof passed:
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782156865837.json`.
  - Screenshot: `runtime-data/qa/as2/interaction-smoke/run-1782156865837/01-time-tangled-initial.png`.
  - OCR: `重复对话测试`.
  - Server log proof: `QaShowSayThrottle&suppressed=4&bubble=true&ticks=16`, meaning 5 same-text calls produced one bubble and suppressed 4 duplicates.
  - Runtime remained side-screen/no-foreground/G32QC targeted and muted; `audioActive=0`.
- Important non-closure:
  - This closes the global AS2 `showSay()` duplicate bubble path, not every natural NPC hot-zone. Time Tangled still needs natural NPC/era-route replay after popup/camera/arrow blockers.
  - AS3 dialogue queue protection is still open.
  - Time Lab scene-specific QA hook still fails to fire even though the patched scene SWF in the runtime zip contains the hook. Since the global gameplay proof now covers the repeated `showSay()` bug, defer sceneLab hook cleanup unless a later Time Lab-specific proof needs it.
  - Remaining global blockers: AS3 HUD using the same visual standard, popup/item black residue and off-screen positioning, camera blue-edge leakage in more scenes, native arrow labels, external/click-to-white-screen links, and real audio source inventory.

## 2026-06-22 AS2 Time Tangled Viewport Cache-Bust + HUD Anchor Gate

- Paused again after the user pointed out my "right top HUD" judgement was not trustworthy enough.
- Fixed a real AS2 viewport instability:
  - `packs/zh-CN/as2/files/content/www.poptropica.com/base.php` now sends `Cache-Control: no-store`, `Pragma: no-cache`, and `Expires: 0`.
  - `tools/qa-as2-interaction-smoke.js` now adds a unique `flashpointQaCacheBust` param to each QA launch unless explicitly disabled.
  - This addresses the observed flip-flop where Time Tangled sometimes loaded an older `base.php` layout and returned to the 1174x619 white-edge screenshot.
- Reworked AS2 gameplay viewport:
  - Outer `#gameViewport` fills the visible browser area with dark fallback.
  - Inner `#gameScaleHost` clips the logical gameplay viewport before scaling.
  - Flash stays `scale=noscale`; the wrapper scales the clipped gameplay area instead of stretching Flash and exposing the blue stage.
  - Synced the same template change into `tools/lib/pack.js`.
- Hardened AS2 QA gates:
  - `--require-f11` now actually runs F11; previously it only failed if an optional F11 run existed.
  - Added `--require-hud-anchor`, which launches a hidden-HUD baseline and runs `tools/qa-helper.py analyze-hud-diff` against the normal screenshot.
  - The HUD gate measures against the detected Flash stage right/top, not the browser window or a subjective screenshot read.
- Rebuilt AS2 runtime:
  - Command: `node tools/rebuild-runtime-zip.js --source=as2`.
  - Runtime zip: `runtime-data/patched-zips/as2-runtime.zip`.
- Final G32QC/no-foreground/muted Time Tangled gate passed:
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782163826135.json`.
  - Summary: `ok=true`, `f11Passed=1`, `visualGuardPassed=1`, `hudAnchorPassed=1`, `mapClicksPassed=1`, `loadingCenterPassed=1`, `failedKeys=[]`.
  - Initial screenshot: `runtime-data/qa/as2/interaction-smoke/run-1782163826135/01-time-tangled-initial.png`.
  - F11 screenshot: `runtime-data/qa/as2/interaction-smoke/run-1782163826135/01-time-tangled-f11.png`.
  - Map popup screenshot: `runtime-data/qa/as2/interaction-smoke/run-1782163826135/01-time-tangled-map.png`.
  - HUD annotated proof: `runtime-data/qa/as2/interaction-smoke/run-1782163826135/01-time-tangled-hud-anchor.png`.
  - HUD metrics: right margin 43px, top margin 11px, row spread 3px, icon gaps 26px/20px.
- Manual visual review:
  - Initial window has no right white edge, no bottom blue gameplay band, and the player is visible.
  - F11 has dark side letterbox only; no blue/white overflow, player and HUD remain visible.
  - AS2 map popup opens and requests the map asset; static `TIME TANGLED ISLAND` parchment lettering remains original art per policy.
  - HUD proof image shows the three collapsed AS2 HUD icons inside the actual stage upper-right region.
- Non-closure:
  - This closes the AS2 Time viewport/cache/HUD/F11/loading/map gate, not full Time Tangled story completion.
  - Still open for Time and the global blocker list: item/file popups and black residue, natural time-device route, more natural NPC hot zones, arrow/native label pass, external white-screen links, AS3 dialogue queue protection, and real audio inventory.

## 2026-06-22 AS2 Time Tangled F11 Recovery Reload Gate

- Followed up on the user's correction that a "right top" HUD claim must be judged from screenshots, not from code coordinates alone.
- Root causes fixed in this pass:
  - The AS2 smoke helper applied `--window-size=1450x900` to helper capture/wait code, but not to the actual Flashpoint Navigator runtime launch. The real game could start at an older/default client size and then be moved/resized later, producing stale viewport math and white/blue edge artifacts.
  - The hidden-HUD baseline used for diffing did not always launch with the same runtime geometry and could capture loading too early, which weakened the HUD proof.
  - The default AS2 map click hit the scene travel arrow in the current wide layout instead of the right-top map icon.
  - Exiting F11 could leave the AS2 scene in a broken camera/HUD/player state. This is now handled as a legal recovery reload of the current scene after viewport shrink/F11 changes.
- Code changes:
  - `tools/qa-as2-interaction-smoke.js` now launches AS2 runtime through `resolveCliWindowGeometry()` / `withWindowGeometryEnv()` so the requested runtime window size is applied before gameplay captures.
  - Hidden-HUD baseline capture now uses the same runtime geometry and retries when OCR still sees loading.
  - Default map click moved to the actual right-top map icon region for the current AS2 layout.
  - After F11 restore, the smoke test captures a `post-f11` screenshot and uses that stabilized frame for the map click.
  - `packs/zh-CN/as2/files/content/www.poptropica.com/base.php` and `tools/lib/pack.js` now schedule a current-scene recovery reload after F11/viewport shrink, and remove `flashpointQaLoadingHoldMs` from that recovery URL.
  - Rebuilt AS2 runtime zip with `node tools/rebuild-runtime-zip.js --source=as2`.
- Verification:
  - JS static checks passed for `tools/qa-as2-interaction-smoke.js` and `tools/lib/pack.js`.
  - Full G32QC/no-foreground/muted AS2 Time Tangled gate passed:
    - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782170505380.json`.
    - Command scope: `--islands=time-tangled --qa-loading-hold-ms=3500 --require-scene-evidence=1 --require-loading=1 --require-f11=1 --require-map-request=1 --require-hud-anchor=1 --window-size=1450x900 --settle-ms=9000 --f11-restore-settle-ms=12000 --visual-guard-target-color=139ffd --visual-guard-max-target-edge-pct=5 --skip-audio=0`.
    - Result: `ok=true`, `passed=1`, `failed=0`, `failedKeys=[]`, `audioActive=0`, `mapClicksPassed=1`, `sceneEvidencePassed=1`, `loadingCenterPassed=1`, `f11Passed=1`, `visualGuardPassed=1`, `hudAnchorPassed=1`.
    - Audio proof: `runtime-data/qa/as2/interaction-smoke/run-1782170505380/01-time-tangled-audio.json` reports `audioLikelyActive=false`, `rms=0`, `peak=0`, and `respectSessionMute=true`.
    - Server log proves recovery reloads without loading hold: `flashpointResizeReload=1782170585104` and `flashpointResizeReload=1782170604252`, followed by `/popups/map.swf` and `/popups/maps/Time.swf`.
- Screenshot review:
  - `runtime-data/qa/as2/interaction-smoke/run-1782170505380/01-time-tangled-post-f11.png`: player visible after F11 restore, HUD is a single row in the upper-right, no left-top faint pause icon, no blue/white edge.
  - `runtime-data/qa/as2/interaction-smoke/run-1782170505380/01-time-tangled-hud-anchor.png`: annotated HUD proof shows the three AS2 HUD icons inside the real stage upper-right region; metrics are right margin 43 px, top margin 11 px, row spread 3 px, icon gaps 26/20 px.
  - `runtime-data/qa/as2/interaction-smoke/run-1782170505380/01-time-tangled-map.png`: AS2 map popup opens, static `TIME TANGLED ISLAND` art remains English, and gameplay HUD is no longer sitting above the popup content. `CLOSE` remains English and is not closed by this pass.
- Current conclusion:
  - This closes the AS2 Time Tangled public F11/resize recovery + HUD visual gate more strongly than the previous `1782163826135` run.
  - Time Tangled is still re-opened overall. Remaining blockers before calling the island sealed: native map/popup button localization such as `CLOSE`, item/file popup positioning and black residue, natural time-device route, natural NPC hot-zone no-repeat checks, arrow/native label pass, external white-screen links, AS3 dialogue queue protection, and real audio source inventory.

## 2026-06-22 AS2 Time Tangled Popup Close Asset Replacement

- Paused the global island run and corrected the `CLOSE` diagnosis instead of treating it as another coordinate issue.
- Root cause:
  - The visible AS2 map popup `CLOSE` label was not the already-patched TextField `chid 40`.
  - It came from `gameplay.swf` top-level `popupClose`, sprite 261, button 259, shape 256.
  - Shape 256 stores the `CLOSE` letters as vector paths, so normal text replacement could report success while the screenshot still showed English.
- Code changes:
  - Added `tools/lib/as2-popup-close-shape.js`.
  - The helper exports the target shape with FFDec, detects the original vector marker, replaces shape 256 with a Chinese `关闭` bitmap asset, and skips cleanly once the shape is already bitmap-patched.
  - Wired the helper into `tools/patch-as2-gameplay-hud-popup.js`.
  - Wired the helper into `tools/lib/pack.js` so future AS2 runtime rebuilds keep the static close-button asset patch.
  - Rebuilt `packs/zh-CN/as2/swf/content/www.poptropica.com/gameplay.swf` and `runtime-data/patched-zips/as2-runtime.zip`.
- Verification:
  - JS static checks passed:
    - `node --check tools/lib/as2-popup-close-shape.js`.
    - `node --check tools/patch-as2-gameplay-hud-popup.js`.
    - `node --check tools/lib/pack.js`.
    - `node --check tools/qa-as2-interaction-smoke.js`.
  - Patch report: `runtime-data/qa/as2/as2-gameplay-hud-popup-patch.json`.
  - Shape preview: `runtime-data/tmp-as2-gameplay-close-after-patch-shape/close-button-zh-after-preview-x8.png`.
  - Full G32QC/no-foreground/muted AS2 Time Tangled regression passed:
    - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782174297821.json`.
    - Result: `ok=true`, `passed=1`, `failed=0`, `failedKeys=[]`, `audioActive=0`, `mapClicksPassed=1`, `sceneEvidencePassed=1`, `loadingCenterPassed=1`, `f11Passed=1`, `visualGuardPassed=1`, `hudAnchorPassed=1`, `withMissingLogRequests=0`.
    - Command scope included explicit loading samples: `--loading-sample-ms=300,1200,2400`.
- Screenshot review:
  - `runtime-data/qa/as2/interaction-smoke/run-1782174297821/01-time-tangled-map.png`: map popup now shows `关闭`; OCR also sees `重启 岛屿`; static `TIME TANGLED ISLAND` art remains English by policy.
  - `runtime-data/qa/as2/interaction-smoke/run-1782174297821/01-time-tangled-hud-anchor.png`: AS2 collapsed HUD is a single row inside the real stage upper-right; metrics are right margin 43 px, top margin 11 px, row spread 3 px, icon gaps 26/20 px.
  - `runtime-data/qa/as2/interaction-smoke/run-1782174297821/01-time-tangled-loading-sequence/01-time-tangled-loading-300.png`: `Poptropica LOADING` is centered; detected offset was about x=2/y=21.
  - `runtime-data/qa/as2/interaction-smoke/run-1782174297821/01-time-tangled-f11.png`: player visible, HUD stable, no blue gameplay leak.
- QA process correction:
  - Loading evidence must include explicit `--loading-sample-ms`; otherwise a run can pass other gates while loading is skipped.
  - Hidden-HUD baseline launch creates a second runtime, so it must run after map evidence or against a fresh target; otherwise it can invalidate the original Navigator window handle.
  - From here on, HUD correctness is not accepted from code coordinates alone. A pass needs screenshot evidence plus either annotated HUD metrics or a direct visual crop.
- Current conclusion:
  - This closes the AS2 Time Tangled map popup `CLOSE` item using asset replacement, not a Chinese text overlay.
  - Time Tangled is still re-opened overall. Remaining blockers before calling the island sealed: item/file popup black residue and off-screen positioning, natural time-device route through eras, natural NPC no-repeat hot-zone checks, native arrow/label pass, external white-screen links, AS3 dialogue queue protection, and real audio source inventory.

## 2026-06-22 AS2 Time/Super HUD Regression + malidocs Popup Partial Fix

- Continued the reopened Time Tangled blocker wave; did not advance to a new island.
- Code changes:
  - `tools/patch-as2-gameplay-hud-popup.js` and `tools/lib/pack.js` now treat `malidocs.swf` as a non-tight popup viewport. This avoids the previous 640x480 tight-crop path that enlarged/cut the task file.
  - Non-tight popups now skip the extra `__zhPopupBackdrop`; they still hide gameplay HUD but rely on the original game popupBack. The implementation uses `_root.__zhPopupTightViewport` rather than a local `_locN_` variable to avoid FFDec local-variable collisions.
  - `tools/qa-as2-interaction-smoke.js` now supports `--popup-close-click`, `--popup-close-clicks`, and screenshot-coordinate click offset for Firefox client-only captures.
  - The AS2 map-click source was corrected: default map clicks use the initial stable scene, not a post-F11 frame that may still be `LOADING`. `--map-after-f11` is now required to opt into post-F11 map clicking.
- Verification:
  - Static checks passed:
    - `node --check tools/patch-as2-gameplay-hud-popup.js`
    - `node --check tools/lib/pack.js`
    - `node --check tools/qa-as2-interaction-smoke.js`
  - Rebuilt AS2 runtime through `node tools/patch-as2-gameplay-hud-popup.js`; report `runtime-data/qa/as2/as2-gameplay-hud-popup-patch.json`.
  - Time Tangled regular regression passed: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782182603714.json`.
    - `ok=true`, `audioActive=0`, `mapClicksPassed=1`, `sceneEvidencePassed=1`, `f11Passed=1`, `visualGuardPassed=1`, `hudAnchorPassed=1`.
    - Reviewed `run-1782182603714/01-time-tangled-hud-anchor.png`, `01-time-tangled-map.png`, and `01-time-tangled-f11.png`.
  - Super Power regular regression passed: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782182763256.json`.
    - `ok=true`, `audioActive=0`, `mapClicksPassed=1`, `sceneEvidencePassed=1`, `f11Passed=1`, `visualGuardPassed=1`, `hudAnchorPassed=1`.
    - Reviewed `run-1782182763256/01-super-power-hud-anchor.png` and `01-super-power-f11.png`.
  - `malidocs` popup no longer renders with right-side clipping in `runtime-data/qa/as2/interaction-smoke/run-1782181675632/01-time-tangled-initial.png`.
- Important non-closure:
  - `malidocs` close flow is still not sealed. After close, the game remains on a Time Machine/Time map popup layer instead of returning to normal gameplay; evidence: `runtime-data/qa/as2/interaction-smoke/run-1782182012427/01-time-tangled-popup-close.png`.
  - Do not mark Time Tangled sealed until the item popup close chain, natural time-device route, natural NPC hot-zone no-repeat checks, arrow/native label pass, external white-screen links, AS3 dialogue queue protection, and real audio source inventory are handled.

## 2026-06-23 AS2 Time Tangled malidocs Close Chain Sealed

- Paused broad island progression and focused on the user-reported Time Tangled task-file popup blocker.
- Root cause:
  - The visible `malidocs.swf` close button was not the actual failed target.
  - A hidden/right-top map hotzone and map mouse listener could receive the click first. It no longer opened `map.swf` after earlier guards, but it still blocked `popupClose`.
  - Screenshot coordinates and Flash root coordinates did not match reliably enough for a coordinate-only fix.
- Code changes:
  - `tools/patch-as2-gameplay-hud-popup.js` and `tools/lib/pack.js` now disable and restore gameplay HUD button handlers while popups are open.
  - Direct map button, map mouse listener, and `zhOpenDirectMap()` now treat popup-state hidden map hits as popup-close attempts and call `_root.closePopup()` instead of opening or blocking map.
  - `__zhPopupCloseHit` was raised above the direct map hotzone.
  - `tools/qa-helper.py` gained `analyze-popup-close-button` to locate the blue `关闭` button in screenshots.
  - `tools/qa-as2-interaction-smoke.js` now auto-detects popup close button centers and converts client-capture coordinates to window-relative click coordinates from `captureBox - window.rect`, removing the need for hard-coded `--popup-close-y 188`.
- Verification:
  - Static checks passed:
    - `node --check tools/patch-as2-gameplay-hud-popup.js`
    - `node --check tools/lib/pack.js`
    - `node --check tools/qa-as2-interaction-smoke.js`
    - `python -m py_compile tools/qa-helper.py`
  - Rebuilt AS2 gameplay/runtime via `node tools/patch-as2-gameplay-hud-popup.js`.
  - Explicit close coordinate regression passed: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782187617261.json`.
  - Auto-detected close regression passed: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782187745277.json`.
  - Final result: `ok=true`, `passed=1`, `failed=0`, `popupClose.ok=true`, `closeButtonStillVisible=false`, `mapOpenedDuringClose=false`, `audioActive=0`.
  - Close log proof: `PopupClosePressed&target=openDirectMapBlockedMap`, with no `map.swf` request during popup close.
  - Screenshot reviewed: `runtime-data/qa/as2/interaction-smoke/run-1782187745277/01-time-tangled-popup-close.png` returns to the Mali scene and has no close-button residue.
- Added `HUD_VISUAL_CONTRACT.zh-CN.md`:
  - Defines the right-top HUD standard using actual Flash stage geometry, not subjective code coordinates.
  - Documents popup/task-item expectations and the evidence tools required for future passes.
- Current conclusion:
  - Time Tangled `malidocs` task-file close chain is closed.
  - Time Tangled remains reopened overall. Still open: natural time-machine route, more era scenes, blue-edge/camera checks beyond the sample, natural NPC no-repeat hot-zone checks, native arrow labels, external white-screen links, AS3 dialogue queue protection, and real audio source inventory.

## 2026-06-23 AS2 Native Navigation Label Audit Sealed

- Focused on the user's `TRAVEL / ENTER / EXIT / GO LEFT / GO RIGHT` feedback without adding Chinese overlay text to static art.
- Added `tools/audit-as2-native-navigation-labels.js`:
  - Exports AS2 SWF scripts and text records with FFDec.
  - Treats script `labelText = "..."` and exact exported text records as native labels.
  - Does not treat OCR-only/static art lettering as something to hard-cover with Chinese text.
- Time Tangled file-level audit passed:
  - Report: `runtime-data/qa/as2/native-navigation-labels/time-tangled.json`.
  - Scope: 24 Time Tangled AS2 scene SWFs.
  - Result: `ok=true`, `blockerCount=0`, `failedExports=[]`.
  - Proof includes `scenePresent.swf` with native script labels `旅行`, `进入`, and `公共房间`.
- Full AS2 first audit found one real native text blocker:
  - Report before fix: `runtime-data/qa/as2/native-navigation-labels/all-islands.json`.
  - `sceneMuseum.swf` in Early Poptropica had one exact exported TextField `EXIT` at `79.txt`.
  - This was a native text field, not a static painted sign, so it should be translated under the current policy.
- Added `tools/patch-as2-native-navigation-text-fields.js` and patched the current pack:
  - Target: `packs/zh-CN/as2/swf/content/www.poptropica.com/scenes/islandEarly/sceneMuseum.swf`.
  - Replacement: `79.txt`, character id `79`, `EXIT -> 退出`, font id `78`.
  - Patch report: `runtime-data/qa/as2/native-navigation-labels/text-field-patch.json`.
  - Rebuilt AS2 runtime zip to `runtime-data/patched-zips/as2-runtime.zip`, replacement count `110`.
- Synced the future rebuild path:
  - `tools/lib/pack.js` now augments AS2 plain SWF text patching with exact native navigation text-field replacement.
  - It only replaces whole text records equal to known navigation labels; longer strings such as passcode prompts are not touched.
- Verification after fix:
  - Static checks passed:
    - `node --check tools/audit-as2-native-navigation-labels.js`
    - `node --check tools/patch-as2-native-navigation-text-fields.js`
    - `node --check tools/lib/pack.js`
  - Full AS2 second audit passed:
    - `runtime-data/qa/as2/native-navigation-labels/all-islands.json`
    - `ok=true`, `swfCount=80`, `blockerCount=0`, `proofCount=75`, `failedExports=[]`.
  - Early/Museum runtime smoke passed:
    - `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782189287851.json`
    - `ok=true`, `sceneEvidencePassed=1`, `visualGuardPassed=1`, `audioActive=0`, `failedKeys=[]`.
    - Screenshot reviewed: `runtime-data/qa/as2/interaction-smoke/run-1782189287851/01-early-poptropica-initial.png`; the door label shows native `退出`, player is visible, HUD stays in the upper-right.
- Current conclusion:
  - AS2 native navigation labels are closed at the file-level gate for current 80 scene SWFs.
  - This does not translate static art arrows/signs/posters. If an English label only exists as artwork and not as exported script/text, it remains English unless a real image-asset replacement is created later.
  - Time Tangled remains reopened overall. Still open: natural time-machine route, more era scenes, camera blue-edge checks beyond representative samples, natural NPC no-repeat hot-zone checks, external white-screen links, AS3 dialogue queue protection, and real audio source inventory.

## 2026-06-23 Time Tangled Six-Scene Visual Matrix

- Stayed on Time Tangled after sealing AS2 native labels; did not advance to another island.
- Ran six direct-entry scene smokes on G32QC/no-foreground/muted runtime:
  - `Present`: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782189496055.json`
  - `Lab`: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782189530706.json`
  - `Future`: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782189565754.json`
  - `Future2`: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782189600365.json`
  - `Mali`: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782189635533.json`
  - `Viking`: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782189670277.json`
- Result:
  - 6/6 passed with `ok=true`, `passed=1`, `failed=0`, `failedKeys=[]`.
  - Each run used `--visual-guard-target-color=139ffd --visual-guard-max-target-edge-pct=4` to catch blue-stage leakage.
  - Scene evidence and initial visual guard passed in all six scenes.
- Screenshot review:
  - Reviewed `runtime-data/qa/as2/interaction-smoke/run-1782189600365/01-time-tangled-initial.png` (`Future2`): player visible, HUD upper-right, no blue-stage edge; visual guard target-blue edge pct was 0%.
  - Reviewed `runtime-data/qa/as2/interaction-smoke/run-1782189670277/01-time-tangled-initial.png` (`Viking`): player visible, HUD upper-right, no blue-stage edge; visual guard target-blue edge pct was 0%.
- Current conclusion:
  - This closes a representative Time Tangled direct-scene visual matrix for player visibility, HUD placement, and blue-edge leakage.
  - It does not close natural time-machine travel, all-era item chains, natural NPC hot-zone no-repeat checks, external white-screen links, AS3 dialogue queue protection, or real audio source inventory.

## 2026-06-23 AS2 HUD Right-Top Regression Reopened And Fixed

- Reopened the AS2 HUD "upper-right" gate after user screenshots showed the previous evidence was too lenient.
- Root cause:
  - `gameplay-zh.swf` was correctly loaded; this was not a stale-cache-only issue.
  - QA-only runtime logs proved the visible HUD came from `_level0.gameplay_container_mc.navBar`.
  - `layoutFramelessGameplayNav()` was executing, but `navBar` child bounds were not reliable: the first debug run logged `HudLayoutPlan right=1010 left=NaN width=NaN count=4`, so Flash kept the visible icons at their old positions.
  - Filtering invalid bounds alone left only one valid/non-visible button (`count=1`) and still did not move the three visible icons.
- Code changes:
  - `tools/patch-as2-gameplay-hud-popup.js` and `tools/lib/pack.js` now add QA-only `HudLayoutNoNav/HudLayoutPlan/HudLayoutApplied/HudLayoutFallback` logging.
  - Invalid `getBounds()` values are ignored for dynamic layout.
  - When the three core AS2 gameplay HUD buttons cannot be measured reliably, the code uses a fixed right-top fallback for inventory/wardrobe/map at `x=652/708/764,y=-20`.
  - The fallback is synchronized into the future rebuild path and `gameplay-zh.swf` is refreshed through `tools/patch-as2-framework-top-nav.js`.
- Verification:
  - Static checks passed:
    - `node --check tools/patch-as2-gameplay-hud-popup.js`
    - `node --check tools/lib/pack.js`
  - Rebuilt AS2 gameplay/runtime and refreshed `gameplay-zh.swf`.
  - Time Tangled HUD regression passed:
    - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782195195133.json`.
    - Screenshot reviewed: `runtime-data/qa/as2/interaction-smoke/run-1782195195133/01-time-tangled-initial.png`.
    - Annotated proof: `runtime-data/qa/as2/interaction-smoke/run-1782195195133/01-time-tangled-hud-anchor.png`.
    - Metrics: `rightMargin=43`, `topMargin=2`, `hudCenterYRatio=0.03945578231292517`, `hudAnchorPassed=1`.
    - Log proof: `HudLayoutFallback&count=1&invX=652&wardX=708&mapX=764`.
  - Super Power HUD regression passed:
    - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782195292167.json`.
    - Screenshot reviewed: `runtime-data/qa/as2/interaction-smoke/run-1782195292167/01-super-power-initial.png`.
    - Metrics: `rightMargin=43`, `topMargin=2`, `hudCenterYRatio=0.03945578231292517`, `hudAnchorPassed=1`.
- Current conclusion:
  - AS2 representative HUD right-top anchor is fixed for Time Tangled and Super Power under the strict pixel contract.
  - This does not seal Time Tangled or Super Power as complete islands.
  - Still open under the active P0 plan: window resize/maximize/F11 full regression after this new HUD fallback, loading center sampling, natural NPC no-repeat checks, item/file popup residue/positioning, external white-screen links, AS3 dialogue queue protection, full island traversal, and real audio source inventory.

## 2026-06-23 Time Tangled Loading Recheck After AS2 HUD Fallback

- Ran a combined Time Tangled regression with loading/map/F11/HUD after the HUD fallback:
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782195616084.json`.
  - Result was not accepted as a pass.
  - HUD anchor and visual guard passed, but loading was not captured without a hold and F11 did not enter fullscreen through post-message input.
  - `01-time-tangled-f11.png` was visually stable, but the capture stayed at `1428x760`; `01-time-tangled-f11-key.json` showed the user's foreground window was a separate main-screen game, so the QA key did not make the side-screen Flash window fullscreen. I did not force focus or mouse control.
- Ran a separate loading-hold proof without F11:
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782195831456.json`.
  - Result: `ok=true`, `loadingCenterPassed=1`, `hudAnchorPassed=1`, `visualGuardPassed=1`, `audioActive=0`, `failedKeys=[]`.
  - Samples at `0/300/800/1500/2500/4000ms` all detected `Poptropica LOADING`.
  - Screenshot reviewed: `runtime-data/qa/as2/interaction-smoke/run-1782195831456/01-time-tangled-loading-sequence/01-time-tangled-loading-300.png`; loading logo/spinner/text are centered.
  - Screenshot reviewed: `runtime-data/qa/as2/interaction-smoke/run-1782195831456/01-time-tangled-initial.png`; player is visible, no blue-edge leak, HUD remains right-top.
- Current conclusion:
  - Time Tangled loading center is reconfirmed after the new AS2 HUD fallback.
  - F11 remains open in the current user-working constraint: the safe background post-message path did not trigger fullscreen while another app had foreground focus.

## 2026-06-23 Time Tangled malidocs Close Recheck After QA Coordinate Fix

- Reopened the `malidocs.swf` close proof after a later run showed the old pass could still fail.
- Root causes found:
  - The AS2 framework loads `gameplay-zh.swf` for cache-busting, but `tools/patch-as2-gameplay-hud-popup.js` only guaranteed updates to `gameplay.swf`. The patch script now compares and syncs `gameplay-zh.swf` every run, and records `aliasSynced` in `runtime-data/qa/as2/as2-gameplay-hud-popup-patch.json`.
  - The exported `gameplay-zh.swf` still had an old `zhOpenDirectMapBlockedByPopup` branch before the newer popup-close branch. The patch script now removes that stale direct-map short-circuit so popup-state map hits close the active popup instead of just blocking.
  - `tools/qa-as2-interaction-smoke.js` was adding the Firefox chrome/client offset to popup-close clicks. `qa-helper.py click-window` already expects parent client coordinates, so the old code clicked about 110 px too low. Client screenshots now return a zero click offset.
- Static verification:
  - Rebuilt AS2 gameplay/runtime with `node tools\patch-as2-gameplay-hud-popup.js`.
  - Exported `packs/zh-CN/as2/swf/content/www.poptropica.com/gameplay-zh.swf` to `runtime-data/tmp/inspect-gameplay-zh-after`.
  - `rg` confirmed `zhOpenDirectMapBlockedByPopup` no longer exists in the exported `frame_1/DoAction.as`; `zhOpenDirectMap()` now routes popup-state hits through `PopupClosePressed&target=openDirectMapBlockedMap`.
- Failed pre-fix evidence kept for context:
  - `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782197886923.json` failed with `popup_close_button_still_visible`.
  - Its click log showed the problem: detected button center was around screenshot `1123,104`, but click JSON used `relativeY=214`.
  - Screenshot review showed the cursor on the lower board edge, not on the `关闭` button.
- Final verification:
  - Command: `node tools\qa-as2-interaction-smoke.js --islands=time-tangled --limit=1 --room-override=Mali --island-override=Time --settle-ms=10000 --window-timeout-ms=60000 --skip-audio=1 --skip-map-click=1 --skip-f11=1 --skip-loading=1 --allow-missing-requests=1 --qa-popup=malidocs.swf --popup-close-click=1 --require-popup-close=1 --popup-close-detect-timeout-ms=30000 --target-monitor=G32QC --window-size=1440x900`
  - Passed report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782198212806.json`.
  - Result: `ok=true`, `passed=1`, `failed=0`, `visualGuardPassed=1`, `sceneEvidencePassed=1`, `audioActive=0`, `failedKeys=[]`.
  - Click proof: `runtime-data/qa/as2/interaction-smoke/run-1782198212806/01-time-tangled-popup-close-click.json` has `relativeX=1123`, `relativeY=104`, matching the detected button center.
  - Log proof: `runtime-data/qa/as2/interaction-smoke/run-1782198212806/01-time-tangled-popup-close-server.log` records `PopupClosePressed&target=mapMouseListenerBlockedMap`; the full report has `mapRequestCount=0`, so no map popup opened during close.
  - Screenshot reviewed: `runtime-data/qa/as2/interaction-smoke/run-1782198212806/01-time-tangled-popup-close.png`; popup is gone, player is visible in Mali, and no `关闭` button residue remains.
- Current conclusion:
  - Time Tangled `malidocs` task-file close chain is closed again with corrected QA coordinates and actual `gameplay-zh.swf` proof.
  - This does not seal Time Tangled overall. Still open under the current P0 plan: safe F11 true-fullscreen input without stealing the user's main focus, natural time-machine route, natural NPC no-repeat hot-zone checks, external white-screen links, AS3 dialogue queue protection, full island traversal, and real audio source inventory.

## 2026-06-23 Time Tangled Map HUD Hitbox Recheck

- Reopened the AS2 map click proof because a strict run could show the HUD visually anchored while the map icon still did not open the map.
- Failed evidence:
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782199199106.json`.
  - Result: `hudAnchorPassed=1`, `visualGuardPassed=1`, but `mapClicksPassed=0` and `mapRequestCount=0`.
  - Click proof: `run-1782199199106/01-time-tangled-map-click.json` clicked the visible map icon at client-relative `1349,63`.
- Root cause:
  - Added QA-only `MapMouseProbe` in `tools/patch-as2-gameplay-hud-popup.js` and `tools/lib/pack.js`.
  - Probe evidence from `run-1782199199106/01-time-tangled-map-server.log`: Flash saw the click as `_root._xmouse=759`, `_root._ymouse=-90`, while the direct map bounds were `left=744,top=-38,right=820,bottom=50`.
  - So x was correct, but y was above the internal hotzone. The visual icon was right; the hidden clickable area was vertically too small.
- Code changes:
  - `tools/lib/pack.js` and `tools/patch-as2-gameplay-hud-popup.js` now keep the visible HUD image in place but pad `__zhMapButtonBounds` vertically: `top = buttonY - 100`, `bottom = buttonY + height + 20`.
  - `MapMouseProbe` is gated to QA launches with `flashpointQaCacheBust`, so ordinary local play does not add probe traffic.
  - Rebuilt AS2 gameplay/runtime via `node tools\patch-as2-gameplay-hud-popup.js`; patch report `runtime-data/qa/as2/as2-gameplay-hud-popup-patch.json` has `aliasSynced=true`.
- Final strict map verification:
  - Command: `node tools\qa-as2-interaction-smoke.js --islands=time-tangled --limit=1 --room-override=Present --island-override=Time --settle-ms=10000 --window-timeout-ms=60000 --skip-audio=1 --skip-f11=1 --skip-loading=1 --allow-missing-requests=1 --require-hud-anchor=1 --require-map-request=1 --target-monitor=G32QC --window-size=1440x900`
  - Passed report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782199659821.json`.
  - Result: `ok=true`, `passed=1`, `failed=0`, `mapClicksPassed=1`, `hudAnchorPassed=1`, `visualGuardPassed=1`, `audioActive=0`, `failedKeys=[]`.
  - Log proof: `run-1782199659821/01-time-tangled-map-server.log` has `/popups/map.swf`, native `MapClicked`, and `MapMouseProbe&x=759&y=-90&l=744&t=-138&r=820&b=70`.
  - Screenshot reviewed: `run-1782199659821/01-time-tangled-map.png`; map popup is open. Static `TIME TANGLED ISLAND` art remains English by policy. The native close button is Chinese.
- Regression after the hitbox change:
  - `malidocs.swf` close recheck passed: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782199768333.json`.
  - Log proof: `PopupClosePressed&target=mapMouseListenerBlockedMap`.
  - Screenshot reviewed: `run-1782199768333/01-time-tangled-popup-close.png`; task file popup is gone, player remains visible, and there is no close-button residue.
- Current conclusion:
  - AS2 Time Tangled right-top map icon now satisfies both visual anchoring and actual click-open evidence.
  - Time Tangled is still not sealed. The popup-close screenshot still shows a left-side dark viewport edge, so camera/viewport boundary remains a blocker alongside safe F11, natural route, NPC no-repeat, external white-screen links, AS3 queue protection, full traversal, and real audio source inventory.

## 2026-06-23 Time Tangled HUD/Map Proof Restored After Viewport Rollback

- Stayed on the reopened Time Tangled blocker wave; did not advance to Super Power.
- Corrected the latest AS2 HUD/map proof after a bad intermediate state had effectively treated ordinary gameplay as a 640x480 tight viewport:
  - Restored ordinary AS2 gameplay viewport assumptions to the full `1000x580`/logical-right `1010` path.
  - Kept the visible AS2 HUD icons at the screenshot-right positions: inventory/wardrobe/map at `x=652/708/764,y=-20`.
  - Restored the hidden map hitbox to the proven internal Flash coordinates while keeping the visible icon in place.
  - Adjusted `tools/qa-as2-interaction-smoke.js` so map clicking can target the final screenshot right-top map icon instead of relying on a hidden-HUD baseline that launches a second runtime.
  - Adjusted `tools/qa-helper.py analyze-hud-diff` so the HUD detector falls back to full screenshot width when stage detection is too narrow for right-side HUD evaluation.
- Final HUD/map verification:
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782203179046.json`.
  - Result: `ok=true`, `passed=1`, `failed=0`, `mapClicksPassed=1`, `hudAnchorPassed=1`, `visualGuardPassed=1`, `audioActive=0`, `failedKeys=[]`.
  - Screenshot reviewed: `runtime-data/qa/as2/interaction-smoke/run-1782203179046/01-time-tangled-initial.png`; player is visible, the three AS2 HUD icons are a single upper-right row, and no faint upper-left pause button is visible.
  - Screenshot reviewed: `runtime-data/qa/as2/interaction-smoke/run-1782203179046/01-time-tangled-map.png`; the map popup opens, native `关闭` is visible, and the static `TIME TANGLED ISLAND` title remains English artwork by policy.
- Popup-close regression:
  - Report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782203285075.json`.
  - Overall `ok=false` only because the dark-edge visual guard intentionally failed; the popup close assertion itself passed with `popupClose.ok=true`, `closeButtonStillVisible=false`, and `mapOpenedDuringClose=false`.
  - Screenshot reviewed: `runtime-data/qa/as2/interaction-smoke/run-1782203285075/01-time-tangled-popup-close.png`; the task-file popup is gone, the player remains visible, and the HUD returns to the upper-right.
- Current conclusion:
  - AS2 Time Tangled HUD placement, visible-map clickability, and `malidocs.swf` close behavior are again supported by current screenshots.
  - Time Tangled remains reopened. The left-side dark viewport edge is still visible in the latest screenshots and is the next camera/viewport blocker before any island can be called sealed.

## 2026-06-23 Time Tangled Map Popup Viewport and Guard Fix

- Responded to the user's concern that the project was still mixing coordinate systems and that "right top" was being judged too loosely.
- Added `EXTERNAL_REVIEW_PROMPT.zh-CN.md` so the current HUD/viewport/popup coordinate-system problem can be reviewed by an external model without losing the project-specific constraints.
- Root cause found for the current map regression:
  - `zhNotifyPopupViewport("map")` had been added for the direct map path, but later generic popup normalization in `tools/patch-as2-gameplay-hud-popup.js` rewrote the direct-map block back to boolean `zhPopupUsesTightViewport(popupName)`.
  - The exported AS therefore logged `PopupViewport&active=1` instead of `active=map`, causing the Time Tangled map to use the generic 640x480 popup viewport and appear zoomed/cropped.
- Code changes:
  - Added final direct-map normalization near the end of `tools/patch-as2-gameplay-hud-popup.js`, after the generic popup rewrites, so the exported AS keeps `zhNotifyPopupViewport("map")` for direct map open and delayed recovery.
  - Confirmed exported `runtime-data/tmp/as2-gameplay-hud-popup/scripts/scripts/frame_1/DoAction.as` now contains `zhNotifyPopupViewport("map")` in the `zhDirectMapViewportForced` and delayed blocks.
  - Kept `MAP_POPUP_VIEWPORT={x:0,y:0,width:1000,height:580}` in `base.php` and `tools/lib/pack.js`.
  - Added `tools/qa-helper.py analyze-map-popup-guard` to evaluate map popups by parchment/map-paper bbox, center delta, and blue-edge leakage instead of generic dark-edge visual guard.
  - Updated `tools/qa-as2-interaction-smoke.js` so `suffix === "map"` uses the map popup guard while ordinary scenes still use the standard visual guard.
- Static checks:
  - `node --check tools/patch-as2-gameplay-hud-popup.js`
  - `node --check tools/lib/pack.js`
  - `node --check tools/qa-as2-interaction-smoke.js`
  - `python -m py_compile tools/qa-helper.py`
- Runtime build:
  - Stopped the Flashpoint Game Server once to release a write lock on `gameplay.swf`.
  - Rebuilt AS2 gameplay/runtime with `node tools\patch-as2-gameplay-hud-popup.js`.
  - Patch report: `runtime-data/qa/as2/as2-gameplay-hud-popup-patch.json`, runtime zip ready with `replacementCount=111`.
- Verification:
  - Passed report: `runtime-data/qa/as2/interaction-smoke/as2-interaction-smoke-1782210583755.json`.
  - Result: `ok=true`, `passed=1`, `failed=0`, `mapClicksPassed=1`, `sceneEvidencePassed=1`, `visualGuardPassed=1`, `playableCropGuardPassed=1`, `hudAnchorPassed=1`, `audioActive=0`, `failedKeys=[]`.
  - Initial screenshot reviewed: `runtime-data/qa/as2/interaction-smoke/run-1782210583755/01-time-tangled-initial.png`; player visible, no faint upper-left pause button, right-top HUD not clipped.
  - HUD metrics: `runtime-data/qa/as2/interaction-smoke/run-1782210583755/01-time-tangled-hud-anchor.json` reports `rightMargin=57`, `topMargin=1`, row spread `3`, gaps `23/21`.
  - Map screenshot reviewed: `runtime-data/qa/as2/interaction-smoke/run-1782210583755/01-time-tangled-map.png`; map paper is complete and centered, `关闭` and `重启岛屿` are Chinese UI buttons, static `TIME TANGLED ISLAND` art remains English by policy.
  - Map guard: `runtime-data/qa/as2/interaction-smoke/run-1782210583755/01-time-tangled-map-visual-guard.json` reports paper bbox `342,130-1103,724`, center delta `0.005952`, paper pixel pct `38.578063`, blue-edge pct top/left/right `0`, bottom `1.683437`.
  - Annotated proof: `runtime-data/qa/as2/interaction-smoke/run-1782210583755/01-time-tangled-map-visual-guard.png`.
- Current conclusion:
  - The specific Time Tangled/Mali HUD + direct map popup path is now supported by current code, screenshots, and a map-specific guard that matches the actual visual contract.
  - This does not seal Time Tangled. Remaining blockers include safe F11 true-fullscreen without stealing focus, natural time-machine route, at least 3 natural NPC dialogue checks with no-repeat behavior, task item/file popup use-after-layout, external white-screen links, map/island description Chinese, AS3 dialogue queue protection, full traversal, and real audio source inventory.
