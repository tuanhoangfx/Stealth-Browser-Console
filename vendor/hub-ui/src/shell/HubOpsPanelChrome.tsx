import { useMemo, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
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
  /** Emoji is the Log/Release default; `Icon` is kept for tool-specific Notify severity chrome. */
  emoji?: string;
  Icon?: LucideIcon;
  className: string;
};

const HUB_OPS_TYPE_TOC_CHROME: Record<string, HubOpsTypeTocChrome> = {
  all: { label: "All", emoji: "◉", className: "text-indigo-300" },
  create: { label: "Create", emoji: "✳️", className: "text-emerald-400" },
  update: { label: "Update", emoji: "⚡", className: "text-violet-300" },
  delete: { label: "Delete", emoji: "🗑️", className: "text-rose-400" },
};

/** Timeline row kind badges — same chip chrome as Update Release (`ReleaseKindBadge`). */
export type HubOpsKindBadgeMeta = {
  label: string;
  emoji: string;
  className: string;
  chip: string;
};

const HUB_OPS_KIND_BADGE_META: Record<string, HubOpsKindBadgeMeta> = {
  create: {
    label: "Create",
    emoji: "✳️",
    className: "text-emerald-300",
    chip: "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
  },
  new: {
    label: "New",
    emoji: "✳️",
    className: "text-emerald-300",
    chip: "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
  },
  update: {
    label: "Update",
    emoji: "⚡",
    className: "text-violet-300",
    chip: "border-violet-400/40 bg-violet-500/15 text-violet-100",
  },
  improve: {
    label: "Update",
    emoji: "⚡",
    className: "text-violet-300",
    chip: "border-violet-400/40 bg-violet-500/15 text-violet-100",
  },
  delete: {
    label: "Removed",
    emoji: "🗑️",
    className: "text-rose-400",
    chip: "border-rose-400/35 bg-rose-500/15 text-rose-100",
  },
  fix: {
    label: "Fixed",
    emoji: "🛠️",
    className: "text-amber-300",
    chip: "border-amber-400/35 bg-amber-500/15 text-amber-100",
  },
  system: {
    label: "System",
    emoji: "📋",
    className: "text-cyan-300",
    chip: "border-cyan-400/35 bg-cyan-500/15 text-cyan-100",
  },
  sync: {
    label: "Sync",
    emoji: "🔄",
    className: "text-indigo-300",
    chip: "border-indigo-400/35 bg-indigo-500/15 text-indigo-100",
  },
};

export function resolveHubOpsKindBadgeMeta(kind: string | undefined): HubOpsKindBadgeMeta | null {
  if (!kind) return null;
  const key = kind.trim().toLowerCase();
  if (key in HUB_OPS_KIND_BADGE_META) return HUB_OPS_KIND_BADGE_META[key]!;
  const toc = resolveHubOpsTypeTocChrome(key);
  return {
    label: toc.label,
    emoji: toc.emoji ?? "📋",
    className: toc.className,
    chip: "border-white/15 bg-white/[.04] text-[var(--text)]/90",
  };
}

/** Kind badge — Log · Notify · Release timeline row SSOT. */
export function HubOpsKindBadge({ kind }: { kind?: string }) {
  const meta = resolveHubOpsKindBadgeMeta(kind);
  if (!meta) return null;
  return (
    <span
      className={`hub-release-kind-badge inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${meta.chip}`}
    >
      <span className={`text-[11px] leading-none ${meta.className}`} aria-hidden>{meta.emoji}</span>
      {meta.label}
    </span>
  );
}

/** TOC glyph/label for a kind — CRUD verbs first, then activity kind meta. */
export function resolveHubOpsTypeTocChrome(kind: HubActivityKindFilter): HubOpsTypeTocChrome {
  const fixed = HUB_OPS_TYPE_TOC_CHROME[kind as string];
  if (fixed) return fixed;
  const meta = resolveHubActivityKindMeta(kind);
  return {
    label: meta?.label ?? String(kind),
    emoji: meta?.label ? "📋" : "•",
    className: meta?.className ?? "text-slate-300",
  };
}

export function hubOpsTypeTocIcon(kind: HubActivityKindFilter): ReactNode {
  const { emoji, Icon, className } = resolveHubOpsTypeTocChrome(kind);
  if (emoji) return <span className={`text-[11px] leading-none ${className}`} aria-hidden>{emoji}</span>;
  return Icon ? <Icon size={11} className={className} aria-hidden /> : null;
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
    const { label, emoji, Icon, className } = chrome(kind);
    return {
      kind,
      label,
      icon: emoji ? (
        <span className={`text-[11px] leading-none ${className}`} aria-hidden>{emoji}</span>
      ) : Icon ? (
        <Icon size={11} className={className} aria-hidden />
      ) : null,
      count,
    };
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

/** Header-center search — centered in the ops modal header (Update · Log · Notify SSOT). */
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
    <div className="hub-ops-panel-search mx-auto w-full max-w-2xl">
      <HubActivityFeedToolbar
        query={query}
        onQueryChange={onQueryChange}
        kindFilter="all"
        onKindFilterChange={() => {}}
        showKindFilters={false}
        searchPlaceholder={placeholder}
        variant="header"
      />
    </div>
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
