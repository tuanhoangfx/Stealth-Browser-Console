import { useMemo, useState } from "react";
import { Activity, MonitorSmartphone, RotateCw, SlidersHorizontal, SunMedium, Trash2 } from "lucide-react";
import {
  HubListChromeHeader,
  HubResultCount,
  HubSearchField,
  HubSegmentToggle,
  KpiStrip,
  searchTextIncludes,
  type KpiTileData,
} from "@tool-workspace/hub-ui";
import { DeviceScreenCard } from "./DeviceScreenMock";
import { FARM_DAEMONS, KAIZEN_CARRIER_LANES, PHYSICAL_PHONES, VIRTUAL_PROFILES_SUMMARY } from "./mock";

export function V1SplitDockStage({ onAction }: { onAction: (msg: string) => void }) {
  const [osFilter, setOsFilter] = useState<"all" | "android" | "ios">("all");
  const [query, setQuery] = useState("");
  const [railOpen, setRailOpen] = useState(true);
  const [fps, setFps] = useState("1.5");

  const visiblePhones = useMemo(
    () =>
      PHYSICAL_PHONES.filter((p) => {
        if (osFilter !== "all" && p.os !== osFilter) return false;
        if (!query.trim()) return true;
        return searchTextIncludes([p.name, p.ip, p.activeTaskTitle, p.proxyLabel], query);
      }),
    [osFilter, query],
  );

  const kpiTiles: KpiTileData[] = [
    { id: "nodes", label: "Physical Nodes", value: "5 / 5 Wi-Fi", hint: "0 USB cables · 0% loss" },
    { id: "busy", label: "Live Workload", value: "5 / 5 Active", hint: "Cooldown Burst + Gateway" },
    { id: "fb100", label: "FB 100 Goal", value: "86 / 100", hint: "Wave #249 · 14 left" },
    { id: "proxy4g", label: "4G Proxies", value: "3 / 3 200 OK", hint: "502ms – 966ms avg" },
    { id: "thermal", label: "Fleet Thermal", value: "35.8 C Avg", hint: "All under emergency" },
  ];

  return (
    <div className="mf5-root space-y-3">
      <HubListChromeHeader
        title="Mobile Farm"
        icon={<MonitorSmartphone className="h-4 w-4 text-cyan-300" />}
        meta={[
          { label: "Nodes", value: "5/5 Wi-Fi" },
          { label: "Phase", value: "Cooldown Burst (4/5)" },
          { label: "Virtual Profiles", value: String(VIRTUAL_PROFILES_SUMMARY.total) },
        ]}
        kpiStrip={<KpiStrip tiles={kpiTiles} />}
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <HubSearchField
                value={query}
                onChange={setQuery}
                placeholder="Search device, IP, proxy, task..."
                className="w-60"
              />
              <HubSegmentToggle
                value={osFilter}
                onChange={(v) => setOsFilter(v as "all" | "android" | "ios")}
                options={[
                  { value: "all", label: "All Physical (5)" },
                  { value: "android", label: "Android (3)" },
                  { value: "ios", label: "iPhone (2)" },
                ]}
              />
              <HubResultCount shown={visiblePhones.length} total={PHYSICAL_PHONES.length} noun="phones" />
            </div>
            <button
              type="button"
              onClick={() => setRailOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-300" />
              {railOpen ? "Hide Control Rail" : "Show Control Rail"}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {railOpen ? (
          <aside className="mf5-surface space-y-3 p-3 lg:col-span-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">Fleet Control</div>
              <p className="mt-1 text-[11px] text-slate-400">Unified controls across 3 Android + 2 iOS Wi-Fi nodes.</p>
            </div>

            <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/30 p-2.5 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300">Stream Cadence</span>
                <span className="font-mono text-cyan-300">{fps}s</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.5"
                value={fps}
                onChange={(e) => setFps(e.target.value)}
                className="w-full accent-cyan-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onAction("Dimmed all 5 screens to minimum")}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1.5 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/20"
              >
                <SunMedium className="h-3.5 w-3.5" />
                Dim 0%
              </button>
              <button
                type="button"
                onClick={() => onAction("Rotated 4G IPs (:31080 / :31082)")}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Rotate 4G
              </button>
              <button
                type="button"
                onClick={() => onAction("Trimmed Android ZRAM caches")}
                className="col-span-2 inline-flex items-center justify-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] text-slate-200 hover:bg-white/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Trim ZRAM + Bloat (Android)
              </button>
            </div>

            <div className="space-y-1.5 border-t border-white/10 pt-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Active Daemons</div>
              {FARM_DAEMONS.map((d) => (
                <div key={d.id} className="rounded-lg border border-white/10 bg-black/35 p-2 text-[11px]">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-semibold text-slate-200">{d.title}</span>
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                      {d.status}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[10px] text-slate-400">{d.summary}</div>
                </div>
              ))}
            </div>
          </aside>
        ) : null}

        <div className={railOpen ? "space-y-3 lg:col-span-9" : "space-y-3 lg:col-span-12"}>
          {/* Live 5-Device Screen Wall */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            {visiblePhones.map((phone) => (
              <DeviceScreenCard key={phone.id} phone={phone} onAction={(a) => onAction(`Action queued: ${a}`)} />
            ))}
          </div>

          {/* Unified Carrier Kaizen Bar (Bottom) */}
          <div className="mf5-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Activity className="h-3.5 w-3.5 text-emerald-300" />
                4G Carrier Kaizen &amp; Conversion Lanes
              </div>
              <span className="text-[11px] text-slate-400">Deduplicated physical fleet · Pixel 7 promoted</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {KAIZEN_CARRIER_LANES.map((lane) => (
                <div key={lane.laneId} className="rounded-lg border border-white/10 bg-black/35 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-medium text-slate-100">{lane.label}</span>
                    <span className="font-mono text-emerald-300">{lane.convPct}%</span>
                  </div>
                  <div className="mt-1.5 mf5-bar-track">
                    <div
                      className="mf5-bar-fill bg-emerald-400"
                      style={{ width: `${Math.max(8, Math.min(100, lane.convPct * 3))}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                    <span>
                      {lane.live}/{lane.attempts} live
                    </span>
                    <span className="font-mono">{lane.latencyMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
