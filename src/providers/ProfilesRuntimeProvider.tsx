import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { StealthScreen } from "../lib/stealth-screen";
import {
  bulkUpdateStartupUrl,
  closeProfile,
  createGroup,
  createProfile,
  deleteGroup,
  deleteProfiles,
  exportProfilesBundle,
  fetchProfileBootstrap,
  fetchProfileCatalogStats,
  fetchRunHistory,
  importProfilesBundle,
  launchProfile,
  runOpenUrl,
  updateGroup,
  updateProfile,
} from "../api";
import {
  catalogStatsToKpiNumbers,
  patchCatalogStatsForSessionEvent,
  patchCatalogStatsForStatusChange,
  reconcileCatalogStats,
} from "../features/profiles/profile-catalog-stats-patch";
import { useRunLogs } from "../features/runtime/RunLogsContext";
import { downloadJson } from "../lib/stealth-profile-utils";
import { resolveStartupUrlSave } from "../lib/startup-url";
import type { ProfileRow, RunHistoryItem, ProfileCatalogStats, StealthGroup, StealthProfile } from "../types";

export type ProfilesRuntimeContextValue = {
  profiles: ProfileRow[];
  groups: StealthGroup[];
  catalogStats: ProfileCatalogStats | null;
  history: RunHistoryItem[];
  selectedProfiles: ProfileRow[];
  setAutomationProfileSelection: (profiles: ProfileRow[]) => void;
  refreshProfiles: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  syncBusy: boolean;
  createProfile: (input: {
    name: string;
    groupId?: string;
    proxy?: string;
    note?: string;
    fingerprintSeed?: number;
    startupUrl?: string;
  }) => Promise<StealthProfile>;
  updateProfile: (input: Partial<StealthProfile> & { id: string }) => Promise<StealthProfile>;
  deleteSelected: (ids: string[]) => Promise<void>;
  bulkSetStartupUrl: (ids: string[], startupUrl: string) => Promise<void>;
  createGroup: (name: string) => Promise<StealthGroup>;
  updateGroup: (id: string, name: string) => Promise<StealthGroup>;
  deleteGroup: (id: string) => Promise<void>;
  exportProfiles: () => Promise<void>;
  importProfiles: (bundle: unknown) => Promise<void>;
  openOne: (profile: ProfileRow) => Promise<void>;
  closeOne: (profile: ProfileRow) => Promise<void>;
  runOpenUrl: (
    selectedProfiles: ProfileRow[],
    options: { targetUrl: string; screenshot: boolean; closeWhenDone: boolean },
  ) => Promise<void>;
  replayRun: (run: RunHistoryItem) => Promise<void>;
  exportRunLogs: (runs: RunHistoryItem[]) => void;
  appendAutomationRun: (entry: RunHistoryItem) => void;
};

const ProfilesRuntimeContext = createContext<ProfilesRuntimeContextValue | null>(null);

export function useProfilesRuntime() {
  const ctx = useContext(ProfilesRuntimeContext);
  if (!ctx) throw new Error("useProfilesRuntime must be used within ProfilesRuntimeProvider");
  return ctx;
}

