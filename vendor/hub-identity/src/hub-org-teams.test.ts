import { describe, expect, it } from "vitest";
import {
  HUB_ORG_TEAMS,
  cleanHubOrgTeamSlug,
  hubOrgTeamFilterOptions,
  hubOrgTeamLabel,
  hubOrgTeamStickerFilterOptions,
  isHubOrgTeamSlug,
} from "./hub-org-teams";

describe("hub-org-teams", () => {
  it("exports six org teams including CEO", () => {
    expect(HUB_ORG_TEAMS).toHaveLength(6);
    expect(HUB_ORG_TEAMS.map((t) => t.slug)).toEqual([
      "ceo",
      "sales",
      "marketing",
      "warehouse",
      "engineering",
      "accounting",
    ]);
  });

  it("keeps executive, revenue, and marketing stickers distinct", () => {
    expect(HUB_ORG_TEAMS.slice(0, 3)).toMatchObject([
      { slug: "ceo", label: "CEO", emoji: "🧭" },
      { slug: "sales", label: "Sales", emoji: "📈" },
      { slug: "marketing", label: "Marketing", emoji: "🎯" },
    ]);
  });

  it("cleans and labels slugs", () => {
    expect(isHubOrgTeamSlug("marketing")).toBe(true);
    expect(cleanHubOrgTeamSlug(" Engineering ")).toBe("engineering");
    expect(cleanHubOrgTeamSlug("unknown")).toBeNull();
    expect(hubOrgTeamLabel("accounting")).toBe("Accounting");
  });

  it("builds filter options with emoji labels", () => {
    const opts = hubOrgTeamFilterOptions();
    expect(opts[0]?.value).toBe("ceo");
    expect(opts[0]?.label).toContain("CEO");
  });

  it("builds sticker filter options with separate emoji + label", () => {
    const opts = hubOrgTeamStickerFilterOptions();
    expect(opts[0]).toMatchObject({ value: "ceo", label: "CEO", emoji: "🧭" });
    expect(opts[0]?.label.startsWith("👑")).toBe(false);
    expect(opts.some((o) => o.value === "")).toBe(false);
  });

  it("can append 🚫 None for unassigned team", () => {
    const opts = hubOrgTeamStickerFilterOptions({ includeNone: true });
    const none = opts[opts.length - 1];
    expect(none).toMatchObject({ value: "", label: "None", emoji: "🚫" });
  });
});
