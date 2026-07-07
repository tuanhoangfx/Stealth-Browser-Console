import type { LucideIcon } from "lucide-react";
import { directorySortMatchesPrimaryDefault } from "../lib/directory-sort-contract";
import { compactIconSize } from "../ui-scale";

export type DirectoryDefaultSortRow = {
  id: string;
  label: string;
  directionHint: string;
  icon?: LucideIcon;
  iconClassName?: string;
  emoji?: string;
};

export type DirectoryDefaultSortHintProps = {
  rows: readonly DirectoryDefaultSortRow[];
  /** Shown when table sort differs from the documented primary default. */
  activeSort?: DirectoryDefaultSortRow | null;
  /** When set with `primaryDefault`, active block is derived automatically. */
  currentSort?: { sortKey: string; sortDir: "asc" | "desc" } | null;
  primaryDefault?: { sortKey: string; sortDir: "asc" | "desc" } | null;
  resolveActiveSortRow?: (sort: { sortKey: string; sortDir: "asc" | "desc" }) => DirectoryDefaultSortRow | null;
  footnote?: string;
};

function DirectorySortRow({
  row,
  index,
  emphasize = false,
}: {
  row: DirectoryDefaultSortRow;
  index?: number;
  emphasize?: boolean;
}) {
  const Icon = row.icon;
  return (
    <li className="flex min-w-0 items-center gap-1.5 text-[11px] leading-relaxed">
      {index != null ? (
        <span className="w-3.5 shrink-0 tabular-nums text-[var(--muted)]" aria-hidden>
          {index}.
        </span>
      ) : null}
      {Icon ? (
        <Icon size={compactIconSize(11)} className={`shrink-0 ${row.iconClassName ?? "text-indigo-300/90"}`} aria-hidden />
      ) : row.emoji ? (
        <span className="hub-users-th-emoji shrink-0 text-[11px] leading-none" aria-hidden>
          {row.emoji}
        </span>
      ) : null}
      <span className="min-w-0 truncate">
        <span className={emphasize ? "text-[var(--text)]" : "text-[var(--muted)]"}>{row.label}</span>
        <span className="text-[var(--muted)]"> — {row.directionHint}</span>
      </span>
    </li>
  );
}

/** Display panel — numbered default sort rules with column icon + label (golden ToggleRow styling). */
export function DirectoryDefaultSortHint({
  rows,
  activeSort: activeSortProp,
  currentSort,
  primaryDefault,
  resolveActiveSortRow,
  footnote,
}: DirectoryDefaultSortHintProps) {
  const overridden =
    currentSort != null &&
    primaryDefault != null &&
    !directorySortMatchesPrimaryDefault(currentSort, primaryDefault);
  const activeSort =
    activeSortProp ??
    (overridden && currentSort && resolveActiveSortRow
      ? resolveActiveSortRow(currentSort)
      : null);

  return (
    <div className="space-y-2">
      {activeSort ? (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">Active sort</p>
          <ul className="list-none">
            <DirectorySortRow row={activeSort} emphasize />
          </ul>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div>
          {activeSort ? (
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">Default sort</p>
          ) : null}
          <ol className="list-none space-y-0.5">
            {rows.map((row, index) => (
              <DirectorySortRow key={row.id} row={row} index={index + 1} />
            ))}
          </ol>
        </div>
      ) : null}
      {footnote ? <p className="text-[11px] leading-relaxed text-[var(--muted)]">{footnote}</p> : null}
    </div>
  );
}
