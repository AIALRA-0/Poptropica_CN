const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseArgs, printJson } = require("./lib/cli");
const paths = require("./lib/paths");
const { ensureQaDir, runPythonQa, writeQaReport } = require("./lib/qa");
const {
  loadPlayerCompatibility,
  saveIslandVerification,
  savePlayerCompatibility,
  saveWindowAudit
} = require("./lib/status-store");
const { loadConfig } = require("./lib/config");
const { getLaunchEntry, generateLaunchManifest, loadLaunchManifest } = require("./lib/launch-manifest");
const { clearPoptropicaFlashState } = require("./lib/flash-state");
const {
  ensureFlashpointServices,
  ensureManagedWorkspace,
  getPoptropicaRecords,
  mountSourceZip,
  proxyRequest,
  spawnManagedRuntime
} = require("./lib/flashpoint-runtime");

const GAME_SERVER_LOG_PATH = path.join(paths.managedLogsDir, "flashpoint-game-server.log");

const SUPER_POWER_TARGET = {
  islandId: "super-power",
  dialogueRoi: { left: 0.25, top: 0.43, width: 0.60, height: 0.15 },
  staticSigns: {
    mainStreet: { left: 0.18, top: 0.46, width: 0.18, height: 0.18 },
    shop: { left: 0.52, top: 0.03, width: 0.39, height: 0.20 },
    comicShop: { left: 0.60, top: 0.40, width: 0.24, height: 0.14 },
    open: { left: 0.70, top: 0.53, width: 0.10, height: 0.11 }
  },
  mapsClick: { x: 0.67, y: 0.225 }
};

function flagEnabled(value) {
  return value === true || /^(1|true|yes|y)$/iu.test(String(value || ""));
}

function parseRelativeCoordinate(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function parseClickSequence(args, prefix) {
  const rawSequence = args[`${prefix}Sequence`];
  if (rawSequence) {
    return String(rawSequence).split(";").map((step) => {
      const [rawX, rawY, rawWaitMs] = step.split(",");
      const x = parseRelativeCoordinate(rawX);
      const y = parseRelativeCoordinate(rawY);
      if (x === null || y === null) {
        return null;
      }
      return {
        x,
        y,
        waitMs: Number(rawWaitMs || args[`${prefix}WaitMs`] || 1800)
      };
    }).filter(Boolean);
  }

  const x = parseRelativeCoordinate(args[`${prefix}X`] ?? args[`${prefix.replace(/Click$/u, "")}X`]);
  const y = parseRelativeCoordinate(args[`${prefix}Y`] ?? args[`${prefix.replace(/Click$/u, "")}Y`]);
  if (x === null || y === null) {
    return [];
  }
  return [{
    x,
    y,
    waitMs: Number(args[`${prefix}WaitMs`] || 1800)
  }];
}

const PLAYER_MATRIX = {
  as2: [
    {
      playerKey: "flashpointnavigator-as2",
      label: "Flashpoint Navigator",
      processNames: "flashpointnavigator.exe",
      titleContains: "poptropica"
    },
    {
      playerKey: "fpnavigator-as2",
      label: "FPNavigator",
      processNames: "fpnavigator.exe,flashpointnavigator.exe",
      titleContains: ""
    },
    {
      playerKey: "secureplayer-basilisk-as2",
      label: "SecurePlayer Basilisk",
      processNames: "flashpointsecureplayer.exe,fpnavigator.exe,flashpointnavigator.exe",
      titleContains: ""
    },
    {
      playerKey: "secureplayer-basiliskscaling-as2",
      label: "SecurePlayer Basilisk Scaling",
      processNames: "flashpointsecureplayer.exe,fpnavigator.exe,flashpointnavigator.exe",
      titleContains: ""
    }
  ],
  as3: [
    {
      playerKey: "flashpointnavigator-as3",
      label: "Flashpoint Navigator",
      processNames: "flashpointnavigator.exe",
      titleContains: "poptropica"
    }
  ]
};

function runPowershell(command, timeout = 30000) {
  return spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    windowsHide: true,
    timeout
  });
}

