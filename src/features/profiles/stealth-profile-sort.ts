import { resolveProfileLaunchUrl } from "../../lib/startup-url";
import type { ProfileRow } from "../../types";
import type { StealthProfileSortKey } from "./StealthProfileDirectoryTable";

const STATUS_RANK: Record<ProfileRow["status"], number> = {
  closed: 0,
  opening: 1,
  running: 2,
  failed: 3
};

export function sortableProfileValue(profile: ProfileRow, key: StealthProfileSortKey): string | number {
  switch (key) {
    case "profile":
      return profile.name.toLowerCase();
    case "group":
      return (profile.groupName || "Default").toLowerCase();
    case "status":
      return STATUS_RANK[profile.status] ?? 0;
    case "lastOpened":
      return profile.lastOpenedAt ?? 0;
    case "startupUrl":
      return resolveProfileLaunchUrl(profile.startupUrl || "").toLowerCase();
    case "proxy":
      return (profile.proxy || "Local IP").toLowerCase();
    case "note":
      return (profile.note || "").toLowerCase();
    default:
      return "";
  }
}
