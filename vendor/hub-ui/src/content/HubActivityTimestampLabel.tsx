import { HubDirectoryEmptyCell } from "../lib/directory-empty-label";
import { HubUsersStatusLabel } from "../shell/HubUsersStatusLabel";
import { HUB_DIRECTORY_TIMESTAMP_CLASS } from "../lib/hub-directory-timestamp";
import {
  formatHubActivityRelativeAge,
  formatHubActivityStaleLabel,
  hubActivityAgeHubTone,
  hubActivityAgeTone,
  parseHubActivityMs,
} from "../lib/format-hub-activity-time";
import { useRelativeNow } from "../lib/use-relative-now";

export type HubActivityTimestampLabelProps = {
  /** ISO string or epoch ms. */
  at?: string | number | null;
  fallback?: React.ReactNode;
  /** @deprecated Body cells use no hover tooltip — header hints only. */
  title?: string;
  /** When true (default), applies directory timestamp typography SSOT. */
  directoryTypography?: boolean;
  className?: string;
};

/** Activity timestamp — colored dot + relative age (≤24h) or `dd/mm/yy` when stale. No cell tooltip. */
export function HubActivityTimestampLabel({
  at,
  fallback = <HubDirectoryEmptyCell />,
  directoryTypography = true,
  className = "",
}: HubActivityTimestampLabelProps) {
  const now = useRelativeNow();
  const ms = parseHubActivityMs(at);
  if (ms == null) return <>{fallback}</>;

  const tone = hubActivityAgeTone(ms, now);
  const label =
    tone === "stale" ? formatHubActivityStaleLabel(ms) : formatHubActivityRelativeAge(ms, now);

  const inner = (
    <HubUsersStatusLabel
      label={label}
      tone={hubActivityAgeHubTone(tone)}
      capitalize={false}
    />
  );

  if (!directoryTypography) return inner;

  return (
    <span className={`${HUB_DIRECTORY_TIMESTAMP_CLASS}${className ? ` ${className}` : ""}`}>
      {inner}
    </span>
  );
}
