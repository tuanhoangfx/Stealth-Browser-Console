import type { DeviceConfig, DeviceColorScheme, DevicePlatform, WindowMode } from "../types";
import { DEFAULT_DEVICE, applyDevicePreset, hostDefaultPlatform } from "./device-presets";
import { DEFAULT_BROWSER_HOME_URL } from "./browser-home";

/**
 * App-level browser defaults — applied to every NEW profile so the operator
 * sets their fleet's baseline device once (Settings → Browser defaults).
 * Persisted in localStorage (renderer-only, no engine round-trip).
 */
export type BrowserDefaults = {
  platform: DevicePlatform;
  devicePreset: string;
  timezone: string;
  locale: string;
  colorScheme: DeviceColorScheme;
  headless: boolean;
  humanize: boolean;
  windowMode: WindowMode;
  /** Default startup URL for new profiles (http/https). */
  defaultStartupUrl: string;
};

const STORAGE_KEY = "stealth-console-browser-defaults";

export function defaultBrowserDefaults(): BrowserDefaults {
  return {
    platform: hostDefaultPlatform(),
    devicePreset: "custom",
    timezone: "",
    locale: "",
    colorScheme: "",
    headless: false,
    humanize: true,
    windowMode: "host-maximized",
    defaultStartupUrl: DEFAULT_BROWSER_HOME_URL
  };
}

export function readBrowserDefaults(): BrowserDefaults {
  const base = defaultBrowserDefaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<BrowserDefaults>;
    return {
      platform: (parsed.platform as DevicePlatform) || base.platform,
      devicePreset: parsed.devicePreset || base.devicePreset,
      timezone: parsed.timezone ?? base.timezone,
      locale: parsed.locale ?? base.locale,
      colorScheme: (parsed.colorScheme as DeviceColorScheme) ?? base.colorScheme,
      headless: parsed.headless ?? base.headless,
      humanize: parsed.humanize ?? base.humanize,
      windowMode: (parsed.windowMode as WindowMode) || base.windowMode,
      defaultStartupUrl: parsed.defaultStartupUrl?.trim()
        ? parsed.defaultStartupUrl
        : base.defaultStartupUrl
    };
  } catch {
    return base;
  }
}

export function writeBrowserDefaults(next: BrowserDefaults): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures (private mode / quota)
  }
}

/** Build the initial device config for a NEW profile from the saved defaults. */
export function deviceConfigFromDefaults(): DeviceConfig {
  const prefs = readBrowserDefaults();
  let device: DeviceConfig = {
    ...DEFAULT_DEVICE,
    platform: prefs.platform,
    timezone: prefs.timezone,
    locale: prefs.locale,
    colorScheme: prefs.colorScheme,
    headless: prefs.headless,
    humanize: prefs.humanize,
    windowMode: prefs.windowMode
  };
  if (prefs.devicePreset && prefs.devicePreset !== "custom") {
    device = applyDevicePreset(device, prefs.devicePreset);
  }
  return device;
}

/** Startup URL seed for a new profile from saved browser defaults. */
export function defaultStartupUrlFromPrefs(): string {
  const raw = readBrowserDefaults().defaultStartupUrl.trim();
  return raw || DEFAULT_BROWSER_HOME_URL;
}
