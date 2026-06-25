import { useMemo } from "react";
import {
  HubFormFieldLabel,
  HubModalFilterField,
  HUB_TOOL_DETAIL_FORM_GRID_3_CLASS,
} from "@tool-workspace/hub-ui";
import { Link2, User } from "lucide-react";
import { formatStartupUrlOnBlur } from "../../lib/startup-url";
import { PROXY_PRESETS } from "../../lib/stealth-profile-utils";
import {
  profileGroupFilterOptions,
  proxyPresetFilterOptions,
  resolveProxyPresetId,
} from "../../lib/device-filter-options";
import type { StealthGroup } from "../../types";

const PROFILE_BASICS_FORM_CLASS = `${HUB_TOOL_DETAIL_FORM_GRID_3_CLASS} stealth-settings-form stealth-settings-form--3 min-w-0`;

export type ProfileBasicsFieldsProps = {
  name?: string;
  setName?: (value: string) => void;
  groupId: string;
  setGroupId: (value: string) => void;
  proxy: string;
  setProxy: (value: string) => void;
  startupUrl: string;
  setStartupUrl: (value: string) => void;
  groups: StealthGroup[];
  showName?: boolean;
  nameAutoFocus?: boolean;
};

/** Profile defaults — 3 fields per row (Hub filter dropdowns + field inputs). */
export function ProfileBasicsFields({
  name = "",
  setName,
  groupId,
  setGroupId,
  proxy,
  setProxy,
  startupUrl,
  setStartupUrl,
  groups,
  showName = true,
  nameAutoFocus = false,
}: ProfileBasicsFieldsProps) {
  const groupOptions = useMemo(() => profileGroupFilterOptions(groups), [groups]);

  return (
    <div className={PROFILE_BASICS_FORM_CLASS}>
      {showName ? (
        <label className="block min-w-0">
          <HubFormFieldLabel icon={User} iconClassName="text-indigo-300">
            Name
          </HubFormFieldLabel>
          <input
            className="field h-[var(--hub-control-h)] w-full text-xs"
            value={name}
            onChange={(e) => setName?.(e.target.value)}
            autoFocus={nameAutoFocus}
          />
        </label>
      ) : null}

      <HubModalFilterField
        filterKey="browser-profile-group"
        label="Group"
        options={groupOptions}
        value={groupId}
        onChange={setGroupId}
      />

      <label className="block min-w-0">
        <HubFormFieldLabel icon={Link2} iconClassName="text-violet-300">
          Startup URL
        </HubFormFieldLabel>
        <input
          className="field h-[var(--hub-control-h)] w-full text-xs"
          value={startupUrl}
          onChange={(e) => setStartupUrl(e.target.value)}
          onBlur={() => {
            const next = formatStartupUrlOnBlur(startupUrl);
            if (next !== startupUrl) setStartupUrl(next);
          }}
          placeholder="https://myaccount.google.com/"
        />
      </label>

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

      <label className="block min-w-0">
        <HubFormFieldLabel>Proxy (optional)</HubFormFieldLabel>
        <input
          className="field h-[var(--hub-control-h)] w-full text-xs"
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          placeholder="http://user:pass@host:port"
        />
      </label>
    </div>
  );
}
