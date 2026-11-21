import { isWorkspaceAnonymousAllowed } from "@tool-workspace/hub-identity";

/** True when running on local machine (Electron desktop `file://`, `window.stealthApi`, or loopback `127.0.0.1` / `localhost`). */
export function isLocalStealthRuntime(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  if ("stealthApi" in window && Boolean((window as { stealthApi?: unknown }).stealthApi)) {
    return true;
  }
  const { protocol, hostname } = window.location;
  if (protocol === "file:") return true;
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]") {
    return true;
  }
  return false;
}

/** True only for automated Playwright / `?smoke=1` test runs on local runtime. */
function isAutomatedStealthSmoke(): boolean {
  if (typeof window === "undefined") return false;
  if (window.navigator?.webdriver === true) return true;
  return /[?&](smoke|mobileSmoke)=1\b/i.test(window.location.search || "");
}

/**
 * Hub sign-in gate — ON by default for remote web and packaged Desktop Prod.
 * Opt out completely with `VITE_STEALTH_HUB_AUTH=0` in `.env.local`.
 */
export function isStealthHubAuthEnabled(): boolean {
  const raw = import.meta.env.VITE_STEALTH_HUB_AUTH;
  if (raw === "0" || raw === "false") return false;
  return true;
}

/**
 * Hub sign-in is mandatory for packaged Desktop Prod builds (even on `file://` / `127.0.0.1`)
 * so installed apps always bind user identity before syncing data.
 * Only automated webdriver/`?smoke=1` smokes or explicit `VITE_STEALTH_AUTH_OPTIONAL=1` bypasses.
 */
export function isStealthHubAuthOptional(): boolean {
  if (import.meta.env.VITE_STEALTH_FORCE_HUB_AUTH === "1") return false;
  if (import.meta.env.VITE_STEALTH_AUTH_OPTIONAL === "1" || import.meta.env.VITE_STEALTH_AUTH_OPTIONAL === "true") {
    return true;
  }
  if (isLocalStealthRuntime() && isAutomatedStealthSmoke()) return true;
  return isWorkspaceAnonymousAllowed();
}
