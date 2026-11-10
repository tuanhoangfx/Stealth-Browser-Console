import { HUB_TOOL_DETAIL_FORM_GRID_3_CLASS, localeFlagIconSrc, type FilterOption } from "@tool-workspace/hub-ui";
import {
  COLOR_SCHEME_OPTIONS,
  DEVICE_PRESETS,
  LOCALE_OPTIONS,
  PLATFORM_OPTIONS,
  TIMEZONE_OPTIONS,
  WINDOW_MODE_OPTIONS,
} from "./device-presets";
import {
  COUNTRY_DISPLAY_NAMES,
  extractProxyCountryCode,
  extractVpnCountryCode,
  PROXY_PRESETS,
} from "./stealth-profile-utils";
import type { DeviceConfig, StealthGroup } from "../types";

export const BROWSER_DEVICE_FORM_CLASS = `${HUB_TOOL_DETAIL_FORM_GRID_3_CLASS} stealth-settings-form stealth-settings-form--3 min-w-0`;

export function toFilterOptions<T extends { value: string; label: string }>(options: T[]): FilterOption[] {
  return options.map((option) => ({ value: option.value, label: option.label }));
}

function platformEmoji(platform: string): string {
  if (platform === "macos") return "🍎";
  if (platform === "linux") return "🐧";
  return "🪟";
}

const TIMEZONE_COUNTRY_MAP: Record<string, string> = {
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Los_Angeles": "US",
  "America/Sao_Paulo": "BR",
  "Europe/London": "GB",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Warsaw": "PL",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Bangkok": "TH",
  "Asia/Singapore": "SG",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Australia/Sydney": "AU",
};

export function devicePresetFilterOptions(): FilterOption[] {
  return [
    ...DEVICE_PRESETS.map((preset) => ({
      value: preset.id,
      label: preset.label,
      emoji: platformEmoji(preset.platform),
    })),
    { value: "custom", label: "Custom", emoji: "⚙️" },
  ];
}

export function localeFilterOptions(): FilterOption[] {
  return LOCALE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    emoji: option.value ? undefined : "⚙️",
    iconSrc: option.value ? localeFlagIconSrc(option.value) : undefined,
  }));
}

export function browserPlatformFilterOptions(): FilterOption[] {
  return PLATFORM_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    emoji: platformEmoji(option.value),
  }));
}

export function browserColorSchemeFilterOptions(): FilterOption[] {
  return COLOR_SCHEME_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    emoji: option.value === "light" ? "☀️" : option.value === "dark" ? "🌙" : "⚙️",
  }));
}

export function browserTimezoneFilterOptions(): FilterOption[] {
  return TIMEZONE_OPTIONS.map((option) => {
    const country = TIMEZONE_COUNTRY_MAP[option.value];
    return {
      value: option.value,
      label: option.label,
      emoji: option.value ? undefined : "🌍",
      iconSrc: country ? localeFlagIconSrc(country) : undefined,
    };
  });
}

export function browserWindowModeFilterOptions(): FilterOption[] {
  return WINDOW_MODE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    emoji:
      option.value === "host-maximized"
        ? "🖥️"
        : option.value === "preset-viewport"
          ? "📐"
          : "⚙️",
  }));
}

export type BrowserRuntimeMode = "standard" | "agent-headless" | "fast-headless" | "raw-window";

export function browserRuntimeModeFilterOptions(): FilterOption[] {
  return [
    {
      value: "standard",
      label: "Standard (Window + Humanize)",
      emoji: "🖥️",
    },
    {
      value: "agent-headless",
      label: "Agent / Headless (Silent + Humanize)",
      emoji: "🤖",
    },
    {
      value: "fast-headless",
      label: "Fast Headless (Silent · Raw)",
      emoji: "⚡",
    },
    {
      value: "raw-window",
      label: "Raw Window (Window · No Humanize)",
      emoji: "🖱️",
    },
  ];
}

