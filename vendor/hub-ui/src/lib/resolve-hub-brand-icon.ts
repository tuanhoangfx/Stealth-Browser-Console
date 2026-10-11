import registry from "./hub-brand-icons.registry.json";
import type { HubBrandIconShell } from "../shell/filter-dropdown-primitives";

export type HubBrandIconId = (typeof registry)[number]["id"];

export type HubBrandIconMeta = {
  id: HubBrandIconId;
  /** Company or artwork title (tooltip). Not the catalog service name when `service` is set. */
  label: string;
  /**
   * Canonical service name for Service, Material, and Orders.
   * Omit when `label` is already that name (`Canva`). Set when the title differs (`OpenAI` → `ChatGPT`).
   */
  service?: string;
  /** Parent service row when this entry is only a glyph (`google-drive` → `google-one`). */
  serviceId?: HubBrandIconId;
  match?: string;
  src: string;
  shell: HubBrandIconShell;
  faviconDomain?: string;
  /** Extra hosts for Cookie Bridge / route icons (e.g. Claude.ai + Claude.com). */
  faviconDomains?: string[];
  /**
   * Span rewrites for plan text (`chat gpt plus` → ChatGPT Plus).
   * Longest `match` wins. Not used for icon identity.
   */
  phrases?: ReadonlyArray<{ match: string; label: string }>;
};

export type HubServiceIdentity = {
  /** Catalog key shared by Service, Material, and Orders. */
  id: HubBrandIconId;
  /** Canonical service name. */
  service: string;
  /** Registry title (may be the company, not the service). */
  label: string;
  src: string;
  shell: HubBrandIconShell;
  /** Input is the service itself (`Canva`, `OpenAI`), not a longer SKU. */
  coversWhole: boolean;
};

const ENTRIES = registry as HubBrandIconMeta[];
const BY_ID = new Map(ENTRIES.map((entry) => [entry.id, entry]));
const MATCHERS = ENTRIES.filter((entry) => entry.match).map((entry) => ({
  entry,
  re: new RegExp(entry.match!, "i"),
}));

const matchCache = new Map<string, HubBrandIconMeta | null>();

let phraseRewriters: Array<{ re: RegExp; label: string }> | null = null;

function brandPhraseRewriters(): Array<{ re: RegExp; label: string }> {
  if (phraseRewriters) return phraseRewriters;
  const rows: Array<{ match: string; label: string; index: number }> = [];
  for (const entry of ENTRIES) {
    for (const phrase of entry.phrases ?? []) {
      const match = phrase.match?.trim();
      const label = phrase.label?.trim();
      if (!match || !label) continue;
      rows.push({ match, label, index: rows.length });
    }
  }
  rows.sort((a, b) => b.match.length - a.match.length || a.index - b.index);
  phraseRewriters = rows.map((row) => ({ re: new RegExp(row.match, "gi"), label: row.label }));
  return phraseRewriters;
}

/**
 * Rewrite brand spans from registry `phrases` (longest pattern first).
 * The rest of the string keeps its stored case.
 */
export function rewriteHubBrandPhrases(text: string): string {
  if (!text) return text;
  let out = text;
  for (const { re, label } of brandPhraseRewriters()) {
    re.lastIndex = 0;
    out = out.replace(re, label);
  }
  return out;
}

function inferShell(entry: HubBrandIconMeta): HubBrandIconShell {
  if (entry.shell) return entry.shell;
  if (entry.src.includes("/icons/github.svg")) return "tile";
  if (entry.src.includes("/icons/vercel.svg")) return "darkInk";
  if (entry.src.includes("/assets/brand-icons/") && /\.(png|ico)$/i.test(entry.src)) return "bare";
  return "bare";
}

function withShell(entry: HubBrandIconMeta): HubBrandIconMeta {
  return { ...entry, shell: inferShell(entry) };
}

/** Resolve shared Hub brand icon by stable id (sidebar, filters, directory cards). */
export function resolveHubBrandIcon(id: HubBrandIconId): HubBrandIconMeta | null {
  const hit = BY_ID.get(id);
  return hit ? withShell(hit) : null;
}

/**
 * Dedicated match plus hyphen-family fallbacks (`google-one` → `google`,
 * `github-copilot` → `github`, `capcut-*` → `capcut`) so a missing PNG
 * can still render a sibling brand before the empty glyph.
 */
