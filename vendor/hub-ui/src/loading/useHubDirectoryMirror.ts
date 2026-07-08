import { useCallback, useEffect, useRef, useState } from "react";
import { useHubDirectoryBoot } from "./useHubDirectoryBoot";

export type DirectoryFetchOptions = {
  silent?: boolean;
};

export type HubDirectoryMirrorOptions<T> = {
  readMirror: () => T[];
  mirrorChangeEvent: string;
  fetchDirectory: (opts?: DirectoryFetchOptions) => Promise<T[]>;
  tabActive: boolean;
  registerRefresh: (listener: () => void | Promise<void>) => () => void;
  setLastError?: (message: string | null) => void;
  onRowsLoaded?: (rows: T[]) => void;
  ensureSync?: () => () => void;
  mapMirror?: (rows: T[]) => T[];
  revalidateCooldownMs?: number;
};

const DEFAULT_REVALIDATE_COOLDOWN_MS = 30_000;

/**
 * Remote directory mirror boot — P0020 Mail perf parity for Supabase directories.
 * Cache-first paint → boot gate on cold miss → silent revalidate.
 */
export function useHubDirectoryMirror<T>({
  readMirror,
  mirrorChangeEvent,
  fetchDirectory,
  tabActive,
  registerRefresh,
  setLastError,
  onRowsLoaded,
  ensureSync,
  mapMirror,
  revalidateCooldownMs = DEFAULT_REVALIDATE_COOLDOWN_MS,
}: HubDirectoryMirrorOptions<T>) {
  const readMirrorRef = useRef(readMirror);
  readMirrorRef.current = readMirror;

  const normalize = useCallback(
    (rows: T[]) => (mapMirror ? mapMirror(rows) : rows),
    [mapMirror],
  );

  const initialMirror = normalize(readMirror());
  const [rows, setRows] = useState<T[]>(initialMirror);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const [loading, setLoading] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const revalidatingRef = useRef(false);
  revalidatingRef.current = revalidating;
  const [fetchSettled, setFetchSettled] = useState(() => readMirror().length > 0);
  const { directoryBootReady, settleBoot, beginBootGate, bootedRef } = useHubDirectoryBoot({
    initialReady: initialMirror.length > 0,
  });
  const bootSyncDoneRef = useRef(false);
  const lastFetchAtRef = useRef(0);

  const applyRows = useCallback(
    (next: T[]) => {
      if (revalidatingRef.current && next.length > 0 && next.length < rowsRef.current.length) return;
      rowsRef.current = next;
      setRows(next);
      onRowsLoaded?.(next);
      if (next.length > 0) settleBoot();
    },
    [onRowsLoaded, settleBoot],
  );

  const syncFromMirror = useCallback(() => {
    const next = normalize(readMirrorRef.current());
    if (next.length === 0 && rowsRef.current.length > 0) return;
    // Keep stale full cache visible during silent revalidate (progressive mirror warm parity).
    if (revalidatingRef.current && next.length > 0 && next.length < rowsRef.current.length) return;
    applyRows(next);
  }, [applyRows, normalize]);

  const load = useCallback(
    async (opts?: DirectoryFetchOptions) => {
      const silent = opts?.silent ?? false;
      const mirrorCount = readMirrorRef.current().length;
      const needsGate = !silent && mirrorCount === 0 && !bootedRef.current;

      if (silent) {
        setRevalidating(true);
      } else {
        setLoading(true);
        if (needsGate) beginBootGate();
      }

      setLastError?.(null);
      try {
        const next = normalize(await fetchDirectory(opts));
        applyRows(next);
        lastFetchAtRef.current = Date.now();
        setFetchSettled(true);
      } catch (error) {
        setFetchSettled(true);
        if (!silent) {
          setLastError?.(error instanceof Error ? error.message : "Failed to load directory");
          applyRows([]);
        }
      } finally {
        if (silent) {
          setRevalidating(false);
        } else {
          setLoading(false);
        }
        settleBoot();
      }
    },
    [applyRows, beginBootGate, bootedRef, fetchDirectory, normalize, setLastError, settleBoot],
  );

  const reload = useCallback(() => load(), [load]);
  const revalidateSilent = useCallback(() => load({ silent: true }), [load]);

  useEffect(() => {
    syncFromMirror();

    const onMirror = () => syncFromMirror();
    window.addEventListener(mirrorChangeEvent, onMirror);
    const unreg = registerRefresh(reload);
    const releaseSync = ensureSync?.();

    return () => {
      releaseSync?.();
      window.removeEventListener(mirrorChangeEvent, onMirror);
      unreg();
    };
  }, [ensureSync, mirrorChangeEvent, registerRefresh, reload, syncFromMirror]);

  useEffect(() => {
    if (!tabActive) return;

    syncFromMirror();

    const hasCache = readMirrorRef.current().length > 0 || rowsRef.current.length > 0 || bootedRef.current;
    const stale = Date.now() - lastFetchAtRef.current > revalidateCooldownMs;

    if (hasCache) {
      if (stale) void load({ silent: true });
      return;
    }

    if (!bootSyncDoneRef.current) {
      bootSyncDoneRef.current = true;
      void load({ silent: false });
      return;
    }

    if (stale) void load({ silent: true });
  }, [bootedRef, load, revalidateCooldownMs, syncFromMirror, tabActive]);

  return {
    rows,
    loading,
    revalidating,
    fetchSettled,
    refreshing: (loading || revalidating) && rows.length > 0,
    directoryBootReady,
    reload,
    revalidateSilent,
  };
}
