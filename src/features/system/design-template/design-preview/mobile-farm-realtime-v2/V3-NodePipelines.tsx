import { AlertTriangle, Cpu, Home, Network, RotateCw, ShieldCheck } from "lucide-react";
import { MOCK_MISSION } from "./mock";
import { DeviceOsBadge, MockPhoneViewport, Sparkline } from "./MockPhoneViewport";
import type { FarmPreviewProps } from "./tokens";

export function V3NodePipelines({
  devices,
  lanes,
  selectedId,
  onSelectDevice,
  dismissedAnr,
  onDismissAnr,
  onTapScreen,
  onAction,
}: FarmPreviewProps) {
  const laneById = new Map(lanes.map((l) => [l.laneId, l]));

  return (
    <div className="mf-p2-shell flex flex-col gap-2.5 p-3 text-slate-100">
      <div className="mf-p2-panel flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-cyan-300" />
          <span className="font-semibold text-white">End-to-End Node Pipelines</span>
          <span className="text-[11px] text-slate-400">
            Unified Task → Live Screen → Hardware → Bound 4G Carrier Lane
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="text-emerald-300">Goal {MOCK_MISSION.goalCurrent}/{MOCK_MISSION.goalTarget}</span>
          <span className="text-cyan-300">Cycle #{MOCK_MISSION.orchestratorCycle}</span>
        </div>
      </div>

      {/* 5 Vertical Pipelines: each column owns its complete stack */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {devices.map((dev) => {
          const lane = laneById.get(dev.laneId);
          const hasAlert = Boolean(dev.alert && !dismissedAnr);
          const isSelected = selectedId === dev.id;

          return (
            <div
              key={dev.id}
              onClick={() => onSelectDevice(dev.id)}
              className={`mf-p2-card flex cursor-pointer flex-col gap-2 p-2.5 ${
                hasAlert ? "mf-p2-card--alert" : ""
              } ${isSelected ? "ring-1 ring-cyan-400/75" : ""}`}
            >
              {/* Stage 1: Orchestrator Assignment Header */}
              <div className="rounded-lg border border-white/10 bg-black/45 p-2">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`mf-p2-pulse ${
                        hasAlert ? "bg-amber-400 text-amber-400" : "bg-emerald-400 text-emerald-400"
                      }`}
                    />
                    <span className="truncate text-xs font-semibold text-white">{dev.name}</span>
                  </div>
                  <DeviceOsBadge os={dev.os} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-1 text-[10px]">
                  <span className="inline-flex items-center gap-1 font-mono text-slate-400">{dev.ip}</span>
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[8.5px] font-semibold text-emerald-200">
                    {dev.orchestratorState}
                  </span>
                </div>
                <div className="mt-1 truncate text-[10px] font-medium text-cyan-200" title={dev.orchestratorNote}>
                  {dev.orchestratorNote}
                </div>
              </div>

              {/* Stage 2: Clean Live Screen */}
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

              {/* Stage 3: Hardware & Ping Sparkline */}
              <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[10px]">
                <div className="space-y-0.5 font-mono tabular-nums">
                  <div className="text-slate-200">
                    {dev.batteryPct}% · <span className={dev.tempC >= 37 ? "text-amber-300" : "text-emerald-300"}>{dev.tempC.toFixed(1)}C</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400">
                    <Cpu className="h-2.5 w-2.5" />
                    RAM {dev.ramUsedPct}%
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <Sparkline values={dev.latencyHistory} color="#38bdf8" width={64} height={18} />
                  <span className="font-mono text-[9.5px] text-cyan-300">{dev.latencyMs}ms</span>
                </div>
              </div>

              {/* Stage 4: Bound 4G Carrier Lane (no bottom card needed) */}
              {lane && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/15 p-2 text-[10px]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-medium text-emerald-200">{lane.label}</span>
                    <span className="font-mono font-semibold text-white">{lane.convPct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full ${lane.convPct > 0 ? "bg-emerald-400" : "bg-slate-600"}`}
                      style={{ width: `${Math.max(8, Math.min(100, lane.convPct * 3.5))}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[9.5px] text-slate-400 tabular-nums">
                    <span>{lane.live}/{lane.attempts} live</span>
                    <span>{lane.status}</span>
                  </div>
                </div>
              )}

              {/* Stage 5: Quick Node Controls */}
              <div className="flex items-center gap-1">
                {hasAlert ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismissAnr();
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-amber-400/50 bg-amber-500/20 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/30"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    Dismiss ANR
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction("Sent Home Key", dev);
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-white/15 bg-white/5 py-1 text-[10px] text-slate-200 hover:bg-white/10"
                  >
                    <Home className="h-3 w-3" />
                    Home
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction("Rotated 4G IP", dev);
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-cyan-500/35 bg-cyan-500/10 py-1 text-[10px] text-cyan-200 hover:bg-cyan-500/20"
                >
                  <RotateCw className="h-3 w-3" />
                  Rotate 4G
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/35 px-3 py-1.5 text-[10.5px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
          All 5 pipelines synchronized with 24/7 Master Orchestrator
        </span>
        <span>Hover any screen for Snapshot &amp; Focus Zoom</span>
      </div>
    </div>
  );
}
