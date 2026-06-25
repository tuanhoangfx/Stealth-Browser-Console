import { useMemo, useState } from "react";
import { UserRoundPen } from "lucide-react";
import {
  HubAlert,
  HubTocSectionNav,
  HubToolDetailModal,
  HubToolDetailModalPrimaryAction,
  HubToolDetailModalSecondaryAction,
  HUB_TOOL_DETAIL_SCROLL_ROOT,
} from "@tool-workspace/hub-ui";
import { deviceConfigFromProfile } from "../../lib/device-presets";
import { resolveProfileLaunchUrl, resolveStartupUrlSave, startupUrlSaveError } from "../../lib/startup-url";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import type { DeviceConfig, ProfileRow } from "../../types";
import { ProfileFormFields } from "./ProfileFormFields";
import { ProfileFormModalLayout } from "./ProfileFormModalLayout";
import { profileFormTocItems } from "./profile-form-toc";
import { PROFILE_FORM_MODAL_SHELL_CLASS } from "./profile-form-modal";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const tocItems = useMemo(() => profileFormTocItems(), []);
  const sectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);

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
      ...device,
    })
      .then(() => {
        onProfilesChanged?.();
        onClose();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Update failed"))
      .finally(() => setBusy(false));
  };

  return (
    <HubToolDetailModal
      open
      headerIcon={UserRoundPen}
      headerIconClassName="text-indigo-200"
      title="Edit profile"
      onClose={onClose}
      shellClassName={PROFILE_FORM_MODAL_SHELL_CLASS}
      sectionIds={sectionIds}
      scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT}
      toc={
        <div className="hub-toc-nav">
          <HubTocSectionNav items={tocItems} scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT} />
        </div>
      }
      footer={
        <>
          <HubToolDetailModalSecondaryAction label="Cancel" onClick={onClose} disabled={busy} />
          <HubToolDetailModalPrimaryAction label="Save changes" onClick={save} disabled={busy || !name.trim()} busy={busy} />
        </>
      }
    >
      {error ? <HubAlert tone="danger">{error}</HubAlert> : null}
      <ProfileFormModalLayout note={note} onNoteChange={setNote} profileId={profile.id}>
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
      </ProfileFormModalLayout>
    </HubToolDetailModal>
  );
}
