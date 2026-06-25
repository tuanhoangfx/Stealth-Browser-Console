import { describe, expect, it } from "vitest";
import { formatHubAuthToolInfo } from "./hub-auth-tool-info";

describe("formatHubAuthToolInfo", () => {
  it("formats code, name, and tagline", () => {
    expect(
      formatHubAuthToolInfo({
        code: "P0016",
        name: "Chat Center",
        tagline: "Multi-channel inbox & fanpages",
      }),
    ).toBe("P0016 · Chat Center — Multi-channel inbox & fanpages");
  });

  it("formats name and tagline without product code (Data Box auth gate)", () => {
    expect(
      formatHubAuthToolInfo({
        name: "Data Box",
        tagline: "Notes, cookies & 2FA vault",
      }),
    ).toBe("Data Box — Notes, cookies & 2FA vault");
  });

  it("formats Tool Hub without product code", () => {
    expect(
      formatHubAuthToolInfo({
        name: "Tool Hub",
        tagline: "Workspace login for infi tools",
      }),
    ).toBe("Tool Hub — Workspace login for infi tools");
  });

  it("omits tagline when absent", () => {
    expect(formatHubAuthToolInfo({ code: "E0001", name: "Cookie Auto" })).toBe("E0001 · Cookie Auto");
  });
});
