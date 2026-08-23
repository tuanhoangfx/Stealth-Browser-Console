import { memo, useCallback, useMemo } from "react";
import { Archive } from "lucide-react";
import {
  DirectorySearchToolbar,
  HubDirectoryBulkActionBar,
  HubSplitDirectoryFilterBar,
  type FilterValues,
} from "@tool-workspace/hub-ui";
import { StealthDisplayBandToolbar } from "../../../components/StealthDisplayBandToolbar";
import { applyStealthFilterLabelHints } from "../../../lib/stealth-filter-hints";
import type { ProfileCatalogStats, ProfileRow, StealthGroup } from "../../../types";
import {
  buildProfileFiltersFromStats,
  profileFilterValuesToState,
  profileStateToFilterValues,
} from "../../profiles/profile-filters";
import { SystemBackupDirectoryBulkActions } from "./SystemBackupDirectoryBulkActions";

export const SystemBackupFilterPane = memo(function SystemBackupFilterPane({
  search,
  setSearch,
  queryPending = false,
  shownProfiles,
  totalProfiles,
  selectedCount,
  allVisibleSelected,
  onToggleSelectAll,
  jobBusy,
  groups,
  catalogStats,
  selectedGroupIds,
  setSelectedGroupIds,
  selectedStatuses,
  setSelectedStatuses,
  onBackupSelected,
  onBackupAll,
  onRestore,
  onEditSingle,
  onEditBulk,
}: {
  search: string;
  setSearch: (value: string) => void;
  queryPending?: boolean;
  shownProfiles: number;
  totalProfiles: number;
  selectedCount: number;
  allVisibleSelected: boolean;
  onToggleSelectAll: () => void;
  jobBusy: boolean;
  groups: StealthGroup[];
  catalogStats: ProfileCatalogStats | null;
  selectedGroupIds: string[];
  setSelectedGroupIds: (values: string[]) => void;
  selectedStatuses: ProfileRow["status"][];
  setSelectedStatuses: (values: ProfileRow["status"][]) => void;
  onBackupSelected: () => void;
  onBackupAll: () => void;
  onRestore: () => void;
  onEditSingle: () => void;
  onEditBulk: () => void;
}) {
  const filters = useMemo(
    () =>
      catalogStats
        ? applyStealthFilterLabelHints(buildProfileFiltersFromStats(groups, catalogStats), "profiles")
        : [],
    [catalogStats, groups],
  );
  const filterValues = useMemo(
    () => profileStateToFilterValues(selectedGroupIds, selectedStatuses),
    [selectedGroupIds, selectedStatuses],
  );

  const handleFilterValuesChange = useCallback(
    (values: FilterValues) => {
      const next = profileFilterValuesToState(values);
      setSelectedGroupIds(next.groupIds);
      setSelectedStatuses(next.statuses);
    },
    [setSelectedGroupIds, setSelectedStatuses],
  );

  return (
    <HubSplitDirectoryFilterBar
      shortcutScope="system-backup"
      placeholder="Search profiles…"
      filters={filters}
      query={search}
      onQueryChange={setSearch}
      queryPending={queryPending}
      values={filterValues}
      onValuesChange={handleFilterValuesChange}
      filterSelectionToolbar={{
        visibleCount: shownProfiles,
        selectedCount,
        noun: "profiles",
      }}
      toolbar={
        <DirectorySearchToolbar
          countIcon={Archive}
          shown={shownProfiles}
          total={totalProfiles}
          countLabel="profiles"
          showViewToggle={false}
          showTimeRange={false}
          showResultCount={false}
          displayBand={<StealthDisplayBandToolbar screen="system" systemTab="backup" />}
        />
      }
      row2Actions={
        <HubDirectoryBulkActionBar
          selectAll={{
            visibleCount: shownProfiles,
            selectedCount,
            allVisibleSelected,
            onToggleSelectAll,
            noun: "profiles",
          }}
        >
          <SystemBackupDirectoryBulkActions
            selectedCount={selectedCount}
            hasSelection={selectedCount > 0}
            restoreIntoSelected={selectedCount === 1}
            jobBusy={jobBusy}
            onBackupSelected={onBackupSelected}
            onBackupAll={onBackupAll}
            onRestore={onRestore}
            onEditSingle={onEditSingle}
            onEditBulk={onEditBulk}
          />
        </HubDirectoryBulkActionBar>
      }
    />
  );
});
