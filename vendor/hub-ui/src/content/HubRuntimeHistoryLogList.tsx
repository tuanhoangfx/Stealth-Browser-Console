import type { ReactNode } from "react";

export type HubRuntimeHistoryLogRow = {
  id: string;
  active?: boolean;
  titleAttr?: string;
  onClick?: () => void;
  /** e.g. hubRuntimeConsoleLineClass('success') */
  lineClass?: string;
  time: ReactNode;
  browserBadge: ReactNode;
  task: ReactNode;
  status: ReactNode;
  duration?: ReactNode;
};

/** Run History — single log line (parity Console `hub-runtime-term__line`). */
export function HubRuntimeHistoryLogList({
  rows,
  emptyMessage = "No completed runs yet.",
  className = "",
}: {
  rows: HubRuntimeHistoryLogRow[];
  emptyMessage?: string;
  className?: string;
}) {
  return (
    <ul className={`hub-runtime-history-list hub-runtime-history-list--log max-h-full space-y-0 overflow-auto ${className}`.trim()}>
      {rows.length === 0 ? (
        <li className="hub-runtime-history-list__empty">{emptyMessage}</li>
      ) : (
        rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className={`hub-runtime-history-log-row${row.active ? " is-active" : ""}`}
              title={row.titleAttr}
              onClick={row.onClick}
            >
              <div className={`hub-runtime-term__line hub-runtime-history-log-row__line ${row.lineClass ?? ""}`.trim()}>
                {row.time}
                {row.browserBadge}
                <span className="hub-runtime-term__msg hub-runtime-history-log-row__task">{row.task}</span>
                <span className="hub-runtime-history-log-row__status">{row.status}</span>
                {row.duration}
              </div>
            </button>
          </li>
        ))
      )}
    </ul>
  );
}
