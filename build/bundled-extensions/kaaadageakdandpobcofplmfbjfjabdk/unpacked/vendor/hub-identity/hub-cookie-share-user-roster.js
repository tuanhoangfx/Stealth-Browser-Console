/** Synced from packages/hub-identity — Cookie Share Username roster (Hub RPC). */

export const HUB_COOKIE_SHARE_USER_ROSTER_RPC = "hub_cookie_share_user_roster";
export const HUB_COOKIE_SHARE_USER_ROSTER_PAGE_SIZE = 1000;

function isTechnicalAuthEmail(email) {
  const value = String(email ?? "").trim().toLowerCase();
  return (
    value.endsWith("@auth.infi.internal") ||
    value.endsWith("@infix1.io.vn") ||
    value.endsWith("@id.hub.x1z10.local")
  );
}

export function isCookieShareRosterMissing(message, status) {
  return /does not exist|not found|PGRST202|42883/i.test(String(message ?? "")) || status === 404;
}

export function cookieShareRosterSearchHaystack(row) {
  return [row?.login_id, row?.email, row?.contact_email, row?.full_name]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function cookieShareRosterRowMatchesQuery(row, query) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return true;
  return cookieShareRosterSearchHaystack(row).includes(needle);
}

export function cookieShareRosterLookupEmail(row) {
  const loginId = String(row?.login_id ?? "").trim().toLowerCase();
  for (const raw of [row?.contact_email, row?.email]) {
    const email = String(raw ?? "").trim().toLowerCase();
    if (email.includes("@") && !isTechnicalAuthEmail(email)) return email;
  }
  return loginId;
}

function parseRpcErrorBody(text) {
  try {
    const json = JSON.parse(text);
    return String(json.message || json.hint || text).trim() || text;
  } catch {
    return String(text ?? "").trim();
  }
}

export async function fetchHubCookieShareUserRoster(auth) {
  const base = String(auth?.supabaseUrl ?? "").replace(/\/$/, "");
  const token = String(auth?.accessToken ?? "").trim();
  const anon = String(auth?.anonKey ?? "").trim();
  if (!base || !token || !anon) {
    return { rows: [], warning: "Hub session missing.", missing: false };
  }

  const doFetch = auth.fetchImpl ?? fetch;
  const collected = [];
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
    let page = [];
    try {
      const parsed = JSON.parse(text);
      page = Array.isArray(parsed) ? parsed : [];
    } catch {
      return { rows: collected, warning: "Cookie share roster returned invalid JSON.", missing: false };
    }
    collected.push(...page);
    if (page.length < HUB_COOKIE_SHARE_USER_ROSTER_PAGE_SIZE) break;
  }

  return { rows: collected, warning: null, missing: false };
}
