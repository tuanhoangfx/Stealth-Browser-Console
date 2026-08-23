import { cleanHubJobTitleSlug, hubJobTitleDef } from "./hub-job-titles";
import { effectiveHubOrgTeamSlug, hubOrgTeamDef } from "./hub-org-teams";

/** User-row presence — shared by Todo Assign/Creator and P0015 Index User. */
export type HubRosterPresence = "online" | "active" | "idle" | "offline";

export const HUB_ROSTER_PRESENCE_DISPLAY: Record<
  HubRosterPresence,
  { tone: HubRosterPresence; label: string }
> = {
  online: { tone: "online", label: "Online" },
  active: { tone: "active", label: "Active" },
  idle: { tone: "idle", label: "Idle" },
  offline: { tone: "offline", label: "Offline" },
};

export const HUB_ROSTER_PRESENCE_ONLINE_MS = 5 * 60 * 1000;
export const HUB_ROSTER_PRESENCE_ACTIVE_MS = 24 * 60 * 60 * 1000;
export const HUB_ROSTER_PRESENCE_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

/** Online ≤5m · Active ≤24h · Idle ≤7d · else Offline. */
export function hubRosterPresence(
  lastActivityAt: string | null | undefined,
  now = Date.now(),
): { tone: HubRosterPresence; label: string } {
  if (!lastActivityAt) return HUB_ROSTER_PRESENCE_DISPLAY.offline;
  const ageMs = now - new Date(lastActivityAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs > HUB_ROSTER_PRESENCE_IDLE_MS) {
    return HUB_ROSTER_PRESENCE_DISPLAY.offline;
  }
  if (ageMs <= HUB_ROSTER_PRESENCE_ONLINE_MS) return HUB_ROSTER_PRESENCE_DISPLAY.online;
  if (ageMs <= HUB_ROSTER_PRESENCE_ACTIVE_MS) return HUB_ROSTER_PRESENCE_DISPLAY.active;
  return HUB_ROSTER_PRESENCE_DISPLAY.idle;
}

export function hubRosterTeamDetail(
  teamSlug: string | null | undefined,
  jobTitle?: string | null,
): string | undefined {
  const team = hubOrgTeamDef(effectiveHubOrgTeamSlug(teamSlug, jobTitle) ?? undefined);
  return team ? `${team.emoji} ${team.label}` : undefined;
}

export function hubRosterPositionDetail(jobTitle: string | null | undefined): string | undefined {
  const title = hubJobTitleDef(cleanHubJobTitleSlug(jobTitle));
  return title ? `${title.emoji} ${title.label}` : undefined;
}

/** Visible when `job_title` is unset — do not invent a title. Set it on the Users grant. */
export const HUB_ROSTER_POSITION_PLACEHOLDER = "Position";
export const HUB_ROSTER_POSITION_EMPTY_HINT = "Set on Users tab";

export function hubRosterPositionMissing(jobTitle: string | null | undefined): boolean {
  return !hubRosterPositionDetail(jobTitle);
}

/** Unique User-row standard: Team · Position. Status lives on FilterOption.status. */
export function hubRosterUserDetail(input: {
  teamSlug?: string | null;
  jobTitle?: string | null;
}): string | undefined {
  const team = hubRosterTeamDetail(input.teamSlug, input.jobTitle);
  const position = hubRosterPositionDetail(input.jobTitle);
  if (team && position && team === position) return team;
  const parts = [team, position].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

export function hubRosterUserRowMeta(input: {
  teamSlug?: string | null;
  jobTitle?: string | null;
  lastActivityAt?: string | null;
  now?: number;
}): {
  detail: string | undefined;
  detailPlaceholder?: string;
  status: { tone: HubRosterPresence; label: string };
} {
  return {
    detail: hubRosterUserDetail(input),
    detailPlaceholder: hubRosterPositionMissing(input.jobTitle)
      ? HUB_ROSTER_POSITION_PLACEHOLDER
      : undefined,
    status: hubRosterPresence(input.lastActivityAt, input.now),
  };
}
