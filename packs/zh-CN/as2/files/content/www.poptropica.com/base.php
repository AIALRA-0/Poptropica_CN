<?php
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

body, embed { background-color: #139ffd; }

#gameViewport {
    position: absolute;
    overflow: hidden;
}

#flashpointMapHotspot {
    position: absolute;
    z-index: 3;
    background: rgba(0, 0, 0, 0);
    cursor: pointer;
    touch-action: none;
}

#flashpointMapHotspot[hidden] {
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
        <div id="gameViewport"><embed id="game" scale="noscale" wmode="opaque" allowScriptAccess="always" menu="false" bgcolor="139ffd" hidden></div>
        <div id="flashpointMapHotspot" hidden aria-hidden="true"></div>
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
      game = document.getElementById("game"),
      flashpointMapHotspot = document.getElementById("flashpointMapHotspot"),
      sceneAudio = document.getElementById("flashpointSceneAudio"),
      sceneAudioOverrides = <?php echo json_encode(flashpoint_collect_audio_overrides()); ?>,
      errorText = document.getElementById("errorText"),
      lsKey = "lastScene",
      as2SoundEffectPool = [],
      AS2_SOUND_EFFECT_POOL_LIMIT = 8,
      MAP_HOTSPOT = { x: 785, y: 70, width: 95, height: 90 },
      STANDARD_GAMEPLAY_VIEWPORT = { x: 0, y: 44, width: 1010, height: 500 };

main();
initMapHotspotBridge();
window.addEventListener("resize", () => applyCurrentViewport());

function main() {
    const params = getInput();
    flashpointLoad(params.island, params.room, params.startup_path);
}