export function resolveBrowserRuntimeMode(
  device: Pick<DeviceConfig, "headless" | "humanize">,
): BrowserRuntimeMode {
  if (device.headless && device.humanize) return "agent-headless";
  if (device.headless && !device.humanize) return "fast-headless";
  if (!device.headless && !device.humanize) return "raw-window";
  return "standard";
}

export function applyBrowserRuntimeMode(
  mode: string,
): Pick<DeviceConfig, "headless" | "humanize"> {
  switch (mode) {
    case "agent-headless":
      return { headless: true, humanize: true };
    case "fast-headless":
      return { headless: true, humanize: false };
    case "raw-window":
      return { headless: false, humanize: false };
    default:
      return { headless: false, humanize: true };
  }
}

export function proxyPresetFilterOptions(): FilterOption[] {
  return [
    ...PROXY_PRESETS.map((preset) => ({
      value: preset.id,
      label: preset.label,
      emoji: preset.id === "local" ? "📍" : undefined,
      iconSrc: preset.countryCode ? localeFlagIconSrc(preset.countryCode) : undefined,
    })),
    { value: "custom", label: "Custom", emoji: "⚙️" },
  ];
}

export function resolveProxyPresetId(proxy: string): string {
  const trimmed = String(proxy || "").trim();
  const hit = PROXY_PRESETS.find((preset) => preset.value.toLowerCase() === trimmed.toLowerCase());
  if (hit) return hit.id;
  const vpnCode = extractVpnCountryCode(trimmed);
  if (vpnCode) {
    const byCountry = PROXY_PRESETS.find(
      (preset) => preset.id.startsWith("vpn-") && preset.countryCode === vpnCode,
    );
    if (byCountry) return byCountry.id;
  }
  return "custom";
}

export function resolveUnifiedProxyOptionValue(proxy: string): string {
  const trimmed = String(proxy || "").trim();
  if (!trimmed) return "";
  const hit = PROXY_PRESETS.find((preset) => preset.value.toLowerCase() === trimmed.toLowerCase());
  if (hit) return hit.value;
  const vpnCode = extractVpnCountryCode(trimmed);
  if (vpnCode) {
    const byCountry = PROXY_PRESETS.find(
      (preset) => preset.id.startsWith("vpn-") && preset.countryCode === vpnCode,
    );
    if (byCountry) return byCountry.value;
  }
  return trimmed;
}

export function proxyUnifiedFilterOptions(
  currentProxy = "",
  meta?: { note?: string | null; timezone?: string | null; locale?: string | null },
): FilterOption[] {
  const base: FilterOption[] = PROXY_PRESETS.filter(
    (preset) => preset.id !== "http" && preset.id !== "socks5",
  ).map((preset) => ({
    value: preset.value,
    label: preset.label,
    emoji: preset.id === "local" ? "📍" : undefined,
    iconSrc: preset.countryCode ? localeFlagIconSrc(preset.countryCode) : undefined,
  }));
  const resolved = resolveUnifiedProxyOptionValue(currentProxy);
  if (resolved && !base.some((opt) => opt.value === resolved)) {
    const vpnCode = extractVpnCountryCode(resolved, meta?.note);
    const proxyCode = vpnCode
      ? ""
      : extractProxyCountryCode(resolved, meta?.note, meta?.timezone, meta?.locale);
    const cc = vpnCode || proxyCode;
    const countryTitle = cc ? COUNTRY_DISPLAY_NAMES[cc] || cc : "";
    const label = vpnCode
      ? `VPN ${countryTitle}`
      : proxyCode
        ? `Proxy ${countryTitle}`
        : resolved;
    base.splice(1, 0, {
      value: resolved,
      label,
      emoji: cc ? undefined : "🛡️",
      iconSrc: cc ? localeFlagIconSrc(cc) : undefined,
    });
  }
  return base;
}

export function profileGroupFilterOptions(groups: StealthGroup[]): FilterOption[] {
  return groups.map((group) => ({
    value: group.id,
    label: group.name,
    emoji: "📁",
  }));
}
