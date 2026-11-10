import { RotateCcw, ShieldCheck } from "lucide-react";
import {
  DIRECTORY_CELL_TRUNCATE,
  DirectoryTableBodyCell,
  formatHubTimestampCompact,
  getDirectorySearchHighlight,
  HubDirectorySearchHighlightText,
  HubDirectoryTimestampTooltipCell,
  HubDirectoryValuePopover,
  HubUsersOnOffLabel,
  HubUsersStatusLabel,
  type HubDirectoryColumnDef,
} from "@tool-workspace/hub-ui";
import { formatDirectoryOneLine } from "../../../lib/directory-one-line";
import type { ProfileBackupMeta, ProfileRow, ProfileStorageStat } from "../../../types";
import { formatBackupBytes } from "./system-backup-types";
import type { StealthBackupColumnKey } from "../../../lib/directory-column-meta";
import { groupHubTone } from "../../profiles/profile-directory-cell-helpers";

const BACKUP_NUM_FMT = new Intl.NumberFormat();

function renderBackupTimestampCell(
  msOrIso: number | string | null | undefined,
  title: string,
  variant?: "activity" | "date",
) {
  let ms: number | null = null;
  if (typeof msOrIso === "number" && Number.isFinite(msOrIso) && msOrIso > 0) {
    ms = msOrIso;
  } else if (typeof msOrIso === "string" && msOrIso.trim()) {
    const parsed = Date.parse(msOrIso);
    if (Number.isFinite(parsed) && parsed > 0) ms = parsed;
  }
  return <HubDirectoryTimestampTooltipCell at={ms} title={title} variant={variant} />;
}

