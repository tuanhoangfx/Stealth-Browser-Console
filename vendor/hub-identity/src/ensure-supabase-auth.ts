import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_NEAR_EXPIRY_MS } from "./ensure-fresh-supabase-auth";
import { isAuthNetworkError } from "./supabase-auth-error";
import {
  isSessionNearExpiry,
  isSessionStillWriteable,
  isWorkspaceSessionExpiryFresh,
} from "./workspace-auth-session";
import type { ToolSessionSnapshot } from "./tool-session-cache";

export type EnsureSupabaseAuthConfig = {
  isConfigured: () => boolean;
  getClient: () => SupabaseClient | null;
  readSnapshot: () => ToolSessionSnapshot | null;
  cacheSession: (session: Session) => void;
  /** Drop tool snapshot when a hard-expired JWT cannot be refreshed (auth-invalid). */
  clearSession?: () => void;
  /** When true, sync live session back to cache (2FA vault pattern). */
  syncLiveSession?: boolean;
  /**
   * Refresh when the live/restored session expires within this many ms.
   * Defaults to `DEFAULT_NEAR_EXPIRY_MS` so cold tabs restore refresh_token
   * instead of painting a ghost "signed-in" UI with a dead GoTrue client.
   * Pass `null` to skip proactive refresh.
   */
  refreshNearExpiryMs?: number | null;
};

async function dropGhostSession(
  client: SupabaseClient,
  clearSession: (() => void) | undefined,
): Promise<void> {
  clearSession?.();
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    /* ignore — local clear is best-effort */
  }
}

/** Restore or verify a workspace Supabase JWT.
 * Live GoTrue wins when it matches the Hub snapshot user; a leftover persistSession
 * account is replaced by the dual-sign-in snapshot (Enzy Todo: see board, cannot PATCH).
 */
export function createEnsureSupabaseAuth(config: EnsureSupabaseAuthConfig): () => Promise<Session | null> {
  const nearMs =
    config.refreshNearExpiryMs === undefined
      ? DEFAULT_NEAR_EXPIRY_MS
      : config.refreshNearExpiryMs;

  return async function ensureSupabaseAuth(): Promise<Session | null> {
    if (!config.isConfigured()) return null;
    const client = config.getClient();
    if (!client) return null;

    const { data: existing } = await client.auth.getSession();
    let session = existing.session;
    const snap = config.readSnapshot();
    // persistSession can keep a leftover GoTrue user while Hub dual-sign-in
    // already wrote a different Data Box snapshot (Enzy Todo: see tasks, cannot PATCH).
    if (session && snap?.access_token && snap.user_id && snap.user_id !== session.user?.id) {
      const { data, error } = await client.auth.setSession({
        access_token: snap.access_token,
        refresh_token: snap.refresh_token || "",
      });
      if (!error && data.session) {
        session = data.session;
        config.cacheSession(session);
      } else if (!isAuthNetworkError(error)) {
        session = null;
      }
    }
    if (!session) {
      if (!snap?.access_token) return null;

      const { data, error } = await client.auth.setSession({
        access_token: snap.access_token,
        refresh_token: snap.refresh_token || "",
      });
      if (error || !data.session) {
        // Snapshot tokens dead (or network blocked setSession) — do not keep a tool-cache ghost.
        if (error && !isAuthNetworkError(error)) {
          await dropGhostSession(client, config.clearSession);
        }
        return null;
      }
      session = data.session;
      config.cacheSession(session);
    } else if (config.syncLiveSession) {
      config.cacheSession(session);
    }

    if (nearMs != null && session && isSessionNearExpiry(session, nearMs)) {
      try {
        const { data: refreshed, error } = await client.auth.refreshSession();
        if (!error && refreshed.session) {
          session = refreshed.session;
          config.cacheSession(session);
        } else if (isAuthNetworkError(error)) {
          if (!isSessionStillWriteable(session)) return null;
        } else if (!isWorkspaceSessionExpiryFresh(session.expires_at, 0)) {
          // Hard-expired JWT + failed refresh.
          // Auth-invalid (revoked refresh): drop GoTrue + tool cache so UI cannot look signed-in.
          await dropGhostSession(client, config.clearSession);
          return null;
        }
      } catch (err) {
        if (!isAuthNetworkError(err)) throw err;
        if (!isSessionStillWriteable(session)) return null;
      }
    }

    return session;
  };
}
