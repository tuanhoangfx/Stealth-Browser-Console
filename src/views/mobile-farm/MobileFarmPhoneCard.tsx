import { memo, type PointerEvent } from "react";
import {
  Camera,
  ExternalLink,
  Globe,
  Laptop,
  Maximize2,
  Mic,
  Phone,
  Play,
  Smartphone,
} from "lucide-react";
import {
  HubBrandIcon,
  HubDirectoryCardCheckbox,
  compactIconSize,
} from "@tool-workspace/hub-ui";
import {
  H264PhoneStreamCanvas,
  type FarmEngineMode,
  type FarmPhoneCardItem,
  type FarmTouchVector,
} from "./mobile-farm-stream";

export const MobileFarmPhoneCard = memo(function MobileFarmPhoneCard({
  card,
  isSelected,
  localGesture,
  adbOnline,
  autoStream,
  engineMode,
  toggleSelectCard,
  handleScreenPointerDown,
  handleScreenPointerUp,
  onOpenTheater,
  handleActivateCard,
  handleMountOnPhone,
  dispatchControl,
  handleCopyCardScreenshot,
}: {
  card: FarmPhoneCardItem;
  isSelected: boolean;
  localGesture?: (FarmTouchVector & { ts: number }) | undefined;
  adbOnline: boolean;
  autoStream: boolean;
  engineMode: FarmEngineMode;
  toggleSelectCard: (id: string) => void;
  handleScreenPointerDown: (card: FarmPhoneCardItem, e: PointerEvent<HTMLButtonElement>) => void;
  handleScreenPointerUp: (card: FarmPhoneCardItem, e: PointerEvent<HTMLButtonElement>) => void;
  onOpenTheater: (cardId: string) => void;
  handleActivateCard: (card: FarmPhoneCardItem) => Promise<void>;
  handleMountOnPhone: (card: FarmPhoneCardItem) => Promise<void>;
  dispatchControl: (payload: Record<string, unknown>, toastLabel?: string) => Promise<unknown>;
  handleCopyCardScreenshot: (card: FarmPhoneCardItem) => Promise<void>;
}) {
  const activeTouch: FarmTouchVector | null =
    localGesture && localGesture.type === "tap" && Date.now() - localGesture.ts < 600
      ? localGesture
      : null;

  const badgeClass =
    card.badgeTone === "emerald"
      ? "bg-emerald-600/90 text-white"
      : card.badgeTone === "sky"
        ? "bg-sky-600/90 text-white"
        : card.badgeTone === "violet"
          ? "bg-violet-600/90 text-white"
          : "bg-rose-600/85 text-white";

  return (
    <div
      style={
        card.isLiveForeground
          ? undefined
          : { contentVisibility: "auto", containIntrinsicSize: "220px 420px" }
      }
      className={`group relative flex flex-col overflow-hidden rounded-xl border transition shadow-md ${
        card.isLiveForeground
          ? "border-emerald-400/70 ring-1 ring-emerald-400/30 bg-[#0b1526]"
          : isSelected
            ? "border-sky-400/70 bg-[#0b1526]"
            : "border-white/15 bg-[#09111f] hover:border-white/30"
      }`}
    >
      {/* Top Phone Status Strip (HubDirectoryCardCheckbox SSOT + TCP badge + Identity + Status) */}
      <div className="flex items-center justify-between gap-1 bg-black/75 px-2 py-1 text-[10px]">
        <div className="flex min-w-0 items-center gap-1.5">
          <HubDirectoryCardCheckbox
            checked={isSelected}
            label={`Select screen ${card.titleCode}`}
            onChange={() => toggleSelectCard(card.id)}
            corner={false}
            className="!pt-0"
          />
          <span className={`shrink-0 rounded px-1.5 py-0.2 text-[9px] tracking-wide ${badgeClass}`}>
            {card.badgeTopLeft}
          </span>
          <span className="truncate text-[10px] text-white tabular-nums">
            #{card.titleCode}
          </span>
          <span className="hub-analytics-caption truncate text-sky-200/85">
            {card.modelLabel}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-hub-muted tabular-nums">
          {card.isLiveForeground ? (
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE</span>
            </span>
          ) : card.isRunning ? (
            <span className="text-violet-300">RUNNING</span>
          ) : (
            <span>IDLE</span>
          )}
        </div>
      </div>

      {/* Portrait Phone Screen Viewport (9:17.5 aspect ratio — 100% unobstructed when live) */}
      <div
        className="relative flex w-full flex-col justify-between overflow-hidden select-none"
        style={{
          aspectRatio: "9 / 17.5",
          background:
            "linear-gradient(135deg, #0c4a6e 0%, #0284c7 35%, #38bdf8 65%, #0369a1 100%)",
        }}
      >
        {/* If Live Stream or Screenshot exists, render live interactive 24fps H.264 + Tap/Drag-Swipe stream */}
        {card.screenDataUrl || (adbOnline && card.isLiveForeground) ? (
          <button
            type="button"
            onPointerDown={(e) => handleScreenPointerDown(card, e)}
            onPointerUp={(e) => handleScreenPointerUp(card, e)}
            onDoubleClick={() => onOpenTheater(card.id)}
            className="relative h-full w-full border-0 bg-black p-0 cursor-pointer focus:outline-none touch-none"
            title={`Click directly on screen to Tap, Drag to Scroll/Swipe, or Double-Click for Focus Theater Mode on #${card.titleCode} (${card.modelLabel})`}
          >
            <H264PhoneStreamCanvas
              displayId={card.displayId}
              enabled={autoStream && adbOnline && card.isLiveForeground}
              fallbackImgUrl={card.screenDataUrl}
            />

            {/* Subtle Tap Ripple Only on Direct User Click */}
            {activeTouch ? (
              <svg
                viewBox={`0 0 ${card.coordWidth} ${card.coordHeight}`}
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                <circle
                  cx={activeTouch.x}
                  cy={activeTouch.y}
                  r="36"
                  fill="rgba(16, 185, 129, 0.22)"
                  stroke="#34d399"
                  strokeWidth="5"
                />
              </svg>
            ) : null}
          </button>
        ) : (
          /* Android 14 Antidetect Homescreen Wallpaper (HubBrandIcon + Lucide SSOT dock) */
          <div
            onClick={() => void handleActivateCard(card)}
            className="relative flex h-full w-full flex-col justify-between p-2.5 cursor-pointer"
            title={`Click to switch/mount ${card.titleCode} (${card.modelLabel}) onto live screen`}
          >
            {/* Decorative diagonal light stripes like Image 2 */}
            <div
              className="pointer-events-none absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(-35deg, rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.35) 26px, transparent 26px, transparent 56px)",
              }}
            />

            {/* Top Center Identity Header: Big Code + Model + IP/Endpoint */}
            <div className="relative z-10 flex flex-col items-center pt-2 text-center drop-shadow">
              <div className="text-xl tracking-tight text-white tabular-nums">
                {card.titleCode}
              </div>
              <div className="hub-analytics-caption mt-0.5 max-w-full truncate text-white/95">
                {card.modelLabel}
              </div>
              <div className="mt-0.5 max-w-full truncate text-[9px] text-white/80 tabular-nums">
                {card.endpointLabel}
              </div>
              {card.fbAccountLabel ? (
                <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-300/40 bg-indigo-950/75 px-2 py-0.5 text-[9px] text-indigo-100 shadow backdrop-blur-sm">
                  <HubBrandIcon brandId="facebook" size={10} />
                  <span className="truncate tabular-nums">{card.fbAccountLabel}</span>
                </div>
              ) : null}
              <div className="mt-1 rounded-full bg-black/35 px-2 py-0.5 text-[9px] text-emerald-200 backdrop-blur-sm">
                {card.subMetaLabel}
              </div>
            </div>

            {/* Center Quick Stream CTA on Hover */}
            <div className="relative z-10 my-auto flex flex-col items-center justify-center opacity-85 group-hover:opacity-100 transition">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/55 px-2.5 py-1 text-[10px] text-white shadow backdrop-blur-sm">
                {card.kind === "profile" ? (
                  <Laptop size={compactIconSize(10)} className="text-emerald-400" aria-hidden />
                ) : (
                  <Play size={compactIconSize(10)} className="text-emerald-400" aria-hidden />
                )}
                <span>
                  {card.kind === "user_slot"
                    ? `Switch U${card.userId}`
                    : card.kind === "profile"
                      ? card.isPcRunning
                        ? "Stop PC"
                        : "Launch PC"
                      : "Mount Live"}
                </span>
              </span>
            </div>

            {/* Bottom Android Homescreen Dock + Google Search Pill (SSOT Icons) */}
            <div className="relative z-10 flex flex-col gap-1.5">
              <div className="flex items-center justify-around px-1">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/90 text-white shadow">
                  <Phone size={compactIconSize(11)} aria-hidden />
                </span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/95 shadow">
                  <HubBrandIcon brandId="youtube" size={12} />
                </span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600/95 text-white shadow">
                  <HubBrandIcon brandId="facebook" size={12} />
                </span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/90 text-white shadow">
                  <Globe size={compactIconSize(11)} aria-hidden />
                </span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800/90 text-white shadow">
                  <Camera size={compactIconSize(11)} aria-hidden />
                </span>
              </div>
              <div className="flex h-5 items-center justify-between rounded-full bg-slate-900/80 px-2.5 text-[10px] text-white/80 backdrop-blur-sm">
                <HubBrandIcon brandId="google" size={11} />
                <span className="text-[9px] text-white/50">Search</span>
                <Mic size={compactIconSize(10)} className="text-sky-300" aria-hidden />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Mini Control Bar per Phone Card (SSOT Icons & Brand Marks) */}
      <div className="flex items-center justify-between gap-1 border-t border-white/10 bg-black/75 px-1.5 py-1 text-[10px]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void handleActivateCard(card)}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
              card.kind === "profile" && card.isPcRunning
                ? "border-rose-400/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30"
                : "border-emerald-500/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
            }`}
            title={
              card.kind === "user_slot"
                ? `Switch phone foreground to User ${card.userId}`
                : card.kind === "profile"
                  ? card.isPcRunning
                    ? `Stop PC Browser #${card.code}`
                    : `Launch PC Android Emulation Browser #${card.code} (Independent of Pixel 6a)`
                  : `Mount Profile #${card.code}`
            }
          >
            {card.kind === "profile" ? (
              <Laptop size={compactIconSize(10)} className={card.isPcRunning ? "text-rose-300" : "text-emerald-300"} aria-hidden />
            ) : (
              <Play size={compactIconSize(10)} className="text-emerald-300" aria-hidden />
            )}
            <span>
              {card.isLiveForeground
                ? "Active"
                : card.kind === "user_slot"
                  ? `U${card.userId}`
                  : card.kind === "profile"
                    ? card.isPcRunning
                      ? "Stop PC"
                      : "Launch PC"
                    : "Mount"}
            </span>
          </button>
          {card.kind === "profile" && engineMode !== "pc_emulation" ? (
            <button
              type="button"
              onClick={() => void handleMountOnPhone(card)}
              className="inline-flex items-center gap-0.5 rounded border border-sky-400/35 bg-sky-500/15 px-1 py-0.5 text-[9px] text-sky-100 hover:bg-sky-500/25 transition-colors"
              title={`Mount #${card.code} onto Physical Pixel 6a via ADB`}
            >
              <Smartphone size={compactIconSize(9)} aria-hidden />
              <span>ADB</span>
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              void dispatchControl(
                {
                  action: "launch-app",
                  userId: card.userId,
                  displayId: card.displayId,
                  packageName: "com.facebook.katana",
                  profileCode: card.code,
                },
                `Launched FB on #${card.titleCode}`,
              )
            }
            className="inline-flex items-center gap-1 rounded border border-indigo-400/35 bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-100 hover:bg-indigo-500/25 transition-colors"
            title="Launch Facebook App in this isolated slot/display"
          >
            <HubBrandIcon brandId="facebook" size={10} />
            <span>FB</span>
          </button>
          <button
            type="button"
            onClick={() =>
              void dispatchControl(
                {
                  action: "launch-app",
                  userId: card.userId,
                  displayId: card.displayId,
                  packageName: "com.android.chrome",
                  profileCode: card.code,
                },
                `Launched Chrome on #${card.titleCode}`,
              )
            }
            className="inline-flex items-center gap-1 rounded border border-amber-400/35 bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-100 hover:bg-amber-500/25 transition-colors"
            title="Launch Chrome Browser on this screen"
          >
            <Globe size={compactIconSize(10)} aria-hidden />
            <span>Web</span>
          </button>
          <button
            type="button"
            onClick={() =>
              void dispatchControl(
                {
                  action: "launch-app",
                  userId: card.userId,
                  displayId: card.displayId,
                  packageName: "com.netflix.mediaclient",
                  profileCode: card.code,
                },
                `Launched Netflix on #${card.titleCode}`,
              )
            }
            className="inline-flex items-center gap-1 rounded border border-rose-400/35 bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-100 hover:bg-rose-500/25 transition-colors"
            title="Launch Netflix App on this screen"
          >
            <HubBrandIcon brandId="netflix" size={10} />
            <span>NF</span>
          </button>
          <button
            type="button"
            onClick={() => void handleCopyCardScreenshot(card)}
            className="inline-flex h-5 w-5 items-center justify-center rounded border border-indigo-400/35 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25 transition-colors"
            title="Copy PNG Screenshot of this screen to PC Clipboard"
            aria-label="Copy PNG Screenshot"
          >
            <Camera size={compactIconSize(11)} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onOpenTheater(card.id)}
            className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-500/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 transition-colors"
            title="Open Focus / Theater Mode (Large H.264 Stream + Direct PC Keyboard Input)"
            aria-label="Open Focus Theater Mode"
          >
            <Maximize2 size={compactIconSize(11)} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() =>
              void dispatchControl(
                { action: "open-scrcpy", displayId: card.displayId },
                `Opened 60fps Scrcpy for #${card.titleCode}`,
              )
            }
            className="inline-flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-[var(--panel-2)] text-[var(--text)] hover:bg-white/10 transition-colors"
            title="Pop out native 60fps Scrcpy window"
            aria-label="Open Scrcpy 60fps window"
          >
            <ExternalLink size={compactIconSize(11)} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
});
