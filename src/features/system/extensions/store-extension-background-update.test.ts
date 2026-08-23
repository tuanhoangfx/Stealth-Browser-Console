import { describe, expect, it } from "vitest";
import type { StoreExtensionUpdateCheck } from "../../../types";
import {
  formatStoreExtensionUpdateLine,
  planStoreExtensionBackgroundUpdate,
} from "./store-extension-background-update";

const available: StoreExtensionUpdateCheck = {
  checking: false,
  checkedAt: "2026-08-23T15:00:00.000Z",
  results: [
    {
      storeId: "fb001",
      name: "FB001 Cookie Bridge",
      current: "1.2.4",
      latest: "1.2.5",
      available: true,
    },
    {
      storeId: "surfshark",
      name: "Surfshark VPN Extension",
      current: "5.2.0",
      latest: "5.2.1",
      available: true,
    },
  ],
};

describe("planStoreExtensionBackgroundUpdate", () => {
  it("ignores in-flight probes", () => {
    expect(
      planStoreExtensionBackgroundUpdate({ checking: true, results: available.results }, null),
    ).toEqual({ action: "ignore" });
  });

  it("plans a silent update for newer Store versions", () => {
    const plan = planStoreExtensionBackgroundUpdate(available, null);
    expect(plan.action).toBe("update");
    if (plan.action !== "update") return;
    expect(plan.key).toBe(available.checkedAt);
    expect(plan.rows).toHaveLength(2);
    expect(formatStoreExtensionUpdateLine(plan.rows[0])).toBe(
      "FB001 Cookie Bridge 1.2.4 → 1.2.5",
    );
  });

  it("does not start the same probe twice", () => {
    expect(planStoreExtensionBackgroundUpdate(available, available.checkedAt ?? "done")).toEqual({
      action: "ignore",
    });
  });

  it("marks a current catalog as done without update work", () => {
    expect(
      planStoreExtensionBackgroundUpdate(
        {
          checking: false,
          checkedAt: "done",
          results: [{ ...available.results[0], available: false, latest: "1.2.4" }],
        },
        null,
      ),
    ).toEqual({ action: "done", key: "done" });
  });
});
