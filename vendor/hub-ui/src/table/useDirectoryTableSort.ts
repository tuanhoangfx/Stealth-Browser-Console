import { useCallback, useMemo, useReducer } from "react";
import type { HubSortDir } from "./HubSortIndicator";

type SortState<TKey extends string> = { sortKey: TKey; sortDir: HubSortDir };

export function directoryTableSortReducer<TKey extends string>(
  state: SortState<TKey>,
  key: TKey,
): SortState<TKey> {
  if (state.sortKey === key) {
    return { sortKey: key, sortDir: state.sortDir === "asc" ? "desc" : "asc" };
  }
  return { sortKey: key, sortDir: "asc" };
}

export type DirectoryTableSortTieBreak<TItem> = (a: TItem, b: TItem) => number;

export function useDirectoryTableSort<TKey extends string, TItem>(
  items: TItem[],
  defaultKey: TKey,
  sortableValue: (item: TItem, key: TKey) => string | number,
  defaultDir: HubSortDir = "asc",
  /** Stable secondary/tertiary order when primary values tie (e.g. Role → Ownership → Joined). */
  tieBreak?: DirectoryTableSortTieBreak<TItem>,
) {
  const [{ sortKey, sortDir }, dispatch] = useReducer(directoryTableSortReducer<TKey>, {
    sortKey: defaultKey,
    sortDir: defaultDir,
  });

  const onSort = useCallback((key: TKey) => {
    dispatch(key);
  }, []);

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const av = sortableValue(a, sortKey);
      const bv = sortableValue(b, sortKey);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
      return tieBreak?.(a, b) ?? 0;
    });
    return copy;
  }, [items, sortKey, sortDir, sortableValue, tieBreak]);

  return { sortKey, sortDir, onSort, sorted };
}
