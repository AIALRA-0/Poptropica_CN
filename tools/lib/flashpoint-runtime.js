const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const paths = require("./paths");
const { ensureDirSync, fileExists, hashFile, readJson, removeDirContents, writeJson, writeText } = require("./fs-utils");
const { loadPlayerCompatibility } = require("./status-store");
const { ensurePoptropicaAs2FlashState } = require("./flash-state");

const POPTROPICA_TITLES = {
  as2: "Poptropica (AS2)",
  as3: "Poptropica"
};

const PORTS = {
  proxy: 22500,
  zip: 22501,
  php: 22600
};

const RUNTIME_ENTRY_OVERRIDES = {
  as2: "http://www.poptropica.com/base.php",
  as3: "http://www.poptropica.com/base.php?room=FlashpointStart"
};

const RUNTIME_WINDOW_FILL_RATIO = 1;
const RUNTIME_WINDOW_ASPECT_RATIO = 1.56;
const RUNTIME_WINDOW_MIN_WIDTH = 1180;
const RUNTIME_WINDOW_MIN_HEIGHT = 760;
const RUNTIME_WINDOW_DEFAULT_HEIGHT = 760;
const RUNTIME_CONTENT_FILL_RATIO = 1;
const RUNTIME_CONTENT_BASE_WIDTH = 1010;
const RUNTIME_CONTENT_BASE_HEIGHT = 645;
const RUNTIME_BROWSER_ZOOM_MIN = 1;
const RUNTIME_BROWSER_ZOOM_MAX = 1;
const USER_AUDIO_EXTENSIONS = [".mp3", ".ogg", ".wav", ".m4a"];

function parsePositiveIntEnv(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const value = Number.parseInt(String(raw), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseRatioEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0.5, Math.min(1, value));
}

function parsePositiveFloatEnv(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getFlashpointPaths(config) {
  const root = config.sources.flashpointRoot;
  if (!root || !fileExists(root)) {
    throw new Error("Flashpoint root is not configured.");
  }
  const launcherExe = [
    path.join(root, "Launcher", "Flashpoint.exe"),
    path.join(root, "Flashpoint.exe")
  ].find((candidate) => fileExists(candidate)) || null;
  const navigatorPortableDir = path.join(root, "FPSoftware", "fpnavigator-portable");
  const navigatorExe = path.join(navigatorPortableDir, "FPNavigator.exe");
  const navigatorBrowserExe = path.join(navigatorPortableDir, "Bin", "flashpointnavigator", "flashpointnavigator.exe");
  const navigatorIni = path.join(navigatorPortableDir, "FPNavigator.ini");
  const navigatorProfileDir = path.join(navigatorPortableDir, "User", "flashpointnavigator", "Profiles", "Default");
  const securePlayerExe = path.join(root, "FPSoftware", "FlashpointSecurePlayer.exe");
  const gameServerExe = path.join(root, "Server", "Flashpoint Game Server.exe");
  const phpExe = path.join(root, "Legacy", "php.exe");
  const phpScript = path.join(root, "Legacy", "router.php");
  const dbPath = path.join(root, "Data", "flashpoint.sqlite");
  const dataGamesDir = path.join(root, "Data", "Games");
  const browserPluginsDir = path.join(root, "FPSoftware", "BrowserPlugins");
  const fpSoftwareDir = path.join(root, "FPSoftware");

  return {
    root,
    launcherExe,
    navigatorPortableDir,
    navigatorExe,
    navigatorBrowserExe,
    navigatorIni,
    navigatorProfileDir,
    securePlayerExe,
    gameServerExe,
    phpExe,
    phpScript,
    dbPath,
    dataGamesDir,
    browserPluginsDir,
    fpSoftwareDir
  };
}

function ensureJunction(linkPath, targetPath) {
  if (fileExists(linkPath)) {
    try {
      const currentTarget = fs.realpathSync(linkPath);
      const expectedTarget = fs.realpathSync(targetPath);
      if (currentTarget.toLowerCase() === expectedTarget.toLowerCase()) {
        return;
      }
    } catch (_error) {
      // Recreate broken or mismatched junctions below.
    }
    fs.rmSync(linkPath, { recursive: true, force: true });
  }

  ensureDirSync(path.dirname(linkPath));
  fs.symlinkSync(targetPath, linkPath, "junction");
}

function writePcm16MonoWav(filePath, { sampleRate, samples }) {
  const headerSize = 44;
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(headerSize + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(Math.round(clamped * 32767), headerSize + index * bytesPerSample);
  }
  ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, buffer);
}

function hasUserAudioDefault(as2AudioRoot) {
  const globalDir = path.join(as2AudioRoot, "_global");
  return USER_AUDIO_EXTENSIONS.some((extension) => fileExists(path.join(globalDir, `default${extension}`)));
}

function ensureGeneratedAs2FallbackAudio() {
  const as2AudioRoot = path.join(paths.userAudioDir, "as2");
  if (hasUserAudioDefault(as2AudioRoot)) {
    return null;
  }

  const sampleRate = 22050;
  const durationSec = 4;
  const totalSamples = sampleRate * durationSec;
  const fadeSamples = Math.floor(sampleRate * 0.08);
  const samples = new Array(totalSamples);
  for (let index = 0; index < totalSamples; index += 1) {
    const t = index / sampleRate;
    const fadeIn = index < fadeSamples ? index / fadeSamples : 1;
    const fadeOut = totalSamples - index < fadeSamples ? (totalSamples - index) / fadeSamples : 1;
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut, 1));
    const tone =
      Math.sin(2 * Math.PI * 196 * t) * 0.035 +
      Math.sin(2 * Math.PI * 392 * t) * 0.018 +
      Math.sin(2 * Math.PI * 294 * t) * 0.012;
    samples[index] = tone * envelope;
  }

  const outputPath = path.join(as2AudioRoot, "_global", "default.wav");
  writePcm16MonoWav(outputPath, { sampleRate, samples });
  return outputPath;
}

function copyDirSync(sourceDir, targetDir) {
  ensureDirSync(path.dirname(targetDir));
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
    verbatimSymlinks: false
  });
}

