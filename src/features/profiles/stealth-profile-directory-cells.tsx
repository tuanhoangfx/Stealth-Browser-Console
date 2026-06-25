import {
  compactIconSize,
  DirectoryTableBodyCell,
  formatHubTimestampFull,
  getDirectorySearchHighlight,
  HubDirectorySearchHighlightText,
  HubUsersStatusLabel,
  type HubDirectoryColumnDef,
} from "@tool-workspace/hub-ui";
import { Loader2, Play, Square } from "lucide-react";
import { formatStartupUrlDisplay, resolveProfileLaunchUrl } from "../../lib/startup-url";
import type { ProfileRow } from "../../types";
import {
  formatLastOpenedRelativeAge,
  formatLastOpenedStaleDate,
  groupHubTone,
  lastOpenedAgeTone,
  lastOpenedHubTone,
} from "./profile-directory-cell-helpers";
import type { StealthProfileSortKey } from "./StealthProfileDirectoryTable";

function renderProfileTimestampCell(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms) || !ms) {
    return <span className="hub-directory-table-body-text">—</span>;
  }
  const iso = new Date(ms).toISOString();
  const tone = lastOpenedAgeTone(ms);
  const label = tone === "stale" ? formatLastOpenedStaleDate(ms) : formatLastOpenedRelativeAge(ms);
  return (
    <HubUsersStatusLabel
      label={label}
      tone={lastOpenedHubTone(tone)}
      capitalize={false}
      title={formatHubTimestampFull(iso)}
    />
  );
}

export function renderStealthProfileDirectoryBodyCell(
  col: HubDirectoryColumnDef<StealthProfileSortKey>,
  profile: ProfileRow,
  searchQuery = "",
  handlers?: { onOpen?: (profile: ProfileRow) => void; onClose?: (profile: ProfileRow) => void },
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
    case "status": {
      const running = profile.status === "running" || profile.status === "opening";
      const opening = profile.status === "opening";
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {!running ? (
            <button
              type="button"
              className="hub-directory-icon-cell rounded-md border-0 bg-transparent p-0 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              title="Run profile with startup URL"
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
              className="hub-directory-icon-cell rounded-md border-0 bg-transparent p-0 transition-opacity hover:opacity-90"
              title="Stop profile"
              aria-label={`Stop ${profile.name}`}
              onClick={(event) => {
                event.stopPropagation();
                handlers?.onClose?.(profile);
              }}
            >
              <span className="hub-directory-icon-cell__icon text-rose-400">
                <Square size={compactIconSize(11)} fill="currentColor" aria-hidden />
              </span>
              <span className="hub-directory-icon-cell__label text-rose-300">Stop</span>
            </button>
          )}
        </DirectoryTableBodyCell>
      );
    }
    case "lastOpened":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {(() => {
            const ms =
              profile.lastOpenedAt ??
              (profile.updatedAt ? Date.parse(profile.updatedAt) : undefined) ??
              (profile.createdAt ? Date.parse(profile.createdAt) : undefined);
            if (!Number.isFinite(ms) || !ms) return <span className="hub-directory-table-body-text">—</span>;
            const tone = lastOpenedAgeTone(ms);
            const label = tone === "stale" ? formatLastOpenedStaleDate(ms) : formatLastOpenedRelativeAge(ms);
            return (
              <HubUsersStatusLabel
                label={label}
                tone={lastOpenedHubTone(tone)}
                capitalize={false}
                title={new Date(ms).toLocaleString()}
              />
            );
          })()}
        </DirectoryTableBodyCell>
      );
    case "createdAt":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderProfileTimestampCell(profile.createdAt ? Date.parse(profile.createdAt) : null)}
        </DirectoryTableBodyCell>
      );
    case "startupUrl": {
      const url = resolveProfileLaunchUrl(profile.startupUrl || "");
      const label = formatStartupUrlDisplay(profile.startupUrl || "");
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="hub-directory-table-body-text line-clamp-1" title={url}>
            {label}
          </span>
        </DirectoryTableBodyCell>
      );
    }
    case "proxy":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="hub-directory-table-body-text">{profile.proxy || "Local IP"}</span>
        </DirectoryTableBodyCell>
      );
    case "note":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="hub-directory-table-body-text line-clamp-1" title={profile.note || undefined}>
            {profile.note || "—"}
          </span>
        </DirectoryTableBodyCell>
      );
    default:
      return null;
  }
}
