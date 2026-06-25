import { createHubIdentitySupabaseClient } from "@tool-workspace/hub-identity";
import { HUB_SUPABASE_ANON_KEY, HUB_SUPABASE_URL } from "./hub-supabase-env";

const hubIdentity = createHubIdentitySupabaseClient({
  defaultUrl: HUB_SUPABASE_URL,
  defaultAnonKey: HUB_SUPABASE_ANON_KEY,
});

export const {
  getIdentitySupabase,
  applyHubIdentitySession,
  getHubIdentitySession,
  persistHubSession,
  readCachedHubSession,
  sessionFromHubSnapshot,
} = hubIdentity;
