import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchWorkspaceProfileRole, WORKSPACE_PROFILE_ROLE_UPDATED } from "./workspace-profile-role";

function mockClient(rosterRows: { id?: string; role?: string; email?: string }[]) {
  return {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { role: "employee" }, error: null }),
    })),
    rpc: vi.fn(async (name: string) => {
      if (name === "hub_todo_user_roster") return { data: rosterRows, error: null };
      if (name === "workspace_user_directory") return { data: [], error: null };
      return { data: null, error: { message: "missing" } };
    }),
  };
}

describe("fetchWorkspaceProfileRole", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers hub_todo_user_roster admin over profiles.role employee", async () => {
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: vi.fn() });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });

    const client = mockClient([
      {
        id: "hub-1",
        email: "czpgo@infix1.io.vn",
        role: "admin",
      },
    ]);

    const role = await fetchWorkspaceProfileRole(client as never, "hub-1", {
      email: "czpgo@outlook.com",
    });

    expect(role).toBe("admin");
  });

  it("dispatches cache update event when role is written", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const client = mockClient([{ id: "hub-1", email: "a@b.com", role: "admin" }]);
    await fetchWorkspaceProfileRole(client as never, "hub-1", { email: "a@b.com" });

    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls[0]?.[0] as Event;
    expect(event?.type).toBe(WORKSPACE_PROFILE_ROLE_UPDATED);
    dispatchSpy.mockRestore();
  });
});
