import type { HubUsersStatusTone } from "@tool-workspace/hub-ui";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function formatLastOpenedStaleDate(ms: number) {
  const date = new Date(ms);
  const dd = pad2(date.getDate());
  const MM = pad2(date.getMonth() + 1);
  const yy = pad2(date.getFullYear() % 100);
  return `${dd}/${MM}/${yy}`;
}

export function lastOpenedAgeTone(ms: number): "fresh" | "recent" | "stale" {
  const age = Date.now() - ms;
  if (age <= 3 * 60 * 60 * 1000) return "fresh";
  if (age <= 24 * 60 * 60 * 1000) return "recent";
  return "stale";
}

export function lastOpenedHubTone(tone: "fresh" | "recent" | "stale"): HubUsersStatusTone {
  if (tone === "fresh") return "active";
  if (tone === "recent") return "idle";
  return "offline";
}

export function formatLastOpenedRelativeAge(ms: number): string {
  const ageMs = Math.max(0, Date.now() - ms);
  const ageSec = Math.floor(ageMs / 1000);
  if (ageSec < 60) return "just now";
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return `${ageMin}m ago`;
  const ageHr = Math.floor(ageMin / 60);
  return `${ageHr}h ago`;
}

const GROUP_TONES: HubUsersStatusTone[] = ["online", "active", "idle"];

export function groupHubTone(groupName: string, groupId?: string | null): HubUsersStatusTone {
  const name = (groupName || "Default").trim();
  if (!name || name.toLowerCase() === "default") return "offline";
  const seed = String(groupId || name);
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return GROUP_TONES[hash % GROUP_TONES.length] ?? "online";
}
