import type { KpiTileData } from "@tool-workspace/hub-ui";

const STORE_ACTIVITY_KEYS = new Set(["create_today", "update_today", "local", "installed", "available"]);

/** Toggle Store activity KPI. Selected is count-only. */
export function nextStoreActivityKey(prefKey: string, current: string | null): string | null | undefined {
  if (prefKey === "total") return current ? null : undefined;
  if (prefKey === "selected" || !STORE_ACTIVITY_KEYS.has(prefKey)) return undefined;
  return current === prefKey ? null : prefKey;
}

export function isStoreActivityActive(prefKey: string, current: string | null): boolean {
  if (prefKey === "total" || prefKey === "selected" || !prefKey) return false;
  return current === prefKey;
}

export function withStoreKpiFilterClicks(
  items: KpiTileData[],
  current: string | null,
  onApply: (next: string | null) => void,
): KpiTileData[] {
  return items.map((item) => {
    const key = item.prefKey;
    if (!key) return item;
    const next = nextStoreActivityKey(key, current);
    if (next === undefined) return item;
    return {
      ...item,
      active: isStoreActivityActive(key, current),
      onClick: () => onApply(next),
    };
  });
}
