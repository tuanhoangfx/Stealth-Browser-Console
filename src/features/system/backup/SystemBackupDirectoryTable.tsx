import {
  HubDirectoryTableShell,
  buildChromeRemDirectoryColgroup,
  buildDirectoryColumns,
  hubDirectoryTableClass,
  HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS,
} from "@tool-workspace/hub-ui";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  STEALTH_BACKUP_COLUMN_META,
  toHubDirectoryColumnMeta,
  type StealthBackupColumnKey,
} from "../../../lib/directory-column-meta";
import { useStealthManualSortEnabled } from "../../../lib/stealth-manual-sort-prefs";
import type { ProfileBackupMeta, ProfileRow, ProfileStorageStat } from "../../../types";
import { renderSystemBackupDirectoryBodyCell } from "./system-backup-directory-cells";
import {
  backupDirectoryColumnPrefs,
  readBackupDirectoryColumns,
} from "./backup-directory-prefs";

function backupRowKey(profile: ProfileRow) {
  return profile.id;
}

export const SystemBackupDirectoryTable = memo(function SystemBackupDirectoryTable({
  items,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allVisibleSelected,
  storageById,
  lastBackupById,
  backupMetaById,
  runningHeadlessIds,
  rowActionBusyId,
  onRunToggle,
  onRowSnapshot,
  onRowRestoreSlot,
  emptyMessage,
  resetKey,
  pageSize,
  serverPagination,
  searchQuery = "",
  onOpenDetail,
}: {
  items: ProfileRow[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  allVisibleSelected: boolean;
  storageById: Record<string, ProfileStorageStat>;
  lastBackupById: Record<string, string | undefined>;
  backupMetaById?: Record<string, ProfileBackupMeta | undefined>;
  runningHeadlessIds?: ReadonlySet<string>;
  rowActionBusyId?: string | null;
  onRunToggle?: (profile: ProfileRow) => void;
  onRowSnapshot?: (profile: ProfileRow) => void;
  onRowRestoreSlot?: (profile: ProfileRow, slot: "latest" | "previous") => void;
  emptyMessage?: string;
  resetKey?: string;
  pageSize: number;
  serverPagination: {
    total: number;
    pageIndex: number;
    onPageChange: (index: number) => void;
  };
  searchQuery?: string;
  onOpenDetail?: (profile: ProfileRow) => void;
}) {
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(readBackupDirectoryColumns);

  useEffect(() => {
    const sync = () => setVisibleColumnKeys(readBackupDirectoryColumns());
    window.addEventListener(backupDirectoryColumnPrefs.changeEvent, sync);
    return () => window.removeEventListener(backupDirectoryColumnPrefs.changeEvent, sync);
  }, []);

  const manualSort = useStealthManualSortEnabled("p0003-backup");

  const columns = useMemo(
    () =>
      buildDirectoryColumns(
        visibleColumnKeys as StealthBackupColumnKey[],
        toHubDirectoryColumnMeta(STEALTH_BACKUP_COLUMN_META),
        { sortable: manualSort },
      ),
    [visibleColumnKeys, manualSort],
  );
  const colgroup = useMemo(
    () =>
      buildChromeRemDirectoryColgroup(columns, [
        "createdAt",
        "updated",
        "profile",
        "group",
        "status",
        "backupSlots",
        "dataSize",
        "cookies",
        "historyState",
        "folder",
        "activityLog",
      ]),
    [columns],
  );

  const [sortKey, setSortKey] = useState<StealthBackupColumnKey>("profile");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const onSort = useCallback((key: StealthBackupColumnKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  return (
    <HubDirectoryTableShell
      items={items}
      ariaLabel="Profile backup directory"
      tableClassName={`${hubDirectoryTableClass("6")} hub-directory-frame-table stealth-profile-directory-table`}
      wrapClassName={HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS}
      flushWrap
      colgroup={colgroup}
      columns={columns}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      getRowKey={backupRowKey}
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
      onToggleSelectAll={onToggleSelectAll}
      allVisibleSelected={allVisibleSelected}
      selectAllLabel="Select all on this page"
      emptyMessage={emptyMessage}
      pageSize={pageSize}
      resetKey={resetKey}
      serverPagination={{
        totalCount: serverPagination.total,
        pageIndex: serverPagination.pageIndex,
        onPageChange: serverPagination.onPageChange,
      }}
      getRowClassName={(profile) => {
        const selected = selectedIds.has(backupRowKey(profile)) ? " is-selected" : "";
        const clickable = onOpenDetail ? " cursor-pointer" : "";
        return `${selected}${clickable}`;
      }}
      onRowClick={onOpenDetail}
      renderRowCells={(profile) => (
        <>
          {columns.map((col) =>
            renderSystemBackupDirectoryBodyCell(col, profile, {
              searchQuery,
              storage: storageById[profile.id],
              lastBackupAt: lastBackupById[profile.id],
              backupMeta: backupMetaById?.[profile.id],
              runningHeadlessIds,
              rowActionBusyId,
              onRunToggle,
              onRowSnapshot,
              onRowRestoreSlot,
            }),
          )}
        </>
      )}
    />
  );
});
