import { useCallback, useEffect, useState } from "react";
import { Glass } from "../../theme/p0008";
import { fetchCookieBridgeStatus, purgeBrokenExtensionPrefs } from "../../api";
import type { CookieBridgeStatus } from "../../types";

function sourceLabel(source: CookieBridgeStatus["source"]) {
  if (source === "workspace") return "Workspace (Extension/E0001-cookie-bridge)";
  if (source === "store-cache") return "Chrome Web Store cache";
  if (source === "custom") return "Custom path";
  return "Not resolved — run a profile to warm cache";
}

/** System → E0001 Cookie Bridge extension status + repair. */
export function SystemCookieBridgePanel() {
  const [status, setStatus] = useState<CookieBridgeStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [repairMsg, setRepairMsg] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const next = await fetchCookieBridgeStatus();
      setStatus(next);
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
        `Repaired extension prefs — profiles ${result.profiles ?? 0}, removed ${result.removed ?? 0} stale pin(s), prefs cleaned ${result.prefsCleaned ?? 0}. Re-run a profile to load E0001.`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return (
    <Glass tone="cyan">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Extensions</p>
          <h2 className="mt-1 text-sm font-semibold text-[var(--text)]">E0001 Cookie Bridge</h2>
          <p className="mt-1 max-w-2xl text-xs text-[var(--muted)]">
            Loaded on profile launch via <code className="text-cyan-200/90">--load-extension</code>. Disable with{" "}
            <code className="text-cyan-200/90">STEALTH_COOKIE_BRIDGE=0</code>.
          </p>
          {repairMsg ? <p className="mt-2 text-xs text-cyan-200">{repairMsg}</p> : null}
          {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="hub-btn hub-btn--ghost text-xs" disabled={busy} onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" className="hub-btn hub-btn--primary text-xs" disabled={busy} onClick={() => void onRepair()}>
            Repair extension prefs
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5 text-xs">
        {busy && !status ? (
          <p className="text-[var(--muted)]">Loading extension status…</p>
        ) : status ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-[var(--muted)]">Enabled</dt>
              <dd className="font-medium text-[var(--text)]">{status.enabled ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Manifest</dt>
              <dd className="font-medium text-[var(--text)]">
                {status.manifestOk ? status.manifestName : "Missing or unreadable"}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Source</dt>
              <dd className="font-medium text-[var(--text)]">{sourceLabel(status.source)}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Unpacked ID</dt>
              <dd className="truncate font-mono text-cyan-100/90" title={status.unpackedId || ""}>
                {status.unpackedId || "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[var(--muted)]">Load path</dt>
              <dd className="break-all font-mono text-[11px] text-cyan-100/90">{status.resolvedPath || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[var(--muted)]">Chrome Web Store ID</dt>
              <dd className="font-mono text-cyan-100/90">{status.storeId}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-[var(--muted)]">Extension status unavailable.</p>
        )}
      </div>
    </Glass>
  );
}
