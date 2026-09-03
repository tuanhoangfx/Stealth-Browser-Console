import { useEffect, useRef } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { promiseWithTimeout } from "./promise-timeout";
import { subscribeHubIdentity } from "./hub-identity-cache";
import { shouldAcceptHubIdentityRelay } from "./workspace-sign-out";

/** Cold boot cap — cached session paints immediately; this only bounds first `ensureAuth` wait. */
export const WORKSPACE_AUTH_BOOT_TIMEOUT_MS = 5_000;

/** Dual sign-in (Hub + data plane) — User ID may resolve + try several auth emails sequentially.
 * Home Server GoTrue password grants often take 5–8s each; dual identity→data needs headroom. */
export const WORKSPACE_DUAL_SIGN_IN_TIMEOUT_MS = 45_000;

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

export type SessionExpiryFields = {
  expires_at?: number | null;
  access_token?: string | null;
};

/** Browser `atob`, else Node `globalThis.Buffer` — no `Buffer` global (Vite `types: vite/client`). */
function decodeJwtPayloadBase64(padded: string): string {
  if (typeof atob === "function") return atob(padded);
  const nodeBuffer = (globalThis as { Buffer?: { from(data: string, enc: string): { toString(enc: string): string } } })
    .Buffer;
  if (!nodeBuffer) throw new Error("no-base64-decoder");
  return nodeBuffer.from(padded, "base64").toString("utf8");
}

/** Decode JWT `exp` (seconds). Missing/malformed token → null. */
export function readJwtExpSeconds(accessToken: string | null | undefined): number | null {
  const token = String(accessToken ?? "").trim();
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = decodeJwtPayloadBase64(padded);
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" && exp > 0 ? exp : null;
  } catch {
    return null;
  }
}

/** GoTrue `expires_at`, else JWT `exp`. Do not invent a clock. */
export function resolveSessionExpiresAtSeconds(session: SessionExpiryFields | null | undefined): number | null {
  const stamped = session?.expires_at;
  if (typeof stamped === "number" && stamped > 0) return stamped;
  return readJwtExpSeconds(session?.access_token);
}

/**
 * Proactive refresh window. **Missing exp is not near-expiry** — forcing
 * `refreshSession()` on every CRM/Todo Save is what turns a Home Server
 * GoTrue blip into `TypeError: Failed to fetch` on an otherwise valid JWT.
 */
export function isSessionNearExpiry(
  session: SessionExpiryFields | null | undefined,
  nearExpiryMs: number,
): boolean {
  const exp = resolveSessionExpiresAtSeconds(session);
  if (exp == null) return false;
  return exp * 1000 < Date.now() + Math.max(0, nearExpiryMs);
}

/** Token can still be sent (not hard-expired). Missing exp stays writeable. */
export function isSessionStillWriteable(session: SessionExpiryFields | null | undefined): boolean {
  if (!session?.access_token?.trim()) return false;
  const exp = resolveSessionExpiresAtSeconds(session);
  if (exp == null) return true;
  return exp * 1000 > Date.now();
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
  /** Disk/JWT snapshot — keep the shell when getSession() is null after a refresh blip. */
  readCachedSession?: () => Session | null;
  onSession: (session: Session | null) => void;
  onAfterSession?: (session: Session) => void;
};

/** Bind Hub identity (GoTrue) auth listener — returns unsubscribe. */
export function bindSupabaseAuthListener(config: SupabaseAuthListenerConfig): () => void {
  if (!config.isConfigured() || !config.client) return () => {};
  const {
    data: { subscription },
  } = config.client.auth.onAuthStateChange((event, session) => {
    // Explicit Sign Out opts out of auto-login + relay. GoTrue may still emit
    // TOKEN_REFRESHED / SIGNED_IN with an in-memory JWT until local signOut finishes —
    // adopting that looked like Sign Out hung, then bounced back.
    if (!shouldAcceptHubIdentityRelay()) {
      if (event === "INITIAL_SESSION" && !session) return;
      config.onSession(null);
      return;
    }
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
            if (!shouldAcceptHubIdentityRelay()) {
              config.onSession(null);
              return;
            }
            if (!data.session) {
              const cached = config.readCachedSession?.() ?? null;
              if (cached) {
                config.onSession(cached);
                return;
              }
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
      // supabase-js also emits SIGNED_OUT when a sibling GoTrue client rotates the
      // refresh token (P0020 vault + Data Box used the same sb-api storage key) or
      // when setSession's /user hydrate fails. Explicit Sign Out already cleared
      // the tool snapshot — keep a still-writeable cache so the gate does not blink.
      const cached = config.readCachedSession?.() ?? null;
      if (cached && isSessionStillWriteable(cached)) {
        config.onSession(cached);
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

