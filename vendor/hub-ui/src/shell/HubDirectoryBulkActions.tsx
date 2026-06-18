import { Copy, Package, Pencil, Plus, RefreshCw, SquareStack, Trash2 } from "lucide-react";
import { HubBulkActionButton } from "./HubBulkActionButton";

/** Optional Hub tools bulk refresh — P0004 golden Hub uses auto-sync; card select-all only. */
export type HubToolsDirectoryBulkActionsProps = {
  hasSelection: boolean;
  selectedCount: number;
  busy?: boolean;
  onRefreshSelected: () => void;
};

export function HubToolsDirectoryBulkActions({
  hasSelection,
  selectedCount,
  busy = false,
  onRefreshSelected,
}: HubToolsDirectoryBulkActionsProps) {
  return (
    <HubBulkActionButton
      icon={<RefreshCw size={14} aria-hidden />}
      label="Refresh"
      title={hasSelection ? "Refresh GitHub metadata for selected tools" : "Select one or more tools"}
      tone="indigo"
      disabled={!hasSelection || busy}
      selectedCount={hasSelection ? selectedCount : undefined}
      iconSpinning={busy}
      onClick={onRefreshSelected}
    />
  );
}

/** Catalog-wide sync — filter toolbar (not selection bulk). */
export type HubCatalogSyncButtonProps = {
  busy?: boolean;
  label?: string;
  title?: string;
  onClick: () => void;
};

export function HubCatalogSyncButton({
  busy = false,
  label = "Sync workspace",
  title = "Scan workspace + refresh registry and quota",
  onClick,
}: HubCatalogSyncButtonProps) {
  return (
    <HubBulkActionButton
      icon={<Package size={14} aria-hidden />}
      label={label}
      title={title}
      tone="sky"
      disabled={busy}
      iconSpinning={busy}
      onClick={onClick}
    />
  );
}

/** Golden Dashboard screen catalog — bulk actions that need multi-select. */
export type HubScreensDirectoryBulkActionsProps = {
  hasSelection: boolean;
  selectedCount: number;
  onOpenSelected: () => void;
  onCopyPaths: () => void;
};

/** Dashboard screen catalog bulk — per-card pin only (no bulk pin). */
export function HubScreensDirectoryBulkActions({
  hasSelection,
  selectedCount,
  onOpenSelected,
  onCopyPaths,
}: HubScreensDirectoryBulkActionsProps) {
  return (
    <>
      <HubBulkActionButton
        icon={<SquareStack size={14} aria-hidden />}
        label="Open selected"
        title="Open each selected screen in a new browser tab"
        tone="indigo"
        disabled={!hasSelection}
        selectedCount={hasSelection ? selectedCount : undefined}
        onClick={onOpenSelected}
      />
      <HubBulkActionButton
        icon={<Copy size={14} aria-hidden />}
        label="Copy paths"
        title="Copy selected screen paths to clipboard"
        tone="neutral"
        disabled={!hasSelection}
        onClick={onCopyPaths}
      />
    </>
  );
}

/** Golden Users directory — CRUD row-2 actions. */
export type HubUsersDirectoryBulkActionsProps = {
  hasSelection: boolean;
  roleLoading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  onAdd: () => void;
  onEdit: () => void;
  onClearAccess: () => void;
  onDeleteUsers: () => void;
};

export function HubUsersDirectoryBulkActions({
  hasSelection,
  roleLoading,
  isAdmin,
  isManager,
  onAdd,
  onEdit,
  onClearAccess,
  onDeleteUsers,
}: HubUsersDirectoryBulkActionsProps) {
  const canEdit = isAdmin || isManager;
  const editEnabled = canEdit && hasSelection && !roleLoading;
  const clearEnabled = isAdmin && hasSelection && !roleLoading;
  const deleteEnabled = isAdmin && hasSelection && !roleLoading;
  const addEnabled = isAdmin && !roleLoading;

  return (
    <>
      <HubBulkActionButton
        icon={<Plus size={14} aria-hidden />}
        label="Add"
        title={
          roleLoading
            ? "Loading your role…"
            : isAdmin
              ? "Add user (ID or email) or bulk import"
              : "Admin only"
        }
        tone="emerald"
        disabled={!addEnabled}
        onClick={onAdd}
      />
      <HubBulkActionButton
        icon={<Pencil size={14} aria-hidden />}
        label="Edit"
        title={
          roleLoading
            ? "Loading your role…"
            : !canEdit
              ? "Admin or manager only"
              : hasSelection
                ? "Edit name, email, role, tools"
                : "Select one or more users"
        }
        tone="indigo"
        disabled={!editEnabled}
        onClick={onEdit}
      />
      <HubBulkActionButton
        icon={<Trash2 size={14} aria-hidden />}
        label="Clear access"
        title={
          roleLoading
            ? "Loading your role…"
            : isAdmin
              ? "Clear Hub tool access for selected users (keep profiles + auth accounts)"
              : "Admin only"
        }
        tone="rose"
        disabled={!clearEnabled}
        onClick={onClearAccess}
      />
      <HubBulkActionButton
        icon={<Trash2 size={14} aria-hidden />}
        label="Delete users"
        title={
          roleLoading
            ? "Loading your role…"
            : isAdmin
              ? "Delete selected users (7-day grace, then permanent purge)"
              : "Admin only"
        }
        tone="rose"
        disabled={!deleteEnabled}
        onClick={onDeleteUsers}
      />
    </>
  );
}
