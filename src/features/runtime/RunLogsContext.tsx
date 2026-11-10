import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { emitHubAppLog } from "@tool-workspace/hub-ui";
import type { RunLogEntry } from "../../types";

/**
 * P0003 System Log / Console session buffer SSOT (lock = v1.0.154).
 * Live lines via addLog + SQLite profile_events boot hydration — History panel is separate.
 */
export type ConsoleLog = RunLogEntry & {
  id: string;
  source: string;
};

type RunLogsContextValue = {
  logs: ConsoleLog[];
  addLog: (level: RunLogEntry["level"], source: string, message: string) => void;
  clearLogs: () => void;
};

const STORAGE_KEY = "stealth-console-logs-v2";
const MAX_PERSISTED_LOGS = 200;

function readCachedConsoleLogs(): ConsoleLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is ConsoleLog =>
          Boolean(x && typeof x.id === "string" && typeof x.message === "string" && typeof x.time === "string"),
      )
      .slice(0, MAX_PERSISTED_LOGS);
  } catch {
    return [];
  }
}

let pendingLogTimer: ReturnType<typeof setTimeout> | null = null;
let pendingLogEntries: ConsoleLog[] | null = null;

function flushCachedConsoleLogsNow(entries: ConsoleLog[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_PERSISTED_LOGS)));
  } catch {
    /* ignore quota errors */
  }
}

function writeCachedConsoleLogs(entries: ConsoleLog[], immediate = false): void {
  if (typeof window === "undefined") return;
  const isTestEnv = typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
  if (immediate || isTestEnv || entries.length === 0) {
    if (pendingLogTimer) {
      clearTimeout(pendingLogTimer);
      pendingLogTimer = null;
    }
    pendingLogEntries = null;
    flushCachedConsoleLogsNow(entries);
    return;
  }
  pendingLogEntries = entries;
  if (pendingLogTimer) return;
  pendingLogTimer = setTimeout(() => {
    pendingLogTimer = null;
    if (pendingLogEntries) {
      const toWrite = pendingLogEntries;
      pendingLogEntries = null;
      flushCachedConsoleLogsNow(toWrite);
    }
  }, 2500);
}

function normalizeEventLevel(raw: unknown): RunLogEntry["level"] {
  const s = String(raw || "").toLowerCase();
  if (s === "error" || s === "warn" || s === "success") return s;
  return "info";
}

function combineHydratedLogs(current: ConsoleLog[], incoming: ConsoleLog[]): ConsoleLog[] {
  const map = new Map<string, ConsoleLog>();
  for (const item of [...current, ...incoming]) {
    const sec = item.time ? item.time.slice(0, 19) : "";
    const sig = `${item.source}|${item.message}|${sec}`;
    if (!map.has(sig)) {
      map.set(sig, item);
    }
  }
  return [...map.values()]
    .sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0))
    .slice(0, 500);
}

const RunLogsContext = createContext<RunLogsContextValue | null>(null);

export function RunLogsProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<ConsoleLog[]>(() => readCachedConsoleLogs());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const base of ["http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
        try {
          const res = await fetch(`${base}/api/events?limit=200`);
          if (!res.ok) continue;
          const data = (await res.json()) as {
            ok?: boolean;
            events?: Array<{
              id: string;
              profileId?: string;
              profileName?: string;
              eventType?: string;
              level?: string;
              message?: string;
              createdAt?: string;
            }>;
          };
          if (!data?.ok || !Array.isArray(data.events) || cancelled) return;
          const dbLogs: ConsoleLog[] = data.events
            .filter((ev) => Boolean(ev && ev.message && ev.createdAt))
            .map((ev) => ({
              id: `evt-${ev.id}`,
              level: normalizeEventLevel(ev.level),
              source: String(ev.profileName || ev.profileId || "Profile"),
              message: String(ev.message || ""),
              time: String(ev.createdAt || new Date().toISOString()),
            }));
          if (dbLogs.length > 0) {
            setLogs((prev) => {
              const next = combineHydratedLogs(prev, dbLogs);
              writeCachedConsoleLogs(next);
              return next;
            });
          }
          return;
        } catch {
          // try next port
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addLog = useCallback((level: RunLogEntry["level"], source: string, message: string) => {
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    setLogs((prev) => {
      const top = prev[0];
      if (
        top &&
        top.source === source &&
        top.message === message &&
        Math.abs(nowMs - (Date.parse(top.time) || 0)) <= 3000
      ) {
        return prev;
      }
      const next = [
        {
          id: `${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
          level,
          source,
          message,
          time: nowIso,
        },
        ...prev,
      ].slice(0, 500);
      writeCachedConsoleLogs(next);
      return next;
    });
    try {
      emitHubAppLog({
        scope: source || "Stealth",
        message,
        screen: "*",
        kind: level === "error" || level === "warn" ? "system" : "activity",
      });
    } catch {
      /* ignore header log emit error */
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    writeCachedConsoleLogs([]);
  }, []);

  const value = useMemo(() => ({ logs, addLog, clearLogs }), [logs, addLog, clearLogs]);
  return <RunLogsContext.Provider value={value}>{children}</RunLogsContext.Provider>;
}

export function useRunLogs() {
  const ctx = useContext(RunLogsContext);
  if (!ctx) throw new Error("useRunLogs must be used within RunLogsProvider");
  return ctx;
}
