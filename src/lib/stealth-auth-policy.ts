import { isWorkspaceAnonymousAllowed } from "@tool-workspace/hub-identity";

/**
 * Hub sign-in gate — disabled by default (local Stealth console).
 * Set `VITE_STEALTH_HUB_AUTH=1` in `.env.local` when re-enabling workspace login.
 */
export function isStealthHubAuthEnabled(): boolean {
  const raw = import.meta.env.VITE_STEALTH_HUB_AUTH;
  return raw === "1" || raw === "true";
}

/** Anonymous mode is disabled workspace-wide — login required when Hub auth is on. */
export function isStealthHubAuthOptional(): boolean {
  return isWorkspaceAnonymousAllowed();
}