function collectProcessSnapshot() {
  const result = runPowershell([
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $_.Name -in @(",
    "    'FPNavigator.exe',",
    "    'flashpointnavigator.exe',",
    "    'FlashpointSecurePlayer.exe',",
    "    'BasiliskII.exe',",
    "    'php.exe',",
    "    'php-win.exe',",
    "    'php-cgi.exe',",
    "    'Flashpoint Game Server.exe'",
    "  )",
    "} | Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Depth 3"
  ].join(" "), 30000);

  const stdout = String(result.stdout || "").trim();
  if (!stdout) {
    return [];
  }
  try {
    const payload = JSON.parse(stdout);
    return Array.isArray(payload) ? payload : [payload];
  } catch (_error) {
    return [];
  }
}

function stopTargetProcesses() {
  runPowershell([
    "$names = @(",
    "  'FPNavigator',",
    "  'flashpointnavigator',",
    "  'FlashpointSecurePlayer',",
    "  'BasiliskII',",
    "  'php',",
    "  'php-win',",
    "  'php-cgi',",
    "  'Flashpoint Game Server',",
    "  'plugin-container'",
    ")",
    "$deadline = (Get-Date).AddSeconds(8)",
    "do {",
    "  foreach ($name in $names) {",
    "    Get-Process -Name $name -ErrorAction SilentlyContinue |",
    "      ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {} }",
    "  }",
    "  Start-Sleep -Milliseconds 250",
    "  $remaining = @(Get-Process -Name $names -ErrorAction SilentlyContinue)",
    "} while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline)"
  ].join("\n"), 40000);
}

function clearPoptropicaFlashStateForQa() {
  clearPoptropicaFlashState({ reason: "qa-runtime-validation" });
}

function containsChinese(text) {
  return /[\u4e00-\u9fff]/u.test(String(text || ""));
}

function looksLikeHexGarbage(text) {
  const normalized = String(text || "").replace(/\s+/gu, "");
  return /%u[0-9a-f]{4}/iu.test(normalized) || /(?:[0-9a-f]{4,}){4,}/iu.test(normalized);
}

function hasSentinel(text, sentinel) {
  const normalized = String(text || "").replace(/\s+/gu, "").toUpperCase();
  return normalized.includes(String(sentinel || "").replace(/\s+/gu, "").toUpperCase());
}

function isClearlyFlashpointLibrary(windowMatch, screenshotOcrText) {
  const title = String(windowMatch?.title || "").toLowerCase();
  const text = String(screenshotOcrText || "").toLowerCase();
  return (
    title.includes("flashpoint") &&
    !title.includes("poptropica")
  ) || (
    text.includes("flashpoint") &&
    text.includes("search") &&
    !text.includes("poptropica")
  );
}

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (_error) {
    return 0;
  }
}

