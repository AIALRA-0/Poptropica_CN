const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("flashLauncher", {
  getState: () => ipcRenderer.invoke("flash:get-state"),
  launchRuntime: (sourceGroup) => ipcRenderer.invoke("flash:launch-runtime", sourceGroup),
  launchIsland: (islandId) => ipcRenderer.invoke("flash:launch-island", islandId),
  prepareRuntime: () => ipcRenderer.invoke("flash:prepare-runtime"),
  setDebugMode: (enabled) => ipcRenderer.invoke("flash:set-debug-mode", enabled),
  openOriginalFlashpoint: () => ipcRenderer.invoke("flash:open-original-flashpoint"),
  openPath: (targetPath) => ipcRenderer.invoke("flash:open-path", targetPath),
  pickPath: (kind) => ipcRenderer.invoke("flash:pick-path", kind),
  refresh: () => ipcRenderer.invoke("flash:refresh"),
  runCommand: (commandName) => ipcRenderer.invoke("flash:run-command", commandName),
  onStatusMessage: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("flash:status", handler);
    return () => ipcRenderer.removeListener("flash:status", handler);
  }
});
