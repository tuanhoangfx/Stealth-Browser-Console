import { createHubSupabaseEnv } from "@tool-workspace/hub-identity";

export const { HUB_SUPABASE_URL, HUB_SUPABASE_ANON_KEY, isHubSupabaseConfigured } = createHubSupabaseEnv({
  url: import.meta.env.VITE_HUB_SUPABASE_URL,
  anonKey: import.meta.env.VITE_HUB_SUPABASE_ANON_KEY,
  /** Canonical Hub identity gateway — never fall back to rotated *.supabase.co JWT host. */
  defaultUrl: "https://hub-api.infi.io.vn",
});
