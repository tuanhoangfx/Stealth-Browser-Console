import { describe, expect, it, vi } from "vitest";
import { migrateChartKeyList, migrateChartKeysWithPersist } from "./chart-key-migrate";

describe("migrateChartKeysWithPersist", () => {
  it("returns null when param absent", () => {
    const persist = vi.fn();
    expect(migrateChartKeysWithPersist(null, persist)).toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });

  it("persists bar keys when legacy donut keys present", () => {
    const persist = vi.fn();
    const result = migrateChartKeysWithPersist("usage_donut,password_donut", persist);
    expect(result).toEqual(new Set(["usage_bar", "password_bar"]));
    expect(persist).toHaveBeenCalledWith("usage_bar,password_bar");
  });

  it("does not persist when already migrated", () => {
    const persist = vi.fn();
    const result = migrateChartKeysWithPersist("usage_bar,service_bar", persist);
    expect(result).toEqual(new Set(["usage_bar", "service_bar"]));
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("migrateChartKeyList", () => {
  it("maps deploy/status donut keys in storage arrays", () => {
    const { next, changed } = migrateChartKeyList(["deploy_donut", "health_bar"]);
    expect(changed).toBe(true);
    expect(next).toEqual(["deploy_bar", "health_bar"]);
  });
});
