import type { ReactNode } from "react";

export type HubRuntimeHistoryRow = {
  id: string;
  active?: boolean;
  titleAttr?: string;
  onClick?: () => void;
  leading: ReactNode;
  /** Top line — ID, entity name, task label (truncates). */
  primaryRow: ReactNode;
  /** Top line — trailing status icon/badge. */
  primaryTrailing?: ReactNode;
  /** Bottom line — timestamp, duration, etc. */
  metaRow: ReactNode;
};

export function HubRuntimeHistoryList({
  rows,
  emptyMessage = "No completed runs yet.",
  className = "",
}: {
  rows: HubRuntimeHistoryRow[];
  emptyMessage?: string;
  className?: string;
}) {
  return (
    <ul className={`hub-runtime-history-list hub-scrollbar max-h-full space-y-0 overflow-auto ${className}`.trim()}>
      {rows.length === 0 ? (
        <li className="hub-runtime-history-list__empty">{emptyMessage}</li>
      ) : (
        rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className={`hub-runtime-history-list__row ${row.active ? "is-active" : ""}`}
              title={row.titleAttr}
              onClick={row.onClick}
            >
              <span className="hub-runtime-history-list__icon">{row.leading}</span>
              <div className="hub-runtime-history-list__body">
                <div className="hub-runtime-history-list__primary">
                  <span className="hub-runtime-history-list__title">{row.primaryRow}</span>
                  {row.primaryTrailing ? (
                    <span className="hub-runtime-history-list__status">{row.primaryTrailing}</span>
                  ) : null}
                </div>
                <div className="hub-runtime-history-list__meta">{row.metaRow}</div>
              </div>
            </button>
          </li>
        ))
      )}
    </ul>
  );
}
