import { describe, expect, it } from "vitest";
import {
  hubRosterPositionDetail,
  hubRosterPresence,
  hubRosterTeamDetail,
  hubRosterUserDetail,
  hubRosterUserRowMeta,
} from "./hub-roster-user-row";

describe("hubRosterUserRowMeta", () => {
  const now = new Date("2026-08-22T12:00:00.000Z").getTime();

  it("uses Online ≤5m · Active ≤24h · Idle ≤7d", () => {
    expect(hubRosterPresence("2026-08-22T11:56:00.000Z", now).tone).toBe("online");
    expect(hubRosterPresence("2026-08-22T11:00:00.000Z", now).tone).toBe("active");
    expect(hubRosterPresence("2026-08-18T12:00:00.000Z", now).tone).toBe("idle");
    expect(hubRosterPresence("2026-08-14T12:00:00.000Z", now).tone).toBe("offline");
    expect(hubRosterPresence(null, now).tone).toBe("offline");
  });

  it("paints Team · Position and keeps Status off the detail string", () => {
    expect(hubRosterTeamDetail("marketing")).toBe("🎯 Marketing");
    expect(hubRosterPositionDetail("employee")).toBe("👤 Employee");
    expect(hubRosterUserDetail({ teamSlug: "marketing", jobTitle: "employee" })).toBe(
      "🎯 Marketing · 👤 Employee",
    );
    expect(hubRosterUserDetail({ teamSlug: "sales" })).toBe("📈 Sales");
    expect(hubRosterUserRowMeta({ teamSlug: "sales" })).toEqual({
      detail: "📈 Sales",
      detailPlaceholder: "Position",
      status: { tone: "offline", label: "Offline" },
    });
    expect(hubRosterUserRowMeta({ teamSlug: "sales", jobTitle: "manager" })).toEqual({
      detail: "📈 Sales · 👨‍💼 Manager",
      status: { tone: "offline", label: "Offline" },
    });
  });

  it("infers Team CEO from Position CEO when team is empty", () => {
    expect(hubRosterTeamDetail(null, "ceo")).toBe("🧭 CEO");
    expect(hubRosterUserDetail({ jobTitle: "ceo" })).toBe("🧭 CEO");
  });
});
