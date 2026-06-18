import { describe, expect, it } from "vitest";
import { formatHubAuthToolInfo } from "./hub-auth-tool-info";

describe("formatHubAuthToolInfo", () => {
  it("formats code, name, and tagline", () => {
    expect(
      formatHubAuthToolInfo({
        code: "P0020",
        name: "Data Box",
        tagline: "Notes, cookies & 2FA vault",
      }),
    ).toBe("P0020 · Data Box — Notes, cookies & 2FA vault");
  });

  it("omits tagline when absent", () => {
    expect(formatHubAuthToolInfo({ code: "E0001", name: "Cookie Auto" })).toBe("E0001 · Cookie Auto");
  });
});
