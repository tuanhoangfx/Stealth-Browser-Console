import { useEffect, useState } from "react";
import {
  HubDisplayPrefs,
  HubToolDetailModalSecondaryAction,
  DirectoryTableColumnsSettings,
  patchHubListPrefs,
  readHubListPrefsCore,
  type HubDisplayPrefsProps
} from "@tool-workspace/hub-ui";
import { SCREEN_DISPLAY_PREFS } from "../lib/display-prefs-registry";
import type { StealthScreen } from "../lib/stealth-screen";
import {
  useStealthGeneralSettingsToolSections,
  useStealthProfileSettingsToolSections
} from "../features/settings/stealth-settings-tool-sections";
import { StealthProfileSettingsFooterSave } from "../features/settings/StealthProfileSettingsFooterSave";
import { StealthSettingsSaveProvider } from "../features/settings/stealth-settings-save-context";
import {
  countHiddenProfileDirectoryColumns,
  PROFILE_DIRECTORY_COLUMNS_CHANGE,
  PROFILE_DIRECTORY_COLUMN_ITEMS,
  profileDirectoryColumnPrefs,
  resetProfileDirectoryColumns,
} from "../features/profiles/profile-directory-prefs";

export type StealthSettingsMode = "general" | "profile" | "tab";

type StealthDisplayPrefsProps = {
  screen: StealthScreen;
  sidebarRow?: boolean;
  scope?: HubDisplayPrefsProps["scope"];
  settingsMode?: StealthSettingsMode;
};

/** Settings modal — HubToolDetailModal · TOC · general (sidebar) vs tab screen panels. */
export function StealthDisplayPrefs({
  screen,
  sidebarRow = false,
  scope = "global",
  settingsMode: settingsModeProp
}: StealthDisplayPrefsProps) {
  const isGeneral =
    settingsModeProp === "general" || (!settingsModeProp && (scope === "global" || sidebarRow));
  const showTabProfilePanels = scope === "tab" && screen === "profiles";

  const generalSections = useStealthGeneralSettingsToolSections();
  const profileSections = useStealthProfileSettingsToolSections();

  const toolSections = isGeneral ? generalSections : showTabProfilePanels ? profileSections : [];

  const [hiddenProfileCols, setHiddenProfileCols] = useState(() =>
    showTabProfilePanels ? countHiddenProfileDirectoryColumns() : 0
  );

  useEffect(() => {
    if (!showTabProfilePanels) return;
    const sync = () => setHiddenProfileCols(countHiddenProfileDirectoryColumns());
    window.addEventListener(PROFILE_DIRECTORY_COLUMNS_CHANGE, sync);
    return () => window.removeEventListener(PROFILE_DIRECTORY_COLUMNS_CHANGE, sync);
  }, [showTabProfilePanels]);

  const hub = (
    <HubDisplayPrefs
      title="Settings"
      sidebarRow={sidebarRow}
      scope={scope}
      showRange={false}
      showLimit={false}
      filtersFromUrl={false}
      showHeaderPin={isGeneral}
      readPrefs={readHubListPrefsCore}
      patchPrefs={(patch) => patchHubListPrefs(patch)}
      getScreen={() => screen}
      getSubTab={() => ""}
      kpis={SCREEN_DISPLAY_PREFS[screen]?.kpis}
      charts={SCREEN_DISPLAY_PREFS[screen]?.charts}
      filters={SCREEN_DISPLAY_PREFS[screen]?.filters}
      headerStats={SCREEN_DISPLAY_PREFS[screen]?.headerStats}
      defaultKpiKeys={SCREEN_DISPLAY_PREFS[screen]?.defaultKpiKeys}
      defaultChartKeys={SCREEN_DISPLAY_PREFS[screen]?.defaultChartKeys}
      defaultFilterKeys={SCREEN_DISPLAY_PREFS[screen]?.defaultFilterKeys}
      defaultHeaderStatKeys={SCREEN_DISPLAY_PREFS[screen]?.defaultHeaderStatKeys}
      toolSections={toolSections}
      footerActions={showTabProfilePanels ? <StealthProfileSettingsFooterSave /> : undefined}
      tablePanel={
        showTabProfilePanels ? (
          <DirectoryTableColumnsSettings
            items={PROFILE_DIRECTORY_COLUMN_ITEMS}
            prefs={profileDirectoryColumnPrefs}
          />
        ) : undefined
      }
      tableActiveCount={showTabProfilePanels ? hiddenProfileCols : 0}
      tableSectionActions={
        showTabProfilePanels ? (
          <HubToolDetailModalSecondaryAction label="Reset columns" onClick={() => resetProfileDirectoryColumns()} />
        ) : undefined
      }
    />
  );

  if (showTabProfilePanels) {
    return <StealthSettingsSaveProvider>{hub}</StealthSettingsSaveProvider>;
  }

  return hub;
}
