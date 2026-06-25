import { createHubSupabaseEnv } from "@tool-workspace/hub-identity";

export const { HUB_SUPABASE_URL, HUB_SUPABASE_ANON_KEY, isHubSupabaseConfigured } = createHubSupabaseEnv({
  url: import.meta.env.VITE_HUB_SUPABASE_URL,
  anonKey: import.meta.env.VITE_HUB_SUPABASE_ANON_KEY,
  defaultUrl: "https://fmnrafpzctuhxjaaomzt.supabase.co",
});
