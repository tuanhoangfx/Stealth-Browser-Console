export type StealthAndroidTab = "profiles" | "farm";

export const STEALTH_ANDROID_TABS = ["profiles", "farm"] as const;

export function isStealthAndroidTab(value: string): value is StealthAndroidTab {
  return (STEALTH_ANDROID_TABS as readonly string[]).includes(value);
}

export function defaultStealthAndroidTab(): StealthAndroidTab {
  return "profiles";
}