function mirrorPhpScriptsIntoCgiBin(managedLegacyDir) {
  const htdocsDir = path.join(managedLegacyDir, "htdocs");
  const cgiBinDir = path.join(managedLegacyDir, "cgi-bin");
  if (!fileExists(htdocsDir)) {
    return;
  }

  ensureDirSync(cgiBinDir);
  const scriptExtensions = new Set([".php", ".php5", ".phtml"]);

  const walk = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (!scriptExtensions.has(extension)) {
        continue;
      }

      const relativeFromHtdocs = path.relative(htdocsDir, absolutePath);
      const normalizedRelative = relativeFromHtdocs.replace(/\\/gu, "/");
      const candidateTargets = [relativeFromHtdocs];
      if (normalizedRelative.startsWith("content/")) {
        candidateTargets.push(relativeFromHtdocs.slice("content/".length));
      }

      for (const targetRelative of candidateTargets) {
        if (!targetRelative || targetRelative.startsWith("..")) {
          continue;
        }
        const targetPath = path.join(cgiBinDir, targetRelative);
        ensureDirSync(path.dirname(targetPath));
        if (fileExists(targetPath)) {
          const sourceHash = hashIfExists(absolutePath);
          const targetHash = hashIfExists(targetPath);
          if (sourceHash && targetHash && sourceHash === targetHash) {
            continue;
          }
          fs.rmSync(targetPath, { force: true });
        }
        try {
          fs.linkSync(absolutePath, targetPath);
        } catch (_error) {
          fs.copyFileSync(absolutePath, targetPath);
        }
      }
    }
  };

  walk(htdocsDir);
}

function writeManagedPoptropicaEndpointStubs(managedLegacyDir) {
  const stubs = new Map([
    [
      "crash-record.php",
      [
        "<?php",
        "header('Content-Type: text/plain; charset=utf-8');",
        "http_response_code(200);",
        "echo 'OK';",
        ""
      ].join("\n")
    ]
  ]);
  for (const baseDirName of ["htdocs", "cgi-bin"]) {
    const poptropicaDir = path.join(managedLegacyDir, baseDirName, "www.poptropica.com");
    ensureDirSync(poptropicaDir);
    for (const [fileName, content] of stubs.entries()) {
      writeText(path.join(poptropicaDir, fileName), content);
    }
  }
}

function syncUserAudioOverrides(managedLegacyDir) {
  const sourceRoot = path.resolve(paths.userAudioDir);
  const targetRoot = path.resolve(
    managedLegacyDir,
    "htdocs",
    "www.poptropica.com",
    "flashpoint",
    "user-audio"
  );
  const managedLegacyRoot = path.resolve(managedLegacyDir);
  if (!targetRoot.toLowerCase().startsWith(`${managedLegacyRoot.toLowerCase()}${path.sep}`)) {
    throw new Error(`Refusing to link user audio outside managed Legacy root: ${targetRoot}`);
  }

  ensureGeneratedAs2FallbackAudio();
  ensureDirSync(sourceRoot);
  ensureDirSync(path.dirname(targetRoot));
  ensureJunction(targetRoot, sourceRoot);
}

function waitForManagedBasePhpRefresh(managedLegacyDir, previousMtimeMs = 0, timeoutMs = 8000) {
  const basePhpPath = path.join(managedLegacyDir, "htdocs", "www.poptropica.com", "base.php");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fileExists(basePhpPath)) {
      const currentMtimeMs = fs.statSync(basePhpPath).mtimeMs;
      if (!previousMtimeMs || currentMtimeMs > previousMtimeMs) {
        return true;
      }
    }
    spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", "Start-Sleep -Milliseconds 250"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 2000
    });
  }
  return fileExists(basePhpPath);
}

function hashIfExists(filePath) {
  return fileExists(filePath) ? hashFile(filePath) : null;
}

