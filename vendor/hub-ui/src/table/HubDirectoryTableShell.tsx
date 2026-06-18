import type { ReactNode } from "react";
import { HubPaginatedTableShell } from "../content/HubPaginatedTableShell";
import { HUB_DIRECTORY_TABLE_INLINE_WRAP_CLASS } from "./directory-table-scroll";
import { DirectoryInlineTable } from "./DirectoryInlineTable";
import { DirectorySplitScrollTable } from "./DirectorySplitScrollTable";
import { hubPageAllSelected, hubTogglePageSelectAll, type HubServerPaginationControl } from "./hub-table-pagination";
import { HubTableColumnHeader, type HubTableColumnHeaderProps } from "../content/HubTableColumnHeader";
import type { HubTableColumnRole } from "./hub-table-column-meta";
import { HubSortIndicator, type HubSortDir } from "./HubSortIndicator";

export type HubDirectoryTableColumn<TKey extends string> = {
  key: TKey;
  label: string;
  role: HubTableColumnRole;
  colClass: string;
  sortable?: boolean;
  headerAlign?: "start" | "center";
  headerIcon?: HubTableColumnHeaderProps["icon"];
  headerIconClassName?: string;
};

export type HubDirectoryTableStaticColumn = {
  label: string;
  role: HubTableColumnRole;
  colClass: string;
};

export type HubDirectoryTableShellProps<TItem, TSortKey extends string> = {
  items: TItem[];
  ariaLabel: string;
  tableClassName?: string;
  columns: HubDirectoryTableColumn<TSortKey>[];
  staticColumns?: HubDirectoryTableStaticColumn[];
  sortKey: TSortKey;
  sortDir: HubSortDir;
  onSort: (key: TSortKey) => void;
  getRowKey: (item: TItem) => string;
  onRowClick?: (item: TItem) => void;
  onRowDoubleClick?: (item: TItem) => void;
  onRowMouseEnter?: (item: TItem) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
  allVisibleSelected?: boolean;
  selectAllLabel?: string;
  emptyMessage?: string;
  pageSize?: number;
  /** Reset to page 1 when search/filter/sort changes (share with card grid). */
  resetKey?: string | number | boolean | null;
  wrapClassName?: string;
  /** Inside modal section panel — no outer border/radius on table wrap. */
  flushWrap?: boolean;
  colgroup?: ReactNode;
  getRowClassName?: (item: TItem) => string;
  /** When false, row has no select checkbox (e.g. route owner row). */
  canSelectRow?: (item: TItem) => boolean;
  /** Hide pager when total rows ≤ page size. */
  hideWhenSinglePage?: boolean;
  /** Server-side page slice — see HubPaginatedTableShell.serverPagination. */
  serverPagination?: HubServerPaginationControl;
  /** Extra classes on HubPaginatedTableShell root (sheet grid: flex column). */
  paginatedShellClassName?: string;
  renderRowCells: (item: TItem) => ReactNode;
  renderStaticCells?: (item: TItem) => ReactNode;
};

/**
 * Split head/body only in flex-pane (HubSplitDirectoryPane).
 * Standalone directory screens (P0004 Hub/Users/Dashboard) use inline table + sticky thead
 * — see hub-split-scroll.css `.hub-directory-table-scroll:not(.hub-directory-table-split)`.
 */
function useSplitDirectoryScroll(wrapClassName: string) {
  return wrapClassName.includes("hub-directory-table-scroll--flex-pane");
}

/**
 * Golden directory table chrome — select column, sortable headers, pager shell.
 * Golden: P0004 HubToolsDirectoryTable · UserDirectoryTable · DashboardScreensTable.
 */
