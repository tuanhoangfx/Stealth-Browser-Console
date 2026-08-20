import {
  withPrefKeyHeaderStatClicks,
  type FilterValues,
  type KpiTileData,
  type TabHeaderStatItem,
} from "@tool-workspace/hub-ui";
import type { ProfileRow } from "../../types";
import { profileFilterValuesToState, profileStateToFilterValues } from "./profile-filters";

const KPI_STATUS: Record<string, string[]> = {
  running: ["running"],
  failed: ["failed"],
  ready: ["closed"],
};

function sameFilterValues(current: FilterValues, key: string, values: string[]): boolean {
  return JSON.stringify([...(current[key] ?? [])].sort()) === JSON.stringify([...values].sort());
}

function compactFilterValues(values: FilterValues): FilterValues {
  const next: FilterValues = {};
  for (const [key, list] of Object.entries(values)) {
    if (Array.isArray(list) && list.length) next[key] = list;
  }
  return next;
}

function hasActiveFilters(current: FilterValues): boolean {
  return Object.values(current).some((list) => Array.isArray(list) && list.length > 0);
}

/** Map Profile KPI prefKey → FilterBar patch (toggle clears when already active). */
export function profileKpiFilterPatch(prefKey: string, current: FilterValues): FilterValues | null {
  const compact = compactFilterValues(current);
  const setOrClear = (key: string, values: string[]): FilterValues => {
    if (sameFilterValues(compact, key, values)) {
      const next = { ...compact };
      delete next[key];
      return next;
    }
    return { ...compact, [key]: values };
  };

  switch (prefKey) {
    case "total":
      return hasActiveFilters(compact) ? {} : null;
    case "running":
    case "failed":
    case "ready":
      return setOrClear("status", KPI_STATUS[prefKey] ?? []);
    default:
      return null;
  }
}

/** True when the KPI's filter patch is currently active on the FilterBar. */
export function isProfileKpiFilterActive(prefKey: string, current: FilterValues): boolean {
  const probe = profileKpiFilterPatch(prefKey, {});
  if (!probe || !Object.keys(probe).length) return false;
  const compact = compactFilterValues(current);
  for (const [key, values] of Object.entries(probe)) {
    if (!sameFilterValues(compact, key, values as string[])) return false;
  }
  return true;
}

export function applyProfileKpiFilterPatch(
  prefKey: string,
  groupIds: string[],
  statuses: ProfileRow["status"][],
): { groupIds: string[]; statuses: ProfileRow["status"][] } | null {
  const next = profileKpiFilterPatch(prefKey, profileStateToFilterValues(groupIds, statuses));
  if (next == null) return null;
  return profileFilterValuesToState(next);
}

/** Header Running/Failed/Ready/Profiles — same map as KPI tiles. */
export function withProfileHeaderStatFilterClicks(
  stats: TabHeaderStatItem[],
  groupIds: string[],
  statuses: ProfileRow["status"][],
  onApply: (next: { groupIds: string[]; statuses: ProfileRow["status"][] }) => void,
): TabHeaderStatItem[] {
  const current = compactFilterValues(profileStateToFilterValues(groupIds, statuses));
  return withPrefKeyHeaderStatClicks(
    stats,
    (key) => isProfileKpiFilterActive(key, current),
    (key) => applyProfileKpiFilterPatch(key, groupIds, statuses),
    onApply,
  );
}

/** P0005 Orders KPI click SSOT — tile sets / toggles Status (Ready = closed). */
export function withProfileKpiFilterClicks(
  items: KpiTileData[],
  groupIds: string[],
  statuses: ProfileRow["status"][],
  onApply: (next: { groupIds: string[]; statuses: ProfileRow["status"][] }) => void,
): KpiTileData[] {
  const current = compactFilterValues(profileStateToFilterValues(groupIds, statuses));
  return items.map((item) => {
    const key = item.prefKey;
    if (!key) return item;
    return {
      ...item,
      active: isProfileKpiFilterActive(key, current),
      onClick: () => {
        const next = applyProfileKpiFilterPatch(key, groupIds, statuses);
        if (!next) return;
        onApply(next);
      },
    };
  });
}
