import { useCallback, useEffect, useState } from "react";
import {
  fetchExtensionsStatus,
  installStoreExtension,
  installUnpackedExtension,
  listProfiles,
  pickUnpackedExtensionFolder,
} from "../../api";
import { Glass } from "../../theme/p0008";
import type { ExtensionsStatus, StealthProfile } from "../../types";

/** System → install any Chrome Web Store or unpacked extension. */
export function SystemWebStoreExtensionsPanel() {
  const [status, setStatus] = useState<ExtensionsStatus | null>(null);
  const [profiles, setProfiles] = useState<StealthProfile[]>([]);
  const [input, setInput] = useState("");
  const [profileScope, setProfileScope] = useState<"all" | "one">("all");
  const [profileId, setProfileId] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const profileIds = profileScope === "one" && profileId.trim() ? [profileId.trim()] : undefined;

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [next, catalog] = await Promise.all([fetchExtensionsStatus(), listProfiles()]);
      setStatus(next);
      setProfiles(catalog);
      if (!profileId && catalog[0]?.id) setProfileId(catalog[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [profileId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const afterInstallMessage = useCallback((label: string, installed: number, total: number) => {
    setMessage(
      `${label} — pinned on ${installed}/${total} profile(s). Close and re-launch the profile to activate.`,
    );
  }, []);

  const onInstallStore = useCallback(async () => {
    const storeIdOrUrl = input.trim();
    if (!storeIdOrUrl) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await installStoreExtension({ url: storeIdOrUrl, profileIds });
      afterInstallMessage(`Installed ${result.name} (${result.storeId})`, result.installed, result.profiles);
      setInput("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [afterInstallMessage, input, profileIds, refresh]);

  const onInstallUnpacked = useCallback(async () => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const folder = await pickUnpackedExtensionFolder();
      if (!folder) {
        setBusy(false);
        return;
      }
      const result = await installUnpackedExtension({ path: folder, profileIds });
      afterInstallMessage(`Loaded unpacked ${result.name}`, result.installed, result.profiles);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [afterInstallMessage, profileIds, refresh]);

  return (
    <Glass tone="cyan">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Extensions</p>
          <h2 className="mt-1 text-sm font-semibold text-[var(--text)]">Install extensions</h2>
          <div className="mt-2 max-w-2xl space-y-2 text-xs text-[var(--muted)]">
            <p>
              <strong className="font-medium text-cyan-100/90">Giống Chrome:</strong>{" "}
              <code className="text-cyan-200/90">chrome://extensions</code>, bật/tắt, ghim toolbar, cài bất kỳ
              extension Web Store (ID/URL) hoặc thư mục unpacked.
            </p>
            <p>
              <strong className="font-medium text-amber-200/90">Khác Chrome:</strong> nút{" "}
              <em>Thêm vào Chrome</em> trên Web Store bị Google chặn (CloakBrowser ≠ Chrome). Cài qua panel này thay
              thế — sau đó đóng và mở lại profile.
            </p>
          </div>
          {message ? <p className="mt-2 text-xs text-cyan-200">{message}</p> : null}
          {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
        </div>
        <button type="button" className="hub-btn hub-btn--ghost text-xs" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="text-xs text-[var(--muted)]">
          Profile scope
          <select
            className="hub-input mt-1 w-full text-xs"
            value={profileScope}
            disabled={busy}
            onChange={(e) => setProfileScope(e.target.value as "all" | "one")}
          >
            <option value="all">All profiles</option>
            <option value="one">Selected profile only</option>
          </select>
        </label>
        {profileScope === "one" ? (
          <label className="text-xs text-[var(--muted)] sm:col-span-2">
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

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          className="hub-input min-w-0 flex-1 text-xs"
          placeholder="Any Store ID or chromewebstore.google.com/detail/… URL"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onInstallStore();
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="hub-btn hub-btn--primary text-xs"
            disabled={busy || !input.trim()}
            onClick={() => void onInstallStore()}
          >
            Install from Web Store
          </button>
          <button type="button" className="hub-btn hub-btn--ghost text-xs" disabled={busy} onClick={() => void onInstallUnpacked()}>
            Load unpacked folder
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5 text-xs">
        <p className="font-medium text-[var(--text)]">Installed extensions (cache)</p>
        {busy && !status ? (
          <p className="mt-2 text-[var(--muted)]">Loading…</p>
        ) : status?.cached.length ? (
          <ul className="mt-2 space-y-1.5">
            {status.cached.map((ext) => (
              <li key={ext.storeId ?? ext.localKey ?? ext.unpackedPath} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
                  {ext.kind}
                </span>
                <span className="font-medium text-[var(--text)]">{ext.name}</span>
                {ext.storeId ? (
                  <span className="font-mono text-[11px] text-cyan-100/80">{ext.storeId}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[var(--muted)]">No extensions cached yet.</p>
        )}
      </div>
    </Glass>
  );
}
