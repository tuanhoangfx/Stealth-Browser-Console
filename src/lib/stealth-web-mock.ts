/**
 * In-memory Stealth API for Vite-only dev (no Electron preload).
 * SSOT channel list: electron/stealth-api-channels.json → stealth-api-channel-list.ts
 */
import type {
  BulkCreateProfilesResult,
  EngineHealth,
  RunHistoryItem,
  StealthGroup,
  StealthProfile,
  StealthUpdateStatus,
} from "../types";
import { DEFAULT_DEVICE, deviceConfigFromProfile } from "./device-presets";
import { normalizeStartupUrl, resolveStartupUrlSave } from "./startup-url";
import { matchesProfileDirectorySearch } from "../features/profiles/profile-directory-search";
import { assertStealthApiChannelCoverage, buildStealthApiStubLayer } from "./stealth-api-mock-stubs";

const DEMO_SEED = 424242;
const SMOKE_PAGER_MIN_PROFILES = 21;
const groups: StealthGroup[] = [{ id: "default", name: "Default", sortOrder: 0 }];
const profiles: StealthProfile[] = [];
const runs: RunHistoryItem[] = [];

function nowIso() {
  return new Date().toISOString();
}

function isSmokePagerSeedRequested() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("stealthSmokePager") === "1";
}

function ensureSmokePagerCatalog() {
  if (!isSmokePagerSeedRequested()) return;
  seedIfEmpty();
  if (profiles.length >= SMOKE_PAGER_MIN_PROFILES) return;
  const start = 99001;
  for (let i = profiles.length; i < SMOKE_PAGER_MIN_PROFILES; i += 1) {
    createMockProfile({
      name: String(start + i - 1).padStart(5, "0"),
      note: "smoke pager seed — web mock",
    });
  }
}

function seedIfEmpty() {
  if (profiles.length > 0) return;
  const id = crypto.randomUUID();
  const ts = nowIso();
  profiles.push({
    id,
    name: "Stealth Demo (web)",
    groupId: "default",
    groupName: "Default",
    proxy: "",
    fingerprintSeed: DEMO_SEED,
    note: "Web dev mock — run pnpm dev for Electron + CloakBrowser.",
    status: "closed",
    startupUrl: "",
    ...DEFAULT_DEVICE,
    createdAt: ts,
    updatedAt: ts,
  });
}

seedIfEmpty();

function findProfile(id: string) {
  return profiles.find((row) => row.id === id) ?? null;
}

function createMockProfile(input: Partial<StealthProfile> & { name: string }) {
  const id = crypto.randomUUID();
  const ts = nowIso();
  const group = groups.find((g) => g.id === (input.groupId || "default"));
  const profile: StealthProfile = {
    id,
    name: String(input.name || "Profile").trim() || "Profile",
    groupId: group?.id ?? "default",
    groupName: group?.name ?? "Default",
    proxy: String(input.proxy || ""),
    fingerprintSeed: Number.isFinite(Number(input.fingerprintSeed))
      ? Math.floor(Number(input.fingerprintSeed))
      : DEMO_SEED + profiles.length + 1,
    note: String(input.note || ""),
    status: "closed",
    startupUrl: normalizeStartupUrl(String(input.startupUrl || "")),
    ...deviceConfigFromProfile(input),
    createdAt: ts,
    updatedAt: ts,
  };
  profiles.unshift(profile);
  return profile;
}

function summarizeBulkResult(
  requested: number,
  createdNames: string[],
  skippedNames: string[],
  duplicateNames: string[],
): BulkCreateProfilesResult {
  return {
    requested,
    created: createdNames.length,
    skippedExisting: skippedNames.length,
    duplicateInput: duplicateNames.length,
    createdNames,
    skippedNames,
    duplicateNames,
  };
}

