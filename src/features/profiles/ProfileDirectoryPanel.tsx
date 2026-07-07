import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  HubSplitDirectoryPane,
  KpiStrip,
  hubDirectoryListResetKey,
  resolveDirectoryPanelFillRows,
  type KpiTileData,
  type TabHeaderStatItem,
} from "@tool-workspace/hub-ui";
import type { ExtensionToggles, ProfileRow, ProfileCatalogStats, StealthGroup } from "../../types";
import { ProfilesHubChrome } from "./ProfilesHubChrome";
import type { ExtensionSelectionState } from "./StealthProfilesDirectoryBulkActions";
import { useExtensionIcons } from "./useExtensionIcons";
import {
  hasActiveProfileDirectoryFilters,
  resolveCatalogTotal,
  resolveProfileDirectoryVisibleTotal,
} from "./profile-directory-counts";
import { StealthProfileDirectoryTable } from "./StealthProfileDirectoryTable";
import { useProfileDirectoryChrome } from "./useProfileDirectoryChrome";

export const ProfileDirectoryPanel = memo(function ProfileDirectoryPanel({
  profiles,
  catalogStats,
  groups,
  filteredProfiles,
  filteredTotal,
  search,
  setSearch,
  selectedGroupIds,
  setSelectedGroupIds,
  selectedStatuses,
  setSelectedStatuses,
  pageSize,
  pageIndex = 0,
  onPageChange,
  sortKey,
  sortDir,
  onSort,
  onTablePageSizeChange,
  syncBusy,
  selectedProfiles,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allVisibleSelected,
  openOne,
  closeOne,
  onOpenDetail,
  globalExtensionToggles,
  extensionState,
  extensionBusy,
  onExtensionSet,
  deleteSelected,
  setShowCreate,
  onEdit,
  onGroups,
  onExport,
  onImport,
  apiStatus,
  headerActions,
  kpis,
  centerStats,
  rail,
}: {
  profiles: ProfileRow[];
  catalogStats: ProfileCatalogStats | null;
  groups: StealthGroup[];
  filteredProfiles: ProfileRow[];
  filteredTotal?: number;
  search: string;
  setSearch: (value: string) => void;
  selectedGroupIds: string[];
  setSelectedGroupIds: (values: string[]) => void;
  selectedStatuses: ProfileRow["status"][];
  setSelectedStatuses: (values: ProfileRow["status"][]) => void;
  pageSize: number;
  pageIndex?: number;
  onPageChange?: (index: number) => void;
  sortKey?: import("./StealthProfileDirectoryTable").StealthProfileSortKey;
  sortDir?: import("./StealthProfileDirectoryTable").StealthProfileSortDirection;
  onSort?: (key: import("./StealthProfileDirectoryTable").StealthProfileSortKey) => void;
  onTablePageSizeChange?: (size: number) => void;
  syncBusy: boolean;
  selectedProfiles: ProfileRow[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  allVisibleSelected: boolean;
  openOne: (profile: ProfileRow) => void;
  closeOne: (profile: ProfileRow) => void;
  onOpenDetail?: (profile: ProfileRow) => void;
  globalExtensionToggles: ExtensionToggles;
  extensionState: Record<"e0001" | "surfshark", ExtensionSelectionState>;
  extensionBusy?: boolean;
  onExtensionSet: (key: "e0001" | "surfshark", enabled: boolean) => void;
  deleteSelected: () => void;
  setShowCreate: (value: boolean) => void;
  onEdit: () => void;
  onGroups: () => void;
  onExport: () => void;
  onImport: () => void;
  apiStatus?: "checking" | "ready" | "offline";
  headerActions?: ReactNode;
  kpis?: KpiTileData[];
  centerStats: TabHeaderStatItem[];
  rail: ReactNode;
}) {
  const extensionIcons = useExtensionIcons();
  const directoryQuery = useMemo(
    () => ({ search, groupIds: selectedGroupIds, statuses: selectedStatuses }),
    [search, selectedGroupIds, selectedStatuses],
  );
  const catalogTotal = resolveCatalogTotal(catalogStats, profiles.length);
  const directoryVisibleTotal = resolveProfileDirectoryVisibleTotal(
    directoryQuery,
    catalogTotal,
    filteredTotal ?? filteredProfiles.length,
  );
  const filtersActive = hasActiveProfileDirectoryFilters(directoryQuery);
  const paginationTotal = filtersActive ? directoryVisibleTotal : catalogTotal;

  const chrome = useProfileDirectoryChrome({
    catalogStats,
    groups,
    filteredProfiles,
    totalProfiles: catalogTotal,
    shownProfiles: directoryVisibleTotal,
    search,
    setSearch,
    selectedGroupIds,
    setSelectedGroupIds,
    selectedStatuses,
    setSelectedStatuses,
    pageSize,
    onTablePageSizeChange,
    syncBusy,
    selectedProfiles,
    closeOne,
    deleteSelected,
    setShowCreate,
    onEdit,
    onGroups,
    onExport,
    onImport,
    extensionState,
    extensionIcons,
    extensionBusy,
    onExtensionSet,
  });

  const listResetKey = hubDirectoryListResetKey(search, chrome.filterValues);
  const panelFillRows = resolveDirectoryPanelFillRows(pageSize, filteredProfiles.length);
  const compactDirectoryTable =
    filteredProfiles.length > 0 && filteredProfiles.length < pageSize;
  const directoryBodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    directoryBodyRef.current?.scrollTo?.(0, 0);
  }, [listResetKey, filteredProfiles.length]);

  const emptyMessage =
    apiStatus === "offline"
      ? "CloakBrowser engine offline — check Settings or run pnpm dev in Electron."
      : filteredProfiles.length === 0
        ? "No profiles found."
        : undefined;

  return (
    <ProfilesHubChrome centerStats={centerStats} headerActions={headerActions}>
      <div className="stealth-profile-layout flex min-h-0 flex-1 overflow-hidden">
        <div
          className="stealth-profile-directory-pane min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden"
          data-hub-directory-compact={compactDirectoryTable ? "" : undefined}
        >
          <HubSplitDirectoryPane
            className="stealth-profile-directory-frame hub-directory-frame"
            panelFillRows={panelFillRows}
            kpiBand={kpis?.length ? <KpiStrip items={kpis} /> : undefined}
            filterBar={chrome.filterBar}
          >
            <div ref={directoryBodyRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <StealthProfileDirectoryTable
                items={filteredProfiles}
                selectedIds={selectedIds}
                resetKey={listResetKey}
                pageSize={pageSize}
                serverPagination={
                  onPageChange
                    ? {
                        total: paginationTotal,
                        pageIndex,
                        onPageChange,
                      }
                    : undefined
                }
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                onToggleSelect={onToggleSelect}
                onToggleSelectAll={onToggleSelectAll}
                allVisibleSelected={allVisibleSelected}
                onOpen={openOne}
                onClose={closeOne}
                onOpenDetail={onOpenDetail}
                globalExtensionToggles={globalExtensionToggles}
                extensionIcons={extensionIcons}
                searchQuery={search}
                emptyMessage={emptyMessage}
              />
            </div>
          </HubSplitDirectoryPane>
        </div>
        {rail}
      </div>
    </ProfilesHubChrome>
  );
});
