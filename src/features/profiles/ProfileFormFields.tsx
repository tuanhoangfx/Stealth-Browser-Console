import { useMemo, useState } from "react";
import {
  HubModalFilterField,
  HubToolDetailSection,
  HUB_TOOL_DETAIL_SECTIONS_CLASS
} from "@tool-workspace/hub-ui";
import { MonitorSmartphone, User } from "lucide-react";
import { randomFingerprintSeed } from "../../lib/stealth-profile-utils";
import {
  LOCALE_OPTIONS,
  TIMEZONE_OPTIONS,
  applyDevicePreset
} from "../../lib/device-presets";
import {
  BROWSER_DEVICE_FORM_CLASS,
  browserColorSchemeFilterOptions,
  browserPlatformFilterOptions,
  browserTimezoneFilterOptions,
  browserWindowModeFilterOptions,
  devicePresetFilterOptions,
  localeFilterOptions,
} from "../../lib/device-filter-options";
import type { DeviceConfig, StealthGroup } from "../../types";
import { ProfileBasicsFields } from "./ProfileBasicsFields";

export type ProfileFormFieldsProps = {
  name: string;
  setName: (value: string) => void;
  groupId: string;
  setGroupId: (value: string) => void;
  proxy: string;
  setProxy: (value: string) => void;
  fingerprintSeed: number;
  setFingerprintSeed: (value: number) => void;
  device: DeviceConfig;
  onDeviceChange: (patch: Partial<DeviceConfig>) => void;
  startupUrl: string;
  setStartupUrl: (value: string) => void;
  groups: StealthGroup[];
  showFingerprint?: boolean;
  layout?: "flat" | "hub-sections";
};

