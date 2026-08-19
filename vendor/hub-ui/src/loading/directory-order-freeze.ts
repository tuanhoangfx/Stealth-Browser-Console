/**
 * Directory order freeze — keep row slots stable after search/filter is applied.
 *
 * Recapture sorted order only when the freeze key changes (sort / search / facet /
 * period) or on F5 (module state). Membership add/delete does **not** reshuffle:
 * gone ids drop in place; new ids append in incoming sorted order.
 * In-session field edits (Own, Status, realtime) keep the same slots.
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

/**
 * Reorder freshly-sorted rows back into the frozen slot order for `scope`.
 * Freeze-key change (or first paint) captures the incoming sorted order.
 */
export function applyDirectoryOrderFreeze<T>(
  sortedRows: readonly T[],
  freezeKey: string,
  scope: string,
  getId: (row: T) => string,
): T[] {
  const existing = frozenOrderByScope.get(scope);
  if (!existing || existing.freezeKey !== freezeKey) {
    const orderIds = sortedRows.map(getId);
    frozenOrderByScope.set(scope, { freezeKey, orderIds });
    return [...sortedRows];
  }

  const byId = new Map(sortedRows.map((row) => [getId(row), row]));
  const next: T[] = [];
  const seen = new Set<string>();
  for (const id of existing.orderIds) {
    const row = byId.get(id);
    if (row === undefined) continue;
    next.push(row);
    seen.add(id);
  }
  for (const row of sortedRows) {
    const id = getId(row);
    if (seen.has(id)) continue;
    next.push(row);
    seen.add(id);
  }
  frozenOrderByScope.set(scope, { freezeKey, orderIds: next.map(getId) });
  return next;
}
