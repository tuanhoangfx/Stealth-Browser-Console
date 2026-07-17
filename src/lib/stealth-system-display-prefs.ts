import type { StealthSystemTab } from "./stealth-system-tab";

type SystemDisplaySlice = {
  kpi: Set<string> | null;
  charts: Set<string> | null;
  filters: Set<string> | null;
};

const STORAGE_KEY = "p0003:system-display";

type TabDisplayStored = {
  kpi: string[] | null;
  charts: string[] | null;
  filters?: string[] | null;
};
type StoredMap = Partial<Record<StealthSystemTab, TabDisplayStored>>;

function readMap(): StoredMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredMap;
  } catch {
    return {};
  }
}

function writeMap(map: StoredMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function emitChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STEALTH_SYSTEM_SUBTAB_DISPLAY.changeEvent));
}

export function readSystemTabDisplay(tab: StealthSystemTab): SystemDisplaySlice | null {
  const slice = readMap()[tab];
  if (!slice) return null;
  return {
    kpi: slice.kpi == null ? null : new Set(slice.kpi),
    charts: slice.charts == null ? null : new Set(slice.charts),
    filters: slice.filters == null ? null : new Set(slice.filters),
  };
}

export function patchSystemTabDisplay(
  tab: StealthSystemTab,
  patch: Partial<{ kpi: string[] | null; charts: string[] | null; filters: string[] | null }>,
) {
  const map = readMap();
  const cur = map[tab] ?? { kpi: null, charts: null, filters: null };
  map[tab] = { ...cur, ...patch };
  writeMap(map);
  emitChange();
}

export function resetSystemTabDisplay(tab: StealthSystemTab) {
  const map = readMap();
  delete map[tab];
  writeMap(map);
  emitChange();
}

export const STEALTH_SYSTEM_SUBTAB_DISPLAY = {
  screens: ["system"] as const,
  changeEvent: "system-display-change",
  logScope: (tab: string) => `System / ${tab}`,
};
