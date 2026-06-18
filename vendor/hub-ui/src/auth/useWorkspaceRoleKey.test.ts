import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { Crown, UserRound } from "lucide-react";
import { useWorkspaceRoleKey } from "./useWorkspaceRoleKey";
import { resolveWorkspaceRoleIcon } from "./hub-workspace-role-icon";

function mockStorage(get: string | null) {
  return { getItem: () => get, setItem: vi.fn() };
}

function mockProfileClient(role: string | Promise<string>) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(async () => {
      const value = await Promise.resolve(role);
      return value ? { data: { role: value }, error: null } : { data: null, error: null };
    }),
  };

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(() => chain),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    getChannels: vi.fn(() => []),
    removeChannel: vi.fn(),
  };
}

describe("useWorkspaceRoleKey", () => {
  const session = {
    user: {
      id: "user-1",
      app_metadata: { role: "authenticated" },
      user_metadata: {},
    },
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns cached admin without pending flash when profileRoleClient is set", () => {
    vi.stubGlobal("sessionStorage", mockStorage(JSON.stringify({ userId: "user-1", role: "admin" })));
    vi.stubGlobal("localStorage", mockStorage(null));

    const { result } = renderHook(() =>
      useWorkspaceRoleKey(session, { profileRoleClient: mockProfileClient("admin") as never }),
    );

    expect(result.current.roleKey).toBe("admin");
    expect(result.current.roleIconPending).toBe(false);
    expect(resolveWorkspaceRoleIcon(result.current.roleKey).icon).toBe(Crown);
  });

  it("hides icon while profiles.role fetch is in flight", async () => {
    vi.stubGlobal("sessionStorage", mockStorage(null));
    vi.stubGlobal("localStorage", mockStorage(null));

    let resolveRole!: (role: string) => void;
    const rolePromise = new Promise<string>((resolve) => {
      resolveRole = resolve;
    });

    const { result } = renderHook(() =>
      useWorkspaceRoleKey(session, { profileRoleClient: mockProfileClient(rolePromise) as never }),
    );

    expect(result.current.roleIconPending).toBe(true);

    resolveRole("admin");

    await waitFor(() => {
      expect(result.current.roleKey).toBe("admin");
      expect(result.current.roleIconPending).toBe(false);
    });

    expect(resolveWorkspaceRoleIcon(result.current.roleKey).icon).toBe(Crown);
    expect(resolveWorkspaceRoleIcon("user").icon).toBe(UserRound);
  });
});
