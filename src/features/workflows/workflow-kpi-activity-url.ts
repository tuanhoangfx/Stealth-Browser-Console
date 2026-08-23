import { WORKFLOW_ACTIVITY_KPI_KEYS } from "./workflow-activity";

/** Scripts KPI click — F5 keeps the tile (P0005 `ofv` analog; single key). */
export const SCRIPTS_KPI_ACTIVITY_URL_KEY = "sak";
/** Store KPI click. */
export const STORE_KPI_ACTIVITY_URL_KEY = "stak";

export const STORE_ACTIVITY_URL_KEYS = [
  "create_today",
  "update_today",
  "local",
  "installed",
  "available",
] as const;

function readActivityParam(param: string, allowed: readonly string[]): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get(param)?.trim() ?? "";
  return allowed.includes(raw) ? raw : null;
}

function writeActivityParam(param: string, key: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (key) url.searchParams.set(param, key);
  else url.searchParams.delete(param);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== cur) window.history.replaceState(null, "", next);
}

export function readScriptsKpiActivityUrl(): string | null {
  return readActivityParam(SCRIPTS_KPI_ACTIVITY_URL_KEY, WORKFLOW_ACTIVITY_KPI_KEYS);
}

export function writeScriptsKpiActivityUrl(key: string | null): void {
  writeActivityParam(SCRIPTS_KPI_ACTIVITY_URL_KEY, key);
}

export function readStoreKpiActivityUrl(): string | null {
  return readActivityParam(STORE_KPI_ACTIVITY_URL_KEY, STORE_ACTIVITY_URL_KEYS);
}

export function writeStoreKpiActivityUrl(key: string | null): void {
  writeActivityParam(STORE_KPI_ACTIVITY_URL_KEY, key);
}
