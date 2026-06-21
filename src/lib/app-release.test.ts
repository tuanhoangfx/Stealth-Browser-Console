import { describe, expect, it } from "vitest";
import { resolveAppVersionReleaseMeta } from "./app-release";

describe("resolveAppVersionReleaseMeta", () => {
  it("returns a release date label (not MVP)", () => {
    const meta = resolveAppVersionReleaseMeta();
    expect(meta.shortLabel).not.toBe("MVP");
    expect(meta.shortLabel.length).toBeGreaterThan(0);
  });
});
