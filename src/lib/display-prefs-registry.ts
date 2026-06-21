import type { PrefItem } from "@tool-workspace/hub-ui";
import { withPrefItemIcons } from "@tool-workspace/hub-ui";
import type { StealthScreen } from "./stealth-screen";
import {
  PROFILE_FILTER_PREF_ICONS,
  PROFILE_HEADER_PREF_ICONS,
  PROFILE_KPI_PREF_ICONS,
  WORKFLOW_FILTER_PREF_ICONS,
  WORKFLOW_HEADER_PREF_ICONS,
  WORKFLOW_KPI_PREF_ICONS,
} from "./profile-display-pref-icons";

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
    { key: "ready", label: "Ready" },
  ],
  charts: [],
  filters: [
    { key: "group", label: "Group" },
    { key: "status", label: "Status" },
  ],
  headerStats: [
    { key: "running", label: "Running" },
    { key: "ready", label: "Ready" },
    { key: "total", label: "Profiles" },
  ],
  defaultKpiKeys: new Set(["total", "running", "ready"]),
  defaultChartKeys: new Set(),
  defaultFilterKeys: new Set(["group", "status"]),
  defaultHeaderStatKeys: new Set(["running", "ready", "total"]),
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
  const cfg = SCREEN_DISPLAY_PREFS[screen];
  if (!cfg) return undefined;
  if (screen === "profiles") {
    return {
      ...cfg,
      kpis: withPrefItemIcons(cfg.kpis, PROFILE_KPI_PREF_ICONS),
      filters: withPrefItemIcons(cfg.filters, PROFILE_FILTER_PREF_ICONS),
      headerStats: withPrefItemIcons(cfg.headerStats, PROFILE_HEADER_PREF_ICONS),
    };
  }
  if (screen === "workflow") {
    return {
      ...cfg,
      kpis: withPrefItemIcons(cfg.kpis, WORKFLOW_KPI_PREF_ICONS),
      filters: withPrefItemIcons(cfg.filters, WORKFLOW_FILTER_PREF_ICONS),
      headerStats: withPrefItemIcons(cfg.headerStats, WORKFLOW_HEADER_PREF_ICONS),
    };
  }
  return cfg;
}
