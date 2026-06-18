import { useEffect, useRef } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { HubIdentityRelaySnapshot } from "./hub-identity-relay";
import { useHubIdentityRelayReceive } from "./hub-identity-relay";
import {
  bindSupabaseAuthListener,
  useHubIdentityRefreshEffect,
} from "./workspace-auth-session";

export type WorkspaceDataAuthBootConfig = {
  isConfigured: () => boolean;
  readCachedSession: () => Session | null;
  refreshSession: (opts?: { boot?: boolean }) => Promise<void>;
  getClient: () => SupabaseClient | null;
  persistSession: (session: Session) => void;
  onSignedOut: () => void;
  onSignedIn: (session: Session) => void;
  onAfterSignedIn?: (session: Session) => void;
  onBootStart?: () => void;
  isToolHubOrigin: (origin: string) => boolean;
  onHubRelayReceived: (snapshot: HubIdentityRelaySnapshot) => void;
  offlineEventName?: string;
  onOfflineChange?: () => void;
  apiUnauthorizedEvent?: string;
  tokenScheduler?: { start: () => void; stop: () => void };
  hubAccessToken?: string | null;
  identityRefreshDebounceMs?: number;
  syncHubIdentityLabels?: () => void;
};

/**
 * Data-plane auth boot — P0020 Data Box session + hub relay/refresh/scheduler.
 * Counterpart to `useWorkspaceHubAuthBoot` (Hub identity primary).
 */
export function useWorkspaceDataAuthBoot(config: WorkspaceDataAuthBootConfig): void {
  const configRef = useRef(config);
  configRef.current = config;

  useHubIdentityRelayReceive({
    isToolHubOrigin: config.isToolHubOrigin,
    onReceived: config.onHubRelayReceived,
  });

  useHubIdentityRefreshEffect(
    () => {
      void configRef.current.refreshSession();
    },
    {
      debounceMs: config.identityRefreshDebounceMs ?? 400,
      syncLabels: config.syncHubIdentityLabels,
    },
  );

  useEffect(() => {
    const eventName = config.offlineEventName;
    if (!eventName || !config.onOfflineChange) return;
    const handler = () => configRef.current.onOfflineChange?.();
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [config.offlineEventName, config.onOfflineChange]);

  useEffect(() => {
    let cancelled = false;
    let dataUnsub: (() => void) | null = null;
    const c = () => configRef.current;

    const boot = async () => {
      if (!c().readCachedSession()) c().onBootStart?.();
      await c().refreshSession({ boot: true });
      if (cancelled) return;
      dataUnsub = bindSupabaseAuthListener({
        client: c().getClient(),
        isConfigured: c().isConfigured,
        cacheSession: c().persistSession,
        onSession: (session) => {
          if (cancelled) return;
          if (!session) {
            c().onSignedOut();
            return;
          }
          c().onSignedIn(session);
        },
        onAfterSession: (session) => {
          if (!cancelled) c().onAfterSignedIn?.(session);
        },
      });
    };

    void boot();

    const apiEvent = c().apiUnauthorizedEvent;
    const onApiUnauthorized = () => {
      if (!cancelled) void c().refreshSession();
    };
    if (apiEvent) window.addEventListener(apiEvent, onApiUnauthorized);

    return () => {
      cancelled = true;
      c().tokenScheduler?.stop();
      if (apiEvent) window.removeEventListener(apiEvent, onApiUnauthorized);
      if (dataUnsub) dataUnsub();
    };
  }, []);

  useEffect(() => {
    const c = configRef.current;
    const scheduler = c.tokenScheduler;
    if (!scheduler || !c.hubAccessToken) {
      scheduler?.stop();
      return;
    }
    scheduler.start();
    return () => scheduler.stop();
  }, [config.hubAccessToken]);
}
