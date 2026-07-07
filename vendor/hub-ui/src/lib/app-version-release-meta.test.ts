import { describe, expect, it } from "vitest";
import { resolveAppVersionReleaseMeta } from "./app-version-release-meta";

describe("resolveAppVersionReleaseMeta", () => {
  it("prefers builtAtIso when present", () => {
    const meta = resolveAppVersionReleaseMeta({
      appVersion: "1.0.0",
      builtAtIso: "2026-07-07T10:30:00+07:00",
    });
    expect(meta.live).toBe(true);
    expect(meta.publishedAt).toBe("2026-07-07T10:30:00+07:00");
    expect(meta.shortLabel).toMatch(/\d{2}:\d{2} \d{2}\/\d{2}\/\d{2}/);
  });

  it("uses manifest latestPublished when version matches", () => {
    const meta = resolveAppVersionReleaseMeta({
      appVersion: "0.7.14",
      manifest: {
        release: { latestPublished: { tag: "v0.7.14", publishedAt: "2026-07-05T12:00:00.000Z" } },
      },
    });
    expect(meta.live).toBe(true);
    expect(meta.publishedAt).toBe("2026-07-05T12:00:00.000Z");
  });

  it("falls back to manifestUpdatedAt", () => {
    const meta = resolveAppVersionReleaseMeta({
      appVersion: "9.9.9",
      manifest: { manifestUpdatedAt: "2026-07-01T08:00:00.000Z" },
    });
    expect(meta.live).toBe(false);
    expect(meta.publishedAt).toBe("2026-07-01T08:00:00.000Z");
  });
});
