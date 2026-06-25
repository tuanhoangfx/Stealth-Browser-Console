import type { Session } from "@supabase/supabase-js";
import { resolveHubLogin } from "@tool-workspace/hub-identity";
import { isHubSupabaseConfigured } from "./hub-supabase-env";
import { getHubIdentitySession, getIdentitySupabase, persistHubSession } from "./supabase-identity";

export async function ensureHubAuth(): Promise<Session | null> {
  if (!isHubSupabaseConfigured) return null;
  return getHubIdentitySession();
}

export async function signInHubIdentity(
  loginInput: string,
  password: string,
  mode: "signin" | "signup" = "signin",
): Promise<Session> {
  const client = getIdentitySupabase();
  if (!client) throw new Error("Hub Supabase not configured");
  const resolved = resolveHubLogin(loginInput);
  const action =
    mode === "signup"
      ? client.auth.signUp({
          email: resolved.authEmail,
          password,
          options: {
            data: {
              full_name: resolved.loginId ?? resolved.authEmail.split("@")[0],
              login_id: resolved.loginId ?? undefined,
            },
          },
        })
      : client.auth.signInWithPassword({ email: resolved.authEmail, password });
  const { data, error } = await action;
  if (error) throw error;
  if (!data.session) throw new Error("Sign-in succeeded but no session was returned.");
  if (mode === "signup" && resolved.loginId && data.user?.id) {
    await client
      .from("profiles")
      .update({ login_id: resolved.loginId, updated_at: new Date().toISOString() })
      .eq("id", data.user.id);
  }
  persistHubSession(data.session);
  return data.session;
}
