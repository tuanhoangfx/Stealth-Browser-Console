// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHubApiAuthToken } from "./hub-api-auth-token";

describe("hub-api-auth-token", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns cached token when not near expiry", async () => {
    const getHubIdentitySession = vi.fn();
    const api = createHubApiAuthToken({
      unauthorizedEventName: "test:unauthorized",
      isHubConfigured: () => true,
      readHubIdentity: () => ({
        access_token: "cached",
        refresh_token: "r",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user_id: "u1",
        user_email: "a@corp.com",
        supabase_url: "https://hub.example.co",
        supabase_anon_key: "anon",
        cached_at: Date.now(),
      }),
      getHubAccessToken: () => "cached",
      getHubIdentitySession,
      persistHubSession: vi.fn(),
    });

    await expect(api.resolveRequestToken()).resolves.toBe("cached");
    expect(getHubIdentitySession).not.toHaveBeenCalled();
  });

  it("dedupes concurrent refresh calls", async () => {
    let calls = 0;
    const api = createHubApiAuthToken({
      unauthorizedEventName: "test:unauthorized",
      isHubConfigured: () => true,
      readHubIdentity: () => null,
      getHubAccessToken: () => null,
      getHubIdentitySession: async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 10));
        return { access_token: "fresh" } as never;
      },
      persistHubSession: vi.fn(),
    });

    const [a, b] = await Promise.all([api.refreshRequestToken(), api.refreshRequestToken()]);
    expect(a).toBe("fresh");
    expect(b).toBe("fresh");
    expect(calls).toBe(1);
  });
});
