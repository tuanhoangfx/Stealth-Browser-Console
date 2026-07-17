import { isDirectoryEmptyLabel } from "./directory-empty-label";
import type { HubEntityLogChange, HubEntityLogEntry } from "./hub-entity-log";

/**
 * Hub entity change-log row logic — golden SSOT shared by every tool's rail
 * (P0020 `TwofaChangeLogList`, P0005 `HubChangeLogList`, …).
 *
 * Pure functions only (no React): flatten entries → one row per field delta,
 * resolve structured-vs-legacy changes, and format the `Field added/removed/updated`
 * action label. Each tool keeps its own rendering (icons, masking, copy, flash)
 * but consumes this single source for row/label semantics.
 */
export type HubEntityLogRow = {
  key: string;
  at: string;
  dotIndex: number;
  entryIndex: number;
  change?: HubEntityLogChange;
  changeIndex?: number;
  message?: string;
  /** Resolved display label for `change.field` (via `labelFor`). */
  fieldLabel?: string;
};

export type FlattenHubEntityLogOptions = {
  /** Round-trip legacy `Label: a → b · …` messages into structured changes. */
  parseMessage?: (message: string) => HubEntityLogChange[];
  /** Treat a change as a no-op (skipped). Default: trimmed before === after. */
  isNoOpChange?: (change: HubEntityLogChange) => boolean;
  /** Resolve the human label for a change's field (column/entity label). */
  labelFor?: (change: HubEntityLogChange) => string;
};

const defaultIsNoOp = (change: HubEntityLogChange): boolean =>
  (change.before?.trim() ?? "") === (change.after?.trim() ?? "");

/** Structured changes (preferred) else parsed legacy message deltas, no-ops dropped. */
export function resolveHubEntityLogEntryChanges(
  entry: HubEntityLogEntry,
  options: FlattenHubEntityLogOptions = {},
): HubEntityLogChange[] {
  const isNoOp = options.isNoOpChange ?? defaultIsNoOp;
  const structured = (entry.changes ?? []).filter((change) => !isNoOp(change));
  if (structured.length) return structured;
  if (!options.parseMessage || !entry.message.includes("→")) return [];
  return options.parseMessage(entry.message).filter((change) => !isNoOp(change));
}

/** Flatten log entries into one row per change (or a message row when no deltas). */
export function flattenHubEntityLog(
  entries: HubEntityLogEntry[],
  options: FlattenHubEntityLogOptions = {},
): HubEntityLogRow[] {
  const rows: HubEntityLogRow[] = [];
  entries.forEach((entry, entryIndex) => {
    const changes = resolveHubEntityLogEntryChanges(entry, options);
    if (changes.length) {
      changes.forEach((change, changeIndex) => {
        rows.push({
          key: `${entry.at}-${entryIndex}-${change.field}-${changeIndex}`,
          at: entry.at,
          dotIndex: entryIndex % 3,
          entryIndex,
          change,
          changeIndex,
          fieldLabel: options.labelFor?.(change),
        });
      });
      return;
    }
    rows.push({
      key: `${entry.at}-${entryIndex}-msg`,
      at: entry.at,
      dotIndex: entryIndex % 3,
      entryIndex,
      message: entry.message,
    });
  });
  return rows;
}

/** `Field added | removed | updated` (or the raw message for event-only rows). */
export function formatHubEntityLogActionLabel(
  row: Pick<HubEntityLogRow, "change" | "fieldLabel" | "message">,
  fallback = "Updated",
): string {
  if (!row.change) return row.message?.trim() || fallback;
  const label = row.fieldLabel ?? row.change.field;
  const before = row.change.before?.trim();
  const after = row.change.after?.trim();
  const hadBefore = Boolean(before && !isDirectoryEmptyLabel(before));
  const hasAfter = Boolean(after && !isDirectoryEmptyLabel(after));
  if (!hasAfter && hadBefore) return `${label} removed`;
  if (hasAfter && !hadBefore) return `${label} added`;
  return `${label} updated`;
}
