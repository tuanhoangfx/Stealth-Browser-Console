import { Archive, Bot, Puzzle, Workflow, Zap, type LucideIcon } from "lucide-react";
import {
  colHint,
  type HubDirectoryColumnHintContent,
  type HubDirectoryColumnHintLine,
} from "@tool-workspace/hub-ui";

const channelLine = (
  icon: LucideIcon,
  toneClass: string,
  label: string,
  detail: string,
): HubDirectoryColumnHintLine => ({
  icon,
  toneClass,
  label,
  detail,
});

/** Console channel pills — parity `StealthConsoleChannelBadge` + P0020 directory header hints. */
export const STEALTH_CONSOLE_CHANNEL_HINT_LINES: HubDirectoryColumnHintLine[] = [
  channelLine(Workflow, "text-indigo-300", "Workflow", "Script runs, steps, and workflow engine output"),
  channelLine(Bot, "text-emerald-300", "Profile", "Browser session events — source is the profile name"),
  channelLine(Archive, "text-amber-300", "Backup", "Export, restore, and catalog backup jobs"),
  channelLine(Puzzle, "text-cyan-300", "Extensions", "Web Store install, force update, Cookie Bridge"),
  channelLine(Zap, "text-violet-300", "System", "Groups, profiles bulk ops, and app-wide events"),
];

/** Directory-column hint SSOT — same popover as P0020 service table headers. */
export const STEALTH_CONSOLE_HINT_CONTENT: HubDirectoryColumnHintContent = {
  ...colHint(
    "Console",
    "Live automation output, newest first. Colored pills on each line match these channels.",
    STEALTH_CONSOLE_CHANNEL_HINT_LINES,
  ),
  optionsLabel: "Channel",
};
