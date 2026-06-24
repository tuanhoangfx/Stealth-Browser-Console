import { describe, expect, it } from "vitest";
import { resolveAppVersionReleaseMeta } from "./app-release";

describe("resolveAppVersionReleaseMeta", () => {
  it("returns publishedAt for header activity timestamp", () => {
    const meta = resolveAppVersionReleaseMeta();
    expect(meta.shortLabel).not.toBe("MVP");
    expect(meta.publishedAt).toBeTruthy();
    expect(typeof meta.live).toBe("boolean");
  });
});
