import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Dices, RotateCcw } from "lucide-react";
import {
  HubAdmSectionBlock,
  HubAdmGridSlotPad,
} from "@tool-workspace/hub-ui";
import { randomFingerprintSeed } from "../../lib/stealth-profile-utils";
import {
  LOCALE_OPTIONS,
  TIMEZONE_OPTIONS,
  applyDevicePreset,
} from "../../lib/device-presets";
import {
  applyBrowserRuntimeMode,
  browserColorSchemeFilterOptions,
  browserPlatformFilterOptions,
  browserRuntimeModeFilterOptions,
  browserTimezoneFilterOptions,
  browserWindowModeFilterOptions,
  devicePresetFilterOptions,
  localeFilterOptions,
  resolveBrowserRuntimeMode,
} from "../../lib/device-filter-options";
import type { DeviceConfig, ProfileExtensionOverrides, ProfileRow, StealthGroup } from "../../types";
import { PROFILE_MODAL_SECTION_STICKER } from "../../lib/profile-form-stickers";
import { PROFILE_DETAIL_SECTION_SESSION } from "./profile-detail-toc";
import { ProfileBasicsFields, ProfileSessionFields } from "./ProfileBasicsFields";
import {
  PROFILE_ADM_CONTROL_CLASS,
  PROFILE_DETAIL_FORM_ROW_ALIGNED_3,
  ProfileDetailClickEditField,
  ProfileDetailClickFilterField,
  ProfileDetailReadonlyField,
} from "./ProfileDetailField";

