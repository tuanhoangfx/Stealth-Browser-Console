import type { ProfileProxyFilterMode, ProfileRow } from "../../types";

const PROFILE_STATUS_URL = new Set<ProfileRow["status"]>([
  "closed",
  "opening",
  "running",
  "headless",
  "waiting",
  "failed",
]);
const PROFILE_PROXY_URL = new Set<ProfileProxyFilterMode>(["local", "vpn", "auto_vpn", "custom", "static"]);

export function readProfileDirectoryFilterUrl(): {
  groupIds: string[];
  statuses: ProfileRow["status"][];
  proxyModes: ProfileProxyFilterMode[];
} {
  if (typeof window === "undefined") return { groupIds: [], statuses: [], proxyModes: [] };
  const sp = new URLSearchParams(window.location.search);
  const statuses = (sp.get("status") ?? "")
    .split(",")
    .filter((value): value is ProfileRow["status"] => PROFILE_STATUS_URL.has(value as ProfileRow["status"]));
  const groupIds = (sp.get("group") ?? "").split(",").filter(Boolean);
  const proxyModes = (sp.get("proxy") ?? "")
    .split(",")
    .filter((value): value is ProfileProxyFilterMode => PROFILE_PROXY_URL.has(value as ProfileProxyFilterMode));
  return { groupIds, statuses, proxyModes };
}

/** Persist Status / Group / Proxy so F5 keeps the KPI/filter selection (P0004 Users URL prefs). */
export function writeProfileDirectoryFilterUrl(
  groupIds: string[],
  statuses: ProfileRow["status"][],
  proxyModes: ProfileProxyFilterMode[] = [],
): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (statuses.length) url.searchParams.set("status", statuses.join(","));
  else url.searchParams.delete("status");
  if (groupIds.length) url.searchParams.set("group", groupIds.join(","));
  else url.searchParams.delete("group");
  if (proxyModes.length) url.searchParams.set("proxy", proxyModes.join(","));
  else url.searchParams.delete("proxy");
  const next = `${url.pathname}${url.search}${url.hash}`;
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== cur) window.history.replaceState(null, "", next);
}
