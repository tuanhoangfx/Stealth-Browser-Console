import { useCallback, useEffect, useState } from "react";
import { Glass } from "../../theme/p0008";
import { clearLaunchPerfEntries, fetchLaunchBenchBaseline, fetchLaunchPerfEntries, purgeLegacyIdentityToolbar } from "../../api";
import type { LaunchBenchBaseline, LaunchPerfEntry } from "../../types";

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
  const [baseline, setBaseline] = useState<LaunchBenchBaseline | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [purgeMsg, setPurgeMsg] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [rows, bench] = await Promise.all([fetchLaunchPerfEntries(24), fetchLaunchBenchBaseline()]);
      setEntries(rows);
      setBaseline(bench);
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

  const onPurgeLegacy = useCallback(async () => {
    setBusy(true);
    setPurgeMsg("");
    setError("");
    try {
      const result = await purgeLegacyIdentityToolbar();
      setPurgeMsg(
        `Purged legacy identity-toolbar — profiles ${result.profiles}, removed ${result.removed}, prefs cleaned ${result.prefsCleaned}.`,
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
            Marks from <code className="text-emerald-200/90">openProfile</code> (prep → spawn). CLI benchmark:{" "}
            <code className="text-emerald-200/90">node scripts/benchmark-profile-launch.mjs 3</code>.
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
          <button type="button" className="hub-btn hub-btn--primary text-xs" disabled={busy} onClick={() => void onPurgeLegacy()}>
            Purge legacy identity-toolbar
          </button>
        </div>
      </div>

      {baseline ? (
        <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs">
          <p className="font-semibold text-emerald-200">CLI baseline (`.dev/launch-bench.json`)</p>
          <p className="mt-1 text-[var(--muted)]">
            {baseline.rounds} rounds · recorded {new Date(baseline.at).toLocaleString()} · side panel{" "}
            {baseline.sidePanel ? "ON" : "OFF"}
          </p>
          <p className="mt-1 font-mono text-emerald-100/90">
            min {formatMs(baseline.stats.minMs)} · avg {formatMs(baseline.stats.avgMs)} · max{" "}
            {formatMs(baseline.stats.maxMs)}
          </p>
          {baseline.latestPhases.length ? (
            <p className="mt-1 truncate text-[var(--muted)]" title={baseline.latestPhases.map((m) => `${m.phase} ${formatMs(m.ms)}`).join(" · ")}>
              latest: {baseline.latestPhases.map((m) => `${m.phase} ${formatMs(m.ms)}`).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

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
