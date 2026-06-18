import { HubBulkActionButton } from "@tool-workspace/hub-ui";
import { Download, FolderTree, Pencil, Play, Plus, Square, Trash2, Upload } from "lucide-react";

export function StealthProfilesDirectoryBulkActions({
  hasSelection,
  syncBusy,
  launchBusy = false,
  launchTitle = "Launch selected profiles with the active workflow",
  onLaunch,
  onClose,
  onDelete,
  onCreate,
  onEdit,
  onGroups,
  onExport,
  onImport
}: {
  hasSelection: boolean;
  syncBusy: boolean;
  launchBusy?: boolean;
  launchTitle?: string;
  onLaunch: () => void;
  onClose: () => void;
  onDelete: () => void;
  onCreate: () => void;
  onEdit: () => void;
  onGroups: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  return (
    <>
      <HubBulkActionButton
        icon={<Plus size={14} aria-hidden />}
        label="New"
        title="Create a new browser profile"
        tone="emerald"
        onClick={onCreate}
      />
      <HubBulkActionButton
        icon={<Pencil size={14} aria-hidden />}
        label="Edit"
        title="Edit selected profile"
        tone="indigo"
        disabled={!hasSelection || syncBusy}
        onClick={onEdit}
      />
      <HubBulkActionButton
        icon={<Play size={14} aria-hidden />}
        label="Launch"
        title={launchTitle}
        tone="emerald"
        disabled={!hasSelection || syncBusy || launchBusy}
        onClick={onLaunch}
      />
      <HubBulkActionButton
        icon={<Square size={14} aria-hidden />}
        label="Close"
        title="Close selected profiles"
        tone="neutral"
        disabled={!hasSelection || syncBusy}
        onClick={onClose}
      />
      <HubBulkActionButton
        icon={<Trash2 size={14} aria-hidden />}
        label="Delete"
        title="Delete selected profiles"
        tone="rose"
        disabled={!hasSelection || syncBusy}
        onClick={onDelete}
      />
      <HubBulkActionButton
        icon={<FolderTree size={14} aria-hidden />}
        label="Groups"
        title="Manage profile groups"
        tone="neutral"
        onClick={onGroups}
      />
      <HubBulkActionButton
        icon={<Download size={14} aria-hidden />}
        label="Export"
        title="Export profiles JSON"
        tone="neutral"
        onClick={onExport}
      />
      <HubBulkActionButton
        icon={<Upload size={14} aria-hidden />}
        label="Import"
        title="Import profiles JSON"
        tone="neutral"
        onClick={onImport}
      />
    </>
  );
}
