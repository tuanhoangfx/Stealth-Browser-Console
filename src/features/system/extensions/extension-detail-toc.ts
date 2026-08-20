import { STEALTH_ADM_DETAIL_EDIT_MODAL_SHELL_CLASS } from "../../shared/stealth-adm-detail-modal";
import { STEALTH_CONSOLE_RAIL_LABEL, STEALTH_RUN_HISTORY_RAIL_LABEL } from "../../runtime/stealth-runtime-rail-labels";

export const EXTENSION_DETAIL_SECTION_METADATA = "extension-detail-metadata";
export const EXTENSION_DETAIL_SECTION_INSTALL = "extension-detail-install";
export const EXTENSION_DETAIL_SECTION_COOKIE_BRIDGE = "extension-detail-cookie-bridge";
export const EXTENSION_DETAIL_SECTION_HISTORY = "extension-detail-history";
export const EXTENSION_DETAIL_SECTION_LOG = "extension-detail-log";

export const EXTENSION_DETAIL_TOC = [
  { id: EXTENSION_DETAIL_SECTION_METADATA, label: "Metadata" },
  { id: EXTENSION_DETAIL_SECTION_INSTALL, label: "New" },
  { id: EXTENSION_DETAIL_SECTION_LOG, label: "Console" },
] as const;

export const EXTENSION_DETAIL_HISTORY_LABEL = STEALTH_RUN_HISTORY_RAIL_LABEL;
export const EXTENSION_DETAIL_CONSOLE_LABEL = STEALTH_CONSOLE_RAIL_LABEL;

/** Layout 3 SSOT — same shell as Profile edit modal (+ tool-specific hook class). */
export const EXTENSION_DETAIL_MODAL_SHELL_CLASS = `${STEALTH_ADM_DETAIL_EDIT_MODAL_SHELL_CLASS} stealth-extension-detail-modal`;
