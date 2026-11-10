import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { StealthScreen } from "../lib/stealth-screen";
import {
  boostWaitingProfile,
  bulkUpdateProfiles,
  bulkUpdateStartupUrl,
  cloneProfilesBatch,
  closeAllRunningProfiles,
  closeProfile,
  createGroup,
  createProfile,
  createProfilesBulkByNames,
  createProfilesBulkByRange,
  deleteGroup,
  deleteProfiles,
  exportProfilesBundle,
  fetchProfileBootstrap,
  fetchProfileCatalogStats,
  fetchRunningProfileSessions,
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
import { useCatalogStatsFocusReconcile } from "../features/profiles/useCatalogStatsFocusReconcile";
import { useRunLogs } from "../features/runtime/RunLogsContext";
import { useAppToast } from "../components/toast";
import { buildProfileExportFilename, downloadJson } from "../lib/stealth-profile-utils";
import { resolveStartupUrlSave } from "../lib/startup-url";
import type { BulkCreateProfileDefaults, BulkCreateProfilesResult, BulkUpdateProfilesPatch, ProfileRow, RunHistoryItem, ProfileCatalogStats, StealthGroup, StealthProfile } from "../types";

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
    staticIp?: boolean;
    note?: string;
    fingerprintSeed?: number;
    startupUrl?: string;
  }) => Promise<StealthProfile>;
  createProfilesBulkByNames: (input: { names: string[] } & BulkCreateProfileDefaults) => Promise<BulkCreateProfilesResult>;
  createProfilesBulkByRange: (input: { start: number; end: number; pad?: number } & BulkCreateProfileDefaults) => Promise<BulkCreateProfilesResult>;
  updateProfile: (input: Partial<StealthProfile> & { id: string; lastChangeSummary?: string }) => Promise<StealthProfile>;
  bulkUpdateProfiles: (ids: string[], patch: BulkUpdateProfilesPatch) => Promise<{ count: number }>;
  cloneProfilesBatch: (
    sourceIds: string[],
    count?: number,
    overrides?: Partial<StealthProfile>,
  ) => Promise<{ created: number; createdCodes: string[] }>;
  deleteSelected: (ids: string[]) => Promise<void>;
  bulkSetStartupUrl: (ids: string[], startupUrl: string) => Promise<void>;
  createGroup: (name: string) => Promise<StealthGroup>;
  updateGroup: (id: string, name: string) => Promise<StealthGroup>;
  deleteGroup: (id: string) => Promise<void>;
  exportProfiles: (selected?: ProfileRow[]) => Promise<void>;
  importProfiles: (bundle: unknown) => Promise<void>;
  openOne: (profile: ProfileRow) => Promise<void>;
  closeOne: (profile: ProfileRow) => Promise<void>;
  boostWaitingOne: (profile: ProfileRow) => Promise<void>;
  closeAllRunning: () => Promise<void>;
  runningHeadlessIds: ReadonlySet<string>;
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
  const { pushToast } = useAppToast();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [groups, setGroups] = useState<StealthGroup[]>([]);
  const [catalogStats, setCatalogStats] = useState<ProfileCatalogStats | null>(null);
  const [history, setHistory] = useState<RunHistoryItem[]>([]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [automationProfiles, setAutomationProfileSelection] = useState<ProfileRow[]>([]);
  const [runningHeadlessIds, setRunningHeadlessIds] = useState<ReadonlySet<string>>(() => new Set());
  const runningHeadlessIdsRef = useRef<Set<string>>(new Set());
  const lastCloseLogAtByProfileRef = useRef<Map<string, number>>(new Map());
  const bootLoggedRef = useRef(false);

  const refreshRunningHeadless = useCallback(async () => {
    try {
      const sessions = await fetchRunningProfileSessions();
      const headedIds = new Set(sessions.filter((row) => !row.headless).map((row) => row.id));
      const nextIds = sessions.filter((row) => row.headless && !headedIds.has(row.id)).map((row) => row.id);
      for (const id of nextIds) runningHeadlessIdsRef.current.add(id);
      setRunningHeadlessIds((prev) => {
        if (prev.size === nextIds.length && nextIds.every((id) => prev.has(id))) {
          return prev;
        }
        return new Set(nextIds);
      });
    } catch {
      // stale preload or API offline — keep last known set
    }
  }, []);

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
      if (!bootLoggedRef.current && data.stats) {
        bootLoggedRef.current = true;
        addLog(
          "info",
          "System",
          `Catalog ready — ${data.stats.total.toLocaleString()} profiles (${data.stats.headedRunning ?? 0} running, ${data.stats.headlessRunning ?? 0} headless, ${data.stats.deferred ?? 0} waiting)`,
        );
      }
      void refreshHistory();
    } catch (error) {
      addLog("error", "System", error instanceof Error ? error.message : "Unable to refresh profiles.");
    } finally {
      setSyncBusy(false);
    }
  }, [addLog, refreshHistory]);

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
    let historyTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReconcile = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        void refreshRunningHeadless();
        void refreshCatalogStats();
      }, 1200);
      if (historyTimer) clearTimeout(historyTimer);
      historyTimer = setTimeout(() => {
        historyTimer = undefined;
        void refreshHistory();
      }, 3000);
    };
    const off = api.onProfileSession(({ profile, event }) => {
      const srcLabel = profile.name || profile.id.slice(0, 8);
      if ((event === "opening" || event === "running" || event === "focused") && profile.headless) {
        runningHeadlessIdsRef.current.add(profile.id);
      }
      const wasHeadless = Boolean(
        profile.headless ||
          runningHeadlessIdsRef.current.has(profile.id) ||
          event === "profile_close" ||
          event === "context-closed" ||
          /^9\d{3}$/.test(srcLabel),
      );
      const headlessSuffix = wasHeadless ? " (👻 Headless)" : " (🖥️ Window)";
      const netTag = profile.proxy?.trim() ? `🛡️ ${profile.proxy.trim()}` : "🏠 Local IP";
      const urlTag =
        profile.startupUrl && profile.startupUrl !== "about:blank"
          ? ` · 🔗 ${profile.startupUrl}`
          : "";
      if (event === "running") {
        addLog(
          "success",
          srcLabel,
          `Session ready${headlessSuffix} → ${netTag} · 🍪 Cookie Guard OK · 🧩 E0001+E0002${urlTag}`,
        );
      } else if (event === "failed") {
        addLog("error", srcLabel, `Browser session failed${headlessSuffix} → ${netTag}`);
      } else if (event === "closed" || event === "profile_close" || event === "window-closed" || event === "context-closed") {
        const nowMs = Date.now();
        const prevCloseAt = lastCloseLogAtByProfileRef.current.get(profile.id) || 0;
        if (nowMs - prevCloseAt > 3000) {
          lastCloseLogAtByProfileRef.current.set(profile.id, nowMs);
          addLog(
            "info",
            srcLabel,
            `Session closed${headlessSuffix} → 🍪 SQLite cookies flushed & synced`,
          );
        }
        runningHeadlessIdsRef.current.delete(profile.id);
      }
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
      const isClosedEvent =
        profile.status === "closed" ||
        event === "closed" ||
        event === "profile_close" ||
        event === "window-closed" ||
        event === "context-closed" ||
        event === "disconnected" ||
        event === "watchdog" ||
        event === "opening-stale" ||
        event === "reconcile" ||
        event === "failed" ||
        event === "storage-released" ||
        event === "startup-reconciled";
      if (isClosedEvent) {
        setRunningHeadlessIds((prev) => {
          if (!prev.has(profile.id)) return prev;
          const next = new Set(prev);
          next.delete(profile.id);
          return next;
        });
        scheduleReconcile();
      } else if (event === "running" || event === "focused" || event === "opening") {
        if (profile.headless) {
          setRunningHeadlessIds((prev) => {
            if (prev.has(profile.id)) return prev;
            const next = new Set(prev);
            next.add(profile.id);
            return next;
          });
        }
        scheduleReconcile();
      }
    });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (historyTimer) clearTimeout(historyTimer);
      off?.();
    };
  }, [addLog, refreshCatalogStats, refreshHistory, refreshRunningHeadless]);

  useCatalogStatsFocusReconcile(refreshCatalogStats);

  useEffect(() => {
    void refreshRunningHeadless();
    const timer = setInterval(() => {
      void refreshRunningHeadless();
      void refreshCatalogStats();
    }, 4000);
    return () => clearInterval(timer);
  }, [refreshRunningHeadless, refreshCatalogStats]);

  useEffect(() => {
    if (view === "profiles" || view === "workflow") {
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
      staticIp?: boolean;
      note?: string;
      fingerprintSeed?: number;
      startupUrl?: string;
    }) => {
      const profile = await createProfile(input);
      const createSummary =
        (profile as { lastChangeSummary?: string }).lastChangeSummary?.trim() ||
        `Profile: — → #${profile.name} · Proxy: — → ${(profile.proxy || "").trim() || "Local IP"}`;
      addLog("success", profile.name, createSummary);
      await refreshProfiles();
      return profile;
    },
    [addLog, refreshProfiles],
  );

  const handleUpdateProfile = useCallback(
    async (input: Partial<StealthProfile> & { id: string; lastChangeSummary?: string }) => {
      const profile = await updateProfile(input);
      const summary =
        (profile as { lastChangeSummary?: string }).lastChangeSummary?.trim() ||
        input.lastChangeSummary?.trim() ||
        "Profile updated";
      addLog("success", profile.name, summary);
      await refreshProfiles();
      return profile;
    },
    [addLog, refreshProfiles],
  );

  const handleBulkUpdateProfiles = useCallback(
    async (ids: string[], patch: BulkUpdateProfilesPatch) => {
      if (!ids.length) return { count: 0 };
      const res = await bulkUpdateProfiles(ids, patch);
      const updatedRows = (res.profiles ?? []).filter((p) => Boolean(p?.lastChangeSummary?.trim()));
      if (updatedRows.length > 0) {
        for (const p of updatedRows.slice(0, 25)) {
          addLog("success", p.name, p.lastChangeSummary!.trim());
        }
      } else if (patch.resetToDefaults) {
        addLog("success", `Profiles (${res.count})`, "Proxy: Custom → Local IP · Static IP: On → Off");
      } else {
        const fallbackParts: string[] = [];
        if (patch.proxy !== undefined) fallbackParts.push(`Proxy: — → ${patch.proxy.trim() || "Local IP"}`);
        if (patch.staticIp !== undefined) fallbackParts.push(`Static IP: — → ${patch.staticIp ? "On" : "Off"}`);
        if (patch.groupId !== undefined) fallbackParts.push(`Group: — → ${patch.groupId || "Default"}`);
        if (patch.note !== undefined) fallbackParts.push(`Note: — → ${patch.note.trim() || "—"}`);
        if (patch.startupUrl !== undefined) fallbackParts.push(`Startup URL: — → ${patch.startupUrl.trim() || "—"}`);
        if (patch.devicePreset !== undefined) fallbackParts.push(`Device: — → ${patch.devicePreset || "custom"}`);
        if (patch.platform !== undefined) fallbackParts.push(`Platform: — → ${patch.platform || "windows"}`);
        if (patch.extensionOverrideDelta) {
          fallbackParts.push(
            `Extensions: — → ${patch.extensionOverrideDelta.key}=${patch.extensionOverrideDelta.enabled ? "On" : "Off"}`,
          );
        }
        addLog(
          "success",
          `Profiles (${res.count})`,
          fallbackParts.join(" · ") || "Settings: Saved → Updated",
        );
      }
      await refreshProfiles();
      return res;
    },
    [addLog, refreshProfiles],
  );

  const handleCloneProfilesBatch = useCallback(
    async (sourceIds: string[], count = 1, overrides?: Partial<StealthProfile>) => {
      if (!sourceIds.length) return { created: 0, createdCodes: [] };
      const res = await cloneProfilesBatch(sourceIds, count, overrides);
      if (res.created > 0) {
        const clonedRows = (res.profiles ?? []).filter((p) => Boolean(p?.lastChangeSummary?.trim()));
        if (clonedRows.length > 0) {
          for (const p of clonedRows.slice(0, 25)) {
            addLog("success", p.name, p.lastChangeSummary!.trim());
          }
        } else {
          const codesLabel =
            res.createdCodes.length === 1
              ? `#${res.createdCodes[0]}`
              : `${res.created} profiles (#${res.createdCodes[0]}…#${res.createdCodes[res.createdCodes.length - 1]})`;
          addLog("success", "Profiles", `Clone: ${sourceIds.length} source(s) → ${codesLabel}`);
        }
        await refreshProfiles();
      }
      return res;
    },
    [addLog, refreshProfiles],
  );

  const handleCreateProfilesBulkByNames = useCallback(
    async (input: { names: string[] } & BulkCreateProfileDefaults) => {
      const result = await createProfilesBulkByNames(input);
      const createdPreview =
        result.createdNames.length === 1
          ? `#${result.createdNames[0]}`
          : result.createdNames.length > 1
            ? `${result.created} profiles (#${result.createdNames[0]}…#${result.createdNames[result.createdNames.length - 1]})`
            : `${result.created} created (${result.skippedExisting} existing)`;
      addLog(
        "success",
        result.createdNames.length === 1 ? result.createdNames[0]! : `Profiles (${result.created})`,
        `Profile: — → ${createdPreview}`,
      );
      await refreshProfiles();
      return result;
    },
    [addLog, refreshProfiles],
  );

  const handleCreateProfilesBulkByRange = useCallback(
    async (input: { start: number; end: number; pad?: number } & BulkCreateProfileDefaults) => {
      const result = await createProfilesBulkByRange(input);
      const createdPreview =
        result.createdNames.length === 1
          ? `#${result.createdNames[0]}`
          : result.createdNames.length > 1
            ? `${result.created} profiles (#${result.createdNames[0]}…#${result.createdNames[result.createdNames.length - 1]})`
            : `${result.created} created (${result.skippedExisting} existing)`;
      addLog(
        "success",
        result.createdNames.length === 1 ? result.createdNames[0]! : `Profiles (${result.created})`,
        `Profile: — → ${createdPreview}`,
      );
      await refreshProfiles();
      return result;
    },
    [addLog, refreshProfiles],
  );

  const handleDeleteSelected = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      try {
        const preDeleteSnapshots = ids
          .map((id) => profiles.find((row) => row.id === id))
          .filter((row): row is ProfileRow => Boolean(row));
        const result = await deleteProfiles(ids);
        const deletedRows = (result.deletedProfiles ?? []).filter((p) => Boolean(p?.lastChangeSummary?.trim()));
        if (deletedRows.length > 0) {
          for (const p of deletedRows.slice(0, 25)) {
            addLog("warn", p.name, p.lastChangeSummary!.trim());
          }
        } else if (preDeleteSnapshots.length > 0) {
          for (const row of preDeleteSnapshots.slice(0, 25)) {
            const parts = [
              `Profile: #${row.name} → Deleted`,
              `Proxy: ${(row.proxy || "").trim() || "Local IP"} → —`,
            ];
            if (row.staticIp) parts.push("Static IP: On → —");
            if (row.startupUrl?.trim()) parts.push(`Startup URL: ${row.startupUrl.trim()} → —`);
            addLog("warn", row.name, parts.join(" · "));
          }
        } else {
          const names = result.names?.length ? result.names : ids;
          for (const n of names.slice(0, 25)) {
            const clean = String(n).replace(/^#/, "");
            addLog("warn", clean, `Profile: #${clean} → Deleted`);
          }
        }
        await refreshProfiles();
      } catch (error) {
        addLog("error", "Profiles", error instanceof Error ? error.message : "Delete failed");
        throw error;
      }
    },
    [addLog, profiles, refreshProfiles],
  );

  const handleBulkSetStartupUrl = useCallback(
    async (ids: string[], startupUrl: string) => {
      if (!ids.length) return;
      const normalized = resolveStartupUrlSave(startupUrl, "");
      const res = await bulkUpdateStartupUrl(ids, normalized);
      const updatedRows = (res.profiles ?? []).filter((p) => Boolean(p?.lastChangeSummary?.trim()));
      if (updatedRows.length > 0) {
        for (const p of updatedRows.slice(0, 25)) {
          addLog("success", p.name, p.lastChangeSummary!.trim());
        }
      } else {
        addLog("success", `Profiles (${ids.length})`, `Startup URL: — → ${normalized || "—"}`);
      }
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

  const handleExportProfiles = useCallback(async (selected?: ProfileRow[]) => {
    if (!selected?.length) return;
    const full = (await exportProfilesBundle()) as {
      profiles: Array<{ id?: string; name?: string }>;
      groups?: unknown[];
      version?: number;
      matchBy?: string;
      exportedAt?: string;
    };
    const picked = Array.isArray(full.profiles)
      ? full.profiles.filter((row) => selected.some((s) => s.id === row.id))
      : full.profiles;
    const bundle = { ...full, profiles: picked, exportedAt: new Date().toISOString() };
    const exportNames = selected.map((row) => row.name);
    downloadJson(buildProfileExportFilename(exportNames, "json"), bundle);
    addLog("success", "Profiles", `Exported ${picked?.length ?? 0} profile(s)`);
  }, [addLog]);

  const handleImportProfiles = useCallback(
    async (bundle: unknown) => {
      const result = await importProfilesBundle(bundle, true, "name");
      const skipped =
        result.skipped && result.skipped > 0
          ? ` (${result.skipped} skipped${result.skippedNames?.length ? `: ${result.skippedNames.slice(0, 5).join(", ")}` : ""})`
          : "";
      addLog(
        "success",
        "Profiles",
        `Imported ${result.imported} profile(s) by name — ${result.updated ?? 0} updated, ${result.created ?? 0} new${skipped}`,
      );
      await refreshProfiles();
    },
    [addLog, refreshProfiles],
  );

  const handleBoostWaitingOne = useCallback(
    async (profile: ProfileRow) => {
      const res = await boostWaitingProfile(profile.name || profile.id);
      if (res.ok) {
        addLog("info", profile.name, "⚡ Priority boosted to #1 in AI Agent Headless queue");
        pushToast(`⚡ Profile #${profile.name} boosted to #1 in AI Agent Headless queue.`, "success");
        void refreshCatalogStats();
      } else {
        addLog("warn", profile.name, res.error || "Priority boost failed");
        pushToast(res.error || "Unable to boost waiting profile.", "warn");
      }
    },
    [addLog, pushToast, refreshCatalogStats],
  );

  const handleOpenOne = useCallback(
    async (profile: ProfileRow) => {
      const isWaiting = Boolean(
        catalogStats?.waitingReasons?.[profile.id] || catalogStats?.waitingReasons?.[profile.name],
      );
      if (isWaiting) {
        void boostWaitingProfile(profile.name || profile.id);
        addLog("info", profile.name, "⚡ Priority boosted in AI Agent queue & opening browser");
      } else {
        addLog("info", profile.name, "Run — opening with startup URL");
      }
      try {
        const result = await launchProfile(profile.id, profile.name);
        const next = result.profile;
        addLog("success", profile.name, "Profile running");
        setProfiles((prev) => prev.map((row) => (row.id === next.id ? next : row)));
        if (result.focused) {
          pushToast(`${profile.name} — browser focused (already running).`, "success");
        } else if (result.headless) {
          const mode = result.agentSmoke ? "headless (agent smoke)" : "headless";
          pushToast(`${profile.name} — Chrome opened (${mode}).`, result.agentSmoke ? "warn" : "success");
        } else {
          pushToast(`${profile.name} — Chrome opened (headed).`, "success");
        }
        void refreshRunningHeadless();
        void refreshCatalogStats();
        void refreshHistory();
      } catch (error) {
        addLog("error", profile.name, error instanceof Error ? error.message : "Launch failed");
        await refreshProfiles();
      }
    },
    [addLog, catalogStats?.waitingReasons, pushToast, refreshCatalogStats, refreshHistory, refreshProfiles, refreshRunningHeadless],
  );

  const handleCloseOne = useCallback(
    async (profile: ProfileRow) => {
      addLog("info", profile.name, "Closing browser");
      try {
        const next = await closeProfile(profile.id, profile.name);
        addLog("success", profile.name, "Browser closed");
        setProfiles((prev) => prev.map((row) => (row.id === next.id ? next : row)));
        void refreshRunningHeadless();
        void refreshCatalogStats();
      } catch (error) {
        addLog("error", profile.name, error instanceof Error ? error.message : "Close failed");
      }
    },
    [addLog, refreshCatalogStats, refreshRunningHeadless],
  );

  const handleCloseAllRunning = useCallback(async () => {
    addLog("info", "Profiles", "Closing all running browsers");
    try {
      const { count } = await closeAllRunningProfiles();
      addLog("success", "Profiles", count > 0 ? `Closed ${count} browser${count === 1 ? "" : "s"}` : "No running browsers");
      if (count > 0) {
        pushToast(`Closed ${count} running profile${count === 1 ? "" : "s"}.`, "success");
      }
      setRunningHeadlessIds(new Set());
      await refreshProfiles();
      await refreshRunningHeadless();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Close all failed";
      addLog("error", "Profiles", message);
      pushToast(message, "error");
    }
  }, [addLog, pushToast, refreshProfiles, refreshRunningHeadless]);

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
      createProfilesBulkByNames: handleCreateProfilesBulkByNames,
      createProfilesBulkByRange: handleCreateProfilesBulkByRange,
      updateProfile: handleUpdateProfile,
      bulkUpdateProfiles: handleBulkUpdateProfiles,
      cloneProfilesBatch: handleCloneProfilesBatch,
      deleteSelected: handleDeleteSelected,
      bulkSetStartupUrl: handleBulkSetStartupUrl,
      createGroup: handleCreateGroup,
      updateGroup: handleUpdateGroup,
      deleteGroup: handleDeleteGroup,
      exportProfiles: handleExportProfiles,
      importProfiles: handleImportProfiles,
      openOne: handleOpenOne,
      closeOne: handleCloseOne,
      boostWaitingOne: handleBoostWaitingOne,
      closeAllRunning: handleCloseAllRunning,
      runningHeadlessIds,
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
      handleCreateProfilesBulkByNames,
      handleCreateProfilesBulkByRange,
      handleUpdateProfile,
      handleBulkUpdateProfiles,
      handleCloneProfilesBatch,
      handleDeleteSelected,
      handleBulkSetStartupUrl,
      handleCreateGroup,
      handleUpdateGroup,
      handleDeleteGroup,
      handleExportProfiles,
      handleImportProfiles,
      handleOpenOne,
      handleCloseOne,
      handleBoostWaitingOne,
      handleCloseAllRunning,
      runningHeadlessIds,
      executeOpenUrl,
      handleReplayRun,
      handleExportRunLogs,
      appendAutomationRun,
    ],
  );

  return <ProfilesRuntimeContext.Provider value={runtimeValue}>{children}</ProfilesRuntimeContext.Provider>;
}
