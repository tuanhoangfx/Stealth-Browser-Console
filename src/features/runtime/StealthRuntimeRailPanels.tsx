import { useMemo } from "react";
import {
  CheckCircle2,
  History,
  Loader2,
  Terminal,
  Timer,
  XCircle,
} from "lucide-react";
import {
  HubActivityTimestampLabel,
  HubPanel,
  HubRuntimeConsoleLine,
  HubRuntimeConsoleTerm,
  HubRuntimeHistoryList,
  compactIconSize,
  formatHubTimestampFull,
} from "@tool-workspace/hub-ui";
import { useWorkflowEditor } from "../../context/workflow-editor-context";
import { resolveWorkflowRunLabel } from "../workflows/resolve-workflow-run-label";
import { formatDurationMs, shortRunRef } from "../../lib/run-display";
import type { RunHistoryItem } from "../../types";
import { StealthConsoleChannelBadge, inferStealthConsoleChannel } from "./StealthConsoleChannelBadge";
import { useRunLogs } from "./RunLogsContext";

const CONSOLE_RENDER_LIMIT = 200;
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

/** System terminal — channel badges parity P0020 TodoHubBadge priority pills. */
export function StealthSystemConsolePanel() {
  const { logs, clearLogs } = useRunLogs();
  const visibleLogs = useMemo(() => logs.slice(0, CONSOLE_RENDER_LIMIT), [logs]);

  return (
    <HubPanel
      title="Console"
      titleIcon={<Terminal size={compactIconSize(14)} className="text-cyan-300/90" aria-hidden />}
      className="stealth-runtime-console h-full min-h-0 overflow-hidden"
      actions={
        <button type="button" className="hub-btn hub-btn--ghost text-xs" onClick={clearLogs}>
          Clear
        </button>
      }
    >
      <HubRuntimeConsoleTerm
        legend={
          <>
            <StealthConsoleChannelBadge channel="workflow" />
            <StealthConsoleChannelBadge channel="profile" />
            <StealthConsoleChannelBadge channel="backup" />
            <StealthConsoleChannelBadge channel="system" />
          </>
        }
      >
        {visibleLogs.length === 0 ? (
          <div className="text-hub-muted">System output will appear here…</div>
        ) : (
          visibleLogs.map((log) => {
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
          })
        )}
        {logs.length > CONSOLE_RENDER_LIMIT ? (
          <div className="text-hub-muted">
            Showing latest {CONSOLE_RENDER_LIMIT} of {logs.length} lines
          </div>
        ) : null}
      </HubRuntimeConsoleTerm>
    </HubPanel>
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
  const { workflowConfigs } = useWorkflowEditor();
  const rows = useMemo(
    () =>
      entries.map((entry) => {
        const stamp = entry.finishedAt ?? entry.startedAt;
        const duration = formatDurationMs(entry.durationMs);
        const taskLabel = resolveWorkflowRunLabel(entry.workflow, workflowConfigs);
        const runTitle = [
          formatHubTimestampFull(stamp) || undefined,
          entry.id ? `#${shortRunRef(entry.id)}` : undefined,
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
            <>
              <span className="hub-runtime-history-profile-chip">{entry.profileId.trim()}</span>
              <span className="hub-runtime-history-list__task">{taskLabel}</span>
            </>
          ),
          primaryTrailing: <RunStatusIcon status={entry.status} />,
          metaRow: (
            <>
              <span className="hub-runtime-history-list__browser">{entry.profileName.trim()}</span>
              <span className="hub-runtime-history-list__meta-part">
                <HubActivityTimestampLabel at={stamp} title={runTitle || undefined} fallback="—" />
              </span>
              {duration ? (
                <span className="hub-runtime-history-list__meta-part hub-runtime-history-list__meta-part--dur">
                  <Timer size={ICON_SM} aria-hidden />
                  {duration}
                </span>
              ) : null}
            </>
          ),
        };
      }),
    [activeRunId, entries, onSelectRun, workflowConfigs],
  );

  return (
    <HubPanel
      title="Run History"
      titleIcon={<History size={compactIconSize(14)} className="text-indigo-300/90" aria-hidden />}
      className="stealth-runtime-history h-full min-h-0 overflow-hidden"
    >
      {backupJobLabel ? (
        <p className="mb-2 text-xs font-medium text-amber-200/95">{backupJobLabel}</p>
      ) : null}
      <HubRuntimeHistoryList rows={rows} className="hub-runtime-history-list--chip-lanes" />
    </HubPanel>
  );
}
