const { app, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");

/** @type {import("electron").BrowserWindow | null} */
let mainWindow = null;

function runtimeChannel() {
  if (!app.isPackaged) return "dev";
  if (process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE) return "portable";
  return "installer";
}

let updateStatus = {
  state: app.isPackaged ? "idle" : "dev",
  runtime: runtimeChannel(),
  supportsUpdates: app.isPackaged,
  currentVersion: app.getVersion(),
  message: app.isPackaged
    ? runtimeChannel() === "portable"
      ? "Portable build — check for updates to replace the .exe on restart."
      : "Ready to check for desktop updates."
    : "Auto update is available after installing the packaged app.",
  updateVersion: "",
  releaseName: "",
  releaseDate: "",
  progress: null
};

function updateInfoPayload(info = {}) {
  return {
    updateVersion: typeof info.version === "string" ? info.version : "",
    releaseName: typeof info.releaseName === "string" ? info.releaseName : "",
    releaseDate: typeof info.releaseDate === "string" ? info.releaseDate : ""
  };
}

function setUpdateStatus(next) {
  updateStatus = {
    ...updateStatus,
    ...next,
    runtime: runtimeChannel(),
    supportsUpdates: app.isPackaged,
    currentVersion: app.getVersion()
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("stealth:update-status", updateStatus);
  }
  return updateStatus;
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    setUpdateStatus({
      state: "checking",
      message: "Checking GitHub Releases for a new version...",
      progress: null
    });
  });

  autoUpdater.on("update-available", (info) => {
    setUpdateStatus({
      state: "available",
      message: `Version ${info.version} is ready to download.`,
      ...updateInfoPayload(info),
      progress: null
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    setUpdateStatus({
      state: "latest",
      message: `Stealth Browser Console ${app.getVersion()} is up to date.`,
      ...updateInfoPayload(info),
      progress: null
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    setUpdateStatus({
      state: "downloading",
      message: `Downloading update ${Math.round(progress.percent || 0)}%...`,
      progress: {
        percent: progress.percent || 0,
        transferred: progress.transferred || 0,
        total: progress.total || 0,
        bytesPerSecond: progress.bytesPerSecond || 0
      }
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setUpdateStatus({
      state: "downloaded",
      message: `Version ${info.version} is ready. Restart to update.`,
      ...updateInfoPayload(info),
      progress: null
    });
  });

  autoUpdater.on("error", (error) => {
    setUpdateStatus({
      state: "error",
      message: error instanceof Error ? error.message : String(error),
      progress: null
    });
  });
}

async function checkForDesktopUpdates() {
  if (!app.isPackaged) {
    return setUpdateStatus({
      state: "dev",
      message: "Auto update is available after installing the packaged app.",
      progress: null
    });
  }
  try {
    setUpdateStatus({
      state: "checking",
      message: "Checking GitHub Releases for a new version...",
      progress: null
    });
    await autoUpdater.checkForUpdates();
    return updateStatus;
  } catch (error) {
    return setUpdateStatus({
      state: "error",
      message: error instanceof Error ? error.message : String(error),
      progress: null
    });
  }
}

async function downloadDesktopUpdate() {
  if (!app.isPackaged) return checkForDesktopUpdates();
  try {
    setUpdateStatus({
      state: "downloading",
      message: "Downloading update...",
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 }
    });
    await autoUpdater.downloadUpdate();
    return updateStatus;
  } catch (error) {
    return setUpdateStatus({
      state: "error",
      message: error instanceof Error ? error.message : String(error),
      progress: null
    });
  }
}

function installDesktopUpdate() {
  if (!app.isPackaged) return checkForDesktopUpdates();
  setUpdateStatus({
    state: "installing",
    message: "Restarting Stealth Browser Console to install update...",
    progress: null
  });
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return updateStatus;
}

function bindDesktopUpdaterIpc() {
  ipcMain.handle("stealth:get-update-status", async () => updateStatus);
  ipcMain.handle("stealth:check-for-updates", checkForDesktopUpdates);
  ipcMain.handle("stealth:download-update", downloadDesktopUpdate);
  ipcMain.handle("stealth:install-update", installDesktopUpdate);
}

function attachDesktopUpdaterWindow(win) {
  mainWindow = win;
  setUpdateStatus(updateStatus);
  if (app.isPackaged) {
    setTimeout(() => {
      checkForDesktopUpdates().catch((error) => console.error(error));
    }, 3000);
  }
}

module.exports = {
  configureAutoUpdater,
  bindDesktopUpdaterIpc,
  attachDesktopUpdaterWindow,
  getUpdateStatus: () => updateStatus
};
