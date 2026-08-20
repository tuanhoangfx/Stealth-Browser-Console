import { memo, useMemo } from "react";
import { HubAdmClickEditField, HubAdmClickFilterField } from "@tool-workspace/hub-ui";

const EXTENSION_NEW_FORM_ROW = "hub-adm-form-row hub-adm-form-row--aligned twofa-adm-form-row--aligned";
const EXTENSION_NEW_CONTROL_CLASS = "field auth-gate-field stealth-adm-control";

const SCOPE_OPTIONS = [
  { value: "all", label: "All profiles", emoji: "📡" },
  { value: "one", label: "One profile", emoji: "🧍" },
];

/** New-extension form — Chrome Web Store ID / URL (ADM field SSOT). */
export const ExtensionDetailInstallPanel = memo(function ExtensionDetailInstallPanel({
  storeInput,
  setStoreInput,
  profileScope,
  setProfileScope,
  profiles,
  profileId,
  setProfileId,
  busy,
}: {
  storeInput: string;
  setStoreInput: (value: string) => void;
  profileScope: "all" | "one";
  setProfileScope: (value: "all" | "one") => void;
  profiles: Array<{ id: string; name: string }>;
  profileId: string;
  setProfileId: (value: string) => void;
  busy: boolean;
}) {
  const profileOptions = useMemo(
    () =>
      profiles.map((profile) => ({
        value: profile.id,
        label: profile.name,
        detail: profile.id.slice(0, 8),
        emoji: "📡",
      })),
    [profiles],
  );

  return (
    <div className="space-y-3">
      <p className="text-[var(--muted)]">
        CloakBrowser cannot use “Add to Chrome” on the Web Store. Install here, then close and re-launch
        profiles.
      </p>
      <div className={EXTENSION_NEW_FORM_ROW}>
        <HubAdmClickFilterField
          header={{ label: "Scope", headerEmoji: "📡" }}
          filterKey="extension-scope"
          fieldLabel="Scope"
          options={SCOPE_OPTIONS}
          value={profileScope}
          onChange={(value) => setProfileScope(value === "one" ? "one" : "all")}
          disabled={busy}
          allowClear={false}
        />
        <HubAdmClickEditField
          header={{ label: "Store ID / URL", headerEmoji: "🛒" }}
          fieldLabel="Store ID / URL"
          value={storeInput}
          onChange={setStoreInput}
          placeholder="kaaad… or chromewebstore.google.com/detail/…"
          disabled={busy}
          controlClassName={EXTENSION_NEW_CONTROL_CLASS}
        />
      </div>
      {profileScope === "one" ? (
        <div className={EXTENSION_NEW_FORM_ROW}>
          <HubAdmClickFilterField
            header={{ label: "Profile", headerEmoji: "📡" }}
            filterKey="extension-profile"
            fieldLabel="Profile"
            options={profileOptions}
            value={profileId}
            onChange={setProfileId}
            disabled={busy}
            allowClear={false}
          />
        </div>
      ) : null}
    </div>
  );
});
