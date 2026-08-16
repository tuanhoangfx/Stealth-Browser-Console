import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_NEAR_EXPIRY_MS } from "./ensure-fresh-supabase-auth";
import { isWorkspaceSessionExpiryFresh } from "./workspace-auth-session";
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

/** GoTrue / browser network failure — refresh may still succeed on retry. */
export function isAuthNetworkError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");
  return /failed to fetch|network|timeout|econnreset|etimedout|fetch failed|load failed/i.test(message);
}

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

/** Restore or verify a workspace Supabase JWT — prefers live client session over cache. */
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
    if (!session) {
      const snap = config.readSnapshot();
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

    if (nearMs != null && session) {
      const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
      const nearExpiry = !expiresAtMs || expiresAtMs < Date.now() + nearMs;
      if (nearExpiry) {
        const { data: refreshed, error } = await client.auth.refreshSession();
        if (!error && refreshed.session) {
          session = refreshed.session;
          config.cacheSession(session);
        } else if (!isWorkspaceSessionExpiryFresh(session.expires_at, 0)) {
          // Hard-expired JWT + failed refresh.
          // Network blip: keep local tokens for retry; do not paint a usable session.
          // Auth-invalid (revoked refresh): drop GoTrue + tool cache so UI cannot look signed-in.
          if (!isAuthNetworkError(error)) {
            await dropGhostSession(client, config.clearSession);
          }
          return null;
        }
      }
    }

    return session;
  };
}
