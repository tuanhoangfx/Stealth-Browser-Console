/**
 * Hub identity + data-plane env.
 *
 * Live host = Home Server Lenovo behind Cloudflare Tunnel — **not** supabase.com.
 * `@supabase/supabase-js` remains the GoTrue/PostgREST wire client (protocol SDK).
 *
 * Canonical Vite keys: `VITE_HUB_AUTH_URL` / `VITE_HUB_AUTH_ANON_KEY`.
 * Wire aliases `VITE_HUB_SUPABASE_*` stay baked for existing dist until the next full Deploy wave.
 */
export const HUB_AUTH_DEFAULT_URL = "https://hub-api.infi.io.vn";
export const HUB_DATA_DEFAULT_URL = "https://sb-api.infi.io.vn";

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export const HUB_AUTH_NOT_CONFIGURED_ERROR = "Tool Hub identity is not configured.";
export const HUB_DATA_NOT_CONFIGURED_ERROR = "Workspace data plane is not configured.";

export type HubAuthEnvInput = {
  url?: string | null;
  anonKey?: string | null;
  defaultUrl?: string;
};

/** @deprecated Use HubAuthEnvInput — wire alias. */
export type HubSupabaseEnvInput = HubAuthEnvInput;

export type HubAuthEnv = {
  HUB_AUTH_URL: string;
  HUB_AUTH_ANON_KEY: string;
  isHubAuthConfigured: boolean;
  /** Wire alias of HUB_AUTH_URL (Vite `VITE_HUB_SUPABASE_URL`). */
  HUB_SUPABASE_URL: string;
  /** Wire alias of HUB_AUTH_ANON_KEY. */
  HUB_SUPABASE_ANON_KEY: string;
  /** Wire alias of isHubAuthConfigured. */
  isHubSupabaseConfigured: boolean;
};

/** @deprecated Use HubAuthEnv — wire alias. */
export type HubSupabaseEnv = HubAuthEnv;

/** Resolve Tool Hub identity (GoTrue on Home Server `hub-api`). */
export function createHubAuthEnv(input: HubAuthEnvInput = {}): HubAuthEnv {
  const HUB_AUTH_URL =
    (input.url ?? "").trim() || (input.defaultUrl ?? HUB_AUTH_DEFAULT_URL).trim();
  const HUB_AUTH_ANON_KEY = (input.anonKey ?? "").trim();
  const isHubAuthConfigured = Boolean(HUB_AUTH_URL && HUB_AUTH_ANON_KEY);
  return {
    HUB_AUTH_URL,
    HUB_AUTH_ANON_KEY,
    isHubAuthConfigured,
    HUB_SUPABASE_URL: HUB_AUTH_URL,
    HUB_SUPABASE_ANON_KEY: HUB_AUTH_ANON_KEY,
    isHubSupabaseConfigured: isHubAuthConfigured,
  };
}

/** @deprecated Use createHubAuthEnv. */
export const createHubSupabaseEnv = createHubAuthEnv;

export type HubAuthViteEnv = {
  VITE_HUB_AUTH_URL?: string;
  VITE_HUB_AUTH_ANON_KEY?: string;
  VITE_HUB_SUPABASE_URL?: string;
  VITE_HUB_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_HUB_AUTH_URL?: string;
  NEXT_PUBLIC_HUB_AUTH_ANON_KEY?: string;
  NEXT_PUBLIC_HUB_SUPABASE_URL?: string;
  NEXT_PUBLIC_HUB_SUPABASE_ANON_KEY?: string;
};

/** Prefer `VITE_HUB_AUTH_*` (or Next `NEXT_PUBLIC_HUB_AUTH_*`), fall back to wire `*_HUB_SUPABASE_*`. */
export function createHubAuthEnvFromVite(
  env: HubAuthViteEnv,
  opts?: { defaultUrl?: string },
): HubAuthEnv {
  return createHubAuthEnv({
    url: firstNonEmpty(
      env.VITE_HUB_AUTH_URL,
      env.NEXT_PUBLIC_HUB_AUTH_URL,
      env.VITE_HUB_SUPABASE_URL,
      env.NEXT_PUBLIC_HUB_SUPABASE_URL,
    ),
    anonKey: firstNonEmpty(
      env.VITE_HUB_AUTH_ANON_KEY,
      env.NEXT_PUBLIC_HUB_AUTH_ANON_KEY,
      env.VITE_HUB_SUPABASE_ANON_KEY,
      env.NEXT_PUBLIC_HUB_SUPABASE_ANON_KEY,
    ),
    defaultUrl: opts?.defaultUrl ?? HUB_AUTH_DEFAULT_URL,
  });
}
