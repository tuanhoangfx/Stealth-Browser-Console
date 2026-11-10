import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useHubDirectorySelection, useDirectorySearchQuery, DIRECTORY_SEARCH_FETCH_DEBOUNCE_MS } from "@tool-workspace/hub-ui";
import {
  backupProfilesState,
  fetchProfileDirectoryPage,
  fetchProfileBackupDirectoryStatus,
  restoreProfileCookiesBackup,
  restoreProfilesState,
  snapshotProfileCookiesBackup,
  snapshotProfilesNativeSessionBulk,
} from "../../api";
import { useAppToast } from "../../components/toast";
import { useStealthShell } from "../../context/stealth-shell-context";
import { useRunLogs } from "../runtime/RunLogsContext";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import type { ProfileBackupMeta, ProfileRow, ProfileStorageStat } from "../../types";
import { useProfileDirectoryPageSize } from "../profiles/useProfileDirectoryPageSize";
import {
  readBackupDirectoryFilterUrl,
  writeBackupDirectoryFilterUrl,
} from "./backup/backup-directory-url";
import { useSystemBackupDirectoryChrome } from "./backup/useSystemBackupDirectoryChrome";
import { SystemBackupDirectoryPanel } from "./backup/SystemBackupDirectoryPanel";
import {
  backupStatusLabel,
  formatBackupSuccessMessage,
  formatRestoreResultMessage,
  type BackupRowState,
} from "./backup/system-backup-types";
import { useSystemBackupFeedback } from "./backup/useSystemBackupFeedback";
import { SystemBackupRail } from "./SystemBackupRail";
import { ProfileDetailModal } from "../profiles/ProfileDetailModal";
import type { ProfileDetailModalProps } from "../profiles/profile-detail-modal-props";

function backupJobBannerLabel(phase: string, current: number, total: number) {
  if (phase === "zip") return "Compressing archive…";
  if (phase === "restore") return "Restoring profile state…";
  if (phase === "snapshot") return "Saving Native Session v2 bundles…";
  if (total > 0) return `Backing up profiles… ${Math.min(current, total)}/${total}`;
  return "Backing up profiles…";
}

