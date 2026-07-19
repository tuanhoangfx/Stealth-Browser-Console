import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseAuthError } from "./supabase-auth-error";

/** Refresh when the access token is within this window of expiring. */
export const DEFAULT_NEAR_EXPIRY_MS = 2 * 60 * 1000;

export type EnsureFreshSessionConfig = {
  isConfigured: () => boolean;
  getClient: () => SupabaseClient | null;
  cacheSession?: (session: Session) => void;
  nearExpiryMs?: number;
};

/**
 * Guarantee a live, non-expired session before a mutation runs.
 * Backgrounded tabs throttle supabase-js autoRefresh — a save right after
 * refocus can hit an expired JWT and be lost to RLS.
 */
export function createEnsureFreshSession(
  config: EnsureFreshSessionConfig,
): (opts?: { force?: boolean }) => Promise<boolean> {
  const nearExpiryMs = config.nearExpiryMs ?? DEFAULT_NEAR_EXPIRY_MS;

  return async function ensureFreshSession(opts?: { force?: boolean }): Promise<boolean> {
    if (!config.isConfigured()) return false;
    const client = config.getClient();
    if (!client) return false;

    const { data } = await client.auth.getSession();
    const session = data.session;
    if (!session) return false;

    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
    const nearExpiry = !expiresAtMs || expiresAtMs < Date.now() + nearExpiryMs;
    if (!opts?.force && !nearExpiry) return true;

    const { data: refreshed, error } = await client.auth.refreshSession();
    if (error || !refreshed.session) return !nearExpiry;
    config.cacheSession?.(refreshed.session);
    return true;
  };
}

export type AuthWriteConfig = {
  ensureFresh: (opts?: { force?: boolean }) => Promise<boolean>;
};

/**
 * Run a write with an ensured-fresh session and one retry after a forced
 * refresh if the first attempt fails with an auth/JWT error.
 * `run` must build a fresh query each call — PostgREST builders are single-use.
 */
export function createAuthWrite(config: AuthWriteConfig) {
  return async function authWrite<R extends { error: unknown }>(
    run: () => PromiseLike<R>,
  ): Promise<R> {
    await config.ensureFresh();
    const first = await run();
    if (first.error && isSupabaseAuthError(first.error)) {
      await config.ensureFresh({ force: true });
      return run();
    }
    return first;
  };
}
