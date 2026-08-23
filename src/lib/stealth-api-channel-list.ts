/** AUTO-GENERATED — node scripts/sync-stealth-api-surface.mjs */
export type StealthApiChannelRow = {
  method: string;
  channel: string;
  kind: "invoke" | "on";
  web: "stub" | "reject" | "seed";
};

export const STEALTH_API_CHANNELS: StealthApiChannelRow[] = [
  {
    "method": "engineHealth",
    "channel": "engine:health",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "updateBinary",
    "channel": "engine:updateBinary",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "listProfiles",
    "channel": "profile:list",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "profileBootstrap",
    "channel": "profile:bootstrap",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "listProfilesPage",
    "channel": "profile:listPage",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "catalogStats",
    "channel": "profile:catalogStats",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "createProfile",
    "channel": "profile:create",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "createProfilesBulkByNames",
    "channel": "profile:createBulkByNames",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "createProfilesBulkByRange",
    "channel": "profile:createBulkByRange",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "updateProfile",
    "channel": "profile:update",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "bulkUpdateStartupUrl",
    "channel": "profile:bulkUpdateStartupUrl",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "deleteProfile",
    "channel": "profile:delete",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "deleteProfiles",
    "channel": "profile:deleteMany",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "launchProfile",
    "channel": "profile:launch",
    "kind": "invoke",
    "web": "reject"
  },
  {
    "method": "closeProfile",
    "channel": "profile:close",
    "kind": "invoke",
    "web": "reject"
  },
  {
    "method": "closeAllProfiles",
    "channel": "profile:closeAll",
    "kind": "invoke",
    "web": "reject"
  },
  {
    "method": "listRunningProfiles",
    "channel": "profile:listRunning",
    "kind": "invoke",
    "web": "reject"
  },
  {
    "method": "focusProfile",
    "channel": "profile:focus",
    "kind": "invoke",
    "web": "reject"
  },
  {
    "method": "createGroup",
    "channel": "group:create",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "updateGroup",
    "channel": "group:update",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "deleteGroup",
    "channel": "group:delete",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "exportProfiles",
    "channel": "profiles:export",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "importProfiles",
    "channel": "profiles:import",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "backupProfilesState",
    "channel": "profiles:backupState",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "restoreProfilesState",
    "channel": "profiles:restoreState",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "profileStorageStats",
    "channel": "profiles:storageStats",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "profileBackupMeta",
    "channel": "profiles:backupMeta",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "onProfilesBackupProgress",
    "channel": "profiles:backupProgress",
    "kind": "on",
    "web": "stub"
  },
  {
    "method": "listRuns",
    "channel": "runs:list",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "listProfileEvents",
    "channel": "profileEvents:list",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "openUrl",
    "channel": "automation:openUrl",
    "kind": "invoke",
    "web": "reject"
  },
  {
    "method": "appInfo",
    "channel": "app:info",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "fetchHostMetrics",
    "channel": "host:metrics",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "setVaultUserScope",
    "channel": "vault:setUserScope",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "getVaultUserScope",
    "channel": "vault:getUserScope",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "openDataFolder",
    "channel": "app:openDataFolder",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "getProfileExtensionsEnabled",
    "channel": "app:getProfileExtensionsEnabled",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "setProfileExtensionsEnabled",
    "channel": "app:setProfileExtensionsEnabled",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "getExtensionToggles",
    "channel": "app:getExtensionToggles",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "setExtensionToggles",
    "channel": "app:setExtensionToggles",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "listLaunchPerf",
    "channel": "launchPerf:list",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "clearLaunchPerf",
    "channel": "launchPerf:clear",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "fetchLaunchBenchBaseline",
    "channel": "launchPerf:baseline",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "purgeLegacyIdentityToolbar",
    "channel": "legacy:purgeIdentityToolbar",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "fetchCookieBridgeStatus",
    "channel": "extension:cookieBridgeStatus",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "purgeBrokenExtensionPrefs",
    "channel": "extension:purgeBrokenPrefs",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "fetchExtensionsStatus",
    "channel": "extension:status",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "fetchExtensionIcon",
    "channel": "extension:icon",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "installStoreExtension",
    "channel": "extension:installStore",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "pickUnpackedExtensionFolder",
    "channel": "extension:pickUnpackedFolder",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "installUnpackedExtension",
    "channel": "extension:installUnpacked",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "removeCachedExtensions",
    "channel": "extension:removeCached",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "fetchStoreExtensionUpdateCheck",
    "channel": "extension:storeUpdateCheck",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "onStoreExtensionUpdateCheck",
    "channel": "extension:storeUpdateCheck",
    "kind": "on",
    "web": "stub"
  },
  {
    "method": "onProfileSession",
    "channel": "profile:session",
    "kind": "on",
    "web": "stub"
  },
  {
    "method": "getUpdateStatus",
    "channel": "stealth:get-update-status",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "checkForUpdates",
    "channel": "stealth:check-for-updates",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "downloadUpdate",
    "channel": "stealth:download-update",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "installUpdate",
    "channel": "stealth:install-update",
    "kind": "invoke",
    "web": "stub"
  },
  {
    "method": "onUpdateStatus",
    "channel": "stealth:update-status",
    "kind": "on",
    "web": "stub"
  }
] as const;

export const ROUTER_API_CHANNELS = [
  {
    "method": "loadLocalConfig",
    "channel": "router:loadLocalConfig",
    "kind": "invoke"
  },
  {
    "method": "request",
    "channel": "router:request",
    "kind": "invoke"
  }
] as const;
