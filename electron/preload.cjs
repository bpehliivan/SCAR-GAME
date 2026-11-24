const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scarSave", {
  read: (key) => ipcRenderer.sendSync("scar-save:read", key),
  update: (values) => ipcRenderer.sendSync("scar-save:update", values),
});
