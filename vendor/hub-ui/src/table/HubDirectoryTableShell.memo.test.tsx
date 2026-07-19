/**
 * @vitest-environment jsdom
 *
 * SSOT regression guard for the "snappy checkbox" contract: toggling one row's selection
 * must re-render ONLY that row's cells, never the whole table body. This is what keeps a
 * single click + a multi-row drag-sweep instant even on large directories. It holds because
 * `DirectoryBodyRow` is `memo`-wrapped and row event callbacks flow through a stable ref, so a
 * stable `renderRowCells` (the documented consumer contract) is never re-invoked for unaffected
 * rows on a selection change.
 */
import { useCallback, useState } from "react";
import { fireEvent, render } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import {
  HubDirectoryTableShell,
  type HubDirectoryTableColumn,
} from "./HubDirectoryTableShell";

// jsdom has no ResizeObserver — the sortable column header measures its label width via one.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

type Item = { id: string; name: string };

const ITEMS: Item[] = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Bravo" },
  { id: "c", name: "Charlie" },
];

const COLUMNS: HubDirectoryTableColumn<"name">[] = [
  { key: "name", label: "Name", role: "name", colClass: "col-name" },
];

function Harness({ counts }: { counts: Map<string, number> }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const onToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Stable per the documented contract — keyed to columns/search, never selection.
  const renderRowCells = useCallback(
    (item: Item) => {
      counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
      return <td className="col-name">{item.name}</td>;
    },
    [counts],
  );

  return (
    <HubDirectoryTableShell
      items={ITEMS}
      ariaLabel="Memo guard table"
      columns={COLUMNS}
      sortKey="name"
      sortDir="asc"
      onSort={() => {}}
      getRowKey={(item) => item.id}
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
      renderRowCells={renderRowCells}
    />
  );
}

describe("HubDirectoryTableShell memoized rows", () => {
  it("re-renders only the toggled row's cells on a checkbox click", () => {
    const counts = new Map<string, number>();
    const { container } = render(<Harness counts={counts} />);

    expect(counts.get("a")).toBe(1);
    expect(counts.get("b")).toBe(1);
    expect(counts.get("c")).toBe(1);

    const checkboxB = container.querySelector<HTMLInputElement>(
      'input[aria-label="Select row b"]',
    );
    expect(checkboxB).not.toBeNull();

    fireEvent.click(checkboxB!);

    // Only row "b" re-rendered; the other rows' expensive cells were memoized.
    expect(counts.get("b")).toBe(2);
    expect(counts.get("a")).toBe(1);
    expect(counts.get("c")).toBe(1);
  });
});
