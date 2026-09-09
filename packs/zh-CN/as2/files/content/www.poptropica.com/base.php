<?php
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

function flashpoint_audio_sanitize($value) {
    $clean = preg_replace('/[^A-Za-z0-9_-]+/', '_', (string)$value);
    $clean = trim($clean);
    return $clean === '' ? null : $clean;
}

function flashpoint_audio_url_component($value) {
    return str_replace('%2F', '/', rawurlencode($value));
}

function flashpoint_collect_audio_overrides() {
    $root = __DIR__ . '/flashpoint/user-audio/as2';
    $urlRoot = '/flashpoint/user-audio/as2';
    $allowed = array('mp3' => true, 'ogg' => true, 'wav' => true, 'm4a' => true);
    $manifest = array();

    if(!is_dir($root))
        return $manifest;

    foreach(scandir($root) as $islandEntry) {
        if($islandEntry === '.' || $islandEntry === '..')
            continue;

        $islandDir = $root . DIRECTORY_SEPARATOR . $islandEntry;
        if(!is_dir($islandDir))
            continue;

        $islandKey = flashpoint_audio_sanitize($islandEntry);
        if($islandKey === null)
            continue;

        foreach(scandir($islandDir) as $fileEntry) {
            if($fileEntry === '.' || $fileEntry === '..')
                continue;

            $filePath = $islandDir . DIRECTORY_SEPARATOR . $fileEntry;
            if(!is_file($filePath))
                continue;

            $extension = strtolower(pathinfo($fileEntry, PATHINFO_EXTENSION));
            if(!isset($allowed[$extension]))
                continue;

            $sceneKey = flashpoint_audio_sanitize(pathinfo($fileEntry, PATHINFO_FILENAME));
            if($sceneKey === null)
                continue;

            $manifest[strtolower($islandKey . '/' . $sceneKey)] =
                $urlRoot . '/' . flashpoint_audio_url_component($islandEntry) . '/' . flashpoint_audio_url_component($fileEntry);
        }
    }

    return $manifest;
}
?>
<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <title>Poptropica</title>
        <link rel="icon" href="/favicon.ico">
        <script id="input" type="application/json"><?php echo htmlspecialchars(json_encode($_SERVER['REQUEST_METHOD'] === 'POST' ? $_POST : $_GET), ENT_HTML401); ?></script>
        <style>

html, body {
    margin: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

body { background-color: #111827; }

embed { background-color: #111827; }

#gameViewport {
    position: absolute;
    overflow: hidden;
    background: #111827;
}

#gameScaleHost {
    position: absolute;
    overflow: hidden;
    transform-origin: top left;
}

#flashpointMapHotspot,
#flashpointMapResetHotspot {
    position: absolute;
    z-index: 3;
    background: rgba(0, 0, 0, 0);
    cursor: pointer;
    touch-action: none;
}

#flashpointMapHotspot[hidden],
#flashpointMapResetHotspot[hidden] {
    display: none;
}

embed {
    outline-width: 0;
    position: absolute;
}

#errorText {
    position: absolute;
    left: 0px;
    top: calc(50vh + 322.5px);
    width: 100vw;
    color: white;
    font-size: 1.6em;
    font-family: "Billy Serif";
    text-align: center;
}

@font-face {
    font-family: "Billy Serif";
    src: url(/flashpoint/billySerif.ttf) format("truetype");
}

        </style>
    </head>
    <body>
        <div id="gameViewport"><div id="gameScaleHost"><embed id="game" scale="noscale" wmode="opaque" allowScriptAccess="always" menu="false" bgcolor="111827" hidden></div></div>
        <div id="flashpointMapHotspot" hidden aria-hidden="true"></div>
        <div id="flashpointMapResetHotspot" hidden aria-hidden="true"></div>
        <audio id="flashpointSceneAudio" preload="auto" autoplay loop style="position:absolute;width:0;height:0;opacity:0;pointer-events:none"></audio>
        <div id="errorText" hidden>Multiplayer features are unavailable.</div>
        <form method="POST">
            <input type="hidden" name="room">
            <input type="hidden" name="island">
            <input type="hidden" name="startup_path">
        </form>
        <script>
"use strict";

const SCENE_FP_RESTART = "FlashpointIslandRestart",
      SCENE_FP_START = "Home"; // The real starting scene.

const STATE_SCENE = 0,
      STATE_FP_AD = 1,
      STATE_FP_RESTART = 2,
      STATE_FP_START = 3,
      STATE_FP_CREATE = 4;

const SWF_STATES = [ "/framework.swf", "/flashpoint/adSkip.swf", "/flashpoint/restartIsland.swf", "/flashpoint/saveData.swf", "/flashpoint/createUser.swf" ];

