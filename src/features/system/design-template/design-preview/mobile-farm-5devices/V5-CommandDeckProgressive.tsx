import { useState } from "react";
import { Command } from "lucide-react";
import { HubListChromeHeader } from "@tool-workspace/hub-ui";
import { DeviceScreenCard } from "./DeviceScreenMock";
import { FARM_DAEMONS, KAIZEN_CARRIER_LANES, PHYSICAL_PHONES, VIRTUAL_PROFILES_SUMMARY } from "./mock";

type LowerTab = "bursts" | "daemons" | "kaizen" | "profiles";

export function V5CommandDeckProgressive({ onAction }: { onAction: (msg: string) => void }) {
  const [focusedId, setFocusedId] = useState<string>("all");
  const [lowerTab, setLowerTab] = useState<LowerTab>("bursts");

  const phones = focusedId === "all" ? PHYSICAL_PHONES : PHYSICAL_PHONES.filter((p) => p.id === focusedId);

  return (
    <div className="mf5-root space-y-3">
      <HubListChromeHeader
        ariaLabel="Mobile Farm Executive Deck"
        title="Mobile Farm"
        titleIcon={Command}
        embedded
        metaItems={[
          { icon: Command, title: "Physical Fleet", value: "5 / 5 Wi-Fi" },
          { icon: Command, title: "Campaign", value: "86 / 100 FB Live" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setFocusedId("all")}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            focusedId === "all"
              ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          All 5 Devices
        </button>
        {PHYSICAL_PHONES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setFocusedId((cur) => (cur === p.id ? "all" : p.id))}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              focusedId === p.id
                ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            <span className="mf5-pulse-dot bg-emerald-400 text-emerald-400" />
            <span>{p.shortCode}</span>
            <span className="font-mono text-[10px] text-slate-400">
              {p.batteryPct}% · {p.tempC.toFixed(0)}C
            </span>
          </button>
        ))}
      </div>

      {/* Hover-Clean 5-Screen Grid (actions appear cleanly on hover to reduce idle noise) */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {phones.map((phone) => (
          <DeviceScreenCard
            key={phone.id}
            phone={phone}
            hoverActionsOnly
            onAction={(a) => onAction(`Executive action: ${a}`)}
          />
        ))}
      </div>

      {/* Single Progressive Tabbed Lower Console (zero stacked vertical bloat) */}
      <div className="mf5-surface p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["bursts", "Active Bursts (5)"],
                ["daemons", "Daemons (4)"],
                ["kaizen", "Carrier Kaizen (4)"],
                ["profiles", `Virtual Users (${VIRTUAL_PROFILES_SUMMARY.total})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setLowerTab(id)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                  lowerTab === id
                    ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">Single unified drawer · Hub-UI SSOT</span>
        </div>

        {lowerTab === "bursts" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {PHYSICAL_PHONES.map((p) => (
              <div key={p.id} className="rounded-lg border border-white/10 bg-black/35 p-2.5 text-xs">
                <div className="font-semibold text-white">{p.name}</div>
                <div className="mt-0.5 text-[11px] text-cyan-300">{p.activeTaskTitle}</div>
                <div className="mt-1 font-mono text-[10px] text-slate-400">
                  {p.taskPhase} · {p.proxyLabel}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {lowerTab === "daemons" ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {FARM_DAEMONS.map((d) => (
              <div key={d.id} className="rounded-lg border border-white/10 bg-black/35 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{d.title}</span>
                  <span className="text-[10px] font-semibold text-emerald-300">{d.status}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-300">{d.summary}</div>
              </div>
            ))}
          </div>
        ) : null}

        {lowerTab === "kaizen" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {KAIZEN_CARRIER_LANES.map((lane) => (
              <div key={lane.laneId} className="rounded-lg border border-white/10 bg-black/35 p-2.5 text-xs">
                <div className="font-medium text-slate-100">{lane.label}</div>
                <div className="mt-1 font-mono text-sm font-semibold text-emerald-300">{lane.convPct}%</div>
                <div className="text-[10px] text-slate-400">
                  {lane.live}/{lane.attempts} live · {lane.latencyMs}ms
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {lowerTab === "profiles" ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/35 p-3 text-xs text-slate-300">
            <span>
              PC Stealth + Mobile Vault Profiles: <strong className="text-white">{VIRTUAL_PROFILES_SUMMARY.total}</strong>{" "}
              ({VIRTUAL_PROFILES_SUMMARY.running} active, {VIRTUAL_PROFILES_SUMMARY.standby} standby)
            </span>
            <div className="flex gap-1.5 font-mono text-[11px]">
              {VIRTUAL_PROFILES_SUMMARY.sampleCodes.map((code) => (
                <span key={code} className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-cyan-200">
                  #{code}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
