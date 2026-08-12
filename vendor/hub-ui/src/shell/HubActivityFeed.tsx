import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";
import { ExternalLink, Pencil, Search, Trash2, UserPlus } from "lucide-react";

export type HubActivityFeedKind = "create" | "update" | "delete";

export type HubActivityKindFilter = "all" | HubActivityFeedKind;

export type HubActivityFeedItem = {
  id: string;
  kind?: HubActivityFeedKind;
  label: string;
  detail?: string;
  at?: number;
  /** When false, hide ExternalLink (e.g. delete rows). Default true when onOpenDetail set. */
  canOpenDetail?: boolean;
  body?: ReactNode;
};

const KIND_META: Record<
  HubActivityFeedKind,
  { label: string; Icon: LucideIcon; className: string }
> = {
  create: { label: "New", Icon: UserPlus, className: "text-emerald-400" },
  update: { label: "Update", Icon: Pencil, className: "text-sky-300" },
  delete: { label: "Removed", Icon: Trash2, className: "text-rose-400" },
};

export function resolveHubActivityKindMeta(kind: HubActivityFeedKind | undefined): {
  label: string;
  Icon: LucideIcon;
  className: string;
} | null {
  if (!kind || !(kind in KIND_META)) return null;
  return KIND_META[kind];
}

export function hubActivityKindLabel(kind: HubActivityFeedKind): string {
  return KIND_META[kind].label;
}

export function filterHubActivityFeedItems(
  items: readonly HubActivityFeedItem[],
  query: string,
  kindFilter: HubActivityKindFilter,
): HubActivityFeedItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (kindFilter !== "all" && item.kind !== kindFilter) return false;
    if (!q) return true;
    const hay = `${item.label} ${item.detail ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
}

export type HubActivityFeedToolbarProps = {
  query: string;
  onQueryChange: (next: string) => void;
  kindFilter: HubActivityKindFilter;
  onKindFilterChange: (next: HubActivityKindFilter) => void;
  /** Hide kind chips when false (e.g. system-only Notify). Default true. */
  showKindFilters?: boolean;
  searchPlaceholder?: string;
  /**
   * `header` — single row for Layout 2 `headerCenter` (Log / Notify / Update Release).
   * `stack` — body-mounted (legacy / standalone feeds).
   */
  variant?: "stack" | "header";
};

const KIND_CHIPS: { id: HubActivityKindFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "create", label: "Create" },
  { id: "update", label: "Update" },
  { id: "delete", label: "Delete" },
];

/** Search + All/Create/Update/Delete chips — Log / Notify / Release feed SSOT. */
export function HubActivityFeedToolbar({
  query,
  onQueryChange,
  kindFilter,
  onKindFilterChange,
  showKindFilters = true,
  searchPlaceholder = "Search…",
  variant = "stack",
}: HubActivityFeedToolbarProps) {
  const isHeader = variant === "header";
  return (
    <div
      className={
        isHeader
          ? "hub-activity-feed-toolbar hub-activity-feed-toolbar--header flex min-w-0 flex-wrap items-center gap-1.5"
          : "hub-activity-feed-toolbar mb-2 space-y-1.5"
      }
    >
      <label className={`relative block min-w-0 ${isHeader ? "flex-1" : ""}`}>
        <Search
          size={12}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-md border border-white/10 bg-white/[.03] py-1.5 pl-7 pr-2 text-xs text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-white/20"
        />
      </label>
      {showKindFilters ? (
        <div className={`flex flex-wrap gap-1 ${isHeader ? "shrink-0" : ""}`}>
          {KIND_CHIPS.map((chip) => {
            const active = kindFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  active
                    ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                    : "border-white/10 bg-white/[.03] text-[var(--muted)] hover:bg-white/[.06] hover:text-[var(--text)]"
                }`}
                onClick={() => onKindFilterChange(chip.id)}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export type HubOpsFeedFilterValue = {
  query: string;
  setQuery: (next: string) => void;
  kindFilter: HubActivityKindFilter;
  setKindFilter: (next: HubActivityKindFilter) => void;
};

const HubOpsFeedFilterContext = createContext<HubOpsFeedFilterValue | null>(null);

