export type HubSupabaseEnvInput = {
  url?: string | null;
  anonKey?: string | null;
  defaultUrl?: string;
};

export type HubSupabaseEnv = {
  HUB_SUPABASE_URL: string;
  HUB_SUPABASE_ANON_KEY: string;
  isHubSupabaseConfigured: boolean;
};

/** Resolve Tool Hub (P0004) public Supabase env from Vite `import.meta.env`. */
export function createHubSupabaseEnv(input: HubSupabaseEnvInput = {}): HubSupabaseEnv {
  const HUB_SUPABASE_URL = (input.url ?? "").trim() || (input.defaultUrl ?? "").trim();
  const HUB_SUPABASE_ANON_KEY = (input.anonKey ?? "").trim();
  return {
    HUB_SUPABASE_URL,
    HUB_SUPABASE_ANON_KEY,
    isHubSupabaseConfigured: Boolean(HUB_SUPABASE_URL && HUB_SUPABASE_ANON_KEY),
  };
}
