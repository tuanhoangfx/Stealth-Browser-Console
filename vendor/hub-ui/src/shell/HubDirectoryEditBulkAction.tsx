import { Pencil, Trash2 } from "lucide-react";
import { HubBulkActionButton } from "./HubBulkActionButton";

export type HubDirectoryEditBulkActionProps = {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  selectedCount?: number;
};

/** SSOT directory bulk Edit — indigo tone. */
export function HubDirectoryEditBulkAction({
  title,
  onClick,
  disabled = false,
  selectedCount,
}: HubDirectoryEditBulkActionProps) {
  return (
    <HubBulkActionButton
      icon={<Pencil size={14} aria-hidden />}
      label="Edit"
      title={title}
      tone="indigo"
      disabled={disabled}
      selectedCount={selectedCount}
      onClick={onClick}
    />
  );
}
