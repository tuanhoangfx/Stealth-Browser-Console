import { memo } from "react";
import { ProfilesWorkflowRail } from "../profiles/ProfilesWorkflowRail";

/** System → Extensions right rail — History + Console only (Backup parity). */
export const SystemExtensionsRail = memo(function SystemExtensionsRail({
  jobLabel = null,
}: {
  jobLabel?: string | null;
}) {
  return <ProfilesWorkflowRail backupJobLabel={jobLabel} runtimeOnly />;
});
