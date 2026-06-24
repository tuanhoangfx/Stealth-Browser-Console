/** Profile table frame — search, filters, pager toolbar, bulk actions (inbox-split left pane). */
import { memo, useMemo, useCallback } from "react";
import { Bot } from "lucide-react";
import {
  DirectorySearchToolbar,
  HubDirectoryBulkActionBar,
  HubDirectoryToolbarSelection,
  HubSplitDirectoryFilterBar,
  type FilterValues
} from "@tool-workspace/hub-ui";
import { StealthDisplayBandToolbar } from "../../components/StealthDisplayBandToolbar";
import type { ProfileRow, ProfileCatalogStats, StealthGroup } from "../../types";
import { useWorkflowRuntime } from "../../context/workflow-runtime-context";
import { StealthProfilesDirectoryBulkActions } from "./StealthProfilesDirectoryBulkActions";
import {
  buildProfileFiltersFromStats,
  profileFilterValuesToState,
  profileStateToFilterValues
} from "./profile-filters";

export type ProfileFilterPaneProps = {
  catalogStats: ProfileCatalogStats | null;
  groups: StealthGroup[];
  filteredProfiles: ProfileRow[];
  totalProfiles: number;
  shownProfiles?: number;
  search: string;
  setSearch: (value: string) => void;
  selectedGroupIds: string[];
  setSelectedGroupIds: (values: string[]) => void;
  selectedStatuses: ProfileRow["status"][];
  setSelectedStatuses: (values: ProfileRow["status"][]) => void;
  pageSize: number;
  onTablePageSizeChange?: (size: number) => void;
  syncBusy: boolean;
  selectedProfiles: ProfileRow[];
  allVisibleProfilesSelected: boolean;
  onToggleProfileSelectAll: () => void;
  openOne: (profile: ProfileRow) => void;
  closeOne: (profile: ProfileRow) => void;
  deleteSelected: () => void;
  setShowCreate: (value: boolean) => void;
  onEdit: () => void;
  onGroups: () => void;
  onExport: () => void;
  onImport: () => void;
};

export const ProfileFilterPane = memo(function ProfileFilterPane({
  catalogStats,
  groups,
  filteredProfiles,
  totalProfiles,
  shownProfiles,
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
  allVisibleProfilesSelected,
  onToggleProfileSelectAll,
  openOne,
  closeOne,
  deleteSelected,
  setShowCreate,
  onEdit,
  onGroups,
  onExport,
  onImport
}: ProfileFilterPaneProps) {
  const { runAutomationQueue, automationRunning, runWorkflowLabel } = useWorkflowRuntime();
  const filters = useMemo(
    () =>
      catalogStats
        ? buildProfileFiltersFromStats(groups, catalogStats)
        : [],
    [groups, catalogStats],
  );
  const filterValues = useMemo(
    () => profileStateToFilterValues(selectedGroupIds, selectedStatuses),
    [selectedGroupIds, selectedStatuses]
  );

  const handleFilterValuesChange = useCallback(
    (values: FilterValues) => {
      const next = profileFilterValuesToState(values);
      setSelectedGroupIds(next.groupIds);
      setSelectedStatuses(next.statuses);
    },
    [setSelectedGroupIds, setSelectedStatuses]
  );

  return (
    <HubSplitDirectoryFilterBar
      shortcutScope="profiles"
      placeholder="Search profiles…"
      filters={filters}
      query={search}
      onQueryChange={setSearch}
      values={filterValues}
      onValuesChange={handleFilterValuesChange}
      searchTrailing={
        <HubDirectoryToolbarSelection
          visibleCount={shownProfiles ?? filteredProfiles.length}
          selectedCount={selectedProfiles.length}
          noun="profiles"
        />
      }
      toolbar={
        <DirectorySearchToolbar
          countIcon={Bot}
          shown={shownProfiles ?? filteredProfiles.length}
          total={totalProfiles}
          countLabel="profiles"
          showViewToggle={false}
          showTimeRange={false}
          showRefresh={false}
          showResultCount={false}
          displayBand={<StealthDisplayBandToolbar screen="profiles" />}
        />
      }
      row2Actions={
        <HubDirectoryBulkActionBar>
          <StealthProfilesDirectoryBulkActions
            hasSelection={selectedProfiles.length > 0}
            syncBusy={syncBusy}
            launchBusy={automationRunning}
            launchTitle={`Launch with workflow: ${runWorkflowLabel} (skips startup URL)`}
            onLaunch={() => void runAutomationQueue()}
            onClose={() => {
              for (const profile of selectedProfiles) void closeOne(profile);
            }}
            onDelete={deleteSelected}
            onCreate={() => setShowCreate(true)}
            onEdit={onEdit}
            onGroups={onGroups}
            onExport={onExport}
            onImport={onImport}
          />
        </HubDirectoryBulkActionBar>
      }
    />
  );
});