export function HubDirectoryTableShell<TItem, TSortKey extends string>({
  items,
  ariaLabel,
  tableClassName = "hub-users-table",
  columns,
  staticColumns = [],
  sortKey,
  sortDir,
  onSort,
  getRowKey,
  onRowClick,
  onRowDoubleClick,
  onRowMouseEnter,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allVisibleSelected = false,
  selectAllLabel = "Select all on this page",
  emptyMessage = "No rows match the current filters.",
  pageSize,
  resetKey,
  wrapClassName = HUB_DIRECTORY_TABLE_INLINE_WRAP_CLASS,
  flushWrap = false,
  colgroup,
  getRowClassName,
  canSelectRow,
  hideWhenSinglePage,
  serverPagination,
  paginatedShellClassName,
  renderRowCells,
  renderStaticCells,
}: HubDirectoryTableShellProps<TItem, TSortKey>) {
  const showSelect = Boolean(onToggleSelect);
  const splitScroll = useSplitDirectoryScroll(wrapClassName);

  const columnHeaderProps = (col: (typeof columns)[number]) =>
    col.headerIcon
      ? { label: col.label, icon: col.headerIcon, iconClassName: col.headerIconClassName }
      : { label: col.label, role: col.role };

  const wrapBorder = flushWrap ? "" : " rounded-2xl border border-white/5";
  const resolvedWrapClass = `hub-users-table-wrap${splitScroll ? " hub-directory-table-split" : ""} ${wrapClassName}${wrapBorder}`;

  return (
    <HubPaginatedTableShell
      items={items}
      ariaLabel={ariaLabel}
      pageSize={pageSize}
      resetKey={resetKey}
      hideWhenSinglePage={hideWhenSinglePage}
      serverPagination={serverPagination}
      className={paginatedShellClassName}
    >
      {(pageItems) => {
        const allPageSelected = hubPageAllSelected(pageItems, getRowKey, selectedIds, canSelectRow);

        const headRow = (
          <tr>
            {showSelect ? (
              <th className="hub-users-col--select" scope="col">
                <label className="hub-users-select-all">
                  <input
                    type="checkbox"
                    className="hub-checkbox"
                    checked={pageItems.length > 0 && allPageSelected}
                    onChange={() =>
                      hubTogglePageSelectAll(pageItems, getRowKey, selectedIds, onToggleSelect, canSelectRow)
                    }
                    aria-label={selectAllLabel}
                  />
                </label>
              </th>
            ) : null}
            {columns.map((col) => (
              <th key={col.key} className={col.colClass} scope="col">
                {col.sortable === false ? (
                  <span
                    className={`hub-users-th-btn hub-users-th-btn--static${col.headerAlign === "start" ? " hub-users-th-btn--align-start" : ""}`}
                  >
                    <span
                      className={`hub-users-th-label${col.headerAlign === "start" ? " hub-users-th-label--start" : ""}`}
                    >
                      <HubTableColumnHeader {...columnHeaderProps(col)} />
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="hub-users-th-btn"
                    onClick={() => onSort(col.key)}
                    aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <span className="hub-users-th-label">
                      <HubTableColumnHeader {...columnHeaderProps(col)} />
                      <HubSortIndicator active={sortKey === col.key} dir={sortDir} />
                    </span>
                  </button>
                )}
              </th>
            ))}
            {staticColumns.map((col) => (
              <th key={col.colClass + col.label} className={col.colClass} scope="col">
                <span className="hub-users-th-btn hub-users-th-btn--static">
                  <span className="hub-users-th-label">
                    <HubTableColumnHeader label={col.label} role={col.role} />
                  </span>
                </span>
              </th>
            ))}
          </tr>
        );

        const bodyRows = pageItems.map((item) => {
          const rowKey = getRowKey(item);
          const selected = selectedIds?.has(rowKey) ?? false;
          return (
            <tr
              key={rowKey}
              className={`hub-users-row${selected ? " is-selected" : ""}${getRowClassName?.(item) ?? ""}`}
              onClick={onRowClick ? () => onRowClick(item) : undefined}
              onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(item) : undefined}
              onMouseEnter={onRowMouseEnter ? () => onRowMouseEnter(item) : undefined}
            >
              {showSelect ? (
                <td className="hub-users-col--select" onClick={(e) => e.stopPropagation()}>
                  {canSelectRow?.(item) !== false ? (
                    <label className="hub-users-select-row">
                      <input
                        type="checkbox"
                        className="hub-checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect?.(rowKey)}
                        aria-label={`Select row ${rowKey}`}
                      />
                    </label>
                  ) : null}
                </td>
              ) : null}
              {renderRowCells(item)}
              {renderStaticCells?.(item)}
            </tr>
          );
        });

        if (splitScroll) {
          return (
            <DirectorySplitScrollTable
              wrapClassName={resolvedWrapClass}
              tableClassName={tableClassName}
              showSelect={showSelect}
              colgroup={colgroup}
              headRow={headRow}
              bodyRows={bodyRows}
              emptyMessage={emptyMessage}
              hasRows={pageItems.length > 0}
            />
          );
        }

        return (
          <DirectoryInlineTable
            wrapClassName={resolvedWrapClass}
            tableClassName={tableClassName}
            showSelect={showSelect}
            colgroup={colgroup}
            headRow={headRow}
            bodyRows={bodyRows}
            emptyMessage={emptyMessage}
            hasRows={pageItems.length > 0}
          />
        );
      }}
    </HubPaginatedTableShell>
  );
}

export type { HubTableColumnHeaderProps };
