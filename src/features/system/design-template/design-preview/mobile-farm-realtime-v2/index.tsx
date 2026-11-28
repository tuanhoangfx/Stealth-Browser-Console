import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import {
  MOCK_CARRIER_LANES,
  MOCK_DAEMONS,
  MOCK_DEVICES,
  MOCK_LIVE_EVENTS,
  type MockDeviceId,
  type MockLiveEvent,
  type MockPhysicalDevice,
} from "./mock";
import { MOBILE_FARM_PREVIEW_VARIANTS, type MobileFarmPreviewVariantId } from "./tokens";
import { V1CinemaStageDock } from "./V1-CinemaStageDock";
import { V2FocusSpotlight } from "./V2-FocusSpotlight";
import { V3NodePipelines } from "./V3-NodePipelines";
import { V4DenseNocWall } from "./V4-DenseNocWall";
import { V5TelemetrySplitFeed } from "./V5-TelemetrySplitFeed";
import "./mobile-farm-preview.css";

function readInitialVariant(): MobileFarmPreviewVariantId {
  if (typeof window === "undefined") return "V1";
  const av = new URLSearchParams(window.location.search).get("av")?.toUpperCase();
  if (av === "V1" || av === "V2" || av === "V3" || av === "V4" || av === "V5") return av;
  return "V1";
}