function readLogSegment(filePath, startOffset) {
  try {
    const endOffset = fs.statSync(filePath).size;
    if (endOffset <= startOffset) {
      return "";
    }
    const fd = fs.openSync(filePath, "r");
    try {
      const length = Math.min(endOffset - startOffset, 1024 * 1024 * 2);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, startOffset);
      return buffer.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch (_error) {
    return "";
  }
}

function hasMapSwfRequest(logSegment) {
  return /(?:content\/www\.poptropica\.com\/)?popups\/(?:map|travelmap)\.swf\b/iu.test(String(logSegment || ""));
}

function scoreCandidate(verdict) {
  let score = 0;
  if (verdict.gameWindowFound) score += 20;
  if (!verdict.consolePopupSeen) score += 10;
  if (!verdict.flashpointLibrarySeen) score += 20;
  if (verdict.stageCoverageRatio >= 0.35) score += 15;
  if (!verdict.dialogueHexSeen) score += 15;
  if (verdict.audioActive) score += 10;
  if (verdict.mapsClickable) score += 5;
  if (verdict.staticSignZhSeen) score += 5;
  return score;
}

function stageRelativeToWindow(capture, stageRect, relativePoint) {
  const clickOffset = captureClickOffset(capture);
  const x = Math.round(clickOffset.x + stageRect.left + (stageRect.width * relativePoint.x));
  const y = Math.round(clickOffset.y + stageRect.top + (stageRect.height * relativePoint.y));
  return { x, y };
}

function captureClickOffset(capture) {
  const mode = String(capture?.captureMode || "").toLowerCase();
  const className = String(capture?.window?.className || "").toLowerCase();
  if (mode === "client" && className.includes("mozillawindowclass")) {
    return { x: 0, y: 110 };
  }
  return { x: 0, y: 0 };
}

function buildWindowWaitArgs(runtimeWindow, timeoutMs, outputPath = null) {
  const searched = runtimeWindow?.searched || {};
  const processNames = Array.isArray(searched.processNames) && searched.processNames.length
    ? searched.processNames
    : [runtimeWindow?.match?.processName].filter(Boolean);
  const titleContains = Array.isArray(searched.titleContains) ? searched.titleContains : [];
  const pid = searched.pid || null;
  const waitArgs = [
    "wait-window",
    "--process-names",
    processNames.join(","),
    "--timeout-ms",
    String(timeoutMs),
    "--poll-ms",
    "250"
  ];
  if (titleContains.length) {
    waitArgs.push("--title-contains", titleContains.join(","));
  }
  if (pid) {
    waitArgs.push("--pid", String(pid));
  }
  if (outputPath) {
    waitArgs.push("--output", outputPath);
  }
  return waitArgs;
}

function reacquireRuntimeWindow(runtimeWindow, outputPath, timeoutMs = 10000) {
  try {
    return runPythonQa(buildWindowWaitArgs(runtimeWindow, timeoutMs, outputPath), {
      timeoutMs: timeoutMs + 5000
    });
  } catch (error) {
    const searched = runtimeWindow?.searched || {};
    const processNames = Array.isArray(searched.processNames) && searched.processNames.length
      ? searched.processNames
      : [runtimeWindow?.match?.processName].filter(Boolean);
    const pid = searched.pid || runtimeWindow?.match?.pid || null;
    if (!processNames.length) {
      throw error;
    }
    const waitArgs = [
      "wait-window",
      "--process-names",
      processNames.join(","),
      "--timeout-ms",
      String(timeoutMs),
      "--poll-ms",
      "250",
      "--output",
      outputPath
    ];
    if (pid) {
      waitArgs.push("--pid", String(pid));
    }
    return runPythonQa(waitArgs, {
      timeoutMs: timeoutMs + 5000
    });
  }
}

function buildIslandVerification(candidateReport, sourceGroup) {
  const verdict = candidateReport.verdict;
  const failedChecks = verdict.failedChecks || [];
  const playabilityStatus = verdict.verdict === "pass" ? "可玩" : "已知损坏";
  const translationStatus =
    verdict.verdict === "pass" && verdict.staticSignZhSeen && verdict.dialogueChineseVisible
      ? "已验收可见中文"
      : "已打包未验收";

  return {
    islands: {
      [SUPER_POWER_TARGET.islandId]: {
        playabilityStatus,
        translationStatus,
        lastVerifiedAt: new Date().toISOString(),
        notes: [
          `运行器：${candidateReport.player.label}`,
          verdict.verdict === "pass"
            ? "这次验收已经在真实窗口里看到可玩结果。"
            : `这次验收还没通过：${failedChecks.join("；") || "原因未明"}`
        ]
      }
    }
  };
}

function saveCompatibility(sourceGroup, reports) {
  const current = loadPlayerCompatibility();
  const best = [...reports].sort((left, right) => right.verdict.score - left.verdict.score)[0] || null;
  const passed = reports.filter((report) => report.verdict.verdict === "pass");
  const chosen = passed[0] || null;
  const reference = chosen || best;
  const nextPreferred = chosen?.player?.playerKey || best?.player?.playerKey || current.players?.[sourceGroup]?.preferredPlayer;

  const summary = chosen || best
    ? chosen
      ? `${chosen.player.label} 已通过 Super Power 闭环验收，AS${sourceGroup === "as2" ? "2" : "3"} 默认切到这条链。`
      : `${best.player.label} 当前得分最高，但仍未通过闭环验收：${best.verdict.failedChecks.join("；") || "原因未明"}`
    : current.players?.[sourceGroup]?.summary;

  const playerState = {
    ...current.players?.[sourceGroup],
    preferredPlayer: nextPreferred,
    summary,
    audioStatus: reference?.verdict?.audioActive ? "已检测到活动" : "未检测到活动",
    graphicsStatus: reference?.verdict?.flashpointLibrarySeen ? "跑偏到库界面" : reference?.verdict?.stageCoverageRatio >= 0.35 ? "舞台可见" : "舞台过小或不稳定",
    performanceStatus: reference?.verdict?.mapsClickable ? "地图点击未直接卡死" : "地图点击仍待继续验证",
    lastVerifiedAt: new Date().toISOString(),
    candidates: reports.map((report) => ({
      playerKey: report.player.playerKey,
      label: report.player.label,
      verdict: report.verdict.verdict,
      score: report.verdict.score,
      failedChecks: report.verdict.failedChecks
    }))
  };

  savePlayerCompatibility({
    players: {
      ...current.players,
      [sourceGroup]: playerState
    }
  });

  return playerState;
}

function ensureLaunchManifest(config) {
  return loadLaunchManifest() || generateLaunchManifest(config);
}

async function launchRuntimeForQa(sourceGroup, player, islandId, options = {}) {
  const config = loadConfig();
  ensureManagedWorkspace(config);
  const manifest = ensureLaunchManifest(config);
  await ensureFlashpointServices(config);
  await mountSourceZip(config, sourceGroup);

  let launchUrl = null;
  if (islandId) {
    const launchEntry = manifest?.entries?.find((entry) => entry.canonicalKey === islandId);
    if (!launchEntry?.launchable) {
      throw new Error(`没有找到 ${islandId} 的稳定启动入口。`);
    }
    launchUrl = launchEntry.launchUrl;
    if (sourceGroup === "as2" && options.roomParam) {
      const roomParam = String(options.roomParam);
      const islandParam = String(options.islandParam || launchEntry.islandParam);
      const startupPath = String(options.startupPath || launchEntry.startupPath || "gameplay");
      launchUrl = `http://www.poptropica.com/base.php?room=${encodeURIComponent(roomParam)}&island=${encodeURIComponent(islandParam)}&startup_path=${encodeURIComponent(startupPath)}`;
    }
  } else {
    const records = getPoptropicaRecords(config);
    const record = records[sourceGroup];
    if (!record?.launchCommand) {
      throw new Error(`没有找到 ${sourceGroup.toUpperCase()} 的启动入口。`);
    }
    launchUrl = record.launchCommand;
  }

  const health = await proxyRequest(launchUrl);
  if (health.statusCode < 200 || health.statusCode >= 400) {
    throw new Error(`启动页返回状态 ${health.statusCode}。`);
  }

  const runtime = spawnManagedRuntime(config, sourceGroup, launchUrl, {
    detach: true,
    playerKey: player.playerKey
  });

  return {
    launchUrl,
    runtime: {
      playerKey: runtime.playerKey,
      executable: runtime.executable,
      args: runtime.args,
      pid: runtime.child?.pid || runtime.pid || null,
      processNames: runtime.processNames || []
    }
  };
}

function clickStagePoint(qaDir, reportStem, runtimeWindow, capture, stage, relativePoint, label, waitMs = 1800) {
  const stageRect = stage?.stageRect;
  if (!stageRect) {
    return {
      ok: false,
      reason: "stage_not_detected"
    };
  }

  const point = stageRelativeToWindow(capture, stageRect, relativePoint);
  const safeLabel = String(label || "click").replace(/[^a-z0-9_-]+/giu, "-");
  const clickMetaPath = path.join(qaDir, `${reportStem}-${safeLabel}-click.json`);
  const postClickWindowPath = path.join(qaDir, `${reportStem}-${safeLabel}-window.json`);
  const postClickScreenshotPath = path.join(qaDir, `${reportStem}-${safeLabel}.png`);
  const postClickStagePath = path.join(qaDir, `${reportStem}-${safeLabel}-stage.json`);

  try {
    const activeRuntimeWindow = reacquireRuntimeWindow(runtimeWindow, postClickWindowPath);
    runPythonQa([
      "click-window",
      "--handle",
      String(activeRuntimeWindow.match.handle),
      "--process-names",
      activeRuntimeWindow.searched.processNames.join(","),
      "--title-contains",
      activeRuntimeWindow.searched.titleContains.join(","),
      "--x",
      String(point.x),
      "--y",
      String(point.y),
      "--output",
      clickMetaPath
    ], {
      timeoutMs: 20000
    });

    spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", `Start-Sleep -Milliseconds ${Math.max(0, Number(waitMs) || 0)}`], {
      windowsHide: true,
      encoding: "utf8"
    });

    const postClickWindow = reacquireRuntimeWindow(activeRuntimeWindow, postClickWindowPath);
    const recapture = runPythonQa([
      "capture-window",
      "--handle",
      String(postClickWindow.match.handle),
      "--process-names",
      postClickWindow.searched.processNames.join(","),
      "--title-contains",
      postClickWindow.searched.titleContains.join(","),
      "--output",
      postClickScreenshotPath,
      "--maximize",
      "--client-only"
    ], {
      timeoutMs: 30000
    });
    const restage = runPythonQa([
      "analyze-stage",
      "--input",
      postClickScreenshotPath,
      "--output",
      postClickStagePath
    ], {
      timeoutMs: 30000
    });

    return {
      ok: Boolean(restage?.stageRect),
      clickPoint: point,
      clickMetaPath,
      windowPath: postClickWindowPath,
      screenshotPath: postClickScreenshotPath,
      stagePath: postClickStagePath,
      runtimeWindow: postClickWindow,
      capture: recapture,
      stage: restage
    };
  } catch (error) {
    return {
      ok: false,
      clickPoint: point,
      reason: `${safeLabel}_click_or_recapture_failed`,
      error: String(error.message || error)
    };
  }
}

