import { useEffect, useRef } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { promiseWithTimeout } from "./promise-timeout";
import { subscribeHubIdentity } from "./hub-identity-cache";

/** Cold boot cap — cached session paints immediately; this only bounds first `ensureAuth` wait. */
export const WORKSPACE_AUTH_BOOT_TIMEOUT_MS = 5_000;

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

/** Bind Supabase auth listener — returns unsubscribe. */
export function bindSupabaseAuthListener(config: SupabaseAuthListenerConfig): () => void {
  if (!config.isConfigured() || !config.client) return () => {};
  const {
    data: { subscription },
  } = config.client.auth.onAuthStateChange((event, session) => {
    if (!session) {
      // Supabase may emit INITIAL_SESSION null before hub-cache setSession finishes.
      if (event === "INITIAL_SESSION") return;
      config.onSession(null);
      return;
    }
    config.cacheSession?.(session);
    config.onSession(session);
    config.onAfterSession?.(session);
  });
  return () => subscription.unsubscribe();
}

