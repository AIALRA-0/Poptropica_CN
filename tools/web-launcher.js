const http = require("node:http");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { parseArgs } = require("./lib/cli");
const { loadConfig, describeConfiguredSources } = require("./lib/config");
const { buildInventory } = require("./lib/inventory");
const { generateLaunchManifest, loadLaunchManifest } = require("./lib/launch-manifest");
const { readJson } = require("./lib/fs-utils");
const { PORTS } = require("./lib/flashpoint-runtime");
const { resolveCliWindowGeometry } = require("./lib/runtime-window-geometry");
const paths = require("./lib/paths");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 22800;
const MAX_BODY_BYTES = 1024 * 1024;

function flagEnabled(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (value === true || value === false) {
    return value;
  }
  return /^(1|true|yes|on)$/iu.test(String(value).trim());
}

function resolveServerOptions(options = {}) {
  const noSpawn = flagEnabled(options.noSpawn ?? process.env.POPTROPICA_WEB_NO_SPAWN);
  return {
    noSpawn,
    launchMode: noSpawn ? "plan-only" : "local",
    spawnEnabled: !noSpawn
  };
}

function splitPathname(requestUrl) {
  return new URL(requestUrl, "http://127.0.0.1").pathname;
}

function sendJson(response, statusCode, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  response.end(body);
}

function sendHtml(response, body) {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(body);
}

function sendNoContent(response) {
  response.writeHead(204, {
    "cache-control": "no-store"
  });
  response.end();
}

function getLaunchManifest(config) {
  return loadLaunchManifest() || generateLaunchManifest(config);
}

function getState(serverOptions = {}) {
  const resolvedOptions = resolveServerOptions(serverOptions);
  const config = loadConfig();
  const launchManifest = getLaunchManifest(config);
  const inventory = buildInventory(config);
  const doctorReport = readJson(paths.doctorReportPath, null);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    app: {
      name: "POPTROPICA_FLASH Web Launcher",
      hostOnly: true,
      defaultTargetMonitor: String(process.env.POPTROPICA_QA_MONITOR || "").trim() || null,
      launchMode: resolvedOptions.launchMode,
      spawnEnabled: resolvedOptions.spawnEnabled
    },
    configuredSources: describeConfiguredSources(config),
    preferences: config.preferences,
    ports: PORTS,
    inventory,
    launchManifest: {
      generatedAt: launchManifest?.generatedAt || null,
      summary: launchManifest?.summary || {
        totalEntries: 0,
        launchableCount: 0,
        unresolvedCount: 0
      }
    },
    runtimeState: readJson(paths.flashpointRuntimeStatePath, {}),
    doctorReport
  };
}

function parseJsonOutput(result) {
  const stdout = String(result.stdout || "").trim();
  if (!stdout) {
    return null;
  }
  try {
    return JSON.parse(stdout);
  } catch (_error) {
    return null;
  }
}

function runNodeJson(scriptName, args = [], timeoutMs = 120000) {
  const result = spawnSync(process.execPath, [path.join(paths.toolsRoot, scriptName), ...args], {
    cwd: paths.projectRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: timeoutMs,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1"
    }
  });
  const payload = parseJsonOutput(result);
  if (result.status !== 0 || !payload) {
    const message = (result.stderr || result.stdout || `${scriptName} failed`).trim();
    const error = new Error(message);
    error.result = {
      exitCode: result.status,
      stdout: String(result.stdout || "").trim(),
      stderr: String(result.stderr || "").trim()
    };
    throw error;
  }
  return {
    ok: true,
    scriptName,
    args,
    output: payload
  };
}

