import { Trash2 } from "lucide-react";
import { HubBulkActionButton } from "./HubBulkActionButton";

export type HubDirectoryDeleteBulkActionProps = {
  title: string;
  onClick: () => void;
  disabled?: boolean;
};

/** SSOT directory bulk Delete — rose tone. */
export function HubDirectoryDeleteBulkAction({
  title,
  onClick,
  disabled = false,
}: HubDirectoryDeleteBulkActionProps) {
  return (
    <HubBulkActionButton
      icon={<Trash2 size={14} aria-hidden />}
      label="Delete"
      title={title}
      tone="rose"
      disabled={disabled}
      onClick={onClick}
    />
  );
}
