import type { ReactNode } from "react";
import { HubPaginatedDataTable } from "../content/HubPaginatedDataTable";
import {
  buildHubUserToolsModalColumns,
  HUB_USER_TOOLS_COL,
  HUB_USER_TOOLS_MODAL_TABLE_CLASS,
  HUB_USER_TOOLS_MODAL_TABLE_WRAP_CLASS,
} from "./hub-user-tools-table-meta";

export type HubUserToolsDirectoryTableProps<TRow> = {
  items: readonly TRow[];
  resetKey?: string | number | boolean | null;
  getRowKey: (row: TRow) => string;
  getToolCode: (row: TRow) => string;
  getToolName: (row: TRow) => string;
  renderCategoryCell: (row: TRow) => ReactNode;
  renderAccessCell: (row: TRow) => ReactNode;
  renderCodeSuffix?: (row: TRow) => ReactNode;
  showSelectColumn?: boolean;
  isSelected?: (row: TRow) => boolean;
  onToggleSelect?: (row: TRow) => void;
  onRowClick?: (row: TRow) => void;
  selectAriaLabel?: (row: TRow) => string;
  rowClassName?: (row: TRow) => string;
  ariaLabel?: string;
};

/** Golden User Access tools table — P0004 modal Tool access section. */
export function HubUserToolsDirectoryTable<TRow>({
  items,
  resetKey,
  getRowKey,
  getToolCode,
  getToolName,
  renderCategoryCell,
  renderAccessCell,
  renderCodeSuffix,
  showSelectColumn = false,
  isSelected,
  onToggleSelect,
  onRowClick,
  selectAriaLabel,
  rowClassName,
  ariaLabel = "Tool access table pages",
}: HubUserToolsDirectoryTableProps<TRow>) {
  const columns = buildHubUserToolsModalColumns(showSelectColumn).map((col) =>
    col.key === "select" ? { ...col, header: <span aria-hidden /> } : col,
  );

  return (
    <HubPaginatedDataTable
      items={items}
      resetKey={resetKey}
      columns={columns}
      ariaLabel={ariaLabel}
      tableClassName={HUB_USER_TOOLS_MODAL_TABLE_CLASS}
      wrapClassName={HUB_USER_TOOLS_MODAL_TABLE_WRAP_CLASS}
      renderRow={(row) => {
        const key = getRowKey(row);
        const selected = isSelected?.(row) ?? false;
        const clickable = Boolean(onRowClick);
        return (
          <tr
            key={key}
            className={`hub-users-row${selected ? " is-selected" : ""}${clickable ? " cursor-pointer" : ""}${
              rowClassName?.(row) ?? ""
            }`}
            onClick={clickable ? () => onRowClick?.(row) : undefined}
          >
            {showSelectColumn ? (
              <td className={HUB_USER_TOOLS_COL.select} onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect?.(row)}
                  className="hub-checkbox"
                  aria-label={selectAriaLabel?.(row) ?? `Grant ${getToolCode(row)}`}
                />
              </td>
            ) : null}
            <td className={`${HUB_USER_TOOLS_COL.code} font-mono text-indigo-200/90`}>
              {getToolCode(row)}
              {renderCodeSuffix?.(row)}
            </td>
            <td className={`${HUB_USER_TOOLS_COL.name} font-medium`}>{getToolName(row)}</td>
            <td className={HUB_USER_TOOLS_COL.category}>{renderCategoryCell(row)}</td>
            <td className={`${HUB_USER_TOOLS_COL.access} text-center`}>{renderAccessCell(row)}</td>
          </tr>
        );
      }}
    />
  );
}
