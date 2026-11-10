import { useMemo, useState } from "react";
import { CopyPlus, RotateCcw, Save, Tags, UserRoundPen } from "lucide-react";
import {
  HubAccountDetailAdmScaffold,
  HubAccountDetailHeaderSearch,
  HubAccountDetailSearchProvider,
  HubAdmPlainRelativeTime,
  HubAdmRecordMetaRow,
  HubAlert,
  HubCloneConfirmDialog,
  HubConfirmDialog,
  HubCopyBadge,
  HubToolDetailModal,
  HubToolDetailModalAccountFooter,
  HubToolDetailModalSecondaryAction,
  HubToolDetailRail,
  HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT,
  HUB_ACCOUNT_DETAIL_NAVIGATE_EMOJI,
  HUB_ADM_TYPE_MONO_CLASS,
  HUB_DETAIL_MODAL_APPLY_LABEL,
  HUB_DETAIL_MODAL_APPLYING_LABEL,
  HUB_DETAIL_MODAL_RESET_LABEL,
  HUB_DETAIL_MODAL_RESET_TITLE,
  HUB_DETAIL_MODAL_SAVE_LABEL,
  HUB_DETAIL_MODAL_SAVING_LABEL,
  formatVaultIdForDisplay,
  reseedHubDetailDraftAfterSave,
  runHubDetailOptimisticSave,
} from "@tool-workspace/hub-ui";
import { createProfile as apiCreateProfile, fetchProfilesAndGroups } from "../../api";
import { useAppToast } from "../../components/toast";
import { DEFAULT_DEVICE, deviceConfigFromProfile } from "../../lib/device-presets";
import { extractProfileCode } from "../../lib/profile-code";
import { extractProxyCountryCode, randomFingerprintSeed } from "../../lib/stealth-profile-utils";
import { resolveProfileLaunchUrl, resolveStartupUrlSave, startupUrlSaveError } from "../../lib/startup-url";
import { stealthProfileColumnHintContent } from "../../lib/stealth-directory-column-hints";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import type { DeviceConfig, ProfileExtensionOverrides, ProfileRow } from "../../types";
import { ProfileFormFields } from "./ProfileFormFields";
import { ProfileDetailNoteRail } from "./ProfileDetailNoteRail";
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
import { CreateProfileModal } from "./CreateProfileModal";

type ProfileBulkFieldKey =
  | "groupId"
  | "startupUrl"
  | "proxy"
  | "staticIp"
  | "e0001"
  | "e0002"
  | "surfshark"
  | "devicePreset"
  | "platform"
  | "colorScheme"
  | "timezone"
  | "locale"
  | "windowMode"
  | "note";
type BulkDraft = Omit<Record<ProfileBulkFieldKey, string>, "staticIp" | "e0001" | "e0002" | "surfshark"> & {
  staticIp: boolean;
  extensionOverrides: ProfileExtensionOverrides;
};

type ProfileEditBaseline = {
  name: string;
  groupId: string;
  proxy: string;
  staticIp: boolean;
  extensionOverrides: ProfileExtensionOverrides;
  note: string;
  fingerprintSeed: number;
  startupUrl: string;
  device: DeviceConfig;
};

function serializeOverridesKey(overrides: ProfileExtensionOverrides | undefined): string {
  const obj = overrides || {};
  return JSON.stringify({
    e0001: obj.e0001 ?? null,
    e0002: obj.e0002 ?? null,
    surfshark: obj.surfshark ?? null,
    webStore: obj.webStore ?? null,
  });
}

function buildProfileEditBaseline(profile: ProfileRow): ProfileEditBaseline {
  return {
    name: profile.name || "",
    groupId: profile.groupId || "default",
    proxy: profile.proxy || "",
    staticIp: Boolean(profile.staticIp),
    extensionOverrides: { ...(profile.extensionOverrides || {}) },
    note: profile.note || "",
    fingerprintSeed: profile.fingerprintSeed,
    startupUrl: profile.startupUrl || "",
    device: deviceConfigFromProfile(profile),
  };
}

