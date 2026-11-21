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
          icon={<span className="inline-flex text-[13px] leading-none" aria-hidden>🛡️</span>}
          label={hasSelection ? `Snapshot (${selectedCount})` : "Snapshot page"}
          title="Save atomic 2-slot Native Session Bundle v2 (Cookies, Local State, History, Bookmarks, Preferences, LocalStorage) for selected or visible profiles"
          tone="emerald"
          disabled={jobBusy}
          onClick={onSnapshotSelected}
        />
      ) : null}
      <HubBulkActionButton
        icon={<span className="inline-flex text-[13px] leading-none" aria-hidden>📦</span>}
        label="Backup selected"
        title="Export selected profiles to a zip archive"
        tone="amber"
        disabled={!hasSelection || jobBusy}
        onClick={onBackupSelected}
      />
      <HubBulkActionButton
        icon={<span className="inline-flex text-[13px] leading-none" aria-hidden>💾</span>}
        label="Backup all"
        title="Export full catalog and profile folders to zip"
        tone="neutral"
        disabled={jobBusy}
        onClick={onBackupAll}
      />
      <HubBulkActionButton
        icon={<span className="inline-flex text-[13px] leading-none" aria-hidden>♻️</span>}
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
        icon={<span className="inline-flex text-[13px] leading-none" aria-hidden>📖</span>}
        label="Guide & Docs"
        title="Open P0003 Landing & Illustrated Guide (stealth.infi28.com/intro/)"
        tone="sky"
        onClick={() => openStealthGuide("guide/")}
      />
    </>
  );
}
