import { useMemo, useState } from "react";
import {
  HubFormFieldLabel,
  HubModalFilterField,
  HubToolDetailSection,
  HUB_TOOL_DETAIL_FORM_GRID_2_CLASS,
  HUB_TOOL_DETAIL_SECTIONS_CLASS
} from "@tool-workspace/hub-ui";
import { Globe, Link2, MonitorSmartphone, User } from "lucide-react";
import { PROXY_PRESETS, randomFingerprintSeed } from "../../lib/stealth-profile-utils";
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
  proxyPresetFilterOptions,
  resolveProxyPresetId,
} from "../../lib/device-filter-options";
import type { DeviceConfig, StealthGroup } from "../../types";

const PROFILE_FORM_CLASS = `${HUB_TOOL_DETAIL_FORM_GRID_2_CLASS} stealth-settings-form min-w-0`;

export type ProfileFormFieldsProps = {
  name: string;
  setName: (value: string) => void;
  groupId: string;
  setGroupId: (value: string) => void;
  proxy: string;
  setProxy: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
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
  note,
  setNote,
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
    <div className={PROFILE_FORM_CLASS}>
      <label className="block min-w-0">
        <HubFormFieldLabel icon={User} iconClassName="text-indigo-300">
          Name
        </HubFormFieldLabel>
        <input className="hub-input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="block min-w-0">
        <HubFormFieldLabel>Group</HubFormFieldLabel>
        <select className="hub-input w-full" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <label className="col-span-full block min-w-0">
        <HubFormFieldLabel icon={Link2} iconClassName="text-violet-300">
          Startup URL
        </HubFormFieldLabel>
        <input
          className="hub-input w-full"
          value={startupUrl}
          onChange={(e) => setStartupUrl(e.target.value)}
          placeholder="https://myaccount.google.com/"
        />
      </label>
    </div>
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
            className="hub-input flex-1"
            type="number"
            min={0}
            max={7680}
            value={device.viewportW}
            onChange={(e) => editDevice({ viewportW: Number(e.target.value) || 0 })}
          />
          <span className="text-[var(--muted)]">×</span>
          <input
            className="hub-input flex-1"
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
              className="hub-input flex-1"
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
            className="hub-input w-full"
            value={device.userAgent}
            onChange={(e) => editDevice({ userAgent: e.target.value })}
            placeholder="Mozilla/5.0 …"
          />
        </label>
      ) : null}
    </div>
  );

  const network = (
    <div className={PROFILE_FORM_CLASS}>
      <HubModalFilterField
        filterKey="browser-proxy-preset"
        label="Proxy preset"
        options={proxyPresetFilterOptions()}
        value={resolveProxyPresetId(proxy)}
        onChange={(presetId) => {
          const preset = PROXY_PRESETS.find((item) => item.id === presetId);
          if (preset) setProxy(preset.value);
        }}
      />
      <label className="col-span-full block min-w-0">
        <HubFormFieldLabel>Proxy (optional)</HubFormFieldLabel>
        <input
          className="hub-input w-full"
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          placeholder="http://user:pass@host:port"
        />
      </label>
      <label className="block min-w-0">
        <HubFormFieldLabel>Note</HubFormFieldLabel>
        <input className="hub-input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
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
        <HubToolDetailSection id="profile-network" title="Proxy & note" icon={<Globe size={14} className="text-sky-300" aria-hidden />}>
          {network}
        </HubToolDetailSection>
      </div>
    );
  }

  return (
    <div className="hub-panel-fields flex flex-col gap-3">
      {basics}
      {deviceSection}
      {network}
    </div>
  );
}
