import { memo, type PointerEvent } from "react";
import {
  BatteryCharging,
  Camera,
  Copy,
  Cpu,
  ExternalLink,
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
  resolvePowerPathSummary,
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
  orchestratorState?: "dispatch" | "skipped" | "leased" | "paused" | null;
  orchestratorLabel?: string | null;
  orchestratorCompletedCount?: number;
  efficiencyScore?: number | null;
  efficiencyGrade?: string | null;
  autoAction?: string | null;
  screenDataUrl: string | null;
  boardDevice: MobileFarmBoardDevice | null;
  interactiveCard: FarmPhoneCardItem;
  isManualNode?: boolean;
  activeManualUserId?: number;
  manualUserSlots?: Array<{ userId: number; label: string }>;
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

const GRADE_TONE: Record<string, string> = {
  S: "border-emerald-400/50 bg-emerald-500/20 text-emerald-200",
  A: "border-sky-400/50 bg-sky-500/20 text-sky-200",
  B: "border-amber-400/50 bg-amber-500/20 text-amber-200",
  C: "border-rose-400/50 bg-rose-500/20 text-rose-200",
};

const PHASE_TONE: Record<string, string> = {
  WAVE: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  "COOLDOWN BURST": "border-sky-400/40 bg-sky-500/15 text-sky-200",
  "24/7 GATEWAY": "border-amber-400/40 bg-amber-500/15 text-amber-200",
  "MANUAL SCRCPY": "border-cyan-400/40 bg-cyan-500/15 text-cyan-200",
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
  onOpenScrcpy,
  onSwitchUser,
  onLaunchManualApp,
  switchingUserState,
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
  onOpenScrcpy?: (dev: PhysicalWallDevice) => void;
  onSwitchUser?: (dev: PhysicalWallDevice, userId: number) => void;
  onLaunchManualApp?: (dev: PhysicalWallDevice, packageName: string, appLabel: string, userIdOverride?: number) => void;
  switchingUserState?: { deviceId: string; userId: number; label: string } | null;
  onPressHome: (dev: PhysicalWallDevice) => void;
  onRotateProxy: (dev: PhysicalWallDevice) => void;
  onCopyScreen: (dev: PhysicalWallDevice) => void;
  onCopyOtp: (otp: string) => void;
}) {
  const gridColsClass =
    devices.length <= 4
      ? "grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-4"
      : "grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5";
  return (
    <div className={gridColsClass}>
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
        const validImg = isNonBlackScreenUrl(dev.screenDataUrl, dev.os === "ios" ? 2000 : 7800)
          ? dev.screenDataUrl
          : null;
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
              <div className="flex shrink-0 items-center gap-1">
                {dev.efficiencyGrade ? (
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums ${
                      GRADE_TONE[dev.efficiencyGrade] || GRADE_TONE.B
                    }`}
                    title={`Efficiency ${dev.efficiencyScore ?? "--"}/100 · Auto-Action: ${dev.autoAction || "none"}`}
                  >
                    {dev.efficiencyGrade} {dev.efficiencyScore ?? ""}
                  </span>
                ) : null}
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
            </div>

            {/* Live Screen Canvas */}
            <div className={`${screenClass} w-full`}>
              {/* Top Phone Hardware Telemetry Bar */}
              <div className="relative z-10 flex items-center justify-between gap-1 whitespace-nowrap border-b border-white/10 bg-black/60 px-1.5 py-1 text-[8.5px] font-medium text-slate-200 backdrop-blur-xs">
                <span className="flex min-w-0 items-center gap-1 font-mono">
                  {dev.ok ? (
                    <Wifi className="h-2.5 w-2.5 shrink-0 text-emerald-400" />
                  ) : (
                    <WifiOff className="h-2.5 w-2.5 shrink-0 text-rose-400" />
                  )}
                  <span className="truncate">{dev.shortCode}</span>
                </span>
                <span
                  className={`shrink-0 rounded border px-1 py-0.5 text-[8px] font-semibold ${
                    PHASE_TONE[dev.taskPhase] || PHASE_TONE.RUNNING
                  }`}
                >
                  {dev.taskPhase}
                </span>
                <span className="flex shrink-0 items-center gap-1 font-mono tabular-nums">
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
                {dev.os === "android" && dev.ok && (!dev.isManualNode || Boolean(validImg)) ? (
                  <H264PhoneStreamCanvas
                    displayId={0}
                    serial={dev.serial}
                    enabled={autoStream && dev.ok && (!dev.isManualNode || (dev.tempC ?? 35) < 38.5)}
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

                {switchingUserState && switchingUserState.deviceId === dev.id ? (
                  <div
                    className="mf-user-switch-veil"
                    data-slot={String(switchingUserState.userId)}
                    data-testid={`user-switch-veil-${dev.id}`}
                  >
                    <span className="mf-user-switch-pill">
                      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      <span>Switching → {switchingUserState.label}</span>
                    </span>
                  </div>
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
                    className="absolute left-2 right-2 bottom-14 z-10 flex items-center justify-between gap-1 rounded border border-amber-400/45 bg-slate-950/90 px-2 py-1 font-mono text-[10px] text-amber-200 shadow"
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
              {(() => {
                const powerPath = dev.ok ? resolvePowerPathSummary(dev.boardDevice) : null;
                if (!powerPath) return null;
                return (
                  <div
                    className={`truncate font-mono text-[9px] tabular-nums ${
                      powerPath.isWeak
                        ? "text-rose-300"
                        : powerPath.isHealthyCharge
                          ? "text-emerald-300"
                          : "text-slate-300"
                    }`}
                    title={powerPath.title}
                  >
                    {powerPath.text}
                  </div>
                );
              })()}
              {dev.orchestratorState || dev.autoAction ? (
                <div className="flex flex-col gap-0.5 rounded border border-white/10 bg-white/[0.03] px-1.5 py-1 text-[9px]">
                  {dev.orchestratorState ? (
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`truncate font-medium ${
                          dev.orchestratorState === "dispatch"
                            ? "text-emerald-300"
                            : dev.orchestratorState === "leased"
                              ? "text-sky-300"
                              : "text-amber-300"
                        }`}
                        title={dev.orchestratorLabel || dev.orchestratorState}
                      >
                        {dev.orchestratorState.toUpperCase()} · {dev.orchestratorLabel || "Queued"}
                      </span>
                      {Number(dev.orchestratorCompletedCount || 0) > 0 ? (
                        <span className="shrink-0 font-mono text-emerald-300 tabular-nums">
                          +{dev.orchestratorCompletedCount}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {dev.autoAction ? (
                    <div className="truncate font-mono text-[8.5px] text-cyan-200/85" title={dev.autoAction}>
                      Auto: {dev.autoAction.replace(/_/g, " ")}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {dev.manualUserSlots && dev.manualUserSlots.length > 0 && onSwitchUser ? (
                <div className="space-y-1 pt-0.5">
                  <div className="flex flex-wrap items-center gap-1">
                    {dev.manualUserSlots.map((slot) => {
                      const isActiveSlot = (dev.activeManualUserId ?? 0) === slot.userId;
                      return (
                        <button
                          key={slot.userId}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSwitchUser(dev, slot.userId);
                          }}
                          title={`Switch ${dev.name} to User U${slot.userId} (${slot.label}) — keeps 1 warm background slot`}
                          className={`rounded border px-1.5 py-0.5 font-mono text-[9.5px] transition-colors ${
                            isActiveSlot
                              ? "border-emerald-400/60 bg-emerald-500/25 font-semibold text-emerald-100"
                              : "border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
                          }`}
                        >
                          {slot.label}
                        </button>
                      );
                    })}
                  </div>
                  {onLaunchManualApp ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onLaunchManualApp(dev, "com.zing.zalo", "Zalo");
                          }}
                          title={`Launch Zalo in active User U${dev.activeManualUserId ?? 0}`}
                          className="flex-1 whitespace-nowrap rounded border border-sky-500/30 bg-sky-500/10 px-1 py-0.5 text-[9px] font-medium text-sky-200 hover:bg-sky-500/20"
                        >
                          Zalo · U{dev.activeManualUserId ?? 0}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onLaunchManualApp(dev, "com.facebook.katana", "Facebook");
                          }}
                          title={`Launch Facebook in active User U${dev.activeManualUserId ?? 0}`}
                          className="flex-1 whitespace-nowrap rounded border border-indigo-500/30 bg-indigo-500/10 px-1 py-0.5 text-[9px] font-medium text-indigo-200 hover:bg-indigo-500/20"
                        >
                          FB · U{dev.activeManualUserId ?? 0}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onLaunchManualApp(dev, "com.facebook.orca", "Messenger");
                          }}
                          title={`Launch Messenger in active User U${dev.activeManualUserId ?? 0}`}
                          className="flex-1 whitespace-nowrap rounded border border-cyan-500/30 bg-cyan-500/10 px-1 py-0.5 text-[9px] font-medium text-cyan-200 hover:bg-cyan-500/20"
                        >
                          Mess · U{dev.activeManualUserId ?? 0}
                        </button>
                      </div>
                      {dev.id === "s9plus" ? (
                        <div className="flex items-center gap-1" data-testid="s9-dual-u95-row">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLaunchManualApp(dev, "com.zing.zalo", "Zalo Dual", 95);
                            }}
                            title="Switch to 01 (U0) if needed, unlock DUAL_APP (U95), and launch Dual Zalo"
                            className="flex-1 whitespace-nowrap rounded border border-amber-400/35 bg-amber-500/10 px-1 py-0.5 text-[8.5px] font-medium text-amber-200 hover:bg-amber-500/20"
                          >
                            Zalo U95
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLaunchManualApp(dev, "com.facebook.katana", "FB Dual", 95);
                            }}
                            title="Switch to 01 (U0) if needed, unlock DUAL_APP (U95), and launch Dual Facebook"
                            className="flex-1 whitespace-nowrap rounded border border-fuchsia-400/35 bg-fuchsia-500/10 px-1 py-0.5 text-[8.5px] font-medium text-fuchsia-200 hover:bg-fuchsia-500/20"
                          >
                            FB U95
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLaunchManualApp(dev, "com.facebook.orca", "Mess Dual", 95);
                            }}
                            title="Switch to 01 (U0) if needed, unlock DUAL_APP (U95), and launch Dual Messenger"
                            className="flex-1 whitespace-nowrap rounded border border-emerald-400/35 bg-emerald-500/10 px-1 py-0.5 text-[8.5px] font-medium text-emerald-200 hover:bg-emerald-500/20"
                          >
                            Mess U95
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
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
                {dev.os === "android" && onOpenScrcpy ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenScrcpy(dev);
                    }}
                    title={`Open 60fps Scrcpy mirror for ${dev.name}`}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-emerald-500/35 bg-emerald-500/15 px-1.5 py-1 text-[10px] text-emerald-200 hover:bg-emerald-500/25"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    Scrcpy
                  </button>
                ) : null}
                {!dev.isManualNode ? (
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
                ) : null}
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
