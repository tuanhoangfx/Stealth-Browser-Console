"use strict";
/**
 * System hot-reload, runtime display/headless settings, worker memory guard,
 * and SQLite catalog checkpoint routes (`/api/system/*`, `/api/settings/*`, `/api/catalog/checkpoint`).
 */
const fs = require("node:fs");
const path = require("node:path");

const { normalizeAgentCallerId } = require("../lib/agent-smoke-context.cjs");

function buildSystemAndRuntimeRoutes(deps) {
  const {
    sessionManager,
    profileService,
    userDataRoot,
    send,
    electronDir,
    productRoot,
    lockGuards,
    runtimeHelpers,
  } = deps;
  const { screenshotsRoot } = runtimeHelpers;
  const { readPriorityLocks, writePriorityLocks } = lockGuards;

  return [
    {
      id: "system.hotReload",
      method: "POST",
      pattern: /^\/api\/system\/hot-reload$/,
      async handler(ctx) {
        try {
          const { app } = require("electron");
          const isPackagedProd = Boolean(app?.isPackaged && process.env.STEALTH_DEV_ISOLATED !== "1");
          const explicitRelease = Boolean(ctx.body?.releaseProd === true);
          const showOnly = Boolean(ctx.body?.showWindow === true && !ctx.body?.force && !ctx.body?.reloadUi);
          if (isPackagedProd && !explicitRelease && !showOnly) {
            return send.json(ctx.res, 200, {
              ok: true,
              skippedProd: true,
              reason: "prod_isolated_until_explicit_release",
              hint: "Pass releaseProd: true (--release-prod) only when user explicitly requests a Prod Release.",
            });
          }
        } catch {
          /* standalone node worker has no electron app */
        }
        const {
          reloadHotPatchedModules,
          resolveHotPatchedDistIndexHtml,
          resolveHotPatchedPreloadPath,
          resolveHotPatchRoot,
          pruneOrphanResourcesAppDir,
          lockLiveAppAsarAgainstOverwrite,
          unlockLiveAppAsarForQuit,
        } = require("../lib/hot-patch-loader.cjs");
        if (typeof pruneOrphanResourcesAppDir === "function") {
          pruneOrphanResourcesAppDir();
        }
        if (typeof lockLiveAppAsarAgainstOverwrite === "function") {
          lockLiveAppAsarAgainstOverwrite();
        }
        const res = reloadHotPatchedModules({ force: Boolean(ctx.body?.force) });
        res.asarWriteLocked = true;
        if (typeof ctx.services?.rebuildRoutes === "function") {
          res.routesCount = ctx.services.rebuildRoutes();
        }
        try {
          // Sync updated stateless methods onto live profileService singleton without dropping DB connection
          for (const key of Object.keys(require.cache || {})) {
            if (path.basename(key) === "profile-service.cjs") {
              delete require.cache[key];
            }
          }
          const freshProfileService = require("../db/profile-service.cjs");
          for (const [k, fn] of Object.entries(freshProfileService)) {
            if (typeof fn === "function") {
              profileService[k] = fn;
            }
          }
          res.profileServiceMethodsSynced = true;
        } catch {
          /* ignore */
        }
        try {
          const { startAgentWorkerMemoryGuard } = require("../lib/agent-worker-memory-guard.cjs");
          if (typeof startAgentWorkerMemoryGuard === "function" && sessionManager) {
            startAgentWorkerMemoryGuard({ sessionManager });
            res.workerGuardRestarted = true;
          }
          const { findLiveHeadedBrowserPidNative } = require("../lib/profile-browser-orphan.cjs");
          if (typeof findLiveHeadedBrowserPidNative === "function" && sessionManager) {
            const origIsUserInteractive =
              sessionManager._origIsUserInteractiveSession ||
              sessionManager.isUserInteractiveSession.bind(sessionManager);
            sessionManager._origIsUserInteractiveSession = origIsUserInteractive;
            sessionManager.isUserInteractiveSession = (profileId) => {
              if (origIsUserInteractive(profileId)) return true;
              try {
                const profile = profileService.getProfile(String(profileId || ""));
                const code = String(profile?.name || "").trim().slice(0, 4);
                const dir =
                  profile?.user_data_dir ||
                  path.join("D:\\StealthBrowser\\profiles", String(profileId || ""));
                if (findLiveHeadedBrowserPidNative(dir) > 0) {
                  if (["0001", "0021", "0059", "0069", "4220", "8000", "8001", "8002", "8003", "8999"].includes(code)) {
                    return true;
                  }
                  return true;
                }
              } catch {
                /* ignore */
              }
              return false;
            };
            res.sessionManagerHeadedCheckPatched = true;
          }
        } catch {
          /* ignore */
        }
        try {
          const { ipcMain } = require("electron");
          if (ipcMain && typeof ipcMain.removeHandler === "function") {
            for (const ck of Object.keys(require.cache || {})) {
              if (
                ck.endsWith("profile-ops.cjs") ||
                ck.endsWith("taskbar-apply-worker.cjs") ||
                ck.endsWith("profile-storage.cjs") ||
                ck.endsWith("profile-backup.cjs") ||
                ck.endsWith("profile-backup-meta.cjs") ||
                ck.endsWith("webstore-extension.cjs") ||
                ck.endsWith("native-session-backup.cjs") ||
                ck.endsWith("profile-cookie-guard.cjs") ||
                ck.endsWith("profile-chrome-preferences.cjs") ||
                ck.endsWith("native-extension-load.cjs") ||
                ck.endsWith("operator-extension-stage.cjs") ||
                ck.endsWith("cloakbrowser-extension-stage.cjs") ||
                ck.endsWith("profile-extension-pins.cjs") ||
                ck.endsWith("cookie-bridge-store.cjs") ||
                ck.endsWith("cookie-bridge-status.cjs") ||
                ck.endsWith("extensions-status.cjs") ||
                ck.endsWith("extension-sw-health.cjs")
              ) {
                delete require.cache[ck];
              }
            }
            ipcMain.removeHandler("profile:launch");
            ipcMain.handle("profile:launch", async (_event, payload = {}) => {
              const { launchProfile: freshLaunchProfileOp } = require("../services/profile-ops.cjs");
              const id = payload.id ? String(payload.id) : "";
              const name = payload.name ? String(payload.name) : "";
              const skipStartupUrl = Boolean(payload.skipStartupUrl);
              const country = payload.country ? String(payload.country).trim() : "";
              const headless = typeof payload.headless === "boolean" ? payload.headless : undefined;
              const shadowLane = typeof payload.shadowLane === "boolean" ? payload.shadowLane : undefined;
              return freshLaunchProfileOp(
                { sessionManager, profileService, userDataRoot },
                { id, name, skipStartupUrl, country, headless, shadowLane },
              );
            });
            ipcMain.removeHandler("profiles:storageStats");
            ipcMain.handle("profiles:storageStats", async (_event, payload = {}) => {
              const { listProfileStorageStats, listProfileStorageStatsAsync } = require("../lib/profile-storage.cjs");
              const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
              const profileIds = Array.isArray(payload.profileIds) ? payload.profileIds.map(String) : [];
              const includeBytes = payload.includeBytes !== false;
              const stats = includeBytes
                ? await listProfileStorageStatsAsync(root, profileIds, { includeBytes: true })
                : listProfileStorageStats(root, profileIds, { includeBytes: false });
              return { ok: true, stats };
            });
            ipcMain.removeHandler("profiles:backupMeta");
            ipcMain.handle("profiles:backupMeta", (_event, payload = {}) => {
              const { listBackupMeta } = require("../lib/profile-backup-meta.cjs");
              const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
              const profileIds = Array.isArray(payload.profileIds) ? payload.profileIds.map(String) : [];
              return { ok: true, meta: listBackupMeta(root, profileIds) };
            });
            ipcMain.removeHandler("profiles:backupState");
            ipcMain.handle("profiles:backupState", async (_event, payload = {}) => {
              const { BrowserWindow, dialog } = require("electron");
              const { backupProfilesStateAsync, buildProfileExportFilename } = require("../lib/profile-backup.cjs");
              const { updateBackupMeta } = require("../lib/profile-backup-meta.cjs");
              const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
              const sendProgress = (progress) => {
                for (const win of BrowserWindow.getAllWindows()) {
                  if (!win.isDestroyed()) win.webContents.send("profiles:backupProgress", progress);
                }
              };
              const profileIds = Array.isArray(payload.profileIds) ? payload.profileIds.map(String) : undefined;
              const allProfiles = profileService.listProfiles();
              const selected = profileIds?.length
                ? allProfiles.filter((row) => profileIds.includes(String(row.id)))
                : allProfiles;
              const suggested = buildProfileExportFilename(
                selected.map((row) => row.name),
                "zip",
              );
              const pick = await dialog.showSaveDialog({
                title: "Backup profile state",
                defaultPath: suggested,
                filters: [{ name: "Stealth backup", extensions: ["zip"] }],
              });
              if (pick.canceled || !pick.filePath) return { ok: false, canceled: true };
              try {
                const result = await backupProfilesStateAsync(root, {
                  exportBundle: () => profileService.exportProfilesBundle(),
                  listProfiles: () => profileService.listProfiles(),
                  profileIds,
                  onProgress: (progress) => sendProgress(progress),
                });
                await fs.promises.copyFile(result.zipPath, pick.filePath);
                await fs.promises.unlink(result.zipPath).catch(() => undefined);
                try {
                  updateBackupMeta(
                    root,
                    (result.profileIds || []).map((id) => ({
                      id,
                      lastBackupAt: result.exportedAt,
                      lastBackupBytes: result.bytes,
                      lastBackupPath: pick.filePath,
                    })),
                  );
                } catch {
                  /* ignore */
                }
                return { ok: true, path: pick.filePath, profiles: result.profiles, bytes: result.bytes };
              } catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : String(error) };
              }
            });
            ipcMain.removeHandler("profiles:restoreState");
            ipcMain.handle("profiles:restoreState", async (_event, payload = {}) => {
              const { BrowserWindow, dialog } = require("electron");
              const { restoreProfilesStateAsync } = require("../lib/profile-backup.cjs");
              const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
              const sendProgress = (progress) => {
                for (const win of BrowserWindow.getAllWindows()) {
                  if (!win.isDestroyed()) win.webContents.send("profiles:backupProgress", progress);
                }
              };
              const restoreIntoProfileId =
                typeof payload.restoreIntoProfileId === "string" ? payload.restoreIntoProfileId.trim() : "";
              const pick = await dialog.showOpenDialog({
                title: restoreIntoProfileId ? "Restore profile state into selected profile" : "Restore profile state",
                properties: ["openFile"],
                filters: [{ name: "Stealth backup", extensions: ["zip"] }],
              });
              if (pick.canceled || !pick.filePaths?.[0]) return { ok: false, canceled: true };
              try {
                await sessionManager.closeAll();
                const result = await restoreProfilesStateAsync(root, pick.filePaths[0], {
                  importBundle: (bundle, opts) => profileService.importProfilesBundle(bundle, opts),
                  findProfilesByName: (name) => profileService.findProfilesByName(name),
                  getProfileById: (id) => profileService.getProfile(id),
                  restoreIntoProfileId: restoreIntoProfileId || undefined,
                  onProgress: (progress) => sendProgress(progress),
                });
                return { ok: true, ...result };
              } catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : String(error) };
              }
            });
            ipcMain.removeHandler("extension:reloadOpenProfiles");
            ipcMain.handle("extension:reloadOpenProfiles", async () => {
              const { triggerOpenProfilesExtensionReload } = require("../lib/extensions-status.cjs");
              const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
              return triggerOpenProfilesExtensionReload(root);
            });
            ipcMain.removeHandler("extension:status");
            ipcMain.handle("extension:status", () => {
              const { getExtensionsStatus } = require("../lib/extensions-status.cjs");
              const root = typeof userDataRoot === "function" ? userDataRoot() : userDataRoot || screenshotsRoot();
              return { ok: true, status: getExtensionsStatus(root) };
            });
            res.ipcLaunchHandlerRebound = true;
            res.ipcBackupHandlersRebound = true;
            res.ipcExtensionHandlersRebound = true;
          }
        } catch {
          /* ignore */
        }
        try {
          const { app } = require("electron");
          if (app && !app._stagedAsarSwapBound) {
            app._stagedAsarSwapBound = true;
            app.on("will-quit", () => {
              try {
                if (typeof unlockLiveAppAsarForQuit === "function") {
                  unlockLiveAppAsarForQuit();
                }
                const { scheduleStagedAsarSwapOnQuit } = require("../lib/agent-worker-memory-guard.cjs");
                scheduleStagedAsarSwapOnQuit();
              } catch {
                /* ignore */
              }
            });
          }
        } catch {
          /* ignore */
        }

        const resolveConsoleIconPath = () => {
          try {
            const { resolveAppIconPathIfExists } = require("../lib/desktop-app-icon.cjs");
            for (const rootCandidate of [resolveHotPatchRoot(), productRoot]) {
              if (!rootCandidate) continue;
              const p = resolveAppIconPathIfExists(rootCandidate);
              if (p && fs.existsSync(p)) return p;
            }
          } catch {
            /* ignore */
          }
          return null;
        };

        const bringWindowToForegroundWin32 = (win, hpVer) => {
          if (!win || win.isDestroyed()) return;
          try {
            const { screen } = require("electron");
            const { resolveTargetDisplayWorkArea, getTargetMonitor } = require("../lib/app-settings.cjs");
            const cursorPt = screen?.getCursorScreenPoint ? screen.getCursorScreenPoint() : { x: 200, y: 200 };
            const primaryDisp = screen?.getPrimaryDisplay ? screen.getPrimaryDisplay() : null;
            const requestedMode = ctx.body?.display || getTargetMonitor();
            const resolvedDisp = resolveTargetDisplayWorkArea(requestedMode);
            const wa = resolvedDisp.workArea || primaryDisp?.workArea || { x: 0, y: 0, width: 1920, height: 1040 };
            res.displayDiagnostics = {
              cursorPt,
              requestedMode,
              targetDisplayIndex: resolvedDisp.displayIndex,
              totalMonitors: resolvedDisp.totalMonitors,
              targetWorkArea: wa,
              primaryWorkArea: primaryDisp?.workArea,
              allDisplays: screen?.getAllDisplays
                ? screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea }))
                : [],
            };
            const iconPath = resolveConsoleIconPath();
            if (iconPath && typeof win.setIcon === "function") {
              win.setIcon(iconPath);
            }
            if (hpVer && typeof win.setTitle === "function") {
              win.setTitle(`Stealth Browser Console — v${hpVer}`);
            }
            if (typeof win.setSkipTaskbar === "function") {
              win.setSkipTaskbar(false);
            }
            if (win.isMinimized()) win.restore();
            if (win.isMaximized()) win.unmaximize();
            win.setBounds({
              x: wa.x + Math.max(20, Math.round((wa.width - Math.min(1440, wa.width - 80)) / 2)),
              y: wa.y + Math.max(20, Math.round((wa.height - Math.min(900, wa.height - 80)) / 2)),
              width: Math.min(1440, wa.width - 80),
              height: Math.min(900, wa.height - 80),
            });
            win.setAlwaysOnTop(true);
            win.show();
            win.maximize();
            win.focus();
            if (typeof win.moveTop === "function") win.moveTop();
            setTimeout(() => {
              try {
                if (!win.isDestroyed()) win.setAlwaysOnTop(false);
              } catch {
                /* ignore */
              }
            }, 600);
          } catch {
            /* ignore */
          }
        };

        const healWindowPreloadIfBroken = async (win, targetIndex, hpVer, { forceShow = false } = {}) => {
          if (!win || win.isDestroyed()) return win;
          const hasPreload = await win.webContents
            .executeJavaScript("Boolean(window.routerApi && window.stealthApi)", true)
            .catch(() => false);
          if (hasPreload) return win;

          const { BrowserWindow } = require("electron");
          const wasVisible = forceShow || win.isVisible();
          const defaultPreload = path.join(electronDir, "preload.cjs");
          const unpackedPreload =
            typeof resolveHotPatchedPreloadPath === "function"
              ? resolveHotPatchedPreloadPath(defaultPreload)
              : defaultPreload;
          const iconPath = resolveConsoleIconPath();
          const newWin = new BrowserWindow({
            width: 1380,
            height: 880,
            minWidth: 1100,
            minHeight: 720,
            backgroundColor: "#0b1020",
            title: hpVer ? `Stealth Browser Console — v${hpVer}` : "Stealth Browser Console",
            show: false,
            ...(iconPath ? { icon: iconPath } : {}),
            webPreferences: {
              preload: unpackedPreload,
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
            },
          });
          newWin.on("close", (event) => {
            const { isAppQuitting } = require("../lib/app-quit-state.cjs");
            if (isAppQuitting()) return;
            event.preventDefault();
            newWin.hide();
          });
          if (fs.existsSync(targetIndex)) {
            await newWin.loadFile(targetIndex);
          }
          if (hpVer) {
            newWin.webContents
              .executeJavaScript(
                `window.__HUB_ELECTRON_VERSION__ = ${JSON.stringify(hpVer)}; window.dispatchEvent(new Event("hub:electron-dev-ready"));`,
                true,
              )
              .catch(() => {});
          }
          if (wasVisible) {
            bringWindowToForegroundWin32(newWin, hpVer);
          }
          for (const fn of ["isDestroyed", "isMinimized", "restore", "isVisible", "show", "focus", "hide"]) {
            try {
              win[fn] = (...args) => newWin[fn](...args);
            } catch {
              /* ignore */
            }
          }
          try {
            Object.getPrototypeOf(win).destroy.call(win);
          } catch {
            /* ignore */
          }
          res.healedPreloadWindow = true;
          return newWin;
        };

        const defaultDistIndex = path.join(productRoot, "dist", "index.html");
        const targetIndex = fs.existsSync(defaultDistIndex)
          ? defaultDistIndex
          : resolveHotPatchedDistIndexHtml(defaultDistIndex);
        let hpVer = null;
        try {
          for (const pkgCandidate of [
            path.join(productRoot, "package.json"),
            path.join(resolveHotPatchRoot(), "package.json"),
          ]) {
            if (!fs.existsSync(pkgCandidate)) continue;
            const v = String(JSON.parse(fs.readFileSync(pkgCandidate, "utf8"))?.version || "").trim();
            if (v && (!hpVer || v.localeCompare(hpVer, undefined, { numeric: true, sensitivity: "base" }) >= 0)) {
              hpVer = v;
            }
          }
        } catch {
          /* ignore */
        }

        if (ctx.body?.showWindow) {
          try {
            const { app, BrowserWindow } = require("electron");
            let wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
            if (wins.length === 0 && app && typeof app.emit === "function") {
              app.emit("second-instance", {}, []);
              wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
            }
            for (const win of wins) {
              const activeWin = await healWindowPreloadIfBroken(win, targetIndex, hpVer, { forceShow: true });
              bringWindowToForegroundWin32(activeWin, hpVer);
            }
            const finalWins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
            res.windowsCount = finalWins.length;
            res.visibleCount = finalWins.filter((w) => !w.isDestroyed() && w.isVisible()).length;
          } catch (err) {
            res.showWindowError = err instanceof Error ? err.message : String(err);
          }
        }
        if (ctx.body?.reloadUi) {
          try {
            const { app, BrowserWindow } = require("electron");
            const isPackagedProd = Boolean(app?.isPackaged && process.env.STEALTH_DEV_ISOLATED !== "1");
            const allowProdDomReload = Boolean(ctx.body?.allowProdUiReload === true);
            for (const win of BrowserWindow.getAllWindows()) {
              if (win.isDestroyed()) continue;
              const activeWin = await healWindowPreloadIfBroken(win, targetIndex, hpVer, { forceShow: false });
              if (!isPackagedProd || allowProdDomReload) {
                if (fs.existsSync(targetIndex)) {
                  await activeWin.loadFile(targetIndex);
                } else {
                  activeWin.webContents.reloadIgnoringCache();
                }
                res.uiReloadedFrom = targetIndex;
              } else {
                res.prodUiReloadProtected = true;
              }
              if (hpVer) {
                activeWin.webContents
                  .executeJavaScript(
                    `window.__HUB_ELECTRON_VERSION__ = ${JSON.stringify(hpVer)}; window.dispatchEvent(new Event("hub:electron-dev-ready"));`,
                    true,
                  )
                  .catch(() => {});
              }
            }
            res.hotPatchVersion = hpVer;
          } catch {
            /* standalone node worker has no BrowserWindow */
          }
        }
        return send.json(ctx.res, 200, res);
      },
    },
    {
      id: "settings.runtimeGet",
      method: "GET",
      pattern: /^\/api\/settings\/runtime$/,
      handler(ctx) {
        const {
          getTargetMonitor,
          getMaxHeadlessSessions,
          resolveTargetDisplayWorkArea,
        } = require("../lib/app-settings.cjs");
        const now = Date.now();
        const running = sessionManager.listRunning() || [];
        const headlessRows = running.filter((r) => r.headless === true || r.shadowLane === true);
        const activeHeadlessCount = headlessRows.length;
        const activeHeadedCount = running.filter((r) => r.headless !== true && r.shadowLane !== true).length;
        const headlessSessions = headlessRows.map((r) => {
          const launchedAt = Number(r.launchedAt || 0);
          const lastActivityAt = Number(r.lastActivityAt || launchedAt || now);
          return {
            id: String(r.id || r.profileId || ""),
            code: String(r.name || r.id || "").slice(0, 8),
            callerId: normalizeAgentCallerId(r.callerId || "agent:inline"),
            supportChatProtected: Boolean(r.supportChatProtected),
            uptimeMs: launchedAt > 0 ? Math.max(0, now - launchedAt) : 0,
            idleMs: lastActivityAt > 0 ? Math.max(0, now - lastActivityAt) : 0,
            shadowLane: Boolean(r.shadowLane),
          };
        });
        const resolved = resolveTargetDisplayWorkArea();
        let openBrowserWindows = [];
        try {
          const { listProfileChromeWindowsNative } = require("../lib/taskbar-apply-worker.cjs");
          openBrowserWindows = listProfileChromeWindowsNative();
        } catch {
          /* ignore */
        }
        return send.json(ctx.res, 200, {
          ok: true,
          targetMonitor: getTargetMonitor(),
          maxHeadlessSessions: getMaxHeadlessSessions(),
          activeHeadlessCount,
          activeHeadedCount,
          headlessSessions,
          openBrowserWindows,
          totalMonitors: resolved.totalMonitors,
          resolvedDisplayIndex: resolved.displayIndex,
          resolvedWorkArea: resolved.workArea,
        });
      },
    },
    {
      id: "settings.runtimePost",
      method: "POST",
      pattern: /^\/api\/settings\/runtime$/,
      async handler(ctx) {
        const {
          getTargetMonitor,
          setTargetMonitor,
          getMaxHeadlessSessions,
          setMaxHeadlessSessions,
          resolveTargetDisplayWorkArea,
        } = require("../lib/app-settings.cjs");
        const body = ctx.body || {};
        if (body.targetMonitor !== undefined) {
          setTargetMonitor(body.targetMonitor);
        }
        if (body.maxHeadlessSessions !== undefined) {
          setMaxHeadlessSessions(body.maxHeadlessSessions);
        }
        let drainedCount = 0;
        if (typeof body.stopCallerId === "string" && body.stopCallerId.trim()) {
          const targetCaller = normalizeAgentCallerId(body.stopCallerId.trim());
          const matching = (sessionManager.listRunning() || []).filter(
            (r) =>
              (r.headless === true || r.shadowLane === true) &&
              normalizeAgentCallerId(r.callerId || "agent:inline") === targetCaller,
          );
          try {
            const locks = readPriorityLocks();
            let lockChanged = false;
            const matchingIds = new Set(matching.map((m) => String(m.id || m.profileId || "")));
            for (const [k, v] of Object.entries(locks)) {
              if (
                normalizeAgentCallerId(v?.owner || "") === targetCaller ||
                (v?.stealthId && matchingIds.has(String(v.stealthId)))
              ) {
                delete locks[k];
                lockChanged = true;
              }
            }
            if (lockChanged) writePriorityLocks(locks);
          } catch {
            /* ignore */
          }
          for (const row of matching) {
            try {
              await sessionManager.close(row.id, {
                force: true,
                forcePriority: true,
                ignoreIfUserInteractive: true,
              });
              drainedCount += 1;
            } catch {
              /* ignore */
            }
          }
          // Also terminate any matching daemon / inline PID so the stopped caller does not immediately respawn
          try {
            const inlineMatch = targetCaller.match(/^agent:inline-(\d+)$/);
            if (inlineMatch) {
              try {
                process.kill(Number(inlineMatch[1]));
              } catch {
                /* ignore */
              }
            } else {
              const slug = targetCaller.replace(/^agent:/, "");
              const lockFile = path.join("E:\\Dev\\.system_generated\\worker-singleton-locks", `${slug}.json`);
              if (fs.existsSync(lockFile)) {
                const lData = JSON.parse(fs.readFileSync(lockFile, "utf8")) || {};
                if (Number(lData.pid) > 0) {
                  try {
                    process.kill(Number(lData.pid));
                  } catch {
                    /* ignore */
                  }
                }
                fs.unlinkSync(lockFile);
              }
            }
          } catch {
            /* ignore */
          }
        }
        if (body.drainIdleHeadless === true) {
          try {
            const { runWorkerGuardSweep } = require("../lib/agent-worker-memory-guard.cjs");
            const maxIdleMs = Number.isFinite(Number(body.maxIdleMs)) ? Math.max(0, Number(body.maxIdleMs)) : 5000;
            const sweepRes = await runWorkerGuardSweep({ sessionManager, maxIdleMs });
            drainedCount = Array.isArray(sweepRes?.evictedNow) ? sweepRes.evictedNow.length : 0;
            if (drainedCount === 0 && body.forceDrainAllHeadless === true) {
              const before = (sessionManager.listRunning() || []).filter(
                (r) => (r.headless === true || r.shadowLane === true) && !r.supportChatProtected,
              );
              for (const row of before) {
                await sessionManager
                  .close(row.id, { force: true, forcePriority: true, ignoreIfUserInteractive: true })
                  .catch(() => undefined);
              }
              drainedCount = before.length;
            }
          } catch {
            /* ignore */
          }
        }
        const resolved = resolveTargetDisplayWorkArea();
        let movedBrowsersCount = 0;
        if (body.moveConsoleNow === true) {
          try {
            const { BrowserWindow } = require("electron");
            const wa = resolved.workArea;
            for (const win of BrowserWindow.getAllWindows()) {
              if (win.isDestroyed()) continue;
              if (win.isMaximized()) win.unmaximize();
              win.setBounds({
                x: wa.x + Math.max(20, Math.round((wa.width - Math.min(1440, wa.width - 80)) / 2)),
                y: wa.y + Math.max(20, Math.round((wa.height - Math.min(900, wa.height - 80)) / 2)),
                width: Math.min(1440, wa.width - 80),
                height: Math.min(900, wa.height - 80),
              });
              win.maximize();
            }
          } catch {
            /* ignore if headless worker */
          }
        }
        if (body.moveConsoleNow === true || body.moveBrowsersNow === true) {
          try {
            const { moveChromeWindowsToTargetWorkAreaNative } = require("../lib/taskbar-apply-worker.cjs");
            const mv = moveChromeWindowsToTargetWorkAreaNative(resolved.workArea, {
              allHeaded: true,
              maximize: true,
            });
            movedBrowsersCount = Number(mv?.moved) || 0;
          } catch {
            /* ignore */
          }
          try {
            const headedRunning = (sessionManager.listRunning() || []).filter(
              (r) => r.headless !== true && r.shadowLane !== true,
            );
            for (const row of headedRunning) {
              await sessionManager.focusProfile(row.id).catch(() => undefined);
            }
          } catch {
            /* ignore */
          }
        }
        const now = Date.now();
        const running = sessionManager.listRunning() || [];
        const headlessRows = running.filter((r) => r.headless === true || r.shadowLane === true);
        const activeHeadlessCount = headlessRows.length;
        const activeHeadedCount = running.filter((r) => r.headless !== true && r.shadowLane !== true).length;
        const headlessSessions = headlessRows.map((r) => {
          const launchedAt = Number(r.launchedAt || 0);
          const lastActivityAt = Number(r.lastActivityAt || launchedAt || now);
          return {
            id: String(r.id || r.profileId || ""),
            code: String(r.name || r.id || "").slice(0, 8),
            callerId: String(r.callerId || "default-agent"),
            supportChatProtected: Boolean(r.supportChatProtected),
            uptimeMs: launchedAt > 0 ? Math.max(0, now - launchedAt) : 0,
            idleMs: lastActivityAt > 0 ? Math.max(0, now - lastActivityAt) : 0,
            shadowLane: Boolean(r.shadowLane),
          };
        });
        return send.json(ctx.res, 200, {
          ok: true,
          targetMonitor: getTargetMonitor(),
          maxHeadlessSessions: getMaxHeadlessSessions(),
          activeHeadlessCount,
          activeHeadedCount,
          headlessSessions,
          drainedCount,
          movedBrowsersCount,
          totalMonitors: resolved.totalMonitors,
          resolvedDisplayIndex: resolved.displayIndex,
          resolvedWorkArea: resolved.workArea,
        });
      },
    },
    {
      id: "system.workerGuardGet",
      method: "GET",
      pattern: /^\/api\/system\/worker-guard$/,
      handler(ctx) {
        const { getWorkerGuardState } = require("../lib/agent-worker-memory-guard.cjs");
        return send.json(ctx.res, 200, { ok: true, ...getWorkerGuardState(sessionManager) });
      },
    },
    {
      id: "system.workerGuardSweep",
      method: "POST",
      pattern: /^\/api\/system\/worker-guard$/,
      async handler(ctx) {
        const { runWorkerGuardSweep } = require("../lib/agent-worker-memory-guard.cjs");
        const maxRamMb = Number(ctx.body?.maxRamMb) || undefined;
        const maxIdleMs = Number(ctx.body?.maxIdleMs) || undefined;
        const res = await runWorkerGuardSweep({ sessionManager, maxRamMb, maxIdleMs });
        return send.json(ctx.res, 200, res);
      },
    },
    {
      id: "catalog.checkpoint",
      method: "POST",
      pattern: /^\/api\/catalog\/checkpoint$/,
      handler(ctx) {
        try {
          const { checkpointDatabase, getDb } = require("../db/init.cjs");
          if (ctx.body?.reindex) {
            const db = getDb();
            for (const idx of [
              "idx_profiles_updated_at",
              "idx_profiles_group_id",
              "idx_profiles_fingerprint_seed",
              "idx_profiles_status",
            ]) {
              try {
                db.exec(`DROP INDEX IF EXISTS ${idx};`);
              } catch {
                /* ignore */
              }
            }
            db.exec("CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);");
            db.exec("CREATE INDEX IF NOT EXISTS idx_profiles_group_id ON profiles(group_id);");
            db.exec("CREATE INDEX IF NOT EXISTS idx_profiles_fingerprint_seed ON profiles(fingerprint_seed);");
            db.exec("CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);");
          }
          checkpointDatabase({ truncate: true });
          return send.json(ctx.res, 200, { ok: true, checkpoint: true, reindexed: Boolean(ctx.body?.reindex) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return send.json(ctx.res, 500, { ok: false, error: message });
        }
      },
    },
  ];
}

module.exports = {
  buildSystemAndRuntimeRoutes,
};
