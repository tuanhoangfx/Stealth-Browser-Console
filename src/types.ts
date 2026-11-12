export type ProfilesLocationInfo = {
  userDataRoot: string;
  profilesRoot: string;
  defaultProfilesRoot: string;
  suggestedProfilesRoot: string;
  usingCustom: boolean;
  promptPending: boolean;
  source: string | null;
  profileDirCount: number;
  configPath: string;
};

export type StealthScreen = "profiles" | "workflow" | "system";

export type ProfileStatus = "closed" | "opening" | "running" | "failed" | "headless" | "waiting";

export type StealthGroup = {
  id: string;
  name: string;
  sortOrder?: number;
};

export type ProfileProxyFilterMode = "local" | "vpn" | "auto_vpn" | "custom" | "static";

export type ProfileCatalogStats = {
  total: number;
  closed: number;
  opening: number;
  running: number;
  failed: number;
  headedRunning?: number;
  headlessRunning?: number;
  deferred?: number;
  waitingCodes?: string[];
  waitingReasons?: Record<string, string>;
  headlessReasons?: Record<string, string>;
  activityLogs?: Record<string, { text: string; updatedAt?: string; history?: Array<{ text: string; at: string }> }>;
  createdToday?: number;
  createdWeek?: number;
  updatedToday?: number;
  groupCounts: Record<string, number>;
  proxyCounts?: Record<string, number>;
};

/** Spoofed OS reported by the CloakBrowser engine (`--fingerprint-platform`). */
export type DevicePlatform = "windows" | "macos" | "linux";
export type DeviceColorScheme = "" | "light" | "dark" | "no-preference";

/** How the CloakBrowser OS window is sized on launch. */
export type WindowMode = "host-maximized" | "preset-viewport" | "engine-default";

/**
 * Per-profile device / fingerprint controls honored by cloakbrowser.
 * The `fingerprintSeed` derives all coherent internals (GPU, fonts, cores…);
 * these fields steer the engine-honored surface around it.
 */
export type DeviceConfig = {
  platform: DevicePlatform;
  /** IANA timezone, "" = auto from proxy (geoip). */
  timezone: string;
  /** BCP 47 locale, "" = engine default. */
  locale: string;
  /** Custom UA, "" = engine-generated (coherent with platform + seed). */
  userAgent: string;
  /** 0 = engine default viewport. */
  viewportW: number;
  viewportH: number;
  colorScheme: DeviceColorScheme;
  /** Device-library preset id (or "custom"). */
  devicePreset: string;
  /** Launch headless — hurts stealth, default false (headed). */
  headless: boolean;
  /** Human-like mouse/keyboard/scroll (cloakbrowser humanize), default true. */
  humanize: boolean;
  /** OS window sizing — host-maximized avoids Playwright viewport lock + frame jumps. */
  windowMode: WindowMode;
};

export type StealthProfile = {
  id: string;
  name: string;
  groupId: string | null;
  groupName: string | null;
  proxy: string;
  /** Keep proxy pinned after session close instead of auto-resetting to Local IP. */
  staticIp?: boolean;
  /** Runtime-only active VPN country code (e.g. "US") when an unpinned Local IP profile is running with an auto-resolved tunnel. */
  activeVpnCountry?: string;
  fingerprintSeed: number;
  note: string;
  /** Optional URL opened automatically after profile launch (http/https/about:blank). */
  startupUrl: string;
  status: ProfileStatus;
  /** Unix ms — last successful browser launch. */
  lastOpenedAt?: number;
  createdAt: string;
  updatedAt: string;
  extensionOverrides?: ProfileExtensionOverrides;
  /** In-memory / recent step log summary for the directory Log column. */
  activityLog?: string;
  /** Up to 5 recent timestamped steps for the Log column hover popover. */
  activityLogHistory?: Array<{ text: string; at: string }>;
} & DeviceConfig;

export type ProfileRow = StealthProfile;

export type ProfileStorageStat = {
  id: string;
  folderExists: boolean;
  /** null = exists check only (size loading deferred). */
  folderBytes: number | null;
};

