import { memo, useEffect, useRef, useState } from "react";
import type {
  AndroidDisplayInfo,
  AndroidLiveScreenState,
  AndroidMultiUserSlot,
} from "../../features/android/AndroidLiveFarmRail";

export type MobileDeviceTelemetry = {
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

export type FarmTouchVector = {
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

export type ExtendedDisplayInfo = AndroidDisplayInfo & {
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

export type ExtendedLiveScreenState = Omit<AndroidLiveScreenState, "displays"> & {
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

export type FarmEngineMode = "pc_emulation" | "pixel6a_hardware" | "unified";
export type FarmFilterConnection = "all" | "displays" | "users" | "wifi" | "mounted";
export type FarmGroupFilter = "all" | "running" | "fb_ready" | "google" | "samsung";

export type FarmPhoneCardItem = {
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

export async function fetchFarmApi(path: string, init?: RequestInit) {
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

export function hasLiveMirrorFrame(displayId: number): boolean {
  return Boolean(_muxDecodersByDisplay.get(displayId)?.hasMirrorFrame);
}

export function getMirrorCanvasForDisplay(displayId: number): HTMLCanvasElement | null {
  const entry = _muxDecodersByDisplay.get(displayId);
  if (
    entry &&
    entry.hasMirrorFrame &&
    entry.mirrorCanvas.width > 0 &&
    entry.mirrorCanvas.height > 0
  ) {
    return entry.mirrorCanvas;
  }
  return null;
}

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

export function isNonBlackScreenUrl(url: string | null | undefined): boolean {
  return Boolean(url && url.length >= 7800);
}

export const H264PhoneStreamCanvas = memo(function H264PhoneStreamCanvas({
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

export const FARM_PREFS_STORAGE_KEY = "p0003:mobile-farm-prefs:v1";

export type FarmUiPrefs = {
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

export function readFarmUiPrefs(): FarmUiPrefs {
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
