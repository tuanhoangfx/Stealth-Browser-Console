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

  it("returns P0006 Content Studio preset", () => {
    const preset = createWorkspaceAuthGatePreset({ code: "P0006" });
    expect(preset.toolInfo.name).toBe("Content Studio");
    expect(preset.toolInfo.tagline).toMatch(/TikTok/i);
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

  it("gives P0012 its own tagline, not another tool's", () => {
    const preset = createWorkspaceAuthGatePreset({ code: "P0012" });
    expect(preset.title).toBe("Welcome to Performance");
    expect(preset.toolInfo.name).toBe("Performance");
    expect(preset.toolInfo.tagline).toBe("Work performance, boards & team workload");
  });

  it("gives P0015 its own portal tagline", () => {
    const preset = createWorkspaceAuthGatePreset({ code: "P0015" });
    expect(preset.title).toBe("Welcome to ENZY Energy");
    expect(preset.toolInfo.name).toBe("ENZY Energy");
    expect(preset.toolInfo.tagline).toMatch(/portal access/i);
  });

  it("never falls back to another tool's tagline", () => {
    // The old resolution chain ended in P0016's copy, so any code missing from it shipped
    // "Multi-channel inbox & fanpages" on its login screen. P0012 did exactly that.
    const codes = [
      "P0001", "P0003", "P0004", "P0005", "P0006", "P0012", "P0013", "P0015", "P0016", "P0020", "P0021", "P0022",
    ] as const;
    const p0016 = createWorkspaceAuthGatePreset({ code: "P0016" }).toolInfo.tagline;
    for (const code of codes) {
      const preset = createWorkspaceAuthGatePreset({ code });
      if (code === "P0016") continue;
      expect(preset.toolInfo.tagline, `${code} borrowed P0016's tagline`).not.toBe(p0016);
    }
  });
});
