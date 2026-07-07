import { useCallback, useMemo } from "react";
import { buildSearchHaystackIndex, type SearchRowKey } from "../lib/search-haystack-index";

/** Precomputed haystack lookup for directory filter functions. */
export function useDirectoryHaystackFilter<Row>(
  rows: readonly Row[],
  keyOf: (row: Row) => SearchRowKey,
  haystackOf: (row: Row) => string | null | undefined,
) {
  const index = useMemo(() => buildSearchHaystackIndex(rows, keyOf, haystackOf), [rows, keyOf, haystackOf]);

  const haystackOfRow = useCallback((row: Row) => index.get(keyOf(row)) ?? "", [index, keyOf]);

  return { index, haystackOf: haystackOfRow };
}