export type ProfileBackupMeta = {
  id: string;
  lastBackupAt?: string;
  lastBackupBytes?: number;
  lastBackupPath?: string;
  folderExists?: boolean;
  folderBytes?: number;
  slotVersion?: number;
  backupCount?: number;
  hasSlotLatest?: boolean;
  hasSlotPrevious?: boolean;
  slotLatestAt?: string | null;
  slotPreviousAt?: string | null;
  slotLatestBytes?: number;
  slotPreviousBytes?: number;
  slotLatestCompressed?: boolean;
  slotPreviousCompressed?: boolean;
  slotLatestUncompressedBytes?: number;
  slotPreviousUncompressedBytes?: number;
  totalBackupBytes?: number;
  totalUncompressedBackupBytes?: number;
  avgBackupBytes?: number;
  cookiesCount?: number;
  domainsCount?: number;
  authDomainsCount?: number;
  hasGoogleAuth?: boolean;
  hasOutlookAuth?: boolean;
  hasFacebookAuth?: boolean;
  hasTikTokAuth?: boolean;
  historyBytes?: number;
  historyUrlsCount?: number;
  historyVisitsCount?: number;
  localStorageBytes?: number;
  stateFilesCount?: number;
  stateBytes?: number;
};

export type ProfileNativeBackupSlotManifest = {
  version: number;
  slot: "latest" | "previous";
  profileCode?: string;
  createdAt: string;
  rotatedAt?: string;
  cookiesBytes: number;
  cookiesSha256: string;
  totalRows: number;
  authDomainsCount: number;
  hasGoogleAuth: boolean;
  hasOutlookAuth: boolean;
  hasFacebookAuth: boolean;
  hasTikTokAuth: boolean;
  hasLocalStateBackup?: boolean;
  hasLocalStorageBackup?: boolean;
  localStorageBackupBytes?: number;
  hasHistoryBackup?: boolean;
  historyBytes?: number;
  stateFilesCount?: number;
  stateBytes?: number;
};

export type ProfileCookieGuardSummary = {
  exists: boolean;
  readable?: boolean;
  totalRows: number;
  authDomainsCount: number;
  hasGoogleAuth: boolean;
  hasOutlookAuth: boolean;
  hasFacebookAuth: boolean;
  hasTikTokAuth: boolean;
  hasLocalStateBackup?: boolean;
  hasLocalStorageBackup?: boolean;
  localStorageBackupBytes?: number;
  hasHistoryBackup?: boolean;
  historyBytes?: number;
  stateFilesCount?: number;
  stateBytes?: number;
  updatedAt?: string | null;
  byteSize: number;
  slotLatest?: ProfileNativeBackupSlotManifest | null;
  slotPrevious?: ProfileNativeBackupSlotManifest | null;
};

export type ProfileCookieGuardStatus = {
  profileCode: string;
  current: ProfileCookieGuardSummary;
  backup: ProfileCookieGuardSummary;
  slots?: {
    latest?: ProfileNativeBackupSlotManifest | null;
    previous?: ProfileNativeBackupSlotManifest | null;
  };
  vault: {
    availableSources: string[];
    totalVaultCookies: number;
    facebookCount: number;
    gmailCount: number;
    outlookCount: number;
    tiktokCount: number;
    serviceCount: number;
  };
};

export type ProfileCookieGuardRestoreResult = {
  ok: boolean;
  mode?: "live-cdp" | "disk-sqlite" | "native-bundle";
  restoredSlot?: "latest" | "previous";
  restoredCreatedAt?: string | null;
  restoredFromBak?: boolean;
  localStorageRestored?: boolean;
  historyRestored?: boolean;
  stateFilesRestored?: number;
  dpapiRewrapped?: boolean;
  vaultInjectedCount?: number;
  vaultSources?: string[];
  status?: ProfileCookieGuardStatus;
  error?: string;
};

export type ProfileP0020ReconcileResult = {
  ok: boolean;
  checkedRows?: number;
  patchedCount?: number;
  loggedInServices?: string[];
  patchedServices?: string[];
  reason?: string;
  status?: ProfileCookieGuardStatus;
  error?: string;
};

