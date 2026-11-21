import { useState } from "react";
import { ArrowLeft, Copy, Home, RotateCw, Smartphone, Terminal } from "lucide-react";
import { HubListChromeHeader } from "@tool-workspace/hub-ui";
import { DeviceScreenCard } from "./DeviceScreenMock";
import { KAIZEN_CARRIER_LANES, PHYSICAL_PHONES } from "./mock";

export function V3HeroStageFilmstrip({ onAction }: { onAction: (msg: string) => void }) {
  const [selectedId, setSelectedId] = useState<string>(PHYSICAL_PHONES[3].id); // Default highlight iPhone 6s to show active Dim 0% inspect
  const focused = PHYSICAL_PHONES.find((p) => p.id === selectedId) || PHYSICAL_PHONES[0];

  return (
    <div className="mf5-root space-y-3">
      <HubListChromeHeader
        ariaLabel="Mobile Farm Hero Inspector"
        title="Mobile Farm · Hero Focus + 5-Phone Filmstrip"
        titleIcon={Smartphone}
        embedded
        metaItems={[
          { icon: Smartphone, title: "Focused Node", value: `${focused.name} (${focused.ip})` },
          { icon: Terminal, title: "Fleet Online", value: "5 / 5 Wi-Fi" },
        ]}
      />

      {/* Top 5-Phone Interactive Filmstrip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {PHYSICAL_PHONES.map((phone) => (
          <DeviceScreenCard
            key={phone.id}
            phone={phone}
            compact
            selected={phone.id === focused.id}
            onSelect={() => setSelectedId(phone.id)}
          />
        ))}
      </div>

      {/* Hero Split Stage: Enlarged Live Mirror Left + Detailed Step/Action Inspector Right */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="mf5-surface flex items-center justify-center p-4 lg:col-span-5">
          <div className="w-full max-w-[300px]">
            <DeviceScreenCard phone={focused} hero selected onAction={(a) => onAction(`Hero action: ${a}`)} />
          </div>
        </div>

        <div className="mf5-surface flex flex-col justify-between space-y-3 p-4 lg:col-span-7">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                  {focused.osLabel} · {focused.role}
                </div>
                <h3 className="text-base font-semibold text-white">
                  {focused.name} · {focused.activeTaskTitle}
                </h3>
              </div>
              <span className="mf5-pill border-emerald-400/35 text-emerald-200">
                {focused.taskPhase}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-black/35 p-2.5 text-xs">
                <div className="text-[10px] text-slate-400">Power &amp; Charge</div>
                <div className="mt-0.5 font-mono font-semibold text-emerald-300">{focused.batteryPct}% AC</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/35 p-2.5 text-xs">
                <div className="text-[10px] text-slate-400">Temperature</div>
                <div className="mt-0.5 font-mono font-semibold text-sky-300">{focused.tempC.toFixed(1)} C</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/35 p-2.5 text-xs">
                <div className="text-[10px] text-slate-400">4G Route</div>
                <div className="mt-0.5 font-mono font-semibold text-cyan-200">{focused.proxyIp}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/35 p-2.5 text-xs">
                <div className="text-[10px] text-slate-400">Free Memory</div>
                <div className="mt-0.5 font-mono font-semibold text-slate-100">{focused.ramFreeMb} MB</div>
              </div>
            </div>

            {/* Direct Gesture & Device Action Bar */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onAction(`Back sent to ${focused.name}`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button
                type="button"
                onClick={() => onAction(`Home sent to ${focused.name}`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
              >
                <Home className="h-3.5 w-3.5" /> Home
              </button>
              <button
                type="button"
                onClick={() => onAction(`Rotated 4G IP for ${focused.name}`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25"
              >
                <RotateCw className="h-3.5 w-3.5" /> Rotate 4G IP
              </button>
              <button
                type="button"
                onClick={() => onAction(`Copied SIM / Auth token for ${focused.name}`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/25"
              >
                <Copy className="h-3.5 w-3.5" /> Copy Last OTP
              </button>
            </div>

            {/* Live Automation Trace */}
            <div className="rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[11px] text-slate-300">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Terminal className="h-3 w-3 text-emerald-300" /> Live Device Trace ({focused.transportLabel})
              </div>
              <div>[03:10:48] Phase: {focused.taskPhase} · App: {focused.appBadge}</div>
              <div>[03:10:52] Viewport: {focused.screenUrl} · Display: {focused.dimModeLabel}</div>
              <div>[03:11:02] Proxy: {focused.proxyLabel} -&gt; {focused.proxyIp} ({focused.proxyLatencyMs}ms)</div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-2.5">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              4G Carrier Benchmark
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {KAIZEN_CARRIER_LANES.map((lane) => (
                <div key={lane.laneId} className="rounded border border-white/10 bg-black/35 px-2 py-1.5 text-[10px]">
                  <div className="truncate font-medium text-slate-200">{lane.label}</div>
                  <div className="font-mono text-emerald-300">{lane.convPct}% · {lane.latencyMs}ms</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
