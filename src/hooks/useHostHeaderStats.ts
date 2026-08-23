import { useEffect, useMemo, useState } from "react";
import type { TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { defaultsForPrefItems } from "../lib/display-pref-helpers";
import { PROFILES_DISPLAY_PREFS } from "../lib/display-prefs-registry";
import {
  buildHostHeaderStats,
  HOST_HEADER_WIDE_MQ,
  resolveHostHeaderVisibleKeys,
} from "../lib/host-header-metrics";
import { useHostMetrics } from "./useHostMetrics";

/** Matches hub-ui `.app-tab-header` 3-column layout (`min-width: 1101px`). */
export function useHeaderWide(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(HOST_HEADER_WIDE_MQ).matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia(HOST_HEADER_WIDE_MQ);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return wide;
}

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
