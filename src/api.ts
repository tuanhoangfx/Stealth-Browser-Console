import type {
  BulkCreateProfileDefaults,
  BulkCreateProfilesResult,
  EngineHealth,
  HostMetrics,
  OpenUrlResult,
  ProfileRow,
  ProfileCatalogStats,
  RunHistoryItem,
  RunLogEntry,
  StealthGroup,
  StealthProfile,
  CookieBridgeStatus,
  OperatorExtensionStatus,
  ExtensionToggles,
  ExtensionsStatus,
  InstallStoreExtensionResult,
  InstallUnpackedExtensionResult,
  CachedExtensionRef,
  RemoveCachedExtensionsResult,
  StoreExtensionUpdateCheck,
  ProfileStorageStat,
  ProfileBackupMeta,
  ProfileCookieGuardStatus,
  ProfileCookieGuardRestoreResult,
  ProfileP0020ReconcileResult,
  ProfileP0020BulkReconcileResult,
  ProfileMobileVaultStatus,
  ProfileMobileVaultActionResult,
} from "./types";
import { installStealthWebMock } from "./lib/stealth-web-mock";
import { patchStealthElectronBridgeGaps } from "./lib/stealth-bridge-patch";

// Vite dev, and a renderer with no preload (release UI smoke loads dist/index.html
// in a bare BrowserWindow). Packaged Electron injects stealthApi before this module.
if (import.meta.env.DEV || (typeof window !== "undefined" && !window.stealthApi)) {
  installStealthWebMock();
}
patchStealthElectronBridgeGaps();

function api() {
  if (typeof window === "undefined" || !window.stealthApi) {
    throw new Error("Stealth API is only available in the Electron shell.");
  }
  return window.stealthApi;
}

export function isStealthDesktop(): boolean {
  return typeof window !== "undefined" && typeof window.stealthApi?.listProfiles === "function";
}

export async function fetchEngineHealth(): Promise<EngineHealth> {
  return api().engineHealth();
}

export async function fetchHostMetrics(): Promise<HostMetrics> {
  const data = await api().fetchHostMetrics();
  if (!data?.ok) {
    throw new Error(data?.error || "Host metrics unavailable.");
  }
  return data;
}

export async function updateEngineBinary() {
  return api().updateBinary();
}

export async function fetchProfileBootstrap(): Promise<{ groups: StealthGroup[]; stats: ProfileCatalogStats }> {
  const data = await api().profileBootstrap();
  return { groups: data.groups, stats: data.stats };
}

export async function fetchProfilesAndGroups(): Promise<{ profiles: StealthProfile[]; groups: StealthGroup[] }> {
  const data = await api().listProfiles();
  return { profiles: data.profiles, groups: data.groups };
}

export async function listProfiles(): Promise<StealthProfile[]> {
  const { profiles } = await fetchProfilesAndGroups();
  return profiles;
}

export async function fetchProfileCatalogStats(): Promise<ProfileCatalogStats> {
  const data = await api().catalogStats();
  return data.stats;
}

export async function fetchProfileDirectoryPage(input: {
  search?: string;
  groupIds?: string[];
  statuses?: ProfileRow["status"][];
  proxyModes?: import("./types").ProfileProxyFilterMode[];
  limit?: number;
  offset?: number;
  sort?: string;
  dir?: "asc" | "desc";
}): Promise<{ profiles: StealthProfile[]; total: number; limit: number; offset: number }> {
  const data = await api().listProfilesPage(input);
  return {
    profiles: data.profiles,
    total: data.total,
    limit: data.limit,
    offset: data.offset,
  };
}

export async function createProfile(input: {
  name: string;
  groupId?: string;
  proxy?: string;
  staticIp?: boolean;
  note?: string;
  fingerprintSeed?: number;
  startupUrl?: string;
} & Partial<import("./types").DeviceConfig>) {
  const data = await api().createProfile(input);
  return data.profile;
}

export async function createProfilesBulkByNames(input: {
  names: string[];
} & BulkCreateProfileDefaults): Promise<BulkCreateProfilesResult> {
  const data = await api().createProfilesBulkByNames(input);
  return data;
}

export async function createProfilesBulkByRange(input: {
  start: number;
  end: number;
  pad?: number;
} & BulkCreateProfileDefaults): Promise<BulkCreateProfilesResult> {
  const data = await api().createProfilesBulkByRange(input);
  return data;
}

export async function updateProfile(input: Partial<StealthProfile> & { id: string }) {
  const data = await api().updateProfile(input);
  return data.profile;
}

export async function bulkUpdateStartupUrl(ids: string[], startupUrl: string) {
  return api().bulkUpdateStartupUrl({ ids, startupUrl });
}

export async function bulkUpdateProfiles(
  ids: string[],
  patch: import("./types").BulkUpdateProfilesPatch,
): Promise<{ count: number; profiles?: Array<StealthProfile & { lastChangeSummary?: string }> }> {
  const bridge = api();
  if (typeof bridge.bulkUpdateProfiles === "function") {
    const res = await bridge.bulkUpdateProfiles({ ids, patch });
    return { count: res.count ?? ids.length, profiles: res.profiles ?? [] };
  }
  const { extensionOverrideDelta: _delta, ...restPatch } = patch;
  const updated: Array<StealthProfile & { lastChangeSummary?: string }> = [];
  for (const id of ids) {
    const p = await updateProfile({ ...restPatch, id });
    if (p) updated.push(p as StealthProfile & { lastChangeSummary?: string });
  }
  return { count: ids.length, profiles: updated };
}

