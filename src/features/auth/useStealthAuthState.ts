import { useEffect } from "react";
import {
  sendDesktopHostAuthTelemetry,
  useDesktopHubAuth,
  type DesktopHubAuthState,
  type HubAuthViteEnv,
} from "@tool-workspace/hub-identity";
import { API_UNAUTHORIZED_EVENT } from "../../lib/api-auth-token";
import {
  getOfflineMode,
  isOfflineWorkspaceSession,
  reconcileOfflineModeWithCache,
  setOfflineMode,
  STEALTH_OFFLINE_MODE_EVENT,
} from "../../lib/offlineMode";
import {
  isLocalStealthRuntime,
  isStealthHubAuthEnabled,
  isStealthHubAuthOptional,
} from "../../lib/stealth-auth-policy";

export type StealthAuthState = DesktopHubAuthState;

/** Thin P0003 adapter over shared `useDesktopHubAuth` + Electron vault-scope sync. */
export function useStealthAuthState(): StealthAuthState {
  const auth = useDesktopHubAuth({
    code: "P0003",
    env: import.meta.env as HubAuthViteEnv & { DEV?: boolean },
    enabled: isStealthHubAuthEnabled(),
    authOptional: isStealthHubAuthOptional(),
    apiUnauthorizedEvent: API_UNAUTHORIZED_EVENT,
    offlineController: {
      getOfflineMode,
      setOfflineMode,
      reconcileWithCache: reconcileOfflineModeWithCache,
      isOfflineSession: isOfflineWorkspaceSession,
      eventName: STEALTH_OFFLINE_MODE_EVENT,
    },
    onBootTelemetry: (record) => {
      if (isLocalStealthRuntime()) {
        void sendDesktopHostAuthTelemetry("http://127.0.0.1:6003/api/hub-auth/telemetry", record);
      }
    },
  });

  // Push Hub login email → main vault scope (packaged). Dev always uses czpgo@outlook.com.
  useEffect(() => {
    const api = window.stealthApi;
    if (!api?.setVaultUserScope) return;
    void api.setVaultUserScope({ email: auth.hubEmail });
  }, [auth.hubEmail]);

  return auth;
}
