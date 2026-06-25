import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  isRealHubWorkspaceSession,
  resolveWithBootTimeout,
  sessionsEqual,
  useHubIdentityRelayRequest,
  useWorkspaceHubAuthBoot,
  verifyHubIntegratedToolAccess,
  WORKSPACE_AUTH_BOOT_TIMEOUT_MS,
} from "@tool-workspace/hub-identity";
import { API_UNAUTHORIZED_EVENT } from "../../lib/api-auth-token";
import { ensureHubAuth, signInHubIdentity } from "../../lib/hub-auth-client";
import { isToolHubOrigin } from "../../lib/hub-identity-urls";
import { isHubSupabaseConfigured } from "../../lib/hub-supabase-env";
import { cacheHubIdentity, clearHubIdentity } from "../../lib/hub-identity-session";
import {
  getOfflineMode,
  isOfflineWorkspaceSession,
  reconcileOfflineModeWithCache,
  setOfflineMode,
  STEALTH_OFFLINE_MODE_EVENT,
} from "../../lib/offlineMode";
import { getIdentitySupabase, persistHubSession, readCachedHubSession } from "../../lib/supabase-identity";
import { isStealthHubAuthEnabled, isStealthHubAuthOptional } from "../../lib/stealth-auth-policy";

export type StealthAuthState = {
  session: Session | null;
  hubEmail: string | null;
  hubUserId: string | null;
  loading: boolean;
  offline: boolean;
  toolAccess: boolean | null;
  hubConfigured: boolean;
  authRequired: boolean;
  policyReady: boolean;
  refreshSession: (opts?: { boot?: boolean }) => Promise<void>;
  prepareHubSignIn: () => void;
  signIn: (loginInput: string, password: string, mode?: "signin" | "signup") => Promise<void>;
  signOut: () => Promise<void>;
};

function initialAuthState(): { session: Session | null; loading: boolean; offline: boolean } {
  if (!isStealthHubAuthEnabled()) {
    return { session: null, loading: false, offline: false };
  }
  const cached = readCachedHubSession();
  if (getOfflineMode()) setOfflineMode(false);
  if (isRealHubWorkspaceSession(cached)) {
    return {
      session: cached,
      loading: false,
      offline: false,
    };
  }
  return {
    session: null,
    loading: isHubSupabaseConfigured && !isStealthHubAuthOptional(),
    offline: false,
  };
}

