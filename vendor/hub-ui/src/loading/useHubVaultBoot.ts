import { useEffect, useRef, useState } from "react";

export type HubVaultBootOptions<T> = {
  tabActive?: boolean;
  /** Hydrate boot runs once after first successful settle - P0020 Mail/Account vault. */
  once?: boolean;
  readFast: () => T[];
  needsBootGate: (fast: T[]) => boolean;
  onFastPaint: (fast: T[]) => void;
  hydrate: () => Promise<T[]>;
  onHydrated?: (hydrated: T[], current: T[]) => void;
  /** Force-ready if hydrate hangs (IDB stall). Default 2s. */
  bootTimeoutMs?: number;
};

/**
 * Local vault / IDB boot gate - P0020 Mail (twofa) golden.
 * Paint fast mirror first; gate only on mirror miss; hydrate async.
 * `once` marks settle only after success/timeout — cancelled runs may retry on next tabActive.
 * Independent safety timer: if bootReady stays false while tabActive, force ready (never infinite overlay).
 */
export function useHubVaultBoot<T>({
  tabActive = true,
  once = false,
  readFast,
  needsBootGate,
  onFastPaint,
  hydrate,
  onHydrated,
  bootTimeoutMs = 2_000,
}: HubVaultBootOptions<T>) {
  const [bootReady, setBootReady] = useState(() => {
    if (typeof window === "undefined") return false;
    return !needsBootGate(readFast());
  });
  /** True only after hydrate finished or boot timeout — never set on start (avoids stuck gate). */
  const settledRef = useRef(false);
  const [vaultHydrating, setVaultHydrating] = useState(false);

  useEffect(() => {
    if (!tabActive) {
      setVaultHydrating(false);
      return;
    }
    if (once && settledRef.current) return;

    let cancelled = false;
    const fast = readFast();
    onFastPaint(fast);
    const gate = needsBootGate(fast);
    setBootReady(!gate);
    setVaultHydrating(true);

    const markSettled = () => {
      if (cancelled) return;
      setBootReady(true);
      if (once) settledRef.current = true;
    };

    void hydrate()
      .then((hydrated) => {
        if (cancelled || !hydrated.length) return;
        onHydrated?.(hydrated, fast);
      })
      .finally(() => {
        if (!cancelled) setVaultHydrating(false);
        if (gate) markSettled();
        else if (once && !cancelled) settledRef.current = true;
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once retries only on tabActive until settled
  }, once ? [tabActive] : [tabActive, readFast, needsBootGate, onFastPaint, hydrate, onHydrated, bootTimeoutMs]);

  // Safety: never leave DirectoryBootGate spinning — armed whenever !bootReady && tabActive.
  useEffect(() => {
    if (!tabActive || bootReady || bootTimeoutMs <= 0) return;
    const timeoutId = window.setTimeout(() => {
      setBootReady(true);
      setVaultHydrating(false);
      if (once) settledRef.current = true;
    }, bootTimeoutMs);
    return () => window.clearTimeout(timeoutId);
  }, [tabActive, bootReady, bootTimeoutMs, once]);

  return {
    bootReady,
    directoryBootReady: bootReady,
    vaultBootReady: bootReady,
    vaultHydrating: tabActive && vaultHydrating,
  };
}
