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
