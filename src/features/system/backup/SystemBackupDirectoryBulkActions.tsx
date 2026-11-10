import { Archive, ArchiveRestore, BookOpen, HardDriveDownload, ShieldCheck } from "lucide-react";
import { HubBulkActionButton, HubDirectoryAdaptiveEditAction } from "@tool-workspace/hub-ui";
import { openStealthGuide } from "../../../lib/app-meta";
import { profileAdaptiveEditLabelHint } from "../../profiles/profile-bulk-action-hints";

export function SystemBackupDirectoryBulkActions({
  selectedCount,
  hasSelection,
  restoreIntoSelected,
  jobBusy,
  onSnapshotSelected,
  onBackupSelected,
  onBackupAll,
  onRestore,
  onEditSingle,
  onEditBulk,
}: {
  selectedCount: number;
  hasSelection: boolean;
  restoreIntoSelected: boolean;
  jobBusy: boolean;
  onSnapshotSelected?: () => void;
  onBackupSelected: () => void;
  onBackupAll: () => void;
  onRestore: () => void;
  onEditSingle: () => void;
  onEditBulk: () => void;
}) {
  return (
    <>
      <HubDirectoryAdaptiveEditAction
        selectedCount={selectedCount}
        singleLabel="Detail"
        bulkLabel="Detail"
        onEditSingle={onEditSingle}
        onEditBulk={onEditBulk}
        labelHint={profileAdaptiveEditLabelHint(selectedCount)}
      />
      {onSnapshotSelected ? (
        <HubBulkActionButton
          icon={<ShieldCheck size={14} aria-hidden />}
          label={hasSelection ? `Snapshot (${selectedCount})` : "Snapshot page"}
          title="Save atomic 2-slot Native Session Bundle v2 (Cookies, Local State, History, Bookmarks, Preferences, LocalStorage) for selected or visible profiles"
          tone="emerald"
          disabled={jobBusy}
          onClick={onSnapshotSelected}
        />
      ) : null}
      <HubBulkActionButton
        icon={<Archive size={14} aria-hidden />}
        label="Backup selected"
        title="Export selected profiles to a zip archive"
        tone="amber"
        disabled={!hasSelection || jobBusy}
        onClick={onBackupSelected}
      />
      <HubBulkActionButton
        icon={<HardDriveDownload size={14} aria-hidden />}
        label="Backup all"
        title="Export full catalog and profile folders to zip"
        tone="neutral"
        disabled={jobBusy}
        onClick={onBackupAll}
      />
      <HubBulkActionButton
        icon={<ArchiveRestore size={14} aria-hidden />}
        label={restoreIntoSelected ? "Restore into selected" : "Restore zip"}
        title={
          restoreIntoSelected
            ? "Apply backup session data (cookies, local storage) into the selected profile"
            : "Restore catalog and profile folders from a backup archive (matches profile name in zip)"
        }
        tone="indigo"
        disabled={jobBusy}
        onClick={onRestore}
      />
      <HubBulkActionButton
        icon={<BookOpen size={14} aria-hidden />}
        label="Guide & Docs"
        title="Open P0003 Landing & Illustrated Guide (stealth.infi28.com/intro/)"
        tone="sky"
        onClick={() => openStealthGuide("guide/")}
      />
    </>
  );
}
