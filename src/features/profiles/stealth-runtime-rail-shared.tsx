import { Bot, History, Workflow, type LucideIcon } from "lucide-react";
import {
  HubRuntimeChannelBadge,
  HubTableColumnHeader,
  HubActivityTimestampLabel,
  compactIconSize,
  type HubTableColumnRole,
} from "@tool-workspace/hub-ui";
import type { StealthConsoleChannel } from "../runtime/StealthConsoleChannelBadge";

export const STEALTH_PROFILE_CONSOLE_GRID_COLUMNS = [
  { label: "Time", role: "activity" as HubTableColumnRole },
  { label: "Channel", role: "status" as HubTableColumnRole },
  { label: "Message", role: "name" as HubTableColumnRole },
] as const;

export const STEALTH_PROFILE_CHANNEL_META: Record<
  StealthConsoleChannel,
  { variant: string; label: string; Icon: LucideIcon }
> = {
  profile: { variant: "profile", label: "Profile", Icon: Bot },
  workflow: { variant: "workflow", label: "Workflow", Icon: Workflow },
  lifecycle: { variant: "lifecycle", label: "Lifecycle", Icon: History },
  backup: { variant: "backup", label: "Backup", Icon: History },
  system: { variant: "system", label: "System", Icon: History },
};

export function StealthProfileChannelBadge({
  channel,
  compact = false,
}: {
  channel: StealthConsoleChannel;
  compact?: boolean;
}) {
  const meta = STEALTH_PROFILE_CHANNEL_META[channel];
  const Icon = meta.Icon;
  const iconPx = compact ? compactIconSize(10) : compactIconSize(11);
  return (
    <HubRuntimeChannelBadge
      variant={meta.variant}
      label={meta.label}
      icon={<Icon size={iconPx} />}
      compact={compact}
    />
  );
}

export function StealthProfileRuntimeChannelLegend() {
  return (
    <>
      <StealthProfileChannelBadge channel="profile" />
      <StealthProfileChannelBadge channel="workflow" />
      <StealthProfileChannelBadge channel="lifecycle" />
    </>
  );
}

export function StealthProfileRuntimeActivityTime({
  at,
  title,
}: {
  at: string | number | null | undefined;
  title?: string;
}) {
  if (at == null || at === "") {
    return <span className="stealth-runtime-activity-time">—</span>;
  }
  const iso = typeof at === "string" ? at : new Date(at).toISOString();
  return (
    <span className="stealth-runtime-activity-time tabular-nums">
      <HubActivityTimestampLabel at={iso} title={title} />
    </span>
  );
}

export function StealthProfileConsoleGridHead() {
  return (
    <div className="stealth-console-terminal-head" aria-hidden>
      {STEALTH_PROFILE_CONSOLE_GRID_COLUMNS.map((col) => (
        <span key={col.label} className="stealth-console-terminal-head__col">
          <HubTableColumnHeader label={col.label} role={col.role} />
        </span>
      ))}
    </div>
  );
}

export function StealthProfileConsoleTerminalRow({
  time,
  channel,
  level,
  message,
}: {
  time: string | number | null | undefined;
  channel: StealthConsoleChannel;
  level: string;
  message: string;
}) {
  return (
    <div className={`stealth-console-terminal-row stealth-console-terminal-row--${level}`}>
      <span className="stealth-console-terminal-row__col stealth-console-terminal-row__col--time">
        <StealthProfileRuntimeActivityTime at={time} />
      </span>
      <span className="stealth-console-terminal-row__col stealth-console-terminal-row__col--ch">
        <StealthProfileChannelBadge channel={channel} compact />
      </span>
      <span className="stealth-console-terminal-row__col stealth-console-terminal-row__col--msg">
        {message}
      </span>
    </div>
  );
}
