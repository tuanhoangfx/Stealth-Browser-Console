import {
  HubDirectoryTableShell,
  buildChromeRemDirectoryColgroup,
  buildDirectoryColumns,
  hubDirectoryTableClass,
  HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS,
  useDirectoryTableSort,
} from "@tool-workspace/hub-ui";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  STEALTH_PROFILE_COLUMN_META as STEALTH_PROFILE_COLUMN_META,
  toHubDirectoryColumnMeta,
} from "../../lib/directory-column-meta";
import { useStealthManualSortEnabled } from "../../lib/stealth-manual-sort-prefs";
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
  | "e0002"
  | "surfshark"
  | "status"
  | "activityLog"
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
  onBoostWaiting,
  onResetProxy,
  onOpenDetail,
  runningHeadlessIds,
  waitingReasons,
  headlessReasons,
  activityLogs,
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
  onBoostWaiting?: (profile: ProfileRow) => void;
  onResetProxy?: (profile: ProfileRow) => void;
  onOpenDetail?: (profile: ProfileRow) => void;
  runningHeadlessIds?: ReadonlySet<string>;
  waitingReasons?: Readonly<Record<string, string>>;
  headlessReasons?: Readonly<Record<string, string>>;
  activityLogs?: Readonly<Record<string, { text: string; updatedAt?: string; history?: Array<{ text: string; at: string }> }>>;
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

  const manualSort = useStealthManualSortEnabled("p0003-profiles");

  const columns = useMemo(() => {
    const built = buildDirectoryColumns(
      visibleColumnKeys as StealthProfileSortKey[],
      toHubDirectoryColumnMeta(STEALTH_PROFILE_COLUMN_META),
      { sortable: manualSort },
    );
    return built.map((col) => {
      if (col.key === "e0001" || col.key === "e0002" || col.key === "surfshark") {
        const src = extensionIcons?.[col.key] ?? col.headerImageSrc;
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
  }, [visibleColumnKeys, extensionIcons, manualSort]);
  const colgroup = useMemo(
    () =>
      buildChromeRemDirectoryColgroup(columns, [
        "createdAt",
        "updated",
        "profile",
        "group",
        "status",
        "activityLog",
        "startupUrl",
        "e0001",
        "e0002",
        "surfshark",
      ]),
    [columns],
  );

  const renderRowCells = useCallback(
    (profile: ProfileRow) => (
      <>
        {columns.map((col) =>
          renderStealthProfileDirectoryBodyCell(col, profile, searchQuery, {
            onOpen,
            onClose,
            onBoostWaiting,
            onResetProxy,
            runningHeadlessIds,
            waitingReasons,
            headlessReasons,
            activityLogs,
            globalExtensionToggles,
          }),
        )}
      </>
    ),
    [
      activityLogs,
      columns,
      globalExtensionToggles,
      headlessReasons,
      onBoostWaiting,
      onClose,
      onOpen,
      onResetProxy,
      runningHeadlessIds,
      searchQuery,
      waitingReasons,
    ],
  );

  return (
    <HubDirectoryTableShell
      items={sorted}
      ariaLabel="Browser profiles"
      tableClassName={`${hubDirectoryTableClass("6")} hub-directory-frame-table stealth-profile-directory-table`}
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
      padBodyRowsToPageSize
      serverPagination={
        serverPagination
          ? {
              totalCount: serverPagination.total,
              pageIndex: serverPagination.pageIndex,
              onPageChange: serverPagination.onPageChange,
            }
          : undefined
      }
      onRowClick={onOpenDetail}
      renderRowCells={renderRowCells}
    />
  );
});
