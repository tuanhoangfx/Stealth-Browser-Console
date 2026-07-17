import type {
  BulkCreateProfileDefaults,
  BulkCreateProfilesResult,
  EngineHealth,
  LaunchBenchBaseline,
  LaunchPerfEntry,
  OpenUrlResult,
  ProfileRow,
  ProfileCatalogStats,
  RunHistoryItem,
  StealthGroup,
  StealthProfile,
  CookieBridgeStatus,
  ExtensionToggles,
  ExtensionsStatus,
  InstallStoreExtensionResult,
  InstallUnpackedExtensionResult,
  ProfileStorageStat,
  ProfileBackupMeta,
} from "./types";
import { installStealthWebMock } from "./lib/stealth-web-mock";
import { patchStealthElectronBridgeGaps } from "./lib/stealth-bridge-patch";

if (import.meta.env.DEV) {
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

export async function fetchProfileStorageStats(
  profileIds: string[],
  options?: { includeBytes?: boolean },
): Promise<ProfileStorageStat[]> {
  const data = await api().profileStorageStats({
    profileIds,
    includeBytes: options?.includeBytes,
  });
  return data.stats;
}

export async function fetchProfileBackupMeta(profileIds: string[]): Promise<ProfileBackupMeta[]> {
  const data = await api().profileBackupMeta({ profileIds });
  return data.meta;
}

export type LaunchProfileResult = {
  profile: StealthProfile;
  headless?: boolean;
  agentSmoke?: boolean;
  focused?: boolean;
};

export async function launchProfile(id: string, name?: string): Promise<LaunchProfileResult> {
  const data = await api().launchProfile({ id, name });
  return {
    profile: data.profile,
    headless: data.headless,
    agentSmoke: data.agentSmoke,
    focused: data.focused,
  };
}

export async function closeProfile(id: string, name?: string) {
  const data = await api().closeProfile({ id, name });
  return data.profile;
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
    return { e0001: enabled, surfshark: enabled, webStore: enabled };
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

export async function fetchLaunchPerfEntries(limit = 24): Promise<LaunchPerfEntry[]> {
  const data = await api().listLaunchPerf({ limit });
  return data.entries;
}

export async function clearLaunchPerfEntries(): Promise<void> {
  await api().clearLaunchPerf();
}

export async function fetchLaunchBenchBaseline(): Promise<LaunchBenchBaseline | null> {
  const data = await api().fetchLaunchBenchBaseline();
  return data.baseline;
}

export async function purgeLegacyIdentityToolbar(): Promise<{ profiles: number; removed: number; prefsCleaned: number }> {
  const data = await api().purgeLegacyIdentityToolbar();
  if (!data.ok) throw new Error(data.error || "Purge failed");
  return {
    profiles: data.profiles ?? 0,
    removed: data.removed ?? 0,
    prefsCleaned: data.prefsCleaned ?? 0,
  };
}

export async function fetchCookieBridgeStatus(): Promise<CookieBridgeStatus> {
  const data = await api().fetchCookieBridgeStatus();
  if (!data.ok || !data.status) throw new Error("Cookie Bridge status unavailable");
  return data.status;
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
}): Promise<InstallStoreExtensionResult> {
  const data = await api().installStoreExtension({
    storeIdOrUrl: payload.storeId ?? payload.url,
    profileIds: payload.profileIds,
    force: payload.force,
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
