import { useEffect, useRef } from "react";

/** Heal KPI/catalog drift after alt-tab — cheap SQL aggregate, throttled. */
export const CATALOG_STATS_FOCUS_RECONCILE_MS = 30_000;

export function shouldReconcileCatalogStatsOnFocus(
  lastAtMs: number,
  nowMs: number,
  intervalMs = CATALOG_STATS_FOCUS_RECONCILE_MS,
): boolean {
  if (!Number.isFinite(lastAtMs) || lastAtMs <= 0) return true;
  return nowMs - lastAtMs >= intervalMs;
}

/** Refresh catalog stats when the Profiles window regains focus (debounced). */
export function useCatalogStatsFocusReconcile(refreshCatalogStats: () => Promise<void>) {
  const lastAtRef = useRef(0);

  useEffect(() => {
    const maybeReconcile = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (!shouldReconcileCatalogStatsOnFocus(lastAtRef.current, now)) return;
      lastAtRef.current = now;
      void refreshCatalogStats();
    };

    window.addEventListener("focus", maybeReconcile);
    document.addEventListener("visibilitychange", maybeReconcile);
    return () => {
      window.removeEventListener("focus", maybeReconcile);
      document.removeEventListener("visibilitychange", maybeReconcile);
    };
  }, [refreshCatalogStats]);
}
