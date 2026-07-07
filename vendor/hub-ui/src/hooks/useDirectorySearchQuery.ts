import { useMemo, useState } from "react";
import { DIRECTORY_SEARCH_FILTER_DEBOUNCE_MS } from "../lib/directory-search-contract";
import { useDebouncedValue } from "./useDebouncedValue";

export type UseDirectorySearchQueryOptions = {
  initialQuery?: string;
  debounceMs?: number;
  /** Immediate filter query — shell pass-through (no debounce lag). */
  live?: boolean;
};

/** Shared search input contract — immediate typing + debounced query for directory filtering. */
export function useDirectorySearchQuery(opts: UseDirectorySearchQueryOptions = {}) {
  const { initialQuery = "", debounceMs = DIRECTORY_SEARCH_FILTER_DEBOUNCE_MS, live = false } = opts;
  const [queryInput, setQueryInput] = useState(initialQuery);
  const debouncedQuery = useDebouncedValue(queryInput, live ? 0 : debounceMs);
  const query = live ? queryInput : debouncedQuery;

  return useMemo(
    () => ({
      queryInput,
      setQueryInput,
      /** Debounced filter query — no useDeferredValue (lags on 6k+ rows, desyncs KPI/table). */
      query,
      debouncedQuery: query,
      queryPending: live ? false : queryInput !== debouncedQuery,
    }),
    [debouncedQuery, query, queryInput, live],
  );
}

export type DirectorySearchQuery = ReturnType<typeof useDirectorySearchQuery>;
