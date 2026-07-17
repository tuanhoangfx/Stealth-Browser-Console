import type { HubSortDir } from "../table/HubSortIndicator";

export type DirectorySortState = {
  sortKey: string;
  sortDir: HubSortDir;
};

/**
 * Directory sort behavior for a given vault/screen.
 *
 * Tools can introduce local overrides (for example, P0020 Data Box uses a
 * `twofaDirectorySortMode` contract to lock additional 2FA tabs to their
 * documented primary default order). Hub-UI stays conservative here — we only
 * treat classic mail-style vaults as "default-order-only" at the shell level.
 */
export type DirectorySortMode = "default-order-only" | "interactive-sort";

export function directorySortMode(vaultScope: string): DirectorySortMode {
  return isDirectoryDefaultSortOnlyVault(vaultScope) ? "default-order-only" : "interactive-sort";
}

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
  if (directorySortMode(vaultScope) === "default-order-only") return false;
  return !directorySortMatchesPrimaryDefault(sort, primaryDefault);
}
