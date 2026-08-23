import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { HUB_AUTH_FETCH_RETRY_DELAY_MS } from "./hub-auth-fetch";
import { isAuthNetworkError, isSupabaseAuthError } from "./supabase-auth-error";
import { isSessionNearExpiry, isSessionStillWriteable } from "./workspace-auth-session";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asNetworkWriteError(err: unknown): { message: string; code: string } {
  const message =
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message ?? "Failed to fetch")
        : String(err ?? "Failed to fetch");
  return { message, code: "NETWORK" };
}

/** Refresh when the access token is within this window of expiring. */
export const DEFAULT_NEAR_EXPIRY_MS = 2 * 60 * 1000;

/** Synthetic error when a mutation would otherwise run as anon (no JWT). */
export const AUTH_WRITE_REQUIRED_ERROR = {
  message: "Sign in required",
  code: "AUTH_REQUIRED",
  status: 401,
} as const;

export type EnsureFreshSessionConfig = {
  isConfigured: () => boolean;
  getClient: () => SupabaseClient | null;
  cacheSession?: (session: Session) => void;
  nearExpiryMs?: number;
  /**
   * When GoTrue `getSession()` is empty, restore from tool-session cache /
   * dual-sign-in snapshot (e.g. `createEnsureSupabaseAuth`). Prevents CRM
   * Detail Save from writing as `anon` while React still paints a cached session.
   */
  restoreSession?: () => Promise<Session | null>;
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

    let session = (await client.auth.getSession()).data.session;
    if (!session) {
      if (!config.restoreSession) return false;
      try {
        session = await config.restoreSession();
      } catch (err) {
        if (isAuthNetworkError(err)) return false;
        throw err;
      }
      if (!session) return false;
      // restoreSession (usually createEnsureSupabaseAuth) already refreshed near-expiry.
      if (!opts?.force) return true;
    }

    if (!opts?.force && !isSessionNearExpiry(session, nearExpiryMs)) return true;

    try {
      const { data: refreshed, error } = await client.auth.refreshSession();
      if (!error && refreshed.session) {
        config.cacheSession?.(refreshed.session);
        return true;
      }
      if (opts?.force && config.restoreSession) {
        try {
          const restored = await config.restoreSession();
          if (restored) return true;
        } catch (err) {
          if (!isAuthNetworkError(err)) throw err;
        }
      }
      // Home Server GoTrue blip: keep a still-valid JWT so Product/Todo Save can write.
      return isSessionStillWriteable(session);
    } catch (err) {
      if (isAuthNetworkError(err)) return isSessionStillWriteable(session);
      throw err;
    }
  };
}

export type AuthWriteConfig = {
  ensureFresh: (opts?: { force?: boolean }) => Promise<boolean>;
};

/**
 * Run a write with an ensured-fresh session and one retry after a forced
 * refresh if the first attempt fails with an auth/JWT error.
 * Also retries one Home Server / CF `Failed to fetch` (same class as login).
 * `run` must build a fresh query each call — PostgREST builders are single-use.
 *
 * If ensureFresh fails, does **not** run the mutation as anon (Postgres 42501
 * "permission denied for table …").
 */
export function createAuthWrite(config: AuthWriteConfig) {
  return async function authWrite<R extends { error: unknown }>(
    run: () => PromiseLike<R>,
  ): Promise<R> {
    let ready = false;
    try {
      ready = await config.ensureFresh();
    } catch (err) {
      if (!isAuthNetworkError(err)) throw err;
      ready = false;
    }
    if (!ready) {
      return { error: { ...AUTH_WRITE_REQUIRED_ERROR } } as R;
    }

    const runSafe = async (): Promise<R> => {
      try {
        return await run();
      } catch (err) {
        if (isAuthNetworkError(err)) return { error: asNetworkWriteError(err) } as R;
        throw err;
      }
    };

    const first = await runSafe();
    if (first.error && isSupabaseAuthError(first.error)) {
      const refreshed = await config.ensureFresh({ force: true });
      if (!refreshed) {
        return { error: { ...AUTH_WRITE_REQUIRED_ERROR } } as R;
      }
      return runSafe();
    }
    if (first.error && isAuthNetworkError(first.error)) {
      await sleep(HUB_AUTH_FETCH_RETRY_DELAY_MS);
      return runSafe();
    }
    return first;
  };
}
