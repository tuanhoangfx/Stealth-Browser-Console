import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AppToastType = "success" | "error" | "info" | "warn";

export type AppToast = {
  id: number;
  message: string;
  type: AppToastType;
  durationMs: number;
};

type ToastContextValue = {
  toasts: AppToast[];
  pushToast: (message: string, type?: AppToastType, durationMs?: number) => void;
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<AppToast[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, type: AppToastType = "info", durationMs = 4200) => {
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

  const value = useMemo(
    () => ({ toasts, pushToast, dismissToast }),
    [toasts, pushToast, dismissToast],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useAppToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useAppToast must be used within ToastProvider");
  }
  return ctx;
}
