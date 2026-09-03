import { clearHubIdentity, markHubIdentitySignedOut, readHubIdentity } from "./hub-identity-cache";
import { hubJwtSubject } from "./hub-tool-access-fast-check";

/** Shared Hub account approval — `profiles.approved_at`. */

export const HUB_WAITING_FOR_APPROVAL_MESSAGE =
  "Waiting for approval. Ask a Hub Admin to approve your account.";

/** Duck-typed — do not pin Supabase query-builder generics (TS2589). */
export type HubProfileApprovalClient = {
  from: (table: string) => unknown;
  auth?: {
    signOut?: (opts?: { scope?: "local" | "global" | "others" }) => Promise<unknown>;
  };
};

type ProfileApprovalQuery = {
  select: (columns: string) => {
    eq: (
      column: string,
      value: string,
    ) => {
      maybeSingle: () => Promise<{
        data: { approved_at?: string | null; role?: string | null } | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

type ToolAccessApprovalQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      not: (
        column: string,
        operator: string,
        value: unknown,
      ) => {
        limit: (count: number) => {
          maybeSingle: () => Promise<{
            data: { user_id?: string } | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };
};

export function isHubToolAccessApprovalColumnMissing(message: string | null | undefined): boolean {
  return /approved_at|tool_access|PGRST204|42703|does not exist/i.test(String(message ?? ""));
}

/** Tool-based SSOT — at least one approved grant counts as Hub-approved. */
export async function hubUserHasApprovedToolGrant(
  hub: HubProfileApprovalClient | null | undefined,
  userId: string,
): Promise<boolean> {
  const id = String(userId ?? "").trim();
  if (!hub || typeof hub.from !== "function" || !id) return false;
  try {
    const { data, error } = await (hub.from("tool_access") as ToolAccessApprovalQuery)
      .select("user_id")
      .eq("user_id", id)
      .not("approved_at", "is", null)
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isHubToolAccessApprovalColumnMissing(error.message)) return false;
      return false;
    }
    return Boolean(data?.user_id);
  } catch {
    return false;
  }
}

export function isHubAdminRole(role: unknown): boolean {
  return String(role ?? "").trim().toLowerCase() === "admin";
}

/** `null` / blank = waiting. `undefined` = unknown (do not treat as pending). */
export function isHubApprovedAtPending(approvedAt: unknown, role?: unknown): boolean {
  if (isHubAdminRole(role)) return false;
  if (approvedAt === undefined) return false;
  return approvedAt == null || !String(approvedAt).trim();
}

export function isHubApprovalColumnMissing(message: string | null | undefined): boolean {
  return /approved_at|PGRST204|42703/i.test(String(message ?? ""));
}

/**
 * After a Hub password grant (or session restore).
 * Fail-open when the column / query is missing so a migrate miss cannot lock the workspace.
 */
export async function enforceHubProfileApproval(
  hub: HubProfileApprovalClient | null | undefined,
  userId: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = String(userId ?? "").trim();
  if (!hub || typeof hub.from !== "function" || !id) return { ok: true };
  try {
    const { data, error } = await (hub.from("profiles") as ProfileApprovalQuery)
      .select("approved_at, role")
      .eq("id", id)
      .maybeSingle();
    if (error) return { ok: true };
    if (!data) return { ok: true };
    if (!isHubApprovedAtPending(data.approved_at, data.role)) return { ok: true };
    if (await hubUserHasApprovedToolGrant(hub, id)) return { ok: true };
    return { ok: false, error: HUB_WAITING_FOR_APPROVAL_MESSAGE };
  } catch {
    return { ok: true };
  }
}

export async function signOutHubIfPresent(hub: HubProfileApprovalClient | null | undefined): Promise<void> {
  try {
    await hub?.auth?.signOut?.({ scope: "local" });
  } catch {
    /* local clear only */
  }
}

function dropPendingHubIdentitySnapshot(): void {
  clearHubIdentity("pending-approval");
  markHubIdentitySignedOut();
}

/**
 * Dual / leftover JWT: Hub cache can keep a pending user inside P0020 / P0005 / P0022
 * until the next Sign In. Fail-open on network / missing column.
 */
export async function enforceHubIdentitySnapshotApproval(input?: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const snap = readHubIdentity();
  const accessToken = String(snap?.access_token ?? "").trim();
  if (!accessToken || !snap) return { ok: true };
  const url = String(snap.supabase_url ?? "").trim().replace(/\/$/, "");
  const anonKey = String(snap.supabase_anon_key ?? "").trim();
  const userId = String(snap.user_id ?? "").trim() || hubJwtSubject(accessToken);
  if (!url || !anonKey || !userId) return { ok: true };

  try {
    const doFetch = input?.fetchImpl ?? fetch;
    const controller = typeof AbortController === "undefined" ? null : new AbortController();
    const timeoutMs = input?.timeoutMs ?? 4000;
    const timer = controller ? setTimeout(() => controller.abort(), Math.max(250, timeoutMs)) : null;
    const res = await doFetch(
      `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=approved_at,role`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller?.signal,
      },
    );
    if (timer) clearTimeout(timer);
    if (!res.ok) return { ok: true };
    const rows = (await res.json()) as { approved_at?: string | null; role?: string | null }[];
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return { ok: true };
    if (!isHubApprovedAtPending(row.approved_at, row.role)) return { ok: true };
    const toolRes = await doFetch(
      `${url}/rest/v1/tool_access?user_id=eq.${encodeURIComponent(userId)}&approved_at=not.is.null&select=user_id&limit=1`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller?.signal,
      },
    );
    if (toolRes.ok) {
      const toolRows = (await toolRes.json()) as { user_id?: string }[];
      if (Array.isArray(toolRows) && toolRows.length > 0) return { ok: true };
    }
    dropPendingHubIdentitySnapshot();
    return { ok: false, error: HUB_WAITING_FOR_APPROVAL_MESSAGE };
  } catch {
    return { ok: true };
  }
}
