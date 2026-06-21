import { describe, expect, it } from "vitest";
import {
  coerceStartupUrlInput,
  formatStartupUrlDisplay,
  formatStartupUrlOnBlur,
  normalizeStartupUrl,
  resolveProfileLaunchUrl,
  resolveStartupUrlSave,
  startupUrlSaveError
} from "./startup-url";
import { DEFAULT_BROWSER_HOME_URL } from "./browser-home";

describe("startup-url", () => {
  it("coerces domain-like hosts to https", () => {
    expect(normalizeStartupUrl("google.com")).toBe("https://google.com/");
    expect(normalizeStartupUrl("myaccount.google.com")).toBe("https://myaccount.google.com/");
  });

  it("coerces single-label hosts to http", () => {
    expect(normalizeStartupUrl("check")).toBe("http://check/");
    expect(formatStartupUrlOnBlur("check")).toBe("http://check/");
  });

  it("rejects bare search phrases with spaces", () => {
    expect(normalizeStartupUrl("adobe photoshop")).toBe("");
    expect(startupUrlSaveError("adobe photoshop")).toMatch(/URL/i);
  });

  it("keeps explicit https urls", () => {
    expect(normalizeStartupUrl("https://mail.google.com/")).toBe("https://mail.google.com/");
  });

  it("allows about:blank", () => {
    expect(normalizeStartupUrl("about:blank")).toBe("about:blank");
  });

  it("rejects unsupported schemes", () => {
    expect(normalizeStartupUrl("ftp://files.example.com")).toBe("");
  });

  it("resolves launch url to Google home by default", () => {
    expect(resolveProfileLaunchUrl("")).toBe(DEFAULT_BROWSER_HOME_URL);
    expect(resolveProfileLaunchUrl("not a url!")).toBe(DEFAULT_BROWSER_HOME_URL);
  });

  it("coerces input helper for domains and intranet hosts", () => {
    expect(coerceStartupUrlInput("example.com/path")).toBe("https://example.com/path");
    expect(coerceStartupUrlInput("check")).toBe("http://check");
  });

  it("saves empty startup as Google home and keeps prior on invalid phrase", () => {
    expect(resolveStartupUrlSave("", "")).toBe(DEFAULT_BROWSER_HOME_URL);
    expect(resolveStartupUrlSave("not a url!", "https://google.com/")).toBe("https://google.com/");
    expect(resolveStartupUrlSave("not a url!", "")).toBe(DEFAULT_BROWSER_HOME_URL);
  });

  it("formats startup url for directory display", () => {
    expect(formatStartupUrlDisplay("")).toBe("google.com");
    expect(formatStartupUrlDisplay("https://www.google.com/")).toBe("google.com");
    expect(formatStartupUrlDisplay("https://mail.google.com/")).toBe("mail.google.com");
  });
});
