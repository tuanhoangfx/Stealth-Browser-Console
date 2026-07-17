import { Trash2 } from "lucide-react";
import type { HubDirectoryColumnHintContent } from "../table/HubDirectoryColumnHint";
import { HubBulkActionButton } from "./HubBulkActionButton";

export type HubDirectoryDeleteBulkActionProps = {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  labelHint?: HubDirectoryColumnHintContent;
};

/** SSOT directory bulk Delete — rose tone. */
export function HubDirectoryDeleteBulkAction({
  title,
  onClick,
  disabled = false,
  labelHint,
}: HubDirectoryDeleteBulkActionProps) {
  return (
    <HubBulkActionButton
      icon={<Trash2 size={14} aria-hidden />}
      label="Delete"
      title={title}
      tone="rose"
      disabled={disabled}
      onClick={onClick}
      labelHint={labelHint}
    />
  );
}
