import { describe, expect, it } from "vitest";
import {
  groupHubBulkDetailFieldsForRows,
  HUB_BULK_DETAIL_FIELD_COMPONENT,
  resolveHubBulkDetailFieldComponent,
  type HubBulkDetailFieldDef,
} from "./HubBulkDetailField";

const header = { label: "Status", colClass: "", role: "status" as const, headerAlign: "start" as const };

function def(control: HubBulkDetailFieldDef["control"], fullWidth?: boolean): HubBulkDetailFieldDef {
  if (control === "filter") {
    return { key: "status", control, header, fieldLabel: "Status", filterKey: "bulk-status", options: [], fullWidth };
  }
  if (control === "date") {
    return { key: "due", control, header, fieldLabel: "Due", fullWidth };
  }
  if (control === "multiline") {
    return { key: "note", control, header, fieldLabel: "Note", fullWidth };
  }
  return { key: "service", control: "edit", header, fieldLabel: "Service", fullWidth };
}

describe("HubBulkDetailField SSOT", () => {
  it("maps every control to a HubAdmClick* component name", () => {
    for (const control of ["filter", "date", "edit", "multiline"] as const) {
      expect(resolveHubBulkDetailFieldComponent({ control })).toBe(HUB_BULK_DETAIL_FIELD_COMPONENT[control]);
    }
  });

  it("groups full-width fields into single rows", () => {
    const fields = [
      def("edit"),
      def("edit"),
      { ...def("multiline"), fullWidth: true },
      def("edit"),
    ];
    const rows = groupHubBulkDetailFieldsForRows(fields);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.single).toBe(false);
    expect(rows[0]?.fields).toHaveLength(2);
    expect(rows[1]?.single).toBe(true);
    expect(rows[1]?.fields[0]?.control).toBe("multiline");
    expect(rows[2]?.single).toBe(false);
    expect(rows[2]?.fields).toHaveLength(1);
  });

  it("chunks three inline fields per row", () => {
    const fields = [def("edit"), def("edit"), def("edit"), def("edit")];
    const rows = groupHubBulkDetailFieldsForRows(fields);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.fields).toHaveLength(3);
    expect(rows[1]?.fields).toHaveLength(1);
  });
});
