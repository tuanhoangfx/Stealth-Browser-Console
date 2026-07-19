import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HubDataTable } from "./HubDataTable";

describe("HubDataTable directorySelect colgroup SSOT", () => {
  it("emits select <col> when directorySelect so 36px belt applies under table-layout:fixed", () => {
    const { container } = render(
      <HubDataTable
        directorySelect
        columns={[
          { key: "select", label: "", className: "hub-users-col--select" },
          { key: "user", label: "User", className: "hub-route-access-col--user" },
        ]}
      >
        <tr>
          <td className="hub-users-col--select" />
          <td className="hub-route-access-col--user">a@b.c</td>
        </tr>
      </HubDataTable>,
    );

    const table = container.querySelector("table.hub-users-table");
    expect(table?.getAttribute("data-hub-directory-select")).toBe("");
    const cols = [...container.querySelectorAll("colgroup col")];
    expect(cols).toHaveLength(2);
    expect(cols[0]?.className).toContain("hub-users-col--select");
    expect(cols[1]?.className).toContain("hub-route-access-col--user");
  });

  it("omits colgroup when directorySelect is off", () => {
    const { container } = render(
      <HubDataTable columns={[{ key: "user", label: "User" }]}>
        <tr>
          <td>a@b.c</td>
        </tr>
      </HubDataTable>,
    );
    expect(container.querySelector("colgroup")).toBeNull();
    expect(container.querySelector("table")?.hasAttribute("data-hub-directory-select")).toBe(false);
  });
});
