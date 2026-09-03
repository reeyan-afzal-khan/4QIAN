/* The only bridge between the page and the OS: a save dialog. Nothing else
   is exposed, so the page stays the same sandboxed thing it is in a browser. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cdgDesktop", {
  platform: process.platform,
  saveFile: (name, text) => ipcRenderer.invoke("save-file", name, text),
  onMenu: cb => ipcRenderer.on("menu", (_e, which) => cb(which))
});
