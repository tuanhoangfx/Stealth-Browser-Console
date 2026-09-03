import type { StealthScreen } from "./stealth-screen";
import { coerceStealthSystemTab, defaultStealthSystemTab, type StealthSystemTab } from "./stealth-system-tab";
import {
  defaultStealthWorkflowTab,
  isStealthWorkflowTab,
  type StealthWorkflowTab,
} from "./stealth-workflow-tab";

const SCREENS = new Set<StealthScreen>(["profiles", "workflow", "system"]);

const SCREEN_PATH: Record<StealthScreen, string> = {
  profiles: "/profiles",
  workflow: "/workflow",
  system: "/system",
};

export type StealthAppUrlState = {
  screen: StealthScreen;
  systemTab: StealthSystemTab;
  workflowTab: StealthWorkflowTab;
};

function isFileProtocol(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "file:";
}

function pathnameToScreen(pathname: string): StealthScreen | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  // `/` is ambiguous — prefer legacy `?screen=` before defaulting to profiles.
  if (normalized === "/") return null;
  if (normalized === "/profiles" || normalized.startsWith("/profiles/")) return "profiles";
  if (normalized === "/workflow" || normalized.startsWith("/workflow/")) return "workflow";
  if (normalized === "/system" || normalized.startsWith("/system/")) return "system";
  return null;
}

function readStateFromLocation(): StealthAppUrlState {
  const sp = new URLSearchParams(window.location.search);
  const fromPath = pathnameToScreen(window.location.pathname);
  const screenRaw = sp.get("screen") ?? "";
  const screen: StealthScreen =
    fromPath ?? (SCREENS.has(screenRaw as StealthScreen) ? (screenRaw as StealthScreen) : "profiles");
  const stab = sp.get("stab") ?? "";
  const wtab = sp.get("wtab") ?? "";
  return {
    screen,
    systemTab: coerceStealthSystemTab(stab),
    workflowTab: isStealthWorkflowTab(wtab) ? wtab : defaultStealthWorkflowTab(),
  };
}

function buildStealthUrl(state: StealthAppUrlState): string {
  const sp = new URLSearchParams(window.location.search);
  // Drop screen noise; keep unrelated prefs.
  sp.delete("screen");

  if (state.screen === "system" && state.systemTab !== defaultStealthSystemTab()) {
    sp.set("stab", state.systemTab);
  } else {
    sp.delete("stab");
  }
  if (state.screen === "workflow" && state.workflowTab !== defaultStealthWorkflowTab()) {
    sp.set("wtab", state.workflowTab);
  } else {
    sp.delete("wtab");
  }

  if (isFileProtocol()) {
    if (state.screen === "profiles") sp.delete("screen");
    else sp.set("screen", state.screen);
    const q = sp.toString();
    const base = window.location.pathname || "index.html";
    return q ? `${base}?${q}` : base;
  }

  const path = SCREEN_PATH[state.screen];
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}

export function readStealthAppUrl(): StealthAppUrlState {
  if (typeof window === "undefined") {
    return {
      screen: "profiles",
      systemTab: defaultStealthSystemTab(),
      workflowTab: defaultStealthWorkflowTab(),
    };
  }
  return readStateFromLocation();
}

/** Persist screen + System/Workflow tab so F5 stays on Extensions / Store / Backup. */
export function writeStealthAppUrl(state: StealthAppUrlState): void {
  if (typeof window === "undefined") return;
  const next = buildStealthUrl(state);
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const withHash = `${next}${window.location.hash || ""}`;
  if (withHash !== cur) window.history.replaceState(null, "", withHash);
}

/** Boot: migrate `?screen=` → `/profiles`|/workflow|/system on HTTP. */
export function migrateStealthAppUrl(): StealthAppUrlState {
  const state = readStateFromLocation();
  writeStealthAppUrl(state);
  return state;
}
