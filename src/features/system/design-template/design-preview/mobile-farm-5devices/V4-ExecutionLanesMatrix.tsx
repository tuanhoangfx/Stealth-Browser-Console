import { Activity, Cpu, Layers, ShieldCheck } from "lucide-react";
import { HubListChromeHeader } from "@tool-workspace/hub-ui";
import { DeviceScreenCard } from "./DeviceScreenMock";
import { FARM_DAEMONS, KAIZEN_CARRIER_LANES, PHYSICAL_PHONES } from "./mock";

export function V4ExecutionLanesMatrix({ onAction }: { onAction: (msg: string) => void }) {
  const androidPhones = PHYSICAL_PHONES.filter((p) => p.os === "android");
  const iosPhones = PHYSICAL_PHONES.filter((p) => p.os === "ios");

  return (
    <div className="mf5-root space-y-3">
      <HubListChromeHeader
        title="Mobile Farm · OS-Segmented Parallel Lanes"
        icon={<Layers className="h-4 w-4 text-sky-300" />}
        meta={[
          { label: "Android Fleet", value: "3/3 Wi-Fi + 4G" },
          { label: "iOS Fleet", value: "2/2 Unlocked · Dim 0%" },
          { label: "Goal", value: "86 / 100 FB Live" },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Left/Center OS Swimlanes (9 cols) */}
        <div className="space-y-3 xl:col-span-9">
          {/* Lane 1: Android Root Fleet */}
          <section className="mf5-surface p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <Cpu className="h-3.5 w-3.5" />
                Android Rooted Swarm (3/3 Online · ADB Wi-Fi :5555)
              </div>
              <span className="mf5-pill border-emerald-500/30 text-emerald-200">Pixel 6a + Pixel 7 + Galaxy S9+</span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              {androidPhones.map((phone) => (
                <DeviceScreenCard key={phone.id} phone={phone} onAction={(a) => onAction(`Android ${a}`)} />
              ))}
            </div>
          </section>

          {/* Lane 2: iOS Jailbroken Crane Fleet */}
          <section className="mf5-surface p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                iOS Jailbroken Crane Fleet (2/2 Unlocked · Auto-Lock Never · Dim 0%)
              </div>
              <span className="mf5-pill border-violet-400/30 text-violet-200">iPhone 6s + iPhone 6s Plus (:8090/mcp)</span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {iosPhones.map((phone) => (
                <DeviceScreenCard key={phone.id} phone={phone} onAction={(a) => onAction(`iOS ${a}`)} />
              ))}
            </div>
          </section>
        </div>

        {/* Right Ops Rail (3 cols) */}
        <aside className="mf5-surface space-y-3 p-3 xl:col-span-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
            <Activity className="h-3.5 w-3.5" />
            Live Daemons &amp; Bursts
          </div>

          <div className="space-y-2">
            {FARM_DAEMONS.map((d) => (
              <div key={d.id} className="rounded-lg border border-white/10 bg-black/35 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-slate-100">{d.title}</span>
                  <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-sky-200">
                    {d.status}
                  </span>
                </div>
                <div className="mt-1.5 mf5-bar-track">
                  <div className="mf5-bar-fill bg-cyan-400" style={{ width: `${d.progressPct}%` }} />
                </div>
                <div className="mt-1.5 text-[10.5px] leading-snug text-slate-300">{d.summary}</div>
                <div className="mt-1 font-mono text-[9.5px] text-slate-400">{d.meta}</div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 pt-2.5">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Carrier Conversion
            </div>
            <div className="space-y-1.5">
              {KAIZEN_CARRIER_LANES.map((lane) => (
                <div key={lane.laneId} className="flex items-center justify-between rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[10.5px]">
                  <span className="truncate text-slate-200">{lane.label}</span>
                  <span className="font-mono font-semibold text-emerald-300">{lane.convPct}%</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
