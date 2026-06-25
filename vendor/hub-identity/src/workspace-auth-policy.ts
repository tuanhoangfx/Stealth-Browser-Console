import type { Session } from "@supabase/supabase-js";

/**
 * SSOT — workspace anonymous mode is disabled across all Hub-integrated tools.
 * Login is required before using any tool when Hub auth is enabled.
 */
export function isWorkspaceAnonymousAllowed(): boolean {
  return false;
}

/** Hub JWT session — not anonymous local mode. */
export function isRealHubWorkspaceSession(session: Session | null | undefined): boolean {
  if (!session?.access_token) return false;
  return session.access_token !== "offline" && session.user?.id !== "offline-user";
}

/** Anonymous / local workspace session — not a Hub JWT. */
export function isOfflineWorkspaceSession(
  session: Session | null | undefined,
  offline = false,
): boolean {
  if (isRealHubWorkspaceSession(session)) return false;
  if (offline) return true;
  if (!session?.access_token) return true;
  return session.access_token === "offline" || session.user?.id === "offline-user";
}

/** Login mandatory when Hub auth stack is enabled and configured. */
export function isWorkspaceAuthRequiredWhenEnabled(
  hubAuthEnabled: boolean,
  hubConfigured: boolean,
): boolean {
  return hubAuthEnabled && hubConfigured && !isWorkspaceAnonymousAllowed();
}