export type ProfileFormFieldsProps = {
  profileId?: string;
  profileRow?: ProfileRow;
  name: string;
  setName: (value: string) => void;
  groupId: string;
  setGroupId: (value: string) => void;
  proxy: string;
  setProxy: (value: string) => void;
  staticIp?: boolean;
  setStaticIp?: (value: boolean) => void;
  extensionOverrides?: ProfileExtensionOverrides;
  setExtensionOverrides?: (value: ProfileExtensionOverrides) => void;
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
  profileId,
  profileRow,
  name,
  setName,
  groupId,
  setGroupId,
  proxy,
  setProxy,
  staticIp = false,
  setStaticIp,
  extensionOverrides,
  setExtensionOverrides,
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
  const editDevice = (patch: Partial<DeviceConfig>) => onDeviceChange({ ...patch, devicePreset: "custom" });

  const devicePresetOptions = useMemo(() => devicePresetFilterOptions(), []);
  const localeOptions = useMemo(() => localeFilterOptions(), []);
  const timezoneValue = TIMEZONE_OPTIONS.some((o) => o.value === device.timezone) ? device.timezone : "";
  const localeValue = LOCALE_OPTIONS.some((o) => o.value === device.locale) ? device.locale : "";

  const basics = (
    <ProfileBasicsFields
      profileId={profileId}
      profileRow={profileRow}
      name={name}
      setName={setName}
      groupId={groupId}
      setGroupId={setGroupId}
      proxy={proxy}
      setProxy={setProxy}
      staticIp={staticIp}
      setStaticIp={setStaticIp}
      extensionOverrides={extensionOverrides}
      setExtensionOverrides={setExtensionOverrides}
      startupUrl={startupUrl}
      setStartupUrl={setStartupUrl}
      groups={groups}
      onAutoGeoSync={(geo) => editDevice({ timezone: geo.timezone, locale: geo.locale })}
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
        <ProfileDetailReadonlyField fieldKey="advancedDevice" valueLayout="inline">
          <button
            type="button"
            aria-expanded={deviceExpanded}
            onClick={() => setDeviceExpanded((v) => !v)}
            className={`stealth-adm-action-pill${deviceExpanded ? " is-active" : ""}`}
            title="Show or hide custom OS, timezone, locale, viewport, fingerprint seed, and User-Agent overrides"
          >
            {deviceExpanded ? (
              <ChevronDown size={11} className="text-indigo-300" aria-hidden />
            ) : (
              <ChevronRight size={11} className="text-slate-400" aria-hidden />
            )}
            <span>{deviceExpanded ? "Hide overrides" : "Customize"}</span>
          </button>
        </ProfileDetailReadonlyField>
        <HubAdmGridSlotPad filledCount={2} />
      </div>

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
            <ProfileDetailReadonlyField fieldKey="viewport" valueLayout="inline">
              <div className="stealth-adm-detail-inline-bar">
                <input
                  className={`${PROFILE_ADM_CONTROL_CLASS} stealth-adm-compact-num`}
                  type="number"
                  min={0}
                  max={7680}
                  value={device.viewportW}
                  onChange={(e) => editDevice({ viewportW: Number(e.target.value) || 0 })}
                  aria-label="Viewport width"
                />
                <span className="hub-adm-detail-value-text text-[var(--muted)]">×</span>
                <input
                  className={`${PROFILE_ADM_CONTROL_CLASS} stealth-adm-compact-num`}
                  type="number"
                  min={0}
                  max={4320}
                  value={device.viewportH}
                  onChange={(e) => editDevice({ viewportH: Number(e.target.value) || 0 })}
                  aria-label="Viewport height"
                />
              </div>
            </ProfileDetailReadonlyField>
          </div>

          <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
            {showFingerprint ? (
              <ProfileDetailReadonlyField fieldKey="fingerprintSeed" valueLayout="inline">
                <div className="stealth-adm-detail-inline-bar">
                  <input
                    className={`${PROFILE_ADM_CONTROL_CLASS} stealth-adm-compact-num flex-1`}
                    type="number"
                    min={10000}
                    max={99999}
                    value={fingerprintSeed}
                    onChange={(e) => setFingerprintSeed(Number(e.target.value) || randomFingerprintSeed())}
                    aria-label="Fingerprint seed"
                  />
                  <button
                    type="button"
                    className="stealth-adm-action-pill"
                    title="Generate a new random fingerprint seed (10000–99999) for coherent hardware, canvas, WebGL, and audio spoofing"
                    onClick={() => setFingerprintSeed(randomFingerprintSeed())}
                  >
                    <Dices size={11} className="text-cyan-300" aria-hidden />
                  </button>
                </div>
              </ProfileDetailReadonlyField>
            ) : null}
            <ProfileDetailClickFilterField
              fieldKey="humanize"
              filterKey="browser-runtime-mode"
              options={browserRuntimeModeFilterOptions()}
              value={resolveBrowserRuntimeMode(device)}
              onChange={(mode) => editDevice(applyBrowserRuntimeMode(mode))}
            />
            <ProfileDetailClickEditField
              fieldKey="userAgent"
              value={device.userAgent}
              onChange={(value) => editDevice({ userAgent: value })}
              placeholder="⚙️ Auto (Coherent UA)"
              trailingAction={
                Boolean(String(device.userAgent || "").trim()) ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      editDevice({ userAgent: "" });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        editDevice({ userAgent: "" });
                      }
                    }}
                    className="hub-reset-btn inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-80 transition-opacity hover:opacity-100 focus:opacity-100"
                    title="Reset User-Agent to ⚙️ Auto (CloakBrowser coherent UA)"
                    aria-label="Reset User-Agent to Auto"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                  </span>
                ) : undefined
              }
            />
            {!showFingerprint ? <HubAdmGridSlotPad filledCount={2} /> : null}
          </div>
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
        {profileId ? (
          <HubAdmSectionBlock
            id={PROFILE_DETAIL_SECTION_SESSION}
            label="Session"
            emoji={PROFILE_MODAL_SECTION_STICKER.session}
            blockClassName="hub-adm-section-block--status"
          >
            <ProfileSessionFields profileId={profileId} name={name} profileRow={profileRow} />
          </HubAdmSectionBlock>
        ) : null}
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
