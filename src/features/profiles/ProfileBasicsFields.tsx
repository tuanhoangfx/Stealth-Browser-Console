import { useMemo, useState } from "react";
import { FolderPlus } from "lucide-react";
import { HubAdmGridSlotPad, HubPromptDialog } from "@tool-workspace/hub-ui";
import { formatStartupUrlOnBlur } from "../../lib/startup-url";
import { PROXY_PRESETS } from "../../lib/stealth-profile-utils";
import {
  profileGroupFilterOptions,
  proxyPresetFilterOptions,
  resolveProxyPresetId,
} from "../../lib/device-filter-options";
import { useAppToast } from "../../components/toast";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import type { StealthGroup } from "../../types";
import {
  PROFILE_DETAIL_FORM_ROW_ALIGNED_3,
  ProfileDetailClickEditField,
  ProfileDetailClickFilterField,
} from "./ProfileDetailField";

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

/** Profile defaults — P0020 ADM inline rows (label + value same line, 3 columns). */
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
}: ProfileBasicsFieldsProps) {
  const { createGroup } = useProfilesRuntime();
  const { pushToast } = useAppToast();
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const groupOptions = useMemo(() => profileGroupFilterOptions(groups), [groups]);

  return (
    <>
      <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
        {showName ? (
          <ProfileDetailClickEditField
            fieldKey="name"
            value={name}
            onChange={(value) => {
              const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
              setName?.(digits);
            }}
            placeholder="0000–9999"
          />
        ) : null}
        <ProfileDetailClickFilterField
          fieldKey="group"
          filterKey="browser-profile-group"
          options={groupOptions}
          value={groupId}
          onChange={setGroupId}
          onPanelCreate={() => setCreateGroupOpen(true)}
          panelCreateAriaLabel="Add Group"
        />
        <ProfileDetailClickEditField
          fieldKey="startupUrl"
          value={startupUrl}
          onChange={setStartupUrl}
          placeholder="https://myaccount.google.com/"
          formatValue={(raw) => raw}
          renderDisplay={(value) => value}
          renderEdit={({ value, onChange, onDone, inputRef, className }) => (
            <input
              ref={inputRef}
              className={className}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onBlur={() => {
                const next = formatStartupUrlOnBlur(value);
                if (next !== value) onChange(next);
                onDone();
              }}
              placeholder="https://myaccount.google.com/"
            />
          )}
        />
        {!showName ? <HubAdmGridSlotPad filledCount={2} /> : null}
      </div>

      <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
        <ProfileDetailClickFilterField
          fieldKey="proxyPreset"
          filterKey="browser-proxy-preset"
          options={proxyPresetFilterOptions()}
          value={resolveProxyPresetId(proxy)}
          onChange={(presetId) => {
            const preset = PROXY_PRESETS.find((item) => item.id === presetId);
            if (preset) setProxy(preset.value);
          }}
        />
        <ProfileDetailClickEditField
          fieldKey="proxy"
          value={proxy}
          onChange={setProxy}
          placeholder="http://user:pass@host:port"
        />
        <HubAdmGridSlotPad filledCount={2} />
      </div>

      <HubPromptDialog
        open={createGroupOpen}
        title="New group"
        label="Group name"
        placeholder="e.g. Clients"
        confirmLabel={createBusy ? "Creating…" : "Create"}
        headerIcon={FolderPlus}
        headerIconClassName="text-amber-300"
        onClose={() => {
          if (!createBusy) setCreateGroupOpen(false);
        }}
        onConfirm={(raw) => {
          const nameTrim = raw.trim();
          if (!nameTrim || createBusy) return;
          setCreateBusy(true);
          void createGroup(nameTrim)
            .then((group) => {
              setGroupId(group.id);
              setCreateGroupOpen(false);
              pushToast(`Group created: ${group.name}`, "success");
            })
            .catch((err: unknown) => {
              pushToast(err instanceof Error ? err.message : "Could not create group", "error");
            })
            .finally(() => setCreateBusy(false));
        }}
      />
    </>
  );
}
