/**
 * In-memory Stealth API for Vite-only dev (no Electron preload).
 * Seeds one demo profile so Hub directory UI is usable in the browser.
 */
import type { BulkCreateProfilesResult, EngineHealth, OpenUrlResult, RunHistoryItem, StealthGroup, StealthProfile } from "../types";
import { DEFAULT_DEVICE, deviceConfigFromProfile } from "./device-presets";
import { normalizeStartupUrl, resolveStartupUrlSave } from "./startup-url";
import { matchesProfileDirectorySearch } from "../features/profiles/profile-directory-search";

const DEMO_SEED = 424242;
const groups: StealthGroup[] = [{ id: "default", name: "Default", sortOrder: 0 }];
const profiles: StealthProfile[] = [];
const runs: RunHistoryItem[] = [];

function nowIso() {
  return new Date().toISOString();
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
    updatedAt: ts
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
    updatedAt: ts
  };
  profiles.unshift(profile);
  return profile;
}

function summarizeBulkResult(requested: number, createdNames: string[], skippedNames: string[], duplicateNames: string[]): BulkCreateProfilesResult {
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

export function createStealthWebMockApi(): NonNullable<typeof window.stealthApi> {
  return {
    engineHealth: async (): Promise<EngineHealth> => ({
      ok: false,
      installed: false,
      error: "Web dev mock — run pnpm dev (Electron) for CloakBrowser engine.",
      info: { version: "web-mock", path: "" }
    }),
    updateBinary: async () => ({ ok: false, error: "Not available in web mock." }),
    listProfiles: async () => {
      seedIfEmpty();
      return { ok: true, profiles: [...profiles], groups: [...groups] };
    },
    profileBootstrap: async () => {
      seedIfEmpty();
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
      return { ok: true, groups: [...groups], stats };
    },
    listProfilesPage: async (input: {
      search?: string;
      groupIds?: string[];
      statuses?: StealthProfile["status"][];
      limit?: number;
      offset?: number;
    } = {}) => {
      seedIfEmpty();
      const term = String(input.search || "").trim();
      const groupIds = Array.isArray(input.groupIds) ? input.groupIds.map(String) : [];
      const statuses = Array.isArray(input.statuses) ? input.statuses.map(String) : [];
      let rows = [...profiles];
      if (groupIds.length) rows = rows.filter((p) => groupIds.includes(String(p.groupId ?? "")));
      if (statuses.length) rows = rows.filter((p) => statuses.includes(p.status));
      if (term) {
        rows = rows.filter((p) => matchesProfileDirectorySearch(p, term));
      }
      const limit = Math.min(50_000, Math.max(1, Number(input.limit) || 100));
      const offset = Math.max(0, Number(input.offset) || 0);
      return {
        ok: true,
        profiles: rows.slice(offset, offset + limit),
        total: rows.length,
        limit,
        offset,
      };
    },
    catalogStats: async () => {
      seedIfEmpty();
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
      return { ok: true, stats };
    },
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
    launchProfile: async (payload) => {
      const profile = findProfile(String(payload.id));
      if (!profile) throw new Error("Profile not found.");
      profile.status = "running";
      profile.updatedAt = nowIso();
      throw new Error("Launch requires Electron + CloakBrowser (pnpm dev).");
    },
    closeProfile: async (payload) => {
      const profile = findProfile(String(payload.id));
      if (!profile) throw new Error("Profile not found.");
      profile.status = "closed";
      profile.updatedAt = nowIso();
      return { ok: true, profile };
    },
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
        sortOrder: groups.length
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
    importProfiles: async () => ({ ok: true, imported: 0 }),
    listRuns: async (payload) => ({
      ok: true,
      runs: runs.slice(0, Number(payload?.limit) || 100)
    }),
    openUrl: async (): Promise<OpenUrlResult> => {
      throw new Error("Open URL automation requires Electron + CloakBrowser.");
    },
    appInfo: async () => ({
      name: "Stealth Browser Console (web mock)",
      version: "0.4.1",
      isPackaged: false,
      userDataPath: "(browser)"
    }),
    openDataFolder: async () => ({ ok: false, path: "" }),
    listLaunchPerf: async () => ({ ok: true, entries: [] }),
    clearLaunchPerf: async () => ({ ok: true }),
    fetchLaunchBenchBaseline: async () => ({ ok: true, baseline: null }),
    purgeLegacyIdentityToolbar: async () => ({ ok: true, profiles: 0, removed: 0, prefsCleaned: 0 }),
    fetchCookieBridgeStatus: async () => ({
      ok: true,
      status: {
        enabled: true,
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
    onProfileSession: () => () => undefined
  };
}

export function installStealthWebMock() {
  if (typeof window === "undefined") return;
  if ("stealthApi" in window && window.stealthApi) return;
  window.stealthApi = createStealthWebMockApi();
}
