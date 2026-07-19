import { describe, expect, it } from "vitest";
import { isSupabaseAuthError } from "./supabase-auth-error";
import { createAuthWrite, createEnsureFreshSession } from "./ensure-fresh-supabase-auth";

describe("isSupabaseAuthError", () => {
  it("detects PGRST301/302 and 401", () => {
    expect(isSupabaseAuthError({ code: "PGRST301" })).toBe(true);
    expect(isSupabaseAuthError({ code: "PGRST302" })).toBe(true);
    expect(isSupabaseAuthError({ status: 401 })).toBe(true);
    expect(isSupabaseAuthError({ message: "JWT expired" })).toBe(true);
    expect(isSupabaseAuthError({ message: "permission denied" })).toBe(false);
    expect(isSupabaseAuthError(null)).toBe(false);
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
});

describe("createEnsureFreshSession", () => {
  it("returns false when not configured", async () => {
    const ensure = createEnsureFreshSession({
      isConfigured: () => false,
      getClient: () => null,
    });
    expect(await ensure()).toBe(false);
  });
});