/** Shared query/kind filter for Layout 2 ops modals (Log · Notify · nested Vault Live). */
export function HubOpsFeedFilterProvider({
  value,
  children,
}: {
  value: HubOpsFeedFilterValue;
  children: ReactNode;
}) {
  return (
    <HubOpsFeedFilterContext.Provider value={value}>{children}</HubOpsFeedFilterContext.Provider>
  );
}

export function useHubOpsFeedFilterOptional(): HubOpsFeedFilterValue | null {
  return useContext(HubOpsFeedFilterContext);
}

export type HubActivityFeedRowsProps = {
  items: readonly HubActivityFeedItem[];
  seenIds?: ReadonlySet<string>;
  trackUnread?: boolean;
  onMarkRead?: (id: string) => void;
  onOpenDetail?: (item: HubActivityFeedItem) => void;
  onClose?: () => void;
  emptyMessage?: string;
  formatTime?: (at: number) => string;
  /** Extra leading glyph when kind is absent (e.g. severity icon). */
  resolveLeadingIcon?: (item: HubActivityFeedItem) => { Icon: LucideIcon; className: string } | null;
};

/** Shared activity row chrome — kind badge · unread · ExternalLink (Notify + Vault Live). */
export function HubActivityFeedRows({
  items,
  seenIds,
  trackUnread = false,
  onMarkRead,
  onOpenDetail,
  onClose,
  emptyMessage = "No entries.",
  formatTime,
  resolveLeadingIcon,
}: HubActivityFeedRowsProps) {
  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-xs text-[var(--muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="hub-activity-feed-rows space-y-1">
      {items.map((item) => {
        const kindMeta = resolveHubActivityKindMeta(item.kind);
        const leading = kindMeta
          ? { Icon: kindMeta.Icon, className: kindMeta.className }
          : resolveLeadingIcon?.(item) ?? null;
        const LeadingIcon = leading?.Icon;
        const isRead = trackUnread && seenIds ? seenIds.has(item.id) : false;
        const canOpen = Boolean(onOpenDetail) && item.canOpenDetail !== false && item.kind !== "delete";
        const shellClass =
          "hub-notify-alert-row flex-1 rounded-lg border border-white/5 bg-white/[.02] px-2.5 py-2 text-left transition-colors hover:bg-white/[.04]";

        return (
          <div
            key={item.id}
            className={`hub-notify-alert-item flex items-stretch gap-1.5${isRead ? " hub-notify-alert-item--read" : ""}`}
          >
            <button
              type="button"
              className={shellClass}
              onClick={() => onMarkRead?.(item.id)}
            >
              <div className="flex items-start gap-2">
                {LeadingIcon ? (
                  <LeadingIcon size={14} className={`mt-0.5 shrink-0 ${leading!.className}`} aria-hidden />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {kindMeta ? (
                      <span
                        className={`rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide ${kindMeta.className} bg-white/[.04]`}
                      >
                        {kindMeta.label}
                      </span>
                    ) : null}
                    <span className="text-xs font-semibold text-[var(--text)]">{item.label}</span>
                    {item.at != null && formatTime ? (
                      <span className="ml-auto text-[10px] tabular-nums text-[var(--muted)]">
                        {formatTime(item.at)}
                      </span>
                    ) : null}
                  </div>
                  {item.body ??
                    (item.detail ? (
                      <div className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">{item.detail}</div>
                    ) : null)}
                </div>
              </div>
            </button>
            {canOpen ? (
              <button
                type="button"
                className="hub-notify-alert-open shrink-0 rounded-lg border border-white/10 bg-white/[.03] px-2 transition-colors hover:bg-white/[.06]"
                title="Open detail"
                aria-label={`Open detail for ${item.label}`}
                onClick={() => {
                  onMarkRead?.(item.id);
                  onClose?.();
                  onOpenDetail?.(item);
                }}
              >
                <ExternalLink size={14} className="text-sky-300" aria-hidden />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Hook helper — local search + kind filter state for a feed. */
export function useHubActivityFeedFilter(items: readonly HubActivityFeedItem[]) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<HubActivityKindFilter>("all");
  const filtered = useMemo(
    () => filterHubActivityFeedItems(items, query, kindFilter),
    [items, query, kindFilter],
  );
  return { query, setQuery, kindFilter, setKindFilter, filtered };
}
