export type BackupRowState = {
  status: "idle" | "queued" | "copying" | "done" | "skipped" | "error";
  message?: string;
  progressPct?: number;
};

export function formatBackupBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function backupStatusLabel(state: BackupRowState | undefined) {
  const status = state?.status ?? "idle";
  if (status === "idle") return "Ready";
  if (status === "queued") return "Queued";
  if (status === "copying") return "Copying";
  if (status === "done") return "Backed up";
  if (status === "skipped") return state?.message || "Skipped";
  if (status === "error") return state?.message || "Error";
  return status;
}

export function backupStatusTone(
  state: BackupRowState | undefined,
): "online" | "offline" | "idle" | "active" {
  const status = state?.status ?? "idle";
  if (status === "done") return "online";
  if (status === "copying" || status === "queued") return "active";
  if (status === "error" || status === "skipped") return "offline";
  return "idle";
}

export function resolveBackupProgressPct(state: BackupRowState | undefined) {
  if (!state) return 0;
  if (typeof state.progressPct === "number") return Math.max(0, Math.min(100, state.progressPct));
  if (state.status === "done") return 100;
  if (state.status === "copying") return 55;
  if (state.status === "queued") return 8;
  return 0;
}

export type BackupSkipReason = { name: string; reason: string };

export function formatBackupSuccessMessage(payload: {
  profiles?: number;
  bytes?: number;
  selected?: boolean;
  path?: string;
}) {
  const count = payload.profiles ?? 0;
  const size = formatBackupBytes(payload.bytes ?? 0);
  const file = backupFileBasename(payload.path);
  const fileSuffix = file ? ` → ${file}` : "";
  return payload.selected
    ? `Backup saved — ${count} profile(s), ${size}${fileSuffix}`
    : `Full backup — ${count} profile(s), ${size}${fileSuffix}`;
}

export function backupFileBasename(filePath?: string) {
  if (!filePath?.trim()) return "";
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1]?.trim() || "";
}

export function formatRestoreResultMessage(payload: {
  restored?: number;
  skipped?: number;
  profiles?: number;
  skipReasons?: BackupSkipReason[];
  restoreIntoProfileName?: string;
  imported?: { updated?: number; created?: number; skipped?: number };
}) {
  const inZip = payload.profiles ?? 0;
  const restored = payload.restored ?? 0;
  const skipped = payload.skipped ?? 0;
  const updated = payload.imported?.updated ?? 0;
  const created = payload.imported?.created ?? 0;
  let message = payload.restoreIntoProfileName
    ? `Restore into ${payload.restoreIntoProfileName} — ${restored}/${inZip} session folder(s) applied`
    : `Restore complete — ${restored}/${inZip} profile folder(s) restored`;
  if (skipped > 0) message += `, ${skipped} skipped`;
  if (!payload.restoreIntoProfileName) {
    message += `. Catalog: ${updated} updated, ${created} new.`;
  }
  const reasons = payload.skipReasons ?? [];
  if (reasons.length > 0) {
    const sample = reasons
      .slice(0, 3)
      .map((row) => `${row.name} (${row.reason})`)
      .join("; ");
    message += ` Skipped: ${sample}${reasons.length > 3 ? "…" : ""}`;
  }
  return message;
}
