import packageJson from "../../package.json";

/** App release label (keep in sync with package.json version). */
export const APP_VERSION = packageJson.version;

/** Sidebar brand — human name only (version lives in tab header). */
export const STEALTH_PRODUCT = {
  code: "P0003",
  name: "Stealth Browser Console",
} as const;
