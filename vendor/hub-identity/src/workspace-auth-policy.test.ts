import { describe, expect, it } from "vitest";
import {
  isOfflineWorkspaceSession,
  isRealHubWorkspaceSession,
  isWorkspaceAnonymousAllowed,
  isWorkspaceAuthRequiredWhenEnabled,
} from "./workspace-auth-policy";

describe("workspace-auth-policy", () => {
  it("disallows anonymous workspace mode", () => {
    expect(isWorkspaceAnonymousAllowed()).toBe(false);
  });

  it("requires auth when hub stack is enabled", () => {
    expect(isWorkspaceAuthRequiredWhenEnabled(true, true)).toBe(true);
    expect(isWorkspaceAuthRequiredWhenEnabled(false, true)).toBe(false);
    expect(isWorkspaceAuthRequiredWhenEnabled(true, false)).toBe(false);
  });

  it("detects real vs offline sessions", () => {
    const real = {
      access_token: "jwt",
      user: { id: "user-1" },
    } as never;
    const offline = {
      access_token: "offline",
      user: { id: "offline-user", email: "anonymous@local" },
    } as never;

    expect(isRealHubWorkspaceSession(real)).toBe(true);
    expect(isRealHubWorkspaceSession(offline)).toBe(false);
    expect(isOfflineWorkspaceSession(offline, true)).toBe(true);
    expect(isOfflineWorkspaceSession(real, true)).toBe(false);
  });
});
