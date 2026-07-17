import { useMemo, useState } from "react";
import { Save, Tags, UserRoundPen, X } from "lucide-react";
import {
  HubAccountDetailAdmScaffold,
  HubAccountDetailHeaderSearch,
  HubAccountDetailSearchProvider,
  HubAdmRecordMetaRow,
  HubAlert,
  HubConfirmDialog,
  HubCopyBadge,
  HubToolDetailModal,
  HubToolDetailModalPrimaryAction,
  HubToolDetailModalSecondaryAction,
  HubToolDetailRail,
  HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT,
  HUB_DETAIL_MODAL_CLOSE_LABEL,
  HUB_ADM_TYPE_MONO_CLASS,
  hubAccountDetailSectionIcon,
  hubAccountDetailSectionIconClass,
} from "@tool-workspace/hub-ui";
import { deviceConfigFromProfile } from "../../lib/device-presets";
import { formatDateTime } from "../../lib/run-display";
import { resolveProfileLaunchUrl, resolveStartupUrlSave, startupUrlSaveError } from "../../lib/startup-url";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import type { DeviceConfig, ProfileRow } from "../../types";
import { ProfileFormFields } from "./ProfileFormFields";
import { ProfileDetailHistoryRail } from "./ProfileDetailHistoryRail";
import { ProfileDetailLogRail } from "./ProfileDetailLogRail";
import { ProfileDetailTocNav } from "./ProfileDetailTocNav";
import {
  PROFILE_DETAIL_SECTION_CREDENTIALS,
  PROFILE_DETAIL_TOC,
} from "./profile-detail-toc";
import { profileDetailTocNavItems } from "./profile-detail-toc-nav";
import { PROFILE_EDIT_MODAL_SHELL_CLASS } from "./profile-form-modal";
import type { ProfileDetailModalProps } from "./profile-detail-modal-props";
import { ProfileBulkFormFields, resolveBulkDevicePatch } from "./ProfileBulkFormFields";

type ProfileBulkFieldKey = "groupId" | "startupUrl" | "proxy" | "devicePreset";
type BulkDraft = Record<ProfileBulkFieldKey, string>;

function resolveUniformValue<T>(profiles: ProfileRow[], read: (profile: ProfileRow) => T): T | null {
  if (!profiles.length) return null;
  const first = read(profiles[0]!);
  return profiles.every((profile) => read(profile) === first) ? first : null;
}

function ProfileDetailEditBody({
  profile,
  onClose,
  onProfilesChanged,
}: Extract<ProfileDetailModalProps, { mode: "edit" }>) {
  const { updateProfile, groups } = useProfilesRuntime();
  const [name, setName] = useState(profile.name);
  const [groupId, setGroupId] = useState(profile.groupId || "default");
  const [proxy, setProxy] = useState(profile.proxy || "");
  const [fingerprintSeed, setFingerprintSeed] = useState(profile.fingerprintSeed);
  const [device, setDevice] = useState<DeviceConfig>(() => deviceConfigFromProfile(profile));
  const [startupUrl, setStartupUrl] = useState(() => resolveProfileLaunchUrl(profile.startupUrl || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [logRailFocused, setLogRailFocused] = useState(false);

  const sectionIds = useMemo(() => PROFILE_DETAIL_TOC.map((item) => item.id), []);
  const tocItems = useMemo(() => profileDetailTocNavItems(), []);
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
      note: profile.note,
      fingerprintSeed,
      startupUrl: resolveStartupUrlSave(startupUrl, profile.startupUrl),
      extensionOverrides: profile.extensionOverrides,
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
            <ProfileDetailTocNav items={tocItems} onLogFocus={handleLogFocus} />
          </HubToolDetailRail>
        }
        footer={
          <>
            <HubToolDetailModalSecondaryAction
              label={HUB_DETAIL_MODAL_CLOSE_LABEL}
              onClick={onClose}
              disabled={busy}
              icon={X}
            />
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
          panelAdmSectionKey="profile"
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
            </>
          }
          rail={
            <div className="stealth-profile-detail-runtime-rail">
              <ProfileDetailHistoryRail profileId={profile.id} />
              <ProfileDetailLogRail profileName={displayName} focused={logRailFocused} />
            </div>
          }
        />
      </HubToolDetailModal>
    </HubAccountDetailSearchProvider>
  );
}

