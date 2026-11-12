"use strict";

const { app, ipcMain } = require("electron");
const { resolveUpdaterGhToken } = require("./lib/updater-auth.cjs");
const { setShutdownReason, setShutdownDetails } = require("./lib/shutdown-log.cjs");
const { markAppQuitting } = require("./lib/app-quit-state.cjs");
const { createDesktopUpdaterIpcController } = require("./lib/desktop-host-kit.cjs");
require("./lib/ensure-packaged-module-paths.cjs");

const RECHECK_INTERVAL_MS = 30 * 60 * 1000;
const FOCUS_RECHECK_MS = 15 * 60 * 1000;

let controller = null;
let stopTrayHook = null;

function ensureController() {
  if (controller) return controller;
  controller = createDesktopUpdaterIpcController({
    app,
    ipcMain,
    channelPrefix: "stealth",
    productName: "Stealth Browser Console",
    githubRepo: "tuanhoangfx/Stealth-Browser-Console",
    feedConfig: {
      provider: "github",
      owner: "tuanhoangfx",
      repo: "Stealth-Browser-Console",
      releaseType: "release",
    },
    installerFallbackTemplate: "Stealth-Browser-Console-Setup-{version}.exe",
    electronDir: __dirname,
    autoCheckDelayMs: 3000,
    recheckIntervalMs: RECHECK_INTERVAL_MS,
    focusRecheckMs: FOCUS_RECHECK_MS,
    resolveAuthToken: resolveUpdaterGhToken,
    autoDownload: true,
    // Keep false so closing Stealth to run a manual Setup.exe never spawns a competing 2nd NSIS installer (P0006 parity).
    autoInstallOnAppQuit: false,
    disableDifferentialDownload: true,
    quitAndInstallSilent: true,
    onBeforeQuit: () => {
      const status = controller ? controller.getStatus() : {};
      setShutdownReason("update-install");
      setShutdownDetails({
        updateVersion: status.updateVersion || "",
        updateState: status.state || "installing",
      });
      markAppQuitting();
      try {
        const { flushCatalogForUpdate, flushScheduledLastOpenedCheckpoint } = require("./db/last-opened-durability.cjs");
        flushCatalogForUpdate();
        flushScheduledLastOpenedCheckpoint(require("./db/init.cjs").checkpointDatabase);
      } catch {
        /* ignore */
      }
      try {
        stopTrayHook?.();
      } catch {
        /* ignore */
      }
      try {
        require("./db/init.cjs").closeDatabase?.();
      } catch {
        /* ignore */
      }
      try {
        app.releaseSingleInstanceLock();
      } catch {
        /* ignore */
      }
    },
  });
  return controller;
}

function configureAutoUpdater() {
  ensureController();
}

function bindDesktopUpdaterIpc(opts = {}) {
  if (typeof opts.stopTray === "function") {
    stopTrayHook = opts.stopTray;
  }
  ensureController().registerIpc();
}

function attachDesktopUpdaterWindow(win) {
  ensureController().attachWindow(win);
}

module.exports = {
  configureAutoUpdater,
  bindDesktopUpdaterIpc,
  attachDesktopUpdaterWindow,
  getUpdateStatus: () => ensureController().getStatus(),
};
