import { useCallback, useMemo } from "react";
import type { KpiTileData } from "@tool-workspace/hub-ui";
import { useHostHeaderStats } from "../../hooks/useHostHeaderStats";
import { defaultsForPrefItems, isHubPrefVisible } from "../../lib/display-pref-helpers";
import { PROFILES_DISPLAY_PREFS } from "../../lib/display-prefs-registry";
import { useStealthHubListPrefs } from "../../lib/useStealthHubListPrefs";
import type { ProfileCatalogStats, ProfileRow } from "../../types";
import {
  catalogStatsToKpiNumbers,
} from "./profile-catalog-stats-patch";
import {
  buildProfileKpiItems,
  buildProfileKpiNumbers,
  type ProfileKpiNumbers,
} from "./profile-kpi-items";
import { withProfileKpiFilterClicks } from "./profile-kpi-filter";

function resolveCatalogKpiNumbers(
  catalogStats: ProfileCatalogStats | null,
  profiles: ProfileRow[],
  runningHeadlessCount = 0,
): ProfileKpiNumbers {
  if (catalogStats) return catalogStatsToKpiNumbers(catalogStats, runningHeadlessCount);
  return buildProfileKpiNumbers(profiles, runningHeadlessCount);
}

/** KPI strip + header stats wired to URL display prefs (P0004 Users parity). */
export function useProfilesDirectoryChrome(
  catalogStats: ProfileCatalogStats | null,
  profiles: ProfileRow[],
  filter: {
    groupIds: string[];
    statuses: ProfileRow["status"][];
    setGroupIds: (values: string[]) => void;
    setStatuses: (values: ProfileRow["status"][]) => void;
    setSearch?: (value: string) => void;
    runningHeadlessCount?: number;
  },
) {
  const { groupIds, statuses, setGroupIds, setStatuses, setSearch, runningHeadlessCount = 0 } = filter;
  const hubPrefs = useStealthHubListPrefs();
  const centerStats = useHostHeaderStats(hubPrefs.headerStats);
  const applyKpiFilter = useCallback(
    (next: { groupIds: string[]; statuses: ProfileRow["status"][] }) => {
      setGroupIds(next.groupIds);
      setStatuses(next.statuses);
    },
    [setGroupIds, setStatuses],
  );

  const catalogKpis = useMemo(
    () => resolveCatalogKpiNumbers(catalogStats, profiles, runningHeadlessCount),
    [catalogStats, profiles, runningHeadlessCount],
  );

  const kpiNumbers = catalogKpis;

  const kpiDefaults = useMemo(
    () => defaultsForPrefItems(PROFILES_DISPLAY_PREFS.kpis, PROFILES_DISPLAY_PREFS.defaultKpiKeys),
    [],
  );

  const kpis = useMemo<KpiTileData[]>(
    () =>
      withProfileKpiFilterClicks(
        buildProfileKpiItems(kpiNumbers, catalogStats)
          .filter((item) => !item.prefKey || isHubPrefVisible(hubPrefs.kpi, kpiDefaults, item.prefKey))
          .map((item) => {
            if (!setSearch || (item.prefKey !== "headless" && item.prefKey !== "ready")) {
              return item;
            }
            return {
              ...item,
              onHintLineAction: (codesQuery: string) => {
                const trimmed = codesQuery.trim();
                if (!trimmed) return;
                setSearch(trimmed);
                setStatuses(item.prefKey === "headless" ? ["headless"] : ["waiting"]);
              },
            };
          }),
        groupIds,
        statuses,
        applyKpiFilter,
      ),
    [applyKpiFilter, catalogStats, groupIds, statuses, kpiNumbers, hubPrefs.kpi, kpiDefaults, setSearch, setStatuses],
  );

  return { kpis, centerStats };
}