function formatNowHms(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function MobileFarmRealtimePreview() {
  const [variant, setVariant] = useState<MobileFarmPreviewVariantId>(readInitialVariant);
  const [liveSim, setLiveSim] = useState(true);
  const [devices, setDevices] = useState<MockPhysicalDevice[]>(MOCK_DEVICES);
  const [events, setEvents] = useState<MockLiveEvent[]>(MOCK_LIVE_EVENTS);
  const [selectedId, setSelectedId] = useState<MockDeviceId>("pixel7");
  const [dismissedAnr, setDismissedAnr] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<string>("Interactive simulation ready — click screens or switch V1..V5");

  const selectVariant = (next: MobileFarmPreviewVariantId) => {
    setVariant(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("dtpl", "mobile-farm-realtime-v2");
      url.searchParams.set("av", next);
      window.history.replaceState(null, "", url.toString());
    }
  };

  // Subtle realtime telemetry heartbeat so user can feel live FPS / frame age / RTT jitter
  useEffect(() => {
    if (!liveSim) return undefined;
    const timer = window.setInterval(() => {
      setDevices((prev) =>
        prev.map((d) => {
          const jitterLat = Math.max(240, d.latencyMs + Math.round((Math.random() - 0.5) * 44));
          const jitterFps = Math.max(10, Math.min(30, d.fps + (Math.random() > 0.65 ? (Math.random() > 0.5 ? 1 : -1) : 0)));
          const jitterAge = Math.max(45, Math.min(380, d.frameAgeMs + Math.round((Math.random() - 0.5) * 35)));
          return {
            ...d,
            fps: jitterFps,
            frameAgeMs: jitterAge,
            latencyMs: jitterLat,
            latencyHistory: [...d.latencyHistory.slice(1), jitterLat],
          };
        }),
      );
    }, 1400);
    return () => window.clearInterval(timer);
  }, [liveSim]);

  const pushSimEvent = (dev: MockPhysicalDevice | undefined, kind: MockLiveEvent["kind"], message: string) => {
    const id = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const target = dev || devices[0];
    setEvents((prev) => [
      {
        id,
        tsLabel: formatNowHms(),
        deviceId: target.id,
        shortCode: target.shortCode,
        kind,
        message,
      },
      ...prev.slice(0, 14),
    ]);
    setLastFeedback(`${target.shortCode}: ${message}`);
  };

  const handleTapScreen = (dev: MockPhysicalDevice, xPct: number, yPct: number) => {
    setSelectedId(dev.id);
    pushSimEvent(dev, "TAP", `Simulated touch at (${Math.round(xPct)}%, ${Math.round(yPct)}%)`);
  };

  const handleDismissAnr = () => {
    setDismissedAnr(true);
    const p7 = devices.find((d) => d.id === "pixel7");
    pushSimEvent(p7, "ANR", "Auto-dismissed System UI ANR dialog -> node returned to WAVE");
  };

  const handleAction = (label: string, dev?: MockPhysicalDevice) => {
    pushSimEvent(dev, label.includes("4G") || label.includes("IP") ? "PROXY" : "LEASE", label);
  };

  const handleReset = () => {
    setDismissedAnr(false);
    setDevices(MOCK_DEVICES);
    setEvents(MOCK_LIVE_EVENTS);
    setSelectedId("pixel7");
    setLastFeedback("Reset simulation state & restored Pixel 7 ANR alert");
  };

  const meta = MOBILE_FARM_PREVIEW_VARIANTS.find((v) => v.id === variant) || MOBILE_FARM_PREVIEW_VARIANTS[0];

  const sharedProps = {
    devices,
    lanes: MOCK_CARRIER_LANES,
    daemons: MOCK_DAEMONS,
    events,
    selectedId,
    onSelectDevice: setSelectedId,
    dismissedAnr,
    onDismissAnr: handleDismissAnr,
    onTapScreen: handleTapScreen,
    onAction: handleAction,
  };

  return (
    <div className="space-y-3" data-testid="mobile-farm-design-preview-5">
      {/* Variant Selector & Architectural Spec Bar */}
      <div className="rounded-xl border border-cyan-400/30 bg-slate-950/75 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {MOBILE_FARM_PREVIEW_VARIANTS.map((v) => {
              const active = v.id === variant;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => selectVariant(v.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                    active
                      ? "border-cyan-400/65 bg-cyan-500/20 text-white shadow"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:text-white"
                  }`}
                >
                  <span className="font-mono font-bold text-cyan-300">{v.id}</span> · {v.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setLiveSim((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 ${
                liveSim
                  ? "border-emerald-400/45 bg-emerald-500/15 text-emerald-200"
                  : "border-white/15 bg-white/5 text-slate-300"
              }`}
            >
              {liveSim ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {liveSim ? "Live Sim ON" : "Paused"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-slate-300 hover:bg-white/10"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Mock
            </button>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-1 gap-2 rounded-lg border border-white/10 bg-black/40 p-2.5 text-[11px] md:grid-cols-3">
          <div>
            <div className="text-[9.5px] font-semibold uppercase tracking-wider text-cyan-300">Layout Direction</div>
            <div className="mt-0.5 font-medium text-white">{meta.layoutAxis}</div>
            <div className="mt-0.5 text-slate-400">{meta.bestFor}</div>
          </div>
          <div>
            <div className="text-[9.5px] font-semibold uppercase tracking-wider text-emerald-300">
              Improvements vs Current
            </div>
            <div className="mt-0.5 text-slate-200">{meta.deltaFromCurrent}</div>
          </div>
          <div className="flex flex-col justify-between">
            <div>
              <div className="text-[9.5px] font-semibold uppercase tracking-wider text-amber-300">Tradeoff</div>
              <div className="mt-0.5 text-slate-300">{meta.tradeoff}</div>
            </div>
            <div className="mt-1.5 truncate rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-cyan-200">
              {lastFeedback}
            </div>
          </div>
        </div>
      </div>

      {/* Active Variant Viewport */}
      {variant === "V1" && <V1CinemaStageDock {...sharedProps} />}
      {variant === "V2" && <V2FocusSpotlight {...sharedProps} />}
      {variant === "V3" && <V3NodePipelines {...sharedProps} />}
      {variant === "V4" && <V4DenseNocWall {...sharedProps} />}
      {variant === "V5" && <V5TelemetrySplitFeed {...sharedProps} />}
    </div>
  );
}
