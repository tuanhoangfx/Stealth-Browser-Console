import { useMemo, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Layers, Pencil, ScrollText, Trash2, UserPlus } from "lucide-react";
import {
  HubActivityFeedToolbar,
  resolveHubActivityKindMeta,
  type HubActivityKindFilter,
} from "./HubActivityFeed";

/**
 * Shared chrome for the Layout 2 ops panels (Log · Notify).
 *
 * Both modals render the same shell: search in `headerCenter`, count badge in
 * `headerTrailing`, "Mark all read" in `headerActions`, and a **type-first TOC**
 * on the left whose rows filter the feed (they replaced the old header kind
 * chips). Everything shared between `HubUsageLogPanel` and `HubNotifyPanel`
 * lives here — the panels only supply their own data shaping.
 */

/** CRUD kinds — pinned in the type TOC while opaque feed sections exist. */
export const HUB_OPS_CRUD_KINDS = ["create", "update", "delete"] as const;

export type HubOpsTypeTocChrome = {
  label: string;
  Icon: LucideIcon;
  className: string;
};

const HUB_OPS_TYPE_TOC_CHROME: Record<string, HubOpsTypeTocChrome> = {
  all: { label: "All", Icon: Layers, className: "text-indigo-300" },
  create: { label: "Create", Icon: UserPlus, className: "text-emerald-400" },
  update: { label: "Update", Icon: Pencil, className: "text-sky-300" },
  delete: { label: "Delete", Icon: Trash2, className: "text-rose-400" },
};

/** TOC glyph/label for a kind — CRUD verbs first, then activity kind meta. */
export function resolveHubOpsTypeTocChrome(kind: HubActivityKindFilter): HubOpsTypeTocChrome {
  const fixed = HUB_OPS_TYPE_TOC_CHROME[kind as string];
  if (fixed) return fixed;
  const meta = resolveHubActivityKindMeta(kind);
  return {
    label: meta?.label ?? String(kind),
    Icon: meta?.Icon ?? ScrollText,
    className: meta?.className ?? "text-slate-300",
  };
}

export function hubOpsTypeTocIcon(kind: HubActivityKindFilter): ReactNode {
  const { Icon, className } = resolveHubOpsTypeTocChrome(kind);
  return <Icon size={11} className={className} aria-hidden />;
}

export function hubOpsTypeTocLabel(kind: HubActivityKindFilter): string {
  return resolveHubOpsTypeTocChrome(kind).label;
}

export type HubOpsTypeTocEntry = {
  kind: HubActivityKindFilter;
  label: string;
  icon: ReactNode;
  /** Omitted when the panel cannot count every source (partial numbers mislead). */
  count?: number;
};

export type HubOpsTypeTocInput = {
  /** Kind of every row the panel can enumerate (already search-filtered). */
  kinds: readonly string[];
  /** Fixed head order — kinds outside the list append after, sorted. */
  order?: readonly string[];
  /** Kinds shown even with zero rows while `hasExtraSections` (CRUD parity). */
  pinnedKinds?: readonly string[];
  /** Per-kind totals for rows the panel cannot enumerate (opaque sections). */
  extraCounts?: Readonly<Record<string, number>>;
  /** False when any opaque source omits counts → hide the misleading numbers. */
  extraCountsComplete?: boolean;
  /** Whether opaque sections exist at all. */
  hasExtraSections?: boolean;
  /** Override TOC chrome per kind (e.g. Notify severity buckets). */
  chromeOf?: (kind: HubActivityKindFilter) => HubOpsTypeTocChrome | null | undefined;
};

/** Type-first TOC entries — `All` head row, then kinds with data (or pinned). */
export function buildHubOpsTypeTocEntries({
  kinds,
  order = HUB_OPS_CRUD_KINDS,
  pinnedKinds = [],
  extraCounts,
  extraCountsComplete = true,
  hasExtraSections = false,
  chromeOf,
}: HubOpsTypeTocInput): HubOpsTypeTocEntry[] {
  const chrome = (kind: HubActivityKindFilter): HubOpsTypeTocChrome =>
    chromeOf?.(kind) ?? resolveHubOpsTypeTocChrome(kind);
  const toEntry = (kind: HubActivityKindFilter, count?: number): HubOpsTypeTocEntry => {
    const { label, Icon, className } = chrome(kind);
    return { kind, label, icon: <Icon size={11} className={className} aria-hidden />, count };
  };

  const ownCounts = new Map<string, number>();
  for (const kind of kinds) ownCounts.set(kind, (ownCounts.get(kind) ?? 0) + 1);

  const extras = new Map<string, number>();
  let extraTotal = 0;
  for (const [kind, count] of Object.entries(extraCounts ?? {})) {
    if (typeof count !== "number" || count <= 0) continue;
    extras.set(kind, (extras.get(kind) ?? 0) + count);
    extraTotal += count;
  }

  const visible: string[] = [];
  for (const kind of order) {
    const hasData = (ownCounts.get(kind) ?? 0) > 0 || (extras.get(kind) ?? 0) > 0;
    if ((hasExtraSections && pinnedKinds.includes(kind)) || hasData) visible.push(kind);
  }
  const customs = new Set<string>();
  for (const key of ownCounts.keys()) if (!visible.includes(key)) customs.add(key);
  for (const key of extras.keys()) if (!visible.includes(key)) customs.add(key);
  visible.push(...[...customs].sort());

  const entries: HubOpsTypeTocEntry[] = [
    toEntry("all", extraCountsComplete ? kinds.length + extraTotal : undefined),
  ];
  for (const kind of visible) {
    const own = ownCounts.get(kind) ?? 0;
    const total = own + (extras.get(kind) ?? 0);
    const isPinned = pinnedKinds.includes(kind);
    const ownOnly = !hasExtraSections || (!isPinned && own === total);
    entries.push(toEntry(kind, extraCountsComplete || ownOnly ? total : undefined));
  }
  return entries;
}

