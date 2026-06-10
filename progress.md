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
