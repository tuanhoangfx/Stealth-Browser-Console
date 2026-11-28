import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BatteryCharging,
  Camera,
  Cpu,
  Home,
  Radio,
  RotateCw,
  ShieldCheck,
  Terminal,
  Thermometer,
} from "lucide-react";
import { MOCK_MISSION } from "./mock";
import { DeviceOsBadge, MockPhoneViewport, PhaseBadge, Sparkline } from "./MockPhoneViewport";
import type { FarmPreviewProps } from "./tokens";

export function V2FocusSpotlight({
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
  const hero = devices.find((d) => d.id === selectedId) || devices[1] || devices[0];
  const others = devices.filter((d) => d.id !== hero.id);
  const heroAlert = Boolean(hero.alert && !dismissedAnr);
  const heroEvents = events.filter((e) => e.deviceId === hero.id);

  return (
    <div className="mf-p2-shell grid grid-cols-1 gap-3 p-3 text-slate-100 lg:grid-cols-12">
      {/* Left 5 cols: Hero Interactive Phone + Live ADB/MCP Inspector */}
      <div className="mf-p2-panel flex flex-col gap-2.5 p-3 lg:col-span-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="mf-p2-pulse bg-emerald-400 text-emerald-400" />
              <span className="text-sm font-semibold text-white">{hero.name}</span>
              <DeviceOsBadge os={hero.os} />
            </div>
            <div className="mt-0.5 font-mono text-[10.5px] text-slate-400">
              {hero.ip} · {hero.transport} · {hero.proxyLabel}
            </div>
          </div>
          <PhaseBadge phase={heroAlert ? "ATTENTION" : hero.phase} />
        </div>

        {heroAlert && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/50 bg-amber-500/15 px-2.5 py-2 text-xs text-amber-100">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
              <span>{hero.alert?.label}</span>
            </div>
            <button
              type="button"
              onClick={onDismissAnr}
              className="rounded border border-amber-400/60 bg-amber-400/20 px-2 py-0.5 text-[10.5px] font-semibold text-amber-100 hover:bg-amber-400/30"
            >
              {hero.alert?.actionLabel}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-6">
            <MockPhoneViewport
              device={hero}
              dismissedAnr={dismissedAnr}
              onTapScreen={onTapScreen}
              onDismissAnr={onDismissAnr}
              onCopyOtp={(otp) => onAction(`Copied OTP ${otp}`, hero)}
              showHoverControls={false}
            />
          </div>

          {/* Dedicated Hero Telemetry & Macro Controls */}
          <div className="flex flex-col justify-between gap-2 sm:col-span-6">
            <div className="space-y-2 rounded-lg border border-white/10 bg-black/40 p-2.5 text-[11px]">
              <div className="text-[9.5px] font-semibold uppercase tracking-wider text-cyan-300">
                Realtime Node Telemetry
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[10.5px] tabular-nums">
                <div className="rounded bg-white/[0.04] p-1.5">
                  <div className="text-[9px] text-slate-400">Battery</div>
                  <div className="flex items-center gap-1 text-emerald-300">
                    <BatteryCharging className="h-3 w-3" />
                    {hero.batteryPct}%
                  </div>
                </div>
                <div className="rounded bg-white/[0.04] p-1.5">
                  <div className="text-[9px] text-slate-400">Thermal</div>
                  <div className="flex items-center gap-1 text-amber-200">
                    <Thermometer className="h-3 w-3" />
                    {hero.tempC.toFixed(1)}C
                  </div>
                </div>
                <div className="rounded bg-white/[0.04] p-1.5">
                  <div className="text-[9px] text-slate-400">RAM</div>
                  <div className="flex items-center gap-1 text-sky-200">
                    <Cpu className="h-3 w-3" />
                    {hero.ramUsedPct}%
                  </div>
                </div>
                <div className="rounded bg-white/[0.04] p-1.5">
                  <div className="text-[9px] text-slate-400">RTT</div>
                  <div className="text-cyan-300">{hero.latencyMs}ms</div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-400">Ping Trend</span>
                <Sparkline values={hero.latencyHistory} color="#38bdf8" width={92} height={20} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => onAction("Sent Back Key", hero)}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-white/15 bg-white/5 py-1.5 hover:bg-white/10"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
              <button
                type="button"
                onClick={() => onAction("Sent Home Key", hero)}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-white/15 bg-white/5 py-1.5 hover:bg-white/10"
              >
                <Home className="h-3 w-3" /> Home
              </button>
              <button
                type="button"
                onClick={() => onAction("Rotated 4G Subnet", hero)}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-cyan-500/35 bg-cyan-500/10 py-1.5 text-cyan-200 hover:bg-cyan-500/20"
              >
                <RotateCw className="h-3 w-3" /> Rotate IP
              </button>
              <button
                type="button"
                onClick={() => onAction("Captured PNG Frame", hero)}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 py-1.5 text-emerald-200 hover:bg-emerald-500/20"
              >
                <Camera className="h-3 w-3" /> Snapshot
              </button>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/50 p-2">
              <div className="mb-1 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                <Terminal className="h-3 w-3 text-emerald-300" />
                Device Live Console
              </div>
              <div className="space-y-1 font-mono text-[9.5px]">
                {(heroEvents.length > 0 ? heroEvents : events.slice(0, 2)).slice(0, 3).map((ev) => (
                  <div key={ev.id} className="truncate text-slate-300">
                    <span className="text-slate-500">[{ev.tsLabel}]</span> {ev.message}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right 7 cols: 2x2 Filmstrip of remaining 4 devices + Live Fleet Strip */}
      <div className="flex flex-col gap-2.5 lg:col-span-7">
        <div className="mf-p2-panel flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-emerald-300">
              FB Goal {MOCK_MISSION.goalCurrent}/{MOCK_MISSION.goalTarget} (Wave #{MOCK_MISSION.waveNumber})
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-cyan-200">
              <Radio className="h-3.5 w-3.5" />
              4/4 SIM OK
            </span>
          </div>
          <span className="text-[11px] text-slate-400">Click any mini-node below to promote to Spotlight</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          {others.map((dev) => {
            const hasAlert = Boolean(dev.alert && !dismissedAnr);
            return (
              <div
                key={dev.id}
                onClick={() => onSelectDevice(dev.id)}
                className={`mf-p2-card flex cursor-pointer flex-col p-2 ${hasAlert ? "mf-p2-card--alert" : ""}`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`mf-p2-pulse ${
                        hasAlert ? "bg-amber-400 text-amber-400" : "bg-emerald-400 text-emerald-400"
                      }`}
                    />
                    <span className="truncate text-[11px] font-semibold text-white">{dev.name}</span>
                  </div>
                  <span className="font-mono text-[9px] text-slate-400">{dev.shortCode}</span>
                </div>

                <MockPhoneViewport
                  device={dev}
                  dismissedAnr={dismissedAnr}
                  compact
                  showHoverControls={false}
                  onCopyOtp={(otp) => onAction(`Copied OTP ${otp}`, dev)}
                />

                <div className="mt-1.5 flex items-center justify-between font-mono text-[9.5px] text-slate-400">
                  <span>{dev.tempC.toFixed(1)}C · {dev.batteryPct}%</span>
                  <span className="text-cyan-300">{dev.latencyMs}ms</span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-slate-200">{dev.taskTitle}</div>
              </div>
            );
          })}
        </div>

        {/* Compact Carrier & Daemons Strip */}
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          <div className="mf-p2-panel p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-200">
              <Activity className="h-3.5 w-3.5 text-emerald-300" />
              4G Carrier Kaizen
            </div>
            <div className="space-y-1.5">
              {lanes.map((lane) => (
                <div key={lane.laneId} className="flex items-center justify-between text-[10.5px]">
                  <span className="truncate text-slate-300">{lane.label}</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-slate-400">{lane.live}/{lane.attempts}</span>
                    <span className={lane.convPct > 0 ? "text-emerald-300" : "text-slate-500"}>{lane.convPct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mf-p2-panel p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-200">
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-300" />
              Active Daemons ({MOCK_MISSION.activeDaemons}/{MOCK_MISSION.totalDaemons})
            </div>
            <div className="space-y-1.5">
              {daemons.slice(0, 4).map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 text-[10.5px]">
                  <span className="truncate text-slate-200">{d.title}</span>
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
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
