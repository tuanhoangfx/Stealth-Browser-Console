require("./lib/ensure-packaged-module-paths.cjs");
const { app, BrowserWindow, ipcMain, Menu, session, shell, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { resolveAppIconPathIfExists } = require("./lib/desktop-app-icon.cjs");
const { configureElectronUserData, resolveStealthApiPort, isDevIsolated } = require("./lib/user-data-root.cjs");

configureElectronUserData(app);

/** Interactive UI must not inherit Cursor/agent smoke env (headless profiles with no window). API smokes use X-Stealth-Agent-Smoke per request. */
for (const key of ["STEALTH_AGENT_SMOKE", "STEALTH_HEADLESS_SMOKE", "CURSOR_AGENT"]) {
  delete process.env[key];
}

/** One desktop process per userData root — prevents agent/dev double-launch DB lock + login churn. */
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

const {
  configureAutoUpdater,
  bindDesktopUpdaterIpc,
  attachDesktopUpdaterWindow
} = require("./desktop-updater.cjs");
const { openDatabase, closeDatabase } = require("./db/init.cjs");
const profileService = require("./db/profile-service.cjs");
const { SessionManager } = require("./engine/session-manager.cjs");
const { createSessionTray } = require("./session-tray.cjs");
const { ensureEngineBinary, getBinaryInfo } = require("./engine/cloak-browser-engine.cjs");
const {
  purgeIdentityToolbarRoot,
  purgeAllProfilesIdentityToolbar,
  purgeAllProfilesBrokenExtensionPrefs,
  purgeAllProfilesDuplicateUnpackedStoreExtensions,
  purgeAllProfilesStaleCookieBridgePrefs,
  purgeAllProfilesSurfshark,
  purgeSurfsharkExtensionCache,
} = require("./lib/profile-chrome-cleanup.cjs");
const {
  warmCookieBridgeStoreCache,
  resolveCookieBridgeExtensionDirSync,
} = require("./lib/cookie-bridge-store.cjs");
const { getBinaryInfoCached } = require("./engine/cloak-browser-engine.cjs");
const { ensureCloakbrowserExtensionStage } = require("./lib/cloakbrowser-extension-stage.cjs");
const { packagedContentSecurityPolicy } = require("./lib/packaged-csp.cjs");
const {
  verifyPackagedRuntime,
  formatPackagedRuntimeRepairMessage,
  RELEASE_URL,
} = require("./lib/packaged-runtime-check.cjs");
const { getProfileExtensionsEnabled, setProfileExtensionsEnabled, getExtensionToggles, setExtensionToggles } = require("./lib/app-settings.cjs");
const { getCookieBridgeStatus } = require("./lib/cookie-bridge-status.cjs");
const { getExtensionsStatus, installStoreExtension, installUnpackedExtension, removeCachedExtensions } = require("./lib/extensions-status.cjs");
const {
  getStoreExtensionUpdateCheck,
  setStoreExtensionUpdateCheck,
} = require("./lib/store-extension-update-state.cjs");
const { nativeExtensionsEnabled } = require("./lib/extension-launch-mode.cjs");
const {
  launchProfile: launchProfileOp,
  closeProfile: closeProfileOp,
  patchProfile: patchProfileOp,
  performOpenUrl: performOpenUrlOp,
} = require("./services/profile-ops.cjs");
const {
  validateProfileId,
  validateCreateProfilePayload,
  validateBulkCreateProfilesByNamesPayload,
  validateBulkCreateProfilesByRangePayload,
  validateOpenUrlPayload,
  validateGroupName,
  validateRunsLimit,
  validateRouterRequestPayload
} = require("./ipc-contracts.cjs");
const { bindRendererReloadShortcuts } = require("./lib/renderer-reload.cjs");

const sessionManager = new SessionManager();
const sessionTray = createSessionTray(sessionManager);
let appShutdownDone = false;
/** Set true only after bindIpc() — second-instance/activate must not open a window earlier. */
let mainBootReady = false;
/** Queued when second-instance arrives during DB/boot before IPC handlers exist. */
let pendingBootWindow = false;
const DEFAULT_DEV_SERVER_URL = "http://127.0.0.1:5175/";

function userDataRoot() {
  return app.getPath("userData");
}

function bindIpc() {
  ipcMain.handle("engine:health", async () => {
    try {
      const info = await ensureEngineBinary();
      return { ok: true, installed: true, info };
    } catch (error) {
      let info = {};
      try {
        info = await getBinaryInfo();
      } catch {
        info = {};
      }
      return {
        ok: false,
        installed: false,
        error: error instanceof Error ? error.message : String(error),
        info
      };
    }
  });

  ipcMain.handle("engine:updateBinary", async () => {
    const info = await ensureEngineBinary();
    return { ok: true, info };
  });

  ipcMain.handle("profile:listPage", (_event, payload = {}) => {
    const page = profileService.listProfilesPage(payload);
    return { ok: true, ...page };
  });

  ipcMain.handle("profile:catalogStats", () => {
    return { ok: true, stats: profileService.getCatalogStats() };
  });

  ipcMain.handle("profile:bootstrap", () => {
    return {
      ok: true,
      groups: profileService.listGroups(),
      stats: profileService.getCatalogStats(),
    };
  });

  ipcMain.handle("profile:list", () => {
    return {
      ok: true,
      profiles: profileService.listProfilesLite(),
      groups: profileService.listGroups(),
    };
  });

  ipcMain.handle("profile:create", (_event, payload = {}) => {
    const safe = validateCreateProfilePayload(payload);
    const profile = profileService.createProfile(safe);
    return { ok: true, profile };
  });

  ipcMain.handle("profile:createBulkByNames", (_event, payload = {}) => {
    const safe = validateBulkCreateProfilesByNamesPayload(payload);
    const result = profileService.createProfilesBulkByNames({
      names: safe.names,
      defaults: safe,
    });
    return { ok: true, ...result };
  });

  ipcMain.handle("profile:createBulkByRange", (_event, payload = {}) => {
    const safe = validateBulkCreateProfilesByRangePayload(payload);
    const result = profileService.createProfilesBulkByRange({
      start: safe.start,
      end: safe.end,
      pad: safe.pad,
      defaults: safe,
    });
    return { ok: true, ...result };
  });

  ipcMain.handle("profile:update", async (_event, payload = {}) => {
    const id = validateProfileId(payload.id);
    const profile = await patchProfileOp(
      { profileService },
      id,
      payload,
      { userDataRoot: userDataRoot() },
    );
    return { ok: true, profile };
  });

  ipcMain.handle("profile:bulkUpdateStartupUrl", (_event, payload = {}) => {
    const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
    const result = profileService.bulkUpdateStartupUrl(ids, payload.startupUrl);
    return { ok: true, ...result };
  });

  ipcMain.handle("profile:delete", async (_event, payload = {}) => {
    const id = validateProfileId(payload.id);
    const profile = profileService.getProfile(id);
    const release = await sessionManager.releaseProfileStorage(id);
    profileService.deleteProfile(id);
    return {
      ok: true,
      count: 1,
      names: [profile?.name || id],
      storagePurged: release.storagePurged ? 1 : 0,
    };
  });

  ipcMain.handle("profile:deleteMany", async (_event, payload = {}) => {
    const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
    const names = ids.map((id) => profileService.getProfile(id)?.name || id);
    let storagePurged = 0;
    for (const id of ids) {
      const release = await sessionManager.releaseProfileStorage(id);
      if (release.storagePurged) storagePurged += 1;
    }
    const result = profileService.deleteProfiles(ids);
    return { ok: true, count: result.count, names, storagePurged };
  });

  ipcMain.handle("profile:launch", async (_event, payload = {}) => {
    return launchProfileOp(
      {
        sessionManager,
        profileService,
        userDataRoot,
        verifyRuntime: verifyPackagedRuntime,
        formatRuntimeError: formatPackagedRuntimeRepairMessage,
      },
      { id: validateProfileId(payload.id), name: payload.name },
    );
  });

  ipcMain.handle("profile:close", async (_event, payload = {}) => {
    return closeProfileOp(
      { sessionManager, profileService },
      { id: validateProfileId(payload.id), name: payload.name },
    );
  });

  ipcMain.handle("profile:closeAll", async () => {
    const sessions = sessionManager.listRunning();
    await sessionManager.closeAll();
    return { ok: true, count: sessions.length, ids: sessions.map((row) => row.id) };
  });

  ipcMain.handle("profile:focus", async (_event, payload = {}) => {
    const profile = profileService.resolveProfileForLaunch({
      id: validateProfileId(payload.id),
      name: payload.name,
    });
    if (!profile) throw new Error("Profile not found.");
    return sessionManager.focusProfile(profile.id);
  });

  ipcMain.handle("profile:listRunning", () => ({
    ok: true,
    sessions: sessionManager.listRunning()
  }));

  ipcMain.handle("group:create", (_event, payload = {}) => {
    const group = profileService.createGroup(validateGroupName(payload.name));
    return { ok: true, group };
  });

  ipcMain.handle("group:update", (_event, payload = {}) => {
    const id = validateProfileId(payload.id);
    const group = profileService.updateGroup(id, validateGroupName(payload.name));
    return { ok: true, group };
  });

  ipcMain.handle("group:delete", (_event, payload = {}) => {
    const id = validateProfileId(payload.id);
    profileService.deleteGroup(id);
    return { ok: true };
  });

  ipcMain.handle("profiles:export", () => ({
    ok: true,
    bundle: profileService.exportProfilesBundle()
  }));

  ipcMain.handle("profiles:import", (_event, payload = {}) => {
    if (payload.bundle === undefined || payload.bundle === null) {
      throw new Error("Import bundle is required.");
    }
    try {
      return profileService.importProfilesBundle(payload.bundle, {
        merge: payload.merge !== false,
        matchBy: payload.matchBy === "id" ? "id" : "name",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Invalid import bundle: ${message}` };
    }
  });

  const { backupProfilesState, restoreProfilesState, buildProfileExportFilename } = require("./lib/profile-backup.cjs");
  const { listProfileStorageStats, listProfileStorageStatsAsync } = require("./lib/profile-storage.cjs");
  const { listBackupMeta, updateBackupMeta } = require("./lib/profile-backup-meta.cjs");

  function sendBackupProgress(payload) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("profiles:backupProgress", payload);
      }
    }
  }

  ipcMain.handle("profiles:storageStats", async (_event, payload = {}) => {
    const profileIds = Array.isArray(payload.profileIds) ? payload.profileIds.map(String) : [];
    const includeBytes = payload.includeBytes !== false;
    const stats = includeBytes
      ? await listProfileStorageStatsAsync(userDataRoot(), profileIds, { includeBytes: true })
      : listProfileStorageStats(userDataRoot(), profileIds, { includeBytes: false });
    return { ok: true, stats };
  });

  ipcMain.handle("profiles:backupMeta", (_event, payload = {}) => {
    const profileIds = Array.isArray(payload.profileIds) ? payload.profileIds.map(String) : [];
    return { ok: true, meta: listBackupMeta(userDataRoot(), profileIds) };
  });

  ipcMain.handle("profiles:backupState", async (_event, payload = {}) => {
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
      const result = backupProfilesState(userDataRoot(), {
        exportBundle: () => profileService.exportProfilesBundle(),
        listProfiles: () => profileService.listProfiles(),
        profileIds,
        onProgress: (progress) => sendBackupProgress(progress),
      });
      fs.copyFileSync(result.zipPath, pick.filePath);
      try {
        fs.unlinkSync(result.zipPath);
      } catch {
        /* ignore temp zip */
      }
      try {
        updateBackupMeta(userDataRoot(), (result.profileIds || []).map((id) => ({
          id,
          lastBackupAt: result.exportedAt,
          lastBackupBytes: result.bytes,
          lastBackupPath: pick.filePath,
        })));
      } catch {
        // best-effort — backup itself succeeded
      }
      return { ok: true, path: pick.filePath, profiles: result.profiles, bytes: result.bytes };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("profiles:restoreState", async (_event, payload = {}) => {
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
      const result = restoreProfilesState(userDataRoot(), pick.filePaths[0], {
        importBundle: (bundle, opts) => profileService.importProfilesBundle(bundle, opts),
        findProfilesByName: (name) => profileService.findProfilesByName(name),
        getProfileById: (id) => profileService.getProfile(id),
        restoreIntoProfileId: restoreIntoProfileId || undefined,
        onProgress: (progress) => sendBackupProgress(progress),
      });
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("runs:list", (_event, payload = {}) => {
    const limit = validateRunsLimit(payload.limit);
    return { ok: true, runs: profileService.listRuns(limit) };
  });

  ipcMain.handle("profileEvents:list", (_event, payload = {}) => {
    const profileId = String(payload.profileId || "").trim();
    if (!profileId) throw new Error("profileId is required.");
    const limit = validateRunsLimit(payload.limit);
    return { ok: true, events: profileService.listProfileEvents(profileId, limit) };
  });

  ipcMain.handle("automation:openUrl", async (_event, payload = {}) => {
    const safe = validateOpenUrlPayload(payload);
    return performOpenUrlOp(
      { sessionManager, profileService, userDataRoot: userDataRoot() },
      safe,
      { profileName: payload.profileName },
    );
  });

  ipcMain.handle("app:info", () => {
    const {
      getProfilesLocationInfo,
      ensureProfilesLocationInitialized,
    } = require("./lib/profiles-location.cjs");
    ensureProfilesLocationInitialized(userDataRoot());
    const profilesLocation = getProfilesLocationInfo(userDataRoot());
    return {
      name: app.getName(),
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      userDataPath: userDataRoot(),
      profilesPath: profilesLocation.profilesRoot,
      profilesLocation,
      profileExtensionsEnabled: getProfileExtensionsEnabled(),
      extensionToggles: getExtensionToggles(),
    };
  });

  ipcMain.handle("vault:setUserScope", (_event, payload = {}) => {
    const vaultUserScope = require("./lib/vault-user-scope.cjs");
    const { clearCredentialsCache } = require("./lib/twofa-vault-bridge.cjs");
    const email = payload?.email ?? null;
    vaultUserScope.setVaultHubLoginEmail(email);
    vaultUserScope.clearVaultUserIdCache();
    clearCredentialsCache();
    let scopeEmail = null;
    let scopeError = null;
    try {
      scopeEmail = vaultUserScope.resolveVaultScopeEmail();
    } catch (error) {
      scopeError = error instanceof Error ? error.message : String(error);
    }
    return {
      ok: true,
      hubEmail: vaultUserScope.getVaultHubLoginEmail(),
      scopeEmail,
      scopeError,
      devScope: vaultUserScope.isVaultDevScope(),
    };
  });

  ipcMain.handle("vault:getUserScope", () => {
    const vaultUserScope = require("./lib/vault-user-scope.cjs");
    try {
      return {
        ok: true,
        hubEmail: vaultUserScope.getVaultHubLoginEmail(),
        scopeEmail: vaultUserScope.resolveVaultScopeEmail(),
        scopeError: null,
        devScope: vaultUserScope.isVaultDevScope(),
      };
    } catch (error) {
      return {
        ok: false,
        hubEmail: vaultUserScope.getVaultHubLoginEmail(),
        scopeEmail: null,
        scopeError: error instanceof Error ? error.message : String(error),
        devScope: vaultUserScope.isVaultDevScope(),
      };
    }
  });

  ipcMain.handle("app:getExtensionToggles", () => ({
    ok: true,
    toggles: getExtensionToggles(),
  }));

  ipcMain.handle("app:setExtensionToggles", (_event, payload = {}) => {
    const patch = payload.toggles && typeof payload.toggles === "object" ? payload.toggles : payload;
    return { ok: true, toggles: setExtensionToggles(patch) };
  });

  ipcMain.handle("app:getProfileExtensionsEnabled", () => ({
    ok: true,
    enabled: getProfileExtensionsEnabled(),
  }));

  ipcMain.handle("app:setProfileExtensionsEnabled", (_event, payload = {}) => {
    const enabled = Boolean(payload.enabled);
    return { ok: true, enabled: setProfileExtensionsEnabled(enabled) };
  });

  ipcMain.handle("app:openDataFolder", () => {
    shell.openPath(userDataRoot());
    return { ok: true, path: userDataRoot() };
  });

  ipcMain.handle("app:openProfilesFolder", () => {
    const { resolveProfilesRoot } = require("./lib/profiles-location.cjs");
    const profilesPath = resolveProfilesRoot(userDataRoot());
    shell.openPath(profilesPath);
    return { ok: true, path: profilesPath };
  });

  ipcMain.handle("app:getProfilesLocation", () => {
    const { getProfilesLocationInfo, ensureProfilesLocationInitialized } = require("./lib/profiles-location.cjs");
    ensureProfilesLocationInitialized(userDataRoot());
    return { ok: true, ...getProfilesLocationInfo(userDataRoot()) };
  });

  ipcMain.handle("app:dismissProfilesLocationPrompt", () => {
    const { dismissProfilesLocationPrompt, getProfilesLocationInfo } = require("./lib/profiles-location.cjs");
    dismissProfilesLocationPrompt(userDataRoot());
    return { ok: true, ...getProfilesLocationInfo(userDataRoot()) };
  });

  ipcMain.handle("app:chooseProfilesLocation", async () => {
    const { getProfilesLocationInfo, suggestProfilesRoot } = require("./lib/profiles-location.cjs");
    const current = getProfilesLocationInfo(userDataRoot());
    const pick = await dialog.showOpenDialog({
      title: "Choose profiles storage folder",
      defaultPath: current.suggestedProfilesRoot || current.profilesRoot,
      properties: ["openDirectory", "createDirectory"],
    });
    if (pick.canceled || !pick.filePaths?.[0]) {
      return { ok: false, canceled: true, ...current };
    }
    return {
      ok: true,
      selectedPath: pick.filePaths[0],
      suggestedProfilesRoot: suggestProfilesRoot(userDataRoot()),
      ...current,
    };
  });

  ipcMain.handle("app:migrateProfilesLocation", async (_event, payload = {}) => {
    const {
      migrateProfilesRoot,
      setProfilesRoot,
      getProfilesLocationInfo,
    } = require("./lib/profiles-location.cjs");
    const target = String(payload.path || payload.profilesRoot || "").trim();
    if (!target) return { ok: false, error: "path is required" };

    const running = sessionManager.listRunning?.() || [];
    if (running.length) {
      return {
        ok: false,
        error: `Close ${running.length} open profile(s) before moving storage.`,
        runningCount: running.length,
      };
    }

    try {
      await sessionManager.closeAll?.();
    } catch {
      /* best effort */
    }

    try {
      if (payload.mode === "point-only") {
        setProfilesRoot(userDataRoot(), target, { source: "settings-point" });
        return { ok: true, moved: false, ...getProfilesLocationInfo(userDataRoot()) };
      }
      const result = migrateProfilesRoot(userDataRoot(), target, { source: "settings-migrate" });
      return { ok: true, moved: !result.skipped, ...result.info, result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("app:applySuggestedProfilesLocation", async () => {
    const { suggestProfilesRoot, migrateProfilesRoot, getProfilesLocationInfo } = require("./lib/profiles-location.cjs");
    const target = suggestProfilesRoot(userDataRoot());
    const running = sessionManager.listRunning?.() || [];
    if (running.length) {
      return {
        ok: false,
        error: `Close ${running.length} open profile(s) before moving storage.`,
        runningCount: running.length,
      };
    }
    try {
      await sessionManager.closeAll?.();
    } catch {
      /* best effort */
    }
    try {
      const result = migrateProfilesRoot(userDataRoot(), target, { source: "apply-suggested" });
      return { ok: true, moved: !result.skipped, ...result.info, result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const { listLaunchPerf, clearLaunchPerf } = require("./lib/profile-launch-perf.cjs");
  const { readLaunchBench } = require("./lib/launch-bench-store.cjs");

  ipcMain.handle("launchPerf:list", (_event, payload = {}) => ({
    ok: true,
    entries: listLaunchPerf(payload?.limit),
  }));

  ipcMain.handle("launchPerf:clear", () => clearLaunchPerf());

  ipcMain.handle("launchPerf:baseline", () => ({
    ok: true,
    baseline: readLaunchBench(path.join(__dirname, "..")),
  }));

  ipcMain.handle("legacy:purgeIdentityToolbar", () => {
    const result = purgeAllProfilesIdentityToolbar(userDataRoot());
    return { ok: true, ...result };
  });

  ipcMain.handle("extension:cookieBridgeStatus", () => ({
    ok: true,
    status: getCookieBridgeStatus(userDataRoot()),
  }));

  ipcMain.handle("extension:purgeBrokenPrefs", () => {
    const result = purgeAllProfilesBrokenExtensionPrefs(userDataRoot());
    return { ok: true, ...result };
  });

  ipcMain.handle("extension:status", () => ({
    ok: true,
    status: getExtensionsStatus(userDataRoot()),
  }));

  ipcMain.handle("extension:storeUpdateCheck", () => ({
    ok: true,
    check: getStoreExtensionUpdateCheck(),
  }));

  ipcMain.handle("extension:icon", (_event, payload = {}) => {
    const storeId = String(payload.storeId ?? "").trim();
    if (!storeId) return { ok: false, error: "storeId is required" };
    const { unpackedDirForStoreId, resolveExtensionIconDataUri } = require("./lib/webstore-extension.cjs");
    const unpackedPath = unpackedDirForStoreId(userDataRoot(), storeId);
    const iconDataUri = resolveExtensionIconDataUri(unpackedPath, Number(payload.size) || 48);
    return { ok: true, storeId, iconDataUri };
  });

  ipcMain.handle("extension:installStore", async (_event, payload = {}) => {
    const storeIdOrUrl = String(payload.storeId ?? payload.storeIdOrUrl ?? payload.url ?? "").trim();
    if (!storeIdOrUrl) return { ok: false, error: "storeId or Chrome Web Store URL is required" };
    const profileIds = Array.isArray(payload.profileIds)
      ? payload.profileIds.map((id) => String(id).trim()).filter(Boolean)
      : undefined;
    const force = Boolean(payload.force);
    try {
      const result = await installStoreExtension(userDataRoot(), storeIdOrUrl, { profileIds, force });
      const binary = await getBinaryInfoCached();
      const { prepareProfileExtensions } = require("./lib/native-extension-load.cjs");
      const { resolveProfilesRoot } = require("./lib/profiles-location.cjs");
      const profilesDir = resolveProfilesRoot(userDataRoot());
      const wanted = Array.isArray(profileIds) && profileIds.length ? new Set(profileIds) : null;
      if (fs.existsSync(profilesDir)) {
        for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          if (wanted && !wanted.has(entry.name)) continue;
          try {
            prepareProfileExtensions(path.join(profilesDir, entry.name), userDataRoot(), binary.cacheDir);
          } catch {
            // best-effort per profile
          }
        }
      }
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("extension:pickUnpackedFolder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select unpacked extension folder",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
    return { ok: true, path: result.filePaths[0] };
  });

  ipcMain.handle("extension:repairProfiles", async () => {
    const { repairAllProfileExtensionPaths } = require("./lib/native-extension-load.cjs");
    const binary = await getBinaryInfoCached();
    const result = repairAllProfileExtensionPaths(userDataRoot(), binary.cacheDir);
    return { ok: true, ...result, repaired: result.rewritten };
  });

  ipcMain.handle("extension:removeCached", async (_event, payload = {}) => {
    const items = Array.isArray(payload.items) ? payload.items : payload.item ? [payload.item] : [];
    try {
      const result = removeCachedExtensions(userDataRoot(), items);
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("extension:installUnpacked", async (_event, payload = {}) => {
    const sourceDir = String(payload.path ?? payload.sourceDir ?? "").trim();
    if (!sourceDir) return { ok: false, error: "Extension folder path is required" };
    const profileIds = Array.isArray(payload.profileIds)
      ? payload.profileIds.map((id) => String(id).trim()).filter(Boolean)
      : undefined;
    try {
      const result = await installUnpackedExtension(userDataRoot(), sourceDir, { profileIds });
      const binary = await getBinaryInfoCached();
      const { ensureCloakbrowserExtensionStages } = require("./lib/cloakbrowser-extension-stage.cjs");
      ensureCloakbrowserExtensionStages([result.unpackedPath], binary.cacheDir);
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

function tryLoadJsonFile(candidates) {
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      return { data: JSON.parse(fs.readFileSync(filePath, "utf8")), source: filePath };
    } catch {
      // try next candidate
    }
  }
  return null;
}

function resolveRouterApiKey(parsed) {
  const keys = parsed?.apiKeys && typeof parsed.apiKeys === "object" ? parsed.apiKeys : {};
  const slot = String(parsed.apiKeySlot || "platform-tools").trim();
  return String(parsed.apiKey || keys[slot] || keys["platform-tools"] || keys["other-tools"] || "").trim();
}

function loadRouterLocalConfig() {
  const hit = tryLoadJsonFile([
    path.join(process.cwd(), "config", "router.local.json"),
    path.join(__dirname, "..", "config", "router.local.json"),
    path.join(app.getPath("userData"), "router.local.json")
  ]);
  if (!hit) return null;
  const parsed = hit.data;
  return {
    baseUrl: String(parsed.baseUrl || "").trim(),
    apiKey: resolveRouterApiKey(parsed),
    model: String(parsed.model || "xai/grok-3").trim(),
    fallbacks: Array.isArray(parsed.fallbacks) ? parsed.fallbacks.map((item) => String(item).trim()).filter(Boolean) : [],
    maxTokens: Number(parsed.maxTokens) || 4096,
    temperature: Number.isFinite(Number(parsed.temperature)) ? Number(parsed.temperature) : 0.3,
    source: hit.source
  };
}

function loadP0007ApiKey() {
  const hit = tryLoadJsonFile([
    path.join(process.cwd(), "..", "P0007-9router-infra", "data", "api-keys.local.json"),
    path.join(__dirname, "..", "..", "P0007-9router-infra", "data", "api-keys.local.json")
  ]);
  if (!hit) return null;
  const parsed = hit.data;
  const keys = parsed?.keys && typeof parsed.keys === "object" ? parsed.keys : {};
  const apiKey = String(
    keys["platform-tools"] || keys["other-tools"] || keys["stealth-console"] || keys["cursor-ide"] || "",
  ).trim();
  if (!apiKey) return null;
  const baseUrl = String(parsed.canonicalBaseUrl || parsed.activeBaseUrl || "").trim();
  return { apiKey, baseUrl: baseUrl || "https://9router.infi.io.vn/v1", source: hit.source };
}

function bindRouterApi() {
  const { validateRouterRequestPayload: validateRouterPayload } = require("./ipc-contracts.cjs");

  ipcMain.handle("router:loadLocalConfig", () => {
    const local = loadRouterLocalConfig();
    if (local?.apiKey?.trim()) return local;
    return loadP0007ApiKey();
  });

  ipcMain.handle("router:request", async (_event, payload = {}) => {
    let safe;
    try {
      safe = validateRouterPayload(payload);
    } catch (error) {
      return { ok: false, status: 0, body: error instanceof Error ? error.message : String(error) };
    }

    const url = safe.path ? `${safe.baseUrl}/${safe.path}` : safe.baseUrl;
    try {
      const response = await fetch(url, {
        method: safe.method,
        signal: AbortSignal.timeout(safe.timeoutMs),
        headers: {
          ...safe.headers,
          Authorization: `Bearer ${safe.apiKey}`,
          "Content-Type": "application/json"
        },
        body: safe.body !== undefined ? JSON.stringify(safe.body) : undefined
      });
      const body = await response.text();
      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection failed";
      return { ok: false, status: 0, body: message };
    }
  });
}

function normalizeDevServerUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

async function isStealthDevServer(url) {
  try {
    const response = await fetch(url, { method: "GET", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes("Stealth Browser Console");
  } catch {
    return false;
  }
}

/** Wait until Vite serves HTML + main entry (avoids Electron boot timeout on zombie port). */
async function waitForStealthDevServer(url, { timeoutMs = 60000 } = {}) {
  const base = normalizeDevServerUrl(url);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isStealthDevServer(base))) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    try {
      const entry = await fetch(new URL("src/main.tsx", base), { signal: AbortSignal.timeout(8000) });
      if (entry.ok) return true;
    } catch {
      // Vite still compiling or zombie — retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function resolveDevServerUrl() {
  if (app.isPackaged) return null;
  if (String(process.env.STEALTH_LOAD_DIST || "") === "1") return null;

  const fromEnv = normalizeDevServerUrl(process.env.VITE_DEV_SERVER_URL);
  const candidates = [];
  for (const url of [DEFAULT_DEV_SERVER_URL, fromEnv]) {
    if (!url || candidates.includes(url)) continue;
    candidates.push(url);
  }

  for (const url of candidates) {
    if (await isStealthDevServer(url)) return url;
  }

  // Never fall back to a foreign Vite (e.g. workspace :5173) — wrong app / boot errors.
  if (!app.isPackaged && fs.existsSync(distIndexPath())) {
    console.warn("[load] Vite :5175 not running — start pnpm dev:node (dist fallback disabled in dev)");
  }
  return null;
}

function distIndexPath() {
  return path.join(__dirname, "..", "dist", "index.html");
}

async function loadApplication(win) {
  const devServerUrl = await resolveDevServerUrl();
  if (devServerUrl) {
    const ready = await waitForStealthDevServer(devServerUrl);
    if (!ready) {
      console.error(`[load] dev server not ready: ${devServerUrl} — run pnpm dev:recover`);
      const html = [
        "<!doctype html><html><body style=\"margin:0;background:#0b1020;color:#e6e8ef;font:14px/1.5 system-ui,sans-serif\">",
        "<div style=\"padding:2rem;max-width:40rem\">",
        "<h1 style=\"margin:0 0 .75rem;font-size:1.125rem\">Stealth Browser Console</h1>",
        "<p>Vite on <code>http://127.0.0.1:5175</code> is not ready yet.</p>",
        "<p>Run <code>pnpm dev:node</code> or <code>pnpm dev:recover</code> from Tool/P0003-Stealth-Browser-Console.</p>",
        "</div></body></html>",
      ].join("");
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      return;
    }
    await win.loadURL(devServerUrl);
    return;
  }
  const indexPath = distIndexPath();
  if (!fs.existsSync(indexPath)) {
    const html = [
      "<!doctype html><html><body style=\"margin:0;background:#0b1020;color:#e6e8ef;font:14px/1.5 system-ui,sans-serif\">",
      "<div style=\"padding:2rem;max-width:40rem\">",
      "<h1 style=\"margin:0 0 .75rem;font-size:1.125rem\">Stealth Browser Console</h1>",
      "<p>Dev server is not running and <code>dist/index.html</code> is missing.</p>",
      "<p>Run <code>pnpm dev</code> or <code>pnpm dev:reload</code> from the project folder.</p>",
      "</div></body></html>",
    ].join("");
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return;
  }
  await win.loadFile(indexPath);
}

function reloadRenderer(win) {
  if (!win || win.isDestroyed()) return Promise.resolve();
  return loadApplication(win);
}

function reloadAllRenderers() {
  return Promise.all(BrowserWindow.getAllWindows().map((win) => reloadRenderer(win)));
}

function installDesktopMenu() {
  const reloadItem = {
    label: "Reload",
    accelerator: "CmdOrCtrl+R",
    click: () => void reloadAllRenderers(),
  };
  const forceReloadItem = {
    label: "Force Reload",
    accelerator: "Shift+F5",
    click: () => void reloadAllRenderers(),
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin"
        ? [{ role: "appMenu" }]
        : [{ label: "File", submenu: [{ role: "quit" }] }]),
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          reloadItem,
          forceReloadItem,
          { type: "separator" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      { role: "windowMenu" },
      { role: "help", submenu: [] },
    ]),
  );
}

/**
 * Production CSP — removes the dev-only "unsafe-eval" exposure flagged by Electron.
 * Only applied when packaged so Vite HMR (needs eval/inline) keeps working in dev.
 * 'unsafe-inline' on style-src is required by Tailwind + inline colgroup widths.
 */
function bindContentSecurityPolicy() {
  if (!app.isPackaged) return;
  const policy = packagedContentSecurityPolicy();

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy]
      }
    });
  });
}

function broadcastProfileSession(profile, event) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("profile:session", { profile, event });
    }
  }
}

async function createWindow() {
  const iconPath = resolveAppIconPathIfExists(path.join(__dirname, ".."));
  const win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0b1020",
    title: "Stealth Browser Console",
    show: false,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`[load] failed ${code} ${description} ${url}`);
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[load] render gone ${details.reason}`);
  });

  bindRendererReloadShortcuts(win, reloadRenderer);
  await loadApplication(win);

  const showWindow = () => {
    if (win.isDestroyed()) return;
    if (!win.isVisible()) {
      const noFocus = String(process.env.STEALTH_DEV_NO_FOCUS || "") === "1";
      if (!noFocus) win.maximize();
      win.show();
      if (!noFocus) win.focus();
    }
  };

  win.once("ready-to-show", showWindow);
  // ready-to-show may fire before listener attaches when loading from file:// or fast dev server.
  setImmediate(showWindow);

  attachDesktopUpdaterWindow(win);
  return win;
}

if (gotSingleInstanceLock) {
  app.on("second-instance", () => {
    const existing = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed());
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      return;
    }
    // Never open a renderer before bindIpc — empty Profiles + "No handler registered for profile:bootstrap".
    if (!mainBootReady) {
      pendingBootWindow = true;
      console.warn("[boot] second-instance before IPC ready — defer createWindow");
      return;
    }
    void createWindow();
  });
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  configureAutoUpdater();
  bindDesktopUpdaterIpc();

  try {
    await openDatabase(userDataRoot());
  } catch (error) {
    console.error("[boot] openDatabase failed:", error instanceof Error ? error.message : error);
    const detail = error instanceof Error ? error.message : String(error);
    await dialog.showMessageBox({
      type: "error",
      title: "Catalog database failed to open",
      message: "Stealth could not open the profile catalog.",
      detail,
      buttons: ["OK"],
      noLink: true,
    });
    app.quit();
    return;
  }

  try {
    require("./lib/profiles-location.cjs").ensureProfilesLocationInitialized(userDataRoot());
  } catch (error) {
    console.warn("[profiles-location] init failed:", error instanceof Error ? error.message : error);
  }

  // Bind IPC + API before any BrowserWindow. A blocking runtime-repair modal used to run
  // first; second-instance could then createWindow with zero profile handlers.
  bindContentSecurityPolicy();
  installDesktopMenu();
  bindIpc();
  mainBootReady = true;
  const FAST_PREP = String(process.env.STEALTH_FAST_LAUNCH ?? "1").toLowerCase() !== "0";
  const { startApiServer } = require("./api-server.cjs");
  const apiPort = resolveStealthApiPort({ packaged: app.isPackaged });
  if (!app.isPackaged) {
    console.log(`[user-data] path=${userDataRoot()} isolated=${isDevIsolated() ? "1" : "0"} apiPort=${apiPort}`);
  }
  startApiServer({ sessionManager, profileService, userDataRoot: userDataRoot(), port: apiPort });
  sessionManager.setOnSessionChange((_id, profile, event) => {
    broadcastProfileSession(profile, event);
    sessionTray.refresh();
  });
  sessionTray.start();
  bindRouterApi();
  sessionManager.setUserDataRoot(userDataRoot());

  await createWindow();
  if (pendingBootWindow && BrowserWindow.getAllWindows().every((win) => win.isDestroyed())) {
    pendingBootWindow = false;
    await createWindow();
  }
  pendingBootWindow = false;

  const catalogCount = profileService.listProfilesLite().length;
  const { tryAutoRestoreCatalogIfEmpty } = require("./lib/catalog-backup-recovery.cjs");
  const { closeDatabase } = require("./db/init.cjs");
  const recovery = await tryAutoRestoreCatalogIfEmpty(userDataRoot(), { currentProfiles: catalogCount });
  if (recovery.restored) {
    closeDatabase();
    await openDatabase(userDataRoot());
    await reloadAllRenderers();
  }
  require("./lib/stealth-sync-outbox.cjs").startStealthSyncWorker();
  profileService.backfillProfileEvents();
  profileService.ensureSeedProfiles();
  try {
    require("./lib/twofa-vault-bridge.cjs").logVaultBridgeStartup();
  } catch {
    /* optional */
  }
  const {
    getDb,
    getDbBackend,
    getNativeDb,
    isDatabaseReady,
  } = require("./db/init.cjs");
  const { scheduleStartupLastOpenedMaintenance } = require("./db/last-opened-durability.cjs");
  scheduleStartupLastOpenedMaintenance({
    userDataPath: userDataRoot(),
    getDb,
    getDbBackend,
    getNativeDb,
    isDatabaseReady,
  });
  setImmediate(() => {
    void sessionManager.reconcileOrphansOnStartup().catch(() => undefined);
    if (process.platform === "win32") {
      try {
        const { warmRecentBadgeIcosOnStartup, warmTaskbarApplyRuntime } = require("./lib/profile-taskbar-native.cjs");
        void warmTaskbarApplyRuntime();
        warmRecentBadgeIcosOnStartup((limit) => profileService.listRecentlyOpenedProfiles(limit), { limit: 16 });

        const { startTaskbarBadgeGuard } = require("./lib/taskbar-badge-guard.cjs");
        const {
          scheduleProfileTaskbarBadgeApply,
          formatProfileWindowLabel,
          lastTaskbarBadgeOkAt,
        } = require("./lib/profile-window-title.cjs");
        startTaskbarBadgeGuard({
          listRunning: () => sessionManager.listRunning(),
          schedule: scheduleProfileTaskbarBadgeApply,
          formatLabel: formatProfileWindowLabel,
          lastOkAt: lastTaskbarBadgeOkAt,
        });
      } catch (error) {
        console.warn("[taskbar-badge] warm recent:", error instanceof Error ? error.message : error);
      }
    }
    void (async () => {
      if (typeof warmCookieBridgeStoreCache === "function") {
        try {
          const root = userDataRoot();
          await warmCookieBridgeStoreCache(root);
          const bridgeDir = resolveCookieBridgeExtensionDirSync(root);
          if (bridgeDir) {
            const binary = await getBinaryInfoCached();
            const { ensureCloakbrowserExtensionStage } = require("./lib/cloakbrowser-extension-stage.cjs");
            ensureCloakbrowserExtensionStage(bridgeDir, binary.cacheDir);
          }
        } catch (error) {
          console.warn("[cookie-bridge] warm cache:", error instanceof Error ? error.message : error);
        }
      } else {
        console.warn("[cookie-bridge] warm cache unavailable: missing startup hook");
      }
      try {
        const { checkCachedStoreExtensionsOnStartup } = require("./lib/webstore-extension.cjs");
        const sendCheck = (check) => {
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) win.webContents.send("extension:storeUpdateCheck", check);
          }
        };
        sendCheck(setStoreExtensionUpdateCheck({ checking: true, results: [] }));
        const results = await checkCachedStoreExtensionsOnStartup(userDataRoot());
        const check = setStoreExtensionUpdateCheck({
          checking: false,
          checkedAt: new Date().toISOString(),
          results,
        });
        sendCheck(check);
        const available = results.filter((row) => row.available);
        if (available.length) {
          console.log(
            `[store-ext] startup available ${available.map((row) => `${row.storeId} ${row.current}→${row.latest}`).join(", ")}`,
          );
        } else {
          console.log(`[store-ext] startup check: ${results.length} store extension(s) current`);
        }
      } catch (error) {
        console.warn("[store-ext] startup check:", error instanceof Error ? error.message : error);
        setStoreExtensionUpdateCheck({ checking: false, results: [] });
      }
    })();
  });
  try {
    const legacyIdentityRoot = path.join(userDataRoot(), "identity-ext");
    if (fs.existsSync(legacyIdentityRoot)) fs.rmSync(legacyIdentityRoot, { recursive: true, force: true });
  } catch {
    // best-effort — remove V4 in-page identity extensions
  }
  try {
    const legacyWorkflowQuickRun = path.join(userDataRoot(), "workflow-quick-run");
    if (fs.existsSync(legacyWorkflowQuickRun)) fs.rmSync(legacyWorkflowQuickRun, { recursive: true, force: true });
  } catch {
    // best-effort — remove rolled-back workflow side panel bundles
  }
  if (!nativeExtensionsEnabled()) {
    try {
      purgeSurfsharkExtensionCache(userDataRoot());
    } catch {
      // fast sync — block Surfshark load-extension path before first profile launch
    }
  }

  // Non-blocking: never await a modal before IPC/window (post-update --updated race).
  if (app.isPackaged) {
    const runtime = verifyPackagedRuntime();
    if (!runtime.ok) {
      const detail = formatPackagedRuntimeRepairMessage(runtime);
      console.error("[runtime-check]", detail);
      void dialog
        .showMessageBox({
          type: "error",
          title: "Installation repair required",
          message: "Required modules are missing after update.",
          detail,
          buttons: ["Download installer", "Continue anyway"],
          defaultId: 0,
          noLink: true,
        })
        .then(async ({ response }) => {
          if (response === 0) await shell.openExternal(RELEASE_URL);
        })
        .catch(() => undefined);
    }
  }

  if (!app.isPackaged && String(process.env.STEALTH_DIST_WATCH || "") === "1") {
    const { bindDistUiWatch } = require("./lib/dist-ui-watch.cjs");
    bindDistUiWatch({
      distDir: path.join(__dirname, "..", "dist"),
      onReload: () => {
        void reloadAllRenderers();
      },
    });
  }

  setImmediate(() => {
    try {
      purgeIdentityToolbarRoot(userDataRoot());
      const bulk = purgeAllProfilesIdentityToolbar(userDataRoot());
      if (bulk.removed > 0) {
        console.log(
          `[legacy-purge] startup profiles=${bulk.profiles} removed=${bulk.removed} prefsCleaned=${bulk.prefsCleaned}`,
        );
      }
      if (!nativeExtensionsEnabled()) {
        const surfshark = purgeAllProfilesSurfshark(userDataRoot());
        if (!surfshark.skipped && (surfshark.removed > 0 || surfshark.cacheRemoved)) {
          console.log(
            `[surfshark-purge] startup profiles=${surfshark.profiles} removed=${surfshark.removed} prefsCleaned=${surfshark.prefsCleaned} cacheRemoved=${surfshark.cacheRemoved}`,
          );
        }
      }
      const broken = FAST_PREP ? { removed: 0 } : purgeAllProfilesBrokenExtensionPrefs(userDataRoot());
      if (broken.removed > 0) {
        console.log(
          `[extension-purge] startup profiles=${broken.profiles} brokenRemoved=${broken.removed} prefsCleaned=${broken.prefsCleaned}`,
        );
      }
      if (nativeExtensionsEnabled() && getProfileExtensionsEnabled() && !FAST_PREP) {
        const deduped = purgeAllProfilesDuplicateUnpackedStoreExtensions(userDataRoot());
        if (deduped.removed > 0) {
          console.log(
            `[extension-dedupe] startup profiles=${deduped.profiles} shadowRemoved=${deduped.removed}`,
          );
        }
        void (async () => {
          try {
            const binary = await getBinaryInfoCached();
            const { repairAllProfileExtensionPaths } = require("./lib/native-extension-load.cjs");
            const repaired = repairAllProfileExtensionPaths(userDataRoot(), binary.cacheDir);
            if (repaired.rewritten > 0) {
              console.log(
                `[extension-repair] startup profiles=${repaired.profiles} rewritten=${repaired.rewritten}`,
              );
            }
          } catch (error) {
            console.warn("[extension-repair] startup:", error instanceof Error ? error.message : error);
          }
        })();
      }
      if (getProfileExtensionsEnabled() && !FAST_PREP) {
        const bridgeDir = resolveCookieBridgeExtensionDirSync(userDataRoot());
        if (bridgeDir) {
          const stale = purgeAllProfilesStaleCookieBridgePrefs(userDataRoot(), bridgeDir);
          if (stale.removed > 0) {
            console.log(
              `[cookie-bridge-purge] startup profiles=${stale.profiles} staleRemoved=${stale.removed} prefsCleaned=${stale.prefsCleaned}`,
            );
          }
        }
      }
    } catch {
      // best-effort — drop cached identity-toolbar bundles from pre-v0.5.23 installs
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (!mainBootReady) {
        pendingBootWindow = true;
        return;
      }
      createWindow();
    }
  });
}).catch((error) => {
  console.error("[boot] whenReady failed:", error instanceof Error ? error.stack || error.message : error);
});

app.on("before-quit", (event) => {
  if (appShutdownDone) return;
  event.preventDefault();
  sessionTray.stop();
  void (async () => {
    try {
      await sessionManager.closeAll();
    } catch (error) {
      console.warn("[shutdown] close sessions:", error instanceof Error ? error.message : error);
    } finally {
      const { flushScheduledLastOpenedCheckpoint } = require("./db/last-opened-durability.cjs");
      flushScheduledLastOpenedCheckpoint(require("./db/init.cjs").checkpointDatabase);
      closeDatabase();
      appShutdownDone = true;
      app.quit();
    }
  })();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
