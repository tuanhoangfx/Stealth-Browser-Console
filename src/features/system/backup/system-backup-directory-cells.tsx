import {
  DirectoryTableBodyCell,
  formatHubTimestampFull,
  getDirectorySearchHighlight,
  HubDirectorySearchHighlightText,
  HubUsersOnOffLabel,
  HubUsersStatusLabel,
  type HubDirectoryColumnDef,
} from "@tool-workspace/hub-ui";
import type { ProfileRow, ProfileStorageStat } from "../../../types";
import { formatBackupBytes } from "./system-backup-types";
import type { StealthBackupColumnKey } from "../../../lib/directory-column-meta";
import { groupHubTone } from "../../profiles/profile-directory-cell-helpers";

function renderLastBackupCell(iso?: string) {
  if (!iso) return <span className="hub-directory-table-body-text">—</span>;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return <span className="hub-directory-table-body-text">—</span>;
  const ageMs = Date.now() - ms;
  const hours = ageMs / (60 * 60 * 1000);
  const label = hours < 24 ? `${Math.max(1, Math.round(hours))}h ago` : new Date(ms).toLocaleDateString("vi-VN");
  return (
    <HubUsersStatusLabel
      label={label}
      tone={hours < 24 ? "active" : "idle"}
      capitalize={false}
      title={formatHubTimestampFull(iso)}
    />
  );
}

export function renderSystemBackupDirectoryBodyCell(
  col: HubDirectoryColumnDef<StealthBackupColumnKey>,
  profile: ProfileRow,
  ctx: {
    searchQuery?: string;
    storage?: ProfileStorageStat;
    lastBackupAt?: string;
  },
) {
  const { key, colClass } = col;
  const searchHighlight = getDirectorySearchHighlight(ctx.searchQuery ?? "", { mixedRequiresWhitespace: true });
  const profileNameTerms = [
    ...(searchHighlight?.idTerms ?? []),
    ...(searchHighlight?.textTerms ?? []),
  ];

  switch (key) {
    case "profile":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span title={profile.name}>
            <HubDirectorySearchHighlightText
              text={profile.name}
              terms={profileNameTerms}
              className="hub-users-name-title"
            />
          </span>
        </DirectoryTableBodyCell>
      );
    case "group": {
      const label = profile.groupName || "Default";
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubUsersStatusLabel
            label={label}
            tone={groupHubTone(label, profile.groupId)}
            capitalize={false}
            title={label}
          />
        </DirectoryTableBodyCell>
      );
    }
    case "lastBackup":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderLastBackupCell(ctx.lastBackupAt)}
        </DirectoryTableBodyCell>
      );
    case "dataSize":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="hub-directory-table-body-text tabular-nums">
            {ctx.storage?.folderExists
              ? ctx.storage.folderBytes != null && ctx.storage.folderBytes >= 0
                ? formatBackupBytes(ctx.storage.folderBytes)
                : "…"
              : "—"}
          </span>
        </DirectoryTableBodyCell>
      );
    case "folder":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubUsersOnOffLabel
            on={Boolean(ctx.storage?.folderExists)}
            title={
              ctx.storage?.folderExists
                ? ctx.storage.folderBytes != null && ctx.storage.folderBytes >= 0
                  ? `Chrome userData folder present (${formatBackupBytes(ctx.storage.folderBytes)})`
                  : "Chrome userData folder present"
                : "No on-disk profile folder"
            }
          />
        </DirectoryTableBodyCell>
      );
    default:
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="hub-directory-table-body-text">—</span>
        </DirectoryTableBodyCell>
      );
  }
}
