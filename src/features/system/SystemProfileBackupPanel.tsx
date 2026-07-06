import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { Glass } from "../../theme/p0008";
import { backupProfilesState, restoreProfilesState } from "../../api";
import { useStealthShell } from "../../context/stealth-shell-context";

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function phaseLabel(phase: string) {
  if (phase === "copy") return "Copying profile folders…";
  if (phase === "zip") return "Creating zip archive…";
  if (phase === "extract") return "Extracting backup…";
  if (phase === "catalog") return "Importing catalog metadata…";
  if (phase === "profiles") return "Restoring Chrome session folders…";
  if (phase === "done") return "Complete";
  return "Working…";
}

/** System → full profile state backup/restore (catalog + Chrome userData by name). */
export function SystemProfileBackupPanel() {
  const { refreshProfiles } = useStealthShell();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");

  useEffect(() => {
    const api = window.stealthApi;
    if (!api?.onProfilesBackupProgress) return undefined;
    return api.onProfilesBackupProgress(({ phase, current, total }) => {
      if (phase === "done") {
        setProgress("");
        return;
      }
      const suffix = total > 0 ? ` (${current}/${total})` : "";
      setProgress(`${phaseLabel(phase)}${suffix}`);
    });
  }, []);

  const onBackup = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("");
    setProgress("");
    try {
      const result = await backupProfilesState();
      if (result.canceled) return;
      if (!result.ok) throw new Error(result.error || "Backup failed");
      setMessage(
        `Backup saved — ${result.profiles ?? 0} profile(s), ${formatBytes(result.bytes ?? 0)} → ${result.path ?? ""}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }, []);

  const onRestore = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("");
    setProgress("");
    try {
      const result = await restoreProfilesState();
      if (result.canceled) return;
      if (!result.ok) throw new Error(result.error || "Restore failed");
      const catalog = result.imported;
      setMessage(
        `Restore complete — catalog ${catalog?.updated ?? 0} updated, ${catalog?.created ?? 0} new; ` +
          `${result.restored ?? 0} session folder(s) copied (${result.skipped ?? 0} skipped).`,
      );
      await refreshProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }, [refreshProfiles]);

  return (
    <Glass tone="amber">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="hub-analytics-caption uppercase tracking-wider text-amber-300">Profiles</p>
          <h2 className="mt-1 text-sm font-semibold text-[var(--text)]">Backup / restore full state</h2>
          <p className="mt-1 max-w-2xl text-xs text-[var(--muted)]">
            Zip includes catalog JSON (match by <strong className="text-amber-200/90">name</strong>) plus Chrome folders under{" "}
            <code className="text-amber-200/90">profiles/</code>. Close running profiles before backup. Restore closes all browsers first.
          </p>
          {progress ? <p className="mt-2 text-xs text-amber-200">{progress}</p> : null}
          {message ? <p className="mt-2 text-xs text-amber-100">{message}</p> : null}
          {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="hub-btn hub-btn--ghost text-xs" disabled={busy} onClick={() => void onBackup()}>
            <Archive size={14} className="mr-1 inline" aria-hidden />
            Backup all
          </button>
          <button type="button" className="hub-btn hub-btn--primary text-xs" disabled={busy} onClick={() => void onRestore()}>
            <ArchiveRestore size={14} className="mr-1 inline" aria-hidden />
            Restore from zip
          </button>
        </div>
      </div>
    </Glass>
  );
}
