import type { StealthProfileSortKey } from "./StealthProfileDirectoryTable";

const SORT_SQL: Record<StealthProfileSortKey, string> = {
  profile: "name",
  group: "group_name",
  status: "status",
  lastOpened: "last_opened_at",
  createdAt: "created_at",
  startupUrl: "startup_url",
  proxy: "proxy",
  note: "note",
};

export function profileDirectorySortParam(key: StealthProfileSortKey): string {
  return SORT_SQL[key] || "updated_at";
}
