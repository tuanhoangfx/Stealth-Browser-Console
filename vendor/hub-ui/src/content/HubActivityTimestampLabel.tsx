import { HubUsersStatusLabel } from "../shell/HubUsersStatusLabel";
import {
  formatHubActivityRelativeAge,
  formatHubActivityStaleLabel,
  hubActivityAgeHubTone,
  hubActivityAgeTone,
  parseHubActivityMs,
} from "../lib/format-hub-activity-time";
import { formatHubTimestampFull } from "../lib/format-hub-timestamp-compact";
import { useRelativeNow } from "../lib/use-relative-now";

export type HubActivityTimestampLabelProps = {
  /** ISO string or epoch ms. */
  at?: string | number | null;
  fallback?: React.ReactNode;
  title?: string;
};

/** Activity timestamp — colored dot + relative age (<24h) or `hh:mm dd/mm/yy` when stale. */
export function HubActivityTimestampLabel({
  at,
  fallback = "—",
  title,
}: HubActivityTimestampLabelProps) {
  const now = useRelativeNow();
  const ms = parseHubActivityMs(at);
  if (ms == null) return <>{fallback}</>;

  const tone = hubActivityAgeTone(ms, now);
  const label =
    tone === "stale" ? formatHubActivityStaleLabel(ms) : formatHubActivityRelativeAge(ms, now);
  const resolvedTitle =
    title ??
    (formatHubTimestampFull(typeof at === "string" ? at : new Date(ms).toISOString()) ||
      new Date(ms).toLocaleString());

  return (
    <HubUsersStatusLabel
      label={label}
      tone={hubActivityAgeHubTone(tone)}
      capitalize={false}
      title={resolvedTitle}
    />
  );
}
