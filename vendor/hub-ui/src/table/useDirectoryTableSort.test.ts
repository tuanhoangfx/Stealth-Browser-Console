/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { directoryTableSortReducer, useDirectoryTableSort } from "./useDirectoryTableSort";

type Row = { id: string; name: string };

describe("directoryTableSortReducer", () => {
  it("sets asc when switching to a new column", () => {
    expect(directoryTableSortReducer({ sortKey: "name", sortDir: "desc" }, "id")).toEqual({
      sortKey: "id",
      sortDir: "asc",
    });
  });

  it("toggles asc/desc when clicking the same column", () => {
    expect(directoryTableSortReducer({ sortKey: "name", sortDir: "asc" }, "name")).toEqual({
      sortKey: "name",
      sortDir: "desc",
    });
    expect(directoryTableSortReducer({ sortKey: "name", sortDir: "desc" }, "name")).toEqual({
      sortKey: "name",
      sortDir: "asc",
    });
  });

  it("handles three consecutive toggles on one column", () => {
    const s0 = { sortKey: "chatbot" as const, sortDir: "asc" as const };
    const s1 = directoryTableSortReducer(s0, "chatbot");
    const s2 = directoryTableSortReducer(s1, "chatbot");
    expect(s1.sortDir).toBe("desc");
    expect(s2.sortDir).toBe("asc");
  });
});

describe("useDirectoryTableSort", () => {
  const ROWS: Row[] = [
    { id: "b", name: "Bravo" },
    { id: "a", name: "Alpha" },
    { id: "c", name: "Charlie" },
  ];

  it("sorts by the projected value and toggles direction", () => {
    const { result } = renderHook(() =>
      useDirectoryTableSort(ROWS, "name", (row) => row.name),
    );

    expect(result.current.sorted.map((r) => r.id)).toEqual(["a", "b", "c"]);

    act(() => result.current.onSort("name"));
    expect(result.current.sortDir).toBe("desc");
    expect(result.current.sorted.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  // SSOT stability guard: a fresh inline `sortableValue` on every render must NOT re-run the
  // O(n log n) sort. If the projection identity leaked into the memo deps, `sorted` would get a
  // new identity (and re-sort) every render — re-rendering the whole table body on any parent
  // update. Sort recomputes only on data / sortKey / sortDir change.
  it("keeps sorted stable under an unstable inline sortableValue", () => {
    const { result, rerender } = renderHook(
      ({ rows }: { rows: Row[] }) =>
        // New arrow identity every render — same behavior, unstable identity.
        useDirectoryTableSort(rows, "name", (row) => row.name),
      { initialProps: { rows: ROWS } },
    );

    const firstSorted = result.current.sorted;

    rerender({ rows: ROWS });
    rerender({ rows: ROWS });
    expect(result.current.sorted).toBe(firstSorted);

    // A genuine data change re-sorts.
    const nextRows: Row[] = [...ROWS, { id: "d", name: "Aardvark" }];
    rerender({ rows: nextRows });
    expect(result.current.sorted).not.toBe(firstSorted);
    expect(result.current.sorted.map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
  });
});
