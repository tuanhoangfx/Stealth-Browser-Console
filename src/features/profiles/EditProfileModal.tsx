import { useMemo, useState } from "react";
import { StickyNote, UserRoundPen } from "lucide-react";
import {
  HubAlert,
  HubToolDetailIdentityHeader,
  HubToolDetailModal,
  HubToolDetailModalPrimaryAction,
  HubToolDetailModalSecondaryAction,
  HubToolDetailPanel,
  HubToolDetailRail,
  HubToolDetailSplitLayout,
  HUB_TOOL_DETAIL_SCROLL_ROOT,
  hubAccountDetailSectionIcon,
  hubAccountDetailSectionIconClass,
} from "@tool-workspace/hub-ui";
import { deviceConfigFromProfile } from "../../lib/device-presets";
import { resolveProfileLaunchUrl, resolveStartupUrlSave, startupUrlSaveError } from "../../lib/startup-url";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import type { DeviceConfig, ProfileExtensionOverrides, ProfileRow } from "../../types";
import { ProfileFormFields } from "./ProfileFormFields";
import { ProfileExtensionFields } from "./ProfileExtensionFields";
import { ProfileDetailLogRail } from "./ProfileDetailLogRail";
import { ProfileDetailTocNav } from "./ProfileDetailTocNav";
import { profileFormTocItems } from "./profile-form-toc";
import { PROFILE_EDIT_MODAL_SHELL_CLASS } from "./profile-form-modal";

function profileStatusLabel(status: string): string {
  if (status === "running") return "Running";
  if (status === "opening") return "Opening";
  if (status === "closed") return "Closed";
  if (status === "failed") return "Failed";
  return status;
}

function profileStatusClass(status: string): string {
  if (status === "running") return "text-emerald-300";
  if (status === "opening") return "text-amber-300";
  if (status === "failed") return "text-rose-300";
  return "text-slate-400";
}

export function EditProfileModal({
  profile,
  onClose,
  onProfilesChanged,
}: {
  profile: ProfileRow;
  onClose: () => void;
  onProfilesChanged?: () => void;
}) {
  const { updateProfile, groups } = useProfilesRuntime();
  const [name, setName] = useState(profile.name);
  const [groupId, setGroupId] = useState(profile.groupId || "default");
  const [proxy, setProxy] = useState(profile.proxy || "");
  const [note, setNote] = useState(profile.note || "");
  const [fingerprintSeed, setFingerprintSeed] = useState(profile.fingerprintSeed);
  const [device, setDevice] = useState<DeviceConfig>(() => deviceConfigFromProfile(profile));
  const [startupUrl, setStartupUrl] = useState(() => resolveProfileLaunchUrl(profile.startupUrl || ""));
  const [extensionOverrides, setExtensionOverrides] = useState<ProfileExtensionOverrides>(
    () => profile.extensionOverrides || {},
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [logRailFocused, setLogRailFocused] = useState(false);

  const tocItems = useMemo(() => profileFormTocItems(), []);
  const sectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);
  const groupName = useMemo(
    () => groups.find((group) => group.id === groupId)?.name || "Default",
    [groupId, groups],
  );
  const displayName = name.trim() || profile.name;

  const save = () => {
    const urlError = startupUrlSaveError(startupUrl);
    if (urlError) {
      setError(urlError);
      return;
    }
    setBusy(true);
    setError("");
    void updateProfile({
      id: profile.id,
      name: name.trim(),
      groupId,
      proxy: proxy.trim(),
      note: note.trim(),
      fingerprintSeed,
      startupUrl: resolveStartupUrlSave(startupUrl, profile.startupUrl),
      extensionOverrides,
      ...device,
    })
      .then(() => {
        onProfilesChanged?.();
        onClose();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Update failed"))
      .finally(() => setBusy(false));
  };

  const handleLogFocus = () => {
    setLogRailFocused(true);
    window.setTimeout(() => setLogRailFocused(false), 1200);
  };

  return (
    <HubToolDetailModal
      open
      onClose={onClose}
      shellClassName={PROFILE_EDIT_MODAL_SHELL_CLASS}
      sectionIds={sectionIds}
      scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT}
      header={
        <HubToolDetailIdentityHeader
          titleId="profile-detail-title"
          title={displayName}
          leading={<UserRoundPen size={18} className="text-indigo-200 shrink-0" aria-hidden />}
          trailing={
            <span className="flex min-w-0 items-center gap-2 text-xs">
              <span className="truncate text-hub-muted">{groupName}</span>
              <span className={`shrink-0 font-medium ${profileStatusClass(profile.status)}`}>
                {profileStatusLabel(profile.status)}
              </span>
            </span>
          }
        />
      }
      toc={
        <HubToolDetailRail
          title="Navigate"
          icon={hubAccountDetailSectionIcon("navigate")}
          iconClassName={hubAccountDetailSectionIconClass("navigate")}
          className="stealth-profile-detail-toc-rail"
        >
          <ProfileDetailTocNav items={tocItems} onLogFocus={handleLogFocus} />
        </HubToolDetailRail>
      }
      footer={
        <>
          <HubToolDetailModalSecondaryAction label="Cancel" onClick={onClose} disabled={busy} />
          <HubToolDetailModalPrimaryAction label="Save changes" onClick={save} disabled={busy || !name.trim()} busy={busy} />
        </>
      }
      ariaLabelledBy="profile-detail-title"
    >
      {error ? <HubAlert tone="danger">{error}</HubAlert> : null}
      <div className="stealth-profile-detail__body hub-tool-detail-split__body">
        <HubToolDetailSplitLayout
          main={
            <>
              <ProfileFormFields
                layout="hub-sections"
                name={name}
                setName={setName}
                groupId={groupId}
                setGroupId={setGroupId}
                proxy={proxy}
                setProxy={setProxy}
                fingerprintSeed={fingerprintSeed}
                setFingerprintSeed={setFingerprintSeed}
                device={device}
                onDeviceChange={(patch) => setDevice((d) => ({ ...d, ...patch }))}
                startupUrl={startupUrl}
                setStartupUrl={setStartupUrl}
                groups={groups}
              />
              <ProfileExtensionFields
                overrides={extensionOverrides}
                onChange={setExtensionOverrides}
                disabled={busy}
              />
              <HubToolDetailPanel title="Note" icon={StickyNote} className="hub-tool-detail-panel--grow">
                <textarea
                  className="field stealth-profile-adm-note-textarea stealth-profile-detail-note-field"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Profile notes, credentials hints, proxy labels…"
                  spellCheck={false}
                />
              </HubToolDetailPanel>
            </>
          }
          rail={
            <ProfileDetailLogRail
              profileId={profile.id}
              profileName={displayName}
              focused={logRailFocused}
            />
          }
        />
      </div>
    </HubToolDetailModal>
  );
}
