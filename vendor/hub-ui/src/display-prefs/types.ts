import type { ReactNode } from "react";
import type { TimeRange } from "./constants";

export type PrefIcon = React.ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
}>;

export type PrefItem = {
  key: string;
  label: string;
  icon?: PrefIcon;
  iconClassName?: string;
};

/** Extra settings tab (e.g. Cookie bridge / vault) between General and Display. */
export type SettingsExtraTab = {
  id: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
};

/** Top-level TOC section in the Settings modal (same level as Display · Shortcuts). */
export type HubDisplayPrefsToolSection = {
  id: string;
  label: string;
  icon?: ReactNode;
  body: ReactNode;
  headerActions?: ReactNode;
};

export type DisplayPrefsPrefs = {
  range: TimeRange;
  limit: number;
  /** Rows per table/card page (`tpage` URL param). */
  tablePageSize: number;
  kpi: Set<string> | null;
  charts: Set<string> | null;
  headerStats: Set<string> | null;
  systemHeaderStats: Set<string> | null;
  headerPin: boolean;
  searchPin: boolean;
  navToggleIcon?: boolean;
  hubFilters?: Set<string> | null;
};

export type SystemDisplaySlice = {
  kpi: Set<string> | null;
  charts: Set<string> | null;
};

export type SystemDisplayAdapter = {
  read: (tab: string) => SystemDisplaySlice | null;
  patch: (tab: string, patch: Partial<{ kpi: string[] | null; charts: string[] | null }>) => void;
  reset: (tab: string) => void;
};

/** Per-sub-tab KPI/chart storage for screens with nested navigation (System, Fanpages, …). */
export type SubTabDisplayConfig = {
  /** Top-level screen ids that use `adapter` instead of URL prefs for KPI/charts. */
  screens: string[];
  adapter: SystemDisplayAdapter;
  /** Dispatched after patch/reset so settings panel + analytics hooks resync. */
  changeEvent?: string;
  /** Settings log scope, e.g. `Fanpages / overview`. */
  logScope?: (subTab: string) => string;
};

export const SUBTAB_DISPLAY_CHANGE = "subtab-display-change";

export type HubDisplayPrefsProps = {
  kpis?: PrefItem[];
  charts?: PrefItem[];
  filters?: PrefItem[];
  headerStats?: PrefItem[];
  showHeaderPin?: boolean;
  showRange?: boolean;
  showLimit?: boolean;
  showNavToggle?: boolean;
  /** Hide “Pin search bar” on system screen (P0020 behavior). */
  hideSearchPinOnSystem?: boolean;
  defaultKpiKeys?: Set<string>;
  defaultChartKeys?: Set<string>;
  defaultFilterKeys?: Set<string>;
  defaultHeaderStatKeys?: Set<string>;
  menuPlacement?: "bottom" | "top";
  compact?: boolean;
  sidebarRow?: boolean;
  scope?: "tab" | "global";
  filterParam?: string;
  /** Read visible filter keys from URL (`nfilt`, `cfilt`, …) instead of prefs.hubFilters. */
  filtersFromUrl?: boolean;
  readPrefs: () => DisplayPrefsPrefs;
  patchPrefs: (patch: Record<string, string | null>, logMessage?: string) => void;
  /** Fired after patchPrefs updates URL (default `hub-list-prefs-change`). */
  prefsChangeEvent?: string;
  getScreen: () => string;
  getSystemTab?: () => string;
  systemDisplay?: SystemDisplayAdapter;
  /** Active sub-tab id for screens in `subTabDisplay.screens` (e.g. fanpages overview). */
  getSubTab?: () => string;
  subTabDisplay?: SubTabDisplayConfig;
  /** @deprecated Prefer `displayExtras`. */
  generalExtras?: ReactNode;
  /** Extra toggles rendered inside App mode (e.g. 2FA mask password). */
  displayExtras?: ReactNode;
  /** Extra footer actions before “Reset to defaults” (e.g. tab-specific Save). */
  footerActions?: ReactNode;
  tablePanel?: ReactNode;
  /** Label for the table settings section in Display panel / Settings (default: Table columns). */
  tableSectionLabel?: string;
  /** Actions in the Table columns section header (e.g. Reset columns). */
  tableSectionActions?: ReactNode;
  tableActiveCount?: number;
  headerStatLabel?: (isSystem: boolean) => string;
  onLog?: (scope: string, message: string) => void;
  mainSelector?: string;
  title?: string;
  /** @deprecated Pass content via `displayExtras` + `SettingsSubsection` instead. */
  extraTabs?: SettingsExtraTab[];
  /** Tool-owned TOC sections (e.g. bulk Startup URL on Profiles). */
  toolSections?: HubDisplayPrefsToolSection[];
};
