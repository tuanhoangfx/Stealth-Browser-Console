import {
  DirectoryTableBodyCell,
  HubUsersStatusLabel,
  type HubDirectoryColumnDef
} from "@tool-workspace/hub-ui";
import { resolveProfileLaunchUrl } from "../../lib/startup-url";
import type { ProfileRow } from "../../types";
import type { StealthProfileSortKey } from "./StealthProfileDirectoryTable";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatLastOpened(ms: number) {
  const date = new Date(ms);
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const dd = pad2(date.getDate());
  const MM = pad2(date.getMonth() + 1);
  const yy = pad2(date.getFullYear() % 100);
  return `${hh}:${mm} ${dd}/${MM}/${yy}`;
}

function lastOpenedTone(ms: number): "fresh" | "recent" | "stale" {
  const age = Date.now() - ms;
  if (age <= 3 * 60 * 60 * 1000) return "fresh";
  if (age <= 24 * 60 * 60 * 1000) return "recent";
  return "stale";
}

function formatRelativeAge(ms: number): string {
  const ageMs = Math.max(0, Date.now() - ms);
  const ageSec = Math.floor(ageMs / 1000);
  if (ageSec < 60) return "just now";
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return `${ageMin}m ago`;
  const ageHr = Math.floor(ageMin / 60);
  return `${ageHr}h ago`;
}

function statusTone(status: ProfileRow["status"]): "online" | "offline" | "idle" | "active" {
  if (status === "running") return "online";
  if (status === "opening") return "active";
  if (status === "failed") return "idle";
  return "offline";
}

function statusLabel(status: ProfileRow["status"]) {
  if (status === "running") return "Running";
  if (status === "opening") return "Opening";
  if (status === "failed") return "Failed";
  return "Closed";
}

export function renderStealthProfileDirectoryBodyCell(
  col: HubDirectoryColumnDef<StealthProfileSortKey>,
  profile: ProfileRow
) {
  const { key, colClass } = col;

  switch (key) {
    case "profile":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="hub-users-name-title" title={profile.name}>
            {profile.name}
          </span>
        </DirectoryTableBodyCell>
      );
    case "group":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="hub-directory-table-body-text">{profile.groupName || "Default"}</span>
        </DirectoryTableBodyCell>
      );
    case "status":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubUsersStatusLabel label={statusLabel(profile.status)} tone={statusTone(profile.status)} capitalize={false} />
        </DirectoryTableBodyCell>
      );
    case "lastOpened":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {(() => {
            const ms =
              profile.lastOpenedAt ??
              (profile.updatedAt ? Date.parse(profile.updatedAt) : undefined) ??
              (profile.createdAt ? Date.parse(profile.createdAt) : undefined);
            if (!Number.isFinite(ms) || !ms) return <span className="hub-directory-table-body-text">—</span>;
            const tone = lastOpenedTone(ms);
            const dotColor = tone === "fresh" ? "#38bdf8" : tone === "recent" ? "#f59e0b" : "#64748b";
            return (
              <span className="hub-directory-table-body-text" title={new Date(ms).toLocaleString()}>
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: dotColor,
                    marginRight: 8,
                    transform: "translateY(-0.5px)"
                  }}
                />
                {tone === "stale" ? formatLastOpened(ms) : formatRelativeAge(ms)}
              </span>
            );
          })()}
        </DirectoryTableBodyCell>
      );
    case "startupUrl": {
      const url = resolveProfileLaunchUrl(profile.startupUrl || "");
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="hub-directory-table-body-text line-clamp-1" title={url}>
            {url}
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
