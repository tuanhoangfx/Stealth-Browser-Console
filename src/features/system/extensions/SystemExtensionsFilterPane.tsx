import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  DirectorySearchToolbar,
  HubDirectoryAdaptiveEditAction,
  HubDirectoryBulkActionBar,
  HubDirectoryBulkMoreMenu,
  HubDirectoryCrudBulkActions,
  HubSplitDirectoryFilterBar,
  type FilterDef,
  type FilterValues,
  type HubDirectoryBulkMoreAction,
} from "@tool-workspace/hub-ui";
import { BookOpen, Puzzle, RefreshCw } from "lucide-react";
import { StealthDisplayBandToolbar } from "../../../components/StealthDisplayBandToolbar";
import { openStealthGuide } from "../../../lib/app-meta";
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
  onOpenBulkDetail,
  onOpenInstall,
  onDeleteSelected,
  onReloadOpenProfiles,
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
  onOpenBulkDetail?: () => void;
  onOpenInstall: () => void;
  onDeleteSelected: () => void;
  onReloadOpenProfiles?: () => void;
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

  const moreMenuItems = useMemo<HubDirectoryBulkMoreAction[]>(
    () => [
      ...(onReloadOpenProfiles
        ? [
            {
              key: "reload-open-profiles",
              label: "Reload Open Profiles",
              icon: RefreshCw,
              title: "Sync E0001 & E0002 stages and broadcast instant reload signal to all open profiles",
              onClick: () => onReloadOpenProfiles(),
            },
          ]
        : []),
      {
        key: "guide-docs",
        label: "Guide & Docs",
        icon: BookOpen,
        title: "Open P0003 Landing & Illustrated Guide (stealth.infi28.com/intro/)",
        onClick: () => openStealthGuide("guide/"),
      },
    ],
    [onReloadOpenProfiles],
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
              <>
                {onReloadOpenProfiles ? (
                  <button
                    type="button"
                    className="hub-btn hub-btn--ghost inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                    disabled={busy}
                    title="Sync E0001 & E0002 stages and broadcast instant reload signal to all open profiles"
                    onClick={onReloadOpenProfiles}
                  >
                    <RefreshCw size={13} className={busy ? "animate-spin" : ""} aria-hidden />
                    <span>Reload Open Profiles</span>
                  </button>
                ) : null}
                <HubDirectoryAdaptiveEditAction
                  selectedCount={selectedCount}
                  onEditSingle={onOpenDetailSingle}
                  onEditBulk={onOpenBulkDetail ?? onOpenDetailSingle}
                  singleLabel="Detail"
                  bulkLabel="Detail"
                />
              </>
            }
          />
          <HubDirectoryBulkMoreMenu actions={moreMenuItems} selectedCount={selectedCount} />
        </HubDirectoryBulkActionBar>
      }
    />
  );
});