async function captureStageArtifacts(qaDir, reportStem, runtimeWindow) {
  const screenshotPath = path.join(qaDir, `${reportStem}.png`);
  const captureMetadataPath = path.join(qaDir, `${reportStem}-capture.json`);
  const captureWindowPath = path.join(qaDir, `${reportStem}-capture-window.json`);
  const stagePath = path.join(qaDir, `${reportStem}-stage.json`);
  const ocrPath = path.join(qaDir, `${reportStem}-ocr.json`);
  const activeRuntimeWindow = reacquireRuntimeWindow(runtimeWindow, captureWindowPath);

  const capture = runPythonQa([
    "capture-window",
    "--handle",
    String(activeRuntimeWindow.match.handle),
    "--process-names",
    activeRuntimeWindow.searched.processNames.join(","),
    "--title-contains",
    activeRuntimeWindow.searched.titleContains.join(","),
    "--output",
    screenshotPath,
    "--metadata-output",
    captureMetadataPath,
    "--maximize",
    "--client-only"
  ], {
    timeoutMs: 40000
  });

  const stage = runPythonQa([
    "analyze-stage",
    "--input",
    screenshotPath,
    "--output",
    stagePath
  ], {
    timeoutMs: 30000
  });

  const ocr = runPythonQa([
    "ocr-image",
    "--input",
    screenshotPath,
    "--output",
    ocrPath
  ], {
    timeoutMs: 120000
  });

  return {
    runtimeWindow: activeRuntimeWindow,
    screenshotPath,
    captureMetadataPath,
    captureWindowPath,
    stagePath,
    ocrPath,
    capture,
    stage,
    ocr
  };
}

function cropAndOcr(qaDir, reportStem, screenshotPath, stagePath, name, roi) {
  const cropPath = path.join(qaDir, `${reportStem}-${name}.png`);
  const cropMetaPath = path.join(qaDir, `${reportStem}-${name}-crop.json`);
  const ocrPath = path.join(qaDir, `${reportStem}-${name}-ocr.json`);

  const crop = runPythonQa([
    "crop-image",
    "--input",
    screenshotPath,
    "--output",
    cropPath,
    "--metadata-output",
    cropMetaPath,
    "--stage-json",
    stagePath,
    "--relative",
    "--left",
    String(roi.left),
    "--top",
    String(roi.top),
    "--width",
    String(roi.width),
    "--height",
    String(roi.height)
  ], {
    timeoutMs: 30000
  });

  const ocr = runPythonQa([
    "ocr-image",
    "--input",
    cropPath,
    "--output",
    ocrPath
  ], {
    timeoutMs: 120000
  });

  return {
    cropPath,
    cropMetaPath,
    ocrPath,
    crop,
    ocr
  };
}

