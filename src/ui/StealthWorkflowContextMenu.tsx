import { Copy, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { WorkflowConfig } from "../features/workflows/workflow-types";

export type StealthWorkflowContextMenuProps = {
  workflow: WorkflowConfig | null;
  x: number;
  y: number;
  canDelete: boolean;
  onClose: () => void;
  onCopy: (workflow: WorkflowConfig) => void;
  onDelete: (workflow: WorkflowConfig) => void;
};

export function StealthWorkflowContextMenu({
  workflow,
  x,
  y,
  canDelete,
  onClose,
  onCopy,
  onDelete,
}: StealthWorkflowContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!workflow) return;

    function handlePointer(event: MouseEvent) {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose, workflow]);

  if (!workflow) return null;

  return (
    <div ref={ref} className="stealth-context-menu" style={{ top: y, left: x }} role="menu" aria-label="Workflow actions">
      <button type="button" className="stealth-context-menu-item" role="menuitem" onClick={() => { onCopy(workflow); onClose(); }}>
        <Copy size={13} aria-hidden />
        Copy
      </button>
      <button
        type="button"
        className="stealth-context-menu-item stealth-context-menu-item--danger"
        role="menuitem"
        disabled={!canDelete}
        onClick={() => { onDelete(workflow); onClose(); }}
      >
        <Trash2 size={13} aria-hidden />
        Delete
      </button>
    </div>
  );
}
