import { describe, expect, it } from "vitest";
import {
  formatHubOrderPriceLabel,
  formatHubOrderPriceParts,
  formatHubOrderPricePillLabel,
} from "./format-order-price";

describe("formatHubOrderPriceParts", () => {
  it("formats VND major units with vi-VN grouping", () => {
    const parts = formatHubOrderPriceParts(125_000_000, "VND");
    expect(parts).toMatchObject({
      amount: "1.250.000",
      currency: "VND",
      symbol: "₫",
      major: 1_250_000,
      isUsd: false,
    });
  });

  it("formats USD with two decimals", () => {
    const parts = formatHubOrderPriceParts(2000, "USD");
    expect(parts).toMatchObject({
      amount: "20.00",
      currency: "USD",
      symbol: "$",
      major: 20,
      isUsd: true,
    });
  });

  it("returns null for missing amount", () => {
    expect(formatHubOrderPriceParts(null)).toBeNull();
    expect(formatHubOrderPriceParts(undefined)).toBeNull();
  });
});

describe("formatHubOrderPricePillLabel", () => {
  it("renders locked VND text label", () => {
    expect(formatHubOrderPricePillLabel(22000, "VND")).toBe("220 ₫");
    expect(formatHubOrderPricePillLabel(4_874_00, "VND")).toBe("4.874 ₫");
  });

  it("renders USD prefix label", () => {
    expect(formatHubOrderPricePillLabel(1999, "USD")).toBe("$19.99");
  });

  it("returns empty string for missing amount", () => {
    expect(formatHubOrderPricePillLabel(null)).toBe("");
  });
});

describe("formatHubOrderPriceLabel", () => {
  it("full format matches the locked pill label", () => {
    expect(formatHubOrderPriceLabel(125_000_000, "VND")).toBe("1.250.000 ₫");
    expect(formatHubOrderPriceLabel(125_000_000, "VND", { format: "full" })).toBe("1.250.000 ₫");
    expect(formatHubOrderPriceLabel(1999, "USD", { format: "full" })).toBe("$19.99");
  });

  it("k format renders VND thousands notation", () => {
    expect(formatHubOrderPriceLabel(24_000_000, "VND", { format: "k" })).toBe("240K");
    expect(formatHubOrderPriceLabel(385_000_000, "VND", { format: "k" })).toBe("3.850K");
    expect(formatHubOrderPriceLabel(210_000_000, "VND", { format: "k" })).toBe("2.100K");
  });

  it("k format falls back to full for non-VND currencies", () => {
    expect(formatHubOrderPriceLabel(1999, "USD", { format: "k" })).toBe("$19.99");
  });

  it("usd format converts VND at the given rate", () => {
    // 1.250.000 ₫ / 25.000 = $50.00
    expect(formatHubOrderPriceLabel(125_000_000, "VND", { format: "usd", vndUsdRate: 25_000 })).toBe(
      "$50.00",
    );
    // default rate 26.000 → 260.000 ₫ = $10.00
    expect(formatHubOrderPriceLabel(26_000_000, "VND", { format: "usd" })).toBe("$10.00");
  });

  it("usd format passes through already-USD amounts", () => {
    expect(formatHubOrderPriceLabel(1999, "USD", { format: "usd", vndUsdRate: 26_000 })).toBe("$19.99");
  });

  it("returns empty string for missing amount", () => {
    expect(formatHubOrderPriceLabel(null, "VND", { format: "k" })).toBe("");
  });
});
