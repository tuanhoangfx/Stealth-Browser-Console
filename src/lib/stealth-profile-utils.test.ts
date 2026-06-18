import { describe, expect, it } from "vitest";
import { PROXY_TEST_LINE, PROXY_TEST_URL, parseProxyLine } from "./stealth-profile-utils";

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
