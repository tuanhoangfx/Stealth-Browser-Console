import { useMemo } from "react";
import {
  CheckCircle2,
  Clock,
  Hash,
  History,
  Loader2,
  Terminal,
  Timer,
  Workflow,
  XCircle,
} from "lucide-react";
import { HubPanel, compactIconSize } from "@tool-workspace/hub-ui";
import { formatDateTime, formatDurationMs } from "../../lib/run-display";
import type { RunHistoryItem } from "../../types";
import { StealthConsoleChannelBadge, inferStealthConsoleChannel } from "./StealthConsoleChannelBadge";
import { useRunLogs } from "./RunLogsContext";

const CONSOLE_RENDER_LIMIT = 200;
const ICON = compactIconSize(12);
const ICON_SM = compactIconSize(10);

function formatLogTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function lineClass(log: { level: string }) {
  if (log.level === "error") return "stealth-term__line--error";
  if (log.level === "success") return "stealth-term__line--ok";
  if (log.level === "warn") return "stealth-term__line--warn";
  return "";
}

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
      <div className="stealth-term">
        <div className="stealth-term__legend">
          <StealthConsoleChannelBadge channel="workflow" />
          <StealthConsoleChannelBadge channel="profile" />
          <StealthConsoleChannelBadge channel="backup" />
          <StealthConsoleChannelBadge channel="system" />
        </div>
        <div className="stealth-term__body font-mono text-xs leading-5">
          {visibleLogs.length === 0 ? (
            <div className="text-hub-muted">System output will appear here…</div>
          ) : (
            visibleLogs.map((log) => {
              const channel = inferStealthConsoleChannel(log.source);
              return (
                <div key={log.id} className={`stealth-term__line ${lineClass(log)}`.trim()}>
                  <span className="stealth-term__time">[{formatLogTime(log.time)}]</span>
                  <StealthConsoleChannelBadge channel={channel} compact />
                  <span className="stealth-term__src">{log.source}</span>
                  <span className="stealth-term__msg">{log.message}</span>
                </div>
              );
            })
          )}
          {logs.length > CONSOLE_RENDER_LIMIT ? (
            <div className="text-hub-muted">
              Showing latest {CONSOLE_RENDER_LIMIT} of {logs.length} lines
            </div>
          ) : null}
        </div>
      </div>
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
  return (
    <HubPanel
      title="Run History"
      titleIcon={<History size={compactIconSize(14)} className="text-indigo-300/90" aria-hidden />}
      className="stealth-runtime-history h-full min-h-0 overflow-hidden"
    >
      {backupJobLabel ? (
        <p className="mb-2 text-xs font-medium text-amber-200/95">{backupJobLabel}</p>
      ) : null}
      <ul className="stealth-history-list max-h-full space-y-0 overflow-auto">
        {entries.length === 0 ? (
          <li className="px-1 py-2 text-xs text-hub-muted">No completed runs yet.</li>
        ) : (
          entries.map((entry) => {
            const stamp = entry.finishedAt ?? entry.startedAt;
            const duration = formatDurationMs(entry.durationMs);
            const title = `${entry.workflow} · ${entry.profileName}`;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`stealth-history-list__row ${activeRunId === entry.id ? "is-active" : ""}`}
                  title={formatDateTime(stamp)}
                  onClick={() => onSelectRun(entry)}
                >
                  <span className="stealth-history-list__icon">
                    <Workflow size={ICON} className="text-sky-300/90" aria-hidden />
                  </span>
                  <div className="stealth-history-list__body">
                    <span className="stealth-history-list__time">
                      <Clock size={ICON_SM} aria-hidden />
                      {formatDateTime(stamp)}
                    </span>
                    <span className="stealth-history-list__id">
                      <Hash size={ICON_SM} aria-hidden />
                      {entry.id.slice(0, 8)}
                    </span>
                    <span className="stealth-history-list__title">
                      <RunStatusIcon status={entry.status} />
                      {title}
                    </span>
                  </div>
                  {duration ? (
                    <span className="stealth-history-list__dur">
                      <Timer size={ICON_SM} aria-hidden />
                      {duration}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </HubPanel>
  );
}