function ensureMirroredDataEntry(targetPath, sourcePath) {
  if (!fileExists(sourcePath)) {
    return;
  }

  const sourceStat = fs.statSync(sourcePath);
  if (sourceStat.isDirectory()) {
    ensureJunction(targetPath, sourcePath);
    return;
  }

  if (fileExists(targetPath)) {
    const targetStat = fs.lstatSync(targetPath);
    if (targetStat.isDirectory() || targetStat.isSymbolicLink()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else if (hashIfExists(targetPath) === hashIfExists(sourcePath)) {
      return;
    } else {
      fs.rmSync(targetPath, { force: true });
    }
  }

  ensureDirSync(path.dirname(targetPath));
  try {
    fs.linkSync(sourcePath, targetPath);
  } catch (_error) {
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function stopManagedLegacyPhpProcesses(managedLegacyDir) {
  const escapedLegacyDir = managedLegacyDir.replace(/'/gu, "''");
  const script = [
    "$targets = Get-CimInstance Win32_Process | Where-Object {",
    "  $_.Name -in @('php-cgi.exe','php-cgi-real.exe','php.exe','php-win.exe') -and",
    `  $_.ExecutablePath -like '${escapedLegacyDir}\\*'`,
    "}",
    "foreach ($target in $targets) {",
    "  try { Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop } catch {}",
    "}"
  ].join("\n");

  spawnSync("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout: 30000
  });
}

function clearStaleOriginalWrapperMarker() {
  const markerPath = path.join(paths.managedWorkspaceDir, "original-php-cgi-wrapper.json");
  if (!fileExists(markerPath)) {
    return;
  }

  const marker = readJson(markerPath, null);
  if (!marker?.originalPhpCgi || !fileExists(marker.originalPhpCgi)) {
    fs.rmSync(markerPath, { force: true });
    return;
  }

  const wrapperExe = path.join(paths.phpCgiWrapperPublishDir, "php-cgi.exe");
  if (!fileExists(wrapperExe)) {
    return;
  }

  const originalHash = hashIfExists(marker.originalPhpCgi);
  const wrapperHash = hashIfExists(wrapperExe);
  if (originalHash && wrapperHash && originalHash !== wrapperHash) {
    fs.rmSync(markerPath, { force: true });
  }
}

function ensurePhpCgiWrapperBuild() {
  const projectDir = paths.phpCgiWrapperProjectDir;
  const publishDir = paths.phpCgiWrapperPublishDir;
  const projectFile = path.join(projectDir, "PhpCgiWrapper.csproj");
  const programFile = path.join(projectDir, "Program.cs");
  const outputExe = path.join(publishDir, "php-cgi.exe");
  const statePath = path.join(publishDir, "build-state.json");

  if (!fileExists(projectFile) || !fileExists(programFile)) {
    throw new Error("php-cgi wrapper project files are missing.");
  }

  const sourceState = {
    projectHash: hashFile(projectFile),
    programHash: hashFile(programFile)
  };
  const existingState = readJson(statePath, null);
  const shouldReuse =
    fileExists(outputExe) &&
    existingState &&
    existingState.projectHash === sourceState.projectHash &&
    existingState.programHash === sourceState.programHash;

  if (shouldReuse) {
    return outputExe;
  }

  removeDirContents(publishDir);
  ensureDirSync(publishDir);

  const publish = spawnSync("dotnet", [
    "publish",
    projectFile,
    "-c",
    "Release",
    "-r",
    "win-x64",
    "--self-contained",
    "false",
    "-p:PublishSingleFile=true",
    "-p:EnableCompressionInSingleFile=false",
    "-o",
    publishDir
  ], {
    cwd: projectDir,
    encoding: "utf8",
    windowsHide: true,
    timeout: 300000
  });

  if (publish.status !== 0 || !fileExists(outputExe)) {
    throw new Error((publish.stderr || publish.stdout || "Failed to publish php-cgi wrapper.").trim());
  }

  writeJson(statePath, {
    builtAt: new Date().toISOString(),
    ...sourceState,
    outputExe
  });
  return outputExe;
}

function ensureManagedServiceRoot(config) {
  const flashpoint = getFlashpointPaths(config);
  const managedRoot = paths.managedServiceRootDir;
  const managedDataDir = path.join(managedRoot, "Data");
  const managedGamesDir = path.join(managedDataDir, "Games");
  const sourceDataDir = path.join(flashpoint.root, "Data");
  const managedLegacyDir = path.join(managedRoot, "Legacy");
  const sourceLegacyDir = path.join(flashpoint.root, "Legacy");
  const sourcePhpCgi = path.join(sourceLegacyDir, "php-cgi.exe");
  const sourcePhpWin = path.join(sourceLegacyDir, "php-win.exe");
  const sourceRouter = path.join(sourceLegacyDir, "router.php");
  const serviceMetaPath = paths.managedServiceMetaPath;
  const currentSourceState = {
    sourceLegacyDir,
    phpCgiHash: fileExists(sourcePhpCgi) ? hashFile(sourcePhpCgi) : null,
    phpWinHash: fileExists(sourcePhpWin) ? hashFile(sourcePhpWin) : null,
    routerHash: fileExists(sourceRouter) ? hashFile(sourceRouter) : null
  };
  const existingMeta = readJson(serviceMetaPath, null);
  const wrapperExe = ensurePhpCgiWrapperBuild();
  const wrapperHash = hashFile(wrapperExe);
  const managedPhpCgi = path.join(managedLegacyDir, "php-cgi.exe");
  const managedPhpCgiReal = path.join(managedLegacyDir, "php-cgi-real.exe");
  const managedPhpCgiHash = hashIfExists(managedPhpCgi);
  const managedPhpCgiRealHash = hashIfExists(managedPhpCgiReal);
  const shouldReuseLegacy =
      fileExists(managedPhpCgi) &&
      fileExists(managedPhpCgiReal) &&
      existingMeta &&
      existingMeta.routerHash === currentSourceState.routerHash &&
      existingMeta.wrapperHash === wrapperHash &&
      managedPhpCgiHash === wrapperHash &&
      managedPhpCgiRealHash === currentSourceState.phpCgiHash;

  ensureDirSync(managedRoot);
  clearStaleOriginalWrapperMarker();

  if (!shouldReuseLegacy) {
    stopManagedLegacyPhpProcesses(managedLegacyDir);
    fs.rmSync(managedLegacyDir, { recursive: true, force: true });
    copyDirSync(sourceLegacyDir, managedLegacyDir);

    if (fileExists(managedPhpCgiReal)) {
      fs.rmSync(managedPhpCgiReal, { force: true });
    }
    if (fileExists(managedPhpCgi)) {
      fs.renameSync(managedPhpCgi, managedPhpCgiReal);
    }
    fs.copyFileSync(wrapperExe, managedPhpCgi);
  }

  mirrorPhpScriptsIntoCgiBin(managedLegacyDir);
  writeManagedPoptropicaEndpointStubs(managedLegacyDir);
  syncUserAudioOverrides(managedLegacyDir);

  // Keep the managed Data directory local so we can control which runtime
  // helpers are active. The Flashpoint AutoMount extension interferes with
  // our direct browser-launch flow and repeatedly remounts the same GameZIP.
  // We still mirror the rest of Flashpoint's Data payload because the game
  // server expects several metadata files to exist alongside Data/Games.
  if (fileExists(managedDataDir)) {
    const dataStat = fs.lstatSync(managedDataDir);
    if (dataStat.isSymbolicLink() || !dataStat.isDirectory()) {
      fs.rmSync(managedDataDir, { recursive: true, force: true });
    }
  }
  ensureDirSync(managedDataDir);
  const safeDataEntries = new Set([
    "Games",
    "Images",
    "Logos",
    "LogoSets",
    "MetaEdits",
    "Playlists",
    "Ruffle",
    "Themes",
    "credits.json",
    "flashpoint.sqlite",
    "flashpoint.sqlite-shm",
    "flashpoint.sqlite-wal",
    "gotd.json",
    "services.json"
  ]);
  for (const entry of fs.readdirSync(managedDataDir, { withFileTypes: true })) {
    if (safeDataEntries.has(entry.name)) {
      continue;
    }
    fs.rmSync(path.join(managedDataDir, entry.name), { recursive: true, force: true });
  }
  ensureDirSync(managedGamesDir);
  if (fileExists(sourceDataDir) && fs.statSync(sourceDataDir).isDirectory()) {
    for (const entryName of safeDataEntries) {
      if (entryName === "Games") {
        continue;
      }
      ensureMirroredDataEntry(
        path.join(managedDataDir, entryName),
        path.join(sourceDataDir, entryName)
      );
    }
  }

  for (const dirName of ["FPSoftware", "Server", "Launcher"]) {
    const sourceDir = path.join(flashpoint.root, dirName);
    if (fileExists(sourceDir)) {
      ensureJunction(path.join(managedRoot, dirName), sourceDir);
    }
  }

  writeJson(serviceMetaPath, {
    generatedAt: new Date().toISOString(),
    managedRoot,
    wrapperHash,
    ...currentSourceState
  });

  return {
    managedRoot,
    managedLegacyDir,
    managedPhpCgi: path.join(managedLegacyDir, "php-cgi.exe"),
    managedPhpExe: fileExists(path.join(managedLegacyDir, "php-win.exe"))
      ? path.join(managedLegacyDir, "php-win.exe")
      : path.join(managedLegacyDir, "php.exe")
  };
}

function ensureOriginalLegacyPhpCgiWrapper(config) {
  const flashpoint = getFlashpointPaths(config);
  const wrapperExe = ensurePhpCgiWrapperBuild();
  const legacyDir = path.join(flashpoint.root, "Legacy");
  const originalPhpCgi = path.join(legacyDir, "php-cgi.exe");
  const originalPhpCgiReal = path.join(legacyDir, "php-cgi-real.exe");
  const wrapperHash = hashFile(wrapperExe);

  if (!fileExists(originalPhpCgi) && !fileExists(originalPhpCgiReal)) {
    throw new Error(`Missing php-cgi runtime in original Flashpoint Legacy folder: ${legacyDir}`);
  }

  if (!fileExists(originalPhpCgiReal) && fileExists(originalPhpCgi)) {
    fs.renameSync(originalPhpCgi, originalPhpCgiReal);
  }

  const currentWrapped = fileExists(originalPhpCgi) ? hashFile(originalPhpCgi) === wrapperHash : false;
  if (!currentWrapped) {
    fs.copyFileSync(wrapperExe, originalPhpCgi);
  }

  const metaPath = path.join(paths.managedWorkspaceDir, "original-php-cgi-wrapper.json");
  writeJson(metaPath, {
    generatedAt: new Date().toISOString(),
    legacyDir,
    originalPhpCgi,
    originalPhpCgiReal,
    wrapperHash,
    wrapped: true
  });

  return {
    originalPhpCgi,
    originalPhpCgiReal,
    wrapped: true
  };
}

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(750);
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
    socket.connect(port, host, () => done(true));
  });
}

