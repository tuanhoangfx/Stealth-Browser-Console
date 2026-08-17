import { describe, expect, it } from "vitest";
import {
  HUB_JOB_TITLES,
  cleanHubJobTitleSlug,
  hubJobTitleFilterOptions,
  hubJobTitleLabel,
  hubJobTitleRank,
  hubJobTitleStickerFilterOptions,
  isHubJobTitleSlug,
} from "./hub-job-titles";

describe("hub-job-titles", () => {
  it("exports CEO / Manager / Employee catalog", () => {
    expect(HUB_JOB_TITLES).toHaveLength(3);
    expect(HUB_JOB_TITLES.map((t) => t.slug)).toEqual(["ceo", "manager", "employee"]);
    expect(HUB_JOB_TITLES.map((t) => t.label)).toEqual(["CEO", "Manager", "Employee"]);
  });

  it("ranks positions CEO → Manager → Employee, unassigned last", () => {
    expect(hubJobTitleRank("ceo")).toBe(0);
    expect(hubJobTitleRank("Manager")).toBe(1);
    expect(hubJobTitleRank("employee")).toBe(2);
    expect(hubJobTitleRank(null)).toBe(Number.MAX_SAFE_INTEGER);
    expect(hubJobTitleRank("intern")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("cleans and labels slugs", () => {
    expect(isHubJobTitleSlug("manager")).toBe(true);
    expect(cleanHubJobTitleSlug(" Employee ")).toBe("employee");
    expect(cleanHubJobTitleSlug("unknown")).toBeNull();
    expect(hubJobTitleLabel("ceo")).toBe("CEO");
  });

  it("builds sticker filter options with separate emoji + label", () => {
    const opts = hubJobTitleStickerFilterOptions();
    expect(opts[0]).toMatchObject({ value: "ceo", label: "CEO", emoji: "🧭" });
    expect(opts.some((o) => o.value === "")).toBe(false);
    const withNone = hubJobTitleStickerFilterOptions({ includeNone: true });
    expect(withNone[withNone.length - 1]).toMatchObject({ value: "", label: "None", emoji: "🚫" });
  });

  it("builds emoji-prefixed filter options", () => {
    const opts = hubJobTitleFilterOptions();
    expect(opts[1]?.value).toBe("manager");
    expect(opts[1]?.label).toContain("Manager");
  });
});
