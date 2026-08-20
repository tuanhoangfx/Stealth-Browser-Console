import { useCallback, useMemo } from "react";
import type { KpiTileData } from "@tool-workspace/hub-ui";
import { defaultsForPrefItems, isHubPrefVisible } from "../../../lib/display-pref-helpers";
import { SYSTEM_BACKUP_DISPLAY_PREFS } from "../../../lib/display-prefs-registry";
import { useStealthSystemTabDisplayPrefs } from "../../../lib/useStealthSystemTabDisplayPrefs";
import { useStealthHubListPrefs } from "../../../lib/useStealthHubListPrefs";
import type { ProfileCatalogStats, ProfileRow } from "../../../types";
import { catalogStatsToKpiNumbers } from "../../profiles/profile-catalog-stats-patch";
import { buildProfileHeaderStats } from "../../profiles/profile-header-metrics";
import { withProfileHeaderStatFilterClicks, withProfileKpiFilterClicks } from "../../profiles/profile-kpi-filter";
import { buildProfileKpiItems, buildProfileKpiNumbers } from "../../profiles/profile-kpi-items";

function resolveCatalogKpiNumbers(catalogStats: ProfileCatalogStats | null, profiles: ProfileRow[]) {
  if (catalogStats) return catalogStatsToKpiNumbers(catalogStats);
  return buildProfileKpiNumbers(profiles);
}

/** System → Backup KPI strip + header stats (sub-tab display prefs, default off). */
export function useSystemBackupDirectoryChrome(
  catalogStats: ProfileCatalogStats | null,
  profiles: ProfileRow[],
  filter: {
    groupIds: string[];
    statuses: ProfileRow["status"][];
    setGroupIds: (values: string[]) => void;
    setStatuses: (values: ProfileRow["status"][]) => void;
  },
) {
  const { groupIds, statuses, setGroupIds, setStatuses } = filter;
  const tabDisplay = useStealthSystemTabDisplayPrefs("backup");
  const hubPrefs = useStealthHubListPrefs();
  const applyKpiFilter = useCallback(
    (next: { groupIds: string[]; statuses: ProfileRow["status"][] }) => {
      setGroupIds(next.groupIds);
      setStatuses(next.statuses);
    },
    [setGroupIds, setStatuses],
  );
  const catalogKpis = useMemo(
    () => resolveCatalogKpiNumbers(catalogStats, profiles),
    [catalogStats, profiles],
  );

  const kpiDefaults = useMemo(
    () =>
      defaultsForPrefItems(
        SYSTEM_BACKUP_DISPLAY_PREFS.kpis,
        SYSTEM_BACKUP_DISPLAY_PREFS.defaultKpiKeys,
      ),
    [],
  );

  const kpis = useMemo<KpiTileData[]>(
    () =>
      withProfileKpiFilterClicks(
        buildProfileKpiItems(catalogKpis).filter(
          (item) => !item.prefKey || isHubPrefVisible(tabDisplay?.kpi ?? null, kpiDefaults, item.prefKey),
        ),
        groupIds,
        statuses,
        applyKpiFilter,
      ),
    [applyKpiFilter, catalogKpis, groupIds, kpiDefaults, statuses, tabDisplay?.kpi],
  );

  const headerStatDefaults = useMemo(
    () =>
      defaultsForPrefItems(
        SYSTEM_BACKUP_DISPLAY_PREFS.headerStats,
        SYSTEM_BACKUP_DISPLAY_PREFS.defaultHeaderStatKeys,
      ),
    [],
  );

  const centerStats = useMemo(() => {
    const visibleKeys = new Set(
      SYSTEM_BACKUP_DISPLAY_PREFS.headerStats
        .filter((item) => isHubPrefVisible(hubPrefs.systemHeaderStats, headerStatDefaults, item.key))
        .map((item) => item.key),
    );
    return withProfileHeaderStatFilterClicks(
      buildProfileHeaderStats(visibleKeys, catalogKpis),
      groupIds,
      statuses,
      applyKpiFilter,
    );
  }, [applyKpiFilter, catalogKpis, groupIds, headerStatDefaults, hubPrefs.systemHeaderStats, statuses]);

  return { kpis, centerStats };
}
