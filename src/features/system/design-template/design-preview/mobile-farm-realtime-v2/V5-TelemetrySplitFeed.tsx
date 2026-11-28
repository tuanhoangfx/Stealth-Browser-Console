import { useState } from "react";
import { Activity, AlertTriangle, Play, Radio, Terminal, Wifi } from "lucide-react";
import { MOCK_MISSION, type MockDeviceId } from "./mock";
import { DeviceOsBadge, MockPhoneViewport, Sparkline } from "./MockPhoneViewport";
import type { FarmPreviewProps } from "./tokens";

export function V5TelemetrySplitFeed({
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
  const [filterDev, setFilterDev] = useState<"all" | MockDeviceId>("all");
  const filteredEvents = filterDev === "all" ? events : events.filter((e) => e.deviceId === filterDev);

  const androidNodes = devices.filter((d) => d.os === "android");
  const iosNodes = devices.filter((d) => d.os === "ios");

  return (
    <div className="mf-p2-shell grid grid-cols-1 gap-3 p-3 text-slate-100 lg:grid-cols-12">
      {/* Left 8 cols: Asymmetric 3 Android + (2 iOS + 4G Carrier Matrix) */}
      <div className="flex flex-col gap-2.5 lg:col-span-8">
        <div className="mf-p2-panel flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
              <Wifi className="h-3.5 w-3.5" />
              5/5 Physical Nodes
            </span>
            <span className="text-slate-300">
              FB Goal <strong className="text-white">{MOCK_MISSION.goalCurrent}/{MOCK_MISSION.goalTarget}</strong>
            </span>
            <span className="inline-flex items-center gap-1 text-cyan-200">
              <Radio className="h-3.5 w-3.5" />
              4/4 SIM OK
            </span>
          </div>
          <span className="font-mono text-[10.5px] text-slate-400">
            Cycle #{MOCK_MISSION.orchestratorCycle} · {MOCK_MISSION.avgTempC}C avg
          </span>
        </div>

        {/* Top Row: 3 Rooted Android Nodes */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {androidNodes.map((dev) => {
            const hasAlert = Boolean(dev.alert && !dismissedAnr);
            const isSelected = selectedId === dev.id;
            return (
              <div
                key={dev.id}
                onClick={() => onSelectDevice(dev.id)}
                className={`mf-p2-card flex cursor-pointer flex-col p-2.5 ${
                  hasAlert ? "mf-p2-card--alert" : ""
                } ${isSelected ? "ring-1 ring-cyan-400/75" : ""}`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-1">
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

                <div className="mt-1.5 flex items-center justify-between font-mono text-[9.5px] text-slate-400">
                  <span>{dev.batteryPct}% · {dev.tempC.toFixed(1)}C · RAM {dev.ramUsedPct}%</span>
                  <span className="text-cyan-300">{dev.latencyMs}ms</span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-slate-200">{dev.orchestratorNote}</div>
              </div>
            );
          })}
        </div>

        {/* Bottom Row: 2 Jailbroken iOS Nodes + 4G Carrier Matrix beside them (zero dead space) */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {iosNodes.map((dev) => {
            const isSelected = selectedId === dev.id;
            return (
              <div
                key={dev.id}
                onClick={() => onSelectDevice(dev.id)}
                className={`mf-p2-card flex cursor-pointer flex-col p-2.5 ${
                  isSelected ? "ring-1 ring-cyan-400/75" : ""
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="mf-p2-pulse bg-emerald-400 text-emerald-400" />
                    <span className="truncate text-xs font-semibold text-white">{dev.name}</span>
                  </div>
                  <DeviceOsBadge os={dev.os} />
                </div>

                <MockPhoneViewport
                  device={dev}
                  dismissedAnr={dismissedAnr}
                  onTapScreen={onTapScreen}
                  onHome={(d) => onAction("Sent Home Key", d)}
                  onRotateIp={(d) => onAction("Rotated 4G IP", d)}
                  onSnapshot={(d) => onAction("Captured PNG Frame", d)}
                  onZoom={(d) => onAction("Opened Theater Zoom", d)}
                />

                <div className="mt-1.5 flex items-center justify-between font-mono text-[9.5px] text-slate-400">
                  <span>{dev.batteryPct}% · {dev.tempC.toFixed(1)}C · RAM {dev.ramUsedPct}%</span>
                  <span className="text-cyan-300">{dev.latencyMs}ms</span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-slate-200">{dev.orchestratorNote}</div>
              </div>
            );
          })}

          {/* 3rd Slot in Bottom Row: 4G Carrier Kaizen & Conversion Matrix */}
          <div className="mf-p2-panel flex flex-col justify-between p-2.5">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                <Activity className="h-3.5 w-3.5 text-emerald-300" />
                4G Carrier Kaizen
              </div>
              <div className="space-y-2">
                {lanes.map((lane) => (
                  <div key={lane.laneId} className="rounded-lg border border-white/10 bg-black/40 p-2 text-[10.5px]">
                    <div className="flex items-center justify-between">
                      <span className="truncate font-medium text-white">{lane.label}</span>
                      <span className={`font-mono font-semibold ${lane.convPct > 0 ? "text-emerald-300" : "text-slate-500"}`}>
                        {lane.convPct}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[9.5px] text-slate-400 tabular-nums">
                        {lane.live}/{lane.attempts} live · {lane.latencyMs}ms
                      </span>
                      <Sparkline values={lane.history} color={lane.convPct > 0 ? "#34d399" : "#64748b"} width={52} height={14} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[9.5px] text-slate-400">
              S9+ 0% auto-capped · FPT &amp; Pixel 7 prioritized
            </div>
          </div>
        </div>
      </div>

      {/* Right 4 cols: Realtime Operations Console + Quick Daemon Control */}
      <div className="mf-p2-panel flex flex-col gap-2.5 p-3 lg:col-span-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-200">
            <Terminal className="h-3.5 w-3.5" />
            <span>Realtime Ops Stream</span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-semibold text-emerald-300">
            <span className="mf-p2-pulse bg-emerald-400 text-emerald-400" style={{ width: 5, height: 5 }} />
            Streaming
          </span>
        </div>

        {/* Actionable Alert Pin */}
        {!dismissedAnr && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/45 bg-amber-500/15 px-2.5 py-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-amber-100">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span>Pixel 7 ANR dialog</span>
            </div>
            <button
              type="button"
              onClick={onDismissAnr}
              className="rounded border border-amber-400/50 bg-amber-500/25 px-2 py-0.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/35"
            >
              Auto-Dismiss
            </button>
          </div>
        )}

        {/* Device Filter Pills */}
        <div className="flex flex-wrap gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => setFilterDev("all")}
            className={`rounded px-2 py-0.5 ${
              filterDev === "all" ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-400"
            }`}
          >
            All
          </button>
          {devices.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setFilterDev(d.id)}
              className={`rounded px-2 py-0.5 font-mono ${
                filterDev === d.id ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-400"
              }`}
            >
              {d.shortCode}
            </button>
          ))}
        </div>

        {/* Live Scrolling Feed */}
        <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5">
          {filteredEvents.map((ev) => {
            const kindColor =
              ev.kind === "ANR"
                ? "bg-amber-500/20 text-amber-200"
                : ev.kind === "OTP"
                  ? "bg-cyan-500/20 text-cyan-200"
                  : ev.kind === "WAVE"
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-indigo-500/20 text-indigo-200";
            return (
              <div key={ev.id} className="rounded-lg border border-white/10 bg-black/45 p-2 text-[10.5px]">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[8.5px] font-semibold ${kindColor}`}>
                      {ev.kind}
                    </span>
                    <span className="font-mono font-semibold text-white">{ev.shortCode}</span>
                  </div>
                  <span className="font-mono text-[9.5px] text-slate-500">{ev.tsLabel}</span>
                </div>
                <div className="mt-1 text-slate-300 leading-snug">{ev.message}</div>
              </div>
            );
          })}
        </div>

        {/* Compact Daemon Quick Controls */}
        <div className="border-t border-white/10 pt-2">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Daemons ({MOCK_MISSION.activeDaemons}/{MOCK_MISSION.totalDaemons})</span>
            <span className="text-emerald-300">24/7 Auto</span>
          </div>
          <div className="space-y-1">
            {daemons.slice(0, 4).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded bg-black/40 px-2 py-1 text-[10px]">
                <span className="truncate text-slate-200">{d.title}</span>
                <button
                  type="button"
                  onClick={() => onAction(`Toggled ${d.title}`)}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[9px] text-cyan-200 hover:bg-white/10"
                >
                  <Play className="h-2.5 w-2.5" />
                  {d.status === "RUNNING" ? "Restart" : "Start"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
