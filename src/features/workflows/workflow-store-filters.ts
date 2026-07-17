import type { FilterDef } from "@tool-workspace/hub-ui";
import { matchesDirectoryTimeRange, resolveHubBrandIconByMatch, type TimeRange } from "@tool-workspace/hub-ui";
import { resolveHubBrandAssetSrc } from "../../lib/hub-brand-asset-src";
import type { WorkflowStoreEntry } from "./workflow-store-types";

function platformFilterOption(value: string, count: number) {
  const brand = resolveHubBrandIconByMatch(value);
  return {
    value,
    label: value,
    count,
    ...(brand ? { iconSrc: resolveHubBrandAssetSrc(brand.src), iconShell: brand.shell } : {}),
  };
}

export function buildWorkflowStoreFilters(entries: WorkflowStoreEntry[]): FilterDef[] {
  const groupCounts = new Map<string, number>();
  const platformCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();

  for (const entry of entries) {
    groupCounts.set(entry.group, (groupCounts.get(entry.group) ?? 0) + 1);
    platformCounts.set(entry.platform, (platformCounts.get(entry.platform) ?? 0) + 1);
    sourceCounts.set(entry.source, (sourceCounts.get(entry.source) ?? 0) + 1);
  }

  return [
    {
      key: "group",
      label: "Group",
      showAllLabel: true,
      totalCount: entries.length,
      options: [...groupCounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, count]) => ({ value, label: value, count })),
    },
    {
      key: "platform",
      label: "Platform",
      showAllLabel: true,
      totalCount: entries.length,
      options: [...platformCounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, count]) => platformFilterOption(value, count)),
    },
    {
      key: "source",
      label: "Source",
      showAllLabel: true,
      totalCount: entries.length,
      options: [...sourceCounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, count]) => ({ value, label: value, count })),
    },
  ];
}

export function workflowStoreFilterValuesToState(values: Record<string, string[]>) {
  return {
    groupIds: values.group ?? [],
    platformIds: values.platform ?? [],
    sourceIds: values.source ?? [],
  };
}

export function workflowStoreStateToFilterValues(groupIds: string[], platformIds: string[], sourceIds: string[]) {
  return {
    group: groupIds,
    platform: platformIds,
    source: sourceIds,
  };
}

export function filterWorkflowStoreEntries(
  entries: WorkflowStoreEntry[],
  search: string,
  groupIds: string[],
  platformIds: string[],
  sourceIds: string[],
  timeRange: TimeRange,
): WorkflowStoreEntry[] {
  const query = search.trim().toLowerCase();
  return entries.filter((entry) => {
    if (groupIds.length > 0 && !groupIds.includes(entry.group)) return false;
    if (platformIds.length > 0 && !platformIds.includes(entry.platform)) return false;
    if (sourceIds.length > 0 && !sourceIds.includes(entry.source)) return false;
    if (!matchesDirectoryTimeRange(entry.createdAt, timeRange, { staticAlwaysVisible: true })) return false;
    if (!query) return true;
    return [entry.id, entry.name, entry.description, entry.platform, entry.group, entry.version]
      .some((value) => String(value).toLowerCase().includes(query));
  });
}
