import type { RunHistoryItem } from "../../types";
import type { ConsoleLog } from "../runtime/RunLogsContext";

/** Console SSOT filter — profile-scoped lines use `source = profile.name`. */
export function filterConsoleLogsForProfile(logs: ConsoleLog[], profileName: string): ConsoleLog[] {
  const key = profileName.trim();
  if (!key) return [];
  return logs.filter((log) => log.source.trim() === key);
}

export function filterConsoleLogsForProfiles(logs: ConsoleLog[], profileNames: readonly string[]): ConsoleLog[] {
  const keys = new Set(profileNames.map((name) => name.trim()).filter(Boolean));
  if (!keys.size) return [];
  return logs.filter((log) => keys.has(log.source.trim()));
}

export function filterRunHistoryForProfile(history: RunHistoryItem[], profileId: string): RunHistoryItem[] {
  if (!profileId.trim()) return [];
  return history.filter((entry) => entry.profileId === profileId);
}

export function filterRunHistoryForProfiles(history: RunHistoryItem[], profileIds: readonly string[]): RunHistoryItem[] {
  const ids = new Set(profileIds.filter(Boolean));
  if (!ids.size) return [];
  return history.filter((entry) => ids.has(entry.profileId));
}
