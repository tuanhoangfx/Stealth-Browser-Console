import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Cpu,
  Play,
  Radio,
  RotateCw,
  ShieldCheck,
  Target,
  Thermometer,
  Wifi,
} from "lucide-react";
import { MOCK_MISSION } from "./mock";
import { DeviceOsBadge, MockPhoneViewport, Sparkline } from "./MockPhoneViewport";
import type { FarmPreviewProps } from "./tokens";

type DockTab = "dispatch" | "carriers" | "daemons" | "stream";

export function V1CinemaStageDock({
  devices,
  lanes,
  daemons,
  events,
  selectedId,
  onSelectDevice,
  dismissedAnr,
  onDismissAnr,
  onTapScreen,
  onAction,
}: FarmPreviewProps) {
  const [dockTab, setDockTab] = useState<DockTab>("dispatch");
  const goalPct = Math.round((MOCK_MISSION.goalCurrent / MOCK_MISSION.goalTarget) * 100);

  return (
    <div className="mf-p2-shell flex flex-col gap-2.5 p-3 text-slate-100">
      {/* Compact 1-Line Live Mission Strip (replaces 5 bulky KPI boxes + left rail) */}
      <div className="mf-p2-panel flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
            <span className="mf-p2-pulse bg-emerald-400 text-emerald-400" />
            <span>5/5 Wi-Fi Live</span>
          </span>
          <div className="flex items-center gap-2 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1">
            <Target className="h-3.5 w-3.5 text-indigo-300" />
            <span className="font-medium text-indigo-100">
              FB Goal {MOCK_MISSION.goalCurrent}/{MOCK_MISSION.goalTarget}
            </span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${goalPct}%` }} />
            </div>
            <span className="font-mono text-[10px] text-emerald-300">Wave #{MOCK_MISSION.waveNumber}</span>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] text-cyan-200">
            <Radio className="h-3.5 w-3.5 text-cyan-300" />
            4/4 SIM · {MOCK_MISSION.otpCount} OTPs
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-200">
            <Thermometer className="h-3.5 w-3.5 text-emerald-300" />
            {MOCK_MISSION.avgTempC}C avg
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => onAction("Heal Wi-Fi")}
            className="inline-flex items-center gap-1 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 text-cyan-200 hover:bg-cyan-500/20"
          >
            <Wifi className="h-3 w-3" />
            Heal Wi-Fi
          </button>
          <button
            type="button"
            onClick={() => onAction("Rotate All 4G Subnets")}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-emerald-200 hover:bg-emerald-500/20"
          >
            <RotateCw className="h-3 w-3" />
            Rotate 4G
          </button>
          {!dismissedAnr && (
            <button
              type="button"
              onClick={onDismissAnr}
              className="inline-flex items-center gap-1 rounded-md border border-amber-400/50 bg-amber-500/20 px-2 py-1 font-medium text-amber-200 hover:bg-amber-500/30"
            >
              <AlertTriangle className="h-3 w-3" />
              1 Alert: Dismiss P7 ANR
            </button>
          )}
        </div>
      </div>

      {/* Hero Stage: Full-width 5-Device Clean Wall (no overlays inside phone screens) */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {devices.map((dev) => {
          const isSelected = selectedId === dev.id;
          const hasAlert = Boolean(dev.alert && !dismissedAnr);
          return (
            <div
              key={dev.id}
              onClick={() => onSelectDevice(dev.id)}
              className={`mf-p2-card flex cursor-pointer flex-col p-2.5 ${
                hasAlert ? "mf-p2-card--alert" : ""
              } ${isSelected ? "ring-1 ring-cyan-400/75" : ""}`}
            >
              {/* Clean Header */}
              <div className="mb-2 flex items-center justify-between gap-1.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`mf-p2-pulse ${
                        hasAlert ? "bg-amber-400 text-amber-400" : "bg-emerald-400 text-emerald-400"
                      }`}
                    />
                    <span className="truncate text-xs font-semibold text-white">{dev.name}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                    {dev.ip} · {dev.transport}
                  </div>
                </div>
                <DeviceOsBadge os={dev.os} />
              </div>

              {/* Clean Live Viewport */}
              <MockPhoneViewport
                device={dev}
                dismissedAnr={dismissedAnr}
                onTapScreen={onTapScreen}
                onDismissAnr={onDismissAnr}
                onCopyOtp={(otp) => onAction(`Copied OTP ${otp}`, dev)}
                onHome={(d) => onAction("Sent Home Key", d)}
                onRotateIp={(d) => onAction("Rotated 4G IP", d)}
                onSnapshot={(d) => onAction("Captured PNG Frame", d)}
                onZoom={(d) => onAction("Opened Theater Zoom", d)}
              />

              {/* Slim Hardware Bezel Strip BELOW screen (never blocks app UI) */}
              <div className="mt-2 flex items-center justify-between rounded-md border border-white/10 bg-black/45 px-2 py-1 font-mono text-[9.5px] text-slate-300 tabular-nums">
                <span className="inline-flex items-center gap-1">
                  <BatteryCharging className="h-3 w-3 text-emerald-400" />
                  {dev.batteryPct}%
                </span>
                <span className={dev.tempC >= 37 ? "text-amber-300" : "text-emerald-300"}>{dev.tempC.toFixed(1)}C</span>
                <span className="inline-flex items-center gap-1">
                  <Cpu className="h-2.5 w-2.5 text-sky-300" />
                  {dev.ramUsedPct}%
                </span>
                <span className="text-cyan-300">{dev.latencyMs}ms</span>
              </div>

              {/* Concise Single-Line Task + State */}
              <div className="mt-1.5 flex items-center justify-between gap-1 text-[10px]">
                <span className="truncate font-medium text-slate-200" title={dev.taskTitle}>
                  {dev.taskTitle}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[8.5px] font-semibold ${
                    hasAlert
                      ? "bg-amber-500/20 text-amber-200"
                      : dev.orchestratorState === "GATEWAY"
                        ? "bg-cyan-500/20 text-cyan-200"
                        : "bg-emerald-500/20 text-emerald-200"
                  }`}
                >
                  {hasAlert ? "ANR" : dev.orchestratorState}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Unified Tabbed Bottom Ops Dock — Zero vertical page scroll */}
      <div className="mf-p2-panel p-2.5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: "dispatch", label: `Orchestrator Matrix (Cycle #${MOCK_MISSION.orchestratorCycle})` },
                { id: "carriers", label: "4G Carrier Kaizen (4)" },
                { id: "daemons", label: `Active Daemons (${MOCK_MISSION.activeDaemons}/${MOCK_MISSION.totalDaemons})` },
                { id: "stream", label: `Live Event Stream (${events.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDockTab(tab.id)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                  dockTab === tab.id
                    ? "border border-cyan-400/45 bg-cyan-500/15 text-cyan-100"
                    : "border border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="text-[10.5px] text-slate-400">
            Auto-Pilot Active · Group Comments: {MOCK_MISSION.queuedComments} queued
          </span>
        </div>

        {dockTab === "dispatch" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {devices.map((dev) => (
              <div key={dev.id} className="rounded-lg border border-white/10 bg-black/40 p-2 text-[10.5px]">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-white">{dev.shortCode} · {dev.name.replace("Google ", "")}</span>
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                    {dev.orchestratorState}
                  </span>
                </div>
                <div className="mt-1 truncate text-slate-300">{dev.orchestratorNote}</div>
                <div className="mt-1 font-mono text-[9.5px] text-cyan-300">{dev.proxyLabel}</div>
              </div>
            ))}
          </div>
        )}

        {dockTab === "carriers" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {lanes.map((lane) => (
              <div key={lane.laneId} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/40 p-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-medium text-white">{lane.label}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400 tabular-nums">
                    {lane.live}/{lane.attempts} live · {lane.latencyMs}ms
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkline values={lane.history} color={lane.convPct > 0 ? "#34d399" : "#64748b"} />
                  <span className={`font-mono text-xs font-semibold ${lane.convPct > 0 ? "text-emerald-300" : "text-slate-400"}`}>
                    {lane.convPct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {dockTab === "daemons" && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {daemons.map((d) => (
              <div key={d.id} className="rounded-lg border border-white/10 bg-black/40 p-2 text-[10.5px]">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate font-semibold text-slate-100">{d.title}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[8.5px] font-semibold ${
                      d.status === "RUNNING"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : d.status === "STOPPED"
                          ? "bg-rose-500/20 text-rose-200"
                          : "bg-slate-700/50 text-slate-300"
                    }`}
                  >
                    {d.status}
                  </span>
                </div>
                <div className="mt-1 truncate text-slate-400">{d.step}</div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="font-mono text-[9.5px] text-cyan-200">{d.progress}</span>
                  <button
                    type="button"
                    onClick={() => onAction(`${d.status === "RUNNING" ? "Restart" : "Start"} ${d.title}`)}
                    className="inline-flex items-center gap-1 rounded border border-sky-400/35 bg-sky-500/10 px-1.5 py-0.5 text-[9px] text-sky-200 hover:bg-sky-500/20"
                  >
                    <Play className="h-2.5 w-2.5" />
                    {d.status === "RUNNING" ? "Restart" : "Start"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {dockTab === "stream" && (
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {events.slice(0, 6).map((ev) => (
              <div key={ev.id} className="flex items-center gap-2 rounded border border-white/10 bg-black/40 px-2.5 py-1.5 text-[10.5px]">
                <span className="font-mono text-[9.5px] text-slate-500">{ev.tsLabel}</span>
                <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-cyan-200">
                  {ev.shortCode}
                </span>
                <span className="truncate text-slate-200">{ev.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
