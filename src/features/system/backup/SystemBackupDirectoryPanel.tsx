import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  HubSplitDirectoryPane,
  KpiStrip,
  hubDirectoryListResetKey,
  resolveDirectoryPanelFillRows,
  type KpiTileData,
  type TabHeaderStatItem,
} from "@tool-workspace/hub-ui";
import type { ProfileRow, ProfileStorageStat } from "../../../types";
import { useProfileDirectoryPageSize } from "../../profiles/useProfileDirectoryPageSize";
import { SystemBackupHubChrome } from "../SystemBackupHubChrome";
import { SystemBackupDirectoryTable } from "./SystemBackupDirectoryTable";
import { SystemBackupFilterPane } from "./SystemBackupFilterPane";

export const SystemBackupDirectoryPanel = memo(function SystemBackupDirectoryPanel({
  profiles,
  total,
  search,
  setSearch,
  filterSearch: filterSearchProp,
  queryPending = false,
  selectedGroupIds,
  setSelectedGroupIds,
  selectedStatuses,
  setSelectedStatuses,
  pageIndex,
  onPageChange,
  busy,
  jobBusy,
  storageById,
  lastBackupById,
  selectedIds,
  selectedCount,
  allVisibleSelected,
  onToggleSelect,
  onToggleSelectAll,
  onBackupSelected,
  onBackupAll,
  onRestore,
  onEditSingle,
  onEditBulk,
  onOpenDetail,
  headerActions,
  centerStats,
  kpis,
  rail,
  groups,
  catalogStats,
}: {
  profiles: ProfileRow[];
  total: number;
  search: string;
  setSearch: (value: string) => void;
  filterSearch?: string;
  queryPending?: boolean;
  selectedGroupIds: string[];
  setSelectedGroupIds: (values: string[]) => void;
  selectedStatuses: ProfileRow["status"][];
  setSelectedStatuses: (values: ProfileRow["status"][]) => void;
  pageIndex: number;
  onPageChange: (index: number) => void;
  busy: boolean;
  jobBusy: boolean;
  storageById: Record<string, ProfileStorageStat>;
  lastBackupById: Record<string, string | undefined>;
  selectedIds: Set<string>;
  selectedCount: number;
  allVisibleSelected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onBackupSelected: () => void;
  onBackupAll: () => void;
  onRestore: () => void;
  onEditSingle: () => void;
  onEditBulk: () => void;
  onOpenDetail?: (profile: ProfileRow) => void;
  headerActions?: ReactNode;
  centerStats: TabHeaderStatItem[];
  kpis?: KpiTileData[];
  rail: ReactNode;
  groups: import("../../../types").StealthGroup[];
  catalogStats: import("../../../types").ProfileCatalogStats | null;
}) {
  const pageSize = useProfileDirectoryPageSize();
  const filterSearch = filterSearchProp ?? search;
  const listResetKey = hubDirectoryListResetKey(filterSearch, {
    group: selectedGroupIds,
    status: selectedStatuses,
  });
  const panelFillRows = resolveDirectoryPanelFillRows(pageSize, profiles.length);
  const directoryBodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    directoryBodyRef.current?.scrollTo?.(0, 0);
  }, [listResetKey, profiles.length, pageIndex]);

  const emptyMessage = busy
    ? "Loading profiles…"
    : profiles.length === 0
      ? "No profiles in catalog."
      : undefined;

  const filterBar = useMemo(
    () => (
      <SystemBackupFilterPane
        search={search}
        setSearch={(value) => {
          setSearch(value);
          onPageChange(0);
        }}
        queryPending={queryPending}
        shownProfiles={profiles.length}
        totalProfiles={total}
        selectedCount={selectedCount}
        jobBusy={jobBusy}
        groups={groups}
        catalogStats={catalogStats}
        selectedGroupIds={selectedGroupIds}
        setSelectedGroupIds={(values) => {
          setSelectedGroupIds(values);
          onPageChange(0);
        }}
        selectedStatuses={selectedStatuses}
        setSelectedStatuses={(values) => {
          setSelectedStatuses(values);
          onPageChange(0);
        }}
        onBackupSelected={onBackupSelected}
        onBackupAll={onBackupAll}
        onRestore={onRestore}
        onEditSingle={onEditSingle}
        onEditBulk={onEditBulk}
      />
    ),
    [
      catalogStats,
      groups,
      jobBusy,
      onBackupAll,
      onBackupSelected,
      onEditBulk,
      onEditSingle,
      onPageChange,
      onRestore,
      profiles.length,
      queryPending,
      search,
      selectedCount,
      selectedGroupIds,
      selectedStatuses,
      setSearch,
      setSelectedGroupIds,
      setSelectedStatuses,
      total,
    ],
  );

  return (
    <SystemBackupHubChrome centerStats={centerStats} headerActions={headerActions}>
      <div className="stealth-profile-layout flex min-h-0 flex-1 overflow-hidden">
        <div className="stealth-profile-directory-pane min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">
          <HubSplitDirectoryPane
            className="stealth-profile-directory-frame stealth-system-backup-directory-frame hub-directory-frame"
            panelFillRows={panelFillRows}
            partialPagePad="invisible"
            kpiBand={kpis?.length ? <KpiStrip items={kpis} /> : undefined}
            filterBar={filterBar}
          >
            <div ref={directoryBodyRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <SystemBackupDirectoryTable
                items={profiles}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onToggleSelectAll={onToggleSelectAll}
                allVisibleSelected={allVisibleSelected}
                storageById={storageById}
                lastBackupById={lastBackupById}
                emptyMessage={emptyMessage}
                resetKey={listResetKey}
                pageSize={pageSize}
                searchQuery={search}
                onOpenDetail={onOpenDetail}
                serverPagination={{
                  total,
                  pageIndex,
                  onPageChange,
                }}
              />
            </div>
          </HubSplitDirectoryPane>
        </div>
        {rail}
      </div>
    </SystemBackupHubChrome>
  );
});
