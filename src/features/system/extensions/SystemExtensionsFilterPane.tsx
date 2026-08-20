import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  DirectorySearchToolbar,
  HubDirectoryBulkActionBar,
  HubDirectoryCrudBulkActions,
  HubDirectoryDetailAction,
  HubSplitDirectoryFilterBar,
  type FilterDef,
  type FilterValues,
} from "@tool-workspace/hub-ui";
import { Puzzle } from "lucide-react";
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
  allVisibleSelected,
  onToggleSelectAll,
  busy,
  onOpenDetailSingle,
  onOpenInstall,
  onDeleteSelected,
}: {
  cached: CachedStoreExtension[];
  search: string;
  setSearch: (value: string) => void;
  selectedKinds: ExtensionKindFilter[];
  setSelectedKinds: (values: ExtensionKindFilter[]) => void;
  filteredCount: number;
  catalogCount: number;
  selectedCount: number;
  allVisibleSelected: boolean;
  onToggleSelectAll: () => void;
  busy: boolean;
  onOpenDetailSingle: () => void;
  onOpenInstall: () => void;
  onDeleteSelected: () => void;
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
          displayBand={<StealthDisplayBandToolbar screen="system" systemTab="extensions" />}
        />
      }
      row2Actions={
        <HubDirectoryBulkActionBar
          selectAll={{
            visibleCount: filteredCount,
            selectedCount,
            allVisibleSelected,
            onToggleSelectAll,
            noun: "extensions",
          }}
        >
          <HubDirectoryCrudBulkActions
            embedded
            hasSelection={selectedCount > 0}
            selectedCount={selectedCount}
            onPrimary={onOpenInstall}
            onEdit={onOpenDetailSingle}
            onDelete={onDeleteSelected}
            primaryDisabled={busy}
            deleteDisabled={busy}
            primaryTitle="Install from Chrome Web Store"
            hideEdit
            beforeDelete={
              <HubDirectoryDetailAction
                disabled={selectedCount !== 1}
                onClick={onOpenDetailSingle}
              />
            }
          />
        </HubDirectoryBulkActionBar>
      }
    />
  );
});
