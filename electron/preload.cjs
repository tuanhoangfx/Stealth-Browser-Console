const { contextBridge, ipcRenderer } = require("electron");
const { createPreloadUpdateBridge } = require("./lib/desktop-host-kit.cjs");

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

contextBridge.exposeInMainWorld("stealthApi", {
  engineHealth: () => invoke("engine:health"),
  updateBinary: () => invoke("engine:updateBinary"),
  listProfiles: () => invoke("profile:list"),
  profileBootstrap: () => invoke("profile:bootstrap"),
  listProfilesPage: (payload) => invoke("profile:listPage", payload),
  catalogStats: () => invoke("profile:catalogStats"),
  createProfile: (payload) => invoke("profile:create", payload),
  createProfilesBulkByNames: (payload) => invoke("profile:createBulkByNames", payload),
  createProfilesBulkByRange: (payload) => invoke("profile:createBulkByRange", payload),
  updateProfile: (payload) => invoke("profile:update", payload),
  bulkUpdateStartupUrl: (payload) => invoke("profile:bulkUpdateStartupUrl", payload),
  bulkUpdateProfiles: (payload) => invoke("profile:bulkUpdate", payload),
  cloneProfilesBatch: (payload) => invoke("profile:cloneBatch", payload),
  deleteProfile: (payload) => invoke("profile:delete", payload),
  deleteProfiles: (payload) => invoke("profile:deleteMany", payload),
  launchProfile: (payload) => invoke("profile:launch", payload),
  closeProfile: (payload) => invoke("profile:close", payload),
  closeAllProfiles: () => invoke("profile:closeAll"),
  listRunningProfiles: () => invoke("profile:listRunning"),
  focusProfile: (payload) => invoke("profile:focus", payload),
  createGroup: (payload) => invoke("group:create", payload),
  updateGroup: (payload) => invoke("group:update", payload),
  deleteGroup: (payload) => invoke("group:delete", payload),
  exportProfiles: () => invoke("profiles:export"),
  importProfiles: (payload) => invoke("profiles:import", payload),
  backupProfilesState: (payload) => invoke("profiles:backupState", payload),
  restoreProfilesState: (payload) => invoke("profiles:restoreState", payload ?? {}),
  getProfileCookieGuardStatus: (payload) => invoke("profile:cookieGuardStatus", payload),
  snapshotProfileCookiesBackup: (payload) => invoke("profile:cookieGuardSnapshot", payload),
  restoreProfileCookiesBackup: (payload) => invoke("profile:cookieGuardRestore", payload),
  reconcileProfileP0020Status: (payload) => invoke("profile:cookieGuardReconcileP0020", payload),
  reconcileProfilesP0020Bulk: (payload) => invoke("profile:cookieGuardReconcileP0020Bulk", payload),
  profileStorageStats: (payload) => invoke("profiles:storageStats", payload),
  profileBackupMeta: (payload) => invoke("profiles:backupMeta", payload),
  onProfilesBackupProgress: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("profiles:backupProgress", listener);
    return () => ipcRenderer.removeListener("profiles:backupProgress", listener);
  },
  listRuns: (payload) => invoke("runs:list", payload),
  listProfileEvents: (payload) => invoke("profileEvents:list", payload),
  openUrl: (payload) => invoke("automation:openUrl", payload),
  appInfo: () => invoke("app:info"),
  fetchHostMetrics: () => invoke("host:metrics"),
  setVaultUserScope: (payload) => invoke("vault:setUserScope", payload),
  getVaultUserScope: () => invoke("vault:getUserScope"),
  openDataFolder: () => invoke("app:openDataFolder"),
  readLifecycleLog: (payload) => invoke("app:readLifecycleLog", payload),
  openProfilesFolder: () => invoke("app:openProfilesFolder"),
  getProfilesLocation: () => invoke("app:getProfilesLocation"),
  dismissProfilesLocationPrompt: () => invoke("app:dismissProfilesLocationPrompt"),
  chooseProfilesLocation: () => invoke("app:chooseProfilesLocation"),
  migrateProfilesLocation: (payload) => invoke("app:migrateProfilesLocation", payload),
  applySuggestedProfilesLocation: () => invoke("app:applySuggestedProfilesLocation"),
  getProfileExtensionsEnabled: () => invoke("app:getProfileExtensionsEnabled"),
  setProfileExtensionsEnabled: (payload) => invoke("app:setProfileExtensionsEnabled", payload),
  getExtensionToggles: () => invoke("app:getExtensionToggles"),
  setExtensionToggles: (payload) => invoke("app:setExtensionToggles", payload),
  listLaunchPerf: (payload) => invoke("launchPerf:list", payload),
  clearLaunchPerf: () => invoke("launchPerf:clear"),
  fetchLaunchBenchBaseline: () => invoke("launchPerf:baseline"),
  purgeLegacyIdentityToolbar: () => invoke("legacy:purgeIdentityToolbar"),
  checkProfileProxy: (payload) => invoke("proxy:check", payload),
  fetchCookieBridgeStatus: () => invoke("extension:cookieBridgeStatus"),
  setCookieBridgeSource: (payload) => invoke("extension:setCookieBridgeSource", payload),
  fetchOperatorExtensionStatus: () => invoke("extension:operatorStatus"),
  reloadOperatorExtension: () => invoke("extension:reloadOperator"),
  reloadOpenProfilesExtensions: () => invoke("extension:reloadOpenProfiles"),
  purgeBrokenExtensionPrefs: () => invoke("extension:purgeBrokenPrefs"),
  fetchExtensionsStatus: () => invoke("extension:status"),
  fetchExtensionIcon: (payload) => invoke("extension:icon", payload),
  installStoreExtension: (payload) => invoke("extension:installStore", payload),
  pickUnpackedExtensionFolder: () => invoke("extension:pickUnpackedFolder"),
  installUnpackedExtension: (payload) => invoke("extension:installUnpacked", payload),
  removeCachedExtensions: (payload) => invoke("extension:removeCached", payload),
  fetchStoreExtensionUpdateCheck: () => invoke("extension:storeUpdateCheck"),
  onStoreExtensionUpdateCheck: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("extension:storeUpdateCheck", listener);
    return () => ipcRenderer.removeListener("extension:storeUpdateCheck", listener);
  },
  onProfileSession: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("profile:session", listener);
    return () => ipcRenderer.removeListener("profile:session", listener);
  },
  ...createPreloadUpdateBridge(ipcRenderer, "stealth")
});

contextBridge.exposeInMainWorld("routerApi", {
  loadLocalConfig: () => invoke("router:loadLocalConfig"),
  request: (payload) => invoke("router:request", payload)
});
