import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, X } from "lucide-react";
import {
  HubToastProvider,
  useHubToastRequired,
  type HubToast,
  type HubToastType,
} from "./HubToastContext";
import { resolveHubToastPortalTarget } from "./resolve-hub-toast-portal";
import "../styles/hub-toast.css";

const iconToneClass: Record<HubToastType, string> = {
  success: "hub-toast-item__icon--success",
  error: "hub-toast-item__icon--error",
  warn: "hub-toast-item__icon--warn",
  info: "hub-toast-item__icon--info",
};

function ToastIcon({ toast }: { toast: HubToast }) {
  const tone = iconToneClass[toast.type];
  if (toast.icon === "copy") {
    return <Copy size={14} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden />;
  }
  if (toast.icon === "check") {
    return <Check size={14} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden />;
  }
  if (toast.icon === "download") {
    return <Download size={14} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden />;
  }
  return null;
}

function ToastItem({ toast }: { toast: HubToast }) {
  const { dismissToast } = useHubToastRequired();
  const [visible, setVisible] = useState(false);
  const sticky = toast.durationMs <= 0;
  const hasActions = Boolean(toast.actions?.length);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (sticky) return;
    const t = window.setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.durationMs, dismissToast, sticky]);

  return (
    <div
      role="status"
      style={{
        transform: visible ? "translateY(0)" : "translateY(8px)",
        opacity: visible ? 1 : 0,
      }}
      className={`hub-toast-item hub-toast-item--${toast.type}${hasActions ? " hub-toast-item--actions" : ""}`}
    >
      <ToastIcon toast={toast} />
      <div className="min-w-0 flex-1">
        {toast.title ? <p className="hub-toast-item__headline">{toast.title}</p> : null}
        <p className="hub-toast-item__title">{toast.message}</p>
        {toast.preview ? (
          <p className="hub-toast-item__preview" title={toast.preview}>
            {toast.preview}
          </p>
        ) : null}
        {hasActions ? (
          <div className="hub-toast-item__actions">
            {toast.actions!.map((action) => (
              <button
                key={action.label}
                type="button"
                className={
                  action.variant === "primary"
                    ? "hub-toast-item__action hub-toast-item__action--primary"
                    : "hub-toast-item__action hub-toast-item__action--ghost"
                }
                onClick={() => {
                  action.onClick();
                  dismissToast(toast.id);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {!hasActions ? (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
          onClick={() => dismissToast(toast.id)}
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

function HubToastViewport() {
  const { toasts } = useHubToastRequired();

  if (!toasts.length) return null;

  const top = toasts.filter((t) => t.placement === "top-right");
  const bottom = toasts.filter((t) => t.placement !== "top-right");

  return (
    <>
      {top.length ? (
        <div className="hub-toast-viewport hub-toast-viewport--top-right" aria-live="polite">
          {top.map((t) => (
            <ToastItem key={t.id} toast={t} />
          ))}
        </div>
      ) : null}
      {bottom.length ? (
        <div className="hub-toast-viewport" aria-live="polite">
          {bottom.map((t) => (
            <ToastItem key={t.id} toast={t} />
          ))}
        </div>
      ) : null}
    </>
  );
}

/**
 * Fixed toast stack — portals into the active tool-detail modal backdrop when open
 * (same layer as the dialog; not dimmed by backdrop-filter). Otherwise `document.body`.
 */
export function HubToastContainer() {
  const { toasts } = useHubToastRequired();
  if (!toasts.length) return null;
  if (typeof document === "undefined") return <HubToastViewport />;
  const target = resolveHubToastPortalTarget();
  return createPortal(<HubToastViewport />, target, `hub-toast-${target === document.body ? "body" : "modal"}`);
}

/** Provider + container — mount once at app root (P0020 `HubToastShell` SSOT). */
export function HubToastShell({ children }: { children: ReactNode }) {
  return (
    <HubToastProvider>
      {children}
      <HubToastContainer />
    </HubToastProvider>
  );
}
