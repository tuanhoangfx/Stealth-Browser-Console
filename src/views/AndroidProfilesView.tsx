import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Camera,
  Database,
  Download,
  MonitorSmartphone,
  RefreshCw,
  Smartphone,
  Upload,
} from "lucide-react";
import {
  buildDirectoryColgroup,
  buildDirectoryColumns,
  DIRECTORY_CELL_TRUNCATE,
  DIRECTORY_SEARCH_FETCH_DEBOUNCE_MS,
  DirectorySearchToolbar,
  DirectoryTableBodyCell,
  getDirectorySearchHighlight,
  HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS,
  HubBulkActionButton,
  HubConfirmDialog,
  HubDirectoryAdaptiveEditAction,
  HubDirectoryBrandNameCell,
  HubDirectoryBulkActionBar,
  HubDirectoryBulkDetailModal,
  HubDirectoryBulkMoreMenu,
  HubDirectoryDeleteBulkAction,
  HubDirectoryEllipsisCell,
  HubDirectoryNewBulkAction,
  HubDirectoryRunToggle,
  HubDirectorySearchHighlightText,
  HubDirectoryTableShell,
  HubDirectoryTimestampTooltipCell,
  HubDirectoryValuePopover,
  hubBrandFilterGlyphFields,
  hubDirectoryListResetKey,
  hubDirectoryTableClass,
  HubListChromeHeader,
  HubSplitDirectoryFilterBar,
  HubSplitDirectoryPane,
  HubSplitWorkspaceScreen,
  HubUsersOnOffLabel,
  HubUsersStatusLabel,
  isHubLocalCalendarDay,
  isHubLocalCalendarWeek,
  KpiStrip,
  resolveDirectoryPanelFillRows,
  searchTextIncludes,
  useDirectorySearchQuery,
  useDirectoryTableSort,
  useHubDirectorySelection,
  useHubScopedFreeze,
  type FilterDef,
  type FilterValues,
  type HubDirectoryBrandNameCellProps,
  type HubDirectoryBulkDetailFieldSpec,
  type HubDirectoryBulkMoreAction,
  type HubDirectoryBulkSelectedItem,
  type HubDirectoryColumnDef,
  type KpiTileData,
} from "@tool-workspace/hub-ui";
import { useProfilesRuntime } from "../providers/ProfilesRuntimeProvider";
import { useAppToast } from "../components/toast";
import { StealthDisplayBandToolbar } from "../components/StealthDisplayBandToolbar";
import {
  ANDROID_DIRECTORY_COLUMNS_CHANGE,
  androidDirectoryFreezePrefs,
  readAndroidDirectoryColumns,
  STEALTH_ANDROID_COLUMN_META,
  toHubDirectoryColumnMeta,
  type StealthAndroidColumnKey,
} from "../features/android/android-directory-prefs";
import { AndroidProfileDetailModal } from "../features/android/AndroidProfileDetailModal";
import { ProfilesWorkflowRail } from "../features/profiles/ProfilesWorkflowRail";
import { useProfileDirectoryPageSize } from "../features/profiles/useProfileDirectoryPageSize";
import { useHostHeaderStats } from "../hooks/useHostHeaderStats";
import { useStealthVersionMetaItems } from "../hooks/useStealthVersionMetaItems";
import { defaultsForPrefItems, isHubPrefVisible } from "../lib/display-pref-helpers";
import { ANDROID_DISPLAY_PREFS } from "../lib/display-prefs-registry";
import { formatDirectoryOneLine } from "../lib/directory-one-line";
import { STEALTH_PROFILE_KPI_STICKER } from "../lib/stealth-column-stickers";
import { applyStealthFilterLabelHints } from "../lib/stealth-filter-hints";
import { profileAdaptiveEditLabelHint } from "../features/profiles/profile-bulk-action-hints";
import { useStealthManualSortEnabled } from "../lib/stealth-manual-sort-prefs";
import { useStealthHubListPrefs } from "../lib/useStealthHubListPrefs";

export type MobileProfileRow = {
  code: string;
  name: string;
  manufacturer: string;
  model: string;
  androidId: string;
  gsfId: string;
  gaid: string;
  imei: string;
  serialNo: string;
  glRenderer: string;
  fingerprint: string;
  hasSnapshot: boolean;
  snapshotSizeBytes: number;
  hasIosContainer: boolean;
  cookieCount: number;
  mobilePulledCount: number;
  c_user?: string | null;
  fbAccountName?: string | null;
  services: string[];
  activeOnPhone: boolean;
  autoSync?: boolean;
  customNote?: string;
  createdAt?: string | null;
  updatedAt: string | null;
};

type MobileDeviceTelemetry = {
  adbOnline: boolean;
  serial: string | null;
  connectionMode: string;
  wifiEndpoint: string | null;
  nativeStrongIntegrity: boolean;
  verifiedBootState: string;
  liveDeviceModel: string;
  liveDeviceAndroidId: string | null;
  batteryLevel?: number | null;
  batteryTempC?: number | null;
  batteryHotAlert?: boolean;
};

export type StealthAndroidSortKey = StealthAndroidColumnKey;

const MOBILE_API_BASES = ["", "http://127.0.0.1:6004", "http://127.0.0.1:6003", "http://127.0.0.1:3002"];

