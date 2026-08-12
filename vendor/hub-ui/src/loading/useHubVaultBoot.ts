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
  /**
   * Drop the loaded dataset after the tab has been hidden this long, and boot again when it
   * comes back. Same-origin tabs share one renderer memory ceiling, so a tab nobody is looking
   * at should not be holding a full vault against that ceiling. 0 disables.
   */
  releaseWhenHiddenMs?: number;
  /** Called when the hidden-release fires — the tool drops its own copy of the dataset. */
  onRelease?: () => void;
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
  releaseWhenHiddenMs = 0,
  onRelease,
}: HubVaultBootOptions<T>) {
  /**
   * `readFast()` is a whole-dataset read: on P0020 it maps ~19.5k vault rows, ~490ms per
   * call in dev. It used to run once in this initializer and again in the effect below, so
   * every screen mount paid for it twice — synchronously, while React was building the tree.
   * Read once per mount and hand the same result to the effect.
   */
  const firstFastRef = useRef<T[] | null>(null);
  const readFirstFast = (): T[] => {
    if (firstFastRef.current === null) firstFastRef.current = readFast();
    return firstFastRef.current;
  };
  /**
   * A hidden tab must not load the vault.
   *
   * Chrome puts same-origin tabs in ONE renderer process, sharing one memory ceiling. A user
   * with six Data Box tabs open therefore had six full vaults in a single process — and on
   * browser restart all six restored at once, each doing this whole-dataset read synchronously
   * during render. That is the "Page Unresponsive" dialog on startup: not one slow vault, six
   * of them in the same process at the same moment.
   *
   * Nobody is looking at a hidden tab, so it loads nothing until it is shown. Every measurement
   * that said this screen was fast was taken on a single visible tab, which is the one case
   * that was never the problem.
   */
  const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
  const [bootReady, setBootReady] = useState(() => {
    if (typeof window === "undefined") return false;
    if (isHidden()) return false;
    return !needsBootGate(readFirstFast());
  });
  /** True only after hydrate finished or boot timeout — never set on start (avoids stuck gate). */
  const settledRef = useRef(false);
  const [vaultHydrating, setVaultHydrating] = useState(false);
  /** Bumped when a deferred (hidden) tab becomes visible, so the boot effect re-runs. */
  const [visibleTick, setVisibleTick] = useState(0);

  useEffect(() => {
    if (!tabActive) {
      setVaultHydrating(false);
      return;
    }
    if (once && settledRef.current) return;

    // Defer the whole boot until this tab is actually shown. Re-runs on the visibility event.
    if (isHidden()) {
      setVaultHydrating(false);
      const onVisible = () => {
        if (isHidden()) return;
        document.removeEventListener("visibilitychange", onVisible);
        // Re-read: a peer tab may have written the vault while this one waited.
        firstFastRef.current = null;
        setVisibleTick((tick) => tick + 1);
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        document.removeEventListener("visibilitychange", onVisible);
      };
    }

    let cancelled = false;
    // Reuse the mount read; later activations (tabActive toggles) must see fresh data.
    const fast = firstFastRef.current ?? readFast();
    firstFastRef.current = null;
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
  }, once ? [tabActive, visibleTick] : [tabActive, visibleTick, readFast, needsBootGate, onFastPaint, hydrate, onHydrated, bootTimeoutMs]);


  /**
   * Release the dataset while the tab sits in the background.
   *
   * Deferring the boot of a hidden tab only helps tabs that were never opened. A tab you used
   * and then switched away from keeps its whole vault resident, and with several same-origin
   * tabs sharing one renderer ceiling that is what fills the process. IndexedDB already holds
   * the authority, so a background tab can drop its copy and boot again on return.
   */
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;
  useEffect(() => {
    if (releaseWhenHiddenMs <= 0 || typeof document === "undefined") return;
    let timer = 0;
    const clear = () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
    };
    const onChange = () => {
      clear();
      if (!isHidden()) return;
      timer = window.setTimeout(() => {
        // Re-check: the tab may have come back while the timer was pending.
        if (!isHidden()) return;
        onReleaseRef.current?.();
        firstFastRef.current = null;
        settledRef.current = false;
        setBootReady(false);
        setVaultHydrating(false);
      }, releaseWhenHiddenMs);
    };
    document.addEventListener("visibilitychange", onChange);
    onChange();
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onChange);
    };
  }, [releaseWhenHiddenMs]);

  // Safety: never leave DirectoryBootGate spinning — armed whenever !bootReady && tabActive.
  useEffect(() => {
    // Not while hidden: this timer exists so a user staring at a spinner never waits forever.
    // In a deferred background tab it would just force-open the gate nobody is looking at.
    if (!tabActive || bootReady || bootTimeoutMs <= 0 || isHidden()) return;
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
