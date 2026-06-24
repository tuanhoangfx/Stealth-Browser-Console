import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DirectoryTableColumnsSettings,
  patchHubListPrefs,
  readHubListPrefsCore,
  type HubDirectoryDisplayPanelProps,
} from "@tool-workspace/hub-ui";
import {
  countHiddenProfileDirectoryColumns,
  PROFILE_DIRECTORY_COLUMNS_CHANGE,
  PROFILE_DIRECTORY_COLUMN_ITEMS,
  profileDirectoryColumnPrefs,
  resetProfileDirectoryColumns,
} from "../features/profiles/profile-directory-prefs";
import { SCREEN_DISPLAY_PREFS, resolveScreenDisplayPrefs } from "./display-prefs-registry";
import type { StealthScreen } from "./stealth-screen";

/** Tab display panel — KPI · charts · header · filters · table columns. */
export function useStealthDisplayPanelConfig(screen: StealthScreen): HubDirectoryDisplayPanelProps | null {
  const cfg = useMemo(() => resolveScreenDisplayPrefs(screen), [screen]);
  const [hiddenProfileCols, setHiddenProfileCols] = useState(() =>
    screen === "profiles" ? countHiddenProfileDirectoryColumns() : 0,
  );

  useEffect(() => {
    if (screen !== "profiles") return;
    const sync = () => setHiddenProfileCols(countHiddenProfileDirectoryColumns());
    window.addEventListener(PROFILE_DIRECTORY_COLUMNS_CHANGE, sync);
    return () => window.removeEventListener(PROFILE_DIRECTORY_COLUMNS_CHANGE, sync);
  }, [screen]);

  const onLog = useCallback((scope: string, message: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("stealth-app-log", { detail: { scope, message } }));
  }, []);

  const getScreen = useCallback(() => screen, [screen]);

  const tablePanel: ReactNode = useMemo(
    () =>
      screen === "profiles" ? (
        <DirectoryTableColumnsSettings
          items={PROFILE_DIRECTORY_COLUMN_ITEMS}
          prefs={profileDirectoryColumnPrefs}
        />
      ) : undefined,
    [screen],
  );

  const tableSectionActions = useMemo(
    () =>
      screen === "profiles" ? (
        <button type="button" className="btn secondary text-xs" onClick={() => resetProfileDirectoryColumns()}>
          Reset columns
        </button>
      ) : undefined,
    [screen],
  );

  return useMemo(() => {
    if (!cfg) return null;

    return {
      kpis: cfg.kpis,
      charts: cfg.charts,
      filters: cfg.filters,
      headerStats: cfg.headerStats,
      defaultKpiKeys: cfg.defaultKpiKeys,
      defaultChartKeys: cfg.defaultChartKeys,
      defaultFilterKeys: cfg.defaultFilterKeys,
      defaultHeaderStatKeys: cfg.defaultHeaderStatKeys,
      tablePanel,
      tableSectionActions,
      tableActiveCount: screen === "profiles" ? hiddenProfileCols : 0,
      readPrefs: readHubListPrefsCore,
      patchPrefs: patchHubListPrefs,
      getScreen,
      onLog,
    };
  }, [cfg, getScreen, hiddenProfileCols, onLog, screen, tablePanel, tableSectionActions]);
}
