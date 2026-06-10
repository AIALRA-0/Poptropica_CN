const state = {
  payload: null,
  filterText: "",
  preparing: false,
  runningCommand: false,
  lastStatusPayload: null
};

function byId(id) {
  return document.getElementById(id);
}

function formatJson(payload) {
  return JSON.stringify(payload, null, 2);
}

function formatTime(value) {
  if (!value) {
    return "未验证";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未验证";
  }
  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getReadyState(payload) {
  const doctor = payload?.doctorReport || {};
  const launchSummary = payload?.launchManifest?.summary || {};
  return Boolean(
    doctor.services?.healthy?.proxy &&
    doctor.services?.healthy?.zip &&
    doctor.basePhp?.statusCode === 200 &&
    launchSummary.launchableCount > 0
  );
}

function getVisibleIslands(payload) {
  const islands = (payload?.inventory?.islands || []).filter((island) => ["as2", "as3"].includes(island.preferredSource));
  const filter = state.filterText.trim().toLowerCase();
  if (!filter) {
    return islands;
  }
  return islands.filter((island) => {
    return [
      island.cnName,
      island.enName,
      island.packageName,
      island.runtimeVersion,
      island.playabilityStatus,
      island.translationStatus
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(filter);
  });
}

function getStatusClass(status) {
  if (["可玩", "已验收可见中文", "已就绪"].includes(status)) {
    return "ready";
  }
  if (["待验证", "已提取待翻译", "已打包未验收", "检查中"].includes(status)) {
    return "pending";
  }
  if (["已知损坏", "未导入", "未解析"].includes(status)) {
    return "bad";
  }
  return "neutral";
}

function summarizePrepareResult(result) {
  if (!result?.steps?.length) {
    return "运行环境还没准备。";
  }
  const failed = result.steps.find((step) => !step.result?.ok);
  if (failed) {
    return `${failed.label}失败，请按 Ctrl + Shift + D 打开高级模式查看。`;
  }
  return "运行环境已经准备好，可以直接进入旧版游戏。";
}

function setBusyState(busy) {
  state.runningCommand = busy;
  ["prepareButton", "launchAs3Button", "launchAs2Button", "rebuildPackButton", "refreshButton"].forEach((id) => {
    const element = byId(id);
    if (element) {
      element.disabled = busy;
    }
  });
}

function renderHeader(payload) {
  const ready = getReadyState(payload);
  const launchSummary = payload?.launchManifest?.summary || {};
  const inventorySummary = payload?.inventory?.summary || {};

  byId("headline").textContent = ready ? "可以直接进入旧版游戏了" : "还需要先准备运行环境";
  byId("readyBadge").textContent = ready ? "已就绪" : "准备中";
  byId("readyBadge").className = `pill ${ready ? "ready" : "waiting"}`;
  byId("launchableCount").textContent = `${launchSummary.launchableCount || 0} / ${launchSummary.totalEntries || 0}`;
  byId("verifiedChineseCount").textContent = String(inventorySummary.verifiedChineseCount || 0);
  byId("verifiedPlayableCount").textContent = String(inventorySummary.verifiedPlayableCount || 0);

  if (state.lastStatusPayload?.message) {
    byId("progressMessage").textContent = state.lastStatusPayload.message;
  } else {
    byId("progressMessage").textContent = ready
      ? "默认已经改成进入 AS2 / AS3 核心，后续切岛都在游戏里完成。"
      : "首次打开时会在后台准备，不需要你手动折腾一堆脚本。";
  }
}

function renderStatusMessage(message) {
  byId("statusMessage").textContent = message;
}

function renderAdvanced(payload) {
  const advancedArea = byId("advancedArea");
  advancedArea.classList.toggle("hidden", !payload?.config?.preferences?.debugMode);
  const configuredSources = payload?.inventory?.configuredSources || {};
  const config = payload?.config || {};

  const rows = [
    ["Flashpoint 根目录", config.sources?.flashpointRoot, configuredSources.flashpointRoot],
    ["AS2 数据包", config.sources?.as2Gamezip, configuredSources.as2Gamezip],
    ["AS3 数据包", config.sources?.as3Gamezip, configuredSources.as3Gamezip],
    ["Steam 目录", config.sources?.steamRoot, configuredSources.steamRoot],
    ["FFDec", config.tools?.ffdecCli, Boolean(config.tools?.ffdecCli)]
  ];

  byId("sourceStatus").innerHTML = rows
    .map(([label, value, ok]) => `
      <div class="status-line">
        <strong>${label}</strong>
        <span class="badge ${ok ? "ready" : "bad"}">${ok ? "已配置" : "未配置"}</span>
        <span class="muted-text">${value || "—"}</span>
      </div>
    `)
    .join("");

  const doctor = payload?.doctorReport || {};
  const runtimeState = payload?.runtimeState || {};
  const playerCompatibility = payload?.playerCompatibility?.players || {};
  byId("runtimeStatus").innerHTML = [
    ["Proxy", doctor.services?.healthy?.proxy ? "已就绪" : "未就绪"],
    ["ZIP Server", doctor.services?.healthy?.zip ? "已就绪" : "未就绪"],
    ["PHP Router", doctor.services?.healthy?.php ? "已就绪" : "未就绪"],
    ["最近挂载", runtimeState.lastMountedSource || "—"],
    ["AS3 默认运行器", playerCompatibility.as3?.preferredPlayer || "—"],
    ["AS3 当前结论", playerCompatibility.as3?.summary || "—"],
    ["AS2 默认运行器", playerCompatibility.as2?.preferredPlayer || "—"],
    ["AS2 当前结论", playerCompatibility.as2?.summary || "—"]
  ]
    .map(([label, value]) => `
      <div class="status-line">
        <strong>${label}</strong>
        <span>${value}</span>
      </div>
    `)
    .join("");
}

function renderTable(payload) {
  const tableBody = byId("islandTableBody");
  const islands = getVisibleIslands(payload);

  if (islands.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-state">没有匹配的岛屿。</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = islands
    .map((island) => `
      <tr>
        <td>
          <div class="name-cell">
            <span class="cn">${island.cnName || "—"}</span>
            <span class="muted-text">${island.id}</span>
          </div>
        </td>
        <td class="muted-text">${island.enName || "—"}</td>
        <td><span class="badge source">${island.packageName || "—"}</span></td>
        <td>${island.runtimeVersion || "—"}${island.releaseYear ? ` / ${island.releaseYear}` : ""}</td>
        <td><span class="badge ${getStatusClass(island.playabilityStatus)}">${island.playabilityStatus || "—"}</span></td>
        <td><span class="badge ${getStatusClass(island.translationStatus)}">${island.translationStatus || "—"}</span></td>
        <td class="muted-text">${formatTime(island.lastVerifiedAt)}</td>
      </tr>
    `)
    .join("");
}

async function refreshState() {
  state.payload = await window.flashLauncher.getState();
  renderHeader(state.payload);
  renderAdvanced(state.payload);
  renderTable(state.payload);
}

async function prepareRuntime() {
  if (state.preparing) {
    return;
  }
  state.preparing = true;
  setBusyState(true);
  renderStatusMessage("正在准备运行环境，请稍等…");
  const result = await window.flashLauncher.prepareRuntime();
  byId("commandOutput").textContent = formatJson(result);
  state.preparing = false;
  setBusyState(false);
  state.payload = result.state;
  renderHeader(state.payload);
  renderAdvanced(state.payload);
  renderTable(state.payload);
  renderStatusMessage(summarizePrepareResult(result));
}

async function runCommand(commandName, successMessage = "操作完成。") {
  setBusyState(true);
  byId("commandOutput").textContent = `Running ${commandName}...`;
  const result = await window.flashLauncher.runCommand(commandName);
  byId("commandOutput").textContent = formatJson(result);
  setBusyState(false);
  await refreshState();
  renderStatusMessage(result.ok ? successMessage : (result.error || "操作失败。"));
}

async function launchRuntime(sourceGroup) {
  setBusyState(true);
  renderStatusMessage(`正在进入 ${sourceGroup.toUpperCase()}…`);
  const result = await window.flashLauncher.launchRuntime(sourceGroup);
  byId("commandOutput").textContent = formatJson(result);
  setBusyState(false);
  await refreshState();
  if (result.ok) {
    renderStatusMessage(`${sourceGroup.toUpperCase()} 已启动。后续在游戏里登录、进岛和切岛。`);
  } else {
    renderStatusMessage(result.error || `进入 ${sourceGroup.toUpperCase()} 失败。`);
  }
}

function wireButtons() {
  byId("prepareButton").addEventListener("click", () => prepareRuntime());
  byId("refreshButton").addEventListener("click", () => refreshState());
  byId("launchAs3Button").addEventListener("click", () => launchRuntime("as3"));
  byId("launchAs2Button").addEventListener("click", () => launchRuntime("as2"));
  byId("rebuildPackButton").addEventListener("click", () => runCommand("rebuild:pack", "汉化包已经重建。"));

  document.querySelectorAll("[data-pick]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextState = await window.flashLauncher.pickPath(button.dataset.pick);
      if (!nextState) {
        return;
      }
      state.payload = nextState;
      renderHeader(state.payload);
      renderAdvanced(state.payload);
      renderTable(state.payload);
      renderStatusMessage("路径已经更新。");
    });
  });

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => runCommand(button.dataset.command));
  });

  byId("openOriginalFlashpoint").addEventListener("click", async () => {
    const result = await window.flashLauncher.openOriginalFlashpoint();
    byId("commandOutput").textContent = formatJson(result);
    renderStatusMessage(result.ok ? "原始 Flashpoint 已打开。" : (result.error || "打开失败。"));
  });

  byId("filterInput").addEventListener("input", (event) => {
    state.filterText = event.target.value;
    renderTable(state.payload);
  });

  window.addEventListener("keydown", async (event) => {
    if (event.ctrlKey && event.shiftKey && event.code === "KeyD") {
      event.preventDefault();
      const enabled = !state.payload?.config?.preferences?.debugMode;
      await window.flashLauncher.setDebugMode(enabled);
      await refreshState();
      renderStatusMessage(enabled ? "高级模式已打开。" : "高级模式已关闭。");
    }
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  wireButtons();
  window.flashLauncher.onStatusMessage((payload) => {
    state.lastStatusPayload = payload;
    if (payload?.message) {
      byId("progressMessage").textContent = payload.message;
    }
  });

  await refreshState();
  if (state.payload?.appMode?.smoke) {
    return;
  }

  const configured = state.payload?.inventory?.configuredSources || {};
  if (configured.flashpointRoot && configured.as2Gamezip && configured.as3Gamezip) {
    void prepareRuntime();
  }
});
