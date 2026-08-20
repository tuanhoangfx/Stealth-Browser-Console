import { Download } from "lucide-react";
import { HubBulkActionButton } from "@tool-workspace/hub-ui";

export type WorkflowStoreBulkActionsProps = {
  hasSelection: boolean;
  canInstall: boolean;
  installLabel: string;
  loading: boolean;
  onInstall: () => void;
};

export function WorkflowStoreBulkActions({
  hasSelection,
  canInstall,
  installLabel,
  loading,
  onInstall,
}: WorkflowStoreBulkActionsProps) {
  return (
    <HubBulkActionButton
      icon={<Download size={14} aria-hidden />}
      label={installLabel}
      title={hasSelection ? `${installLabel} selected workflows` : "Select workflows to install"}
      tone="sky"
      disabled={!canInstall || loading}
      onClick={onInstall}
    />
  );
}
