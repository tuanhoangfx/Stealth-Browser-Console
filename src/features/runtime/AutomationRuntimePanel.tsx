import { useMemo } from "react";
import { HubPanel } from "@tool-workspace/hub-ui";
import { useRunLogs } from "./RunLogsContext";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";

const CONSOLE_RENDER_LIMIT = 120;

function statusDot(status: string) {
  if (status === "success") return "bg-emerald-400";
  if (status === "failed") return "bg-red-400";
  return "bg-amber-400";
}

export function AutomationRuntimePanel({ backupJobLabel = null }: { backupJobLabel?: string | null }) {
  const { logs, clearLogs } = useRunLogs();
  const { history } = useProfilesRuntime();
  const backupLogs = useMemo(
    () => logs.filter((log) => log.source === "Backup").slice(0, 12),
    [logs],
  );
  const visibleConsoleLogs = useMemo(() => logs.slice(0, CONSOLE_RENDER_LIMIT), [logs]);

  return (
    <div className="stealth-runtime-stack">
      <HubPanel title="Run History" className="stealth-runtime-history h-full min-h-0 overflow-hidden">
        <div className="stealth-runtime-history__body flex flex-col gap-2">
          {backupJobLabel ? (
            <p className="text-xs font-medium text-amber-200/95">{backupJobLabel}</p>
          ) : null}
          {backupLogs.length ? (
            <ul className="space-y-1 text-[11px] leading-snug text-hub-muted">
              {backupLogs.map((log) => (
                <li key={log.id} className="truncate" title={log.message}>
                  <span className="text-indigo-300">Backup</span> {log.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap content-start gap-1.5">
            {history.slice(0, 48).map((item) => (
              <span
                key={item.id}
                className={`inline-block h-2.5 w-2.5 rounded-full ${statusDot(item.status)}`}
                title={`${item.profileName} — ${item.status}${item.error ? `: ${item.error}` : ""}`}
              />
            ))}
            {!history.length && !backupLogs.length && !backupJobLabel ? (
              <span className="text-xs text-hub-muted">No runs yet.</span>
            ) : null}
          </div>
        </div>
      </HubPanel>
      <HubPanel
        title="Console"
        className="stealth-runtime-console h-full min-h-0 overflow-hidden"
        actions={
          <button type="button" className="hub-btn hub-btn--ghost text-xs" onClick={clearLogs}>
            Clear
          </button>
        }
      >
        <div className="stealth-console-log font-mono text-xs leading-5">
          {visibleConsoleLogs.map((log) => (
            <div key={log.id} className={`stealth-log-line stealth-log-line--${log.level}`}>
              <span className="text-hub-muted">[{new Date(log.time).toLocaleTimeString()}]</span>{" "}
              <span className="text-indigo-300">{log.source}</span> {log.message}
            </div>
          ))}
          {!logs.length ? <div className="text-hub-muted">Console output will appear here.</div> : null}
          {logs.length > CONSOLE_RENDER_LIMIT ? (
            <div className="text-hub-muted">
              Showing latest {CONSOLE_RENDER_LIMIT} of {logs.length} lines — Clear to reset.
            </div>
          ) : null}
        </div>
      </HubPanel>
    </div>
  );
}
