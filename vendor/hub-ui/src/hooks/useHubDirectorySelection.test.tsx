/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useHubDirectorySelection } from "./useHubDirectorySelection";

type Row = { id: string; label?: string };
const idOf = (row: Row) => row.id;

describe("useHubDirectorySelection", () => {
  it("counts a single checked row and exposes it via selectedRows", () => {
    const rows: Row[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const { result } = renderHook(() => useHubDirectorySelection(rows, idOf));

    act(() => result.current.toggleSelect("a"));

    expect(result.current.selectionCount).toBe(1);
    expect(result.current.selectedRows).toEqual([{ id: "a" }]);
    expect(result.current.hasSelection).toBe(true);
    expect(result.current.allVisibleSelected).toBe(false);
  });

  it("select-all checks every visible row and toggles off cleanly", () => {
    const rows: Row[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const { result } = renderHook(() => useHubDirectorySelection(rows, idOf));

    act(() => result.current.toggleSelectAll());
    expect(result.current.selectionCount).toBe(3);
    expect(result.current.allVisibleSelected).toBe(true);

    act(() => result.current.toggleSelectAll());
    expect(result.current.selectionCount).toBe(0);
    expect(result.current.hasSelection).toBe(false);
  });

  // Regression guard for "chọn 1 tick 2": when two visible rows share one id, checking that id
  // ticks both rows. selectionCount must track visible checked rows (2) so bulk gating/labels never
  // desync from the table, even though the underlying Set only holds one entry.
  it("selectionCount tracks visible checked rows, not Set size, when ids collide", () => {
    const rows: Row[] = [{ id: "dup" }, { id: "dup" }, { id: "x" }];
    const { result } = renderHook(() => useHubDirectorySelection(rows, idOf));

    act(() => result.current.toggleSelect("dup"));

    expect(result.current.selectedIds.size).toBe(1);
    expect(result.current.selectionCount).toBe(2);
    expect(result.current.selectedRows).toHaveLength(2);
  });

  it("prunes selections for rows that leave the viewport", () => {
    const initial: Row[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const { result, rerender } = renderHook(
      ({ rows }: { rows: Row[] }) => useHubDirectorySelection(rows, idOf),
      { initialProps: { rows: initial } },
    );

    act(() => result.current.toggleSelect("a"));
    expect(result.current.selectionCount).toBe(1);

    rerender({ rows: [{ id: "b" }, { id: "c" }] });

    expect(result.current.selectionCount).toBe(0);
    expect(result.current.selectedIds.has("a")).toBe(false);
  });

  // SSOT stability guard: a consumer passing a fresh inline `(row) => row.id` on every render
  // (the common case across tools) must NOT bust the selection memos. If the id fn identity
  // leaked into deps, `selectedRows` / `allVisibleSelected` would get a new identity every
  // render and re-render every downstream row on each checkbox toggle (the slow-checkbox bug).
  it("stays referentially stable under an unstable inline idOf", () => {
    const rows: Row[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const { result, rerender } = renderHook(
      // New arrow identity every render — same behavior, unstable identity.
      () => useHubDirectorySelection(rows, (row: Row) => row.id),
    );

    act(() => result.current.toggleSelect("b"));
    const rowsAfterToggle = result.current.selectedRows;
    const allSelAfterToggle = result.current.allVisibleSelected;
    const toggleFnRef = result.current.toggleSelect;

    rerender();
    rerender();

    // No relevant data changed across the extra renders → identities must be preserved.
    expect(result.current.selectedRows).toBe(rowsAfterToggle);
    expect(result.current.allVisibleSelected).toBe(allSelAfterToggle);
    expect(result.current.toggleSelect).toBe(toggleFnRef);
    // Behavior still correct despite unstable inline idOf.
    expect(result.current.selectionCount).toBe(1);
    expect(result.current.selectedRows).toEqual([{ id: "b" }]);
  });
});