export async function cloneProfilesBatch(
  sourceIds: string[],
  count = 1,
  overrides?: Partial<StealthProfile>,
): Promise<{
  created: number;
  createdCodes: string[];
  profiles?: Array<StealthProfile & { lastChangeSummary?: string }>;
}> {
  const bridge = api();
  if (typeof bridge.cloneProfilesBatch === "function") {
    const res = await bridge.cloneProfilesBatch({ sourceIds, count, overrides });
    return {
      created: res.created ?? 0,
      createdCodes: res.createdCodes ?? [],
      profiles: res.profiles ?? [],
    };
  }
  return { created: 0, createdCodes: [], profiles: [] };
}

export async function deleteProfiles(ids: string[]) {
  return api().deleteProfiles({ ids });
}

export async function createGroup(name: string) {
  const data = await api().createGroup({ name });
  return data.group;
}

export async function updateGroup(id: string, name: string) {
  const data = await api().updateGroup({ id, name });
  return data.group;
}

export async function deleteGroup(id: string) {
  return api().deleteGroup({ id });
}

export async function exportProfilesBundle() {
  const data = await api().exportProfiles();
  return data.bundle;
}

export async function importProfilesBundle(bundle: unknown, merge = true, matchBy: "name" | "id" = "name") {
  return api().importProfiles({ bundle, merge, matchBy });
}

export async function backupProfilesState(profileIds?: string[]) {
  return api().backupProfilesState(profileIds?.length ? { profileIds } : undefined);
}

export async function restoreProfilesState(options?: { restoreIntoProfileId?: string }) {
  return api().restoreProfilesState(options);
}

export async function fetchProfileBackupDirectoryStatus(
  profileIds: string[],
): Promise<{ meta: ProfileBackupMeta[]; stats: ProfileStorageStat[] }> {
  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/backup-directory-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileIds }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        ok?: boolean;
        meta?: ProfileBackupMeta[];
        stats?: ProfileStorageStat[];
      };
      if (data?.ok && Array.isArray(data.meta)) {
        const stats: ProfileStorageStat[] = Array.isArray(data.stats)
          ? data.stats
          : data.meta.map((m) => ({
              id: m.id,
              folderExists: Boolean(m.folderExists),
              folderBytes: typeof m.folderBytes === "number" ? m.folderBytes : 0,
            }));
        return { meta: data.meta, stats };
      }
    } catch {
      // try next
    }
  }
  const [metaData, statsData] = await Promise.all([
    api().profileBackupMeta({ profileIds }),
    api().profileStorageStats({ profileIds, includeBytes: true }),
  ]);
  return { meta: metaData.meta, stats: statsData.stats };
}

export async function snapshotProfilesNativeSessionBulk(
  profileIds: string[],
  force = true,
): Promise<{
  ok: boolean;
  snapshottedCount: number;
  skippedCount: number;
  meta: ProfileBackupMeta[];
}> {
  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/backup-directory-snapshot-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileIds, force }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        ok?: boolean;
        snapshottedCount?: number;
        skippedCount?: number;
        meta?: ProfileBackupMeta[];
        error?: string;
      };
      if (data?.ok) {
        return {
          ok: true,
          snapshottedCount: data.snapshottedCount ?? 0,
          skippedCount: data.skippedCount ?? 0,
          meta: data.meta ?? [],
        };
      }
    } catch {
      // try next
    }
  }
  throw new Error("Native session bulk snapshot API unavailable.");
}

export async function fetchProfileStorageStats(
  profileIds: string[],
  options?: { includeBytes?: boolean },
): Promise<ProfileStorageStat[]> {
  try {
    const { stats } = await fetchProfileBackupDirectoryStatus(profileIds);
    return stats;
  } catch {
    const data = await api().profileStorageStats({
      profileIds,
      includeBytes: options?.includeBytes,
    });
    return data.stats;
  }
}

export async function fetchProfileBackupMeta(profileIds: string[]): Promise<ProfileBackupMeta[]> {
  try {
    const { meta } = await fetchProfileBackupDirectoryStatus(profileIds);
    return meta;
  } catch {
    const data = await api().profileBackupMeta({ profileIds });
    return data.meta;
  }
}

export type LaunchProfileResult = {
  profile: StealthProfile;
  headless?: boolean;
  agentSmoke?: boolean;
  focused?: boolean;
  logs?: RunLogEntry[];
};

export async function launchProfile(id: string, name?: string): Promise<LaunchProfileResult> {
  const data = await api().launchProfile({ id, name });
  return {
    profile: data.profile,
    headless: data.headless,
    agentSmoke: data.agentSmoke,
    focused: data.focused,
    logs: data.logs,
  };
}

export async function closeProfile(id: string, name?: string) {
  const data = await api().closeProfile({ id, name });
  return data.profile;
}

