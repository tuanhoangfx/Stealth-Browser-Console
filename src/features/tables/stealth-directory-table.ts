import {
  HUB_DIRECTORY_TABLE_INLINE_WRAP_CLASS,
  HUB_DIRECTORY_TABLE_PANE_CHROME_SPLIT_CLASS,
  HUB_DIRECTORY_TABLE_SCROLL_FLEX_CLASS,
} from "@tool-workspace/hub-ui";

export { HUB_DIRECTORY_TABLE_INLINE_WRAP_CLASS, HUB_DIRECTORY_TABLE_SCROLL_FLEX_CLASS };

/** Flex pane inside HubSplitDirectoryPane — split head/body + golden pane chrome (P0004 Users parity). */
export const STEALTH_DIRECTORY_TABLE_WRAP_PANE_SCROLL_CLASS = `${HUB_DIRECTORY_TABLE_SCROLL_FLEX_CLASS} ${HUB_DIRECTORY_TABLE_PANE_CHROME_SPLIT_CLASS}`;

/** Workflow rail layout marker (column density overrides only). */
export const STEALTH_DIRECTORY_TABLE_WRAP_RAIL_MARKER = "stealth-directory-table-wrap--rail";
