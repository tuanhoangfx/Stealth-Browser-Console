import { createHubAuthEnvFromVite } from "@tool-workspace/hub-identity";

export const { HUB_SUPABASE_URL, HUB_SUPABASE_ANON_KEY, isHubSupabaseConfigured } = createHubAuthEnvFromVite(
  import.meta.env,
);
