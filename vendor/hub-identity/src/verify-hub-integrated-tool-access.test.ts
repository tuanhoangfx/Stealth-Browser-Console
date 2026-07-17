import { describe, expect, it, vi } from "vitest";
import { verifyHubIntegratedToolAccess } from "./verify-hub-integrated-tool-access";

function mockClient(opts: {
  sessionUserId?: string | null;
  getUserError?: Error | null;
  getUserId?: string | null;
  rpc?: { data: unknown; error: { message: string } | null };
  profile?: { data: { role: string } | null; error: { message: string } | null };
  grants?: { data: { tool_code: string }[] | null; error: { message: string } | null };
}) {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: opts.sessionUserId
            ? { user: { id: opts.sessionUserId } }
            : null,
        },
      })),
      getUser: vi.fn(async () => ({
        data: { user: opts.getUserId ? { id: opts.getUserId } : null },
        error: opts.getUserError ?? null,
      })),
    },
    rpc: vi.fn(async () => opts.rpc ?? { data: null, error: { message: "missing" } }),
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => opts.profile ?? { data: { role: "user" }, error: null },
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: async () => opts.grants ?? { data: [], error: null },
        }),
      };
    }),
  } as never;
}

describe("verifyHubIntegratedToolAccess", () => {
  it("uses security-definer RPC when available", async () => {
    const client = mockClient({
      sessionUserId: "u1",
      rpc: { data: true, error: null },
    });
    await expect(verifyHubIntegratedToolAccess(client, "P0003")).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("hub_user_has_tool_access", {
      p_user_id: "u1",
      p_tool_code: "P0003",
    });
  });

  it("does not false-deny when getUser fails but session exists", async () => {
    const client = mockClient({
      sessionUserId: "u1",
      getUserError: new Error("network"),
      rpc: { data: true, error: null },
    });
    await expect(verifyHubIntegratedToolAccess(client, "P0003")).resolves.toBe(true);
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it("returns null (uncertain) when auth lookup fails with no session", async () => {
    const client = mockClient({
      sessionUserId: null,
      getUserError: new Error("network"),
    });
    await expect(verifyHubIntegratedToolAccess(client, "P0003")).resolves.toBeNull();
  });

  it("falls back to tool_access rows when RPC is unavailable", async () => {
    const client = mockClient({
      sessionUserId: "u1",
      rpc: { data: null, error: { message: "function not found" } },
      profile: { data: { role: "user" }, error: null },
      grants: { data: [{ tool_code: "P0003" }], error: null },
    });
    await expect(verifyHubIntegratedToolAccess(client, "P0003")).resolves.toBe(true);
  });

  it("returns false when user has no grant", async () => {
    const client = mockClient({
      sessionUserId: "u1",
      rpc: { data: false, error: null },
    });
    await expect(verifyHubIntegratedToolAccess(client, "P0003")).resolves.toBe(false);
  });
});