async function waitForPort(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnDetached(command, args, cwd, logFileName) {
  ensureDirSync(paths.managedLogsDir);
  const logPath = path.join(paths.managedLogsDir, logFileName);
  const logStream = fs.openSync(logPath, "a");
  const child = spawn(command, args, {
    cwd,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", logStream, logStream]
  });
  child.unref();
  return {
    pid: child.pid,
    logPath
  };
}

function appendManagedLogLine(logFileName, message) {
  ensureDirSync(paths.managedLogsDir);
  const logPath = path.join(paths.managedLogsDir, logFileName);
  fs.appendFileSync(logPath, `[POPTROPICA_FLASH ${new Date().toISOString()}] ${message}\n`);
  return logPath;
}

async function startPhpRouter(managedService, executablePath, reason) {
  if (!fileExists(executablePath)) {
    throw new Error(`Missing php runtime: ${executablePath}`);
  }

  appendManagedLogLine("flashpoint-php-router.log", `starting php router with ${path.basename(executablePath)} (${reason})`);
  const started = spawnDetached(
    executablePath,
    ["-S", `127.0.0.1:${PORTS.php}`, "router.php"],
    managedService.managedLegacyDir,
    "flashpoint-php-router.log"
  );
  const healthy = await waitForPort(PORTS.php, 8000);
  return {
    ...started,
    healthy,
    executablePath
  };
}

async function ensureFlashpointServices(config) {
  const flashpoint = getFlashpointPaths(config);
  const managedService = ensureManagedServiceRoot(config);
  const serviceState = readJson(paths.flashpointRuntimeStatePath, {}) || {};
  const started = {};

  if (!(await isPortOpen(PORTS.proxy)) || !(await isPortOpen(PORTS.zip))) {
    if (!fileExists(flashpoint.gameServerExe)) {
      throw new Error(`Missing Flashpoint Game Server: ${flashpoint.gameServerExe}`);
    }
    started.gameServer = spawnDetached(
      flashpoint.gameServerExe,
      ["-useInfinityServer=true", `-rootPath=${managedService.managedRoot}`, `-proxyPort=${PORTS.proxy}`],
      path.dirname(flashpoint.gameServerExe),
      "flashpoint-game-server.log"
    );
  }

  if (!(await isPortOpen(PORTS.php))) {
    stopManagedLegacyPhpProcesses(managedService.managedLegacyDir);
    const phpCli = path.join(managedService.managedLegacyDir, "php.exe");
    const phpWin = path.join(managedService.managedLegacyDir, "php-win.exe");
    const candidates = [phpCli, phpWin].filter((candidate, index, all) => fileExists(candidate) && all.indexOf(candidate) === index);

    let routerStarted = null;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const result = await startPhpRouter(managedService, candidate, index === 0 ? "primary" : "fallback");
      if (result.healthy) {
        routerStarted = result;
        break;
      }
      appendManagedLogLine(
        "flashpoint-php-router.log",
        `php router failed to listen on ${PORTS.php} with ${path.basename(candidate)}; stopping and trying next candidate`
      );
      stopManagedLegacyPhpProcesses(managedService.managedLegacyDir);
    }

    if (!routerStarted) {
      throw new Error(`PHP router failed to start on port ${PORTS.php}. Check ${path.join(paths.managedLogsDir, "flashpoint-php-router.log")}`);
    }

    started.phpRouter = routerStarted;
  }

  const healthy = {
    proxy: await waitForPort(PORTS.proxy, 45000),
    zip: await waitForPort(PORTS.zip, 45000),
    php: await waitForPort(PORTS.php, 15000)
  };

  writeJson(paths.flashpointRuntimeStatePath, {
    ...serviceState,
    lastServiceStartAt: new Date().toISOString(),
    started,
    ports: healthy,
    managedRoot: managedService.managedRoot
  });

  const result = {
    flashpoint,
    managedService,
    healthy,
    started
  };

  const unhealthy = Object.entries(healthy)
    .filter(([, ok]) => !ok)
    .map(([name]) => `${name}:${PORTS[name]}`);
  if (unhealthy.length) {
    throw new Error(`Flashpoint services did not become ready: ${unhealthy.join(", ")}.`);
  }

  return result;
}

function openFlashpointDb(config) {
  const flashpoint = getFlashpointPaths(config);
  return new DatabaseSync(flashpoint.dbPath, { open: true, readOnly: true });
}

function getPoptropicaRecords(config) {
  const db = openFlashpointDb(config);
  const rows = db.prepare(`
    SELECT g.id AS gameId, g.title, g.activeDataId, gd.id AS dataId, gd.dateAdded, gd.path, gd.presentOnDisk, gd.launchCommand, gd.applicationPath
    FROM game g
    JOIN game_data gd ON gd.gameId = g.id
    WHERE g.title IN ('Poptropica (AS2)', 'Poptropica')
    ORDER BY g.title, gd.id
  `).all();
  db.close();

  const result = { as2: null, as3: null, raw: rows };
  for (const sourceGroup of ["as2", "as3"]) {
    const title = POPTROPICA_TITLES[sourceGroup];
    const sourceRows = rows.filter((row) => row.title === title);
    if (sourceRows.length === 0) {
      continue;
    }
    const active = sourceRows.find((row) => row.dataId === sourceRows[0].activeDataId) || sourceRows[sourceRows.length - 1];
    result[sourceGroup] = {
      gameId: active.gameId,
      title: active.title,
      activeDataId: active.activeDataId,
      dataId: active.dataId,
      dateAdded: active.dateAdded,
      launchCommand: resolveRuntimeLaunchUrl(sourceGroup, active.launchCommand),
      originalLaunchCommand: active.launchCommand,
      applicationPath: active.applicationPath,
      rows: sourceRows
    };
  }
  return result;
}

