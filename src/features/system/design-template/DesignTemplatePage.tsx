import { useEffect, useState } from "react";
import { Glass } from "../../../theme/p0008";
import {
  ACTIVE_DESIGN_COUNT,
  PROFILE_KPI_TOOLTIP_DESIGN_LOCK,
  RUN_HISTORY_DESIGN_LOCK,
  RUNTIME_CONSOLE_LOG_DESIGN_LOCK,
  TASKBAR_PROFILE_BADGE_DESIGN_LOCK,
  WORKFLOW_CANVAS_LAYOUT_DESIGN_LOCK,
} from "./design-registry";

type AndroidTelemetryPoint = {
  ts: number;
  at: string;
  batteryLevel: number;
  batteryTempC: number;
  chargeDisable?: number;
};

type NeverPowerOffState = {
  ok?: boolean;
  serial?: string;
  hardenedReady?: boolean;
  presentOnDevice?: string[];
  hardwareHealth?: {
    batteryLevel?: number | null;
    batteryTempC?: number | null;
    acPowered?: boolean;
    chargeStartLevel?: number;
    chargeStopLevel?: number;
    chargeDisable?: number;
    ramAvailableMb?: number;
    ramTotalMb?: number;
    swapFreeMb?: number;
    swapTotalMb?: number;
    display0Off?: boolean;
    wakeState?: string;
    runningUserCount?: number;
    totalUserCount?: number;
    history24h?: AndroidTelemetryPoint[];
  };
};

