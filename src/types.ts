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
  /** Profile chrome extension — omnibar badge. */
  showProfileBadge: boolean;
  /** Auto group tabs under profile name. */
  profileTabGroups: boolean;
  /** Chrome tab group color override (empty = auto from profile id). */
  tabGroupColor: string;
  status: ProfileStatus;
  /** Unix ms — last successful browser launch. */
  lastOpenedAt?: number;
  createdAt: string;
  updatedAt: string;
} & DeviceConfig;

export type ProfileRow = StealthProfile;

export type RunLogEntry = {
  level: "info" | "success" | "error";
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

export type EngineHealth = {
  ok: boolean;
  installed?: boolean;
  error?: string;
  info?: Record<string, unknown>;
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

declare global {
  interface Window {
    stealthApi: {
      engineHealth: () => Promise<EngineHealth>;
      updateBinary: () => Promise<{ ok: boolean; info?: Record<string, unknown> }>;
      listProfiles: () => Promise<{ ok: boolean; profiles: StealthProfile[]; groups: StealthGroup[] }>;
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
        showProfileBadge?: boolean;
        profileTabGroups?: boolean;
        tabGroupColor?: string;
      } & Partial<DeviceConfig>) => Promise<{ ok: boolean; profile: StealthProfile }>;
      updateProfile: (payload: Partial<StealthProfile> & { id: string }) => Promise<{ ok: boolean; profile: StealthProfile }>;
      bulkUpdateStartupUrl: (payload: { ids: string[]; startupUrl: string }) => Promise<{ ok: boolean; count: number }>;
      deleteProfile: (payload: { id: string }) => Promise<{ ok: boolean }>;
      deleteProfiles: (payload: { ids: string[] }) => Promise<{ ok: boolean; count: number }>;
      launchProfile: (payload: { id: string }) => Promise<{ ok: boolean; profile: StealthProfile }>;
      closeProfile: (payload: { id: string }) => Promise<{ ok: boolean; profile: StealthProfile }>;
      focusProfile: (payload: { id: string }) => Promise<{ ok: boolean; reason?: string }>;
      createGroup: (payload: { name: string }) => Promise<{ ok: boolean; group: StealthGroup }>;
      updateGroup: (payload: { id: string; name: string }) => Promise<{ ok: boolean; group: StealthGroup }>;
      deleteGroup: (payload: { id: string }) => Promise<{ ok: boolean }>;
      exportProfiles: () => Promise<{ ok: boolean; bundle: unknown }>;
      importProfiles: (payload: { bundle: unknown; merge?: boolean }) => Promise<{ ok: boolean; imported: number }>;
      listRuns: (payload?: { limit?: number }) => Promise<{ ok: boolean; runs: RunHistoryItem[] }>;
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
      appInfo: () => Promise<{ name: string; version: string; isPackaged: boolean; userDataPath: string }>;
      openDataFolder: () => Promise<{ ok: boolean; path: string }>;
      getIdentityDebug: () => Promise<{ ok: boolean; enabled: boolean }>;
      setIdentityDebug: (payload: { enabled: boolean }) => Promise<{ ok: boolean; enabled: boolean }>;
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