function clickMaps(qaDir, reportStem, runtimeWindow, capture, stage) {
  const stageRect = stage?.stageRect;
  if (!stageRect) {
    return {
      ok: false,
      reason: "stage_not_detected"
    };
  }

  const point = stageRelativeToWindow(capture, stageRect, SUPER_POWER_TARGET.mapsClick);
  const clickMetaPath = path.join(qaDir, `${reportStem}-maps-click.json`);
  const postMapWindowPath = path.join(qaDir, `${reportStem}-maps-window.json`);
  const postMapScreenshotPath = path.join(qaDir, `${reportStem}-maps.png`);
  const postMapStagePath = path.join(qaDir, `${reportStem}-maps-stage.json`);
  const postMapOcrPath = path.join(qaDir, `${reportStem}-maps-ocr.json`);
  const postMapServerLogPath = path.join(qaDir, `${reportStem}-maps-server.log`);
  let logOffset = 0;

  try {
    const activeRuntimeWindow = reacquireRuntimeWindow(runtimeWindow, postMapWindowPath);
    logOffset = getFileSize(GAME_SERVER_LOG_PATH);
    runPythonQa([
      "click-window",
      "--handle",
      String(activeRuntimeWindow.match.handle),
      "--process-names",
      activeRuntimeWindow.searched.processNames.join(","),
      "--title-contains",
      activeRuntimeWindow.searched.titleContains.join(","),
      "--x",
      String(point.x),
      "--y",
      String(point.y),
      "--output",
      clickMetaPath
    ], {
      timeoutMs: 20000
    });

    spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", "Start-Sleep -Milliseconds 4000"], {
      windowsHide: true,
      encoding: "utf8"
    });

    const postMapWindow = reacquireRuntimeWindow(activeRuntimeWindow, postMapWindowPath);
    const recapture = runPythonQa([
      "capture-window",
      "--handle",
      String(postMapWindow.match.handle),
      "--process-names",
      postMapWindow.searched.processNames.join(","),
      "--title-contains",
      postMapWindow.searched.titleContains.join(","),
      "--output",
      postMapScreenshotPath,
      "--maximize",
      "--client-only"
    ], {
      timeoutMs: 30000
    });
    const restage = runPythonQa([
      "analyze-stage",
      "--input",
      postMapScreenshotPath,
      "--output",
      postMapStagePath
    ], {
      timeoutMs: 30000
    });
    const ocr = runPythonQa([
      "ocr-image",
      "--input",
      postMapScreenshotPath,
      "--output",
      postMapOcrPath
    ], {
      timeoutMs: 120000
    });
    const librarySeen = isClearlyFlashpointLibrary(postMapWindow?.match, ocr?.text);
    const serverLogSegment = readLogSegment(GAME_SERVER_LOG_PATH, logOffset);
    fs.writeFileSync(postMapServerLogPath, serverLogSegment, "utf8");
    const mapRequestSeen = hasMapSwfRequest(serverLogSegment);

    return {
      ok: Boolean(restage?.stageRect) && !librarySeen && mapRequestSeen,
      clickPoint: point,
      windowPath: postMapWindowPath,
      runtimeWindow: postMapWindow,
      capture: recapture,
      stage: restage,
      ocr,
      librarySeen,
      mapRequestSeen,
      serverLogPath: postMapServerLogPath,
      reason: mapRequestSeen ? null : "map_swf_request_not_seen_after_click"
    };
  } catch (error) {
    const serverLogSegment = readLogSegment(GAME_SERVER_LOG_PATH, logOffset);
    fs.writeFileSync(postMapServerLogPath, serverLogSegment, "utf8");
    const mapRequestSeen = hasMapSwfRequest(serverLogSegment);
    return {
      ok: false,
      clickPoint: point,
      reason: "maps_click_or_recapture_failed",
      error: String(error.message || error),
      clickMetaPath,
      windowPath: postMapWindowPath,
      serverLogPath: postMapServerLogPath,
      mapRequestSeen
    };
  }
}

function buildVerdict({ player, launch, runtimeWindow, popupAudit, captureBundle, dialogue, staticSigns, audio, maps }) {
  const shellPopupSeen = Boolean(popupAudit?.summary?.shellPopupSeen);
  const gameWindowFound = Boolean(runtimeWindow?.match);
  const flashpointLibrarySeen = isClearlyFlashpointLibrary(runtimeWindow?.match, captureBundle?.ocr?.text);
  const stageCoverageRatio = Number(captureBundle?.stage?.stageCoverageRatio || 0);
  const dialogueRoiText = String(dialogue?.ocr?.text || "").trim();
  const dialogueHexSeen = looksLikeHexGarbage(dialogueRoiText);
  const dialogueChineseVisible = containsChinese(dialogueRoiText);
  const staticSignRoiTexts = Object.fromEntries(
    Object.entries(staticSigns || {}).map(([key, value]) => [key, String(value?.ocr?.text || "").trim()])
  );
  const staticSignsSkipped = Boolean(staticSigns?.__skipped);
  const staticSignZhSeen = Object.values(staticSignRoiTexts).some((text) => containsChinese(text));
  const audioSkipped = Boolean(audio?.skipped);
  const audioActive = Boolean(audio?.audioLikelyActive);
  const mapsSkipped = Boolean(maps?.skipped);
  const mapsClickable = Boolean(maps?.ok);

  const failedChecks = [];
  if (!gameWindowFound) failedChecks.push("没有找到真实游戏窗口");
  if (shellPopupSeen) failedChecks.push("出现了 shell / cmd / powershell 弹窗");
  if (flashpointLibrarySeen) failedChecks.push("落到了 Flashpoint 游戏库，而不是 Poptropica 游戏画面");
  if (stageCoverageRatio < 0.35) failedChecks.push("游戏舞台仍然太小，没有达到可玩级放大");
  if (dialogueHexSeen) failedChecks.push("对话气泡仍然显示十六进制垃圾");
  if (!dialogueChineseVisible) failedChecks.push("固定对话气泡里还没看到中文");
  if (!staticSignsSkipped && !staticSignZhSeen) failedChecks.push("主街静态招牌还没出现中文");
  if (!audioSkipped && !audioActive) failedChecks.push("没有检测到真实音频活动");
  if (!mapsSkipped && !mapsClickable) failedChecks.push("Maps 点击后没有通过基本交互验证");

  const verdict = failedChecks.length === 0 ? "pass" : "fail";
  return {
    runtimeVersion: "AS2 Flash",
    playerKey: player.playerKey,
    launchUrl: launch.launchUrl,
    gameWindowFound,
    consolePopupSeen: shellPopupSeen,
    flashpointLibrarySeen,
    stageCoverageRatio,
    dialogueRoiText,
    dialogueHexSeen,
    dialogueChineseVisible,
    staticSignRoiTexts,
    staticSignZhSeen,
    audioActive,
    mapsClickable,
    failedChecks,
    score: 0,
    verdict
  };
}

