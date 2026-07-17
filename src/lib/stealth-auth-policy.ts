import { isWorkspaceAnonymousAllowed } from "@tool-workspace/hub-identity";

/**
 * Hub sign-in gate — ON by default (workspace login required).
 * Opt out only with `VITE_STEALTH_HUB_AUTH=0` in `.env.local`.
 */
export function isStealthHubAuthEnabled(): boolean {
  const raw = import.meta.env.VITE_STEALTH_HUB_AUTH;
  if (raw === "0" || raw === "false") return false;
  return true;
}

/** Anonymous mode is disabled workspace-wide — login required when Hub auth is on. */
export function isStealthHubAuthOptional(): boolean {
  return isWorkspaceAnonymousAllowed();
}
