import { Archive, Bot, Workflow, Zap, type LucideIcon } from "lucide-react";

/** Console log channel — SSOT labels Title Case (parity P0020 TodoHubBadge priority pills). */
export type StealthConsoleChannel = "workflow" | "profile" | "backup" | "system";

const CHANNEL_CLASS: Record<StealthConsoleChannel, string> = {
  workflow: "stealth-console-badge stealth-console-badge--workflow",
  profile: "stealth-console-badge stealth-console-badge--profile",
  backup: "stealth-console-badge stealth-console-badge--backup",
  system: "stealth-console-badge stealth-console-badge--system",
};

const CHANNEL_LABEL: Record<StealthConsoleChannel, string> = {
  workflow: "Workflow",
  profile: "Profile",
  backup: "Backup",
  system: "System",
};

const CHANNEL_ICON: Record<StealthConsoleChannel, LucideIcon> = {
  workflow: Workflow,
  profile: Bot,
  backup: Archive,
  system: Zap,
};

/** Hub-UI pill badge — icon + label (P0020 `TodoHubBadge` priority pattern). */
export function StealthConsoleChannelBadge({
  channel,
  compact = false,
}: {
  channel: StealthConsoleChannel;
  compact?: boolean;
}) {
  const Icon = CHANNEL_ICON[channel];
  const size = compact ? 10 : 11;
  return (
    <span
      className={`${CHANNEL_CLASS[channel]}${compact ? " stealth-console-badge--compact" : ""}`}
      title={CHANNEL_LABEL[channel]}
    >
      <span className="stealth-console-badge__icon" aria-hidden>
        <Icon size={size} />
      </span>
      <span className="truncate">{CHANNEL_LABEL[channel]}</span>
    </span>
  );
}

export function inferStealthConsoleChannel(source: string): StealthConsoleChannel {
  const key = source.trim().toLowerCase();
  if (key === "workflow") return "workflow";
  if (key === "backup") return "backup";
  if (key === "system" || key === "groups" || key === "profiles") return "system";
  return "profile";
}
