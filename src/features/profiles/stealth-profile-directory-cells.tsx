import {
  compactIconSize,
  DIRECTORY_CELL_TRUNCATE,
  DirectoryTableBodyCell,
  getDirectorySearchHighlight,
  HUB_DIRECTORY_ICON_CELL_HIT_EXPAND_CLASS,
  HubDirectoryEllipsisCell,
  HubDirectorySearchHighlightText,
  HubUsersOnOffLabel,
  HubUsersStatusLabel,
  type HubDirectoryColumnDef,
} from "@tool-workspace/hub-ui";
import { Ghost, Loader2, Play, Square } from "lucide-react";
import { HubDirectoryTimestampLabel } from "@tool-workspace/hub-ui";
import { formatDirectoryOneLine } from "../../lib/directory-one-line";
import { formatStartupUrlDisplay } from "../../lib/startup-url";
import type { ExtensionToggles, ProfileRow } from "../../types";
import { resolveProfileExtensionEffective } from "../../lib/profile-extension-effective";
import { groupHubTone } from "./profile-directory-cell-helpers";
import type { StealthProfileSortKey } from "./StealthProfileDirectoryTable";

function renderProfileTimestampCell(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms) || !ms) {
    return <span className="hub-directory-table-body-text">—</span>;
  }
  return <HubDirectoryTimestampLabel at={ms} />;
}

export function renderStealthProfileDirectoryBodyCell(
  col: HubDirectoryColumnDef<StealthProfileSortKey>,
  profile: ProfileRow,
  searchQuery = "",
  handlers?: {
    onOpen?: (profile: ProfileRow) => void;
    onClose?: (profile: ProfileRow) => void;
    runningHeadlessIds?: ReadonlySet<string>;
    globalExtensionToggles?: ExtensionToggles;
  },
) {
  const { key, colClass } = col;
  const searchHighlight = getDirectorySearchHighlight(searchQuery, { mixedRequiresWhitespace: true });
  const profileNameTerms = [
    ...(searchHighlight?.idTerms ?? []),
    ...(searchHighlight?.textTerms ?? []),
  ];

  switch (key) {
    case "profile":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectorySearchHighlightText
            text={formatDirectoryOneLine(profile.name)}
            terms={profileNameTerms}
            className={`hub-users-name-title ${DIRECTORY_CELL_TRUNCATE}`}
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
    case "e0001":
    case "surfshark": {
      const extKey = key;
      const global = handlers?.globalExtensionToggles ?? { e0001: true, surfshark: false, webStore: false };
      const enabled = resolveProfileExtensionEffective(global, profile.extensionOverrides, extKey);
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubUsersOnOffLabel on={enabled} />
        </DirectoryTableBodyCell>
      );
    }
    case "status": {
      const running = profile.status === "running" || profile.status === "opening";
      const opening = profile.status === "opening";
      const showHeadlessBadge =
        running && (profile.headless || Boolean(handlers?.runningHeadlessIds?.has(profile.id)));
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {!running ? (
            <button
              type="button"
              className={`hub-directory-icon-cell ${HUB_DIRECTORY_ICON_CELL_HIT_EXPAND_CLASS} rounded-md border-0 bg-transparent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45`}
              aria-label={`Run ${profile.name} with startup URL`}
              disabled={opening}
              onClick={(event) => {
                event.stopPropagation();
                handlers?.onOpen?.(profile);
              }}
            >
              <span className="hub-directory-icon-cell__icon text-emerald-400">
                {opening ? (
                  <Loader2 size={compactIconSize(11)} className="animate-spin" aria-hidden />
                ) : (
                  <Play size={compactIconSize(11)} fill="currentColor" aria-hidden />
                )}
              </span>
              <span className="hub-directory-icon-cell__label text-emerald-300">Run</span>
            </button>
          ) : (
            <button
              type="button"
              className={`hub-directory-icon-cell ${HUB_DIRECTORY_ICON_CELL_HIT_EXPAND_CLASS} rounded-md border-0 bg-transparent transition-opacity hover:opacity-90`}
              aria-label={`Stop ${profile.name}${showHeadlessBadge ? " (headless)" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                handlers?.onClose?.(profile);
              }}
            >
              <span className="hub-directory-icon-cell__icon text-rose-400">
                <Square size={compactIconSize(11)} fill="currentColor" aria-hidden />
              </span>
              <span className="hub-directory-icon-cell__label inline-flex items-center gap-1 text-rose-300">
                Stop
                {showHeadlessBadge ? (
                  <Ghost size={compactIconSize(10)} className="text-amber-300 opacity-90" aria-hidden />
                ) : null}
              </span>
            </button>
          )}
        </DirectoryTableBodyCell>
      );
    }
    case "updated":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderProfileTimestampCell(
            profile.lastOpenedAt ??
              (profile.updatedAt ? Date.parse(profile.updatedAt) : undefined) ??
              (profile.createdAt ? Date.parse(profile.createdAt) : undefined),
          )}
        </DirectoryTableBodyCell>
      );
    case "createdAt":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderProfileTimestampCell(profile.createdAt ? Date.parse(profile.createdAt) : null)}
        </DirectoryTableBodyCell>
      );
    case "startupUrl":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryEllipsisCell
            value={formatDirectoryOneLine(formatStartupUrlDisplay(profile.startupUrl || ""))}
          />
        </DirectoryTableBodyCell>
      );
    case "proxy":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryEllipsisCell value={formatDirectoryOneLine(profile.proxy || "Local IP")} />
        </DirectoryTableBodyCell>
      );
    case "note":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryEllipsisCell
            value={formatDirectoryOneLine(profile.note)}
            hoverPopover
            popoverTitle="Note"
          />
        </DirectoryTableBodyCell>
      );
    default:
      return null;
  }
}
