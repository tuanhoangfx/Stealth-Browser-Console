import { describe, expect, it, vi } from "vitest";
import { createHubFullAccountAuthHandlers } from "./hub-full-account-handlers";

function makeClient(overrides?: {
  sessionUserId?: string | null;
  profile?: Record<string, unknown> | null;
  updateError?: { message: string } | null;
}) {
  const sessionUserId = overrides?.sessionUserId ?? "user-1";
  const update = vi.fn(async () => ({ error: overrides?.updateError ?? null }));
  const eq = vi.fn(() => ({ maybeSingle: async () => ({ data: overrides?.profile ?? null, error: null }) }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => {
    if (table !== "profiles") throw new Error(`unexpected table ${table}`);
    return {
      select,
      update: (row: Record<string, unknown>) => ({
        eq: async (column: string, id: string) => {
          await update(row, column, id);
          return { error: overrides?.updateError ?? null };
        },
      }),
    };
  });
  return {
    client: {
      from,
      auth: {
        getSession: async () => ({
          data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
        }),
        updateUser: vi.fn(),
      },
    } as never,
    update,
    from,
  };
}

describe("createHubFullAccountAuthHandlers own profile", () => {
  it("fails password update before mirror sync when Hub identity is unavailable", async () => {
    const handlers = createHubFullAccountAuthHandlers({ getClient: () => null });
    await expect(handlers.onUpdatePassword("safe-password")).resolves.toEqual({
      ok: false,
      message: "Hub identity is not configured.",
    });
  });

  it("loads own profile contact fields", async () => {
    const { client } = makeClient({
      profile: {
        full_name: "Hieu",
        phone: "0901",
        zalo: "zalo-1",
        telegram: "@tele",
        meta: "fb-1",
        notes: "hello",
      },
    });
    const handlers = createHubFullAccountAuthHandlers({ getClient: () => client });
    await expect(handlers.fetchOwnProfileFields("user-1")).resolves.toEqual({
      fullName: "Hieu",
      phone: "0901",
      zalo: "zalo-1",
      telegram: "@tele",
      meta: "fb-1",
      notes: "hello",
    });
  });

  it("updates only self-edit profile columns", async () => {
    const { client, update } = makeClient();
    const handlers = createHubFullAccountAuthHandlers({ getClient: () => client });
    const result = await handlers.onUpdateOwnProfile({
      fullName: " Hieu ",
      phone: "0901",
      zalo: "zalo-1",
      telegram: "@tele",
      meta: "fb-1",
      notes: "note",
    });
    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    const [row, column, id] = update.mock.calls[0];
    expect(column).toBe("id");
    expect(id).toBe("user-1");
    expect(row).toMatchObject({
      full_name: "Hieu",
      phone: "0901",
      zalo: "zalo-1",
      telegram: "@tele",
      meta: "fb-1",
      notes: "note",
    });
    expect(row).not.toHaveProperty("role");
    expect(row).not.toHaveProperty("login_id");
    expect(row).not.toHaveProperty("email");
  });
});
