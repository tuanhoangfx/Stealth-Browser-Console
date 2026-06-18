import type { LucideIcon } from "lucide-react";
import {
  HubToolDetailModalPrimaryAction,
} from "./HubToolDetailModal";

export type HubToolDetailModalFooterActionsProps = {
  saveLabel: string;
  saveIcon?: LucideIcon;
  onSave: () => void;
  saveDisabled?: boolean;
  busy?: boolean;
  showDelete?: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
};

/** Golden footer row — optional delete (left) + primary save (right). */
export function HubToolDetailModalFooterActions({
  saveLabel,
  saveIcon,
  onSave,
  saveDisabled,
  busy,
  showDelete,
  onDelete,
  deleteLabel = "Delete",
}: HubToolDetailModalFooterActionsProps) {
  return (
    <div className="flex w-full items-center gap-3">
      {showDelete && onDelete ? (
        <HubToolDetailModalPrimaryAction
          label={deleteLabel}
          onClick={onDelete}
          danger
          disabled={busy}
        />
      ) : null}
      <div className="ml-auto">
        <HubToolDetailModalPrimaryAction
          label={saveLabel}
          onClick={onSave}
          disabled={saveDisabled}
          busy={busy}
          icon={saveIcon}
        />
      </div>
    </div>
  );
}
