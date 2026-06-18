import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { RunLogEntry } from "../../types";

export type ConsoleLog = RunLogEntry & {
  id: string;
  source: string;
};

type RunLogsContextValue = {
  logs: ConsoleLog[];
  addLog: (level: RunLogEntry["level"], source: string, message: string) => void;
  clearLogs: () => void;
};

const RunLogsContext = createContext<RunLogsContextValue | null>(null);

export function RunLogsProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<ConsoleLog[]>([]);

  const addLog = useCallback((level: RunLogEntry["level"], source: string, message: string) => {
    setLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        level,
        source,
        message,
        time: new Date().toISOString()
      },
      ...prev
    ].slice(0, 500));
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const value = useMemo(() => ({ logs, addLog, clearLogs }), [logs, addLog, clearLogs]);
  return <RunLogsContext.Provider value={value}>{children}</RunLogsContext.Provider>;
}

export function useRunLogs() {
  const ctx = useContext(RunLogsContext);
  if (!ctx) throw new Error("useRunLogs must be used within RunLogsProvider");
  return ctx;
}
