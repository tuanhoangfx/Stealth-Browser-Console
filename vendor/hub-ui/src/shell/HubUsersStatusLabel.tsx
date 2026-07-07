export type HubUsersStatusTone =
  | "online"
  | "offline"
  | "idle"
  | "active"
  | "age-fresh"
  | "age-recent"
  | "age-aging"
  | "age-stale";

export type HubUsersStatusLabelProps = {
  label: string;
  tone: HubUsersStatusTone;
  /** @deprecated Body cells use no hover tooltip — header hints only. */
  title?: string;
  capitalize?: boolean;
};

/** Directory table/card status — `hub-users-status` SSOT (Channels, Groups, Personalities). */
export function HubUsersStatusLabel({
  label,
  tone,
  capitalize = true,
}: HubUsersStatusLabelProps) {
  return (
    <span
      className={`hub-users-status${capitalize ? "" : " hub-users-status--plain"}`}
    >
      <span className={`hub-users-status-dot hub-users-status-dot--${tone}`} aria-hidden />
      {label}
    </span>
  );
}

/** Boolean On/Off — directory RAG, toggles, allowlist-style labels when label is On/Off. */
export function HubUsersOnOffLabel({ on }: { on: boolean; title?: string }) {
  return (
    <HubUsersStatusLabel
      label={on ? "On" : "Off"}
      tone={on ? "online" : "offline"}
    />
  );
}
