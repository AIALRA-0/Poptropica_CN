const AS3_DIRECT_WRAPPER_PATH = "content/www.poptropica.com/flashpoint/as3-direct.php";

function buildAs3DirectSceneUrl(as3TargetScene, options = {}) {
  const params = new URLSearchParams();
  const targetScene = String(as3TargetScene || "").trim();
  if (targetScene) {
    params.set("overrideScene", targetScene);
  }
  params.set("reloadOnResize", options.reloadOnResize === false ? "0" : "1");
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

$reloadOnResize = flashpoint_as3_param('reloadOnResize', '1') !== '0';
$shellUrl = '/game/Shell.swf?island';
if($scene !== '') {
    $shellUrl .= '&overrideScene=' . rawurlencode($scene);
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
      background: #139ffd;
    }

    #gameFrame {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      border: 0;
      display: block;
      overflow: hidden;
      background: #139ffd;
    }
  </style>
</head>
<body>
  <iframe
    id="gameFrame"
    src="<?php echo htmlspecialchars($shellUrl, ENT_QUOTES, 'UTF-8'); ?>"
    scrolling="no"
    allowfullscreen></iframe>
  <script>
    (function() {
      const frame = document.getElementById("gameFrame");
      const shellUrl = <?php echo json_encode($shellUrl); ?>;
      const reloadOnResize = <?php echo $reloadOnResize ? 'true' : 'false'; ?>;
      let resizeTimer = 0;
      let lastWidth = window.innerWidth;
      let lastHeight = window.innerHeight;

      function applyFrameSize() {
        frame.style.width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1) + "px";
        frame.style.height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1) + "px";
      }

      function reloadFrameAfterResize() {
        if(!reloadOnResize)
          return;
        const nextWidth = window.innerWidth;
        const nextHeight = window.innerHeight;
        if(Math.abs(nextWidth - lastWidth) < 4 && Math.abs(nextHeight - lastHeight) < 4)
          return;
        lastWidth = nextWidth;
        lastHeight = nextHeight;
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function() {
          frame.setAttribute("src", shellUrl + (shellUrl.indexOf("?") >= 0 ? "&" : "?") + "resizeReload=" + Date.now());
        }, 450);
      }

      window.addEventListener("resize", function() {
        applyFrameSize();
        reloadFrameAfterResize();
      });
      window.addEventListener("pageshow", applyFrameSize);
      [ 0, 50, 150, 350, 800, 1500, 3000, 6000, 10000, 16000, 24000, 36000 ].forEach(function(delayMs) {
        window.setTimeout(applyFrameSize, delayMs);
      });
      window.setInterval(applyFrameSize, 5000);
      applyFrameSize();
    })();
  </script>
</body>
</html>
`;
}

module.exports = {
  AS3_DIRECT_WRAPPER_PATH,
  buildAs3DirectSceneUrl,
  buildAs3DirectWrapperPhp
};
