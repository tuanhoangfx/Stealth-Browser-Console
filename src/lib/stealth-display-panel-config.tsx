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
import {
  countHiddenWorkflowPanelDirectoryColumns,
  countHiddenWorkflowRailDirectoryColumns,
  WORKFLOW_DIRECTORY_COLUMN_ITEMS,
  WORKFLOW_PANEL_DIRECTORY_COLUMNS_CHANGE,
  WORKFLOW_RAIL_DIRECTORY_COLUMNS_CHANGE,
  resetWorkflowPanelDirectoryColumns,
  resetWorkflowRailDirectoryColumns,
  workflowPanelDirectoryColumnPrefs,
  workflowRailDirectoryColumnPrefs,
} from "../features/workflows/workflow-directory-prefs";
import { SCREEN_DISPLAY_PREFS, resolveScreenDisplayPrefs } from "./display-prefs-registry";
import type { StealthScreen } from "./stealth-screen";

export type StealthDirectoryDisplayVariant = "rail" | "panel";

/** Tab display panel — profiles: KPI + columns; workflow: table columns only. */
export function useStealthDisplayPanelConfig(
  screen: StealthScreen,
  directoryVariant: StealthDirectoryDisplayVariant = "panel",
): HubDirectoryDisplayPanelProps | null {
  const cfg = useMemo(() => resolveScreenDisplayPrefs(screen), [screen]);
  const isWorkflowRail = screen === "workflow" && directoryVariant === "rail";
  const isWorkflowPanel = screen === "workflow" && directoryVariant === "panel";

  const [hiddenProfileCols, setHiddenProfileCols] = useState(() =>
    screen === "profiles" ? countHiddenProfileDirectoryColumns() : 0,
  );
  const [hiddenWorkflowCols, setHiddenWorkflowCols] = useState(() =>
    isWorkflowRail
      ? countHiddenWorkflowRailDirectoryColumns()
      : isWorkflowPanel
        ? countHiddenWorkflowPanelDirectoryColumns()
        : 0,
  );

  useEffect(() => {
    if (screen !== "profiles") return;
    const sync = () => setHiddenProfileCols(countHiddenProfileDirectoryColumns());
    window.addEventListener(PROFILE_DIRECTORY_COLUMNS_CHANGE, sync);
    return () => window.removeEventListener(PROFILE_DIRECTORY_COLUMNS_CHANGE, sync);
  }, [screen]);

  useEffect(() => {
    if (!isWorkflowRail && !isWorkflowPanel) return;
    const event = isWorkflowRail
      ? WORKFLOW_RAIL_DIRECTORY_COLUMNS_CHANGE
      : WORKFLOW_PANEL_DIRECTORY_COLUMNS_CHANGE;
    const sync = () =>
      setHiddenWorkflowCols(
        isWorkflowRail
          ? countHiddenWorkflowRailDirectoryColumns()
          : countHiddenWorkflowPanelDirectoryColumns(),
      );
    window.addEventListener(event, sync);
    return () => window.removeEventListener(event, sync);
  }, [isWorkflowPanel, isWorkflowRail]);

  const onLog = useCallback((scope: string, message: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("stealth-app-log", { detail: { scope, message } }));
  }, []);

  const getScreen = useCallback(() => screen, [screen]);

  const tablePanel: ReactNode = useMemo(() => {
    if (screen === "profiles") {
      return (
        <DirectoryTableColumnsSettings
          items={PROFILE_DIRECTORY_COLUMN_ITEMS}
          prefs={profileDirectoryColumnPrefs}
        />
      );
    }
    if (isWorkflowRail || isWorkflowPanel) {
      const prefs = isWorkflowRail ? workflowRailDirectoryColumnPrefs : workflowPanelDirectoryColumnPrefs;
      return (
        <DirectoryTableColumnsSettings items={WORKFLOW_DIRECTORY_COLUMN_ITEMS} prefs={prefs} />
      );
    }
    return undefined;
  }, [isWorkflowPanel, isWorkflowRail, screen]);

  const tableSectionActions = useMemo(() => {
    if (screen === "profiles") {
      return (
        <button type="button" className="btn secondary text-xs" onClick={() => resetProfileDirectoryColumns()}>
          Reset columns
        </button>
      );
    }
    if (isWorkflowRail) {
      return (
        <button type="button" className="btn secondary text-xs" onClick={() => resetWorkflowRailDirectoryColumns()}>
          Reset columns
        </button>
      );
    }
    if (isWorkflowPanel) {
      return (
        <button type="button" className="btn secondary text-xs" onClick={() => resetWorkflowPanelDirectoryColumns()}>
          Reset columns
        </button>
      );
    }
    return undefined;
  }, [isWorkflowPanel, isWorkflowRail, screen]);

  return useMemo(() => {
    if (!cfg && screen !== "workflow") return null;

    const workflowColumnsOnly = screen === "workflow";
    const resolved = cfg ?? {
      kpis: [],
      charts: [],
      filters: [],
      headerStats: [],
      defaultKpiKeys: new Set<string>(),
      defaultChartKeys: new Set<string>(),
      defaultFilterKeys: new Set<string>(),
      defaultHeaderStatKeys: new Set<string>(),
    };

    return {
      kpis: workflowColumnsOnly ? [] : resolved.kpis,
      charts: workflowColumnsOnly ? [] : resolved.charts,
      filters: workflowColumnsOnly ? [] : resolved.filters,
      headerStats: workflowColumnsOnly ? [] : resolved.headerStats,
      defaultKpiKeys: workflowColumnsOnly ? new Set<string>() : resolved.defaultKpiKeys,
      defaultChartKeys: workflowColumnsOnly ? new Set<string>() : resolved.defaultChartKeys,
      defaultFilterKeys: workflowColumnsOnly ? new Set<string>() : resolved.defaultFilterKeys,
      defaultHeaderStatKeys: workflowColumnsOnly ? new Set<string>() : resolved.defaultHeaderStatKeys,
      tablePanel,
      tableSectionActions,
      tableActiveCount:
        screen === "profiles" ? hiddenProfileCols : workflowColumnsOnly ? hiddenWorkflowCols : 0,
      showPageSize: !workflowColumnsOnly,
      readPrefs: readHubListPrefsCore,
      patchPrefs: patchHubListPrefs,
      getScreen,
      onLog,
    };
  }, [
    cfg,
    getScreen,
    hiddenProfileCols,
    hiddenWorkflowCols,
    onLog,
    screen,
    tablePanel,
    tableSectionActions,
  ]);
}
