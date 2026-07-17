import { useCallback, useMemo, useState } from "react";
import { Bot } from "lucide-react";
import {
  DirectorySearchToolbar,
  HubConfirmDialog,
  HubDirectoryBulkActionBar,
  HubSplitDirectoryFilterBar,
  type FilterValues,
} from "@tool-workspace/hub-ui";
import { StealthDisplayBandToolbar } from "../../components/StealthDisplayBandToolbar";
import { defaultsForPrefItems, isHubPrefVisible } from "../../lib/display-pref-helpers";
import { PROFILES_DISPLAY_PREFS } from "../../lib/display-prefs-registry";
import { applyStealthFilterLabelHints } from "../../lib/stealth-filter-hints";
import { useStealthHubListPrefs } from "../../lib/useStealthHubListPrefs";
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
  queryPending?: boolean;
  selectedGroupIds: string[];
  setSelectedGroupIds: (values: string[]) => void;
  selectedStatuses: ProfileRow["status"][];
  setSelectedStatuses: (values: ProfileRow["status"][]) => void;
  pageSize: number;
  onTablePageSizeChange?: (size: number) => void;
  syncBusy: boolean;
  selectedProfiles: ProfileRow[];
  closeOne: (profile: ProfileRow) => void;
  closeAllRunning: () => void;
  deleteSelected: () => void;
  setShowCreate: (value: boolean) => void;
  onEditSingle: () => void;
  onEditBulk: () => void;
  onGroups: () => void;
  onExport: () => void;
  onImport: () => void;
  extensionState: Record<"e0001" | "surfshark", ExtensionSelectionState>;
  extensionIcons?: ExtensionIconMap;
  extensionBusy?: boolean;
  onExtensionSet: (key: "e0001" | "surfshark", enabled: boolean) => void;
}) {
  const [closeConfirm, setCloseConfirm] = useState<{ mode: "all" | "selected"; count: number } | null>(null);
  const {
    catalogStats,
    groups,
    filteredProfiles,
    totalProfiles,
    shownProfiles,
    search,
    setSearch,
    queryPending = false,
    selectedGroupIds,
    setSelectedStatuses,
    setSelectedGroupIds,
    selectedStatuses,
    pageSize,
    onTablePageSizeChange,
    syncBusy,
    selectedProfiles,
    closeOne,
    closeAllRunning,
    deleteSelected,
    setShowCreate,
    onEditSingle,
    onEditBulk,
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
  const hubPrefs = useStealthHubListPrefs();
  const activeWorkflowName =
    workflowConfigs.find((workflow) => workflow.id === activeWorkflow)?.name ?? "workflow";
  const canLaunchWorkflow = selectedWorkflowCount > 0 || Boolean(activeWorkflow);

  const filterDefaults = useMemo(
    () =>
      defaultsForPrefItems(PROFILES_DISPLAY_PREFS.filters, PROFILES_DISPLAY_PREFS.defaultFilterKeys),
    [],
  );

  const filters = useMemo(() => {
    if (!catalogStats) return [];
    const all = applyStealthFilterLabelHints(
      buildProfileFiltersFromStats(groups, catalogStats),
      "profiles",
    );
    return all.filter((f) => isHubPrefVisible(hubPrefs.hubFilters ?? null, filterDefaults, f.key));
  }, [groups, catalogStats, hubPrefs.hubFilters, filterDefaults]);

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
      queryPending={queryPending}
      values={filterValues}
      onValuesChange={handleFilterValuesChange}
      filterSelectionToolbar={{
        visibleCount: shownProfiles ?? filteredProfiles.length,
        selectedCount: selectedProfiles.length,
        noun: "profiles",
      }}
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
            runningCount={catalogStats?.running ?? 0}
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
              const count = selectedProfiles.length;
              if (count > 5) {
                setCloseConfirm({ mode: "selected", count });
                return;
              }
              for (const profile of selectedProfiles) void closeOne(profile);
            }}
            onCloseAllRunning={() => {
              const count = catalogStats?.running ?? 0;
              if (count > 5) {
                setCloseConfirm({ mode: "all", count });
                return;
              }
              void closeAllRunning();
            }}
            onDelete={deleteSelected}
            onCreate={() => setShowCreate(true)}
            onEditSingle={onEditSingle}
            onEditBulk={onEditBulk}
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
    closeAllConfirmDialog: closeConfirm ? (
      <HubConfirmDialog
        open
        title={closeConfirm.mode === "all" ? "Close all running profiles?" : "Close selected profiles?"}
        message={
          closeConfirm.mode === "all"
            ? `This will close ${closeConfirm.count} browser session${closeConfirm.count === 1 ? "" : "s"}.`
            : `This will close ${closeConfirm.count} selected profile${closeConfirm.count === 1 ? "" : "s"}.`
        }
        confirmLabel={closeConfirm.mode === "all" ? "Close all" : "Close selected"}
        tone="danger"
        onConfirm={() => {
          const pending = closeConfirm;
          setCloseConfirm(null);
          if (pending.mode === "all") {
            void closeAllRunning();
            return;
          }
          for (const profile of selectedProfiles) void closeOne(profile);
        }}
        onClose={() => setCloseConfirm(null)}
      />
    ) : null,
  };
}
