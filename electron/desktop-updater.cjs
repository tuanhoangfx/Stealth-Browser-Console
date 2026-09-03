const { app, ipcMain } = require("electron");

const { resolveUpdaterGhToken } = require("./lib/updater-auth.cjs");
const { setShutdownReason, setShutdownDetails } = require("./lib/shutdown-log.cjs");
const { markAppQuitting } = require("./lib/app-quit-state.cjs");
require("./lib/ensure-packaged-module-paths.cjs");

/** @type {import("electron").BrowserWindow | null} */
let mainWindow = null;

/** @type {import("electron-updater").AppUpdater | null | undefined} */
let autoUpdaterInstance;

function getAutoUpdater() {
  if (autoUpdaterInstance !== undefined) return autoUpdaterInstance;
  try {
    autoUpdaterInstance = require("electron-updater").autoUpdater;
  } catch (error) {
    console.error("[updater] electron-updater unavailable:", error);
    autoUpdaterInstance = null;
  }
  return autoUpdaterInstance;
}

function runtimeChannel() {
  if (!app.isPackaged) return "dev";
  if (process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE) return "portable";
  return "installer";
}

const RECHECK_INTERVAL_MS = 30 * 60 * 1000;
const FOCUS_RECHECK_MS = 15 * 60 * 1000;
let lastCheckAt = 0;
/** @type {ReturnType<typeof setInterval> | null} */
let recheckTimer = null;

let updateStatus = {
  state: app.isPackaged ? "idle" : "dev",
  runtime: runtimeChannel(),
  supportsUpdates: app.isPackaged,
  currentVersion: app.getVersion(),
  message: app.isPackaged
    ? runtimeChannel() === "portable"
      ? "Portable build — download the new portable .exe from GitHub Releases when an update is available."
      : "Ready to check for desktop updates."
    : "Auto update is available after installing the packaged app.",
  updateVersion: "",
  releaseName: "",
  releaseDate: "",
  progress: null,
};

function updateInfoPayload(info = {}) {
  return {
    updateVersion: typeof info.version === "string" ? info.version : "",
    releaseName: typeof info.releaseName === "string" ? info.releaseName : "",
    releaseDate: typeof info.releaseDate === "string" ? info.releaseDate : "",
  };
}

function setUpdateStatus(next) {
  updateStatus = {
    ...updateStatus,
    ...next,
    runtime: runtimeChannel(),
    supportsUpdates: app.isPackaged,
    currentVersion: app.getVersion(),
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("stealth:update-status", updateStatus);
  }
  return updateStatus;
}

function friendlyUpdateError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/cannot find module/i.test(message)) {
    return "Auto-update module missing packaged dependencies — install the latest release from GitHub.";
  }
  if (/404|not found/i.test(message)) {
    const hasAuth = Boolean(resolveUpdaterGhToken(app));
    return hasAuth
      ? "Update feed not reachable — check GitHub Releases or updater token scope."
      : "Update feed not reachable (GitHub Releases must be public, or add updater-gh-token for private repo).";
  }
  return message;
}

function applyUpdaterRequestHeaders(autoUpdater) {
  const token = resolveUpdaterGhToken(app);
  if (!token) return false;
  // Authorization only — do not set Accept: octet-stream on every request
  // (breaks GitHub /releases/latest JSON used to discover latest.yml).
  autoUpdater.requestHeaders = {
    ...(autoUpdater.requestHeaders || {}),
    Authorization: `Bearer ${token}`,
  };
  return true;
}

function configureAutoUpdater() {
  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) {
    setUpdateStatus({
      state: "error",
      message: friendlyUpdateError(new Error("Cannot find module 'electron-updater' or its dependencies")),
      progress: null,
    });
    return;
  }

  const channel = runtimeChannel();
  applyUpdaterRequestHeaders(autoUpdater);

  autoUpdater.autoDownload = channel === "installer";
  autoUpdater.autoInstallOnAppQuit = channel === "installer";

  autoUpdater.on("before-quit-for-update", () => {
    setShutdownReason("update-quit-auto");
    setShutdownDetails({
      updateVersion: updateStatus.updateVersion || "",
      updateState: updateStatus.state,
    });
    markAppQuitting();
  });

  autoUpdater.on("checking-for-update", () => {
    setUpdateStatus({
      state: "checking",
      message: "Checking GitHub Releases for a new version...",
      progress: null,
    });
  });

  autoUpdater.on("update-available", (info) => {
    setUpdateStatus({
      state: "available",
      message:
        channel === "installer"
          ? `Version ${info.version} found — downloading in the background...`
          : `Version ${info.version} is available on GitHub Releases.`,
      ...updateInfoPayload(info),
      progress: null,
    });
    if (channel === "installer" && autoUpdater.autoDownload) {
      downloadDesktopUpdate().catch((error) => console.error("[updater]", error));
    }
  });

  autoUpdater.on("update-not-available", (info) => {
    setUpdateStatus({
      state: "latest",
      message: `Stealth Browser Console ${app.getVersion()} is up to date.`,
      ...updateInfoPayload(info),
      progress: null,
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
        bytesPerSecond: progress.bytesPerSecond || 0,
      },
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setUpdateStatus({
      state: "downloaded",
      message:
        channel === "installer"
          ? `Version ${info.version} is ready. Restart to update (or wait for quit).`
          : `Version ${info.version} downloaded. Replace your portable .exe from GitHub Releases.`,
      ...updateInfoPayload(info),
      progress: null,
    });
  });

  autoUpdater.on("error", (error) => {
    setUpdateStatus({
      state: "error",
      message: friendlyUpdateError(error),
      progress: null,
    });
  });
}

