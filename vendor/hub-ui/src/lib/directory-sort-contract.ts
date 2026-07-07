import type { HubSortDir } from "../table/HubSortIndicator";

export type DirectorySortState = {
  sortKey: string;
  sortDir: HubSortDir;
};

/** Mail-style vaults — fixed multi-key default; no column override or URL persistence. */
export function isDirectoryDefaultSortOnlyVault(vaultScope: string): boolean {
  return vaultScope === "mail";
}

/** Runtime sort matches the documented primary default (tie-break rules are implicit). */
export function directorySortMatchesPrimaryDefault(
  sort: DirectorySortState,
  primaryDefault: DirectorySortState,
): boolean {
  return sort.sortKey === primaryDefault.sortKey && sort.sortDir === primaryDefault.sortDir;
}

/** URL/session sort is eligible only when it matches the vault primary default. */
export function sanitizeDirectorySortFromUrl(
  parsed: DirectorySortState | null,
  primaryDefault: DirectorySortState,
): DirectorySortState | null {
  if (!parsed) return null;
  return directorySortMatchesPrimaryDefault(parsed, primaryDefault) ? parsed : null;
}

/** Mail-style vaults — never persist column overrides in URL (default-only). */
export function shouldPersistDirectorySortUrl(
  vaultScope: string,
  sort: DirectorySortState,
  primaryDefault: DirectorySortState,
): boolean {
  if (vaultScope === "mail") return false;
  return !directorySortMatchesPrimaryDefault(sort, primaryDefault);
}
