import { STEALTH_CONSOLE_RAIL_LABEL, STEALTH_RUN_HISTORY_RAIL_LABEL } from "../runtime/stealth-runtime-rail-labels";

/** Profile detail modal — TOC section ids (P0020 Mail Account Detail parity). */

export const PROFILE_DETAIL_SECTION_CREDENTIALS = "profile-detail-credentials";
export const PROFILE_DETAIL_SECTION_PROFILE = "profile-basics";
export const PROFILE_DETAIL_SECTION_DEVICE = "profile-device";
export const PROFILE_DETAIL_SECTION_LOG = "profile-detail-log";
export const PROFILE_DETAIL_SECTION_HISTORY = "profile-detail-history";

export const PROFILE_DETAIL_TOC = [
  { id: PROFILE_DETAIL_SECTION_PROFILE, label: "Profile" },
  { id: PROFILE_DETAIL_SECTION_DEVICE, label: "Device" },
  { id: PROFILE_DETAIL_SECTION_LOG, label: "Console" },
] as const;

export const PROFILE_DETAIL_NOTE_LABEL = "Note";
export const PROFILE_DETAIL_HISTORY_LABEL = STEALTH_RUN_HISTORY_RAIL_LABEL;
export const PROFILE_DETAIL_CONSOLE_LABEL = STEALTH_CONSOLE_RAIL_LABEL;
