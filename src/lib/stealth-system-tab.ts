export type StealthSystemTab = "overview" | "backup";

export const STEALTH_SYSTEM_TABS = ["overview", "backup"] as const;

export function isStealthSystemTab(value: string): value is StealthSystemTab {
  return (STEALTH_SYSTEM_TABS as readonly string[]).includes(value);
}

export function defaultStealthSystemTab(): StealthSystemTab {
  return "overview";
}
