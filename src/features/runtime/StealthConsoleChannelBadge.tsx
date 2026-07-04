import { Archive, Bot, Workflow, Zap, type LucideIcon } from "lucide-react";
import { HubRuntimeChannelBadge } from "@tool-workspace/hub-ui";

/** Console log channel — SSOT labels Title Case (parity P0020 TodoHubBadge priority pills). */
export type StealthConsoleChannel = "workflow" | "profile" | "backup" | "system";

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

/** Thin wrapper — channel registry local; pill SSOT `HubRuntimeChannelBadge`. */
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
    <HubRuntimeChannelBadge
      variant={channel}
      label={CHANNEL_LABEL[channel]}
      icon={<Icon size={size} />}
      compact={compact}
    />
  );
}

export function inferStealthConsoleChannel(source: string): StealthConsoleChannel {
  const key = source.trim().toLowerCase();
  if (key === "workflow") return "workflow";
  if (key === "backup") return "backup";
  if (key === "system" || key === "groups" || key === "profiles") return "system";
  return "profile";
}
