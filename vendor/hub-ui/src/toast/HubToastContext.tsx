import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { formatCopyToastPreview } from "./copy-toast";
import { formatHubUnknownMessage } from "./format-hub-unknown-message";

export type HubToastType = "success" | "error" | "info" | "warn";
export type HubToastIcon = "copy" | "check" | "download";
export type HubToastPlacement = "bottom-right" | "top-right";

export type HubToastAction = {
  label: string;
  onClick: () => void;
  /** Primary = amber CTA (Download update); ghost = Later. */
  variant?: "primary" | "ghost";
};

export type HubToast = {
  id: number;
  message: string;
  type: HubToastType;
  /** `0` = sticky until dismiss / action. */
  durationMs: number;
  preview?: string;
  icon?: HubToastIcon;
  /** Optional headline above `message` (update-available SSOT). */
  title?: string;
  actions?: HubToastAction[];
  placement?: HubToastPlacement;
};

export type HubRichToastInput = {
  message: unknown;
  title?: string;
  type?: HubToastType;
  durationMs?: number;
  preview?: string;
  icon?: HubToastIcon;
  actions?: HubToastAction[];
  placement?: HubToastPlacement;
};

type HubToastContextValue = {
  toasts: HubToast[];
  pushToast: (message: unknown, type?: HubToastType, durationMs?: number) => void;
  pushCopyToast: (copied: string, label?: string, durationMs?: number) => void;
  /** Action / titled toast — desktop update available, etc. */
  pushRichToast: (input: HubRichToastInput) => void;
  dismissToast: (id: number) => void;
  /** Clear visible toasts (e.g. before Save so completion toast is the only one). */
  clearToasts: () => void;
};

const HubToastContext = createContext<HubToastContextValue | null>(null);

function appendToast(prev: HubToast[], toast: HubToast): HubToast[] {
  const next = [...prev, toast];
  return next.length > 2 ? next.slice(-2) : next;
}

export function HubToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<HubToast[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const pushToast = useCallback(
    (message: unknown, type: HubToastType = "info", durationMs = 4200) => {
      const text = formatHubUnknownMessage(message);
      if (!text) return;
      const id = Date.now() + Math.random();
      setToasts((prev) => appendToast(prev, { id, message: text, type, durationMs }));
    },
    [],
  );

  const pushCopyToast = useCallback(
    (copied: string, label = "Copied", durationMs = 3000) => {
      const preview = formatCopyToastPreview(formatHubUnknownMessage(copied));
      if (!preview) return;
      const id = Date.now() + Math.random();
      setToasts((prev) =>
        appendToast(prev, {
          id,
          message: formatHubUnknownMessage(label, "Copied"),
          type: "success",
          durationMs,
          preview,
          icon: "copy",
        }),
      );
    },
    [],
  );

  const pushRichToast = useCallback((input: HubRichToastInput) => {
    const text = formatHubUnknownMessage(input.message);
    if (!text) return;
    const id = Date.now() + Math.random();
    setToasts((prev) =>
      appendToast(prev, {
        id,
        message: text,
        type: input.type ?? "info",
        durationMs: input.durationMs ?? 4200,
        preview: input.preview,
        icon: input.icon,
        title: input.title?.trim() || undefined,
        actions: input.actions?.length ? input.actions : undefined,
        placement: input.placement ?? "bottom-right",
      }),
    );
  }, []);

  const value = useMemo(
    () => ({ toasts, pushToast, pushCopyToast, pushRichToast, dismissToast, clearToasts }),
    [toasts, pushToast, pushCopyToast, pushRichToast, dismissToast, clearToasts],
  );

  return <HubToastContext.Provider value={value}>{children}</HubToastContext.Provider>;
}

/** Nullable — copy controls use toast when provider is mounted. */
export function useHubToast(): HubToastContextValue | null {
  return useContext(HubToastContext);
}

export function useHubToastRequired(): HubToastContextValue {
  const ctx = useContext(HubToastContext);
  if (!ctx) {
    throw new Error("useHubToastRequired must be used within HubToastProvider");
  }
  return ctx;
}
