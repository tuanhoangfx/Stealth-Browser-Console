import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_AUTO_LOGIN_SESSION_KEY, optOutDevAutoLogin } from "./dev-auto-login";
import {
  performWorkspaceSignOut,
  resolveWorkspaceShellSession,
  shouldAcceptHubIdentityRelay,
} from "./workspace-sign-out";

describe("performWorkspaceSignOut", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("opts out, clears caches, and signs all clients out locally", async () => {
    const calls: string[] = [];
    const hubSignOut = vi.fn(async (options?: { scope?: string }) => {
      calls.push(`hub:${options?.scope}`);
      return { error: null };
    });
    const dataSignOut = vi.fn(async (options?: { scope?: string }) => {
      calls.push(`data:${options?.scope}`);
      return { error: null };
    });

    const result = await performWorkspaceSignOut({
      stopTokenScheduler: () => calls.push("stop"),
      clearProfileRoleCache: () => calls.push("role"),
      planes: [
        { getClient: () => ({ auth: { signOut: hubSignOut } }), clearCache: () => calls.push("hub-cache") },
        { getClient: () => ({ auth: { signOut: dataSignOut } }), clearCache: () => calls.push("data-cache") },
      ],
      pushBridgeClear: () => calls.push("bridge"),
      onAfterSignOut: () => calls.push("state"),
    });

    expect(result).toEqual({ ok: true, error: null });
    expect(window.sessionStorage.getItem(DEV_AUTO_LOGIN_SESSION_KEY)).toBe("off");
    expect(calls).toEqual(["stop", "role", "hub-cache", "data-cache", "bridge", "hub:local", "data:local", "state"]);
  });

  it("reports an auth failure after clearing local UI state", async () => {
    const error = new Error("offline");
    const after = vi.fn();
    const result = await performWorkspaceSignOut({
      planes: [{ getClient: () => ({ auth: { signOut: async () => ({ error }) } }) }],
      onAfterSignOut: after,
    });

    expect(result).toEqual({ ok: false, error });
    expect(after).toHaveBeenCalledOnce();
  });
});

describe("explicit Sign Out shell/relay guards", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("blocks Hub relay after explicit Sign Out", () => {
    expect(shouldAcceptHubIdentityRelay()).toBe(true);
    optOutDevAutoLogin();
    expect(shouldAcceptHubIdentityRelay()).toBe(false);
  });

  it("does not resurrect footer session from Hub cache after Sign Out", () => {
    const react = null;
    const cached = { user: { email: "czpgo@outlook.com" } };
    expect(resolveWorkspaceShellSession(react, cached)).toEqual(cached);
    optOutDevAutoLogin();
    expect(resolveWorkspaceShellSession(react, cached)).toBeNull();
  });
});
