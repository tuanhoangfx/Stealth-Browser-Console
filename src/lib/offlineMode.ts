import type { Session } from "@supabase/supabase-js";
import {
  isOfflineWorkspaceSession as isOfflineHubSession,
  isRealHubWorkspaceSession as isRealHubSession,
} from "@tool-workspace/hub-identity";

const KEY = "p0003.offlineMode.v1";
export const STEALTH_OFFLINE_MODE_EVENT = "p0003:offline-mode";

export { isOfflineHubSession as isOfflineWorkspaceSession, isRealHubSession as isRealHubWorkspaceSession };

export function getOfflineMode(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setOfflineMode(next: boolean) {
  try {
    window.localStorage.setItem(KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(STEALTH_OFFLINE_MODE_EVENT));
  } catch {
    // ignore
  }
}

export function clearOfflineModeStorage() {
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(STEALTH_OFFLINE_MODE_EVENT));
  } catch {
    // ignore
  }
}

export function offlineSession(): Session {
  const now = new Date().toISOString();
  return {
    access_token: "offline",
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    refresh_token: "offline",
    user: {
      id: "offline-user",
      aud: "authenticated",
      role: "authenticated",
      email: "anonymous@local",
      app_metadata: {},
      user_metadata: {},
      created_at: now,
      updated_at: now,
    },
  } as unknown as Session;
}

/** Clear stale anonymous flag when a real Hub session is already cached. */
export function reconcileOfflineModeWithCache(getCached: () => Session | null): boolean {
  const cached = getCached();
  if (isRealHubSession(cached)) {
    if (getOfflineMode()) setOfflineMode(false);
    return false;
  }
  return getOfflineMode();
}
