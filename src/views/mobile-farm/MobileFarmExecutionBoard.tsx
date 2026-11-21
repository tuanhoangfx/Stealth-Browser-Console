import { memo } from "react";
import { Activity, BatteryCharging, CheckCircle2, ChevronDown, ChevronUp, Cpu, Globe, Play, PlugZap, RefreshCw, ShieldAlert } from "lucide-react";
import { compactIconSize } from "@tool-workspace/hub-ui";
import type { MobileFarmBoardDevice, MobileFarmBoardTask, MobileFarmExecutionBoardData } from "./mobile-farm-stream";

function formatRelativeAge(iso?: string | null): string {
  if (!iso) return "idle";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "idle";
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}

export function resolveDevicePowerBadge(dev: Pick<
  MobileFarmBoardDevice,
  "ok" | "chargeMode" | "attachedDev" | "cableAttached" | "acPowered" | "storeModeRecoveryTriggered"
>): { label: string; toneClass: string; title: string } {
  if (!dev.ok) {
    return {
      label: "Offline · Unreachable",
      toneClass: "border-rose-400/35 bg-rose-950/45 text-rose-200",
      title: "Device failed Wi-Fi/SSH/USB health probe",
    };
  }
  if (dev.storeModeRecoveryTriggered) {
    return {
      label: `Recovering (${dev.attachedDev || "TA"})`,
      toneClass: "border-amber-400/45 bg-amber-950/50 text-amber-200",
      title: "Battery <= 55% under store_mode; PMIC charge recovery triggered",
    };
  }
  switch (dev.chargeMode) {
    case "hold_store_mode":
      return {
        label: `Power OK (${dev.attachedDev || "AC"}) · Store Hold`,
        toneClass: "border-emerald-400/35 bg-emerald-950/45 text-emerald-200",
        title: "External power verified connected; battery held safely via store_mode",
      };
    case "hold_slate_emergency":
      return {
        label: `Power OK (${dev.attachedDev || "TA"}) · Thermal Cut`,
        toneClass: "border-amber-400/40 bg-amber-950/50 text-amber-200",
        title: "Cable physically attached; charging cut temporarily due to thermal limit",
      };
    case "hold_pixel_limit":
      return {
        label: "Power OK · 80–85% Bypass",
        toneClass: "border-emerald-400/35 bg-emerald-950/45 text-emerald-200",
        title: "Google Charger IC holding battery inside 80-85% band",
      };
    case "charging":
      return {
        label: `Charging (${dev.attachedDev || "USB/AC"})`,
        toneClass: "border-sky-400/35 bg-sky-950/45 text-sky-200",
        title: "Actively charging battery with external power attached",
      };
    case "full":
      return {
        label: `Power OK (${dev.attachedDev || "AC"}) · Full`,
        toneClass: "border-emerald-400/35 bg-emerald-950/45 text-emerald-200",
        title: "Battery full on external power",
      };
    case "idle_plugged":
      return {
        label: `Power OK (${dev.attachedDev || "AC"})`,
        toneClass: "border-emerald-400/30 bg-emerald-950/35 text-emerald-200",
        title: "External power recognized",
      };
    default:
      if (dev.cableAttached || dev.acPowered) {
        return {
          label: `Power OK (${dev.attachedDev || "AC"})`,
          toneClass: "border-emerald-400/30 bg-emerald-950/35 text-emerald-200",
          title: "External power recognized",
        };
      }
      return {
        label: "Unplugged / No Cable",
        toneClass: "border-rose-400/40 bg-rose-950/50 text-rose-200",
        title: "No AC/USB cable detected",
      };
  }
}

function TaskStatusPill({ status }: { status: MobileFarmBoardTask["status"] }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-400/35 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-200">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        RUNNING
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-sky-400/35 bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-medium text-sky-200">
        <CheckCircle2 size={10} aria-hidden />
        DONE
      </span>
    );
  }
  if (status === "attention") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-200">
        <ShieldAlert size={10} aria-hidden />
        ATTENTION
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-hub-muted">
      STANDBY
    </span>
  );
}

