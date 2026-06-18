import type { FilterDef } from "@tool-workspace/hub-ui";
import type { ProfileCatalogStats, ProfileRow, StealthGroup } from "../../types";

export const PROFILE_STATUS_FILTER_OPTIONS = [
  { value: "closed", label: "Ready" },
  { value: "opening", label: "Opening" },
  { value: "running", label: "Running" },
  { value: "failed", label: "Failed" }
] as const;

export function buildProfileFilters(groups: StealthGroup[], profiles: ProfileRow[]): FilterDef[] {
  const groupCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();

  for (const profile of profiles) {
    const groupKey = String(profile.groupId ?? "");
    if (groupKey) groupCounts.set(groupKey, (groupCounts.get(groupKey) ?? 0) + 1);
    statusCounts.set(profile.status, (statusCounts.get(profile.status) ?? 0) + 1);
  }

  return [
    {
      key: "group",
      label: "Group",
      showAllLabel: true,
      totalCount: profiles.length,
      options: groups.map((group) => ({
        value: String(group.id),
        label: group.name || String(group.id),
        count: groupCounts.get(String(group.id)) ?? 0
      }))
    },
    {
      key: "status",
      label: "Status",
      showAllLabel: true,
      totalCount: profiles.length,
      options: PROFILE_STATUS_FILTER_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        count: statusCounts.get(option.value) ?? 0
      }))
    }
  ];
}

/** SQL-backed facet counts — O(groups) instead of scanning 10k+ lite rows. */
export function buildProfileFiltersFromStats(groups: StealthGroup[], stats: ProfileCatalogStats): FilterDef[] {
  return [
    {
      key: "group",
      label: "Group",
      showAllLabel: true,
      totalCount: stats.total,
      options: groups.map((group) => ({
        value: String(group.id),
        label: group.name || String(group.id),
        count: stats.groupCounts[String(group.id)] ?? 0,
      })),
    },
    {
      key: "status",
      label: "Status",
      showAllLabel: true,
      totalCount: stats.total,
      options: PROFILE_STATUS_FILTER_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        count:
          option.value === "closed"
            ? stats.closed
            : option.value === "opening"
              ? stats.opening
              : option.value === "running"
                ? stats.running
                : stats.failed,
      })),
    },
  ];
}

export function profileFilterValuesToState(values: Record<string, string[]>) {
  return {
    groupIds: values.group ?? [],
    statuses: (values.status ?? []) as ProfileRow["status"][]
  };
}

export function profileStateToFilterValues(groupIds: string[], statuses: ProfileRow["status"][]) {
  return {
    group: groupIds,
    status: statuses
  };
}