const COOKIE_ADS = "ads",
      COOKIE_CHARS = "charLazyLoad",
      COOKIE_NEW_USER = "ready";

const PATH_DEFAULT = "gameplay";

const gameViewport = document.getElementById("gameViewport"),
      gameScaleHost = document.getElementById("gameScaleHost"),
      game = document.getElementById("game"),
      flashpointMapHotspot = document.getElementById("flashpointMapHotspot"),
      flashpointMapResetHotspot = document.getElementById("flashpointMapResetHotspot"),
      sceneAudio = document.getElementById("flashpointSceneAudio"),
      sceneAudioOverrides = <?php echo json_encode(flashpoint_collect_audio_overrides()); ?>,
      errorText = document.getElementById("errorText"),
      lsKey = "lastScene",
      qaAudioMuteKey = "flashpointQaMuteAudio",
      as2SoundEffectPool = [],
      AS2_SOUND_EFFECT_POOL_LIMIT = 8,
      MAP_HOTSPOT = { x: 785, y: 70, width: 95, height: 90 },
      MAP_RESET_HOTSPOT = { x: 155, y: 462, width: 120, height: 105 },
      POPUP_VIEWPORT = { x: 0, y: 0, width: 640, height: 480 },
      MAP_POPUP_VIEWPORT = { x: 0, y: 0, width: 1000, height: 580 },
      STANDARD_GAMEPLAY_VIEWPORT = { x: 0, y: 0, width: 1000, height: 580 },
      TIME_TANGLED_GAMEPLAY_LAYOUT = {
          baseWidth: 1000,
          baseHeight: 580,
          viewport: { x: 0, y: 0, width: 820, height: 580 }
      };
let viewportResizeReloadTimer = 0,
    viewportResizeLastSize = null;

main();
initMapHotspotBridge();
initMapResetHotspotBridge();
window.addEventListener("resize", () => {
    scheduleResizeRecoveryReload();
    applyCurrentViewport();
});
window.addEventListener("keydown", handleViewportRecoveryKey, true);

function main() {
    const params = getInput();
    flashpointLoad(params.island, params.room, params.startup_path);
}

function resolveGameplayViewportCrop(island, scene, gameState) {
    if(gameState === "return_user_standard" && game && game.__zhAs2PopupMode === "map")
        return MAP_POPUP_VIEWPORT;
    if(gameState === "return_user_standard" && game && game.__zhAs2PopupMode)
        return POPUP_VIEWPORT;
    if(gameState === "return_user_standard") {
        const qaViewport = resolveQaGameplayViewportCrop();
        if(qaViewport)
            return qaViewport;
        const layoutOverride = resolveGameplayLayoutOverride(island, scene);
        if(layoutOverride && layoutOverride.viewport)
            return layoutOverride.viewport;
        return STANDARD_GAMEPLAY_VIEWPORT;
    }
    return null;
}

function resolveGameplayLayoutOverride(island, scene) {
    const islandKey = String(island || "").toLowerCase();
    if(islandKey === "time")
        return TIME_TANGLED_GAMEPLAY_LAYOUT;
    return null;
}

function resolveQaGameplayViewportCrop() {
    const input = getInput();
    if(input.flashpointQaCacheBust === undefined)
        return null;
    if(input.flashpointQaViewportX === undefined && input.flashpointQaViewportY === undefined && input.flashpointQaViewportWidth === undefined && input.flashpointQaViewportHeight === undefined)
        return null;

    const x = Number(input.flashpointQaViewportX || 0),
          y = Number(input.flashpointQaViewportY || 0),
          width = Number(input.flashpointQaViewportWidth || STANDARD_GAMEPLAY_VIEWPORT.width),
          height = Number(input.flashpointQaViewportHeight || STANDARD_GAMEPLAY_VIEWPORT.height);
    if(!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height) || width < 320 || height < 240)
        return null;
    return { x, y, width, height };
}

function resolveQaGameplayBaseSize(width, height, gameState) {
    const input = getInput();
    if(gameState !== "return_user_standard" || input.flashpointQaCacheBust === undefined)
        return { width, height };

    const qaWidth = Number(input.flashpointQaBaseWidth || input.flashpointQaStageWidth || 0),
          qaHeight = Number(input.flashpointQaBaseHeight || input.flashpointQaStageHeight || 0);
    return {
        width: isFinite(qaWidth) && qaWidth >= width && qaWidth <= 1800 ? Math.round(qaWidth) : width,
        height: isFinite(qaHeight) && qaHeight >= height && qaHeight <= 1200 ? Math.round(qaHeight) : height
    };
}

