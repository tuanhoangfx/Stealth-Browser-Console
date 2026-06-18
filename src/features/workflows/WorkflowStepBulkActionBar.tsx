import { ArrowDown, ArrowUp, Check, Redo2, Save, Trash2, Undo2 } from "lucide-react";

export type WorkflowStepBulkActionBarProps = {
  savePulse: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
};

/** P0020 TwofaBulkActionBar skin — filter row 2 for workflow step inspector. */
export function WorkflowStepBulkActionBar({
  savePulse,
  canUndo,
  canRedo,
  onSave,
  onUndo,
  onRedo,
  onMoveUp,
  onMoveDown,
  onDelete,
}: WorkflowStepBulkActionBarProps) {
  return (
    <div className="hub-bulk-action-bar workflow-step-bulk-action-bar">
      <button
        type="button"
        onClick={onSave}
        title={savePulse ? "Saved" : "Save workflow"}
        className={`hub-bulk-action-btn hub-bulk-action-btn--save${savePulse ? " is-saved" : ""}`}
      >
        {savePulse ? <Check size={14} aria-hidden /> : <Save size={14} aria-hidden />}
        {savePulse ? "Saved" : "Save"}
      </button>
      <button
        type="button"
        disabled={!canUndo}
        onClick={onUndo}
        title="Undo"
        className="hub-bulk-action-btn hub-bulk-action-btn--neutral"
      >
        <Undo2 size={14} aria-hidden />
        Undo
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onClick={onRedo}
        title="Redo"
        className="hub-bulk-action-btn hub-bulk-action-btn--neutral"
      >
        <Redo2 size={14} aria-hidden />
        Redo
      </button>
      <button
        type="button"
        onClick={onMoveUp}
        title="Move up"
        className="hub-bulk-action-btn hub-bulk-action-btn--neutral"
      >
        <ArrowUp size={14} aria-hidden />
        Up
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        title="Move down"
        className="hub-bulk-action-btn hub-bulk-action-btn--neutral"
      >
        <ArrowDown size={14} aria-hidden />
        Down
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Delete step"
        className="hub-bulk-action-btn hub-bulk-action-btn--delete"
      >
        <Trash2 size={14} aria-hidden />
        Delete
      </button>
    </div>
  );
}
