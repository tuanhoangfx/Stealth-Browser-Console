import type { ProxyCheckHealthResult } from "../api";

const STORAGE_KEY = "stealth:proxy-health-cache:v1";
const MAX_CACHE_ENTRIES = 500;

export type CachedProxyHealthEntry = ProxyCheckHealthResult & {
  checkedAt: string;
  proxy: string;
};

function normalizeProxyCacheKey(proxy: string, profileName?: string): string {
  const cleanProxy = String(proxy || "").trim().toLowerCase();
  if (!cleanProxy) return "";
  const cleanName = String(profileName || "").trim();
  return cleanName ? `${cleanName}::${cleanProxy}` : cleanProxy;
}

function readAllCachedEntries(): Record<string, CachedProxyHealthEntry> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, CachedProxyHealthEntry>) : {};
  } catch {
    return {};
  }
}

function writeAllCachedEntries(map: Record<string, CachedProxyHealthEntry>): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const keys = Object.keys(map);
    if (keys.length > MAX_CACHE_ENTRIES) {
      const sorted = keys.sort((a, b) =>
        String(map[b]?.checkedAt || "").localeCompare(String(map[a]?.checkedAt || "")),
      );
      const trimmed: Record<string, CachedProxyHealthEntry> = {};
      for (const k of sorted.slice(0, MAX_CACHE_ENTRIES)) {
        if (map[k]) trimmed[k] = map[k]!;
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

export function readCachedProxyHealth(proxy: string, profileName?: string): CachedProxyHealthEntry | null {
  const cleanProxy = String(proxy || "").trim();
  if (!cleanProxy) return null;
  const all = readAllCachedEntries();
  if (profileName) {
    const byProfile = all[normalizeProxyCacheKey(cleanProxy, profileName)];
    if (byProfile) return byProfile;
  }
  const byProxy = all[normalizeProxyCacheKey(cleanProxy)];
  return byProxy || null;
}

export function writeCachedProxyHealth(
  proxy: string,
  health: ProxyCheckHealthResult,
  profileName?: string,
): CachedProxyHealthEntry | null {
  const cleanProxy = String(proxy || "").trim();
  if (!cleanProxy) return null;
  const entry: CachedProxyHealthEntry = {
    ...health,
    proxy: cleanProxy,
    checkedAt: health.checkedAt || new Date().toISOString(),
  };
  const all = readAllCachedEntries();
  all[normalizeProxyCacheKey(cleanProxy)] = entry;
  if (profileName) {
    all[normalizeProxyCacheKey(cleanProxy, profileName)] = entry;
  }
  writeAllCachedEntries(all);
  return entry;
}