function resolveGameplayBaseSize(width, height, gameState, island, scene) {
    if(gameState === "return_user_standard") {
        const layoutOverride = resolveGameplayLayoutOverride(island, scene);
        if(layoutOverride) {
            width = Math.max(width, Number(layoutOverride.baseWidth) || width);
            height = Math.max(height, Number(layoutOverride.baseHeight) || height);
        }
    }
    return resolveQaGameplayBaseSize(width, height, gameState);
}

function flashpointSetAs2PopupMode(active) {
    if(!game)
        return false;

    const activeMode = String(active).toLowerCase();
    const nextPopupMode = activeMode === "map" ? "map" : (String(active) === "1" || active === true || activeMode === "true");
    game.__zhAs2PopupMode = nextPopupMode;
    if(game.__zhViewportState) {
        game.__zhViewportState.viewportCrop = resolveGameplayViewportCrop(
            game.__zhViewportState.island,
            game.__zhViewportState.scene,
            game.__zhViewportState.gameState
        );
    }
    applyCurrentViewport();
    if(!nextPopupMode)
        scheduleAs2PopupViewportRecovery();
    return true;
}

function scheduleAs2PopupViewportRecovery() {
    [ 50, 150, 350, 800, 1500 ].forEach(function(delayMs) {
        setTimeout(function() {
            if(game && !game.__zhAs2PopupMode)
                applyCurrentViewport();
        }, delayMs);
    });
}

function initMapHotspotBridge() {
    if(!flashpointMapHotspot)
        return;

    const requestHandler = function(event) {
        if(event) {
            event.preventDefault();
            event.stopPropagation();
        }
        requestFlashMapOpen();
    };
    flashpointMapHotspot.addEventListener("mousedown", requestHandler, true);
    flashpointMapHotspot.addEventListener("click", requestHandler, true);
    flashpointMapHotspot.addEventListener("touchstart", requestHandler, { capture: true, passive: false });
}

function requestFlashMapOpen() {
    if(!game || !flashpointMapHotspot)
        return false;

    const now = Date.now();
    if(flashpointMapHotspot.__zhLastRequestAt && now - flashpointMapHotspot.__zhLastRequestAt < 450)
        return true;
    flashpointMapHotspot.__zhLastRequestAt = now;

    try {
        if(typeof game.flashpointOpenMap === "function") {
            game.flashpointOpenMap();
            return true;
        }
    } catch(err) { }

    try {
        if(typeof game.SetVariable === "function") {
            const token = String(now);
            game.SetVariable("__zhExternalMapRequest", token);
            game.SetVariable("_root.__zhExternalMapRequest", token);
            game.SetVariable("_level0.__zhExternalMapRequest", token);
            return true;
        }
    } catch(err) { }
    return false;
}

function initMapResetHotspotBridge() {
    if(!flashpointMapResetHotspot)
        return;

    const requestHandler = function(event) {
        if(event) {
            event.preventDefault();
            event.stopPropagation();
        }
        requestFlashMapResetDialog();
    };
    flashpointMapResetHotspot.addEventListener("mousedown", requestHandler, true);
    flashpointMapResetHotspot.addEventListener("click", requestHandler, true);
    flashpointMapResetHotspot.addEventListener("touchstart", requestHandler, { capture: true, passive: false });
}

function requestFlashMapResetDialog() {
    if(!game || !flashpointMapResetHotspot)
        return false;

    const now = Date.now();
    if(flashpointMapResetHotspot.__zhLastRequestAt && now - flashpointMapResetHotspot.__zhLastRequestAt < 450)
        return true;
    flashpointMapResetHotspot.__zhLastRequestAt = now;

    try {
        if(typeof game.SetVariable === "function") {
            const token = String(now);
            game.SetVariable("__zhExternalMapResetRequest", token);
            game.SetVariable("_root.__zhExternalMapResetRequest", token);
            game.SetVariable("_level0.__zhExternalMapResetRequest", token);
            return true;
        }
    } catch(err) { }
    return false;
}

function resolveMapHotspot(viewport) {
    const hotspot = Object.assign({}, MAP_HOTSPOT);
    if(viewport && viewport.useViewportCrop) {
        const cropRight = Number(viewport.cropLeft || 0) + Number(viewport.cropWidth || 0);
        hotspot.x = Math.max(Number(viewport.cropLeft || 0), cropRight - 110);
        hotspot.y = -5;
        hotspot.width = 105;
        hotspot.height = 80;
    }
    return hotspot;
}

