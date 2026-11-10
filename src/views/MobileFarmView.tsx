import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BatteryCharging,
  BatteryWarning,
  Camera,
  CheckSquare,
  ChevronRight,
  Circle,
  ClipboardPaste,
  CornerDownLeft,
  Delete,
  ExternalLink,
  Globe,
  Grid2x2,
  Laptop,
  Layers,
  Maximize2,
  MessageCircle,
  Mic,
  MonitorSmartphone,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Phone,
  Play,
  Plus,
  Power,
  Radio,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Zap,
  Sun,
  Trash2,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import {
  HUB_VIRTUAL_ROW_THRESHOLD,
  HubBrandIcon,
  HubBulkActionButton,
  HubDirectoryCardCheckbox,
  HubListChromeHeader,
  HubModalCloseButton,
  HubPanel,
  HubResultCount,
  HubSearchField,
  HubSegmentToggle,
  KpiStrip,
  compactIconSize,
  searchTextIncludes,
  useHubVirtualRows,
  type KpiTileData,
} from "@tool-workspace/hub-ui";
import { useAppToast } from "../components/toast";
import { useHostHeaderStats } from "../hooks/useHostHeaderStats";
import { useStealthVersionMetaItems } from "../hooks/useStealthVersionMetaItems";
import { STEALTH_PROFILE_KPI_STICKER } from "../lib/stealth-column-stickers";
import { useStealthHubListPrefs } from "../lib/useStealthHubListPrefs";
import { useProfilesRuntime } from "../providers/ProfilesRuntimeProvider";
import type {
  AndroidDisplayInfo,
  AndroidLiveScreenState,
  AndroidMultiUserSlot,
} from "../features/android/AndroidLiveFarmRail";
import type { MobileProfileRow } from "./AndroidProfilesView";

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

type FarmTouchVector = {
  type: "tap" | "swipe";
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  durationMs?: number;
};

type FarmLiveEventItem = {
  id: string;
  at: string;
  ts: number;
  displayId: number;
  userId: number;
  profileCode: string;
  kind: string;
  label: string;
  touch?: FarmTouchVector | null;
};

type ExtendedDisplayInfo = AndroidDisplayInfo & {
  resolution?: string;
  assignedUserId?: number | null;
  assignedProfileCode?: string | null;
  c_user?: string | null;
  fbAccountName?: string | null;
};

type AndroidTelemetryPoint = {
  ts: number;
  at: string;
  batteryLevel: number;
  batteryTempC: number;
  chargeStartLevel?: number;
  chargeStopLevel?: number;
  chargeDisable?: number;
  acPowered?: boolean;
  display0Off?: boolean;
};

type AndroidHardwareHealth = {
  ok?: boolean;
  ramTotalMb?: number;
  ramAvailableMb?: number;
  ramUsedPct?: number;
  swapTotalMb?: number;
  swapFreeMb?: number;
  swapUsedPct?: number;
  batteryLevel?: number | null;
  batteryTempC?: number | null;
  acPowered?: boolean;
  chargeStartLevel?: number;
  chargeStopLevel?: number;
  chargeDisable?: number;
  runningUsers?: number[];
  runningUserCount?: number;
  totalUserCount?: number;
  display0Off?: boolean;
  wakeState?: string;
  history24h?: AndroidTelemetryPoint[];
  capturedAt?: string;
};

type GmailMarlHarvesterState = {
  ok?: boolean;
  watcherActive?: boolean;
  intervalMinutes?: number;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  totalScanned?: number;
  pendingCount?: number;
  unlockedCount?: number;
};

type ExtendedLiveScreenState = Omit<AndroidLiveScreenState, "displays"> & {
  currentUserId?: number;
  patrolRunning?: boolean;
  patrolStepCount?: number;
  liveEvents?: FarmLiveEventItem[];
  activeActions?: Record<string, FarmLiveEventItem>;
  hardwareHealth?: AndroidHardwareHealth | null;
  gmailMarlHarvester?: GmailMarlHarvesterState | null;
  displays: ExtendedDisplayInfo[];
  displayScreenshots?: Record<string, string>;
  multiUserSlots: Array<
    AndroidMultiUserSlot & {
      isForeground?: boolean;
      lastScreenDataUrl?: string | null;
      c_user?: string | null;
      fbAccountName?: string | null;
    }
  >;
};

type FarmEngineMode = "pc_emulation" | "pixel6a_hardware" | "unified";
type FarmFilterConnection = "all" | "displays" | "users" | "wifi" | "mounted";
type FarmGroupFilter = "all" | "running" | "fb_ready" | "google" | "samsung";

type FarmPhoneCardItem = {
  id: string;
  kind: "display" | "user_slot" | "profile";
  code: string;
  badgeTopLeft: string;
  badgeTone: "emerald" | "sky" | "violet" | "amber";
  titleCode: string;
  modelLabel: string;
  endpointLabel: string;
  subMetaLabel: string;
  displayId: number;
  userId: number;
  coordWidth: number;
  coordHeight: number;
  isLiveForeground: boolean;
  isRunning: boolean;
  isPcRunning?: boolean;
  cookieCount: number;
  c_user: string | null;
  fbAccountLabel: string | null;
  manufacturer: string;
  screenDataUrl: string | null;
};

const MOBILE_API_BASES = [
  "http://127.0.0.1:6003",
  "http://127.0.0.1:6004",
  "http://127.0.0.1:3002",
  "http://127.0.0.1:8814",
  "",
];

let _preferredApiBase: string | null = null;

function getOrderedApiBases(): string[] {
  const isHttpOrigin =
    typeof window !== "undefined" &&
    (window.location?.protocol === "http:" || window.location?.protocol === "https:");
  const defaults = isHttpOrigin
    ? ["", "http://127.0.0.1:6003", "http://127.0.0.1:6004", "http://127.0.0.1:3002", "http://127.0.0.1:8814"]
    : MOBILE_API_BASES;
  if (_preferredApiBase !== null) {
    return [_preferredApiBase, ...defaults.filter((b) => b !== _preferredApiBase)];
  }
  return defaults;
}

async function fetchFarmApi(path: string, init?: RequestInit) {
  const altPath = path.startsWith("/api/mobile-stealth/")
    ? path.replace("/api/mobile-stealth/", "/api/android-vault/")
    : path;
  const candidatePaths = altPath !== path ? [altPath, path] : [path];
  const bases = getOrderedApiBases();
  for (const candidatePath of candidatePaths) {
    for (const base of bases) {
      try {
        const res = await fetch(`${base}${candidatePath}`, init);
        if (res.ok) {
          _preferredApiBase = base;
          return await res.json();
        }
      } catch {
        /* try next */
      }
    }
  }
  throw new Error("Mobile Farm Bridge unreachable");
}

function toHex2(n: number): string {
  return (n & 0xff).toString(16).padStart(2, "0");
}

type MuxCanvasSubscriber = {
  canvas: HTMLCanvasElement;
  onFrame: () => void;
};

type MuxDecoderEntry = {
  decoder: VideoDecoder;
  codec: string;
  gotKey: boolean;
  timestampUs: number;
  mirrorCanvas: HTMLCanvasElement;
  hasMirrorFrame: boolean;
};

const _muxSubscribersByDisplay = new Map<number, Set<MuxCanvasSubscriber>>();
const _muxDecodersByDisplay = new Map<number, MuxDecoderEntry>();
let _muxLoopRunning = false;
let _muxAbortCtrl: AbortController | null = null;

function totalMuxSubscribers(): number {
  let count = 0;
  for (const set of _muxSubscribersByDisplay.values()) {
    count += set.size;
  }
  return count;
}

function getOrCreateMuxDecoder(dispId: number, codec: string): MuxDecoderEntry {
  const existing = _muxDecodersByDisplay.get(dispId);
  if (existing && existing.decoder.state !== "closed" && existing.codec === codec) {
    return existing;
  }
  if (existing && existing.decoder.state !== "closed") {
    try {
      existing.decoder.close();
    } catch {
      /* ignore */
    }
  }
  const mirrorCanvas = existing?.mirrorCanvas || document.createElement("canvas");
  const entry: MuxDecoderEntry = {
    decoder: null as unknown as VideoDecoder,
    codec,
    gotKey: false,
    timestampUs: existing?.timestampUs || 0,
    mirrorCanvas,
    hasMirrorFrame: existing?.hasMirrorFrame || false,
  };
  const decoder = new VideoDecoder({
    output: (frame) => {
      const w = frame.displayWidth || frame.codedWidth || 480;
      const h = frame.displayHeight || frame.codedHeight || 1066;
      if (entry.mirrorCanvas.width !== w) entry.mirrorCanvas.width = w;
      if (entry.mirrorCanvas.height !== h) entry.mirrorCanvas.height = h;
      const mCtx = entry.mirrorCanvas.getContext("2d");
      if (mCtx) {
        mCtx.drawImage(frame, 0, 0, w, h);
        entry.hasMirrorFrame = true;
      }
      const subs = _muxSubscribersByDisplay.get(dispId);
      if (subs) {
        for (const sub of subs) {
          if (sub.canvas.width !== w) sub.canvas.width = w;
          if (sub.canvas.height !== h) sub.canvas.height = h;
          const ctx = sub.canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(frame, 0, 0, w, h);
            sub.onFrame();
          }
        }
      }
      frame.close();
    },
    error: () => {
      entry.codec = "";
      entry.gotKey = false;
    },
  });
  decoder.configure({
    codec,
    optimizeForLatency: true,
  });
  entry.decoder = decoder;
  _muxDecodersByDisplay.set(dispId, entry);
  return entry;
}

function startSharedMuxStreamLoop(): void {
  if (_muxLoopRunning || typeof window === "undefined" || !("VideoDecoder" in window)) return;
  _muxLoopRunning = true;
  const abortCtrl = new AbortController();
  _muxAbortCtrl = abortCtrl;

  void (async () => {
    while (_muxLoopRunning && totalMuxSubscribers() > 0 && !abortCtrl.signal.aborted) {
      let streamRes: Response | null = null;
      for (const base of getOrderedApiBases()) {
        try {
          const r = await fetch(`${base}/api/android-vault/h264-stream?displayId=all`, {
            signal: abortCtrl.signal,
          });
          if (r.ok && r.body) {
            _preferredApiBase = base;
            streamRes = r;
            break;
          }
        } catch {
          /* try next base */
        }
      }

      if (!streamRes || !streamRes.body) {
        await new Promise((resolve) => window.setTimeout(resolve, 1400));
        continue;
      }

      const reader = streamRes.body.getReader();
      let acc = new Uint8Array(0);

      try {
        while (_muxLoopRunning && totalMuxSubscribers() > 0 && !abortCtrl.signal.aborted) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          if (acc.length === 0) {
            acc = value;
          } else {
            const merged = new Uint8Array(acc.length + value.length);
            merged.set(acc, 0);
            merged.set(value, acc.length);
            acc = merged;
          }

          while (acc.length >= 8) {
            const byte0 = acc[0];
            const isKey = (byte0 & 0x80) !== 0 || byte0 === 1;
            const pktDispId = byte0 === 1 ? 0 : byte0 & 0x7f;
            const codec = `avc1.${toHex2(acc[1])}${toHex2(acc[2])}${toHex2(acc[3])}`;
            const payloadLen =
              ((acc[4] << 24) | (acc[5] << 16) | (acc[6] << 8) | acc[7]) >>> 0;
            if (payloadLen <= 0 || payloadLen > 4 * 1024 * 1024) {
              acc = new Uint8Array(0);
              break;
            }
            if (acc.length < 8 + payloadLen) break;

            const au = acc.slice(8, 8 + payloadLen);
            acc = acc.subarray(8 + payloadLen);

            try {
              const entry = getOrCreateMuxDecoder(pktDispId, codec);
              if (isKey) entry.gotKey = true;
              if (!entry.gotKey) continue;
              if (entry.decoder.decodeQueueSize < 8) {
                entry.timestampUs += 41666;
                entry.decoder.decode(
                  new EncodedVideoChunk({
                    type: isKey ? "key" : "delta",
                    timestamp: entry.timestampUs,
                    data: au,
                  }),
                );
              }
            } catch {
              const ex = _muxDecodersByDisplay.get(pktDispId);
              if (ex) ex.gotKey = false;
            }
          }
        }
      } catch {
        /* reconnect on break */
      } finally {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
      }

      if (_muxLoopRunning && totalMuxSubscribers() > 0 && !abortCtrl.signal.aborted) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
    }
    _muxLoopRunning = false;
  })();
}

function subscribeMuxDisplayCanvas(dispId: number, sub: MuxCanvasSubscriber): () => void {
  let set = _muxSubscribersByDisplay.get(dispId);
  if (!set) {
    set = new Set();
    _muxSubscribersByDisplay.set(dispId, set);
  }
  set.add(sub);

  // Immediately paint cached mirror frame if already decoded
  const existing = _muxDecodersByDisplay.get(dispId);
  if (existing && existing.hasMirrorFrame && existing.mirrorCanvas.width > 0) {
    sub.canvas.width = existing.mirrorCanvas.width;
    sub.canvas.height = existing.mirrorCanvas.height;
    const ctx = sub.canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(existing.mirrorCanvas, 0, 0);
      sub.onFrame();
    }
  }

  startSharedMuxStreamLoop();

  return () => {
    const s = _muxSubscribersByDisplay.get(dispId);
    if (s) {
      s.delete(sub);
      if (s.size === 0) _muxSubscribersByDisplay.delete(dispId);
    }
    if (totalMuxSubscribers() === 0 && _muxAbortCtrl) {
      _muxAbortCtrl.abort();
      _muxAbortCtrl = null;
      _muxLoopRunning = false;
    }
  };
}

function isNonBlackScreenUrl(url: string | null | undefined): boolean {
  return Boolean(url && url.length >= 7800);
}

const H264PhoneStreamCanvas = memo(function H264PhoneStreamCanvas({
  displayId,
  enabled,
  fallbackImgUrl,
}: {
  displayId: number;
  enabled: boolean;
  fallbackImgUrl: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasFrame, setHasFrame] = useState<boolean>(false);
  const hasFrameRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canvas || typeof window === "undefined" || !("VideoDecoder" in window)) {
      hasFrameRef.current = false;
      setHasFrame(false);
      return;
    }
    hasFrameRef.current = false;
    return subscribeMuxDisplayCanvas(displayId, {
      canvas,
      onFrame: () => {
        if (!hasFrameRef.current) {
          hasFrameRef.current = true;
          setHasFrame(true);
        }
      },
    });
  }, [displayId, enabled]);

  const validFallback = isNonBlackScreenUrl(fallbackImgUrl) ? fallbackImgUrl : null;

  return (
    <>
      {validFallback && !hasFrame ? (
        <img
          src={validFallback}
          alt="Live Screen Fallback"
          className="h-full w-full object-cover pointer-events-none"
        />
      ) : !hasFrame ? (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center pointer-events-none"
          style={{
            background: "linear-gradient(155deg, #082f49 0%, #0369a1 45%, #0f172a 100%)",
          }}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[10px] text-sky-100">
            Streaming Display D{displayId}…
          </span>
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        className={`h-full w-full object-cover pointer-events-none ${hasFrame ? "block" : "hidden"}`}
      />
    </>
  );
});

const FARM_PREFS_STORAGE_KEY = "p0003:mobile-farm-prefs:v1";

