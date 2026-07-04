import type { NavStructureEntry } from "@tool-workspace/hub-ui";
import { navBadgeIconClass } from "@tool-workspace/hub-ui";
import { Archive, ClipboardList, Database, LayoutGrid, Settings2 } from "lucide-react";
import type { StealthScreen } from "./stealth-screen";
import type { StealthSystemTab } from "./stealth-system-tab";

export const STEALTH_NAV_SUBNAV_PREFIX = "p0003";
export const STEALTH_NAV_GROUP_IDS = ["system"] as const;
export const STEALTH_SYSTEM_GROUP_ID = "system";

/** System subnav items — P0004 SystemTabSubNav parity. */
export const STEALTH_SYSTEM_TAB_ITEMS = [
  { id: "overview" as const, label: "Overview", icon: LayoutGrid, iconTone: "indigo" as const },
  { id: "backup" as const, label: "Backup", icon: Archive, iconTone: "amber" as const },
];

/** Main nav — Profiles + Workflow + System (expandable: Overview / Backup). */
export const STEALTH_NAV_STRUCTURE: NavStructureEntry<StealthScreen, (typeof STEALTH_NAV_GROUP_IDS)[number], StealthSystemTab>[] = [
  { kind: "screen", screen: "profiles", label: "Profiles", icon: Database, iconTone: "emerald" },
  { kind: "screen", screen: "workflow", label: "Workflow", icon: ClipboardList, iconTone: "violet" },
  {
    kind: "group",
    navMode: "view",
    id: "system",
    label: "System",
    icon: Settings2,
    iconTone: "amber",
    screen: "system",
    defaultView: "overview",
    children: [
      { view: "overview", label: "Overview", icon: LayoutGrid, iconTone: "indigo" },
      { view: "backup", label: "Backup", icon: Archive, iconTone: "amber" },
    ],
  },
];

type StealthScreenNavEntry = Extract<
  (typeof STEALTH_NAV_STRUCTURE)[number],
  { kind: "screen" }
>;

function stealthScreenNavEntry(screen: StealthScreen): StealthScreenNavEntry {
  const entry = STEALTH_NAV_STRUCTURE.find(
    (item): item is StealthScreenNavEntry => item.kind === "screen" && item.screen === screen,
  );
  if (!entry) {
    if (screen === "system") {
      return {
        kind: "screen",
        screen: "system",
        label: "System",
        icon: Settings2,
        iconTone: "amber",
      };
    }
    throw new Error(`Unknown Stealth screen: ${screen}`);
  }
  return entry;
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
