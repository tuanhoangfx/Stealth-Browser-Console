import { useMemo } from "react";
import type { KpiTileData } from "@tool-workspace/hub-ui";
import { defaultsForPrefItems, isHubPrefVisible } from "../../../lib/display-pref-helpers";
import { SYSTEM_BACKUP_DISPLAY_PREFS } from "../../../lib/display-prefs-registry";
import { useStealthSystemTabDisplayPrefs } from "../../../lib/useStealthSystemTabDisplayPrefs";
import { useStealthHubListPrefs } from "../../../lib/useStealthHubListPrefs";
import type { ProfileCatalogStats, ProfileRow } from "../../../types";
import { catalogStatsToKpiNumbers } from "../../profiles/profile-catalog-stats-patch";
import { buildProfileHeaderStats } from "../../profiles/profile-header-metrics";
import { buildProfileKpiItems, buildProfileKpiNumbers } from "../../profiles/profile-kpi-items";

function resolveCatalogKpiNumbers(catalogStats: ProfileCatalogStats | null, profiles: ProfileRow[]) {
  if (catalogStats) return catalogStatsToKpiNumbers(catalogStats);
  return buildProfileKpiNumbers(profiles);
}

/** System → Backup KPI strip + header stats (sub-tab display prefs, default off). */
export function useSystemBackupDirectoryChrome(
  catalogStats: ProfileCatalogStats | null,
  profiles: ProfileRow[],
) {
  const tabDisplay = useStealthSystemTabDisplayPrefs("backup");
  const hubPrefs = useStealthHubListPrefs();
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
      buildProfileKpiItems(catalogKpis).filter(
        (item) => !item.prefKey || isHubPrefVisible(tabDisplay?.kpi ?? null, kpiDefaults, item.prefKey),
      ),
    [catalogKpis, kpiDefaults, tabDisplay?.kpi],
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
    return buildProfileHeaderStats(visibleKeys, catalogKpis);
  }, [catalogKpis, headerStatDefaults, hubPrefs.systemHeaderStats]);

  return { kpis, centerStats };
}
