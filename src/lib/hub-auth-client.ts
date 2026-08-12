import type { Session } from "@supabase/supabase-js";
import { signInHubIdentityPlane } from "@tool-workspace/hub-identity";
import { isHubSupabaseConfigured } from "./hub-supabase-env";
import { getHubIdentitySession, getIdentitySupabase, persistHubSession } from "./supabase-identity";

export async function ensureHubAuth(): Promise<Session | null> {
  if (!isHubSupabaseConfigured) return null;
  return getHubIdentitySession();
}

/**
 * Hub sign-in — User ID must resolve via `/hub/auth/resolve-login` (e.g. `czpgo` →
 * `czpgo@outlook.com`) before synthetic `@infix1.io.vn` fallback. Do not call
 * `signInWithPassword` on `resolveHubLogin().authEmail` alone.
 */
export async function signInHubIdentity(
  loginInput: string,
  password: string,
  mode: "signin" | "signup" = "signin",
): Promise<Session> {
  const { identitySession } = await signInHubIdentityPlane(loginInput, password, mode, {
    getHubClient: () => getIdentitySupabase(),
    hubNotConfiguredError: "Hub Supabase not configured",
    cacheHubIdentityFromSession: (session) => {
      persistHubSession(session);
    },
  });
  return identitySession;
}
