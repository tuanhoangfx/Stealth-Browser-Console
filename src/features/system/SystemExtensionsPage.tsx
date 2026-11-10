import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  HubConfirmDialog,
  HubDirectoryBulkDetailModal,
  searchTextIncludes,
  useHubDirectorySelection,
  type HubDirectoryBulkSelectedItem,
} from "@tool-workspace/hub-ui";
import { Puzzle, Trash2 } from "lucide-react";
import {
  fetchExtensionsStatus,
  installStoreExtension,
  listProfiles,
  reloadOpenProfilesExtensions,
  removeCachedExtensions,
} from "../../api";
import { COOKIE_BRIDGE_STORE_ID } from "../../lib/stealth-extension-store-ids";
import { useAppToast } from "../../components/toast";
import { resolveExtensionDisplayName } from "../../lib/extension-display-name";
import type { CachedStoreExtension, StealthProfile } from "../../types";
import { useProfileDirectoryPageSize } from "../profiles/useProfileDirectoryPageSize";
import { ExtensionDetailModal } from "./extensions/ExtensionDetailModal";
import { SystemExtensionsDirectoryPanel, extensionRowId } from "./extensions/SystemExtensionsDirectoryPanel";
import type { ExtensionKindFilter } from "./extensions/extension-filters";
import { matchesExtensionKpiFilter } from "./extensions/extension-kpi-filter";
import {
  readExtensionDirectoryFilterUrl,
  writeExtensionDirectoryFilterUrl,
} from "./extensions/extension-directory-url";
import { useSystemExtensionsDirectoryChrome } from "./extensions/useSystemExtensionsDirectoryChrome";
import { SystemExtensionsRail } from "./SystemExtensionsRail";

