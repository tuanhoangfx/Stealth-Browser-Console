import { useCallback, useEffect, useState } from "react";
import { Glass } from "../../theme/p0008";
import { clearLaunchPerfEntries, fetchLaunchPerfEntries, purgeAllIdentityExtensions } from "../../api";
import type { LaunchPerfEntry } from "../../types";

function formatMs(ms: number) {
  return `${Math.round(ms)} ms`;
}

function formatMarks(entry: LaunchPerfEntry) {
  if (!entry.marks.length) return "—";
  return entry.marks.map((m) => `${m.phase} ${formatMs(m.ms)}`).join(" · ");
}

/** System → profile launch timing ring buffer (main process). */
export function SystemLaunchPerfPanel() {
  const [entries, setEntries] = useState<LaunchPerfEntry[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [purgeMsg, setPurgeMsg] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const rows = await fetchLaunchPerfEntries(24);
      setEntries(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  const onClear = useCallback(async () => {
    setBusy(true);
    try {
      await clearLaunchPerfEntries();
      setEntries([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const onPurgeIdentity = useCallback(async () => {
    setBusy(true);
    setPurgeMsg("");
    setError("");
    try {
      const result = await purgeAllIdentityExtensions();
      setPurgeMsg(
        `Purged identity extensions — profiles ${result.profiles}, removed ${result.removed}, prefs cleaned ${result.prefsCleaned}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <Glass tone="emerald">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Launch performance</p>
          <h2 className="mt-1 text-sm font-semibold text-[var(--text)]">Profile browser spawn timeline</h2>
          <p className="mt-1 max-w-2xl text-xs text-[var(--muted)]">
            Marks from <code className="text-emerald-200/90">openProfile</code> (prep → spawn). E0001 Cookie Bridge loads from{" "}
            <a
              className="text-emerald-200/90 underline"
              href="https://chromewebstore.google.com/detail/e0001-cookie-bridge/kaaadageakdandpobcofplmfbjfjabdk"
              target="_blank"
              rel="noreferrer"
            >
              Chrome Web Store
            </a>{" "}
            by default (<code className="text-emerald-200/90">STEALTH_COOKIE_BRIDGE=0</code> to disable).
          </p>
          {purgeMsg ? <p className="mt-2 text-xs text-emerald-200">{purgeMsg}</p> : null}
          {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="hub-btn hub-btn--ghost text-xs" disabled={busy} onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" className="hub-btn hub-btn--ghost text-xs" disabled={busy} onClick={() => void onClear()}>
            Clear log
          </button>
          <button type="button" className="hub-btn hub-btn--primary text-xs" disabled={busy} onClick={() => void onPurgeIdentity()}>
            Purge identity extensions
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="hub-table w-full min-w-[36rem] text-xs">
          <thead>
            <tr>
              <th className="text-left">Profile</th>
              <th className="text-left">Total</th>
              <th className="text-left">Phases</th>
              <th className="text-left">At</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-[var(--muted)]">
                  {busy ? "Loading…" : "No launches recorded yet — open a profile to populate."}
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={`${entry.at}-${entry.profileId}`}>
                  <td>
                    <span className="font-medium text-[var(--text)]">{entry.profileName || entry.profileId.slice(0, 8)}</span>
                  </td>
                  <td>{formatMs(entry.totalMs)}</td>
                  <td className="max-w-xl truncate" title={formatMarks(entry)}>
                    {formatMarks(entry)}
                  </td>
                  <td className="text-[var(--muted)]">{new Date(entry.at).toLocaleTimeString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Glass>
  );
}
