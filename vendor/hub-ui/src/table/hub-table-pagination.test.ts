import { describe, expect, it } from "vitest";
import {
  HUB_TABLE_PAGE_SIZE,
  hubPageAllSelected,
  hubPageAllSelectedByPredicate,
  hubTablePaginationResetKey,
  hubTogglePageSelectAll,
  hubTogglePageSelectAllByPredicate,
  paginateHubTableItems,
} from "./hub-table-pagination";

describe("paginateHubTableItems", () => {
  const rows = Array.from({ length: 60 }, (_, i) => i + 1);

  it("defaults to 25 rows per page", () => {
    const p0 = paginateHubTableItems(rows, 0);
    expect(p0.pageItems).toHaveLength(HUB_TABLE_PAGE_SIZE);
    expect(p0.totalPages).toBe(3);
    expect(p0.rangeStart).toBe(1);
    expect(p0.rangeEnd).toBe(25);
    expect(p0.showPager).toBe(true);
  });

  it("clamps page index and slices last page", () => {
    const last = paginateHubTableItems(rows, 99);
    expect(last.pageIndex).toBe(2);
    expect(last.pageItems).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
    expect(last.rangeStart).toBe(51);
    expect(last.rangeEnd).toBe(60);
  });

  it("hides pager for small lists", () => {
    const small = paginateHubTableItems([1, 2, 3], 0);
    expect(small.showPager).toBe(false);
    expect(small.totalPages).toBe(1);
  });
});

describe("hubPageAllSelected", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns false when no selectable rows are selected", () => {
    expect(hubPageAllSelected(items, (r) => r.id, new Set())).toBe(false);
  });

  it("returns true when every page row is selected", () => {
    expect(hubPageAllSelected(items, (r) => r.id, new Set(["a", "b", "c"]))).toBe(true);
  });

  it("respects canSelect filter", () => {
    const canSelect = (r: { id: string }) => r.id !== "b";
    expect(hubPageAllSelected(items, (r) => r.id, new Set(["a", "c"]), canSelect)).toBe(true);
    expect(hubPageAllSelected(items, (r) => r.id, new Set(["a"]), canSelect)).toBe(false);
  });
});

describe("hubTogglePageSelectAll", () => {
  it("selects all page rows when none selected", () => {
    const toggled: string[] = [];
    hubTogglePageSelectAll(
      [{ id: "a" }, { id: "b" }],
      (r) => r.id,
      new Set(),
      (id) => toggled.push(id),
    );
    expect(toggled).toEqual(["a", "b"]);
  });

  it("deselects all page rows when all selected", () => {
    const toggled: string[] = [];
    hubTogglePageSelectAll(
      [{ id: "a" }, { id: "b" }],
      (r) => r.id,
      new Set(["a", "b"]),
      (id) => toggled.push(id),
    );
    expect(toggled).toEqual(["a", "b"]);
  });
});

describe("hubPageAllSelectedByPredicate", () => {
  it("uses isSelected callback instead of Set", () => {
    const selected = new Set(["x"]);
    const isSelected = (r: { id: string }) => selected.has(r.id);
    expect(hubPageAllSelectedByPredicate([{ id: "x" }], isSelected)).toBe(true);
    expect(hubPageAllSelectedByPredicate([{ id: "y" }], isSelected)).toBe(false);
  });
});

describe("hubTogglePageSelectAllByPredicate", () => {
  it("toggles only unselected rows when selecting page", () => {
    const selected = new Set<string>();
    const toggled: string[] = [];
    hubTogglePageSelectAllByPredicate(
      [{ id: "a" }, { id: "b" }],
      (r) => selected.has(r.id),
      (r) => {
        toggled.push(r.id);
        selected.add(r.id);
      },
    );
    expect(toggled).toEqual(["a", "b"]);
  });
});

describe("hubTablePaginationResetKey", () => {
  it("uses explicit reset key when provided", () => {
    expect(hubTablePaginationResetKey([{ id: "a" }], "custom")).toBe("custom");
  });

  it("builds signature from list edges", () => {
    expect(hubTablePaginationResetKey([{ id: "a" }, { id: "z" }])).toBe("2:a:z");
  });
});