export type ProfileP0020BulkReconcileResult = {
  ok: boolean;
  mode?: "selected" | "all";
  profileCount?: number;
  checkedRows?: number;
  patchedCount?: number;
  promotedToLoggedIn?: number;
  loggedInServices?: string[];
  byServicePromoted?: Record<string, number>;
  error?: string;
};

export type ProfileMobileVaultStatus = {
  ok: boolean;
  profileCode: string;
  androidIdentity: {
    brand: string;
    manufacturer: string;
    model: string;
    device: string;
    release: string;
    buildId: string;
    imei: string;
    androidId: string;
    gsfId: string;
    glRenderer: string;
    macAddress: string;
  };
  iosIdentity: {
    model: string;
    deviceCode: string;
    iosVersion: string;
    udid: string;
    craneContainerId: string;
  };
  device: {
    connected: boolean;
    serial: string;
    isWireless?: boolean;
    wifiAdbEndpoint?: string;
    deviceModel: string;
    activeProfileOnDevice: string;
    isCurrentProfileActive: boolean;
    globalHttpProxy: string;
    proxyTunnelActive: boolean;
    iosWdaOnline: boolean;
  };
  snapshot: {
    exists: boolean;
    sizeBytes: number;
    updatedAt: string | null;
    archivePath: string;
    totalSnapshots: number;
    snapshotProfiles?: string[];
  };
  modules: {
    stagedCount: number;
    stagedModules: string[];
  };
};

export type ProfileMobileVaultActionResult = {
  ok: boolean;
  reason?: string;
  serial?: string;
  endpoint?: string;
  host?: string;
  port?: number;
  cookiesCount?: number;
  servicesUpdated?: string[];
  cookieGuardStatus?: ProfileCookieGuardStatus | null;
  restoredSnapshot?: boolean;
  archivePath?: string;
  proxyTunnel?: {
    ok: boolean;
    mode?: string;
    globalHttpProxy?: string;
    upstream?: {
      protocol: string;
      host: string;
      port: number;
      hasAuth: boolean;
    } | null;
  } | null;
  status?: ProfileMobileVaultStatus;
  error?: string;
};

export type ProfilesBackupProgressPayload = {
  phase: string;
  current: number;
  total: number;
  profileId?: string;
  status?: "copying" | "done" | "skipped" | "error";
  message?: string;
};

export type BulkCreateProfileDefaults = Partial<DeviceConfig> & {
  groupId?: string;
  proxy?: string;
  note?: string;
  startupUrl?: string;
};

export type BulkCreateProfilesResult = {
  requested: number;
  created: number;
  skippedExisting: number;
  duplicateInput: number;
  createdNames: string[];
  skippedNames: string[];
  duplicateNames: string[];
};

export type RunLogEntry = {
  level: "info" | "success" | "error" | "warn";
  message: string;
  time: string;
};

export type ScriptStepKind =
  | "navigate"
  | "wait"
  | "click"
  | "type"
  | "delay"
  | "scroll"
  | "screenshot"
  | "condition"
  | "action";

export type ScriptStep = {
  id: string;
  kind: ScriptStepKind;
  name: string;
  selector?: string;
  value?: string;
  timeoutMs?: number;
  enabled: boolean;
  /** When true on type steps, press Enter after fill */
  pressEnter?: boolean;
};

export type RunHistoryItem = {
  id: string;
  profileId: string;
  profileName: string;
  workflow: string;
  targetUrl?: string;
  status: "running" | "success" | "failed";
  liveProfileStatus?: "closed" | "opening" | "running" | "failed";
  sessionCount?: number;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  screenshotPath?: string;
  error?: string;
  logs?: RunLogEntry[];
};

export type ProfileEvent = {
  id: string;
  profileId: string;
  eventType: string;
  level: string;
  message: string;
  createdAt: string;
};

export type EngineHealth = {
  ok: boolean;
  installed?: boolean;
  error?: string;
  info?: Record<string, unknown>;
};

