import { memo, useCallback, useMemo } from "react";
import { Archive } from "lucide-react";
import {
  DirectorySearchToolbar,
  HubDirectoryBulkActionBar,
  HubDirectoryToolbarSelection,
  HubSplitDirectoryFilterBar,
  type FilterValues,
} from "@tool-workspace/hub-ui";
import { StealthDisplayBandToolbar } from "../../../components/StealthDisplayBandToolbar";
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
  shownProfiles,
  totalProfiles,
  selectedCount,
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
}: {
  search: string;
  setSearch: (value: string) => void;
  shownProfiles: number;
  totalProfiles: number;
  selectedCount: number;
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
}) {
  const filters = useMemo(
    () => (catalogStats ? buildProfileFiltersFromStats(groups, catalogStats) : []),
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
      values={filterValues}
      onValuesChange={handleFilterValuesChange}
      searchTrailing={
        <HubDirectoryToolbarSelection
          visibleCount={shownProfiles}
          selectedCount={selectedCount}
          noun="profiles"
        />
      }
      toolbar={
        <DirectorySearchToolbar
          countIcon={Archive}
          shown={shownProfiles}
          total={totalProfiles}
          countLabel="profiles"
          showViewToggle={false}
          showTimeRange={false}
          showRefresh={false}
          showResultCount={false}
          displayBand={<StealthDisplayBandToolbar screen="system" />}
        />
      }
      row2Actions={
        <HubDirectoryBulkActionBar>
          <SystemBackupDirectoryBulkActions
            hasSelection={selectedCount > 0}
            restoreIntoSelected={selectedCount === 1}
            jobBusy={jobBusy}
            onBackupSelected={onBackupSelected}
            onBackupAll={onBackupAll}
            onRestore={onRestore}
          />
        </HubDirectoryBulkActionBar>
      }
    />
  );
});
