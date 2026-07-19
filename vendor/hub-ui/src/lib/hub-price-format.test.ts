import { afterEach, describe, expect, it, vi } from "vitest";
import {
  coerceHubOrderPriceFormat,
  createHubPriceFormatStore,
} from "./hub-price-format";

const KEY = "test-tool:price-format-settings";
const EVENT = "test-tool:price-format-changed";

function makeStore(overrides: Partial<Parameters<typeof createHubPriceFormatStore>[0]> = {}) {
  return createHubPriceFormatStore({
    storageKey: KEY,
    event: EVENT,
    defaultFormat: "k",
    readVndUsdRate: () => 26_000,
    ...overrides,
  });
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("coerceHubOrderPriceFormat", () => {
  it("accepts valid formats and rejects the rest", () => {
    expect(coerceHubOrderPriceFormat("k")).toBe("k");
    expect(coerceHubOrderPriceFormat("full")).toBe("full");
    expect(coerceHubOrderPriceFormat("usd")).toBe("usd");
    expect(coerceHubOrderPriceFormat("nope")).toBeNull();
    expect(coerceHubOrderPriceFormat(123)).toBeNull();
    expect(coerceHubOrderPriceFormat(undefined, "full")).toBe("full");
  });
});

describe("createHubPriceFormatStore", () => {
  it("returns the default format when nothing is stored", () => {
    const store = makeStore();
    expect(store.read()).toEqual({ format: "k" });
    expect(store.DEFAULT).toEqual({ format: "k" });
  });

  it("round-trips write → read and persists only the format key", () => {
    const store = makeStore();
    store.write({ format: "usd" });
    expect(store.read()).toEqual({ format: "usd" });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ format: "usd" });
  });

  it("migrates legacy split settings (sampleFormat/tableFormat) → single format", () => {
    // Prefer `format`, then `sampleFormat`, then `tableFormat`.
    localStorage.setItem(KEY, JSON.stringify({ tableFormat: "full", sampleFormat: "usd" }));
    expect(makeStore().read()).toEqual({ format: "usd" });

    localStorage.setItem(KEY, JSON.stringify({ tableFormat: "full" }));
    expect(makeStore().read()).toEqual({ format: "full" });

    localStorage.setItem(KEY, JSON.stringify({ format: "k", sampleFormat: "usd" }));
    expect(makeStore().read()).toEqual({ format: "k" });
  });

  it("falls back to the default when stored JSON is invalid or unknown", () => {
    localStorage.setItem(KEY, "{not json");
    expect(makeStore().read()).toEqual({ format: "k" });

    localStorage.setItem(KEY, JSON.stringify({ format: "bitcoin" }));
    expect(makeStore().read()).toEqual({ format: "k" });
  });

  it("resolves the VND/USD rate and guards non-positive rates", () => {
    expect(makeStore({ readVndUsdRate: () => 25_000 }).readResolved()).toEqual({
      format: "k",
      vndUsdRate: 25_000,
    });
    // Non-positive / NaN rate → default 26.000.
    expect(makeStore({ readVndUsdRate: () => 0 }).readResolved().vndUsdRate).toBe(26_000);
    expect(makeStore({ readVndUsdRate: () => Number.NaN }).readResolved().vndUsdRate).toBe(26_000);
  });

  it("emits the configured event on write", () => {
    const store = makeStore();
    const spy = vi.fn();
    window.addEventListener(EVENT, spy);
    store.write({ format: "full" });
    store.emit();
    window.removeEventListener(EVENT, spy);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
