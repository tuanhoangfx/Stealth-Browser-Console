import { STEALTH_PROFILE_COLUMN_STICKER } from "./stealth-column-stickers";

/** Profile modal section stickers — P0005 Order Details / P0020 detail TOC parity. */
export const PROFILE_MODAL_SECTION_STICKER = {
  profile: STEALTH_PROFILE_COLUMN_STICKER.profile,
  session: "🍪",
  device: "📱",
  console: "📋",
  credentials: "📜",
  note: STEALTH_PROFILE_COLUMN_STICKER.note,
  history: "🕒",
} as const;

/** Profile form field stickers — HubFormFieldLabel + modal filter rows (P0020 Service Modal ADM parity). */
export const PROFILE_FORM_FIELD_STICKER = {
  name: "🏷️",
  group: STEALTH_PROFILE_COLUMN_STICKER.group,
  status: STEALTH_PROFILE_COLUMN_STICKER.status,
  startupUrl: STEALTH_PROFILE_COLUMN_STICKER.startupUrl,
  proxyPreset: "🌐",
  proxy: STEALTH_PROFILE_COLUMN_STICKER.proxy,
  staticIp: "📌",
  ipStatus: "🌐",
  e0001: "🍪",
  e0002: "🔌",
  surfshark: "🦈",
  cookieGuard: "🍪",
  sessionCookies: "🍪",
  sessionBackup: "🛡️",
  sessionActions: "⚡",
  mobileVault: "📲",
  devicePreset: "📱",
  advancedDevice: "⚙️",
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
