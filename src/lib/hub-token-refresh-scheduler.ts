import { createHubTokenRefreshScheduler } from "@tool-workspace/hub-identity";
import { readHubIdentity } from "./hub-identity-session";
import { isHubSupabaseConfigured } from "./hub-supabase-env";
import { getIdentitySupabase, persistHubSession } from "./supabase-identity";

/** Proactively rotate the Hub JWT this many ms before it expires. */
const REFRESH_LEAD_MS = 15 * 60 * 1000;
/** Poll cadence — desktop stays focused for hours, so focus events never fire. */
const REFRESH_CHECK_MS = 5 * 60 * 1000;

/**
 * Force a real GoTrue refresh (not just `setSession` re-validation) when the
 * cached Hub JWT is within REFRESH_LEAD_MS of expiry. The shared identity client
 * is `persistSession:false, autoRefreshToken:false`, so without this the desktop
 * console silently rides an expired token until the next 401 → repeated login.
 */
async function refreshRequestToken(): Promise<string | null> {
  if (!isHubSupabaseConfigured) return null;
  const snap = readHubIdentity();
  const client = getIdentitySupabase();
  if (!client || !snap?.refresh_token || !snap.access_token) return snap?.access_token ?? null;

  const expiresAtMs = snap.expires_at ? snap.expires_at * 1000 : 0;
  const nearExpiry = !expiresAtMs || expiresAtMs < Date.now() + REFRESH_LEAD_MS;
  if (!nearExpiry) return snap.access_token;

  try {
    const { data, error } = await client.auth.refreshSession({ refresh_token: snap.refresh_token });
    if (error || !data.session) return snap.access_token;
    persistHubSession(data.session);
    return data.session.access_token;
  } catch {
    // Rotation race / transient network — keep the cached token; reactive 401 refresh still covers it.
    return snap.access_token;
  }
}

const scheduler = createHubTokenRefreshScheduler({
  isHubConfigured: () => isHubSupabaseConfigured,
  refreshRequestToken,
  refreshIntervalMs: REFRESH_CHECK_MS,
});

export const { startHubTokenRefreshScheduler, stopHubTokenRefreshScheduler } = scheduler;
