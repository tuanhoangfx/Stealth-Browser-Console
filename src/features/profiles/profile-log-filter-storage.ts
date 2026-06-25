import type { ProfileRunLogFilter } from "./profile-run-log";

const STORAGE_KEY = "p0003.profile-detail-log-filter";

const VALID_FILTERS = new Set<ProfileRunLogFilter>(["all", "today", "errors"]);

function readMap(): Record<string, ProfileRunLogFilter> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, ProfileRunLogFilter>;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, ProfileRunLogFilter>) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

export function readProfileLogFilter(storageKey: string, fallback: ProfileRunLogFilter = "all"): ProfileRunLogFilter {
  const value = readMap()[storageKey];
  return value && VALID_FILTERS.has(value) ? value : fallback;
}

export function writeProfileLogFilter(storageKey: string, filter: ProfileRunLogFilter) {
  if (!VALID_FILTERS.has(filter)) return;
  const map = readMap();
  map[storageKey] = filter;
  writeMap(map);
}
