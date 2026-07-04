import { describe, expect, it } from "vitest";
import { resolveHubBrandAssetSrc } from "./hub-brand-asset-src";

describe("resolveHubBrandAssetSrc", () => {
  it("prefixes absolute asset paths with BASE_URL", () => {
    expect(resolveHubBrandAssetSrc("/assets/brand-icons/google.png")).toMatch(/assets\/brand-icons\/google\.png$/);
  });

  it("uses relative paths on file://", () => {
    const prev = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...prev, protocol: "file:" },
    });
    try {
      expect(resolveHubBrandAssetSrc("/assets/brand-icons/google.png")).toBe("./assets/brand-icons/google.png");
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: prev });
    }
  });

  it("passes through http URLs", () => {
    expect(resolveHubBrandAssetSrc("https://example.com/icon.png")).toBe("https://example.com/icon.png");
  });
});
