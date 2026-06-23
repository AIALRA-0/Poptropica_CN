<?php
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
if(!preg_match('/^-?[0-9]+(?:\.[0-9]+)?$/', $startX)) {
    $startX = '';
}
$startY = flashpoint_as3_param('flashpointStartY', flashpoint_as3_param('startY', ''));
if(!preg_match('/^-?[0-9]+(?:\.[0-9]+)?$/', $startY)) {
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
      let hudMenuHitProxy = null;
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

      function ensureHudMenuHitProxy() {
        if(hudMenuHitProxy)
          return hudMenuHitProxy;
        hudMenuHitProxy = document.createElement("button");
        hudMenuHitProxy.type = "button";
        hudMenuHitProxy.setAttribute("aria-label", "Menu");
        hudMenuHitProxy.id = "hudMenuHitProxy";
        hudMenuHitProxy.style.position = "fixed";
        hudMenuHitProxy.style.border = "0";
        hudMenuHitProxy.style.padding = "0";
        hudMenuHitProxy.style.margin = "0";
        hudMenuHitProxy.style.background = "transparent";
        hudMenuHitProxy.style.opacity = "0";
        hudMenuHitProxy.style.cursor = "pointer";
        hudMenuHitProxy.style.zIndex = "20";
        hudMenuHitProxy.style.pointerEvents = "auto";
        hudMenuHitProxy.addEventListener("click", maybeToggleHudFromPointer, true);
        document.body.appendChild(hudMenuHitProxy);
        return hudMenuHitProxy;
      }

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
        const proxy = ensureHudMenuHitProxy();
        proxy.style.left = Math.round((viewportWidth - width) * 0.5 + width - 180) + "px";
        proxy.style.top = Math.round((viewportHeight - height) * 0.5) + "px";
        proxy.style.width = "180px";
        proxy.style.height = "200px";
      }

      function callFlashpointHudToggle(attempt) {
        if(!embed)
          return false;
        if(typeof embed.flashpointToggleHud === "function") {
          try {
            return embed.flashpointToggleHud() !== false;
          } catch(err) {
          }
        }
        if(attempt < 10) {
          window.setTimeout(function() {
            callFlashpointHudToggle(attempt + 1);
          }, 100);
        }
        return false;
      }

      function maybeToggleHudFromPointer(event) {
        if(!embed || !event)
          return;
        if(typeof event.button === "number" && event.button !== 0)
          return;
        let inHudMenuHotspot = event.target === hudMenuHitProxy;
        if(!inHudMenuHotspot) {
          const rect = embed.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const width = Math.max(1, rect.width || 0);
          inHudMenuHotspot = !(x < width - 180 || x > width + 8 || y < 0 || y > 200);
        }
        if(!inHudMenuHotspot)
          return;
        callFlashpointHudToggle(0);
        event.preventDefault();
        event.stopPropagation();
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
        ensureHudMenuHitProxy();
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
      root.addEventListener("click", maybeToggleHudFromPointer, true);
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
