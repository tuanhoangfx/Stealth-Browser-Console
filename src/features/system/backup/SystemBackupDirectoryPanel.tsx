import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import {
  HUB_SPLIT_DIRECTORY_PANE_CLASS,
  KpiStrip,
  hubDirectoryListResetKey,
  resolveDirectoryPanelFillRows,
  type KpiTileData,
  type TabHeaderStatItem,
} from "@tool-workspace/hub-ui";
import type { ProfileRow, ProfileStorageStat } from "../../../types";
import { useProfileDirectoryPageSize } from "../../profiles/useProfileDirectoryPageSize";
import { SystemBackupHubChrome } from "../SystemBackupHubChrome";
import { SystemBackupDirectoryTable } from "./SystemBackupDirectoryTable";
import { SystemBackupFilterPane } from "./SystemBackupFilterPane";

export const SystemBackupDirectoryPanel = memo(function SystemBackupDirectoryPanel({
  profiles,
  total,
  search,
  setSearch,
  selectedGroupIds,
  setSelectedGroupIds,
  selectedStatuses,
  setSelectedStatuses,
  pageIndex,
  onPageChange,
  busy,
  jobBusy,
  storageById,
  lastBackupById,
  selectedIds,
  selectedCount,
  allVisibleSelected,
  onToggleSelect,
  onToggleSelectAll,
  onBackupSelected,
  onBackupAll,
  onRestore,
  headerActions,
  centerStats,
  kpis,
  rail,
  groups,
  catalogStats,
}: {
  profiles: ProfileRow[];
  total: number;
  search: string;
  setSearch: (value: string) => void;
  selectedGroupIds: string[];
  setSelectedGroupIds: (values: string[]) => void;
  selectedStatuses: ProfileRow["status"][];
  setSelectedStatuses: (values: ProfileRow["status"][]) => void;
  pageIndex: number;
  onPageChange: (index: number) => void;
  busy: boolean;
  jobBusy: boolean;
  storageById: Record<string, ProfileStorageStat>;
  lastBackupById: Record<string, string | undefined>;
  selectedIds: Set<string>;
  selectedCount: number;
  allVisibleSelected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onBackupSelected: () => void;
  onBackupAll: () => void;
  onRestore: () => void;
  headerActions?: ReactNode;
  centerStats: TabHeaderStatItem[];
  kpis?: KpiTileData[];
  rail: ReactNode;
  groups: import("../../../types").StealthGroup[];
  catalogStats: import("../../../types").ProfileCatalogStats | null;
}) {
  const pageSize = useProfileDirectoryPageSize();
  const listResetKey = hubDirectoryListResetKey(search, {
    group: selectedGroupIds,
    status: selectedStatuses,
  });
  const panelFillStyle = useMemo(() => {
    const fillRows = resolveDirectoryPanelFillRows(pageSize, profiles.length);
    return { "--hub-directory-page-rows": String(fillRows) } as CSSProperties;
  }, [profiles.length, pageSize, listResetKey]);
  const compactDirectoryTable = profiles.length > 0 && profiles.length < pageSize;
  const directoryBodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    directoryBodyRef.current?.scrollTo?.(0, 0);
  }, [listResetKey, profiles.length, pageIndex]);

  const emptyMessage = busy
    ? "Loading profiles…"
    : profiles.length === 0
      ? "No profiles in catalog."
      : undefined;

  return (
    <SystemBackupHubChrome centerStats={centerStats} headerActions={headerActions}>
      <div className="stealth-profile-layout flex min-h-0 flex-1 overflow-hidden">
        <div className="stealth-profile-directory-pane min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">
          <section
            className={`${HUB_SPLIT_DIRECTORY_PANE_CLASS} stealth-profile-directory-frame stealth-system-backup-directory-frame hub-directory-frame hub-directory-frame--panel-fill`}
            style={panelFillStyle}
            data-hub-directory-compact={compactDirectoryTable ? "" : undefined}
          >
            <div className="hub-split-directory-pane__filters shrink-0 border-b border-white/5 px-3 py-3">
              <SystemBackupFilterPane
                search={search}
                setSearch={(value) => {
                  setSearch(value);
                  onPageChange(0);
                }}
                shownProfiles={profiles.length}
                totalProfiles={total}
                selectedCount={selectedCount}
                jobBusy={jobBusy}
                groups={groups}
                catalogStats={catalogStats}
                selectedGroupIds={selectedGroupIds}
                setSelectedGroupIds={(values) => {
                  setSelectedGroupIds(values);
                  onPageChange(0);
                }}
                selectedStatuses={selectedStatuses}
                setSelectedStatuses={(values) => {
                  setSelectedStatuses(values);
                  onPageChange(0);
                }}
                onBackupSelected={onBackupSelected}
                onBackupAll={onBackupAll}
                onRestore={onRestore}
              />
            </div>
            {kpis?.length ? (
              <div className="hub-split-directory-pane__kpi-band shrink-0 min-w-0 border-b border-white/5 px-3 py-3">
                <KpiStrip items={kpis} />
              </div>
            ) : null}
            <div
              ref={directoryBodyRef}
              className="hub-split-directory-pane__body flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-3"
            >
              <SystemBackupDirectoryTable
                items={profiles}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onToggleSelectAll={onToggleSelectAll}
                allVisibleSelected={allVisibleSelected}
                storageById={storageById}
                lastBackupById={lastBackupById}
                emptyMessage={emptyMessage}
                resetKey={listResetKey}
                pageSize={pageSize}
                searchQuery={search}
                serverPagination={{
                  total,
                  pageIndex,
                  onPageChange,
                }}
              />
            </div>
          </section>
        </div>
        {rail}
      </div>
    </SystemBackupHubChrome>
  );
});
