import { memo, useCallback, useEffect, useState } from "react";
import { fetchCookieBridgeStatus, installStoreExtension, purgeBrokenExtensionPrefs } from "../../../api";
import { COOKIE_BRIDGE_STORE_ID } from "../../../lib/stealth-extension-store-ids";
import { useAppToast } from "../../../components/toast";
import type { CookieBridgeStatus } from "../../../types";

function sourceLabel(source: CookieBridgeStatus["source"]) {
  if (source === "workspace") return "Workspace (E0001)";
  if (source === "store-cache") return "Web Store cache";
  if (source === "custom") return "Custom path";
  return "Not resolved";
}

/** Extension detail — E0001 Cookie Bridge status + repair actions (not in right rail). */
export const ExtensionDetailCookieBridgePanel = memo(function ExtensionDetailCookieBridgePanel({
  jobLabel = null,
}: {
  jobLabel?: string | null;
}) {
  const { pushToast } = useAppToast();
  const [status, setStatus] = useState<CookieBridgeStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [repairMsg, setRepairMsg] = useState("");
  const [updateMsg, setUpdateMsg] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setStatus(await fetchCookieBridgeStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onRepair = useCallback(async () => {
    setBusy(true);
    setRepairMsg("");
    setError("");
    try {
      const result = await purgeBrokenExtensionPrefs();
      setRepairMsg(
        `Repaired — profiles ${result.profiles ?? 0}, removed ${result.removed ?? 0}, prefs ${result.prefsCleaned ?? 0}. Re-launch profiles.`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const onUpdateCookieBridge = useCallback(async () => {
    setBusy(true);
    setUpdateMsg("");
    setError("");
    try {
      const result = await installStoreExtension({
        storeId: COOKIE_BRIDGE_STORE_ID,
        force: true,
      });
      const message = `Cookie Bridge v${result.version || "?"} — pinned ${result.installed}/${result.profiles} profile(s). Re-launch profiles.`;
      setUpdateMsg(message);
      pushToast(message, "success");
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushToast(message, "error");
    } finally {
      setBusy(false);
    }
  }, [pushToast, refresh]);

  return (
    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-3 text-xs">
      <p className="hub-analytics-caption uppercase tracking-wider text-cyan-300">E0001 Cookie Bridge</p>
      <p className="mt-1 text-[var(--muted)]">
        Native prefs pin — not Chrome auto-update. Force update from the directory when CWS ships a new build.
      </p>
      {jobLabel ? <p className="mt-2 font-medium text-cyan-200/95">{jobLabel}</p> : null}
      {updateMsg ? <p className="mt-2 text-cyan-200">{updateMsg}</p> : null}
      {repairMsg ? <p className="mt-2 text-cyan-200">{repairMsg}</p> : null}
      {error ? <p className="mt-2 text-rose-300">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="hub-btn hub-btn--ghost text-xs" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
        <button
          type="button"
          className="hub-btn hub-btn--primary text-xs"
          disabled={busy}
          onClick={() => void onUpdateCookieBridge()}
        >
          Update Cookie Bridge
        </button>
        <button type="button" className="hub-btn hub-btn--ghost text-xs" disabled={busy} onClick={() => void onRepair()}>
          Repair prefs
        </button>
      </div>
      <div className="mt-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
        {busy && !status ? (
          <p className="text-[var(--muted)]">Loading…</p>
        ) : status ? (
          <dl className="grid gap-1.5">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--muted)]">Enabled</dt>
              <dd className="font-medium text-[var(--text)]">
                {status.extensionToggles?.e0001 === false
                  ? "Off (Settings)"
                  : status.enabled
                    ? "Yes"
                    : "No"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--muted)]">Source</dt>
              <dd className="font-medium text-[var(--text)]">{sourceLabel(status.source)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--muted)]">Manifest</dt>
              <dd className="truncate font-medium text-[var(--text)]" title={status.manifestName}>
                {status.manifestOk ? status.manifestName : "Missing"}
              </dd>
            </div>
            {status.manifestVersion ? (
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Version</dt>
                <dd className="font-medium text-[var(--text)]">{status.manifestVersion}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-[var(--muted)]">Store ID</dt>
              <dd className="mt-0.5 break-all font-mono text-[10px] text-cyan-100/90">{status.storeId}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-[var(--muted)]">Status unavailable.</p>
        )}
      </div>
    </div>
  );
});
