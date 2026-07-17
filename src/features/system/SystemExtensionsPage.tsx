import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useHubDirectorySelection } from "@tool-workspace/hub-ui";
import {
  fetchExtensionsStatus,
  installStoreExtension,
  installUnpackedExtension,
  listProfiles,
  pickUnpackedExtensionFolder,
} from "../../api";
import { useAppToast } from "../../components/toast";
import { resolveExtensionDisplayName } from "../../lib/extension-display-name";
import type { CachedStoreExtension, StealthProfile } from "../../types";
import { useProfileDirectoryPageSize } from "../profiles/useProfileDirectoryPageSize";
import { ExtensionDetailModal } from "./extensions/ExtensionDetailModal";
import { SystemExtensionsDirectoryPanel, extensionRowId } from "./extensions/SystemExtensionsDirectoryPanel";
import type { ExtensionKindFilter } from "./extensions/extension-filters";
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
  const [search, setSearch] = useState("");
  const [selectedKinds, setSelectedKinds] = useState<ExtensionKindFilter[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = useProfileDirectoryPageSize();
  const [storeInput, setStoreInput] = useState("");
  const [profileScope, setProfileScope] = useState<"all" | "one">("all");
  const [profileId, setProfileId] = useState("");
  const [busy, setBusy] = useState(true);
  const [jobLabel, setJobLabel] = useState<string | null>(null);
  const [detailExtension, setDetailExtension] = useState<CachedStoreExtension | null>(null);
  const [installModalOpen, setInstallModalOpen] = useState(false);

  const filtered = useMemo(() => {
    let rows = cached;
    if (selectedKinds.length) {
      rows = rows.filter((ext) => selectedKinds.includes(ext.kind));
    }
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((ext) => {
      const hay = `${resolveExtensionDisplayName(ext)} ${ext.storeId ?? ""} ${ext.localKey ?? ""} ${ext.version ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [cached, search, selectedKinds]);

  const pageItems = useMemo(() => {
    const start = pageIndex * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageIndex, pageSize]);

  useEffect(() => {
    setPageIndex(0);
  }, [search, selectedKinds, pageSize]);

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

  const { kpis, centerStats } = useSystemExtensionsDirectoryChrome(cached);

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
        result.cached ? "(used local cache — Force update to re-download)" : "(downloaded)",
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

  const onInstallUnpacked = useCallback(async () => {
    setBusy(true);
    setJobLabel("Loading unpacked folder…");
    try {
      const folder = await pickUnpackedExtensionFolder();
      if (!folder) {
        setJobLabel(null);
        setBusy(false);
        return;
      }
      const result = await installUnpackedExtension({ path: folder, profileIds });
      afterInstall(`Loaded unpacked ${result.name}`, result.installed, result.profiles);
      setSelectedIds(new Set());
      setInstallModalOpen(false);
      await refresh();
    } catch (err) {
      setJobLabel(null);
      pushToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  }, [afterInstall, profileIds, pushToast, refresh, setSelectedIds]);

  const onForceUpdateSelected = useCallback(async () => {
    const selected = filtered.filter((ext) => selectedIds.has(extensionRowId(ext)) && ext.kind === "store" && ext.storeId);
    if (!selected.length) {
      pushToast("Select one or more Web Store extensions (local unpacked cannot force-update from CWS).", "error");
      return;
    }
    setBusy(true);
    setJobLabel(`Force updating ${selected.length} extension(s)…`);
    try {
      const lines: string[] = [];
      for (const ext of selected) {
        const result = await installStoreExtension({
          storeId: ext.storeId!,
          profileIds,
          force: true,
        });
        lines.push(
          `${result.name} v${result.version || "?"} — ${result.installed}/${result.profiles} profiles`,
        );
      }
      const message = `Force updated: ${lines.join("; ")}. Re-launch profiles.`;
      setJobLabel(message);
      pushToast(message, "success");
      setSelectedIds(new Set());
      await refresh();
    } catch (err) {
      setJobLabel(null);
      pushToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusy(false);
    }
  }, [filtered, profileIds, pushToast, refresh, selectedIds, setSelectedIds]);

  const closeModal = useCallback(() => {
    setDetailExtension(null);
    setInstallModalOpen(false);
  }, []);

  const modalOpen = Boolean(detailExtension) || installModalOpen;

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
        onForceUpdateSelected={() => void onForceUpdateSelected()}
        onOpenDetail={openDetail}
        onOpenDetailSingle={openDetailSingle}
        onOpenInstall={openInstall}
        headerActions={headerActions}
        centerStats={centerStats}
        kpis={kpis}
        rail={<SystemExtensionsRail jobLabel={jobLabel} />}
      />
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
          onInstallUnpacked={() => void onInstallUnpacked()}
          onClose={closeModal}
        />
      ) : null}
    </>
  );
});
