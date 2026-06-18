import { useCallback, useEffect, useMemo, useState } from "react";

/** Golden directory selection — prune hidden rows, card select-all (P0004 Users parity). */
export function useHubDirectorySelection<T>(
  visibleItems: readonly T[],
  idOf: (item: T) => string,
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const visible = new Set(visibleItems.map(idOf));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [idOf, visibleItems]);

  const selectedRows = useMemo(
    () => visibleItems.filter((item) => selectedIds.has(idOf(item))),
    [idOf, selectedIds, visibleItems],
  );

  const allVisibleSelected = useMemo(
    () => visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(idOf(item))),
    [idOf, selectedIds, visibleItems],
  );

  const hasSelection = selectedIds.size > 0;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (visibleItems.every((item) => prev.has(idOf(item)))) {
        const next = new Set(prev);
        for (const item of visibleItems) next.delete(idOf(item));
        return next;
      }
      const next = new Set(prev);
      for (const item of visibleItems) next.add(idOf(item));
      return next;
    });
  }, [idOf, visibleItems]);

  return {
    selectedIds,
    setSelectedIds,
    selectedRows,
    allVisibleSelected,
    hasSelection,
    toggleSelect,
    toggleSelectAll,
  };
}