export async function boostWaitingProfile(idOrCode: string): Promise<{ ok: boolean; code?: string; error?: string }> {
  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/${encodeURIComponent(idOrCode)}/boost-waiting`, {
        method: "POST",
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { ok?: boolean; code?: string; error?: string };
      if (data.ok) return { ok: true, code: data.code };
    } catch {
      // try next port
    }
  }
  return { ok: false, error: "Unable to boost waiting profile priority." };
}

export async function closeAllRunningProfiles() {
  const viaHttp = await closeAllRunningViaHttp();
  if (viaHttp) return viaHttp;

  const bridge = api();
  const closeAll = bridge.closeAllProfiles;
  if (typeof closeAll === "function") {
    try {
      const data = await closeAll.call(bridge);
      return { count: data.count, ids: data.ids ?? [] };
    } catch {
      // fall through to per-profile close
    }
  }

  const listRunning = bridge.listRunningProfiles;
  if (typeof listRunning === "function") {
    const data = await listRunning.call(bridge);
    const sessions = data.sessions ?? [];
    for (const session of sessions) {
      await closeProfile(session.id, session.name);
    }
    return { count: sessions.length, ids: sessions.map((row) => row.id) };
  }

  throw new Error("Unable to close running profiles. Restart Stealth Browser Console (Ctrl+Shift+R).");
}

async function closeAllRunningViaHttp(): Promise<{ count: number; ids: string[] } | null> {
  for (const base of ["http://127.0.0.1:6004", "http://127.0.0.1:6003"]) {
    try {
      const res = await fetch(`${base}/api/sessions/close-all`, { method: "POST" });
      if (!res.ok) continue;
      const data = (await res.json()) as { ok?: boolean; count?: number; ids?: string[] };
      if (data.ok) return { count: data.count ?? 0, ids: data.ids ?? [] };
    } catch {
      // try next port
    }
  }

  for (const base of ["http://127.0.0.1:6004", "http://127.0.0.1:6003"]) {
    try {
      const listRes = await fetch(`${base}/api/sessions/running`);
      if (!listRes.ok) continue;
      const listed = (await listRes.json()) as {
        ok?: boolean;
        sessions?: Array<{ id: string; name?: string }>;
      };
      const sessions = listed.sessions ?? [];
      if (!sessions.length) return { count: 0, ids: [] };
      for (const session of sessions) {
        await fetch(`${base}/api/profiles/${encodeURIComponent(session.id)}/close`, { method: "POST" });
      }
      return { count: sessions.length, ids: sessions.map((row) => row.id) };
    } catch {
      // try next port
    }
  }

  return null;
}

export async function fetchRunningProfileSessions() {
  const bridge = api();
  if (typeof bridge.listRunningProfiles === "function") {
    const data = await bridge.listRunningProfiles();
    return data.sessions ?? [];
  }
  return [];
}

export async function runOpenUrl(input: {
  profileId: string;
  targetUrl: string;
  screenshot?: boolean;
  closeWhenDone?: boolean;
  workflowAction?: "open-url" | "google-form-ag-appeal";
  inspectMode?: boolean;
  steps?: import("./types").ScriptStep[];
  workflowId?: string;
}): Promise<OpenUrlResult> {
  return api().openUrl(input);
}

export async function fetchRunHistory(limit = 100): Promise<RunHistoryItem[]> {
  const data = await api().listRuns({ limit });
  return data.runs;
}

export async function fetchProfileEvents(profileId: string, limit = 200): Promise<import("./types").ProfileEvent[]> {
  const bridge = api();
  if (typeof bridge.listProfileEvents !== "function") return [];
  const data = await bridge.listProfileEvents({ profileId, limit });
  return data.events ?? [];
}

export async function fetchAppInfo() {
  return api().appInfo();
}

export async function openDataFolder() {
  return api().openDataFolder();
}

export async function openProfilesFolder() {
  return api().openProfilesFolder();
}

export async function fetchProfilesLocation() {
  return api().getProfilesLocation();
}

export async function dismissProfilesLocationPrompt() {
  return api().dismissProfilesLocationPrompt();
}

export async function chooseProfilesLocation() {
  return api().chooseProfilesLocation();
}

export async function migrateProfilesLocation(payload: { path: string; mode?: "migrate" | "point-only" }) {
  return api().migrateProfilesLocation(payload);
}

export async function applySuggestedProfilesLocation() {
  return api().applySuggestedProfilesLocation();
}

export async function fetchProfileExtensionsEnabled(): Promise<boolean> {
  const data = await api().getProfileExtensionsEnabled();
  if (!data.ok) throw new Error("Extension settings unavailable");
  return Boolean(data.enabled);
}

export async function setProfileExtensionsEnabled(enabled: boolean): Promise<boolean> {
  const data = await api().setProfileExtensionsEnabled({ enabled });
  if (!data.ok) throw new Error("Extension settings unavailable");
  return Boolean(data.enabled);
}

export async function fetchExtensionToggles(): Promise<ExtensionToggles> {
  const bridge = api();
  if (typeof bridge.getExtensionToggles === "function") {
    const data = await bridge.getExtensionToggles();
    if (!data.ok || !data.toggles) throw new Error("Extension settings unavailable");
    return data.toggles;
  }
  if (typeof bridge.getProfileExtensionsEnabled === "function") {
    const enabled = await fetchProfileExtensionsEnabled();
    return { e0001: enabled, e0002: enabled, surfshark: enabled, webStore: enabled };
  }
  throw new Error("Restart Stealth Browser Console (Electron) to load extension settings API.");
}

export async function setExtensionToggles(patch: Partial<ExtensionToggles>): Promise<ExtensionToggles> {
  const bridge = api();
  if (typeof bridge.setExtensionToggles !== "function") {
    throw new Error("Restart Stealth Browser Console (Electron) to load extension settings API.");
  }
  const data = await bridge.setExtensionToggles({ toggles: patch });
  if (!data.ok || !data.toggles) throw new Error("Extension settings unavailable");
  return data.toggles;
}

export async function fetchCookieBridgeStatus(): Promise<CookieBridgeStatus> {
  const data = await api().fetchCookieBridgeStatus();
  if (!data.ok || !data.status) throw new Error("Cookie Bridge status unavailable");
  return data.status;
}

export async function setCookieBridgeSource(mode: "store" | "workspace"): Promise<CookieBridgeStatus> {
  const data = await api().setCookieBridgeSource({ mode });
  if (!data.ok || !data.status) throw new Error(data.error || "Failed to switch Cookie Bridge source");
  return data.status;
}

export async function fetchOperatorExtensionStatus(): Promise<OperatorExtensionStatus> {
  const bridge = api();
  if (typeof bridge.fetchOperatorExtensionStatus === "function") {
    const data = await bridge.fetchOperatorExtensionStatus();
    if (!data.ok || !data.status) throw new Error(data.error || "Operator status unavailable");
    return data.status;
  }
  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/extensions/operator-status`);
      if (!res.ok) continue;
      const data = (await res.json()) as { ok?: boolean; status?: OperatorExtensionStatus };
      if (data.ok && data.status) return data.status;
    } catch {
      // try next port
    }
  }
  throw new Error("Operator status unavailable");
}

