import { useState, type MouseEvent } from "react";
import { AlertTriangle, Camera, CheckCircle2, Copy, Home, Maximize2, Rocket, RotateCw, ShieldCheck } from "lucide-react";
import type { MockPhysicalDevice } from "./mock";

export function Sparkline({
  values,
  color = "#34d399",
  height = 20,
  width = 76,
}: {
  values: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  const safe = values.length >= 2 ? values : [1, 1];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const span = Math.max(1, max - min);
  const pts = safe
    .map((v, idx) => {
      const x = (idx / (safe.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible" style={{ width, height }}>
      <polyline fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

export function MockPhoneViewport({
  device,
  dismissedAnr,
  onTapScreen,
  onDismissAnr,
  onCopyOtp,
  onHome,
  onRotateIp,
  onSnapshot,
  onZoom,
  compact = false,
  showHoverControls = true,
}: {
  device: MockPhysicalDevice;
  dismissedAnr: boolean;
  onTapScreen?: (dev: MockPhysicalDevice, xPct: number, yPct: number) => void;
  onDismissAnr?: (dev: MockPhysicalDevice) => void;
  onCopyOtp?: (otp: string) => void;
  onHome?: (dev: MockPhysicalDevice) => void;
  onRotateIp?: (dev: MockPhysicalDevice) => void;
  onSnapshot?: (dev: MockPhysicalDevice) => void;
  onZoom?: (dev: MockPhysicalDevice) => void;
  compact?: boolean;
  showHoverControls?: boolean;
}) {
  const [ripple, setRipple] = useState<{ x: number; y: number; id: number } | null>(null);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100));
    const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100));
    const id = Date.now();
    setRipple({ x: xPct, y: yPct, id });
    window.setTimeout(() => {
      setRipple((curr) => (curr?.id === id ? null : curr));
    }, 560);
    onTapScreen?.(device, xPct, yPct);
  };

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onTapScreen?.(device, 50, 50);
        }
      }}
      title={`Click anywhere on ${device.name} to simulate live touch`}
      className="mf-p2-screen group/screen relative w-full cursor-crosshair select-none focus:outline-none"
    >
      {/* Pure Phone Screen Content — zero permanent top/bottom black bars inside the screen */}
      {device.screenScene === "chrome_code" && (
        <div className="flex h-full flex-col justify-between bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 p-2.5 text-left">
          <div className="space-y-1.5 pt-2">
            <div className="text-[10px] font-semibold text-slate-200 leading-tight">
              Enter the confirmation code
            </div>
            <div className="h-1.5 w-4/5 rounded bg-slate-600/60" />
            <div className="mt-2 h-7 rounded border border-slate-600/70 bg-slate-950/80 px-2 flex items-center font-mono text-[10px] text-cyan-200">
              FB-••••••
            </div>
          </div>
          <div className="rounded-xl border border-white/15 bg-slate-800/95 p-2.5 shadow-lg">
            <div className="mx-auto mb-1.5 h-6 w-6 rounded-full bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-[10px] text-sky-200">
              m
            </div>
            <div className="text-[9.5px] font-medium text-white leading-snug">
              Chrome notifications make things easier
            </div>
            <div className="mt-2 flex items-center justify-end gap-1.5 text-[8.5px]">
              <span className="rounded px-1.5 py-0.5 text-slate-300">No thanks</span>
              <span className="rounded-full bg-sky-500 px-2 py-0.5 font-semibold text-slate-950">Continue</span>
            </div>
          </div>
        </div>
      )}

      {device.screenScene === "android_anr" && (
        <div className="relative flex h-full flex-col justify-end bg-gradient-to-br from-teal-900 via-emerald-950 to-slate-950 p-2.5">
          <div className="absolute inset-x-3 top-4 flex items-center justify-between text-[8.5px] text-emerald-100/70">
            <span>Sun, Nov 22</span>
            <span>LTE · 85%</span>
          </div>
          {!dismissedAnr ? (
            <div className="my-auto rounded-xl border border-amber-400/45 bg-slate-900/95 p-2.5 shadow-xl">
              <div className="flex items-center gap-1.5 text-[9.5px] font-semibold text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span>Process system isn&apos;t responding</span>
              </div>
              <div className="mt-2 space-y-1 text-[8.5px] text-slate-300">
                <div className="rounded bg-white/5 px-2 py-1">× Close app</div>
                <div className="rounded bg-white/5 px-2 py-1">◷ Wait</div>
              </div>
              {onDismissAnr && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismissAnr(device);
                  }}
                  className="mt-2 w-full rounded bg-amber-500/25 border border-amber-400/50 py-1 text-[9px] font-semibold text-amber-100 hover:bg-amber-500/35"
                >
                  Auto-Dismiss ANR
                </button>
              )}
            </div>
          ) : (
            <div className="my-auto rounded-lg border border-emerald-400/35 bg-emerald-950/75 p-2 text-center text-[9.5px] text-emerald-200">
              <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-emerald-400" />
              Launcher Recovered
            </div>
          )}
          <div className="grid grid-cols-4 gap-1.5 pt-2">
            {["G", "M", "F", "Y"].map((app) => (
              <div
                key={app}
                className="flex aspect-square items-center justify-center rounded-lg border border-white/10 bg-white/10 text-[9px] font-bold text-white"
              >
                {app}
              </div>
            ))}
          </div>
        </div>
      )}

      {device.screenScene === "google_login" && (
        <div className="flex h-full flex-col justify-between bg-slate-100 p-2.5 text-slate-900">
          <div className="flex items-center justify-between text-[8px] font-medium text-slate-500">
            <span>SIM :31081</span>
            <span>4G+</span>
          </div>
          <div className="my-auto space-y-2 text-center">
            <div className="text-xs font-bold tracking-tight">
              <span className="text-blue-600">G</span>
              <span className="text-red-500">o</span>
              <span className="text-amber-500">o</span>
              <span className="text-blue-600">g</span>
              <span className="text-green-600">l</span>
              <span className="text-red-500">e</span>
            </div>
            <div className="text-[10px] font-semibold text-slate-800">Sign in</div>
            <div className="rounded border border-slate-300 bg-white px-2 py-1 text-left text-[8.5px] text-slate-500">
              Email or phone
            </div>
            <div className="ml-auto w-fit rounded bg-blue-600 px-2.5 py-0.5 text-[8.5px] font-semibold text-white">
              Next
            </div>
          </div>
          {device.lastOtp ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCopyOtp?.(device.lastOtp!);
              }}
              className="flex items-center justify-between rounded-md border border-amber-500/50 bg-slate-950/90 px-2 py-1 font-mono text-[9.5px] text-amber-200 shadow"
              title="Copy latest OTP"
            >
              <span>OTP: {device.lastOtp}</span>
              <Copy className="h-2.5 w-2.5" />
            </button>
          ) : (
            <div className="h-2" />
          )}
        </div>
      )}

      {device.screenScene === "rocket_boot" && (
        <div className="flex h-full flex-col items-center justify-between bg-gradient-to-b from-sky-600 via-sky-700 to-blue-900 p-2.5 text-white">
          <div className="flex w-full items-center justify-between text-[8px] text-sky-100/80">
            <span>Safari</span>
            <span>19:15</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10">
              <Rocket className="h-6 w-6 text-white" />
            </div>
            <span className="text-[9px] font-medium text-sky-100">Threads Probe</span>
          </div>
          <div className="h-1 w-12 rounded-full bg-white/50" />
        </div>
      )}

      {device.screenScene === "ios_springboard" && (
        <div className="flex h-full flex-col justify-between bg-gradient-to-b from-amber-700 via-rose-900 to-slate-950 p-2.5 text-white">
          <div className="flex items-center justify-between text-[8px] text-white/80">
            <span>Viettel</span>
            <span>19:15</span>
            <span>62%</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 my-auto">
            {[
              { l: "SL", c: "bg-slate-800" },
              { l: "FB", c: "bg-blue-600" },
              { l: "TG", c: "bg-sky-500" },
              { l: "IG", c: "bg-pink-600" },
              { l: "CR", c: "bg-emerald-600" },
              { l: "DP", c: "bg-indigo-600" },
              { l: "SF", c: "bg-sky-600" },
              { l: "ST", c: "bg-zinc-700" },
            ].map((item) => (
              <div key={item.l} className="flex flex-col items-center gap-0.5">
                <div className={`flex h-6 w-6 items-center justify-center rounded-md ${item.c} text-[8px] font-bold shadow`}>
                  {item.l}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-white/15 p-1.5 backdrop-blur-xs">
            <div className="h-5 rounded bg-emerald-500/80" />
            <div className="h-5 rounded bg-sky-500/80" />
            <div className="h-5 rounded bg-blue-500/80" />
            <div className="h-5 rounded bg-slate-700/80" />
          </div>
        </div>
      )}

      {/* Subtle corner live FPS indicator (non-intrusive) */}
      <div className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/65 px-1.5 py-0.5 font-mono text-[8.5px] text-emerald-300 backdrop-blur-xs">
        <span className="mf-p2-pulse bg-emerald-400 text-emerald-400" style={{ width: 5, height: 5 }} />
        <span>{device.fps}fps</span>
        {!compact && <span className="text-slate-400">· {device.frameAgeMs}ms</span>}
      </div>

      {/* Hover-only floating action pill (keeps screen 100% clean during passive monitoring) */}
      {showHoverControls && (
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/screen:opacity-100">
          {onHome && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onHome(device);
              }}
              title="Home"
              className="rounded bg-black/75 p-1 text-slate-200 border border-white/15 hover:border-cyan-400/50 hover:text-cyan-200"
            >
              <Home className="h-2.5 w-2.5" />
            </button>
          )}
          {onRotateIp && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRotateIp(device);
              }}
              title="Rotate 4G IP"
              className="rounded bg-black/75 p-1 text-cyan-200 border border-white/15 hover:border-cyan-400/50"
            >
              <RotateCw className="h-2.5 w-2.5" />
            </button>
          )}
          {onSnapshot && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSnapshot(device);
              }}
              title="Capture Frame"
              className="rounded bg-black/75 p-1 text-slate-200 border border-white/15 hover:border-cyan-400/50"
            >
              <Camera className="h-2.5 w-2.5" />
            </button>
          )}
          {onZoom && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onZoom(device);
              }}
              title="Focus / Theater"
              className="rounded bg-black/75 p-1 text-emerald-200 border border-white/15 hover:border-emerald-400/50"
            >
              <Maximize2 className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      )}

      {/* Simulated Touch Ripple */}
      {ripple && (
        <span
          className="mf-p2-ripple pointer-events-none absolute h-6 w-6 rounded-full border-2 border-cyan-300 bg-cyan-400/30"
          style={{ left: `${ripple.x}%`, top: `${ripple.y}%` }}
        />
      )}
    </div>
  );
}

export function DeviceOsBadge({ os }: { os: "android" | "ios" }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
        os === "ios"
          ? "border-violet-400/35 bg-violet-500/10 text-violet-200"
          : "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
      }`}
    >
      {os === "ios" ? "iOS" : "Android"}
    </span>
  );
}

export function PhaseBadge({ phase }: { phase: MockPhysicalDevice["phase"] }) {
  const tone =
    phase === "ATTENTION"
      ? "border-amber-400/45 bg-amber-500/15 text-amber-200"
      : phase === "24/7 GATEWAY"
        ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200"
        : "border-emerald-400/35 bg-emerald-500/15 text-emerald-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[8.5px] font-semibold ${tone}`}>
      <ShieldCheck className="h-2.5 w-2.5" />
      {phase}
    </span>
  );
}
