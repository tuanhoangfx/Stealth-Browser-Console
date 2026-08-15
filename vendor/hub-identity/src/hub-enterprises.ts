/** Hub business enterprises — child Tool ownership (SSOT). */

export const HUB_ENTERPRISE_SLUGS = ["infi", "enzy", "mie"] as const;

export type HubEnterpriseSlug = (typeof HUB_ENTERPRISE_SLUGS)[number];

export type HubEnterpriseDef = {
  slug: HubEnterpriseSlug;
  name: string;
  /** Directory / filter glyph (pairs with Lucide in badge-registry). */
  emoji: string;
  sortOrder: number;
};

export const HUB_ENTERPRISES: readonly HubEnterpriseDef[] = [
  { slug: "infi", name: "Infi", emoji: "♾️", sortOrder: 1 },
  { slug: "enzy", name: "Enzy", emoji: "⚡", sortOrder: 2 },
  { slug: "mie", name: "Mie", emoji: "✂️", sortOrder: 3 },
] as const;

/** Column / filter header glyph for the Enterprise facet (not brand emoji). */
export const HUB_ENTERPRISE_FIELD_EMOJI = "🏢";

/** Brand-owned child tools (override). Everything else defaults to Infi. */
export const DEFAULT_TOOL_ENTERPRISE: Readonly<Partial<Record<string, HubEnterpriseSlug>>> = {
  P0009: "mie",
  P0014: "mie",
  P0015: "enzy",
};

export function isHubEnterpriseSlug(value: string | null | undefined): value is HubEnterpriseSlug {
  return HUB_ENTERPRISE_SLUGS.includes(value as HubEnterpriseSlug);
}

export function hubEnterpriseName(slug: string | null | undefined): string {
  if (!isHubEnterpriseSlug(slug)) return "Infi";
  return HUB_ENTERPRISES.find((e) => e.slug === slug)?.name ?? "Infi";
}

export function hubEnterpriseEmoji(slug: string | null | undefined): string {
  if (!isHubEnterpriseSlug(slug)) return "♾️";
  return HUB_ENTERPRISES.find((e) => e.slug === slug)?.emoji ?? "♾️";
}

/** Optional overlay from `hub_enterprise_tools` — wins over the static map. */
export type ToolEnterpriseCatalog = Readonly<Partial<Record<string, HubEnterpriseSlug>>>;

export function resolveToolEnterpriseSlug(
  toolCode: string,
  catalog?: ToolEnterpriseCatalog | null,
): HubEnterpriseSlug {
  const code = toolCode.trim().toUpperCase();
  const fromDb = catalog?.[code];
  if (isHubEnterpriseSlug(fromDb)) return fromDb;
  return DEFAULT_TOOL_ENTERPRISE[code] ?? "infi";
}