function buildProfileEditChangeSummary(
  prev: ProfileEditBaseline,
  next: ProfileEditBaseline,
  groups: { id: string; name: string }[],
): string {
  const deltas: string[] = [];
  const push = (label: string, before: string, after: string) => {
    const b = before.trim() || "—";
    const a = after.trim() || "—";
    if (b !== a) deltas.push(`${label}: ${b} → ${a}`);
  };
  const groupName = (id: string) =>
    groups.find((g) => g.id === id)?.name || (id === "default" ? "Default" : id || "Default");
  const inferGeo = (b: ProfileEditBaseline) =>
    extractProxyCountryCode(b.proxy, b.note, b.device.timezone, b.device.locale) ||
    (b.proxy.trim() ? "Proxy Auto" : "Auto (Local)");
  push("Name", prev.name, next.name);
  if ((prev.groupId || "default") !== (next.groupId || "default")) {
    push("Group", groupName(prev.groupId), groupName(next.groupId));
  }
  push("Proxy", prev.proxy.trim() || "Local IP", next.proxy.trim() || "Local IP");
  push("Static IP", prev.staticIp ? "On" : "Off", next.staticIp ? "On" : "Off");
  push("Geo", inferGeo(prev), inferGeo(next));
  push("Timezone", prev.device.timezone.trim() || "Auto", next.device.timezone.trim() || "Auto");
  push("Locale", prev.device.locale.trim() || "Auto", next.device.locale.trim() || "Auto");
  push("WebRTC", prev.proxy.trim() ? "Proxy Masked" : "Direct", next.proxy.trim() ? "Proxy Masked" : "Direct");
  push("Startup URL", prev.startupUrl.trim() || "—", next.startupUrl.trim() || "—");
  push("Note", prev.note.trim() || "—", next.note.trim() || "—");
  push("Device", prev.device.devicePreset || "custom", next.device.devicePreset || "custom");
  push("Platform", prev.device.platform || "windows", next.device.platform || "windows");
  push("Color Scheme", prev.device.colorScheme || "Auto", next.device.colorScheme || "Auto");
  push("Window Mode", prev.device.windowMode || "host-maximized", next.device.windowMode || "host-maximized");
  const prevVp = `${prev.device.viewportW || 0}×${prev.device.viewportH || 0}`;
  const nextVp = `${next.device.viewportW || 0}×${next.device.viewportH || 0}`;
  if (prevVp !== nextVp) {
    push("Viewport", prevVp === "0×0" ? "Auto" : prevVp, nextVp === "0×0" ? "Auto" : nextVp);
  }
  push("User-Agent", prev.device.userAgent.trim() || "Auto", next.device.userAgent.trim() || "Auto");
  push("Seed", String(prev.fingerprintSeed), String(next.fingerprintSeed));
  push("Headless", prev.device.headless ? "On" : "Off", next.device.headless ? "On" : "Off");
  if (serializeOverridesKey(prev.extensionOverrides) !== serializeOverridesKey(next.extensionOverrides)) {
    const fmtExt = (ov: ProfileExtensionOverrides) => {
      const entries = Object.entries(ov || {}).filter(([, v]) => v !== null && v !== undefined);
      if (!entries.length) return "Default";
      return entries.map(([k, v]) => `${k}=${v ? "On" : "Off"}`).join(", ");
    };
    push("Extensions", fmtExt(prev.extensionOverrides), fmtExt(next.extensionOverrides));
  }
  return deltas.join(" · ");
}

