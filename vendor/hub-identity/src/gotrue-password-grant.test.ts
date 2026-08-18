import { describe, expect, it, vi } from "vitest";
import { grantGoTruePasswordSession, readSupabaseGoTrueTarget, adoptGrantedGoTrueSession } from "./gotrue-password-grant";

describe("grantGoTruePasswordSession", () => {
  it("builds a session from a single token POST (no /user)", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: "tok",
        refresh_token: "ref",
        expires_in: 3600,
        user: { id: "u1", email: "a@corp.com" },
      }),
    }));
    const out = await grantGoTruePasswordSession({
      supabaseUrl: "https://hub-api.example",
      anonKey: "anon",
      email: "a@corp.com",
      password: "secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.error).toBeNull();
    expect(out.session?.access_token).toBe("tok");
    expect(out.session?.user?.id).toBe("u1");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "https://hub-api.example/auth/v1/token?grant_type=password",
    );
  });

  it("maps GoTrue invalid credentials", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error_description: "Invalid login credentials" }),
    }));
    const out = await grantGoTruePasswordSession({
      supabaseUrl: "https://hub-api.example",
      anonKey: "anon",
      email: "a@corp.com",
      password: "bad",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.session).toBeNull();
    expect(out.error?.message).toMatch(/Invalid login credentials/);
  });

  it("reads supabase-js client URL/key", () => {
    expect(
      readSupabaseGoTrueTarget({ supabaseUrl: "https://hub-api.example/", supabaseKey: "anon" }),
    ).toEqual({ supabaseUrl: "https://hub-api.example", anonKey: "anon" });
    expect(readSupabaseGoTrueTarget({})).toBeNull();
  });

  it("adopts a granted session without awaiting /user", () => {
    const setSession = vi.fn(async () => {
      throw new Error("must not be awaited");
    });
    adoptGrantedGoTrueSession({ auth: { setSession } }, {
      access_token: "tok",
      refresh_token: "ref",
    } as never);
    expect(setSession).toHaveBeenCalledOnce();
  });
});