/** Host device sample from Electron `os` — Profiles header CPU / RAM. */
export type HostMetrics = {
  ok: boolean;
  cpuPercent: number;
  cpuReady: boolean;
  ramUsedBytes: number;
  ramTotalBytes: number;
  ramPercent: number;
  sampledAt: number;
  error?: string;
};

export type OpenUrlResult = {
  runId: string;
  ok: boolean;
  status: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  screenshotPath?: string;
  error?: string;
  logs: RunLogEntry[];
};

export type StealthUpdateProgress = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

export type StealthUpdateStatus = {
  state:
    | "idle"
    | "dev"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "installing"
    | "latest"
    | "error";
  runtime: "dev" | "installer" | "portable";
  supportsUpdates: boolean;
  currentVersion: string;
  message: string;
  updateVersion: string;
  releaseName: string;
  releaseDate: string;
  progress: StealthUpdateProgress | null;
};

export type LaunchPerfEntry = {
  profileId: string;
  profileName: string;
  label: string;
  totalMs: number;
  marks: Array<{ phase: string; ms: number }>;
  at: string;
};

export type LaunchBenchBaseline = {
  label?: string;
  rounds: number;
  sidePanel?: boolean;
  stats: { count: number; minMs: number; maxMs: number; avgMs: number };
  latestPhases: Array<{ phase: string; ms: number }>;
  at: string;
};

export type ExtensionToggles = {
  e0001: boolean;
  e0002: boolean;
  surfshark: boolean;
  webStore: boolean;
};

/** Per-profile override; omit key = follow app Settings → Extensions. */
export type ProfileExtensionOverrides = Partial<Record<keyof ExtensionToggles, boolean>>;

export type ExtensionSwHealthSummary = {
  status: "healthy" | "outdated" | "needs-heal" | "idle";
  registeredCount: number;
  currentVersionCount: number;
  outdatedVersionCount: number;
  missingSwCount: number;
  sampledProfiles: number;
  expectedVersion?: string | null;
  activeSwVersion?: string | null;
  sampleMissingCodes?: string[];
};

export type CookieBridgeStatus = {
  enabled: boolean;
  profilesExtensionsEnabled?: boolean;
  extensionToggles?: ExtensionToggles;
  productCode: string;
  name: string;
  storeId: string;
  resolvedPath: string | null;
  unpackedId: string | null;
  source: "workspace" | "store-cache" | "custom" | "missing";
  sourceMode?: "store" | "workspace";
  verifiedStore?: boolean;
  manifestOk: boolean;
  manifestName: string;
  manifestVersion?: string | null;
  workspaceVersion?: string | null;
  stageVersion?: string | null;
  swHealth?: ExtensionSwHealthSummary | null;
  workspacePath: string | null;
  cachePath: string;
  env: { STEALTH_COOKIE_BRIDGE: string; STEALTH_COOKIE_BRIDGE_LOCAL: string };
};

export type OperatorExtensionValidation = {
  ok: boolean;
  version?: string | null;
  files: string[];
  missing: string[];
  contractErrors: string[];
};

export type OperatorExtensionStatus = {
  enabled: boolean;
  profilesExtensionsEnabled?: boolean;
  extensionToggles?: ExtensionToggles;
  productCode: string;
  name: string;
  unpackedId: string | null;
  workspacePath: string | null;
  stagePath: string | null;
  manifestOk: boolean;
  manifestVersion?: string | null;
  stageVersion?: string | null;
  swHealth?: ExtensionSwHealthSummary | null;
  validation?: OperatorExtensionValidation | null;
};

export type CachedStoreExtension = {
  kind: "store" | "local";
  storeId: string | null;
  localKey?: string;
  unpackedPath: string;
  name: string;
  version?: string;
  iconDataUri?: string;
  /** ISO timestamp — when the extension folder/manifest was first created on disk. */
  createdAt?: string;
  /** ISO timestamp — manifest mtime on disk. */
  updatedAt?: string;
  /** Latest stage / reload / pin status summary for the Log column. */
  activityLog?: string;
  staged?: boolean;
  autoPinned?: boolean;
  swHealth?: ExtensionSwHealthSummary | null;
};

