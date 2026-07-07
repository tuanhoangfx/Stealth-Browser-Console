import {
  HubDirectoryTableShell,
  buildDirectoryColgroupForShell,
  buildDirectoryColumns,
  hubDirectoryTableClass,
  HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS,
  resolveHubBrandIcon,
  shouldPadDirectoryBodyToPageSize,
  useDirectoryTableSort,
} from "@tool-workspace/hub-ui";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Cookie, Shield } from "lucide-react";
import {
  STEALTH_PROFILE_COLUMN_META as STEALTH_PROFILE_COLUMN_META,
  toHubDirectoryColumnMeta,
} from "../../lib/directory-column-meta";
import { resolveHubBrandAssetSrc } from "../../lib/hub-brand-asset-src";
import {
  profileDirectoryColumnPrefs,
  readProfileDirectoryColumns,
} from "./profile-directory-prefs";
import type { ExtensionToggles, ProfileRow } from "../../types";
import { renderStealthProfileDirectoryBodyCell } from "./stealth-profile-directory-cells";
import { sortableProfileValue } from "./stealth-profile-sort";
import type { ExtensionIconMap } from "./useExtensionIcons";

const SURFSHARK_BRAND_SRC = resolveHubBrandAssetSrc(resolveHubBrandIcon("surfshark")?.src ?? "");

function makeExtIcon(src: string | null, kind: "e0001" | "surfshark") {
  const Fallback = kind === "e0001" ? Cookie : Shield;
  const fallbackClass = kind === "e0001" ? "text-orange-300" : "text-cyan-300";
  const label = kind === "e0001" ? "E0001" : "Surfshark";
  const brandSrc = kind === "surfshark" ? SURFSHARK_BRAND_SRC : null;
  const effectiveSrc = src || brandSrc;
  if (!effectiveSrc) {
    return function ExtIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
      return <Fallback size={size} className={`shrink-0 ${fallbackClass} ${className}`} aria-hidden />;
    };
  }
  return function ExtIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
    const [broken, setBroken] = useState(false);
    if (broken && !brandSrc) {
      return <Fallback size={size} className={`shrink-0 ${fallbackClass} ${className}`} aria-hidden />;
    }
    const imgSrc = broken && brandSrc ? brandSrc : effectiveSrc;
    return (
      <img
        src={imgSrc}
        width={size}
        height={size}
        className={`inline-block shrink-0 object-contain ${className}`}
        alt={label}
        draggable={false}
        onError={() => setBroken(true)}
      />
    );
  };
}

export type StealthProfileSortKey =
  | "profile"
  | "group"
  | "e0001"
  | "surfshark"
  | "status"
  | "lastOpened"
  | "createdAt"
  | "startupUrl"
  | "proxy"
  | "note";
export type StealthProfileSortDirection = "asc" | "desc";

function profileRowKey(profile: ProfileRow) {
  return profile.id;
}

