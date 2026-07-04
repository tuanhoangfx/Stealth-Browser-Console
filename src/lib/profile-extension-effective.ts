import type { ExtensionToggles, ProfileExtensionOverrides, ProfileRow } from "../types";

export const DEFAULT_EXTENSION_TOGGLES: ExtensionToggles = {
  e0001: true,
  surfshark: false,
  webStore: false,
};

export function resolveProfileExtensionEffective(
  global: ExtensionToggles,
  overrides: ProfileExtensionOverrides | undefined,
  key: keyof ExtensionToggles,
): boolean {
  const value = overrides?.[key];
  if (value !== undefined && value !== null) return Boolean(value);
  return Boolean(global[key]);
}

export function nextProfileExtensionOverrides(
  profile: ProfileRow,
  global: ExtensionToggles,
  key: keyof ExtensionToggles,
  enabled: boolean,
): ProfileExtensionOverrides {
  const overrides = { ...(profile.extensionOverrides || {}) };
  const globalDefault = Boolean(global[key]);
  if (enabled === globalDefault) {
    delete overrides[key];
  } else {
    overrides[key] = enabled;
  }
  return overrides;
}
