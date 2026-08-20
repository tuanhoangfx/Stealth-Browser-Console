import type { ProfileRow } from "../../types";

const PROFILE_STATUS_URL = new Set<ProfileRow["status"]>(["closed", "opening", "running", "failed"]);

export function readProfileDirectoryFilterUrl(): {
  groupIds: string[];
  statuses: ProfileRow["status"][];
} {
  if (typeof window === "undefined") return { groupIds: [], statuses: [] };
  const sp = new URLSearchParams(window.location.search);
  const statuses = (sp.get("status") ?? "")
    .split(",")
    .filter((value): value is ProfileRow["status"] => PROFILE_STATUS_URL.has(value as ProfileRow["status"]));
  const groupIds = (sp.get("group") ?? "").split(",").filter(Boolean);
  return { groupIds, statuses };
}

/** Persist Status / Group so F5 keeps the KPI click filter (P0004 Users URL prefs). */
export function writeProfileDirectoryFilterUrl(
  groupIds: string[],
  statuses: ProfileRow["status"][],
): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (statuses.length) url.searchParams.set("status", statuses.join(","));
  else url.searchParams.delete("status");
  if (groupIds.length) url.searchParams.set("group", groupIds.join(","));
  else url.searchParams.delete("group");
  const next = `${url.pathname}${url.search}${url.hash}`;
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== cur) window.history.replaceState(null, "", next);
}