function resolveRuntimeLaunchUrl(sourceGroup, launchCommand) {
  const normalized = String(sourceGroup || "").toLowerCase();
  const original = typeof launchCommand === "string" ? launchCommand.trim() : "";
  const override = RUNTIME_ENTRY_OVERRIDES[normalized] || null;

  if (normalized === "as3") {
    if (!original || /flashpointstart/iu.test(original) || /base\.php(?:\?|$)/iu.test(original)) {
      return override;
    }
  }

  if (normalized === "as2" && !original) {
    return override;
  }

  return original || override || null;
}

function buildDataPackFileName(record) {
  return `${record.gameId}-${new Date(record.dateAdded).getTime()}.zip`;
}

function ensureManagedWorkspace(config) {
  const flashpoint = getFlashpointPaths(config);
  const records = getPoptropicaRecords(config);

  ensureDirSync(paths.managedWorkspaceDir);
  ensureDirSync(paths.managedLogsDir);

  const preferences = {
    flashpointRoot: flashpoint.root,
    defaultView: "poptropica-only",
    managedBy: "POPTROPICA_FLASH",
    generatedAt: new Date().toISOString()
  };
  writeJson(paths.managedPreferencesPath, preferences);
  writeJson(paths.managedExtConfigPath, {
    mode: "poptropica-only",
    hiddenDefaultLibraries: true
  });
  writeJson(paths.managedLibraryPath, {
    generatedAt: new Date().toISOString(),
    entries: Object.entries(records)
      .filter(([key]) => key === "as2" || key === "as3")
      .map(([sourceGroup, record]) => ({
        sourceGroup,
        title: record?.title || null,
        launchCommand: record?.launchCommand || null
      }))
  });

  const managedDb = new DatabaseSync(paths.managedDbPath);
  managedDb.exec(`
    PRAGMA journal_mode = DELETE;
    CREATE TABLE IF NOT EXISTS game (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      activeDataId INTEGER
    );
    CREATE TABLE IF NOT EXISTS game_data (
      id INTEGER PRIMARY KEY,
      gameId TEXT NOT NULL,
      dateAdded TEXT,
      path TEXT,
      presentOnDisk INTEGER,
      launchCommand TEXT,
      applicationPath TEXT
    );
    DELETE FROM game_data;
    DELETE FROM game;
  `);
  const insertGame = managedDb.prepare("INSERT INTO game (id, title, activeDataId) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, activeDataId = excluded.activeDataId");
  const insertGameData = managedDb.prepare("INSERT INTO game_data (id, gameId, dateAdded, path, presentOnDisk, launchCommand, applicationPath) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET gameId = excluded.gameId, dateAdded = excluded.dateAdded, path = excluded.path, presentOnDisk = excluded.presentOnDisk, launchCommand = excluded.launchCommand, applicationPath = excluded.applicationPath");

  for (const sourceGroup of ["as2", "as3"]) {
    const record = records[sourceGroup];
    const sourceZip = config.sources[sourceGroup === "as2" ? "as2Gamezip" : "as3Gamezip"];
    if (!record) {
      continue;
    }
    insertGame.run(record.gameId, record.title, record.dataId);
    for (const row of record.rows || []) {
      insertGameData.run(
        row.dataId,
        row.gameId,
        row.dateAdded,
        row.dataId === record.dataId && sourceZip ? sourceZip : row.path,
        row.dataId === record.dataId && sourceZip ? 1 : row.presentOnDisk,
        row.launchCommand,
        row.applicationPath
      );
    }
  }
  managedDb.close();

  return {
    workspaceDir: paths.managedWorkspaceDir,
    managedDbPath: paths.managedDbPath,
    records
  };
}

function ensureMountableDataPack(config, sourceGroup) {
  const managedService = ensureManagedServiceRoot(config);
  const records = getPoptropicaRecords(config);
  const record = records[sourceGroup];
  if (!record) {
    throw new Error(`No Flashpoint database record found for ${sourceGroup}.`);
  }

  const sourceZip = config.sources[sourceGroup === "as2" ? "as2Gamezip" : "as3Gamezip"];
  if (!sourceZip || !fileExists(sourceZip)) {
    throw new Error(`Missing ${sourceGroup.toUpperCase()} gamezip: ${sourceZip || "(not configured)"}`);
  }

  const preferredRuntimeZip = sourceGroup === "as2"
    ? paths.as2RuntimeZipPath
    : (() => {
        if (fileExists(paths.as3RuntimeZipPath)) {
          return paths.as3RuntimeZipPath;
        }
        if (fileExists(paths.as3RuntimeStartFlowZipPath)) {
          return paths.as3RuntimeStartFlowZipPath;
        }
        return paths.as3RuntimeZipPath;
      })();
  const runtimeZip = fileExists(preferredRuntimeZip) ? preferredRuntimeZip : null;
  const mountSourcePath = runtimeZip || sourceZip;

  const managedDataGamesDir = path.join(managedService.managedRoot, "Data", "Games");
  ensureDirSync(managedDataGamesDir);
  const mountFileName = buildDataPackFileName(record);
  const targetZipPath = path.join(managedDataGamesDir, mountFileName);
  const needsRefresh = !fileExists(targetZipPath) || hashFile(targetZipPath) !== hashFile(mountSourcePath);

  if (needsRefresh) {
    try {
      if (fileExists(targetZipPath)) {
        fs.rmSync(targetZipPath, { force: true });
      }
      fs.linkSync(mountSourcePath, targetZipPath);
    } catch (_error) {
      fs.copyFileSync(mountSourcePath, targetZipPath);
    }
  }

  return {
    ...record,
    sourceGroup,
    sourceZip,
    runtimeZip,
    mountSourcePath,
    targetZipPath,
    mountFileName
  };
}