export function resolveHubBrandFamilyHits(primary: HubBrandIconMeta | null): HubBrandIconMeta[] {
  const hits: HubBrandIconMeta[] = [];
  const seen = new Set<string>();
  const push = (hit: HubBrandIconMeta | null) => {
    if (!hit?.src || seen.has(hit.src)) return;
    seen.add(hit.src);
    hits.push(hit);
  };
  push(primary);
  const root = primary?.id?.split("-")[0];
  if (root && root !== primary?.id) {
    push(resolveHubBrandIcon(root as HubBrandIconId));
  }
  return hits;
}

function compactServiceKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s._-]+/g, "");
}

/** Catalog service name — `service` override, else registry `label`. */
export function hubServiceName(entry: Pick<HubBrandIconMeta, "label" | "service"> | null | undefined): string {
  const service = entry?.service?.trim();
  if (service) return service;
  return entry?.label?.trim() ?? "";
}

/**
 * One service + icon for every tool.
 * `id` / `service` are the catalog row. `src` is that row's icon (parent when `serviceId` is set).
 * Product glyphs that differ (Google Drive) still come from `resolveHubBrandIconByMatch`.
 */
export function resolveHubServiceIdentity(text: string): HubServiceIdentity | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const brand = resolveHubBrandIconByMatch(trimmed);
  if (!brand) return null;
  const serviceId = brand.serviceId ?? brand.id;
  const parent = serviceId !== brand.id ? resolveHubBrandIcon(serviceId) : brand;
  const icon = parent ?? brand;
  const service = brand.service?.trim() || parent?.service?.trim() || parent?.label || brand.label;
  const compact = compactServiceKey(trimmed);
  const names = [service, brand.label, parent?.label, brand.id, serviceId].filter(
    (item): item is string => Boolean(item),
  );
  let coversWhole = names.some((item) => compactServiceKey(item) === compact);
  if (!coversWhole && brand.match) {
    const matched = new RegExp(brand.match, "i").exec(trimmed.toLowerCase());
    coversWhole = Boolean(matched && matched[0].length === trimmed.length);
  }
  return {
    id: serviceId,
    service,
    label: brand.label,
    src: icon.src,
    shell: icon.shell,
    coversWhole,
  };
}

/** Resolve brand icon by service/platform label (Account vault, filters). */
export function resolveHubBrandIconByMatch(service: string): HubBrandIconMeta | null {
  const key = service.trim().toLowerCase();
  if (!key) return null;
  const cached = matchCache.get(key);
  if (cached !== undefined) return cached;
  // Longest matched text wins so a dedicated brand (`google one`, `proxy mkvn`)
  // beats a shorter family pattern (`google`, `proxy`) regardless of registry order.
  let best: HubBrandIconMeta | null = null;
  let bestLen = 0;
  for (const item of MATCHERS) {
    const matched = item.re.exec(key);
    if (!matched) continue;
    const len = matched[0].length;
    if (len > bestLen) {
      bestLen = len;
      best = item.entry;
    }
  }
  const resolved = best ? withShell(best) : null;
  matchCache.set(key, resolved);
  return resolved;
}

/**
 * SSOT empty / unknown brand glyph — directory table + filter dropdowns (⭕).
 * Render inside 16px brand icon box for size parity with brand imgs.
 */
export const HUB_DIRECTORY_BRAND_EMPTY_GLYPH = "⭕";

/**
 * Emoji fallback for unknown platform/service labels (no brand icon match).
 * Keeps UI glyph-only parity without Lucide fallback.
 */
export function resolveHubBrandFallbackGlyph(label: string | null | undefined): string {
  const key = String(label ?? "").trim().toLowerCase();
  if (!key) return HUB_DIRECTORY_BRAND_EMPTY_GLYPH;
  if (/(temp\s*mail|tempmail|gmail\s*edu|gmail|outlook|icloud)/.test(key)) return "✉️";
  if (/\bmail\b/.test(key)) return "✉️";
  if (/(facebook|zalo|telegram|tiktok|douyin|weibo|instagram|youtube|whatsapp|discord|twitter|x\\b)/.test(key)) {
    return "🌐";
  }
  if (/(chatgpt|gpt|claude|gemini|cursor|openai|copilot|\bai\b)/.test(key)) return "✨";
  if (/(bank|tpbank|techcom|vietcom|bidv|acb|mbbank|vpbank|seabank)/.test(key)) return "🏦";
  return HUB_DIRECTORY_BRAND_EMPTY_GLYPH;
}

/** All registered brand icon ids — for tests and tooling. */
export function listHubBrandIconIds(): HubBrandIconId[] {
  return ENTRIES.map((entry) => entry.id);
}

/** @internal test helper */
export function clearHubBrandIconMatchCache(): void {
  matchCache.clear();
}
