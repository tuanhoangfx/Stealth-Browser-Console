import type { ProfileCatalogStats, ProfileRow } from "../../types";

export type ProfileDirectoryQuery = {
  search: string;
  groupIds: readonly string[];
  statuses: readonly ProfileRow["status"][];
};

export function hasActiveProfileDirectoryFilters(query: ProfileDirectoryQuery): boolean {
  return (
    query.search.trim().length > 0 || query.groupIds.length > 0 || query.statuses.length > 0
  );
}

export function resolveCatalogTotal(
  catalogStats: ProfileCatalogStats | null,
  profilesLength: number,
): number {
  return catalogStats?.total ?? profilesLength;
}

/**
 * Toolbar selection + pager denominator — catalog total when unfiltered; filtered slice when searching/filtering.
 */
export function resolveProfileDirectoryVisibleTotal(
  query: ProfileDirectoryQuery,
  catalogTotal: number,
  filteredTotal: number,
): number {
  if (!hasActiveProfileDirectoryFilters(query)) {
    return catalogTotal;
  }
  if (filteredTotal <= 0) return 0;
  return Math.min(filteredTotal, catalogTotal);
}
