import { useEffect, useRef } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { promiseWithTimeout } from "./promise-timeout";
import { subscribeHubIdentity } from "./hub-identity-cache";

/** Cold boot cap — cached session paints immediately; this only bounds first `ensureAuth` wait. */
export const WORKSPACE_AUTH_BOOT_TIMEOUT_MS = 5_000;

/** Dual sign-in (Hub + data plane) — User ID may resolve + try several auth emails sequentially. */
export const WORKSPACE_DUAL_SIGN_IN_TIMEOUT_MS = 30_000;

/** Refresh margin — a token this close to expiry is treated as stale. */
export const WORKSPACE_SESSION_FRESH_BUFFER_MS = 60_000;

/** `expires_at` (seconds, GoTrue) still valid past the refresh margin. */
export function isWorkspaceSessionExpiryFresh(
  expiresAt: number | null | undefined,
  bufferMs = WORKSPACE_SESSION_FRESH_BUFFER_MS,
): boolean {
  if (!expiresAt) return false;
  return expiresAt * 1000 > Date.now() + bufferMs;
}

export function sessionsEqual(a: Session | null | undefined, b: Session | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.user?.id === b.user?.id && a.access_token === b.access_token;
}

export async function resolveWithBootTimeout<T>(
  resolver: () => Promise<T>,
  boot: boolean | undefined,
  fallback: T,
  timeoutMs = WORKSPACE_AUTH_BOOT_TIMEOUT_MS,
): Promise<T> {
  if (!boot) return resolver();
  return promiseWithTimeout(resolver(), timeoutMs, fallback);
}

/** Cross-tab hub identity cache changed — optional debounce before refresh. */
export function useHubIdentityRefreshEffect(
  onRefresh: () => void,
  opts?: { debounceMs?: number; syncLabels?: () => void },
): void {
  const onRefreshRef = useRef(onRefresh);
  const syncLabelsRef = useRef(opts?.syncLabels);
  onRefreshRef.current = onRefresh;
  syncLabelsRef.current = opts?.syncLabels;
  const debounceMs = opts?.debounceMs ?? 0;

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    const run = () => {
      if (cancelled) return;
      syncLabelsRef.current?.();
      if (debounceMs > 0) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (!cancelled) onRefreshRef.current();
        }, debounceMs);
        return;
      }
      onRefreshRef.current();
    };

    const unsub = subscribeHubIdentity(run);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsub();
    };
  }, [debounceMs]);
}

export type SupabaseAuthListenerConfig = {
  client: SupabaseClient | null;
  isConfigured: () => boolean;
  cacheSession?: (session: Session) => void;
  onSession: (session: Session | null) => void;
  onAfterSession?: (session: Session) => void;
};

/** Bind Hub identity (GoTrue) auth listener — returns unsubscribe. */
export function bindSupabaseAuthListener(config: SupabaseAuthListenerConfig): () => void {
  if (!config.isConfigured() || !config.client) return () => {};
  const {
    data: { subscription },
  } = config.client.auth.onAuthStateChange((event, session) => {
    if (!session) {
      // Supabase may emit INITIAL_SESSION null before hub-cache setSession finishes.
      if (event === "INITIAL_SESSION") return;
      // Only an explicit sign-out ends the session.
      //
      // Supabase also emits null-session events when a token REFRESH fails — a network blip is
      // enough — and treating those as a sign-out dropped the user to the login screen while
      // their refresh token was still perfectly valid. P0020 hit this repeatedly: its vault pull
      // issues dozens of requests over minutes, and a refresh racing that traffic fails often.
      // For anything that is not a real sign-out, ask the client before giving up.
      if (event !== "SIGNED_OUT") {
        void config.client?.auth
          .getSession()
          .then(({ data }) => {
            if (!data.session) {
              config.onSession(null);
              return;
            }
            config.cacheSession?.(data.session);
            config.onSession(data.session);
          })
          .catch(() => {
            /* transient — keep the session and let the next event decide */
          });
        return;
      }
      config.onSession(null);
      return;
    }
    config.cacheSession?.(session);
    config.onSession(session);
    config.onAfterSession?.(session);
  });
  return () => subscription.unsubscribe();
}

