import type { PrefItem } from "@tool-workspace/hub-ui";
import { withPrefItemIcons } from "@tool-workspace/hub-ui";
import type { StealthScreen } from "./stealth-screen";
import {
  STEALTH_PROFILE_FILTER_STICKER,
  STEALTH_PROFILE_HEADER_STAT_STICKER,
  STEALTH_PROFILE_KPI_STICKER,
  STEALTH_WORKFLOW_FILTER_STICKER,
  STEALTH_WORKFLOW_HEADER_STAT_STICKER,
  STEALTH_WORKFLOW_KPI_STICKER,
  stealthPrefIconMap,
} from "./stealth-column-stickers";
import {
  stealthProfilesDisplayPrefItems,
  stealthWorkflowDisplayPrefItems,
} from "./stealth-display-pref-hints";

const RESOLVED_DISPLAY_PREFS_CACHE = new Map<StealthScreen, ScreenDisplayPrefsConfig>();

export type ScreenDisplayPrefsConfig = {
  kpis: PrefItem[];
  charts: PrefItem[];
  filters: PrefItem[];
  headerStats: PrefItem[];
  defaultKpiKeys: Set<string>;
  defaultChartKeys: Set<string>;
  defaultFilterKeys: Set<string>;
  defaultHeaderStatKeys: Set<string>;
};

/** P0003 — profiles directory KPIs only; workflow/scripts has no KPI band. */
export const PROFILES_DISPLAY_PREFS: ScreenDisplayPrefsConfig = {
  kpis: [
    { key: "total", label: "Profiles" },
    { key: "running", label: "Running" },
    { key: "failed", label: "Failed" },
    { key: "ready", label: "Ready" },
  ],
  charts: [],
  filters: [
    { key: "group", label: "Group" },
    { key: "status", label: "Status" },
  ],
  headerStats: [
    { key: "running", label: "Running" },
    { key: "failed", label: "Failed" },
    { key: "ready", label: "Ready" },
    { key: "total", label: "Profiles" },
  ],
  defaultKpiKeys: new Set(["total", "running", "failed", "ready"]),
  defaultChartKeys: new Set(),
  defaultFilterKeys: new Set(["group", "status"]),
  defaultHeaderStatKeys: new Set(["running", "failed", "ready", "total"]),
};

/** System → Backup — profile KPIs available; default off until enabled in Display. */
export const SYSTEM_BACKUP_DISPLAY_PREFS: ScreenDisplayPrefsConfig = {
  ...PROFILES_DISPLAY_PREFS,
  defaultKpiKeys: new Set<string>(),
  defaultChartKeys: new Set<string>(),
};

/** System → Extensions — extension cache KPIs; default off. */
export const SYSTEM_EXTENSIONS_DISPLAY_PREFS: ScreenDisplayPrefsConfig = {
  kpis: [
    { key: "cached", label: "Cached" },
    { key: "store", label: "Store" },
  ],
  charts: [],
  filters: [{ key: "kind", label: "Kind" }],
  headerStats: [
    { key: "cached", label: "Cached" },
    { key: "store", label: "Store" },
  ],
  defaultKpiKeys: new Set<string>(),
  defaultChartKeys: new Set<string>(),
  defaultFilterKeys: new Set<string>(["kind"]),
  defaultHeaderStatKeys: new Set(["cached", "store"]),
};

export const WORKFLOW_DISPLAY_PREFS: ScreenDisplayPrefsConfig = {
  kpis: [
    { key: "total", label: "Workflows (shown)" },
    { key: "selected", label: "Selected" },
    { key: "steps", label: "Steps (active)" },
  ],
  charts: [],
  filters: [
    { key: "group", label: "Group" },
    { key: "platform", label: "Platform" },
  ],
  headerStats: [
    { key: "total", label: "Workflows" },
    { key: "selected", label: "Selected" },
    { key: "steps", label: "Steps" },
  ],
  defaultKpiKeys: new Set(["total", "selected", "steps"]),
  defaultChartKeys: new Set(),
  defaultFilterKeys: new Set(["group", "platform"]),
  defaultHeaderStatKeys: new Set(["total", "selected", "steps"]),
};

export const SCREEN_DISPLAY_PREFS: Partial<Record<StealthScreen, ScreenDisplayPrefsConfig>> = {
  profiles: PROFILES_DISPLAY_PREFS,
  workflow: WORKFLOW_DISPLAY_PREFS,
};

export function resolveScreenDisplayPrefs(screen: StealthScreen): ScreenDisplayPrefsConfig | undefined {
  const cached = RESOLVED_DISPLAY_PREFS_CACHE.get(screen);
  if (cached) return cached;

  const cfg = SCREEN_DISPLAY_PREFS[screen];
  if (!cfg) return undefined;

  let resolved: ScreenDisplayPrefsConfig;
  if (screen === "profiles") {
    resolved = {
      ...cfg,
      kpis: stealthProfilesDisplayPrefItems(
        withPrefItemIcons(cfg.kpis, stealthPrefIconMap(STEALTH_PROFILE_KPI_STICKER)),
      ),
      filters: stealthProfilesDisplayPrefItems(
        withPrefItemIcons(cfg.filters, stealthPrefIconMap(STEALTH_PROFILE_FILTER_STICKER)),
      ),
      headerStats: stealthProfilesDisplayPrefItems(
        withPrefItemIcons(cfg.headerStats, stealthPrefIconMap(STEALTH_PROFILE_HEADER_STAT_STICKER)),
      ),
    };
  } else if (screen === "workflow") {
    resolved = {
      ...cfg,
      kpis: stealthWorkflowDisplayPrefItems(
        withPrefItemIcons(cfg.kpis, stealthPrefIconMap(STEALTH_WORKFLOW_KPI_STICKER)),
      ),
      filters: stealthWorkflowDisplayPrefItems(
        withPrefItemIcons(cfg.filters, stealthPrefIconMap(STEALTH_WORKFLOW_FILTER_STICKER)),
      ),
      headerStats: stealthWorkflowDisplayPrefItems(
        withPrefItemIcons(cfg.headerStats, stealthPrefIconMap(STEALTH_WORKFLOW_HEADER_STAT_STICKER)),
      ),
    };
  } else {
    resolved = cfg;
  }

  RESOLVED_DISPLAY_PREFS_CACHE.set(screen, resolved);
  return resolved;
}
