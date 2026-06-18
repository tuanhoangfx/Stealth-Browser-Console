export type StealthTheme = "dark" | "light";

export const STEALTH_CONSOLE_THEME_KEY = "stealth-console-theme";

export function readStoredThemeMode(): StealthTheme {
  if (typeof localStorage === "undefined") return "dark";
  return localStorage.getItem(STEALTH_CONSOLE_THEME_KEY) === "light" ? "light" : "dark";
}

export function syncDocumentTheme(mode: StealthTheme) {
  document.documentElement.classList.toggle("light", mode === "light");
}
