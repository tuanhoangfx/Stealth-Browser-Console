import {
  colHint,
  type HubDirectoryColumnHintContent,
  type HubDirectoryColumnHintLine,
} from "@tool-workspace/hub-ui";

/** Log channel options — parity `HubChangeLogList` + P0020 directory header hints (Emoji SSOT). */
export const STEALTH_CONSOLE_CHANNEL_HINT_LINES: HubDirectoryColumnHintLine[] = [
  { emoji: "🖥️", label: "Profile", detail: "Browser session events — launch, stop, and profile state" },
  { emoji: "👻", label: "Headless", detail: "Background AI Agent & headless worker sessions" },
  { emoji: "⚡", label: "Workflow", detail: "Script runs, steps, and workflow engine output" },
  { emoji: "📦", label: "Backup", detail: "Export, restore, and catalog backup jobs" },
  { emoji: "🧩", label: "Extensions", detail: "Web Store install, force update, Cookie Bridge" },
  { emoji: "⚙️", label: "System", detail: "Groups, profiles bulk ops, and app-wide events" },
];

/** Directory-column hint SSOT — same popover as P0020 service table headers. */
export const STEALTH_CONSOLE_HINT_CONTENT: HubDirectoryColumnHintContent = {
  ...colHint(
    "Log",
    "Live session & automation log output, newest first. Filter by Field or Actor in the header.",
    STEALTH_CONSOLE_CHANNEL_HINT_LINES,
  ),
  optionsLabel: "Field",
};