function normalizeAndroidBrandName(raw: string | undefined | null): string {
  const s = String(raw || "").trim();
  const lower = s.toLowerCase();
  if (lower === "samsung") return "Samsung";
  if (lower === "google") return "Google";
  if (lower === "xiaomi") return "Xiaomi";
  if (lower === "oneplus") return "OnePlus";
  if (lower === "apple") return "Apple";
  if (!s) return "Google";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function resolveAndroidBrandId(brandLabel: string): HubDirectoryBrandNameCellProps["brandId"] {
  const lower = brandLabel.trim().toLowerCase();
  if (lower === "samsung") return "samsung";
  if (lower === "google") return "google";
  if (lower === "apple") return "apple";
  return undefined;
}

async function fetchMobileApi(path: string, init?: RequestInit) {
  const altPath = path.startsWith("/api/mobile-stealth/")
    ? path.replace("/api/mobile-stealth/", "/api/android-vault/")
    : path;
  const candidatePaths = altPath !== path ? [altPath, path] : [path];
  for (const candidatePath of candidatePaths) {
    for (const base of MOBILE_API_BASES) {
      try {
        const res = await fetch(`${base}${candidatePath}`, init);
        if (res.ok) return await res.json();
      } catch {
        /* try next base */
      }
    }
  }
  throw new Error("Mobile Stealth Bridge API (127.0.0.1:6004 / 6003 / 3002) unreachable");
}

function mobileRowKey(row: MobileProfileRow) {
  return row.code;
}

function sortableAndroidValue(row: MobileProfileRow, key: StealthAndroidSortKey): string | number {
  switch (key) {
    case "createdAt":
      return row.createdAt ? Date.parse(row.createdAt) || 0 : row.updatedAt ? Date.parse(row.updatedAt) || 0 : 0;
    case "updated":
      return row.updatedAt ? Date.parse(row.updatedAt) || 0 : 0;
    case "profile":
      return Number.parseInt(row.code, 10) || 0;
    case "group":
      return row.manufacturer.toLowerCase();
    case "autoSync":
      return row.autoSync ? 0 : 1;
    case "status":
      return row.activeOnPhone ? 0 : 1;
    case "deviceModel":
      return row.model.toLowerCase();
    case "gpu":
      return row.glRenderer.toLowerCase();
    case "androidId":
      return row.androidId.toLowerCase();
    case "imei":
      return row.imei.toLowerCase();
    case "cookies":
      return row.cookieCount;
    case "snapshot":
      return row.hasSnapshot ? 1 : 0;
    case "integrity":
      return row.activeOnPhone ? 0 : 1;
    case "note":
      return `${row.customNote || ""} ${row.services.join(", ")}`.toLowerCase();
    default:
      return row.code;
  }
}

export const AndroidProfilesView = memo(function AndroidProfilesView({
  headerActions,
}: {
  headerActions?: ReactNode;
}) {
  const { profiles: pcProfiles, openOne, closeOne, runningHeadlessIds } = useProfilesRuntime();
  const { pushToast } = useAppToast();
  const { metaItems } = useStealthVersionMetaItems();
  const hubPrefs = useStealthHubListPrefs();
  const centerStats = useHostHeaderStats(hubPrefs.headerStats);
  const pageSize = useProfileDirectoryPageSize();
  const directorySearch = useDirectorySearchQuery({ debounceMs: DIRECTORY_SEARCH_FETCH_DEBOUNCE_MS });

  const [rows, setRows] = useState<MobileProfileRow[]>([]);
  const [device, setDevice] = useState<MobileDeviceTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyCode, setBusyCode] = useState("");
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [detailRow, setDetailRow] = useState<MobileProfileRow | null>(null);
  const [bulkDetailOpen, setBulkDetailOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<StealthAndroidColumnKey[]>(() =>
    readAndroidDirectoryColumns(),
  );

  useEffect(() => {
    const syncCols = () => setVisibleColumnKeys(readAndroidDirectoryColumns());
    window.addEventListener(ANDROID_DIRECTORY_COLUMNS_CHANGE, syncCols);
    return () => window.removeEventListener(ANDROID_DIRECTORY_COLUMNS_CHANGE, syncCols);
  }, []);

  const pcProfileByCode = useMemo(() => {
    const map = new Map<string, (typeof pcProfiles)[number]>();
    for (const p of pcProfiles) {
      const m = String(p.name || "").match(/^(\d{4})\b/);
      if (m) map.set(m[1], p);
    }
    return map;
  }, [pcProfiles]);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMobileApi("/api/mobile-stealth/profiles");
      if (data?.ok) {
        const rawList: MobileProfileRow[] = Array.isArray(data.profiles) ? data.profiles : [];
        const nextRows: MobileProfileRow[] = rawList.map((r) => {
          const brand = normalizeAndroidBrandName(r.manufacturer);
          const fallbackIso = "2026-10-01T00:00:00.000Z";
          return {
            ...r,
            manufacturer: brand,
            name: `${r.code} - ${brand} ${r.model}`,
            createdAt: r.createdAt || r.updatedAt || fallbackIso,
            updatedAt: r.updatedAt || r.createdAt || fallbackIso,
          };
        });
        setRows(nextRows);
        setDevice(data.device || null);
        setDetailRow((prev) => (prev ? nextRows.find((r) => r.code === prev.code) ?? prev : null));
      }
    } catch {
      /* keep existing rows */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const runAction = useCallback(
    async (code: string, endpoint: string, label: string, extraBody: Record<string, unknown> = {}) => {
      setBusyCode(`${code}:${endpoint}`);
      try {
        const data = await fetchMobileApi(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileCode: code, ...extraBody }),
        });
        if (data?.ok) {
          pushToast(
            `${label} #${code}${
              typeof data.pushedCount === "number"
                ? ` (${data.pushedCount} cookies pushed)`
                : typeof data.cookiesCount === "number"
                  ? ` (${data.cookiesCount} cookies pulled to PC)`
                  : " succeeded"
            }`,
            "success",
          );
        } else {
          pushToast(`${label} #${code}: ${data?.reason || "completed"}`, "info");
        }
        await loadProfiles();
      } catch (err) {
        pushToast(`${label} #${code} failed: ${err instanceof Error ? err.message : "error"}`, "error");
      } finally {
        setBusyCode("");
      }
    },
    [loadProfiles, pushToast],
  );

  const handleToggleAutoSync = useCallback(
    async (row: MobileProfileRow) => {
      const next = !row.autoSync;
      setRows((prev) => prev.map((r) => (r.code === row.code ? { ...r, autoSync: next } : r)));
      try {
        await fetchMobileApi("/api/mobile-stealth/auto-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileCode: row.code, enabled: next }),
        });
        pushToast(
          `Auto-Sync #${row.code} ${next ? "ON — cookies auto-push on PC browser close" : "OFF"}`,
          "success",
        );
      } catch (err) {
        setRows((prev) => prev.map((r) => (r.code === row.code ? { ...r, autoSync: !next } : r)));
        pushToast(`Auto-Sync #${row.code} failed: ${err instanceof Error ? err.message : "error"}`, "error");
      }
    },
    [pushToast],
  );

  const handleSaveProfileDetail = useCallback(
    async (
      code: string,
      patch: {
        manufacturer: string;
        model: string;
        glRenderer: string;
        customNote: string;
        autoSync: boolean;
      },
    ) => {
      await fetchMobileApi("/api/mobile-stealth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode: code, ...patch }),
      });
      pushToast(`Saved Android profile #${code} hardware & sync settings.`, "success");
      await loadProfiles();
    },
    [loadProfiles, pushToast],
  );

  const resolveRowCreatedAt = useCallback(
    (p: MobileProfileRow): string | undefined =>
      p.createdAt || pcProfileByCode.get(p.code)?.createdAt || p.updatedAt || undefined,
    [pcProfileByCode],
  );

  const resolveRowUpdatedAt = useCallback(
    (p: MobileProfileRow): string | undefined => {
      if (p.updatedAt) return p.updatedAt;
      const pc = pcProfileByCode.get(p.code);
      if (typeof pc?.lastOpenedAt === "number" && Number.isFinite(pc.lastOpenedAt) && pc.lastOpenedAt > 0) {
        return new Date(pc.lastOpenedAt).toISOString();
      }
      return pc?.updatedAt || p.createdAt || pc?.createdAt || undefined;
    },
    [pcProfileByCode],
  );

  const filteredRows = useMemo(() => {
    const q = directorySearch.query.trim().toLowerCase();
    return rows.filter((p) => {
      if (selectedBrands.length > 0 && !selectedBrands.includes(p.manufacturer)) return false;
      if (selectedStates.length > 0) {
        const matchesState = selectedStates.some((st) => {
          if (st === "mounted") return p.activeOnPhone;
          if (st === "cookies") return p.cookieCount > 0;
          if (st === "snapshot") return p.hasSnapshot;
          if (st === "autosync") return Boolean(p.autoSync);
          if (st === "create_today") return isHubLocalCalendarDay(resolveRowCreatedAt(p));
          if (st === "create_week") return isHubLocalCalendarWeek(resolveRowCreatedAt(p));
          if (st === "update_today") return isHubLocalCalendarDay(resolveRowUpdatedAt(p));
          return true;
        });
        if (!matchesState) return false;
      }
      if (!q) return true;
      const pc = pcProfileByCode.get(p.code);
      return (
        searchTextIncludes(p.code, q) ||
        searchTextIncludes(p.name, q) ||
        searchTextIncludes(p.manufacturer, q) ||
        searchTextIncludes(p.model, q) ||
        searchTextIncludes(p.androidId, q) ||
        searchTextIncludes(p.imei, q) ||
        searchTextIncludes(p.customNote || "", q) ||
        p.services.some((s) => searchTextIncludes(s, q)) ||
        searchTextIncludes(String(pc?.name || ""), q)
      );
    });
  }, [
    directorySearch.query,
    pcProfileByCode,
    resolveRowCreatedAt,
    resolveRowUpdatedAt,
    rows,
    selectedBrands,
    selectedStates,
  ]);

  const { sortKey, sortDir, onSort, sorted } = useDirectoryTableSort(
    filteredRows,
    "profile" as StealthAndroidSortKey,
    sortableAndroidValue,
    "asc",
  );

  const pagedRows = useMemo(() => {
    const start = pageIndex * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [pageIndex, pageSize, sorted]);

  const {
    selectedIds,
    selectedRows,
    toggleSelect,
    toggleSelectAll,
    allVisibleSelected,
  } = useHubDirectorySelection(pagedRows, mobileRowKey);

  const kpiDefaults = useMemo(
    () => defaultsForPrefItems(ANDROID_DISPLAY_PREFS.kpis, ANDROID_DISPLAY_PREFS.defaultKpiKeys),
    [],
  );

  const filterDefaults = useMemo(
    () => defaultsForPrefItems(ANDROID_DISPLAY_PREFS.filters, ANDROID_DISPLAY_PREFS.defaultFilterKeys),
    [],
  );

  const kpis = useMemo<KpiTileData[]>(() => {
    const createTodayCount = rows.filter((p) => isHubLocalCalendarDay(resolveRowCreatedAt(p))).length;
    const createWeekCount = rows.filter((p) => isHubLocalCalendarWeek(resolveRowCreatedAt(p))).length;
    const updateTodayCount = rows.filter((p) => isHubLocalCalendarDay(resolveRowUpdatedAt(p))).length;
    const mountedCount = rows.filter((p) => p.activeOnPhone).length;
    const autoSyncCount = rows.filter((p) => Boolean(p.autoSync)).length;
    const syncedCookiesCount = rows.filter((p) => p.cookieCount > 0).length;
    const snapshotCount = rows.filter((p) => p.hasSnapshot).length;

    const toggleStateFilter = (stateKey: string) => {
      setSelectedStates((prev) => (prev.length === 1 && prev[0] === stateKey ? [] : [stateKey]));
      setPageIndex(0);
    };

    const allTiles: KpiTileData[] = [
      {
        prefKey: "total",
        label: "Profiles",
        value: rows.length,
        emojiGlyph: STEALTH_PROFILE_KPI_STICKER.total,
        tone: "indigo",
        active: selectedStates.length === 0 && selectedBrands.length === 0,
        onClick: () => {
          setSelectedStates([]);
          setSelectedBrands([]);
          setPageIndex(0);
        },
      },
      {
        prefKey: "create_today",
        label: "Create Today",
        value: createTodayCount,
        emojiGlyph: STEALTH_PROFILE_KPI_STICKER.create_today,
        tone: "sky",
        active: selectedStates.length === 1 && selectedStates[0] === "create_today",
        onClick: () => toggleStateFilter("create_today"),
      },
      {
        prefKey: "create_week",
        label: "Create This Week",
        value: createWeekCount,
        emojiGlyph: STEALTH_PROFILE_KPI_STICKER.create_week,
        tone: "sky",
        active: selectedStates.length === 1 && selectedStates[0] === "create_week",
        onClick: () => toggleStateFilter("create_week"),
      },
      {
        prefKey: "update_today",
        label: "Update Today",
        value: updateTodayCount,
        emojiGlyph: STEALTH_PROFILE_KPI_STICKER.update_today,
        tone: "amber",
        active: selectedStates.length === 1 && selectedStates[0] === "update_today",
        onClick: () => toggleStateFilter("update_today"),
      },
      {
        prefKey: "running",
        label: "Mounted",
        value: mountedCount,
        emojiGlyph: STEALTH_PROFILE_KPI_STICKER.running,
        tone: "emerald",
        active: selectedStates.length === 1 && selectedStates[0] === "mounted",
        onClick: () => toggleStateFilter("mounted"),
      },
      {
        prefKey: "headless",
        label: "Auto-Sync",
        value: autoSyncCount,
        emojiGlyph: "🔄",
        tone: "amber",
        active: selectedStates.length === 1 && selectedStates[0] === "autosync",
        onClick: () => toggleStateFilter("autosync"),
      },
      {
        prefKey: "ready",
        label: "Cookie Synced",
        value: syncedCookiesCount,
        emojiGlyph: STEALTH_PROFILE_KPI_STICKER.ready,
        tone: "emerald",
        active: selectedStates.length === 1 && selectedStates[0] === "cookies",
        onClick: () => toggleStateFilter("cookies"),
      },
      {
        prefKey: "failed",
        label: "Snapshots",
        value: snapshotCount,
        emojiGlyph: "📸",
        tone: "amber",
        active: selectedStates.length === 1 && selectedStates[0] === "snapshot",
        onClick: () => toggleStateFilter("snapshot"),
      },
    ];
    return allTiles.filter((item) => !item.prefKey || isHubPrefVisible(hubPrefs.kpi, kpiDefaults, item.prefKey));
  }, [
    hubPrefs.kpi,
    kpiDefaults,
    resolveRowCreatedAt,
    resolveRowUpdatedAt,
    rows,
    selectedBrands.length,
    selectedStates,
  ]);

  const filters = useMemo<FilterDef[]>(() => {
    const brandCounts = new Map<string, number>();
    for (const r of rows) {
      if (r.manufacturer) {
        brandCounts.set(r.manufacturer, (brandCounts.get(r.manufacturer) ?? 0) + 1);
      }
    }
    const defs: FilterDef[] = [
      {
        key: "group",
        label: "Brand",
        showAllLabel: false,
        totalCount: rows.length,
        options: Array.from(brandCounts.entries()).map(([brand, count]) => {
          const brandId = resolveAndroidBrandId(brand);
          return {
            value: brand,
            label: brand,
            ...(brandId ? hubBrandFilterGlyphFields(brandId) : { emoji: "📱" }),
            count,
          };
        }),
      },
      {
        key: "status",
        label: "Status",
        showAllLabel: false,
        totalCount: rows.length,
        options: [
          {
            value: "mounted",
            label: "Mounted",
            emoji: "🟢",
            count: rows.filter((r) => r.activeOnPhone).length,
          },
          {
            value: "autosync",
            label: "Auto-Sync",
            emoji: "🔄",
            count: rows.filter((r) => Boolean(r.autoSync)).length,
          },
          {
            value: "cookies",
            label: "Cookie Synced",
            emoji: "🍪",
            count: rows.filter((r) => r.cookieCount > 0).length,
          },
          {
            value: "snapshot",
            label: "Snapshot",
            emoji: "📸",
            count: rows.filter((r) => r.hasSnapshot).length,
          },
        ],
      },
    ];
    return applyStealthFilterLabelHints(
      defs.filter((f) => isHubPrefVisible(hubPrefs.hubFilters ?? null, filterDefaults, f.key)),
      "profiles",
    );
  }, [filterDefaults, hubPrefs.hubFilters, rows]);

  const filterValues = useMemo<FilterValues>(
    () => ({
      group: selectedBrands,
      status: selectedStates,
    }),
    [selectedBrands, selectedStates],
  );

  const handleFilterValuesChange = useCallback((values: FilterValues) => {
    const g = values.group;
    const s = values.status;
    setSelectedBrands(Array.isArray(g) ? g : g ? [g] : []);
    setSelectedStates(Array.isArray(s) ? s : s ? [s] : []);
    setPageIndex(0);
  }, []);

  const targetCode = selectedRows[0]?.code || rows.find((r) => r.activeOnPhone)?.code || "0046";

  const handleBulkPushCookies = useCallback(async () => {
    const targets = selectedRows.length > 0 ? selectedRows.map((r) => r.code) : [targetCode];
    for (const code of targets) {
      await runAction(code, "/api/mobile-stealth/push-cookies", "Push PC Cookies");
    }
  }, [runAction, selectedRows, targetCode]);

  const handleBulkPullCookies = useCallback(async () => {
    const targets = selectedRows.length > 0 ? selectedRows.map((r) => r.code) : [targetCode];
    for (const code of targets) {
      await runAction(code, "/api/mobile-stealth/pull-cookies", "Pull Mobile Cookies");
    }
  }, [runAction, selectedRows, targetCode]);

  const manualSort = useStealthManualSortEnabled("p0003-android");

  const columns = useMemo(
    () =>
      buildDirectoryColumns(
        visibleColumnKeys,
        toHubDirectoryColumnMeta(STEALTH_ANDROID_COLUMN_META),
        { sortable: manualSort },
      ),
    [visibleColumnKeys, manualSort],
  );
  const colgroup = useMemo(() => buildDirectoryColgroup(columns), [columns]);
  const { rootRef: freezeRootRef, stickyStyle: androidFreezeStickyStyle, stickyScopeClass } = useHubScopedFreeze({
    prefs: androidDirectoryFreezePrefs,
    columns,
    scopeClass: "stealth-android-directory-table--sticky-lead",
    leftMode: "css",
  });

  const handleCreateAndroidProfile = useCallback(async () => {
    setCreateBusy(true);
    try {
      const data = await fetchMobileApi("/api/mobile-stealth/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSync: true }),
      });
      if (data?.ok) {
        pushToast(
          `Created Android antidetect profile #${data.profileCode} (${data.identity?.manufacturer || "Google"} ${data.identity?.model || ""}).`,
          "success",
        );
        await loadProfiles();
      } else {
        pushToast(`Create Android profile failed: ${data?.error || "error"}`, "error");
      }
    } catch (err) {
      pushToast(`Create Android profile failed: ${err instanceof Error ? err.message : "error"}`, "error");
    } finally {
      setCreateBusy(false);
    }
  }, [loadProfiles, pushToast]);

  const handleConfirmDeleteAndroidProfiles = useCallback(async () => {
    const codes = Array.from(selectedIds);
    if (codes.length === 0) {
      setDeleteDialogOpen(false);
      return;
    }
    setDeleteBusy(true);
    try {
      const data = await fetchMobileApi("/api/mobile-stealth/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes }),
      });
      if (data?.ok) {
        pushToast(`Deleted ${codes.length} Android profile(s).`, "success");
        setDeleteDialogOpen(false);
        await loadProfiles();
      } else {
        pushToast(`Delete failed: ${data?.error || "error"}`, "error");
      }
    } catch (err) {
      pushToast(`Delete failed: ${err instanceof Error ? err.message : "error"}`, "error");
    } finally {
      setDeleteBusy(false);
    }
  }, [loadProfiles, pushToast, selectedIds]);

  const listResetKey = hubDirectoryListResetKey(directorySearch.query, filterValues);
  const panelFillRows = resolveDirectoryPanelFillRows(pageSize, pagedRows.length);
  const directoryBodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    directoryBodyRef.current?.scrollTo?.(0, 0);
  }, [listResetKey, pagedRows.length, pageIndex]);

  const openTargetDetail = useCallback(() => {
    const target = selectedRows[0] || rows.find((r) => r.code === targetCode) || rows[0];
    if (target) setDetailRow(target);
  }, [rows, selectedRows, targetCode]);

  const moreMenuItems = useMemo<HubDirectoryBulkMoreAction[]>(
    () => [
      {
        key: "mount",
        label: `Mount #${targetCode}`,
        icon: Smartphone,
        title: "Switch connected Android phone hardware identity to selected profile",
        disabled: Boolean(busyCode),
        onClick: () => void runAction(targetCode, "/api/mobile-stealth/switch", "Mount on Phone"),
      },
      {
        key: "push-cookies",
        label: "Push Cookies (PC → Phone)",
        icon: Upload,
        title: "Inject PC Cookie Vault sessions into Android Chrome via Wireless CDP",
        disabled: Boolean(busyCode),
        onClick: () => void handleBulkPushCookies(),
      },
      {
        key: "pull-cookies",
        label: "Pull Cookies (Phone → PC)",
        icon: Download,
        title: "Extract live cookies from Android Chrome back into PC Cookie Vault",
        disabled: Boolean(busyCode),
        onClick: () => void handleBulkPullCookies(),
      },
      {
        key: "snapshot",
        label: "Save Snapshot",
        icon: Camera,
        title: "Capture encrypted app data snapshot from connected phone",
        disabled: Boolean(busyCode),
        onClick: () => void runAction(targetCode, "/api/mobile-stealth/snapshot", "Save Snapshot"),
      },
      {
        key: "mirror",
        label: "Mirror Phone",
        icon: MonitorSmartphone,
        title: "Open live scrcpy screen mirror for connected Pixel 6a",
        disabled: Boolean(busyCode),
        onClick: () => void runAction(targetCode, "/api/mobile-stealth/mirror", "Mirror Screen"),
      },
      {
        key: "sync-p0020",
        label: "Sync P0020",
        icon: Database,
        title: "Sync Mobile Vault status tags and unlock QR-challenged Gmail rows in P0020 Data Box",
        disabled: Boolean(busyCode),
        onClick: () =>
          void runAction(targetCode, "/api/mobile-stealth/sync-p0020", "Sync P0020", {
            hasSnapshot: true,
            promoteChallengedMail: true,
          }),
      },
      {
        key: "refresh",
        label: "Refresh",
        icon: RefreshCw,
        iconSpinning: loading,
        title: "Reload Mobile Antidetect Vault & Wireless ADB telemetry",
        disabled: loading,
        onClick: () => void loadProfiles(),
      },
    ],
    [busyCode, handleBulkPullCookies, handleBulkPushCookies, loadProfiles, loading, runAction, targetCode],
  );

  const bulkDetailFields = useMemo<HubDirectoryBulkDetailFieldSpec[]>(
    () => [
      {
        key: "autoSync",
        label: "Auto-Sync Cookies",
        emoji: "🔄",
        type: "select",
        options: [
          { value: "on", label: "Auto-Sync ON" },
          { value: "off", label: "Auto-Sync OFF" },
        ],
      },
      {
        key: "customNote",
        label: "Custom Note",
        emoji: "📝",
        type: "text",
        placeholder: "Set note for selected Android profiles…",
      },
    ],
    [],
  );

  const bulkDetailItems = useMemo<HubDirectoryBulkSelectedItem[]>(
    () =>
      selectedRows.map((row) => ({
        id: row.code,
        label: `#${row.code} · ${pcProfileByCode.get(row.code)?.name || row.name}`,
        sublabel: `${row.manufacturer} ${row.model} · ${row.cookieCount} cookies`,
        badge: row.activeOnPhone ? "Mounted" : row.autoSync ? "Auto-Sync ON" : "Standby",
      })),
    [pcProfileByCode, selectedRows],
  );

  const handleApplyBulkFields = useCallback(
    async (patch: Record<string, string>) => {
      if (selectedRows.length === 0) return;
      for (const row of selectedRows) {
        await fetchMobileApi("/api/mobile-stealth/update-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileCode: row.code,
            manufacturer: row.manufacturer,
            model: row.model,
            glRenderer: row.glRenderer,
            customNote: patch.customNote !== undefined ? patch.customNote : row.customNote || "",
            autoSync: patch.autoSync ? patch.autoSync === "on" : Boolean(row.autoSync),
          }),
        });
      }
      pushToast(`Updated ${selectedRows.length} Android profile(s).`, "success");
      await loadProfiles();
    },
    [loadProfiles, pushToast, selectedRows],
  );

  const filterBar = (
    <HubSplitDirectoryFilterBar
      shortcutScope="android"
      placeholder="Search profiles…"
      filters={filters}
      query={directorySearch.queryInput}
      onQueryChange={(v) => {
        directorySearch.setQueryInput(v);
        setPageIndex(0);
      }}
      queryPending={directorySearch.queryPending}
      values={filterValues}
      onValuesChange={handleFilterValuesChange}
      filterSelectionToolbar={{
        visibleCount: filteredRows.length,
        selectedCount: selectedIds.size,
        noun: "profiles",
      }}
      toolbar={
        <DirectorySearchToolbar
          countIcon={Smartphone}
          shown={filteredRows.length}
          total={rows.length}
          countLabel="profiles"
          showViewToggle={false}
          showTimeRange={false}
          showResultCount={false}
          displayBand={<StealthDisplayBandToolbar screen="android" />}
        />
      }
      row2Actions={
        <HubDirectoryBulkActionBar
          selectAll={{
            visibleCount: filteredRows.length,
            selectedCount: selectedIds.size,
            allVisibleSelected,
            onToggleSelectAll: toggleSelectAll,
            noun: "profiles",
          }}
        >
          <HubDirectoryNewBulkAction
            onClick={() => void handleCreateAndroidProfile()}
            disabled={createBusy || Boolean(busyCode)}
            title="Create a new 1:1 Android antidetect profile in Mobile Vault"
          />
          <HubDirectoryAdaptiveEditAction
            selectedCount={selectedIds.size}
            onEditSingle={openTargetDetail}
            onEditBulk={() => setBulkDetailOpen(true)}
            singleLabel="Detail"
            bulkLabel="Detail"
            noneTitle="Select a profile row or click any row to inspect & edit Android hardware telemetry"
            singleTitle="Open Android hardware detail modal for selected profile"
            bulkTitle="Open Bulk Detail for selected Android profiles"
            labelHint={profileAdaptiveEditLabelHint(selectedIds.size)}
          />
          <HubDirectoryDeleteBulkAction
            title={
              selectedIds.size > 0
                ? `Delete ${selectedIds.size} selected Android profile(s)`
                : "Select one or more Android profiles to delete"
            }
            onClick={() => {
              if (selectedIds.size === 0) {
                pushToast("Select at least one Android profile to delete.", "info");
                return;
              }
              setDeleteDialogOpen(true);
            }}
            disabled={selectedIds.size === 0 || deleteBusy || Boolean(busyCode)}
          />
          <HubDirectoryBulkMoreMenu actions={moreMenuItems} selectedCount={selectedIds.size} />
        </HubDirectoryBulkActionBar>
      }
    />
  );

  const renderCell = useCallback(
    (colDef: HubDirectoryColumnDef<StealthAndroidSortKey>, row: MobileProfileRow) => {
      const { key, colClass } = colDef;
      const searchHighlight = getDirectorySearchHighlight(directorySearch.query, {
        mixedRequiresWhitespace: true,
      });
      const terms = [...(searchHighlight?.idTerms ?? []), ...(searchHighlight?.textTerms ?? [])];
      const pcProf = pcProfileByCode.get(row.code);

      switch (key) {
        case "profile": {
          const display = formatDirectoryOneLine(pcProf?.name || row.code);
          const popoverValue = [
            `Profile ID: #${row.code}`,
            `PC Profile: ${pcProf?.name || row.name}`,
            `Device: ${row.manufacturer} ${row.model}`,
            `Android_ID: ${row.androidId}`,
            `IMEI: ${row.imei}`,
          ].join("\n");
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <HubDirectoryValuePopover value={popoverValue} title="📱 Mobile Profile ID" className="justify-center">
                <HubDirectorySearchHighlightText
                  text={display}
                  terms={terms}
                  className={`hub-users-name-title text-center tabular-nums ${DIRECTORY_CELL_TRUNCATE}`}
                />
              </HubDirectoryValuePopover>
            </DirectoryTableBodyCell>
          );
        }
        case "group": {
          const label = normalizeAndroidBrandName(row.manufacturer);
          const brandId = resolveAndroidBrandId(label);
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <HubDirectoryValuePopover
                value={`Brand: ${label}\nModel: ${row.model}\nGPU: ${row.glRenderer}`}
                title="📱 Hardware Brand"
              >
                <HubDirectoryBrandNameCell
                  label={label}
                  brandId={brandId}
                  fallbackGlyph="📱"
                  searchHighlightTerms={terms}
                />
              </HubDirectoryValuePopover>
            </DirectoryTableBodyCell>
          );
        }
        case "autoSync": {
          const enabled = Boolean(row.autoSync);
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <button
                type="button"
                className="inline-flex items-center border-0 bg-transparent p-0 cursor-pointer"
                title={
                  enabled
                    ? "Auto-Sync ON: closing PC browser automatically pushes updated cookies to Mobile Vault"
                    : "Click to enable Auto-Sync on PC browser close"
                }
                onClick={(event) => {
                  event.stopPropagation();
                  void handleToggleAutoSync(row);
                }}
              >
                <HubUsersOnOffLabel on={enabled} />
              </button>
            </DirectoryTableBodyCell>
          );
        }
        case "status": {
          const isMounting = busyCode === `${row.code}:/api/mobile-stealth/switch`;
          const isPcRunning = Boolean(
            pcProf && (pcProf.status === "running" || runningHeadlessIds.has(pcProf.id)),
          );
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <HubDirectoryRunToggle
                kind={isPcRunning ? "stop" : "start"}
                pending={isMounting}
                label={isPcRunning ? "Stop" : row.activeOnPhone ? "Mounted" : "Run"}
                ariaLabel={
                  isPcRunning
                    ? `Stop PC Browser #${row.code}`
                    : `Launch PC Android Emulation Browser #${row.code}`
                }
                disabled={isMounting}
                onClick={(event) => {
                  event.stopPropagation();
                  if (pcProf) {
                    if (isPcRunning) {
                      void closeOne(pcProf);
                    } else {
                      void openOne(pcProf);
                    }
                  } else {
                    void runAction(row.code, "/api/mobile-stealth/switch", "Mount on Phone");
                  }
                }}
              />
            </DirectoryTableBodyCell>
          );
        }
        case "deviceModel": {
          const display = formatDirectoryOneLine(row.model);
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <HubDirectoryEllipsisCell value={display} />
            </DirectoryTableBodyCell>
          );
        }
        case "gpu": {
          const display = formatDirectoryOneLine(row.glRenderer);
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <HubDirectoryEllipsisCell value={display} />
            </DirectoryTableBodyCell>
          );
        }
        case "androidId": {
          const display = formatDirectoryOneLine(row.androidId);
          const detail = [
            `Android_ID: ${row.androidId}`,
            `GSF_ID: ${row.gsfId}`,
            `GAID: ${row.gaid}`,
            `Serial: ${row.serialNo}`,
            `Fingerprint: ${row.fingerprint}`,
          ].join("\n");
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <HubDirectoryValuePopover value={detail} title="🆔 Android ID & Telemetry">
                <span className={`hub-directory-table-body-text tabular-nums ${DIRECTORY_CELL_TRUNCATE}`}>
                  {display}
                </span>
              </HubDirectoryValuePopover>
            </DirectoryTableBodyCell>
          );
        }
        case "imei": {
          const display = formatDirectoryOneLine(row.imei);
          const detail = [
            `IMEI: ${row.imei}`,
            `Serial: ${row.serialNo}`,
            `Device: ${row.manufacturer} ${row.model}`,
          ].join("\n");
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <HubDirectoryValuePopover value={detail} title="📟 Hardware IMEI">
                <span className={`hub-directory-table-body-text tabular-nums ${DIRECTORY_CELL_TRUNCATE}`}>
                  {display}
                </span>
              </HubDirectoryValuePopover>
            </DirectoryTableBodyCell>
          );
        }
        case "cookies": {
          const hasCookies = row.cookieCount > 0;
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <HubUsersStatusLabel
                label={hasCookies ? `${row.cookieCount} synced` : "0"}
                tone={hasCookies ? "online" : "offline"}
                capitalize={false}
                title={`Click Push/Pull in toolbar · Services: ${row.services.join(", ") || "None"}`}
                popoverTitle="Cookie Vault Sync"
              />
            </DirectoryTableBodyCell>
          );
        }
        case "snapshot":
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <HubUsersOnOffLabel on={row.hasSnapshot} />
            </DirectoryTableBodyCell>
          );
        case "createdAt":
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <HubDirectoryTimestampTooltipCell
                at={resolveRowCreatedAt(row)}
                title="Created"
                variant="date"
              />
            </DirectoryTableBodyCell>
          );
        case "updated":
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <HubDirectoryTimestampTooltipCell
                at={resolveRowUpdatedAt(row)}
                title="Update"
              />
            </DirectoryTableBodyCell>
          );
        case "integrity": {
          const isOnline = Boolean(device?.adbOnline && row.activeOnPhone);
          const label = isOnline ? "ADB · STRONG" : "STRONG";
          const batStr =
            typeof device?.batteryLevel === "number"
              ? `\nBattery: ${device.batteryLevel}%${
                  typeof device.batteryTempC === "number"
                    ? ` (${device.batteryTempC}°C${device.batteryHotAlert ? " HOT" : ""})`
                    : ""
                }`
              : "";
          const detail = `Play Integrity: STRONG_INTEGRITY\nMode: ${
            device?.adbOnline ? `ADB Wi-Fi (${device.liveDeviceModel})` : "Standby"
          }${batStr}`;
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <HubUsersStatusLabel
                label={label}
                tone={isOnline ? "online" : "idle"}
                capitalize={false}
                title={detail}
                popoverTitle="🛡️ Play Integrity"
              />
            </DirectoryTableBodyCell>
          );
        }
        case "note": {
          const svcText = row.services.length > 0 ? row.services.join(", ") : "Ready for Cookie Push";
          const notePrefix = row.customNote ? `${row.customNote} · ` : "";
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <HubDirectoryEllipsisCell value={`${notePrefix}${svcText}`} />
            </DirectoryTableBodyCell>
          );
        }
        default:
          return (
            <DirectoryTableBodyCell key={key} colClass={colClass}>
              <span className="hub-directory-table-body-text">—</span>
            </DirectoryTableBodyCell>
          );
      }
    },
    [
      busyCode,
      closeOne,
      device?.adbOnline,
      device?.batteryHotAlert,
      device?.batteryLevel,
      device?.batteryTempC,
      device?.liveDeviceModel,
      directorySearch.query,
      handleToggleAutoSync,
      openOne,
      pcProfileByCode,
      resolveRowCreatedAt,
      resolveRowUpdatedAt,
      runAction,
      runningHeadlessIds,
    ],
  );

  const emptyMessage = loading
    ? "Loading Android antidetect profiles…"
    : filteredRows.length === 0
      ? "No Android profiles found."
      : undefined;

  return (
    <>
      <HubSplitWorkspaceScreen
        bodyClassName="stealth-profiles-workspace__body flex min-h-0 flex-1 overflow-hidden"
        header={
          <HubListChromeHeader
            ariaLabel="Android profiles header"
            titleIcon={Smartphone}
            titleIconClass="text-emerald-300"
            title="Android"
            metaItems={metaItems}
            versionReleaseNotesCode="P0003"
            centerStats={centerStats ?? []}
            actions={headerActions}
          />
        }
        sectionRuleLabel="Android"
      >
        <div className="stealth-profile-layout flex min-h-0 flex-1 overflow-hidden">
          <div className="stealth-profile-directory-pane min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">
            <HubSplitDirectoryPane
              className="stealth-profile-directory-frame hub-directory-frame"
              panelFillRows={panelFillRows}
              partialPagePad="invisible"
              kpiBand={kpis.length ? <KpiStrip items={kpis} /> : undefined}
              filterBar={filterBar}
            >
              <div ref={freezeRootRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {androidFreezeStickyStyle}
                <div ref={directoryBodyRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <HubDirectoryTableShell
                    items={pagedRows}
                    ariaLabel="Android antidetect profiles"
                    tableClassName={`${hubDirectoryTableClass("6")} hub-directory-frame-table stealth-profile-directory-table stealth-android-directory-table ${stickyScopeClass}`}
                    wrapClassName={HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS}
                    paginatedShellClassName="flex min-h-0 min-w-0 flex-1 flex-col"
                    flushWrap
                    colgroup={colgroup}
                    columns={columns}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    getRowKey={mobileRowKey}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onToggleSelectAll={toggleSelectAll}
                    allVisibleSelected={allVisibleSelected}
                    selectAllLabel="Select all on this page"
                    emptyMessage={emptyMessage}
                    pageSize={pageSize}
                    resetKey={listResetKey}
                    padBodyRowsToPageSize
                    serverPagination={{
                      totalCount: sorted.length,
                      pageIndex,
                      onPageChange: setPageIndex,
                    }}
                    getRowClassName={(row) => {
                      const selected = selectedIds.has(mobileRowKey(row)) ? " is-selected" : "";
                      return `${selected} cursor-pointer`;
                    }}
                    onRowClick={(row) => setDetailRow(row)}
                    renderRowCells={(row) => <>{columns.map((c) => renderCell(c, row))}</>}
                  />
                </div>
              </div>
            </HubSplitDirectoryPane>
          </div>
          <ProfilesWorkflowRail runtimeOnly />
        </div>
      </HubSplitWorkspaceScreen>
      <HubConfirmDialog
        open={deleteDialogOpen}
        title="Delete Android Profiles?"
        message={`Are you sure you want to remove ${selectedIds.size} selected Android profile(s) from the Mobile Antidetect catalog?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        busy={deleteBusy}
        onConfirm={() => void handleConfirmDeleteAndroidProfiles()}
        onClose={() => setDeleteDialogOpen(false)}
      />
      {detailRow ? (
        <AndroidProfileDetailModal
          profile={detailRow}
          pcProfileName={pcProfileByCode.get(detailRow.code)?.name}
          onClose={() => setDetailRow(null)}
          onSaveProfile={handleSaveProfileDetail}
          onMountPhone={(code) => runAction(code, "/api/mobile-stealth/switch", "Mount on Phone")}
          onPushCookies={(code) => runAction(code, "/api/mobile-stealth/push-cookies", "Push PC Cookies")}
          onPullCookies={(code) => runAction(code, "/api/mobile-stealth/pull-cookies", "Pull Mobile Cookies")}
          onSaveSnapshot={(code) => runAction(code, "/api/mobile-stealth/snapshot", "Save Snapshot")}
          onOpenPcBrowser={(code) => {
            const pc = pcProfileByCode.get(code);
            if (pc) void openOne(pc);
          }}
          busy={Boolean(busyCode)}
        />
      ) : null}
      <HubDirectoryBulkDetailModal
        open={bulkDetailOpen}
        onClose={() => setBulkDetailOpen(false)}
        entitySingular="Android profile"
        entityPlural="Android profiles"
        headerIcon={Smartphone}
        panelTitle="Batch Android Profile Operations"
        panelTitleEmoji="📱"
        selectedItems={bulkDetailItems}
        fields={bulkDetailFields}
        onApplyFields={handleApplyBulkFields}
        busy={Boolean(busyCode)}
        sections={[
          {
            id: "cookies",
            label: "Cookie Vault Sync",
            emoji: "🍪",
            actions: [
              {
                key: "push-cookies",
                label: "Push Cookies (PC → Phone)",
                icon: <Upload size={14} aria-hidden />,
                tone: "sky",
                onClick: () => void handleBulkPushCookies(),
              },
              {
                key: "pull-cookies",
                label: "Pull Cookies (Phone → PC)",
                icon: <Download size={14} aria-hidden />,
                tone: "indigo",
                onClick: () => void handleBulkPullCookies(),
              },
            ],
          },
        ]}
      />
    </>
  );
});
