import { memo, type PointerEvent } from "react";
import {
  BatteryCharging,
  Camera,
  Copy,
  Cpu,
  Eye,
  Home,
  Maximize2,
  PlugZap,
  RotateCw,
  Smartphone,
  Wifi,
  WifiOff,
} from "lucide-react";
import { resolveDevicePowerBadge } from "./MobileFarmExecutionBoard";
import {
  H264PhoneStreamCanvas,
  isNonBlackScreenUrl,
  type FarmPhoneCardItem,
  type FarmTouchVector,
  type MobileFarmBoardDevice,
} from "./mobile-farm-stream";
import "./mobile-farm-wall.css";

export type PhysicalWallDevice = {
  id: string;
  shortCode: string;
  name: string;
  ip: string;
  serial: string;
  os: "android" | "ios";
  transportLabel: string;
  ok: boolean;
  isPrimaryDisplay0: boolean;
  batteryPct: number | null;
  tempC: number | null;
  ramUsedPct: number | null;
  ramFreeMb: number | null;
  proxyLabel: string;
  proxyLatencyMs: number | null;
  taskPhase: string;
  activeTaskTitle: string;
  dimModeLabel: string;
  lastOtp: string | null;
  screenDataUrl: string | null;
  boardDevice: MobileFarmBoardDevice | null;
  interactiveCard: FarmPhoneCardItem;
};

export type CarrierKaizenItem = {
  laneId: string;
  label: string;
  attempts: number;
  live: number;
  convPct: number;
  latencyMs: number | null;
  lastOutcome: string;
};

const PHASE_TONE: Record<string, string> = {
  WAVE: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  "COOLDOWN BURST": "border-sky-400/40 bg-sky-500/15 text-sky-200",
  "24/7 GATEWAY": "border-amber-400/40 bg-amber-500/15 text-amber-200",
  RUNNING: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  OFFLINE: "border-rose-400/40 bg-rose-500/15 text-rose-200",
};