function buildCatalogStats() {
  seedIfEmpty();
  ensureSmokePagerCatalog();
  const total = profiles.length;
  const groupCounts: Record<string, number> = {};
  const stats = { total, closed: 0, opening: 0, running: 0, failed: 0, groupCounts };
  for (const p of profiles) {
    if (p.status === "closed") stats.closed += 1;
    else if (p.status === "opening") stats.opening += 1;
    else if (p.status === "running") stats.running += 1;
    else if (p.status === "failed") stats.failed += 1;
    const gid = String(p.groupId ?? "");
    if (gid) groupCounts[gid] = (groupCounts[gid] ?? 0) + 1;
  }
  return stats;
}

function mockUpdateStatus(partial: Partial<StealthUpdateStatus> = {}): StealthUpdateStatus {
  return {
    state: "dev",
    runtime: "dev",
    supportsUpdates: false,
    currentVersion: "web-mock",
    message: "Web dev mock — packaged app only.",
    updateVersion: "",
    releaseName: "",
    releaseDate: "",
    progress: null,
    ...partial,
  };
}

function buildProfileOverrides(): Partial<NonNullable<typeof window.stealthApi>> {
  return {
    engineHealth: async (): Promise<EngineHealth> => ({
      ok: false,
      installed: false,
      error: "Web dev mock — run pnpm dev (Electron) for CloakBrowser engine.",
      info: { version: "web-mock", path: "" },
    }),
    updateBinary: async () => ({ ok: false, error: "Not available in web mock." }),
    listProfiles: async () => {
      seedIfEmpty();
      ensureSmokePagerCatalog();
      return { ok: true, profiles: [...profiles], groups: [...groups] };
    },
    profileBootstrap: async () => {
      seedIfEmpty();
      return { ok: true, groups: [...groups], stats: buildCatalogStats() };
    },
    listProfilesPage: async (input: {
      search?: string;
      groupIds?: string[];
      statuses?: StealthProfile["status"][];
      limit?: number;
      offset?: number;
    } = {}) => {
      seedIfEmpty();
      ensureSmokePagerCatalog();
      const term = String(input.search || "").trim();
      const groupIds = Array.isArray(input.groupIds) ? input.groupIds.map(String) : [];
      const statuses = Array.isArray(input.statuses) ? input.statuses.map(String) : [];
      let rows = [...profiles];
      if (groupIds.length) rows = rows.filter((p) => groupIds.includes(String(p.groupId ?? "")));
      if (statuses.length) rows = rows.filter((p) => statuses.includes(p.status));
      if (term) rows = rows.filter((p) => matchesProfileDirectorySearch(p, term));
      const limit = Math.min(50_000, Math.max(1, Number(input.limit) || 100));
      const offset = Math.max(0, Number(input.offset) || 0);
      return { ok: true, profiles: rows.slice(offset, offset + limit), total: rows.length, limit, offset };
    },
    catalogStats: async () => ({ ok: true, stats: buildCatalogStats() }),
    createProfile: async (input) => ({ ok: true, profile: createMockProfile(input) }),
    createProfilesBulkByNames: async (payload) => {
      const lines = Array.isArray(payload.names)
        ? payload.names.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      const exact = new Set(profiles.map((profile) => String(profile.name || "").trim()));
      const createdNames: string[] = [];
      const skippedNames: string[] = [];
      const duplicateNames: string[] = [];
      const seen = new Set<string>();
      for (const name of lines) {
        if (seen.has(name)) {
          duplicateNames.push(name);
          continue;
        }
        seen.add(name);
        if (exact.has(name)) {
          skippedNames.push(name);
          continue;
        }
        createMockProfile({ ...payload, name });
        exact.add(name);
        createdNames.push(name);
      }
      return { ok: true, ...summarizeBulkResult(lines.length, createdNames, skippedNames, duplicateNames) };
    },
    createProfilesBulkByRange: async (payload) => {
      const start = Number(payload.start) || 0;
      const end = Number(payload.end) || 0;
      const pad = Math.min(8, Math.max(1, Number(payload.pad) || 4));
      const exact = new Set(profiles.map((profile) => String(profile.name || "").trim()));
      const createdNames: string[] = [];
      const skippedNames: string[] = [];
      for (let value = start; value <= end; value += 1) {
        const name = String(value).padStart(pad, "0");
        if (exact.has(name)) {
          skippedNames.push(name);
          continue;
        }
        createMockProfile({ ...payload, name });
        exact.add(name);
        createdNames.push(name);
      }
      return { ok: true, ...summarizeBulkResult(Math.max(0, end - start + 1), createdNames, skippedNames, []) };
    },
    updateProfile: async (input) => {
      const existing = findProfile(String(input.id));
      if (!existing) throw new Error("Profile not found.");
      Object.assign(existing, input, { updatedAt: nowIso() });
      return { ok: true, profile: existing };
    },
    bulkUpdateStartupUrl: async (payload) => {
      const ids = (payload.ids || []).map(String);
      const normalized = resolveStartupUrlSave(String(payload.startupUrl ?? ""), "");
      for (const id of ids) {
        const existing = findProfile(id);
        if (existing) existing.startupUrl = normalized;
      }
      return { ok: true, count: ids.length };
    },
    deleteProfile: async (payload) => {
      const idx = profiles.findIndex((row) => row.id === String(payload.id));
      const name = idx >= 0 ? profiles[idx]!.name : String(payload.id);
      if (idx >= 0) profiles.splice(idx, 1);
      return { ok: true, count: 1, names: [name], storagePurged: 1 };
    },
    deleteProfiles: async (payload) => {
      const ids = new Set((payload.ids || []).map(String));
      const names: string[] = [];
      for (let i = profiles.length - 1; i >= 0; i -= 1) {
        if (ids.has(profiles[i]!.id)) {
          names.push(profiles[i]!.name);
          profiles.splice(i, 1);
        }
      }
      return { ok: true, count: names.length, names, storagePurged: names.length };
    },
    closeProfile: async (payload) => {
      const profile = findProfile(String(payload.id));
      if (!profile) throw new Error("Profile not found.");
      profile.status = "closed";
      profile.updatedAt = nowIso();
      return { ok: true, profile };
    },
    closeAllProfiles: async () => {
      const ids: string[] = [];
      for (const profile of profiles) {
        if (profile.status === "running" || profile.status === "opening") {
          profile.status = "closed";
          profile.updatedAt = nowIso();
          ids.push(profile.id);
        }
      }
      return { ok: true, count: ids.length, ids };
    },
    listRunningProfiles: async () => ({
      ok: true,
      sessions: profiles
        .filter((profile) => profile.status === "running" || profile.status === "opening")
        .map((profile) => ({ id: profile.id, name: profile.name, headless: profile.headless })),
    }),
    focusProfile: async (payload) => {
      const profile = findProfile(String(payload.id));
      if (!profile) throw new Error("Profile not found.");
      if (profile.status !== "running") return { ok: false, reason: "not-running" };
      return { ok: true };
    },
    createGroup: async (payload) => {
      const group: StealthGroup = {
        id: crypto.randomUUID(),
        name: String(payload.name || "Group").trim() || "Group",
        sortOrder: groups.length,
      };
      groups.push(group);
      return { ok: true, group };
    },
    updateGroup: async (payload) => {
      const group = groups.find((g) => g.id === String(payload.id));
      if (!group) throw new Error("Group not found.");
      group.name = String(payload.name || group.name).trim() || group.name;
      return { ok: true, group };
    },
    deleteGroup: async (payload) => {
      const idx = groups.findIndex((g) => g.id === String(payload.id));
      if (idx >= 0) groups.splice(idx, 1);
      return { ok: true };
    },
    exportProfiles: async () => ({ ok: true, bundle: { profiles: [...profiles], groups: [...groups] } }),
    importProfiles: async () => ({ ok: true, imported: 0, updated: 0, created: 0 }),
    backupProfilesState: async () => ({ ok: true, canceled: true }),
    restoreProfilesState: async () => ({ ok: true, canceled: true }),
    profileStorageStats: async (payload) => ({
      ok: true,
      stats: (payload.profileIds || []).map((id) => ({
        id: String(id),
        folderExists: false,
        folderBytes: null,
      })),
    }),
    profileBackupMeta: async (payload) => ({
      ok: true,
      meta: (payload.profileIds || []).map((id) => ({ id: String(id) })),
    }),
    listRuns: async (payload) => ({
      ok: true,
      runs: runs.slice(0, Number(payload?.limit) || 100),
    }),
    listProfileEvents: async () => ({ ok: true, events: [] }),
    fetchHostMetrics: async () => ({
      ok: true,
      cpuPercent: 24,
      cpuReady: true,
      ramUsedBytes: 18 * 1024 ** 3,
      ramTotalBytes: 32 * 1024 ** 3,
      ramPercent: 56.25,
      sampledAt: Date.now(),
    }),
    appInfo: async () => ({
      name: "Stealth Browser Console (web mock)",
      version: "0.4.1",
      isPackaged: false,
      userDataPath: "(browser)",
      profilesPath: "(browser)/profiles",
      profilesLocation: {
        userDataRoot: "(browser)",
        profilesRoot: "(browser)/profiles",
        defaultProfilesRoot: "(browser)/profiles",
        suggestedProfilesRoot: "(browser)/profiles",
        usingCustom: false,
        promptPending: false,
        source: "web-mock",
        profileDirCount: 0,
        configPath: "",
      },
      profileExtensionsEnabled: true,
      extensionToggles: { e0001: true, surfshark: false, webStore: false },
    }),
    openDataFolder: async () => ({ ok: false, path: "" }),
    openProfilesFolder: async () => ({ ok: false, path: "" }),
    getProfilesLocation: async () => ({
      ok: true,
      userDataRoot: "(browser)",
      profilesRoot: "(browser)/profiles",
      defaultProfilesRoot: "(browser)/profiles",
      suggestedProfilesRoot: "(browser)/profiles",
      usingCustom: false,
      promptPending: false,
      source: "web-mock",
      profileDirCount: 0,
      configPath: "",
    }),
    dismissProfilesLocationPrompt: async () => ({
      ok: true,
      userDataRoot: "(browser)",
      profilesRoot: "(browser)/profiles",
      defaultProfilesRoot: "(browser)/profiles",
      suggestedProfilesRoot: "(browser)/profiles",
      usingCustom: false,
      promptPending: false,
      source: "web-mock",
      profileDirCount: 0,
      configPath: "",
    }),
    chooseProfilesLocation: async () => ({ ok: false, canceled: true }),
    migrateProfilesLocation: async () => ({ ok: false, error: "web mock" }),
    applySuggestedProfilesLocation: async () => ({ ok: false, error: "web mock" }),
    getProfileExtensionsEnabled: async () => ({ ok: true, enabled: true }),
    setProfileExtensionsEnabled: async (payload) => ({ ok: true, enabled: Boolean(payload?.enabled) }),
    getExtensionToggles: async () => ({
      ok: true,
      toggles: { e0001: true, surfshark: false, webStore: false },
    }),
    setExtensionToggles: async (payload) => ({
      ok: true,
      toggles: {
        e0001: payload?.toggles?.e0001 !== false,
        surfshark: payload?.toggles?.surfshark === true,
        webStore: payload?.toggles?.webStore === true,
      },
    }),
    listLaunchPerf: async () => ({ ok: true, entries: [] }),
    clearLaunchPerf: async () => ({ ok: true }),
    fetchLaunchBenchBaseline: async () => ({ ok: true, baseline: null }),
    purgeLegacyIdentityToolbar: async () => ({ ok: true, profiles: 0, removed: 0, prefsCleaned: 0 }),
    fetchCookieBridgeStatus: async () => ({
      ok: true,
      status: {
        enabled: true,
        profilesExtensionsEnabled: true,
        extensionToggles: { e0001: true, surfshark: false, webStore: false },
        productCode: "E0001",
        name: "E0001 Cookie Bridge",
        storeId: "kaaadageakdandpobcofplmfbjfjabdk",
        resolvedPath: null,
        unpackedId: null,
        source: "missing" as const,
        manifestOk: false,
        manifestName: "E0001 Cookie Bridge",
        workspacePath: null,
        cachePath: "",
        env: { STEALTH_COOKIE_BRIDGE: "1", STEALTH_COOKIE_BRIDGE_LOCAL: "0" },
      },
    }),
    purgeBrokenExtensionPrefs: async () => ({ ok: true, profiles: 0, removed: 0, prefsCleaned: 0 }),
    fetchExtensionsStatus: async () => ({
      ok: true,
      status: {
        launchMode: "native",
        nativeMode: true,
        cached: [],
        webStoreInstallHint: "Web mock — install unavailable in dev:web.",
      },
    }),
    installStoreExtension: async () => ({
      ok: false,
      error: "Store install requires Electron (dev:web mock).",
    }),
    pickUnpackedExtensionFolder: async () => ({ ok: false, canceled: true }),
    installUnpackedExtension: async () => ({
      ok: false,
      error: "Unpacked install requires Electron (dev:web mock).",
    }),
    removeCachedExtensions: async () => ({
      ok: false,
      error: "Delete cache requires Electron (dev:web mock).",
    }),
    fetchStoreExtensionUpdateCheck: async () => ({
      ok: true,
      check: { checking: false, checkedAt: null, results: [] },
    }),
    onStoreExtensionUpdateCheck: () => () => undefined,
    fetchExtensionIcon: async (payload) => ({
      ok: false,
      storeId: String(payload?.storeId ?? ""),
      iconDataUri: null,
    }),
    getUpdateStatus: async () => mockUpdateStatus(),
    checkForUpdates: async () => mockUpdateStatus({ state: "latest" }),
    downloadUpdate: async () => mockUpdateStatus({ state: "error", message: "Web mock" }),
    installUpdate: async () => mockUpdateStatus({ state: "error", message: "Web mock" }),
  };
}

