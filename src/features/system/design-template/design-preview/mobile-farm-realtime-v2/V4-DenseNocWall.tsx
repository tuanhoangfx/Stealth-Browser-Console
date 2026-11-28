import { useState } from "react";
import { AlertTriangle, Layers, Radio, RotateCw, SlidersHorizontal, X } from "lucide-react";
import { MOCK_MISSION } from "./mock";
import { MockPhoneViewport, Sparkline } from "./MockPhoneViewport";
import type { FarmPreviewProps } from "./tokens";

type NocDrawerMode = null | "alerts" | "daemons" | "carriers";

export function V4DenseNocWall({
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
  const [drawer, setDrawer] = useState<NocDrawerMode>(null);
  const [density, setDensity] = useState<"5col" | "6col_virt">("5col");

  const alertCount = dismissedAnr ? 0 : 1;
  const latestEvent = events[0];

  return (
    <div className="mf-p2-shell relative flex flex-col gap-2 p-2.5 text-slate-100">
      {/* Ultra-slim 38px Command Bar — 88% viewport height goes directly to live screens */}
      <div className="mf-p2-panel flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
            <span className="mf-p2-pulse bg-emerald-400 text-emerald-400" />
            NOC 5/5
          </span>
          <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-indigo-200">
            FB {MOCK_MISSION.goalCurrent}/{MOCK_MISSION.goalTarget} · W#{MOCK_MISSION.waveNumber}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-cyan-200">
            <Radio className="h-3 w-3" />
            4/4 SIM · {MOCK_MISSION.avgTempC}C
          </span>
          <div className="flex items-center rounded border border-white/15 bg-black/40 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setDensity("5col")}
              className={`rounded px-2 py-0.5 ${
                density === "5col" ? "bg-emerald-500/20 text-emerald-200" : "text-slate-400"
              }`}
            >
              5 Physical
            </button>
            <button
              type="button"
              onClick={() => setDensity("6col_virt")}
              className={`rounded px-2 py-0.5 ${
                density === "6col_virt" ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400"
              }`}
            >
              + Virtual Preview
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDrawer((d) => (d === "alerts" ? null : "alerts"))}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold ${
              alertCount > 0
                ? "border-amber-400/55 bg-amber-500/20 text-amber-200"
                : "border-white/15 bg-white/5 text-slate-300"
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            Alerts ({alertCount})
          </button>
          <button
            type="button"
            onClick={() => setDrawer((d) => (d === "carriers" ? null : "carriers"))}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${
              drawer === "carriers"
                ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200"
                : "border-white/15 bg-white/5 text-slate-300"
            }`}
          >
            <Layers className="h-3 w-3" />
            4G Lanes
          </button>
          <button
            type="button"
            onClick={() => setDrawer((d) => (d === "daemons" ? null : "daemons"))}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] ${
              drawer === "daemons"
                ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-200"
                : "border-white/15 bg-white/5 text-slate-300"
            }`}
          >
            <SlidersHorizontal className="h-3 w-3" />
            Daemons ({MOCK_MISSION.activeDaemons}/{MOCK_MISSION.totalDaemons})
          </button>
          <button
            type="button"
            onClick={() => onAction("Rotate All 4G")}
            className="inline-flex items-center gap-1 rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-500/20"
          >
            <RotateCw className="h-3 w-3" />
            Rotate 4G
          </button>
        </div>
      </div>

      {/* Maximum-Density Wall */}
      <div
        className={`grid gap-2 ${
          density === "5col" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        }`}
      >
        {devices.map((dev) => {
          const hasAlert = Boolean(dev.alert && !dismissedAnr);
          const isSelected = selectedId === dev.id;
          return (
            <div
              key={dev.id}
              onClick={() => onSelectDevice(dev.id)}
              className={`mf-p2-card flex cursor-pointer flex-col p-1.5 ${
                hasAlert ? "mf-p2-card--alert" : ""
              } ${isSelected ? "ring-1 ring-cyan-400/75" : ""}`}
            >
              {/* Single compact micro-header */}
              <div className="mb-1 flex items-center justify-between gap-1 px-0.5 text-[10px]">
                <span className="flex min-w-0 items-center gap-1 font-semibold text-white">
                  <span
                    className={`mf-p2-pulse ${
                      hasAlert ? "bg-amber-400 text-amber-400" : "bg-emerald-400 text-emerald-400"
                    }`}
                  />
                  <span className="truncate">{dev.shortCode} · {dev.name.replace("Google ", "")}</span>
                </span>
                <span className="shrink-0 font-mono text-[9px] text-cyan-300">{dev.latencyMs}ms</span>
              </div>

              <MockPhoneViewport
                device={dev}
                dismissedAnr={dismissedAnr}
                compact
                onTapScreen={onTapScreen}
                onDismissAnr={onDismissAnr}
                onCopyOtp={(otp) => onAction(`Copied OTP ${otp}`, dev)}
                onHome={(d) => onAction("Sent Home Key", d)}
                onRotateIp={(d) => onAction("Rotated 4G IP", d)}
                onSnapshot={(d) => onAction("Captured PNG Frame", d)}
                onZoom={(d) => onAction("Opened Theater Zoom", d)}
              />

              {/* Micro-footer: 1 row telemetry */}
              <div className="mt-1 flex items-center justify-between px-0.5 font-mono text-[9px] text-slate-400 tabular-nums">
                <span>{dev.batteryPct}% · {dev.tempC.toFixed(1)}C</span>
                <span className="truncate max-w-[95px] text-slate-300">{dev.orchestratorState}</span>
              </div>
            </div>
          );
        })}

        {density === "6col_virt" && (
          <div className="mf-p2-card flex flex-col justify-between border-dashed border-cyan-500/35 p-2 text-center">
            <div className="text-[10px] font-semibold text-cyan-200">Virtual &amp; PC Slot #0012</div>
            <div className="my-auto space-y-1 text-[10px] text-slate-400">
              <div>U10 · Display 1</div>
              <div className="font-mono text-emerald-300">Ready in 6-col grid</div>
            </div>
            <button
              type="button"
              onClick={() => onAction("Spawned Virtual Display Pool")}
              className="rounded border border-cyan-400/35 bg-cyan-500/15 py-1 text-[10px] text-cyan-200 hover:bg-cyan-500/25"
            >
              Mount Slot
            </button>
          </div>
        )}
      </div>

      {/* Slim Bottom Live Ticker Ribbon */}
      {latestEvent && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1 text-[10.5px]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-emerald-300">
              LIVE
            </span>
            <span className="font-mono text-slate-500">{latestEvent.tsLabel}</span>
            <span className="font-mono font-semibold text-cyan-200">{latestEvent.shortCode}</span>
            <span className="truncate text-slate-200">{latestEvent.message}</span>
          </div>
          <span className="shrink-0 font-mono text-[9.5px] text-slate-400">
            Cycle #{MOCK_MISSION.orchestratorCycle} · 22 queued
          </span>
        </div>
      )}

      {/* Slide-Over Ops Drawer (only visible on demand) */}
      {drawer && (
        <div className="absolute right-3 top-14 z-20 w-80 rounded-xl border border-cyan-400/35 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-200">
              {drawer === "alerts" ? "Active Alerts" : drawer === "carriers" ? "4G Carrier Kaizen" : "Active Daemons"}
            </span>
            <button type="button" onClick={() => setDrawer(null)} className="text-slate-400 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {drawer === "alerts" && (
            <div className="space-y-2 text-xs">
              {!dismissedAnr ? (
                <div className="rounded-lg border border-amber-400/45 bg-amber-500/15 p-2.5">
                  <div className="font-semibold text-amber-200">Google Pixel 7 · ANR Popup</div>
                  <div className="mt-1 text-[11px] text-slate-300">Process system isn&apos;t responding</div>
                  <button
                    type="button"
                    onClick={onDismissAnr}
                    className="mt-2 w-full rounded bg-amber-500/25 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/35"
                  >
                    Auto-Dismiss ANR
                  </button>
                </div>
              ) : (
                <div className="py-4 text-center text-[11px] text-emerald-300">All 5 physical nodes healthy.</div>
              )}
            </div>
          )}

          {drawer === "carriers" && (
            <div className="space-y-2 text-[11px]">
              {lanes.map((lane) => (
                <div key={lane.laneId} className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-2">
                  <div>
                    <div className="font-medium text-white">{lane.label}</div>
                    <div className="text-[10px] text-slate-400">{lane.live}/{lane.attempts} live · {lane.latencyMs}ms</div>
                  </div>
                  <Sparkline values={lane.history} color={lane.convPct > 0 ? "#34d399" : "#64748b"} width={56} height={18} />
                </div>
              ))}
            </div>
          )}

          {drawer === "daemons" && (
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1 text-[11px]">
              {daemons.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded border border-white/10 bg-white/5 p-2">
                  <div className="min-w-0 pr-2">
                    <div className="truncate font-medium text-white">{d.title}</div>
                    <div className="truncate text-[10px] text-slate-400">{d.progress}</div>
                  </div>
                  <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-200">
                    {d.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
