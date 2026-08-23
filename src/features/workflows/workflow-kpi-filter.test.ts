import { describe, expect, it } from "vitest";
import { isWorkflowActivityActive, nextWorkflowActivityKey, withWorkflowKpiFilterClicks } from "./workflow-kpi-filter";
import { isStoreActivityActive, nextStoreActivityKey } from "./workflow-store-kpi-filter";

describe("nextWorkflowActivityKey", () => {
  it("toggles activity tiles and clears on Total", () => {
    expect(nextWorkflowActivityKey("idle", null)).toBe("idle");
    expect(nextWorkflowActivityKey("idle", "idle")).toBeNull();
    expect(nextWorkflowActivityKey("total", "empty")).toBeNull();
    expect(nextWorkflowActivityKey("total", null)).toBeUndefined();
  });

  it("marks the active tile", () => {
    expect(isWorkflowActivityActive("idle", "idle")).toBe(true);
    expect(isWorkflowActivityActive("total", "idle")).toBe(false);
  });

  it("wires onClick for filterable tiles", () => {
    const applied: Array<string | null> = [];
    const [idle] = withWorkflowKpiFilterClicks(
      [{ prefKey: "idle", label: "Idle", value: 2 }],
      null,
      (next) => applied.push(next),
    );
    idle.onClick?.();
    expect(applied).toEqual(["idle"]);
  });
});

describe("nextStoreActivityKey", () => {
  it("does not filter on Selected and toggles Local", () => {
    expect(nextStoreActivityKey("selected", null)).toBeUndefined();
    expect(nextStoreActivityKey("local", null)).toBe("local");
    expect(nextStoreActivityKey("installed", null)).toBe("installed");
    expect(isStoreActivityActive("selected", "installed")).toBe(false);
  });
});