function applyMapHotspot(viewport, gameState) {
    if(!flashpointMapHotspot)
        return;

    if(gameState !== "return_user_standard" || game.__zhAs2PopupMode) {
        flashpointMapHotspot.hidden = true;
        return;
    }

    const scale = viewport.useViewportCrop ? viewport.viewportScale : 1;
    const anchorLeft = viewport.useViewportCrop ? viewport.contentOffsetLeft : viewport.offsetLeft;
    const anchorTop = viewport.useViewportCrop ? viewport.contentOffsetTop : viewport.offsetTop;
    const hotspot = resolveMapHotspot(viewport);
    flashpointMapHotspot.hidden = false;
    flashpointMapHotspot.style.left = `${ anchorLeft + (hotspot.x - viewport.cropLeft) * scale }px`;
    flashpointMapHotspot.style.top = `${ anchorTop + (hotspot.y - viewport.cropTop) * scale }px`;
    flashpointMapHotspot.style.width = `${ hotspot.width * scale }px`;
    flashpointMapHotspot.style.height = `${ hotspot.height * scale }px`;
}

function applyMapResetHotspot(viewport, gameState) {
    if(!flashpointMapResetHotspot)
        return;

    if(gameState !== "return_user_standard" || !game.__zhAs2PopupMode || String(game.__zhAs2PopupMode).toLowerCase() !== "map") {
        flashpointMapResetHotspot.hidden = true;
        return;
    }

    const scale = viewport.useViewportCrop ? viewport.viewportScale : 1;
    const anchorLeft = viewport.useViewportCrop ? viewport.contentOffsetLeft : viewport.offsetLeft;
    const anchorTop = viewport.useViewportCrop ? viewport.contentOffsetTop : viewport.offsetTop;
    flashpointMapResetHotspot.hidden = false;
    flashpointMapResetHotspot.style.left = `${ anchorLeft + (MAP_RESET_HOTSPOT.x - viewport.cropLeft) * scale }px`;
    flashpointMapResetHotspot.style.top = `${ anchorTop + (MAP_RESET_HOTSPOT.y - viewport.cropTop) * scale }px`;
    flashpointMapResetHotspot.style.width = `${ MAP_RESET_HOTSPOT.width * scale }px`;
    flashpointMapResetHotspot.style.height = `${ MAP_RESET_HOTSPOT.height * scale }px`;
}

function computeScaledViewport(baseWidth, baseHeight, gameState, viewportCrop) {
    const crop = viewportCrop || { x: 0, y: 0, width: baseWidth, height: baseHeight };
    const browserViewport = stableBrowserViewportSize();
    let displayWidth = baseWidth;
    let displayHeight = baseHeight;
    let viewportWidth = baseWidth;
    let viewportHeight = baseHeight;
    let offsetLeft = 0;
    let offsetTop = 0;
    let contentOffsetLeft = 0;
    let contentOffsetTop = 0;
    let viewportScale = 1;
    let cropLeft = 0;
    let cropTop = 0;
    let useViewportCrop = false;

    if(gameState === "return_user_standard") {
        viewportScale = Math.max(0.25, Math.min(browserViewport.width / crop.width, browserViewport.height / crop.height));
        displayWidth = baseWidth;
        displayHeight = baseHeight;
        viewportWidth = Math.max(1, browserViewport.width);
        viewportHeight = Math.max(1, browserViewport.height);
        contentOffsetLeft = Math.max(0, Math.round((browserViewport.width - crop.width * viewportScale) / 2));
        contentOffsetTop = Math.max(0, Math.round((browserViewport.height - crop.height * viewportScale) / 2));
        cropLeft = crop.x;
        cropTop = crop.y;
        useViewportCrop = true;
    }

    return { displayWidth, displayHeight, viewportWidth, viewportHeight, offsetLeft, offsetTop, contentOffsetLeft, contentOffsetTop, viewportScale, cropLeft, cropTop, useViewportCrop, cropWidth: crop.width, cropHeight: crop.height };
}

function stableBrowserViewportSize() {
    const innerWidth = Number(window.innerWidth || 0),
          innerHeight = Number(window.innerHeight || 0),
          widthCandidates = [
              innerWidth,
              window.outerWidth ? window.outerWidth - 12 : 0,
              document.documentElement ? document.documentElement.clientWidth : 0,
              document.body ? document.body.clientWidth : 0
          ].map(Number).filter(function(value) { return isFinite(value) && value > 0; }),
          heightCandidates = [
              innerHeight,
              window.outerHeight ? window.outerHeight - 140 : 0,
              document.documentElement ? document.documentElement.clientHeight : 0,
              document.body ? document.body.clientHeight : 0
          ].map(Number).filter(function(value) { return isFinite(value) && value > 0; });
    return {
        width: Math.max(1, Math.round(innerWidth > 0 ? innerWidth : Math.max.apply(Math, widthCandidates.length ? widthCandidates : [ 1 ]))),
        height: Math.max(1, Math.round(innerHeight > 0 ? innerHeight : Math.max.apply(Math, heightCandidates.length ? heightCandidates : [ 1 ])))
    };
}