export const SystemExtensionsPage = memo(function SystemExtensionsPage({
  headerActions,
}: {
  headerActions?: ReactNode;
}) {
  const { pushToast } = useAppToast();
  const [cached, setCached] = useState<CachedStoreExtension[]>([]);
  const [profiles, setProfiles] = useState<StealthProfile[]>([]);
  const [search, setSearch] = useState(() => readExtensionDirectoryFilterUrl().search);
  const [selectedKinds, setSelectedKinds] = useState<ExtensionKindFilter[]>(
    () => readExtensionDirectoryFilterUrl().kinds,
  );
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = useProfileDirectoryPageSize();
  const [storeInput, setStoreInput] = useState("");
  const [profileScope, setProfileScope] = useState<"all" | "one">("all");
  const [profileId, setProfileId] = useState("");
  const [busy, setBusy] = useState(true);
  const [jobLabel, setJobLabel] = useState<string | null>(null);
  const [detailExtension, setDetailExtension] = useState<CachedStoreExtension | null>(null);
  const [bulkDetailOpen, setBulkDetailOpen] = useState(false);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const filtered = useMemo(() => {
    let rows = cached;
    if (selectedKinds.length) {
      rows = rows.filter((ext) => selectedKinds.some((kind) => kind === ext.kind));
    }
    if (activeKpi) {
      rows = rows.filter((ext) => matchesExtensionKpiFilter(ext, activeKpi));
    }
    const q = search.trim();
    if (!q) return rows;
    return rows.filter((ext) => {
      const hay = `${resolveExtensionDisplayName(ext)} ${ext.storeId ?? ""} ${ext.localKey ?? ""} ${ext.version ?? ""}`;
      return searchTextIncludes(hay, q);
    });
  }, [activeKpi, cached, search, selectedKinds]);

  const pageItems = useMemo(() => {
    const start = pageIndex * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageIndex, pageSize]);

  useEffect(() => {
    writeExtensionDirectoryFilterUrl(selectedKinds, search);
  }, [selectedKinds, search]);

  useEffect(() => {
    setPageIndex(0);
  }, [activeKpi, search, selectedKinds, pageSize]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
    if (pageIndex > maxPage) setPageIndex(maxPage);
  }, [filtered.length, pageIndex, pageSize]);

  const {
    selectedIds,
    allVisibleSelected,
    toggleSelect,
    toggleSelectAll,
    setSelectedIds,
  } = useHubDirectorySelection(pageItems, extensionRowId);

  const selectedExtension = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const id = [...selectedIds][0];
    return filtered.find((ext) => extensionRowId(ext) === id) ?? null;
  }, [filtered, selectedIds]);

  const selectedExtensions = useMemo(
    () => filtered.filter((ext) => selectedIds.has(extensionRowId(ext))),
    [filtered, selectedIds],
  );

  const { kpis, centerStats } = useSystemExtensionsDirectoryChrome(cached, {
    selectedKinds,
    setSelectedKinds,
    activeKpi,
    setActiveKpi,
  });

  const openDetail = useCallback((extension: CachedStoreExtension) => {
    setInstallModalOpen(false);
    setDetailExtension(extension);
  }, []);

  const openDetailSingle = useCallback(() => {
    if (selectedExtension) setDetailExtension(selectedExtension);
  }, [selectedExtension]);

  const openInstall = useCallback(() => {
    setDetailExtension(null);
    setInstallModalOpen(true);
  }, []);

  const profileIds = profileScope === "one" && profileId.trim() ? [profileId.trim()] : undefined;

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [status, catalog] = await Promise.all([fetchExtensionsStatus(), listProfiles()]);
      setCached(status.cached);
      setProfiles(catalog);
      if (!profileId && catalog[0]?.id) setProfileId(catalog[0].id);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  }, [profileId, pushToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const afterInstall = useCallback(
    (label: string, installed: number, total: number, extra?: string) => {
      const message = `${label} — pinned on ${installed}/${total} profile(s). Close and re-launch to activate.${extra ? ` ${extra}` : ""}`;
      setJobLabel(message);
      pushToast(message, "success");
    },
    [pushToast],
  );

  const onInstallStore = useCallback(async () => {
    const storeIdOrUrl = storeInput.trim();
    if (!storeIdOrUrl) return;
    setBusy(true);
    setJobLabel("Installing from Web Store…");
    try {
      const result = await installStoreExtension({ url: storeIdOrUrl, profileIds });
      afterInstall(
        `Installed ${result.name}${result.version ? ` v${result.version}` : ""}`,
        result.installed,
        result.profiles,
        result.cached ? "(used local cache)" : "(downloaded)",
      );
      setStoreInput("");
      setSelectedIds(new Set());
      setInstallModalOpen(false);
      await refresh();
    } catch (err) {
      setJobLabel(null);
      pushToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  }, [afterInstall, profileIds, pushToast, refresh, setSelectedIds, storeInput]);

  const openDeleteSelected = useCallback(() => {
    if (!selectedExtensions.length) return;
    setDetailExtension(null);
    setInstallModalOpen(false);
    setDeleteConfirmOpen(true);
  }, [selectedExtensions.length]);

  const onReloadOpenProfiles = useCallback(async () => {
    setBusy(true);
    setJobLabel("Syncing stages & broadcasting live reload to open profiles…");
    try {
      const result = await reloadOpenProfilesExtensions();
      setCached(result.status.cached);
      const pinnedCount = result.maintained?.pinned ?? 0;
      const e1Ver = result.status.cookieBridge?.stageVersion || result.status.cookieBridge?.manifestVersion || "latest";
      const e2Ver = result.status.operatorExtension?.stageVersion || result.status.operatorExtension?.manifestVersion || "latest";
      const message = `Reload signal #${String(result.reloadNonce).slice(-6)} sent — E0001 v${e1Ver} & E0002 v${e2Ver} synced (${pinnedCount} closed pins updated).`;
      setJobLabel(message);
      pushToast(message, "success");
    } catch (err) {
      setJobLabel(null);
      pushToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  }, [pushToast]);

  const onDeleteSelected = useCallback(async () => {
    if (!selectedExtensions.length) return;
    setBusy(true);
    setJobLabel(`Deleting ${selectedExtensions.length} extension cache(s)…`);
    try {
      const result = await removeCachedExtensions(
        selectedExtensions.map((ext) => ({
          kind: ext.kind,
          storeId: ext.storeId,
          localKey: ext.localKey,
        })),
      );
      const message = `Deleted ${result.removed} cached extension(s). Close and re-launch profiles if they still load these sources.`;
      setJobLabel(message);
      pushToast(message, "success");
      setSelectedIds(new Set());
      setDeleteConfirmOpen(false);
      await refresh();
    } catch (err) {
      setJobLabel(null);
      pushToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  }, [pushToast, refresh, selectedExtensions, setSelectedIds]);

  const closeModal = useCallback(() => {
    setDetailExtension(null);
    setInstallModalOpen(false);
  }, []);

  const deleteIncludesCookieBridge = selectedExtensions.some(
    (ext) => ext.storeId === COOKIE_BRIDGE_STORE_ID || /cookie bridge/i.test(ext.name),
  );

  const modalOpen = Boolean(detailExtension) || installModalOpen;

  const bulkDetailItems = useMemo<HubDirectoryBulkSelectedItem[]>(
    () =>
      selectedExtensions.map((ext) => ({
        id: extensionRowId(ext),
        label: resolveExtensionDisplayName(ext),
        sublabel: `${ext.storeId ?? ext.localKey ?? "local"}${ext.version ? ` · v${ext.version}` : ""}`,
        badge: ext.kind === "store" ? "Web Store" : "Local",
      })),
    [selectedExtensions],
  );

  return (
    <>
      <SystemExtensionsDirectoryPanel
        cached={cached}
        items={pageItems}
        filteredCount={filtered.length}
        catalogCount={cached.length}
        search={search}
        setSearch={setSearch}
        selectedKinds={selectedKinds}
        setSelectedKinds={setSelectedKinds}
        pageIndex={pageIndex}
        onPageChange={setPageIndex}
        selectedIds={selectedIds}
        selectedCount={selectedIds.size}
        allVisibleSelected={allVisibleSelected}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        busy={busy}
        onOpenDetail={openDetail}
        onOpenDetailSingle={openDetailSingle}
        onOpenBulkDetail={() => setBulkDetailOpen(true)}
        onOpenInstall={openInstall}
        onDeleteSelected={openDeleteSelected}
        onReloadOpenProfiles={() => void onReloadOpenProfiles()}
        headerActions={headerActions}
        centerStats={centerStats}
        kpis={kpis}
        rail={<SystemExtensionsRail jobLabel={jobLabel} />}
      />
      <HubDirectoryBulkDetailModal
        open={bulkDetailOpen}
        onClose={() => setBulkDetailOpen(false)}
        entitySingular="extension"
        entityPlural="extensions"
        headerIcon={Puzzle}
        panelTitle="Batch Extension Operations"
        panelTitleEmoji="🧩"
        selectedItems={bulkDetailItems}
        busy={busy}
        sections={[
          {
            id: "danger",
            label: "Cache Operations",
            emoji: "🗑️",
            actions: [
              {
                key: "delete-selected",
                label: "Delete Selected Caches",
                icon: <Trash2 size={14} aria-hidden />,
                tone: "rose",
                onClick: () => {
                  setBulkDetailOpen(false);
                  openDeleteSelected();
                },
              },
            ],
          },
        ]}
      />
      {deleteConfirmOpen ? (
        <HubConfirmDialog
          open
          title={selectedExtensions.length === 1 ? "Delete extension cache?" : "Delete selected extension caches?"}
          message={
            <>
              <p>
                This removes {selectedExtensions.length} cached source
                {selectedExtensions.length === 1 ? "" : "s"} from Extensions. Store items can be
                installed again with New.
              </p>
              {deleteIncludesCookieBridge ? (
                <p className="mt-2">
                  Cookie Bridge will download again on the next profile launch if that slot is still
                  enabled.
                </p>
              ) : null}
            </>
          }
          confirmLabel="Delete"
          tone="danger"
          confirmBusy={busy}
          onConfirm={() => void onDeleteSelected()}
          onClose={() => setDeleteConfirmOpen(false)}
        />
      ) : null}
      {modalOpen ? (
        <ExtensionDetailModal
          extension={detailExtension}
          installOnly={installModalOpen && !detailExtension}
          jobLabel={jobLabel}
          storeInput={storeInput}
          setStoreInput={setStoreInput}
          profileScope={profileScope}
          setProfileScope={setProfileScope}
          profiles={profiles}
          profileId={profileId}
          setProfileId={setProfileId}
          busy={busy}
          onInstallStore={() => void onInstallStore()}
          onClose={closeModal}
        />
      ) : null}
    </>
  );
});
