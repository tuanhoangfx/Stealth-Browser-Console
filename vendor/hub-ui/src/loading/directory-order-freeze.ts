/**
 * Directory order freeze — keep a just-edited row in its current slot instead of
 * letting it jump when an in-session field edit changes the sort order.
 *
 * Golden pattern SSOT (generalized from P0020 `twofa-directory-order-freeze`).
 * The frozen order is re-captured only on a *structural* change — the freeze key
 * (sort / search / facet / period) changes, or row membership changes (hydrate /
 * sync / add / delete). Editing a row field keeps the same freeze key + membership,
 * so the row stays put but shows its new values. Module state is in-memory and is
 * cleared by a full page reload (F5).
 */

type DirectoryOrderFreezeState = {
  freezeKey: string;
  orderIds: string[];
};

/** In-memory row order per scope — survives data edits until reload. */
const frozenOrderByScope = new Map<string, DirectoryOrderFreezeState>();

/** @internal Test/reset hook — simulates F5 / scope reset. */
export function clearDirectoryOrderFreeze(scope?: string): void {
  if (scope) frozenOrderByScope.delete(scope);
  else frozenOrderByScope.clear();
}

/** Join freeze-invalidating parts (sort/search/facet/period) into a stable key. */
export function buildDirectoryOrderFreezeKey(
  parts: ReadonlyArray<string | number | boolean | null | undefined>,
): string {
  return parts.map((part) => String(part ?? "")).join("::");
}

function sameDirectoryMembership(
  frozenIds: readonly string[],
  sortedIds: readonly string[],
): boolean {
  if (frozenIds.length !== sortedIds.length) return false;
  const frozen = new Set(frozenIds);
  for (const id of sortedIds) {
    if (!frozen.has(id)) return false;
  }
  return true;
}

/**
 * Reorder freshly-sorted rows back into the frozen slot order for `scope`, unless a
 * structural change occurred (no snapshot yet, freeze key changed, or membership
 * changed) — in which case the fresh sorted order is captured and returned as-is.
 */
export function applyDirectoryOrderFreeze<T>(
  sortedRows: readonly T[],
  freezeKey: string,
  scope: string,
  getId: (row: T) => string,
): T[] {
  const sortedIds = sortedRows.map(getId);
  const existing = frozenOrderByScope.get(scope);
  if (
    !existing ||
    existing.freezeKey !== freezeKey ||
    !sameDirectoryMembership(existing.orderIds, sortedIds)
  ) {
    frozenOrderByScope.set(scope, { freezeKey, orderIds: sortedIds });
    return [...sortedRows];
  }

  const byId = new Map(sortedRows.map((row) => [getId(row), row]));
  const next: T[] = [];
  for (const id of existing.orderIds) {
    const row = byId.get(id);
    if (row !== undefined) next.push(row);
  }
  return next;
}