export const SystemBackupPage = memo(function SystemBackupPage({
  headerActions,
}: {
  headerActions?: ReactNode;
}) {
  const { refreshProfiles } = useStealthShell();
  const {
    profiles: catalogProfiles,
    catalogStats,
    groups,
    openOne,
    closeOne,
    runningHeadlessIds,
  } = useProfilesRuntime();
  const { notifyInfo, notifyError } = useSystemBackupFeedback();
  const { pushToast } = useAppToast();
  const { addLog } = useRunLogs();
  const pageSize = useProfileDirectoryPageSize();
  const directorySearch = useDirectorySearchQuery({
    debounceMs: DIRECTORY_SEARCH_FETCH_DEBOUNCE_MS,
    initialQuery: readBackupDirectoryFilterUrl().search,
  });
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    () => readBackupDirectoryFilterUrl().groupIds,
  );
  const [selectedStatuses, setSelectedStatuses] = useState<ProfileRow["status"][]>(
    () => readBackupDirectoryFilterUrl().statuses,
  );
  const { kpis, centerStats } = useSystemBackupDirectoryChrome(catalogStats, catalogProfiles, {
    groupIds: selectedGroupIds,
    statuses: selectedStatuses,
    setGroupIds: setSelectedGroupIds,
    setStatuses: setSelectedStatuses,
  });
  const [pageIndex, setPageIndex] = useState(0);
  const [pageProfiles, setPageProfiles] = useState<ProfileRow[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [jobBusy, setJobBusy] = useState(false);
  const [jobPhase, setJobPhase] = useState("");
  const [jobCurrent, setJobCurrent] = useState(0);
  const [jobTotal, setJobTotal] = useState(0);
  const [rowActionBusyId, setRowActionBusyId] = useState<string | null>(null);
  const [storageById, setStorageById] = useState<Record<string, ProfileStorageStat>>({});
  const [lastBackupById, setLastBackupById] = useState<Record<string, string | undefined>>({});
  const [backupMetaById, setBackupMetaById] = useState<Record<string, ProfileBackupMeta | undefined>>({});
  const nameByIdRef = useRef<Record<string, string>>({});
  const lastProgressLogRef = useRef("");
  const lastProgressKeyRef = useRef("");
  const storageSizesGenRef = useRef(0);
  const jobUiTimerRef = useRef<number | undefined>(undefined);
  const pendingJobUiRef = useRef<{ phase: string; current: number; total: number } | null>(null);
  const [detailModal, setDetailModal] = useState<ProfileDetailModalProps | null>(null);

  const catalogById = useMemo(() => {
    const map = new Map<string, ProfileRow>();
    for (const row of catalogProfiles) map.set(row.id, row);
    return map;
  }, [catalogProfiles]);

  // Real-time merge of live runtime status (Running / Opening / Closed / Headless / Group) into current page rows
  const profiles = useMemo(
    () =>
      pageProfiles.map((row) => {
        const live = catalogById.get(row.id);
        if (!live) return row;
        if (
          live.status === row.status &&
          live.headless === row.headless &&
          live.groupId === row.groupId &&
          live.groupName === row.groupName &&
          live.updatedAt === row.updatedAt
        ) {
          return row;
        }
        return {
          ...row,
          status: live.status,
          headless: live.headless,
          groupId: live.groupId,
          groupName: live.groupName,
          updatedAt: live.updatedAt,
          lastOpenedAt: live.lastOpenedAt,
        };
      }),
    [pageProfiles, catalogById],
  );

  useEffect(() => {
    writeBackupDirectoryFilterUrl(selectedGroupIds, selectedStatuses, directorySearch.query);
  }, [selectedGroupIds, selectedStatuses, directorySearch.query]);

  const backupJobLabel = useMemo(() => {
    if (!jobBusy) return null;
    return backupJobBannerLabel(jobPhase, jobCurrent, jobTotal);
  }, [jobBusy, jobCurrent, jobPhase, jobTotal]);

  const {
    selectedIds,
    selectedRows,
    allVisibleSelected,
    toggleSelect,
    toggleSelectAll,
    setSelectedIds,
  } = useHubDirectorySelection(profiles, (profile) => profile.id);

  const refreshBackupStatusForIds = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const sizesGen = ++storageSizesGenRef.current;
    void fetchProfileBackupDirectoryStatus(ids)
      .then(({ meta, stats }) => {
        if (sizesGen !== storageSizesGenRef.current) return;
        setStorageById(Object.fromEntries(stats.map((s) => [s.id, s])));
        setLastBackupById(Object.fromEntries(meta.map((m) => [m.id, m.lastBackupAt])));
        setBackupMetaById(Object.fromEntries(meta.map((m) => [m.id, m])));
      })
      .catch(() => undefined);
  }, []);

  const loadPage = useCallback(async () => {
    setBusy(true);
    try {
      const page = await fetchProfileDirectoryPage({
        search: directorySearch.query,
        groupIds: selectedGroupIds.length ? selectedGroupIds : undefined,
        statuses: selectedStatuses.length ? selectedStatuses : undefined,
        limit: pageSize,
        offset: pageIndex * pageSize,
        sort: "name",
        dir: "asc",
      });
      setPageProfiles(page.profiles as ProfileRow[]);
      setTotal(page.total);
      const ids = page.profiles.map((p) => p.id);
      for (const row of page.profiles) {
        nameByIdRef.current[row.id] = row.name;
      }
      setBusy(false);
      refreshBackupStatusForIds(ids);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }, [directorySearch.query, notifyError, pageIndex, pageSize, refreshBackupStatusForIds, selectedGroupIds, selectedStatuses]);

  useEffect(() => {
    setPageIndex(0);
  }, [directorySearch.query, selectedGroupIds, selectedStatuses]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  // Real-time refresh of Backup Directory metadata when any visible profile closes or updates
  const visibleStatusSignature = useMemo(
    () => profiles.map((p) => `${p.id}:${p.status}`).join("|"),
    [profiles],
  );
  useEffect(() => {
    const ids = pageProfiles.map((p) => p.id);
    if (!ids.length) return undefined;
    const t = window.setTimeout(() => {
      refreshBackupStatusForIds(ids);
    }, 350);
    return () => window.clearTimeout(t);
  }, [visibleStatusSignature, pageProfiles, refreshBackupStatusForIds]);

  const logBackupProgress = useCallback(
    (payload: {
      phase?: string;
      profileId?: string;
      profileName?: string;
      status?: string;
      message?: string;
      current?: number;
      total?: number;
    }) => {
      const name =
        payload.profileName ||
        (payload.profileId ? nameByIdRef.current[payload.profileId] : "") ||
        payload.profileId ||
        "";
      let line = "";
      const logKey =
        payload.phase === "profile"
          ? `${payload.phase}:${name}:${payload.status ?? ""}:${payload.current ?? 0}`
          : payload.phase ?? "";
      if (payload.phase === "zip" || payload.phase === "extract" || payload.phase === "catalog") {
        return;
      }
      if (payload.phase === "done") line = "Backup job finished.";
      else if (payload.phase === "profile" && name) {
        const state: BackupRowState = {
          status:
            payload.status === "done"
              ? "done"
              : payload.status === "skipped"
                ? "skipped"
                : payload.status === "copying"
                  ? "copying"
                  : "queued",
          message: payload.message,
        };
        line = `${name}: ${backupStatusLabel(state)}${payload.total ? ` (${payload.current ?? 0}/${payload.total})` : ""}`;
      }
      if (!line || logKey === lastProgressKeyRef.current) return;
      lastProgressKeyRef.current = logKey;
      lastProgressLogRef.current = line;
      addLog(payload.status === "skipped" || payload.status === "error" ? "warn" : "info", "Backup", line);
    },
    [addLog],
  );

  const flushJobUi = useCallback(() => {
    jobUiTimerRef.current = undefined;
    const pending = pendingJobUiRef.current;
    if (!pending) return;
    setJobPhase(pending.phase);
    setJobCurrent(pending.current);
    setJobTotal(pending.total);
  }, []);

  const scheduleJobUi = useCallback(
    (payload: { phase?: string; current?: number; total?: number }) => {
      pendingJobUiRef.current = {
        phase: payload.phase ?? "",
        current: payload.current || 0,
        total: payload.total || 0,
      };
      if (jobUiTimerRef.current) return;
      jobUiTimerRef.current = window.setTimeout(flushJobUi, 120);
    },
    [flushJobUi],
  );

  useEffect(() => {
    const api = window.stealthApi;
    if (!api?.onProfilesBackupProgress) return undefined;
    return api.onProfilesBackupProgress((payload) => {
      scheduleJobUi(payload);
      logBackupProgress(payload);
    });
  }, [logBackupProgress, scheduleJobUi]);

  const onBackupSelected = useCallback(async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    lastProgressLogRef.current = "";
    setJobBusy(true);
    setJobPhase("profile");
    setJobCurrent(0);
    setJobTotal(ids.length);
    addLog("info", "Backup", `Starting backup for ${ids.length} profile(s)…`);
    try {
      const result = await backupProfilesState(ids);
      if (result.canceled) {
        addLog("info", "Backup", "Backup canceled.");
        return;
      }
      if (!result.ok) throw new Error(result.error || "Backup failed");
      const message = formatBackupSuccessMessage({
        profiles: result.profiles,
        bytes: result.bytes,
        selected: true,
        path: result.path,
      });
      notifyInfo(message);
      addLog("success", "Backup", message);
      void loadPage();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      notifyError(message);
      addLog("error", "Backup", message);
    } finally {
      setJobBusy(false);
      setJobPhase("");
      lastProgressLogRef.current = "";
    }
  }, [addLog, loadPage, notifyError, notifyInfo, selectedIds]);

  const onBackupAll = useCallback(async () => {
    lastProgressLogRef.current = "";
    setJobBusy(true);
    setJobPhase("profile");
    setJobCurrent(0);
    setJobTotal(0);
    addLog("info", "Backup", "Starting full catalog backup…");
    try {
      const result = await backupProfilesState();
      if (result.canceled) {
        addLog("info", "Backup", "Backup canceled.");
        return;
      }
      if (!result.ok) throw new Error(result.error || "Backup failed");
      const message = formatBackupSuccessMessage({
        profiles: result.profiles,
        bytes: result.bytes,
        selected: false,
        path: result.path,
      });
      notifyInfo(message);
      addLog("success", "Backup", message);
      await loadPage();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      notifyError(message);
      addLog("error", "Backup", message);
    } finally {
      setJobBusy(false);
      setJobPhase("");
      lastProgressLogRef.current = "";
    }
  }, [addLog, loadPage, notifyError, notifyInfo]);

  const onRestore = useCallback(async () => {
    const restoreTarget = selectedRows.length === 1 ? selectedRows[0] : undefined;
    lastProgressLogRef.current = "";
    lastProgressKeyRef.current = "";
    setJobBusy(true);
    setJobPhase("restore");
    addLog(
      "info",
      "Backup",
      restoreTarget
        ? `Starting restore into profile ${restoreTarget.name}…`
        : "Starting restore from zip…",
    );
    try {
      const result = await restoreProfilesState(
        restoreTarget ? { restoreIntoProfileId: restoreTarget.id } : undefined,
      );
      if (result.canceled) {
        addLog("info", "Backup", "Restore canceled.");
        return;
      }
      if (!result.ok) throw new Error(result.error || "Restore failed");
      const summary = formatRestoreResultMessage(result);
      if ((result.skipped ?? 0) > 0 && (result.restored ?? 0) === 0) {
        notifyError(summary);
        addLog("error", "Backup", summary);
      } else if ((result.skipped ?? 0) > 0) {
        pushToast(summary, "warn", 7000);
        addLog("warn", "Backup", summary);
      } else {
        notifyInfo(summary);
        addLog("success", "Backup", summary);
      }
      setSelectedIds(new Set());
      await refreshProfiles();
      await loadPage();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      notifyError(message);
      addLog("error", "Backup", message);
    } finally {
      setJobBusy(false);
      setJobPhase("");
      lastProgressLogRef.current = "";
    }
  }, [addLog, loadPage, notifyError, notifyInfo, pushToast, refreshProfiles, selectedRows, setSelectedIds]);

  const handleRunToggle = useCallback(
    (profile: ProfileRow) => {
      const running = profile.status === "running" || profile.status === "opening";
      if (running) void closeOne(profile);
      else void openOne(profile);
    },
    [closeOne, openOne],
  );

  const handleRowSnapshot = useCallback(
    async (profile: ProfileRow) => {
      if (rowActionBusyId) return;
      setRowActionBusyId(profile.id);
      try {
        const status = await snapshotProfileCookiesBackup(profile.id, profile.name, true);
        const latest = status.slots?.latest ?? status.backup.slotLatest;
        const histText =
          latest?.historyBytes && latest.historyBytes > 0
            ? ` · History ${(latest.historyBytes / (1024 * 1024)).toFixed(1)} MB`
            : "";
        const msg = `${profile.name}: Native Session v2 saved (${status.current.totalRows} cookies${histText})`;
        pushToast(msg, "success");
        addLog("success", "Backup", msg);
        refreshBackupStatusForIds(pageProfiles.map((p) => p.id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pushToast(msg, "error");
        addLog("error", "Backup", `${profile.name}: ${msg}`);
      } finally {
        setRowActionBusyId(null);
      }
    },
    [addLog, pageProfiles, pushToast, refreshBackupStatusForIds, rowActionBusyId],
  );

  const handleRowRestoreSlot = useCallback(
    async (profile: ProfileRow, slot: "latest" | "previous") => {
      if (rowActionBusyId) return;
      setRowActionBusyId(profile.id);
      try {
        const res = await restoreProfileCookiesBackup(profile.id, profile.name, { slot });
        const parts: string[] = [`Slot ${slot} (${res.status?.current.totalRows ?? 0} cookies)`];
        if (res.historyRestored) parts.push("History");
        if (res.localStorageRestored) parts.push("Local Storage");
        const msg = `${profile.name}: Restored ${parts.join(" + ")}`;
        pushToast(msg, "success");
        addLog("success", "Backup", msg);
        refreshBackupStatusForIds(pageProfiles.map((p) => p.id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pushToast(msg, "error");
        addLog("error", "Backup", `${profile.name}: ${msg}`);
      } finally {
        setRowActionBusyId(null);
      }
    },
    [addLog, pageProfiles, pushToast, refreshBackupStatusForIds, rowActionBusyId],
  );

  const onSnapshotSelected = useCallback(async () => {
    const targetIds = selectedIds.size > 0 ? [...selectedIds] : pageProfiles.map((p) => p.id);
    if (!targetIds.length || jobBusy) return;
    setJobBusy(true);
    setJobPhase("snapshot");
    setJobCurrent(0);
    setJobTotal(targetIds.length);
    addLog("info", "Backup", `Saving Native Session v2 bundle for ${targetIds.length} profile(s)…`);
    try {
      const res = await snapshotProfilesNativeSessionBulk(targetIds, true);
      const msg = `Native Session v2 saved — ${res.snapshottedCount} snapshotted, ${res.skippedCount} skipped`;
      pushToast(msg, "success");
      addLog("success", "Backup", msg);
      refreshBackupStatusForIds(pageProfiles.map((p) => p.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notifyError(msg);
      addLog("error", "Backup", msg);
    } finally {
      setJobBusy(false);
      setJobPhase("");
    }
  }, [addLog, jobBusy, notifyError, pageProfiles, pushToast, refreshBackupStatusForIds, selectedIds]);

  const openDetail = useCallback((profile: ProfileRow) => {
    setDetailModal({ mode: "edit", profile, onClose: () => setDetailModal(null) });
  }, []);

  return (
    <>
      <SystemBackupDirectoryPanel
      profiles={profiles}
      total={total}
      search={directorySearch.queryInput}
      setSearch={directorySearch.setQueryInput}
      filterSearch={directorySearch.query}
      queryPending={directorySearch.queryPending}
      selectedGroupIds={selectedGroupIds}
      setSelectedGroupIds={setSelectedGroupIds}
      selectedStatuses={selectedStatuses}
      setSelectedStatuses={setSelectedStatuses}
      pageIndex={pageIndex}
      onPageChange={setPageIndex}
      busy={busy || directorySearch.queryPending}
      jobBusy={jobBusy}
      storageById={storageById}
      lastBackupById={lastBackupById}
      backupMetaById={backupMetaById}
      runningHeadlessIds={runningHeadlessIds}
      rowActionBusyId={rowActionBusyId}
      onRunToggle={handleRunToggle}
      onRowSnapshot={(p) => void handleRowSnapshot(p)}
      onRowRestoreSlot={(p, slot) => void handleRowRestoreSlot(p, slot)}
      selectedIds={selectedIds}
      selectedCount={selectedRows.length}
      allVisibleSelected={allVisibleSelected}
      onToggleSelect={toggleSelect}
      onToggleSelectAll={toggleSelectAll}
      onSnapshotSelected={() => void onSnapshotSelected()}
      onBackupSelected={() => void onBackupSelected()}
      onBackupAll={() => void onBackupAll()}
      onRestore={() => void onRestore()}
      onEditSingle={() => {
        if (selectedRows.length === 1) {
          setDetailModal({
            mode: "edit",
            profile: selectedRows[0]!,
            onClose: () => setDetailModal(null),
          });
        }
      }}
      onEditBulk={() => {
        if (selectedRows.length > 1) {
          setDetailModal({
            mode: "bulk",
            profiles: [...selectedRows],
            onClose: () => setDetailModal(null),
          });
        }
      }}
      onOpenDetail={openDetail}
      headerActions={headerActions}
      kpis={kpis}
      centerStats={centerStats}
      groups={groups}
      catalogStats={catalogStats}
      rail={<SystemBackupRail backupJobLabel={backupJobLabel} />}
    />
      {detailModal ? (
        <ProfileDetailModal
          {...detailModal}
          onProfilesChanged={() => {
            void loadPage();
            void refreshProfiles();
          }}
        />
      ) : null}
    </>
  );
});