export const MobileFarmExecutionBoard = memo(function MobileFarmExecutionBoard({
  board,
  expanded,
  onToggleExpand,
  onRefresh,
  refreshing,
  onControlDaemon,
  controllingDaemonId,
}: {
  board: MobileFarmExecutionBoardData | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onControlDaemon?: (daemonId: string, action: "start" | "restart") => void;
  controllingDaemonId?: string | null;
}) {
  const summary = board?.summary;
  const devices = board?.devices || [];
  const tasks = board?.tasks || [];

  return (
    <div className="rounded-md border border-sky-500/25 bg-slate-950/55 px-2.5 py-1.5 text-xs">
      {/* Compact Top Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Activity size={compactIconSize(13)} className="shrink-0 text-sky-300" aria-hidden />
          <span className="font-medium text-white">Live Execution Progress &amp; Task Board</span>
          {summary ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] tabular-nums">
              <span className="rounded border border-emerald-400/30 bg-emerald-950/40 px-1.5 py-0.5 text-emerald-200">
                {summary.runningTasks}/{summary.totalTasks} active
              </span>
              <span className="rounded border border-sky-400/30 bg-sky-950/40 px-1.5 py-0.5 text-sky-200">
                Overall {summary.overallProgressPct}%
              </span>
              <span
                className={`rounded border px-1.5 py-0.5 ${
                  summary.onlineDevices === summary.totalDevices
                    ? "border-emerald-400/30 bg-emerald-950/40 text-emerald-200"
                    : "border-amber-400/35 bg-amber-950/40 text-amber-200"
                }`}
              >
                Nodes {summary.onlineDevices}/{summary.totalDevices} online
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-hub-muted">Loading telemetry…</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {board?.updatedAt ? (
            <span className="text-[10px] text-hub-muted tabular-nums">
              Updated {formatRelativeAge(board.updatedAt)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex h-6 items-center gap-1 rounded border border-white/15 bg-black/35 px-2 text-[10px] text-white/90 hover:bg-white/10 disabled:opacity-50"
            title="Refresh live task execution & 4-node hardware board"
          >
            <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} aria-hidden />
            Sync
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            className="inline-flex h-6 items-center gap-1 rounded border border-white/15 bg-black/35 px-2 text-[10px] text-sky-200 hover:bg-white/10"
            title={expanded ? "Collapse task board" : "Expand visual progress & tasks"}
          >
            {expanded ? <ChevronUp size={11} aria-hidden /> : <ChevronDown size={11} aria-hidden />}
            {expanded ? "Collapse" : "Show Board"}
          </button>
        </div>
      </div>

      {expanded && board ? (
        <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-2">
          {/* 4-Device Live Power & ChargeMode Strip */}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
            {devices.map((dev) => {
              const badge = resolveDevicePowerBadge(dev);
              return (
                <div
                  key={dev.serial}
                  className="flex items-center justify-between gap-2 rounded border border-white/10 bg-black/35 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-white">
                      <Cpu size={11} className="shrink-0 text-sky-300" aria-hidden />
                      <span className="truncate">{dev.label}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-hub-muted tabular-nums">
                      <span>
                        {dev.batteryLevel != null ? `${dev.batteryLevel}%` : "--"} ·{" "}
                        {dev.batteryTempC != null ? `${dev.batteryTempC.toFixed(1)}°C` : "--"}
                      </span>
                      {dev.ramUsedPct != null ? <span>RAM {dev.ramUsedPct}%</span> : null}
                      {!dev.ok && dev.unreachableReason ? (
                        <span className="truncate text-rose-300">{dev.unreachableReason}</span>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-medium tabular-nums ${badge.toneClass}`}
                    title={badge.title}
                  >
                    {dev.chargeMode === "charging" ? (
                      <BatteryCharging size={10} aria-hidden />
                    ) : (
                      <PlugZap size={10} aria-hidden />
                    )}
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Active Task Progress Grid */}
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-3">
            {tasks.map((task) => {
              const barColor =
                task.status === "completed"
                  ? "bg-sky-400"
                  : task.status === "attention"
                    ? "bg-amber-400"
                    : task.status === "running"
                      ? "bg-emerald-400"
                      : "bg-slate-500";
              return (
                <div
                  key={task.id}
                  className="flex flex-col gap-1 rounded border border-white/10 bg-black/30 px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-white">{task.title}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {task.canControl && onControlDaemon ? (
                        <button
                          type="button"
                          onClick={() => onControlDaemon(task.id, task.status === "standby" ? "start" : "restart")}
                          disabled={controllingDaemonId === task.id}
                          className="inline-flex h-4 items-center gap-1 rounded border border-sky-400/35 bg-sky-500/15 px-1.5 text-[9px] font-medium text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
                          title={task.status === "standby" ? `Start ${task.title}` : `Restart ${task.title}`}
                        >
                          <Play size={8} aria-hidden />
                          {controllingDaemonId === task.id ? "Working..." : task.status === "standby" ? "Start" : "Restart"}
                        </button>
                      ) : null}
                      <span className="text-[10px] font-semibold text-sky-200 tabular-nums">
                        {task.percent}%
                      </span>
                      <TaskStatusPill status={task.status} />
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                      style={{ width: `${Math.max(2, Math.min(100, task.percent))}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-white/85">
                    <span className="truncate">{task.currentStep}</span>
                    <span className="shrink-0 font-medium text-emerald-300 tabular-nums">
                      {task.progressLabel}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[9px] text-hub-muted tabular-nums">
                    <span className="truncate">{task.metricsText}</span>
                    <span className="shrink-0">
                      {task.targetDevice} · {formatRelativeAge(task.updatedAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {board.experiments && board.experiments.lanes.length > 0 ? (
            <div className="rounded border border-white/10 bg-black/30 px-2.5 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px]">
                <div className="flex items-center gap-1.5 font-medium text-sky-200">
                  <Globe size={11} aria-hidden />
                  <span>Multi-Platform &amp; Geo Kaizen Experiment Matrix</span>
                </div>
                <span className="text-hub-muted tabular-nums">
                  {board.experiments.totalRunsRecorded} runs recorded · Updated {formatRelativeAge(board.experiments.updatedAt)}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {board.experiments.lanes.slice(0, 8).map((lane, idx) => {
                  const topGate = Object.entries(lane.gates || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "none";
                  return (
                    <div
                      key={`${lane.platform}-${lane.geo || "VN"}-${lane.device}-${lane.provider}-${idx}`}
                      className="flex flex-col gap-0.5 rounded border border-white/10 bg-slate-950/60 px-2 py-1 text-[10px] tabular-nums"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium uppercase text-white">
                          {lane.platform} · {lane.geo || "VN_4G"}
                        </span>
                        <span
                          className={`rounded px-1 py-0.5 text-[9px] font-semibold ${
                            lane.conversionPct > 0
                              ? "bg-emerald-500/20 text-emerald-200"
                              : "bg-slate-500/20 text-slate-300"
                          }`}
                        >
                          {lane.conversionPct}% pass
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 text-[9px] text-hub-muted">
                        <span>
                          {lane.device} · {lane.provider}
                        </span>
                        <span>
                          {lane.attempts} att · {lane.avgElapsedSec != null ? `${lane.avgElapsedSec}s` : "--"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 text-[9px] text-amber-200/85">
                        <span className="truncate">Gate: {topGate}</span>
                        {lane.otpRatePct != null ? <span>OTP {lane.otpRatePct}%</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
