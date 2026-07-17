import { useEffect, useState } from "react";

/**
 * Visited-tab perf SSOT — after `tabActive` flips true, keep the first paint light
 * (table / shell only) and enable expensive facet counts + KPI/charts on the next frames.
 * Golden: P0020 large-vault facet defer; P0005 Orders/Customers/Products.
 */
export function useHubDirectoryChromeReady(tabActive: boolean): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tabActive) {
      setReady(false);
      return;
    }
    let cancelled = false;
    const outer = window.requestAnimationFrame(() => {
      const inner = window.requestAnimationFrame(() => {
        if (!cancelled) setReady(true);
      });
      if (cancelled) window.cancelAnimationFrame(inner);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(outer);
    };
  }, [tabActive]);

  return tabActive && ready;
}
