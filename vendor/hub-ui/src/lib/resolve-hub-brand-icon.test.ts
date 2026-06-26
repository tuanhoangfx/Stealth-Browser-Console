import { describe, expect, it } from "vitest";
import {
  clearHubBrandIconMatchCache,
  listHubBrandIconIds,
  resolveHubBrandIcon,
  resolveHubBrandIconByMatch,
} from "./resolve-hub-brand-icon";

describe("resolveHubBrandIcon", () => {
  it("resolves zalo and facebook by id", () => {
    expect(resolveHubBrandIcon("zalo")?.src).toBe("/assets/brand-icons/zalo.png");
    expect(resolveHubBrandIcon("facebook")?.src).toBe("/assets/brand-icons/facebook.png");
  });

  it("lists registered ids", () => {
    expect(listHubBrandIconIds().length).toBeGreaterThan(100);
  });
});

describe("resolveHubBrandIconByMatch", () => {
  it("maps Gmail to Google icon", () => {
    const hit = resolveHubBrandIconByMatch("Gmail");
    expect(hit?.label).toBe("Google");
    expect(hit?.src).toBe("/icons/google.svg");
  });

  it("maps ChatGPT to OpenAI brand icon", () => {
    const hit = resolveHubBrandIconByMatch("ChatGPT");
    expect(hit?.label).toBe("OpenAI");
    expect(hit?.src).toBe("/assets/brand-icons/chatgpt.png");
  });

  it("maps Capcut to bare shell", () => {
    const hit = resolveHubBrandIconByMatch("Capcut");
    expect(hit?.shell).toBe("bare");
  });

  it("maps Github to tile shell", () => {
    expect(resolveHubBrandIconByMatch("Github")?.shell).toBe("tile");
  });

  it("maps Github Copilot before Github", () => {
    expect(resolveHubBrandIconByMatch("Github Copilot")?.src).toBe("/assets/brand-icons/github-copilot.png");
    expect(resolveHubBrandIconByMatch("Github")?.src).toBe("/assets/brand-icons/github.png");
  });

  it("maps VPN Surfshark before generic surf", () => {
    expect(resolveHubBrandIconByMatch("VPN Surfshark")?.label).toBe("Surfshark");
  });

  it("maps telegram and messenger", () => {
    expect(resolveHubBrandIconByMatch("Telegram")?.id).toBe("telegram");
    expect(resolveHubBrandIconByMatch("Messenger")?.id).toBe("messenger");
  });

  it("returns null for unknown platform", () => {
    expect(resolveHubBrandIconByMatch("UnknownPlatformXYZ")).toBeNull();
  });

  it("clears match cache", () => {
    resolveHubBrandIconByMatch("Gmail");
    clearHubBrandIconMatchCache();
    expect(resolveHubBrandIconByMatch("Gmail")?.label).toBe("Google");
  });
});
