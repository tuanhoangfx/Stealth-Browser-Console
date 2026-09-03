import { isHubTechnicalAuthEmail } from "./hub-login";

/** Hub PostgREST RPC for Cookie Share Username (P0020 + E0001). */
export const HUB_COOKIE_SHARE_USER_ROSTER_RPC = "hub_cookie_share_user_roster";
export const HUB_COOKIE_SHARE_USER_ROSTER_PAGE_SIZE = 1000;

export type HubCookieShareUserRow = {
  id?: string | null;
  login_id?: string | null;
  email?: string | null;
  contact_email?: string | null;
  full_name?: string | null;
  last_activity_at?: string | null;
  last_sign_in_at?: string | null;
};

export type HubCookieShareRosterAuth = {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
};

export type HubCookieShareRosterResult = {
  rows: HubCookieShareUserRow[];
  warning: string | null;
  missing: boolean;
};

export function isCookieShareRosterMissing(message: string, status?: number): boolean {
  return /does not exist|not found|PGRST202|42883/i.test(message) || status === 404;
}

export function cookieShareRosterSearchHaystack(row: HubCookieShareUserRow): string {
  return [row.login_id, row.email, row.contact_email, row.full_name]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function cookieShareRosterRowMatchesQuery(row: HubCookieShareUserRow, query: string): boolean {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return true;
  return cookieShareRosterSearchHaystack(row).includes(needle);
}

/** Username upsert lookup: real contact email, else login_id (never technical auth). */
export function cookieShareRosterLookupEmail(row: HubCookieShareUserRow): string {
  const loginId = String(row.login_id ?? "").trim().toLowerCase();
  for (const raw of [row.contact_email, row.email]) {
    const email = String(raw ?? "").trim().toLowerCase();
    if (email.includes("@") && !isHubTechnicalAuthEmail(email)) return email;
  }
  return loginId;
}

function parseRpcErrorBody(text: string): string {
  try {
    const json = JSON.parse(text) as { message?: string; hint?: string };
    return String(json.message || json.hint || text).trim() || text;
  } catch {
    return text.trim();
  }
}

export async function fetchHubCookieShareUserRoster(
  auth: HubCookieShareRosterAuth,
): Promise<HubCookieShareRosterResult> {
  const base = String(auth.supabaseUrl ?? "").replace(/\/$/, "");
  const token = String(auth.accessToken ?? "").trim();
  const anon = String(auth.anonKey ?? "").trim();
  if (!base || !token || !anon) {
    return { rows: [], warning: "Hub session missing.", missing: false };
  }

  const doFetch = auth.fetchImpl ?? fetch;
  const collected: HubCookieShareUserRow[] = [];
  const rpcUrl = `${base}/rest/v1/rpc/${HUB_COOKIE_SHARE_USER_ROSTER_RPC}`;

  for (let offset = 0; ; offset += HUB_COOKIE_SHARE_USER_ROSTER_PAGE_SIZE) {
    const res = await doFetch(rpcUrl, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_offset: offset,
        p_limit: HUB_COOKIE_SHARE_USER_ROSTER_PAGE_SIZE,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      const message = parseRpcErrorBody(text) || `HTTP ${res.status}`;
      return {
        rows: collected,
        warning: isCookieShareRosterMissing(message, res.status) ? null : message,
        missing: isCookieShareRosterMissing(message, res.status),
      };
    }
    let page: HubCookieShareUserRow[] = [];
    try {
      const parsed = JSON.parse(text) as unknown;
      page = Array.isArray(parsed) ? (parsed as HubCookieShareUserRow[]) : [];
    } catch {
      return { rows: collected, warning: "Cookie share roster returned invalid JSON.", missing: false };
    }
    collected.push(...page);
    if (page.length < HUB_COOKIE_SHARE_USER_ROSTER_PAGE_SIZE) break;
  }

  return { rows: collected, warning: null, missing: false };
}
