import { memo } from "react";
import { formatHubRelativeTime } from "../lib/format-hub-relative-time";
import { useRelativeNow } from "../lib/use-relative-now";

export type DirectoryRelativeTimeCellProps = {
  ts?: number | null;
  className?: string;
  emptyLabel?: string;
  title?: string;
  format?: (ts: number, now: number) => string;
};

/** Memoized relative time cell — 60s tick re-renders only this node, not the whole table. */
export const DirectoryRelativeTimeCell = memo(function DirectoryRelativeTimeCell({
  ts,
  className,
  emptyLabel = "—",
  title,
  format = formatHubRelativeTime,
}: DirectoryRelativeTimeCellProps) {
  const now = useRelativeNow();
  if (ts == null || !Number.isFinite(ts)) {
    return (
      <span className={className} title={title}>
        {emptyLabel}
      </span>
    );
  }
  const resolvedTitle = title ?? new Date(ts).toLocaleString("en-GB");
  return (
    <time className={className} dateTime={new Date(ts).toISOString()} title={resolvedTitle}>
      {format(ts, now)}
    </time>
  );
});
