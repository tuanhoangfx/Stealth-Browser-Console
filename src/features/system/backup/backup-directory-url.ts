import type { ProfileRow } from "../../../types";

const BACKUP_STATUS_URL = new Set<ProfileRow["status"]>(["closed", "opening", "running", "failed"]);
const SEARCH_MAX = 200;

export function readBackupDirectoryFilterUrl(): {
  groupIds: string[];
  statuses: ProfileRow["status"][];
  search: string;
} {
  if (typeof window === "undefined") return { groupIds: [], statuses: [], search: "" };
  const sp = new URLSearchParams(window.location.search);
  const statuses = (sp.get("bstatus") ?? "")
    .split(",")
    .filter((value): value is ProfileRow["status"] => BACKUP_STATUS_URL.has(value as ProfileRow["status"]));
  const groupIds = (sp.get("bgroup") ?? "").split(",").filter(Boolean);
  const search = (sp.get("bq") ?? "").slice(0, SEARCH_MAX);
  return { groupIds, statuses, search };
}

/** Distinct from Profiles `status=` / `group=` and Extensions `q=` so directories do not clobber each other. */
export function writeBackupDirectoryFilterUrl(
  groupIds: string[],
  statuses: ProfileRow["status"][],
  search = "",
): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (statuses.length) url.searchParams.set("bstatus", statuses.join(","));
  else url.searchParams.delete("bstatus");
  if (groupIds.length) url.searchParams.set("bgroup", groupIds.join(","));
  else url.searchParams.delete("bgroup");
  const q = search.trim().slice(0, SEARCH_MAX);
  if (q) url.searchParams.set("bq", q);
  else url.searchParams.delete("bq");
  const next = `${url.pathname}${url.search}${url.hash}`;
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== cur) window.history.replaceState(null, "", next);
}
