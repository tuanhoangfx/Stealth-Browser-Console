import { useState } from "react";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import { StealthRunHistoryPanel, StealthSystemConsolePanel } from "./StealthRuntimeRailPanels";

export function AutomationRuntimePanel({ backupJobLabel = null }: { backupJobLabel?: string | null }) {
  const { history, replayRun } = useProfilesRuntime();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  return (
    <div className="stealth-runtime-stack">
      <StealthRunHistoryPanel
        entries={history}
        activeRunId={activeRunId}
        backupJobLabel={backupJobLabel}
        onSelectRun={(run) => {
          setActiveRunId(run.id);
          void replayRun(run);
        }}
      />
      <StealthSystemConsolePanel />
    </div>
  );
}
