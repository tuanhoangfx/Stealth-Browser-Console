import type { SupabaseClient } from "@supabase/supabase-js";
import { hasEffectiveHubToolAccess } from "./hub-default-tool-access";

async function resolveAuthUserId(client: SupabaseClient): Promise<string | null | undefined> {
  // Prefer local session — avoids false deny when getUser() network/proxy fails.
  const { data: sessionData } = await client.auth.getSession();
  const fromSession = sessionData.session?.user?.id?.trim();
  if (fromSession) return fromSession;

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) return undefined; // uncertain
  return authData.user?.id?.trim() || null;
}

/** Client-side tool grant check against Hub identity DB (P0003 / P0004 / P0016 / P0020). */
export async function verifyHubIntegratedToolAccess(
  client: SupabaseClient,
  toolCode: string,
): Promise<boolean | null> {
  const code = toolCode.trim();
  if (!code) return false;

  const userId = await resolveAuthUserId(client);
  if (userId === undefined) return null;
  if (!userId) return false;

  const { data: rpcOk, error: rpcError } = await client.rpc("hub_user_has_tool_access", {
    p_user_id: userId,
    p_tool_code: code,
  });
  if (!rpcError && typeof rpcOk === "boolean") return rpcOk;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return null;

  const role = String(profile?.role ?? "user").trim().toLowerCase();
  if (role === "admin") return true;

  const { data: grants, error: grantError } = await client
    .from("tool_access")
    .select("tool_code")
    .eq("user_id", userId);
  if (grantError) {
    if (/tool_access|does not exist|PGRST205/i.test(grantError.message)) return null;
    return null;
  }

  const codes = (grants ?? []).map((row) => String(row.tool_code ?? "").trim()).filter(Boolean);
  return hasEffectiveHubToolAccess(role, code, codes);
}
