import { Archive, ArchiveRestore, HardDriveDownload } from "lucide-react";
import { HubBulkActionButton } from "@tool-workspace/hub-ui";

export function SystemBackupDirectoryBulkActions({
  hasSelection,
  restoreIntoSelected,
  jobBusy,
  onBackupSelected,
  onBackupAll,
  onRestore,
}: {
  hasSelection: boolean;
  restoreIntoSelected: boolean;
  jobBusy: boolean;
  onBackupSelected: () => void;
  onBackupAll: () => void;
  onRestore: () => void;
}) {
  return (
    <>
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
    </>
  );
}
