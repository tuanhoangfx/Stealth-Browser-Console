import registry from "./hub-brand-icons.registry.json";
import type { HubBrandIconShell } from "../shell/filter-dropdown-primitives";

export type HubBrandIconId = (typeof registry)[number]["id"];

export type HubBrandIconMeta = {
  id: HubBrandIconId;
  label: string;
  match?: string;
  src: string;
  shell: HubBrandIconShell;
  faviconDomain?: string;
};

const ENTRIES = registry as HubBrandIconMeta[];
const BY_ID = new Map(ENTRIES.map((entry) => [entry.id, entry]));
const MATCHERS = ENTRIES.filter((entry) => entry.match).map((entry) => ({
  entry,
  re: new RegExp(entry.match!, "i"),
}));

const matchCache = new Map<string, HubBrandIconMeta | null>();

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

/** Resolve brand icon by service/platform label (Account vault, filters). */
export function resolveHubBrandIconByMatch(service: string): HubBrandIconMeta | null {
  const key = service.trim().toLowerCase();
  if (!key) return null;
  const cached = matchCache.get(key);
  if (cached !== undefined) return cached;
  const hit = MATCHERS.find((item) => item.re.test(key))?.entry ?? null;
  const resolved = hit ? withShell(hit) : null;
  matchCache.set(key, resolved);
  return resolved;
}

/** All registered brand icon ids — for tests and tooling. */
export function listHubBrandIconIds(): HubBrandIconId[] {
  return ENTRIES.map((entry) => entry.id);
}

/** @internal test helper */
export function clearHubBrandIconMatchCache(): void {
  matchCache.clear();
}
