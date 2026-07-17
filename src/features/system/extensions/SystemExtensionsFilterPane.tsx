import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  DirectorySearchToolbar,
  HubBulkActionButton,
  HubDirectoryBulkActionBar,
  HubSplitDirectoryFilterBar,
  type FilterDef,
  type FilterValues,
} from "@tool-workspace/hub-ui";
import { Download, Puzzle } from "lucide-react";
import { StealthDisplayBandToolbar } from "../../../components/StealthDisplayBandToolbar";
import { defaultsForPrefItems, isHubPrefVisible } from "../../../lib/display-pref-helpers";
import { SYSTEM_EXTENSIONS_DISPLAY_PREFS } from "../../../lib/display-prefs-registry";
import { applyStealthFilterLabelHints } from "../../../lib/stealth-filter-hints";
import {
  readSystemTabDisplay,
  STEALTH_SYSTEM_SUBTAB_DISPLAY,
} from "../../../lib/stealth-system-display-prefs";
import type { CachedStoreExtension } from "../../../types";
import {
  buildExtensionFilters,
  extensionFilterValuesToState,
  extensionStateToFilterValues,
  type ExtensionKindFilter,
} from "./extension-filters";

export const SystemExtensionsFilterPane = memo(function SystemExtensionsFilterPane({
  cached,
  search,
  setSearch,
  selectedKinds,
  setSelectedKinds,
  filteredCount,
  catalogCount,
  selectedCount,
  pageSize,
  onTablePageSizeChange,
  busy,
  onForceUpdateSelected,
  onOpenDetailSingle,
  onOpenInstall,
}: {
  cached: CachedStoreExtension[];
  search: string;
  setSearch: (value: string) => void;
  selectedKinds: ExtensionKindFilter[];
  setSelectedKinds: (values: ExtensionKindFilter[]) => void;
  filteredCount: number;
  catalogCount: number;
  selectedCount: number;
  pageSize: number;
  onTablePageSizeChange?: (size: number) => void;
  busy: boolean;
  onForceUpdateSelected: () => void;
  onOpenDetailSingle: () => void;
  onOpenInstall: () => void;
}) {
  const [filterTick, setFilterTick] = useState(0);

  useEffect(() => {
    const sync = () => setFilterTick((n) => n + 1);
    window.addEventListener(STEALTH_SYSTEM_SUBTAB_DISPLAY.changeEvent, sync);
    return () => window.removeEventListener(STEALTH_SYSTEM_SUBTAB_DISPLAY.changeEvent, sync);
  }, []);

  const filterDefaults = useMemo(
    () =>
      defaultsForPrefItems(
        SYSTEM_EXTENSIONS_DISPLAY_PREFS.filters,
        SYSTEM_EXTENSIONS_DISPLAY_PREFS.defaultFilterKeys,
      ),
    [],
  );

  const filters = useMemo(() => {
    void filterTick;
    const slice = readSystemTabDisplay("extensions");
    const vis = slice?.filters ?? null;
    const all = applyStealthFilterLabelHints(buildExtensionFilters(cached), "system-extensions");
    return all.filter((f: FilterDef) => isHubPrefVisible(vis, filterDefaults, f.key));
  }, [cached, filterDefaults, filterTick]);

  const filterValues = useMemo(
    () => extensionStateToFilterValues(selectedKinds),
    [selectedKinds],
  );

  const handleFilterValuesChange = useCallback(
    (values: FilterValues) => {
      setSelectedKinds(extensionFilterValuesToState(values));
    },
    [setSelectedKinds],
  );

  return (
    <HubSplitDirectoryFilterBar
      shortcutScope="system-extensions"
      placeholder="Filter by name or store id…"
      filters={filters}
      query={search}
      onQueryChange={setSearch}
      values={filterValues}
      onValuesChange={handleFilterValuesChange}
      filterSelectionToolbar={{
        visibleCount: filteredCount,
        selectedCount,
        noun: "extensions",
      }}
      toolbar={
        <DirectorySearchToolbar
          countIcon={Puzzle}
          shown={filteredCount}
          total={catalogCount}
          countLabel="extensions"
          showViewToggle={false}
          showTimeRange={false}
          showRefresh={false}
          showResultCount={false}
          showTablePageSize
          tablePageSize={pageSize}
          onTablePageSizeChange={onTablePageSizeChange}
          displayBand={<StealthDisplayBandToolbar screen="system" systemTab="extensions" />}
        />
      }
      row2Actions={
        <HubDirectoryBulkActionBar>
          <HubBulkActionButton
            icon={<Puzzle size={14} aria-hidden />}
            label="Detail"
            title={selectedCount === 1 ? "Open extension detail" : "Select one extension for detail"}
            tone="indigo"
            disabled={selectedCount !== 1}
            onClick={onOpenDetailSingle}
          />
          <HubBulkActionButton
            icon={<Download size={14} aria-hidden />}
            label="Install"
            title="Install from Web Store or load unpacked folder"
            tone="sky"
            disabled={busy}
            onClick={onOpenInstall}
          />
          <button
            type="button"
            className="hub-btn hub-btn--ghost text-xs"
            disabled={busy || selectedCount === 0}
            onClick={onForceUpdateSelected}
            title="Clear cache and re-download selected Web Store extensions"
          >
            Force update selected
          </button>
        </HubDirectoryBulkActionBar>
      }
    />
  );
});
