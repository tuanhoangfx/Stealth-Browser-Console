import type { SupabaseClient } from "@supabase/supabase-js";
import { hasEffectiveHubToolAccess } from "./hub-default-tool-access";
import { isP0004HubLogin } from "./integrated-login-tools";

/** Client-side tool grant check against Hub identity DB (P0003 / P0016 / P0020 desktop tools). */
export async function verifyHubIntegratedToolAccess(
  client: SupabaseClient,
  toolCode: string,
): Promise<boolean | null> {
  const code = toolCode.trim();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return false;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) return null;

  const role = String(profile?.role ?? "user").trim().toLowerCase();
  if (role === "admin") return true;
  if (isP0004HubLogin(code)) return true;

  const { data: grants, error: grantError } = await client
    .from("tool_access")
    .select("tool_code")
    .eq("user_id", authData.user.id);
  if (grantError) {
    if (/tool_access|does not exist|PGRST205/i.test(grantError.message)) return null;
    return null;
  }

  const codes = (grants ?? []).map((row) => String(row.tool_code ?? "").trim()).filter(Boolean);
  return hasEffectiveHubToolAccess(role, code, codes);
}
