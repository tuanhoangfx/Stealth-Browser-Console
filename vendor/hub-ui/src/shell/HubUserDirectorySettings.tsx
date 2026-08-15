import { HubDisplayPrefs } from "../display-prefs/HubDisplayPrefs";
import type { HubDisplayPrefsProps } from "../display-prefs/types";

export type HubUserDirectorySettingsProps = Omit<
  HubDisplayPrefsProps,
  "scope" | "sidebarRow" | "showRange" | "showLimit" | "title"
>;

/**
 * Golden User-directory Settings trigger.
 * Products supply only their directory-specific display preferences; the header
 * contract stays P0004-aligned as `Settings` in tab scope without range/limit controls.
 */
export function HubUserDirectorySettings(props: HubUserDirectorySettingsProps) {
  return (
    <HubDisplayPrefs
      {...props}
      title="Settings"
      scope="tab"
      showRange={false}
      showLimit={false}
    />
  );
}