export function ProfilesRuntimeProvider({
  view,
  children,
}: {
  view: StealthScreen;
  children: ReactNode;
}) {
  const { addLog } = useRunLogs();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [groups, setGroups] = useState<StealthGroup[]>([]);
  const [catalogStats, setCatalogStats] = useState<ProfileCatalogStats | null>(null);
  const [history, setHistory] = useState<RunHistoryItem[]>([]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [automationProfiles, setAutomationProfileSelection] = useState<ProfileRow[]>([]);

  const refreshHistory = useCallback(async () => {
    try {
      const runs = await fetchRunHistory(200);
      setHistory(runs);
    } catch (error) {
      addLog("error", "Workflow", error instanceof Error ? error.message : "Unable to load run history.");
    }
  }, [addLog]);

  const refreshProfiles = useCallback(async () => {
    setSyncBusy(true);
    try {
      const data = await fetchProfileBootstrap();
      setGroups(data.groups);
      setCatalogStats(data.stats);
    } catch (error) {
      addLog("error", "System", error instanceof Error ? error.message : "Unable to refresh profiles.");
    } finally {
      setSyncBusy(false);
    }
  }, [addLog]);

  const refreshCatalogStats = useCallback(async () => {
    try {
      const stats = await fetchProfileCatalogStats();
      setCatalogStats(stats);
    } catch {
      // non-fatal — directory page fetch also supplies stats
    }
  }, []);

  useEffect(() => {
    const api = window.stealthApi;
    if (!api?.onProfileSession) return undefined;
    // Patch in-place cho từng event (rẻ). Refresh full chỉ chạy debounced —
    // ở 5k+ profile, refresh mỗi lần close = 210ms reload; chạy lô 20–30 sẽ giật.
    // Gộp burst close thành 1 reconcile sau khi lắng.
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReconcile = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void refreshCatalogStats();
      }, 1500);
    };
    const off = api.onProfileSession(({ profile, event }) => {
      let prevStatus: ProfileRow["status"] | undefined;
      setProfiles((prev) => {
        const index = prev.findIndex((row) => row.id === profile.id);
        if (index < 0) return prev;
        prevStatus = prev[index]!.status;
        const next = [...prev];
        next[index] = { ...next[index], ...profile };
        return next;
      });
      setCatalogStats((stats) => {
        if (!stats) return stats;
        if (prevStatus && prevStatus !== profile.status) {
          return reconcileCatalogStats(
            patchCatalogStatsForStatusChange(stats, prevStatus, profile.status),
          );
        }
        return reconcileCatalogStats(patchCatalogStatsForSessionEvent(stats, event));
      });
      if (event === "closed" || event === "failed" || event === "storage-released") {
        scheduleReconcile();
      }
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      off?.();
    };
  }, [refreshCatalogStats]);

  useEffect(() => {
    if (view === "workflow") {
      void refreshHistory();
    }
  }, [view, refreshHistory]);

  const appendRunToHistory = useCallback(
    (result: Awaited<ReturnType<typeof runOpenUrl>>, profile: ProfileRow, targetUrl: string) => {
      setHistory((prev) =>
        [
          {
            id: result.runId,
            profileId: profile.id,
            profileName: profile.name,
            workflow: "open-url",
            targetUrl,
            status: (result.ok ? "success" : "failed") as RunHistoryItem["status"],
            startedAt: result.startedAt,
            finishedAt: result.finishedAt,
            durationMs: result.durationMs,
            screenshotPath: result.screenshotPath,
            error: result.error,
            logs: result.logs,
          },
          ...prev,
        ].slice(0, 200),
      );
    },
    [],
  );

  const executeOpenUrl = useCallback(
    async (
      selectedProfiles: ProfileRow[],
      options: { targetUrl: string; screenshot: boolean; closeWhenDone: boolean },
    ) => {
      if (!selectedProfiles.length) return;
      try {
        for (const profile of selectedProfiles) {
          addLog("info", profile.name, `Open URL: ${options.targetUrl}`);
          const result = await runOpenUrl({
            profileId: profile.id,
            targetUrl: options.targetUrl,
            screenshot: options.screenshot,
            closeWhenDone: options.closeWhenDone,
          });
          for (const entry of result.logs) {
            addLog(entry.level, profile.name, entry.message);
          }
          appendRunToHistory(result, profile, options.targetUrl);
        }
      } catch (error) {
        addLog("error", "Profiles", error instanceof Error ? error.message : "Open URL failed");
      }
    },
    [addLog, appendRunToHistory],
  );

  const handleCreateProfile = useCallback(
    async (input: {
      name: string;
      groupId?: string;
      proxy?: string;
      note?: string;
      fingerprintSeed?: number;
      startupUrl?: string;
    }) => {
      const profile = await createProfile(input);
      addLog("success", profile.name, "Profile created");
      await refreshProfiles();
      return profile;
    },
    [addLog, refreshProfiles],
  );

  const handleUpdateProfile = useCallback(
    async (input: Partial<StealthProfile> & { id: string }) => {
      const profile = await updateProfile(input);
      addLog("success", profile.name, "Profile updated");
      await refreshProfiles();
      return profile;
    },
    [addLog, refreshProfiles],
  );

  const handleDeleteSelected = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      try {
        const result = await deleteProfiles(ids);
        const label =
          result.names?.length === 1
            ? `"${result.names[0]}"`
            : `${result.count} profile(s)`;
        const disk =
          result.storagePurged === result.count
            ? "Chrome profile data removed from disk"
            : result.storagePurged
              ? `Chrome data removed for ${result.storagePurged}/${result.count}`
              : "database row removed";
        addLog("success", "Profiles", `Deleted ${label} — ${disk}`);
        await refreshProfiles();
      } catch (error) {
        addLog("error", "Profiles", error instanceof Error ? error.message : "Delete failed");
        throw error;
      }
    },
    [addLog, refreshProfiles],
  );

  const handleBulkSetStartupUrl = useCallback(
    async (ids: string[], startupUrl: string) => {
      if (!ids.length) return;
      const normalized = resolveStartupUrlSave(startupUrl, "");
      await bulkUpdateStartupUrl(ids, normalized);
      addLog("success", "Profiles", `Startup URL updated for ${ids.length} profile(s)`);
      await refreshProfiles();
    },
    [addLog, refreshProfiles],
  );

  const handleCreateGroup = useCallback(
    async (name: string) => {
      const group = await createGroup(name);
      addLog("success", "Groups", `Created group "${group.name}"`);
      await refreshProfiles();
      return group;
    },
    [addLog, refreshProfiles],
  );

  const handleUpdateGroup = useCallback(
    async (id: string, name: string) => {
      const group = await updateGroup(id, name);
      addLog("success", "Groups", `Renamed group to "${group.name}"`);
      await refreshProfiles();
      return group;
    },
    [addLog, refreshProfiles],
  );

  const handleDeleteGroup = useCallback(
    async (id: string) => {
      await deleteGroup(id);
      addLog("info", "Groups", "Group deleted");
      await refreshProfiles();
    },
    [addLog, refreshProfiles],
  );

  const handleExportProfiles = useCallback(async () => {
    const bundle = (await exportProfilesBundle()) as { profiles: unknown[] };
    downloadJson(`stealth-profiles-${new Date().toISOString().slice(0, 10)}.json`, bundle);
    addLog("success", "Profiles", `Exported ${bundle.profiles.length} profile(s)`);
  }, [addLog]);

  const handleImportProfiles = useCallback(
    async (bundle: unknown) => {
      const result = await importProfilesBundle(bundle, true);
      addLog("success", "Profiles", `Imported ${result.imported} profile(s)`);
      await refreshProfiles();
    },
    [addLog, refreshProfiles],
  );

  const handleOpenOne = useCallback(
    async (profile: ProfileRow) => {
      addLog("info", profile.name, "Run — opening with startup URL");
      try {
        const next = await launchProfile(profile.id, profile.name);
        addLog("success", profile.name, "Profile running");
        setProfiles((prev) => prev.map((row) => (row.id === next.id ? next : row)));
      } catch (error) {
        addLog("error", profile.name, error instanceof Error ? error.message : "Launch failed");
        await refreshProfiles();
      }
    },
    [addLog, refreshProfiles],
  );

  const handleCloseOne = useCallback(
    async (profile: ProfileRow) => {
      addLog("info", profile.name, "Closing browser");
      try {
        const next = await closeProfile(profile.id, profile.name);
        addLog("success", profile.name, "Browser closed");
        setProfiles((prev) => prev.map((row) => (row.id === next.id ? next : row)));
      } catch (error) {
        addLog("error", profile.name, error instanceof Error ? error.message : "Close failed");
      }
    },
    [addLog],
  );

  const handleReplayRun = useCallback(
    async (run: RunHistoryItem) => {
      const profile =
        profiles.find((row) => row.id === run.profileId) ??
        ({
          id: run.profileId,
          name: run.profileName || run.profileId,
          status: "closed",
        } as ProfileRow);
      if (!run.targetUrl) {
        addLog("error", "Workflow", "Run has no target URL to replay.");
        return;
      }
      await executeOpenUrl([profile], {
        targetUrl: run.targetUrl,
        screenshot: true,
        closeWhenDone: false,
      });
    },
    [profiles, addLog, executeOpenUrl],
  );

  const handleExportRunLogs = useCallback(
    (runs: RunHistoryItem[]) => {
      downloadJson(`stealth-run-logs-${new Date().toISOString().slice(0, 10)}.json`, runs);
      addLog("success", "Workflow", `Exported ${runs.length} run log(s)`);
    },
    [addLog],
  );

  const appendAutomationRun = useCallback((entry: RunHistoryItem) => {
    setHistory((prev) => [entry, ...prev].slice(0, 200));
  }, []);

  const runtimeValue = useMemo<ProfilesRuntimeContextValue>(
    () => ({
      profiles,
      groups,
      catalogStats,
      history,
      selectedProfiles: automationProfiles,
      setAutomationProfileSelection,
      syncBusy,
      refreshProfiles,
      refreshHistory,
      createProfile: handleCreateProfile,
      updateProfile: handleUpdateProfile,
      deleteSelected: handleDeleteSelected,
      bulkSetStartupUrl: handleBulkSetStartupUrl,
      createGroup: handleCreateGroup,
      updateGroup: handleUpdateGroup,
      deleteGroup: handleDeleteGroup,
      exportProfiles: handleExportProfiles,
      importProfiles: handleImportProfiles,
      openOne: handleOpenOne,
      closeOne: handleCloseOne,
      runOpenUrl: executeOpenUrl,
      replayRun: handleReplayRun,
      exportRunLogs: handleExportRunLogs,
      appendAutomationRun,
    }),
    [
      profiles,
      groups,
      catalogStats,
      history,
      automationProfiles,
      syncBusy,
      refreshProfiles,
      refreshHistory,
      handleCreateProfile,
      handleUpdateProfile,
      handleDeleteSelected,
      handleBulkSetStartupUrl,
      handleCreateGroup,
      handleUpdateGroup,
      handleDeleteGroup,
      handleExportProfiles,
      handleImportProfiles,
      handleOpenOne,
      handleCloseOne,
      executeOpenUrl,
      handleReplayRun,
      handleExportRunLogs,
      appendAutomationRun,
    ],
  );

  return <ProfilesRuntimeContext.Provider value={runtimeValue}>{children}</ProfilesRuntimeContext.Provider>;
}