export type ExtensionsStatus = {
  launchMode: "native" | "managed";
  nativeMode: boolean;
  cached: CachedStoreExtension[];
  cookieBridge?: CookieBridgeStatus | null;
  operatorExtension?: OperatorExtensionStatus | null;
  reloadNonce?: number;
  reloadTriggeredAt?: string | null;
  webStoreInstallHint: string;
};

export type ReloadOpenProfilesExtensionsResult = {
  ok: boolean;
  reloadNonce: number;
  reloadTriggeredAt: string | null;
  e0001Synced: boolean;
  maintained?: {
    profiles: number;
    removed: number;
    prefsCleaned: number;
    skippedLive: number;
    pinned: number;
    pinnedBridge: number;
  } | null;
  status: ExtensionsStatus;
};

export type InstallStoreExtensionResult = {
  storeId: string;
  name: string;
  version?: string;
  unpackedPath: string;
  cached: boolean;
  force?: boolean;
  cacheOnly?: boolean;
  profiles: number;
  installed: number;
  details: Array<{ profileDir: string; extId?: string; error?: string }>;
};

export type InstallUnpackedExtensionResult = {
  kind: "local";
  localKey: string;
  name: string;
  unpackedPath: string;
  profiles: number;
  installed: number;
  details: Array<{ profileDir: string; extId?: string; error?: string }>;
};

export type CachedExtensionRef = {
  kind: "store" | "local";
  storeId?: string | null;
  localKey?: string | null;
};

export type RemoveCachedExtensionsResult = {
  removed: number;
  results: Array<CachedExtensionRef & { ok: boolean; cleared?: boolean; error?: string }>;
};

export type StoreExtensionUpdateRow = {
  storeId: string;
  name?: string;
  current: string;
  latest: string;
  available: boolean;
  status?: string;
  error?: string;
};

export type StoreExtensionUpdateCheck = {
  checking: boolean;
  checkedAt?: string | null;
  results: StoreExtensionUpdateRow[];
};

export type BulkUpdateProfilesPatch = Partial<StealthProfile> & {
  resetToDefaults?: boolean;
  extensionOverrideDelta?: {
    key: keyof ExtensionToggles;
    enabled: boolean;
    globalDefault: boolean;
  };
};

