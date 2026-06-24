import type { HubUsersStatusTone } from "@tool-workspace/hub-ui";

export {
  formatHubActivityRelativeAge as formatLastOpenedRelativeAge,
  formatHubActivityStaleLabel as formatLastOpenedStaleDate,
  hubActivityAgeHubTone as lastOpenedHubTone,
  hubActivityAgeTone as lastOpenedAgeTone,
} from "@tool-workspace/hub-ui";

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