export async function reloadOperatorExtension(): Promise<OperatorExtensionStatus> {
  const bridge = api();
  if (typeof bridge.reloadOperatorExtension === "function") {
    const data = await bridge.reloadOperatorExtension();
    if (!data.ok || !data.status) throw new Error(data.error || "Failed to reload E0002 Browser Operator");
    return data.status;
  }
  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/extensions/operator-reload`, { method: "POST" });
      if (!res.ok) continue;
      const data = (await res.json()) as { ok?: boolean; status?: OperatorExtensionStatus; error?: string };
      if (data.ok && data.status) return data.status;
    } catch {
      // try next port
    }
  }
  throw new Error("Failed to reload E0002 Browser Operator");
}

export async function reloadOpenProfilesExtensions(): Promise<import("./types").ReloadOpenProfilesExtensionsResult> {
  const bridge = api();
  if (typeof bridge.reloadOpenProfilesExtensions === "function") {
    try {
      const data = await bridge.reloadOpenProfilesExtensions();
      if (data?.ok) return data;
    } catch {
      // fallback to HTTP
    }
  }
  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/extensions/reload-open`, { method: "POST" });
      if (!res.ok) continue;
      const data = (await res.json()) as import("./types").ReloadOpenProfilesExtensionsResult & { error?: string };
      if (data?.ok) return data;
    } catch {
      // try next port
    }
  }
  throw new Error("Failed to broadcast extension reload across open profiles");
}

export async function purgeBrokenExtensionPrefs(): Promise<{ profiles: number; removed: number; prefsCleaned: number }> {
  const data = await api().purgeBrokenExtensionPrefs();
  if (!data.ok) throw new Error(data.error || "Repair failed");
  return {
    profiles: data.profiles ?? 0,
    removed: data.removed ?? 0,
    prefsCleaned: data.prefsCleaned ?? 0,
  };
}

export async function fetchExtensionsStatus(): Promise<ExtensionsStatus> {
  const data = await api().fetchExtensionsStatus();
  if (!data.ok || !data.status) throw new Error("Extensions status unavailable");
  return data.status;
}

export async function fetchExtensionIcon(storeId: string, size = 48): Promise<string | null> {
  const data = await api().fetchExtensionIcon({ storeId, size });
  return data.iconDataUri ?? null;
}

export async function installStoreExtension(payload: {
  storeId?: string;
  url?: string;
  profileIds?: string[];
  force?: boolean;
  cacheOnly?: boolean;
}): Promise<InstallStoreExtensionResult> {
  const data = await api().installStoreExtension({
    storeIdOrUrl: payload.storeId ?? payload.url,
    profileIds: payload.profileIds,
    force: payload.force,
    cacheOnly: payload.cacheOnly,
  });
  if (!data.ok || !data.result) throw new Error(data.error || "Install failed");
  return data.result;
}

export async function pickUnpackedExtensionFolder(): Promise<string | null> {
  const data = await api().pickUnpackedExtensionFolder();
  if (!data.ok || data.canceled) return null;
  if (!data.path) throw new Error(data.error || "Folder picker failed");
  return data.path;
}

export async function installUnpackedExtension(payload: {
  path: string;
  profileIds?: string[];
}): Promise<InstallUnpackedExtensionResult> {
  const data = await api().installUnpackedExtension(payload);
  if (!data.ok || !data.result) throw new Error(data.error || "Install failed");
  return data.result;
}

export async function removeCachedExtensions(items: CachedExtensionRef[]): Promise<RemoveCachedExtensionsResult> {
  const data = await api().removeCachedExtensions({ items });
  if (!data.ok || !data.result) throw new Error(data.error || "Delete failed");
  return data.result;
}

export async function fetchStoreExtensionUpdateCheck(): Promise<StoreExtensionUpdateCheck> {
  const data = await api().fetchStoreExtensionUpdateCheck();
  if (!data.ok || !data.check) throw new Error(data.error || "Store update check unavailable");
  return data.check;
}

