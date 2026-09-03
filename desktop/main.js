/* Electron main process.
 *
 * The window is the web app, served from disk. Everything the app needs at
 * runtime it already has — the deck is a local file and the record lives in
 * localStorage — so the window opens with no network and no server. */
const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");

const isDev = !app.isPackaged;
let win = null;

function createWindow(){
  win = new BrowserWindow({
    width: 700, height: 980, minWidth: 380, minHeight: 560,
    backgroundColor: "#08080A",
    title: "4QIAN",
    // No `icon` here on purpose: electron-builder embeds build/icon.png into
    // the .exe, and Windows takes the window and taskbar icon from that. A
    // path here would only point at a file that is not inside the asar.
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "www", "index.html"));

  // External links open in the real browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({url}) => {
    if(/^https?:/.test(url)) shell.openExternal(url);
    return {action: "deny"};
  });
  win.webContents.on("will-navigate", (e, url) => {
    if(!url.startsWith("file://")) { e.preventDefault(); shell.openExternal(url); }
  });
}

/* A minimal menu: the app is a single window, but Windows users still expect
   the accelerators, and a menu bar is the only place to put a reload. */
function buildMenu(){
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "File", submenu: [
        { label: "Export record…", click: () => win && win.webContents.send("menu", "export") },
        { type: "separator" },
        { role: "quit" }
      ]},
    { label: "View", submenu: [
        { role: "reload" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" }, { role: "togglefullscreen" },
        ...(isDev ? [{ role: "toggleDevTools" }] : [])
      ]},
    { label: "Help", submenu: [
        { label: "About", click: () => dialog.showMessageBox(win, {
            type: "info", title: "4QIAN",
            message: "4QIAN",
            detail: `Version ${app.getVersion()}\n4,228 bilingual conversation questions.\n\n`
                  + "Your record is stored on this computer only."
          })}
      ]}
  ]));
}

/* The renderer cannot write files, so saving goes through here. */
ipcMain.handle("save-file", async (_e, name, text) => {
  const {canceled, filePath} = await dialog.showSaveDialog(win, {
    defaultPath: name,
    filters: name.endsWith(".csv")
      ? [{name: "CSV", extensions: ["csv"]}]
      : [{name: "JSON", extensions: ["json"]}]
  });
  if(canceled || !filePath) return null;
  await fs.writeFile(filePath, text, "utf8");
  return filePath;
});

// One window only; a second launch focuses the one already open.
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if(win){ if(win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on("activate", () => { if(BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on("window-all-closed", () => { if(process.platform !== "darwin") app.quit(); });
}
