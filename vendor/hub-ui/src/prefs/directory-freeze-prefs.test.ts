import { beforeEach, describe, expect, it } from "vitest";
import {
  createDirectoryFreezePrefs,
  createScopedDirectoryFreezePrefs,
} from "./directory-freeze-prefs";

describe("createDirectoryFreezePrefs legacy migrate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("copies v1 into v2 once and drops legacy key", () => {
    localStorage.setItem("tool-hub:users-table-freeze:v1", "3");
    const prefs = createDirectoryFreezePrefs({
      storageKey: "tool-hub:users-table-freeze:v2",
      changeEvent: "user-table-freeze-change",
      defaultCount: 2,
      legacyStorageKeys: ["tool-hub:users-table-freeze:v1"],
    });
    expect(prefs.read()).toBe(3);
    expect(localStorage.getItem("tool-hub:users-table-freeze:v2")).toBe("3");
    expect(localStorage.getItem("tool-hub:users-table-freeze:v1")).toBeNull();
  });

  it("keeps v2 when both keys exist and purges legacy", () => {
    localStorage.setItem("tool-hub:users-table-freeze:v1", "1");
    localStorage.setItem("tool-hub:users-table-freeze:v2", "4");
    const prefs = createDirectoryFreezePrefs({
      storageKey: "tool-hub:users-table-freeze:v2",
      changeEvent: "user-table-freeze-change",
      defaultCount: 2,
      legacyStorageKeys: ["tool-hub:users-table-freeze:v1"],
    });
    expect(prefs.read()).toBe(4);
    expect(localStorage.getItem("tool-hub:users-table-freeze:v1")).toBeNull();
  });

  it("uses defaultCount when no keys exist", () => {
    const prefs = createDirectoryFreezePrefs({
      storageKey: "tool-hub:users-table-freeze:v2",
      changeEvent: "user-table-freeze-change",
      defaultCount: 2,
      legacyStorageKeys: ["tool-hub:users-table-freeze:v1"],
    });
    expect(prefs.read()).toBe(2);
  });
});

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