function scheduleResizeRecoveryReload() {
    const size = stableBrowserViewportSize();
    const state = game.__zhViewportState;
    if(!state || state.gameState !== "return_user_standard") {
        viewportResizeLastSize = size;
        return;
    }
    if(!viewportResizeLastSize) {
        viewportResizeLastSize = size;
        return;
    }
    const shrank = viewportResizeLastSize.width - size.width > 80 || viewportResizeLastSize.height - size.height > 80;
    viewportResizeLastSize = size;
    if(!shrank)
        return;
    if(resizeRecoveryAlreadyReloaded())
        return;
    if(viewportResizeReloadTimer)
        clearTimeout(viewportResizeReloadTimer);
    viewportResizeReloadTimer = setTimeout(reloadAfterViewportShrink, 900);
}

function resizeRecoveryAlreadyReloaded() {
    try {
        return new URL(window.location.href).searchParams.has("flashpointResizeReload");
    } catch(err) {
        return String(window.location.search || "").indexOf("flashpointResizeReload=") >= 0;
    }
}

function reloadAfterViewportShrink() {
    if(resizeRecoveryAlreadyReloaded()) {
        applyCurrentViewport();
        return;
    }
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete("flashpointQaLoadingHoldMs");
        url.searchParams.set("flashpointResizeReload", String(Date.now()));
        window.location.replace(url.toString());
    } catch(err) {
        window.location.reload();
    }
}

function handleViewportRecoveryKey(event) {
    const key = String(event && event.key || "").toUpperCase();
    const code = Number(event && (event.keyCode || event.which) || 0);
    if(key !== "F11" && code !== 122)
        return;
    if(viewportResizeReloadTimer)
        clearTimeout(viewportResizeReloadTimer);
    viewportResizeReloadTimer = setTimeout(reloadAfterViewportShrink, 3000);
}

function applyGameViewport(viewport, gameState) {
    document.documentElement.style.width = `${ viewport.viewportWidth }px`;
    document.documentElement.style.height = `${ viewport.viewportHeight }px`;
    document.body.style.width = `${ viewport.viewportWidth }px`;
    document.body.style.height = `${ viewport.viewportHeight }px`;
    game.setAttribute("scale", "noscale");
    game.width = viewport.displayWidth;
    game.height = viewport.displayHeight;
    game.setAttribute("width", String(viewport.displayWidth));
    game.setAttribute("height", String(viewport.displayHeight));
    game.style.width = `${ viewport.displayWidth }px`;
    game.style.height = `${ viewport.displayHeight }px`;
    if(gameState === "return_user_standard") {
        gameViewport.style.width = `${ viewport.viewportWidth }px`;
        gameViewport.style.height = `${ viewport.viewportHeight }px`;
        gameViewport.style.left = `${ viewport.offsetLeft }px`;
        gameViewport.style.top = `${ viewport.offsetTop }px`;
        gameViewport.style.transform = "";
        gameScaleHost.style.width = `${ viewport.cropWidth }px`;
        gameScaleHost.style.height = `${ viewport.cropHeight }px`;
        gameScaleHost.style.left = `${ viewport.contentOffsetLeft }px`;
        gameScaleHost.style.top = `${ viewport.contentOffsetTop }px`;
        gameScaleHost.style.transform = `scale(${ viewport.viewportScale })`;
        game.style.left = `-${ viewport.cropLeft }px`;
        game.style.top = `-${ viewport.cropTop }px`;
    } else {
        gameViewport.style.width = `${ viewport.displayWidth }px`;
        gameViewport.style.height = `${ viewport.displayHeight }px`;
        gameViewport.style.left = `calc(50vw - ${ viewport.displayWidth }px / 2)`;
        gameViewport.style.top = `calc(50vh - ${ viewport.displayHeight }px / 2)`;
        gameViewport.style.transform = "";
        gameScaleHost.style.width = `${ viewport.displayWidth }px`;
        gameScaleHost.style.height = `${ viewport.displayHeight }px`;
        gameScaleHost.style.left = "0px";
        gameScaleHost.style.top = "0px";
        gameScaleHost.style.transform = "";
        game.style.left = "0px";
        game.style.top = "0px";
    }
    applyMapHotspot(viewport, gameState);
    applyMapResetHotspot(viewport, gameState);
    viewportResizeLastSize = stableBrowserViewportSize();
}