export function onStoreExtensionUpdateCheck(handler: (check: StoreExtensionUpdateCheck) => void): () => void {
  return api().onStoreExtensionUpdateCheck(handler);
}

export type ProxyCheckHealthResult = {
  alive: boolean;
  exitIp?: string;
  countryCode?: string;
  timezone?: string;
  latencyMs?: number;
  source?: string;
  localProxyUrl?: string;
  reason?: string;
  checkedAt?: string;
  geoSyncSummary?: string;
};

export async function checkProfileProxy(
  proxy: string,
  options?: { rotateVpn?: boolean; profileId?: string; profileName?: string; manualCheck?: boolean },
): Promise<ProxyCheckHealthResult> {
  const trimmed = String(proxy || "").trim();
  if (!trimmed) {
    throw new Error("Proxy is empty (using Local IP).");
  }
  const bridge = typeof window !== "undefined" ? window.stealthApi : undefined;
  if (typeof bridge?.checkProfileProxy === "function") {
    const data = await bridge.checkProfileProxy({
      proxy: trimmed,
      rotateVpn: options?.rotateVpn,
      timeoutMs: 8000,
      profileId: options?.profileId,
      profileName: options?.profileName,
      manualCheck: options?.manualCheck,
    });
    if (!data?.ok || !data.health) {
      throw new Error(data?.error || "Proxy check failed.");
    }
    return {
      ...data.health,
      ...(data.geoSync?.summary ? { geoSyncSummary: data.geoSync.summary } : {}),
    };
  }

  const vpnMatch = trimmed.match(/^(?:vpn|country|surfshark|nordvpn):(?:\/\/)?([A-Za-z]{2})\b/i);
  const preferVaultProxy = options?.rotateVpn ? false : true;
  let lastError = "Proxy check service unavailable.";

  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      if (vpnMatch && !options?.profileId && !options?.profileName) {
        const countryCode = vpnMatch[1]!.toUpperCase();
        const res = await fetch(`${base}/api/proxy/vpn-acquire`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            country: countryCode,
            preferVaultProxy,
            prefer_vault: preferVaultProxy,
          }),
        });
        const data = await res.json();
        if (!data?.ok) {
          return { alive: false, countryCode, reason: data?.error || "VPN tunnel unavailable" };
        }
        return {
          alive: true,
          exitIp: data.exitIp,
          countryCode: data.countryCode || countryCode,
          timezone: data.timezone,
          latencyMs: data.latencyMs,
          source: data.source,
          localProxyUrl: data.localProxyUrl,
        };
      }
      const res = await fetch(`${base}/api/proxy/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proxy: trimmed,
          timeoutMs: 8000,
          preferVaultProxy,
          profileId: options?.profileId,
          profileName: options?.profileName,
          manualCheck: options?.manualCheck,
        }),
      });
      const data = await res.json();
      if (!data?.ok || !data.health) {
        throw new Error(data?.error || "Proxy check failed.");
      }
      return {
        ...(data.health as ProxyCheckHealthResult),
        ...(data.geoSync?.summary ? { geoSyncSummary: String(data.geoSync.summary) } : {}),
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(lastError);
}

export async function fetchProfileCookieGuardStatus(
  profileIdOrName: string,
  profileName?: string,
): Promise<ProfileCookieGuardStatus> {
  const id = String(profileIdOrName || "").trim();
  const name = String(profileName || "").trim();
  const bridge = typeof window !== "undefined" ? window.stealthApi : undefined;
  if (typeof bridge?.getProfileCookieGuardStatus === "function") {
    const data = await bridge.getProfileCookieGuardStatus({ id, name });
    if (!data?.ok || !data.status) {
      throw new Error(data?.error || "Cookie Guard status unavailable.");
    }
    return data.status;
  }
  const target = encodeURIComponent(id || name);
  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/${target}/cookie-guard`);
      if (!res.ok) continue;
      const data = (await res.json()) as { ok?: boolean; status?: ProfileCookieGuardStatus; error?: string };
      if (data?.ok && data.status) return data.status;
    } catch {
      // try next port
    }
  }
  throw new Error("Cookie Guard status unavailable.");
}

export async function snapshotProfileCookiesBackup(
  profileIdOrName: string,
  profileName?: string,
  force = true,
): Promise<ProfileCookieGuardStatus> {
  const id = String(profileIdOrName || "").trim();
  const name = String(profileName || "").trim();
  const bridge = typeof window !== "undefined" ? window.stealthApi : undefined;
  if (typeof bridge?.snapshotProfileCookiesBackup === "function") {
    const data = await bridge.snapshotProfileCookiesBackup({ id, name, force });
    if (!data?.ok || !data.status) {
      throw new Error(data?.error || "Failed to snapshot cookies backup.");
    }
    return data.status;
  }
  const target = encodeURIComponent(id || name);
  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/${target}/cookie-guard/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { ok?: boolean; status?: ProfileCookieGuardStatus; error?: string };
      if (data?.ok && data.status) return data.status;
    } catch {
      // try next port
    }
  }
  throw new Error("Failed to snapshot cookies backup.");
}

