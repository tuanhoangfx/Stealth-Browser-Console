import {
  HubDirectoryTableShell,
  buildDirectoryColgroupForShell,
  buildDirectoryColumns,
  hubDirectoryTableClass,
  HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS,
  shouldPadDirectoryBodyToPageSize,
  useDirectoryTableSort,
} from "@tool-workspace/hub-ui";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  STEALTH_EXTENSIONS_COLUMN_META,
  toHubDirectoryColumnMeta,
  type StealthExtensionsColumnKey,
} from "../../../lib/directory-column-meta";
import type { CachedStoreExtension } from "../../../types";
import { resolveExtensionDisplayName } from "../../../lib/extension-display-name";
import {
  extensionDirectoryColumnPrefs,
  readExtensionDirectoryColumns,
} from "./extension-directory-prefs";
import { renderSystemExtensionsDirectoryBodyCell } from "./system-extensions-directory-cells";

export function extensionRowId(ext: CachedStoreExtension): string {
  if (ext.kind === "store" && ext.storeId) return `store:${ext.storeId}`;
  return `local:${ext.localKey ?? ext.unpackedPath}`;
}

function sortableExtensionValue(ext: CachedStoreExtension, key: StealthExtensionsColumnKey) {
  switch (key) {
    case "extension":
      return resolveExtensionDisplayName(ext).toLowerCase();
    case "kind":
      return ext.kind;
    case "version":
      return ext.version ?? "";
    case "storeId":
      return ext.storeId ?? ext.localKey ?? "";
    case "updated":
      return ext.updatedAt ? Date.parse(ext.updatedAt) : 0;
    case "path":
      return ext.unpackedPath;
    default:
      return "";
  }
}

export const SystemExtensionsDirectoryTable = memo(function SystemExtensionsDirectoryTable({
  items,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allVisibleSelected,
  emptyMessage,
  onOpenDetail,
  searchQuery = "",
  pageSize = 20,
  resetKey,
  serverPagination,
}: {
  items: CachedStoreExtension[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  allVisibleSelected: boolean;
  emptyMessage?: string;
  onOpenDetail?: (extension: CachedStoreExtension) => void;
  searchQuery?: string;
  pageSize?: number;
  resetKey?: string;
  serverPagination?: {
    total: number;
    pageIndex: number;
    onPageChange: (index: number) => void;
  };
}) {
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(readExtensionDirectoryColumns);

  useEffect(() => {
    const sync = () => setVisibleColumnKeys(readExtensionDirectoryColumns());
    window.addEventListener(extensionDirectoryColumnPrefs.changeEvent, sync);
    return () => window.removeEventListener(extensionDirectoryColumnPrefs.changeEvent, sync);
  }, []);

  const columns = useMemo(
    () =>
      buildDirectoryColumns(
        visibleColumnKeys as StealthExtensionsColumnKey[],
        toHubDirectoryColumnMeta(STEALTH_EXTENSIONS_COLUMN_META),
      ),
    [visibleColumnKeys],
  );
  const colgroup = useMemo(
    () => buildDirectoryColgroupForShell(columns, { showSelect: true }),
    [columns],
  );

  const sortableValue = useCallback(
    (ext: CachedStoreExtension, key: StealthExtensionsColumnKey) => sortableExtensionValue(ext, key),
    [],
  );
  const { sortKey, sortDir, onSort, sorted } = useDirectoryTableSort(
    serverPagination ? [] : items,
    "extension" as StealthExtensionsColumnKey,
    sortableValue,
    "asc",
  );
  const rows = serverPagination ? items : sorted;

  return (
    <HubDirectoryTableShell
      items={rows}
      ariaLabel="Extensions directory"
      tableClassName={`${hubDirectoryTableClass("6")} hub-directory-frame-table`}
      wrapClassName={HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS}
      paginatedShellClassName="flex min-h-0 min-w-0 flex-1 flex-col"
      flushWrap
      colgroup={colgroup}
      columns={columns}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      getRowKey={extensionRowId}
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
      onToggleSelectAll={onToggleSelectAll}
      allVisibleSelected={allVisibleSelected}
      selectAllLabel="Select all on this page"
      emptyMessage={emptyMessage}
      pageSize={pageSize}
      resetKey={resetKey}
      padBodyRowsToPageSize={shouldPadDirectoryBodyToPageSize(items.length, pageSize)}
      serverPagination={
        serverPagination
          ? {
              totalCount: serverPagination.total,
              pageIndex: serverPagination.pageIndex,
              onPageChange: serverPagination.onPageChange,
            }
          : undefined
      }
      getRowClassName={(ext) => {
        const selected = selectedIds.has(extensionRowId(ext)) ? " is-selected" : "";
        const clickable = onOpenDetail ? " cursor-pointer" : "";
        return `${selected}${clickable}`;
      }}
      onRowClick={onOpenDetail}
      renderRowCells={(ext) => (
        <>
          {columns.map((col) =>
            renderSystemExtensionsDirectoryBodyCell(col, ext, { searchQuery }),
          )}
        </>
      )}
    />
  );
});
