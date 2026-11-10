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

/**
 * Hub sign-in gate — ON by default for remote web, optional/bypassed on Local runtime.
 * Opt out completely with `VITE_STEALTH_HUB_AUTH=0` in `.env.local`.
 */
export function isStealthHubAuthEnabled(): boolean {
  const raw = import.meta.env.VITE_STEALTH_HUB_AUTH;
  if (raw === "0" || raw === "false") return false;
  return true;
}

/**
 * Local desktop & loopback (`127.0.0.1` / `localhost` / `file://` / `window.stealthApi`)
 * do not require Hub sign-in to use Stealth Browser Console unless `VITE_STEALTH_FORCE_HUB_AUTH=1`.
 */
export function isStealthHubAuthOptional(): boolean {
  if (import.meta.env.VITE_STEALTH_FORCE_HUB_AUTH === "1") return false;
  if (import.meta.env.VITE_STEALTH_AUTH_OPTIONAL === "1" || import.meta.env.VITE_STEALTH_AUTH_OPTIONAL === "true") {
    return true;
  }
  if (isLocalStealthRuntime()) return true;
  return isWorkspaceAnonymousAllowed();
}