async function checkForDesktopUpdates() {
  if (!app.isPackaged) {
    setUpdateStatus({
      state: "checking",
      message: "Checking GitHub Releases for a new version...",
      progress: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 480));
    return setUpdateStatus({
      state: "dev",
      message: "Auto update is available after installing the packaged app.",
      progress: null,
    });
  }

  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) {
    return setUpdateStatus({
      state: "error",
      message: friendlyUpdateError(new Error("Cannot find module 'electron-updater' or its dependencies")),
      progress: null,
    });
  }

  try {
    lastCheckAt = Date.now();
    setUpdateStatus({
      state: "checking",
      message: "Checking GitHub Releases for a new version...",
      progress: null,
    });
    await autoUpdater.checkForUpdates();
    return updateStatus;
  } catch (error) {
    return setUpdateStatus({
      state: "error",
      message: friendlyUpdateError(error),
      progress: null,
    });
  }
}

async function downloadDesktopUpdate() {
  if (!app.isPackaged) return checkForDesktopUpdates();

  if (runtimeChannel() === "portable") {
    return setUpdateStatus({
      state: "available",
      message: "Portable build — download the latest portable .exe from GitHub Releases.",
      progress: null,
    });
  }

  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) {
    return setUpdateStatus({
      state: "error",
      message: friendlyUpdateError(new Error("Cannot find module 'electron-updater' or its dependencies")),
      progress: null,
    });
  }

  try {
    setUpdateStatus({
      state: "downloading",
      message: "Downloading update...",
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
    });
    await autoUpdater.downloadUpdate();
    return updateStatus;
  } catch (error) {
    return setUpdateStatus({
      state: "error",
      message: friendlyUpdateError(error),
      progress: null,
    });
  }
}

function installDesktopUpdate() {
  if (!app.isPackaged) return checkForDesktopUpdates();

  if (runtimeChannel() === "portable") {
    return setUpdateStatus({
      state: "available",
      message: "Portable build — replace the .exe manually from GitHub Releases.",
      progress: null,
    });
  }

  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) {
    return setUpdateStatus({
      state: "error",
      message: friendlyUpdateError(new Error("Cannot find module 'electron-updater' or its dependencies")),
      progress: null,
    });
  }

  setUpdateStatus({
    state: "installing",
    message: "Restarting Stealth Browser Console to install update...",
    progress: null,
  });
  const { flushCatalogForUpdate } = require("./db/last-opened-durability.cjs");
  flushCatalogForUpdate();
  setShutdownReason("update-install");
  setShutdownDetails({
    updateVersion: updateStatus.updateVersion || "",
    updateState: updateStatus.state,
  });
  markAppQuitting();
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
  if (!app.isPackaged) return;
  setTimeout(() => {
    checkForDesktopUpdates().catch((error) => console.error("[updater]", error));
  }, 3000);
  if (!recheckTimer) {
    recheckTimer = setInterval(() => {
      checkForDesktopUpdates().catch((error) => console.error("[updater]", error));
    }, RECHECK_INTERVAL_MS);
    if (typeof recheckTimer.unref === "function") recheckTimer.unref();
  }
  win.on("focus", () => {
    if (Date.now() - lastCheckAt < FOCUS_RECHECK_MS) return;
    checkForDesktopUpdates().catch((error) => console.error("[updater]", error));
  });
}

module.exports = {
  configureAutoUpdater,
  bindDesktopUpdaterIpc,
  attachDesktopUpdaterWindow,
  getUpdateStatus: () => updateStatus,
};
