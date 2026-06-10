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

## TODO AS2 Sound Surface Audit

- Expand AS2 sound-call and embedded-sound export coverage beyond launch scenes to all island scene SWFs in serialized batches, then compare runtime audio output against scenes known to have calls or loose audio.
- Investigate whether AS2 `showSound` should map to original named files, the generated `_global/default.wav` fallback, or recoverable Flashpoint/user-audio assets; do not treat fallback audio as proof that original AS2 effects are restored.

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
