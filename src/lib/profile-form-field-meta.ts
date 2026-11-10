import type { HubTableColumnHeaderProps } from "@tool-workspace/hub-ui";
import { Cable, Cookie } from "lucide-react";
import { DEFAULT_EXTENSION_ICONS } from "./default-extension-icons";
import { PROFILE_FORM_FIELD_STICKER } from "./profile-form-stickers";
import type { StealthFormFieldKey } from "./stealth-directory-column-hints";

const PROFILE_FORM_FIELD_LABELS: Record<StealthFormFieldKey, string> = {
  name: "Name",
  group: "Group",
  status: "Run",
  startupUrl: "Startup URL",
  proxyPreset: "Proxy preset",
  proxy: "Proxy",
  staticIp: "Static IP",
  ipStatus: "IP",
  e0001: "E0001",
  e0002: "E0002",
  surfshark: "Surfshark",
  cookieGuard: "Cookie Guard",
  sessionCookies: "Cookies",
  sessionBackup: "Backup",
  sessionActions: "Actions",
  mobileVault: "Mobile Vault",
  devicePreset: "Device preset",
  advancedDevice: "Advanced",
  platform: "Platform",
  colorScheme: "Color scheme",
  timezone: "Timezone",
  locale: "Locale",
  windowMode: "Window mode",
  viewport: "Viewport",
  fingerprintSeed: "Fingerprint",
  humanize: "Mode",
  headless: "Headless",
  userAgent: "User-Agent",
  defaultStartupUrl: "Default startup URL",
};

function stickerHeader(key: StealthFormFieldKey): HubTableColumnHeaderProps {
  return {
    label: PROFILE_FORM_FIELD_LABELS[key],
    headerEmoji: PROFILE_FORM_FIELD_STICKER[key],
  };
}

const PROFILE_FORM_FIELD_HEADERS: Record<StealthFormFieldKey, HubTableColumnHeaderProps> = {
  name: stickerHeader("name"),
  group: stickerHeader("group"),
  status: stickerHeader("status"),
  startupUrl: stickerHeader("startupUrl"),
  proxyPreset: stickerHeader("proxyPreset"),
  proxy: stickerHeader("proxy"),
  staticIp: stickerHeader("staticIp"),
  ipStatus: stickerHeader("ipStatus"),
  e0001: {
    label: PROFILE_FORM_FIELD_LABELS.e0001,
    headerImageSrc: DEFAULT_EXTENSION_ICONS.e0001,
    icon: Cookie,
    iconClassName: "text-orange-300",
  },
  e0002: {
    label: PROFILE_FORM_FIELD_LABELS.e0002,
    headerImageSrc: DEFAULT_EXTENSION_ICONS.e0002,
    icon: Cable,
    iconClassName: "text-violet-300",
  },
  surfshark: {
    label: PROFILE_FORM_FIELD_LABELS.surfshark,
    headerImageSrc: DEFAULT_EXTENSION_ICONS.surfshark,
  },
  cookieGuard: stickerHeader("cookieGuard"),
  sessionCookies: stickerHeader("sessionCookies"),
  sessionBackup: stickerHeader("sessionBackup"),
  sessionActions: stickerHeader("sessionActions"),
  mobileVault: stickerHeader("mobileVault"),
  devicePreset: stickerHeader("devicePreset"),
  advancedDevice: stickerHeader("advancedDevice"),
  platform: stickerHeader("platform"),
  colorScheme: stickerHeader("colorScheme"),
  timezone: stickerHeader("timezone"),
  locale: stickerHeader("locale"),
  windowMode: stickerHeader("windowMode"),
  viewport: stickerHeader("viewport"),
  fingerprintSeed: stickerHeader("fingerprintSeed"),
  humanize: stickerHeader("humanize"),
  headless: stickerHeader("headless"),
  userAgent: stickerHeader("userAgent"),
  defaultStartupUrl: stickerHeader("defaultStartupUrl"),
};

export function profileFormFieldLabel(key: StealthFormFieldKey): string {
  return PROFILE_FORM_FIELD_LABELS[key];
}

export function profileFormFieldHeaderProps(key: StealthFormFieldKey): HubTableColumnHeaderProps {
  return PROFILE_FORM_FIELD_HEADERS[key];
}
