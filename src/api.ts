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
} from "./types";
import { installStealthWebMock } from "./lib/stealth-web-mock";

if (import.meta.env.DEV) {
  installStealthWebMock();
}

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

export async function importProfilesBundle(bundle: unknown, merge = true) {
  return api().importProfiles({ bundle, merge });
}

export async function launchProfile(id: string, name?: string) {
  const data = await api().launchProfile({ id, name });
  return data.profile;
}

export async function closeProfile(id: string, name?: string) {
  const data = await api().closeProfile({ id, name });
  return data.profile;
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

export async function fetchAppInfo() {
  return api().appInfo();
}

export async function openDataFolder() {
  return api().openDataFolder();
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
