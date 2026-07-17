import {
  DirectoryTableBodyCell,
  getDirectorySearchHighlight,
  HubDirectorySearchHighlightText,
  HubDirectoryTimestampLabel,
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
  return <HubDirectoryTimestampLabel at={iso} />;
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
          <HubDirectorySearchHighlightText
            text={profile.name}
            terms={profileNameTerms}
            className="hub-users-name-title"
          />
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
          />
        </DirectoryTableBodyCell>
      );
    }
    case "updated":
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
          <HubUsersOnOffLabel on={Boolean(ctx.storage?.folderExists)} />
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
