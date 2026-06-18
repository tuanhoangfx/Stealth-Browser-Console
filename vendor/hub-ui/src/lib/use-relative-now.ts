import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let sharedNow = Date.now();
let tickId: ReturnType<typeof setInterval> | null = null;

function ensureTick(intervalMs: number) {
  if (tickId != null) return;
  tickId = setInterval(() => {
    sharedNow = Date.now();
    for (const fn of listeners) fn();
  }, intervalMs);
}

function subscribe(intervalMs: number) {
  return (cb: () => void) => {
    listeners.add(cb);
    ensureTick(intervalMs);
    return () => {
      listeners.delete(cb);
    };
  };
}

function getSnapshot() {
  return sharedNow;
}

/** Shared 60s tick for relative timestamps — isolates re-renders to subscribing cells. */
export function useRelativeNow(intervalMs = 60_000): number {
  const sub = useCallback((cb: () => void) => subscribe(intervalMs)(cb), [intervalMs]);
  return useSyncExternalStore(sub, getSnapshot, getSnapshot);
}
