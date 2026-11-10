import { useMemo } from "react";
import { useHeaderWide, type TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { defaultsForPrefItems } from "../lib/display-pref-helpers";
import { PROFILES_DISPLAY_PREFS } from "../lib/display-prefs-registry";
import { buildHostHeaderStats, resolveHostHeaderVisibleKeys } from "../lib/host-header-metrics";
import { useHostMetrics } from "./useHostMetrics";

export { useHeaderWide };

/** CPU / RAM header chips — Display prefs + wide/narrow RAM text. */
export function useHostHeaderStats(stored: Set<string> | null = null): TabHeaderStatItem[] {
  const metrics = useHostMetrics();
  const wide = useHeaderWide();
  const defaults = useMemo(
    () =>
      defaultsForPrefItems(
        PROFILES_DISPLAY_PREFS.headerStats,
        PROFILES_DISPLAY_PREFS.defaultHeaderStatKeys,
      ),
    [],
  );

  return useMemo(() => {
    const visibleKeys = resolveHostHeaderVisibleKeys(stored, defaults);
    return buildHostHeaderStats(visibleKeys, metrics, { wide });
  }, [defaults, metrics, stored, wide]);
}
