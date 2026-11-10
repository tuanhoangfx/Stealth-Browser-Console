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
import { bulkUpdateProfiles, reconcileProfilesP0020Bulk } from "../../api";
import { useAppToast } from "../../components/toast";
import type { ProfileCatalogStats, ProfileProxyFilterMode, ProfileRow, StealthGroup } from "../../types";
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
  selectedProxyModes?: ProfileProxyFilterMode[];
  setSelectedProxyModes?: (values: ProfileProxyFilterMode[]) => void;
  syncBusy: boolean;
  selectedProfiles: ProfileRow[];
  allVisibleSelected: boolean;
  onToggleSelectAll: () => void;
  closeOne: (profile: ProfileRow) => void;
  closeAllRunning: () => void;
  runningHeadlessCount?: number;
  deleteSelected: () => void;
  setShowCreate: (value: boolean) => void;
  onEditSingle: () => void;
  onEditBulk: () => void;
  onGroups: () => void;
  onExport: () => void;
  onImport: () => void;
  extensionState: Record<"e0001" | "e0002" | "surfshark", ExtensionSelectionState>;
  extensionIcons?: ExtensionIconMap;
  extensionBusy?: boolean;
  onExtensionSet: (key: "e0001" | "e0002" | "surfshark", enabled: boolean) => void;
  onProfilesChanged?: () => void;
}) {
  const [closeConfirm, setCloseConfirm] = useState<{ mode: "all" | "selected"; count: number } | null>(null);
  const [syncP0020Busy, setSyncP0020Busy] = useState(false);
  const [proxyBulkBusy, setProxyBulkBusy] = useState(false);
  const { pushToast } = useAppToast();
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
    selectedProxyModes = [],
    setSelectedProxyModes,
    syncBusy,
    selectedProfiles,
    allVisibleSelected,
    onToggleSelectAll,
    closeOne,
    closeAllRunning,
    runningHeadlessCount = 0,
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
    onProfilesChanged,
  } = input;

  const headedRunningCount = Math.max(0, (catalogStats?.running ?? 0) - runningHeadlessCount);

  const allSelectedStaticIp = useMemo(
    () =>
      selectedProfiles.length > 0 &&
      selectedProfiles.every(
        (p) => Boolean(p.staticIp) || /\[(?:pin-proxy|static-ip)\]/i.test(String(p.note || "")),
      ),
    [selectedProfiles],
  );

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
      buildProfileFiltersFromStats(groups, catalogStats, runningHeadlessCount),
      "profiles",
    );
    return all.filter((f) => isHubPrefVisible(hubPrefs.hubFilters ?? null, filterDefaults, f.key));
  }, [groups, catalogStats, runningHeadlessCount, hubPrefs.hubFilters, filterDefaults]);

  const filterValues = useMemo(
    () => profileStateToFilterValues(selectedGroupIds, selectedStatuses, selectedProxyModes),
    [selectedGroupIds, selectedStatuses, selectedProxyModes],
  );

  const handleFilterValuesChange = useCallback(
    (values: FilterValues) => {
      const next = profileFilterValuesToState(values);
      setSelectedGroupIds(next.groupIds);
      setSelectedStatuses(next.statuses);
      setSelectedProxyModes?.(next.proxyModes);
    },
    [setSelectedGroupIds, setSelectedStatuses, setSelectedProxyModes],
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
          showResultCount={false}
          displayBand={<StealthDisplayBandToolbar screen="profiles" />}
        />
      }
      row2Actions={
        <HubDirectoryBulkActionBar
          selectAll={{
            visibleCount: shownProfiles ?? filteredProfiles.length,
            selectedCount: selectedProfiles.length,
            allVisibleSelected,
            onToggleSelectAll,
            noun: "profiles",
          }}
        >
          <StealthProfilesDirectoryBulkActions
            hasSelection={selectedProfiles.length > 0}
            runningCount={headedRunningCount}
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
              const count = headedRunningCount;
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
            syncP0020Busy={syncP0020Busy}
            proxyBulkBusy={proxyBulkBusy}
            allSelectedStaticIp={allSelectedStaticIp}
            onResetLocalIp={() => {
              if (proxyBulkBusy) return;
              const ids = selectedProfiles.map((p) => p.id);
              setProxyBulkBusy(true);
              void bulkUpdateProfiles(ids, { resetToDefaults: true })
                .then((res) => {
                  onProfilesChanged?.();
                  pushToast(
                    ids.length > 0
                      ? `Reset ${res.count} selected profile(s) to 📍 Local IP & default auto-geo.`
                      : `Reset all ${res.count} profile(s) to 📍 Local IP & default auto-geo.`,
                    "success",
                  );
                })
                .catch((err) => {
                  pushToast(err instanceof Error ? err.message : "Failed to reset profiles to Local IP.", "error", 5500);
                })
                .finally(() => setProxyBulkBusy(false));
            }}
            onPinStaticIp={(pinned) => {
              if (proxyBulkBusy || selectedProfiles.length === 0) return;
              const ids = selectedProfiles.map((p) => p.id);
              setProxyBulkBusy(true);
              void bulkUpdateProfiles(ids, { staticIp: pinned })
                .then((res) => {
                  onProfilesChanged?.();
                  pushToast(
                    pinned
                      ? `Pinned 📌 Static IP on ${res.count} profile(s).`
                      : `Unpinned Static IP on ${res.count} profile(s).`,
                    "success",
                  );
                })
                .catch((err) => {
                  pushToast(err instanceof Error ? err.message : "Failed to update Static IP pin.", "error", 5500);
                })
                .finally(() => setProxyBulkBusy(false));
            }}
            onSyncP0020={() => {
              if (syncP0020Busy) return;
              const ids = selectedProfiles.map((p) => p.id);
              setSyncP0020Busy(true);
              void reconcileProfilesP0020Bulk(ids)
                .then((res) => {
                  if (res.mode === "selected") {
                    const svcs = res.loggedInServices?.length
                      ? ` — Active: ${res.loggedInServices.slice(0, 6).join(", ")}`
                      : "";
                    pushToast(
                      `Synced ${res.profileCount ?? ids.length} profile(s) to P0020 (${res.patchedCount ?? 0} updated / ${res.checkedRows ?? 0} rows checked)${svcs}`,
                      "success",
                      5500,
                    );
                  } else {
                    pushToast(
                      `Reconciled all profiles to P0020: ${res.patchedCount ?? 0} row(s) updated (${res.promotedToLoggedIn ?? 0} promoted to Logged In).`,
                      "success",
                      5500,
                    );
                  }
                })
                .catch((err) => {
                  pushToast(err instanceof Error ? err.message : "Failed to sync P0020 status.", "error", 5500);
                })
                .finally(() => setSyncP0020Busy(false));
            }}
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
