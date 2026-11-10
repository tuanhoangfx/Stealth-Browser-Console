import type { FilterDef } from "@tool-workspace/hub-ui";
import { STEALTH_PROFILE_COLUMN_STICKER } from "../../lib/stealth-column-stickers";
import type { ProfileCatalogStats, ProfileProxyFilterMode, ProfileRow, StealthGroup } from "../../types";

export const PROFILE_STATUS_FILTER_OPTIONS = [
  { value: "closed", label: "Ready", emoji: "✅" },
  { value: "opening", label: "Opening", emoji: "⏳" },
  { value: "running", label: "Running", emoji: "▶️" },
  { value: "headless", label: "Headless", emoji: "👻" },
  { value: "waiting", label: "Waiting", emoji: "⏳" },
  { value: "failed", label: "Failed", emoji: "⚠️" },
] as const;

/** Proxy filter options — Static IP placed at the bottom as a secondary attribute. */
export const PROFILE_PROXY_FILTER_OPTIONS = [
  { value: "local", label: "Local IP", emoji: "📍" },
  { value: "vpn", label: "Country VPN", emoji: "🌐" },
  { value: "auto_vpn", label: "Auto VPN", emoji: "⚡" },
  { value: "custom", label: "Custom Proxy", emoji: "🛡️" },
  { value: "static", label: "Static IP", emoji: "📌" },
] as const satisfies readonly { value: ProfileProxyFilterMode; label: string; emoji: string }[];

export function matchesProfileProxyFilterMode(
  profile: Pick<ProfileRow, "proxy" | "staticIp" | "note" | "status" | "activeVpnCountry">,
  mode: ProfileProxyFilterMode,
): boolean {
  const proxyStr = String(profile.proxy || "").trim();
  const isPinned =
    Boolean(profile.staticIp) || /\[(?:pin-proxy|static-ip)\]/i.test(String(profile.note || ""));
  switch (mode) {
    case "local":
      return proxyStr.length === 0;
    case "vpn":
      return /^vpn:\/\//i.test(proxyStr);
    case "auto_vpn":
      return (
        Boolean(profile.activeVpnCountry) ||
        ((profile.status === "running" || profile.status === "opening") && !proxyStr && !isPinned)
      );
    case "custom":
      return proxyStr.length > 0 && !/^vpn:\/\//i.test(proxyStr);
    case "static":
      return isPinned;
    default:
      return false;
  }
}

export function buildProfileFilters(groups: StealthGroup[], profiles: ProfileRow[]): FilterDef[] {
  const groupCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const proxyCounts = new Map<string, number>();

  for (const profile of profiles) {
    const groupKey = String(profile.groupId ?? "");
    if (groupKey) groupCounts.set(groupKey, (groupCounts.get(groupKey) ?? 0) + 1);
    statusCounts.set(profile.status, (statusCounts.get(profile.status) ?? 0) + 1);
    for (const opt of PROFILE_PROXY_FILTER_OPTIONS) {
      if (matchesProfileProxyFilterMode(profile, opt.value)) {
        proxyCounts.set(opt.value, (proxyCounts.get(opt.value) ?? 0) + 1);
      }
    }
  }

  return [
    {
      key: "group",
      label: "Group",
      showAllLabel: false,
      totalCount: profiles.length,
      options: groups.map((group) => ({
        value: String(group.id),
        label: group.name || String(group.id),
        emoji: STEALTH_PROFILE_COLUMN_STICKER.group,
        count: groupCounts.get(String(group.id)) ?? 0,
      })),
    },
    {
      key: "status",
      label: "Status",
      showAllLabel: false,
      totalCount: profiles.length,
      options: PROFILE_STATUS_FILTER_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        emoji: option.emoji,
        count: statusCounts.get(option.value) ?? 0,
      })),
    },
    {
      key: "proxy",
      label: "Proxy",
      showAllLabel: false,
      totalCount: profiles.length,
      options: PROFILE_PROXY_FILTER_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        emoji: option.emoji,
        count: proxyCounts.get(option.value) ?? 0,
      })),
    },
  ];
}

/** SQL-backed facet counts — O(groups) instead of scanning 10k+ lite rows. */
export function buildProfileFiltersFromStats(
  groups: StealthGroup[],
  stats: ProfileCatalogStats,
  runningHeadlessCount = 0,
): FilterDef[] {
  const headedRunning =
    stats.headedRunning !== undefined
      ? Math.max(0, stats.headedRunning)
      : Math.max(0, stats.running - runningHeadlessCount);
  return [
    {
      key: "group",
      label: "Group",
      showAllLabel: false,
      totalCount: stats.total,
      options: groups.map((group) => ({
        value: String(group.id),
        label: group.name || String(group.id),
        emoji: STEALTH_PROFILE_COLUMN_STICKER.group,
        count: stats.groupCounts[String(group.id)] ?? 0,
      })),
    },
    {
      key: "status",
      label: "Status",
      showAllLabel: false,
      totalCount: stats.total,
      options: PROFILE_STATUS_FILTER_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        emoji: option.emoji,
        count:
          option.value === "closed"
            ? stats.closed
            : option.value === "opening"
              ? stats.opening
              : option.value === "running"
                ? headedRunning
                : option.value === "headless"
                  ? runningHeadlessCount
                  : option.value === "waiting"
                    ? (stats.deferred ?? 0)
                    : stats.failed,
      })),
    },
    {
      key: "proxy",
      label: "Proxy",
      showAllLabel: false,
      totalCount: stats.total,
      options: PROFILE_PROXY_FILTER_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        emoji: option.emoji,
        count: stats.proxyCounts?.[option.value] ?? 0,
      })),
    },
  ];
}

export function profileFilterValuesToState(values: Record<string, string[]>) {
  return {
    groupIds: values.group ?? [],
    statuses: (values.status ?? []) as ProfileRow["status"][],
    proxyModes: (values.proxy ?? []) as ProfileProxyFilterMode[],
  };
}

export function profileStateToFilterValues(
  groupIds: string[],
  statuses: ProfileRow["status"][],
  proxyModes: ProfileProxyFilterMode[] = [],
) {
  return {
    group: groupIds,
    status: statuses,
    proxy: proxyModes,
  };
}
