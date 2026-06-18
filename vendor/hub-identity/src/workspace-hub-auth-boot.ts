import { useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { HubIdentityRelaySnapshot } from "./hub-identity-relay";
import { useHubIdentityRelayReceive } from "./hub-identity-relay";
import {
  bindSupabaseAuthListener,
  sessionsEqual,
  useHubIdentityRefreshEffect,
} from "./workspace-auth-session";

export type WorkspaceHubAuthBootConfig = {
  isHubConfigured: () => boolean;
  readCachedHubSession: () => Session | null;
  resolveAuthRequired: () => Promise<boolean>;
  fallbackAuthRequired: () => boolean;
  refreshSession: (opts?: { boot?: boolean }) => Promise<void>;
  checkToolAccess: (token: string) => Promise<void | boolean>;
  getIdentityClient: () => SupabaseClient | null;
  persistHubSession: (session: Session) => void;
  onHubSignedOut: () => void;
  onHubSignedIn: (session: Session) => void;
  onAfterHubSignedIn?: (session: Session) => void;
  onAuthNotRequired?: () => void;
  onBootStart?: () => void;
  apiUnauthorizedEvent: string;
  isToolHubOrigin: (origin: string) => boolean;
  onHubRelayReceived: (snapshot: HubIdentityRelaySnapshot) => void;
  tokenScheduler: { start: () => void; stop: () => void };
  hubAccessToken?: string | null;
};

export type WorkspaceHubAuthBootState = {
  authRequired: boolean;
  policyReady: boolean;
};

/**
 * Shared Hub-auth boot lifecycle — policy gate, relay, cross-tab sync,
 * Supabase listener, API 401 refresh, token scheduler.
 */
export function useWorkspaceHubAuthBoot(config: WorkspaceHubAuthBootConfig): WorkspaceHubAuthBootState {
  const [authRequired, setAuthRequired] = useState(false);
  const [policyReady, setPolicyReady] = useState(false);
  const configRef = useRef(config);
  configRef.current = config;

  useHubIdentityRelayReceive({
    isToolHubOrigin: config.isToolHubOrigin,
    onReceived: config.onHubRelayReceived,
  });

  useHubIdentityRefreshEffect(() => {
    void configRef.current.refreshSession();
  });

  useEffect(() => {
    let cancelled = false;
    let dataUnsub: (() => void) | null = null;
    const c = () => configRef.current;

    const loadPolicy = async () => {
      try {
        const required = await c().resolveAuthRequired();
        if (cancelled) return;
        setAuthRequired(required);
        if (!required) {
          c().onAuthNotRequired?.();
          setPolicyReady(true);
          return;
        }
        setPolicyReady(true);
        if (!c().readCachedHubSession()) c().onBootStart?.();
        await c().refreshSession({ boot: true });
        if (cancelled) return;
        dataUnsub = bindSupabaseAuthListener({
          client: c().getIdentityClient(),
          isConfigured: c().isHubConfigured,
          cacheSession: c().persistHubSession,
          onSession: (session) => {
            if (cancelled) return;
            if (!session) {
              c().onHubSignedOut();
              return;
            }
            c().onHubSignedIn(session);
            void c().checkToolAccess(session.access_token);
          },
          onAfterSession: (session) => {
            if (!cancelled) c().onAfterHubSignedIn?.(session);
          },
        });
      } catch {
        if (!cancelled) {
          setAuthRequired(c().fallbackAuthRequired());
          c().onAuthNotRequired?.();
          setPolicyReady(true);
        }
      }
    };

    void loadPolicy();

    const onApiUnauthorized = () => {
      if (!cancelled) void c().refreshSession();
    };

    window.addEventListener(c().apiUnauthorizedEvent, onApiUnauthorized);

    return () => {
      cancelled = true;
      c().tokenScheduler.stop();
      window.removeEventListener(c().apiUnauthorizedEvent, onApiUnauthorized);
      if (dataUnsub) dataUnsub();
    };
  }, []);

  useEffect(() => {
    const c = configRef.current;
    if (!c.isHubConfigured() || !c.hubAccessToken) {
      c.tokenScheduler.stop();
      return;
    }
    c.tokenScheduler.start();
    return () => c.tokenScheduler.stop();
  }, [config.hubAccessToken]);

  return { authRequired, policyReady };
}

export { sessionsEqual };
