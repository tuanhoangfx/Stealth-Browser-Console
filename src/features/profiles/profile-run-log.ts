import type { RunHistoryItem, RunLogEntry } from "../../types";
import { formatRunDuration, formatRunTimestamp } from "../../lib/stealth-profile-utils";
import type { ConsoleLog } from "../runtime/RunLogsContext";

export type ProfileRunLogFilter = "all" | "today" | "errors";

export type ProfileRunLogStatusTone = "success" | "failed" | "running";

export type ProfileActivityLogEntry = {
  id: string;
  status: "success" | "failed" | "running" | string;
  startedAt: string;
  finishedAt?: string;
  message: string;
};

export function runHistoryToActivityLog(run: RunHistoryItem): ProfileActivityLogEntry {
  const parts: string[] = [run.workflow || "workflow"];
  if (run.targetUrl) parts.push(run.targetUrl);
  if (run.error) parts.push(run.error);
  return {
    id: run.id || `${run.startedAt}-${run.workflow || "run"}`,
    status: run.status,
    startedAt: run.startedAt || run.finishedAt || new Date(0).toISOString(),
    finishedAt: run.finishedAt,
    message: parts.join(" · "),
  };
}

export function profileActivityLogStatusTone(status: string): ProfileRunLogStatusTone {
  if (status === "success" || status === "failed" || status === "running") return status;
  return "running";
}

export function profileActivityLogStatusLabel(status: string): string {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  if (status === "running") return "Running";
  return String(status);
}

export function profileActivityLogTime(entry: ProfileActivityLogEntry): string {
  return formatRunTimestamp(entry.finishedAt || entry.startedAt);
}

export function profileRunLogStatusTone(status: RunHistoryItem["status"]): ProfileRunLogStatusTone {
  if (status === "success" || status === "failed" || status === "running") return status;
  return "running";
}

export function profileRunLogStatusLabel(status: RunHistoryItem["status"]): string {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  if (status === "running") return "Running";
  return String(status);
}

export function profileRunLogMessage(run: RunHistoryItem): string {
  const parts: string[] = [run.workflow || "workflow"];
  if (run.targetUrl) parts.push(run.targetUrl);
  if (run.error) parts.push(run.error);
  return parts.join(" · ");
}

export function profileRunLogTime(run: RunHistoryItem): string {
  return formatRunTimestamp(run.finishedAt || run.startedAt);
}

export function profileRunLogDuration(run: RunHistoryItem): string {
  return formatRunDuration(run.durationMs);
}

function activityLogTimestamp(entry: ProfileActivityLogEntry): number {
  const raw = entry.finishedAt || entry.startedAt;
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

export function isProfileActivityLogToday(entry: ProfileActivityLogEntry, now = new Date()): boolean {
  const ms = activityLogTimestamp(entry);
  if (!ms) return false;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return ms >= start.getTime();
}

export function filterProfileActivityLogs(
  entries: ProfileActivityLogEntry[],
  filter: ProfileRunLogFilter,
  now = new Date(),
): ProfileActivityLogEntry[] {
  if (filter === "errors") return entries.filter((entry) => entry.status === "failed");
  if (filter === "today") return entries.filter((entry) => isProfileActivityLogToday(entry, now));
  return entries;
}

function runLogTimestamp(run: RunHistoryItem): number {
  const raw = run.finishedAt || run.startedAt;
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

export function isProfileRunLogToday(run: RunHistoryItem, now = new Date()): boolean {
  const ms = runLogTimestamp(run);
  if (!ms) return false;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return ms >= start.getTime();
}

export function filterProfileRunLogs(
  entries: RunHistoryItem[],
  filter: ProfileRunLogFilter,
  now = new Date(),
): RunHistoryItem[] {
  if (filter === "errors") return entries.filter((entry) => entry.status === "failed");
  if (filter === "today") return entries.filter((entry) => isProfileRunLogToday(entry, now));
  return entries;
}

export type ProfileConsoleLine = {
  id: string;
  level: RunLogEntry["level"] | "success" | "failed" | "running";
  time: string;
  source: string;
  message: string;
};

function runStatusToLevel(status: RunHistoryItem["status"]): ProfileConsoleLine["level"] {
  if (status === "failed") return "error";
  if (status === "success") return "success";
  return "info";
}

export function bulkActivityToConsoleLines(entries: ProfileActivityLogEntry[]): ProfileConsoleLine[] {
  return entries.map((entry, index) => ({
    id: entry.id || `bulk-${entry.startedAt}-${index}`,
    level: entry.status === "failed" ? "error" : entry.status === "success" ? "success" : "info",
    time: entry.finishedAt || entry.startedAt || new Date(0).toISOString(),
    source: "Lifecycle",
    message: entry.message,
  }));
}

/** Merge session console lines (source = profile name) + persisted workflow runs + lifecycle events. */
export function buildProfileConsoleLines(
  profileId: string,
  profileName: string,
  history: RunHistoryItem[],
  consoleLogs: ConsoleLog[],
  profileEvents: import("../../types").ProfileEvent[] = [],
): ProfileConsoleLine[] {
  const nameKey = profileName.trim();
  const runLines: ProfileConsoleLine[] = history
    .filter((run) => run.profileId === profileId)
    .map((run) => ({
      id: `run-${run.id || run.startedAt}`,
      level: runStatusToLevel(run.status),
      time: run.finishedAt || run.startedAt || new Date(0).toISOString(),
      source: run.workflow || "Workflow",
      message: profileRunLogMessage(run),
    }));

  const consoleLines: ProfileConsoleLine[] = consoleLogs
    .filter((log) => log.source.trim() === nameKey)
    .map((log) => ({
      id: log.id,
      level: log.level,
      time: log.time,
      source: log.source,
      message: log.message,
    }));

  const eventLines: ProfileConsoleLine[] = profileEvents
    .filter((event) => event.profileId === profileId)
    .map((event) => ({
      id: `event-${event.id}`,
      level: profileEventLevel(event.level),
      time: event.createdAt,
      source: "Lifecycle",
      message: event.message || event.eventType,
    }));

  return [...consoleLines, ...runLines, ...eventLines].sort(
    (a, b) => consoleLineTimestamp(b) - consoleLineTimestamp(a),
  );
}

function profileEventLevel(level: string): ProfileConsoleLine["level"] {
  if (level === "error") return "error";
  if (level === "success") return "success";
  if (level === "warn" || level === "warning") return "warn";
  return "info";
}

function consoleLineTimestamp(line: ProfileConsoleLine): number {
  const ms = Date.parse(line.time);
  return Number.isFinite(ms) ? ms : 0;
}

export function isProfileConsoleLineToday(line: ProfileConsoleLine, now = new Date()): boolean {
  const ms = consoleLineTimestamp(line);
  if (!ms) return false;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return ms >= start.getTime();
}

export function filterProfileConsoleLines(
  lines: ProfileConsoleLine[],
  filter: ProfileRunLogFilter,
  now = new Date(),
): ProfileConsoleLine[] {
  if (filter === "errors") {
    return lines.filter((line) => line.level === "error" || line.level === "failed");
  }
  if (filter === "today") return lines.filter((line) => isProfileConsoleLineToday(line, now));
  return lines;
}
