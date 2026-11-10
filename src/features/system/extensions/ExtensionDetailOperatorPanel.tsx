import { memo, useCallback, useEffect, useState } from "react";
import {
  fetchOperatorExtensionStatus,
  purgeBrokenExtensionPrefs,
  reloadOperatorExtension,
} from "../../../api";
import { useAppToast } from "../../../components/toast";
import type { OperatorExtensionStatus } from "../../../types";

/** Extension detail — E0002 Browser Operator status + hot re-stage/reload actions. */
export const ExtensionDetailOperatorPanel = memo(function ExtensionDetailOperatorPanel({
  jobLabel = null,
}: {
  jobLabel?: string | null;
}) {
  const { pushToast } = useAppToast();
  const [status, setStatus] = useState<OperatorExtensionStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setStatus(await fetchOperatorExtensionStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onReloadOperator = useCallback(async () => {
    setBusy(true);
    setActionMsg("");
    setError("");
    try {
      const updated = await reloadOperatorExtension();
      setStatus(updated);
      const filesCount = updated.validation?.files?.length ?? 0;
      const message = `Re-staged E0002 v${updated.stageVersion || updated.manifestVersion || "?"} (${filesCount} runtime files verified).`;
      setActionMsg(message);
      pushToast(message, "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushToast(message, "error");
    } finally {
      setBusy(false);
    }
  }, [pushToast]);

  const onRepair = useCallback(async () => {
    setBusy(true);
    setActionMsg("");
    setError("");
    try {
      const result = await purgeBrokenExtensionPrefs();
      const message = `Repaired — profiles ${result.profiles ?? 0}, removed ${result.removed ?? 0}, prefs ${result.prefsCleaned ?? 0}.`;
      setActionMsg(message);
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

  const contractOk = status?.validation?.ok !== false;
  const runtimeFilesCount = status?.validation?.files?.length ?? 0;

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 text-xs">
      <p className="hub-analytics-caption uppercase tracking-wider text-emerald-300">E0002 Browser Operator</p>
      <p className="mt-1 text-[var(--muted)]">
        In-profile MV3 operator (Muse approval, Facebook Group join, 2FA/Captcha solver via 9Router Vision AI). Staged outside versioned Chromium folders.
      </p>
      {jobLabel ? <p className="mt-2 font-medium text-emerald-200/95">{jobLabel}</p> : null}
      {actionMsg ? <p className="mt-2 text-emerald-200">{actionMsg}</p> : null}
      {error ? <p className="mt-2 text-rose-300">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="hub-btn hub-btn--ghost text-xs" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
        <button
          type="button"
          className="hub-btn hub-btn--primary text-xs"
          disabled={busy}
          onClick={() => void onReloadOperator()}
        >
          Re-stage &amp; Reload E0002
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
                {status.extensionToggles?.e0002 === false
                  ? "Off (Settings)"
                  : status.enabled
                    ? "Yes"
                    : "No"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--muted)]">Workspace / Stage</dt>
              <dd className="font-mono font-medium text-[var(--text)]">
                v{status.manifestVersion || "—"} / stage v{status.stageVersion || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--muted)]">CDP Contract &amp; Files</dt>
              <dd className={`font-medium ${contractOk ? "text-emerald-300" : "text-rose-300"}`}>
                {contractOk
                  ? `Verified (${runtimeFilesCount} runtime files)`
                  : `Drift (${(status.validation?.contractErrors?.length ?? 0) + (status.validation?.missing?.length ?? 0)} issue(s))`}
              </dd>
            </div>
            {status.unpackedId ? (
              <div>
                <dt className="text-[var(--muted)]">Unpacked ID</dt>
                <dd className="mt-0.5 break-all font-mono text-[10px] text-emerald-100/90">{status.unpackedId}</dd>
              </div>
            ) : null}
            {status.stagePath ? (
              <div>
                <dt className="text-[var(--muted)]">Stage Path</dt>
                <dd className="mt-0.5 break-all font-mono text-[10px] text-[var(--muted)]">{status.stagePath}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="text-[var(--muted)]">Status unavailable.</p>
        )}
      </div>
    </div>
  );
});