function ProfileDetailBulkBody({
  profiles,
  onClose,
  onProfilesChanged,
}: Extract<ProfileDetailModalProps, { mode: "bulk" }>) {
  const { groups, updateProfile, bulkSetStartupUrl } = useProfilesRuntime();
  const [draft, setDraft] = useState<BulkDraft>(() => ({
    groupId: resolveUniformValue(profiles, (profile) => profile.groupId || "default") ?? "",
    startupUrl: resolveUniformValue(profiles, (profile) => profile.startupUrl || "") ?? "",
    proxy: resolveUniformValue(profiles, (profile) => profile.proxy || "") ?? "",
    devicePreset: resolveUniformValue(profiles, (profile) => profile.devicePreset || "") ?? "",
  }));
  const [touched, setTouched] = useState<Set<ProfileBulkFieldKey>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [logRailFocused, setLogRailFocused] = useState(false);

  const sectionIds = useMemo(() => PROFILE_DETAIL_TOC.map((item) => item.id), []);
  const tocItems = useMemo(() => profileDetailTocNavItems(), []);
  const selectedCount = profiles.length;
  const profileIds = useMemo(() => profiles.map((profile) => profile.id), [profiles]);
  const profileNames = useMemo(() => profiles.map((profile) => profile.name), [profiles]);
  const canApply = touched.size > 0;

  const touchField = (key: ProfileBulkFieldKey) => {
    setTouched((prev) => new Set(prev).add(key));
  };

  const handleLogFocus = () => {
    setLogRailFocused(true);
    window.setTimeout(() => setLogRailFocused(false), 1200);
  };

  const apply = async () => {
    if (!profiles.length || !canApply) return;
    if (touched.has("startupUrl")) {
      const urlError = startupUrlSaveError(draft.startupUrl);
      if (urlError) {
        setError(urlError);
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      const ids = profiles.map((profile) => profile.id);
      if (touched.has("startupUrl")) {
        await bulkSetStartupUrl(ids, resolveStartupUrlSave(draft.startupUrl, ""));
      }
      const groupPatch = touched.has("groupId") ? draft.groupId || "default" : undefined;
      const proxyPatch = touched.has("proxy") ? draft.proxy.trim() : undefined;
      const devicePatch = touched.has("devicePreset") && draft.devicePreset.trim()
        ? resolveBulkDevicePatch(draft.devicePreset)
        : null;
      if (groupPatch !== undefined || proxyPatch !== undefined || devicePatch) {
        for (const profile of profiles) {
          const patch: Partial<ProfileRow> & { id: string } = { id: profile.id };
          if (groupPatch !== undefined) patch.groupId = groupPatch;
          if (proxyPatch !== undefined) patch.proxy = proxyPatch;
          if (devicePatch) Object.assign(patch, devicePatch);
          if (Object.keys(patch).length > 1) await updateProfile(patch);
        }
      }
      onProfilesChanged?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Bulk update failed");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const sampleLabels = profiles.slice(0, 5).map((profile) => profile.name);

  return (
    <HubAccountDetailSearchProvider>
      <HubToolDetailModal
        open
        onClose={onClose}
        title={selectedCount === 1 ? "Detail" : `Detail · ${selectedCount} profiles`}
        titleId="profile-bulk-detail-title"
        headerIcon={Tags}
        headerIconClassName="text-sky-300"
        headerCenter={<HubAccountDetailHeaderSearch />}
        headerTrailing={
          <span className="ml-2 shrink-0 text-xs font-medium text-sky-300">
            {selectedCount} selected
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
            <ProfileDetailTocNav items={tocItems} onLogFocus={handleLogFocus} />
          </HubToolDetailRail>
        }
        footer={
          <>
            <HubToolDetailModalSecondaryAction
              label={HUB_DETAIL_MODAL_CLOSE_LABEL}
              onClick={onClose}
              disabled={busy}
              icon={X}
            />
            <HubToolDetailModalPrimaryAction
              label={busy ? "Applying…" : "Apply changes"}
              icon={Save}
              onClick={() => setConfirmOpen(true)}
              disabled={busy || !canApply}
              busy={busy}
            />
          </>
        }
        ariaLabelledBy="profile-bulk-detail-title"
      >
        {error ? <HubAlert tone="danger">{error}</HubAlert> : null}
        <HubAccountDetailAdmScaffold
          panelId={PROFILE_DETAIL_SECTION_CREDENTIALS}
          panelTitle="Profile"
          panelAdmSectionKey="profile"
          frameClassName="twofa-account-detail-modal__frame"
          panelClassName="twofa-account-detail__panel"
          main={
            <>
              <HubAdmRecordMetaRow
                vaultId={
                  <span className={`${HUB_ADM_TYPE_MONO_CLASS} hub-adm-type-mono text-[var(--muted)]`}>
                    {selectedCount} profile{selectedCount === 1 ? "" : "s"} selected
                  </span>
                }
                created={<span className="text-[var(--muted)]">—</span>}
                updated={<span className="text-[var(--muted)]">—</span>}
              />
              <ProfileBulkFormFields
                groupId={draft.groupId}
                setGroupId={(value) => setDraft((prev) => ({ ...prev, groupId: value }))}
                proxy={draft.proxy}
                setProxy={(value) => setDraft((prev) => ({ ...prev, proxy: value }))}
                startupUrl={draft.startupUrl}
                setStartupUrl={(value) => setDraft((prev) => ({ ...prev, startupUrl: value }))}
                devicePreset={draft.devicePreset}
                setDevicePreset={(value) => setDraft((prev) => ({ ...prev, devicePreset: value }))}
                groups={groups}
                onTouchGroup={() => touchField("groupId")}
                onTouchStartupUrl={() => touchField("startupUrl")}
                onTouchProxy={() => touchField("proxy")}
                onTouchDevicePreset={() => touchField("devicePreset")}
              />
            </>
          }
          rail={
            <div className="stealth-profile-detail-runtime-rail">
              <ProfileDetailHistoryRail profileIds={profileIds} />
              <ProfileDetailLogRail profileNames={profileNames} focused={logRailFocused} />
            </div>
          }
        />
      </HubToolDetailModal>
      <HubConfirmDialog
        open={confirmOpen}
        title={selectedCount === 1 ? "Apply changes to 1 profile?" : `Apply changes to ${selectedCount} profiles?`}
        message={
          <div className="space-y-3 text-left">
            <p className="text-[13px] text-[var(--muted)]">
              Detail will update <strong className="text-[var(--text)]">{selectedCount}</strong> selected profile
              {selectedCount === 1 ? "" : "s"}.
            </p>
            {sampleLabels.length ? (
              <p className="text-[13px] text-[var(--muted)]">
                Sample: {sampleLabels.join(", ")}
                {selectedCount > sampleLabels.length ? ` +${selectedCount - sampleLabels.length} more` : ""}
              </p>
            ) : null}
          </div>
        }
        confirmLabel={selectedCount === 1 ? "Apply to 1 profile" : `Apply to ${selectedCount} profiles`}
        tone="info"
        onConfirm={() => void apply()}
        onClose={() => setConfirmOpen(false)}
      />
    </HubAccountDetailSearchProvider>
  );
}

/** Profile directory detail — edit (1 row) + bulk (2+ rows) in one modal SSOT. */
export function ProfileDetailModal(props: ProfileDetailModalProps) {
  if (props.mode === "bulk") {
    return <ProfileDetailBulkBody {...props} />;
  }
  return <ProfileDetailEditBody {...props} />;
}
