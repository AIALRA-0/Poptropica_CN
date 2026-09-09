const AS3_DIRECT_WRAPPER_PATH = "content/www.poptropica.com/flashpoint/as3-direct.php";

function normalizeResizeMode(value) {
  if (value === true) {
    return "page";
  }
  if (value === false) {
    return "0";
  }
  if (value === undefined || value === null || value === "") {
    return "page";
  }
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "1" || mode === "true" || mode === "yes" || mode === "frame" || mode === "iframe") {
    return "frame";
  }
  if (mode === "page" || mode === "top" || mode === "reload") {
    return "page";
  }
  return "0";
}

function normalizeSeedIsland(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_]+$/u.test(text) ? text : "";
}

function normalizeAutoLoadIsland(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_]+$/u.test(text) ? text : "";
}

function normalizeSeedEvents(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = new Set();
  const events = [];
  for (const entry of raw) {
    const event = String(entry || "").trim();
    if (!/^[A-Za-z0-9_]+$/u.test(event) || seen.has(event)) {
      continue;
    }
    seen.add(event);
    events.push(event);
  }
  return events;
}

function normalizeStartCoordinate(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "";
}

function normalizeStartDirection(value) {
  const direction = String(value || "").trim().toLowerCase();
  return direction === "left" || direction === "right" ? direction : "";
}

function normalizeQaLoadingHoldMs(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return "";
  }
  return String(Math.min(15000, Math.max(0, Math.round(number))));
}

function normalizeQaDialogNpc(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(text) ? text : "";
}

function normalizeQaDialogId(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_ -]{1,64}$/u.test(text) ? text : "";
}

function normalizeQaAutoScene(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_.$]+$/u.test(text) ? text : "";
}

function normalizeQaAutoSceneDelayMs(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return "";
  }
  return String(Math.min(15000, Math.max(500, Math.round(number))));
}

function normalizeEmbedDelayMs(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return "";
  }
  return String(Math.min(10000, Math.max(0, Math.round(number))));
}

function buildAs3DirectSceneUrl(as3TargetScene, options = {}) {
  const params = new URLSearchParams();
  const targetScene = String(as3TargetScene || "").trim();
  if (targetScene) {
    params.set("overrideScene", targetScene);
  }
  params.set("reloadOnResize", normalizeResizeMode(options.reloadOnResize));
  const seedIsland = normalizeSeedIsland(options.seedIsland || options.flashpointSeedIsland);
  const seedEvents = normalizeSeedEvents(options.seedEvents || options.flashpointSeedEvents);
  const startX = normalizeStartCoordinate(options.startX || options.flashpointStartX);
  const startY = normalizeStartCoordinate(options.startY || options.flashpointStartY);
  const startDirection = normalizeStartDirection(options.startDirection || options.flashpointStartDirection);
  const qaLoadingHoldMs = normalizeQaLoadingHoldMs(options.qaLoadingHoldMs || options.flashpointQaLoadingHoldMs);
  const qaDialogNpc = normalizeQaDialogNpc(options.qaDialogNpc || options.flashpointQaDialogNpc);
  const qaDialogId = normalizeQaDialogId(options.qaDialogId || options.flashpointQaDialogId);
  const qaAutoScene = normalizeQaAutoScene(options.qaAutoScene || options.flashpointQaAutoScene);
  const qaAutoSceneDelayMs = normalizeQaAutoSceneDelayMs(options.qaAutoSceneDelayMs || options.flashpointQaAutoSceneDelayMs);
  const embedDelayMs = normalizeEmbedDelayMs(options.embedDelayMs || options.flashpointEmbedDelayMs);
  const autoLoadIsland = normalizeAutoLoadIsland(options.autoLoadIsland || options.flashpointAutoLoadIsland);
  if (seedIsland) {
    params.set("flashpointSeedIsland", seedIsland);
  }
  if (autoLoadIsland) {
    params.set("flashpointAutoLoadIsland", autoLoadIsland);
  }
  if (seedEvents.length) {
    params.set("flashpointSeedEvents", seedEvents.join(","));
  }
  if (startX) {
    params.set("flashpointStartX", startX);
  }
  if (startY) {
    params.set("flashpointStartY", startY);
  }
  if (startDirection) {
    params.set("flashpointStartDirection", startDirection);
  }
  if (qaLoadingHoldMs) {
    params.set("flashpointQaLoadingHoldMs", qaLoadingHoldMs);
  }
  if (qaDialogNpc) {
    params.set("flashpointQaDialogNpc", qaDialogNpc);
  }
  if (qaDialogId) {
    params.set("flashpointQaDialogId", qaDialogId);
  }
  if (qaAutoScene) {
    params.set("flashpointQaAutoScene", qaAutoScene);
  }
  if (qaAutoSceneDelayMs) {
    params.set("flashpointQaAutoSceneDelayMs", qaAutoSceneDelayMs);
  }
  if (embedDelayMs) {
    params.set("flashpointEmbedDelayMs", embedDelayMs);
  }
  const query = params.toString();
  return `http://www.poptropica.com/flashpoint/as3-direct.php${query ? `?${query}` : ""}`;
}

