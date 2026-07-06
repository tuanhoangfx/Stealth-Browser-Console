import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { formatCopyToastPreview } from "./copy-toast";

export type HubToastType = "success" | "error" | "info" | "warn";
export type HubToastIcon = "copy" | "check";

export type HubToast = {
  id: number;
  message: string;
  type: HubToastType;
  durationMs: number;
  preview?: string;
  icon?: HubToastIcon;
};

type HubToastContextValue = {
  toasts: HubToast[];
  pushToast: (message: string, type?: HubToastType, durationMs?: number) => void;
  pushCopyToast: (copied: string, label?: string, durationMs?: number) => void;
  dismissToast: (id: number) => void;
};

const HubToastContext = createContext<HubToastContextValue | null>(null);

export function HubToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<HubToast[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, type: HubToastType = "info", durationMs = 4200) => {
      const text = message.trim();
      if (!text) return;
      const id = Date.now() + Math.random();
      setToasts((prev) => {
        const next = [...prev, { id, message: text, type, durationMs }];
        return next.length > 2 ? next.slice(-2) : next;
      });
    },
    [],
  );

  const pushCopyToast = useCallback(
    (copied: string, label = "Copied", durationMs = 3000) => {
      const preview = formatCopyToastPreview(copied);
      if (!preview) return;
      const id = Date.now() + Math.random();
      setToasts((prev) => {
        const next = [
          ...prev,
          {
            id,
            message: label.trim() || "Copied",
            type: "success" as const,
            durationMs,
            preview,
            icon: "copy" as const,
          },
        ];
        return next.length > 2 ? next.slice(-2) : next;
      });
    },
    [],
  );

  const value = useMemo(
    () => ({ toasts, pushToast, pushCopyToast, dismissToast }),
    [toasts, pushToast, pushCopyToast, dismissToast],
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
