import { useEffect } from "react";
import { X } from "lucide-react";
import { useAppToast, type AppToast, type AppToastType } from "./ToastContext";

const styles: Record<AppToastType, string> = {
  success: "border-emerald-500/45 bg-emerald-500/15 text-emerald-100",
  error: "border-rose-500/50 bg-rose-500/15 text-rose-100",
  warn: "border-amber-500/50 bg-amber-500/15 text-amber-100",
  info: "border-indigo-500/45 bg-indigo-500/15 text-indigo-100",
};

function ToastItem({ toast }: { toast: AppToast }) {
  const { dismissToast } = useAppToast();

  useEffect(() => {
    const t = window.setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.durationMs, dismissToast]);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex max-w-full items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] leading-snug shadow-md backdrop-blur-sm ${styles[toast.type]}`}
    >
      <p className="min-w-0 flex-1">{toast.message}</p>
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

export function ToastContainer() {
  const { toasts } = useAppToast();

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