function buildAs3DirectWrapperPhp() {
  return `<?php
function flashpoint_as3_param($name, $default = '') {
    return isset($_GET[$name]) ? (string)$_GET[$name] : $default;
}

$scene = flashpoint_as3_param('overrideScene', flashpoint_as3_param('scene', ''));
if(!preg_match('/^[A-Za-z0-9_.$]+$/', $scene)) {
    $scene = '';
}

$resizeMode = flashpoint_as3_param('reloadOnResize', 'page');
if(!in_array($resizeMode, array('0', 'frame', 'iframe', '1', 'page', 'top', 'reload'), true)) {
    $resizeMode = '0';
}
$maxEmbedWidth = flashpoint_as3_param('maxEmbedWidth', '0');
if(!preg_match('/^[0-9]{1,4}$/', $maxEmbedWidth)) {
    $maxEmbedWidth = '0';
}
$maxEmbedWidth = (int)$maxEmbedWidth;
if($maxEmbedWidth > 0) {
    $maxEmbedWidth = max(640, min(3840, $maxEmbedWidth));
}
$maxEmbedHeight = flashpoint_as3_param('maxEmbedHeight', '0');
if(!preg_match('/^[0-9]{1,4}$/', $maxEmbedHeight)) {
    $maxEmbedHeight = '0';
}
$maxEmbedHeight = (int)$maxEmbedHeight;
if($maxEmbedHeight > 0) {
    $maxEmbedHeight = max(480, min(2160, $maxEmbedHeight));
}
$seedIsland = flashpoint_as3_param('flashpointSeedIsland', flashpoint_as3_param('seedIsland', ''));
if(!preg_match('/^[A-Za-z0-9_]+$/', $seedIsland)) {
    $seedIsland = '';
}
$autoLoadIsland = flashpoint_as3_param('flashpointAutoLoadIsland', flashpoint_as3_param('autoLoadIsland', ''));
if(!preg_match('/^[A-Za-z0-9_]+$/', $autoLoadIsland)) {
    $autoLoadIsland = '';
}
$seedEvents = flashpoint_as3_param('flashpointSeedEvents', flashpoint_as3_param('seedEvents', ''));
if(!preg_match('/^[A-Za-z0-9_,]+$/', $seedEvents)) {
    $seedEvents = '';
}
$startX = flashpoint_as3_param('flashpointStartX', flashpoint_as3_param('startX', ''));
if(!preg_match('/^-?[0-9]+(?:\\.[0-9]+)?$/', $startX)) {
    $startX = '';
}
$startY = flashpoint_as3_param('flashpointStartY', flashpoint_as3_param('startY', ''));
if(!preg_match('/^-?[0-9]+(?:\\.[0-9]+)?$/', $startY)) {
    $startY = '';
}
$startDirection = strtolower(flashpoint_as3_param('flashpointStartDirection', flashpoint_as3_param('startDirection', '')));
if(!in_array($startDirection, array('left', 'right'), true)) {
    $startDirection = '';
}
$qaLoadingHoldMs = flashpoint_as3_param('flashpointQaLoadingHoldMs', flashpoint_as3_param('qaLoadingHoldMs', ''));
if(!preg_match('/^[0-9]{1,5}$/', $qaLoadingHoldMs)) {
    $qaLoadingHoldMs = '';
}
  $qaDialogNpc = flashpoint_as3_param('flashpointQaDialogNpc', flashpoint_as3_param('qaDialogNpc', ''));
  if(!preg_match('/^[A-Za-z][A-Za-z0-9_]{0,63}$/', $qaDialogNpc)) {
      $qaDialogNpc = '';
  }
  $qaDialogId = flashpoint_as3_param('flashpointQaDialogId', flashpoint_as3_param('qaDialogId', ''));
  if(!preg_match('/^[A-Za-z0-9_ -]{1,64}$/', $qaDialogId)) {
      $qaDialogId = '';
  }
  $qaAutoScene = flashpoint_as3_param('flashpointQaAutoScene', flashpoint_as3_param('qaAutoScene', ''));
  if(!preg_match('/^[A-Za-z0-9_.$]+$/', $qaAutoScene)) {
      $qaAutoScene = '';
  }
  $qaAutoSceneDelayMs = flashpoint_as3_param('flashpointQaAutoSceneDelayMs', flashpoint_as3_param('qaAutoSceneDelayMs', ''));
  if(!preg_match('/^[0-9]{1,5}$/', $qaAutoSceneDelayMs)) {
      $qaAutoSceneDelayMs = '';
  }
  $embedDelayMs = flashpoint_as3_param('flashpointEmbedDelayMs', flashpoint_as3_param('embedDelayMs', ''));
  if(!preg_match('/^[0-9]{1,5}$/', $embedDelayMs)) {
      $embedDelayMs = '0';
  }
  $embedDelayMs = max(0, min(10000, (int)$embedDelayMs));
  $shellCacheBust = @filemtime(__DIR__ . '/../game/Shell.swf');
  if(!$shellCacheBust) {
      $shellCacheBust = time();
  }
  $shellUrl = '/game/Shell.swf?island=1&flashpointShellCacheBust=' . rawurlencode((string)$shellCacheBust);
  $shellFlashVars = array(
      'island' => '1',
      'flashpointShellCacheBust' => (string)$shellCacheBust
  );
if($scene !== '') {
    $shellUrl .= '&overrideScene=' . rawurlencode($scene);
    $shellFlashVars['overrideScene'] = $scene;
}
if($seedIsland !== '') {
    $shellUrl .= '&flashpointSeedIsland=' . rawurlencode($seedIsland);
    $shellFlashVars['flashpointSeedIsland'] = $seedIsland;
}
if($autoLoadIsland !== '') {
    $shellUrl .= '&flashpointAutoLoadIsland=' . rawurlencode($autoLoadIsland);
    $shellFlashVars['flashpointAutoLoadIsland'] = $autoLoadIsland;
}
if($seedEvents !== '') {
    $shellUrl .= '&flashpointSeedEvents=' . rawurlencode($seedEvents);
    $shellFlashVars['flashpointSeedEvents'] = $seedEvents;
}
if($startX !== '') {
    $shellUrl .= '&flashpointStartX=' . rawurlencode($startX);
    $shellFlashVars['flashpointStartX'] = $startX;
}
if($startY !== '') {
    $shellUrl .= '&flashpointStartY=' . rawurlencode($startY);
    $shellFlashVars['flashpointStartY'] = $startY;
}
if($startDirection !== '') {
    $shellUrl .= '&flashpointStartDirection=' . rawurlencode($startDirection);
    $shellFlashVars['flashpointStartDirection'] = $startDirection;
}
if($qaLoadingHoldMs !== '') {
    $shellUrl .= '&flashpointQaLoadingHoldMs=' . rawurlencode($qaLoadingHoldMs);
    $shellFlashVars['flashpointQaLoadingHoldMs'] = $qaLoadingHoldMs;
}
  if($qaDialogNpc !== '') {
      $shellUrl .= '&flashpointQaDialogNpc=' . rawurlencode($qaDialogNpc);
      $shellFlashVars['flashpointQaDialogNpc'] = $qaDialogNpc;
  }
  if($qaDialogId !== '') {
      $shellUrl .= '&flashpointQaDialogId=' . rawurlencode($qaDialogId);
      $shellFlashVars['flashpointQaDialogId'] = $qaDialogId;
  }
  if($qaAutoScene !== '') {
      $shellUrl .= '&flashpointQaAutoScene=' . rawurlencode($qaAutoScene);
      $shellFlashVars['flashpointQaAutoScene'] = $qaAutoScene;
  }
  if($qaAutoSceneDelayMs !== '') {
      $shellUrl .= '&flashpointQaAutoSceneDelayMs=' . rawurlencode($qaAutoSceneDelayMs);
      $shellFlashVars['flashpointQaAutoSceneDelayMs'] = $qaAutoSceneDelayMs;
  }
?><!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Poptropica</title>
  <style>
    html,
    body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #59645d;
    }

    #gameRoot {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      border: 0;
      display: block;
      overflow: hidden;
      background: #59645d;
    }

    #gameEmbed {
      position: fixed;
      left: 0;
      top: 0;
      border: 0;
      display: block;
      overflow: hidden;
      background: #59645d;
    }
  </style>
</head>
<body>
  <div id="gameRoot"></div>
  <script>
    (function() {
      const root = document.getElementById("gameRoot");
      let embed = null;
      const shellUrl = <?php echo json_encode($shellUrl); ?>;
      const flashVars = <?php echo json_encode(http_build_query($shellFlashVars, '', '&')); ?>;
      const resizeMode = <?php echo json_encode($resizeMode); ?>;
      const initialEmbedDelayMs = <?php echo (int)$embedDelayMs; ?>;
      const maxEmbedWidth = <?php echo (int)$maxEmbedWidth; ?>;
      const maxEmbedHeight = <?php echo (int)$maxEmbedHeight; ?>;
      let resizeTimer = 0;
      let lastWidth = Math.max(1, window.innerWidth || 0, document.documentElement.clientWidth || 0);
      let lastHeight = Math.max(1, window.innerHeight || 0, document.documentElement.clientHeight || 0);
      let lastResizeReloadAt = 0;

      window.flashpointQaLocationHref = function() {
        return window.location.href;
      };

      function applyEmbedSize() {
        if(!embed)
          return;
        const viewportWidth = Math.max(1, window.innerWidth || 0, document.documentElement.clientWidth || 0);
        const viewportHeight = Math.max(1, window.innerHeight || 0, document.documentElement.clientHeight || 0);
        const width = Math.max(1, Math.min(viewportWidth, maxEmbedWidth || viewportWidth));
        const height = Math.max(1, Math.min(viewportHeight, maxEmbedHeight || viewportHeight));
        embed.style.left = Math.round((viewportWidth - width) * 0.5) + "px";
        embed.style.top = Math.round((viewportHeight - height) * 0.5) + "px";
        embed.style.width = width + "px";
        embed.style.height = height + "px";
        embed.setAttribute("width", String(width));
        embed.setAttribute("height", String(height));
      }

      function createEmbed(nextSrc) {
        const nextEmbed = document.createElement("embed");
        nextEmbed.id = "gameEmbed";
        nextEmbed.setAttribute("src", nextSrc);
        nextEmbed.setAttribute("type", "application/x-shockwave-flash");
        nextEmbed.setAttribute("width", "100%");
        nextEmbed.setAttribute("height", "100%");
        nextEmbed.setAttribute("bgcolor", "59645d");
        nextEmbed.setAttribute("scale", "noscale");
        nextEmbed.setAttribute("wmode", "direct");
        nextEmbed.setAttribute("allowfullscreen", "true");
        nextEmbed.setAttribute("allowScriptAccess", "always");
        nextEmbed.setAttribute("allowscriptaccess", "always");
        if(flashVars)
          nextEmbed.setAttribute("flashvars", flashVars);
        root.textContent = "";
        root.appendChild(nextEmbed);
        embed = nextEmbed;
        applyEmbedSize();
      }

      function replaceEmbedSource(nextSrc) {
        if(embed && embed.parentNode)
          embed.parentNode.removeChild(embed);
        embed = null;
        window.setTimeout(function() {
          createEmbed(nextSrc);
        }, 120);
      }

      function reloadEmbedAfterResize() {
        if(resizeMode === "0")
          return;
        const nextWidth = Math.max(1, window.innerWidth || 0, document.documentElement.clientWidth || 0);
        const nextHeight = Math.max(1, window.innerHeight || 0, document.documentElement.clientHeight || 0);
        if(Math.abs(nextWidth - lastWidth) < 8 && Math.abs(nextHeight - lastHeight) < 8)
          return;
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function() {
          const stableWidth = Math.max(1, window.innerWidth || 0, document.documentElement.clientWidth || 0);
          const stableHeight = Math.max(1, window.innerHeight || 0, document.documentElement.clientHeight || 0);
          if(Math.abs(stableWidth - lastWidth) < 8 && Math.abs(stableHeight - lastHeight) < 8)
            return;
          if(Date.now() - lastResizeReloadAt < 5000) {
            lastWidth = stableWidth;
            lastHeight = stableHeight;
            return;
          }
          lastWidth = stableWidth;
          lastHeight = stableHeight;
          lastResizeReloadAt = Date.now();
          if(resizeMode === "page" || resizeMode === "top" || resizeMode === "reload") {
            const url = new URL(window.location.href);
            url.searchParams.set("resizeReload", String(Date.now()));
            window.location.replace(url.toString());
            return;
          }
          replaceEmbedSource(shellUrl + (shellUrl.indexOf("?") >= 0 ? "&" : "?") + "resizeReload=" + Date.now());
        }, 450);
      }

      window.addEventListener("resize", function() {
        applyEmbedSize();
        reloadEmbedAfterResize();
      });
      window.addEventListener("pageshow", applyEmbedSize);
      [ 0, 50, 150, 350, 800, 1500, 3000, 6000, 10000, 16000, 24000, 36000 ].forEach(function(delayMs) {
        window.setTimeout(applyEmbedSize, delayMs);
      });
      window.setInterval(applyEmbedSize, 5000);
      window.setTimeout(function() {
        createEmbed(shellUrl);
      }, initialEmbedDelayMs);
    })();
  </script>
</body>
</html>
`;
}

module.exports = {
  AS3_DIRECT_WRAPPER_PATH,
  buildAs3DirectSceneUrl,
  normalizeSeedEvents,
  normalizeSeedIsland,
  normalizeResizeMode,
  normalizeQaDialogNpc,
  normalizeQaLoadingHoldMs,
  normalizeEmbedDelayMs,
  buildAs3DirectWrapperPhp
};
