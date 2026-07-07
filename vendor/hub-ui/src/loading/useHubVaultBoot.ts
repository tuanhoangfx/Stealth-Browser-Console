import { useCallback, useEffect, useRef, useState } from "react";

export type HubVaultBootOptions<T> = {
  tabActive?: boolean;
  /** Hydrate boot runs once on mount (P0020 Mail vault). */
  once?: boolean;
  readFast: () => T[];
  needsBootGate: (fast: T[]) => boolean;
  onFastPaint: (fast: T[]) => void;
  hydrate: () => Promise<T[]>;
  onHydrated?: (hydrated: T[], current: T[]) => void;
};

/**
 * Local vault / IDB boot gate — P0020 Mail (twofa) golden.
 * Paint fast mirror first; gate only on mirror miss or large vault; hydrate async.
 */
export function useHubVaultBoot<T>({
  tabActive = true,
  once = false,
  readFast,
  needsBootGate,
  onFastPaint,
  hydrate,
  onHydrated,
}: HubVaultBootOptions<T>) {
  const [bootReady, setBootReady] = useState(() => {
    if (typeof window === "undefined") return false;
    return !needsBootGate(readFast());
  });

  useEffect(() => {
    if (!tabActive) return;
    let cancelled = false;
    const fast = readFast();
    onFastPaint(fast);
    const gate = needsBootGate(fast);
    setBootReady(!gate);

    void hydrate()
      .then((hydrated) => {
        if (cancelled || !hydrated.length) return;
        onHydrated?.(hydrated, fast);
      })
      .finally(() => {
        if (!cancelled && gate) setBootReady(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `once` = mount-only vault boot (P0020 Mail)
  }, once ? [] : [tabActive, readFast, needsBootGate, onFastPaint, hydrate, onHydrated]);

  return {
    bootReady,
    directoryBootReady: bootReady,
    vaultBootReady: bootReady,
  };
}
