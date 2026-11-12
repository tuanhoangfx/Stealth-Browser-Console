import packageJson from "../../package.json";

/** App release label (keep in sync with package.json version). */
export const APP_VERSION = packageJson.version;

/** Sidebar brand — human name only (version lives in tab header). */
export const STEALTH_PRODUCT = {
  code: "P0003",
  name: "Stealth Browser Console",
} as const;

export const STEALTH_PUBLIC_ORIGIN = "https://stealth.infi28.com";
export const STEALTH_INTRO_URL = `${STEALTH_PUBLIC_ORIGIN}/intro/`;
export const STEALTH_USER_DOWNLOAD_URL = `${STEALTH_INTRO_URL}download/`;
export const STEALTH_LATEST_RELEASE_URL =
  "https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/latest";

/** Open P0003 public guide/intro page in a new tab or system browser. */
export function openStealthGuide(subpath = ""): void {
  const clean = String(subpath || "").replace(/^\/+/, "");
  const url = clean ? `${STEALTH_INTRO_URL}${clean}` : STEALTH_INTRO_URL;
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
