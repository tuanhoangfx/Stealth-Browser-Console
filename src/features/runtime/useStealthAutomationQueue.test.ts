import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./useStealthAutomationQueue";

describe("mapWithConcurrency", () => {
  it("runs all items", async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      seen.push(value);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("caps parallel workers", async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
