/**
 * Hub directory search SSOT — P0003 split model (live input, debounced expensive path).
 * @see Tool/docs/ssot/hub-shell-ssot.md
 */

/** FilterBar / HubSearchField — input must update immediately (never debounce UI). */
export const DIRECTORY_SEARCH_UI_DEBOUNCE_MS = 0 as const;

/** Client filter, facet counts, haystack scan — default for `useDirectorySearchQuery`. */
export const DIRECTORY_SEARCH_FILTER_DEBOUNCE_MS = 140;

/** Server-paginated directory fetch (SQL/API) — P0003 Profiles golden. */
export const DIRECTORY_SEARCH_FETCH_DEBOUNCE_MS = 200;
