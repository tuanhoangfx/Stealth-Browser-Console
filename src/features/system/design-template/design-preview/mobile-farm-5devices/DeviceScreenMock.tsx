import { BatteryCharging, Copy, Cpu, Eye, Home, RotateCw, Smartphone, Wifi } from "lucide-react";
import type { PhysicalPhoneNode } from "./mock";

const ACCENT_RING: Record<PhysicalPhoneNode["accent"], string> = {
  emerald: "border-emerald-500/35 text-emerald-300",
  cyan: "border-cyan-500/35 text-cyan-300",
  amber: "border-amber-500/35 text-amber-300",
  violet: "border-violet-400/35 text-violet-300",
  sky: "border-sky-400/35 text-sky-300",
};

const PHASE_TONE: Record<PhysicalPhoneNode["taskPhase"], string> = {
  WAVE: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  "COOLDOWN BURST": "border-sky-400/40 bg-sky-500/15 text-sky-200",
  "24/7 GATEWAY": "border-amber-400/40 bg-amber-500/15 text-amber-200",
};

export function DeviceScreenCard({
  phone,
  compact = false,
  hero = false,
  selected = false,
  hoverActionsOnly = false,
  onSelect,
  onAction,
}: {
  phone: PhysicalPhoneNode;
  compact?: boolean;
  hero?: boolean;
  selected?: boolean;
  hoverActionsOnly?: boolean;
  onSelect?: () => void;
  onAction?: (action: string) => void;
}) {
  const screenClass = phone.os === "ios" ? "mf5-phone-screen mf5-phone-screen--ios" : "mf5-phone-screen";
  const ringClass = selected ? "ring-2 ring-cyan-400/70 border-cyan-400/50" : "";

  return (
    <div
      onClick={onSelect}
      className={`mf5-card group flex flex-col p-2.5 ${onSelect ? "cursor-pointer" : ""} ${ringClass}`}
    >
      {/* Top Identity Row */}
      <div className="mb-2 flex items-center justify-between gap-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`mf5-pulse-dot ${phone.isBusy ? "text-emerald-400 bg-emerald-400" : "text-slate-400 bg-slate-400"}`}
            />
            <span className="truncate text-xs font-semibold text-slate-100">{phone.name}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="font-mono text-slate-300">{phone.ip}</span>
            <span>·</span>
            <span className="truncate">{phone.transportLabel}</span>
          </div>
        </div>
        <span className={`mf5-pill ${ACCENT_RING[phone.accent]}`}>
          {phone.os === "ios" ? "iOS" : "Android"}
        </span>
      </div>

      {/* Live Physical Device Mirror Canvas */}
      <div className={`${screenClass} ${compact ? "max-h-[168px]" : hero ? "max-h-[430px]" : "max-h-[280px]"} w-full`}>
        {/* Simulated Mobile Status Bar */}
        <div className="flex items-center justify-between border-b border-white/10 bg-black/45 px-2.5 py-1 text-[9px] font-medium text-slate-300">
          <span className="flex items-center gap-1 font-mono">
            <Wifi className="h-2.5 w-2.5 text-emerald-400" />
            {phone.shortCode}
          </span>
          <span className="flex items-center gap-1 font-mono">
            <BatteryCharging className="h-2.5 w-2.5 text-emerald-400" />
            {phone.batteryPct}%
          </span>
        </div>

        {/* Simulated App Viewport */}
        <div className={`flex h-full flex-col justify-between ${compact ? "p-2 pb-7" : hero ? "p-4 pb-12" : "p-3 pb-10"}`}>
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-200">
                {phone.appBadge}
              </span>
              <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${PHASE_TONE[phone.taskPhase]}`}>
                {phone.taskPhase}
              </span>
            </div>

            {!compact ? (
              <div className="mt-2 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[9px] text-sky-300/90 truncate">
                {phone.screenUrl}
              </div>
            ) : null}

            <div className={`mt-2.5 rounded-lg border border-white/10 bg-slate-900/75 ${hero ? "p-3.5" : "p-2.5"}`}>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{phone.uiHeader}</div>
              <div className={`mt-0.5 font-semibold text-white ${hero ? "text-sm" : "text-[11px]"}`}>
                {phone.uiTitle}
              </div>
              {!compact ? (
                <ul className="mt-2 space-y-1 text-[10px] text-slate-300">
                  {phone.uiLines.slice(0, hero ? 4 : 3).map((line) => (
                    <li key={line} className="truncate font-mono text-[9.5px] text-slate-300/90">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
              {phone.lastOtp ? (
                <div className="mt-2 flex items-center justify-between rounded border border-amber-400/35 bg-amber-500/10 px-2 py-1 text-[10px] font-mono text-amber-200">
                  <span>OTP: {phone.lastOtp}</span>
                  <Copy className="h-3 w-3 opacity-80" />
                </div>
              ) : null}
            </div>
          </div>

          {/* Dim Mode / Backlight Clarity Overlay so user knows Dim 0% = Active! */}
          <div className="mt-2 flex items-center justify-between gap-2 rounded border border-white/10 bg-black/60 px-2 py-1 text-[9px] text-slate-300">
            <span className="flex min-w-0 items-center gap-1">
              <Eye className="h-2.5 w-2.5 shrink-0 text-cyan-300" />
              <span className="truncate">{phone.dimModeLabel}</span>
            </span>
            <span className="shrink-0 font-mono text-emerald-300">{phone.tempC.toFixed(1)}C</span>
          </div>
        </div>
      </div>

      {/* Concise Hardware & Proxy Metadata Footer */}
      {!compact ? (
        <div className="mt-2 space-y-1.5 text-[10px]">
          <div className="flex items-center justify-between gap-1 text-slate-300">
            <span className="truncate font-medium text-white">{phone.activeTaskTitle}</span>
            <span className="font-mono text-[10px] text-cyan-300">{phone.proxyLatencyMs}ms</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1 text-[9.5px] text-slate-400">
            <span>{phone.proxyLabel}</span>
            <span className="flex items-center gap-1">
              <Cpu className="h-2.5 w-2.5" />
              RAM {phone.ramUsedPct}% ({phone.ramFreeMb}MB)
            </span>
          </div>

          <div
            className={`flex items-center gap-1 pt-1 transition-opacity ${
              hoverActionsOnly ? "opacity-0 group-hover:opacity-100" : "opacity-100"
            }`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(`home:${phone.id}`);
              }}
              className="flex-1 rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] text-slate-200 hover:bg-white/10"
            >
              <span className="inline-flex items-center gap-1">
                <Home className="h-2.5 w-2.5" />
                Home
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(`rotate:${phone.id}`);
              }}
              className="flex-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-1 text-[10px] text-cyan-200 hover:bg-cyan-500/20"
            >
              <span className="inline-flex items-center gap-1">
                <RotateCw className="h-2.5 w-2.5" />
                4G IP
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(`inspect:${phone.id}`);
              }}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/10"
              title="Open phone inspector"
            >
              <Smartphone className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