function allocateFreeProfileCodes(existing: { name: string; id: string }[], count: number): string[] {
  const taken = new Set<string>();
  for (const row of existing) {
    const raw = String(row.name || "").trim();
    if (raw) {
      taken.add(raw);
      taken.add(extractProfileCode(raw, row.id));
    }
  }
  const allocated: string[] = [];
  for (let n = 1; n <= 9999 && allocated.length < count; n += 1) {
    const code = String(n).padStart(4, "0");
    if (!taken.has(code)) {
      taken.add(code);
      allocated.push(code);
    }
  }
  return allocated;
}

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
  const { updateProfile, cloneProfilesBatch, deleteSelected, refreshProfiles, profiles, groups } =
    useProfilesRuntime();
  const { pushToast } = useAppToast();
  const [baseline, setBaseline] = useState<ProfileEditBaseline>(() => buildProfileEditBaseline(profile));
  const [name, setName] = useState(profile.name);
  const [groupId, setGroupId] = useState(profile.groupId || "default");
  const [proxy, setProxy] = useState(profile.proxy || "");
  const [staticIp, setStaticIp] = useState(Boolean(profile.staticIp));
  const [extensionOverrides, setExtensionOverrides] = useState<ProfileExtensionOverrides>(
    () => ({ ...(profile.extensionOverrides || {}) }),
  );
  const [fingerprintSeed, setFingerprintSeed] = useState(profile.fingerprintSeed);
  const [device, setDevice] = useState<DeviceConfig>(() => deviceConfigFromProfile(profile));
  const [startupUrl, setStartupUrl] = useState(() => resolveProfileLaunchUrl(profile.startupUrl || ""));
  const [note, setNote] = useState(profile.note || "");
  const [busy, setBusy] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState("");
  const [logRailFocused, setLogRailFocused] = useState(false);

  const liveProfile = useMemo(
    () => profiles.find((row) => row.id === profile.id) ?? profile,
    [profile, profiles],
  );
  const tocItems = useMemo(() => profileDetailTocNavItems(), []);
  const sectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);
  const displayName = name.trim() || profile.name;

  const dirty = useMemo(() => {
    if (name.trim() !== baseline.name.trim()) return true;
    if (groupId !== baseline.groupId) return true;
    if (proxy.trim() !== baseline.proxy.trim()) return true;
    if (staticIp !== baseline.staticIp) return true;
    if (serializeOverridesKey(extensionOverrides) !== serializeOverridesKey(baseline.extensionOverrides)) return true;
    if (note.trim() !== baseline.note.trim()) return true;
    if (fingerprintSeed !== baseline.fingerprintSeed) return true;
    if (resolveStartupUrlSave(startupUrl, baseline.startupUrl) !== baseline.startupUrl) return true;
    if (
      device.platform !== baseline.device.platform ||
      device.timezone !== baseline.device.timezone ||
      device.locale !== baseline.device.locale ||
      device.userAgent !== baseline.device.userAgent ||
      device.viewportW !== baseline.device.viewportW ||
      device.viewportH !== baseline.device.viewportH ||
      device.colorScheme !== baseline.device.colorScheme ||
      device.devicePreset !== baseline.device.devicePreset ||
      device.headless !== baseline.device.headless ||
      device.humanize !== baseline.device.humanize ||
      device.windowMode !== baseline.device.windowMode
    ) {
      return true;
    }
    return false;
  }, [baseline, device, extensionOverrides, fingerprintSeed, groupId, name, note, proxy, startupUrl, staticIp]);

  const handleSave = () => {
    const urlError = startupUrlSaveError(startupUrl);
    if (urlError) {
      setError(urlError);
      return;
    }
    const nextStartupUrl = resolveStartupUrlSave(startupUrl, baseline.startupUrl);
    const nextBaseline: ProfileEditBaseline = {
      name: name.trim(),
      groupId,
      proxy: proxy.trim(),
      staticIp,
      extensionOverrides: { ...extensionOverrides },
      note: note.trim(),
      fingerprintSeed,
      startupUrl: nextStartupUrl,
      device: { ...device },
    };
    setError("");
    const lastChangeSummary = buildProfileEditChangeSummary(baseline, nextBaseline, groups);
    void runHubDetailOptimisticSave({
      setBusy,
      applyLocal: async () => {
        await updateProfile({
          id: profile.id,
          name: nextBaseline.name,
          groupId: nextBaseline.groupId,
          proxy: nextBaseline.proxy,
          staticIp: nextBaseline.staticIp,
          note: nextBaseline.note,
          fingerprintSeed: nextBaseline.fingerprintSeed,
          startupUrl: nextBaseline.startupUrl,
          extensionOverrides: nextBaseline.extensionOverrides,
          ...nextBaseline.device,
          ...(lastChangeSummary ? { lastChangeSummary } : {}),
        });
        reseedHubDetailDraftAfterSave(nextBaseline, (saved) => saved, setBaseline);
        onProfilesChanged?.();
      },
      persistCloud: async () => {},
      onLocalError: (err: unknown) => {
        setError(err instanceof Error ? err.message : "Update failed");
      },
    });
  };

  const handleCloneConfirm = async (count: number) => {
    setCloneBusy(true);
    setError("");
    try {
      const nextStartupUrl = resolveStartupUrlSave(startupUrl, baseline.startupUrl);
      const batchRes = await cloneProfilesBatch([profile.id], count, {
        groupId,
        proxy: proxy.trim(),
        staticIp,
        note: note.trim(),
        startupUrl: nextStartupUrl,
        ...device,
        extensionOverrides,
      });
      let codes = batchRes.createdCodes;
      if (!codes.length) {
        const catalog = await fetchProfilesAndGroups().catch(() => ({ profiles, groups }));
        codes = allocateFreeProfileCodes(catalog.profiles, count);
        if (!codes.length) {
          throw new Error("No free 4-digit profile codes available (0001–9999).");
        }
        for (const code of codes) {
          const created = await apiCreateProfile({
            name: code,
            groupId,
            proxy: proxy.trim(),
            staticIp,
            note: note.trim(),
            fingerprintSeed: randomFingerprintSeed(),
            startupUrl: nextStartupUrl,
            ...device,
          });
          if (extensionOverrides && Object.keys(extensionOverrides).length > 0) {
            await updateProfile({
              id: created.id,
              extensionOverrides,
            });
          }
        }
        await refreshProfiles();
      }
      onProfilesChanged?.();
      pushToast(
        codes.length === 1
          ? `Cloned "${displayName}" → "${codes[0]}"`
          : `Cloned "${displayName}" → ${codes.length} profiles (${codes[0]}…${codes[codes.length - 1]})`,
        "success",
      );
      setCloneOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setCloneBusy(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setDeleteBusy(true);
    setError("");
    try {
      await deleteSelected([profile.id]);
      onProfilesChanged?.();
      setDeleteConfirmOpen(false);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleResetDefaults = () => {
    if (anyBusy) return;
    const cleanNote = String(note || "")
      .replace(/\[(?:pin-proxy|static-ip)\]\s*/gi, "")
      .replace(/\[vpn:[A-Za-z]{2}\]\s*/gi, "")
      .replace(/\bMuse US Proxy\b\s*\|?\s*/gi, "")
      .replace(/^\s*Local IP\s*$/gi, "")
      .trim();
    const nextDevice: DeviceConfig = { ...DEFAULT_DEVICE };
    setProxy("");
    setStaticIp(false);
    setExtensionOverrides({});
    setDevice(nextDevice);
    setNote(cleanNote);
    setError("");
    const nextBaseline: ProfileEditBaseline = {
      name: name.trim(),
      groupId,
      proxy: "",
      staticIp: false,
      extensionOverrides: {},
      note: cleanNote,
      fingerprintSeed,
      startupUrl: resolveStartupUrlSave(startupUrl, baseline.startupUrl),
      device: nextDevice,
    };
    void runHubDetailOptimisticSave({
      setBusy,
      applyLocal: async () => {
        await updateProfile({
          id: profile.id,
          name: nextBaseline.name,
          groupId: nextBaseline.groupId,
          proxy: "",
          staticIp: false,
          note: cleanNote,
          fingerprintSeed: nextBaseline.fingerprintSeed,
          startupUrl: nextBaseline.startupUrl,
          extensionOverrides: {},
          ...nextDevice,
        });
        reseedHubDetailDraftAfterSave(nextBaseline, (saved) => saved, setBaseline);
        onProfilesChanged?.();
        pushToast(`Reset profile ${displayName} to default settings (📍 Local IP).`, "success", 3000);
      },
      persistCloud: async () => {},
      onLocalError: (err: unknown) => {
        setError(err instanceof Error ? err.message : "Reset failed");
      },
    });
  };

  const handleLogFocus = () => {
    setLogRailFocused(true);
    window.setTimeout(() => setLogRailFocused(false), 1200);
  };

  const anyBusy = busy || cloneBusy || deleteBusy;

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
        busy={anyBusy}
        toc={
          <HubToolDetailRail
            title="Navigate"
            titleEmoji={HUB_ACCOUNT_DETAIL_NAVIGATE_EMOJI}
            className="twofa-adm-rail--toc stealth-profile-detail-toc-rail"
            scroll={false}
            ariaLabel="Sections"
          >
            <ProfileDetailTocNav items={tocItems} onLogFocus={handleLogFocus} />
          </HubToolDetailRail>
        }
        footer={
          <HubToolDetailModalAccountFooter
            onClose={onClose}
            onSave={handleSave}
            saveLabel={HUB_DETAIL_MODAL_SAVE_LABEL}
            saveBusyLabel={HUB_DETAIL_MODAL_SAVING_LABEL}
            saveIcon={Save}
            saveDisabled={anyBusy || !name.trim() || !dirty}
            busy={busy}
            leading={
              <>
                <HubToolDetailModalSecondaryAction
                  label="Clone"
                  icon={CopyPlus}
                  tone="sky"
                  disabled={anyBusy}
                  onClick={() => setCloneOpen(true)}
                />
                <HubToolDetailModalSecondaryAction
                  label={HUB_DETAIL_MODAL_RESET_LABEL}
                  title={HUB_DETAIL_MODAL_RESET_TITLE}
                  icon={RotateCcw}
                  disabled={anyBusy}
                  onClick={handleResetDefaults}
                />
              </>
            }
            onDelete={() => setDeleteConfirmOpen(true)}
            deleteHotkeyEnabled={!cloneOpen && !deleteConfirmOpen && !anyBusy}
          />
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
            <div className="twofa-adm-credentials-stack">
              <HubAdmRecordMetaRow
                createdHint={stealthProfileColumnHintContent("createdAt")}
                updatedHint={stealthProfileColumnHintContent("updated")}
                vaultId={
                  <HubCopyBadge
                    value={formatVaultIdForDisplay(profile.id) ?? profile.id}
                    title="Copy profile ID"
                    className={`${HUB_ADM_TYPE_MONO_CLASS} hub-adm-type-mono`}
                  />
                }
                created={<HubAdmPlainRelativeTime at={profile.createdAt} />}
                updated={<HubAdmPlainRelativeTime at={profile.updatedAt} />}
              />
              <ProfileFormFields
                layout="hub-sections"
                profileId={profile.id}
                profileRow={liveProfile}
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
                fingerprintSeed={fingerprintSeed}
                setFingerprintSeed={setFingerprintSeed}
                device={device}
                onDeviceChange={(patch) => setDevice((d) => ({ ...d, ...patch }))}
                startupUrl={startupUrl}
                setStartupUrl={setStartupUrl}
                groups={groups}
              />
            </div>
          }
          rail={
            <div className="stealth-profile-detail-runtime-rail">
              <ProfileDetailNoteRail value={note} onChange={setNote} />
              <ProfileDetailLogRail profileName={displayName} focused={logRailFocused} />
            </div>
          }
        />
      </HubToolDetailModal>
      <HubCloneConfirmDialog
        open={cloneOpen}
        sourceLabel={displayName}
        showKeepProfile={false}
        busy={cloneBusy}
        stacked
        onConfirm={({ count }) => void handleCloneConfirm(count)}
        onClose={() => setCloneOpen(false)}
      />
      <HubConfirmDialog
        open={deleteConfirmOpen}
        stacked
        danger
        title={`Delete profile ${displayName}?`}
        message={
          <p className="text-[13px] text-[var(--muted)]">
            Permanently remove profile <strong className="text-[var(--text)]">{displayName}</strong> and its browser
            data? This cannot be undone.
          </p>
        }
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={() => void handleDeleteConfirm()}
        onClose={() => setDeleteConfirmOpen(false)}
      />
    </HubAccountDetailSearchProvider>
  );
}

function ProfileDetailBulkBody({
  profiles,
  onClose,
  onProfilesChanged,
}: Extract<ProfileDetailModalProps, { mode: "bulk" }>) {
  const {
    groups,
    profiles: runtimeProfiles,
    updateProfile,
    bulkUpdateProfiles,
    cloneProfilesBatch,
    bulkSetStartupUrl,
    deleteSelected,
    refreshProfiles,
  } = useProfilesRuntime();
  const { pushToast } = useAppToast();
  const [draft, setDraft] = useState<BulkDraft>(() => ({
    groupId: resolveUniformValue(profiles, (profile) => profile.groupId || "default") ?? "",
    startupUrl: resolveUniformValue(profiles, (profile) => profile.startupUrl || "") ?? "",
    proxy: resolveUniformValue(profiles, (profile) => profile.proxy || "") ?? "",
    staticIp: resolveUniformValue(profiles, (profile) => Boolean(profile.staticIp)) ?? false,
    extensionOverrides: {
      ...(resolveUniformValue(profiles, (profile) => profile.extensionOverrides?.e0001) != null
        ? { e0001: resolveUniformValue(profiles, (profile) => profile.extensionOverrides?.e0001) ?? undefined }
        : {}),
      ...(resolveUniformValue(profiles, (profile) => profile.extensionOverrides?.e0002) != null
        ? { e0002: resolveUniformValue(profiles, (profile) => profile.extensionOverrides?.e0002) ?? undefined }
        : {}),
      ...(resolveUniformValue(profiles, (profile) => profile.extensionOverrides?.surfshark) != null
        ? { surfshark: resolveUniformValue(profiles, (profile) => profile.extensionOverrides?.surfshark) ?? undefined }
        : {}),
    },
    devicePreset: resolveUniformValue(profiles, (profile) => profile.devicePreset || "") ?? "",
    platform: resolveUniformValue(profiles, (profile) => profile.platform || "") ?? "",
    colorScheme: resolveUniformValue(profiles, (profile) => profile.colorScheme || "") ?? "",
    timezone: resolveUniformValue(profiles, (profile) => profile.timezone || "") ?? "",
    locale: resolveUniformValue(profiles, (profile) => profile.locale || "") ?? "",
    windowMode: resolveUniformValue(profiles, (profile) => profile.windowMode || "") ?? "",
    note: resolveUniformValue(profiles, (profile) => profile.note || "") ?? "",
  }));
  const [touched, setTouched] = useState<Set<ProfileBulkFieldKey>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState("");
  const [logRailFocused, setLogRailFocused] = useState(false);

  const tocItems = useMemo(() => profileDetailTocNavItems({ includeSession: false }), []);
  const sectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);
  const selectedCount = profiles.length;
  const profileNames = useMemo(() => profiles.map((profile) => profile.name), [profiles]);
  const canApply = touched.size > 0;
  const anyBusy = busy || cloneBusy || deleteBusy;

  const touchField = (key: ProfileBulkFieldKey) => {
    setTouched((prev) => new Set(prev).add(key));
  };

  const handleLogFocus = () => {
    setLogRailFocused(true);
    window.setTimeout(() => setLogRailFocused(false), 1200);
  };

  const handleBulkCloneConfirm = async (copiesPerProfile: number) => {
    if (!profiles.length) return;
    setCloneBusy(true);
    setError("");
    try {
      const sourceIds = profiles.map((p) => p.id);
      const batchRes = await cloneProfilesBatch(sourceIds, copiesPerProfile);
      let createdCodes = batchRes.createdCodes;
      if (!createdCodes.length) {
        const catalog = await fetchProfilesAndGroups().catch(() => ({ profiles: runtimeProfiles, groups }));
        const totalNeeded = profiles.length * Math.max(1, copiesPerProfile);
        const codes = allocateFreeProfileCodes(catalog.profiles, totalNeeded);
        if (!codes.length) {
          throw new Error("No free 4-digit profile codes available (0001–9999).");
        }
        let codeIdx = 0;
        createdCodes = [];
        for (const source of profiles) {
          for (let c = 0; c < copiesPerProfile && codeIdx < codes.length; c += 1) {
            const code = codes[codeIdx++]!;
            const srcDevice = deviceConfigFromProfile(source);
            const created = await apiCreateProfile({
              name: code,
              groupId: source.groupId || "default",
              proxy: (source.proxy || "").trim(),
              note: (source.note || "").trim(),
              fingerprintSeed: randomFingerprintSeed(),
              startupUrl: source.startupUrl || "",
              ...srcDevice,
            });
            if (source.extensionOverrides && Object.keys(source.extensionOverrides).length > 0) {
              await updateProfile({
                id: created.id,
                extensionOverrides: source.extensionOverrides,
              });
            }
            createdCodes.push(code);
          }
        }
        await refreshProfiles();
      }
      onProfilesChanged?.();
      pushToast(
        `Cloned ${profiles.length} profile${profiles.length === 1 ? "" : "s"} → ${createdCodes.length} new profile${createdCodes.length === 1 ? "" : "s"} (${createdCodes[0]}…${createdCodes[createdCodes.length - 1]})`,
        "success",
      );
      setCloneOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Bulk clone failed");
    } finally {
      setCloneBusy(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!profiles.length) return;
    setDeleteBusy(true);
    setError("");
    try {
      await deleteSelected(profiles.map((profile) => profile.id));
      onProfilesChanged?.();
      setDeleteConfirmOpen(false);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setDeleteBusy(false);
    }
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
      for (const extKey of ["e0001", "e0002", "surfshark"] as const) {
        if (touched.has(extKey)) {
          const defaultEnabled = extKey !== "surfshark";
          const nextEnabled =
            draft.extensionOverrides[extKey] !== undefined
              ? Boolean(draft.extensionOverrides[extKey])
              : defaultEnabled;
          await bulkUpdateProfiles(ids, {
            extensionOverrideDelta: {
              key: extKey,
              enabled: nextEnabled,
              globalDefault: defaultEnabled,
            },
          });
        }
      }
      const groupPatch = touched.has("groupId") ? draft.groupId || "default" : undefined;
      const proxyPatch = touched.has("proxy") ? draft.proxy.trim() : undefined;
      const staticIpPatch = touched.has("staticIp") ? Boolean(draft.staticIp) : undefined;
      const notePatch = touched.has("note") ? draft.note.trim() : undefined;
      const devicePatch = touched.has("devicePreset") && draft.devicePreset.trim()
        ? resolveBulkDevicePatch(draft.devicePreset)
        : null;
      const platformPatch = touched.has("platform") && draft.platform ? (draft.platform as DeviceConfig["platform"]) : undefined;
      const colorSchemePatch = touched.has("colorScheme") ? (draft.colorScheme as DeviceConfig["colorScheme"]) : undefined;
      const timezonePatch = touched.has("timezone") ? draft.timezone : undefined;
      const localePatch = touched.has("locale") ? draft.locale : undefined;
      const windowModePatch = touched.has("windowMode") && draft.windowMode ? (draft.windowMode as DeviceConfig["windowMode"]) : undefined;
      if (
        groupPatch !== undefined ||
        proxyPatch !== undefined ||
        staticIpPatch !== undefined ||
        notePatch !== undefined ||
        devicePatch ||
        platformPatch !== undefined ||
        colorSchemePatch !== undefined ||
        timezonePatch !== undefined ||
        localePatch !== undefined ||
        windowModePatch !== undefined
      ) {
        const patch: Partial<ProfileRow> = {};
        if (groupPatch !== undefined) patch.groupId = groupPatch;
        if (proxyPatch !== undefined) patch.proxy = proxyPatch;
        if (staticIpPatch !== undefined) patch.staticIp = staticIpPatch;
        if (notePatch !== undefined) patch.note = notePatch;
        if (devicePatch) Object.assign(patch, devicePatch);
        if (platformPatch !== undefined) patch.platform = platformPatch;
        if (colorSchemePatch !== undefined) patch.colorScheme = colorSchemePatch;
        if (timezonePatch !== undefined) patch.timezone = timezonePatch;
        if (localePatch !== undefined) patch.locale = localePatch;
        if (windowModePatch !== undefined) patch.windowMode = windowModePatch;
        if (Object.keys(patch).length > 0) {
          await bulkUpdateProfiles(ids, patch);
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

  const handleBulkResetDefaults = async () => {
    if (!profiles.length || anyBusy) return;
    setBusy(true);
    setError("");
    try {
      const ids = profiles.map((p) => p.id);
      await bulkUpdateProfiles(ids, { resetToDefaults: true });
      setDraft((prev) => ({
        ...prev,
        proxy: "",
        staticIp: false,
        devicePreset: "custom",
        platform: "windows",
        colorScheme: "",
        timezone: "",
        locale: "",
        windowMode: "host-maximized",
      }));
      setTouched(new Set());
      onProfilesChanged?.();
      pushToast(
        `Reset ${selectedCount} selected profile${selectedCount === 1 ? "" : "s"} to default settings (📍 Local IP).`,
        "success",
        3000,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Bulk reset failed");
    } finally {
      setBusy(false);
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
        busy={anyBusy}
        toc={
          <HubToolDetailRail
            title="Navigate"
            titleEmoji={HUB_ACCOUNT_DETAIL_NAVIGATE_EMOJI}
            className="twofa-adm-rail--toc stealth-profile-detail-toc-rail"
            scroll={false}
            ariaLabel="Sections"
          >
            <ProfileDetailTocNav items={tocItems} onLogFocus={handleLogFocus} />
          </HubToolDetailRail>
        }
        footer={
          <HubToolDetailModalAccountFooter
            onClose={onClose}
            onSave={() => setConfirmOpen(true)}
            saveLabel={HUB_DETAIL_MODAL_APPLY_LABEL}
            saveBusyLabel={HUB_DETAIL_MODAL_APPLYING_LABEL}
            saveIcon={Save}
            saveDisabled={anyBusy || !canApply}
            busy={busy}
            leading={
              <>
                <HubToolDetailModalSecondaryAction
                  label={selectedCount > 1 ? `Clone (${selectedCount})` : "Clone"}
                  icon={CopyPlus}
                  tone="sky"
                  disabled={anyBusy}
                  onClick={() => setCloneOpen(true)}
                />
                <HubToolDetailModalSecondaryAction
                  label={HUB_DETAIL_MODAL_RESET_LABEL}
                  title={HUB_DETAIL_MODAL_RESET_TITLE}
                  icon={RotateCcw}
                  disabled={anyBusy}
                  onClick={() => void handleBulkResetDefaults()}
                />
              </>
            }
            onDelete={() => setDeleteConfirmOpen(true)}
            deleteLabel={selectedCount > 1 ? `Delete (${selectedCount})` : "Delete"}
            deleteHotkeyEnabled={!confirmOpen && !cloneOpen && !deleteConfirmOpen && !anyBusy}
          />
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
            <div className="twofa-adm-credentials-stack">
              <HubAdmRecordMetaRow
                createdHint={stealthProfileColumnHintContent("createdAt")}
                updatedHint={stealthProfileColumnHintContent("updated")}
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
                staticIp={draft.staticIp}
                setStaticIp={(value) => setDraft((prev) => ({ ...prev, staticIp: value }))}
                extensionOverrides={draft.extensionOverrides}
                setExtensionOverrides={(value) => setDraft((prev) => ({ ...prev, extensionOverrides: value }))}
                onTouchExtensionKey={(key) => touchField(key)}
                startupUrl={draft.startupUrl}
                setStartupUrl={(value) => setDraft((prev) => ({ ...prev, startupUrl: value }))}
                devicePreset={draft.devicePreset}
                setDevicePreset={(value) => setDraft((prev) => ({ ...prev, devicePreset: value }))}
                platform={draft.platform}
                setPlatform={(value) => setDraft((prev) => ({ ...prev, platform: value }))}
                colorScheme={draft.colorScheme}
                setColorScheme={(value) => setDraft((prev) => ({ ...prev, colorScheme: value }))}
                timezone={draft.timezone}
                setTimezone={(value) => setDraft((prev) => ({ ...prev, timezone: value }))}
                locale={draft.locale}
                setLocale={(value) => setDraft((prev) => ({ ...prev, locale: value }))}
                windowMode={draft.windowMode}
                setWindowMode={(value) => setDraft((prev) => ({ ...prev, windowMode: value }))}
                groups={groups}
                onTouchGroup={() => touchField("groupId")}
                onTouchStartupUrl={() => touchField("startupUrl")}
                onTouchProxy={() => touchField("proxy")}
                onTouchStaticIp={() => touchField("staticIp")}
                onTouchDevicePreset={() => touchField("devicePreset")}
                onTouchPlatform={() => touchField("platform")}
                onTouchColorScheme={() => touchField("colorScheme")}
                onTouchTimezone={() => touchField("timezone")}
                onTouchLocale={() => touchField("locale")}
                onTouchWindowMode={() => touchField("windowMode")}
              />
            </div>
          }
          rail={
            <div className="stealth-profile-detail-runtime-rail">
              <ProfileDetailNoteRail
                value={draft.note}
                onChange={(value) => {
                  setDraft((prev) => ({ ...prev, note: value }));
                  touchField("note");
                }}
                placeholder="Optional note applied to all selected profiles"
              />
              <ProfileDetailLogRail profileNames={profileNames} focused={logRailFocused} />
            </div>
          }
        />
      </HubToolDetailModal>
      <HubCloneConfirmDialog
        open={cloneOpen}
        sourceLabel={`${selectedCount} selected profile${selectedCount === 1 ? "" : "s"}`}
        showKeepProfile={false}
        busy={cloneBusy}
        stacked
        onConfirm={({ count }) => void handleBulkCloneConfirm(count)}
        onClose={() => setCloneOpen(false)}
      />
      <HubConfirmDialog
        open={confirmOpen}
        stacked
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
      <HubConfirmDialog
        open={deleteConfirmOpen}
        stacked
        danger
        title={selectedCount === 1 ? "Delete 1 profile?" : `Delete ${selectedCount} profiles?`}
        message={
          <div className="space-y-2 text-left">
            <p className="text-[13px] text-[var(--muted)]">
              Permanently remove <strong className="text-[var(--text)]">{selectedCount}</strong> selected profile
              {selectedCount === 1 ? "" : "s"} and their browser data? This cannot be undone.
            </p>
            {sampleLabels.length ? (
              <p className="text-[13px] text-[var(--muted)]">
                Sample: {sampleLabels.join(", ")}
                {selectedCount > sampleLabels.length ? ` +${selectedCount - sampleLabels.length} more` : ""}
              </p>
            ) : null}
          </div>
        }
        confirmLabel={selectedCount === 1 ? "Delete" : `Delete (${selectedCount})`}
        busy={deleteBusy}
        onConfirm={() => void handleDeleteConfirm()}
        onClose={() => setDeleteConfirmOpen(false)}
      />
    </HubAccountDetailSearchProvider>
  );
}

/** Profile directory detail — create + edit (1 row) + bulk (2+ rows) in one modal SSOT. */
export function ProfileDetailModal(props: ProfileDetailModalProps) {
  if (props.mode === "create") {
    return <CreateProfileModal onClose={props.onClose} onProfilesChanged={props.onProfilesChanged} />;
  }
  if (props.mode === "bulk") {
    return <ProfileDetailBulkBody {...props} />;
  }
  return <ProfileDetailEditBody {...props} />;
}
