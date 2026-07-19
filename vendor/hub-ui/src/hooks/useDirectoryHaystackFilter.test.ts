/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDirectoryHaystackFilter } from "./useDirectoryHaystackFilter";

type Row = { id: string; name: string };

const ROWS: Row[] = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Bravo" },
  { id: "c", name: "Charlie" },
];

describe("useDirectoryHaystackFilter", () => {
  it("builds a lookup keyed by keyOf and folds haystackOf", () => {
    const { result } = renderHook(() =>
      useDirectoryHaystackFilter(
        ROWS,
        (row) => row.id,
        (row) => row.name,
      ),
    );

    expect(result.current.haystackOf(ROWS[0]!)).toContain("alpha");
    expect(result.current.index.size).toBe(3);
  });

  // SSOT stability guard: passing a fresh inline keyOf/haystackOf on every render (the common
  // consumer pattern) must NOT rebuild the O(n) index. If the id-fn identity leaked into the
  // memo deps, the whole haystack index would rebuild every render — the root cause of the slow
  // directory search + checkbox lag we fixed. Index is rebuilt only when `rows` changes.
  it("keeps the index stable under unstable inline keyOf/haystackOf", () => {
    const { result, rerender } = renderHook(
      ({ rows }: { rows: Row[] }) =>
        useDirectoryHaystackFilter(
          rows,
          (row) => row.id,
          (row) => row.name,
        ),
      { initialProps: { rows: ROWS } },
    );

    const firstIndex = result.current.index;
    const firstHaystackOf = result.current.haystackOf;

    rerender({ rows: ROWS });
    rerender({ rows: ROWS });

    expect(result.current.index).toBe(firstIndex);
    expect(result.current.haystackOf).toBe(firstHaystackOf);

    // A genuine data change (new rows array) must rebuild the index.
    const nextRows: Row[] = [...ROWS, { id: "d", name: "Delta" }];
    rerender({ rows: nextRows });
    expect(result.current.index).not.toBe(firstIndex);
    expect(result.current.index.size).toBe(4);
  });
});
