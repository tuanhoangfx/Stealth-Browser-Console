import type { NavScreenNavItem } from "@tool-workspace/hub-ui";
import { ClipboardList, Database, Settings2 } from "lucide-react";
import type { StealthScreen } from "./stealth-screen";

export const STEALTH_NAV_SUBNAV_PREFIX = "p0003";

/** Main nav — Profiles + Workflow + System (Settings via header/sidebar gear modal). */
export const STEALTH_NAV_STRUCTURE: NavScreenNavItem<StealthScreen>[] = [
  { kind: "screen", screen: "profiles", label: "Profiles", icon: Database, iconTone: "emerald" },
  { kind: "screen", screen: "workflow", label: "Workflow", icon: ClipboardList, iconTone: "violet" },
  { kind: "screen", screen: "system", label: "System", icon: Settings2, iconTone: "cyan" },
];