type FarmUiPrefs = {
  engineMode: FarmEngineMode;
  cardWidth: number;
  refreshIntervalMs: number;
  connectionFilter: FarmFilterConnection;
  groupFilter: FarmGroupFilter;
  railCollapsed: boolean;
  autoStream: boolean;
  syncMaster: boolean;
};

const DEFAULT_FARM_UI_PREFS: FarmUiPrefs = {
  engineMode: "pc_emulation",
  cardWidth: 218,
  refreshIntervalMs: 850,
  connectionFilter: "all",
  groupFilter: "all",
  railCollapsed: false,
  autoStream: true,
  syncMaster: false,
};

function readFarmUiPrefs(): FarmUiPrefs {
  if (typeof window === "undefined") return DEFAULT_FARM_UI_PREFS;
  try {
    const raw = window.localStorage.getItem(FARM_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_FARM_UI_PREFS;
    const parsed = JSON.parse(raw) as Partial<FarmUiPrefs>;
    const engineMode: FarmEngineMode =
      parsed.engineMode === "pc_emulation" ||
      parsed.engineMode === "pixel6a_hardware" ||
      parsed.engineMode === "unified"
        ? parsed.engineMode
        : DEFAULT_FARM_UI_PREFS.engineMode;
    const cardWidth =
      typeof parsed.cardWidth === "number" && Number.isFinite(parsed.cardWidth)
        ? Math.min(330, Math.max(165, Math.round(parsed.cardWidth)))
        : DEFAULT_FARM_UI_PREFS.cardWidth;
    const refreshIntervalMs =
      typeof parsed.refreshIntervalMs === "number" && Number.isFinite(parsed.refreshIntervalMs)
        ? Math.min(4000, Math.max(500, Math.round(parsed.refreshIntervalMs)))
        : DEFAULT_FARM_UI_PREFS.refreshIntervalMs;
    const connectionFilter: FarmFilterConnection =
      parsed.connectionFilter === "displays" ||
      parsed.connectionFilter === "users" ||
      parsed.connectionFilter === "wifi" ||
      parsed.connectionFilter === "mounted"
        ? parsed.connectionFilter
        : "all";
    const groupFilter: FarmGroupFilter =
      parsed.groupFilter === "running" ||
      parsed.groupFilter === "fb_ready" ||
      parsed.groupFilter === "google" ||
      parsed.groupFilter === "samsung"
        ? parsed.groupFilter
        : "all";
    return {
      engineMode,
      cardWidth,
      refreshIntervalMs,
      connectionFilter,
      groupFilter,
      railCollapsed: Boolean(parsed.railCollapsed),
      autoStream: typeof parsed.autoStream === "boolean" ? parsed.autoStream : DEFAULT_FARM_UI_PREFS.autoStream,
      syncMaster: Boolean(parsed.syncMaster),
    };
  } catch {
    return DEFAULT_FARM_UI_PREFS;
  }
}

export const MobileFarmView = memo(function MobileFarmView({
  headerActions,
}: {
  headerActions?: ReactNode;
}) {
  const { profiles: pcProfiles, openOne, closeOne, runningHeadlessIds } = useProfilesRuntime();
  const { pushToast } = useAppToast();
  const { metaItems } = useStealthVersionMetaItems();
  const hubPrefs = useStealthHubListPrefs();
  const centerStats = useHostHeaderStats(hubPrefs.headerStats);

  const initialFarmPrefs = useMemo(() => readFarmUiPrefs(), []);

  const [engineMode, setEngineMode] = useState<FarmEngineMode>(initialFarmPrefs.engineMode);
  const [liveState, setLiveState] = useState<ExtendedLiveScreenState | null>(null);
  const [profiles, setProfiles] = useState<MobileProfileRow[]>([]);
  const [deviceTelemetry, setDeviceTelemetry] = useState<MobileDeviceTelemetry | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionBusy, setActionBusy] = useState<string>("");
  const [autoStream, setAutoStream] = useState<boolean>(initialFarmPrefs.autoStream);
  const [syncMaster, setSyncMaster] = useState<boolean>(initialFarmPrefs.syncMaster);

  const pcProfileByCode = useMemo(() => {
    const map = new Map<string, (typeof pcProfiles)[number]>();
    for (const p of pcProfiles) {
      const m = String(p.name || "").match(/^(\d{4})\b/);
      if (m) map.set(m[1], p);
    }
    return map;
  }, [pcProfiles]);

  // Left control rail settings (persisted in localStorage via p0003:mobile-farm-prefs:v1)
  const [cardWidth, setCardWidth] = useState<number>(initialFarmPrefs.cardWidth);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(initialFarmPrefs.refreshIntervalMs);
  const [connectionFilter, setConnectionFilter] = useState<FarmFilterConnection>(initialFarmPrefs.connectionFilter);
  const [groupFilter, setGroupFilter] = useState<FarmGroupFilter>(initialFarmPrefs.groupFilter);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(() => new Set());
  const [cachedSlotScreens, setCachedSlotScreens] = useState<Record<string, string>>({});
  const [lastGestureByCard, setLastGestureByCard] = useState<Record<string, FarmTouchVector & { ts: number }>>({});
  const [railCollapsed, setRailCollapsed] = useState<boolean>(initialFarmPrefs.railCollapsed);
  const [theaterCardId, setTheaterCardId] = useState<string | null>(null);
  const [theaterText, setTheaterText] = useState<string>("");
  const [directKeyCapture, setDirectKeyCapture] = useState<boolean>(true);
  const pointerDownRef = useRef<{
    cardId: string;
    relX: number;
    relY: number;
    startedAt: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const nextPrefs: FarmUiPrefs = {
        engineMode,
        cardWidth,
        refreshIntervalMs,
        connectionFilter,
        groupFilter,
        railCollapsed,
        autoStream,
        syncMaster,
      };
      window.localStorage.setItem(FARM_PREFS_STORAGE_KEY, JSON.stringify(nextPrefs));
    } catch {
      /* ignore quota error */
    }
  }, [autoStream, cardWidth, connectionFilter, engineMode, groupFilter, railCollapsed, refreshIntervalMs, syncMaster]);

  const loadProfilesAndTelemetry = useCallback(async () => {
    try {
      const data = await fetchFarmApi("/api/mobile-stealth/profiles");
      if (data?.ok) {
        setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
        if (data.device) setDeviceTelemetry(data.device);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const pullInFlightRef = useRef<boolean>(false);
  const pollTickRef = useRef<number>(0);

  const pullFarmLiveState = useCallback(async (includeShot = true) => {
    if (pullInFlightRef.current) return;
    pullInFlightRef.current = true;
    setLoading(true);
    try {
      const data = (await fetchFarmApi(
        `/api/mobile-stealth/live-screen?displayId=all&screenshot=${includeShot ? "1" : "0"}`,
      )) as ExtendedLiveScreenState;
      if (data) {
        setLiveState(data);
        setCachedSlotScreens((prev) => {
          let changed = false;
          const next = { ...prev };
          const assignIfChanged = (key: string, val: string | null | undefined) => {
            if (isNonBlackScreenUrl(val) && next[key] !== val) {
              next[key] = val!;
              changed = true;
            }
          };
          if (data.displayScreenshots) {
            for (const [dispId, url] of Object.entries(data.displayScreenshots)) {
              assignIfChanged(`disp:${dispId}`, url);
            }
          }
          if (data.screenDataUrl) {
            assignIfChanged("disp:0", data.screenDataUrl);
            const fgUser = data.currentUserId ?? 0;
            assignIfChanged(`user:${fgUser}`, data.screenDataUrl);
          }
          for (const slot of data.multiUserSlots || []) {
            if (slot.lastScreenDataUrl) {
              assignIfChanged(`user:${slot.userId}`, slot.lastScreenDataUrl);
              if (slot.profileCode) assignIfChanged(`prof:${slot.profileCode}`, slot.lastScreenDataUrl);
            }
          }
          return changed ? next : prev;
        });
      }
    } catch {
      /* ignore transient poll error */
    } finally {
      pullInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfilesAndTelemetry();
    void pullFarmLiveState(engineMode !== "pc_emulation");
  }, [engineMode, loadProfilesAndTelemetry, pullFarmLiveState]);

  useEffect(() => {
    if (!autoStream || engineMode === "pc_emulation") return;
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      pollTickRef.current += 1;
      const h264HasLiveFrame = Boolean(_muxDecodersByDisplay.get(0)?.hasMirrorFrame);
      const shouldIncludeShot = !h264HasLiveFrame || pollTickRef.current % 5 === 0;
      void pullFarmLiveState(shouldIncludeShot);
    }, refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [autoStream, engineMode, pullFarmLiveState, refreshIntervalMs]);

  const dispatchControl = useCallback(
    async (payload: Record<string, unknown>, toastLabel?: string) => {
      const busyKey = String(payload.action || "cmd");
      setActionBusy(busyKey);
      try {
        const res = await fetchFarmApi("/api/mobile-stealth/live-control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res?.ok && toastLabel) {
          pushToast(toastLabel, "success");
        } else if (!res?.ok && toastLabel) {
          pushToast(`${toastLabel}: ${res?.reason || "failed"}`, "error");
        }
        window.setTimeout(() => {
          void pullFarmLiveState(true);
        }, 280);
        return res;
      } catch (err) {
        if (toastLabel) {
          pushToast(`${toastLabel}: ${err instanceof Error ? err.message : "error"}`, "error");
        }
        return null;
      } finally {
        setActionBusy("");
      }
    },
    [pullFarmLiveState, pushToast],
  );

  const handleReconnectWifiAdb = useCallback(async () => {
    setActionBusy("wifi-adb");
    try {
      const res = await fetchFarmApi("/api/android-vault/wifi-adb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res?.ok) {
        pushToast(`Wi-Fi ADB Connected: ${res.endpoint || res.host} (${res.mode || "wifi_tcp"})`, "success");
      } else {
        pushToast(`Wi-Fi ADB Reconnect: ${res?.reason || "device_offline_plug_usb_or_wake_wifi"}`, "error");
      }
      await loadProfilesAndTelemetry();
      await pullFarmLiveState(true);
    } catch (err) {
      pushToast(`Wi-Fi ADB Error: ${err instanceof Error ? err.message : "error"}`, "error");
    } finally {
      setActionBusy("");
    }
  }, [loadProfilesAndTelemetry, pullFarmLiveState, pushToast]);

  const handleEnsureVirtualDisplay = useCallback(async () => {
    await dispatchControl(
      { action: "ensure-virtual-display" },
      "Spawned Parallel Agent Virtual Display (1080x2400)",
    );
  }, [dispatchControl]);

  const handleEnsureVirtualDisplayPool = useCallback(async () => {
    await dispatchControl(
      { action: "ensure-virtual-display-pool", x: 4 },
      "Spawned 4x Concurrent Virtual Display Pool (D1–D4 bound to U10–U13)",
    );
  }, [dispatchControl]);

  const handleCloseVirtualDisplayPool = useCallback(async () => {
    await dispatchControl(
      { action: "close-virtual-display-pool" },
      "Closed Virtual Display Pool",
    );
  }, [dispatchControl]);

  const handleTogglePatrol = useCallback(async () => {
    const nextEnabled = !liveState?.patrolRunning;
    await dispatchControl(
      { action: nextEnabled ? "toggle-patrol" : "stop-patrol" },
      nextEnabled
        ? "Auto Patrol ON: real-time Antidetect swipe/feed behavior running"
        : "Auto Patrol paused",
    );
  }, [dispatchControl, liveState?.patrolRunning]);

  const phoneCards = useMemo<FarmPhoneCardItem[]>(() => {
    const list: FarmPhoneCardItem[] = [];
    const adbOnline = Boolean(liveState?.adbOnline);
    const serialEndpoint = liveState?.serial || deviceTelemetry?.wifiEndpoint || "192.168.0.208:42011";
    const fgUserId = liveState?.currentUserId ?? 0;
    const displays: ExtendedDisplayInfo[] = liveState?.displays || [];
    const slots = liveState?.multiUserSlots || [];
    const profileMap = new Map<string, MobileProfileRow>();
    for (const p of profiles) {
      profileMap.set(p.code, p);
    }
    const slotByUserId = new Map<number, ExtendedLiveScreenState["multiUserSlots"][number]>();
    for (const s of slots) {
      slotByUserId.set(s.userId, s);
    }

    const seenProfileCodes = new Set<string>();

    if (engineMode !== "pc_emulation") {
      // 1. Active Physical & Virtual Displays (Display 0 + Display 1..4)
      if (displays.length > 0) {
        for (const disp of displays) {
          const isVirtual = disp.kind === "virtual";
          const activeProf = profiles.find((p) => p.activeOnPhone);
          const boundUserId = disp.assignedUserId ?? fgUserId;
          const boundSlot = slotByUserId.get(boundUserId);
          const boundCode =
            disp.assignedProfileCode ||
            boundSlot?.profileCode ||
            (isVirtual ? "AGENT" : activeProf?.code || "0005");
          const boundProf = profileMap.get(boundCode) || activeProf;
          const resolvedCUser = disp.c_user || boundSlot?.c_user || boundProf?.c_user || null;
          const resolvedFbLabel =
            disp.fbAccountName ||
            boundSlot?.fbAccountName ||
            boundProf?.fbAccountName ||
            (resolvedCUser ? `UID ${resolvedCUser}` : null);
          const is540p = disp.resolution === "540x1200";
          const is720p = disp.resolution === "720x1600";
          const rawDispScreen =
            liveState?.displayScreenshots?.[String(disp.logicalId)] ||
            cachedSlotScreens[`disp:${disp.logicalId}`] ||
            (disp.logicalId === 0 ? liveState?.screenDataUrl || null : null);
          const screenUrl = isNonBlackScreenUrl(rawDispScreen) ? rawDispScreen : null;
          if (isVirtual && !screenUrl) continue;
          if (boundCode && boundCode !== "AGENT") seenProfileCodes.add(boundCode);
          list.push({
            id: `display-${disp.logicalId}`,
            kind: "display",
            code: boundCode,
            badgeTopLeft: isVirtual ? `VIRTUAL D${disp.logicalId}` : "WIFI · D0",
            badgeTone: isVirtual ? "sky" : "emerald",
            titleCode: isVirtual
              ? boundCode && boundCode !== "AGENT"
                ? `D${disp.logicalId} · #${boundCode}`
                : `D${disp.logicalId}`
              : boundCode,
            modelLabel: isVirtual
              ? `VIRTUAL ${disp.resolution || "540X1200"} · U${boundUserId}`
              : (deviceTelemetry?.liveDeviceModel || "PIXEL 6A").toUpperCase(),
            endpointLabel: `${serialEndpoint} · Display ${disp.logicalId}`,
            subMetaLabel: resolvedFbLabel
              ? `${resolvedFbLabel} · U${boundUserId}`
              : isVirtual
                ? `Isolated Slot U${boundUserId} · 24fps H.264 Stream`
                : `Foreground U${fgUserId} · 24fps H.264 Stream`,
            displayId: disp.logicalId,
            userId: boundUserId,
            coordWidth: is540p ? 540 : is720p ? 720 : 1080,
            coordHeight: is540p ? 1200 : is720p ? 1600 : 2400,
            isLiveForeground: true,
            isRunning: true,
            cookieCount: boundSlot?.cookieCount || boundProf?.cookieCount || 435,
            c_user: resolvedCUser,
            fbAccountLabel: resolvedFbLabel,
            manufacturer: "Google",
            screenDataUrl: screenUrl,
          });
        }
      } else {
        // Offline Display 0 placeholder so physical Pixel 6a screen slot stays visible at #1
        const activeProf = profiles.find((p) => p.activeOnPhone);
        const resolvedCUser = activeProf?.c_user || null;
        const resolvedFbLabel =
          activeProf?.fbAccountName || (resolvedCUser ? `UID ${resolvedCUser}` : null);
        list.push({
          id: "display-0",
          kind: "display",
          code: activeProf?.code || "0005",
          badgeTopLeft: "OFFLINE · D0",
          badgeTone: "amber",
          titleCode: activeProf?.code || "0005",
          modelLabel: `${deviceTelemetry?.liveDeviceModel || "PIXEL 6A"} · ADB SLEEP`.toUpperCase(),
          endpointLabel: `${serialEndpoint} · Disconnected`,
          subMetaLabel: resolvedFbLabel || "Plug USB-C / Wake Wireless Debugging",
          displayId: 0,
          userId: 0,
          coordWidth: 1080,
          coordHeight: 2400,
          isLiveForeground: false,
          isRunning: false,
          cookieCount: activeProf?.cookieCount || 435,
          c_user: resolvedCUser,
          fbAccountLabel: resolvedFbLabel,
          manufacturer: "Google",
          screenDataUrl: isNonBlackScreenUrl(cachedSlotScreens["disp:0"]) ? cachedSlotScreens["disp:0"] : null,
        });
      }

      // 2. Rooted Multi-User Isolated Slots (U0, U10..U22)
      for (const slot of slots) {
        const code = slot.profileCode || `U${slot.userId}`;
        if (slot.profileCode) seenProfileCodes.add(slot.profileCode);
        if (slot.userId === fgUserId && list.some((c) => c.id === "display-0")) continue;
        const prof = slot.profileCode ? profileMap.get(slot.profileCode) : undefined;
        const boundVirt = displays.find((d) => d.kind === "virtual" && d.assignedUserId === slot.userId);
        const rawSlotScreen =
          (boundVirt ? liveState?.displayScreenshots?.[String(boundVirt.logicalId)] : null) ||
          (adbOnline && slot.userId === fgUserId ? liveState?.screenDataUrl || cachedSlotScreens["disp:0"] : null) ||
          slot.lastScreenDataUrl ||
          cachedSlotScreens[`user:${slot.userId}`] ||
          (slot.profileCode ? cachedSlotScreens[`prof:${slot.profileCode}`] : null) ||
          null;
        const screenUrl = isNonBlackScreenUrl(rawSlotScreen) ? rawSlotScreen : null;
        const isFg = adbOnline && Boolean(boundVirt || ((slot.isForeground || slot.userId === fgUserId) && screenUrl));
        const modelStr = (prof?.model || slot.model || "Pixel 6a").toUpperCase();
        const brandStr = prof?.manufacturer || (/samsung|sm-/i.test(modelStr) ? "Samsung" : "Google");
        const resolvedCUser = slot.c_user || prof?.c_user || null;
        const resolvedFbLabel =
          slot.fbAccountName || prof?.fbAccountName || (resolvedCUser ? `UID ${resolvedCUser}` : null);
        list.push({
          id: `slot-${slot.userId}`,
          kind: "user_slot",
          code,
          badgeTopLeft: boundVirt ? `D${boundVirt.logicalId} · U${slot.userId}` : `TCP · U${slot.userId}`,
          badgeTone: isFg ? "emerald" : slot.running ? "violet" : "amber",
          titleCode: code.replace(/^#/, ""),
          modelLabel: modelStr,
          endpointLabel: serialEndpoint,
          subMetaLabel: resolvedCUser
            ? `UID ${resolvedCUser.slice(0, 12)} · ${slot.cookieCount || prof?.cookieCount || 0} ck`
            : `U${slot.userId} Isolated · ${slot.cookieCount || prof?.cookieCount || 0} ck`,
          displayId: boundVirt ? boundVirt.logicalId : 0,
          userId: slot.userId,
          coordWidth:
            boundVirt?.resolution === "540x1200"
              ? 540
              : boundVirt?.resolution === "720x1600"
                ? 720
                : 1080,
          coordHeight:
            boundVirt?.resolution === "540x1200"
              ? 1200
              : boundVirt?.resolution === "720x1600"
                ? 1600
                : 2400,
          isLiveForeground: isFg,
          isRunning: adbOnline && (slot.running || isFg),
          cookieCount: slot.cookieCount || prof?.cookieCount || 0,
          c_user: resolvedCUser,
          fbAccountLabel: resolvedFbLabel,
          manufacturer: brandStr,
          screenDataUrl: screenUrl,
        });
      }
    }

    // 3. PC Android 14 Antidetect Emulation Profiles (#0001-#0054) — 100% Independent of Physical Pixel 6a
    if (engineMode !== "pixel6a_hardware") {
      for (const prof of profiles) {
        if (engineMode === "unified" && seenProfileCodes.has(prof.code)) continue;
        const pcProf = pcProfileByCode.get(prof.code);
        const isPcRunning = Boolean(
          pcProf && (pcProf.status === "running" || runningHeadlessIds.has(pcProf.id)),
        );
        const isMounted = engineMode !== "pc_emulation" && adbOnline && Boolean(prof.activeOnPhone);
        const rawProfScreen =
          (isMounted ? liveState?.screenDataUrl || cachedSlotScreens["disp:0"] : null) ||
          cachedSlotScreens[`prof:${prof.code}`] ||
          null;
        const screenUrl = isNonBlackScreenUrl(rawProfScreen) ? rawProfScreen : null;
        const resolvedCUser = prof.c_user || null;
        const resolvedFbLabel =
          prof.fbAccountName || (resolvedCUser ? `UID ${resolvedCUser}` : null);
        list.push({
          id: `profile-${prof.code}`,
          kind: "profile",
          code: prof.code,
          badgeTopLeft: isPcRunning
            ? "PC · RUNNING"
            : isMounted
              ? "MOUNTED · ADB"
              : "PC · READY",
          badgeTone: isPcRunning || isMounted ? "emerald" : "sky",
          titleCode: prof.code,
          modelLabel: `${prof.manufacturer} ${prof.model}`.toUpperCase(),
          endpointLabel: isPcRunning
            ? "PC Android 14 · Live"
            : isMounted
              ? serialEndpoint
              : `PC Emulation · AID ${prof.androidId.slice(0, 8)}`,
          subMetaLabel: resolvedCUser
            ? `UID ${resolvedCUser.slice(0, 12)} · ${prof.cookieCount} ck`
            : `${prof.glRenderer} · ${prof.cookieCount} cookies`,
          displayId: 0,
          userId: 0,
          coordWidth: 1080,
          coordHeight: 2400,
          isLiveForeground: isMounted && Boolean(screenUrl),
          isRunning: isPcRunning || isMounted,
          isPcRunning,
          cookieCount: prof.cookieCount,
          c_user: resolvedCUser,
          fbAccountLabel: resolvedFbLabel,
          manufacturer: prof.manufacturer,
          screenDataUrl: screenUrl,
        });
      }
    }

    return list;
  }, [cachedSlotScreens, deviceTelemetry, engineMode, liveState, pcProfileByCode, profiles, runningHeadlessIds]);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim();
    return phoneCards.filter((c) => {
      if (connectionFilter === "displays" && c.kind !== "display") return false;
      if (connectionFilter === "users" && c.kind !== "user_slot") return false;
      if (connectionFilter === "wifi" && c.kind === "profile" && !c.isRunning) return false;
      if (connectionFilter === "mounted" && !c.isRunning) return false;

      if (groupFilter === "running" && !c.isRunning) return false;
      if (groupFilter === "fb_ready" && c.cookieCount <= 0 && !c.c_user) return false;
      if (groupFilter === "google" && !/google|pixel/i.test(`${c.manufacturer} ${c.modelLabel}`)) return false;
      if (groupFilter === "samsung" && !/samsung|sm-/i.test(`${c.manufacturer} ${c.modelLabel}`)) return false;

      if (q) {
        const hay = `${c.titleCode} ${c.modelLabel} ${c.endpointLabel} ${c.subMetaLabel} ${c.badgeTopLeft} ${c.c_user || ""} ${c.fbAccountLabel || ""}`;
        if (!searchTextIncludes(hay, q)) return false;
      }
      return true;
    });
  }, [connectionFilter, groupFilter, phoneCards, searchQuery]);

  const theaterCard = useMemo(
    () => (theaterCardId ? phoneCards.find((c) => c.id === theaterCardId) || null : null),
    [phoneCards, theaterCardId],
  );

  // Proposal 2 (ok 2): Adaptive Bitrate H.264 Stream Quality (850Kbps @ 20fps Grid vs 2.6Mbps @ 30fps Focus Modal)
  const theaterDisplayId = theaterCard ? theaterCard.displayId : null;
  useEffect(() => {
    if (theaterDisplayId === null || !liveState?.adbOnline) return;
    void fetchFarmApi("/api/mobile-stealth/live-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set-stream-quality",
        displayId: theaterDisplayId,
        text: "high",
      }),
    }).catch(() => undefined);
    return () => {
      void fetchFarmApi("/api/mobile-stealth/live-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-stream-quality",
          displayId: theaterDisplayId,
          text: "grid",
        }),
      }).catch(() => undefined);
    };
  }, [liveState?.adbOnline, theaterDisplayId]);

  useEffect(() => {
    if (!theaterCard) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTheaterCardId(null);
        return;
      }
      if (!directKeyCapture) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void navigator.clipboard
          ?.readText()
          .then((clip) => {
            if (clip && clip.trim()) {
              void dispatchControl(
                {
                  action: "text",
                  displayId: theaterCard.displayId,
                  userId: theaterCard.userId,
                  profileCode: theaterCard.code,
                  text: clip.trim(),
                },
                `Pasted ${clip.trim().length} chars to #${theaterCard.titleCode}`,
              );
            }
          })
          .catch(() => undefined);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const keyMap: Record<string, string> = {
        Backspace: "67",
        Enter: "66",
        Tab: "61",
        ArrowUp: "19",
        ArrowDown: "20",
        ArrowLeft: "21",
        ArrowRight: "22",
        Delete: "112",
      };
      if (keyMap[e.key]) {
        e.preventDefault();
        void dispatchControl({
          action: "keyevent",
          displayId: theaterCard.displayId,
          userId: theaterCard.userId,
          profileCode: theaterCard.code,
          keyCode: keyMap[e.key],
        });
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        void dispatchControl({
          action: "text",
          displayId: theaterCard.displayId,
          userId: theaterCard.userId,
          profileCode: theaterCard.code,
          text: e.key,
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [directKeyCapture, dispatchControl, theaterCard]);

  const handleScreenPointerDown = useCallback((card: FarmPhoneCardItem, e: PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    pointerDownRef.current = {
      cardId: card.id,
      relX,
      relY,
      startedAt: Date.now(),
    };
  }, []);

  const selectedCards = useMemo(
    () => phoneCards.filter((c) => selectedCardIds.has(c.id)),
    [phoneCards, selectedCardIds],
  );

  const handleScreenPointerUp = useCallback(
    (card: FarmPhoneCardItem, e: PointerEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const endRelX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const endRelY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const start = pointerDownRef.current?.cardId === card.id ? pointerDownRef.current : null;
      pointerDownRef.current = null;

      const x1 = Math.round((start ? start.relX : endRelX) * card.coordWidth);
      const y1 = Math.round((start ? start.relY : endRelY) * card.coordHeight);
      const x2 = Math.round(endRelX * card.coordWidth);
      const y2 = Math.round(endRelY * card.coordHeight);
      const distPx = Math.hypot(x2 - x1, y2 - y1);

      const batchTargets =
        selectedCardIds.has(card.id) && selectedCards.length > 1 ? selectedCards : null;

      if (start && distPx >= 45) {
        const durationMs = Math.max(180, Math.min(800, Date.now() - start.startedAt));
        setLastGestureByCard((prev) => ({
          ...prev,
          [card.id]: { type: "swipe", x: x1, y: y1, x2, y2, durationMs, ts: Date.now() },
        }));
        if (syncMaster && (liveState?.displays?.length || 0) > 1) {
          for (const d of liveState?.displays || []) {
            void dispatchControl({
              action: "swipe",
              displayId: d.logicalId,
              userId: d.assignedUserId ?? card.userId,
              profileCode: d.assignedProfileCode || card.code,
              x: x1,
              y: y1,
              x2,
              y2,
              durationMs,
            });
          }
        } else if (batchTargets) {
          for (const t of batchTargets) {
            void dispatchControl({
              action: "swipe",
              displayId: t.displayId,
              userId: t.userId,
              profileCode: t.code,
              x: Math.round((start ? start.relX : endRelX) * t.coordWidth),
              y: Math.round((start ? start.relY : endRelY) * t.coordHeight),
              x2: Math.round(endRelX * t.coordWidth),
              y2: Math.round(endRelY * t.coordHeight),
              durationMs,
            });
          }
        } else {
          void dispatchControl({
            action: "swipe",
            displayId: card.displayId,
            userId: card.userId,
            profileCode: card.code,
            x: x1,
            y: y1,
            x2,
            y2,
            durationMs,
          });
        }
      } else {
        setLastGestureByCard((prev) => ({
          ...prev,
          [card.id]: { type: "tap", x: x2, y: y2, ts: Date.now() },
        }));
        if (syncMaster && (liveState?.displays?.length || 0) > 1) {
          for (const d of liveState?.displays || []) {
            void dispatchControl({
              action: "tap",
              displayId: d.logicalId,
              userId: d.assignedUserId ?? card.userId,
              profileCode: d.assignedProfileCode || card.code,
              x: x2,
              y: y2,
            });
          }
        } else if (batchTargets) {
          for (const t of batchTargets) {
            void dispatchControl({
              action: "tap",
              displayId: t.displayId,
              userId: t.userId,
              profileCode: t.code,
              x: Math.round(endRelX * t.coordWidth),
              y: Math.round(endRelY * t.coordHeight),
            });
          }
        } else {
          void dispatchControl({
            action: "tap",
            displayId: card.displayId,
            userId: card.userId,
            profileCode: card.code,
            x: x2,
            y: y2,
          });
        }
      }
    },
    [dispatchControl, liveState?.displays, selectedCardIds, selectedCards, syncMaster],
  );

  const handleMountOnPhone = useCallback(
    async (card: FarmPhoneCardItem) => {
      setActionBusy(`mount-${card.code}`);
      try {
        const res = await fetchFarmApi("/api/mobile-stealth/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileCode: card.code, restoreIfAvailable: true }),
        });
        if (res?.ok) {
          pushToast(`Mounted Profile #${card.code} (${card.modelLabel}) on Pixel 6a`, "success");
          await loadProfilesAndTelemetry();
          await pullFarmLiveState(true);
        } else {
          pushToast(`Mount #${card.code} on Pixel 6a failed: ${res?.reason || "adb_offline"}`, "error");
        }
      } finally {
        setActionBusy("");
      }
    },
    [loadProfilesAndTelemetry, pullFarmLiveState, pushToast],
  );

  const handleActivateCard = useCallback(
    async (card: FarmPhoneCardItem) => {
      if (card.kind === "user_slot") {
        await dispatchControl(
          { action: "switch-user", userId: card.userId },
          `Switched Pixel 6a foreground to U${card.userId} (#${card.titleCode})`,
        );
      } else if (card.kind === "profile") {
        const pcProf = pcProfileByCode.get(card.code);
        if (pcProf && (engineMode === "pc_emulation" || !liveState?.adbOnline)) {
          if (card.isPcRunning) {
            await closeOne(pcProf);
          } else {
            await openOne(pcProf);
          }
          return;
        }
        if (pcProf && engineMode === "unified" && !card.isLiveForeground) {
          if (card.isPcRunning) {
            await closeOne(pcProf);
          } else {
            await openOne(pcProf);
          }
          return;
        }
        await handleMountOnPhone(card);
      } else {
        await pullFarmLiveState(true);
      }
    },
    [
      closeOne,
      dispatchControl,
      engineMode,
      handleMountOnPhone,
      liveState?.adbOnline,
      openOne,
      pcProfileByCode,
      pullFarmLiveState,
    ],
  );

  const handleBatchTogglePcBrowsers = useCallback(
    async (mode: "launch" | "stop") => {
      const profileCards = selectedCards.filter((c) => c.kind === "profile");
      if (profileCards.length === 0) return;
      setActionBusy(`batch-pc-${mode}`);
      try {
        for (const c of profileCards) {
          const pcProf = pcProfileByCode.get(c.code);
          if (!pcProf) continue;
          if (mode === "launch" && !c.isPcRunning) {
            await openOne(pcProf);
          } else if (mode === "stop" && c.isPcRunning) {
            await closeOne(pcProf);
          }
        }
        pushToast(
          `${mode === "launch" ? "Launched" : "Stopped"} ${profileCards.length} PC Android Emulation browser(s)`,
          "success",
        );
      } finally {
        setActionBusy("");
      }
    },
    [closeOne, openOne, pcProfileByCode, pushToast, selectedCards],
  );

  const toggleSelectCard = useCallback((id: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAllFiltered = useCallback(() => {
    setSelectedCardIds((prev) => {
      const allSelected =
        filteredCards.length > 0 && filteredCards.every((c) => prev.has(c.id));
      if (allSelected) {
        return new Set();
      }
      return new Set(filteredCards.map((c) => c.id));
    });
  }, [filteredCards]);

  const handleBatchLaunchApp = useCallback(
    async (packageName: string, appLabel: string) => {
      if (selectedCards.length === 0) return;
      setActionBusy(`batch-${packageName}`);
      try {
        await Promise.all(
          selectedCards.map((c) =>
            dispatchControl({
              action: "launch-app",
              userId: c.userId,
              displayId: c.displayId,
              packageName,
              profileCode: c.code,
            }),
          ),
        );
        pushToast(
          `Launched ${appLabel} on ${selectedCards.length} selected screen(s)`,
          "success",
        );
      } finally {
        setActionBusy("");
      }
    },
    [dispatchControl, pushToast, selectedCards],
  );

  const handleBatchWakeAndScroll = useCallback(async () => {
    if (selectedCards.length === 0) return;
    setActionBusy("batch-scroll");
    try {
      await Promise.all(
        selectedCards.map(async (c) => {
          await dispatchControl({
            action: "keyevent",
            displayId: c.displayId,
            userId: c.userId,
            profileCode: c.code,
            keyCode: "224",
          });
          await dispatchControl({
            action: "swipe",
            displayId: c.displayId,
            userId: c.userId,
            profileCode: c.code,
            x: Math.round(c.coordWidth * 0.5),
            y: Math.round(c.coordHeight * 0.76),
            x2: Math.round(c.coordWidth * 0.5),
            y2: Math.round(c.coordHeight * 0.24),
            durationMs: 320,
          });
        }),
      );
      pushToast(
        `Woke & scrolled feed across ${selectedCards.length} selected screen(s)`,
        "success",
      );
    } finally {
      setActionBusy("");
    }
  }, [dispatchControl, pushToast, selectedCards]);

  const handleBatchStopUsers = useCallback(async () => {
    const targets = selectedCards.filter((c) => c.userId >= 10);
    if (targets.length === 0) {
      pushToast(
        "Select at least 1 secondary Multi-User slot (U10..U21) to stop",
        "info",
      );
      return;
    }
    setActionBusy("batch-stop-users");
    try {
      await Promise.all(
        targets.map((c) =>
          dispatchControl({
            action: "stop-user",
            userId: c.userId,
            profileCode: c.code,
          }),
        ),
      );
      await pullFarmLiveState(true);
      pushToast(
        `Stopped ${targets.length} secondary Android user slot(s)`,
        "success",
      );
    } finally {
      setActionBusy("");
    }
  }, [dispatchControl, pullFarmLiveState, pushToast, selectedCards]);

  const handleCopyCardScreenshot = useCallback(
    async (card: FarmPhoneCardItem) => {
      try {
        let sourceCanvas: HTMLCanvasElement | null = null;
        const muxEntry = _muxDecodersByDisplay.get(card.displayId);
        if (
          muxEntry &&
          muxEntry.hasMirrorFrame &&
          muxEntry.mirrorCanvas.width > 0 &&
          muxEntry.mirrorCanvas.height > 0
        ) {
          sourceCanvas = muxEntry.mirrorCanvas;
        } else if (card.screenDataUrl) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Image load failed"));
            img.src = card.screenDataUrl!;
          });
          const off = document.createElement("canvas");
          off.width = img.naturalWidth || card.coordWidth || 540;
          off.height = img.naturalHeight || card.coordHeight || 1200;
          const ctx = off.getContext("2d");
          if (ctx) ctx.drawImage(img, 0, 0);
          sourceCanvas = off;
        }

        if (!sourceCanvas) {
          pushToast(
            `No live frame available yet for #${card.titleCode} — wake or stream first`,
            "info",
          );
          return;
        }

        const w = sourceCanvas.width;
        const h = sourceCanvas.height;
        const blob = await new Promise<Blob | null>((resolve) =>
          sourceCanvas!.toBlob((b) => resolve(b), "image/png"),
        );
        if (!blob) {
          pushToast("Failed to encode PNG screenshot", "error");
          return;
        }

        if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          pushToast(
            `Copied #${card.titleCode} PNG screenshot (${w}×${h}) to PC Clipboard`,
            "success",
          );
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `mobile-farm-${card.titleCode}-D${card.displayId}.png`;
          a.click();
          URL.revokeObjectURL(url);
          pushToast(
            `Downloaded #${card.titleCode} PNG screenshot (${w}×${h})`,
            "success",
          );
        }
      } catch {
        pushToast("Unable to copy PNG screenshot to PC Clipboard", "error");
      }
    },
    [pushToast],
  );

  const pcRunningCount = useMemo(() => {
    let count = 0;
    for (const p of profiles) {
      const pc = pcProfileByCode.get(p.code);
      if (pc && (pc.status === "running" || runningHeadlessIds.has(pc.id))) count += 1;
    }
    return count;
  }, [pcProfileByCode, profiles, runningHeadlessIds]);

  const kpiTiles = useMemo<KpiTileData[]>(() => {
    const displaysCount = liveState?.displays?.length || 1;
    const slotsCount = liveState?.multiUserSlots?.length || 13;
    const runningSlots = (liveState?.multiUserSlots || []).filter((s) => s.running).length;
    const fbSyncedCount = profiles.filter((p) => p.cookieCount > 0).length;
    return [
      {
        prefKey: "total",
        label: engineMode === "pc_emulation" ? "PC Android Slots" : engineMode === "pixel6a_hardware" ? "Pixel 6a Screens" : "Farm Screens",
        value: phoneCards.length,
        emojiGlyph: STEALTH_PROFILE_KPI_STICKER.total,
        tone: "indigo",
        active: false,
        onClick: () => {
          setConnectionFilter("all");
          setGroupFilter("all");
        },
      },
      {
        prefKey: "running",
        label: "PC Emulation Mode",
        value: `${pcRunningCount}/${profiles.length || 52} Ready`,
        emojiGlyph: "💻",
        tone: "emerald",
        active: engineMode === "pc_emulation",
        onClick: () => setEngineMode((prev) => (prev === "pc_emulation" ? "unified" : "pc_emulation")),
      },
      {
        prefKey: "headless",
        label: "Pixel 6a Hardware",
        value: liveState?.adbOnline ? `ONLINE · ${runningSlots}/${slotsCount} U` : `ADB STANDBY · ${displaysCount}D`,
        emojiGlyph: "📱",
        tone: liveState?.adbOnline ? "emerald" : "amber",
        active: engineMode === "pixel6a_hardware",
        onClick: () => setEngineMode((prev) => (prev === "pixel6a_hardware" ? "unified" : "pixel6a_hardware")),
      },
      {
        prefKey: "ready",
        label: "Session Ready",
        value: fbSyncedCount,
        emojiGlyph: STEALTH_PROFILE_KPI_STICKER.ready,
        tone: "emerald",
        active: groupFilter === "fb_ready",
        onClick: () => setGroupFilter((prev) => (prev === "fb_ready" ? "all" : "fb_ready")),
      },
      {
        prefKey: "failed",
        label: "Pixel 6a (80–85%)",
        value: `${liveState?.hardwareHealth?.batteryLevel ?? deviceTelemetry?.batteryLevel ?? 85}% · ${(liveState?.hardwareHealth?.batteryTempC ?? deviceTelemetry?.batteryTempC ?? 30.1).toFixed(1)}°C`,
        emojiGlyph: (liveState?.hardwareHealth?.batteryLevel ?? deviceTelemetry?.batteryLevel ?? 85) <= 20 ? "⚠️" : "🔋",
        tone: (liveState?.hardwareHealth?.batteryLevel ?? deviceTelemetry?.batteryLevel ?? 85) <= 20 ? "amber" : "emerald",
        active: false,
      },
    ];
  }, [
    deviceTelemetry,
    engineMode,
    groupFilter,
    liveState?.adbOnline,
    liveState?.displays?.length,
    liveState?.hardwareHealth?.batteryLevel,
    liveState?.hardwareHealth?.batteryTempC,
    liveState?.multiUserSlots,
    pcRunningCount,
    phoneCards.length,
    profiles,
  ]);

  const countsByGroup = useMemo(() => {
    return {
      all: phoneCards.length,
      running: phoneCards.filter((c) => c.isRunning).length,
      fb_ready: phoneCards.filter((c) => c.cookieCount > 0 || Boolean(c.c_user)).length,
      google: phoneCards.filter((c) => /google|pixel/i.test(`${c.manufacturer} ${c.modelLabel}`)).length,
      samsung: phoneCards.filter((c) => /samsung|sm-/i.test(`${c.manufacturer} ${c.modelLabel}`)).length,
    };
  }, [phoneCards]);

  const batLevel = liveState?.hardwareHealth?.batteryLevel ?? deviceTelemetry?.batteryLevel ?? 85;
  const batLow = batLevel <= 22;
  const adbOnline = Boolean(liveState?.adbOnline);
  const patrolRunning = Boolean(liveState?.patrolRunning);
  const virtualPoolCount = (liveState?.displays || []).filter((d) => d.kind === "virtual").length;
  const recentEvents = liveState?.liveEvents || [];
  const icon12 = compactIconSize(12);

  const farmGridScrollRef = useRef<HTMLDivElement>(null);
  const [farmWallWidth, setFarmWallWidth] = useState(1200);
  useEffect(() => {
    const el = farmGridScrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      if (el.clientWidth > 0) setFarmWallWidth(el.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const farmGridCols = Math.max(1, Math.floor((farmWallWidth + 10) / (cardWidth + 10)));
  const shouldVirtualizeFarmWall = filteredCards.length > HUB_VIRTUAL_ROW_THRESHOLD;
  const farmVirtualRowCount = shouldVirtualizeFarmWall
    ? Math.ceil(filteredCards.length / farmGridCols)
    : 0;
  const {
    virtualized: farmWallVirtualized,
    virtualItems: farmVirtualRowItems,
    paddingTop: farmPaddingTop,
    paddingBottom: farmPaddingBottom,
  } = useHubVirtualRows({
    count: farmVirtualRowCount,
    scrollRef: farmGridScrollRef,
    estimateSize: Math.round(cardWidth * 1.95) + 82,
    threshold: 0,
    enabled: shouldVirtualizeFarmWall,
  });
  const visibleFarmCards = useMemo(() => {
    if (!farmWallVirtualized) return filteredCards;
    const out: FarmPhoneCardItem[] = [];
    for (const rowItem of farmVirtualRowItems) {
      const start = rowItem.index * farmGridCols;
      const end = Math.min(filteredCards.length, start + farmGridCols);
      for (let i = start; i < end; i += 1) {
        const card = filteredCards[i];
        if (card) out.push(card);
      }
    }
    return out;
  }, [farmGridCols, farmVirtualRowItems, farmWallVirtualized, filteredCards]);

  return (
    <div className="hub-tab-chrome-stack flex min-h-0 flex-1 flex-col overflow-hidden">
      <HubListChromeHeader
        ariaLabel="Mobile Farm header"
        titleIcon={MonitorSmartphone}
        titleIconClass="text-emerald-300"
        title="Mobile Farm"
        metaItems={metaItems}
        versionReleaseNotesCode="P0003"
        centerStats={centerStats ?? []}
        actions={headerActions}
      />

      <div className="px-3 pt-1">
        <KpiStrip items={kpiTiles} />
      </div>

      {/* Main Split Farm Workspace: Left Control Rail (like Image 2) + Right Multi-Screen Phone Grid */}
      <div className="flex min-h-0 flex-1 gap-2.5 overflow-hidden px-3 pb-3 pt-1">
        {/* Left Control & Group Rail */}
        {!railCollapsed ? (
          <aside className="flex w-[256px] shrink-0 flex-col gap-2 overflow-y-auto">
            <HubPanel
              title={
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <Settings2 size={compactIconSize(13)} className="text-emerald-400" aria-hidden />
                  <span>Farm Control &amp; Sliders</span>
                </span>
              }
              actions={
                <HubBulkActionButton
                  variant="ghost"
                  tone="neutral"
                  icon={<PanelLeftClose size={icon12} aria-hidden />}
                  label="Hide"
                  title="Collapse Farm Control Rail"
                  onClick={() => setRailCollapsed(true)}
                  className="!h-6 !px-1.5"
                />
              }
            >
              <div className="flex flex-col gap-2.5 p-2.5 text-xs">
                {/* Independent Dual-Engine Mode Switcher */}
                <div className="flex flex-col gap-1 rounded-lg border border-emerald-400/25 bg-black/35 p-1.5">
                  <div className="flex items-center justify-between text-[10px] text-hub-muted px-0.5">
                    <span>Independent Farm Engine</span>
                    <span className="text-emerald-300">
                      {engineMode === "pc_emulation"
                        ? "PC Mode"
                        : engineMode === "pixel6a_hardware"
                          ? "Pixel 6a Mode"
                          : "Dual View"}
                    </span>
                  </div>
                  <HubSegmentToggle<FarmEngineMode>
                    value={engineMode}
                    onChange={setEngineMode}
                    className="w-full justify-between"
                    options={[
                      { value: "pc_emulation", label: "💻 PC (52)", activeTone: "emerald" },
                      { value: "pixel6a_hardware", label: "📱 Pixel 6a", activeTone: "emerald" },
                      { value: "unified", label: "⚡ Dual", activeTone: "emerald" },
                    ]}
                  />
                </div>

                {/* Sliders matching Image 2 */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-hub-muted">
                    <span>Screen Size</span>
                    <span className="tabular-nums text-white">{cardWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={165}
                    max={330}
                    step={5}
                    value={cardWidth}
                    onChange={(e) => setCardWidth(Number(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-hub-muted">
                    <span>JPEG Stream Rate</span>
                    <span className="tabular-nums text-white">{(refreshIntervalMs / 1000).toFixed(2)}s</span>
                  </div>
                  <input
                    type="range"
                    min={500}
                    max={4000}
                    step={150}
                    value={refreshIntervalMs}
                    onChange={(e) => setRefreshIntervalMs(Number(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                </div>

                {/* Hub-UI SSOT Action Buttons Grid */}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <HubBulkActionButton
                    tone={autoStream ? "emerald" : "neutral"}
                    icon={autoStream ? <Pause size={icon12} aria-hidden /> : <Play size={icon12} aria-hidden />}
                    label={autoStream ? "Live On" : "Paused"}
                    title="Toggle live H.264 & JPEG screen auto-stream"
                    onClick={() => setAutoStream((v) => !v)}
                    className="w-full justify-center !px-2"
                  />

                  <HubBulkActionButton
                    tone={patrolRunning ? "emerald" : "neutral"}
                    icon={<Activity size={icon12} aria-hidden />}
                    iconPulsing={patrolRunning}
                    label={patrolRunning ? "Patrol ON" : "Auto Patrol"}
                    title="Autonomous Antidetect feed scroll & touch patrol across active displays"
                    disabled={Boolean(actionBusy)}
                    onClick={() => void handleTogglePatrol()}
                    className="w-full justify-center !px-2"
                  />

                  <HubBulkActionButton
                    tone="sky"
                    icon={<Grid2x2 size={icon12} aria-hidden />}
                    label={`4x Pool (${virtualPoolCount}/4)`}
                    title="Spawn 4 concurrent Virtual Displays (D1–D4) bound to isolated Multi-User slots (U10–U13)"
                    disabled={Boolean(actionBusy)}
                    onClick={() => void handleEnsureVirtualDisplayPool()}
                    className="w-full justify-center !px-2"
                  />

                  <HubBulkActionButton
                    tone={syncMaster ? "indigo" : "neutral"}
                    icon={<Radio size={icon12} aria-hidden />}
                    label={syncMaster ? "Sync ON" : "Sync All"}
                    title="Broadcast taps, swipes, and keyevents across all active displays"
                    onClick={() => {
                      setSyncMaster((v) => !v);
                      pushToast(
                        !syncMaster
                          ? "Master Sync enabled: taps & swipes broadcast across all displays"
                          : "Master Sync disabled",
                        "info",
                      );
                    }}
                    className="w-full justify-center !px-2"
                  />

                  <HubBulkActionButton
                    tone="emerald"
                    icon={<Wifi size={icon12} aria-hidden />}
                    label="Wi-Fi Heal"
                    title="Auto-scan Android 11-16 dynamic Wireless Debugging port & reconnect ADB over Wi-Fi"
                    disabled={Boolean(actionBusy)}
                    onClick={() => void handleReconnectWifiAdb()}
                    className="w-full justify-center !px-2"
                  />

                  <HubBulkActionButton
                    tone="sky"
                    icon={<Plus size={icon12} aria-hidden />}
                    label="+1 Display"
                    title="Spawn 1 parallel 1080x2400 virtual display for background Agent tasks"
                    disabled={Boolean(actionBusy)}
                    onClick={() => void handleEnsureVirtualDisplay()}
                    className="w-full justify-center !px-2"
                  />

                  <HubBulkActionButton
                    tone="neutral"
                    icon={<ExternalLink size={icon12} aria-hidden />}
                    label="Scrcpy 60f"
                    title="Open native 60fps Scrcpy window"
                    onClick={() => void dispatchControl({ action: "open-scrcpy" }, "Opened 60fps Scrcpy Window")}
                    className="w-full justify-center !px-2"
                  />

                  <HubBulkActionButton
                    tone="neutral"
                    icon={<RefreshCw size={icon12} aria-hidden />}
                    iconSpinning={loading}
                    label="Refresh"
                    title="Capture fresh frame across all displays now"
                    disabled={loading}
                    onClick={() => void pullFarmLiveState(true)}
                    className="w-full justify-center !px-2"
                  />
                </div>

                {virtualPoolCount > 0 ? (
                  <HubBulkActionButton
                    tone="rose"
                    icon={<XCircle size={icon12} aria-hidden />}
                    label={`Close ${virtualPoolCount} Virtual Display(s)`}
                    title="Release virtual displays D1..D4"
                    disabled={Boolean(actionBusy)}
                    onClick={() => void handleCloseVirtualDisplayPool()}
                    className="w-full justify-center !px-2"
                  />
                ) : null}

                {/* Connection Mode Tabs (HubSegmentToggle SSOT) */}
                <div className="border-t border-white/10 pt-2">
                  <HubSegmentToggle<FarmFilterConnection>
                    value={connectionFilter}
                    onChange={setConnectionFilter}
                    className="w-full justify-between"
                    options={[
                      { value: "all", label: "All", activeTone: "emerald" },
                      { value: "displays", label: "Disp", activeTone: "emerald" },
                      { value: "users", label: "Users", activeTone: "emerald" },
                      { value: "wifi", label: "WiFi", activeTone: "emerald" },
                      { value: "mounted", label: "Live", activeTone: "emerald" },
                    ]}
                  />
                </div>

                {/* Groups Filter List matching Image 2 */}
                <div className="flex flex-col gap-1 border-t border-white/10 pt-2">
                  <div className="flex items-center justify-between text-xs text-hub-muted">
                    <span>Device Groups</span>
                    <span className="tabular-nums">{filteredCards.length} shown</span>
                  </div>
                  {(
                    [
                      { id: "all", label: "All Devices", count: countsByGroup.all },
                      { id: "running", label: "Running / Mounted", count: countsByGroup.running },
                      { id: "fb_ready", label: "Facebook Session Ready", count: countsByGroup.fb_ready },
                      { id: "google", label: "Google Pixel Fleet", count: countsByGroup.google },
                      { id: "samsung", label: "Samsung Galaxy S24", count: countsByGroup.samsung },
                    ] as const
                  ).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGroupFilter(g.id)}
                      className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                        groupFilter === g.id
                          ? "border-emerald-400/40 bg-emerald-500/15 text-white"
                          : "border-white/10 bg-black/20 text-hub-muted hover:border-white/20 hover:text-white"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <ChevronRight size={icon12} className={groupFilter === g.id ? "text-emerald-300" : "text-hub-muted"} aria-hidden />
                        <span>{g.label}</span>
                      </span>
                      <span className="tabular-nums text-[10px] opacity-80">
                        ({g.count}/{phoneCards.length})
                      </span>
                    </button>
                  ))}
                </div>

                {/* Hardware & Battery Telemetry Box */}
                <div
                  className={`mt-1 flex flex-col gap-1.5 rounded-lg border p-2 text-xs ${
                    !adbOnline || batLow
                      ? "border-amber-400/40 bg-amber-950/25 text-amber-200"
                      : "border-emerald-500/25 bg-emerald-950/20 text-emerald-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1">
                      {!adbOnline ? (
                        <WifiOff size={compactIconSize(13)} className="text-rose-400" aria-hidden />
                      ) : batLow ? (
                        <BatteryWarning size={compactIconSize(13)} aria-hidden />
                      ) : (
                        <BatteryCharging size={compactIconSize(13)} aria-hidden />
                      )}
                      <span>{deviceTelemetry?.liveDeviceModel || "Pixel 6a"} Node</span>
                    </span>
                    <span className="tabular-nums">
                      {adbOnline ? "ONLINE" : "OFFLINE"} · {liveState?.hardwareHealth?.batteryLevel ?? batLevel}%
                      {typeof liveState?.hardwareHealth?.batteryTempC === "number"
                        ? ` · ${liveState.hardwareHealth.batteryTempC.toFixed(1)}°C`
                        : ""}
                    </span>
                  </div>
                  <div className="truncate text-[10px] text-hub-muted">
                    Endpoint: <span className="text-white">{liveState?.serial || "192.168.0.208:5555"}</span>
                  </div>
                  {liveState?.hardwareHealth?.ok ? (
                    <div className="grid grid-cols-2 gap-1 rounded bg-black/35 p-1.5 text-[10px] text-white/90 tabular-nums">
                      <div title="Available RAM / Total RAM">
                        <span className="text-hub-muted">RAM Free:</span>{" "}
                        <span className="text-emerald-300">
                          {((liveState.hardwareHealth.ramAvailableMb || 0) / 1024).toFixed(2)} GB
                        </span>
                      </div>
                      <div title="Available ZRAM Swap / Total ZRAM Swap">
                        <span className="text-hub-muted">Swap Free:</span>{" "}
                        <span className="text-sky-300">
                          {((liveState.hardwareHealth.swapFreeMb || 0) / 1024).toFixed(2)} GB
                        </span>
                      </div>
                      <div title="Hardware Charger IC Limit (/sys/devices/platform/google,charger)">
                        <span className="text-hub-muted">Charge Band:</span>{" "}
                        <span className="text-emerald-300">
                          {liveState.hardwareHealth.chargeStartLevel ?? 80}–{liveState.hardwareHealth.chargeStopLevel ?? 85}%
                        </span>
                      </div>
                      <div title="Running Android Users / Total Provisioned Slots">
                        <span className="text-hub-muted">Users:</span>{" "}
                        <span className="text-white">
                          {liveState.hardwareHealth.runningUserCount ?? 1} run / {liveState.hardwareHealth.totalUserCount ?? 10}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {/* 24h Battery (80-85% Hysteresis Curve) & Thermal (°C) Sparkline */}
                  {(() => {
                    const hist = liveState?.hardwareHealth?.history24h && liveState.hardwareHealth.history24h.length >= 2
                      ? liveState.hardwareHealth.history24h
                      : [
                          { ts: 1, at: "", batteryLevel: 81, batteryTempC: 29.1 },
                          { ts: 2, at: "", batteryLevel: 83, batteryTempC: 29.6 },
                          { ts: 3, at: "", batteryLevel: 85, batteryTempC: 30.1, chargeDisable: 1 },
                          { ts: 4, at: "", batteryLevel: 83, batteryTempC: 29.5, chargeDisable: 1 },
                          { ts: 5, at: "", batteryLevel: 80, batteryTempC: 28.9, chargeDisable: 0 },
                          { ts: 6, at: "", batteryLevel: 83, batteryTempC: 29.7, chargeDisable: 0 },
                          { ts: 7, at: "", batteryLevel: 85, batteryTempC: 30.2, chargeDisable: 1 },
                          { ts: 8, at: "", batteryLevel: 82, batteryTempC: 29.4, chargeDisable: 1 },
                          { ts: 9, at: "", batteryLevel: 80, batteryTempC: 28.8, chargeDisable: 0 },
                          {
                            ts: 10,
                            at: "",
                            batteryLevel: liveState?.hardwareHealth?.batteryLevel ?? batLevel,
                            batteryTempC: liveState?.hardwareHealth?.batteryTempC ?? 30.1,
                            chargeDisable: liveState?.hardwareHealth?.chargeDisable ?? 1,
                          },
                        ];
                    const w = 216;
                    const h = 44;
                    const batPoints = hist
                      .map((p, idx) => {
                        const x = (idx / Math.max(1, hist.length - 1)) * w;
                        const clamped = Math.max(75, Math.min(90, Number(p.batteryLevel || 83)));
                        const y = h - ((clamped - 75) / 15) * (h - 8) - 4;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      })
                      .join(" ");
                    const tempPoints = hist
                      .map((p, idx) => {
                        const x = (idx / Math.max(1, hist.length - 1)) * w;
                        const clampedT = Math.max(25, Math.min(40, Number(p.batteryTempC || 30)));
                        const y = h - ((clampedT - 25) / 15) * (h - 8) - 4;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      })
                      .join(" ");
                    const y85 = h - ((85 - 75) / 15) * (h - 8) - 4;
                    const y80 = h - ((80 - 75) / 15) * (h - 8) - 4;
                    const acOff = liveState?.hardwareHealth?.acPowered === false;
                    const curBat = liveState?.hardwareHealth?.batteryLevel ?? batLevel;
                    const batCritical = acOff && curBat < 75;
                    const bypassOn =
                      !acOff &&
                      (liveState?.hardwareHealth?.chargeDisable ?? (curBat >= 85 ? 1 : 0)) === 1;
                    return (
                      <div className="rounded bg-black/45 p-1.5 text-[10px]">
                        <div className="mb-1 flex items-center justify-between text-[9px]">
                          <span className={acOff ? "text-amber-300" : "text-emerald-300"}>24h Hysteresis (80–85%)</span>
                          <span
                            className={`rounded px-1 py-0.2 ${
                              batCritical
                                ? "bg-rose-500/25 text-rose-200 border border-rose-400/40"
                                : acOff
                                  ? "bg-amber-500/20 text-amber-200 border border-amber-400/35"
                                  : bypassOn
                                    ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30"
                                    : "bg-sky-500/20 text-sky-200 border border-sky-400/30"
                            }`}
                          >
                            {batCritical
                              ? "🚨 USB Unplugged (<75%)"
                              : acOff
                                ? "⚠️ USB Unplugged"
                                : bypassOn
                                  ? "Bypass ON (85%)"
                                  : "Charging (80→85%)"}
                          </span>
                        </div>
                        <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-full overflow-visible">
                          <line x1={0} y1={y85} x2={w} y2={y85} stroke="rgba(52,211,153,0.35)" strokeDasharray="3 3" strokeWidth="1" />
                          <line x1={0} y1={y80} x2={w} y2={y80} stroke="rgba(56,189,248,0.35)" strokeDasharray="3 3" strokeWidth="1" />
                          <polyline
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="1.4"
                            strokeOpacity="0.8"
                            points={tempPoints}
                          />
                          <polyline
                            fill="none"
                            stroke="#34d399"
                            strokeWidth="2"
                            points={batPoints}
                          />
                        </svg>
                        <div className="mt-0.5 flex items-center justify-between text-[9px] text-hub-muted tabular-nums">
                          <span className="text-emerald-300">━ Bat % (80–85% band)</span>
                          <span className="text-sky-300">━ Temp °C ({hist[hist.length - 1]?.batteryTempC ?? 30.1}°C)</span>
                        </div>
                      </div>
                    );
                  })()}

                  {adbOnline ? (
                    <div className="flex flex-col gap-1 pt-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-emerald-300/90">
                          D0: {liveState?.hardwareHealth?.display0Off !== false ? "OFF (Dozing)" : "ON"}
                        </span>
                        <HubBulkActionButton
                          tone="emerald"
                          icon={<Trash2 size={compactIconSize(11)} aria-hidden />}
                          label="Reap RAM & Prune"
                          title="Stop idle secondary Android users (u10..u99), drop kernel caches, and prune stale slots"
                          disabled={Boolean(actionBusy)}
                          onClick={() =>
                            void dispatchControl(
                              { action: "reap-and-prune-users" },
                              "Reaped idle secondary users & pruned stale slots",
                            )
                          }
                          className="!h-6 !px-2 !text-[10px]"
                        />
                      </div>
                      <HubBulkActionButton
                        tone="sky"
                        icon={<ShieldCheck size={compactIconSize(11)} aria-hidden />}
                        label={actionBusy === "provision-npo" ? "Provisioning 80–85%…" : "Verify / Provision 80–85% Never-Power-Off"}
                        title="Push 01-p0002-stealth-boot.sh & 99-stealth-server-hardening.sh, enforce 80-85% charge hysteresis & Display 0 OFF"
                        disabled={Boolean(actionBusy)}
                        onClick={async () => {
                          setActionBusy("provision-npo");
                          try {
                            const res = await fetchFarmApi("/api/mobile-stealth/provision-never-power-off", {
                              method: "POST",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ verifyOnly: false }),
                            });
                            await pullFarmLiveState(false);
                            pushToast(
                              res?.ok
                                ? `Provisioned Never-Power-Off (${res.hardwareHealth?.batteryLevel ?? 85}% · ${res.hardwareHealth?.chargeStartLevel ?? 80}–${res.hardwareHealth?.chargeStopLevel ?? 85}% · D0 OFF)`
                                : "Provision request completed",
                              "success",
                            );
                          } catch {
                            pushToast("Failed to reach Never-Power-Off provision bridge", "error");
                          } finally {
                            setActionBusy("");
                          }
                        }}
                        className="w-full justify-center !h-6 !px-2 !text-[10px]"
                      />
                      <div className="flex items-center justify-between rounded bg-indigo-950/35 px-1.5 py-1 text-[9px] text-indigo-200 border border-indigo-400/25">
                        <span>
                          ⏱ 30m Harvester:{" "}
                          <span className="font-semibold text-emerald-300">
                            {liveState?.gmailMarlHarvester?.watcherActive !== false ? "ON" : "IDLE"}
                          </span>
                        </span>
                        <span className="tabular-nums text-indigo-300">
                          {liveState?.gmailMarlHarvester?.pendingCount ?? 8} pending ·{" "}
                          {liveState?.gmailMarlHarvester?.unlockedCount ?? 1} unlocked
                        </span>
                      </div>
                      <HubBulkActionButton
                        tone="indigo"
                        icon={<RefreshCw size={compactIconSize(11)} aria-hidden />}
                        label={
                          actionBusy === "harvest-marl"
                            ? "Scanning 48h Recovery Mailboxes…"
                            : `Harvest 48h Gmail Recovery Links (${liveState?.gmailMarlHarvester?.pendingCount ?? 8})`
                        }
                        title={
                          liveState?.gmailMarlHarvester?.lastRunAt
                            ? `30m Auto-Harvester ON · Last scan: ${new Date(liveState.gmailMarlHarvester.lastRunAt).toLocaleTimeString()} · Next: ${liveState.gmailMarlHarvester.nextRunAt ? new Date(liveState.gmailMarlHarvester.nextRunAt).toLocaleTimeString() : "in 30m"}`
                            : "Scan all pending 48h recovery_appeal_submitted Gmail accounts via MS Graph OAuth2 & auto-unlock linked Gmail + Facebook"
                        }
                        disabled={Boolean(actionBusy)}
                        onClick={async () => {
                          setActionBusy("harvest-marl");
                          try {
                            const res = await fetchFarmApi("/api/mobile-stealth/harvest-gmail-marl-recovery", {
                              method: "POST",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ unlockLinkedFacebook: true }),
                            });
                            await pullFarmLiveState(false);
                            const count = Array.isArray(res?.results) ? res.results.length : Number(res?.count || 0);
                            const completed = Array.isArray(res?.results)
                              ? res.results.filter((r: { action?: string }) => String(r?.action || "").startsWith("completed_")).length
                              : 0;
                            pushToast(
                              `Scanned ${count} pending 48h Gmail appeals (${completed} unlocked via marl/sgo, ${Math.max(0, count - completed)} awaiting 48h link)`,
                              "info",
                            );
                          } catch {
                            pushToast("Failed to scan 48h Gmail recovery links", "error");
                          } finally {
                            setActionBusy("");
                          }
                        }}
                        className="w-full justify-center !h-6 !px-2 !text-[10px]"
                      />
                    </div>
                  ) : null}
                  {!adbOnline ? (
                    <div className="text-[10px] text-amber-300">
                      ADB link asleep (last battery {batLevel}%). Plug USB-C charger or wake Wireless Debugging.
                    </div>
                  ) : batLow ? (
                    <div className="text-[10px] text-amber-300">
                      Low battery ({batLevel}%) — keep charger plugged for 24/7 Wi-Fi ADB stability.
                    </div>
                  ) : null}
                </div>
              </div>
            </HubPanel>
          </aside>
        ) : null}

        {/* Right Multi-Screen Phone Wall Grid (matches Image 2) */}
        <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-lg border border-white/10 bg-black/20 p-2.5">
          {/* Wall Toolbar (Hub-UI SSOT Search, ResultCount & BulkActionButtons) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              {railCollapsed ? (
                <HubBulkActionButton
                  tone="neutral"
                  icon={<PanelLeftOpen size={icon12} aria-hidden />}
                  label="Controls"
                  title="Expand Farm Control Rail"
                  onClick={() => setRailCollapsed(false)}
                />
              ) : null}
              <HubSearchField
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search code (#0005, U10), model, UID..."
                showShortcutHint={false}
                className="w-64"
              />
              <HubResultCount
                icon={MonitorSmartphone}
                shown={filteredCards.length}
                total={phoneCards.length}
                label="screens"
              />
              <HubBulkActionButton
                tone={selectedCardIds.size > 0 ? "sky" : "neutral"}
                icon={<CheckSquare size={icon12} aria-hidden />}
                label={
                  filteredCards.length > 0 &&
                  filteredCards.every((c) => selectedCardIds.has(c.id))
                    ? "Unselect All"
                    : "Select All"
                }
                selectedCount={selectedCardIds.size > 0 ? selectedCardIds.size : undefined}
                title="Select or unselect all currently filtered screens for batch operations"
                onClick={handleSelectAllFiltered}
              />
              <HubSegmentToggle<FarmEngineMode>
                value={engineMode}
                onChange={setEngineMode}
                options={[
                  { value: "pc_emulation", label: `💻 PC Emulation (${profiles.length || 52})`, activeTone: "emerald" },
                  {
                    value: "pixel6a_hardware",
                    label: `📱 Pixel 6a (${adbOnline ? "ONLINE" : "STANDBY"})`,
                    activeTone: "emerald",
                  },
                  { value: "unified", label: "⚡ Dual View", activeTone: "emerald" },
                ]}
              />
            </div>

            {/* Global Multi-Display Pool, Auto Patrol & Hardware Keys Bar (HubBulkActionButton SSOT) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <HubBulkActionButton
                tone="sky"
                icon={<Grid2x2 size={icon12} aria-hidden />}
                label={`4x Virtual Pool (${virtualPoolCount}/4)`}
                title="Spawn 4 concurrent Virtual Displays (Display 1..4) bound to Multi-User U10..U13"
                disabled={Boolean(actionBusy)}
                onClick={() => void handleEnsureVirtualDisplayPool()}
              />
              <HubBulkActionButton
                tone={patrolRunning ? "emerald" : "neutral"}
                icon={<Activity size={icon12} aria-hidden />}
                iconPulsing={patrolRunning}
                label={patrolRunning ? `Auto Patrol #${liveState?.patrolStepCount || 0}` : "Auto Patrol"}
                title="Run autonomous Antidetect feed scroll & swipe behavior across active displays"
                disabled={Boolean(actionBusy)}
                onClick={() => void handleTogglePatrol()}
              />
              <HubBulkActionButton
                tone="neutral"
                icon={<ArrowLeft size={icon12} aria-hidden />}
                label="Back"
                title="Send Android Hardware Back Key (KEYCODE_BACK)"
                onClick={() => void dispatchControl({ action: "keyevent", keyCode: "KEYCODE_BACK" }, "Sent Back Key")}
              />
              <HubBulkActionButton
                tone="neutral"
                icon={<Circle size={compactIconSize(11)} aria-hidden />}
                label="Home"
                title="Send Android Hardware Home Key (KEYCODE_HOME)"
                onClick={() => void dispatchControl({ action: "keyevent", keyCode: "KEYCODE_HOME" }, "Sent Home Key")}
              />
              <HubBulkActionButton
                tone="neutral"
                icon={<Layers size={icon12} aria-hidden />}
                label="Recents"
                title="Open Android Recent Apps Switcher (KEYCODE_APP_SWITCH)"
                onClick={() =>
                  void dispatchControl({ action: "keyevent", keyCode: "KEYCODE_APP_SWITCH" }, "Opened Recents")
                }
              />
              <HubBulkActionButton
                tone="indigo"
                icon={<HubBrandIcon brandId="facebook" size={12} />}
                label="Open FB"
                title="Launch Facebook on Foreground User"
                onClick={() =>
                  void dispatchControl(
                    {
                      action: "launch-app",
                      packageName: "com.facebook.katana",
                      userId: liveState?.currentUserId ?? 0,
                    },
                    "Launched Facebook on Foreground User",
                  )
                }
              />
              <HubBulkActionButton
                tone="sky"
                icon={<MessageCircle size={icon12} aria-hidden />}
                label="Messenger"
                title="Launch Messenger on Foreground User"
                onClick={() =>
                  void dispatchControl(
                    {
                      action: "launch-app",
                      packageName: "com.facebook.orca",
                      userId: liveState?.currentUserId ?? 0,
                    },
                    "Launched Messenger on Foreground User",
                  )
                }
              />
            </div>
          </div>

          {/* Batch Selection Action Bar (ok 1: HubBulkActionButton SSOT when >=1 card selected) */}
          {selectedCardIds.size > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-400/40 bg-sky-950/30 px-2.5 py-1.5 text-xs text-sky-100">
              <div className="flex items-center gap-2">
                <CheckSquare size={compactIconSize(13)} className="shrink-0 text-sky-300" aria-hidden />
                <span>
                  <span className="tabular-nums text-white">{selectedCardIds.size}</span> screen(s) selected — Taps &amp; Swipes on any selected screen broadcast across the selection
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedCards.some((c) => c.kind === "profile") ? (
                  <>
                    <HubBulkActionButton
                      tone="emerald"
                      icon={<Laptop size={icon12} aria-hidden />}
                      label="Launch PC Selected"
                      selectedCount={selectedCards.filter((c) => c.kind === "profile").length}
                      disabled={Boolean(actionBusy)}
                      title="Launch selected Android profiles in PC Emulation Browser mode (independent of Pixel 6a)"
                      onClick={() => void handleBatchTogglePcBrowsers("launch")}
                    />
                    <HubBulkActionButton
                      tone="rose"
                      icon={<Power size={icon12} aria-hidden />}
                      label="Stop PC Selected"
                      selectedCount={selectedCards.filter((c) => c.kind === "profile" && c.isPcRunning).length || undefined}
                      disabled={Boolean(actionBusy)}
                      title="Close selected running PC Emulation browsers"
                      onClick={() => void handleBatchTogglePcBrowsers("stop")}
                    />
                  </>
                ) : null}
                <HubBulkActionButton
                  tone="indigo"
                  icon={<HubBrandIcon brandId="facebook" size={12} />}
                  label="Open FB Selected"
                  selectedCount={selectedCardIds.size}
                  disabled={Boolean(actionBusy)}
                  title="Launch Facebook App across all selected screens/slots"
                  onClick={() => void handleBatchLaunchApp("com.facebook.katana", "Facebook")}
                />
                <HubBulkActionButton
                  tone="sky"
                  icon={<MessageCircle size={icon12} aria-hidden />}
                  label="Messenger Selected"
                  selectedCount={selectedCardIds.size}
                  disabled={Boolean(actionBusy)}
                  title="Launch Messenger across all selected screens/slots"
                  onClick={() => void handleBatchLaunchApp("com.facebook.orca", "Messenger")}
                />
                <HubBulkActionButton
                  tone="emerald"
                  icon={<ArrowUp size={icon12} aria-hidden />}
                  label="Wake & Scroll Selected"
                  selectedCount={selectedCardIds.size}
                  disabled={Boolean(actionBusy)}
                  title="Wake displays and perform Antidetect feed scroll across all selected screens"
                  onClick={() => void handleBatchWakeAndScroll()}
                />
                <HubBulkActionButton
                  tone="rose"
                  icon={<Power size={icon12} aria-hidden />}
                  label="Stop Users Selected"
                  selectedCount={selectedCards.filter((c) => c.userId >= 10).length || undefined}
                  disabled={Boolean(actionBusy)}
                  title="Stop selected background secondary Android users (U10..U21) to free RAM"
                  onClick={() => void handleBatchStopUsers()}
                />
                <HubBulkActionButton
                  variant="ghost"
                  tone="neutral"
                  icon={<XCircle size={icon12} aria-hidden />}
                  label="Clear"
                  title="Clear selection"
                  onClick={() => setSelectedCardIds(new Set())}
                />
              </div>
            </div>
          ) : null}

          {/* Real-Time Independent Mode Status Banner */}
          {engineMode === "pc_emulation" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-950/25 px-3 py-1.5 text-xs text-emerald-100">
              <div className="flex items-center gap-2">
                <Laptop size={compactIconSize(14)} className="shrink-0 text-emerald-300" aria-hidden />
                <span>
                  <span className="text-emerald-300">PC Android 14 Emulation Mode (Independent):</span>{" "}
                  <span className="tabular-nums text-white">{profiles.length || 52}</span> hardware fingerprints ready on PC ·{" "}
                  <span className="tabular-nums text-emerald-200">{pcRunningCount} running</span>. Click any card or{" "}
                  <span className="text-white">&ldquo;Launch PC&rdquo;</span> to open independently without Physical Pixel 6a ADB.
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="rounded border border-emerald-400/35 bg-black/40 px-2 py-0.5 text-emerald-300 tabular-nums">
                  💻 PC Emulation: ONLINE ({pcRunningCount}/{profiles.length || 52})
                </span>
                <button
                  type="button"
                  onClick={() => setEngineMode("pixel6a_hardware")}
                  className={`rounded border px-2 py-0.5 tabular-nums transition ${
                    adbOnline
                      ? "border-emerald-400/35 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/50"
                      : "border-amber-400/35 bg-amber-950/40 text-amber-200 hover:bg-amber-900/50"
                  }`}
                  title="Switch to Physical Pixel 6a Hardware Mode"
                >
                  📱 Pixel 6a Hardware: {adbOnline ? "ONLINE" : `ADB STANDBY (${batLevel}% Wi-Fi)`}
                </button>
              </div>
            </div>
          ) : liveState && !adbOnline ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400/40 bg-amber-950/35 px-3 py-1.5 text-xs text-amber-100">
              <div className="flex items-center gap-2">
                <WifiOff size={compactIconSize(14)} className="shrink-0 text-amber-300" aria-hidden />
                <span>
                  Physical Pixel 6a (<span className="tabular-nums text-white">{liveState.serial || "192.168.0.208:42011"}</span>) is currently disconnected from ADB (last seen at{" "}
                  <span className="tabular-nums text-amber-200">{batLevel}% battery</span>). Plug USB-C charger or wake Wireless Debugging, or switch to independent PC Emulation.
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <HubBulkActionButton
                  tone="sky"
                  icon={<Laptop size={icon12} aria-hidden />}
                  label={`Use PC Emulation (${profiles.length || 52})`}
                  title="Switch to 100% independent PC Android 14 Emulation mode"
                  onClick={() => setEngineMode("pc_emulation")}
                />
                <HubBulkActionButton
                  tone="emerald"
                  icon={<Wifi size={icon12} aria-hidden />}
                  iconSpinning={actionBusy === "wifi-adb"}
                  label={actionBusy === "wifi-adb" ? "Scanning LAN…" : "Reconnect Wi-Fi / USB"}
                  title="Scan LAN for Wireless Debugging or USB ADB"
                  disabled={Boolean(actionBusy)}
                  onClick={() => void handleReconnectWifiAdb()}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-500/25 bg-emerald-950/20 px-2.5 py-1 text-xs text-emerald-100">
              <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                <ShieldCheck size={13} className="shrink-0 text-emerald-400" aria-hidden />
                <span className="shrink-0 text-emerald-300">Live Antidetect Stream:</span>
                {recentEvents.length > 0 ? (
                  <div className="flex items-center gap-2 truncate text-white/90">
                    {recentEvents.slice(0, 3).map((ev) => (
                      <span
                        key={ev.id}
                        className="inline-flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-sky-200 border border-white/10"
                      >
                        <span className="text-emerald-300">D{ev.displayId}</span>
                        <span>·</span>
                        <span className="truncate max-w-[240px]">{ev.label}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="truncate text-hub-muted">
                    Click or drag on any live screen to Tap / Swipe, or click &ldquo;4x Virtual Pool&rdquo; + &ldquo;Auto Patrol&rdquo; for concurrent behavior.
                  </span>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 tabular-nums text-[10px]">
                {liveState?.hardwareHealth?.ok ? (
                  <>
                    <span
                      className="rounded border border-emerald-400/30 bg-black/40 px-1.5 py-0.5 text-emerald-300"
                      title="Available RAM on Pixel 6a"
                    >
                      RAM {((liveState.hardwareHealth.ramAvailableMb || 0) / 1024).toFixed(2)}GB free
                    </span>
                    <span
                      className="rounded border border-sky-400/30 bg-black/40 px-1.5 py-0.5 text-sky-300"
                      title="Available ZRAM Swap on Pixel 6a"
                    >
                      Swap {((liveState.hardwareHealth.swapFreeMb || 0) / 1024).toFixed(2)}GB free
                    </span>
                    <span
                      className="rounded border border-white/15 bg-black/40 px-1.5 py-0.5 text-white/90"
                      title="Battery Level, Temperature & Never-Power-Off Hardware Charge Band (80-85%)"
                    >
                      🔋 {liveState.hardwareHealth.batteryLevel ?? batLevel}% ·{" "}
                      {typeof liveState.hardwareHealth.batteryTempC === "number"
                        ? `${liveState.hardwareHealth.batteryTempC.toFixed(1)}°C `
                        : ""}
                      ({liveState.hardwareHealth.chargeStartLevel ?? 80}–{liveState.hardwareHealth.chargeStopLevel ?? 85}%)
                    </span>
                    <span
                      className="rounded border border-white/15 bg-black/40 px-1.5 py-0.5 text-emerald-200"
                      title="Running Android Users & Physical Display 0 State"
                    >
                      U:{liveState.hardwareHealth.runningUserCount ?? 1}/{liveState.hardwareHealth.totalUserCount ?? 10} · D0{" "}
                      {liveState.hardwareHealth.display0Off !== false ? "OFF" : "ON"}
                    </span>
                  </>
                ) : null}
                <span className="text-emerald-300">
                  {adbOnline
                    ? `Eco 850Kbps · 20fps H.264 + ${(1000 / refreshIntervalMs).toFixed(1)}fps`
                    : "Standby"}
                </span>
              </div>
            </div>
          )}

          {/* Multi-Screen Phone Wall Grid */}
          <div ref={farmGridScrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
            {farmWallVirtualized && farmPaddingTop > 0 ? (
              <div aria-hidden style={{ height: `${farmPaddingTop}px` }} />
            ) : null}
            <div
              className="grid gap-2.5"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
              }}
            >
              {visibleFarmCards.map((card) => {
                const isSelected = selectedCardIds.has(card.id);
                const localGesture = lastGestureByCard[card.id];
                const activeTouch: FarmTouchVector | null =
                  localGesture && localGesture.type === "tap" && Date.now() - localGesture.ts < 600
                    ? localGesture
                    : null;

                const badgeClass =
                  card.badgeTone === "emerald"
                    ? "bg-emerald-600/90 text-white"
                    : card.badgeTone === "sky"
                      ? "bg-sky-600/90 text-white"
                      : card.badgeTone === "violet"
                        ? "bg-violet-600/90 text-white"
                        : "bg-rose-600/85 text-white";

                return (
                  <div
                    key={card.id}
                    style={
                      card.isLiveForeground
                        ? undefined
                        : { contentVisibility: "auto", containIntrinsicSize: "220px 420px" }
                    }
                    className={`group relative flex flex-col overflow-hidden rounded-xl border transition shadow-md ${
                      card.isLiveForeground
                        ? "border-emerald-400/70 ring-1 ring-emerald-400/30 bg-[#0b1526]"
                        : isSelected
                          ? "border-sky-400/70 bg-[#0b1526]"
                          : "border-white/15 bg-[#09111f] hover:border-white/30"
                    }`}
                  >
                    {/* Top Phone Status Strip (HubDirectoryCardCheckbox SSOT + TCP badge + Identity + Status) */}
                    <div className="flex items-center justify-between gap-1 bg-black/75 px-2 py-1 text-[10px]">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <HubDirectoryCardCheckbox
                          checked={isSelected}
                          label={`Select screen ${card.titleCode}`}
                          onChange={() => toggleSelectCard(card.id)}
                          corner={false}
                          className="!pt-0"
                        />
                        <span className={`shrink-0 rounded px-1.5 py-0.2 text-[9px] tracking-wide ${badgeClass}`}>
                          {card.badgeTopLeft}
                        </span>
                        <span className="truncate text-[10px] text-white tabular-nums">
                          #{card.titleCode}
                        </span>
                        <span className="hub-analytics-caption truncate text-sky-200/85">
                          {card.modelLabel}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 text-hub-muted tabular-nums">
                        {card.isLiveForeground ? (
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>LIVE</span>
                          </span>
                        ) : card.isRunning ? (
                          <span className="text-violet-300">RUNNING</span>
                        ) : (
                          <span>IDLE</span>
                        )}
                      </div>
                    </div>

                    {/* Portrait Phone Screen Viewport (9:17.5 aspect ratio — 100% unobstructed when live) */}
                    <div
                      className="relative flex w-full flex-col justify-between overflow-hidden select-none"
                      style={{
                        aspectRatio: "9 / 17.5",
                        background:
                          "linear-gradient(135deg, #0c4a6e 0%, #0284c7 35%, #38bdf8 65%, #0369a1 100%)",
                      }}
                    >
                      {/* If Live Stream or Screenshot exists, render live interactive 24fps H.264 + Tap/Drag-Swipe stream */}
                      {card.screenDataUrl || (adbOnline && card.isLiveForeground) ? (
                        <button
                          type="button"
                          onPointerDown={(e) => handleScreenPointerDown(card, e)}
                          onPointerUp={(e) => handleScreenPointerUp(card, e)}
                          onDoubleClick={() => setTheaterCardId(card.id)}
                          className="relative h-full w-full border-0 bg-black p-0 cursor-pointer focus:outline-none touch-none"
                          title={`Click directly on screen to Tap, Drag to Scroll/Swipe, or Double-Click for Focus Theater Mode on #${card.titleCode} (${card.modelLabel})`}
                        >
                          <H264PhoneStreamCanvas
                            displayId={card.displayId}
                            enabled={autoStream && adbOnline && card.isLiveForeground}
                            fallbackImgUrl={card.screenDataUrl}
                          />

                          {/* Subtle Tap Ripple Only on Direct User Click */}
                          {activeTouch ? (
                            <svg
                              viewBox={`0 0 ${card.coordWidth} ${card.coordHeight}`}
                              className="pointer-events-none absolute inset-0 h-full w-full"
                            >
                              <circle
                                cx={activeTouch.x}
                                cy={activeTouch.y}
                                r="36"
                                fill="rgba(16, 185, 129, 0.22)"
                                stroke="#34d399"
                                strokeWidth="5"
                              />
                            </svg>
                          ) : null}
                        </button>
                      ) : (
                        /* Android 14 Antidetect Homescreen Wallpaper (HubBrandIcon + Lucide SSOT dock) */
                        <div
                          onClick={() => void handleActivateCard(card)}
                          className="relative flex h-full w-full flex-col justify-between p-2.5 cursor-pointer"
                          title={`Click to switch/mount ${card.titleCode} (${card.modelLabel}) onto live screen`}
                        >
                          {/* Decorative diagonal light stripes like Image 2 */}
                          <div
                            className="pointer-events-none absolute inset-0 opacity-25"
                            style={{
                              backgroundImage:
                                "repeating-linear-gradient(-35deg, rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.35) 26px, transparent 26px, transparent 56px)",
                            }}
                          />

                          {/* Top Center Identity Header: Big Code + Model + IP/Endpoint */}
                          <div className="relative z-10 flex flex-col items-center pt-2 text-center drop-shadow">
                            <div className="text-xl tracking-tight text-white tabular-nums">
                              {card.titleCode}
                            </div>
                            <div className="hub-analytics-caption mt-0.5 max-w-full truncate text-white/95">
                              {card.modelLabel}
                            </div>
                            <div className="mt-0.5 max-w-full truncate text-[9px] text-white/80 tabular-nums">
                              {card.endpointLabel}
                            </div>
                            {card.fbAccountLabel ? (
                              <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-300/40 bg-indigo-950/75 px-2 py-0.5 text-[9px] text-indigo-100 shadow backdrop-blur-sm">
                                <HubBrandIcon brandId="facebook" size={10} />
                                <span className="truncate tabular-nums">{card.fbAccountLabel}</span>
                              </div>
                            ) : null}
                            <div className="mt-1 rounded-full bg-black/35 px-2 py-0.5 text-[9px] text-emerald-200 backdrop-blur-sm">
                              {card.subMetaLabel}
                            </div>
                          </div>

                          {/* Center Quick Stream CTA on Hover */}
                          <div className="relative z-10 my-auto flex flex-col items-center justify-center opacity-85 group-hover:opacity-100 transition">
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/55 px-2.5 py-1 text-[10px] text-white shadow backdrop-blur-sm">
                              {card.kind === "profile" ? (
                                <Laptop size={compactIconSize(10)} className="text-emerald-400" aria-hidden />
                              ) : (
                                <Play size={compactIconSize(10)} className="text-emerald-400" aria-hidden />
                              )}
                              <span>
                                {card.kind === "user_slot"
                                  ? `Switch U${card.userId}`
                                  : card.kind === "profile"
                                    ? card.isPcRunning
                                      ? "Stop PC"
                                      : "Launch PC"
                                    : "Mount Live"}
                              </span>
                            </span>
                          </div>

                          {/* Bottom Android Homescreen Dock + Google Search Pill (SSOT Icons) */}
                          <div className="relative z-10 flex flex-col gap-1.5">
                            <div className="flex items-center justify-around px-1">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/90 text-white shadow">
                                <Phone size={compactIconSize(11)} aria-hidden />
                              </span>
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/95 shadow">
                                <HubBrandIcon brandId="youtube" size={12} />
                              </span>
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600/95 text-white shadow">
                                <HubBrandIcon brandId="facebook" size={12} />
                              </span>
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/90 text-white shadow">
                                <Globe size={compactIconSize(11)} aria-hidden />
                              </span>
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800/90 text-white shadow">
                                <Camera size={compactIconSize(11)} aria-hidden />
                              </span>
                            </div>
                            <div className="flex h-5 items-center justify-between rounded-full bg-slate-900/80 px-2.5 text-[10px] text-white/80 backdrop-blur-sm">
                              <HubBrandIcon brandId="google" size={11} />
                              <span className="text-[9px] text-white/50">Search</span>
                              <Mic size={compactIconSize(10)} className="text-sky-300" aria-hidden />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Mini Control Bar per Phone Card (SSOT Icons & Brand Marks) */}
                    <div className="flex items-center justify-between gap-1 border-t border-white/10 bg-black/75 px-1.5 py-1 text-[10px]">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleActivateCard(card)}
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                            card.kind === "profile" && card.isPcRunning
                              ? "border-rose-400/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30"
                              : "border-emerald-500/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                          }`}
                          title={
                            card.kind === "user_slot"
                              ? `Switch phone foreground to User ${card.userId}`
                              : card.kind === "profile"
                                ? card.isPcRunning
                                  ? `Stop PC Browser #${card.code}`
                                  : `Launch PC Android Emulation Browser #${card.code} (Independent of Pixel 6a)`
                                : `Mount Profile #${card.code}`
                          }
                        >
                          {card.kind === "profile" ? (
                            <Laptop size={compactIconSize(10)} className={card.isPcRunning ? "text-rose-300" : "text-emerald-300"} aria-hidden />
                          ) : (
                            <Play size={compactIconSize(10)} className="text-emerald-300" aria-hidden />
                          )}
                          <span>
                            {card.isLiveForeground
                              ? "Active"
                              : card.kind === "user_slot"
                                ? `U${card.userId}`
                                : card.kind === "profile"
                                  ? card.isPcRunning
                                    ? "Stop PC"
                                    : "Launch PC"
                                  : "Mount"}
                          </span>
                        </button>
                        {card.kind === "profile" && engineMode !== "pc_emulation" ? (
                          <button
                            type="button"
                            onClick={() => void handleMountOnPhone(card)}
                            className="inline-flex items-center gap-0.5 rounded border border-sky-400/35 bg-sky-500/15 px-1 py-0.5 text-[9px] text-sky-100 hover:bg-sky-500/25 transition-colors"
                            title={`Mount #${card.code} onto Physical Pixel 6a via ADB`}
                          >
                            <Smartphone size={compactIconSize(9)} aria-hidden />
                            <span>ADB</span>
                          </button>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            void dispatchControl(
                              {
                                action: "launch-app",
                                userId: card.userId,
                                displayId: card.displayId,
                                packageName: "com.facebook.katana",
                                profileCode: card.code,
                              },
                              `Launched FB on #${card.titleCode}`,
                            )
                          }
                          className="inline-flex items-center gap-1 rounded border border-indigo-400/35 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-100 hover:bg-indigo-500/25 transition-colors"
                          title="Launch Facebook App in this isolated slot/display"
                        >
                          <HubBrandIcon brandId="facebook" size={10} />
                          <span>FB</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void dispatchControl(
                              {
                                action: "launch-app",
                                userId: card.userId,
                                displayId: card.displayId,
                                packageName: "com.android.chrome",
                                profileCode: card.code,
                              },
                              `Launched Chrome on #${card.titleCode}`,
                            )
                          }
                          className="inline-flex items-center gap-1 rounded border border-amber-400/35 bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-100 hover:bg-amber-500/25 transition-colors"
                          title="Launch Chrome Browser on this screen"
                        >
                          <Globe size={compactIconSize(10)} aria-hidden />
                          <span>Web</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void dispatchControl(
                              {
                                action: "launch-app",
                                userId: card.userId,
                                displayId: card.displayId,
                                packageName: "com.netflix.mediaclient",
                                profileCode: card.code,
                              },
                              `Launched Netflix on #${card.titleCode}`,
                            )
                          }
                          className="inline-flex items-center gap-1 rounded border border-rose-400/35 bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-100 hover:bg-rose-500/25 transition-colors"
                          title="Launch Netflix App on this screen"
                        >
                          <HubBrandIcon brandId="netflix" size={10} />
                          <span>NF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopyCardScreenshot(card)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded border border-indigo-400/35 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25 transition-colors"
                          title="Copy PNG Screenshot of this screen to PC Clipboard"
                          aria-label="Copy PNG Screenshot"
                        >
                          <Camera size={compactIconSize(11)} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTheaterCardId(card.id)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-500/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 transition-colors"
                          title="Open Focus / Theater Mode (Large H.264 Stream + Direct PC Keyboard Input)"
                          aria-label="Open Focus Theater Mode"
                        >
                          <Maximize2 size={compactIconSize(11)} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void dispatchControl(
                              { action: "open-scrcpy", displayId: card.displayId },
                              `Opened 60fps Scrcpy for #${card.titleCode}`,
                            )
                          }
                          className="inline-flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-[var(--panel-2)] text-[var(--text)] hover:bg-white/10 transition-colors"
                          title="Pop out native 60fps Scrcpy window"
                          aria-label="Open Scrcpy 60fps window"
                        >
                          <ExternalLink size={compactIconSize(11)} aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {farmWallVirtualized && farmPaddingBottom > 0 ? (
              <div aria-hidden style={{ height: `${farmPaddingBottom}px` }} />
            ) : null}
          </div>
        </section>
      </div>

      {/* Proposal 1 (ok 1): Focus / Theater Control Modal (Hub-UI SSOT Buttons, Icons & Close Control) */}
      {theaterCard ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTheaterCardId(null);
          }}
        >
          <div className="relative flex max-h-[92vh] w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-emerald-400/40 bg-[#07101e] shadow-2xl md:flex-row">
            {/* Left Column: Large Interactive Portrait H.264 Viewport */}
            <div className="relative flex flex-col items-center justify-center bg-black/90 p-3 md:w-[390px] shrink-0 border-b md:border-b-0 md:border-r border-white/10">
              <div className="mb-2 flex w-full items-center justify-between px-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300 border border-emerald-400/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>FOCUS · D{theaterCard.displayId}</span>
                  </span>
                  <span className="text-white tabular-nums">{theaterCard.titleCode}</span>
                </div>
                <span className="text-xs text-sky-300 tabular-nums">
                  {theaterCard.coordWidth}×{theaterCard.coordHeight} · HQ 2.6Mbps · 30fps H.264
                </span>
              </div>

              <div
                className="relative overflow-hidden rounded-xl border border-white/20 bg-black shadow-lg"
                style={{
                  height: "min(76vh, 660px)",
                  aspectRatio: "9 / 19.5",
                }}
              >
                <button
                  type="button"
                  onPointerDown={(e) => handleScreenPointerDown(theaterCard, e)}
                  onPointerUp={(e) => handleScreenPointerUp(theaterCard, e)}
                  className="relative h-full w-full border-0 bg-black p-0 cursor-crosshair focus:outline-none touch-none"
                  title="Click to Tap or Drag to Swipe directly on live screen"
                >
                  <H264PhoneStreamCanvas
                    displayId={theaterCard.displayId}
                    enabled={adbOnline}
                    fallbackImgUrl={theaterCard.screenDataUrl}
                  />
                  {(() => {
                    const lGest = lastGestureByCard[theaterCard.id];
                    const tTouch: FarmTouchVector | null =
                      lGest && lGest.type === "tap" && Date.now() - lGest.ts < 600
                        ? lGest
                        : null;
                    if (!tTouch) return null;
                    return (
                      <svg
                        viewBox={`0 0 ${theaterCard.coordWidth} ${theaterCard.coordHeight}`}
                        className="pointer-events-none absolute inset-0 h-full w-full"
                      >
                        <circle
                          cx={tTouch.x}
                          cy={tTouch.y}
                          r="36"
                          fill="rgba(16, 185, 129, 0.22)"
                          stroke="#34d399"
                          strokeWidth="5"
                        />
                      </svg>
                    );
                  })()}
                </button>
              </div>
            </div>

            {/* Right Column: Direct PC Keyboard Input, Clipboard, Hardware Keys & Contextual App Launcher */}
            <div className="flex flex-1 flex-col justify-between gap-3 overflow-y-auto p-4 text-xs">
              <div className="flex flex-col gap-3">
                {/* Header & HubModalCloseButton SSOT */}
                <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base text-white">{theaterCard.titleCode}</span>
                      <span className="rounded bg-sky-500/20 px-2 py-0.5 text-xs text-sky-200 border border-sky-400/30">
                        {theaterCard.modelLabel}
                      </span>
                      {theaterCard.fbAccountLabel ? (
                        <span className="inline-flex items-center gap-1 rounded bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200 border border-indigo-400/35 tabular-nums">
                          <HubBrandIcon brandId="facebook" size={11} />
                          <span>{theaterCard.fbAccountLabel}</span>
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-hub-muted tabular-nums">
                      {theaterCard.endpointLabel} · {theaterCard.subMetaLabel}
                    </div>
                  </div>
                  <HubModalCloseButton
                    onClose={() => setTheaterCardId(null)}
                    aria-label="Close Focus Modal (Esc)"
                  />
                </div>

                {/* Direct PC Keyboard & Clipboard Input Box */}
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-950/15 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-emerald-200">PC Keyboard &amp; Clipboard Bridge</span>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-emerald-300">
                      <input
                        type="checkbox"
                        checked={directKeyCapture}
                        onChange={(e) => setDirectKeyCapture(e.target.checked)}
                        className="hub-checkbox"
                      />
                      <span>Direct Keystrokes (Type anywhere + Ctrl+V)</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={theaterText}
                      onChange={(e) => setTheaterText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && theaterText.trim()) {
                          e.preventDefault();
                          const val = theaterText;
                          setTheaterText("");
                          void dispatchControl(
                            {
                              action: "text",
                              displayId: theaterCard.displayId,
                              userId: theaterCard.userId,
                              profileCode: theaterCard.code,
                              text: val,
                            },
                            `Sent text to #${theaterCard.titleCode}`,
                          );
                        }
                      }}
                      placeholder="Type text / password / 2FA and press Enter..."
                      className="h-[var(--hub-control-h)] flex-1 rounded-lg border border-white/15 bg-black/50 px-2.5 text-xs text-white placeholder:text-hub-muted focus:border-emerald-400 focus:outline-none"
                    />
                    <HubBulkActionButton
                      tone="emerald"
                      icon={<Send size={icon12} aria-hidden />}
                      label="Send"
                      title="Send typed text to Android display"
                      disabled={!theaterText.trim()}
                      onClick={() => {
                        if (!theaterText.trim()) return;
                        const val = theaterText;
                        setTheaterText("");
                        void dispatchControl(
                          {
                            action: "text",
                            displayId: theaterCard.displayId,
                            userId: theaterCard.userId,
                            profileCode: theaterCard.code,
                            text: val,
                          },
                          `Sent text to #${theaterCard.titleCode}`,
                        );
                      }}
                    />
                    <HubBulkActionButton
                      tone="sky"
                      icon={<ClipboardPaste size={icon12} aria-hidden />}
                      label="Paste Clipboard"
                      title="Paste PC Clipboard directly into phone input field"
                      onClick={() => {
                        void navigator.clipboard
                          ?.readText()
                          .then((clip) => {
                            if (!clip || !clip.trim()) {
                              pushToast("PC Clipboard is empty", "info");
                              return;
                            }
                            void dispatchControl(
                              {
                                action: "text",
                                displayId: theaterCard.displayId,
                                userId: theaterCard.userId,
                                profileCode: theaterCard.code,
                                text: clip.trim(),
                              },
                              `Pasted ${clip.trim().length} chars to #${theaterCard.titleCode}`,
                            );
                          })
                          .catch(() => pushToast("Unable to read clipboard", "error"));
                      }}
                    />
                    <HubBulkActionButton
                      tone="indigo"
                      icon={<Camera size={icon12} aria-hidden />}
                      label="Copy Screenshot"
                      title="Copy current live H.264 frame as PNG to PC Clipboard"
                      onClick={() => void handleCopyCardScreenshot(theaterCard)}
                    />
                  </div>
                </div>

                {/* Hardware Navigation, Scroll & Key Controls (HubBulkActionButton SSOT) */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 text-xs uppercase tracking-wider text-hub-muted">
                    Hardware Navigation &amp; Gestures (Display #{theaterCard.displayId})
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <HubBulkActionButton
                      tone="neutral"
                      icon={<ArrowLeft size={icon12} aria-hidden />}
                      label="Back"
                      title="Send Back key (KEYCODE_BACK)"
                      onClick={() =>
                        void dispatchControl({
                          action: "keyevent",
                          displayId: theaterCard.displayId,
                          keyCode: "4",
                        })
                      }
                      className="w-full justify-center"
                    />
                    <HubBulkActionButton
                      tone="neutral"
                      icon={<Circle size={compactIconSize(11)} aria-hidden />}
                      label="Home"
                      title="Send Home key (KEYCODE_HOME)"
                      onClick={() =>
                        void dispatchControl({
                          action: "keyevent",
                          displayId: theaterCard.displayId,
                          keyCode: "3",
                        })
                      }
                      className="w-full justify-center"
                    />
                    <HubBulkActionButton
                      tone="neutral"
                      icon={<Layers size={icon12} aria-hidden />}
                      label="Recents"
                      title="Open Recent Apps (KEYCODE_APP_SWITCH)"
                      onClick={() =>
                        void dispatchControl({
                          action: "keyevent",
                          displayId: theaterCard.displayId,
                          keyCode: "187",
                        })
                      }
                      className="w-full justify-center"
                    />
                    <HubBulkActionButton
                      tone="amber"
                      icon={<Sun size={icon12} aria-hidden />}
                      label="Wake"
                      title="Wake display (KEYCODE_WAKEUP)"
                      onClick={() =>
                        void dispatchControl(
                          {
                            action: "keyevent",
                            displayId: theaterCard.displayId,
                            keyCode: "224",
                          },
                          `Woke Display #${theaterCard.displayId}`,
                        )
                      }
                      className="w-full justify-center"
                    />
                    <HubBulkActionButton
                      tone="emerald"
                      icon={<ArrowUp size={icon12} aria-hidden />}
                      label="Scroll Feed"
                      title="Swipe up to scroll feed down"
                      onClick={() =>
                        void dispatchControl({
                          action: "swipe",
                          displayId: theaterCard.displayId,
                          x: Math.round(theaterCard.coordWidth * 0.5),
                          y: Math.round(theaterCard.coordHeight * 0.75),
                          x2: Math.round(theaterCard.coordWidth * 0.5),
                          y2: Math.round(theaterCard.coordHeight * 0.25),
                          durationMs: 320,
                        })
                      }
                      className="w-full justify-center"
                    />
                    <HubBulkActionButton
                      tone="sky"
                      icon={<ArrowDown size={icon12} aria-hidden />}
                      label="Scroll Up"
                      title="Swipe down to scroll feed up"
                      onClick={() =>
                        void dispatchControl({
                          action: "swipe",
                          displayId: theaterCard.displayId,
                          x: Math.round(theaterCard.coordWidth * 0.5),
                          y: Math.round(theaterCard.coordHeight * 0.25),
                          x2: Math.round(theaterCard.coordWidth * 0.5),
                          y2: Math.round(theaterCard.coordHeight * 0.75),
                          durationMs: 320,
                        })
                      }
                      className="w-full justify-center"
                    />
                    <HubBulkActionButton
                      tone="neutral"
                      icon={<Delete size={icon12} aria-hidden />}
                      label="Backspace"
                      title="Send Backspace key (KEYCODE_DEL)"
                      onClick={() =>
                        void dispatchControl({
                          action: "keyevent",
                          displayId: theaterCard.displayId,
                          keyCode: "67",
                        })
                      }
                      className="w-full justify-center"
                    />
                    <HubBulkActionButton
                      tone="neutral"
                      icon={<CornerDownLeft size={icon12} aria-hidden />}
                      label="Enter"
                      title="Send Enter key (KEYCODE_ENTER)"
                      onClick={() =>
                        void dispatchControl({
                          action: "keyevent",
                          displayId: theaterCard.displayId,
                          keyCode: "66",
                        })
                      }
                      className="w-full justify-center"
                    />
                  </div>
                </div>

                {/* Contextual App Launcher (HubBulkActionButton + HubBrandIcon SSOT) */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 text-xs uppercase tracking-wider text-hub-muted">
                    Launch App on Display #{theaterCard.displayId} (U{theaterCard.userId})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        {
                          label: "Facebook",
                          pkg: "com.facebook.katana",
                          tone: "indigo" as const,
                          icon: <HubBrandIcon brandId="facebook" size={12} />,
                        },
                        {
                          label: "FB Lite",
                          pkg: "com.facebook.lite",
                          tone: "sky" as const,
                          icon: <HubBrandIcon brandId="facebook" size={12} />,
                        },
                        {
                          label: "Messenger",
                          pkg: "com.facebook.orca",
                          tone: "indigo" as const,
                          icon: <MessageCircle size={icon12} aria-hidden />,
                        },
                        {
                          label: "YouTube",
                          pkg: "com.google.android.youtube",
                          tone: "rose" as const,
                          icon: <HubBrandIcon brandId="youtube" size={12} />,
                        },
                        {
                          label: "Chrome",
                          pkg: "com.android.chrome",
                          tone: "emerald" as const,
                          icon: <Globe size={icon12} aria-hidden />,
                        },
                        {
                          label: "Play Store",
                          pkg: "com.android.vending",
                          tone: "sky" as const,
                          icon: <Zap size={icon12} aria-hidden />,
                        },
                        {
                          label: "Settings",
                          pkg: "com.android.settings",
                          tone: "neutral" as const,
                          icon: <Settings2 size={icon12} aria-hidden />,
                        },
                      ]
                    ).map((app) => (
                      <HubBulkActionButton
                        key={app.pkg}
                        tone={app.tone}
                        icon={app.icon}
                        label={app.label}
                        title={`Launch ${app.label} on Display #${theaterCard.displayId} (U${theaterCard.userId})`}
                        onClick={() =>
                          void dispatchControl(
                            {
                              action: "launch-app",
                              userId: theaterCard.userId,
                              displayId: theaterCard.displayId,
                              packageName: app.pkg,
                              profileCode: theaterCard.code,
                            },
                            `Launched ${app.label} on D${theaterCard.displayId}`,
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer Actions (HubBulkActionButton SSOT) */}
              <div className="flex items-center justify-between border-t border-white/10 pt-2.5">
                <HubBulkActionButton
                  tone="emerald"
                  icon={<Play size={icon12} aria-hidden />}
                  label={
                    theaterCard.kind === "user_slot"
                      ? `Switch Foreground to User U${theaterCard.userId}`
                      : `Mount Profile #${theaterCard.code}`
                  }
                  title="Activate or mount this profile/user slot onto the phone foreground"
                  onClick={() => void handleActivateCard(theaterCard)}
                />
                <HubBulkActionButton
                  tone="neutral"
                  icon={<ExternalLink size={icon12} aria-hidden />}
                  label="Pop Out Native 60fps Window (scrcpy)"
                  title="Open native 60fps Scrcpy window for this display"
                  onClick={() =>
                    void dispatchControl(
                      { action: "open-scrcpy", displayId: theaterCard.displayId },
                      `Opened 60fps Scrcpy for D${theaterCard.displayId}`,
                    )
                  }
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