/** Memoized {@link buildHubOpsTypeTocEntries} — `enabled: false` yields `[]`. */
export function useHubOpsTypeToc(
  input: HubOpsTypeTocInput & { enabled?: boolean },
): HubOpsTypeTocEntry[] {
  const {
    kinds,
    order,
    pinnedKinds,
    extraCounts,
    extraCountsComplete,
    hasExtraSections,
    chromeOf,
    enabled = true,
  } = input;
  return useMemo(
    () =>
      enabled
        ? buildHubOpsTypeTocEntries({
            kinds,
            order,
            pinnedKinds,
            extraCounts,
            extraCountsComplete,
            hasExtraSections,
            chromeOf,
          })
        : [],
    [
      chromeOf,
      enabled,
      extraCounts,
      extraCountsComplete,
      hasExtraSections,
      kinds,
      order,
      pinnedKinds,
    ],
  );
}

export type HubOpsTypeTocNavProps = {
  entries: readonly HubOpsTypeTocEntry[];
  active: HubActivityKindFilter;
  onSelect: (kind: HubActivityKindFilter) => void;
  ariaLabel?: string;
};

/** Type-first TOC rail — click filters the feed (chips replacement, not scrollspy). */
export function HubOpsTypeTocNav({
  entries,
  active,
  onSelect,
  ariaLabel = "Types",
}: HubOpsTypeTocNavProps) {
  return (
    <nav className="hub-toc-nav__list hub-ops-type-toc space-y-0.5" aria-label={ariaLabel}>
      {entries.map((entry) => {
        const isActive = active === entry.kind;
        return (
          <button
            key={entry.kind}
            type="button"
            aria-pressed={isActive}
            data-kind={entry.kind}
            onClick={() => onSelect(entry.kind)}
            className={`hub-toc-nav__item group relative z-[1] min-h-[var(--overview-toc-row-h,2rem)] w-full cursor-pointer text-left text-[13px] transition-colors${
              isActive ? " is-active" : ""
            }`}
          >
            <span className="hub-toc-nav__label flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-[var(--muted)] transition-all duration-200 group-hover:text-[var(--text)]">
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[.03] text-[var(--muted)] group-hover:text-indigo-200 [&>svg]:size-[11px]"
                aria-hidden
              >
                {entry.icon}
              </span>
              <span className="truncate">{entry.label}</span>
              {entry.count != null ? (
                <span className="ml-auto shrink-0 pl-1 text-[10px] tabular-nums text-[var(--muted)]/90">
                  {entry.count}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/** Header-center search — chips live in the TOC now, so they are always off. */
export function HubOpsPanelSearch({
  query,
  onQueryChange,
  placeholder = "Search…",
}: {
  query: string;
  onQueryChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <HubActivityFeedToolbar
      query={query}
      onQueryChange={onQueryChange}
      kindFilter="all"
      onKindFilterChange={() => {}}
      showKindFilters={false}
      searchPlaceholder={placeholder}
      variant="header"
    />
  );
}

const HUB_OPS_BADGE_TONE = {
  cyan: "bg-cyan-500/10 text-cyan-200",
  amber: "bg-amber-500/10 text-amber-200",
} as const;

export type HubOpsPanelBadgeTone = keyof typeof HUB_OPS_BADGE_TONE;

/** Header count pill (Log cyan · Notify amber). */
export function HubOpsPanelBadge({
  count,
  tone = "cyan",
}: {
  count: number;
  tone?: HubOpsPanelBadgeTone;
}) {
  return (
    <span
      className={`hub-ops-panel-badge rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${HUB_OPS_BADGE_TONE[tone]}`}
    >
      {count}
    </span>
  );
}

/** Right-corner header action — shared by Log (vault activity) and Notify. */
export function HubOpsMarkAllReadButton({
  onClick,
  label = "Mark all read",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="hub-ops-mark-all-read rounded-md border border-white/10 bg-white/[.04] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)] transition-colors hover:bg-white/[.08] hover:text-[var(--text)]"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
