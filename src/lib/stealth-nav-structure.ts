import type { NavStructureEntry } from "@tool-workspace/hub-ui";
import { isNavViewGroup, navBadgeIconClass } from "@tool-workspace/hub-ui";
import { Archive, ClipboardList, Database, MonitorSmartphone, Palette, Puzzle, Settings2, Shield, Smartphone, Store } from "lucide-react";
import type { StealthAndroidTab } from "./stealth-android-tab";
import type { StealthScreen } from "./stealth-screen";
import { isStealthDesignTabVisible, type StealthSystemTab } from "./stealth-system-tab";
import type { StealthWorkflowTab } from "./stealth-workflow-tab";

export const STEALTH_NAV_SUBNAV_PREFIX = "p0003";
export const STEALTH_NAV_GROUP_IDS = ["antidetect", "workflow", "system"] as const;
export const STEALTH_ANTIDETECT_GROUP_ID = "antidetect";
export const STEALTH_ANDROID_GROUP_ID = "antidetect";
export const STEALTH_SYSTEM_GROUP_ID = "system";
export const STEALTH_WORKFLOW_GROUP_ID = "workflow";

function stealthSystemNavChildren(): Array<{
  view: StealthSystemTab;
  label: string;
  icon: typeof Puzzle;
  iconTone: "fuchsia" | "cyan" | "amber";
}> {
  const children: Array<{
    view: StealthSystemTab;
    label: string;
    icon: typeof Puzzle;
    iconTone: "fuchsia" | "cyan" | "amber";
  }> = [
    { view: "extensions", label: "Extensions", icon: Puzzle, iconTone: "cyan" },
    { view: "backup", label: "Backup", icon: Archive, iconTone: "amber" },
  ];
  if (isStealthDesignTabVisible()) {
    children.unshift({ view: "design", label: "Design", icon: Palette, iconTone: "fuchsia" });
  }
  return children;
}

/** Workflow subnav — editor (scripts) + Store. */
export const STEALTH_WORKFLOW_TAB_ITEMS = [
  { id: "editor" as const, label: "Scripts", icon: ClipboardList, iconTone: "violet" as const },
  { id: "store" as const, label: "Store", icon: Store, iconTone: "sky" as const },
];

/** Main nav — Antidetect (Profiles / Android / Mobile Farm) + Workflow (Scripts / Store) + System (Extensions / Backup; Design when reviewing). */
export const STEALTH_NAV_STRUCTURE: NavStructureEntry<
  StealthScreen,
  (typeof STEALTH_NAV_GROUP_IDS)[number],
  StealthAndroidTab | StealthSystemTab | StealthWorkflowTab
>[] = [
  {
    kind: "group",
    navMode: "screen",
    id: "antidetect",
    label: "Antidetect",
    icon: Shield,
    iconTone: "emerald",
    defaultScreen: "profiles",
    children: [
      { screen: "profiles", label: "Profiles", icon: Database, iconTone: "emerald" },
      { screen: "android", label: "Android", icon: Smartphone, iconTone: "cyan" },
    ],
  },
  {
    kind: "group",
    navMode: "view",
    id: "workflow",
    label: "Workflow",
    icon: ClipboardList,
    iconTone: "violet",
    screen: "workflow",
    defaultView: "editor",
    children: [
      { view: "editor", label: "Scripts", icon: ClipboardList, iconTone: "violet" },
      { view: "store", label: "Store", icon: Store, iconTone: "sky" },
    ],
  },
  {
    kind: "group",
    navMode: "view",
    id: "system",
    label: "System",
    icon: Settings2,
    iconTone: "amber",
    screen: "system",
    defaultView: "extensions",
    children: stealthSystemNavChildren(),
  },
];

function stealthScreenNavEntry(screen: StealthScreen) {
  if (screen === "profiles") {
    return {
      kind: "screen" as const,
      screen: "profiles" as const,
      label: "Profiles",
      icon: Database,
      iconTone: "emerald" as const,
    };
  }
  if (screen === "android") {
    return {
      kind: "screen" as const,
      screen: "android" as const,
      label: "Android",
      icon: Smartphone,
      iconTone: "cyan" as const,
    };
  }
  const entry = STEALTH_NAV_STRUCTURE.find((item) => {
    if (item.kind === "screen" && item.screen === screen) return true;
    if (item.kind === "group" && item.navMode === "view" && item.screen === screen) return true;
    return false;
  });
  if (!entry) {
    if (screen === "system") {
      return {
        kind: "screen" as const,
        screen: "system" as const,
        label: "System",
        icon: Settings2,
        iconTone: "amber" as const,
      };
    }
    if (screen === "workflow") {
      return {
        kind: "screen" as const,
        screen: "workflow" as const,
        label: "Workflow",
        icon: ClipboardList,
        iconTone: "violet" as const,
      };
    }
    throw new Error(`Unknown Stealth screen: ${screen}`);
  }
  if (entry.kind === "group" && isNavViewGroup(entry)) {
    return {
      kind: "screen" as const,
      screen: entry.screen,
      label: entry.label,
      icon: entry.icon,
      iconTone: entry.iconTone,
    };
  }
  if (entry.kind === "screen") return entry;
  throw new Error(`Unsupported nav entry for screen: ${screen}`);
}

/** Header chrome SSOT — same label/icon/tone as sidebar active screen. */
export function stealthScreenChrome(screen: StealthScreen) {
  const entry = stealthScreenNavEntry(screen);
  return {
    label: entry.label,
    icon: entry.icon,
    titleIconClass: navBadgeIconClass(entry.iconTone),
  };
}

export function stealthWorkflowTabChrome(tab: StealthWorkflowTab) {
  const group = STEALTH_NAV_STRUCTURE.find((item) => item.kind === "group" && item.id === "workflow");
  if (!group || group.kind !== "group" || group.navMode !== "view") {
    return { label: tab, icon: ClipboardList, titleIconClass: navBadgeIconClass("violet") };
  }
  const child = group.children.find((c) => c.view === tab);
  if (!child) return stealthScreenChrome("workflow");
  return {
    label: child.label,
    icon: child.icon,
    titleIconClass: navBadgeIconClass(child.iconTone),
  };
}

export function stealthSystemTabChrome(tab: StealthSystemTab) {
  const group = STEALTH_NAV_STRUCTURE.find((item) => item.kind === "group" && item.id === "system");
  if (!group || group.kind !== "group" || group.navMode !== "view") {
    return { label: tab, icon: Settings2, titleIconClass: navBadgeIconClass("cyan") };
  }
  const child = group.children.find((c) => c.view === tab);
  if (!child) return stealthScreenChrome("system");
  return {
    label: child.label,
    icon: child.icon,
    titleIconClass: navBadgeIconClass(child.iconTone),
  };
}
