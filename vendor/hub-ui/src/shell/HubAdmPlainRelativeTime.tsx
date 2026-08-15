import { useRelativeNow } from "../lib/use-relative-now";
import {
  formatHubActivityStaleLabel,
  hubActivityAgeTone,
  parseHubActivityMs,
} from "../lib/format-hub-activity-time";
import { formatHubRelativeTime } from "../lib/format-hub-relative-time";
import { formatHubTimestampFull } from "../lib/format-hub-timestamp-compact";

export type HubAdmPlainRelativeTimeProps = {
  /** ISO timestamp — rendered as a relative age with full timestamp hover text. */
  at?: string | null;
  className?: string;
  emptyLabel?: string;
};

/** Detail-record metadata timestamp — same relative/absolute time contract as P0020 Order Detail. */
export function HubAdmPlainRelativeTime({
  at,
  className = "hub-adm-plain-time",
  emptyLabel = "—",
}: HubAdmPlainRelativeTimeProps) {
  const now = useRelativeNow();
  const ms = parseHubActivityMs(at);
  if (ms == null) return <span className={className}>{emptyLabel}</span>;

  const tone = hubActivityAgeTone(ms, now);
  const relative = formatHubRelativeTime(ms, now);
  const label = tone === "stale" ? formatHubActivityStaleLabel(ms) : relative === "just now" ? "Just now" : relative;
  const title = formatHubTimestampFull(at) || new Date(ms).toLocaleString();

  return (
    <time className={className} dateTime={new Date(ms).toISOString()} title={title}>
      {label}
    </time>
  );
}
