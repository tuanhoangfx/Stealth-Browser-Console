import { describe, expect, it, vi } from "vitest";
import { createHubFullAccountAuthHandlers } from "./hub-full-account-handlers";

function makeClient(overrides?: {
  sessionUserId?: string | null;
  profile?: Record<string, unknown> | null;
  updateError?: { message: string; code?: string } | null;
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
        login_id: "hieu",
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
      loginId: "hieu",
      email: "",
      contactEmail: "",
      fullName: "Hieu",
      phone: "0901",
      zalo: "zalo-1",
      telegram: "@tele",
      meta: "fb-1",
      notes: "hello",
      avatarUrl: "",
    });
  });

  it("prefers directory contact email fields from profiles", async () => {
    const { client } = makeClient({
      profile: {
        login_id: "duyceo01",
        email: "kinhdoanh@enzyvina.com",
        contact_email: "kinhdoanh@enzyvina.com",
        full_name: "Duy",
        phone: "",
        zalo: "",
        telegram: "",
        meta: "",
        notes: "",
      },
    });
    const handlers = createHubFullAccountAuthHandlers({ getClient: () => client });
    await expect(handlers.fetchOwnProfileFields("user-1")).resolves.toMatchObject({
      loginId: "duyceo01",
      email: "kinhdoanh@enzyvina.com",
      contactEmail: "kinhdoanh@enzyvina.com",
    });
  });

  it("falls back to login_id when Data Box user id misses Hub profiles", async () => {
    const hubProfile = {
      login_id: "duyceo01",
      email: "kinhdoanh@enzyvina.com",
      contact_email: "kinhdoanh@enzyvina.com",
      full_name: "Duy",
      phone: "0375",
      zalo: "",
      telegram: "",
      meta: "",
      notes: "",
    };
    const eq = vi.fn((column: string, value: string) => ({
      maybeSingle: async () => {
        if (column === "id") return { data: null, error: null };
        if (column === "login_id" && value === "duyceo01") {
          return { data: hubProfile, error: null };
        }
        return { data: null, error: null };
      },
    }));
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq })),
        update: vi.fn(),
      })),
      auth: {
        getSession: async () => ({ data: { session: { user: { id: "databox-id" } } } }),
        updateUser: vi.fn(),
      },
    } as never;
    const handlers = createHubFullAccountAuthHandlers({
      getClient: () => client,
      getLoginId: () => "duyceo01",
    });
    await expect(handlers.fetchOwnProfileFields("databox-id-81a4c137")).resolves.toMatchObject({
      loginId: "duyceo01",
      email: "kinhdoanh@enzyvina.com",
      contactEmail: "kinhdoanh@enzyvina.com",
      fullName: "Duy",
    });
    expect(eq).toHaveBeenCalledWith("id", "databox-id-81a4c137");
    expect(eq).toHaveBeenCalledWith("login_id", "duyceo01");
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

  it("links contact email on profiles only — does not mutate auth.users.email", async () => {
    const { client, update } = makeClient();
    const updateUser = client.auth.updateUser as ReturnType<typeof vi.fn>;
    const handlers = createHubFullAccountAuthHandlers({ getClient: () => client });
    const result = await handlers.onLinkEmail("real@corp.com");
    expect(result).toEqual({ ok: true, message: "Contact email linked." });
    expect(updateUser).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    const [row, column, id] = update.mock.calls[0];
    expect(column).toBe("id");
    expect(id).toBe("user-1");
    expect(row).toMatchObject({
      contact_email: "real@corp.com",
      email: "real@corp.com",
    });
  });

  it("rejects synthetic/opaque addresses for link email", async () => {
    const { client, update } = makeClient();
    const handlers = createHubFullAccountAuthHandlers({ getClient: () => client });
    await expect(handlers.onLinkEmail("retired@infix1.io.vn")).resolves.toMatchObject({ ok: false });
    await expect(
      handlers.onLinkEmail("u_273527e9-0185-4bc0-9abc-def012345678@auth.infi.internal"),
    ).resolves.toMatchObject({ ok: false });
    expect(update).not.toHaveBeenCalled();
  });

  it("maps unique profile constraints to a useful public message", async () => {
    const { client } = makeClient({
      updateError: {
        code: "23505",
        message: "duplicate key value violates unique constraint profiles_active_contact_email_unique_idx",
      },
    });
    const handlers = createHubFullAccountAuthHandlers({ getClient: () => client });
    await expect(handlers.onLinkEmail("real@corp.com")).resolves.toEqual({
      ok: false,
      message: "This contact email is already linked to another user.",
    });
  });
});
