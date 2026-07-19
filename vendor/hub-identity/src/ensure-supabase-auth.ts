import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { ToolSessionSnapshot } from "./tool-session-cache";

export type EnsureSupabaseAuthConfig = {
  isConfigured: () => boolean;
  getClient: () => SupabaseClient | null;
  readSnapshot: () => ToolSessionSnapshot | null;
  cacheSession: (session: Session) => void;
  /** When true, sync live session back to cache (2FA vault pattern). */
  syncLiveSession?: boolean;
  /**
   * When set, refresh the live session if it expires within this many ms.
   * Prevents backgrounded-tab JWT expiry from failing the next write.
   */
  refreshNearExpiryMs?: number;
};

/** Restore or verify a workspace Supabase JWT — prefers live client session over cache. */
export function createEnsureSupabaseAuth(config: EnsureSupabaseAuthConfig): () => Promise<Session | null> {
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
      if (error || !data.session) return null;
      session = data.session;
      config.cacheSession(session);
    } else if (config.syncLiveSession) {
      config.cacheSession(session);
    }

    const nearMs = config.refreshNearExpiryMs;
    if (nearMs != null && session) {
      const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
      const nearExpiry = !expiresAtMs || expiresAtMs < Date.now() + nearMs;
      if (nearExpiry) {
        const { data: refreshed, error } = await client.auth.refreshSession();
        if (!error && refreshed.session) {
          session = refreshed.session;
          config.cacheSession(session);
        }
      }
    }

    return session;
  };
}
