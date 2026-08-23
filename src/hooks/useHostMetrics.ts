import { useEffect, useState } from "react";
import { fetchHostMetrics } from "../api";
import type { HostMetrics } from "../types";

const POLL_MS = 2000;
const FIRST_CPU_RETRY_MS = 400;

type Listener = (metrics: HostMetrics | null) => void;

const listeners = new Set<Listener>();
let current: HostMetrics | null = null;
let intervalId = 0;
let retryId = 0;
let started = false;

async function tick() {
  try {
    current = await fetchHostMetrics();
  } catch {
    /* keep last good sample */
  }
  for (const listener of listeners) listener(current);
}

function startSharedPoll() {
  if (started) return;
  started = true;
  void tick();
  retryId = window.setTimeout(() => {
    void tick();
  }, FIRST_CPU_RETRY_MS);
  intervalId = window.setInterval(() => {
    void tick();
  }, POLL_MS);
}

function stopSharedPoll() {
  started = false;
  window.clearTimeout(retryId);
  window.clearInterval(intervalId);
  retryId = 0;
  intervalId = 0;
}

/** Live host CPU / RAM — one IPC poll shared across visited screens. */
export function useHostMetrics(): HostMetrics | null {
  const [metrics, setMetrics] = useState<HostMetrics | null>(current);

  useEffect(() => {
    listeners.add(setMetrics);
    startSharedPoll();
    setMetrics(current);
    return () => {
      listeners.delete(setMetrics);
      if (listeners.size === 0) stopSharedPoll();
    };
  }, []);

  return metrics;
}
