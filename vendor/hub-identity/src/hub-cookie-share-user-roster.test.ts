import { describe, expect, it, vi } from "vitest";
import {
  cookieShareRosterLookupEmail,
  cookieShareRosterRowMatchesQuery,
  fetchHubCookieShareUserRoster,
  HUB_COOKIE_SHARE_USER_ROSTER_RPC,
  isCookieShareRosterMissing,
} from "./hub-cookie-share-user-roster";

describe("cookie share roster helpers", () => {
  it("matches login_id, contact email, and full name", () => {
    const row = {
      login_id: "cs00577",
      contact_email: "buyer@outlook.com",
      full_name: "Pat",
    };
    expect(cookieShareRosterRowMatchesQuery(row, "CS00577")).toBe(true);
    expect(cookieShareRosterRowMatchesQuery(row, "buyer@outlook")).toBe(true);
    expect(cookieShareRosterRowMatchesQuery(row, "pat")).toBe(true);
    expect(cookieShareRosterRowMatchesQuery(row, "missing")).toBe(false);
  });

  it("uses contact email for upsert lookup, never opaque auth", () => {
    expect(
      cookieShareRosterLookupEmail({
        login_id: "cs00577",
        email: "u_abc@auth.infi.internal",
        contact_email: "buyer@outlook.com",
      }),
    ).toBe("buyer@outlook.com");
    expect(
      cookieShareRosterLookupEmail({
        login_id: "cs00577",
        email: "u_abc@auth.infi.internal",
      }),
    ).toBe("cs00577");
  });

  it("treats PostgREST missing-fn as missing, not a warning", () => {
    expect(isCookieShareRosterMissing("Could not find the function public.hub_cookie_share_user_roster", 404)).toBe(
      true,
    );
  });
});

describe("fetchHubCookieShareUserRoster", () => {
  it("pages until a short page and posts the Cookie Share RPC", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { p_offset?: number };
      const offset = Number(body.p_offset ?? 0);
      const rows =
        offset === 0
          ? Array.from({ length: 1000 }, (_, i) => ({ login_id: `u${String(i).padStart(4, "0")}` }))
          : [{ login_id: "cs00577" }];
      return new Response(JSON.stringify(rows), { status: 200 });
    });
    const result = await fetchHubCookieShareUserRoster({
      supabaseUrl: "https://hub-api.infi.io.vn",
      anonKey: "anon",
      accessToken: "jwt",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.missing).toBe(false);
    expect(result.rows).toHaveLength(1001);
    expect(result.rows.at(-1)?.login_id).toBe("cs00577");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(`/rest/v1/rpc/${HUB_COOKIE_SHARE_USER_ROSTER_RPC}`);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
