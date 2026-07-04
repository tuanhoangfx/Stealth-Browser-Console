import { describe, expect, it, vi } from "vitest";
import {
  PROXY_TEST_LINE,
  PROXY_TEST_URL,
  buildProfileExportFilename,
  parseProxyLine,
  profileExportTimestampToken,
  sanitizeProfileExportBasename,
} from "./stealth-profile-utils";

describe("parseProxyLine", () => {
  it("parses host:port:user:pass into http proxy URL", () => {
    expect(parseProxyLine(PROXY_TEST_LINE)).toBe(PROXY_TEST_URL);
    expect(parseProxyLine("42.117.105.164:26042:infi:infi")).toBe("http://infi:infi@42.117.105.164:26042");
  });

  it("passes through full URLs unchanged", () => {
    expect(parseProxyLine("socks5://user:pass@host:1080")).toBe("socks5://user:pass@host:1080");
  });

  it("returns empty for blank input", () => {
    expect(parseProxyLine("")).toBe("");
    expect(parseProxyLine("   ")).toBe("");
  });
});

describe("buildProfileExportFilename", () => {
  it("uses single profile name + timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T16:58:11"));
    expect(buildProfileExportFilename(["Stealth Demo (web)"], "json")).toBe(
      "Stealth Demo (web)_2026-06-29_16-58-11.json",
    );
    vi.useRealTimers();
  });

  it("sanitizes unsafe characters in profile name", () => {
    expect(sanitizeProfileExportBasename('bad<>name')).toBe("bad__name");
    expect(profileExportTimestampToken(new Date("2026-01-02T03:04:05"))).toBe("2026-01-02_03-04-05");
  });

  it("uses +N suffix for multiple profiles", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T16:58:11"));
    expect(buildProfileExportFilename(["Alpha", "Beta", "Gamma"], "zip")).toBe(
      "Alpha_+2_2026-06-29_16-58-11.zip",
    );
    vi.useRealTimers();
  });
});
