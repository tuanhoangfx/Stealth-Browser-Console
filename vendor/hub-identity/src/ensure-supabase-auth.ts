import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { ToolSessionSnapshot } from "./tool-session-cache";

export type EnsureSupabaseAuthConfig = {
  isConfigured: () => boolean;
  getClient: () => SupabaseClient | null;
  readSnapshot: () => ToolSessionSnapshot | null;
  cacheSession: (session: Session) => void;
  /** When true, sync live session back to cache (2FA vault pattern). */
  syncLiveSession?: boolean;
};

/** Restore or verify a workspace Supabase JWT — prefers live client session over cache. */
export function createEnsureSupabaseAuth(config: EnsureSupabaseAuthConfig): () => Promise<Session | null> {
  return async function ensureSupabaseAuth(): Promise<Session | null> {
    if (!config.isConfigured()) return null;
    const client = config.getClient();
    if (!client) return null;

    const { data: existing } = await client.auth.getSession();
    if (existing.session) {
      if (config.syncLiveSession) config.cacheSession(existing.session);
      return existing.session;
    }

    const snap = config.readSnapshot();
    if (!snap?.access_token) return null;

    const { data, error } = await client.auth.setSession({
      access_token: snap.access_token,
      refresh_token: snap.refresh_token || "",
    });
    if (error || !data.session) return null;
    config.cacheSession(data.session);
    return data.session;
  };
}
