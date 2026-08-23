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

export type ProfileStatus = "closed" | "opening" | "running" | "failed";

export type StealthGroup = {
  id: string;
  name: string;
  sortOrder?: number;
};

export type ProfileCatalogStats = {
  total: number;
  closed: number;
  opening: number;
  running: number;
  failed: number;
  groupCounts: Record<string, number>;
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
  surfshark: boolean;
  webStore: boolean;
};

/** Per-profile override; omit key = follow app Settings → Extensions. */
export type ProfileExtensionOverrides = Partial<Record<keyof ExtensionToggles, boolean>>;

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
  manifestOk: boolean;
  manifestName: string;
  manifestVersion?: string | null;
  workspacePath: string | null;
  cachePath: string;
  env: { STEALTH_COOKIE_BRIDGE: string; STEALTH_COOKIE_BRIDGE_LOCAL: string };
};

export type CachedStoreExtension = {
  kind: "store" | "local";
  storeId: string | null;
  localKey?: string;
  unpackedPath: string;
  name: string;
  version?: string;
  iconDataUri?: string;
  /** ISO timestamp — manifest mtime on disk. */
  updatedAt?: string;
};

export type ExtensionsStatus = {
  launchMode: "native" | "managed";
  nativeMode: boolean;
  cached: CachedStoreExtension[];
  webStoreInstallHint: string;
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
      bulkUpdateStartupUrl: (payload: { ids: string[]; startupUrl: string }) => Promise<{ ok: boolean; count: number }>;
      deleteProfile: (payload: { id: string }) => Promise<{
        ok: boolean;
        count?: number;
        names?: string[];
        storagePurged?: number;
      }>;
      deleteProfiles: (payload: { ids: string[] }) => Promise<{
        ok: boolean;
        count: number;
        names?: string[];
        storagePurged?: number;
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
      fetchCookieBridgeStatus: () => Promise<{ ok: boolean; status: CookieBridgeStatus }>;
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
