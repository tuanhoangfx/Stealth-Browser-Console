import { memo, useMemo, type ReactNode } from "react";
import {
  HubSplitDirectoryPane,
  KpiStrip,
  hubDirectoryListResetKey,
  type KpiTileData,
  type TabHeaderStatItem,
} from "@tool-workspace/hub-ui";
import type { ProfileRow, ProfileCatalogStats, StealthGroup } from "../../types";
import { ProfileFilterPane } from "./ProfileFilterPane";
import { ProfilesHubChrome } from "./ProfilesHubChrome";
import { StealthProfileDirectoryTable } from "./StealthProfileDirectoryTable";
import { profileStateToFilterValues } from "./profile-filters";

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
  const filterValues = useMemo(
    () => profileStateToFilterValues(selectedGroupIds, selectedStatuses),
    [selectedGroupIds, selectedStatuses],
  );
  const listResetKey = hubDirectoryListResetKey(search, filterValues);
  const emptyMessage =
    apiStatus === "offline"
      ? "CloakBrowser engine offline — check Settings or run pnpm dev in Electron."
      : filteredProfiles.length === 0
        ? "No profiles found."
        : undefined;

  return (
    <ProfilesHubChrome centerStats={centerStats} headerActions={headerActions}>
      <div className="stealth-profile-layout flex min-h-0 flex-1 overflow-hidden">
        <div className="stealth-profile-directory-pane min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">
          <HubSplitDirectoryPane
            className="stealth-profile-directory-frame hub-directory-frame"
            variant="panel"
            kpiBand={kpis?.length ? <KpiStrip items={kpis} /> : undefined}
            filterBar={
              <ProfileFilterPane
                catalogStats={catalogStats}
                groups={groups}
                filteredProfiles={filteredProfiles}
                totalProfiles={catalogStats?.total ?? profiles.length}
                shownProfiles={filteredTotal ?? filteredProfiles.length}
                search={search}
                setSearch={setSearch}
                selectedGroupIds={selectedGroupIds}
                setSelectedGroupIds={setSelectedGroupIds}
                selectedStatuses={selectedStatuses}
                setSelectedStatuses={setSelectedStatuses}
                pageSize={pageSize}
                onTablePageSizeChange={onTablePageSizeChange}
                syncBusy={syncBusy}
                selectedProfiles={selectedProfiles}
                allVisibleProfilesSelected={allVisibleSelected}
                onToggleProfileSelectAll={onToggleSelectAll}
                openOne={openOne}
                closeOne={closeOne}
                deleteSelected={deleteSelected}
                setShowCreate={setShowCreate}
                onEdit={onEdit}
                onGroups={onGroups}
                onExport={onExport}
                onImport={onImport}
              />
            }
          >
            <StealthProfileDirectoryTable
                items={filteredProfiles}
                selectedIds={selectedIds}
                resetKey={listResetKey}
                pageSize={pageSize}
                serverPagination={
                  onPageChange
                    ? {
                        total: filteredTotal ?? filteredProfiles.length,
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
                emptyMessage={emptyMessage}
              />
          </HubSplitDirectoryPane>
        </div>
        {rail}
      </div>
    </ProfilesHubChrome>
  );
});
