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
      icon={<span className="inline-flex text-[13px] leading-none" aria-hidden>📥</span>}
      label={installLabel}
      title={hasSelection ? `${installLabel} selected workflows` : "Select workflows to install"}
      tone="sky"
      disabled={!canInstall || loading}
      onClick={onInstall}
    />
  );
}