declare global {
  interface Window {
    stealthApi: {
      engineHealth: () => Promise<EngineHealth>;
      updateBinary: () => Promise<{ ok: boolean; info?: Record<string, unknown> }>;
      listProfiles: () => Promise<{ ok: boolean; profiles: StealthProfile[]; groups: StealthGroup[] }>;
      profileBootstrap: () => Promise<{ ok: boolean; groups: StealthGroup[]; stats: ProfileCatalogStats }>;
      listProfilesPage: (payload?: {
        search?: string;
        groupIds?: string[];
        statuses?: ProfileRow["status"][];
        proxyModes?: ProfileProxyFilterMode[];
        limit?: number;
        offset?: number;
        sort?: string;
        dir?: "asc" | "desc";
      }) => Promise<{
        ok: boolean;
        profiles: StealthProfile[];
        total: number;
        limit: number;
        offset: number;
      }>;
      catalogStats: () => Promise<{ ok: boolean; stats: ProfileCatalogStats }>;
      createProfile: (payload: {
        name: string;
        groupId?: string;
        proxy?: string;
        staticIp?: boolean;
        note?: string;
        fingerprintSeed?: number;
        startupUrl?: string;
      } & Partial<DeviceConfig>) => Promise<{ ok: boolean; profile: StealthProfile }>;
      createProfilesBulkByNames: (payload: {
        names: string[];
      } & BulkCreateProfileDefaults) => Promise<{ ok: boolean } & BulkCreateProfilesResult>;
      createProfilesBulkByRange: (payload: {
        start: number;
        end: number;
        pad?: number;
      } & BulkCreateProfileDefaults) => Promise<{ ok: boolean } & BulkCreateProfilesResult>;
      updateProfile: (payload: Partial<StealthProfile> & { id: string }) => Promise<{ ok: boolean; profile: StealthProfile }>;
      bulkUpdateStartupUrl: (payload: {
        ids: string[];
        startupUrl: string;
      }) => Promise<{ ok: boolean; count: number; profiles?: Array<StealthProfile & { lastChangeSummary?: string }> }>;
      bulkUpdateProfiles: (payload: {
        ids: string[];
        patch: BulkUpdateProfilesPatch;
      }) => Promise<{ ok: boolean; count: number; profiles?: Array<StealthProfile & { lastChangeSummary?: string }> }>;
      cloneProfilesBatch: (payload: {
        sourceIds: string[];
        count?: number;
        overrides?: Partial<StealthProfile>;
      }) => Promise<{
        ok: boolean;
        created: number;
        createdCodes: string[];
        profiles?: Array<StealthProfile & { lastChangeSummary?: string }>;
      }>;
      deleteProfile: (payload: { id: string }) => Promise<{
        ok: boolean;
        count?: number;
        names?: string[];
        storagePurged?: number;
        deletedProfiles?: Array<{ id: string; name: string; lastChangeSummary?: string }>;
      }>;
      deleteProfiles: (payload: { ids: string[] }) => Promise<{
        ok: boolean;
        count: number;
        names?: string[];
        storagePurged?: number;
        deletedProfiles?: Array<{ id: string; name: string; lastChangeSummary?: string }>;
      }>;
      launchProfile: (payload: { id: string; name?: string }) => Promise<{
        ok: boolean;
        profile: StealthProfile;
        headless?: boolean;
        agentSmoke?: boolean;
        focused?: boolean;
        logs?: RunLogEntry[];
      }>;
      closeProfile: (payload: { id: string; name?: string }) => Promise<{ ok: boolean; profile: StealthProfile }>;
      closeAllProfiles: () => Promise<{ ok: boolean; count: number; ids: string[] }>;
      listRunningProfiles: () => Promise<{
        ok: boolean;
        sessions: Array<{ id: string; name: string; headless?: boolean }>;
      }>;
      focusProfile: (payload: { id: string }) => Promise<{ ok: boolean; reason?: string }>;
      createGroup: (payload: { name: string }) => Promise<{ ok: boolean; group: StealthGroup }>;
      updateGroup: (payload: { id: string; name: string }) => Promise<{ ok: boolean; group: StealthGroup }>;
      deleteGroup: (payload: { id: string }) => Promise<{ ok: boolean }>;
      exportProfiles: () => Promise<{ ok: boolean; bundle: unknown }>;
      importProfiles: (payload: {
        bundle: unknown;
        merge?: boolean;
        matchBy?: "name" | "id";
      }) => Promise<{
        ok: boolean;
        imported: number;
        updated?: number;
        created?: number;
        skipped?: number;
        skippedNames?: string[];
        matchBy?: string;
        error?: string;
      }>;
      backupProfilesState: (payload?: { profileIds?: string[] }) => Promise<{
        ok: boolean;
        canceled?: boolean;
        path?: string;
        profiles?: number;
        bytes?: number;
        error?: string;
      }>;
      restoreProfilesState: (payload?: { restoreIntoProfileId?: string }) => Promise<{
        ok: boolean;
        canceled?: boolean;
        restored?: number;
        skipped?: number;
        profiles?: number;
        skipReasons?: Array<{ name: string; reason: string }>;
        restoreIntoProfileId?: string;
        restoreIntoProfileName?: string;
        imported?: { imported?: number; updated?: number; created?: number };
        error?: string;
      }>;
      getProfileCookieGuardStatus?: (payload: { id?: string; name?: string }) => Promise<{
        ok: boolean;
        status?: ProfileCookieGuardStatus;
        error?: string;
      }>;
      snapshotProfileCookiesBackup?: (payload: { id?: string; name?: string; force?: boolean }) => Promise<{
        ok: boolean;
        snapshotted?: boolean;
        reason?: string;
        status?: ProfileCookieGuardStatus;
        error?: string;
      }>;
      restoreProfileCookiesBackup?: (payload: {
        id?: string;
        name?: string;
        slot?: "latest" | "previous";
        sourceProfileId?: string;
      }) => Promise<ProfileCookieGuardRestoreResult>;
      reconcileProfileP0020Status?: (payload: { id?: string; name?: string }) => Promise<ProfileP0020ReconcileResult>;
      reconcileProfilesP0020Bulk?: (payload?: { ids?: string[] }) => Promise<ProfileP0020BulkReconcileResult>;
      profileStorageStats: (payload: {
        profileIds: string[];
        includeBytes?: boolean;
      }) => Promise<{ ok: boolean; stats: ProfileStorageStat[] }>;
      profileBackupMeta: (payload: { profileIds: string[] }) => Promise<{ ok: boolean; meta: ProfileBackupMeta[] }>;
      onProfilesBackupProgress?: (handler: (payload: ProfilesBackupProgressPayload) => void) => () => void;
      listRuns: (payload?: { limit?: number }) => Promise<{ ok: boolean; runs: RunHistoryItem[] }>;
      listProfileEvents: (payload: {
        profileId: string;
        limit?: number;
      }) => Promise<{ ok: boolean; events: ProfileEvent[] }>;
      openUrl: (payload: {
        profileId: string;
        targetUrl: string;
        screenshot?: boolean;
        closeWhenDone?: boolean;
        workflowAction?: "open-url" | "google-form-ag-appeal";
        inspectMode?: boolean;
        steps?: ScriptStep[];
        workflowId?: string;
      }) => Promise<OpenUrlResult>;
      appInfo: () => Promise<{
        name: string;
        version: string;
        isPackaged: boolean;
        userDataPath: string;
        profilesPath?: string;
        profilesLocation?: ProfilesLocationInfo;
        profileExtensionsEnabled?: boolean;
        extensionToggles?: ExtensionToggles;
      }>;
      readLifecycleLog: (payload?: { limit?: number }) => Promise<{
        ok: boolean;
        entries: Array<{
          at?: string;
          kind?: string;
          reason?: string;
          version?: string;
          packaged?: boolean;
          apiPort?: number;
          runningProfiles?: number;
          updateVersion?: string;
          updateState?: string;
        }>;
      }>;
      fetchHostMetrics: () => Promise<HostMetrics>;
      setVaultUserScope: (payload: {
        email?: string | null;
      }) => Promise<{
        ok: boolean;
        hubEmail: string | null;
        scopeEmail: string | null;
        scopeError: string | null;
        devScope: boolean;
      }>;
      getVaultUserScope: () => Promise<{
        ok: boolean;
        hubEmail: string | null;
        scopeEmail: string | null;
        scopeError: string | null;
        devScope: boolean;
      }>;
      openDataFolder: () => Promise<{ ok: boolean; path: string }>;
      openProfilesFolder: () => Promise<{ ok: boolean; path: string }>;
      getProfilesLocation: () => Promise<{ ok: boolean } & ProfilesLocationInfo>;
      dismissProfilesLocationPrompt: () => Promise<{ ok: boolean } & ProfilesLocationInfo>;
      chooseProfilesLocation: () => Promise<
        { ok: boolean; canceled?: boolean; selectedPath?: string } & Partial<ProfilesLocationInfo>
      >;
      migrateProfilesLocation: (payload: {
        path: string;
        mode?: "migrate" | "point-only";
      }) => Promise<{ ok: boolean; error?: string; moved?: boolean } & Partial<ProfilesLocationInfo>>;
      applySuggestedProfilesLocation: () => Promise<
        { ok: boolean; error?: string; moved?: boolean } & Partial<ProfilesLocationInfo>
      >;
      getProfileExtensionsEnabled: () => Promise<{ ok: boolean; enabled: boolean }>;
      setProfileExtensionsEnabled: (payload: { enabled: boolean }) => Promise<{ ok: boolean; enabled: boolean }>;
      getExtensionToggles: () => Promise<{ ok: boolean; toggles: ExtensionToggles }>;
      setExtensionToggles: (payload: { toggles: Partial<ExtensionToggles> }) => Promise<{ ok: boolean; toggles: ExtensionToggles }>;
      listLaunchPerf: (payload?: { limit?: number }) => Promise<{ ok: boolean; entries: LaunchPerfEntry[] }>;
      clearLaunchPerf: () => Promise<{ ok: boolean }>;
      fetchLaunchBenchBaseline: () => Promise<{ ok: boolean; baseline: LaunchBenchBaseline | null }>;
      purgeLegacyIdentityToolbar: () => Promise<{ ok: boolean; profiles?: number; removed?: number; prefsCleaned?: number; error?: string }>;
      checkProfileProxy?: (payload: {
        proxy: string;
        rotateVpn?: boolean;
        timeoutMs?: number;
        profileId?: string;
        profileName?: string;
        manualCheck?: boolean;
      }) => Promise<{
        ok: boolean;
        health?: {
          alive: boolean;
          exitIp?: string;
          countryCode?: string;
          timezone?: string;
          latencyMs?: number;
          source?: string;
          localProxyUrl?: string;
          reason?: string;
        };
        geoSync?: {
          synced?: boolean;
          summary?: string;
        } | null;
        error?: string;
      }>;
      fetchCookieBridgeStatus: () => Promise<{ ok: boolean; status: CookieBridgeStatus }>;
      setCookieBridgeSource: (payload: { mode: "store" | "workspace" }) => Promise<{ ok: boolean; status?: CookieBridgeStatus; error?: string }>;
      fetchOperatorExtensionStatus?: () => Promise<{ ok: boolean; status?: OperatorExtensionStatus; error?: string }>;
      reloadOperatorExtension?: () => Promise<{ ok: boolean; status?: OperatorExtensionStatus; error?: string }>;
      reloadOpenProfilesExtensions?: () => Promise<ReloadOpenProfilesExtensionsResult & { error?: string }>;
      purgeBrokenExtensionPrefs: () => Promise<{ ok: boolean; profiles?: number; removed?: number; prefsCleaned?: number; error?: string }>;
      fetchExtensionsStatus: () => Promise<{ ok: boolean; status: ExtensionsStatus }>;
      fetchExtensionIcon: (payload: { storeId: string; size?: number }) => Promise<{ ok: boolean; storeId: string; iconDataUri?: string | null }>;
      installStoreExtension: (payload: {
        storeId?: string;
        storeIdOrUrl?: string;
        url?: string;
        profileIds?: string[];
        force?: boolean;
        cacheOnly?: boolean;
      }) => Promise<{ ok: boolean; result?: InstallStoreExtensionResult; error?: string }>;
      pickUnpackedExtensionFolder: () => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
      installUnpackedExtension: (payload: {
        path?: string;
        sourceDir?: string;
        profileIds?: string[];
      }) => Promise<{ ok: boolean; result?: InstallUnpackedExtensionResult; error?: string }>;
      removeCachedExtensions: (payload: {
        items: CachedExtensionRef[];
      }) => Promise<{ ok: boolean; result?: RemoveCachedExtensionsResult; error?: string }>;
      fetchStoreExtensionUpdateCheck: () => Promise<{
        ok: boolean;
        check?: StoreExtensionUpdateCheck;
        error?: string;
      }>;
      onStoreExtensionUpdateCheck: (handler: (check: StoreExtensionUpdateCheck) => void) => () => void;
      onProfileSession: (
        handler: (payload: { profile: StealthProfile; event: string }) => void
      ) => () => void;
      getUpdateStatus?: () => Promise<StealthUpdateStatus>;
      checkForUpdates?: () => Promise<StealthUpdateStatus>;
      downloadUpdate?: () => Promise<StealthUpdateStatus>;
      installUpdate?: () => Promise<StealthUpdateStatus>;
      onUpdateStatus?: (handler: (status: StealthUpdateStatus) => void) => () => void;
    };
    routerApi?: {
      loadLocalConfig: <T>() => Promise<T>;
      request: <T>(payload: unknown) => Promise<T>;
    };
  }
}

export {};
