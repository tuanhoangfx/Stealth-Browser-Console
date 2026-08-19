import { describe, expect, it } from "vitest";
import { resolveWorkspaceAuthPaint } from "./workspace-auth-paint";

describe("resolveWorkspaceAuthPaint", () => {
  it("paints Sign In immediately while getSession is still running", () => {
    expect(
      resolveWorkspaceAuthPaint({
        configured: true,
        hasSession: false,
        sessionLoading: true,
      }),
    ).toBe("gate");
  });

  it("only boots unsigned users during password / auto-login", () => {
    expect(
      resolveWorkspaceAuthPaint({
        configured: true,
        hasSession: false,
        sessionLoading: true,
        bootSigningIn: true,
      }),
    ).toBe("boot");
  });

  it("keeps optional-auth tools on the app when policy says auth is off", () => {
    expect(
      resolveWorkspaceAuthPaint({
        configured: true,
        policyReady: true,
        authRequired: false,
        hasSession: false,
      }),
    ).toBe("app");
  });

  it("does not treat unknown policy as optional-app — unsigned still sees the gate", () => {
    expect(
      resolveWorkspaceAuthPaint({
        configured: true,
        policyReady: false,
        authRequired: false,
        hasSession: false,
      }),
    ).toBe("gate");
  });

  it("boots only while a session waits for first grant (no stale cache)", () => {
    expect(
      resolveWorkspaceAuthPaint({
        configured: true,
        hasSession: true,
        toolAccess: null,
      }),
    ).toBe("boot");
    expect(
      resolveWorkspaceAuthPaint({
        configured: true,
        hasSession: true,
        toolAccess: null,
        staleToolAccess: true,
      }),
    ).toBe("app");
  });

  it("denies after grant is false", () => {
    expect(
      resolveWorkspaceAuthPaint({
        configured: true,
        hasSession: true,
        toolAccess: false,
      }),
    ).toBe("denied");
  });

  it("honors unconfigured + skipAuthGate", () => {
    expect(resolveWorkspaceAuthPaint({ configured: false, hasSession: false })).toBe("app");
    expect(
      resolveWorkspaceAuthPaint({
        configured: false,
        unconfigured: "boot",
        hasSession: false,
      }),
    ).toBe("boot");
    expect(
      resolveWorkspaceAuthPaint({
        configured: true,
        skipAuthGate: true,
        hasSession: false,
      }),
    ).toBe("app");
  });
});
