import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import { HubToastProvider, useHubToastRequired, type HubToast, type HubToastType } from "./HubToastContext";

const styles: Record<HubToastType, string> = {
  success: "border-emerald-500/45 bg-emerald-500/15 text-emerald-100",
  error: "border-rose-500/50 bg-rose-500/15 text-rose-100",
  warn: "border-amber-500/50 bg-amber-500/15 text-amber-100",
  info: "border-indigo-500/45 bg-indigo-500/15 text-indigo-100",
};

const iconStyles: Record<HubToastType, string> = {
  success: "text-emerald-300",
  error: "text-rose-300",
  warn: "text-amber-300",
  info: "text-indigo-300",
};

function ToastIcon({ toast }: { toast: HubToast }) {
  const tone = iconStyles[toast.type];
  if (toast.icon === "copy") {
    return <Copy size={14} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden />;
  }
  if (toast.icon === "check") {
    return <Check size={14} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden />;
  }
  return null;
}

function ToastItem({ toast }: { toast: HubToast }) {
  const { dismissToast } = useHubToastRequired();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.durationMs, dismissToast]);

  return (
    <div
      role="status"
      style={{
        transform: visible ? "translateY(0)" : "translateY(8px)",
        opacity: visible ? 1 : 0,
        transition: "transform 180ms ease-out, opacity 180ms ease-out",
      }}
      className={`pointer-events-auto flex max-w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-xs leading-snug shadow-md backdrop-blur-sm ${styles[toast.type]}`}
    >
      <ToastIcon toast={toast} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{toast.message}</p>
        {toast.preview ? (
          <p className="mt-0.5 truncate font-mono text-[10px] opacity-90" title={toast.preview}>
            {toast.preview}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
        aria-label="Dismiss"
        onClick={() => dismissToast(toast.id)}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function HubToastContainer() {
  const { toasts } = useHubToastRequired();

  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[2000] flex w-[min(100vw-2rem,20rem)] flex-col-reverse gap-1.5"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

/** Provider + fixed container — mount once at app root (P0020 parity). */
export function HubToastShell({ children }: { children: ReactNode }) {
  return (
    <HubToastProvider>
      {children}
      <HubToastContainer />
    </HubToastProvider>
  );
}
