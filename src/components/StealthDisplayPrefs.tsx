import {
  HubDisplayPrefs,
  patchHubListPrefs,
  readHubListPrefsCore,
  type HubDisplayPrefsProps,
} from "@tool-workspace/hub-ui";
import { SCREEN_DISPLAY_PREFS, resolveScreenDisplayPrefs } from "../lib/display-prefs-registry";
import type { StealthScreen } from "../lib/stealth-screen";
import {
  useStealthGeneralSettingsToolSections,
  useStealthProfileSettingsToolSections,
} from "../features/settings/stealth-settings-tool-sections";
import {
  StealthSettingsSaveProvider,
  useStealthSettingsSave,
} from "../features/settings/stealth-settings-save-context";

export type StealthSettingsMode = "general" | "profile" | "tab";

type StealthDisplayPrefsProps = {
  screen: StealthScreen;
  sidebarRow?: boolean;
  scope?: HubDisplayPrefsProps["scope"];
  settingsMode?: StealthSettingsMode;
};

function StealthDisplayPrefsInner({
  screen,
  sidebarRow = false,
  scope = "global",
  settingsMode: settingsModeProp,
}: StealthDisplayPrefsProps) {
  const { runAllSaves } = useStealthSettingsSave();
  const isGeneral =
    settingsModeProp === "general" || (!settingsModeProp && (scope === "global" || sidebarRow));
  const showTabProfilePanels = scope === "tab" && (screen === "profiles" || screen === "android");

  const generalSections = useStealthGeneralSettingsToolSections();
  const profileSections = useStealthProfileSettingsToolSections();

  const toolSections = isGeneral ? generalSections : showTabProfilePanels ? profileSections : generalSections;

  const screenPrefs = resolveScreenDisplayPrefs(screen) ?? SCREEN_DISPLAY_PREFS[screen];

  return (
    <HubDisplayPrefs
      title="Settings"
      sidebarRow={sidebarRow}
      scope={scope}
      showRange={false}
      showLimit={false}
      filtersFromUrl={false}
      showHeaderPin={true}
      readPrefs={readHubListPrefsCore}
      patchPrefs={(patch) => patchHubListPrefs(patch)}
      getScreen={() => screen}
      getSubTab={() => ""}
      kpis={screenPrefs?.kpis}
      charts={screenPrefs?.charts}
      filters={screenPrefs?.filters}
      headerStats={screenPrefs?.headerStats}
      defaultKpiKeys={screenPrefs?.defaultKpiKeys}
      defaultChartKeys={screenPrefs?.defaultChartKeys}
      defaultFilterKeys={screenPrefs?.defaultFilterKeys}
      defaultHeaderStatKeys={screenPrefs?.defaultHeaderStatKeys}
      toolSections={toolSections}
      onSaveExtra={() => runAllSaves()}
    />
  );
}

/** Settings modal — HubToolDetailModal · TOC · unified P0020 SSOT layout. */
export function StealthDisplayPrefs(props: StealthDisplayPrefsProps) {
  return (
    <StealthSettingsSaveProvider>
      <StealthDisplayPrefsInner {...props} />
    </StealthSettingsSaveProvider>
  );
}
