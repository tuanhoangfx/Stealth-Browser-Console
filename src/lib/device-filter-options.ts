import { HUB_TOOL_DETAIL_FORM_GRID_3_CLASS, localeFlagIconSrc, type FilterOption } from "@tool-workspace/hub-ui";
import {
  COLOR_SCHEME_OPTIONS,
  DEVICE_PRESETS,
  LOCALE_OPTIONS,
  PLATFORM_OPTIONS,
  TIMEZONE_OPTIONS,
  WINDOW_MODE_OPTIONS,
} from "./device-presets";
import { PROXY_PRESETS } from "./stealth-profile-utils";
import type { StealthGroup } from "../types";

export const BROWSER_DEVICE_FORM_CLASS = `${HUB_TOOL_DETAIL_FORM_GRID_3_CLASS} stealth-settings-form stealth-settings-form--3 min-w-0`;

export function toFilterOptions<T extends { value: string; label: string }>(options: T[]): FilterOption[] {
  return options.map((option) => ({ value: option.value, label: option.label }));
}

export function devicePresetFilterOptions(): FilterOption[] {
  return [
    ...DEVICE_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
    { value: "custom", label: "Custom" },
  ];
}

export function localeFilterOptions(): FilterOption[] {
  return LOCALE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    iconSrc: localeFlagIconSrc(option.value),
  }));
}

export const browserPlatformFilterOptions = () => toFilterOptions(PLATFORM_OPTIONS);
export const browserColorSchemeFilterOptions = () => toFilterOptions(COLOR_SCHEME_OPTIONS);
export const browserTimezoneFilterOptions = () => toFilterOptions(TIMEZONE_OPTIONS);
export const browserWindowModeFilterOptions = () => toFilterOptions(WINDOW_MODE_OPTIONS);

export function proxyPresetFilterOptions(): FilterOption[] {
  return [
    ...PROXY_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
    { value: "custom", label: "Custom" },
  ];
}

export function resolveProxyPresetId(proxy: string): string {
  const hit = PROXY_PRESETS.find((preset) => preset.value === proxy);
  return hit?.id ?? "custom";
}

export function profileGroupFilterOptions(groups: StealthGroup[]) {
  return groups.map((group) => ({ value: group.id, label: group.name }));
}
