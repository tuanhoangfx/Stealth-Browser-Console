import { CopyMinus, Pencil, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { HubBulkActionButton, type HubBulkActionTone } from "./HubBulkActionButton";
import { HubDirectoryBulkActionRail } from "./HubDirectoryBulkActionRail";

export type HubDirectoryCrudBulkExtraAction = {
  label: string;
  title: string;
  onClick: () => void;
  icon?: ReactNode;
  tone?: HubBulkActionTone;
};

export type HubDirectoryCrudBulkActionsProps = {
  hasSelection: boolean;
  selectedCount: number;
  onPrimary: () => void;
  onEdit: () => void;
  onDelete: () => void;
  primaryLabel?: string;
  primaryTitle?: string;
  primaryDisabled?: boolean;
  editDisabled?: boolean;
  deleteDisabled?: boolean;
  editTitle?: string;
  editTitleWhenMulti?: string;
  editTitleWhenNone?: string;
  deleteTitle?: string;
  deleteTitleWhenNone?: string;
  extra?: HubDirectoryCrudBulkExtraAction;
  /** Render buttons only — compose multiple groups in one `HubDirectoryBulkActionRail`. */
  embedded?: boolean;
};

/** Golden Add / Edit / Delete bulk rail — Notes folders, 2FA, Cookie access modals. */
export function HubDirectoryCrudBulkActions({
  hasSelection,
  selectedCount,
  onPrimary,
  onEdit,
  onDelete,
  primaryLabel = "Add",
  primaryTitle,
  primaryDisabled = false,
  editDisabled = false,
  deleteDisabled = false,
  editTitle = "Edit selected",
  editTitleWhenMulti = "Select one item to edit",
  editTitleWhenNone = "Select items to edit",
  deleteTitle = "Delete selected",
  deleteTitleWhenNone = "Select items to delete",
  extra,
  embedded = false,
}: HubDirectoryCrudBulkActionsProps) {
  const editEnabled = hasSelection && selectedCount === 1 && !editDisabled;
  const deleteEnabled = hasSelection && !deleteDisabled;

  const resolvedEditTitle = !hasSelection
    ? editTitleWhenNone
    : selectedCount > 1
      ? editTitleWhenMulti
      : editTitle;

  const resolvedDeleteTitle = hasSelection ? deleteTitle : deleteTitleWhenNone;

  const buttons = (
    <>
      <HubBulkActionButton
        icon={<Plus size={14} aria-hidden />}
        label={primaryLabel}
        title={primaryTitle ?? primaryLabel}
        tone="emerald"
        disabled={primaryDisabled}
        onClick={onPrimary}
      />
      <HubBulkActionButton
        icon={<Pencil size={14} aria-hidden />}
        label="Edit"
        title={resolvedEditTitle}
        tone="indigo"
        disabled={!editEnabled}
        selectedCount={hasSelection ? selectedCount : undefined}
        onClick={onEdit}
      />
      <HubBulkActionButton
        icon={<Trash2 size={14} aria-hidden />}
        label="Delete"
        title={resolvedDeleteTitle}
        tone="rose"
        disabled={!deleteEnabled}
        onClick={onDelete}
      />
      {extra ? (
        <HubBulkActionButton
          icon={extra.icon ?? <CopyMinus size={14} aria-hidden />}
          label={extra.label}
          title={extra.title}
          tone={extra.tone ?? "amber"}
          onClick={extra.onClick}
        />
      ) : null}
    </>
  );

  if (embedded) return buttons;

  return (
    <HubDirectoryBulkActionRail>
      {buttons}
    </HubDirectoryBulkActionRail>
  );
}
