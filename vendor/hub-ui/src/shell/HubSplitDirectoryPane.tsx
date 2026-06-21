import type { CSSProperties, ReactNode } from "react";

export const HUB_SPLIT_DIRECTORY_PANE_CLASS =
  "hub-split-directory-pane flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/5 bg-[var(--panel)]";

export type HubSplitDirectoryPaneVariant = "panel" | "rail";

export type HubSplitDirectoryPaneProps = {
  /** HubSplitDirectoryFilterBar — frameless FilterBar inside unified pane chrome. */
  filterBar: ReactNode;
  /** Directory table (`HubDirectoryTableShell` with `flushWrap`). */
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  variant?: HubSplitDirectoryPaneVariant;
  /** Scroll table body on panel pane (`hub-split-scroll--panel`). */
  scroll?: boolean;
  /** Fit exactly N table rows — no inner scrollbars (workflow rail). */
  fixedRows?: number;
  /**
   * Panel mode — stretch N tbody rows to fill pane height (pager flush below table).
   * Sets `--hub-directory-page-rows` on the pane root.
   */
  panelFillRows?: number;
  /** KPI strip inside unified pane — above table body (P0004 directory pane parity). */
  kpiBand?: ReactNode;
};

/**
 * Golden split-workspace directory pane — FilterBar + table in **one** frame.
 * Golden: P0001 Profiles directory · Workflow rail · P0020 split list panes.
 */
export function HubSplitDirectoryPane({
  filterBar,
  children,
  className = "",
  style,
  variant = "panel",
  scroll = false,
  fixedRows,
  panelFillRows,
  kpiBand,
}: HubSplitDirectoryPaneProps) {
  const scrollClass =
    !fixedRows && scroll && variant === "rail"
      ? " hub-split-scroll hub-split-scroll--rail"
      : !fixedRows && scroll
        ? " hub-split-scroll hub-split-scroll--panel"
        : "";

  const fixedClass = fixedRows ? " hub-split-directory-pane--fixed-rows" : "";
  const panelFillClass = panelFillRows ? " hub-directory-frame--panel-fill" : "";

  const paneStyle: CSSProperties | undefined =
    panelFillRows !== undefined
      ? ({ ...style, "--hub-directory-page-rows": String(panelFillRows) } as CSSProperties)
      : style;

  return (
    <section
      className={`${HUB_SPLIT_DIRECTORY_PANE_CLASS}${fixedClass}${panelFillClass}${className ? ` ${className}` : ""}`}
      style={paneStyle}
      {...(fixedRows ? { "data-fixed-rows": fixedRows } : {})}
      {...(panelFillRows ? { "data-panel-fill-rows": panelFillRows } : {})}
    >
      <div className="hub-split-directory-pane__filters shrink-0 border-b border-white/5 px-3 py-3">{filterBar}</div>
      {kpiBand ? (
        <div className="hub-split-directory-pane__kpi-band shrink-0 min-w-0 border-b border-white/5 px-3 py-3">
          {kpiBand}
        </div>
      ) : null}
      <div className={`hub-split-directory-pane__body flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-3${scrollClass}`}>
        {children}
      </div>
    </section>
  );
}
