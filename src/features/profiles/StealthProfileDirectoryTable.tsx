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
  STEALTH_PROFILE_COLUMN_META as STEALTH_PROFILE_COLUMN_META,
  toHubDirectoryColumnMeta,
} from "../../lib/directory-column-meta";
import {
  profileDirectoryColumnPrefs,
  readProfileDirectoryColumns,
} from "./profile-directory-prefs";
import type { ExtensionToggles, ProfileRow } from "../../types";
import type { ExtensionIconMap } from "./useExtensionIcons";
import { renderStealthProfileDirectoryBodyCell } from "./stealth-profile-directory-cells";
import { sortableProfileValue } from "./stealth-profile-sort";

export type StealthProfileSortKey =
  | "profile"
  | "group"
  | "e0001"
  | "surfshark"
  | "status"
  | "updated"
  | "createdAt"
  | "startupUrl"
  | "proxy"
  | "note";
export type StealthProfileSortDirection = "asc" | "desc";

function profileRowKey(profile: ProfileRow) {
  return profile.id;
}

/** Golden profile directory table — P0004 UserDirectoryTable parity (HubDirectoryTableShell only). */
export const StealthProfileDirectoryTable = memo(function StealthProfileDirectoryTable({
  items,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allVisibleSelected,
  onOpen,
  onClose,
  onOpenDetail,
  runningHeadlessIds,
  globalExtensionToggles,
  extensionIcons,
  emptyMessage,
  resetKey,
  pageSize = 20,
  serverPagination,
  sortKey: controlledSortKey,
  sortDir: controlledSortDir,
  onSort: controlledOnSort,
  searchQuery = "",
}: {
  items: ProfileRow[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  allVisibleSelected: boolean;
  onOpen: (profile: ProfileRow) => void;
  onClose: (profile: ProfileRow) => void;
  onOpenDetail?: (profile: ProfileRow) => void;
  runningHeadlessIds?: ReadonlySet<string>;
  globalExtensionToggles: ExtensionToggles;
  extensionIcons?: ExtensionIconMap;
  emptyMessage?: string;
  resetKey?: string;
  pageSize?: number;
  serverPagination?: {
    total: number;
    pageIndex: number;
    onPageChange: (index: number) => void;
  };
  sortKey?: StealthProfileSortKey;
  sortDir?: StealthProfileSortDirection;
  onSort?: (key: StealthProfileSortKey) => void;
  searchQuery?: string;
}) {
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(readProfileDirectoryColumns);
  const [clockTick, setClockTick] = useState(0);

  const sortableValue = useCallback(
    (profile: ProfileRow, key: StealthProfileSortKey) => sortableProfileValue(profile, key),
    [],
  );

  const internalSort = useDirectoryTableSort(
    serverPagination ? [] : items,
    "profile" as StealthProfileSortKey,
    sortableValue,
    "asc",
  );

  const sortKey = controlledSortKey ?? internalSort.sortKey;
  const sortDir = controlledSortDir ?? internalSort.sortDir;
  const onSort = controlledOnSort ?? internalSort.onSort;
  const sorted = serverPagination ? items : internalSort.sorted;

  const hasRelativeLastOpened = useMemo(() => {
    const now = Date.now();
    return items.some((profile) => {
      const ms =
        profile.lastOpenedAt ??
        (profile.updatedAt ? Date.parse(profile.updatedAt) : undefined) ??
        (profile.createdAt ? Date.parse(profile.createdAt) : undefined);
      if (!Number.isFinite(ms) || !ms) return false;
      return now - ms <= 24 * 60 * 60 * 1000;
    });
  }, [items]);

  useEffect(() => {
    if (!hasRelativeLastOpened) return undefined;
    const timer = window.setInterval(() => setClockTick((v) => v + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [hasRelativeLastOpened]);

  useEffect(() => {
    const sync = () => setVisibleColumnKeys(readProfileDirectoryColumns());
    window.addEventListener(profileDirectoryColumnPrefs.changeEvent, sync);
    return () => window.removeEventListener(profileDirectoryColumnPrefs.changeEvent, sync);
  }, []);

  const columns = useMemo(() => {
    const built = buildDirectoryColumns(
      visibleColumnKeys as StealthProfileSortKey[],
      toHubDirectoryColumnMeta(STEALTH_PROFILE_COLUMN_META),
    );
    return built.map((col) => {
      if (col.key === "e0001" || col.key === "surfshark") {
        const src = extensionIcons?.[col.key];
        return {
          ...col,
          sortable: false,
          ...(src
            ? {
                headerImageSrc: src,
                headerEmoji: undefined,
                headerBrandIcon: undefined,
                headerIcon: undefined,
              }
            : {}),
        };
      }
      return col;
    });
  }, [visibleColumnKeys, extensionIcons]);
  const colgroup = useMemo(
    () => buildDirectoryColgroupForShell(columns, { showSelect: true }),
    [columns],
  );

  return (
    <HubDirectoryTableShell
      items={sorted}
      ariaLabel="Browser profiles"
      tableClassName={`${hubDirectoryTableClass("6")} hub-directory-frame-table`}
      wrapClassName={HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS}
      paginatedShellClassName="flex min-h-0 min-w-0 flex-1 flex-col"
      flushWrap
      colgroup={colgroup}
      columns={columns}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      getRowKey={profileRowKey}
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
      onToggleSelectAll={onToggleSelectAll}
      allVisibleSelected={allVisibleSelected}
      selectAllLabel="Select all on this page"
      emptyMessage={emptyMessage}
      pageSize={pageSize}
      resetKey={`${resetKey || ""}|clock:${clockTick}`}
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
      getRowClassName={(profile) => {
        const selected = selectedIds.has(profileRowKey(profile)) ? " is-selected" : "";
        const clickable = onOpenDetail ? " cursor-pointer" : "";
        return `${selected}${clickable}`;
      }}
      onRowClick={onOpenDetail}
      renderRowCells={(profile) => (
        <>
          {columns.map((col) =>
            renderStealthProfileDirectoryBodyCell(col, profile, searchQuery, {
              onOpen,
              onClose,
              runningHeadlessIds,
              globalExtensionToggles,
            }),
          )}
        </>
      )}
    />
  );
});
