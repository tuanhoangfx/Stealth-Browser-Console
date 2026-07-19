import { describe, expect, it } from "vitest";
import {
  crmOrderProductMatchesService,
  isCrmOrderCompletedStatus,
} from "./crm-order-details";

describe("isCrmOrderCompletedStatus", () => {
  it("is true only for completed statuses", () => {
    expect(isCrmOrderCompletedStatus("✔️ Completed")).toBe(true);
    expect(isCrmOrderCompletedStatus("Completed")).toBe(true);
    expect(isCrmOrderCompletedStatus("🔘 Pending")).toBe(false);
    expect(isCrmOrderCompletedStatus("Cancelled")).toBe(false);
    expect(isCrmOrderCompletedStatus("")).toBe(false);
    expect(isCrmOrderCompletedStatus(null)).toBe(false);
    expect(isCrmOrderCompletedStatus(undefined)).toBe(false);
  });
});

describe("crmOrderProductMatchesService", () => {
  it("matches common CRM products to their account service (brand-registry SSOT)", () => {
    const cases: Array<[product: string, service: string]> = [
      ["Cursor Pro 1 Month", "Cursor"],
      ["ChatGPT Plus 1 Year", "ChatGPT"],
      ["Claude Max 5x", "Claude"],
      ["Gemini Advanced", "Gemini"],
      ["SuperGrok Lifetime", "Grok"],
      ["Github Copilot Team", "GitHub Copilot"],
      ["CapCut Pro", "CapCut"],
    ];
    for (const [product, service] of cases) {
      expect(crmOrderProductMatchesService(product, service)).toBe(true);
    }
  });

  it("rejects products from a different service", () => {
    expect(crmOrderProductMatchesService("ChatGPT Plus", "Cursor")).toBe(false);
    expect(crmOrderProductMatchesService("Claude Max 20x", "Gemini")).toBe(false);
    expect(crmOrderProductMatchesService("CapCut Pro", "Claude")).toBe(false);
  });

  it("falls back to normalized name match for labels without a brand entry", () => {
    expect(crmOrderProductMatchesService("Auto Render Lifetime", "Auto Render")).toBe(true);
    expect(crmOrderProductMatchesService("Auto Render Lifetime", "Render Farm")).toBe(false);
  });

  it("returns false for empty product or service", () => {
    expect(crmOrderProductMatchesService("", "Cursor")).toBe(false);
    expect(crmOrderProductMatchesService("Cursor Pro", "")).toBe(false);
    expect(crmOrderProductMatchesService(null, undefined)).toBe(false);
  });
});
