import { useEffect, useRef, useState } from "react";

type CacheBucket = Map<string, unknown>;

/** Session cache — survives tab hide / remount (directory chrome stale-first). */
const caches = new Map<string, CacheBucket>();

function getBucket(namespace: string): CacheBucket {
  let bucket = caches.get(namespace);
  if (!bucket) {
    bucket = new Map();
    caches.set(namespace, bucket);
  }
  return bucket;
}

/** Test / logout helper — clear one namespace or all. */
export function clearHubStaleIdleMemoCache(namespace?: string): void {
  if (namespace) caches.delete(namespace);
  else caches.clear();
}

/**
 * Stable fingerprint for Hub filter values (order-independent).
 * Use in `useHubStaleIdleMemo` keys with vaultScope + period + row revision.
 */
export function hubFilterValuesFingerprint(values: Record<string, unknown> | null | undefined): string {
  if (!values) return "";
  const keys = Object.keys(values).sort();
  return keys
    .map((key) => {
      const raw = values[key];
      if (Array.isArray(raw)) {
        return `${key}=${[...raw].map(String).sort().join(",")}`;
      }
      if (raw == null) return `${key}=`;
      return `${key}=${String(raw)}`;
    })
    .join("&");
}

type Scheduled =
  | { kind: "idle"; id: number }
  | { kind: "timeout"; id: number }
  | { kind: "raf"; outer: number; inner: number };

function scheduleAfterPaint(run: () => void): Scheduled {
  const handle: Scheduled = { kind: "raf", outer: 0, inner: 0 };
  handle.outer = window.requestAnimationFrame(() => {
    handle.inner = window.requestAnimationFrame(run);
  });
  return handle;
}

function scheduleIdle(run: () => void, timeoutMs = 500): Scheduled {
  if (typeof window.requestIdleCallback === "function") {
    return {
      kind: "idle",
      id: window.requestIdleCallback(() => run(), { timeout: timeoutMs }),
    };
  }
  return { kind: "timeout", id: window.setTimeout(run, 48) };
}

function cancelScheduled(handle: Scheduled | null): void {
  if (!handle) return;
  if (handle.kind === "idle") {
    if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(handle.id);
    return;
  }
  if (handle.kind === "timeout") {
    window.clearTimeout(handle.id);
    return;
  }
  window.cancelAnimationFrame(handle.outer);
  if (handle.inner) window.cancelAnimationFrame(handle.inner);
}

/**
 * Stale-first + idle recompute SSOT for expensive directory chrome (facet/KPI).
 *
 * | Case | Behavior |
 * |------|----------|
 * | Cache hit | Paint immediately; refresh via `requestIdleCallback` |
 * | Cache miss | Compute after rAF×2 (post first paint); store |
 * | Fingerprint change | Keep previous value until new compute finishes |
 *
 * Golden: P0020 large vault KPI band; reuse across P00xx directories.
 */
export function useHubStaleIdleMemo<T>(
  namespace: string,
  fingerprint: string,
  compute: () => T,
  enabled: boolean,
): T | undefined {
  const bucket = getBucket(namespace);
  const computeRef = useRef(compute);
  computeRef.current = compute;

  const [state, setState] = useState<{ fp: string; value: T } | undefined>(() => {
    if (!enabled || !fingerprint) return undefined;
    const hit = bucket.get(fingerprint) as T | undefined;
    return hit !== undefined ? { fp: fingerprint, value: hit } : undefined;
  });

  useEffect(() => {
    if (!enabled || !fingerprint) return;

    let cancelled = false;
    let handle: Scheduled | null = null;

    const apply = () => {
      if (cancelled) return;
      const next = computeRef.current();
      bucket.set(fingerprint, next);
      setState({ fp: fingerprint, value: next });
    };

    const hit = bucket.get(fingerprint) as T | undefined;
    if (hit !== undefined) {
      setState({ fp: fingerprint, value: hit });
      handle = scheduleIdle(apply);
      return () => {
        cancelled = true;
        cancelScheduled(handle);
      };
    }

    handle = scheduleAfterPaint(apply);
    return () => {
      cancelled = true;
      cancelScheduled(handle);
    };
  }, [bucket, enabled, fingerprint]);

  if (!enabled) return undefined;
  if (state?.fp === fingerprint) return state.value;
  const hit = bucket.get(fingerprint) as T | undefined;
  if (hit !== undefined) return hit;
  // Cross-fingerprint stale while new key computes
  return state?.value;
}
