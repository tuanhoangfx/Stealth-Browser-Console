import type { SupabaseClient } from "@supabase/supabase-js";
import { isDevAutoLoginEnabled, readDevAutoLoginCreds, withDevAuthTimeout } from "./dev-auto-login";
import { signInWithHubPassword } from "./hub-auth-submit";
import { enforceHubProfileApproval, signOutHubIfPresent } from "./hub-profile-approval";

/** Dev localhost: sign in to Tool Hub identity (Home Server GoTrue) using env credentials. */
export async function devHubAutoSignIn(client: SupabaseClient): Promise<boolean> {
  if (!isDevAutoLoginEnabled()) return false;
  const creds = readDevAutoLoginCreds();
  if (!creds) return false;

  const attempt = async (authEmail: string) => {
    const { data, error } = await client.auth.signInWithPassword({
      email: authEmail,
      password: creds.password,
    });
    return { data: { session: data.session }, error };
  };

  try {
    const { data, error } = await withDevAuthTimeout(
      signInWithHubPassword(creds.email, attempt, "signin"),
    );
    if (error || !data?.session) return false;
    const gate = await enforceHubProfileApproval(client, data.session.user?.id);
    if (!gate.ok) {
      await signOutHubIfPresent(client);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