export async function restoreProfileCookiesBackup(
  profileIdOrName: string,
  profileName?: string,
  options?: { slot?: "latest" | "previous"; sourceProfileId?: string },
): Promise<ProfileCookieGuardRestoreResult> {
  const id = String(profileIdOrName || "").trim();
  const name = String(profileName || "").trim();
  const slot = options?.slot === "previous" ? "previous" : "latest";
  const sourceProfileId = options?.sourceProfileId ? String(options.sourceProfileId).trim() : undefined;
  const bridge = typeof window !== "undefined" ? window.stealthApi : undefined;
  if (typeof bridge?.restoreProfileCookiesBackup === "function") {
    const data = await bridge.restoreProfileCookiesBackup({ id, name, slot, sourceProfileId });
    if (!data?.ok) {
      throw new Error(data?.error || "Failed to restore cookies backup.");
    }
    return data;
  }
  const target = encodeURIComponent(id || name);
  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/${target}/cookie-guard/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, ...(sourceProfileId ? { sourceProfileId } : {}) }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as ProfileCookieGuardRestoreResult;
      if (data?.ok) return data;
    } catch {
      // try next port
    }
  }
  throw new Error("Failed to restore cookies backup.");
}

export async function reconcileProfileP0020Status(
  profileIdOrName: string,
  profileName?: string,
): Promise<ProfileP0020ReconcileResult> {
  const id = String(profileIdOrName || "").trim();
  const name = String(profileName || "").trim();
  const bridge = typeof window !== "undefined" ? window.stealthApi : undefined;
  if (typeof bridge?.reconcileProfileP0020Status === "function") {
    const data = await bridge.reconcileProfileP0020Status({ id, name });
    if (!data?.ok) {
      throw new Error(data?.error || data?.reason || "Failed to reconcile status with P0020 Data Box.");
    }
    return data;
  }
  const target = encodeURIComponent(id || name);
  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/${target}/cookie-guard/reconcile-p0020`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) continue;
      const data = (await res.json()) as ProfileP0020ReconcileResult;
      if (data?.ok) return data;
    } catch {
      // try next port
    }
  }
  throw new Error("Failed to reconcile status with P0020 Data Box.");
}

export async function reconcileProfilesP0020Bulk(
  ids: string[] = [],
): Promise<ProfileP0020BulkReconcileResult> {
  const cleanIds = Array.isArray(ids) ? ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
  const bridge = typeof window !== "undefined" ? window.stealthApi : undefined;
  if (typeof bridge?.reconcileProfilesP0020Bulk === "function") {
    const data = await bridge.reconcileProfilesP0020Bulk({ ids: cleanIds });
    if (!data?.ok) {
      throw new Error(data?.error || "Failed to bulk reconcile status with P0020 Data Box.");
    }
    return data;
  }
  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/cookie-guard/reconcile-p0020-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: cleanIds }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as ProfileP0020BulkReconcileResult;
      if (data?.ok) return data;
    } catch {
      // try next port
    }
  }
  throw new Error("Failed to bulk reconcile status with P0020 Data Box.");
}

function buildFallbackMobileVaultStatus(profileCodeRaw: string): ProfileMobileVaultStatus {
  const cleanCode = String(profileCodeRaw || "0001").replace(/\D/g, "").padStart(4, "0") || "0001";
  const num = Number.parseInt(cleanCode, 10) || 1;
  const models = [
    { brand: "google", manufacturer: "Google", model: "Pixel 8", device: "shiba", buildId: "UQ1A.240205.004", tac: "35847631", gl: "Adreno (TM) 740" },
    { brand: "google", manufacturer: "Google", model: "Pixel 8 Pro", device: "husky", buildId: "UQ1A.240205.004", tac: "35912840", gl: "Adreno (TM) 740" },
    { brand: "google", manufacturer: "Google", model: "Pixel 7 Pro", device: "cheetah", buildId: "UQ1A.240205.002", tac: "35472819", gl: "Mali-G710" },
    { brand: "samsung", manufacturer: "samsung", model: "SM-S918B", device: "dm3q", buildId: "UP1A.231005.007", tac: "35290411", gl: "Adreno (TM) 740" },
    { brand: "samsung", manufacturer: "samsung", model: "SM-S928B", device: "e3q", buildId: "UP1A.231005.007", tac: "35601982", gl: "Adreno (TM) 750" },
  ];
  const m = models[num % models.length]!;
  return {
    ok: true,
    profileCode: cleanCode,
    androidIdentity: {
      brand: m.brand,
      manufacturer: m.manufacturer,
      model: m.model,
      device: m.device,
      release: "14",
      buildId: m.buildId,
      imei: `${m.tac}${cleanCode}018`,
      androidId: `a9f4${cleanCode}7c2b1e08`,
      gsfId: `3b82${cleanCode}90e14d2a`,
      glRenderer: m.gl,
      macAddress: `02:${cleanCode.slice(0, 2)}:${cleanCode.slice(2, 4)}:7a:4c:91`,
    },
    iosIdentity: {
      model: "iPhone 13",
      deviceCode: "iPhone14,5",
      iosVersion: "16.6.1",
      udid: `00008110-001A${cleanCode}3C00801E`,
      craneContainerId: `profile_${cleanCode}`,
    },
    device: {
      connected: false,
      serial: "",
      deviceModel: "",
      activeProfileOnDevice: "",
      isCurrentProfileActive: false,
      globalHttpProxy: ":0",
      proxyTunnelActive: false,
      iosWdaOnline: false,
    },
    snapshot: {
      exists: false,
      sizeBytes: 0,
      updatedAt: null,
      archivePath: `E:\\Dev\\Tool\\P0002-Social-Hub\\data\\mobile-vault\\android\\${cleanCode}.tar.gz`,
      totalSnapshots: 0,
    },
    modules: {
      stagedCount: 3,
      stagedModules: [
        "PlayIntegrityFix-PlayIntegrityFork-v18.zip",
        "ZygiskNext-Zygisk-Next-1.5.2-864-a4a72ce-release.zip",
        "LSPosed-Vector-v2.2-3080-Debug.zip",
      ],
    },
  };
}

export async function fetchProfileMobileVaultStatus(
  profileIdOrName: string,
  profileName?: string,
  proxy?: string,
): Promise<ProfileMobileVaultStatus> {
  const id = String(profileIdOrName || "").trim();
  const name = String(profileName || "").trim();
  const code = (name || id).replace(/\D/g, "").padStart(4, "0") || "0001";
  const target = encodeURIComponent(name || id);
  const proxyParam = proxy ? `&proxy=${encodeURIComponent(proxy)}` : "";

  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/${target}/mobile-vault?code=${code}${proxyParam}`);
      if (!res.ok) continue;
      const data = (await res.json()) as { ok?: boolean; status?: ProfileMobileVaultStatus };
      if (data?.ok && data.status) return data.status;
    } catch {
      // try next
    }
  }
  for (const base of ["http://127.0.0.1:3002", "http://127.0.0.1:3102"]) {
    try {
      const res = await fetch(`${base}/api/mobile-stealth/status?profile=${code}${proxyParam}`);
      if (!res.ok) continue;
      const data = (await res.json()) as { ok?: boolean; status?: ProfileMobileVaultStatus };
      if (data?.ok && data.status) return data.status;
    } catch {
      // try next
    }
  }
  return buildFallbackMobileVaultStatus(code);
}

