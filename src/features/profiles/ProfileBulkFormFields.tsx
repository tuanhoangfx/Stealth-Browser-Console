import { useMemo } from "react";
import { HubAdmSectionBlock } from "@tool-workspace/hub-ui";
import { applyDevicePreset } from "../../lib/device-presets";
import {
  browserColorSchemeFilterOptions,
  browserPlatformFilterOptions,
  browserTimezoneFilterOptions,
  browserWindowModeFilterOptions,
  devicePresetFilterOptions,
  localeFilterOptions,
} from "../../lib/device-filter-options";
import type { DeviceConfig, ProfileExtensionOverrides, StealthGroup } from "../../types";
import { ProfileBasicsFields } from "./ProfileBasicsFields";
import {
  PROFILE_DETAIL_FORM_ROW_ALIGNED_3,
  ProfileDetailClickFilterField,
} from "./ProfileDetailField";

export type ProfileBulkFormFieldsProps = {
  groupId: string;
  setGroupId: (value: string) => void;
  proxy: string;
  setProxy: (value: string) => void;
  staticIp?: boolean;
  setStaticIp?: (value: boolean) => void;
  extensionOverrides?: ProfileExtensionOverrides;
  setExtensionOverrides?: (value: ProfileExtensionOverrides) => void;
  onTouchExtensionKey?: (key: "e0001" | "e0002" | "surfshark") => void;
  startupUrl: string;
  setStartupUrl: (value: string) => void;
  devicePreset: string;
  setDevicePreset: (value: string) => void;
  platform: string;
  setPlatform: (value: string) => void;
  colorScheme: string;
  setColorScheme: (value: string) => void;
  timezone: string;
  setTimezone: (value: string) => void;
  locale: string;
  setLocale: (value: string) => void;
  windowMode: string;
  setWindowMode: (value: string) => void;
  groups: StealthGroup[];
  onTouchGroup: () => void;
  onTouchStartupUrl: () => void;
  onTouchProxy: () => void;
  onTouchStaticIp?: () => void;
  onTouchDevicePreset: () => void;
  onTouchPlatform: () => void;
  onTouchColorScheme: () => void;
  onTouchTimezone: () => void;
  onTouchLocale: () => void;
  onTouchWindowMode: () => void;
};

/** Bulk detail main — same hub-sections stack as ProfileFormFields (Detail parity). */
export function ProfileBulkFormFields({
  groupId,
  setGroupId,
  proxy,
  setProxy,
  staticIp,
  setStaticIp,
  extensionOverrides,
  setExtensionOverrides,
  onTouchExtensionKey,
  startupUrl,
  setStartupUrl,
  devicePreset,
  setDevicePreset,
  platform,
  setPlatform,
  colorScheme,
  setColorScheme,
  timezone,
  setTimezone,
  locale,
  setLocale,
  windowMode,
  setWindowMode,
  groups,
  onTouchGroup,
  onTouchStartupUrl,
  onTouchProxy,
  onTouchStaticIp,
  onTouchDevicePreset,
  onTouchPlatform,
  onTouchColorScheme,
  onTouchTimezone,
  onTouchLocale,
  onTouchWindowMode,
}: ProfileBulkFormFieldsProps) {
  const devicePresetOptions = useMemo(() => devicePresetFilterOptions(), []);
  const platformOptions = useMemo(() => browserPlatformFilterOptions(), []);
  const colorSchemeOptions = useMemo(() => browserColorSchemeFilterOptions(), []);
  const timezoneOptions = useMemo(() => browserTimezoneFilterOptions(), []);
  const localeOptions = useMemo(() => localeFilterOptions(), []);
  const windowModeOptions = useMemo(() => browserWindowModeFilterOptions(), []);

  return (
    <div className="twofa-adm-credentials-stack">
      <HubAdmSectionBlock id="profile-basics" sectionKey="profile">
        <ProfileBasicsFields
          showName={false}
          groupId={groupId}
          setGroupId={(value) => {
            onTouchGroup();
            setGroupId(value);
          }}
          proxy={proxy}
          setProxy={(value) => {
            onTouchProxy();
            setProxy(value);
          }}
          staticIp={staticIp}
          setStaticIp={
            setStaticIp
              ? (value) => {
                  onTouchStaticIp?.();
                  setStaticIp(value);
                }
              : undefined
          }
          extensionOverrides={extensionOverrides}
          setExtensionOverrides={setExtensionOverrides}
          onTouchExtensionKey={onTouchExtensionKey}
          startupUrl={startupUrl}
          setStartupUrl={(value) => {
            onTouchStartupUrl();
            setStartupUrl(value);
          }}
          groups={groups}
          onAutoGeoSync={(geo) => {
            onTouchTimezone();
            setTimezone(geo.timezone);
            onTouchLocale();
            setLocale(geo.locale);
          }}
        />
      </HubAdmSectionBlock>
      <HubAdmSectionBlock id="profile-device" sectionKey="device">
        <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
          <ProfileDetailClickFilterField
            fieldKey="devicePreset"
            filterKey="stealth-bulk-device-preset"
            options={devicePresetOptions}
            value={devicePreset}
            onChange={(presetId) => {
              onTouchDevicePreset();
              setDevicePreset(presetId);
            }}
            allowClear
          />
          <ProfileDetailClickFilterField
            fieldKey="platform"
            filterKey="stealth-bulk-platform"
            options={platformOptions}
            value={platform}
            onChange={(val) => {
              onTouchPlatform();
              setPlatform(val);
            }}
            allowClear
          />
          <ProfileDetailClickFilterField
            fieldKey="colorScheme"
            filterKey="stealth-bulk-color-scheme"
            options={colorSchemeOptions}
            value={colorScheme}
            onChange={(val) => {
              onTouchColorScheme();
              setColorScheme(val);
            }}
            allowClear
          />
        </div>
        <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
          <ProfileDetailClickFilterField
            fieldKey="timezone"
            filterKey="stealth-bulk-timezone"
            options={timezoneOptions}
            value={timezone}
            onChange={(val) => {
              onTouchTimezone();
              setTimezone(val);
            }}
            allowClear
          />
          <ProfileDetailClickFilterField
            fieldKey="locale"
            filterKey="stealth-bulk-locale"
            options={localeOptions}
            value={locale}
            onChange={(val) => {
              onTouchLocale();
              setLocale(val);
            }}
            allowClear
          />
          <ProfileDetailClickFilterField
            fieldKey="windowMode"
            filterKey="stealth-bulk-window-mode"
            options={windowModeOptions}
            value={windowMode}
            onChange={(val) => {
              onTouchWindowMode();
              setWindowMode(val);
            }}
            allowClear
          />
        </div>
        <p className="mt-2 text-[13px] text-[var(--muted)]">
          Leave fields empty to keep each profile&apos;s current value. Only edited fields apply to all selected
          profiles.
        </p>
      </HubAdmSectionBlock>
    </div>
  );
}

export type BulkDeviceOverrides = {
  devicePreset?: string;
  platform?: DeviceConfig["platform"];
  colorScheme?: DeviceConfig["colorScheme"];
  timezone?: string;
  locale?: string;
  windowMode?: DeviceConfig["windowMode"];
};

export function resolveBulkDevicePatch(presetId: string) {
  if (!presetId.trim()) return null;
  return applyDevicePreset(
    {
      devicePreset: "custom",
      platform: "windows",
      timezone: "",
      locale: "",
      userAgent: "",
      viewportW: 0,
      viewportH: 0,
      colorScheme: "",
      headless: false,
      humanize: true,
      windowMode: "host-maximized",
    },
    presetId,
  );
}