export function useStealthAuthState(): StealthAuthState {
  const initial = initialAuthState();
  const [session, setSession] = useState<Session | null>(initial.session);
  const [loading, setLoading] = useState(initial.loading);
  const [offline, setOffline] = useState(initial.offline);
  const [toolAccess, setToolAccess] = useState<boolean | null>(initial.session ? null : false);
  const toolCheckGen = useRef(0);
  const signoutRecoveryRef = useRef(false);

  const checkToolAccess = useCallback(async (_accessToken: string) => {
    const gen = ++toolCheckGen.current;
    const client = getIdentitySupabase();
    if (!client) {
      if (gen === toolCheckGen.current) setToolAccess(true);
      return true;
    }
    const ok = await verifyHubIntegratedToolAccess(client, "P0003");
    if (gen === toolCheckGen.current && ok !== null) setToolAccess(ok);
    return ok;
  }, []);

  const refreshSession = useCallback(async (opts?: { boot?: boolean }) => {
    if (!isStealthHubAuthEnabled()) {
      setSession(null);
      setOffline(false);
      setToolAccess(true);
      setLoading(false);
      return;
    }

    const nextOffline = reconcileOfflineModeWithCache(readCachedHubSession);
    setOffline(nextOffline);
    if (nextOffline) {
      setOfflineMode(false);
      setOffline(false);
    }

    if (!isHubSupabaseConfigured) {
      setSession(null);
      setToolAccess(true);
      setLoading(false);
      return;
    }

    const showBlockingLoader = opts?.boot && !readCachedHubSession();
    if (showBlockingLoader) setLoading(true);

    try {
      const resolved = await resolveWithBootTimeout(
        () => ensureHubAuth(),
        opts?.boot,
        null,
        WORKSPACE_AUTH_BOOT_TIMEOUT_MS,
      );
      if (resolved) {
        setSession((prev) => (sessionsEqual(prev, resolved) ? prev : resolved));
        await checkToolAccess(resolved.access_token);
        return;
      }
      if (!readCachedHubSession()) {
        setSession(null);
        setToolAccess(false);
      }
    } finally {
      setLoading(false);
    }
  }, [checkToolAccess]);

  const prepareHubSignIn = useCallback(() => {
    setOfflineMode(false);
    setOffline(false);
  }, []);

  const signIn = useCallback(async (loginInput: string, password: string, mode: "signin" | "signup" = "signin") => {
    prepareHubSignIn();
    const next = await signInHubIdentity(loginInput, password, mode);
    setOfflineMode(false);
    setOffline(false);
    setSession(next);
    setLoading(false);
    await checkToolAccess(next.access_token);
  }, [checkToolAccess, prepareHubSignIn]);

  const signOut = useCallback(async () => {
    toolCheckGen.current += 1;
    setOfflineMode(false);
    setOffline(false);
    clearHubIdentity();
    const client = getIdentitySupabase();
    if (client) await client.auth.signOut();
    setSession(null);
    setToolAccess(false);
    setLoading(false);
  }, []);

  const handleOfflineChange = useCallback(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    window.addEventListener(STEALTH_OFFLINE_MODE_EVENT, handleOfflineChange);
    return () => window.removeEventListener(STEALTH_OFFLINE_MODE_EVENT, handleOfflineChange);
  }, [handleOfflineChange]);

  const hubAuthEnabled = isStealthHubAuthEnabled();
  const authOptional = isStealthHubAuthOptional();
  const hasHubSession = !isOfflineWorkspaceSession(session, offline);

  useHubIdentityRelayRequest({
    enabled: hubAuthEnabled && isHubSupabaseConfigured,
    hasSession: hasHubSession || Boolean(readCachedHubSession()),
  });

  const { authRequired, policyReady } = useWorkspaceHubAuthBoot({
    isHubConfigured: () => isHubSupabaseConfigured && hubAuthEnabled,
    readCachedHubSession,
    resolveAuthRequired: async () => isHubSupabaseConfigured && hubAuthEnabled && !authOptional,
    fallbackAuthRequired: () => isHubSupabaseConfigured && hubAuthEnabled && !authOptional,
    refreshSession,
    checkToolAccess: (token) => checkToolAccess(token).then((v) => v ?? undefined),
    getIdentityClient: getIdentitySupabase,
    persistHubSession,
    onHubSignedOut: () => {
      if (signoutRecoveryRef.current) return;
      const cached = readCachedHubSession();
      if (cached) {
        signoutRecoveryRef.current = true;
        void refreshSession().finally(() => {
          signoutRecoveryRef.current = false;
        });
        return;
      }
      setSession(null);
      setToolAccess(false);
    },
    onHubSignedIn: (next) => {
      setOfflineMode(false);
      setOffline(false);
      setSession((prev) => (sessionsEqual(prev, next) ? prev : next));
      setLoading(false);
    },
    onAuthNotRequired: () => {
      setLoading(false);
      setToolAccess(true);
    },
    onBootStart: () => setLoading(true),
    apiUnauthorizedEvent: API_UNAUTHORIZED_EVENT,
    isToolHubOrigin,
    onHubRelayReceived: (snapshot) => {
      setOfflineMode(false);
      setOffline(false);
      cacheHubIdentity(snapshot);
      void refreshSession();
    },
    tokenScheduler: {
      start: () => {},
      stop: () => {},
    },
    hubAccessToken: session?.access_token,
  });

  const hubEmail = offline ? null : (session?.user?.email ?? null);
  const hubUserId = offline ? null : (session?.user?.id ?? null);
  const hasEstablishedSession =
    isRealHubWorkspaceSession(session) || isRealHubWorkspaceSession(readCachedHubSession());
  const effectiveLoading = authRequired && (loading || !policyReady) && !hasEstablishedSession;

  return {
    session,
    hubEmail,
    hubUserId,
    loading: effectiveLoading,
    offline,
    toolAccess,
    hubConfigured: isHubSupabaseConfigured,
    authRequired,
    policyReady,
    refreshSession,
    prepareHubSignIn,
    signIn,
    signOut,
  };
}
