import { describe, expect, it } from "vitest";
import { createWorkspaceAuthGatePreset } from "./workspace-auth-gate-preset";

describe("createWorkspaceAuthGatePreset", () => {
  it("returns P0020 cookie variant anonymous hint", () => {
    const preset = createWorkspaceAuthGatePreset({ code: "P0020", variant: "cookie-auto" });
    expect(preset.anonymousHint).toMatch(/local cookie jar/i);
    expect(preset.errorOptions?.dualWorkspace).toBe(true);
  });

  it("returns P0004 users tagline", () => {
    const preset = createWorkspaceAuthGatePreset({ code: "P0004", variant: "users" });
    expect(preset.toolInfo.tagline).toMatch(/password reset/i);
  });
});
