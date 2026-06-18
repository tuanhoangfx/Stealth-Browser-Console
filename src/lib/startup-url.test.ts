import { describe, expect, it } from "vitest";
import {
  coerceStartupUrlInput,
  formatStartupUrlDisplay,
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

  it("rejects bare search keywords", () => {
    expect(normalizeStartupUrl("adobe")).toBe("");
    expect(startupUrlSaveError("adobe")).toMatch(/full URL/i);
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
    expect(resolveProfileLaunchUrl("adobe")).toBe(DEFAULT_BROWSER_HOME_URL);
  });

  it("coerces input helper for domains only", () => {
    expect(coerceStartupUrlInput("example.com/path")).toBe("https://example.com/path");
    expect(coerceStartupUrlInput("adobe")).toBe("");
  });

  it("saves empty startup as Google home and keeps prior on invalid keyword", () => {
    expect(resolveStartupUrlSave("", "")).toBe(DEFAULT_BROWSER_HOME_URL);
    expect(resolveStartupUrlSave("adobe", "https://google.com/")).toBe("https://google.com/");
    expect(resolveStartupUrlSave("adobe", "")).toBe(DEFAULT_BROWSER_HOME_URL);
  });

  it("formats startup url for directory display", () => {
    expect(formatStartupUrlDisplay("")).toBe("Google home");
    expect(formatStartupUrlDisplay("https://mail.google.com/")).toBe("https://mail.google.com/");
  });
});
