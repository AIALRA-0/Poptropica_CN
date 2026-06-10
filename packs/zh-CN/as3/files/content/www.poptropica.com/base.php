<?php

$reqObj = $_SERVER['REQUEST_METHOD'] === 'POST' ? $_POST : $_GET; // Useful for debugging.

function getParam(string $name, string $default) : string {
    global $reqObj;
    return isset($reqObj[$name]) ? urlencode($reqObj[$name]) : $default;
}

// Use the original parameter names in case Flash's `getURL()` function is used to access this page.
$scene = getParam('room', 'Home');
$island = getParam('island', 'Home');
$path = getParam('startup_path', 'gameplay');

const SCENE_AS3 = 'GlobalAS3Embassy',
      SCENE_AS3_START = 'FlashpointStart', // Not a real scene.
	  SCENE_FP_RESTART = 'FlashpointMiniquestRestart', // Not a real scene.
      SCENE_COMMON_EARLY = 'Arcade';

const SPECIAL_COMMONS = [ 'Coconut', 'Party', 'Cinema', 'News', 'HairClub', 'Airlines', 'Saltys', 'Crop', 'BaguetteInn', 'Billiards', 'BrokenBarrel', 'HotelInterior', 'ClubInterior' ];
const SPECIAL_ADS = [ 'AdGroundH52', 'AdGroundH42' ]; // Why, Poptropica! These are scenes labeled as "ads" that AREN'T ads, and just use the rectangular screen format.

const STATE_SCENE = 0,
      STATE_COMMON = 1,
      STATE_AS3 = 2,
	  STATE_AD = 3,
	  STATE_RESTART = 4;

$pageState;

switch($scene) {
    case SCENE_AS3_START:
        $scene = SCENE_AS3 . '&amp;flashpointForceStart=1';
        // No break.
    case SCENE_AS3:
        $pageState = STATE_AS3;

        break;
	case SCENE_FP_RESTART:
        $pageState = STATE_RESTART;

        break;
    case SCENE_COMMON_EARLY:
        // Necessary because Wimpy Boardwalk also has a scene named "Arcade". Compare the island to Wimpy Boardwalk rather than Early Poptropica to keep the behavior consistent with the other common room checks.
        $pageState = ($island === 'Boardwalk') ? STATE_SCENE : STATE_COMMON;
        break;
    default:
		if(substr($scene, 0, 2) === 'Ad' && array_search($scene, SPECIAL_ADS, true) === false) {
				$pageState = STATE_AD;
				break;
		}
        if(strpos($scene, 'Common') === false)
            if(array_search($scene, SPECIAL_COMMONS, true) === false) {
                $pageState = STATE_SCENE;
                break;
            }


        $pageState = STATE_SCENE;
        break;
}

// These shouldn't ever need to be URL encoded.
$width;
$height;
$flashVars;

    $gameState;

    if($scene === 'Home') {
		$pageState = STATE_SCENE;
        $scene = SCENE_AS3 . '&amp;flashpointForceStart=1';
		$width = '1136';
        $height = '673';
    } else if(substr($scene, 0, 2) === 'Ad') {
        $gameState = 'return_user_advertisement_1';
        $width = '776';
        $height = '480';
    } else {
        $gameState = 'return_user_standard';
        $width = '1136';
        $height = '673';
    }

    $flashVars = "desc=$scene&amp;island=$island&amp;startup_path=$path&amp;state=$gameState";

?><!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <title>Poptropica</title>
        <style>
            html, body {
                margin: 0;
                width: 100%;
                height: 100%;
                overflow: hidden !important;
                background-color: #139ffd;
            }
            body { position: relative; }
            embed {
                background-color: #0099ff;
                outline-width: 0;
                position: absolute;
                left: 0;
                top: 0;
                width: 100vw;
                height: 100vh;
            }
        </style>
    </head>
    <body>
        <embed src="
		<?php
		if($pageState === STATE_SCENE) {echo 'framework.swf';}
		elseif($pageState === STATE_AS3) {echo 'flashpoint/memStatus.swf';}
		elseif($pageState === STATE_RESTART) {echo 'flashpoint/restartMiniquest.swf';}
		else {echo 'flashpoint/adSkip.swf';}

		?>"
		width="100%" height="100%" flashvars="<?php echo $flashVars; ?>" scale="noscale" wmode="direct">
        <form method="POST">
            <input type="hidden" name="room">
            <input type="hidden" name="island">
            <input type="hidden" name="startup_path">
        </form>
        <script>

function dbug(message) {
    console.log(message);
}

// Load scene for ad skipper.
function flashpointLoad(scene,island) {
	console.log("Flashpoint loads a scene: " + scene + " on " + island)
	POSTToBase(island, scene, "gameplay");
}


function POSTToBase(...args) {
    const form = document.forms[0];

    if(form.children.length === args.length) {
        for(let i = 0; i < args.length; i++)
            form.children[i].setAttribute("value", args[i]);

        form.submit();
    }
}

<?php if($pageState === STATE_AS3) { ?>

function loadAS3Embassy() {
    const origEmbed = document.querySelector("embed"),
          embed = document.createElement("embed");

    for(let i = 0; i < origEmbed.attributes.length; i++)
        embed.setAttribute(origEmbed.attributes[i].name, origEmbed.attributes[i].value);

    embed.setAttribute("src", "framework.swf");

    const parent = origEmbed.parentNode,
          sibling = origEmbed.nextSibling;

    parent.removeChild(origEmbed);
    parent.insertBefore(embed, sibling);
}

<?php } else { ?>

// Character creation screen map workaround.
function loadTrackingPixel(url) {
    if(url.startsWith("http://notify.maps.poptropica.com"))
        POSTToBase("<?php echo /*SCENE_AS3_START*/SCENE_AS3; ?>", "Home", "gameplay");
}

<?php } ?>
        </script>
    <?php ?></body>
</html>