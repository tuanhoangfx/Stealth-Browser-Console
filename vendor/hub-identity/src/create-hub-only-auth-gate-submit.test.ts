import { describe, expect, it, vi } from "vitest";
import { createHubOnlyAuthGateSubmit } from "./create-hub-only-auth-gate-submit";
import { HUB_WAITING_FOR_APPROVAL_MESSAGE } from "./hub-profile-approval";

const session = {
  access_token: "tok",
  refresh_token: "ref",
  user: { id: "u1", email: "u_u1@auth.infi.internal" },
} as never;

describe("createHubOnlyAuthGateSubmit", () => {
  it("grants password then persists + adopts (P0004 parity)", async () => {
    const persistSession = vi.fn();
    const setSession = vi.fn(async () => ({ data: { session }, error: null }));
    const grantPassword = vi.fn(async () => ({ session, error: null }));
    const onSubmit = createHubOnlyAuthGateSubmit({
      getHubClient: () =>
        ({
          supabaseUrl: "https://hub-api.infi.io.vn",
          supabaseKey: "anon",
          auth: { setSession, signUp: vi.fn(), signInWithPassword: vi.fn() },
        }) as never,
      persistSession,
      grantPassword,
      toolCode: "P0004",
    });

    const result = await onSubmit("duyceo01@hub.local", "pw", "signin");
    expect(result).toBeUndefined();
    expect(grantPassword).toHaveBeenCalledOnce();
    expect(grantPassword.mock.calls[0]?.[0]).toMatchObject({ toolCode: "P0004" });
    expect(persistSession).toHaveBeenCalledWith(session);
    expect(setSession).toHaveBeenCalled();
  });

  it("patches profile after signup when afterSignup is set", async () => {
    const afterSignup = vi.fn(async () => undefined);
    const persistSession = vi.fn();
    const signUp = vi.fn(async () => ({
      data: { session, user: session.user },
      error: null,
    }));
    const onSubmit = createHubOnlyAuthGateSubmit({
      getHubClient: () =>
        ({
          supabaseUrl: "https://hub-api.infi.io.vn",
          supabaseKey: "anon",
          auth: { signUp, signInWithPassword: vi.fn(), setSession: vi.fn() },
        }) as never,
      persistSession,
      afterSignup,
    });

    await onSubmit("newuser", "pw", "signup", { contactEmail: "newuser@corp.com" });
    expect(signUp).toHaveBeenCalledOnce();
    expect(persistSession).toHaveBeenCalledWith(session);
    expect(afterSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        resolved: expect.objectContaining({ loginId: "newuser" }),
        userId: "u1",
        contactEmail: "newuser@corp.com",
      }),
    );
  });

  it("does not persist when the Hub profile is waiting for approval", async () => {
    const persistSession = vi.fn();
    const signOut = vi.fn(async () => undefined);
    const grantPassword = vi.fn(async () => ({ session, error: null }));
    const onSubmit = createHubOnlyAuthGateSubmit({
      getHubClient: () =>
        ({
          supabaseUrl: "https://hub-api.infi.io.vn",
          supabaseKey: "anon",
          auth: { setSession: vi.fn(), signUp: vi.fn(), signInWithPassword: vi.fn(), signOut },
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { approved_at: null, role: "user" }, error: null }),
              }),
            }),
          }),
        }) as never,
      persistSession,
      grantPassword,
    });

    await expect(onSubmit("newstaff@hub.local", "pw", "signin")).resolves.toMatchObject({
      error: HUB_WAITING_FOR_APPROVAL_MESSAGE,
    });
    expect(persistSession).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
  });

  it("returns Hub not configured when the client is missing", async () => {
    const onSubmit = createHubOnlyAuthGateSubmit({
      getHubClient: () => null,
      persistSession: vi.fn(),
    });
    await expect(onSubmit("x", "y", "signin")).resolves.toMatchObject({
      error: expect.stringMatching(/not configured/i),
    });
  });
});
