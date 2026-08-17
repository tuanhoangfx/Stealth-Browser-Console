import { describe, expect, it, vi } from "vitest";
import { createEnsureSupabaseAuth, isAuthNetworkError } from "./ensure-supabase-auth";
import type { Session } from "@supabase/supabase-js";

function makeSession(overrides?: Partial<Session>): Session {
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: "live-access",
    refresh_token: "live-refresh",
    expires_at,
    token_type: "bearer",
    user: {
      id: "user-1",
      email: "u@example.com",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "",
    },
    ...overrides,
  } as Session;
}

describe("isAuthNetworkError", () => {
  it("detects browser Failed to fetch", () => {
    expect(isAuthNetworkError("Failed to fetch")).toBe(true);
    expect(isAuthNetworkError({ message: "TypeError: Failed to fetch" })).toBe(true);
    expect(isAuthNetworkError({ message: "Invalid Refresh Token" })).toBe(false);
  });
});

describe("createEnsureSupabaseAuth", () => {
  it("restores snapshot into client when getSession is empty", async () => {
    const restored = makeSession({ access_token: "restored" });
    const setSession = vi.fn(async () => ({ data: { session: restored }, error: null }));
    const getSession = vi.fn(async () => ({ data: { session: null }, error: null }));
    const cacheSession = vi.fn();

    const ensure = createEnsureSupabaseAuth({
      isConfigured: () => true,
      getClient: () =>
        ({
          auth: { getSession, setSession, refreshSession: vi.fn() },
        }) as never,
      readSnapshot: () => ({
        access_token: "cached-access",
        refresh_token: "cached-refresh",
        expires_at: Math.floor(Date.now() / 1000) - 60,
        user_id: "user-1",
        user_email: "u@example.com",
        cached_at: Date.now() - 86_400_000,
      }),
      cacheSession,
      refreshNearExpiryMs: 120_000,
    });

    const session = await ensure();
    expect(setSession).toHaveBeenCalledWith({
      access_token: "cached-access",
      refresh_token: "cached-refresh",
    });
    expect(cacheSession).toHaveBeenCalledWith(restored);
    expect(session?.access_token).toBe("restored");
  });

  it("replaces persistSession user when Hub dual-sign-in snapshot is a different account", async () => {
    const live = makeSession({ access_token: "stale-persist", user: { ...makeSession().user, id: "stale-user" } });
    const restored = makeSession({ access_token: "hub-mirror", user: { ...makeSession().user, id: "duy-id" } });
    const setSession = vi.fn(async () => ({ data: { session: restored }, error: null }));
    const ensure = createEnsureSupabaseAuth({
      isConfigured: () => true,
      getClient: () =>
        ({
          auth: {
            getSession: async () => ({ data: { session: live }, error: null }),
            setSession,
            refreshSession: vi.fn(),
          },
        }) as never,
      readSnapshot: () => ({
        access_token: "cached-duy",
        refresh_token: "cached-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user_id: "duy-id",
        user_email: "duy@example.com",
        cached_at: Date.now(),
      }),
      cacheSession: vi.fn(),
      refreshNearExpiryMs: null,
    });

    const session = await ensure();
    expect(setSession).toHaveBeenCalledWith({
      access_token: "cached-duy",
      refresh_token: "cached-refresh",
    });
    expect(session?.user.id).toBe("duy-id");
  });

  it("clears ghost session when hard-expired and refresh is auth-invalid", async () => {
    const expired = makeSession({
      access_token: "expired",
      expires_at: Math.floor(Date.now() / 1000) - 10,
    });
    const clearSession = vi.fn();
    const signOut = vi.fn(async () => ({ error: null }));
    const ensure = createEnsureSupabaseAuth({
      isConfigured: () => true,
      getClient: () =>
        ({
          auth: {
            getSession: async () => ({ data: { session: expired }, error: null }),
            setSession: vi.fn(),
            refreshSession: async () => ({
              data: { session: null },
              error: { message: "Invalid Refresh Token" },
            }),
            signOut,
          },
        }) as never,
      readSnapshot: () => null,
      cacheSession: vi.fn(),
      clearSession,
      refreshNearExpiryMs: 120_000,
    });

    expect(await ensure()).toBeNull();
    expect(clearSession).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps tokens on hard-expired network refresh failure (retry later)", async () => {
    const expired = makeSession({
      access_token: "expired",
      expires_at: Math.floor(Date.now() / 1000) - 10,
    });
    const clearSession = vi.fn();
    const signOut = vi.fn(async () => ({ error: null }));
    const ensure = createEnsureSupabaseAuth({
      isConfigured: () => true,
      getClient: () =>
        ({
          auth: {
            getSession: async () => ({ data: { session: expired }, error: null }),
            setSession: vi.fn(),
            refreshSession: async () => ({
              data: { session: null },
              error: { message: "Failed to fetch" },
            }),
            signOut,
          },
        }) as never,
      readSnapshot: () => null,
      cacheSession: vi.fn(),
      clearSession,
      refreshNearExpiryMs: 120_000,
    });

    expect(await ensure()).toBeNull();
    expect(clearSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