export function renderSystemBackupDirectoryBodyCell(
  col: HubDirectoryColumnDef<StealthBackupColumnKey>,
  profile: ProfileRow,
  ctx: {
    searchQuery?: string;
    storage?: ProfileStorageStat;
    lastBackupAt?: string;
    backupMeta?: ProfileBackupMeta;
    runningHeadlessIds?: ReadonlySet<string>;
    rowActionBusyId?: string | null;
    onRunToggle?: (profile: ProfileRow) => void;
    onRowSnapshot?: (profile: ProfileRow) => void;
    onRowRestoreSlot?: (profile: ProfileRow, slot: "latest" | "previous") => void;
  },
) {
  const { key, colClass } = col;
  const searchHighlight = getDirectorySearchHighlight(ctx.searchQuery ?? "", { mixedRequiresWhitespace: true });
  const profileNameTerms = [
    ...(searchHighlight?.idTerms ?? []),
    ...(searchHighlight?.textTerms ?? []),
  ];
  const meta = ctx.backupMeta;

  switch (key) {
    case "createdAt":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderBackupTimestampCell(profile.createdAt, "Created", "date")}
        </DirectoryTableBodyCell>
      );
    case "updated":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderBackupTimestampCell(meta?.lastBackupAt || ctx.lastBackupAt, "Last Backup")}
        </DirectoryTableBodyCell>
      );
    case "profile": {
      const display = formatDirectoryOneLine(profile.name);
      const created = formatHubTimestampCompact(profile.createdAt);
      const updated = formatHubTimestampCompact(meta?.lastBackupAt || ctx.lastBackupAt);
      const popoverValue = [
        `Profile ID: ${display}`,
        profile.groupName ? `Group: ${profile.groupName}` : "",
        created ? `Created: ${created}` : "",
        updated ? `Last Backup: ${updated}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryValuePopover value={popoverValue} title="🆔 Profile ID" className="justify-center">
            <HubDirectorySearchHighlightText
              text={display}
              terms={profileNameTerms}
              className={`hub-users-name-title text-center tabular-nums ${DIRECTORY_CELL_TRUNCATE}`}
            />
          </HubDirectoryValuePopover>
        </DirectoryTableBodyCell>
      );
    }
    case "group": {
      const label = profile.groupName || "Default";
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubUsersStatusLabel
            label={label}
            tone={groupHubTone(label, profile.groupId)}
            capitalize={false}
            title={`Profile ${profile.name} belongs to group ${label}`}
            popoverTitle="Profile group"
          />
        </DirectoryTableBodyCell>
      );
    }
    case "status": {
      const hasLatest = Boolean(meta?.hasSlotLatest);
      const hasPrev = Boolean(meta?.hasSlotPrevious);
      const slotVer = meta?.slotVersion ?? 0;
      const isRowBusy = ctx.rowActionBusyId === profile.id;
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <div
            className="inline-flex items-center justify-center gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              disabled={isRowBusy}
              onClick={() => ctx.onRowSnapshot?.(profile)}
              className="inline-flex h-5 items-center gap-0.5 rounded border border-emerald-500/35 bg-emerald-500/12 px-1.5 text-[10px] font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-40"
              title={`Manual Backup (Snapshot v2) for Profile #${profile.name}`}
            >
              <ShieldCheck size={10} aria-hidden />
              <span>Backup</span>
            </button>
            <button
              type="button"
              disabled={isRowBusy || (!hasLatest && slotVer === 0)}
              onClick={() => ctx.onRowRestoreSlot?.(profile, "latest")}
              className="inline-flex h-5 items-center gap-0.5 rounded border border-sky-500/35 bg-sky-500/12 px-1.5 text-[10px] font-medium text-sky-200 transition-colors hover:bg-sky-500/25 disabled:opacity-30"
              title={`Restore Slot Latest into Profile #${profile.name}`}
            >
              <RotateCcw size={10} aria-hidden />
              <span>Latest</span>
            </button>
            <button
              type="button"
              disabled={isRowBusy || !hasPrev}
              onClick={() => ctx.onRowRestoreSlot?.(profile, "previous")}
              className="inline-flex h-5 items-center gap-0.5 rounded border border-violet-500/35 bg-violet-500/12 px-1.5 text-[10px] font-medium text-violet-200 transition-colors hover:bg-violet-500/25 disabled:opacity-25"
              title={
                hasPrev
                  ? `Restore Slot Previous into Profile #${profile.name}`
                  : `Slot Previous not yet created (requires 2nd distinct backup)`
              }
            >
              <RotateCcw size={10} aria-hidden />
              <span>Prev</span>
            </button>
          </div>
        </DirectoryTableBodyCell>
      );
    }
    case "backupSlots": {
      const hasLatest = Boolean(meta?.hasSlotLatest);
      const hasPrev = Boolean(meta?.hasSlotPrevious);
      const slotVer = meta?.slotVersion ?? 0;
      const backupCount = meta?.backupCount ?? ((hasLatest ? 1 : 0) + (hasPrev ? 1 : 0));
      const slotLatestBytes = meta?.slotLatestBytes ?? 0;
      const slotPreviousBytes = meta?.slotPreviousBytes ?? 0;
      const latestCompressed = Boolean(meta?.slotLatestCompressed);
      const prevCompressed = Boolean(meta?.slotPreviousCompressed);
      const anyCompressed = latestCompressed || prevCompressed;
      const latestUncomp = meta?.slotLatestUncompressedBytes ?? slotLatestBytes;
      const prevUncomp = meta?.slotPreviousUncompressedBytes ?? slotPreviousBytes;
      const totalBackupBytes = meta?.totalBackupBytes ?? slotLatestBytes + slotPreviousBytes;
      const totalUncompressed =
        meta?.totalUncompressedBackupBytes ?? latestUncomp + (hasPrev ? prevUncomp : 0);
      const savedPct =
        totalUncompressed > totalBackupBytes && totalUncompressed > 0
          ? Math.round(((totalUncompressed - totalBackupBytes) / totalUncompressed) * 100)
          : 0;
      const avgBackupBytes =
        meta?.avgBackupBytes ?? (backupCount > 0 ? Math.round(totalBackupBytes / backupCount) : 0);

      const zpackTag = anyCompressed ? " · .zpack" : "";
      const label =
        backupCount >= 2
          ? `${backupCount} slots · L+P${zpackTag}`
          : hasLatest
            ? `1 slot · Latest${zpackTag}`
            : backupCount === 1
              ? "1 bak · Guard"
              : "0 slots";
      const dotClass =
        backupCount >= 2
          ? "bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.65)]"
          : hasLatest
            ? "bg-sky-400 shadow-[0_0_5px_rgba(56,189,248,0.55)]"
            : backupCount === 1
              ? "bg-teal-400/80"
              : "bg-slate-500/60";
      const textClass =
        backupCount >= 2
          ? "text-emerald-300 font-medium"
          : hasLatest
            ? "text-sky-300 font-medium"
            : backupCount === 1
              ? "text-teal-200"
              : "text-[var(--muted)]";
      const latestCompressionNote =
        latestCompressed && latestUncomp > slotLatestBytes
          ? ` (.zpack from ${formatBackupBytes(latestUncomp)} · -${Math.round(
              ((latestUncomp - slotLatestBytes) / latestUncomp) * 100,
            )}%)`
          : "";
      const prevCompressionNote =
        prevCompressed && prevUncomp > slotPreviousBytes
          ? ` (.zpack from ${formatBackupBytes(prevUncomp)} · -${Math.round(
              ((prevUncomp - slotPreviousBytes) / prevUncomp) * 100,
            )}%)`
          : "";
      const popoverValue = [
        `Profile: #${profile.name}`,
        `Total Backups: ${backupCount} independent copy/copies (v${slotVer || 2}${
          anyCompressed ? " · Standard 2 .zpack" : " · Standard 1 Flat"
        })`,
        `Slot Latest: ${
          hasLatest
            ? `${formatBackupBytes(slotLatestBytes)}${latestCompressionNote} · ${
                meta?.slotLatestAt ? new Date(meta.slotLatestAt).toLocaleString() : "Ready"
              }`
            : "None"
        }`,
        `Slot Previous: ${
          hasPrev
            ? `${formatBackupBytes(slotPreviousBytes)}${prevCompressionNote} · ${
                meta?.slotPreviousAt ? new Date(meta.slotPreviousAt).toLocaleString() : "Ready"
              }`
            : "None (created automatically on next rotation)"
        }`,
        `Total Backup Footprint: ${formatBackupBytes(totalBackupBytes)}${
          savedPct > 0 ? ` (saved ${savedPct}% vs ${formatBackupBytes(totalUncompressed)} raw)` : ""
        }`,
        `Average per Backup: ${formatBackupBytes(avgBackupBytes)}`,
      ].join("\n");
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryValuePopover value={popoverValue} title="🛡️ Backup Copies & Slots">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate tabular-nums">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden />
              <span className={`hub-directory-table-body-text truncate ${textClass}`}>{label}</span>
            </span>
          </HubDirectoryValuePopover>
        </DirectoryTableBodyCell>
      );
    }
    case "dataSize": {
      const folderExists = Boolean(ctx.storage?.folderExists ?? meta?.folderExists);
      const backupCount = meta?.backupCount ?? 0;
      const totalBackupBytes =
        meta?.totalBackupBytes ?? ctx.storage?.folderBytes ?? meta?.folderBytes ?? 0;
      const avgBackupBytes =
        meta?.avgBackupBytes ?? (backupCount > 0 ? Math.round(totalBackupBytes / backupCount) : 0);
      const slotLatestBytes = meta?.slotLatestBytes ?? 0;
      const slotPreviousBytes = meta?.slotPreviousBytes ?? 0;
      const latestCompressed = Boolean(meta?.slotLatestCompressed);
      const prevCompressed = Boolean(meta?.slotPreviousCompressed);
      const anyCompressed = latestCompressed || prevCompressed;
      const totalUncompressed =
        meta?.totalUncompressedBackupBytes ?? totalBackupBytes;
      const savedBytes = Math.max(0, totalUncompressed - totalBackupBytes);
      const savedPct =
        savedBytes > 0 && totalUncompressed > 0
          ? Math.round((savedBytes / totalUncompressed) * 100)
          : 0;
      const liveStateBytes = meta?.stateBytes ?? 0;

      const popoverValue = [
        `Profile: #${profile.name}`,
        `Format: ${anyCompressed ? "Standard 2 (.zpack Compressed)" : "Standard 1 (Uncompressed Flat)"}`,
        `Total Backups Stored: ${backupCount} copy/copies`,
        `Total Backup Size: ${formatBackupBytes(totalBackupBytes)}`,
        savedPct > 0
          ? `Compression Savings: -${savedPct}% (saved ${formatBackupBytes(savedBytes)} from ${formatBackupBytes(totalUncompressed)})`
          : "",
        `Average / 1 Backup: ${formatBackupBytes(avgBackupBytes)}`,
        slotLatestBytes > 0
          ? `• Slot Latest: ${formatBackupBytes(slotLatestBytes)}${latestCompressed ? " (.zpack)" : ""}`
          : "",
        slotPreviousBytes > 0
          ? `• Slot Previous: ${formatBackupBytes(slotPreviousBytes)}${prevCompressed ? " (.zpack)" : ""}`
          : "",
        `Live Profile State: ${formatBackupBytes(liveStateBytes)} (${meta?.stateFilesCount ?? 0} files)`,
      ]
        .filter(Boolean)
        .join("\n");

      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {folderExists && totalBackupBytes > 0 ? (
            <HubDirectoryValuePopover value={popoverValue} title="💾 Backup Size (Total & Average)">
              <span className="hub-directory-table-body-text inline-flex min-w-0 items-center gap-1 truncate tabular-nums">
                <span className="text-[var(--text)]">
                  {formatBackupBytes(totalBackupBytes)}
                </span>
                <span className="truncate text-[var(--muted)]">
                  {savedPct > 0
                    ? `· Avg ${formatBackupBytes(avgBackupBytes)} (-${savedPct}%)`
                    : `· Avg ${formatBackupBytes(avgBackupBytes)}`}
                </span>
              </span>
            </HubDirectoryValuePopover>
          ) : (
            <span className="hub-directory-table-body-text text-[var(--muted)]">—</span>
          )}
        </DirectoryTableBodyCell>
      );
    }
    case "cookies": {
      const count = meta?.cookiesCount ?? 0;
      const domainsCount = meta?.domainsCount ?? 0;
      const platforms = [
        meta?.hasGoogleAuth ? "Google" : "",
        meta?.hasOutlookAuth ? "Outlook" : "",
        meta?.hasFacebookAuth ? "FB" : "",
        meta?.hasTikTokAuth ? "TikTok" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const suffix = platforms || (domainsCount > 0 ? `${domainsCount} domains` : "Cookies");
      const countClass =
        (meta?.authDomainsCount ?? 0) > 0
          ? "text-emerald-300"
          : count > 0
            ? "text-sky-300"
            : "text-[var(--muted)]";
      const popoverValue = [
        `Profile: #${profile.name}`,
        `Total SQLite Cookies: ${BACKUP_NUM_FMT.format(count)} rows`,
        `Distinct Host Domains: ${BACKUP_NUM_FMT.format(domainsCount)} domains`,
        `Active Auth Tokens: ${platforms || "None (Google / Outlook / FB / TikTok)"}`,
        `Source: Direct SQLite query on Chromium Network/Cookies DB`,
      ].join("\n");
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {count > 0 ? (
            <HubDirectoryValuePopover value={popoverValue} title="🍪 SQLite Cookies (Objective)">
              <span className="hub-directory-table-body-text inline-flex min-w-0 items-center gap-1 truncate tabular-nums">
                <span className={countClass}>{BACKUP_NUM_FMT.format(count)}</span>
                <span className="truncate text-[var(--muted)]">{`· ${suffix}`}</span>
              </span>
            </HubDirectoryValuePopover>
          ) : (
            <span className="hub-directory-table-body-text text-[var(--muted)]">—</span>
          )}
        </DirectoryTableBodyCell>
      );
    }
    case "historyState": {
      const histBytes = meta?.historyBytes ?? 0;
      const urlsCount = meta?.historyUrlsCount ?? 0;
      const visitsCount = meta?.historyVisitsCount ?? 0;
      const lsBytes = meta?.localStorageBytes ?? 0;
      const popoverValue = [
        `Profile: #${profile.name}`,
        `Unique History URLs: ${BACKUP_NUM_FMT.format(urlsCount)} URLs`,
        `Total Page Visits: ${BACKUP_NUM_FMT.format(visitsCount)} visits`,
        `History SQLite File: ${formatBackupBytes(histBytes)}`,
        `SPA Local Storage (leveldb): ${formatBackupBytes(lsBytes)}`,
        `Backed-up State Files: ${meta?.stateFilesCount ?? 0} files`,
        `Source: Direct SQLite query on Chromium Default/History (urls table)`,
      ].join("\n");
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {urlsCount > 0 || histBytes > 0 ? (
            <HubDirectoryValuePopover value={popoverValue} title="📚 Chromium History DB (Objective)">
              <span className="hub-directory-table-body-text inline-flex min-w-0 items-center gap-1 truncate tabular-nums">
                <span className="text-[var(--text)]">
                  {`${BACKUP_NUM_FMT.format(urlsCount)} URLs`}
                </span>
                <span className="truncate text-[var(--muted)]">
                  {`· ${formatBackupBytes(histBytes)}`}
                </span>
              </span>
            </HubDirectoryValuePopover>
          ) : (
            <span className="hub-directory-table-body-text text-[var(--muted)]">—</span>
          )}
        </DirectoryTableBodyCell>
      );
    }
    case "folder":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubUsersOnOffLabel on={Boolean(ctx.storage?.folderExists ?? meta?.folderExists)} />
        </DirectoryTableBodyCell>
      );
    case "activityLog": {
      const folderExists = Boolean(ctx.storage?.folderExists ?? meta?.folderExists);
      const backupCount = meta?.backupCount ?? 0;
      const totalBackupBytes =
        meta?.totalBackupBytes ?? ctx.storage?.folderBytes ?? meta?.folderBytes ?? 0;
      const cookiesCount = meta?.cookiesCount ?? 0;
      const urlsCount = meta?.historyUrlsCount ?? 0;
      const anyCompressed = Boolean(meta?.slotLatestCompressed || meta?.slotPreviousCompressed);
      const inlineText =
        backupCount > 0
          ? `v2 Snapshot (${backupCount} slot${backupCount === 1 ? "" : "s"}) · ${formatBackupBytes(totalBackupBytes)} · ${BACKUP_NUM_FMT.format(cookiesCount)} cookies`
          : folderExists
            ? `Live folder ready · ${BACKUP_NUM_FMT.format(cookiesCount)} cookies · ${BACKUP_NUM_FMT.format(urlsCount)} URLs`
            : "No profile folder on disk";
      const popoverLines = [
        `Profile: #${profile.name} (${profile.groupId || "Default"})`,
        `Folder on Disk: ${folderExists ? "Present" : "Missing"}`,
        `Backup Slots: ${backupCount} copy/copies (${anyCompressed ? ".zpack Compressed" : "Flat"})`,
        `Total Backup Size: ${formatBackupBytes(totalBackupBytes)}`,
        `Cookies & History: ${BACKUP_NUM_FMT.format(cookiesCount)} cookies · ${BACKUP_NUM_FMT.format(urlsCount)} URLs`,
        ctx.lastBackupAt ? `Last Snapshot: ${ctx.lastBackupAt}` : "Last Snapshot: Never",
      ].join("\n");
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryValuePopover value={popoverLines} title="📋 Backup Activity & Snapshot Log">
            <span className="hub-directory-table-body-text truncate text-[var(--muted)]">
              {inlineText}
            </span>
          </HubDirectoryValuePopover>
        </DirectoryTableBodyCell>
      );
    }
    default:
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="hub-directory-table-body-text">—</span>
        </DirectoryTableBodyCell>
      );
  }
}
