export type StealthSystemTab = "overview" | "backup" | "design";

export const STEALTH_SYSTEM_TABS = ["overview", "backup", "design"] as const;

export function isStealthSystemTab(value: string): value is StealthSystemTab {
  return (STEALTH_SYSTEM_TABS as readonly string[]).includes(value);
}

export function defaultStealthSystemTab(): StealthSystemTab {
  return "overview";
}
