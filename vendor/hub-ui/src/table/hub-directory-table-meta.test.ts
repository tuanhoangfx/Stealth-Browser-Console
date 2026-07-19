import { describe, expect, it } from "vitest";
import { buildDirectoryColumns } from "./hub-directory-table-meta";

describe("buildDirectoryColumns headerAlign", () => {
  const meta = {
    order_date: {
      label: "Date",
      colClass: "hub-users-col--od-order-date",
      role: "name" as const,
      width: "5.75rem",
      columnKind: "date" as const,
    },
    external_order_id: {
      label: "Order ID",
      colClass: "hub-users-col--od-order-id",
      role: "name" as const,
      width: "7.25rem",
      columnKind: "code" as const,
    },
    product_name: {
      label: "Product",
      colClass: "hub-users-col--od-product",
      role: "name" as const,
      width: "16rem",
    },
    status_override: {
      label: "Status",
      colClass: "hub-users-col--od-status",
      role: "status" as const,
      width: "6.5rem",
      headerAlign: "center" as const,
      columnKind: "code" as const,
    },
    processing_time: {
      label: "Process",
      colClass: "hub-users-col--od-processing-time",
      role: "name" as const,
      width: "6.5rem",
      columnKind: "compact" as const,
    },
  };

  it("sets headerAlign center for date/compact, start for code", () => {
    const columns = buildDirectoryColumns(
      ["order_date", "external_order_id", "processing_time"],
      meta,
    );
    expect(columns[0]?.headerAlign).toBe("center"); // date
    expect(columns[1]?.headerAlign).toBe("start"); // code
    expect(columns[2]?.headerAlign).toBe("center"); // compact
  });

  it("leaves headerAlign undefined for text columns without columnKind", () => {
    const columns = buildDirectoryColumns(["product_name"], meta);
    expect(columns[0]?.headerAlign).toBeUndefined();
  });

  it("respects explicit headerAlign over columnKind default", () => {
    const columns = buildDirectoryColumns(["status_override"], meta);
    expect(columns[0]?.headerAlign).toBe("center");
  });
});
