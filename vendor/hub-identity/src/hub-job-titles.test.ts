import { describe, expect, it } from "vitest";
import {
  HUB_JOB_TITLES,
  cleanHubJobTitleSlug,
  hubJobTitleFilterOptions,
  hubJobTitleLabel,
  hubJobTitleStickerFilterOptions,
  isHubJobTitleSlug,
} from "./hub-job-titles";

describe("hub-job-titles", () => {
  it("exports CEO / Manager / Employee catalog", () => {
    expect(HUB_JOB_TITLES).toHaveLength(3);
    expect(HUB_JOB_TITLES.map((t) => t.slug)).toEqual(["ceo", "manager", "employee"]);
    expect(HUB_JOB_TITLES.map((t) => t.label)).toEqual(["CEO", "Manager", "Employee"]);
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