export async function switchProfileMobileVault(
  profileIdOrName: string,
  profileName?: string,
  proxy?: string,
): Promise<ProfileMobileVaultActionResult> {
  const id = String(profileIdOrName || "").trim();
  const name = String(profileName || "").trim();
  const code = (name || id).replace(/\D/g, "").padStart(4, "0") || "0001";
  const target = encodeURIComponent(name || id);

  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/${target}/mobile-vault/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode: code, proxy: proxy || "" }),
      });
      if (!res.ok) continue;
      return (await res.json()) as ProfileMobileVaultActionResult;
    } catch {
      // try next
    }
  }
  for (const base of ["http://127.0.0.1:3002", "http://127.0.0.1:3102"]) {
    try {
      const res = await fetch(`${base}/api/mobile-stealth/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode: code, proxy: proxy || "" }),
      });
      if (!res.ok) continue;
      return (await res.json()) as ProfileMobileVaultActionResult;
    } catch {
      // try next
    }
  }
  throw new Error("Mobile Stealth API unavailable.");
}

export async function snapshotProfileMobileVault(
  profileIdOrName: string,
  profileName?: string,
  proxy?: string,
): Promise<ProfileMobileVaultActionResult> {
  const id = String(profileIdOrName || "").trim();
  const name = String(profileName || "").trim();
  const code = (name || id).replace(/\D/g, "").padStart(4, "0") || "0001";
  const target = encodeURIComponent(name || id);

  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/${target}/mobile-vault/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode: code, proxy: proxy || "" }),
      });
      if (!res.ok) continue;
      return (await res.json()) as ProfileMobileVaultActionResult;
    } catch {
      // try next
    }
  }
  for (const base of ["http://127.0.0.1:3002", "http://127.0.0.1:3102"]) {
    try {
      const res = await fetch(`${base}/api/mobile-stealth/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode: code, proxy: proxy || "" }),
      });
      if (!res.ok) continue;
      return (await res.json()) as ProfileMobileVaultActionResult;
    } catch {
      // try next
    }
  }
  throw new Error("Mobile Stealth API unavailable.");
}

export async function restoreProfileMobileVault(
  profileIdOrName: string,
  profileName?: string,
  proxy?: string,
): Promise<ProfileMobileVaultActionResult> {
  const id = String(profileIdOrName || "").trim();
  const name = String(profileName || "").trim();
  const code = (name || id).replace(/\D/g, "").padStart(4, "0") || "0001";
  const target = encodeURIComponent(name || id);

  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/${target}/mobile-vault/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode: code, proxy: proxy || "" }),
      });
      if (!res.ok) continue;
      return (await res.json()) as ProfileMobileVaultActionResult;
    } catch {
      // try next
    }
  }
  for (const base of ["http://127.0.0.1:3002", "http://127.0.0.1:3102"]) {
    try {
      const res = await fetch(`${base}/api/mobile-stealth/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode: code, proxy: proxy || "" }),
      });
      if (!res.ok) continue;
      return (await res.json()) as ProfileMobileVaultActionResult;
    } catch {
      // try next
    }
  }
  throw new Error("Mobile Stealth API unavailable.");
}

export async function mirrorProfileMobileVault(
  profileIdOrName: string,
  profileName?: string,
  proxy?: string,
): Promise<ProfileMobileVaultActionResult> {
  const id = String(profileIdOrName || "").trim();
  const name = String(profileName || "").trim();
  const code = (name || id).replace(/\D/g, "").padStart(4, "0") || "0001";
  const target = encodeURIComponent(name || id);

  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/${target}/mobile-vault/mirror`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode: code, proxy: proxy || "" }),
      });
      if (!res.ok) continue;
      return (await res.json()) as ProfileMobileVaultActionResult;
    } catch {
      // try next
    }
  }
  for (const base of ["http://127.0.0.1:3002", "http://127.0.0.1:3102"]) {
    try {
      const res = await fetch(`${base}/api/mobile-stealth/mirror`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode: code, proxy: proxy || "" }),
      });
      if (!res.ok) continue;
      return (await res.json()) as ProfileMobileVaultActionResult;
    } catch {
      // try next
    }
  }
  throw new Error("Mobile Stealth Mirror API unavailable.");
}

