import type { Session } from "@supabase/supabase-js";
import type { HubIdentitySnapshot } from "./hub-identity-cache";

export type HubApiAuthTokenConfig = {
  unauthorizedEventName: string;
  isHubConfigured: () => boolean;
  readHubIdentity: () => HubIdentitySnapshot | null;
  getHubAccessToken: () => string | null;
  getHubIdentitySession: () => Promise<Session | null>;
  persistHubSession: (session: Session) => void;
  /** Refresh when expiry is within this window (default 90s). */
  tokenNearExpiryMs?: number;
};

export type HubApiAuthTokenBundle = {
  API_UNAUTHORIZED_EVENT: string;
  dispatchApiUnauthorized: (reason?: string) => void;
  resolveRequestToken: (forceRefresh?: boolean) => Promise<string | null>;
  refreshRequestToken: () => Promise<string | null>;
};

/** Worker API Hub JWT resolver — deduped refresh + unauthorized event dispatch. */
export function createHubApiAuthToken(config: HubApiAuthTokenConfig): HubApiAuthTokenBundle {
  const nearExpiryMs = config.tokenNearExpiryMs ?? 90_000;
  let refreshInFlight: Promise<string | null> | null = null;

  function tokenNearExpiry(): boolean {
    const exp = config.readHubIdentity()?.expires_at;
    if (!exp) return false;
    return exp * 1000 < Date.now() + nearExpiryMs;
  }

  function dispatchApiUnauthorized(reason?: string): void {
    window.dispatchEvent(new CustomEvent(config.unauthorizedEventName, { detail: { reason } }));
  }

  async function resolveRequestToken(forceRefresh = false): Promise<string | null> {
    if (!config.isHubConfigured()) return config.getHubAccessToken();

    if (!forceRefresh && !tokenNearExpiry()) {
      const cached = config.getHubAccessToken();
      if (cached) return cached;
    }

    const session = await config.getHubIdentitySession();
    if (session?.access_token) {
      config.persistHubSession(session);
      return session.access_token;
    }
    return config.getHubAccessToken();
  }

  async function refreshRequestToken(): Promise<string | null> {
    if (!refreshInFlight) {
      refreshInFlight = resolveRequestToken(true).finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  return {
    API_UNAUTHORIZED_EVENT: config.unauthorizedEventName,
    dispatchApiUnauthorized,
    resolveRequestToken,
    refreshRequestToken,
  };
}