async function validateSuperPowerCandidate(player, args) {
  const qaDir = ensureQaDir("super-power");
  const reportStem = `super-power-${player.playerKey}-${Date.now()}`;
  const popupAuditPath = path.join(qaDir, `${reportStem}-window-audit.json`);
  const runtimeWindowPath = path.join(qaDir, `${reportStem}-window.json`);
  const audioPath = path.join(qaDir, `${reportStem}-audio.json`);

  try {
    stopTargetProcesses();
    if (flagEnabled(args.clearFlashState)) {
      clearPoptropicaFlashStateForQa();
    }

    const launch = await launchRuntimeForQa("as2", player, SUPER_POWER_TARGET.islandId, {
      roomParam: args.room || args.roomParam,
      islandParam: args.islandParam,
      startupPath: args.startupPath
    });
    await new Promise((resolve) => setTimeout(resolve, Number(args.afterLaunchWaitMs || 9000)));

    const waitArgs = [
      "wait-window",
      "--process-names",
      player.processNames
    ];
    if (player.titleContains) {
      waitArgs.push("--title-contains", player.titleContains);
    }
    if (launch.runtime.pid) {
      waitArgs.push("--pid", String(launch.runtime.pid));
    }
    waitArgs.push(
      "--timeout-ms",
      String(args.windowTimeoutMs || 40000),
      "--poll-ms",
      String(args.windowPollMs || 250),
      "--output",
      runtimeWindowPath
    );
    const runtimeWindow = runPythonQa(waitArgs, {
      timeoutMs: Number(args.windowTimeoutMs || 40000) + 5000
    });

    const captureBundle = await captureStageArtifacts(qaDir, reportStem, runtimeWindow);
    const dialogueClickSequence = parseClickSequence(args, "dialogueClick");
    const dialogueClicks = [];
    let activeRuntimeWindow = captureBundle.runtimeWindow || runtimeWindow;
    let dialogueCaptureBundle = captureBundle;
    for (let index = 0; index < dialogueClickSequence.length; index += 1) {
      const step = dialogueClickSequence[index];
      const dialogueClick = clickStagePoint(
        qaDir,
        reportStem,
        activeRuntimeWindow,
        dialogueCaptureBundle.capture,
        dialogueCaptureBundle.stage,
        { x: step.x, y: step.y },
        `dialogue-trigger-${index + 1}`,
        step.waitMs
      );
      dialogueClicks.push(dialogueClick);
      if (dialogueClick?.ok) {
        activeRuntimeWindow = dialogueClick.runtimeWindow || activeRuntimeWindow;
        dialogueCaptureBundle = {
          ...dialogueCaptureBundle,
          screenshotPath: dialogueClick.screenshotPath,
          stagePath: dialogueClick.stagePath,
          capture: dialogueClick.capture,
          stage: dialogueClick.stage
        };
      } else {
        break;
      }
    }
    const dialogue = cropAndOcr(
      qaDir,
      reportStem,
      dialogueCaptureBundle.screenshotPath,
      dialogueCaptureBundle.stagePath,
      "dialogue",
      SUPER_POWER_TARGET.dialogueRoi
    );
    const staticSigns = flagEnabled(args.skipStaticSigns)
      ? { __skipped: true }
      : Object.fromEntries(
          Object.entries(SUPER_POWER_TARGET.staticSigns).map(([key, roi]) => [
            key,
            cropAndOcr(qaDir, reportStem, captureBundle.screenshotPath, captureBundle.stagePath, key, roi)
          ])
        );

    const audio = flagEnabled(args.skipAudio)
      ? { ok: true, skipped: true, audioLikelyActive: false }
      : runPythonQa([
          "audio-check",
          "--process-names",
          player.processNames,
          "--duration-sec",
          String(args.audioDurationSec || 2),
          "--sample-rate",
          String(args.audioSampleRate || 16000),
          "--peak-threshold",
          String(args.audioPeakThreshold || 0.0005),
          "--output",
          audioPath
        ], {
          timeoutMs: Number(args.audioTimeoutMs || 30000)
        });

    const popupAudit = flagEnabled(args.skipPopupAudit)
      ? { summary: { shellPopupSeen: false }, skipped: true }
      : runPythonQa([
          "window-audit",
          "--duration-ms",
          String(args.popupAuditDurationMs || 2500),
          "--interval-ms",
          String(args.popupAuditIntervalMs || 150),
          "--output",
          popupAuditPath
        ], {
          timeoutMs: Number(args.popupAuditTimeoutMs || 30000)
        });

    const maps = flagEnabled(args.skipMaps)
      ? { ok: false, skipped: true }
      : clickMaps(qaDir, reportStem, activeRuntimeWindow, captureBundle.capture, captureBundle.stage);
    const processSnapshot = collectProcessSnapshot();
    const verdict = buildVerdict({
      player,
      launch,
      runtimeWindow: activeRuntimeWindow,
      popupAudit,
      captureBundle,
      dialogue,
      staticSigns,
      audio,
      maps
    });
    verdict.score = scoreCandidate(verdict);

    return {
      ok: verdict.verdict === "pass",
      generatedAt: new Date().toISOString(),
      islandId: SUPER_POWER_TARGET.islandId,
      sourceGroup: "as2",
      player,
      launch,
      runtimeWindow: activeRuntimeWindow,
      capture: captureBundle.capture,
      stage: captureBundle.stage,
      screenshotOcr: captureBundle.ocr,
      dialogueClicks,
      dialogue,
      staticSigns,
      audio,
      popupAudit,
      maps,
      processSnapshot,
      verdict
    };
  } catch (error) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      islandId: SUPER_POWER_TARGET.islandId,
      sourceGroup: "as2",
      player,
      processSnapshot: collectProcessSnapshot(),
      verdict: {
        runtimeVersion: "AS2 Flash",
        playerKey: player.playerKey,
        launchUrl: null,
        gameWindowFound: false,
        consolePopupSeen: false,
        flashpointLibrarySeen: false,
        stageCoverageRatio: 0,
        dialogueRoiText: "",
        dialogueHexSeen: false,
        dialogueChineseVisible: false,
        staticSignRoiTexts: {},
        staticSignZhSeen: false,
        audioActive: false,
        mapsClickable: false,
        failedChecks: [String(error.message || error)],
        score: 0,
        verdict: "fail"
      },
      error: String(error.message || error)
    };
  }
}

