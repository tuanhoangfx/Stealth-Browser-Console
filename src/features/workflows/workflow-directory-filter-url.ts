/** Scripts FilterBar — distinct from Profiles `group=` and Backup `bgroup=`. */
export const SCRIPTS_GROUP_URL_KEY = "sgroup";
export const SCRIPTS_PLATFORM_URL_KEY = "splatform";

/** Store FilterBar — distinct from Scripts `sgroup` / `splatform`. */
export const STORE_GROUP_URL_KEY = "stgroup";
export const STORE_PLATFORM_URL_KEY = "stplatform";
export const STORE_SOURCE_URL_KEY = "stsource";

function readCsv(sp: URLSearchParams, key: string): string[] {
  return (sp.get(key) ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

function writeCsv(url: URL, key: string, values: string[]): void {
  if (values.length) url.searchParams.set(key, values.join(","));
  else url.searchParams.delete(key);
}

function replaceSearch(url: URL): void {
  const next = `${url.pathname}${url.search}${url.hash}`;
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== cur) window.history.replaceState(null, "", next);
}

export function readScriptsDirectoryFilterUrl(): { groupIds: string[]; platformIds: string[] } {
  if (typeof window === "undefined") return { groupIds: [], platformIds: [] };
  const sp = new URLSearchParams(window.location.search);
  return {
    groupIds: readCsv(sp, SCRIPTS_GROUP_URL_KEY),
    platformIds: readCsv(sp, SCRIPTS_PLATFORM_URL_KEY),
  };
}

export function writeScriptsDirectoryFilterUrl(groupIds: string[], platformIds: string[]): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  writeCsv(url, SCRIPTS_GROUP_URL_KEY, groupIds);
  writeCsv(url, SCRIPTS_PLATFORM_URL_KEY, platformIds);
  replaceSearch(url);
}

export function readStoreDirectoryFilterUrl(): {
  groupIds: string[];
  platformIds: string[];
  sourceIds: string[];
} {
  if (typeof window === "undefined") return { groupIds: [], platformIds: [], sourceIds: [] };
  const sp = new URLSearchParams(window.location.search);
  return {
    groupIds: readCsv(sp, STORE_GROUP_URL_KEY),
    platformIds: readCsv(sp, STORE_PLATFORM_URL_KEY),
    sourceIds: readCsv(sp, STORE_SOURCE_URL_KEY),
  };
}

export function writeStoreDirectoryFilterUrl(
  groupIds: string[],
  platformIds: string[],
  sourceIds: string[],
): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  writeCsv(url, STORE_GROUP_URL_KEY, groupIds);
  writeCsv(url, STORE_PLATFORM_URL_KEY, platformIds);
  writeCsv(url, STORE_SOURCE_URL_KEY, sourceIds);
  replaceSearch(url);
}
