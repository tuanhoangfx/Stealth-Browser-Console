import { describe, expect, it, vi } from "vitest";
import { hubJwtSubject, verifyHubToolAccessFast, verifyHubToolAccessFromSnapshot } from "./hub-tool-access-fast-check";

const snapshot = {
  access_token: "jwt",
  user_id: "user-1",
  supabase_url: "https://hub-api.example/",
  supabase_anon_key: "anon",
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

function jwtWithSub(sub: string): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" })).replace(/=+$/g, "");
  const payload = btoa(JSON.stringify({ sub })).replace(/=+$/g, "");
  return `${header}.${payload}.sig`;
}

describe("verifyHubToolAccessFast", () => {
  it("posts the grant RPC with the cached Hub JWT", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(true));
    const ok = await verifyHubToolAccessFromSnapshot(snapshot, "P0012", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hub-api.example/rest/v1/rpc/hub_user_has_tool_access");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt");
    expect(JSON.parse(String(init.body))).toEqual({ p_user_id: "user-1", p_tool_code: "P0012" });
  });

  it("uses Hub JWT sub instead of a Data Box UUID on the snapshot", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(true));
    const hubUser = "12770af0-93b5-429e-85f1-9ecb4f66e9b5";
    const ok = await verifyHubToolAccessFromSnapshot(
      {
        ...snapshot,
        access_token: jwtWithSub(hubUser),
        user_id: "e1a4c337-aef1-4860-a039-33af34f01f81",
      },
      "P0015",
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(ok).toBe(true);
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({
      p_user_id: hubUser,
      p_tool_code: "P0015",
    });
    expect(hubJwtSubject(jwtWithSub(hubUser))).toBe(hubUser);
  });

  it("returns a proven deny", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(false));
    await expect(
      verifyHubToolAccessFromSnapshot(snapshot, "P0012", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBe(false);
  });

  it("is uncertain (null) on HTTP error, throw, or missing snapshot fields", async () => {
    const failing = vi.fn(async () => jsonResponse({ message: "nope" }, false, 401));
    await expect(
      verifyHubToolAccessFromSnapshot(snapshot, "P0012", {
        fetchImpl: failing as unknown as typeof fetch,
      }),
    ).resolves.toBeNull();

    const throwing = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      verifyHubToolAccessFromSnapshot(snapshot, "P0012", {
        fetchImpl: throwing as unknown as typeof fetch,
      }),
    ).resolves.toBeNull();

    await expect(verifyHubToolAccessFromSnapshot(null, "P0012")).resolves.toBeNull();
    await expect(
      verifyHubToolAccessFast({
        supabaseUrl: snapshot.supabase_url,
        anonKey: snapshot.supabase_anon_key,
        accessToken: "",
        userId: snapshot.user_id,
        toolCode: "P0012",
      }),
    ).resolves.toBeNull();
  });

  it("treats a non-boolean payload as uncertain", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    await expect(
      verifyHubToolAccessFromSnapshot(snapshot, "P0012", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toBeNull();
  });
});