export const MobileFarmFiveDeviceWall = memo(function MobileFarmFiveDeviceWall({
  devices,
  autoStream,
  selectedDeviceId,
  localGestures,
  onSelectDevice,
  onPointerDown,
  onPointerUp,
  onOpenTheater,
  onPressHome,
  onRotateProxy,
  onCopyScreen,
  onCopyOtp,
}: {
  devices: PhysicalWallDevice[];
  autoStream: boolean;
  selectedDeviceId?: string | null;
  localGestures: Record<string, (FarmTouchVector & { ts: number }) | undefined>;
  onSelectDevice?: (dev: PhysicalWallDevice) => void;
  onPointerDown: (card: FarmPhoneCardItem, e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (card: FarmPhoneCardItem, e: PointerEvent<HTMLButtonElement>) => void;
  onOpenTheater: (card: FarmPhoneCardItem) => void;
  onPressHome: (dev: PhysicalWallDevice) => void;
  onRotateProxy: (dev: PhysicalWallDevice) => void;
  onCopyScreen: (dev: PhysicalWallDevice) => void;
  onCopyOtp: (otp: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      {devices.map((dev) => {
        const isSelected = selectedDeviceId === dev.id;
        const screenClass =
          dev.os === "ios" ? "mf-wall-screen mf-wall-screen--ios" : "mf-wall-screen";
        const powerBadge = dev.boardDevice
          ? resolveDevicePowerBadge(dev.boardDevice)
          : {
              label: dev.ok ? "Online" : "Offline",
              toneClass: dev.ok
                ? "border-emerald-400/30 bg-emerald-950/35 text-emerald-200"
                : "border-rose-400/35 bg-rose-950/45 text-rose-200",
              title: dev.ok ? "Connected over Wi-Fi" : "Waiting for Wi-Fi health check",
            };
        const validImg = isNonBlackScreenUrl(dev.screenDataUrl) ? dev.screenDataUrl : null;
        const gesture = localGestures[dev.interactiveCard.id];
        const activeTouch =
          gesture && gesture.type === "tap" && Date.now() - gesture.ts < 600 ? gesture : null;

        return (
          <div
            key={dev.id}
            onClick={() => onSelectDevice?.(dev)}
            className={`mf-wall-card group flex flex-col p-2.5 ${
              isSelected ? "ring-1 ring-cyan-400/70 border-cyan-400/50" : ""
            }`}
          >
            {/* Header row: Status dot + Model + IP/Transport + OS pill */}
            <div className="mb-2 flex items-center justify-between gap-1.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`mf-wall-pulse-dot shrink-0 ${
                      dev.ok ? "bg-emerald-400 text-emerald-400" : "bg-rose-400 text-rose-400"
                    }`}
                  />
                  <span className="truncate text-xs font-semibold text-slate-100">{dev.name}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                  <span className="font-mono text-slate-300">{dev.ip}</span>
                  <span>·</span>
                  <span className="truncate">{dev.transportLabel}</span>
                </div>
              </div>
              <span
                className={`mf-wall-pill shrink-0 ${
                  dev.os === "ios"
                    ? "border-violet-400/35 text-violet-300"
                    : "border-emerald-500/35 text-emerald-300"
                }`}
              >
                {dev.os === "ios" ? "iOS" : "Android"}
              </span>
            </div>

            {/* Live Screen Canvas */}
            <div className={`${screenClass} w-full`}>
              {/* Top Phone Hardware Telemetry Bar */}
              <div className="relative z-10 flex items-center justify-between gap-1 border-b border-white/10 bg-black/60 px-2 py-1 text-[9px] font-medium text-slate-200 backdrop-blur-xs">
                <span className="flex items-center gap-1 font-mono">
                  {dev.ok ? (
                    <Wifi className="h-2.5 w-2.5 text-emerald-400" />
                  ) : (
                    <WifiOff className="h-2.5 w-2.5 text-rose-400" />
                  )}
                  {dev.shortCode}
                </span>
                <span
                  className={`rounded border px-1 py-0.5 text-[8.5px] font-semibold ${
                    PHASE_TONE[dev.taskPhase] || PHASE_TONE.RUNNING
                  }`}
                >
                  {dev.taskPhase}
                </span>
                <span className="flex items-center gap-1 font-mono tabular-nums">
                  {dev.boardDevice?.chargeMode === "charging" ? (
                    <BatteryCharging className="h-2.5 w-2.5 text-sky-400" />
                  ) : (
                    <PlugZap className="h-2.5 w-2.5 text-emerald-400" />
                  )}
                  {dev.batteryPct != null ? `${dev.batteryPct}%` : "--"}
                </span>
              </div>

              {/* Interactive Viewport */}
              <button
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onPointerDown(dev.interactiveCard, e);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onPointerUp(dev.interactiveCard, e);
                }}
                title={`Click or swipe to control ${dev.name} (${dev.serial})`}
                className="relative block h-full w-full cursor-crosshair bg-transparent p-0 text-left focus:outline-none"
              >
                {dev.isPrimaryDisplay0 && dev.ok ? (
                  <H264PhoneStreamCanvas
                    displayId={0}
                    enabled={autoStream && dev.ok}
                    fallbackImgUrl={validImg}
                  />
                ) : validImg ? (
                  <img
                    src={validImg}
                    alt={`${dev.name} live screen`}
                    className="h-full w-full object-cover pointer-events-none select-none"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 pb-10 text-center">
                    <Smartphone
                      className={`h-7 w-7 ${dev.ok ? "text-cyan-300/75" : "text-rose-300/65"}`}
                    />
                    <div className="text-[11px] font-medium text-slate-200">
                      {dev.ok ? "Waiting for next Wi-Fi frame..." : "Node Offline"}
                    </div>
                    <div className="text-[10px] text-slate-400 line-clamp-2">
                      {dev.activeTaskTitle}
                    </div>
                  </div>
                )}

                {activeTouch ? (
                  <span
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 h-6 w-6 rounded-full border-2 border-cyan-300 bg-cyan-400/30 animate-ping"
                    style={{
                      left: `${(activeTouch.x / Math.max(1, dev.interactiveCard.coordWidth)) * 100}%`,
                      top: `${(activeTouch.y / Math.max(1, dev.interactiveCard.coordHeight)) * 100}%`,
                    }}
                  />
                ) : null}

                {/* Floating OTP Badge if present (e.g. Galaxy S9+ 24/7 SMS Gateway) */}
                {dev.lastOtp ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopyOtp(dev.lastOtp!);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        onCopyOtp(dev.lastOtp!);
                      }
                    }}
                    title="Copy latest OTP from 24/7 SIM gateway"
                    className="absolute left-2 right-2 bottom-9 z-10 flex items-center justify-between gap-1 rounded border border-amber-400/45 bg-slate-950/90 px-2 py-1 font-mono text-[10px] text-amber-200 shadow"
                  >
                    <span className="truncate">OTP: {dev.lastOtp}</span>
                    <Copy className="h-3 w-3 shrink-0 opacity-80" />
                  </span>
                ) : null}

                {/* Bottom Screen Backlight / Thermal Clarity Strip */}
                <div className="absolute inset-x-1.5 bottom-7 z-10 flex items-center justify-between gap-2 rounded border border-white/10 bg-black/75 px-2 py-0.5 text-[9px] text-slate-200 backdrop-blur-xs">
                  <span className="flex min-w-0 items-center gap-1">
                    <Eye className="h-2.5 w-2.5 shrink-0 text-cyan-300" />
                    <span className="truncate">{dev.dimModeLabel}</span>
                  </span>
                  <span className="shrink-0 font-mono text-emerald-300 tabular-nums">
                    {dev.tempC != null ? `${dev.tempC.toFixed(1)}C` : "--"}
                  </span>
                </div>
              </button>

              {/* Expand Theater Overlay button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTheater(dev.interactiveCard);
                }}
                title={`Zoom & control ${dev.name}`}
                className="absolute right-1.5 top-8 z-10 rounded border border-white/15 bg-black/65 p-1 text-slate-200 opacity-0 transition group-hover:opacity-100 hover:border-cyan-400/50 hover:text-cyan-200"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
            </div>

            {/* Footer Telemetry + Quick Actions */}
            <div className="mt-2 space-y-1.5 text-[10px]">
              <div className="flex items-center justify-between gap-1.5">
                <span className="truncate font-medium text-white" title={dev.activeTaskTitle}>
                  {dev.activeTaskTitle}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-cyan-300 tabular-nums">
                  {dev.proxyLatencyMs != null ? `${dev.proxyLatencyMs}ms` : dev.ok ? "Wi-Fi" : "Down"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1 text-[9.5px] text-slate-400">
                <span className="truncate">{dev.proxyLabel}</span>
                <span className="flex shrink-0 items-center gap-1 tabular-nums">
                  <Cpu className="h-2.5 w-2.5" />
                  {dev.ramUsedPct != null
                    ? `RAM ${dev.ramUsedPct}%${dev.ramFreeMb ? ` (${dev.ramFreeMb}MB)` : ""}`
                    : powerBadge.label}
                </span>
              </div>
              <div className="flex items-center gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPressHome(dev);
                  }}
                  title={`Send Home Key to ${dev.name}`}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-white/15 bg-white/5 px-1.5 py-1 text-[10px] text-slate-200 hover:bg-white/10"
                >
                  <Home className="h-2.5 w-2.5" />
                  Home
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRotateProxy(dev);
                  }}
                  title={`Rotate 4G IP / Refresh Proxy for ${dev.name}`}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-1 text-[10px] text-cyan-200 hover:bg-cyan-500/20"
                >
                  <RotateCw className="h-2.5 w-2.5" />
                  Rotate IP
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyScreen(dev);
                  }}
                  title={`Download live frame from ${dev.name}`}
                  className="inline-flex items-center justify-center rounded border border-white/15 bg-white/5 px-1.5 py-1 text-[10px] text-slate-200 hover:bg-white/10"
                >
                  <Camera className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});
