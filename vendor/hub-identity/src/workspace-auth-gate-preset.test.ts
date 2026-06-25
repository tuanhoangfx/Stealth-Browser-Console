import { describe, expect, it } from "vitest";
import { createWorkspaceAuthGatePreset } from "./workspace-auth-gate-preset";

describe("createWorkspaceAuthGatePreset", () => {
  it("returns P0020 cookie variant anonymous hint", () => {
    const preset = createWorkspaceAuthGatePreset({ code: "P0020", variant: "cookie-auto" });
    expect(preset.anonymousHint).toMatch(/local cookie jar/i);
    expect(preset.errorOptions?.dualWorkspace).toBe(true);
    expect(preset.toolInfo.code).toBeUndefined();
    expect(preset.toolInfo.name).toBe("Data Box");
    expect(preset.toolInfo.tagline).toBe("Notes, cookies & 2FA vault");
  });

  it("returns P0004 users tagline", () => {
    const preset = createWorkspaceAuthGatePreset({ code: "P0004", variant: "users" });
    expect(preset.toolInfo.code).toBeUndefined();
    expect(preset.toolInfo.name).toBe("Tool Hub");
    expect(preset.toolInfo.tagline).toMatch(/password reset/i);
  });

  it("returns P0016 preset without product code", () => {
    const preset = createWorkspaceAuthGatePreset({ code: "P0016" });
    expect(preset.toolInfo.code).toBeUndefined();
    expect(preset.toolInfo.name).toBe("Chat Center");
    expect(preset.toolInfo.tagline).toMatch(/inbox/i);
  });

  it("returns P0001 preset without version in tagline", () => {
    const preset = createWorkspaceAuthGatePreset({ code: "P0001" });
    expect(preset.toolInfo.code).toBeUndefined();
    expect(preset.toolInfo.name).toBe("GPM Console");
    expect(preset.toolInfo.tagline).toBe("GPM Login automation");
  });
});
