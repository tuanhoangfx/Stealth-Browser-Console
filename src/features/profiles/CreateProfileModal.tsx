import { useMemo, useState } from "react";
import { FolderTree, UserPlus } from "lucide-react";
import {
  HubAlert,
  HubTocSectionNav,
  HubToolDetailModalPrimaryAction,
  HubToolDetailModalSecondaryAction,
  HUB_TOOL_DETAIL_SCROLL_ROOT
} from "@tool-workspace/hub-ui";
import { StealthHubFormModal } from "../../components/StealthHubFormModal";
import { deviceConfigFromDefaults, defaultStartupUrlFromPrefs } from "../../lib/stealth-app-prefs";
import { normalizeStartupUrl, resolveStartupUrlSave, startupUrlSaveError } from "../../lib/startup-url";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import { randomFingerprintSeed } from "../../lib/stealth-profile-utils";
import type { DeviceConfig } from "../../types";
import { ProfileFormFields } from "./ProfileFormFields";
import { profileFormTocItems } from "./profile-form-toc";

export function CreateProfileModal({ onClose }: { onClose: () => void }) {
  const { createProfile, groups } = useProfilesRuntime();
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("default");
  const [proxy, setProxy] = useState("");
  const [note, setNote] = useState("");
  const [fingerprintSeed, setFingerprintSeed] = useState(() => randomFingerprintSeed());
  const [device, setDevice] = useState<DeviceConfig>(() => deviceConfigFromDefaults());
  const [startupUrl, setStartupUrl] = useState(() => defaultStartupUrlFromPrefs());
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
    void createProfile({
      name: name.trim(),
      groupId,
      proxy: proxy.trim(),
      note: note.trim(),
      fingerprintSeed,
      startupUrl: resolveStartupUrlSave(startupUrl, ""),
      ...device
    })
      .then(onClose)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Create failed"))
      .finally(() => setBusy(false));
  };

  return (
    <StealthHubFormModal
      title="New profile"
      headerIcon={UserPlus}
      onClose={onClose}
      toc={
        <div className="hub-toc-nav">
          <HubTocSectionNav items={tocItems} scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT} />
        </div>
      }
      sectionIds={sectionIds}
      footer={
        <>
          <HubToolDetailModalSecondaryAction label="Cancel" onClick={onClose} disabled={busy} />
          <HubToolDetailModalPrimaryAction label="Create profile" onClick={save} disabled={busy || !name.trim()} busy={busy} />
        </>
      }
    >
      {error ? <HubAlert tone="danger">{error}</HubAlert> : null}
      <ProfileFormFields
        layout="hub-sections"
        name={name}
        setName={setName}
        groupId={groupId}
        setGroupId={setGroupId}
        proxy={proxy}
        setProxy={setProxy}
        note={note}
        setNote={setNote}
        fingerprintSeed={fingerprintSeed}
        setFingerprintSeed={setFingerprintSeed}
        device={device}
        onDeviceChange={(patch) => setDevice((d) => ({ ...d, ...patch }))}
        startupUrl={startupUrl}
        setStartupUrl={setStartupUrl}
        groups={groups}
      />
    </StealthHubFormModal>
  );
}
