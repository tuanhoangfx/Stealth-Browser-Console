import { useCallback, useMemo } from "react";
import { Bot } from "lucide-react";
import {
  DirectorySearchToolbar,
  HubDirectoryBulkActionBar,
  HubDirectoryToolbarSelection,
  HubSplitDirectoryFilterBar,
  type FilterValues,
} from "@tool-workspace/hub-ui";
import { StealthDisplayBandToolbar } from "../../components/StealthDisplayBandToolbar";
import type { ProfileRow, ProfileCatalogStats, StealthGroup } from "../../types";
import { useWorkflowRuntime } from "../../context/workflow-runtime-context";
import { useWorkflowPicker } from "../../context/workflow-picker-context";
import {
  StealthProfilesDirectoryBulkActions,
  type ExtensionSelectionState,
} from "./StealthProfilesDirectoryBulkActions";
import type { ExtensionIconMap } from "./useExtensionIcons";
import {
  buildProfileFiltersFromStats,
  profileFilterValuesToState,
  profileStateToFilterValues,
} from "./profile-filters";

export function useProfileDirectoryChrome(input: {
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
  closeOne: (profile: ProfileRow) => void;
  deleteSelected: () => void;
  setShowCreate: (value: boolean) => void;
  onEdit: () => void;
  onGroups: () => void;
  onExport: () => void;
  onImport: () => void;
  extensionState: Record<"e0001" | "surfshark", ExtensionSelectionState>;
  extensionIcons?: ExtensionIconMap;
  extensionBusy?: boolean;
  onExtensionSet: (key: "e0001" | "surfshark", enabled: boolean) => void;
}) {
  const {
    catalogStats,
    groups,
    filteredProfiles,
    totalProfiles,
    shownProfiles,
    search,
    setSearch,
    selectedGroupIds,
    setSelectedStatuses,
    setSelectedGroupIds,
    selectedStatuses,
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
    extensionBusy = false,
    onExtensionSet,
  } = input;

  const { runAutomationQueue, automationRunning, runWorkflowLabel } = useWorkflowRuntime();
  const { selectedWorkflowCount, activeWorkflow, workflowConfigs } = useWorkflowPicker();
  const activeWorkflowName =
    workflowConfigs.find((workflow) => workflow.id === activeWorkflow)?.name ?? "workflow";
  const canLaunchWorkflow = selectedWorkflowCount > 0 || Boolean(activeWorkflow);

  const filters = useMemo(
    () => (catalogStats ? buildProfileFiltersFromStats(groups, catalogStats) : []),
    [groups, catalogStats],
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

  const filterBar = (
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
          showTablePageSize
          tablePageSize={pageSize}
          onTablePageSizeChange={onTablePageSizeChange}
          displayBand={<StealthDisplayBandToolbar screen="profiles" />}
        />
      }
      row2Actions={
        <HubDirectoryBulkActionBar>
          <StealthProfilesDirectoryBulkActions
            hasSelection={selectedProfiles.length > 0}
            selectedCount={selectedProfiles.length}
            extensionState={extensionState}
            extensionIcons={extensionIcons}
            syncBusy={syncBusy}
            launchBusy={automationRunning}
            extensionBusy={extensionBusy}
            launchTitle={
              canLaunchWorkflow
                ? `Launch with workflow: ${selectedWorkflowCount > 0 ? runWorkflowLabel : activeWorkflowName} (skips startup URL)`
                : "Select a workflow in the right rail"
            }
            launchDisabled={!canLaunchWorkflow}
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
            onExtensionSet={onExtensionSet}
          />
        </HubDirectoryBulkActionBar>
      }
    />
  );

  return {
    filters,
    filterValues,
    handleFilterValuesChange,
    filterBar,
  };
}
