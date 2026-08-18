import { createHubAuthEnvFromVite, type HubAuthViteEnv } from "@tool-workspace/hub-identity";

/** Full HubAuthEnv — pass this object into WorkspaceAuthGate helpers (not a 3-field alias subset). */
export const hubAuthEnv = createHubAuthEnvFromVite(import.meta.env as HubAuthViteEnv);

export const {
  HUB_AUTH_URL,
  HUB_AUTH_ANON_KEY,
  isHubAuthConfigured,
  HUB_SUPABASE_URL,
  HUB_SUPABASE_ANON_KEY,
  isHubSupabaseConfigured,
} = hubAuthEnv;
