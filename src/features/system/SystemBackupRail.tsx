import { memo } from "react";
import { ProfilesWorkflowRail } from "../profiles/ProfilesWorkflowRail";

/** System → Backup right rail — workflow picker + run history + console (backup progress in console). */
export const SystemBackupRail = memo(function SystemBackupRail({
  backupJobLabel,
}: {
  backupJobLabel?: string | null;
}) {
  return <ProfilesWorkflowRail backupJobLabel={backupJobLabel} runtimeOnly />;
});
