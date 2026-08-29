import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_AUTO_LOGIN_SESSION_KEY, optOutDevAutoLogin } from "./dev-auto-login";
import { cacheHubIdentity, clearHubIdentity, HUB_IDENTITY_STORAGE_KEY } from "./hub-identity-cache";
import { hydrateHubIdentity } from "./hydrate-hub-identity";
import { HUB_IDENTITY_RELAY_REQUEST_TYPE } from "./hub-identity-relay";

describe("hydrateHubIdentity", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    clearHubIdentity();
    try {
      localStorage.removeItem(HUB_IDENTITY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  });

  it("returns true when Hub JWT is already cached", async () => {
    cacheHubIdentity({
      access_token: "tok",
      refresh_token: "ref",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user_id: "u1",
      user_email: "a@corp.com",
      supabase_url: "https://hub.example.co",
      supabase_anon_key: "anon",
    });
    await expect(hydrateHubIdentity({ requestFromHost: false })).resolves.toBe(true);
  });

  it("requests from host and runs applySession when cache is empty", async () => {
    const posts: unknown[] = [];
    const parent = { postMessage: (data: unknown) => posts.push(data) } as unknown as Window;
    const originalOpener = window.opener;
    const originalParent = window.parent;
    Object.defineProperty(window, "opener", { configurable: true, value: null });
    Object.defineProperty(window, "parent", { configurable: true, value: parent });
    const applySession = vi.fn(async () => {
      cacheHubIdentity({
        access_token: "relayed",
        refresh_token: "ref",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user_id: "u1",
        user_email: "a@corp.com",
        supabase_url: "https://hub.example.co",
        supabase_anon_key: "anon",
      });
    });
    try {
      await expect(hydrateHubIdentity({ applySession, hostWaitMs: 0 })).resolves.toBe(true);
    } finally {
      Object.defineProperty(window, "opener", { configurable: true, value: originalOpener });
      Object.defineProperty(window, "parent", { configurable: true, value: originalParent });
    }
    expect(posts).toEqual([{ type: HUB_IDENTITY_RELAY_REQUEST_TYPE }]);
    expect(applySession).toHaveBeenCalledOnce();
  });

  it("refuses hydrate after explicit Sign Out opt-out", async () => {
    optOutDevAutoLogin();
    expect(window.sessionStorage.getItem(DEV_AUTO_LOGIN_SESSION_KEY)).toBe("off");
    await expect(hydrateHubIdentity({ requestFromHost: false })).resolves.toBe(false);
  });

  it("does not applySession when Sign Out happens during host wait", async () => {
    const applySession = vi.fn(async () => undefined);
    const parent = { postMessage: vi.fn() } as unknown as Window;
    const originalOpener = window.opener;
    const originalParent = window.parent;
    Object.defineProperty(window, "opener", { configurable: true, value: null });
    Object.defineProperty(window, "parent", { configurable: true, value: parent });
    try {
      const pending = hydrateHubIdentity({ applySession, hostWaitMs: 40 });
      optOutDevAutoLogin();
      await expect(pending).resolves.toBe(false);
      expect(applySession).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "opener", { configurable: true, value: originalOpener });
      Object.defineProperty(window, "parent", { configurable: true, value: originalParent });
    }
  });
});
