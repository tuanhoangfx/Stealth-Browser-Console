import { describe, expect, it } from "vitest";
import { isSupabaseAuthError } from "./supabase-auth-error";
import {
  AUTH_WRITE_REQUIRED_ERROR,
  createAuthWrite,
  createEnsureFreshSession,
} from "./ensure-fresh-supabase-auth";

describe("isSupabaseAuthError", () => {
  it("detects PGRST301/302 and 401", () => {
    expect(isSupabaseAuthError({ code: "PGRST301" })).toBe(true);
    expect(isSupabaseAuthError({ code: "PGRST302" })).toBe(true);
    expect(isSupabaseAuthError({ status: 401 })).toBe(true);
    expect(isSupabaseAuthError({ message: "JWT expired" })).toBe(true);
    expect(isSupabaseAuthError(null)).toBe(false);
  });

  it("detects anon table GRANT denial (42501) as auth", () => {
    expect(
      isSupabaseAuthError({
        code: "42501",
        message: "permission denied for table order_desk_products",
      }),
    ).toBe(true);
    expect(
      isSupabaseAuthError({
        message: "permission denied for table order_desk_products",
      }),
    ).toBe(true);
    // Plain "permission denied" without table GRANT wording stays non-auth.
    expect(isSupabaseAuthError({ message: "permission denied" })).toBe(false);
  });
});

describe("createAuthWrite", () => {
  it("retries once after auth error", async () => {
    let ensureCalls = 0;
    let runs = 0;
    const ensureFresh = async () => {
      ensureCalls += 1;
      return true;
    };
    const authWrite = createAuthWrite({ ensureFresh });
    const result = await authWrite(async () => {
      runs += 1;
      if (runs === 1) return { error: { code: "PGRST301" }, data: null };
      return { error: null, data: { ok: true } };
    });
    expect(runs).toBe(2);
    expect(ensureCalls).toBe(2); // initial + force
    expect(result).toEqual({ error: null, data: { ok: true } });
  });

  it("retries once after 42501 permission denied for table", async () => {
    let runs = 0;
    const authWrite = createAuthWrite({ ensureFresh: async () => true });
    const result = await authWrite(async () => {
      runs += 1;
      if (runs === 1) {
        return {
          error: { code: "42501", message: "permission denied for table order_desk_products" },
          data: null,
        };
      }
      return { error: null, data: { ok: true } };
    });
    expect(runs).toBe(2);
    expect(result).toEqual({ error: null, data: { ok: true } });
  });

  it("does not run the mutation when ensureFresh fails", async () => {
    let runs = 0;
    const authWrite = createAuthWrite({ ensureFresh: async () => false });
    const result = await authWrite(async () => {
      runs += 1;
      return { error: null, data: { ok: true } };
    });
    expect(runs).toBe(0);
    expect(result.error).toEqual(AUTH_WRITE_REQUIRED_ERROR);
  });

  it("does not retry non-auth errors", async () => {
    let runs = 0;
    const authWrite = createAuthWrite({ ensureFresh: async () => true });
    const result = await authWrite(async () => {
      runs += 1;
      return { error: { message: "unique violation" }, data: null };
    });
    expect(runs).toBe(1);
    expect(result.error).toEqual({ message: "unique violation" });
  });

  it("retries once after Failed to fetch", async () => {
    let runs = 0;
    const authWrite = createAuthWrite({ ensureFresh: async () => true });
    const result = await authWrite(async () => {
      runs += 1;
      if (runs === 1) return { error: { message: "TypeError: Failed to fetch" }, data: null };
      return { error: null, data: { ok: true } };
    });
    expect(runs).toBe(2);
    expect(result).toEqual({ error: null, data: { ok: true } });
  });

  it("retries once when run() throws Failed to fetch", async () => {
    let runs = 0;
    const authWrite = createAuthWrite({ ensureFresh: async () => true });
    const result = await authWrite(async () => {
      runs += 1;
      if (runs === 1) throw new TypeError("Failed to fetch");
      return { error: null, data: { ok: true } };
    });
    expect(runs).toBe(2);
    expect(result).toEqual({ error: null, data: { ok: true } });
  });
});

describe("createEnsureFreshSession", () => {
  it("returns false when not configured", async () => {
    const ensure = createEnsureFreshSession({
      isConfigured: () => false,
      getClient: () => null,
    });
    expect(await ensure()).toBe(false);
  });

  it("restores from restoreSession when GoTrue has no session", async () => {
    const ensure = createEnsureFreshSession({
      isConfigured: () => true,
      getClient: () =>
        ({
          auth: {
            getSession: async () => ({ data: { session: null } }),
            refreshSession: async () => ({ data: { session: null }, error: null }),
          },
        }) as never,
      restoreSession: async () =>
        ({
          access_token: "a",
          refresh_token: "r",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: "u1" },
        }) as never,
    });
    expect(await ensure()).toBe(true);
  });

  it("skips refresh when expires_at is missing (do not Failed-to-fetch every Save)", async () => {
    let refreshCalls = 0;
    const ensure = createEnsureFreshSession({
      isConfigured: () => true,
      getClient: () =>
        ({
          auth: {
            getSession: async () => ({
              data: {
                session: { access_token: "a", refresh_token: "r", user: { id: "u1" } },
              },
            }),
            refreshSession: async () => {
              refreshCalls += 1;
              throw new TypeError("Failed to fetch");
            },
          },
        }) as never,
    });
    expect(await ensure()).toBe(true);
    expect(refreshCalls).toBe(0);
  });

  it("keeps a live JWT when refreshSession throws Failed to fetch", async () => {
    const ensure = createEnsureFreshSession({
      isConfigured: () => true,
      getClient: () =>
        ({
          auth: {
            getSession: async () => ({
              data: {
                session: {
                  access_token: "a",
                  refresh_token: "r",
                  expires_at: Math.floor(Date.now() / 1000) + 30,
                  user: { id: "u1" },
                },
              },
            }),
            refreshSession: async () => {
              throw new TypeError("Failed to fetch");
            },
          },
        }) as never,
    });
    expect(await ensure()).toBe(true);
  });
});
