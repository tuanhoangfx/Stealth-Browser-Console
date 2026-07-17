import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DirectoryTableColumnsSettings,
  patchHubListPrefs,
  readHubListPrefsCore,
  type HubDirectoryDisplayPanelProps,
  type SubTabDisplayConfig,
} from "@tool-workspace/hub-ui";
import {
  countHiddenProfileDirectoryColumns,
  PROFILE_DIRECTORY_COLUMNS_CHANGE,
  profileDirectoryColumnPrefs,
  profileDirectoryColumnPresetsProp,
  resetProfileDirectoryColumns,
} from "../features/profiles/profile-directory-prefs";
import { profileDirectoryColumnItemsWithExtensionIcons } from "../features/profiles/profile-directory-display-items";
import { useExtensionIcons } from "../features/profiles/useExtensionIcons";
import {
  countHiddenWorkflowPanelDirectoryColumns,
  countHiddenWorkflowRailDirectoryColumns,
  WORKFLOW_DIRECTORY_COLUMN_ITEMS,
  WORKFLOW_PANEL_DIRECTORY_COLUMNS_CHANGE,
  WORKFLOW_RAIL_DIRECTORY_COLUMNS_CHANGE,
  resetWorkflowPanelDirectoryColumns,
  resetWorkflowRailDirectoryColumns,
  workflowPanelDirectoryColumnPrefs,
  workflowPanelDirectoryColumnPresetsProp,
  workflowRailDirectoryColumnPrefs,
  workflowRailDirectoryColumnPresetsProp,
} from "../features/workflows/workflow-directory-prefs";
import {
  countHiddenWorkflowStoreDirectoryColumns,
  WORKFLOW_STORE_DIRECTORY_COLUMNS_CHANGE,
  WORKFLOW_STORE_DIRECTORY_COLUMN_ITEMS,
  resetWorkflowStoreDirectoryColumns,
  workflowStoreDirectoryColumnPrefs,
  workflowStoreDirectoryColumnPresetsProp,
} from "../features/workflows/workflow-store-directory-prefs";
import {
  BACKUP_DIRECTORY_COLUMNS_CHANGE,
  BACKUP_DIRECTORY_COLUMN_ITEMS,
  backupDirectoryColumnPrefs,
  backupDirectoryColumnPresetsProp,
  countHiddenBackupDirectoryColumns,
  resetBackupDirectoryColumns,
} from "../features/system/backup/backup-directory-prefs";
import {
  EXTENSION_DIRECTORY_COLUMNS_CHANGE,
  EXTENSION_DIRECTORY_COLUMN_ITEMS,
  countHiddenExtensionDirectoryColumns,
  extensionDirectoryColumnPrefs,
  extensionDirectoryColumnPresetsProp,
  resetExtensionDirectoryColumns,
} from "../features/system/extensions/extension-directory-prefs";
import type { StealthScreen } from "./stealth-screen";
import type { StealthSystemTab } from "./stealth-system-tab";
import {
  PROFILES_DISPLAY_PREFS,
  SYSTEM_BACKUP_DISPLAY_PREFS,
  SYSTEM_EXTENSIONS_DISPLAY_PREFS,
  WORKFLOW_DISPLAY_PREFS,
  resolveScreenDisplayPrefs,
  type ScreenDisplayPrefsConfig,
} from "./display-prefs-registry";
import {
  patchSystemTabDisplay,
  readSystemTabDisplay,
  resetSystemTabDisplay,
  STEALTH_SYSTEM_SUBTAB_DISPLAY,
} from "./stealth-system-display-prefs";

export type StealthDirectoryDisplayVariant = "rail" | "panel" | "store";

const SYSTEM_SUBTAB_CFG: SubTabDisplayConfig = {
  screens: [...STEALTH_SYSTEM_SUBTAB_DISPLAY.screens],
  adapter: {
    read: (tab) => readSystemTabDisplay(tab as StealthSystemTab),
    patch: (tab, patch) => patchSystemTabDisplay(tab as StealthSystemTab, patch),
    reset: (tab) => resetSystemTabDisplay(tab as StealthSystemTab),
  },
  changeEvent: STEALTH_SYSTEM_SUBTAB_DISPLAY.changeEvent,
  logScope: STEALTH_SYSTEM_SUBTAB_DISPLAY.logScope,
};

