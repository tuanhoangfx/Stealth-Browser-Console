import { describe, expect, it } from "vitest";
import { createScopedDirectoryFreezePrefs } from "./directory-freeze-prefs";

describe("createScopedDirectoryFreezePrefs", () => {
  it("returns a stable prefs object per scope", () => {
    const scoped = createScopedDirectoryFreezePrefs<"a" | "b">({
      storageKey: (s) => `test:${s}:freeze`,
      changeEvent: (s) => `test-${s}-freeze-change`,
      defaultCount: 0,
    });
    const a1 = scoped.forScope("a");
    const a2 = scoped.forScope("a");
    const b = scoped.forScope("b");
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect(a1.changeEvent).toBe("test-a-freeze-change");
    expect(b.changeEvent).toBe("test-b-freeze-change");
    expect(a1.defaultCount).toBe(0);
  });

  it("supports per-scope defaultCount", () => {
    const scoped = createScopedDirectoryFreezePrefs<"orders" | "products">({
      storageKey: (s) => `test:${s}`,
      changeEvent: (s) => `test-${s}`,
      defaultCount: (s) => (s === "orders" ? 5 : 0),
    });
    expect(scoped.forScope("orders").defaultCount).toBe(5);
    expect(scoped.forScope("products").defaultCount).toBe(0);
  });
});
