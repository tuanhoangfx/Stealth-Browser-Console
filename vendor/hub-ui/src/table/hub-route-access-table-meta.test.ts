import { describe, expect, it } from "vitest";
import { hubRouteAccessModalTableClass } from "./hub-route-access-table-meta";

describe("hubRouteAccessModalTableClass", () => {
  it("adds stack-align modifier for Teams schema card embeds", () => {
    const cls = hubRouteAccessModalTableClass({
      layout: "expanded",
      showRouteColumn: false,
      showPlanScheduleColumns: true,
      stackAlignColumns: true,
    });
    expect(cls).toContain("hub-users-table--route-access-modal--expanded");
    expect(cls).toContain("hub-users-table--route-access-modal--plan-schedule");
    expect(cls).toContain("hub-users-table--route-access-modal--stack-align");
  });

  it("omits stack-align by default (modal keeps auto layout)", () => {
    const cls = hubRouteAccessModalTableClass({
      layout: "expanded",
      showPlanScheduleColumns: true,
    });
    expect(cls).not.toContain("hub-users-table--route-access-modal--stack-align");
  });
});
