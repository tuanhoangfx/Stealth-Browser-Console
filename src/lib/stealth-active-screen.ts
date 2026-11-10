import type { StealthAndroidTab } from "./stealth-android-tab";
import type { StealthScreen } from "./stealth-screen";
import type { StealthSystemTab } from "./stealth-system-tab";
import type { StealthWorkflowTab } from "./stealth-workflow-tab";

/** Keyboard / log active screen id — mirrors hub `resolveHubActiveScreenId` + workflow/android sub-tab. */
export function resolveStealthActiveScreenId(
  screen: StealthScreen,
  options?: {
    androidTab?: StealthAndroidTab | null;
    systemTab?: StealthSystemTab | null;
    workflowTab?: StealthWorkflowTab | null;
  },
): string {
  if (screen === "android") {
    const tab = options?.androidTab?.trim();
    return tab === "farm" ? "android-farm" : "android";
  }
  if (screen === "system") {
    const tab = options?.systemTab?.trim();
    return tab ? `system-${tab}` : "system";
  }
  if (screen === "workflow") {
    const tab = options?.workflowTab?.trim();
    return tab === "store" ? "workflow-store" : "workflow";
  }
  return screen;
}