/** Golden profile directory table — P0004 UserDirectoryTable parity (HubDirectoryTableShell only). */
export const StealthProfileDirectoryTable = memo(function StealthProfileDirectoryTable({
  items,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allVisibleSelected,
  onOpen,
  onClose,
  onOpenDetail,
  globalExtensionToggles,
  extensionIcons,
  emptyMessage,
  resetKey,
  pageSize = 20,
  serverPagination,
  sortKey: controlledSortKey,
  sortDir: controlledSortDir,
  onSort: controlledOnSort,
  searchQuery = "",
}: {
  items: ProfileRow[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  allVisibleSelected: boolean;
  onOpen: (profile: ProfileRow) => void;
  onClose: (profile: ProfileRow) => void;
  onOpenDetail?: (profile: ProfileRow) => void;
  globalExtensionToggles: ExtensionToggles;
  extensionIcons?: ExtensionIconMap;
  emptyMessage?: string;
  resetKey?: string;
  pageSize?: number;
  serverPagination?: {
    total: number;
    pageIndex: number;
    onPageChange: (index: number) => void;
  };
  sortKey?: StealthProfileSortKey;
  sortDir?: StealthProfileSortDirection;
  onSort?: (key: StealthProfileSortKey) => void;
  searchQuery?: string;
}) {
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(readProfileDirectoryColumns);
  const [clockTick, setClockTick] = useState(0);

  const sortableValue = useCallback(
    (profile: ProfileRow, key: StealthProfileSortKey) => sortableProfileValue(profile, key),
    [],
  );

  const internalSort = useDirectoryTableSort(
    serverPagination ? [] : items,
    "profile" as StealthProfileSortKey,
    sortableValue,
    "asc",
  );

  const sortKey = controlledSortKey ?? internalSort.sortKey;
  const sortDir = controlledSortDir ?? internalSort.sortDir;
  const onSort = controlledOnSort ?? internalSort.onSort;
  const sorted = serverPagination ? items : internalSort.sorted;

  const hasRelativeLastOpened = useMemo(() => {
    const now = Date.now();
    return items.some((profile) => {
      const ms =
        profile.lastOpenedAt ??
        (profile.updatedAt ? Date.parse(profile.updatedAt) : undefined) ??
        (profile.createdAt ? Date.parse(profile.createdAt) : undefined);
      if (!Number.isFinite(ms) || !ms) return false;
      return now - ms <= 24 * 60 * 60 * 1000;
    });
  }, [items]);

  useEffect(() => {
    if (!hasRelativeLastOpened) return undefined;
    const timer = window.setInterval(() => setClockTick((v) => v + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [hasRelativeLastOpened]);

  useEffect(() => {
    const sync = () => setVisibleColumnKeys(readProfileDirectoryColumns());
    window.addEventListener(profileDirectoryColumnPrefs.changeEvent, sync);
    return () => window.removeEventListener(profileDirectoryColumnPrefs.changeEvent, sync);
  }, []);

  const ExtIconE0001 = useMemo(() => makeExtIcon(extensionIcons?.e0001 ?? null, "e0001"), [extensionIcons?.e0001]);
  const ExtIconSurfshark = useMemo(() => makeExtIcon(extensionIcons?.surfshark ?? null, "surfshark"), [extensionIcons?.surfshark]);

  const columns = useMemo(() => {
    const built = buildDirectoryColumns(
      visibleColumnKeys as StealthProfileSortKey[],
      toHubDirectoryColumnMeta(STEALTH_PROFILE_COLUMN_META),
    );
    return built.map((col) => {
      if (col.key === "e0001") {
        return { ...col, sortable: false, headerIcon: ExtIconE0001 as unknown as LucideIcon, headerIconClassName: "" };
      }
      if (col.key === "surfshark") {
        return { ...col, sortable: false, headerIcon: ExtIconSurfshark as unknown as LucideIcon, headerIconClassName: "" };
      }
      return col;
    });
  }, [ExtIconE0001, ExtIconSurfshark, visibleColumnKeys]);
  const colgroup = useMemo(
    () => buildDirectoryColgroupForShell(columns, { showSelect: true }),
    [columns],
  );

  return (
    <HubDirectoryTableShell
      items={sorted}
      ariaLabel="Browser profiles"
      tableClassName={`${hubDirectoryTableClass("6")} hub-directory-frame-table`}
      wrapClassName={HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS}
      flushWrap
      colgroup={colgroup}
      columns={columns}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      getRowKey={profileRowKey}
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
      onToggleSelectAll={onToggleSelectAll}
      allVisibleSelected={allVisibleSelected}
      selectAllLabel="Select all on this page"
      emptyMessage={emptyMessage}
      pageSize={pageSize}
      resetKey={`${resetKey || ""}|clock:${clockTick}`}
      padBodyRowsToPageSize={shouldPadDirectoryBodyToPageSize(items.length, pageSize)}
      serverPagination={
        serverPagination
          ? {
              totalCount: serverPagination.total,
              pageIndex: serverPagination.pageIndex,
              onPageChange: serverPagination.onPageChange,
            }
          : undefined
      }
      getRowClassName={(profile) => {
        const selected = selectedIds.has(profileRowKey(profile)) ? " is-selected" : "";
        const clickable = onOpenDetail ? " cursor-pointer" : "";
        return `${selected}${clickable}`;
      }}
      onRowClick={onOpenDetail}
      renderRowCells={(profile) => (
        <>
          {columns.map((col) =>
            renderStealthProfileDirectoryBodyCell(col, profile, searchQuery, {
              onOpen,
              onClose,
              globalExtensionToggles,
            }),
          )}
        </>
      )}
    />
  );
});
