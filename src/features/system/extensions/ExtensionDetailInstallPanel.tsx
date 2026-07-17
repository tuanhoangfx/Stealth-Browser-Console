import { memo } from "react";

/** Install form — moved from directory filter row (Web Store / unpacked). */
export const ExtensionDetailInstallPanel = memo(function ExtensionDetailInstallPanel({
  storeInput,
  setStoreInput,
  profileScope,
  setProfileScope,
  profiles,
  profileId,
  setProfileId,
  busy,
  onInstallStore,
  onInstallUnpacked,
}: {
  storeInput: string;
  setStoreInput: (value: string) => void;
  profileScope: "all" | "one";
  setProfileScope: (value: "all" | "one") => void;
  profiles: Array<{ id: string; name: string }>;
  profileId: string;
  setProfileId: (value: string) => void;
  busy: boolean;
  onInstallStore: () => void;
  onInstallUnpacked: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted)]">
        CloakBrowser cannot use “Add to Chrome” on the Web Store. Install here, then close and re-launch profiles.
      </p>
      <div className="grid gap-2 lg:grid-cols-[7rem_minmax(0,1fr)_auto]">
        <label className="text-xs text-[var(--muted)]">
          Scope
          <select
            className="hub-input mt-1 w-full text-xs"
            value={profileScope}
            disabled={busy}
            onChange={(e) => setProfileScope(e.target.value as "all" | "one")}
          >
            <option value="all">All profiles</option>
            <option value="one">One profile</option>
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">
          Store ID / URL
          <input
            type="text"
            className="hub-input mt-1 w-full text-xs"
            placeholder="kaaad… or chromewebstore.google.com/detail/…"
            value={storeInput}
            disabled={busy}
            onChange={(e) => setStoreInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onInstallStore();
            }}
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            className="hub-btn hub-btn--primary text-xs"
            disabled={busy || !storeInput.trim()}
            onClick={onInstallStore}
          >
            Install from Web Store
          </button>
          <button type="button" className="hub-btn hub-btn--ghost text-xs" disabled={busy} onClick={onInstallUnpacked}>
            Load unpacked
          </button>
        </div>
      </div>
      {profileScope === "one" ? (
        <label className="block text-xs text-[var(--muted)]">
          Profile
          <select
            className="hub-input mt-1 w-full text-xs"
            value={profileId}
            disabled={busy}
            onChange={(e) => setProfileId(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id.slice(0, 8)})
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
});
