import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { HubLogEntry } from "./HubUsageLogPanel";

/** Session lines visible on every tab (boot, cross-tab notices). */
export const HUB_APP_LOG_GLOBAL_SCREEN = "*";

export type HubAppLogBoot = {
  scope: string;
  message: string;
  /** Screen id — omit or `*` for all tabs (SSOT boot). */
  screen?: string;
};

export type HubAppLogEventDetail = {
  scope?: string;
  message?: string;
  screen?: string;
};

type HubAppLogContextValue = {
  activeScreen: string;
  allLogs: HubLogEntry[];
  tabLogs: HubLogEntry[];
  pushLog: (scope: string, message: string, screen?: string) => void;
};

const HubAppLogContext = createContext<HubAppLogContextValue | null>(null);

export type HubAppLogProviderProps = {
  children: ReactNode;
  /** Resolved screen id — use `resolveHubActiveScreenId(screen, systemTab)`. */
  activeScreen: string;
  maxLogs?: number;
  bootLog?: HubAppLogBoot;
  /** Custom event; detail: `{ scope?, message?, screen? }`. Also listens to `tool-hub-log`. */
  logEventName?: string;
};

function nextLogId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isHubAppLogVisibleOnTab(
  log: Pick<HubLogEntry, "screen">,
  activeScreen: string,
): boolean {
  const s = String(log.screen ?? "").trim();
  if (!s || s === HUB_APP_LOG_GLOBAL_SCREEN) return true;
  return s === activeScreen;
}

/** Per-tab session log — header shows active tab (+ global); footer shows all tabs. */
export function HubAppLogProvider({
  children,
  activeScreen,
  maxLogs = 30,
  bootLog,
  logEventName = "hub-app-log",
}: HubAppLogProviderProps) {
  const [logs, setLogs] = useState<HubLogEntry[]>(() => [
    {
      id: `boot-${Date.now()}`,
      at: Date.now(),
      scope: bootLog?.scope ?? "App",
      message: bootLog?.message ?? "Application started",
      screen: bootLog?.screen?.trim() || HUB_APP_LOG_GLOBAL_SCREEN,
    },
  ]);

  const pushLog = useCallback(
    (scope: string, message: string, screen?: string) => {
      const raw = String(screen ?? "").trim();
      const targetScreen =
        raw === HUB_APP_LOG_GLOBAL_SCREEN
          ? HUB_APP_LOG_GLOBAL_SCREEN
          : raw || activeScreen;
      setLogs((prev) =>
        [
          {
            id: nextLogId(),
            at: Date.now(),
            scope,
            message,
            screen: targetScreen,
          },
          ...prev,
        ].slice(0, maxLogs),
      );
    },
    [activeScreen, maxLogs],
  );

  useEffect(() => {
    const onLog = (event: Event) => {
      const detail = (event as CustomEvent<HubAppLogEventDetail>).detail;
      pushLog(detail?.scope ?? "App", detail?.message ?? "Updated", detail?.screen);
    };
    window.addEventListener(logEventName, onLog);
    window.addEventListener("tool-hub-log", onLog);
    return () => {
      window.removeEventListener(logEventName, onLog);
      window.removeEventListener("tool-hub-log", onLog);
    };
  }, [logEventName, pushLog]);

  const tabLogs = useMemo(
    () => logs.filter((log) => isHubAppLogVisibleOnTab(log, activeScreen)),
    [activeScreen, logs],
  );

  const value = useMemo(
    () => ({
      activeScreen,
      allLogs: logs,
      tabLogs,
      pushLog,
    }),
    [activeScreen, logs, pushLog, tabLogs],
  );

  return <HubAppLogContext.Provider value={value}>{children}</HubAppLogContext.Provider>;
}

export function useHubAppLog() {
  const ctx = useContext(HubAppLogContext);
  if (!ctx) {
    return {
      activeScreen: "default",
      allLogs: [] as HubLogEntry[],
      tabLogs: [] as HubLogEntry[],
      pushLog: (_scope: string, _message: string, _screen?: string) => {},
    };
  }
  return ctx;
}
