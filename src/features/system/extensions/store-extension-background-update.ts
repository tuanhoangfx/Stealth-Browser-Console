import type { StoreExtensionUpdateCheck, StoreExtensionUpdateRow } from "../../../types";

export function availableStoreExtensionUpdateRows(
  check: StoreExtensionUpdateCheck | null | undefined,
): StoreExtensionUpdateRow[] {
  if (!check || check.checking) return [];
  return (check.results ?? []).filter((row) => row.available);
}

export type StoreExtensionBackgroundPlan =
  | { action: "ignore" }
  | { action: "done"; key: string }
  | { action: "update"; key: string; rows: StoreExtensionUpdateRow[] };

/** Decide whether a Store probe should start a silent cache download. Never opens a modal. */
export function planStoreExtensionBackgroundUpdate(
  check: StoreExtensionUpdateCheck,
  alreadyStartedKey: string | null,
): StoreExtensionBackgroundPlan {
  if (check.checking) return { action: "ignore" };
  const key = check.checkedAt || "done";
  if (alreadyStartedKey === key) return { action: "ignore" };
  const rows = availableStoreExtensionUpdateRows(check);
  if (!rows.length) return { action: "done", key };
  return { action: "update", key, rows };
}

export function formatStoreExtensionUpdateLine(row: StoreExtensionUpdateRow): string {
  return `${row.name || row.storeId} ${row.current || "?"} → ${row.latest}`;
}
