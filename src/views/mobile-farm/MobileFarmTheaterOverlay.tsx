import { memo, useEffect, useState, type PointerEvent } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Camera,
  Circle,
  ClipboardPaste,
  CornerDownLeft,
  Delete,
  ExternalLink,
  Globe,
  Layers,
  MessageCircle,
  Play,
  Send,
  Settings2,
  Sun,
  Zap,
} from "lucide-react";
import {
  HubBrandIcon,
  HubBulkActionButton,
  HubModalCloseButton,
  compactIconSize,
} from "@tool-workspace/hub-ui";
import {
  fetchFarmApi,
  H264PhoneStreamCanvas,
  type FarmPhoneCardItem,
  type FarmTouchVector,
} from "./mobile-farm-stream";

export const MobileFarmTheaterOverlay = memo(function MobileFarmTheaterOverlay({
  theaterCard,
  adbOnline,
  localGesture,
  onClose,
  handleScreenPointerDown,
  handleScreenPointerUp,
  dispatchControl,
  handleCopyCardScreenshot,
  handleActivateCard,
  pushToast,
}: {
  theaterCard: FarmPhoneCardItem | null;
  adbOnline: boolean;
  localGesture?: (FarmTouchVector & { ts: number }) | undefined;
  onClose: () => void;
  handleScreenPointerDown: (card: FarmPhoneCardItem, e: PointerEvent<HTMLButtonElement>) => void;
  handleScreenPointerUp: (card: FarmPhoneCardItem, e: PointerEvent<HTMLButtonElement>) => void;
  dispatchControl: (payload: Record<string, unknown>, toastLabel?: string) => Promise<unknown>;
  handleCopyCardScreenshot: (card: FarmPhoneCardItem) => Promise<void>;
  handleActivateCard: (card: FarmPhoneCardItem) => Promise<void>;
  pushToast: (msg: string, tone?: "success" | "error" | "info") => void;
}) {
  const [theaterText, setTheaterText] = useState<string>("");
  const [directKeyCapture, setDirectKeyCapture] = useState<boolean>(true);
  const icon12 = compactIconSize(12);

  // Proposal 2 (ok 2): Adaptive Bitrate H.264 Stream Quality (850Kbps @ 20fps Grid vs 2.6Mbps @ 30fps Focus Modal)
  const theaterDisplayId = theaterCard ? theaterCard.displayId : null;
  useEffect(() => {
    if (theaterDisplayId === null || !adbOnline) return;
    void fetchFarmApi("/api/mobile-stealth/live-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set-stream-quality",
        displayId: theaterDisplayId,
        text: "high",
      }),
    }).catch(() => undefined);
    return () => {
      void fetchFarmApi("/api/mobile-stealth/live-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-stream-quality",
          displayId: theaterDisplayId,
          text: "grid",
        }),
      }).catch(() => undefined);
    };
  }, [adbOnline, theaterDisplayId]);

  useEffect(() => {
    if (!theaterCard) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (!directKeyCapture) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void navigator.clipboard
          ?.readText()
          .then((clip) => {
            if (clip && clip.trim()) {
              void dispatchControl(
                {
                  action: "text",
                  displayId: theaterCard.displayId,
                  userId: theaterCard.userId,
                  profileCode: theaterCard.code,
                  text: clip.trim(),
                },
                `Pasted ${clip.trim().length} chars to #${theaterCard.titleCode}`,
              );
            }
          })
          .catch(() => undefined);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const keyMap: Record<string, string> = {
        Backspace: "67",
        Enter: "66",
        Tab: "61",
        ArrowUp: "19",
        ArrowDown: "20",
        ArrowLeft: "21",
        ArrowRight: "22",
        Delete: "112",
      };
      if (keyMap[e.key]) {
        e.preventDefault();
        void dispatchControl({
          action: "keyevent",
          displayId: theaterCard.displayId,
          userId: theaterCard.userId,
          profileCode: theaterCard.code,
          keyCode: keyMap[e.key],
        });
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        void dispatchControl({
          action: "text",
          displayId: theaterCard.displayId,
          userId: theaterCard.userId,
          profileCode: theaterCard.code,
          text: e.key,
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [directKeyCapture, dispatchControl, onClose, theaterCard]);

  if (!theaterCard) return null;

  const tTouch: FarmTouchVector | null =
    localGesture && localGesture.type === "tap" && Date.now() - localGesture.ts < 600
      ? localGesture
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-emerald-400/40 bg-[#07101e] shadow-2xl md:flex-row">
        {/* Left Column: Large Interactive Portrait H.264 Viewport */}
        <div className="relative flex flex-col items-center justify-center bg-black/90 p-3 md:w-[390px] shrink-0 border-b md:border-b-0 md:border-r border-white/10">
          <div className="mb-2 flex w-full items-center justify-between px-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300 border border-emerald-400/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>FOCUS · D{theaterCard.displayId}</span>
              </span>
              <span className="text-white tabular-nums">{theaterCard.titleCode}</span>
            </div>
            <span className="text-xs text-sky-300 tabular-nums">
              {theaterCard.coordWidth}×{theaterCard.coordHeight} · HQ 2.6Mbps · 30fps H.264
            </span>
          </div>

          <div
            className="relative overflow-hidden rounded-xl border border-white/20 bg-black shadow-lg"
            style={{
              height: "min(76vh, 660px)",
              aspectRatio: "9 / 19.5",
            }}
          >
            <button
              type="button"
              onPointerDown={(e) => handleScreenPointerDown(theaterCard, e)}
              onPointerUp={(e) => handleScreenPointerUp(theaterCard, e)}
              className="relative h-full w-full border-0 bg-black p-0 cursor-crosshair focus:outline-none touch-none"
              title="Click to Tap or Drag to Swipe directly on live screen"
            >
              <H264PhoneStreamCanvas
                displayId={theaterCard.displayId}
                enabled={adbOnline}
                fallbackImgUrl={theaterCard.screenDataUrl}
              />
              {tTouch ? (
                <svg
                  viewBox={`0 0 ${theaterCard.coordWidth} ${theaterCard.coordHeight}`}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  <circle
                    cx={tTouch.x}
                    cy={tTouch.y}
                    r="36"
                    fill="rgba(16, 185, 129, 0.22)"
                    stroke="#34d399"
                    strokeWidth="5"
                  />
                </svg>
              ) : null}
            </button>
          </div>
        </div>

        {/* Right Column: Direct PC Keyboard Input, Clipboard, Hardware Keys & Contextual App Launcher */}
        <div className="flex flex-1 flex-col justify-between gap-3 overflow-y-auto p-4 text-xs">
          <div className="flex flex-col gap-3">
            {/* Header & HubModalCloseButton SSOT */}
            <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base text-white">{theaterCard.titleCode}</span>
                  <span className="rounded bg-sky-500/20 px-2 py-0.5 text-xs text-sky-200 border border-sky-400/30">
                    {theaterCard.modelLabel}
                  </span>
                  {theaterCard.fbAccountLabel ? (
                    <span className="inline-flex items-center gap-1 rounded bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200 border border-indigo-400/35 tabular-nums">
                      <HubBrandIcon brandId="facebook" size={11} />
                      <span>{theaterCard.fbAccountLabel}</span>
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs text-hub-muted tabular-nums">
                  {theaterCard.endpointLabel} · {theaterCard.subMetaLabel}
                </div>
              </div>
              <HubModalCloseButton
                onClose={onClose}
                aria-label="Close Focus Modal (Esc)"
              />
            </div>

            {/* Direct PC Keyboard & Clipboard Input Box */}
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-950/15 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-emerald-200">PC Keyboard &amp; Clipboard Bridge</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-emerald-300">
                  <input
                    type="checkbox"
                    checked={directKeyCapture}
                    onChange={(e) => setDirectKeyCapture(e.target.checked)}
                    className="hub-checkbox"
                  />
                  <span>Direct Keystrokes (Type anywhere + Ctrl+V)</span>
                </label>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={theaterText}
                  onChange={(e) => setTheaterText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && theaterText.trim()) {
                      e.preventDefault();
                      const val = theaterText;
                      setTheaterText("");
                      void dispatchControl(
                        {
                          action: "text",
                          displayId: theaterCard.displayId,
                          userId: theaterCard.userId,
                          profileCode: theaterCard.code,
                          text: val,
                        },
                        `Sent text to #${theaterCard.titleCode}`,
                      );
                    }
                  }}
                  placeholder="Type text / password / 2FA and press Enter..."
                  className="h-[var(--hub-control-h)] flex-1 rounded-lg border border-white/15 bg-black/50 px-2.5 text-xs text-white placeholder:text-hub-muted focus:border-emerald-400 focus:outline-none"
                />
                <HubBulkActionButton
                  tone="emerald"
                  icon={<Send size={icon12} aria-hidden />}
                  label="Send"
                  title="Send typed text to Android display"
                  disabled={!theaterText.trim()}
                  onClick={() => {
                    if (!theaterText.trim()) return;
                    const val = theaterText;
                    setTheaterText("");
                    void dispatchControl(
                      {
                        action: "text",
                        displayId: theaterCard.displayId,
                        userId: theaterCard.userId,
                        profileCode: theaterCard.code,
                        text: val,
                      },
                      `Sent text to #${theaterCard.titleCode}`,
                    );
                  }}
                />
                <HubBulkActionButton
                  tone="sky"
                  icon={<ClipboardPaste size={icon12} aria-hidden />}
                  label="Paste Clipboard"
                  title="Paste PC Clipboard directly into phone input field"
                  onClick={() => {
                    void navigator.clipboard
                      ?.readText()
                      .then((clip) => {
                        if (!clip || !clip.trim()) {
                          pushToast("PC Clipboard is empty", "info");
                          return;
                        }
                        void dispatchControl(
                          {
                            action: "text",
                            displayId: theaterCard.displayId,
                            userId: theaterCard.userId,
                            profileCode: theaterCard.code,
                            text: clip.trim(),
                          },
                          `Pasted ${clip.trim().length} chars to #${theaterCard.titleCode}`,
                        );
                      })
                      .catch(() => pushToast("Unable to read clipboard", "error"));
                  }}
                />
                <HubBulkActionButton
                  tone="indigo"
                  icon={<Camera size={icon12} aria-hidden />}
                  label="Copy Screenshot"
                  title="Copy current live H.264 frame as PNG to PC Clipboard"
                  onClick={() => void handleCopyCardScreenshot(theaterCard)}
                />
              </div>
            </div>

            {/* Hardware Navigation, Scroll & Key Controls (HubBulkActionButton SSOT) */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 text-xs uppercase tracking-wider text-hub-muted">
                Hardware Navigation &amp; Gestures (Display #{theaterCard.displayId})
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <HubBulkActionButton
                  tone="neutral"
                  icon={<ArrowLeft size={icon12} aria-hidden />}
                  label="Back"
                  title="Send Back key (KEYCODE_BACK)"
                  onClick={() =>
                    void dispatchControl({
                      action: "keyevent",
                      displayId: theaterCard.displayId,
                      keyCode: "4",
                    })
                  }
                  className="w-full justify-center"
                />
                <HubBulkActionButton
                  tone="neutral"
                  icon={<Circle size={compactIconSize(11)} aria-hidden />}
                  label="Home"
                  title="Send Home key (KEYCODE_HOME)"
                  onClick={() =>
                    void dispatchControl({
                      action: "keyevent",
                      displayId: theaterCard.displayId,
                      keyCode: "3",
                    })
                  }
                  className="w-full justify-center"
                />
                <HubBulkActionButton
                  tone="neutral"
                  icon={<Layers size={icon12} aria-hidden />}
                  label="Recents"
                  title="Open Recent Apps (KEYCODE_APP_SWITCH)"
                  onClick={() =>
                    void dispatchControl({
                      action: "keyevent",
                      displayId: theaterCard.displayId,
                      keyCode: "187",
                    })
                  }
                  className="w-full justify-center"
                />
                <HubBulkActionButton
                  tone="amber"
                  icon={<Sun size={icon12} aria-hidden />}
                  label="Wake"
                  title="Wake display (KEYCODE_WAKEUP)"
                  onClick={() =>
                    void dispatchControl(
                      {
                        action: "keyevent",
                        displayId: theaterCard.displayId,
                        keyCode: "224",
                      },
                      `Woke Display #${theaterCard.displayId}`,
                    )
                  }
                  className="w-full justify-center"
                />
                <HubBulkActionButton
                  tone="emerald"
                  icon={<ArrowUp size={icon12} aria-hidden />}
                  label="Scroll Feed"
                  title="Swipe up to scroll feed down"
                  onClick={() =>
                    void dispatchControl({
                      action: "swipe",
                      displayId: theaterCard.displayId,
                      x: Math.round(theaterCard.coordWidth * 0.5),
                      y: Math.round(theaterCard.coordHeight * 0.75),
                      x2: Math.round(theaterCard.coordWidth * 0.5),
                      y2: Math.round(theaterCard.coordHeight * 0.25),
                      durationMs: 320,
                    })
                  }
                  className="w-full justify-center"
                />
                <HubBulkActionButton
                  tone="sky"
                  icon={<ArrowDown size={icon12} aria-hidden />}
                  label="Scroll Up"
                  title="Swipe down to scroll feed up"
                  onClick={() =>
                    void dispatchControl({
                      action: "swipe",
                      displayId: theaterCard.displayId,
                      x: Math.round(theaterCard.coordWidth * 0.5),
                      y: Math.round(theaterCard.coordHeight * 0.25),
                      x2: Math.round(theaterCard.coordWidth * 0.5),
                      y2: Math.round(theaterCard.coordHeight * 0.75),
                      durationMs: 320,
                    })
                  }
                  className="w-full justify-center"
                />
                <HubBulkActionButton
                  tone="neutral"
                  icon={<Delete size={icon12} aria-hidden />}
                  label="Backspace"
                  title="Send Backspace key (KEYCODE_DEL)"
                  onClick={() =>
                    void dispatchControl({
                      action: "keyevent",
                      displayId: theaterCard.displayId,
                      keyCode: "67",
                    })
                  }
                  className="w-full justify-center"
                />
                <HubBulkActionButton
                  tone="neutral"
                  icon={<CornerDownLeft size={icon12} aria-hidden />}
                  label="Enter"
                  title="Send Enter key (KEYCODE_ENTER)"
                  onClick={() =>
                    void dispatchControl({
                      action: "keyevent",
                      displayId: theaterCard.displayId,
                      keyCode: "66",
                    })
                  }
                  className="w-full justify-center"
                />
              </div>
            </div>

            {/* Contextual App Launcher (HubBulkActionButton + HubBrandIcon SSOT) */}
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 text-xs uppercase tracking-wider text-hub-muted">
                Launch App on Display #{theaterCard.displayId} (U{theaterCard.userId})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    {
                      label: "Facebook",
                      pkg: "com.facebook.katana",
                      tone: "indigo" as const,
                      icon: <HubBrandIcon brandId="facebook" size={12} />,
                    },
                    {
                      label: "FB Lite",
                      pkg: "com.facebook.lite",
                      tone: "sky" as const,
                      icon: <HubBrandIcon brandId="facebook" size={12} />,
                    },
                    {
                      label: "Messenger",
                      pkg: "com.facebook.orca",
                      tone: "indigo" as const,
                      icon: <MessageCircle size={icon12} aria-hidden />,
                    },
                    {
                      label: "YouTube",
                      pkg: "com.google.android.youtube",
                      tone: "rose" as const,
                      icon: <HubBrandIcon brandId="youtube" size={12} />,
                    },
                    {
                      label: "Chrome",
                      pkg: "com.android.chrome",
                      tone: "emerald" as const,
                      icon: <Globe size={icon12} aria-hidden />,
                    },
                    {
                      label: "Play Store",
                      pkg: "com.android.vending",
                      tone: "sky" as const,
                      icon: <Zap size={icon12} aria-hidden />,
                    },
                    {
                      label: "Settings",
                      pkg: "com.android.settings",
                      tone: "neutral" as const,
                      icon: <Settings2 size={icon12} aria-hidden />,
                    },
                  ]
                ).map((app) => (
                  <HubBulkActionButton
                    key={app.pkg}
                    tone={app.tone}
                    icon={app.icon}
                    label={app.label}
                    title={`Launch ${app.label} on Display #${theaterCard.displayId} (U${theaterCard.userId})`}
                    onClick={() =>
                      void dispatchControl(
                        {
                          action: "launch-app",
                          userId: theaterCard.userId,
                          displayId: theaterCard.displayId,
                          packageName: app.pkg,
                          profileCode: theaterCard.code,
                        },
                        `Launched ${app.label} on D${theaterCard.displayId}`,
                      )
                    }
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Footer Actions (HubBulkActionButton SSOT) */}
          <div className="flex items-center justify-between border-t border-white/10 pt-2.5">
            <HubBulkActionButton
              tone="emerald"
              icon={<Play size={icon12} aria-hidden />}
              label={
                theaterCard.kind === "user_slot"
                  ? `Switch Foreground to User U${theaterCard.userId}`
                  : `Mount Profile #${theaterCard.code}`
              }
              title="Activate or mount this profile/user slot onto the phone foreground"
              onClick={() => void handleActivateCard(theaterCard)}
            />
            <HubBulkActionButton
              tone="neutral"
              icon={<ExternalLink size={icon12} aria-hidden />}
              label="Pop Out Native 60fps Window (scrcpy)"
              title="Open native 60fps Scrcpy window for this display"
              onClick={() =>
                void dispatchControl(
                  { action: "open-scrcpy", displayId: theaterCard.displayId },
                  `Opened 60fps Scrcpy for D${theaterCard.displayId}`,
                )
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
});
