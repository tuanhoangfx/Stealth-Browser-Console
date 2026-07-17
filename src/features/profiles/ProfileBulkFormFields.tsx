import { HubAdmSectionBlock } from "@tool-workspace/hub-ui";
import { applyDevicePreset } from "../../lib/device-presets";
import { devicePresetFilterOptions } from "../../lib/device-filter-options";
import { formatStartupUrlOnBlur } from "../../lib/startup-url";
import type { StealthGroup } from "../../types";
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
  startupUrl: string;
  setStartupUrl: (value: string) => void;
  devicePreset: string;
  setDevicePreset: (value: string) => void;
  groups: StealthGroup[];
  onTouchGroup: () => void;
  onTouchStartupUrl: () => void;
  onTouchProxy: () => void;
  onTouchDevicePreset: () => void;
};

/** Bulk detail main — same hub-sections stack as ProfileFormFields (Detail parity). */
export function ProfileBulkFormFields({
  groupId,
  setGroupId,
  proxy,
  setProxy,
  startupUrl,
  setStartupUrl,
  devicePreset,
  setDevicePreset,
  groups,
  onTouchGroup,
  onTouchStartupUrl,
  onTouchProxy,
  onTouchDevicePreset,
}: ProfileBulkFormFieldsProps) {
  const devicePresetOptions = devicePresetFilterOptions();

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
          startupUrl={startupUrl}
          setStartupUrl={(value) => {
            onTouchStartupUrl();
            setStartupUrl(value);
          }}
          groups={groups}
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
        </div>
        <p className="mt-2 text-[13px] text-[var(--muted)]">
          Leave fields empty to keep each profile&apos;s current value. Only edited fields apply to all selected
          profiles.
        </p>
      </HubAdmSectionBlock>
    </div>
  );
}

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
      windowMode: "normal",
    },
    presetId,
  );
}
