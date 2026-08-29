import { useEffect, useRef } from "react";
import { hydrateHubIdentity, type HydrateHubIdentityOptions } from "./hydrate-hub-identity";
import { readHubIdentity } from "./hub-identity-cache";
import {
  DUAL_PLANE_HUB_JWT_FORCE_LOGIN_MS,
  shouldSignOutWhenHubJwtMissing,
} from "./workspace-reauth";

export type ForceLoginMissingHubJwtOptions = {
  loading: boolean;
  hasDataSession: boolean;
  hasHubJwt: boolean;
  /** Kept for caller compatibility — login-once never Sign Outs the data plane. */
  signOut: () => Promise<void> | void;
  applySession?: HydrateHubIdentityOptions["applySession"];
  delayMs?: number;
};

/**
 * Users/Org embed hosts (P0012 / P0015).
 * Workspace data persistSession can paint the shell while Hub JWT is dead —
 * hydrate / refresh Hub. Do not Sign Out both planes (login-once).
 */
export function useForceLoginMissingHubJwt(opts: ForceLoginMissingHubJwtOptions): void {
  const {
    loading,
    hasDataSession,
    hasHubJwt,
    signOut,
    applySession,
    delayMs = DUAL_PLANE_HUB_JWT_FORCE_LOGIN_MS,
  } = opts;
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;
  const applyRef = useRef(applySession);
  applyRef.current = applySession;

  useEffect(() => {
    if (loading || !hasDataSession || hasHubJwt) return;

    void hydrateHubIdentity({
      applySession: applyRef.current,
      requestFromHost: false,
      hostWaitMs: 0,
    });

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void hydrateHubIdentity({
        applySession: applyRef.current,
        requestFromHost: false,
        hostWaitMs: 0,
      }).then((ok) => {
        if (cancelled || ok || readHubIdentity()?.access_token?.trim()) return;
        if (shouldSignOutWhenHubJwtMissing()) void signOutRef.current();
      });
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loading, hasDataSession, hasHubJwt, delayMs]);
}
