import type { StealthScreen } from "./stealth-screen";
import { coerceStealthSystemTab, defaultStealthSystemTab, type StealthSystemTab } from "./stealth-system-tab";
import {
  defaultStealthWorkflowTab,
  isStealthWorkflowTab,
  type StealthWorkflowTab,
} from "./stealth-workflow-tab";

const SCREENS = new Set<StealthScreen>(["profiles", "workflow", "system"]);

export type StealthAppUrlState = {
  screen: StealthScreen;
  systemTab: StealthSystemTab;
  workflowTab: StealthWorkflowTab;
};

export function readStealthAppUrl(): StealthAppUrlState {
  if (typeof window === "undefined") {
    return {
      screen: "profiles",
      systemTab: defaultStealthSystemTab(),
      workflowTab: defaultStealthWorkflowTab(),
    };
  }
  const sp = new URLSearchParams(window.location.search);
  const screenRaw = sp.get("screen") ?? "";
  const screen: StealthScreen = SCREENS.has(screenRaw as StealthScreen)
    ? (screenRaw as StealthScreen)
    : "profiles";
  const stab = sp.get("stab") ?? "";
  const wtab = sp.get("wtab") ?? "";
  return {
    screen,
    systemTab: coerceStealthSystemTab(stab),
    workflowTab: isStealthWorkflowTab(wtab) ? wtab : defaultStealthWorkflowTab(),
  };
}

/** Persist screen + System/Workflow tab so F5 stays on Extensions / Store / Backup. */
export function writeStealthAppUrl(state: StealthAppUrlState): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (state.screen === "profiles") url.searchParams.delete("screen");
  else url.searchParams.set("screen", state.screen);
  if (state.screen === "system" && state.systemTab !== defaultStealthSystemTab()) {
    url.searchParams.set("stab", state.systemTab);
  } else {
    url.searchParams.delete("stab");
  }
  if (state.screen === "workflow" && state.workflowTab !== defaultStealthWorkflowTab()) {
    url.searchParams.set("wtab", state.workflowTab);
  } else {
    url.searchParams.delete("wtab");
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== cur) window.history.replaceState(null, "", next);
}
