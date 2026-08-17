/** Org department teams — reusable across Hub tool Users screens (`tool_access.team_slug`).
 * P0012 Users/Attendance Team consume this catalog. P0005 CRM / P0020 Data-Box have no
 * local Users access directory (`/users` → Tool Hub P0004); import here when those tools add grant UI.
 */
import { cleanHubJobTitleSlug } from "./hub-job-titles";

export type HubOrgTeamSlug =
  | "ceo"
  | "sales"
  | "marketing"
  | "warehouse"
  | "engineering"
  | "technology"
  | "accounting";

export type HubOrgTeamDef = {
  slug: HubOrgTeamSlug;
  /** English product label — UI/catalog SSOT. */
  label: string;
  /** Short mission line for Grant/Edit hints. */
  description: string;
  emoji: string;
};

/** Shared header/filter glyph for a team membership field. */
export const HUB_TEAM_FIELD_EMOJI = "🤝";

/** Catalog order is the org seniority ladder: CEO → Technology → … → Accounting.
 * Users directory sort + FilterBar option order both read this rank, so keep them in sync here.
 */
export const HUB_ORG_TEAMS: readonly HubOrgTeamDef[] = [
  {
    slug: "ceo",
    label: "CEO",
    description: "Lead company strategy and executive decisions.",
    emoji: "🧭",
  },
  {
    slug: "technology",
    label: "Technology",
    description: "Build, operate, and evolve the technology platform.",
    emoji: "💻",
  },
  {
    slug: "sales",
    label: "Sales",
    description: "Open new points of sale and grow revenue.",
    emoji: "📈",
  },
  {
    slug: "marketing",
    label: "Marketing",
    description: "Build the brand and expand media reach.",
    emoji: "🎯",
  },
  {
    slug: "warehouse",
    label: "Warehouse",
    description: "Manage inventory and coordinate products.",
    emoji: "📦",
  },
  {
    slug: "engineering",
    label: "Engineering",
    description: "Monitor, measure, and assess product quality.",
    emoji: "🛠️",
  },
  {
    slug: "accounting",
    label: "Accounting",
    description: "Consolidate financial reports.",
    emoji: "📊",
  },
] as const;

const HUB_ORG_TEAM_BY_SLUG = Object.fromEntries(HUB_ORG_TEAMS.map((t) => [t.slug, t])) as Record<
  HubOrgTeamSlug,
  HubOrgTeamDef
>;

export function isHubOrgTeamSlug(value: string | null | undefined): value is HubOrgTeamSlug {
  return Boolean(value && value in HUB_ORG_TEAM_BY_SLUG);
}

export function cleanHubOrgTeamSlug(value: string | null | undefined): HubOrgTeamSlug | null {
  const v = (value ?? "").trim().toLowerCase();
  return isHubOrgTeamSlug(v) ? v : null;
}

export function hubOrgTeamLabel(slug: HubOrgTeamSlug | null | undefined): string {
  if (!slug) return "";
  return HUB_ORG_TEAM_BY_SLUG[slug]?.label ?? slug;
}

/** Seniority rank for sorting rows — unknown/unassigned teams sort last. */
export function hubOrgTeamRank(value: string | null | undefined): number {
  const slug = cleanHubOrgTeamSlug(value);
  if (!slug) return Number.MAX_SAFE_INTEGER;
  const index = HUB_ORG_TEAMS.findIndex((team) => team.slug === slug);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

export function hubOrgTeamDef(slug: HubOrgTeamSlug | null | undefined): HubOrgTeamDef | null {
  if (!slug) return null;
  return HUB_ORG_TEAM_BY_SLUG[slug] ?? null;
}

/**
 * Position CEO implies Team CEO when `tool_access.team_slug` is still empty.
 * Todo board / Org chart / Data Box `profiles.team_slug` mirror all read this.
 */
export function effectiveHubOrgTeamSlug(
  teamSlug: string | null | undefined,
  jobTitle?: string | null,
): HubOrgTeamSlug | null {
  return cleanHubOrgTeamSlug(teamSlug) ?? (cleanHubJobTitleSlug(jobTitle) === "ceo" ? "ceo" : null);
}

/** FilterBar / HubAdmClickFilterField options. */
export function hubOrgTeamFilterOptions(): { value: string; label: string; detail: string; tip: string }[] {
  return HUB_ORG_TEAMS.map((t) => ({
    value: t.slug,
    label: `${t.emoji} ${t.label}`,
    detail: t.description,
    tip: t.description,
  }));
}

/** Users directory FilterBar options — emoji field separate from label (Hub FilterOption shape). */
export function hubOrgTeamStickerFilterOptions(opts?: {
  includeNone?: boolean;
  noneLabel?: string;
  noneEmoji?: string;
}): {
  value: string;
  label: string;
  emoji: string;
  tip?: string;
}[] {
  const teams = HUB_ORG_TEAMS.map((t) => ({
    value: t.slug,
    label: t.label,
    emoji: t.emoji,
    tip: t.description,
  }));
  if (!opts?.includeNone) return teams;
  return [
    ...teams,
    {
      value: "",
      label: opts.noneLabel ?? "None",
      emoji: opts.noneEmoji ?? "🚫",
      tip: "No team assigned",
    },
  ];
}
