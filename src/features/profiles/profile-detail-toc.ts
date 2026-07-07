/** Profile detail modal — TOC section ids (P0020 Mail Account Detail parity). */

export const PROFILE_DETAIL_SECTION_CREDENTIALS = "profile-detail-credentials";
export const PROFILE_DETAIL_SECTION_PROFILE = "profile-basics";
export const PROFILE_DETAIL_SECTION_DEVICE = "profile-device";
export const PROFILE_DETAIL_SECTION_EXTENSIONS = "profile-extensions";
export const PROFILE_DETAIL_SECTION_LOG = "profile-detail-log";

export const PROFILE_DETAIL_TOC = [
  { id: PROFILE_DETAIL_SECTION_PROFILE, label: "Profile", emoji: "👤" },
  { id: PROFILE_DETAIL_SECTION_DEVICE, label: "Device", emoji: "🖥️" },
  { id: PROFILE_DETAIL_SECTION_EXTENSIONS, label: "Extensions", emoji: "🧩" },
  { id: PROFILE_DETAIL_SECTION_LOG, label: "Log", emoji: "📋" },
] as const;

export const PROFILE_DETAIL_NOTE_LABEL = "✍️ Note";
