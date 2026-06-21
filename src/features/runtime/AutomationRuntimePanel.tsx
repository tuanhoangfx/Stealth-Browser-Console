import { HubPanel } from "@tool-workspace/hub-ui";
import { useRunLogs } from "./RunLogsContext";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";

function statusDot(status: string) {
  if (status === "success") return "bg-emerald-400";
  if (status === "failed") return "bg-red-400";
  return "bg-amber-400";
}

export function AutomationRuntimePanel() {
  const { logs, clearLogs } = useRunLogs();
  const { history } = useProfilesRuntime();

  return (
    <div className="stealth-runtime-stack">
      <HubPanel title="Run History" className="stealth-runtime-history h-full min-h-0 overflow-hidden">
        <div className="stealth-runtime-history__body flex flex-wrap content-start gap-1.5">
          {history.slice(0, 48).map((item) => (
            <span
              key={item.id}
              className={`inline-block h-2.5 w-2.5 rounded-full ${statusDot(item.status)}`}
              title={`${item.profileName} — ${item.status}${item.error ? `: ${item.error}` : ""}`}
            />
          ))}
          {!history.length ? <span className="text-xs text-hub-muted">No runs yet.</span> : null}
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
          {logs.map((log) => (
            <div key={log.id} className={`stealth-log-line stealth-log-line--${log.level}`}>
              <span className="text-hub-muted">[{new Date(log.time).toLocaleTimeString()}]</span>{" "}
              <span className="text-indigo-300">{log.source}</span> {log.message}
            </div>
          ))}
          {!logs.length ? <div className="text-hub-muted">Console output will appear here.</div> : null}
        </div>
      </HubPanel>
    </div>
  );
}
