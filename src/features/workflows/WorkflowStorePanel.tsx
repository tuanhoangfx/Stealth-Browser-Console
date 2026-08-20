import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useHubDirectorySelection, type HubViewMode } from "@tool-workspace/hub-ui";
import { useWorkflowEditor } from "../../context/workflow-editor-context";
import { useStealthHubListPrefs } from "../../lib/useStealthHubListPrefs";
import {
  fetchWorkflowStorePayload,
  loadWorkflowStoreCatalog,
  markStoreWorkflowInstalled,
  readInstalledStoreIds,
} from "./workflow-store-sources";
import { filterWorkflowStoreEntries } from "./workflow-store-filters";
import type { WorkflowStoreEntry } from "./workflow-store-types";
import { WorkflowStoreBulkActions } from "./WorkflowStoreBulkActions";
import { WorkflowStoreDirectoryPanel } from "./WorkflowStoreDirectoryPanel";
import { readWorkflowStoreViewMode, writeWorkflowStoreViewMode } from "./workflow-store-view-prefs";
import "../../theme/stealth-workflow-store.css";

const DEFAULT_PAGE_SIZE = 25;

export const WorkflowStorePanel = memo(function WorkflowStorePanel() {
  const { workflowConfigs, installWorkflowFromStore } = useWorkflowEditor();
  const [entries, setEntries] = useState<WorkflowStoreEntry[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState(() => readInstalledStoreIds());
  const [search, setSearch] = useState("");
  const [groupFilters, setGroupFilters] = useState<string[]>([]);
  const [platformFilters, setPlatformFilters] = useState<string[]>([]);
  const [sourceFilters, setSourceFilters] = useState<string[]>([]);
  const [tablePageSize, setTablePageSize] = useState(DEFAULT_PAGE_SIZE);
  const [viewMode, setViewMode] = useState<HubViewMode>(() => readWorkflowStoreViewMode());
  const hubPrefs = useStealthHubListPrefs();

  const handleViewModeChange = useCallback((mode: HubViewMode) => {
    setViewMode(mode);
    writeWorkflowStoreViewMode(mode);
  }, []);

  const localIds = useMemo(() => new Set(workflowConfigs.map((item) => item.id)), [workflowConfigs]);

  const filteredEntries = useMemo(
    () =>
      filterWorkflowStoreEntries(
        entries,
        search,
        groupFilters,
        platformFilters,
        sourceFilters,
        hubPrefs.range,
      ),
    [entries, search, groupFilters, platformFilters, sourceFilters, hubPrefs.range],
  );

  const storeRowId = useCallback((entry: WorkflowStoreEntry) => entry.id, []);

  const {
    selectedIds: bulkSelectedIds,
    setSelectedIds: setBulkSelectedIds,
    selectedRows: bulkSelectedEntries,
    toggleSelect: toggleBulkSelect,
    toggleSelectAll: toggleBulkSelectAll,
    allVisibleSelected: bulkAllVisibleSelected,
  } = useHubDirectorySelection(filteredEntries, storeRowId);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadWorkflowStoreCatalog();
      setEntries(result.entries);
      setErrors(result.errors);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setInstalledIds(readInstalledStoreIds());
    void refresh();
  }, [refresh]);

  const handleInstall = useCallback(
    async (entry: WorkflowStoreEntry) => {
      setInstallingId(entry.id);
      try {
        const payload = await fetchWorkflowStorePayload(entry);
        installWorkflowFromStore(payload, { replaceExisting: localIds.has(entry.id) });
        markStoreWorkflowInstalled(entry.id);
        setInstalledIds(readInstalledStoreIds());
      } catch (err) {
        setErrors((current) => [...current, err instanceof Error ? err.message : "Install failed"]);
      } finally {
        setInstallingId(null);
      }
    },
    [installWorkflowFromStore, localIds],
  );

  const handleBulkInstall = useCallback(async () => {
    const targets = bulkSelectedEntries.length > 0 ? bulkSelectedEntries : [];
    for (const entry of targets) {
      await handleInstall(entry);
    }
    setBulkSelectedIds(new Set());
  }, [bulkSelectedEntries, handleInstall, setBulkSelectedIds]);

  const bulkHasLocal = bulkSelectedEntries.some((entry) => localIds.has(entry.id));
  const installLabel = bulkHasLocal ? "Update" : "Install";

  const errorBanner =
    errors.length > 0 ? (
      <div className="stealth-workflow-store-panel__errors" role="status">
        {errors.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </div>
    ) : null;

  return (
    <WorkflowStoreDirectoryPanel
      entries={entries}
      filteredEntries={filteredEntries}
      search={search}
      setSearch={setSearch}
      groupFilters={groupFilters}
      setGroupFilters={setGroupFilters}
      platformFilters={platformFilters}
      setPlatformFilters={setPlatformFilters}
      sourceFilters={sourceFilters}
      setSourceFilters={setSourceFilters}
      bulkSelectedIds={bulkSelectedIds}
      bulkAllVisibleSelected={bulkAllVisibleSelected}
      toggleBulkSelectAll={toggleBulkSelectAll}
      toggleBulkSelect={toggleBulkSelect}
      bulkActions={
        <WorkflowStoreBulkActions
          hasSelection={bulkSelectedIds.size > 0}
          canInstall={bulkSelectedIds.size > 0 && !installingId}
          installLabel={installLabel}
          loading={loading || Boolean(installingId)}
          onInstall={() => void handleBulkInstall()}
        />
      }
      localIds={localIds}
      installedIds={installedIds}
      onInstall={(entry) => void handleInstall(entry)}
      tablePageSize={tablePageSize}
      onTablePageSizeChange={setTablePageSize}
      installingId={installingId}
      loading={loading}
      errors={errorBanner}
      viewMode={viewMode}
      onViewModeChange={handleViewModeChange}
      timeRange={hubPrefs.range}
    />
  );
});
