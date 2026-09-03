/** Record signup / live tool-access requests — `hub_record_tool_access_request` RPC. */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Minimal Supabase surface — avoids narrowing `rpc` below PostgrestClient. */
export type HubToolAccessRequestClient = Pick<SupabaseClient, "rpc">;

export function normalizeHubToolAccessRequestCode(toolCode: string | null | undefined): string | null {
  const code = String(toolCode ?? "").trim().toUpperCase();
  return /^P\d{4}$/.test(code) ? code : null;
}

export function isHubToolAccessRequestRpcMissing(message: string | null | undefined): boolean {
  return /hub_record_tool_access_request|PGRST202|42883|does not exist/i.test(String(message ?? ""));
}

/** Fail-open when migrate is behind — never block Sign In / Request UI. */
export async function recordHubToolAccessRequest(
  client: HubToolAccessRequestClient | null | undefined,
  toolCode: string | null | undefined,
): Promise<{ ok: boolean; kind?: string; toolCode?: string }> {
  const code = normalizeHubToolAccessRequestCode(toolCode);
  if (!client?.rpc || !code) return { ok: false };
  try {
    const { data, error } = await client.rpc("hub_record_tool_access_request", { p_tool_code: code });
    if (error) {
      if (isHubToolAccessRequestRpcMissing(error.message)) return { ok: true, kind: "migrate_miss", toolCode: code };
      return { ok: false };
    }
    const row = data as { ok?: boolean; kind?: string; tool_code?: string } | null;
    return {
      ok: row?.ok !== false,
      kind: typeof row?.kind === "string" ? row.kind : undefined,
      toolCode: typeof row?.tool_code === "string" ? row.tool_code : code,
    };
  } catch {
    return { ok: false };
  }
}