function resolveSystemTabDisplayPrefs(tab: StealthSystemTab): ScreenDisplayPrefsConfig {
  if (tab === "extensions") return SYSTEM_EXTENSIONS_DISPLAY_PREFS;
  if (tab === "backup") return SYSTEM_BACKUP_DISPLAY_PREFS;
  return SYSTEM_BACKUP_DISPLAY_PREFS;
}

/** Tab display panel — profiles: KPI + columns; workflow: table columns; system tabs: sub-tab KPI + columns. */
export function useStealthDisplayPanelConfig(
  screen: StealthScreen,
  directoryVariant: StealthDirectoryDisplayVariant = "panel",
  systemTab?: StealthSystemTab,
): HubDirectoryDisplayPanelProps | null {
  const isSystemTab = screen === "system" && (systemTab === "backup" || systemTab === "extensions");
  const isWorkflowStore = screen === "workflow" && directoryVariant === "store";
  const isWorkflowRail = screen === "workflow" && directoryVariant === "rail";
  const isWorkflowPanel = screen === "workflow" && directoryVariant === "panel";

  const cfg = useMemo(() => {
    if (isSystemTab && systemTab) return resolveSystemTabDisplayPrefs(systemTab);
    return resolveScreenDisplayPrefs(screen);
  }, [isSystemTab, screen, systemTab]);

  const [hiddenProfileCols, setHiddenProfileCols] = useState(() =>
    screen === "profiles" ? countHiddenProfileDirectoryColumns() : 0,
  );
  const [hiddenBackupCols, setHiddenBackupCols] = useState(() =>
    systemTab === "backup" ? countHiddenBackupDirectoryColumns() : 0,
  );
  const [hiddenExtensionCols, setHiddenExtensionCols] = useState(() =>
    systemTab === "extensions" ? countHiddenExtensionDirectoryColumns() : 0,
  );
  const [hiddenWorkflowCols, setHiddenWorkflowCols] = useState(() =>
    isWorkflowStore
      ? countHiddenWorkflowStoreDirectoryColumns()
      : isWorkflowRail
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
    if (systemTab !== "backup") return;
    const sync = () => setHiddenBackupCols(countHiddenBackupDirectoryColumns());
    window.addEventListener(BACKUP_DIRECTORY_COLUMNS_CHANGE, sync);
    return () => window.removeEventListener(BACKUP_DIRECTORY_COLUMNS_CHANGE, sync);
  }, [systemTab]);

  useEffect(() => {
    if (systemTab !== "extensions") return;
    const sync = () => setHiddenExtensionCols(countHiddenExtensionDirectoryColumns());
    window.addEventListener(EXTENSION_DIRECTORY_COLUMNS_CHANGE, sync);
    return () => window.removeEventListener(EXTENSION_DIRECTORY_COLUMNS_CHANGE, sync);
  }, [systemTab]);

  useEffect(() => {
    if (!isWorkflowRail && !isWorkflowPanel && !isWorkflowStore) return;
    const event = isWorkflowStore
      ? WORKFLOW_STORE_DIRECTORY_COLUMNS_CHANGE
      : isWorkflowRail
        ? WORKFLOW_RAIL_DIRECTORY_COLUMNS_CHANGE
        : WORKFLOW_PANEL_DIRECTORY_COLUMNS_CHANGE;
    const sync = () =>
      setHiddenWorkflowCols(
        isWorkflowStore
          ? countHiddenWorkflowStoreDirectoryColumns()
          : isWorkflowRail
            ? countHiddenWorkflowRailDirectoryColumns()
            : countHiddenWorkflowPanelDirectoryColumns(),
      );
    window.addEventListener(event, sync);
    return () => window.removeEventListener(event, sync);
  }, [isWorkflowPanel, isWorkflowRail, isWorkflowStore]);

  const onLog = useCallback((scope: string, message: string) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("stealth-app-log", { detail: { scope, message } }));
  }, []);

  const extensionIcons = useExtensionIcons();
  const profileColumnItems = useMemo(
    () => (screen === "profiles" ? profileDirectoryColumnItemsWithExtensionIcons(extensionIcons) : []),
    [extensionIcons, screen],
  );

  const getScreen = useCallback(() => (isWorkflowStore ? "workflow-store" : screen), [isWorkflowStore, screen]);
  const getSystemTab = useCallback(() => systemTab ?? "", [systemTab]);
  const getSubTab = useCallback(() => (screen === "system" ? systemTab ?? "" : ""), [screen, systemTab]);

  const tablePanel: ReactNode = useMemo(() => {
    if (screen === "profiles") {
      return (
        <DirectoryTableColumnsSettings items={profileColumnItems} prefs={profileDirectoryColumnPrefs} />
      );
    }
    if (systemTab === "backup") {
      return (
        <DirectoryTableColumnsSettings items={BACKUP_DIRECTORY_COLUMN_ITEMS} prefs={backupDirectoryColumnPrefs} />
      );
    }
    if (systemTab === "extensions") {
      return (
        <DirectoryTableColumnsSettings
          items={EXTENSION_DIRECTORY_COLUMN_ITEMS}
          prefs={extensionDirectoryColumnPrefs}
        />
      );
    }
    if (isWorkflowStore) {
      return (
        <DirectoryTableColumnsSettings
          items={WORKFLOW_STORE_DIRECTORY_COLUMN_ITEMS}
          prefs={workflowStoreDirectoryColumnPrefs}
        />
      );
    }
    if (isWorkflowRail || isWorkflowPanel) {
      const prefs = isWorkflowRail ? workflowRailDirectoryColumnPrefs : workflowPanelDirectoryColumnPrefs;
      return <DirectoryTableColumnsSettings items={WORKFLOW_DIRECTORY_COLUMN_ITEMS} prefs={prefs} />;
    }
    return undefined;
  }, [isWorkflowPanel, isWorkflowRail, isWorkflowStore, profileColumnItems, screen, systemTab]);

  const tableSectionActions = useMemo(() => {
    if (screen === "profiles") {
      return (
        <button type="button" className="btn secondary text-xs" onClick={() => resetProfileDirectoryColumns()}>
          Reset columns
        </button>
      );
    }
    if (systemTab === "backup") {
      return (
        <button type="button" className="btn secondary text-xs" onClick={() => resetBackupDirectoryColumns()}>
          Reset columns
        </button>
      );
    }
    if (systemTab === "extensions") {
      return (
        <button type="button" className="btn secondary text-xs" onClick={() => resetExtensionDirectoryColumns()}>
          Reset columns
        </button>
      );
    }
    if (isWorkflowStore) {
      return (
        <button type="button" className="btn secondary text-xs" onClick={() => resetWorkflowStoreDirectoryColumns()}>
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
  }, [isWorkflowPanel, isWorkflowRail, isWorkflowStore, screen, systemTab]);

  return useMemo(() => {
    if (!cfg && screen !== "workflow" && !isSystemTab) return null;

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
      tableColumnPresets:
        screen === "profiles"
          ? profileDirectoryColumnPresetsProp
          : systemTab === "backup"
            ? backupDirectoryColumnPresetsProp
            : systemTab === "extensions"
              ? extensionDirectoryColumnPresetsProp
              : isWorkflowStore
                ? workflowStoreDirectoryColumnPresetsProp
                : isWorkflowPanel
                  ? workflowPanelDirectoryColumnPresetsProp
                  : isWorkflowRail
                    ? workflowRailDirectoryColumnPresetsProp
                    : undefined,
      tableSectionActions,
      tableActiveCount:
        screen === "profiles"
          ? hiddenProfileCols
          : systemTab === "backup"
            ? hiddenBackupCols
            : systemTab === "extensions"
              ? hiddenExtensionCols
              : workflowColumnsOnly
                ? hiddenWorkflowCols
                : 0,
      showPageSize: !workflowColumnsOnly,
      readPrefs: readHubListPrefsCore,
      patchPrefs: patchHubListPrefs,
      getScreen,
      getSystemTab: isSystemTab ? getSystemTab : undefined,
      getSubTab: isSystemTab ? getSubTab : undefined,
      subTabDisplay: isSystemTab ? SYSTEM_SUBTAB_CFG : undefined,
      onLog,
    };
  }, [
    cfg,
    getScreen,
    getSubTab,
    getSystemTab,
    hiddenBackupCols,
    hiddenExtensionCols,
    hiddenProfileCols,
    hiddenWorkflowCols,
    isSystemTab,
    isWorkflowPanel,
    isWorkflowRail,
    isWorkflowStore,
    onLog,
    screen,
    systemTab,
    tablePanel,
    tableSectionActions,
  ]);
}

export { PROFILES_DISPLAY_PREFS, SYSTEM_BACKUP_DISPLAY_PREFS, SYSTEM_EXTENSIONS_DISPLAY_PREFS, WORKFLOW_DISPLAY_PREFS };
