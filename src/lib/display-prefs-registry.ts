import type { PrefItem } from "@tool-workspace/hub-ui";
import type { StealthScreen } from "./stealth-screen";

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
    { key: "total", label: "Profiles (shown)" },
    { key: "running", label: "Running" },
    { key: "ready", label: "Ready" },
    { key: "failed", label: "Failed" },
  ],
  charts: [],
  filters: [
    { key: "group", label: "Group" },
    { key: "status", label: "Status" },
  ],
  headerStats: [
    { key: "running", label: "running" },
    { key: "ready", label: "ready" },
    { key: "failed", label: "failed" },
    { key: "total", label: "profiles" },
  ],
  defaultKpiKeys: new Set(["total", "running", "ready", "failed"]),
  defaultChartKeys: new Set(),
  defaultFilterKeys: new Set(["group", "status"]),
  defaultHeaderStatKeys: new Set(["running", "ready", "failed", "total"]),
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
    { key: "total", label: "workflows" },
    { key: "selected", label: "selected" },
    { key: "steps", label: "steps" },
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
  return SCREEN_DISPLAY_PREFS[screen];
}
