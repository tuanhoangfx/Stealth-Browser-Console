import { describe, expect, it } from "vitest";
import {
  HUB_ORG_TEAMS,
  cleanHubOrgTeamSlug,
  effectiveHubOrgTeamSlug,
  hubOrgTeamFilterOptions,
  hubOrgTeamLabel,
  hubOrgTeamRank,
  hubOrgTeamStickerFilterOptions,
  isHubOrgTeamSlug,
} from "./hub-org-teams";

describe("hub-org-teams", () => {
  it("orders seven org teams by seniority — CEO then Technology", () => {
    expect(HUB_ORG_TEAMS).toHaveLength(7);
    expect(HUB_ORG_TEAMS.map((t) => t.slug)).toEqual([
      "ceo",
      "technology",
      "sales",
      "marketing",
      "warehouse",
      "engineering",
      "accounting",
    ]);
  });

  it("ranks teams by catalog order, unknown last", () => {
    expect(hubOrgTeamRank("ceo")).toBe(0);
    expect(hubOrgTeamRank(" Technology ")).toBe(1);
    expect(hubOrgTeamRank("sales")).toBe(2);
    expect(hubOrgTeamRank(null)).toBe(Number.MAX_SAFE_INTEGER);
    expect(hubOrgTeamRank("unknown")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("keeps executive, technology, and revenue stickers distinct", () => {
    expect(HUB_ORG_TEAMS.slice(0, 3)).toMatchObject([
      { slug: "ceo", label: "CEO", emoji: "🧭" },
      { slug: "technology", label: "Technology", emoji: "💻" },
      { slug: "sales", label: "Sales", emoji: "📈" },
    ]);
  });

  it("cleans and labels slugs", () => {
    expect(isHubOrgTeamSlug("marketing")).toBe(true);
    expect(cleanHubOrgTeamSlug(" Engineering ")).toBe("engineering");
    expect(cleanHubOrgTeamSlug(" Technology ")).toBe("technology");
    expect(cleanHubOrgTeamSlug("unknown")).toBeNull();
    expect(hubOrgTeamLabel("accounting")).toBe("Accounting");
  });

  it("implies Team CEO from Position CEO when team_slug is empty", () => {
    expect(effectiveHubOrgTeamSlug(null, "ceo")).toBe("ceo");
    expect(effectiveHubOrgTeamSlug("sales", "ceo")).toBe("sales");
    expect(effectiveHubOrgTeamSlug(null, "manager")).toBeNull();
    expect(effectiveHubOrgTeamSlug("  CEO  ", "employee")).toBe("ceo");
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