function resolveGameplayViewportCrop(island, scene, gameState) {
    return null;
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

function applyMapHotspot(viewport, gameState) {
    if(!flashpointMapHotspot)
        return;

    if(gameState !== "return_user_standard") {
        flashpointMapHotspot.hidden = true;
        return;
    }

    const scale = viewport.useViewportCrop ? viewport.viewportScale : 1;
    flashpointMapHotspot.hidden = false;
    flashpointMapHotspot.style.left = `${ viewport.offsetLeft + (MAP_HOTSPOT.x - viewport.cropLeft) * scale }px`;
    flashpointMapHotspot.style.top = `${ viewport.offsetTop + (MAP_HOTSPOT.y - viewport.cropTop) * scale }px`;
    flashpointMapHotspot.style.width = `${ MAP_HOTSPOT.width * scale }px`;
    flashpointMapHotspot.style.height = `${ MAP_HOTSPOT.height * scale }px`;
}

function computeScaledViewport(baseWidth, baseHeight, gameState, viewportCrop) {
    const crop = viewportCrop || { x: 0, y: 0, width: baseWidth, height: baseHeight };
    let displayWidth = baseWidth;
    let displayHeight = baseHeight;
    let viewportWidth = baseWidth;
    let viewportHeight = baseHeight;
    let offsetLeft = 0;
    let offsetTop = 0;
    let viewportScale = 1;
    let cropLeft = 0;
    let cropTop = 0;
    let useViewportCrop = false;

    if(gameState === "return_user_standard") {
        viewportScale = Math.max(0.25, Math.max(window.innerWidth / crop.width, window.innerHeight / crop.height));
        displayWidth = baseWidth;
        displayHeight = baseHeight;
        viewportWidth = crop.width;
        viewportHeight = crop.height;
        offsetLeft = Math.min(0, Math.round((window.innerWidth - viewportWidth * viewportScale) / 2));
        offsetTop = Math.min(0, Math.round((window.innerHeight - viewportHeight * viewportScale) / 2));
        cropLeft = crop.x;
        cropTop = crop.y;
        useViewportCrop = true;
    }

    return { displayWidth, displayHeight, viewportWidth, viewportHeight, offsetLeft, offsetTop, viewportScale, cropLeft, cropTop, useViewportCrop };
}

function applyGameViewport(viewport, gameState) {
    game.width = viewport.displayWidth;
    game.height = viewport.displayHeight;
    game.setAttribute("width", String(viewport.displayWidth));
    game.setAttribute("height", String(viewport.displayHeight));
    game.style.width = `${ viewport.displayWidth }px`;
    game.style.height = `${ viewport.displayHeight }px`;
    if(gameState === "return_user_standard") {
        gameViewport.style.width = `${ viewport.viewportWidth }px`;
        gameViewport.style.height = `${ viewport.viewportHeight }px`;
        gameViewport.style.left = "0px";
        gameViewport.style.top = "0px";
        gameViewport.style.transformOrigin = "top left";
        gameViewport.style.transform = `translate(${ viewport.offsetLeft }px, ${ viewport.offsetTop }px) scale(${ viewport.viewportScale })`;
        game.style.left = `-${ viewport.cropLeft }px`;
        game.style.top = `-${ viewport.cropTop }px`;
    } else {
        gameViewport.style.width = `${ viewport.displayWidth }px`;
        gameViewport.style.height = `${ viewport.displayHeight }px`;
        gameViewport.style.left = `calc(50vw - ${ viewport.displayWidth }px / 2)`;
        gameViewport.style.top = `calc(50vh - ${ viewport.displayHeight }px / 2)`;
        gameViewport.style.transformOrigin = "";
        gameViewport.style.transform = "";
        game.style.left = "0px";
        game.style.top = "0px";
    }
    applyMapHotspot(viewport, gameState);
}

function applyCurrentViewport() {
    if(!game.__zhViewportState)
        return;

    const viewport = computeScaledViewport(
        game.__zhViewportState.baseWidth,
        game.__zhViewportState.baseHeight,
        game.__zhViewportState.gameState,
        game.__zhViewportState.viewportCrop
    );
    applyGameViewport(viewport, game.__zhViewportState.gameState);
}

function scheduleViewportRefreshes() {
    [ 50, 150, 350, 800, 1500, 3000, 6000, 9000, 12000, 16000, 22000, 30000, 45000 ].forEach(function(delayMs) {
        setTimeout(applyCurrentViewport, delayMs);
    });
    if(!scheduleViewportRefreshes.intervalId)
        scheduleViewportRefreshes.intervalId = setInterval(applyCurrentViewport, 5000);
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

function flashpointPlayAs2Sound(soundName) {
    const audioSrc = resolveAs2SoundEffect(soundName);
    if(!audioSrc)
        return false;

    try {
        const soundAudio = new Audio(audioSrc);
        soundAudio.preload = "auto";
        soundAudio.autoplay = true;
        soundAudio.loop = false;
        soundAudio.muted = false;
        soundAudio.volume = 0.55;
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
                  "_global/" + sceneKey,
                  "_global/default"
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
        sceneAudio.muted = false;
        sceneAudio.volume = 0.35;
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

    const flashVars = new URLSearchParams();
    flashVars.set("desc", scene);
    flashVars.set("island", island);
    flashVars.set("startup_path", path);
    flashVars.set("state", gameState);
    const inputParams = getInput();
    if(inputParams.flashpoint_auto_open_map_after_ms !== undefined)
        flashVars.set("flashpoint_auto_open_map_after_ms", inputParams.flashpoint_auto_open_map_after_ms);

    if(getCharLazyLoadStatus()) {
        flashVars.set("charLazyLoad", "1");
    }

    const viewportCrop = resolveGameplayViewportCrop(island, scene, gameState);
    const viewport = computeScaledViewport(width, height, gameState, viewportCrop);
    game.__zhViewportState = { baseWidth: width, baseHeight: height, gameState, viewportCrop };
    applyGameViewport(viewport, gameState);
    scheduleViewportRefreshes();
    game.setAttribute("flashvars", flashVars);
    updateSceneAudio(island, scene, gameState);

    if(pageState === STATE_FP_START)
        loadFPStart(SWF_STATES[pageState]);
    else {
        if(pageState === STATE_SCENE)
            sceneChange(island, scene);

        game.src = SWF_STATES[pageState];
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
        game.src = SWF_STATES[STATE_SCENE];
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
