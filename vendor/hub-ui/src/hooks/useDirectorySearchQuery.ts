import { useEffect, useMemo, useState, useTransition } from "react";
import { DIRECTORY_SEARCH_FILTER_DEBOUNCE_MS } from "../lib/directory-search-contract";
import { useDebouncedValue } from "./useDebouncedValue";

export type UseDirectorySearchQueryOptions = {
  initialQuery?: string;
  debounceMs?: number;
  /** Immediate filter query — shell pass-through (no debounce lag). Unsafe on large client vaults. */
  live?: boolean;
};

/** Shared search input contract — immediate typing + debounced query for directory filtering. */
export function useDirectorySearchQuery(opts: UseDirectorySearchQueryOptions = {}) {
  const { initialQuery = "", debounceMs = DIRECTORY_SEARCH_FILTER_DEBOUNCE_MS, live = false } = opts;
  const [queryInput, setQueryInput] = useState(initialQuery);
  const debouncedQuery = useDebouncedValue(queryInput, live ? 0 : debounceMs);
  const resolvedQuery = live ? queryInput : debouncedQuery;
  const [query, setQuery] = useState(resolvedQuery);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (resolvedQuery === query) return;
    startTransition(() => setQuery(resolvedQuery));
  }, [query, resolvedQuery]);

  return useMemo(
    () => ({
      queryInput,
      setQueryInput,
      /** Debounced filter query — applied via transition so typing stays responsive on large catalogs. */
      query,
      debouncedQuery: query,
      queryPending: live ? false : queryInput !== debouncedQuery || isPending,
    }),
    [debouncedQuery, isPending, query, queryInput, live],
  );
}

export type DirectorySearchQuery = ReturnType<typeof useDirectorySearchQuery>;
