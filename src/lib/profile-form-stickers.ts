import { STEALTH_PROFILE_COLUMN_STICKER } from "./stealth-column-stickers";

/** Profile modal section stickers — P0005 Order Details / P0020 detail TOC parity. */
export const PROFILE_MODAL_SECTION_STICKER = {
  profile: STEALTH_PROFILE_COLUMN_STICKER.profile,
  device: "📱",
  console: "📋",
  credentials: "📜",
  note: "📜",
  history: "🕒",
} as const;

/** Profile form field stickers — HubFormFieldLabel + modal filter rows. */
export const PROFILE_FORM_FIELD_STICKER = {
  name: "🏷️",
  group: STEALTH_PROFILE_COLUMN_STICKER.group,
  startupUrl: STEALTH_PROFILE_COLUMN_STICKER.startupUrl,
  proxyPreset: STEALTH_PROFILE_COLUMN_STICKER.proxy,
  proxy: STEALTH_PROFILE_COLUMN_STICKER.proxy,
  devicePreset: "📱",
  platform: "🖥️",
  colorScheme: "🎨",
  timezone: "🌍",
  locale: "🗣️",
  windowMode: "🪟",
  viewport: "📐",
  fingerprintSeed: "🔢",
  humanize: "🤖",
  headless: "👻",
  userAgent: "🧭",
  defaultStartupUrl: STEALTH_PROFILE_COLUMN_STICKER.startupUrl,
} as const;