export async function enableProfileMobileWifiAdb(
  profileIdOrName: string,
  profileName?: string,
  proxy?: string,
): Promise<ProfileMobileVaultActionResult> {
  const id = String(profileIdOrName || "").trim();
  const name = String(profileName || "").trim();
  const code = (name || id).replace(/\D/g, "").padStart(4, "0") || "0001";
  const target = encodeURIComponent(name || id);

  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/${target}/mobile-vault/wifi-adb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode: code, proxy: proxy || "" }),
      });
      if (!res.ok) continue;
      return (await res.json()) as ProfileMobileVaultActionResult;
    } catch {
      // try next
    }
  }
  for (const base of ["http://127.0.0.1:3002", "http://127.0.0.1:3102"]) {
    try {
      const res = await fetch(`${base}/api/mobile-stealth/wifi-adb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode: code, proxy: proxy || "" }),
      });
      if (!res.ok) continue;
      return (await res.json()) as ProfileMobileVaultActionResult;
    } catch {
      // try next
    }
  }
  throw new Error("Mobile Stealth Wi-Fi ADB API unavailable.");
}

export async function pullProfileMobileCookies(
  profileIdOrName: string,
  profileName?: string,
  proxy?: string,
): Promise<ProfileMobileVaultActionResult> {
  const id = String(profileIdOrName || "").trim();
  const name = String(profileName || "").trim();
  const code = (name || id).replace(/\D/g, "").padStart(4, "0") || "0001";
  const target = encodeURIComponent(name || id);

  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/profiles/${target}/mobile-vault/pull-cookies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode: code, proxy: proxy || "" }),
      });
      if (!res.ok) continue;
      return (await res.json()) as ProfileMobileVaultActionResult;
    } catch {
      // try next
    }
  }
  for (const base of ["http://127.0.0.1:3002", "http://127.0.0.1:3102"]) {
    try {
      const res = await fetch(`${base}/api/mobile-stealth/pull-cookies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode: code, proxy: proxy || "" }),
      });
      if (!res.ok) continue;
      return (await res.json()) as ProfileMobileVaultActionResult;
    } catch {
      // try next
    }
  }
  throw new Error("Mobile Stealth Pull Cookies API unavailable.");
}

export type StealthHeadlessSessionBreakdown = {
  id: string;
  code: string;
  callerId?: string;
  supportChatProtected?: boolean;
  uptimeMs: number;
  idleMs: number;
  shadowLane?: boolean;
};

export type StealthRuntimeSettings = {
  ok: boolean;
  targetMonitor: "auto-secondary" | "primary" | "secondary" | "cursor";
  maxHeadlessSessions: number;
  activeHeadlessCount: number;
  activeHeadedCount: number;
  headlessSessions?: StealthHeadlessSessionBreakdown[];
  drainedCount?: number;
  movedBrowsersCount?: number;
  totalMonitors: number;
  resolvedDisplayIndex: number;
  resolvedWorkArea?: { x: number; y: number; width: number; height: number };
};

export async function fetchStealthRuntimeSettings(): Promise<StealthRuntimeSettings> {
  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/settings/runtime`);
      if (!res.ok) continue;
      const data = (await res.json()) as StealthRuntimeSettings;
      if (data?.ok) return data;
    } catch {
      // try next port
    }
  }
  return {
    ok: true,
    targetMonitor: "auto-secondary",
    maxHeadlessSessions: 40,
    activeHeadlessCount: 0,
    activeHeadedCount: 0,
    headlessSessions: [],
    totalMonitors: 2,
    resolvedDisplayIndex: 2,
  };
}

export async function updateStealthRuntimeSettings(patch: {
  targetMonitor?: "auto-secondary" | "primary" | "secondary" | "cursor";
  maxHeadlessSessions?: number;
  moveConsoleNow?: boolean;
  moveBrowsersNow?: boolean;
  drainIdleHeadless?: boolean;
  forceDrainAllHeadless?: boolean;
  maxIdleMs?: number;
  stopCallerId?: string;
}): Promise<StealthRuntimeSettings> {
  let latest: StealthRuntimeSettings | null = null;
  for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${base}/api/settings/runtime`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as StealthRuntimeSettings;
      if (data?.ok && !latest) latest = data;
    } catch {
      // try next port
    }
  }
  if (latest) return latest;
  return {
    ok: true,
    targetMonitor: patch.targetMonitor ?? "auto-secondary",
    maxHeadlessSessions: patch.maxHeadlessSessions ?? 40,
    activeHeadlessCount: 0,
    activeHeadedCount: 0,
    totalMonitors: 2,
    resolvedDisplayIndex: patch.targetMonitor === "primary" ? 1 : 2,
  };
}