async function postZipServer(endpoint, filePath, options = {}) {
  const attempts = Number(options.attempts || 12);
  const retryMs = Number(options.retryMs || 500);
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(`http://127.0.0.1:${PORTS.zip}/fpProxy/api/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ filePath })
      });
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        throw error;
      }
      await sleep(retryMs);
    }
  }
  throw lastError;
}

async function mountSourceZip(config, sourceGroup) {
  await ensureFlashpointServices(config);
  const runtimeState = readJson(paths.flashpointRuntimeStatePath, {}) || {};
  const target = ensureMountableDataPack(config, sourceGroup);
  const targetZipHash = fileExists(target.targetZipPath) ? hashFile(target.targetZipPath) : null;
  const managedLegacyDir = path.join(paths.managedServiceRootDir, "Legacy");
  const basePhpPath = path.join(managedLegacyDir, "htdocs", "www.poptropica.com", "base.php");
  const basePhpMtimeBefore = fileExists(basePhpPath) ? fs.statSync(basePhpPath).mtimeMs : 0;
  const sameAsLastMount =
    runtimeState.lastMountedZip &&
    path.resolve(runtimeState.lastMountedZip) === path.resolve(target.targetZipPath) &&
    runtimeState.lastMountedZipHash === targetZipHash;

  if (runtimeState.lastMountedZip && !sameAsLastMount) {
    await postZipServer("unmountzip", runtimeState.lastMountedZip).catch(() => null);
  }

  let response = null;
  let body = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await postZipServer("mountzip", target.targetZipPath);
    body = response.ok ? "" : await response.text().catch(() => "");
    if (response.ok || /already mounted/iu.test(body)) {
      break;
    }
    await postZipServer("unmountzip", target.targetZipPath).catch(() => null);
    if (attempt < 3) {
      await sleep(750);
    }
  }

  if (!response.ok && !/already mounted/iu.test(body)) {
    throw new Error(
      `mountzip failed for ${sourceGroup} with status ${response.status}; target=${target.targetZipPath}; body=${String(body || "").slice(0, 500)}`
    );
  }

  waitForManagedBasePhpRefresh(managedLegacyDir, basePhpMtimeBefore);
  syncUserAudioOverrides(managedLegacyDir);

  writeJson(paths.flashpointRuntimeStatePath, {
    ...runtimeState,
    lastMountedAt: new Date().toISOString(),
    lastMountedSource: sourceGroup,
    lastMountedZip: target.targetZipPath,
    lastMountedZipHash: targetZipHash
  });

  return target;
}

function proxyRequest(url) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port: PORTS.proxy,
      method: "GET",
      path: url
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    request.on("error", reject);
    request.end();
  });
}

async function verifyBasePhp(config, sourceGroup) {
  await mountSourceZip(config, sourceGroup);
  return proxyRequest("http://www.poptropica.com/base.php");
}

function getNavigatorExecutable(config) {
  const flashpoint = getFlashpointPaths(config);
  if (!fileExists(flashpoint.navigatorBrowserExe)) {
    throw new Error(`Missing flashpointnavigator executable: ${flashpoint.navigatorBrowserExe}`);
  }
  return flashpoint.navigatorBrowserExe;
}

function getRuntimeEnvironment(config, sourceGroup) {
  const flashpoint = getFlashpointPaths(config);
  const desiredPlugin = sourceGroup === "as2" ? "Flash" : "Flash32";
  const pluginPaths = [
    path.join(flashpoint.browserPluginsDir, desiredPlugin),
    path.join(flashpoint.browserPluginsDir, "SoundPlayback"),
    path.join(flashpoint.browserPluginsDir, "Shockwave", "Adobe", "Director")
  ].filter((candidate) => fileExists(candidate));
  const env = {
    ...process.env,
    FP_PATH: flashpoint.root,
    MOZ_DISABLE_SAFE_MODE_KEY: "1",
    MOZ_NO_REMOTE: "1",
    MOZ_PROFILE_PATH: flashpoint.navigatorProfileDir,
    MOZ_PLUGIN_PATH: pluginPaths.join(";"),
    PATH: process.env.PATH || ""
  };
  if ("ELECTRON_RUN_AS_NODE" in env) {
    delete env.ELECTRON_RUN_AS_NODE;
  }
  return env;
}

function ensureNavigatorFlashPlugin(config, sourceGroup) {
  const flashpoint = getFlashpointPaths(config);
  if (!fileExists(flashpoint.navigatorIni)) {
    return {
      changed: false,
      reason: "missing_ini",
      flashPlugin: null
    };
  }

  const original = fs.readFileSync(flashpoint.navigatorIni, "utf8");
  const desiredPlugin = sourceGroup === "as2" ? "Flash" : "Flash32";
  const desired = original.replace(
    /FP_FLASH_PATH=%FP_BROWSER_PLUGINS%\\(?:Flash32|Flash)(?:\r?\n|$)/u,
    `FP_FLASH_PATH=%FP_BROWSER_PLUGINS%\\${desiredPlugin}\r\n`
  );

  const backupPath = path.join(paths.managedWorkspaceDir, "FPNavigator.ini.backup");
  if (!fileExists(backupPath)) {
    writeText(backupPath, original);
  }

  if (desired !== original) {
    writeText(flashpoint.navigatorIni, desired);
    return {
      changed: true,
      reason: sourceGroup === "as2" ? "switched_to_flash9" : "switched_to_flash32",
      flashPlugin: desiredPlugin
    };
  }

  return {
    changed: false,
    reason: sourceGroup === "as2" ? "already_flash9" : "already_flash32",
    flashPlugin: desiredPlugin
  };
}

function cleanupNavigatorSession(config) {
  const flashpoint = getFlashpointPaths(config);
  const profileDir = path.join(
    flashpoint.root,
    "FPSoftware",
    "fpnavigator-portable",
    "User",
    "flashpointnavigator",
    "Profiles",
    "Default"
  );

  const staleTargets = [
    path.join(profileDir, "sessionstore.js"),
    path.join(profileDir, "sessionCheckpoints.json"),
    path.join(profileDir, "sessionstore-backups"),
    path.join(profileDir, "cache2"),
    path.join(profileDir, "OfflineCache"),
    path.join(profileDir, "startupCache"),
    path.join(profileDir, "thumbnails"),
    path.join(profileDir, "pluginreg.dat"),
    path.join(profileDir, "parent.lock"),
    path.join(profileDir, "webappsstore.sqlite"),
    path.join(profileDir, "webappsstore.sqlite-shm"),
    path.join(profileDir, "webappsstore.sqlite-wal")
  ];

  for (const targetPath of staleTargets) {
    if (!fileExists(targetPath)) {
      continue;
    }
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } catch (_error) {
      // parent.lock and a few profile cache files can still be held briefly by a
      // shutting-down browser process. Failing to delete them is less harmful
      // than aborting the whole launch chain.
    }
  }
}

function upsertFirefoxUserPref(content, key, valueLiteral) {
  const line = `user_pref("${key}", ${valueLiteral});`;
  const lines = String(content || "")
    .split(/\r?\n/gu)
    .filter((entry) => entry.length > 0);
  const keyPrefix = `user_pref("${key}",`;
  const filtered = lines.filter((entry) => !entry.trimStart().startsWith(keyPrefix));
  filtered.push(line);
  return `${filtered.join("\r\n")}\r\n`;
}

function sanitizeNavigatorProfile(config) {
  const flashpoint = getFlashpointPaths(config);
  const profileDir = flashpoint.navigatorProfileDir;
  const prefsPath = path.join(profileDir, "prefs.js");
  const userJsPath = path.join(profileDir, "user.js");
  const workArea = readPrimaryScreenWorkArea();
  const overrideBrowserZoom = parsePositiveFloatEnv("POPTROPICA_BROWSER_ZOOM");
  const computedBrowserZoom = overrideBrowserZoom || (() => {
    if (!workArea || workArea.width <= 0 || workArea.height <= 0) {
      return 1;
    }
    const widthScale = (workArea.width * RUNTIME_CONTENT_FILL_RATIO) / RUNTIME_CONTENT_BASE_WIDTH;
    const heightScale = (workArea.height * RUNTIME_CONTENT_FILL_RATIO) / RUNTIME_CONTENT_BASE_HEIGHT;
    return Math.max(RUNTIME_BROWSER_ZOOM_MIN, Math.min(RUNTIME_BROWSER_ZOOM_MAX, Math.min(widthScale, heightScale)));
  })();
  const browserZoomLiteral = JSON.stringify(computedBrowserZoom.toFixed(2));
  const forcedPrefs = [
    ["plugin.disable_full_page_plugin_for_types", "\"\""],
    ["pdfjs.disabled", "true"],
    ["media.gmp-manager.updateEnabled", "false"],
    ["media.gmp-provider.enabled", "false"],
    ["media.gmp-manager.url", "\"http://127.0.0.1/flashpoint-gmp-dummy.xml\""],
    ["media.gmp-manager.url.override", "\"http://127.0.0.1/flashpoint-gmp-dummy.xml\""],
    ["browser.sessionstore.resume_from_crash", "false"],
    ["layers.acceleration.disabled", "true"],
    ["gfx.direct2d.disabled", "true"],
    ["layers.offmainthreadcomposition.enabled", "false"],
    ["layout.css.devPixelsPerPx", browserZoomLiteral]
  ];

  for (const targetPath of [prefsPath, userJsPath]) {
    let content = fileExists(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
    for (const [key, valueLiteral] of forcedPrefs) {
      content = upsertFirefoxUserPref(content, key, valueLiteral);
    }
    writeText(targetPath, content.replace(/\r?\n/gu, "\r\n"));
  }
}

function readPrimaryScreenWorkArea() {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms;",
    "$workArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea;",
    "@{",
    "  left = $workArea.Left;",
    "  top = $workArea.Top;",
    "  width = $workArea.Width;",
    "  height = $workArea.Height",
    "} | ConvertTo-Json -Compress"
  ].join("\n");

  const result = spawnSync("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout: 30000
  });

  if (result.status !== 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(String(result.stdout || "").trim());
    if (
      Number.isFinite(parsed?.left) &&
      Number.isFinite(parsed?.top) &&
      Number.isFinite(parsed?.width) &&
      Number.isFinite(parsed?.height)
    ) {
      return {
        left: Number(parsed.left),
        top: Number(parsed.top),
        width: Number(parsed.width),
        height: Number(parsed.height)
      };
    }
  } catch (_error) {
    return null;
  }

  return null;
}

function prepareNavigatorWindowGeometry(config, command) {
  const playerKey = String(command?.playerKey || "").toLowerCase();
  if (!playerKey.includes("navigator")) {
    return;
  }

  const flashpoint = getFlashpointPaths(config);
  const xulstorePath = path.join(flashpoint.navigatorProfileDir, "xulstore.json");
  const workArea = readPrimaryScreenWorkArea();
  if (!workArea || workArea.width <= 0 || workArea.height <= 0) {
    return;
  }

  const overrideWidth = parsePositiveIntEnv("POPTROPICA_WINDOW_WIDTH");
  const overrideHeight = parsePositiveIntEnv("POPTROPICA_WINDOW_HEIGHT");
  const ratio = parseRatioEnv("POPTROPICA_WINDOW_FILL_RATIO", RUNTIME_WINDOW_FILL_RATIO);
  const maxWidth = Math.min(workArea.width, Math.max(RUNTIME_WINDOW_MIN_WIDTH, Math.round(workArea.width * ratio)));
  const maxHeight = Math.min(workArea.height, Math.max(RUNTIME_WINDOW_MIN_HEIGHT, Math.round(workArea.height * ratio)));
  let width;
  let height;
  if (overrideWidth && overrideHeight) {
    width = Math.min(workArea.width, overrideWidth);
    height = Math.min(workArea.height, overrideHeight);
  } else if (overrideWidth) {
    width = Math.min(workArea.width, overrideWidth);
    height = Math.round(width / RUNTIME_WINDOW_ASPECT_RATIO);
  } else if (overrideHeight) {
    height = Math.min(workArea.height, overrideHeight);
    width = Math.round(height * RUNTIME_WINDOW_ASPECT_RATIO);
  } else {
    const defaultHeight = Math.min(maxHeight, RUNTIME_WINDOW_DEFAULT_HEIGHT);
    const widthFromHeight = Math.round(defaultHeight * RUNTIME_WINDOW_ASPECT_RATIO);
    if (widthFromHeight <= maxWidth) {
      width = widthFromHeight;
      height = defaultHeight;
    } else {
      width = maxWidth;
      height = Math.round(width / RUNTIME_WINDOW_ASPECT_RATIO);
    }
  }
  if (width > maxWidth) {
    width = maxWidth;
    if (!overrideHeight) {
      height = Math.round(width / RUNTIME_WINDOW_ASPECT_RATIO);
    }
  }
  if (height > maxHeight) {
    height = maxHeight;
    if (!overrideWidth) {
      width = Math.round(height * RUNTIME_WINDOW_ASPECT_RATIO);
    }
  }
  if (width > workArea.width) {
    width = workArea.width;
  }
  if (height > workArea.height) {
    height = workArea.height;
  }
  const screenX = workArea.left + Math.round((workArea.width - width) / 2);
  const screenY = workArea.top + Math.round((workArea.height - height) / 2);

  let xulstore = {};
  if (fileExists(xulstorePath)) {
    try {
      xulstore = JSON.parse(fs.readFileSync(xulstorePath, "utf8"));
    } catch (_error) {
      xulstore = {};
    }
  }

  const browserKey = "chrome://browser/content/browser.xul";
  const browserStore = typeof xulstore[browserKey] === "object" && xulstore[browserKey] !== null ? xulstore[browserKey] : {};
  const mainWindow = typeof browserStore["main-window"] === "object" && browserStore["main-window"] !== null ? browserStore["main-window"] : {};

  mainWindow.screenX = String(screenX);
  mainWindow.screenY = String(screenY);
  mainWindow.width = String(width);
  mainWindow.height = String(height);
  mainWindow.sizemode = "normal";
  browserStore["main-window"] = mainWindow;
  xulstore[browserKey] = browserStore;

  writeText(xulstorePath, `${JSON.stringify(xulstore)}\r\n`);
}

function stopNavigatorProcesses() {
  const script = [
    "$names = @('FPNavigator','flashpointnavigator','FlashpointSecurePlayer','BasiliskII','plugin-container')",
    "$deadline = (Get-Date).AddSeconds(8)",
    "do {",
    "  foreach ($name in $names) {",
    "    Get-Process -Name $name -ErrorAction SilentlyContinue |",
    "      ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {} }",
    "  }",
    "  Start-Sleep -Milliseconds 250",
    "  $remaining = @(Get-Process -Name $names -ErrorAction SilentlyContinue)",
    "} while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline)"
  ].join("\n");

  spawnSync("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout: 30000
  });
}

function getPreferredPlayerKey(sourceGroup) {
  const compatibility = loadPlayerCompatibility();
  return compatibility?.players?.[sourceGroup]?.preferredPlayer || null;
}

function buildRuntimeCommand(config, sourceGroup, url, options = {}) {
  const flashpoint = getFlashpointPaths(config);
  const requestedPlayerKey = String(options.playerKey || getPreferredPlayerKey(sourceGroup) || "").toLowerCase();
  const defaultPlayerKey = sourceGroup === "as2" ? "flashpointnavigator-as2" : "flashpointnavigator-as3";
  const playerKey = requestedPlayerKey || defaultPlayerKey;

  if (playerKey === "fpnavigator-as2" || playerKey === "fpnavigator-as3") {
    return {
      playerKey,
      executable: flashpoint.navigatorExe,
      args: [url],
      cwd: path.dirname(flashpoint.navigatorExe),
      useWrapper: false,
      processNames: ["fpnavigator.exe"]
    };
  }

  if (playerKey === "secureplayer-basilisk-as2" || playerKey === "secureplayer-basilisk-as3") {
    return {
      playerKey,
      executable: flashpoint.securePlayerExe,
      args: ["basilisk", url],
      cwd: flashpoint.fpSoftwareDir,
      useWrapper: false,
      processNames: ["flashpointsecureplayer.exe", "fpnavigator.exe", "flashpointnavigator.exe"]
    };
  }

  if (playerKey === "secureplayer-basiliskscaling-as2" || playerKey === "secureplayer-basiliskscaling-as3") {
    return {
      playerKey,
      executable: flashpoint.securePlayerExe,
      args: ["basiliskscaling", url],
      cwd: flashpoint.fpSoftwareDir,
      useWrapper: false,
      processNames: ["flashpointsecureplayer.exe", "fpnavigator.exe", "flashpointnavigator.exe"]
    };
  }

  const executable = getNavigatorExecutable(config);
  return {
    playerKey: defaultPlayerKey,
    executable,
    args: ["-no-remote", "-profile", flashpoint.navigatorProfileDir, url],
    cwd: path.dirname(executable),
    useWrapper: false,
    processNames: ["flashpointnavigator.exe"]
  };
}

function spawnManagedRuntime(config, sourceGroup, url, options = {}) {
  const command = buildRuntimeCommand(config, sourceGroup, url, options);
  const navigatorConfig = ensureNavigatorFlashPlugin(config, sourceGroup);
  stopNavigatorProcesses();
  syncUserAudioOverrides(path.join(paths.managedServiceRootDir, "Legacy"));
  const flashState = sourceGroup === "as2" ? ensurePoptropicaAs2FlashState({
    launchUrl: url,
    xPos: options.as2StartX,
    yPos: options.as2StartY,
    forceDefaultChar: Boolean(options.forceAs2CharState)
  }) : null;
  cleanupNavigatorSession(config);
  sanitizeNavigatorProfile(config);
  prepareNavigatorWindowGeometry(config, command);
  const detached = options.detach !== false;
  const child = spawn(command.executable, command.args, {
    cwd: command.cwd,
    detached,
    windowsHide: false,
    stdio: "ignore",
    env: getRuntimeEnvironment(config, sourceGroup)
  });

  writeRuntimeMarker("active-runtime.json", {
    sourceGroup,
    url,
    playerKey: command.playerKey,
    executable: command.executable,
    args: command.args,
    pid: child.pid,
    startedAt: new Date().toISOString(),
    wrapperLaunch: Boolean(command.useWrapper),
    navigatorConfig,
    ...(flashState ? { flashState } : {})
  });

  if (detached) {
    child.unref();
  }

  return {
    child,
    playerKey: command.playerKey,
    executable: command.executable,
    args: command.args,
    pid: child.pid,
    processNames: command.processNames || []
  };
}

function spawnNavigator(config, url) {
  const runtime = spawnManagedRuntime(config, "as3", url, { detach: true });
  return {
    executable: runtime.executable,
    args: runtime.args,
    playerKey: runtime.playerKey
  };
}

function writeRuntimeMarker(name, payload) {
  const filePath = path.join(paths.managedWorkspaceDir, name);
  writeJson(filePath, payload);
  return filePath;
}

module.exports = {
  PORTS,
  ensureFlashpointServices,
  ensureManagedServiceRoot,
  ensureManagedWorkspace,
  ensureMountableDataPack,
  getFlashpointPaths,
  getPoptropicaRecords,
  mountSourceZip,
  proxyRequest,
  resolveRuntimeLaunchUrl,
  spawnManagedRuntime,
  spawnNavigator,
  stopNavigatorProcesses,
  verifyBasePhp,
  writeRuntimeMarker
};
