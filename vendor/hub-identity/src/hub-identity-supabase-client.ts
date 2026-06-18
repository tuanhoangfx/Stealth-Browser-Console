import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import {
  cacheHubIdentity,
  clearHubIdentity,
  readHubIdentity,
  type HubIdentitySnapshot,
} from "./hub-identity-cache";

export type HubIdentitySupabaseClientConfig = {
  defaultUrl: string;
  defaultAnonKey: string;
};

const SESSION_VALID_BUFFER_MS = 60_000;

function sessionStillValid(session: Session | null | undefined): boolean {
  if (!session?.access_token) return false;
  const exp = session.expires_at;
  if (!exp) return true;
  return exp * 1000 > Date.now() + SESSION_VALID_BUFFER_MS;
}

export function createHubIdentitySupabaseClient(config: HubIdentitySupabaseClientConfig) {
  let cachedClient: SupabaseClient | null = null;
  let cachedClientKey: string | null = null;
  let sessionApplyInFlight: Promise<Session | null> | null = null;

  function sessionFromHubSnapshot(snap: HubIdentitySnapshot | null): Session | null {
    if (!snap?.access_token) return null;
    const expiresAt = snap.expires_at ?? Math.floor(Date.now() / 1000) + 3600;
    return {
      access_token: snap.access_token,
      refresh_token: snap.refresh_token ?? "",
      expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
      expires_at: expiresAt,
      token_type: "bearer",
      user: {
        id: snap.user_id ?? "",
        email: snap.user_email ?? undefined,
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "",
      },
    } as Session;
  }

  function persistHubSession(session: Session, source?: string): void {
    cacheHubIdentity(
      {
        access_token: session.access_token,
        refresh_token: session.refresh_token ?? "",
        expires_at: session.expires_at ?? null,
        user_id: session.user?.id ?? null,
        user_email: session.user?.email ?? null,
        supabase_url: config.defaultUrl,
        supabase_anon_key: config.defaultAnonKey,
      },
      source,
    );
  }

  function readCachedHubSession(): Session | null {
    return sessionFromHubSnapshot(readHubIdentity());
  }

  function getIdentitySupabase(snapshot?: HubIdentitySnapshot | null): SupabaseClient | null {
    const snap = snapshot ?? readHubIdentity();
    const url = snap?.supabase_url?.trim() || config.defaultUrl;
    const anon = snap?.supabase_anon_key?.trim() || config.defaultAnonKey;
    if (!url || !anon) return null;
    const key = `${url}|${anon}`;
    if (!cachedClient || cachedClientKey !== key) {
      // Hub JWT SSOT is x1z10:hub-identity-v2 — avoid competing sb-* storage + autoRefresh.
      cachedClient = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      cachedClientKey = key;
    }
    return cachedClient;
  }

  async function applyHubIdentitySessionCore(): Promise<Session | null> {
    const client = getIdentitySupabase();
    if (!client) return null;

    const { data: live } = await client.auth.getSession();
    if (sessionStillValid(live.session)) {
      if (live.session) persistHubSession(live.session);
      return live.session;
    }

    const snap = readHubIdentity();
    if (!snap?.access_token) return live.session ?? null;

    const { data, error } = await client.auth.setSession({
      access_token: snap.access_token,
      refresh_token: snap.refresh_token || "",
    });
    if (error) {
      if (readHubIdentity()?.access_token === snap.access_token) {
        clearHubIdentity("restore_failed");
      }
      return live.session ?? null;
    }
    if (data.session) persistHubSession(data.session);
    return data.session;
  }

  async function applyHubIdentitySession(): Promise<Session | null> {
    if (!sessionApplyInFlight) {
      sessionApplyInFlight = applyHubIdentitySessionCore().finally(() => {
        sessionApplyInFlight = null;
      });
    }
    return sessionApplyInFlight;
  }

  async function getHubIdentitySession(): Promise<Session | null> {
    return applyHubIdentitySession();
  }

  return {
    getIdentitySupabase,
    applyHubIdentitySession,
    getHubIdentitySession,
    persistHubSession,
    readCachedHubSession,
    sessionFromHubSnapshot,
  };
}

export type HubIdentitySupabaseClient = ReturnType<typeof createHubIdentitySupabaseClient>;
