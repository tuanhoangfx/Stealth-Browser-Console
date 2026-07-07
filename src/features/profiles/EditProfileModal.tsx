import { useMemo, useState } from "react";
import { Save, UserRoundPen } from "lucide-react";
import {
  HubAccountDetailAdmScaffold,
  HubAccountDetailHeaderSearch,
  HubAccountDetailSearchProvider,
  HubAdmNoteRail,
  HubAdmRecordMetaRow,
  HubAlert,
  HubCopyBadge,
  HubToolDetailModal,
  HubToolDetailModalPrimaryAction,
  HubToolDetailModalSecondaryAction,
  HubToolDetailRail,
  HubTocSectionNav,
  HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT,
  HUB_ADM_TYPE_MONO_CLASS,
  hubAccountDetailSectionIcon,
  hubAccountDetailSectionIconClass,
} from "@tool-workspace/hub-ui";
import { deviceConfigFromProfile } from "../../lib/device-presets";
import { formatDateTime } from "../../lib/run-display";
import { resolveProfileLaunchUrl, resolveStartupUrlSave, startupUrlSaveError } from "../../lib/startup-url";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import type { DeviceConfig, ProfileExtensionOverrides, ProfileRow } from "../../types";
import { ProfileFormFields } from "./ProfileFormFields";
import { ProfileExtensionFields } from "./ProfileExtensionFields";
import { ProfileDetailLogRail } from "./ProfileDetailLogRail";
import { ProfileDetailTocNav } from "./ProfileDetailTocNav";
import {
  PROFILE_DETAIL_NOTE_LABEL,
  PROFILE_DETAIL_SECTION_CREDENTIALS,
  PROFILE_DETAIL_TOC,
} from "./profile-detail-toc";
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

  const sectionIds = useMemo(() => PROFILE_DETAIL_TOC.map((item) => item.id), []);
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
    <HubAccountDetailSearchProvider>
      <HubToolDetailModal
        open
        onClose={onClose}
        title={displayName}
        titleId="profile-detail-title"
        headerIcon={UserRoundPen}
        headerIconClassName="text-indigo-300"
        headerCenter={<HubAccountDetailHeaderSearch />}
        headerTrailing={
          <span className="ml-2 flex min-w-0 items-center gap-2 text-xs">
            <span className="truncate text-hub-muted">{groupName}</span>
            <span className={`shrink-0 font-medium ${profileStatusClass(profile.status)}`}>
              {profileStatusLabel(profile.status)}
            </span>
          </span>
        }
        shellClassName={PROFILE_EDIT_MODAL_SHELL_CLASS}
        sectionIds={sectionIds}
        scrollRootSelector={HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT}
        toc={
          <HubToolDetailRail
            title="Navigate"
            icon={hubAccountDetailSectionIcon("navigate")}
            iconClassName={hubAccountDetailSectionIconClass("navigate")}
            className="twofa-adm-rail--toc stealth-profile-detail-toc-rail"
            scroll={false}
            ariaLabel="Sections"
          >
            <ProfileDetailTocNav items={[...PROFILE_DETAIL_TOC]} onLogFocus={handleLogFocus} />
          </HubToolDetailRail>
        }
        footer={
          <>
            <HubToolDetailModalSecondaryAction label="Close" onClick={onClose} disabled={busy} />
            <HubToolDetailModalPrimaryAction
              label={busy ? "Saving…" : "Save changes"}
              icon={Save}
              onClick={save}
              disabled={busy || !name.trim()}
              busy={busy}
            />
          </>
        }
        ariaLabelledBy="profile-detail-title"
      >
        {error ? <HubAlert tone="danger">{error}</HubAlert> : null}
        <HubAccountDetailAdmScaffold
          panelId={PROFILE_DETAIL_SECTION_CREDENTIALS}
          panelTitle="Profile"
          frameClassName="twofa-account-detail-modal__frame"
          panelClassName="twofa-account-detail__panel"
          main={
            <>
              <HubAdmRecordMetaRow
                vaultId={
                  <HubCopyBadge
                    value={profile.id}
                    title="Copy profile ID"
                    className={`${HUB_ADM_TYPE_MONO_CLASS} hub-adm-type-mono`}
                    labelContent={profile.id}
                  />
                }
                created={
                  <time dateTime={profile.createdAt} title={formatDateTime(profile.createdAt)}>
                    {formatDateTime(profile.createdAt)}
                  </time>
                }
                updated={
                  <time dateTime={profile.updatedAt} title={formatDateTime(profile.updatedAt)}>
                    {formatDateTime(profile.updatedAt)}
                  </time>
                }
              />
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
            </>
          }
          rail={
            <>
              <HubAdmNoteRail
                mode="editor"
                title={PROFILE_DETAIL_NOTE_LABEL}
                className="stealth-profile-adm-rail--note"
                value={note}
                onChange={setNote}
                placeholder="Profile notes, credentials hints, proxy labels…"
                controlClassName="field auth-gate-field hub-adm-note-textarea"
              />
              <ProfileDetailLogRail
                profileId={profile.id}
                profileName={displayName}
                focused={logRailFocused}
              />
            </>
          }
        />
      </HubToolDetailModal>
    </HubAccountDetailSearchProvider>
  );
}
