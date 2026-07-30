import { useMemo } from "react";
import {
  CheckCircle2,
  Loader2,
  Timer,
  XCircle,
} from "lucide-react";
import {
  HubActivityTimestampLabel,
  HubPanel,
  HubRuntimeConsoleContent,
  HubRuntimeConsoleLine,
  HubRuntimeHistoryList,
  compactIconSize,
  formatHubTimestampFull,
} from "@tool-workspace/hub-ui";
import { useWorkflowEditor } from "../../context/workflow-editor-context";
import { resolveWorkflowRunLabel } from "../workflows/resolve-workflow-run-label";
import { formatDurationMs, shortRunRef } from "../../lib/run-display";
import type { RunHistoryItem } from "../../types";
import { StealthConsoleChannelBadge, inferStealthConsoleChannel } from "./StealthConsoleChannelBadge";
import { useRunLogs, type ConsoleLog } from "./RunLogsContext";
import { StealthConsoleRailTitle } from "./stealth-console-hint";
import { StealthRunHistoryRailTitle } from "./stealth-run-history-hint";

export const STEALTH_CONSOLE_RENDER_LIMIT = 200;
const ICON_SM = compactIconSize(10);

function RunStatusIcon({ status }: { status: RunHistoryItem["status"] }) {
  if (status === "success") {
    return <CheckCircle2 size={ICON_SM} className="text-emerald-400/90" aria-hidden />;
  }
  if (status === "failed") {
    return <XCircle size={ICON_SM} className="text-red-400/90" aria-hidden />;
  }
  return <Loader2 size={ICON_SM} className="text-amber-300/90 animate-spin" aria-hidden />;
}

/** Shared console body — Profiles workflow rail + profile detail modal (filter optional). */
export function StealthConsoleContent({
  logs,
  emptyHint = "System output will appear here…",
}: {
  logs: ConsoleLog[];
  emptyHint?: string;
}) {
  return (
    <HubRuntimeConsoleContent
      logs={logs}
      renderLimit={STEALTH_CONSOLE_RENDER_LIMIT}
      emptyHint={emptyHint}
      renderLine={(log) => {
        const channel = inferStealthConsoleChannel(log.source);
        return (
          <HubRuntimeConsoleLine
            key={log.id}
            level={log.level}
            time={log.time}
            channelBadge={<StealthConsoleChannelBadge channel={channel} compact />}
            source={log.source}
            message={log.message}
          />
        );
      }}
    />
  );
}

/** System terminal — channel badges parity P0020 TodoHubBadge priority pills. */
export function StealthSystemConsolePanel() {
  const { logs, clearLogs } = useRunLogs();

  return (
    <HubPanel
      title={<StealthConsoleRailTitle showIcon />}
      className="stealth-runtime-console h-full min-h-0 overflow-hidden"
      actions={
        <button type="button" className="hub-btn hub-btn--ghost text-xs" onClick={clearLogs}>
          Clear
        </button>
      }
    >
      <StealthConsoleContent logs={logs} />
    </HubPanel>
  );
}

/** Shared run history list — workflow rail + profile detail History rail. */
export function StealthRunHistoryContent({
  entries,
  activeRunId,
  onSelectRun,
  backupJobLabel = null,
}: {
  entries: RunHistoryItem[];
  activeRunId: string | null;
  onSelectRun: (run: RunHistoryItem) => void;
  backupJobLabel?: string | null;
}) {
  const { workflowConfigs } = useWorkflowEditor();
  const rows = useMemo(
    () =>
      entries.map((entry) => {
        const stamp = entry.finishedAt ?? entry.startedAt;
        const duration = formatDurationMs(entry.durationMs);
        const taskLabel = resolveWorkflowRunLabel(entry.workflow, workflowConfigs);
        const profileLabel =
          entry.profileName.trim() ||
          (entry.profileId.trim() ? entry.profileId.trim().slice(0, 8) : "Profile");
        const runRef = entry.id ? shortRunRef(entry.id) : "";
        const runTitle = [
          formatHubTimestampFull(stamp) || undefined,
          runRef ? `#${runRef}` : undefined,
          entry.profileId.trim() || undefined,
        ]
          .filter(Boolean)
          .join(" · ");
        return {
          id: entry.id,
          active: activeRunId === entry.id,
          titleAttr: runTitle || undefined,
          onClick: () => onSelectRun(entry),
          leading: <RunStatusIcon status={entry.status} />,
          primaryRow: (
            <span className="hub-runtime-history-list__line">
              <span
                className="hub-runtime-history-profile-chip"
                title={entry.profileId.trim() || undefined}
              >
                {profileLabel}
              </span>
              <span className="hub-runtime-history-list__task">{taskLabel}</span>
              <span className="hub-runtime-history-list__meta-inline">
                <HubActivityTimestampLabel at={stamp} title={runTitle || undefined} fallback="—" />
                {duration ? (
                  <span className="hub-runtime-history-list__meta-part hub-runtime-history-list__meta-part--dur">
                    <Timer size={ICON_SM} aria-hidden />
                    {duration}
                  </span>
                ) : null}
              </span>
            </span>
          ),
        };
      }),
    [activeRunId, entries, onSelectRun, workflowConfigs],
  );

  return (
    <>
      {backupJobLabel ? (
        <p className="mb-2 text-xs font-medium text-amber-200/95">{backupJobLabel}</p>
      ) : null}
      <HubRuntimeHistoryList rows={rows} className="hub-runtime-history-list--chip-lanes" />
    </>
  );
}

/** Automation run list — chronological (P0027 ReupHistoryPanel parity). */
export function StealthRunHistoryPanel({
  entries,
  activeRunId,
  onSelectRun,
  backupJobLabel = null,
}: {
  entries: RunHistoryItem[];
  activeRunId: string | null;
  onSelectRun: (run: RunHistoryItem) => void;
  backupJobLabel?: string | null;
}) {
  return (
    <HubPanel
      title={<StealthRunHistoryRailTitle showIcon />}
      className="stealth-runtime-history h-full min-h-0 overflow-hidden"
    >
      <StealthRunHistoryContent
        entries={entries}
        activeRunId={activeRunId}
        onSelectRun={onSelectRun}
        backupJobLabel={backupJobLabel}
      />
    </HubPanel>
  );
}
