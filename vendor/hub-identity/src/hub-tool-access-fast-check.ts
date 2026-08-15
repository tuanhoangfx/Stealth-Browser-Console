/**
 * Fast Hub tool-grant check for dual-plane hosts (Hub JWT cached, data plane owns the session).
 *
 * `verifyHubIntegratedToolAccess` needs a Supabase client whose session is applied, and
 * `setSession()` costs an extra `/auth/v1/user` round-trip (~650ms on the home server) before the
 * grant RPC can even start. Hosts that already hold a Hub JWT snapshot only need one request.
 *
 * Returns `null` for "uncertain" (network / HTTP failure) so callers keep a stale grant instead of
 * flashing Access Denied — same contract as `verifyHubIntegratedToolAccess`.
 */

export const HUB_TOOL_ACCESS_FAST_CHECK_TIMEOUT_MS = 4_000;

export type HubToolAccessFastCheckInput = {
  supabaseUrl?: string | null;
  anonKey?: string | null;
  accessToken?: string | null;
  userId?: string | null;
  toolCode: string;
  timeoutMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
};

/** Single `hub_user_has_tool_access` RPC with a cached Hub JWT — no client session apply. */
export async function verifyHubToolAccessFast(
  input: HubToolAccessFastCheckInput,
): Promise<boolean | null> {
  const url = String(input.supabaseUrl ?? "").trim().replace(/\/$/, "");
  const anonKey = String(input.anonKey ?? "").trim();
  const accessToken = String(input.accessToken ?? "").trim();
  const userId = String(input.userId ?? "").trim();
  const toolCode = String(input.toolCode ?? "").trim();
  if (!url || !anonKey || !accessToken || !userId || !toolCode) return null;

  const doFetch = input.fetchImpl ?? fetch;
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timeoutMs = input.timeoutMs ?? HUB_TOOL_ACCESS_FAST_CHECK_TIMEOUT_MS;
  const timer = controller
    ? setTimeout(() => controller.abort(), Math.max(250, timeoutMs))
    : null;

  try {
    const res = await doFetch(`${url}/rest/v1/rpc/hub_user_has_tool_access`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ p_user_id: userId, p_tool_code: toolCode }),
      signal: controller?.signal,
    });
    if (!res.ok) return null;
    const value = (await res.json().catch(() => null)) as unknown;
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type HubToolAccessSnapshotLike = {
  access_token?: string | null;
  user_id?: string | null;
  supabase_url?: string | null;
  supabase_anon_key?: string | null;
};

/** Same check driven by a `HubIdentitySnapshot` (localStorage SSOT). */
export async function verifyHubToolAccessFromSnapshot(
  snapshot: HubToolAccessSnapshotLike | null | undefined,
  toolCode: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<boolean | null> {
  if (!snapshot) return null;
  return verifyHubToolAccessFast({
    supabaseUrl: snapshot.supabase_url,
    anonKey: snapshot.supabase_anon_key,
    accessToken: snapshot.access_token,
    userId: snapshot.user_id,
    toolCode,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  });
}
