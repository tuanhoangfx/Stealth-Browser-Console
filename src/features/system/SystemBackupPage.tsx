import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useHubDirectorySelection, useDirectorySearchQuery, DIRECTORY_SEARCH_FETCH_DEBOUNCE_MS } from "@tool-workspace/hub-ui";
import {
  backupProfilesState,
  fetchProfileDirectoryPage,
  fetchProfileBackupMeta,
  fetchProfileStorageStats,
  restoreProfilesState,
} from "../../api";
import { useAppToast } from "../../components/toast";
import { useStealthShell } from "../../context/stealth-shell-context";
import { useRunLogs } from "../runtime/RunLogsContext";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import type { ProfileRow, ProfileStorageStat } from "../../types";
import { useProfileDirectoryPageSize } from "../profiles/useProfileDirectoryPageSize";
import { useProfilesDirectoryChrome } from "../profiles/useProfilesDirectoryChrome";
import { SystemBackupDirectoryPanel } from "./backup/SystemBackupDirectoryPanel";
import {
  backupStatusLabel,
  formatBackupSuccessMessage,
  formatRestoreResultMessage,
  type BackupRowState,
} from "./backup/system-backup-types";
import { useSystemBackupFeedback } from "./backup/useSystemBackupFeedback";
import { SystemBackupRail } from "./SystemBackupRail";

function backupJobBannerLabel(phase: string, current: number, total: number) {
  if (phase === "zip") return "Compressing archive…";
  if (phase === "restore") return "Restoring profile state…";
  if (total > 0) return `Backing up profiles… ${Math.min(current, total)}/${total}`;
  return "Backing up profiles…";
}

export const SystemBackupPage = memo(function SystemBackupPage({
  headerActions,
}: {
  headerActions?: ReactNode;
}) {
  const { refreshProfiles } = useStealthShell();
  const { profiles: catalogProfiles, catalogStats, groups } = useProfilesRuntime();
  const { kpis, centerStats } = useProfilesDirectoryChrome(catalogStats, catalogProfiles);
  const { notifyInfo, notifyError } = useSystemBackupFeedback();
  const { pushToast } = useAppToast();
  const { addLog } = useRunLogs();
  const pageSize = useProfileDirectoryPageSize();
  const directorySearch = useDirectorySearchQuery({ debounceMs: DIRECTORY_SEARCH_FETCH_DEBOUNCE_MS });
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<ProfileRow["status"][]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [jobBusy, setJobBusy] = useState(false);
  const [jobPhase, setJobPhase] = useState("");
  const [jobCurrent, setJobCurrent] = useState(0);
  const [jobTotal, setJobTotal] = useState(0);
  const [storageById, setStorageById] = useState<Record<string, ProfileStorageStat>>({});
  const [lastBackupById, setLastBackupById] = useState<Record<string, string | undefined>>({});
  const nameByIdRef = useRef<Record<string, string>>({});
  const lastProgressLogRef = useRef("");
  const lastProgressKeyRef = useRef("");
  const storageSizesGenRef = useRef(0);
  const jobUiTimerRef = useRef<number | undefined>(undefined);
  const pendingJobUiRef = useRef<{ phase: string; current: number; total: number } | null>(null);

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
      setProfiles(page.profiles as ProfileRow[]);
      setTotal(page.total);
      const ids = page.profiles.map((p) => p.id);
      for (const row of page.profiles) {
        nameByIdRef.current[row.id] = row.name;
      }
      setBusy(false);
      const sizesGen = ++storageSizesGenRef.current;
      void fetchProfileStorageStats(ids, { includeBytes: false })
        .then((stats) => {
          if (sizesGen !== storageSizesGenRef.current) return;
          setStorageById(Object.fromEntries(stats.map((s) => [s.id, s])));
        })
        .catch(() => undefined);
      window.setTimeout(() => {
        if (sizesGen !== storageSizesGenRef.current) return;
        void fetchProfileStorageStats(ids, { includeBytes: true })
          .then((stats) => {
            if (sizesGen !== storageSizesGenRef.current) return;
            setStorageById((prev) => {
              const next = { ...prev };
              for (const stat of stats) next[stat.id] = stat;
              return next;
            });
          })
          .catch(() => undefined);
      }, 400);
      void fetchProfileBackupMeta(ids)
        .then((meta) => setLastBackupById(Object.fromEntries(meta.map((m) => [m.id, m.lastBackupAt]))))
        .catch(() => setLastBackupById({}));
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }, [directorySearch.query, notifyError, pageIndex, pageSize, selectedGroupIds, selectedStatuses]);

  useEffect(() => {
    setPageIndex(0);
  }, [directorySearch.query, selectedGroupIds, selectedStatuses]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

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

  return (
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
      selectedIds={selectedIds}
      selectedCount={selectedRows.length}
      allVisibleSelected={allVisibleSelected}
      onToggleSelect={toggleSelect}
      onToggleSelectAll={toggleSelectAll}
      onBackupSelected={() => void onBackupSelected()}
      onBackupAll={() => void onBackupAll()}
      onRestore={() => void onRestore()}
      headerActions={headerActions}
      kpis={kpis}
      centerStats={centerStats}
      groups={groups}
      catalogStats={catalogStats}
      rail={<SystemBackupRail backupJobLabel={backupJobLabel} />}
    />
  );
});
