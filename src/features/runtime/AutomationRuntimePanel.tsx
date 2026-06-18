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
    <>
      <HubPanel title="Run History" className="stealth-runtime-history min-h-0 flex-1 overflow-hidden">
        <div className="flex flex-wrap gap-2 p-3">
          {history.slice(0, 18).map((item) => (
            <span
              key={item.id}
              className={`inline-block h-2.5 w-2.5 rounded-full ${statusDot(item.status)}`}
              title={`${item.profileName} — ${item.status}${item.error ? `: ${item.error}` : ""}`}
            />
          ))}
          {!history.length ? <span className="text-sm text-hub-muted">No runs yet.</span> : null}
        </div>
      </HubPanel>
      <HubPanel
        title="Console"
        className="stealth-runtime-console min-h-0 flex-1 overflow-hidden"
        actions={
          <button type="button" className="hub-btn hub-btn--ghost text-xs" onClick={clearLogs}>
            Clear
          </button>
        }
      >
        <div className="stealth-console-log max-h-48 overflow-auto p-3 font-mono text-xs leading-5">
          {logs.map((log) => (
            <div key={log.id} className={`stealth-log-line stealth-log-line--${log.level}`}>
              <span className="text-hub-muted">[{new Date(log.time).toLocaleTimeString()}]</span>{" "}
              <span className="text-indigo-300">{log.source}</span> {log.message}
            </div>
          ))}
          {!logs.length ? <div className="text-hub-muted">Console output will appear here.</div> : null}
        </div>
      </HubPanel>
    </>
  );
}