export function ProfileFormFields({
  name,
  setName,
  groupId,
  setGroupId,
  proxy,
  setProxy,
  fingerprintSeed,
  setFingerprintSeed,
  device,
  onDeviceChange,
  startupUrl,
  setStartupUrl,
  groups,
  showFingerprint = true,
  layout = "flat"
}: ProfileFormFieldsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const editDevice = (patch: Partial<DeviceConfig>) => onDeviceChange({ ...patch, devicePreset: "custom" });

  const devicePresetOptions = useMemo(() => devicePresetFilterOptions(), []);
  const localeOptions = useMemo(() => localeFilterOptions(), []);
  const timezoneValue = TIMEZONE_OPTIONS.some((o) => o.value === device.timezone) ? device.timezone : "";
  const localeValue = LOCALE_OPTIONS.some((o) => o.value === device.locale) ? device.locale : "";

  const basics = (
    <ProfileBasicsFields
      name={name}
      setName={setName}
      groupId={groupId}
      setGroupId={setGroupId}
      proxy={proxy}
      setProxy={setProxy}
      startupUrl={startupUrl}
      setStartupUrl={setStartupUrl}
      groups={groups}
      nameAutoFocus
    />
  );

  const deviceSection = (
    <div className={BROWSER_DEVICE_FORM_CLASS}>
      <HubModalFilterField
        filterKey="browser-device-preset"
        label="Device preset"
        options={devicePresetOptions}
        value={device.devicePreset}
        onChange={(presetId) => onDeviceChange(applyDevicePreset(device, presetId))}
      />

      <HubModalFilterField
        filterKey="browser-platform"
        label="Operating system"
        options={browserPlatformFilterOptions()}
        value={device.platform}
        onChange={(value) => editDevice({ platform: value as DeviceConfig["platform"] })}
      />

      <HubModalFilterField
        filterKey="browser-color-scheme"
        label="Color scheme"
        options={browserColorSchemeFilterOptions()}
        value={device.colorScheme}
        onChange={(value) => editDevice({ colorScheme: value as DeviceConfig["colorScheme"] })}
      />

      <HubModalFilterField
        filterKey="browser-timezone"
        label="Timezone"
        options={browserTimezoneFilterOptions()}
        value={timezoneValue}
        onChange={(value) => editDevice({ timezone: value })}
      />

      <HubModalFilterField
        filterKey="browser-locale"
        label="Locale"
        options={localeOptions}
        value={localeValue}
        onChange={(value) => editDevice({ locale: value })}
      />

      <HubModalFilterField
        filterKey="browser-window-mode"
        label="Window mode"
        options={browserWindowModeFilterOptions()}
        value={device.windowMode}
        onChange={(value) => editDevice({ windowMode: value as DeviceConfig["windowMode"] })}
      />

      <label className="col-span-full block min-w-0 text-xs">
        <span className="mb-1 block font-semibold text-[var(--muted)]">Viewport (preset-viewport mode)</span>
        <div className="flex items-center gap-2">
          <input
            className="field h-[var(--hub-control-h)] flex-1 text-xs"
            type="number"
            min={0}
            max={7680}
            value={device.viewportW}
            onChange={(e) => editDevice({ viewportW: Number(e.target.value) || 0 })}
          />
          <span className="text-[var(--muted)]">×</span>
          <input
            className="field h-[var(--hub-control-h)] flex-1 text-xs"
            type="number"
            min={0}
            max={4320}
            value={device.viewportH}
            onChange={(e) => editDevice({ viewportH: Number(e.target.value) || 0 })}
          />
        </div>
      </label>

      {showFingerprint ? (
        <label className="col-span-full block min-w-0 text-xs">
          <span className="mb-1 block font-semibold text-[var(--muted)]">Fingerprint seed</span>
          <div className="flex gap-2">
            <input
              className="field h-[var(--hub-control-h)] flex-1 text-xs"
              type="number"
              min={10000}
              max={99999}
              value={fingerprintSeed}
              onChange={(e) => setFingerprintSeed(Number(e.target.value) || randomFingerprintSeed())}
            />
            <button type="button" className="hub-btn shrink-0" onClick={() => setFingerprintSeed(randomFingerprintSeed())}>
              Randomize
            </button>
          </div>
        </label>
      ) : null}

      <div className="col-span-full stealth-settings-form__checks">
        <label className="stealth-settings-form__check">
          <input type="checkbox" checked={device.humanize} onChange={(e) => editDevice({ humanize: e.target.checked })} />
          Humanize
        </label>
        <label className="stealth-settings-form__check">
          <input type="checkbox" checked={device.headless} onChange={(e) => editDevice({ headless: e.target.checked })} />
          Headless
          <span className="stealth-settings-form__warn">easier to detect</span>
        </label>
      </div>

      <button
        type="button"
        className="col-span-full self-start text-xs text-[var(--accent-2)] underline-offset-2 hover:underline"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? "Hide advanced" : "Advanced (User-Agent override)"}
      </button>

      {showAdvanced ? (
        <label className="col-span-full block min-w-0 text-xs">
          <span className="mb-1 block font-semibold text-[var(--muted)]">User-Agent</span>
          <input
            className="field h-[var(--hub-control-h)] w-full text-xs"
            value={device.userAgent}
            onChange={(e) => editDevice({ userAgent: e.target.value })}
            placeholder="Mozilla/5.0 …"
          />
        </label>
      ) : null}
    </div>
  );

  if (layout === "hub-sections") {
    return (
      <div className={HUB_TOOL_DETAIL_SECTIONS_CLASS}>
        <HubToolDetailSection id="profile-basics" title="Profile" icon={<User size={14} className="text-indigo-300" aria-hidden />}>
          {basics}
        </HubToolDetailSection>
        <HubToolDetailSection
          id="profile-device"
          title="Device"
          icon={<MonitorSmartphone size={14} className="text-violet-300" aria-hidden />}
        >
          {deviceSection}
        </HubToolDetailSection>
      </div>
    );
  }

  return (
    <div className="hub-panel-fields flex flex-col gap-3">
      {basics}
      {deviceSection}
    </div>
  );
}
