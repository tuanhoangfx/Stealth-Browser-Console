import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { patchHubListPrefs, patchHubTablePageSizeValue, useHubDirectorySelection } from "@tool-workspace/hub-ui";
import { useProfilesRuntime } from "../providers/ProfilesRuntimeProvider";
import { useStealthShell } from "../context/stealth-shell-context";
import type { ProfileRow } from "../types";
import { ProfileDirectoryPanel } from "../features/profiles/ProfileDirectoryPanel";
import { ProfilesWorkflowRail } from "../features/profiles/ProfilesWorkflowRail";
import { CreateProfileModal } from "../features/profiles/CreateProfileModal";
import { EditProfileModal } from "../features/profiles/EditProfileModal";
import { ManageGroupsModal } from "../features/profiles/ManageGroupsModal";
import { useProfileDirectoryResults } from "../features/profiles/useProfileDirectoryResults";
import {
  normalizeProfileDirectoryPageSize,
  useProfileDirectoryPageSize,
} from "../features/profiles/useProfileDirectoryPageSize";
import { useProfilesDirectoryChrome } from "../features/profiles/useProfilesDirectoryChrome";
import type { StealthProfileSortKey, StealthProfileSortDirection } from "../features/profiles/StealthProfileDirectoryTable";
import { migrateProfilesDisplayPrefsFromUrl } from "../lib/profile-display-prefs-migrate";

export const ProfilesView = memo(function ProfilesView({
  headerActions,
  engineStatus
}: {
  headerActions?: ReactNode;
  engineStatus?: "checking" | "ready" | "offline";
}) {
  const { syncBusy } = useStealthShell();
  const { profiles, groups, catalogStats, openOne, closeOne, deleteSelected, exportProfiles, importProfiles, setAutomationProfileSelection, refreshProfiles } =
    useProfilesRuntime();
  const [search, setSearch] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<ProfileRow["status"][]>([]);
  const pageSize = useProfileDirectoryPageSize();
  const [pageIndex, setPageIndex] = useState(0);
  const [sortKey, setSortKey] = useState<StealthProfileSortKey>("profile");
  const [sortDir, setSortDir] = useState<StealthProfileSortDirection>("asc");
  const [showCreate, setShowCreate] = useState(false);
  const [editProfile, setEditProfile] = useState<ProfileRow | null>(null);
  const [showGroups, setShowGroups] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    migrateProfilesDisplayPrefsFromUrl();
  }, []);

  const filterKey = `${search}|${selectedGroupIds.join(",")}|${selectedStatuses.join(",")}|${sortKey}|${sortDir}`;
  const prevFilterKey = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKey.current !== filterKey) {
      prevFilterKey.current = filterKey;
      setPageIndex(0);
    }
  }, [filterKey]);

  const [directoryRefreshKey, setDirectoryRefreshKey] = useState(0);

  useEffect(() => {
    const api = window.stealthApi;
    if (!api?.onProfileSession) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = api.onProfileSession(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        setDirectoryRefreshKey((key) => key + 1);
      }, 250);
    });
    return () => {
      if (timer) clearTimeout(timer);
      off?.();
    };
  }, []);

  const handleOpenOne = useCallback(
    async (profile: ProfileRow) => {
      await openOne(profile);
    },
    [openOne],
  );

  const handleCloseOne = useCallback(
    async (profile: ProfileRow) => {
      await closeOne(profile);
    },
    [closeOne],
  );

  const { filteredProfiles, filteredTotal, directoryBusy } = useProfileDirectoryResults(
    {
      search,
      groupIds: selectedGroupIds,
      statuses: selectedStatuses,
    },
    pageIndex,
    pageSize,
    sortKey,
    sortDir,
    directoryRefreshKey,
  );

  const {
    selectedIds,
    setSelectedIds,
    selectedRows: selectedProfiles,
    toggleSelect,
    toggleSelectAll,
    allVisibleSelected,
  } = useHubDirectorySelection(filteredProfiles, (profile) => profile.id);

  useEffect(() => {
    setAutomationProfileSelection(selectedProfiles);
  }, [selectedProfiles, setAutomationProfileSelection]);

  const { kpis, centerStats } = useProfilesDirectoryChrome(catalogStats, profiles);

  const handleSort = useCallback((key: StealthProfileSortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const handleTablePageSizeChange = useCallback((size: number) => {
    const next = normalizeProfileDirectoryPageSize(size);
    patchHubListPrefs({ tpage: patchHubTablePageSizeValue(next) });
    setPageIndex(0);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    void deleteSelected([...selectedIds])
      .then(() => {
        setSelectedIds(new Set());
        setDirectoryRefreshKey((key) => key + 1);
        void refreshProfiles();
      })
      .catch(() => undefined);
  }, [deleteSelected, refreshProfiles, selectedIds, setSelectedIds]);

  return (
    <>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void file
            .text()
            .then((text) => importProfiles(JSON.parse(text)))
            .catch(() => undefined);
        }}
      />
      <ProfileDirectoryPanel
        profiles={profiles}
        catalogStats={catalogStats}
        groups={groups}
        filteredProfiles={filteredProfiles}
        filteredTotal={filteredTotal}
        search={search}
        setSearch={setSearch}
        selectedGroupIds={selectedGroupIds}
        setSelectedGroupIds={setSelectedGroupIds}
        selectedStatuses={selectedStatuses}
        setSelectedStatuses={setSelectedStatuses}
        pageSize={pageSize}
        pageIndex={pageIndex}
        onPageChange={setPageIndex}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onTablePageSizeChange={handleTablePageSizeChange}
        syncBusy={syncBusy || directoryBusy}
        selectedProfiles={selectedProfiles}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        allVisibleSelected={allVisibleSelected}
        openOne={handleOpenOne}
        closeOne={handleCloseOne}
        deleteSelected={handleDeleteSelected}
        setShowCreate={setShowCreate}
        onEdit={() => {
          if (selectedProfiles.length === 1) setEditProfile(selectedProfiles[0]!);
        }}
        onGroups={() => setShowGroups(true)}
        onExport={() => void exportProfiles()}
        onImport={() => importInputRef.current?.click()}
        apiStatus={engineStatus}
        headerActions={headerActions}
        kpis={kpis}
        centerStats={centerStats}
        rail={<ProfilesWorkflowRail />}
      />
      {showCreate ? (
        <CreateProfileModal
          onClose={() => setShowCreate(false)}
          onProfilesChanged={() => setDirectoryRefreshKey((key) => key + 1)}
        />
      ) : null}
      {editProfile ? (
        <EditProfileModal
          profile={editProfile}
          onClose={() => setEditProfile(null)}
          onProfilesChanged={() => setDirectoryRefreshKey((key) => key + 1)}
        />
      ) : null}
      {showGroups ? <ManageGroupsModal onClose={() => setShowGroups(false)} /> : null}
    </>
  );
});
