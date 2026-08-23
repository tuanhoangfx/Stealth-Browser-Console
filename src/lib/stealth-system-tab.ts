import { ACTIVE_DESIGN_COUNT } from "../features/system/design-template/design-registry";

export type StealthSystemTab = "extensions" | "backup" | "design";

export const STEALTH_SYSTEM_TABS = ["extensions", "backup", "design"] as const;

/** Design nav item — only while a mockup review is registered (SSOT design-preview-5). */
export function isStealthDesignTabVisible(): boolean {
  return ACTIVE_DESIGN_COUNT > 0;
}

export function isStealthSystemTab(value: string): value is StealthSystemTab {
  if (value === "design") return isStealthDesignTabVisible();
  return value === "extensions" || value === "backup";
}

export function defaultStealthSystemTab(): StealthSystemTab {
  return "extensions";
}

/** Map leftover Overview / hidden Design URLs onto a live System tab. */
export function coerceStealthSystemTab(value: string): StealthSystemTab {
  if (value === "backup") return "backup";
  if (value === "design" && isStealthDesignTabVisible()) return "design";
  return "extensions";
}
