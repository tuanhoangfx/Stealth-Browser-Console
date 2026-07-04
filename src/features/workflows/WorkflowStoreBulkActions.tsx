import { Download, RefreshCw } from "lucide-react";
import { HubBulkActionButton } from "@tool-workspace/hub-ui";

export type WorkflowStoreBulkActionsProps = {
  hasSelection: boolean;
  canInstall: boolean;
  installLabel: string;
  loading: boolean;
  onRefresh: () => void;
  onInstall: () => void;
};

export function WorkflowStoreBulkActions({
  hasSelection,
  canInstall,
  installLabel,
  loading,
  onRefresh,
  onInstall,
}: WorkflowStoreBulkActionsProps) {
  return (
    <>
      <HubBulkActionButton
        icon={<RefreshCw size={14} aria-hidden />}
        label="Refresh"
        title="Reload catalog from Supabase and Drive"
        tone="neutral"
        disabled={loading}
        onClick={onRefresh}
      />
      <HubBulkActionButton
        icon={<Download size={14} aria-hidden />}
        label={installLabel}
        title={hasSelection ? `${installLabel} selected workflows` : "Select workflows to install"}
        tone="sky"
        disabled={!canInstall || loading}
        onClick={onInstall}
      />
    </>
  );
}
