import { useState } from "react";
import { ChevronDown, ChevronUp, Cpu, MonitorSmartphone } from "lucide-react";
import { HubListChromeHeader, KpiStrip, type KpiTileData } from "@tool-workspace/hub-ui";
import { DeviceScreenCard } from "./DeviceScreenMock";
import { FARM_DAEMONS, KAIZEN_CARRIER_LANES, PHYSICAL_PHONES } from "./mock";

export function V2EqualFiveScreenGrid({ onAction }: { onAction: (msg: string) => void }) {
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);

  const kpiTiles: KpiTileData[] = [
    { id: "wall", label: "Live Mirrors", value: "5 / 5 Active", hint: "Pixel 6a · Pixel 7 · S9+ · 6s · 6s+" },
    { id: "fb", label: "Campaign", value: "86 / 100", hint: "Wave #249 · Parallel Cooldown" },
    { id: "avg", label: "Thermal Peak", value: "39.2 C Max", hint: "S9+ cooled · Pixels < 36 C" },
  ];

  return (
    <div className="mf5-root space-y-3">
      <HubListChromeHeader
        title="Mobile Farm · 5-Screen Wall"
        icon={<MonitorSmartphone className="h-4 w-4 text-emerald-300" />}
        meta={[
          { label: "Stream", value: "scrcpy + iOS MCP :8090" },
          { label: "Sync", value: "Live 1.0s" },
        ]}
        kpiStrip={<KpiStrip tiles={kpiTiles} />}
      />

      {/* Primary Hero: All 5 Physical Phone Screens side-by-side at full panoramic priority */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {PHYSICAL_PHONES.map((phone) => (
          <DeviceScreenCard key={phone.id} phone={phone} onAction={(a) => onAction(`Sent ${a}`)} />
        ))}
      </div>

      {/* Collapsible Telemetry & Daemons Accordion (keeps screen wall 70%+ of viewport) */}
      <div className="mf5-surface p-3">
        <button
          type="button"
          onClick={() => setTelemetryExpanded((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Cpu className="h-3.5 w-3.5 text-cyan-300" />
            Daemons (4 Healthy) &amp; 4G Carrier Conversion Matrix
          </div>
          <span className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
            {telemetryExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" /> Collapse Details
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> Expand Daemons &amp; Kaizen
              </>
            )}
          </span>
        </button>

        {telemetryExpanded ? (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-white/10 pt-3 lg:grid-cols-2">
            <div className="space-y-2">
              {FARM_DAEMONS.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/35 p-2.5 text-xs">
                  <div className="min-w-0 pr-3">
                    <div className="font-semibold text-slate-100">{d.title}</div>
                    <div className="truncate text-[10.5px] text-slate-400">{d.summary}</div>
                  </div>
                  <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                    {d.status}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {KAIZEN_CARRIER_LANES.map((lane) => (
                <div key={lane.laneId} className="rounded-lg border border-white/10 bg-black/35 p-2.5 text-xs">
                  <div className="font-medium text-slate-100">{lane.label}</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-cyan-300">{lane.convPct}%</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {lane.live}/{lane.attempts} live · {lane.latencyMs}ms
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
