import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  coerceStartupUrlInput,
  normalizeStartupUrl,
  resolveProfileLaunchUrl,
  resolveStartupUrlSave,
} from "./startup-url";
import { DEFAULT_BROWSER_HOME_URL } from "./browser-home";

const require = createRequire(import.meta.url);
const electronStartup = require("../../electron/lib/startup-url.cjs") as {
  coerceStartupUrlInput: (value: string) => string;
  normalizeStartupUrl: (value: string) => string;
  resolveProfileLaunchUrl: (value: string) => string;
  resolveStartupUrlSave: (value: string, existingUrl?: string) => string;
};

const samples = [
  "",
  "google.com",
  "adobe",
  "https://mail.google.com/",
  "about:blank",
  "ftp://files.example.com",
  "myaccount.google.com",
  "example.com/path",
];

describe("startup-url renderer/main parity", () => {
  it("normalizeStartupUrl matches electron/lib/startup-url.cjs", () => {
    for (const sample of samples) {
      expect(normalizeStartupUrl(sample)).toBe(electronStartup.normalizeStartupUrl(sample));
    }
  });

  it("coerceStartupUrlInput matches electron/lib/startup-url.cjs", () => {
    for (const sample of samples) {
      expect(coerceStartupUrlInput(sample)).toBe(electronStartup.coerceStartupUrlInput(sample));
    }
  });

  it("resolveProfileLaunchUrl matches electron/lib/startup-url.cjs", () => {
    for (const sample of samples) {
      expect(resolveProfileLaunchUrl(sample)).toBe(electronStartup.resolveProfileLaunchUrl(sample));
    }
  });

  it("resolveStartupUrlSave matches electron/lib/startup-url.cjs", () => {
    expect(resolveStartupUrlSave("", "")).toBe(electronStartup.resolveStartupUrlSave("", ""));
    expect(resolveStartupUrlSave("adobe", "https://google.com/")).toBe(
      electronStartup.resolveStartupUrlSave("adobe", "https://google.com/"),
    );
    expect(resolveStartupUrlSave("adobe", "")).toBe(DEFAULT_BROWSER_HOME_URL);
  });
});
