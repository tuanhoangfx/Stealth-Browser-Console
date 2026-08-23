export type StoreExtUpdatePhase = "idle" | "updating" | "done" | "error";

export type StoreExtUpdateUi = {
  phase: StoreExtUpdatePhase;
  label: string;
  detail: string;
};

const STARTED_KEY = "p0003:store-ext-bg-key";

const idle: StoreExtUpdateUi = { phase: "idle", label: "", detail: "" };
let snapshot: StoreExtUpdateUi = idle;
const listeners = new Set<() => void>();

export function getStoreExtUpdateUi(): StoreExtUpdateUi {
  return snapshot;
}

export function subscribeStoreExtUpdateUi(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setStoreExtUpdateUi(next: StoreExtUpdateUi) {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function readStoreExtBackgroundKey(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(STARTED_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeStoreExtBackgroundKey(key: string) {
  try {
    globalThis.sessionStorage?.setItem(STARTED_KEY, key);
  } catch {
    /* ignore */
  }
}

export function clearStoreExtBackgroundKey() {
  try {
    globalThis.sessionStorage?.removeItem(STARTED_KEY);
  } catch {
    /* ignore */
  }
}
