import { useMemo } from "react";
import type { KpiTileData } from "@tool-workspace/hub-ui";
import { defaultsForPrefItems, isHubPrefVisible } from "../../lib/display-pref-helpers";
import { PROFILES_DISPLAY_PREFS } from "../../lib/display-prefs-registry";
import { useStealthHubListPrefs } from "../../lib/useStealthHubListPrefs";
import type { ProfileCatalogStats, ProfileRow } from "../../types";
import {
  catalogStatsToKpiNumbers,
} from "./profile-catalog-stats-patch";
import { buildProfileHeaderStats } from "./profile-header-metrics";
import {
  buildProfileKpiItems,
  buildProfileKpiNumbers,
  type ProfileKpiNumbers,
} from "./profile-kpi-items";

function resolveCatalogKpiNumbers(
  catalogStats: ProfileCatalogStats | null,
  profiles: ProfileRow[],
): ProfileKpiNumbers {
  if (catalogStats) return catalogStatsToKpiNumbers(catalogStats);
  return buildProfileKpiNumbers(profiles);
}

/** KPI strip + header stats wired to URL display prefs (P0004 Users parity). */
export function useProfilesDirectoryChrome(
  catalogStats: ProfileCatalogStats | null,
  profiles: ProfileRow[],
) {
  const hubPrefs = useStealthHubListPrefs();

  const catalogKpis = useMemo(
    () => resolveCatalogKpiNumbers(catalogStats, profiles),
    [catalogStats, profiles],
  );

  const kpiNumbers = catalogKpis;

  const kpiDefaults = useMemo(
    () => defaultsForPrefItems(PROFILES_DISPLAY_PREFS.kpis, PROFILES_DISPLAY_PREFS.defaultKpiKeys),
    [],
  );

  const kpis = useMemo<KpiTileData[]>(
    () =>
      buildProfileKpiItems(kpiNumbers).filter(
        (item) => !item.prefKey || isHubPrefVisible(hubPrefs.kpi, kpiDefaults, item.prefKey),
      ),
    [kpiNumbers, hubPrefs.kpi, kpiDefaults],
  );

  const headerStatDefaults = useMemo(
    () =>
      defaultsForPrefItems(
        PROFILES_DISPLAY_PREFS.headerStats,
        PROFILES_DISPLAY_PREFS.defaultHeaderStatKeys,
      ),
    [],
  );

  const centerStats = useMemo(() => {
    const visibleKeys = new Set(
      PROFILES_DISPLAY_PREFS.headerStats
        .filter((item) => isHubPrefVisible(hubPrefs.headerStats, headerStatDefaults, item.key))
        .map((item) => item.key),
    );
    return buildProfileHeaderStats(visibleKeys, catalogKpis);
  }, [headerStatDefaults, hubPrefs.headerStats, catalogKpis]);

  return { kpis, centerStats };
}