async function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    request.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (_error) {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function resolveGeometryOptions(body = {}) {
  const windowSize = String(body.windowSize || body["window-size"] || "").trim();
  const windowWidth = body.windowWidth || body["window-width"];
  const windowHeight = body.windowHeight || body["window-height"];
  return {
    maximize: flagEnabled(body.maximize, !windowSize && !windowWidth && !windowHeight),
    unsafeMaximize: flagEnabled(body.unsafeMaximize || body["unsafe-maximize"] || body.trueMaximize || body["true-maximize"]),
    windowSize,
    windowWidth,
    windowHeight
  };
}

function buildLaunchArgs({ mode, value, sourceGroup, body = {} }) {
  const targetMonitor = String(body.targetMonitor || body.monitor || process.env.POPTROPICA_QA_MONITOR || "").trim();
  const geometryOptions = resolveGeometryOptions(body);
  const args = [];
  if (mode === "runtime") {
    args.push("--runtime", value);
  } else {
    args.push("--island", value);
  }
  if (targetMonitor) {
    args.push("--targetMonitor", targetMonitor);
  }
  if (geometryOptions.windowSize) {
    args.push("--windowSize", geometryOptions.windowSize);
  } else {
    if (geometryOptions.windowWidth) {
      args.push("--window-width", String(geometryOptions.windowWidth));
    }
    if (geometryOptions.windowHeight) {
      args.push("--window-height", String(geometryOptions.windowHeight));
    }
  }
  if (geometryOptions.maximize) {
    args.push("--maximize");
  }
  if (geometryOptions.unsafeMaximize) {
    args.push("--unsafeMaximize");
  }
  const windowGeometry = resolveCliWindowGeometry({
    maximize: geometryOptions.maximize,
    unsafeMaximize: geometryOptions.unsafeMaximize,
    windowSize: geometryOptions.windowSize,
    windowWidth: geometryOptions.windowWidth,
    windowHeight: geometryOptions.windowHeight
  }, sourceGroup);
  return {
    args,
    targetMonitor,
    windowGeometry
  };
}

function findLaunchEntry(islandId) {
  const config = loadConfig();
  const manifest = getLaunchManifest(config);
  return manifest.entries.find((entry) => entry.canonicalKey === islandId) || null;
}

function runLaunch(launchPlan, dryRun, serverOptions = {}) {
  const resolvedOptions = resolveServerOptions(serverOptions);
  if (dryRun || resolvedOptions.noSpawn) {
    return {
      ok: true,
      dryRun: Boolean(dryRun),
      plannedOnly: Boolean(resolvedOptions.noSpawn && !dryRun),
      spawnEnabled: resolvedOptions.spawnEnabled,
      launchMode: resolvedOptions.launchMode,
      command: process.execPath,
      script: path.join(paths.toolsRoot, "launch.js"),
      args: launchPlan.args,
      targetMonitor: launchPlan.targetMonitor,
      windowGeometry: launchPlan.windowGeometry,
      note: resolvedOptions.noSpawn
        ? "No-spawn mode is active; this API returned the launch plan without starting a local Flashpoint Navigator process."
        : "Dry-run request; this API returned the launch plan without starting a local Flashpoint Navigator process."
    };
  }
  return runNodeJson("launch.js", launchPlan.args, 90000).output;
}

async function handlePrepare(serverOptions = {}) {
  const resolvedOptions = resolveServerOptions(serverOptions);
  if (resolvedOptions.noSpawn) {
    return {
      ok: true,
      plannedOnly: true,
      spawnEnabled: false,
      launchMode: resolvedOptions.launchMode,
      steps: [],
      note: "No-spawn mode is active; prepare did not start local Flashpoint services.",
      state: getState(resolvedOptions)
    };
  }
  const steps = [];
  for (const [label, scriptName, timeoutMs] of [
    ["bootstrap", "bootstrap-flashpoint.js", 180000],
    ["doctor", "doctor-flashpoint.js", 120000]
  ]) {
    const result = runNodeJson(scriptName, [], timeoutMs);
    steps.push({
      label,
      ok: result.ok,
      output: result.output
    });
  }
  return {
    ok: true,
    steps,
    state: getState(resolvedOptions)
  };
}

async function handleLaunchRuntime(body, serverOptions = {}) {
  const sourceGroup = String(body.sourceGroup || body.source || "").trim().toLowerCase();
  if (!["as2", "as3"].includes(sourceGroup)) {
    return {
      statusCode: 400,
      payload: {
        ok: false,
        error: "sourceGroup must be as2 or as3."
      }
    };
  }
  const launchPlan = buildLaunchArgs({
    mode: "runtime",
    value: sourceGroup,
    sourceGroup,
    body
  });
  return {
    statusCode: 200,
    payload: runLaunch(launchPlan, flagEnabled(body.dryRun), serverOptions)
  };
}

async function handleLaunchIsland(body, serverOptions = {}) {
  const islandId = String(body.islandId || body.island || "").trim();
  if (!islandId) {
    return {
      statusCode: 400,
      payload: {
        ok: false,
        error: "islandId is required."
      }
    };
  }
  const launchEntry = findLaunchEntry(islandId);
  if (!launchEntry?.launchable) {
    return {
      statusCode: 404,
      payload: {
        ok: false,
        error: `No launchable island found for ${islandId}.`
      }
    };
  }
  const launchPlan = buildLaunchArgs({
    mode: "island",
    value: islandId,
    sourceGroup: launchEntry.sourceGroup,
    body
  });
  return {
    statusCode: 200,
    payload: {
      ...runLaunch(launchPlan, flagEnabled(body.dryRun), serverOptions),
      launchEntry
    }
  };
}

function renderPage(serverOptions = {}) {
  const resolvedOptions = resolveServerOptions(serverOptions);
  const launchMode = resolvedOptions.launchMode;
  const spawnEnabled = resolvedOptions.spawnEnabled ? "true" : "false";
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>POPTROPICA_FLASH Local</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f6f2;
        --surface: #ffffff;
        --surface-2: #edf2eb;
        --text: #17201b;
        --muted: #5c6d63;
        --line: #cad8ce;
        --accent: #117c69;
        --accent-2: #d99122;
        --bad: #b42318;
        --ok: #16803c;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg);
        color: var(--text);
        font-family: "Microsoft YaHei UI", "Segoe UI", sans-serif;
      }
      .shell {
        width: min(1440px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 18px 0 32px;
        display: grid;
        gap: 14px;
      }
      header, section {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 8px;
      }
      header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 16px;
        align-items: center;
        padding: 18px;
      }
      h1, h2, p { margin: 0; }
      h1 { font-size: 24px; }
      h2 { font-size: 17px; }
      .muted { color: var(--muted); }
      .toolbar, .actions, .stats {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      button, input, select {
        min-height: 38px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: #fff;
        color: var(--text);
        font: inherit;
      }
      button {
        padding: 0 12px;
        font-weight: 700;
        cursor: pointer;
      }
      button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
      button.secondary { background: var(--surface-2); }
      button.warn { background: var(--accent-2); border-color: var(--accent-2); color: #1f1503; }
      button:disabled { opacity: 0.55; cursor: wait; }
      input, select { padding: 0 10px; }
      .panel { padding: 16px; display: grid; gap: 14px; }
      .stats { display: grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); }
      .stat {
        padding: 12px;
        border: 1px solid var(--line);
        background: var(--surface-2);
        border-radius: 6px;
      }
      .stat strong { display: block; margin-top: 5px; font-size: 22px; }
      .status-line { display: flex; gap: 10px; align-items: center; min-width: 220px; }
      .notice {
        padding: 10px 12px;
        border: 1px solid var(--line);
        background: #fff7e6;
        border-radius: 6px;
        color: #5d3b02;
      }
      .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--bad); display: inline-block; }
      .dot.ok { background: var(--ok); }
      .table-wrap { overflow: auto; max-height: calc(100vh - 390px); border: 1px solid var(--line); border-radius: 6px; }
      table { width: 100%; border-collapse: collapse; min-width: 980px; }
      th, td { padding: 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
      th { position: sticky; top: 0; background: #eef4ee; z-index: 1; }
      tr:hover td { background: #fafcf9; }
      .badge { display: inline-flex; padding: 4px 8px; border-radius: 999px; background: var(--surface-2); font-size: 12px; font-weight: 700; }
      .badge.ok { color: var(--ok); }
      .badge.bad { color: var(--bad); }
      .row-actions { display: flex; gap: 8px; justify-content: flex-end; }
      pre {
        margin: 0;
        max-height: 220px;
        overflow: auto;
        background: #17201b;
        color: #d9f3e7;
        border-radius: 6px;
        padding: 12px;
        font-size: 12px;
      }
      @media (max-width: 760px) {
        header { grid-template-columns: 1fr; }
        .stats { grid-template-columns: 1fr 1fr; }
        .toolbar > input { width: 100%; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <div>
          <h1>POPTROPICA_FLASH Local</h1>
          <p class="muted" id="subtitle">localhost</p>
        </div>
        <div class="actions">
          <button class="secondary" id="refreshButton">刷新</button>
          <button class="warn" id="prepareButton">准备环境</button>
          <button class="primary" id="launchAs3Button">进入 AS3</button>
          <button class="secondary" id="launchAs2Button">进入 AS2</button>
        </div>
      </header>

      <section class="panel">
        <div class="stats">
          <div class="stat"><span class="muted">可启动入口</span><strong id="launchableCount">0 / 0</strong></div>
          <div class="stat"><span class="muted">Flash 岛屿</span><strong id="flashIslandCount">0</strong></div>
          <div class="stat"><span class="muted">可玩验收</span><strong id="playableCount">0</strong></div>
          <div class="stat"><span class="muted">中文验收</span><strong id="chineseCount">0</strong></div>
        </div>
        <div class="toolbar">
          <span class="status-line"><span class="dot" id="proxyDot"></span>Proxy</span>
          <span class="status-line"><span class="dot" id="zipDot"></span>ZIP</span>
          <span class="status-line"><span class="dot" id="phpDot"></span>PHP</span>
          <span class="status-line"><span class="dot ok"></span><span id="monitorLabel">系统自动选择</span></span>
          <span class="status-line"><span class="dot ok"></span><span id="launchModeLabel">${launchMode}</span></span>
        </div>
        <div class="notice" id="noSpawnNotice" hidden>部署预览模式已启用：启动按钮只返回命令计划，不会在服务器主机上启动 Flashpoint Navigator。</div>
      </section>

      <section class="panel">
        <div class="toolbar">
          <input id="filterInput" type="search" placeholder="搜索岛屿" />
          <select id="sourceFilter">
            <option value="">全部来源</option>
            <option value="as3">AS3</option>
            <option value="as2">AS2</option>
          </select>
          <select id="sizeSelect">
            <option value="">Safe / 默认最大</option>
            <option value="1450x900">1450x900</option>
            <option value="960x640">960x640</option>
          </select>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>中文名</th>
                <th>英文名</th>
                <th>来源</th>
                <th>可玩</th>
                <th>汉化</th>
                <th>最近验证</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="islandTableBody"></tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>输出</h2>
        <pre id="output">等待操作。</pre>
      </section>
    </div>

    <script>
      const SERVER_LAUNCH_MODE = "${launchMode}";
      const SERVER_SPAWN_ENABLED = ${spawnEnabled};
      const state = { payload: null, filter: "", source: "" };
      const $ = (id) => document.getElementById(id);
      function statusClass(value) {
        return /可玩|已验收|已就绪/u.test(String(value || "")) ? "ok" : /损坏|未导入|未解析/u.test(String(value || "")) ? "bad" : "";
      }
      function setBusy(busy) {
        ["refreshButton", "prepareButton", "launchAs3Button", "launchAs2Button"].forEach((id) => $(id).disabled = busy);
        document.querySelectorAll("button[data-island]").forEach((button) => button.disabled = busy);
      }
      async function api(path, options = {}) {
        const response = await fetch(path, {
          ...options,
          headers: { "content-type": "application/json", ...(options.headers || {}) }
        });
        const payload = await response.json();
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || "请求失败");
        }
        return payload;
      }
      function launchPayload(extra = {}) {
        const size = $("sizeSelect").value;
        return { ...(size ? { windowSize: size, maximize: false } : { maximize: true }), ...extra };
      }
      function renderSummary() {
        const summary = state.payload?.inventory?.summary || {};
        const launch = state.payload?.launchManifest?.summary || {};
        $("subtitle").textContent = "仅限本机访问";
        $("launchableCount").textContent = (launch.launchableCount || 0) + " / " + (launch.totalEntries || 0);
        $("flashIslandCount").textContent = String(summary.flashIslandCount || 0);
        $("playableCount").textContent = String(summary.verifiedPlayableCount || 0);
        $("chineseCount").textContent = String(summary.verifiedChineseCount || 0);
        const healthy = state.payload?.doctorReport?.services?.healthy || {};
        $("proxyDot").classList.toggle("ok", Boolean(healthy.proxy));
        $("zipDot").classList.toggle("ok", Boolean(healthy.zip));
        $("phpDot").classList.toggle("ok", Boolean(healthy.php));
        $("monitorLabel").textContent = state.payload?.app?.defaultTargetMonitor || "系统自动选择";
        $("launchModeLabel").textContent = state.payload?.app?.launchMode || SERVER_LAUNCH_MODE;
        $("noSpawnNotice").hidden = Boolean(state.payload?.app?.spawnEnabled ?? SERVER_SPAWN_ENABLED);
      }
      function visibleIslands() {
        const text = state.filter.trim().toLowerCase();
        return (state.payload?.inventory?.islands || [])
          .filter((island) => ["as2", "as3"].includes(island.preferredSource))
          .filter((island) => !state.source || island.preferredSource === state.source)
          .filter((island) => !text || [island.cnName, island.enName, island.id, island.playabilityStatus, island.translationStatus].join(" ").toLowerCase().includes(text));
      }
      function renderTable() {
        const rows = visibleIslands();
        $("islandTableBody").innerHTML = rows.length ? rows.map((island) => {
          const launchable = Boolean(island.launchTarget?.launchable);
          return \`<tr>
            <td><strong>\${island.cnName || island.id}</strong><div class="muted">\${island.id}</div></td>
            <td>\${island.enName || ""}</td>
            <td><span class="badge">\${String(island.preferredSource || "").toUpperCase()}</span></td>
            <td><span class="badge \${statusClass(island.playabilityStatus)}">\${island.playabilityStatus || "—"}</span></td>
            <td><span class="badge \${statusClass(island.translationStatus)}">\${island.translationStatus || "—"}</span></td>
            <td class="muted">\${island.lastVerifiedAt ? new Date(island.lastVerifiedAt).toLocaleString("zh-CN", { hour12: false }) : "—"}</td>
            <td><div class="row-actions"><button class="secondary" data-island="\${island.id}" \${launchable ? "" : "disabled"}>打开</button></div></td>
          </tr>\`;
        }).join("") : '<tr><td colspan="7" class="muted">没有匹配的岛屿。</td></tr>';
      }
      async function refresh() {
        state.payload = await api("/api/state");
        renderSummary();
        renderTable();
      }
      async function run(label, fn) {
        setBusy(true);
        $("output").textContent = label + "...";
        try {
          const result = await fn();
          $("output").textContent = JSON.stringify(result, null, 2);
          await refresh();
        } catch (error) {
          $("output").textContent = String(error.stack || error.message || error);
        } finally {
          setBusy(false);
        }
      }
      $("refreshButton").addEventListener("click", () => run("refresh", refresh));
      $("prepareButton").addEventListener("click", () => run("prepare", () => api("/api/prepare", { method: "POST", body: "{}" })));
      $("launchAs3Button").addEventListener("click", () => run("launch AS3", () => api("/api/launch-runtime", { method: "POST", body: JSON.stringify(launchPayload({ sourceGroup: "as3" })) })));
      $("launchAs2Button").addEventListener("click", () => run("launch AS2", () => api("/api/launch-runtime", { method: "POST", body: JSON.stringify(launchPayload({ sourceGroup: "as2" })) })));
      $("filterInput").addEventListener("input", (event) => { state.filter = event.target.value; renderTable(); });
      $("sourceFilter").addEventListener("change", (event) => { state.source = event.target.value; renderTable(); });
      $("islandTableBody").addEventListener("click", (event) => {
        const button = event.target.closest("button[data-island]");
        if (!button) return;
        run("launch " + button.dataset.island, () => api("/api/launch-island", {
          method: "POST",
          body: JSON.stringify(launchPayload({ islandId: button.dataset.island }))
        }));
      });
      window.render_launcher_to_text = () => JSON.stringify({
        flashIslandCount: state.payload?.inventory?.summary?.flashIslandCount || 0,
        launchableCount: state.payload?.launchManifest?.summary?.launchableCount || 0,
        visibleRows: visibleIslands().length,
        filter: state.filter,
        source: state.source
      });
      refresh().catch((error) => $("output").textContent = String(error.stack || error));
    </script>
  </body>
</html>`;
}

async function routeRequest(request, response, serverOptions = {}) {
  try {
    if (request.method === "OPTIONS") {
      sendJson(response, 200, { ok: true });
      return;
    }
    const pathname = splitPathname(request.url);
    if (request.method === "GET" && pathname === "/") {
      sendHtml(response, renderPage(serverOptions));
      return;
    }
    if (request.method === "GET" && pathname === "/favicon.ico") {
      sendNoContent(response);
      return;
    }
    if (request.method === "GET" && pathname === "/healthz") {
      sendJson(response, 200, { ok: true, generatedAt: new Date().toISOString() });
      return;
    }
    if (request.method === "GET" && pathname === "/api/state") {
      sendJson(response, 200, getState(serverOptions));
      return;
    }
    if (request.method === "POST" && pathname === "/api/prepare") {
      sendJson(response, 200, await handlePrepare(serverOptions));
      return;
    }
    if (request.method === "POST" && pathname === "/api/launch-runtime") {
      const result = await handleLaunchRuntime(await readRequestBody(request), serverOptions);
      sendJson(response, result.statusCode, result.payload);
      return;
    }
    if (request.method === "POST" && pathname === "/api/launch-island") {
      const result = await handleLaunchIsland(await readRequestBody(request), serverOptions);
      sendJson(response, result.statusCode, result.payload);
      return;
    }
    sendJson(response, 404, { ok: false, error: "Not found." });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: String(error.message || error),
      details: error.result || null
    });
  }
}

function openDefaultBrowser(url) {
  spawn("cmd", ["/c", "start", "", url], {
    cwd: paths.projectRoot,
    detached: true,
    windowsHide: true,
    stdio: "ignore"
  }).unref();
}

function startWebLauncherServer(options = {}) {
  const host = String(options.host || DEFAULT_HOST);
  const port = Number(options.port ?? DEFAULT_PORT);
  const serverOptions = resolveServerOptions(options);
  const server = http.createServer((request, response) => {
    routeRequest(request, response, serverOptions);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        server,
        host,
        port: actualPort,
        url: `http://${host}:${actualPort}/`,
        launchMode: serverOptions.launchMode,
        spawnEnabled: serverOptions.spawnEnabled
      });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const instance = await startWebLauncherServer({
    host: args.host || DEFAULT_HOST,
    port: args.port !== undefined ? Number(args.port) : DEFAULT_PORT,
    noSpawn: flagEnabled(args.noSpawn || args["no-spawn"])
  });
  const payload = {
    ok: true,
    url: instance.url,
    host: instance.host,
    port: instance.port,
    targetMonitor: String(process.env.POPTROPICA_QA_MONITOR || "").trim() || null,
    launchMode: instance.launchMode,
    spawnEnabled: instance.spawnEnabled
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (flagEnabled(args.open)) {
    openDefaultBrowser(instance.url);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  getState,
  renderPage,
  startWebLauncherServer
};
