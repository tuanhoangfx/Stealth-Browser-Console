import { describe, expect, it } from "vitest";
import {
  isHubEmbedMode,
  readHubEmbedHostVersion,
  resolveHubDisplayAppVersion,
  setHubHostVersionOverride,
} from "./hub-embed-mode";

describe("isHubEmbedMode", () => {
  it("detects embed=1 and embed=true", () => {
    expect(isHubEmbedMode("?embed=1")).toBe(true);
    expect(isHubEmbedMode("embed=true")).toBe(true);
    expect(isHubEmbedMode("?embed=0")).toBe(false);
    expect(isHubEmbedMode("")).toBe(false);
  });
});

describe("resolveHubDisplayAppVersion", () => {
  it("prefers hostVersion query over tool package", () => {
    expect(readHubEmbedHostVersion("?embed=1&hostVersion=0.1.22")).toBe("0.1.22");
    expect(resolveHubDisplayAppVersion("5.1.27")).toBe("5.1.27");
    setHubHostVersionOverride("0.1.22");
    expect(resolveHubDisplayAppVersion("5.1.27")).toBe("0.1.22");
    setHubHostVersionOverride(null);
  });
});
