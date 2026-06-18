import {
  configureDirectoryPager,
  configureFilterIcons,
  configureHubChromePrefs,
  readHubListPrefsCore,
} from "@tool-workspace/hub-ui";
import { resolveStealthFilterAllIcon, resolveStealthFilterOptionIcon } from "./stealth-filter-icons";

export function setupHubUi() {
  configureFilterIcons({
    resolveOption: resolveStealthFilterOptionIcon,
    resolveAll: resolveStealthFilterAllIcon,
  });
  configureHubChromePrefs(() => {
    const prefs = readHubListPrefsCore();
    return {
      headerPin: prefs.headerPin,
      searchPin: prefs.searchPin,
    };
  });
  configureDirectoryPager({
    hideWhenSinglePage: () => true,
  });
}
