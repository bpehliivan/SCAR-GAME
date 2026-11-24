const fs = require("node:fs");
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

const saveKeys = new Set([
  "scar.garage.v2", "scar.garage.bmw7.v1", "scar.driver.v1",
  "rdstr.settings", "rdstr.best", "scar.tutorial.v1",
]);
const indexPath = path.join(__dirname, "..", "dist", "index.html");
const { pathToFileURL } = require("node:url");

function configureSaveStorage() {
  const savePath = path.join(app.getPath("userData"), "scar-progress.json");
  let data = {};
  try {
    const stored = JSON.parse(fs.readFileSync(savePath, "utf8"));
    if (stored && typeof stored === "object" && !Array.isArray(stored)) data = stored;
  } catch {
    // Start with an empty profile when there is no readable save.
  }
  const trusted = (event) => event.senderFrame?.url === pathToFileURL(indexPath).href;
  ipcMain.on("scar-save:read", (event, key) => {
    event.returnValue = trusted(event) && saveKeys.has(key) ? data[key] : undefined;
  });
  ipcMain.on("scar-save:update", (event, values) => {
    if (!trusted(event) || !values || typeof values !== "object") {
      event.returnValue = false;
      return;
    }
    const updates = Object.entries(values);
    if (updates.some(([key, value]) => !saveKeys.has(key) ||
      (value !== null && (typeof value !== "string" || value.length > 16000)))) {
      event.returnValue = false;
      return;
    }
    const next = { ...data, ...values };
    const draft = savePath + ".tmp";
    try {
      fs.mkdirSync(path.dirname(savePath), { recursive: true });
      fs.writeFileSync(draft, JSON.stringify(next));
      fs.renameSync(draft, savePath);
      data = next;
      event.returnValue = true;
    } catch (error) {
      console.error("Could not write SCAR progress", error);
      event.returnValue = false;
    }
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  const [window] = BrowserWindow.getAllWindows();
  if (window?.isMinimized()) window.restore();
  window?.focus();
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    title: "SCAR Stunts",
    icon: path.join(__dirname, "..", "dist", "favicon.ico"),
    autoHideMenuBar: true,
    backgroundColor: "#07080c",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.loadFile(indexPath);
}

app.whenReady().then(() => {
  configureSaveStorage();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
