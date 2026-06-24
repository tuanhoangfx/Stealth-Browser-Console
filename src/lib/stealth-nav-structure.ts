import type { NavScreenNavItem } from "@tool-workspace/hub-ui";
import { navBadgeIconClass } from "@tool-workspace/hub-ui";
import { ClipboardList, Database, Settings2 } from "lucide-react";
import type { StealthScreen } from "./stealth-screen";

export const STEALTH_NAV_SUBNAV_PREFIX = "p0003";

/** Main nav — Profiles + Workflow + System (Settings via header/sidebar gear modal). */
export const STEALTH_NAV_STRUCTURE: NavScreenNavItem<StealthScreen>[] = [
  { kind: "screen", screen: "profiles", label: "Profiles", icon: Database, iconTone: "emerald" },
  { kind: "screen", screen: "workflow", label: "Workflow", icon: ClipboardList, iconTone: "violet" },
  { kind: "screen", screen: "system", label: "System", icon: Settings2, iconTone: "cyan" },
];

type StealthScreenNavEntry = Extract<
  (typeof STEALTH_NAV_STRUCTURE)[number],
  { kind: "screen" }
>;

function stealthScreenNavEntry(screen: StealthScreen): StealthScreenNavEntry {
  const entry = STEALTH_NAV_STRUCTURE.find(
    (item): item is StealthScreenNavEntry => item.kind === "screen" && item.screen === screen,
  );
  if (!entry) throw new Error(`Unknown Stealth screen: ${screen}`);
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
