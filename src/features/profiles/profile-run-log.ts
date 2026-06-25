import type { RunHistoryItem } from "../../types";
import { formatRunDuration, formatRunTimestamp } from "../../lib/stealth-profile-utils";

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
