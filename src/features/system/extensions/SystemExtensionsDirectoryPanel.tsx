import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  HubSplitDirectoryPane,
  KpiStrip,
  hubDirectoryListResetKey,
  resolveDirectoryPanelFillRows,
  type TabHeaderStatItem,
} from "@tool-workspace/hub-ui";
import type { CachedStoreExtension } from "../../../types";
import { useProfileDirectoryPageSize } from "../../profiles/useProfileDirectoryPageSize";
import { SystemExtensionsHubChrome } from "../SystemExtensionsHubChrome";
import { SystemExtensionsDirectoryTable, extensionRowId } from "./SystemExtensionsDirectoryTable";
import { SystemExtensionsFilterPane } from "./SystemExtensionsFilterPane";
import type { ExtensionKindFilter } from "./extension-filters";

export const SystemExtensionsDirectoryPanel = memo(function SystemExtensionsDirectoryPanel({
  cached,
  items,
  filteredCount,
  catalogCount,
  search,
  setSearch,
  selectedKinds,
  setSelectedKinds,
  pageIndex,
  onPageChange,
  selectedIds,
  selectedCount,
  allVisibleSelected,
  onToggleSelect,
  onToggleSelectAll,
  busy,
  onOpenDetail,
  onOpenDetailSingle,
  onOpenInstall,
  onDeleteSelected,
  headerActions,
  centerStats,
  kpis,
  rail,
}: {
  cached: CachedStoreExtension[];
  items: CachedStoreExtension[];
  filteredCount: number;
  catalogCount: number;
  search: string;
  setSearch: (value: string) => void;
  selectedKinds: ExtensionKindFilter[];
  setSelectedKinds: (values: ExtensionKindFilter[]) => void;
  pageIndex: number;
  onPageChange: (index: number) => void;
  selectedIds: Set<string>;
  selectedCount: number;
  allVisibleSelected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  busy: boolean;
  onOpenDetail?: (extension: CachedStoreExtension) => void;
  onOpenDetailSingle: () => void;
  onOpenInstall: () => void;
  onDeleteSelected: () => void;
  headerActions?: ReactNode;
  centerStats: TabHeaderStatItem[];
  kpis?: import("@tool-workspace/hub-ui").KpiTileData[];
  rail: ReactNode;
}) {
  const pageSize = useProfileDirectoryPageSize();
  const listResetKey = hubDirectoryListResetKey(search, { kind: selectedKinds });
  const panelFillRows = resolveDirectoryPanelFillRows(pageSize, items.length);
  const directoryBodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    directoryBodyRef.current?.scrollTo?.(0, 0);
  }, [listResetKey, items.length, pageIndex]);

  const emptyMessage = busy
    ? "Loading extensions…"
    : items.length === 0
      ? "No extensions match the current filters."
      : undefined;

  const filterBar = useMemo(
    () => (
      <SystemExtensionsFilterPane
        cached={cached}
        search={search}
        setSearch={setSearch}
        selectedKinds={selectedKinds}
        setSelectedKinds={setSelectedKinds}
        filteredCount={filteredCount}
        catalogCount={catalogCount}
        selectedCount={selectedCount}
        allVisibleSelected={allVisibleSelected}
        onToggleSelectAll={onToggleSelectAll}
        busy={busy}
        onOpenDetailSingle={onOpenDetailSingle}
        onOpenInstall={onOpenInstall}
        onDeleteSelected={onDeleteSelected}
      />
    ),
    [
      busy,
      cached,
      onOpenDetailSingle,
      onOpenInstall,
      onDeleteSelected,
      search,
      allVisibleSelected,
      onToggleSelectAll,
      selectedCount,
      selectedKinds,
      setSearch,
      setSelectedKinds,
      filteredCount,
      catalogCount,
    ],
  );

  return (
    <SystemExtensionsHubChrome centerStats={centerStats} headerActions={headerActions}>
      <div className="stealth-profile-layout flex min-h-0 flex-1 overflow-hidden">
        <div className="stealth-profile-directory-pane flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <HubSplitDirectoryPane
            className="stealth-profile-directory-frame stealth-system-extensions-directory-frame hub-directory-frame"
            panelFillRows={panelFillRows}
            partialPagePad="invisible"
            kpiBand={kpis?.length ? <KpiStrip items={kpis} /> : undefined}
            filterBar={filterBar}
          >
            <div ref={directoryBodyRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <SystemExtensionsDirectoryTable
                items={items}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onToggleSelectAll={onToggleSelectAll}
                allVisibleSelected={allVisibleSelected}
                emptyMessage={emptyMessage}
                onOpenDetail={onOpenDetail}
                searchQuery={search}
                pageSize={pageSize}
                resetKey={listResetKey}
                serverPagination={{
                  total: filteredCount,
                  pageIndex,
                  onPageChange,
                }}
              />
            </div>
          </HubSplitDirectoryPane>
        </div>
        {rail}
      </div>
    </SystemExtensionsHubChrome>
  );
});

export { extensionRowId };