async function validateAs3Runtime(args) {
  const qaDir = ensureQaDir("as3");
  const player = PLAYER_MATRIX.as3[0];
  const runtimeWindowPath = path.join(qaDir, "as3-runtime-window.json");
  const popupAuditPath = path.join(qaDir, "as3-runtime-window-audit.json");
  const audioPath = path.join(qaDir, "as3-runtime-audio.json");
  stopTargetProcesses();
  clearPoptropicaFlashStateForQa();
  const launch = await launchRuntimeForQa("as3", player, null);
  await new Promise((resolve) => setTimeout(resolve, Number(args.afterLaunchWaitMs || 45000)));
  const waitArgs = [
    "wait-window",
    "--process-names",
    player.processNames,
    "--title-contains",
    "poptropica",
    "--timeout-ms",
    String(args.windowTimeoutMs || 40000),
    "--poll-ms",
    String(args.windowPollMs || 250),
    "--output",
    runtimeWindowPath
  ];
  if (launch.runtime.pid) {
    waitArgs.push("--pid", String(launch.runtime.pid));
  }
  const runtimeWindow = runPythonQa(waitArgs, {
    timeoutMs: Number(args.windowTimeoutMs || 40000) + 5000
  });
  const captureBundle = await captureStageArtifacts(qaDir, "as3-runtime", runtimeWindow);
  const activeRuntimeWindow = captureBundle.runtimeWindow || runtimeWindow;
  const audio = runPythonQa([
    "audio-check",
    "--process-names",
    player.processNames,
    "--duration-sec",
    String(args.audioDurationSec || 2),
    "--sample-rate",
    String(args.audioSampleRate || 16000),
    "--peak-threshold",
    String(args.audioPeakThreshold || 0.0005),
    "--output",
    audioPath
  ], {
    timeoutMs: Number(args.audioTimeoutMs || 30000)
  });
  const popupAudit = runPythonQa([
    "window-audit",
    "--duration-ms",
    String(args.popupAuditDurationMs || 2500),
    "--interval-ms",
    String(args.popupAuditIntervalMs || 150),
    "--output",
    popupAuditPath
  ], {
    timeoutMs: Number(args.popupAuditTimeoutMs || 30000)
  });
  const ocrText = String(captureBundle?.ocr?.text || "");
  const as3StartScreenReady =
    /NEW\s+PLAYER|RETURNING\s+PLAYER|WELCOME\s*TO\s*POPTROPICA/iu.test(ocrText) ||
    containsChinese(ocrText);
  const verdict = {
    runtimeVersion: "AS3 Flash",
    playerKey: player.playerKey,
    launchUrl: launch.launchUrl,
    gameWindowFound: Boolean(activeRuntimeWindow?.match),
    consolePopupSeen: Boolean(popupAudit?.summary?.shellPopupSeen),
    flashpointLibrarySeen: isClearlyFlashpointLibrary(activeRuntimeWindow?.match, ocrText),
    stageCoverageRatio: Number(captureBundle?.stage?.stageCoverageRatio || 0),
    dialogueRoiText: "",
    dialogueHexSeen: false,
    dialogueChineseVisible: containsChinese(ocrText),
    staticSignRoiTexts: {},
    staticSignZhSeen: containsChinese(ocrText),
    startScreenReady: as3StartScreenReady,
    audioActive: Boolean(audio?.audioLikelyActive),
    mapsClickable: true,
    failedChecks: [],
    score: 0,
    verdict: "pass"
  };
  if (!verdict.gameWindowFound) verdict.failedChecks.push("没有找到真实游戏窗口");
  if (verdict.consolePopupSeen) verdict.failedChecks.push("出现了 shell / cmd / powershell 弹窗");
  if (verdict.flashpointLibrarySeen) verdict.failedChecks.push("落到了 Flashpoint 游戏库");
  if (verdict.stageCoverageRatio < 0.35) verdict.failedChecks.push("游戏舞台仍然太小");
  if (!verdict.startScreenReady) verdict.failedChecks.push("AS3 还没有进入可识别的开始菜单或本地化界面");
  if (!verdict.audioActive) verdict.failedChecks.push("没有检测到真实音频活动");
  verdict.score = scoreCandidate(verdict);
  verdict.verdict = verdict.failedChecks.length === 0 ? "pass" : "fail";

  const report = {
    ok: verdict.verdict === "pass",
    generatedAt: new Date().toISOString(),
    sourceGroup: "as3",
    launch,
    runtimeWindow: activeRuntimeWindow,
    capture: captureBundle.capture,
    stage: captureBundle.stage,
    screenshotOcr: captureBundle.ocr,
    audio,
    popupAudit,
    processSnapshot: collectProcessSnapshot(),
    verdict
  };
  const reportPath = writeQaReport(path.join("as3", `as3-runtime-report-${Date.now()}.json`), report);
  savePlayerCompatibility({
    players: {
      ...loadPlayerCompatibility().players,
      as3: {
        ...loadPlayerCompatibility().players?.as3,
        preferredPlayer: player.playerKey,
        summary: verdict.verdict === "pass"
          ? "AS3 当前运行链已经通过快验收。"
          : `AS3 快验收未通过：${verdict.failedChecks.join("；") || "原因未明"}`,
        audioStatus: verdict.audioActive ? "已检测到活动" : "未检测到活动",
        graphicsStatus: verdict.startScreenReady ? "开始菜单可见" : verdict.stageCoverageRatio >= 0.35 ? "舞台可见但还没到可识别界面" : "舞台过小或不稳定",
        performanceStatus: verdict.verdict === "pass" ? "通过快验收" : "待继续验证",
        lastVerifiedAt: new Date().toISOString(),
        candidates: [{
          playerKey: player.playerKey,
          label: player.label,
          verdict: verdict.verdict,
          score: verdict.score,
          failedChecks: verdict.failedChecks
        }]
      }
    }
  });
  saveWindowAudit(popupAudit);
  printJson({
    ...report,
    reportPath
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceGroup = String(args.source || "as3").toLowerCase();

  if (sourceGroup === "as3") {
    await validateAs3Runtime(args);
    stopTargetProcesses();
    return;
  }

  const requestedPlayerKey = String(args.playerKey || args.player || "").toLowerCase();
  const maxCandidates = Number(args.maxCandidates || 0);
  const players = requestedPlayerKey
    ? PLAYER_MATRIX.as2.filter((player) => player.playerKey === requestedPlayerKey)
    : PLAYER_MATRIX.as2;
  if (requestedPlayerKey && players.length === 0) {
    throw new Error(`Unknown AS2 playerKey: ${requestedPlayerKey}`);
  }
  const selectedPlayers = maxCandidates > 0 ? players.slice(0, maxCandidates) : players;
  const stopAfterPass = String(args.stopAfterPass ?? "1") !== "0";

  const reports = [];
  for (const player of selectedPlayers) {
    const report = await validateSuperPowerCandidate(player, args);
    const reportPath = writeQaReport(path.join("super-power", `${report.player.playerKey}-report-${Date.now()}.json`), report);
    report.reportPath = reportPath;
    reports.push(report);
    stopTargetProcesses();
    if (stopAfterPass && report.ok) {
      break;
    }
  }

  const chosenPlayer = flagEnabled(args.noSaveCompatibility)
    ? loadPlayerCompatibility().players?.as2 || null
    : saveCompatibility("as2", reports);
  const best = [...reports].sort((left, right) => right.verdict.score - left.verdict.score)[0] || null;
  if (best) {
    saveIslandVerification(buildIslandVerification(best, "as2"));
    saveWindowAudit(best.popupAudit);
  }

  const finalReport = {
    ok: Boolean(best) && best.verdict.verdict === "pass",
    generatedAt: new Date().toISOString(),
    islandId: SUPER_POWER_TARGET.islandId,
    sourceGroup: "as2",
    chosenPlayer,
    candidateCount: reports.length,
    candidates: reports.map((report) => ({
      playerKey: report.player.playerKey,
      label: report.player.label,
      reportPath: report.reportPath,
      verdict: report.verdict
    })),
    bestCandidate: best
      ? {
          playerKey: best.player.playerKey,
          label: best.player.label,
          reportPath: best.reportPath,
          verdict: best.verdict
        }
      : null
  };
  const finalPath = writeQaReport(path.join("super-power", `super-power-matrix-${Date.now()}.json`), finalReport);
  printJson({
    ...finalReport,
    reportPath: finalPath
  });
  stopTargetProcesses();
}

main().catch((error) => {
  console.error(error);
  stopTargetProcesses();
  process.exit(1);
});
