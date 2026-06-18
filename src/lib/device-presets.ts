import type { DeviceColorScheme, DeviceConfig, DevicePlatform, WindowMode } from "../types";

/**
 * Curated device library — each preset is an internally COHERENT, real-world
 * device class. cloakbrowser's `fingerprintSeed` generates the matching GPU /
 * fonts / cores / memory, so a preset only needs to fix the engine-honored
 * surface: platform + viewport + locale + timezone. This guarantees coherence
 * (you cannot build an impossible combo the way per-field commercial editors can).
 */
export type DevicePreset = {
  id: string;
  label: string;
  platform: DevicePlatform;
  viewportW: number;
  viewportH: number;
  /** Suggested locale; "" keeps engine/geoip default. */
  locale: string;
  /** Suggested IANA timezone; "" keeps geoip/auto. */
  timezone: string;
  note: string;
};

export const DEVICE_PRESETS: DevicePreset[] = [
  // — Windows desktops —
  {
    id: "win-fhd",
    label: "Windows 11 · Desktop 1920×1080",
    platform: "windows",
    viewportW: 1920,
    viewportH: 969,
    locale: "en-US",
    timezone: "",
    note: "Most common Windows desktop — 1080p, the global modal resolution."
  },
  {
    id: "win-hd",
    label: "Windows 10 · Laptop 1366×768",
    platform: "windows",
    viewportW: 1366,
    viewportH: 657,
    locale: "en-US",
    timezone: "",
    note: "Budget/older laptop class — still a large share of real traffic."
  },
  {
    id: "win-qhd",
    label: "Windows 11 · Desktop 2560×1440",
    platform: "windows",
    viewportW: 2560,
    viewportH: 1329,
    locale: "en-US",
    timezone: "",
    note: "High-end desktop / gaming monitor."
  },
  // — macOS —
  {
    id: "mac-mbp14",
    label: "macOS · MacBook Pro 14″ 1512×982",
    platform: "macos",
    viewportW: 1512,
    viewportH: 916,
    locale: "en-US",
    timezone: "",
    note: "Apple Silicon MacBook Pro 14 — default scaled resolution."
  },
  {
    id: "mac-mbair",
    label: "macOS · MacBook Air 1440×900",
    platform: "macos",
    viewportW: 1440,
    viewportH: 834,
    locale: "en-US",
    timezone: "",
    note: "MacBook Air — common consumer Mac."
  },
  {
    id: "mac-imac",
    label: "macOS · iMac 24″ 2048×1152",
    platform: "macos",
    viewportW: 2048,
    viewportH: 1086,
    locale: "en-US",
    timezone: "",
    note: "Desktop iMac scaled resolution."
  },
  // — Linux —
  {
    id: "linux-fhd",
    label: "Linux · Desktop 1920×1080",
    platform: "linux",
    viewportW: 1920,
    viewportH: 969,
    locale: "en-US",
    timezone: "",
    note: "Ubuntu/GNOME desktop class. Less common — verify with audit sites."
  }
];

export const PLATFORM_OPTIONS: { value: DevicePlatform; label: string }[] = [
  { value: "windows", label: "Windows" },
  { value: "macos", label: "macOS" },
  { value: "linux", label: "Linux" }
];

export const COLOR_SCHEME_OPTIONS: { value: DeviceColorScheme; label: string }[] = [
  { value: "", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" }
];

/** Short, high-traffic timezone shortlist — "" keeps geoip/auto. */
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Auto (from proxy)" },
  { value: "America/New_York", label: "America/New_York (US East)" },
  { value: "America/Chicago", label: "America/Chicago (US Central)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (US West)" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "Asia/Ho_Chi_Minh", label: "Asia/Ho_Chi_Minh" },
  { value: "Asia/Singapore", label: "Asia/Singapore" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" }
];

export const LOCALE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Engine default" },
  { value: "en-US", label: "en-US" },
  { value: "en-GB", label: "en-GB" },
  { value: "vi-VN", label: "vi-VN" },
  { value: "de-DE", label: "de-DE" },
  { value: "fr-FR", label: "fr-FR" },
  { value: "ja-JP", label: "ja-JP" }
];

export function hostDefaultPlatform(): DevicePlatform {
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent || "";
    if (/Mac/i.test(ua)) return "macos";
    if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  }
  return "windows";
}

export const WINDOW_MODE_OPTIONS: { value: WindowMode; label: string; hint: string }[] = [
  {
    value: "host-maximized",
    label: "Full screen (host maximized)",
    hint: "Maximize on your monitor — recommended, avoids frame jumps."
  },
  {
    value: "preset-viewport",
    label: "Device preset viewport",
    hint: "Lock to preset width×height — use for fingerprint consistency."
  },
  {
    value: "engine-default",
    label: "Engine default (1920×947)",
    hint: "CloakBrowser fixed viewport — legacy behavior."
  }
];

export const DEFAULT_DEVICE: DeviceConfig = {
  platform: "windows",
  timezone: "",
  locale: "",
  userAgent: "",
  viewportW: 0,
  viewportH: 0,
  colorScheme: "",
  devicePreset: "custom",
  headless: false,
  humanize: true,
  windowMode: "host-maximized"
};

/** Build a fresh device config for a new profile, seeded from the host OS. */
export function defaultDeviceConfig(): DeviceConfig {
  return { ...DEFAULT_DEVICE, platform: hostDefaultPlatform() };
}

/** Pull the device subset out of a profile (handles legacy rows missing fields). */
export function deviceConfigFromProfile(profile: Partial<DeviceConfig>): DeviceConfig {
  return {
    platform: profile.platform || DEFAULT_DEVICE.platform,
    timezone: profile.timezone ?? "",
    locale: profile.locale ?? "",
    userAgent: profile.userAgent ?? "",
    viewportW: Number(profile.viewportW) || 0,
    viewportH: Number(profile.viewportH) || 0,
    colorScheme: profile.colorScheme || "",
    devicePreset: profile.devicePreset || "custom",
    headless: profile.headless ?? false,
    humanize: profile.humanize ?? true,
    windowMode:
      profile.windowMode ||
      ((Number(profile.viewportW) || 0) > 0 || (Number(profile.viewportH) || 0) > 0 ? "preset-viewport" : "host-maximized")
  };
}

/** Apply a preset onto a device config, preserving user UA + color scheme. */
export function applyDevicePreset(current: DeviceConfig, presetId: string): DeviceConfig {
  const preset = DEVICE_PRESETS.find((item) => item.id === presetId);
  if (!preset) return { ...current, devicePreset: "custom" };
  return {
    ...current,
    platform: preset.platform,
    viewportW: preset.viewportW,
    viewportH: preset.viewportH,
    locale: preset.locale,
    timezone: preset.timezone,
    devicePreset: preset.id,
    windowMode: "preset-viewport"
  };
}
