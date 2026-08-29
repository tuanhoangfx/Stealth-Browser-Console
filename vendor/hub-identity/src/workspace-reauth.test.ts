import { describe, expect, it } from "vitest";
import {
  DUAL_PLANE_HUB_JWT_FORCE_LOGIN_MS,
  WORKSPACE_REAUTH_REQUIRED_EVENT,
  resolveDualPlaneToolAccessForPaint,
  shouldForceLoginMissingHubJwt,
  shouldSignOutWhenHubJwtMissing,
} from "./workspace-reauth";

describe("workspace-reauth SSOT", () => {
  it("exports the shared reauth event and force-login delay", () => {
    expect(WORKSPACE_REAUTH_REQUIRED_EVENT).toBe("x1z10:workspace-reauth-required");
    expect(DUAL_PLANE_HUB_JWT_FORCE_LOGIN_MS).toBe(8_000);
  });

  it("never Sign Outs the data plane when Hub JWT is missing (login-once)", () => {
    expect(shouldSignOutWhenHubJwtMissing()).toBe(false);
  });

  it("detects hydrate-needed when workspace data token exists and Hub JWT is empty", () => {
    expect(
      shouldForceLoginMissingHubJwt({
        hubAccessToken: null,
        dataAccessToken: "db-jwt",
      }),
    ).toBe(true);
    expect(
      shouldForceLoginMissingHubJwt({
        hubAccessToken: "hub-jwt",
        dataAccessToken: "db-jwt",
      }),
    ).toBe(false);
    expect(
      shouldForceLoginMissingHubJwt({
        hubAccessToken: null,
        dataAccessToken: null,
      }),
    ).toBe(false);
  });

  it("denies paint only after Hub JWT + explicit false grant", () => {
    expect(
      resolveDualPlaneToolAccessForPaint({
        hasDataSession: true,
        toolAccess: false,
        hasHubJwt: false,
      }),
    ).toBe(true);
    expect(
      resolveDualPlaneToolAccessForPaint({
        hasDataSession: true,
        toolAccess: false,
        hasHubJwt: true,
      }),
    ).toBe(false);
    expect(
      resolveDualPlaneToolAccessForPaint({
        hasDataSession: true,
        toolAccess: true,
        hasHubJwt: true,
      }),
    ).toBe(true);
  });
});
