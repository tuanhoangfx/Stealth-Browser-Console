// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheHubIdentity, clearHubIdentity, readHubIdentity } from "./hub-identity-cache";
import {
  HUB_WAITING_FOR_APPROVAL_MESSAGE,
  enforceHubIdentitySnapshotApproval,
  enforceHubProfileApproval,
  isHubAdminRole,
  isHubApprovedAtPending,
} from "./hub-profile-approval";

function client(
  row: { approved_at?: string | null; role?: string | null } | null,
  error: { message?: string } | null = null,
  toolGrant = false,
) {
  return {
    from: vi.fn((table: string) => {
      if (table === "tool_access") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: toolGrant ? { user_id: "u1" } : null,
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: row, error })),
          })),
        })),
      };
    }),
    auth: { signOut: vi.fn(async () => undefined) },
  };
}

describe("hub-profile-approval", () => {
  it("does not treat unknown / admin as pending", () => {
    expect(isHubApprovedAtPending(undefined, "user")).toBe(false);
    expect(isHubApprovedAtPending(null, "admin")).toBe(false);
    expect(isHubAdminRole("Admin")).toBe(true);
    expect(isHubApprovedAtPending(null, "user")).toBe(true);
    expect(isHubApprovedAtPending("", "user")).toBe(true);
    expect(isHubApprovedAtPending("2026-08-27T00:00:00.000Z", "user")).toBe(false);
  });

  it("fail-open when client / column / query is missing", async () => {
    expect(await enforceHubProfileApproval(null, "u1")).toEqual({ ok: true });
    expect(await enforceHubProfileApproval({} as never, "u1")).toEqual({ ok: true });
    expect(await enforceHubProfileApproval(client(null, { message: "column approved_at does not exist" }), "u1")).toEqual({
      ok: true,
    });
    expect(await enforceHubProfileApproval(client(null), "u1")).toEqual({ ok: true });
  });

  it("blocks a pending non-admin after a successful grant", async () => {
    const result = await enforceHubProfileApproval(client({ approved_at: null, role: "user" }), "u1");
    expect(result).toEqual({ ok: false, error: HUB_WAITING_FOR_APPROVAL_MESSAGE });
  });

  it("allows a pending user when at least one tool grant is approved", async () => {
    const result = await enforceHubProfileApproval(
      client({ approved_at: null, role: "user" }, null, true),
      "u1",
    );
    expect(result).toEqual({ ok: true });
  });

  it("allows admins even when approved_at is null", async () => {
    const result = await enforceHubProfileApproval(client({ approved_at: null, role: "admin" }), "u1");
    expect(result).toEqual({ ok: true });
  });
});

const SNAP = {
  access_token: "access-1",
  refresh_token: "refresh-1",
  expires_at: 9_999_999_999,
  user_id: "user-1",
  user_email: "a@corp.com",
  supabase_url: "https://hub.example.co",
  supabase_anon_key: "anon-key",
};

describe("enforceHubIdentitySnapshotApproval", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearHubIdentity();
  });

  it("passes when no Hub snapshot is cached", async () => {
    expect(await enforceHubIdentitySnapshotApproval()).toEqual({ ok: true });
  });

  it("fail-open when the profile query errors", async () => {
    cacheHubIdentity(SNAP, "test");
    const fetchImpl = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await enforceHubIdentitySnapshotApproval({ fetchImpl })).toEqual({ ok: true });
    expect(readHubIdentity()?.access_token).toBe("access-1");
  });

  it("clears a leftover pending snapshot so Dual tools cannot stay signed in", async () => {
    cacheHubIdentity(SNAP, "test");
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("tool_access")) {
        return { ok: true, json: async () => [] };
      }
      return {
        ok: true,
        json: async () => [{ approved_at: null, role: "user" }],
      };
    });
    const result = await enforceHubIdentitySnapshotApproval({ fetchImpl: fetchImpl as typeof fetch });
    expect(result).toEqual({ ok: false, error: HUB_WAITING_FOR_APPROVAL_MESSAGE });
    expect(readHubIdentity()).toBeNull();
  });

  it("keeps an approved leftover snapshot", async () => {
    cacheHubIdentity(SNAP, "test");
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("tool_access")) {
        return { ok: true, json: async () => [] };
      }
      return {
        ok: true,
        json: async () => [{ approved_at: "2026-08-27T00:00:00.000Z", role: "user" }],
      };
    });
    expect(await enforceHubIdentitySnapshotApproval({ fetchImpl: fetchImpl as typeof fetch })).toEqual({
      ok: true,
    });
    expect(readHubIdentity()?.access_token).toBe("access-1");
  });

  it("allows a pending snapshot when an approved tool grant exists", async () => {
    cacheHubIdentity(SNAP, "test");
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("tool_access")) {
        return { ok: true, json: async () => [{ user_id: "user-1" }] };
      }
      return {
        ok: true,
        json: async () => [{ approved_at: null, role: "user" }],
      };
    });
    expect(await enforceHubIdentitySnapshotApproval({ fetchImpl: fetchImpl as typeof fetch })).toEqual({
      ok: true,
    });
    expect(readHubIdentity()?.access_token).toBe("access-1");
  });
});