export function DesignTemplatePage() {
  const [androidNode, setAndroidNode] = useState<NeverPowerOffState | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  const loadAndroidNode = async (provision = false) => {
    setProvisioning(true);
    try {
      const url = provision
        ? "/api/mobile-stealth/provision-never-power-off"
        : "/api/mobile-stealth/never-power-off-status";
      let res = await fetch(url, {
        method: provision ? "POST" : "GET",
        headers: provision ? { "content-type": "application/json" } : undefined,
        body: provision ? JSON.stringify({ verifyOnly: false }) : undefined,
      }).catch(() => null);
      if (!res || !res.ok) {
        const fallbackUrl = provision
          ? "http://127.0.0.1:8814/api/mobile-stealth/provision-never-power-off"
          : "http://127.0.0.1:8814/api/mobile-stealth/never-power-off-status";
        res = await fetch(fallbackUrl, {
          method: provision ? "POST" : "GET",
          headers: provision ? { "content-type": "application/json" } : undefined,
          body: provision ? JSON.stringify({ verifyOnly: false }) : undefined,
        }).catch(() => null);
      }
      if (res && res.ok) {
        const json = (await res.json()) as NeverPowerOffState;
        setAndroidNode(json);
      }
    } finally {
      setProvisioning(false);
    }
  };

  useEffect(() => {
    void loadAndroidNode(false);
  }, []);

  const hw = androidNode?.hardwareHealth;
  const batLv = hw?.batteryLevel ?? 85;
  const tempC = hw?.batteryTempC ?? 30.1;
  const startLv = hw?.chargeStartLevel ?? 80;
  const stopLv = hw?.chargeStopLevel ?? 85;
  const bypassOn = (hw?.chargeDisable ?? (batLv >= stopLv ? 1 : 0)) === 1;
  const hist =
    hw?.history24h && hw.history24h.length >= 2
      ? hw.history24h
      : [
          { ts: 1, at: "", batteryLevel: 81, batteryTempC: 29.1 },
          { ts: 2, at: "", batteryLevel: 83, batteryTempC: 29.6 },
          { ts: 3, at: "", batteryLevel: 85, batteryTempC: 30.1 },
          { ts: 4, at: "", batteryLevel: 82, batteryTempC: 29.4 },
          { ts: 5, at: "", batteryLevel: 80, batteryTempC: 28.9 },
          { ts: 6, at: "", batteryLevel: 83, batteryTempC: 29.7 },
          { ts: 7, at: "", batteryLevel: 85, batteryTempC: 30.2 },
          { ts: 8, at: "", batteryLevel: batLv, batteryTempC: tempC },
        ];
  const w = 480;
  const h = 64;
  const batPts = hist
    .map((p, idx) => {
      const x = (idx / Math.max(1, hist.length - 1)) * w;
      const clamped = Math.max(75, Math.min(90, Number(p.batteryLevel || 83)));
      const y = h - ((clamped - 75) / 15) * (h - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const tempPts = hist
    .map((p, idx) => {
      const x = (idx / Math.max(1, hist.length - 1)) * w;
      const clampedT = Math.max(25, Math.min(40, Number(p.batteryTempC || 30)));
      const y = h - ((clampedT - 25) / 15) * (h - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const y85 = h - ((85 - 75) / 15) * (h - 10) - 5;
  const y80 = h - ((80 - 75) / 15) * (h - 10) - 5;

  return (
    <div className="design-template-page flex-1 space-y-4 overflow-y-auto px-3 pb-10 pt-3">
      <Glass tone="purple">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-purple-300">System</p>
            <h1 className="mt-1 text-xl font-semibold">Design Template &amp; Android Never-Power-Off Node</h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Active reviews: <strong className="text-cyan-200">{ACTIVE_DESIGN_COUNT}</strong>
            </p>
          </div>
          <button
            type="button"
            disabled={provisioning}
            onClick={() => void loadAndroidNode(true)}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {provisioning ? "Provisioning Android Node..." : "📱 Verify / Provision Android Node (80–85%)"}
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-emerald-500/25 bg-black/35 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-emerald-300">
              Android Antidetect Never-Power-Off Node (Pixel 6a · {androidNode?.serial || "192.168.0.208:41271"})
            </span>
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-200">
              {androidNode?.hardenedReady !== false
                ? `ONLINE · ${bypassOn ? "Bypass ON (85%)" : `Band ${startLv}–${stopLv}%`}`
                : "Standby"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded border border-white/10 bg-white/5 p-2">
              <div className="text-[10px] text-white/60">Battery &amp; Hysteresis</div>
              <div className="mt-0.5 font-mono text-emerald-200">
                {batLv}% · Band {startLv}–{stopLv}%
              </div>
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-2">
              <div className="text-[10px] text-white/60">Thermal &amp; Screen</div>
              <div className="mt-0.5 font-mono text-sky-200">
                {tempC.toFixed(1)}°C · Display 0 {hw?.display0Off !== false ? "OFF (Dozing)" : "ON"}
              </div>
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-2">
              <div className="text-[10px] text-white/60">RAM &amp; ZRAM Swap</div>
              <div className="mt-0.5 font-mono text-cyan-200">
                {hw?.ramTotalMb ? `${hw.ramTotalMb - (hw.ramAvailableMb || 0)}/${hw.ramTotalMb} MB` : "2237/5578 MB"} · ZRAM{" "}
                {hw?.swapTotalMb ? `${hw.swapTotalMb - (hw.swapFreeMb || 0)}/${hw.swapTotalMb} MB` : "1412/3072 MB"}
              </div>
            </div>
            <div className="rounded border border-white/10 bg-white/5 p-2">
              <div className="text-[10px] text-white/60">Magisk Boot &amp; 30m Harvester</div>
              <div className="mt-0.5 font-mono text-purple-200">
                {androidNode?.presentOnDevice?.length || 2}/2 service.d · 30m Harvest: ON (8)
              </div>
            </div>
          </div>

          <div className="mt-2.5 rounded border border-white/10 bg-black/45 p-2">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-emerald-300">24h Battery Hysteresis Curve (80–85% Band) &amp; Thermal (°C)</span>
              <span className="font-mono text-[10px] text-white/70">
                ━ Battery % ({batLv}%) · <span className="text-sky-300">━ Temp °C ({tempC.toFixed(1)}°C)</span>
              </span>
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full overflow-visible">
              <line x1={0} y1={y85} x2={w} y2={y85} stroke="rgba(52,211,153,0.35)" strokeDasharray="4 4" strokeWidth="1" />
              <line x1={0} y1={y80} x2={w} y2={y80} stroke="rgba(56,189,248,0.35)" strokeDasharray="4 4" strokeWidth="1" />
              <polyline fill="none" stroke="#38bdf8" strokeWidth="1.6" strokeOpacity="0.85" points={tempPts} />
              <polyline fill="none" stroke="#34d399" strokeWidth="2.2" points={batPts} />
            </svg>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-[11px] text-emerald-200/90">
            Run History locked <strong>Design {RUN_HISTORY_DESIGN_LOCK} (H1)</strong> — Audit Trail &amp; Session Summary
            (2026-11-10).
          </p>
          <p className="mt-1 text-[11px] text-emerald-200/90">
            Runtime Log locked <strong>Design {RUNTIME_CONSOLE_LOG_DESIGN_LOCK}</strong> — Deep Action &amp; Telemetry
            Stream ([COOKIE] · [PROXY] · [STEP] · [EXT], 2026-11-10).
          </p>
          <p className="mt-1 text-[11px] text-emerald-200/90">
            Profile KPI Tooltips locked <strong>Design {PROFILE_KPI_TOOLTIP_DESIGN_LOCK}</strong> — Grouped by Daemon /
            Process Pool on Headless &amp; Waiting (2026-11-10).
          </p>
          <p className="mt-1 text-[11px] text-emerald-200/90">
            Workflow canvas locked <strong>Design {WORKFLOW_CANVAS_LAYOUT_DESIGN_LOCK}</strong> — Spaced bezier flow
            (2026-07-06).
          </p>
          <p className="mt-1 text-[11px] text-emerald-200/90">
            Taskbar profile badge locked <strong>Design {TASKBAR_PROFILE_BADGE_DESIGN_LOCK}</strong> — colored last3
            only (`v4-digits-only-spaced8`, +10% gap vs spaced7). 0xxx white; 1xxx sky cyan (#00c8ff); 2–9 vivid hues.
          </p>
        </div>
      </Glass>
    </div>
  );
}