function applyCurrentViewport() {
    if(!game.__zhViewportState)
        return;

    game.__zhViewportState.viewportCrop = resolveGameplayViewportCrop(
        game.__zhViewportState.island,
        game.__zhViewportState.scene,
        game.__zhViewportState.gameState
    );
    const viewport = computeScaledViewport(
        game.__zhViewportState.baseWidth,
        game.__zhViewportState.baseHeight,
        game.__zhViewportState.gameState,
        game.__zhViewportState.viewportCrop
    );
    applyGameViewport(viewport, game.__zhViewportState.gameState);
}

function refreshCurrentViewport() {
    scheduleResizeRecoveryReload();
    applyCurrentViewport();
}

function scheduleViewportRefreshes() {
    [ 50, 150, 350, 800, 1500, 3000, 6000, 9000, 12000, 16000, 22000, 30000, 45000 ].forEach(function(delayMs) {
        setTimeout(refreshCurrentViewport, delayMs);
    });
    if(!scheduleViewportRefreshes.intervalId)
        scheduleViewportRefreshes.intervalId = setInterval(refreshCurrentViewport, 2000);
}

function sanitizeAudioKeyPart(value) {
    return String(value || "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function resolveAs2SoundEffect(soundName) {
    const soundKey = sanitizeAudioKeyPart(soundName);
    if(!soundKey)
        return null;
    return sceneAudioOverrides["_sounds/" + soundKey] || null;
}

function isEnabledFlag(value) {
    return /^(1|true|yes|y|muted)$/i.test(String(value || ""));
}

function resolveQaAudioMuted() {
    const input = getInput(),
          explicitValue = input.flashpointQaMuteAudio !== undefined ? input.flashpointQaMuteAudio : input.flashpoint_mute_audio;

    if(explicitValue !== undefined) {
        const muted = isEnabledFlag(explicitValue);
        try {
            sessionStorage.setItem(qaAudioMuteKey, muted ? "1" : "0");
            localStorage.setItem(qaAudioMuteKey, muted ? "1" : "0");
        } catch(err) { }
        return muted;
    }

    try {
        return isEnabledFlag(sessionStorage.getItem(qaAudioMuteKey) || localStorage.getItem(qaAudioMuteKey));
    } catch(err) {
        return false;
    }
}

function applyQaAudioMute(audioElement, audibleVolume) {
    const muted = resolveQaAudioMuted();
    audioElement.muted = muted;
    audioElement.volume = muted ? 0 : audibleVolume;
    return muted;
}

function flashpointPlayAs2Sound(soundName) {
    const audioSrc = resolveAs2SoundEffect(soundName);
    if(!audioSrc)
        return false;

    try {
        const soundAudio = new Audio(audioSrc);
        soundAudio.preload = "auto";
        soundAudio.autoplay = true;
        soundAudio.loop = false;
        applyQaAudioMute(soundAudio, 0.55);
        as2SoundEffectPool.push(soundAudio);
        while(as2SoundEffectPool.length > AS2_SOUND_EFFECT_POOL_LIMIT) {
            const oldAudio = as2SoundEffectPool.shift();
            try { oldAudio.pause(); } catch(err) { }
        }
        soundAudio.addEventListener("ended", function() {
            const index = as2SoundEffectPool.indexOf(soundAudio);
            if(index >= 0)
                as2SoundEffectPool.splice(index, 1);
        });
        const playResult = soundAudio.play();
        if(playResult && typeof playResult.catch === "function")
            playResult.catch(function() { });
        return true;
    } catch(err) {
        return false;
    }
}

window.flashpointPlayAs2Sound = flashpointPlayAs2Sound;
window.flashpointSetAs2PopupMode = flashpointSetAs2PopupMode;

function updateSceneAudio(island, scene, gameState) {
    if(!sceneAudio)
        return;

    let audioSrc = null;
    if(gameState === "return_user_standard") {
        const islandKey = sanitizeAudioKeyPart(island),
              sceneKey = sanitizeAudioKeyPart(scene),
              candidates = [
                  islandKey + "/" + sceneKey,
                  islandKey + "/default",
                  "_global/" + sceneKey
              ];

        for(let index = 0; index < candidates.length; index++) {
            if(sceneAudioOverrides[candidates[index]]) {
                audioSrc = sceneAudioOverrides[candidates[index]];
                break;
            }
        }
    }

    if(!audioSrc) {
        sceneAudio.pause();
        sceneAudio.removeAttribute("src");
        try { sceneAudio.load(); } catch(err) { }
        return;
    }

    if(sceneAudio.getAttribute("src") !== audioSrc) {
        sceneAudio.autoplay = true;
        sceneAudio.loop = true;
        applyQaAudioMute(sceneAudio, 0.35);
        sceneAudio.setAttribute("autoplay", "autoplay");
        sceneAudio.setAttribute("src", audioSrc);
        sceneAudio.src = audioSrc;
        sceneAudio.load();
    }

    try {
        const playResult = sceneAudio.play();
        if(playResult && typeof playResult.catch === "function")
            playResult.catch(function() { });
    } catch(err) { }
}

function resolveSwfStateUrl(url) {
    const inputParams = getInput();
    if(url === "/framework.swf" && inputParams.flashpointQaCacheBust !== undefined) {
        const separator = url.indexOf("?") >= 0 ? "&" : "?";
        return url + separator + "flashpointQaCacheBust=" + encodeURIComponent(inputParams.flashpointQaCacheBust);
    }
    return url;
}

function flashpointLoad(island, scene, path = PATH_DEFAULT) {
    let adScene = false,
        pageState;

    switch(scene) {
        case SCENE_FP_RESTART:
            pageState = STATE_FP_RESTART;
            break;
        case SCENE_FP_START:
            pageState = STATE_FP_START;
            break;
        default:
            if(scene.startsWith("Ad")) {
                if(getAdStatus()) {
                    pageState = STATE_SCENE;
                    adScene = true;
                } else {
                    pageState = STATE_FP_AD;
                }
            } else if(getCookieFlag(COOKIE_NEW_USER, false)) {
                pageState = STATE_FP_CREATE;
                setCookieFlag(COOKIE_NEW_USER, false);
            } else {
                pageState = STATE_SCENE;

                if(!scene.endsWith("Common")) { // Mostly detects "{island}Common" scenes, but also Early Poptropica's "Common" scene and Red Dragon Island's "LibraryCommon" scene.
                    const SPECIAL_COMMONS = [ "Coconut", "Party", "Cinema", "News", "HairClub", "Airlines", "Saltys", "Crop", "BaguetteInn", "Billiards", "MidasGym", "BrokenBarrel", "HotelInterior", "ClubInterior" ];

                    if(!(SPECIAL_COMMONS.includes(scene) || scene === "Arcade" && island === "Early")) { // Wimpy Boardwalk Island has a normal scene named "Arcade".
                        break;
                    }
                }

                errorText.hidden = false;
            }

            break;
    }

    game.hidden = false;
    let width, height, gameState;

    if(adScene) {
        gameState = "return_user_advertisement_1";
        width = 776;
        height = 480;
    } else if(scene === SCENE_FP_START) {
        gameState = "init";
        width = 800;
        height = 480;
    } else {
        gameState = "return_user_standard";
        width = 1010;
        height = 645;
    }
    const gameplayBaseSize = resolveGameplayBaseSize(width, height, gameState, island, scene);
    width = gameplayBaseSize.width;
    height = gameplayBaseSize.height;

    const flashVars = new URLSearchParams();
    flashVars.set("desc", scene);
    flashVars.set("island", island);
    flashVars.set("startup_path", path);
    flashVars.set("state", gameState);
    const inputParams = getInput();
    if(inputParams.flashpointQaCacheBust !== undefined) {
        flashVars.set("flashpointQaCacheBust", inputParams.flashpointQaCacheBust);
        flashVars.set("flashpointQaGameplayUrl", "gameplay-zh.swf");
    }
    if(inputParams.flashpoint_auto_open_map_after_ms !== undefined)
        flashVars.set("flashpoint_auto_open_map_after_ms", inputParams.flashpoint_auto_open_map_after_ms);
    if(inputParams.flashpointQaAs2Dialog !== undefined)
        flashVars.set("flashpointQaAs2Dialog", inputParams.flashpointQaAs2Dialog);
    if(inputParams.flashpointQaAs2Popup !== undefined)
        flashVars.set("flashpointQaAs2Popup", inputParams.flashpointQaAs2Popup);
    if(inputParams.flashpointQaLoadingHoldMs !== undefined)
        flashVars.set("flashpointQaLoadingHoldMs", inputParams.flashpointQaLoadingHoldMs);
    if(inputParams.flashpointQaHideHud !== undefined)
        flashVars.set("flashpointQaHideHud", inputParams.flashpointQaHideHud);
    if(inputParams.flashpointQaStartX !== undefined)
        flashVars.set("flashpointQaStartX", inputParams.flashpointQaStartX);
    if(inputParams.flashpointQaStartY !== undefined)
        flashVars.set("flashpointQaStartY", inputParams.flashpointQaStartY);

    game.__zhAs2PopupMode = false;
    if(getCharLazyLoadStatus()) {
        flashVars.set("charLazyLoad", "1");
    }

    const viewportCrop = resolveGameplayViewportCrop(island, scene, gameState);
    const viewport = computeScaledViewport(width, height, gameState, viewportCrop);
    game.__zhViewportState = { baseWidth: width, baseHeight: height, gameState, viewportCrop, island, scene, path };
    applyGameViewport(viewport, gameState);
    scheduleViewportRefreshes();
    game.setAttribute("flashvars", flashVars);
    updateSceneAudio(island, scene, gameState);

    if(pageState === STATE_FP_START)
        loadFPStart(resolveSwfStateUrl(SWF_STATES[pageState]));
    else {
        if(pageState === STATE_SCENE)
            sceneChange(island, scene);

        game.src = resolveSwfStateUrl(SWF_STATES[pageState]);
    }
}

function flashpointError(recoverable) {
    if(recoverable)
        location.reload();
    else {
        alert("A fatal error occurred.");
        location.href = "/";
    }
}

function getAdStatus() {
    return getCookieFlag(COOKIE_ADS, false);
}

function getCharLazyLoadStatus() {
    return getCookieFlag(COOKIE_CHARS, false);
}

function loadFPStart(extraMenuSrc) {
    game.setAttribute("wmode", "opaque");

    const extraMenu = game.cloneNode();
    extraMenu.height = 58;
    extraMenu.src = extraMenuSrc;
    extraMenu.id = null;
    game.parentNode.insertBefore(extraMenu, game.nextElementSibling);

    window.flashpointLoad = function() {
        game.src = resolveSwfStateUrl(SWF_STATES[STATE_SCENE]);
        game.hidden = extraMenu.hidden = false;
        extraMenu.style.top = `calc(50vh + ${ game.height }px / 2)`;
    };

    window.setInteractivity = function(enabled) {
        extraMenu.style.opacity = game.style.opacity = enabled ? null : 0.6;
        extraMenu.style.pointerEvents = game.style.pointerEvents = enabled ? null : "none";
    };

    window.loadTrackingPixel = function() {
        setInteractivity(false);
        extraMenu.newUser();
    };

    window.newUserAccept = function() {
        setCookieFlag(COOKIE_NEW_USER, true);
        finalize();
    };

    window.returnUser = function() {
        game.remove();
        setTimeout(function() { extraMenu.returnUser(); }, 1); // Wait until `game` has unloaded. `extraMenu.returnUser()` and `requestAnimationFrame(extraMenu.returnUser)` don't work in time for... reasons?
    };

    window.returnUserAccept = function() {
        let island = "Early",
            scene = "City2";
        const lastScene = getLastScene();

        if(lastScene) {
            island = lastScene.island;
            scene = lastScene.scene;
        }

        finalize();
        POSTToBase(scene, island, PATH_DEFAULT);
    };

    window.newUserReject = window.returnUserReject = function() {
        location.reload();
    };

    window.setAdStatus = function(enabled) {
        return setCookieFlag(COOKIE_ADS, enabled);
    };

    window.setCharLazyLoadStatus = function(enabled) {
        return setCookieFlag(COOKIE_CHARS, enabled);
    };

    window.finalize = function() {
        setInteractivity(true);
        extraMenu.remove();
    };
}

// Utilities

function getInput() {
    let obj;

    try {
        obj = JSON.parse(document.getElementById("input").innerText);
    } catch(err) { }

    if(typeof obj !== "object" || obj === null || Array.isArray(obj))
        obj = { };

    if(typeof obj.room !== "string")
        obj.room = SCENE_FP_START;

    if(typeof obj.island !== "string")
        obj.island = "Home";

    if(typeof obj.startup_path !== "string")
        obj.startup_path = PATH_DEFAULT;

    return obj;
}

function sceneChange(island, scene) {
    try {
        localStorage.setItem(lsKey, JSON.stringify({ island, scene }));
    } catch(err) { }
}

function getLastScene() {
    try {
        const data = JSON.parse(localStorage.getItem(lsKey));

        if(typeof data === "object" && data !== null && typeof data.island === "string" && typeof data.scene === "string")
            return data;
    } catch(err) { }

    return null;
}

function getCookieFlag(name, defaultValue) { // Returns true if flag is ENABLED
    const res = new RegExp(`(^|;)\\s*${ name }=(.)`, "").exec(document.cookie);
    return res ? res[2] !== "0" : defaultValue;
}

function setCookieFlag(name, enabled) {
    document.cookie = `${ name }=${ enabled ? "1" : "0" };expires=${ new Date(Date.now() + 315576000000) };path=/`;
}

// Game functions

function dbug(message) {
    console.log(message);
}

function POSTToBase(...args) {
    const form = document.forms[0];

    if(form.children.length === args.length) {
        for(let i = 0; i < args.length; i++)
            form.children[i].setAttribute("value", args[i]);

        form.submit();
    }
}

        </script>
    </body>
</html>