export function createStealthWebMockApi(): NonNullable<typeof window.stealthApi> {
  const api = {
    ...buildStealthApiStubLayer(),
    ...buildProfileOverrides(),
    setVaultUserScope: async (payload?: { email?: string | null }) => ({
      ok: true,
      hubEmail: payload?.email ?? null,
      scopeEmail: payload?.email || "czpgo@outlook.com",
      scopeError: null,
      devScope: true,
    }),
    getVaultUserScope: async () => ({
      ok: true,
      hubEmail: null,
      scopeEmail: "czpgo@outlook.com",
      scopeError: null,
      devScope: true,
    }),
  } as NonNullable<typeof window.stealthApi>;
  assertStealthApiChannelCoverage(api);
  return api;
}

const STEALTH_BRIDGE_GAP_KEYS = ["closeAllProfiles", "listRunningProfiles"] as const;

export function installStealthWebMock() {
  if (typeof window === "undefined") return;
  if (typeof window.stealthApi?.closeProfile === "function") {
    return;
  }
  const mock = createStealthWebMockApi();
  if (!("stealthApi" in window) || !window.stealthApi) {
    window.stealthApi = mock;
    return;
  }
  const live = window.stealthApi as Record<string, unknown>;
  const mockRecord = mock as Record<string, unknown>;
  for (const [key, value] of Object.entries(mockRecord)) {
    if (typeof value === "function" && typeof live[key] !== "function") {
      live[key] = value;
    }
  }
  for (const key of STEALTH_BRIDGE_GAP_KEYS) {
    if (typeof live[key] !== "function" && typeof mockRecord[key] === "function") {
      live[key] = mockRecord[key];
    }
  }
}
