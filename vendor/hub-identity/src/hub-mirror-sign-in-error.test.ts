import { describe, expect, it } from "vitest";
import { HUB_USERNAME_WRONG_PASSWORD_MESSAGE } from "./hub-auth-submit";
import {
  HUB_MIRROR_PASSWORD_DRIFT_MESSAGE,
  rewriteWorkspaceDataPlaneAuthError,
} from "./hub-mirror-sign-in-error";

describe("rewriteWorkspaceDataPlaneAuthError", () => {
  it("rewrites Hub wrong-password copy when Hub already validated", () => {
    expect(
      rewriteWorkspaceDataPlaneAuthError(HUB_USERNAME_WRONG_PASSWORD_MESSAGE, { hubValidated: true }),
    ).toBe(HUB_MIRROR_PASSWORD_DRIFT_MESSAGE);
  });

  it("keeps Hub wrong-password copy when Hub did not validate", () => {
    expect(
      rewriteWorkspaceDataPlaneAuthError(HUB_USERNAME_WRONG_PASSWORD_MESSAGE, { hubValidated: false }),
    ).toBe(HUB_USERNAME_WRONG_PASSWORD_MESSAGE);
  });

  it("rewrites invalid login credentials when Hub validated", () => {
    expect(
      rewriteWorkspaceDataPlaneAuthError("Invalid login credentials", { hubValidated: true }),
    ).toBe(HUB_MIRROR_PASSWORD_DRIFT_MESSAGE);
  });

  it("passes through unrelated errors", () => {
    expect(
      rewriteWorkspaceDataPlaneAuthError("Workspace data sign-in timed out.", { hubValidated: true }),
    ).toBe("Workspace data sign-in timed out.");
  });
});
