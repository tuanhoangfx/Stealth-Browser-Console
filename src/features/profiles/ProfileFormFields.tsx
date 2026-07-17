import { useMemo, useState } from "react";
import {
  HubAdmSectionBlock,
  HUB_ADM_GRID_SLOT_SPACER_CLASS,
  HUB_ADM_GRID_SLOT_SPACER_TAIL_CLASS,
} from "@tool-workspace/hub-ui";
import { randomFingerprintSeed } from "../../lib/stealth-profile-utils";
import {
  LOCALE_OPTIONS,
  TIMEZONE_OPTIONS,
  applyDevicePreset,
} from "../../lib/device-presets";
import {
  browserColorSchemeFilterOptions,
  browserPlatformFilterOptions,
  browserTimezoneFilterOptions,
  browserWindowModeFilterOptions,
  devicePresetFilterOptions,
  localeFilterOptions,
} from "../../lib/device-filter-options";
import type { DeviceConfig, StealthGroup } from "../../types";
import { ProfileBasicsFields } from "./ProfileBasicsFields";
import {
  PROFILE_ADM_CONTROL_CLASS,
  PROFILE_DETAIL_FORM_ROW_ALIGNED_3,
  PROFILE_DETAIL_FORM_ROW_DETAIL_LINE,
  ProfileDetailClickEditField,
  ProfileDetailClickFilterField,
  ProfileDetailInlineFieldLabel,
} from "./ProfileDetailField";

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
  layout = "hub-sections",
}: ProfileFormFieldsProps) {
  const [deviceExpanded, setDeviceExpanded] = useState(false);
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
    />
  );

  const deviceSection = (
    <>
      <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
        <ProfileDetailClickFilterField
          fieldKey="devicePreset"
          filterKey="browser-device-preset"
          options={devicePresetOptions}
          value={device.devicePreset}
          onChange={(presetId) => onDeviceChange(applyDevicePreset(device, presetId))}
        />
        <span className={HUB_ADM_GRID_SLOT_SPACER_CLASS} aria-hidden />
        <span className={HUB_ADM_GRID_SLOT_SPACER_TAIL_CLASS} aria-hidden />
      </div>

      <label className="stealth-settings-form__check self-start">
        <input
          type="checkbox"
          checked={deviceExpanded}
          onChange={(e) => setDeviceExpanded(e.target.checked)}
          aria-expanded={deviceExpanded}
        />
        Advanced device settings
      </label>

      {deviceExpanded ? (
        <>
          <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
            <ProfileDetailClickFilterField
              fieldKey="platform"
              filterKey="browser-platform"
              options={browserPlatformFilterOptions()}
              value={device.platform}
              onChange={(value) => editDevice({ platform: value as DeviceConfig["platform"] })}
            />
            <ProfileDetailClickFilterField
              fieldKey="colorScheme"
              filterKey="browser-color-scheme"
              options={browserColorSchemeFilterOptions()}
              value={device.colorScheme}
              onChange={(value) => editDevice({ colorScheme: value as DeviceConfig["colorScheme"] })}
            />
            <ProfileDetailClickFilterField
              fieldKey="timezone"
              filterKey="browser-timezone"
              options={browserTimezoneFilterOptions()}
              value={timezoneValue}
              onChange={(value) => editDevice({ timezone: value })}
            />
          </div>

          <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
            <ProfileDetailClickFilterField
              fieldKey="locale"
              filterKey="browser-locale"
              options={localeOptions}
              value={localeValue}
              onChange={(value) => editDevice({ locale: value })}
            />
            <ProfileDetailClickFilterField
              fieldKey="windowMode"
              filterKey="browser-window-mode"
              options={browserWindowModeFilterOptions()}
              value={device.windowMode}
              onChange={(value) => editDevice({ windowMode: value as DeviceConfig["windowMode"] })}
            />
            <span className={HUB_ADM_GRID_SLOT_SPACER_TAIL_CLASS} aria-hidden />
          </div>

          <div className={`${PROFILE_DETAIL_FORM_ROW_DETAIL_LINE} hub-adm-inline-field min-w-0`}>
            <ProfileDetailInlineFieldLabel fieldKey="viewport" />
            <div className="hub-adm-inline-field__value hub-adm-inline-field__value--editing flex min-w-0 items-center gap-2">
              <input
                className={`${PROFILE_ADM_CONTROL_CLASS} flex-1`}
                type="number"
                min={0}
                max={7680}
                value={device.viewportW}
                onChange={(e) => editDevice({ viewportW: Number(e.target.value) || 0 })}
              />
              <span className="text-[var(--muted)]">×</span>
              <input
                className={`${PROFILE_ADM_CONTROL_CLASS} flex-1`}
                type="number"
                min={0}
                max={4320}
                value={device.viewportH}
                onChange={(e) => editDevice({ viewportH: Number(e.target.value) || 0 })}
              />
            </div>
          </div>

          {showFingerprint ? (
            <div className={`${PROFILE_DETAIL_FORM_ROW_DETAIL_LINE} hub-adm-inline-field min-w-0`}>
              <ProfileDetailInlineFieldLabel fieldKey="fingerprintSeed" />
              <div className="hub-adm-inline-field__value hub-adm-inline-field__value--editing flex min-w-0 gap-2">
                <input
                  className={`${PROFILE_ADM_CONTROL_CLASS} flex-1`}
                  type="number"
                  min={10000}
                  max={99999}
                  value={fingerprintSeed}
                  onChange={(e) => setFingerprintSeed(Number(e.target.value) || randomFingerprintSeed())}
                />
                <button
                  type="button"
                  className="hub-btn shrink-0"
                  onClick={() => setFingerprintSeed(randomFingerprintSeed())}
                >
                  Randomize
                </button>
              </div>
            </div>
          ) : null}

          <div className="stealth-settings-form__checks">
            <label className="stealth-settings-form__check">
              <input type="checkbox" checked={device.humanize} onChange={(e) => editDevice({ humanize: e.target.checked })} />
              <ProfileDetailInlineFieldLabel fieldKey="humanize" />
            </label>
            <label className="stealth-settings-form__check">
              <input type="checkbox" checked={device.headless} onChange={(e) => editDevice({ headless: e.target.checked })} />
              <ProfileDetailInlineFieldLabel fieldKey="headless" />
              <span className="stealth-settings-form__warn">easier to detect</span>
            </label>
          </div>

          <button
            type="button"
            className="self-start text-xs text-[var(--accent-2)] underline-offset-2 hover:underline"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide User-Agent override" : "Advanced (User-Agent override)"}
          </button>

          {showAdvanced ? (
            <div className={PROFILE_DETAIL_FORM_ROW_DETAIL_LINE}>
              <ProfileDetailClickEditField
                fieldKey="userAgent"
                value={device.userAgent}
                onChange={(value) => editDevice({ userAgent: value })}
                placeholder="Mozilla/5.0 …"
              />
              <span className={HUB_ADM_GRID_SLOT_SPACER_CLASS} aria-hidden />
              <span className={HUB_ADM_GRID_SLOT_SPACER_TAIL_CLASS} aria-hidden />
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );

  if (layout === "hub-sections") {
    return (
      <div className="twofa-adm-credentials-stack">
        <HubAdmSectionBlock id="profile-basics" sectionKey="profile">
          {basics}
        </HubAdmSectionBlock>
        <HubAdmSectionBlock id="profile-device" sectionKey="device">
          {deviceSection}
        </HubAdmSectionBlock>
      </div>
    );
  }

  return (
    <div className="twofa-adm-credentials-stack">
      {basics}
      {deviceSection}
    </div>
  );
}
