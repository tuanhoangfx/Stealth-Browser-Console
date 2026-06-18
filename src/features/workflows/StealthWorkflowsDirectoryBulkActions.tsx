import { Copy, Plus, Trash2 } from "lucide-react";
import { HubBulkActionButton } from "@tool-workspace/hub-ui";

export type StealthWorkflowsDirectoryBulkActionsProps = {
  hasSelection: boolean;
  canDelete: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onNew: () => void;
};

/** Workflow directory bulk row — New · Copy · Delete only. */
export function StealthWorkflowsDirectoryBulkActions({
  hasSelection,
  canDelete,
  onCopy,
  onDelete,
  onNew,
}: StealthWorkflowsDirectoryBulkActionsProps) {
  return (
    <>
      <HubBulkActionButton
        icon={<Plus size={14} aria-hidden />}
        label="New"
        title="Create workflow"
        tone="emerald"
        onClick={onNew}
      />
      <HubBulkActionButton
        icon={<Copy size={14} aria-hidden />}
        label="Copy"
        title={hasSelection ? "Duplicate selected workflows" : "Duplicate active workflow"}
        tone="indigo"
        disabled={!hasSelection}
        onClick={onCopy}
      />
      <HubBulkActionButton
        icon={<Trash2 size={14} aria-hidden />}
        label="Delete"
        title="Delete selected workflows"
        tone="rose"
        disabled={!canDelete}
        onClick={onDelete}
      />
    </>
  );
}
