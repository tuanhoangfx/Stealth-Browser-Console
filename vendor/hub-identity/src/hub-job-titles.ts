/** Per-tool job titles on Hub grants (`tool_access.job_title`).
 * Scoped Users embeds (P0012 / P0015) edit this for one tool only — independent of
 * Hub profile Role and of `tool_access.team_slug`.
 */
export type HubJobTitleSlug = "ceo" | "manager" | "employee";

export type HubJobTitleDef = {
  slug: HubJobTitleSlug;
  /** English product label — UI/catalog SSOT. */
  label: string;
  /** Short mission line for Grant/Edit hints. */
  description: string;
  emoji: string;
};

/** Shared header/filter glyph for a job-title field. */
export const HUB_JOB_TITLE_FIELD_EMOJI = "💼";

export const HUB_JOB_TITLES: readonly HubJobTitleDef[] = [
  {
    slug: "ceo",
    label: "CEO",
    description: "Executive leadership for this tool roster.",
    emoji: "🧭",
  },
  {
    slug: "manager",
    label: "Manager",
    description: "Lead and coordinate the tool team.",
    emoji: "👨‍💼",
  },
  {
    slug: "employee",
    label: "Employee",
    description: "Individual contributor on this tool.",
    emoji: "👤",
  },
] as const;

const HUB_JOB_TITLE_BY_SLUG = Object.fromEntries(HUB_JOB_TITLES.map((t) => [t.slug, t])) as Record<
  HubJobTitleSlug,
  HubJobTitleDef
>;

export function isHubJobTitleSlug(value: string | null | undefined): value is HubJobTitleSlug {
  return Boolean(value && value in HUB_JOB_TITLE_BY_SLUG);
}

export function cleanHubJobTitleSlug(value: string | null | undefined): HubJobTitleSlug | null {
  const v = (value ?? "").trim().toLowerCase();
  return isHubJobTitleSlug(v) ? v : null;
}

export function hubJobTitleLabel(slug: HubJobTitleSlug | null | undefined): string {
  if (!slug) return "";
  return HUB_JOB_TITLE_BY_SLUG[slug]?.label ?? slug;
}

/** Seniority rank for sorting rows — CEO → Manager → Employee, unassigned last. */
export function hubJobTitleRank(value: string | null | undefined): number {
  const slug = cleanHubJobTitleSlug(value);
  if (!slug) return Number.MAX_SAFE_INTEGER;
  const index = HUB_JOB_TITLES.findIndex((title) => title.slug === slug);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

export function hubJobTitleDef(slug: HubJobTitleSlug | null | undefined): HubJobTitleDef | null {
  if (!slug) return null;
  return HUB_JOB_TITLE_BY_SLUG[slug] ?? null;
}

/** FilterBar / HubAdmClickFilterField options. */
export function hubJobTitleFilterOptions(): { value: string; label: string; detail: string; tip: string }[] {
  return HUB_JOB_TITLES.map((t) => ({
    value: t.slug,
    label: `${t.emoji} ${t.label}`,
    detail: t.description,
    tip: t.description,
  }));
}

/** Users directory FilterBar options — emoji field separate from label. */
export function hubJobTitleStickerFilterOptions(opts?: {
  includeNone?: boolean;
  noneLabel?: string;
  noneEmoji?: string;
}): {
  value: string;
  label: string;
  emoji: string;
  tip?: string;
}[] {
  const titles = HUB_JOB_TITLES.map((t) => ({
    value: t.slug,
    label: t.label,
    emoji: t.emoji,
    tip: t.description,
  }));
  if (!opts?.includeNone) return titles;
  return [
    ...titles,
    {
      value: "",
      label: opts.noneLabel ?? "None",
      emoji: opts.noneEmoji ?? "🚫",
      tip: "No job title assigned",
    },
  ];
}
